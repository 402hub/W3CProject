/**
 * ChatArea Component
 * Displays messages and handles sending
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { messageService } from '../services/database';

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
      
      alert(`Failed to send message: ${error.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e);
    }
  };

  if (!currentConversation) {
    return (
      <div className="chat-area">
        <div className="empty-chat">
          <h3>No conversation selected</h3>
          <p>Select a conversation or start a new one</p>
        </div>
      </div>
    );
  }

  const peerAddress = currentConversation.peerAddress;
  const shortAddress = `${peerAddress.slice(0, 6)}...${peerAddress.slice(-4)}`;

  return (
    <div className="chat-area">
      <div className="chat-header">
        <div className="chat-header-info">
          <h3>{shortAddress}</h3>
          <p className="chat-header-address">{peerAddress}</p>
        </div>
      </div>

      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-messages">
            <p>No messages yet</p>
            <p className="hint">Send a message to start the conversation</p>
          </div>
        ) : (
          messages.map((message) => {
            const isOwnMessage = message.senderAddress?.toLowerCase() === walletAddress?.toLowerCase();
            
            return (
              <div
                key={message.id}
                className={`message ${isOwnMessage ? 'message-own' : 'message-other'}`}
              >
                <div className="message-content">
                  {message.content}
                  
                  {message.status === 'sending' && (
                    <span className="message-status sending">Sending...</span>
                  )}
                  {message.status === 'failed' && (
                    <span className="message-status failed">Failed</span>
                  )}
                </div>
                <div className="message-time">
                  {new Date(message.timestamp).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="message-input-container">
        <form onSubmit={sendMessage} className="message-input-form">
          <textarea
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            disabled={isSending}
            rows="1"
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
