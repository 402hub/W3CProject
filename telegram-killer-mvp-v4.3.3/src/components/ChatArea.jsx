/**
 * ChatArea Component
 * Displays messages with status indicators and timestamps
 * v4.1: Added message status (sending/sent/failed) and time display
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { messageService } from '../services/database';
import { formatMessageTime } from '../utils';
import { sanitizeInput, validateMessage } from '../utils/validation';
import { rateLimiter } from '../utils/rateLimiter';

function ChatArea() {
  const {
    currentConversation,
    messages,
    walletAddress,
    addMessage,
    setMessages,
    addMessageOptimistic,
    confirmMessage,
    failMessage,
  } = useAppStore();

  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [rateLimitError, setRateLimitError] = useState(null);
  const messagesEndRef = useRef(null);
  const messagesTopRef = useRef(null);

  // Debug: Log messages state changes
  useEffect(() => {
    console.log('🔄 [ChatArea] Messages state updated:', messages.length, messages);
  }, [messages]);

  // Load messages when conversation changes
  useEffect(() => {
    if (currentConversation) {
      loadMessages();
      
      // Listen for new messages in this conversation
      const unsubscribe = messageService.onMessage((newMessage) => {
        // If message is for current conversation, reload
        if (newMessage.conversationId === currentConversation.id) {
          console.log('📬 [UI] New message in current conversation, reloading...');
          loadMessages();
        }
      });
      
      return () => {
        unsubscribe();
      };
    }
  }, [currentConversation]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadMessages = async (beforeTimestamp = null) => {
    if (!currentConversation) return;

    try {
      console.log('🔍 [ChatArea] Loading messages for:', currentConversation.peerAddress);
      const result = await messageService.loadMessages(
        currentConversation.peerAddress,
        70, // Load 70 messages at a time
        beforeTimestamp
      );
      console.log('📦 [ChatArea] Loaded messages:', result.messages.length, 'hasMore:', result.hasMore);
      
      if (beforeTimestamp) {
        // Loading older messages - prepend to existing
        setMessages([...result.messages, ...messages]);
      } else {
        // Initial load - replace all messages
        setMessages(result.messages);
      }
      
      setHasMoreMessages(result.hasMore);
      console.log('✅ [ChatArea] Messages set in store');
    } catch (error) {
      console.error('❌ [ChatArea] Failed to load messages:', error);
    }
  };

  const loadMoreMessages = async () => {
    if (!currentConversation || isLoadingMore || !hasMoreMessages) return;
    
    setIsLoadingMore(true);
    try {
      // Get the oldest message timestamp
      const oldestMessage = messages[0];
      if (oldestMessage) {
        await loadMessages(oldestMessage.timestamp);
      }
    } catch (error) {
      console.error('❌ [ChatArea] Failed to load more messages:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    
    const rawContent = messageInput.trim();
    if (!rawContent || !currentConversation) return;

    // v4.4.0: Validate message
    const validation = validateMessage(rawContent);
    if (!validation.valid) {
      alert(validation.error);
      return;
    }

    // v4.4.0: Rate limiting check
    const rateLimit = rateLimiter.canSend(walletAddress);
    if (!rateLimit.allowed) {
      const resetTime = new Date(rateLimit.resetAt).toLocaleTimeString();
      setRateLimitError(`Rate limit exceeded. Try again after ${resetTime}`);
      setTimeout(() => setRateLimitError(null), 5000);
      return;
    }
    setRateLimitError(null);

    // v4.4.0: Sanitize input (XSS prevention)
    const content = sanitizeInput(rawContent);
    
    // Generate temp ID for optimistic update
    const tempId = `temp-${Date.now()}`;
    
    // Optimistic update - show message immediately
    addMessageOptimistic(content, tempId);
    
    // Clear input
    setMessageInput('');
    setIsSending(true);

    try {
      // Send message (saves to database)
      const messageId = await messageService.sendMessage(currentConversation.peerAddress, content);
      
      // Confirm message sent with real ID
      confirmMessage(tempId, messageId);
      
      // Reload messages to get the actual saved message
      await loadMessages();
    } catch (error) {
      console.error('Failed to send message:', error);
      // Mark message as failed
      failMessage(tempId);
      alert('Failed to send message. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const getMessageStatusIcon = (message) => {
    if (message.status === 'sending') {
      return '⏳';
    } else if (message.status === 'failed') {
      return '❌';
    } else if (message.status === 'sent') {
      return '✓';
    }
    return '✓';
  };

  if (!currentConversation) {
    return (
      <div className="chat-area">
        <div className="empty-chat">
          <h2>⚡ Select a conversation</h2>
          <p>Choose from your conversations or start a new one</p>
          <p className="hint">Messages are encrypted and stored locally for instant delivery</p>
        </div>
      </div>
    );
  }

  const shortAddress = `${currentConversation.peerAddress.slice(0, 6)}...${currentConversation.peerAddress.slice(-4)}`;

  return (
    <div className="chat-area">
      <div className="chat-header">
        <div className="chat-header-info">
          <h3>{shortAddress}</h3>
          <p className="chat-header-address">{currentConversation.peerAddress}</p>
        </div>
      </div>

      <div className="messages-container">
        {hasMoreMessages && (
          <div className="load-more-container" ref={messagesTopRef}>
            <button 
              onClick={loadMoreMessages} 
              disabled={isLoadingMore}
              className="load-more-button"
            >
              {isLoadingMore ? 'Loading...' : 'Load More Messages'}
            </button>
          </div>
        )}
        {messages.length === 0 ? (
          <div className="empty-messages">
            <p>No messages yet</p>
            <p className="hint">Send the first message to start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => {
            const isMine = message.senderAddress?.toLowerCase() === walletAddress?.toLowerCase();
            
            return (
              <div
                key={message.id}
                className={`message ${isMine ? 'message-sent' : 'message-received'}`}
              >
                <div className="message-content">{message.content}</div>
                <div className="message-meta">
                  <span className="message-time">{formatMessageTime(message.timestamp)}</span>
                  {isMine && (
                    <span className="message-status">{getMessageStatusIcon(message)}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="message-input-container">
        {rateLimitError && (
          <div className="rate-limit-error">{rateLimitError}</div>
        )}
        <form onSubmit={sendMessage}>
          <input
            type="text"
            value={messageInput}
            onChange={(e) => {
              setMessageInput(e.target.value);
              // Clear rate limit error when user types
              if (rateLimitError) setRateLimitError(null);
            }}
            placeholder={`Type a message... (${messageInput.length}/1000)`}
            disabled={isSending}
            className="message-input"
            maxLength={1000}
          />
          <button
            type="submit"
            disabled={isSending || !messageInput.trim()}
            className="send-button"
          >
            {isSending ? '...' : '➤'}
          </button>
        </form>
        {messageInput.length > 900 && (
          <div className="char-count-warning">
            {1000 - messageInput.length} characters remaining
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatArea;
