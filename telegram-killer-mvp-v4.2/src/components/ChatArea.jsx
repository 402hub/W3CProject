/**
 * ChatArea Component
 * Displays messages with status indicators and timestamps
 * v4.1: Added message status (sending/sent/failed) and time display
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { messageService } from '../services/database';
import { formatMessageTime } from '../utils';

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
  const messagesEndRef = useRef(null);

  // Load messages when conversation changes
  useEffect(() => {
    if (currentConversation) {
      loadMessages();
    }
  }, [currentConversation]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadMessages = async () => {
    if (!currentConversation) return;

    try {
      const loadedMessages = await messageService.loadMessages(currentConversation.peerAddress);
      setMessages(loadedMessages);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    
    const content = messageInput.trim();
    if (!content || !currentConversation) return;

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
        <form onSubmit={sendMessage}>
          <input
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder="Type a message..."
            disabled={isSending}
            className="message-input"
          />
          <button
            type="submit"
            disabled={isSending || !messageInput.trim()}
            className="send-button"
          >
            {isSending ? '...' : '➤'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ChatArea;
