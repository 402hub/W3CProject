/**
 * ChatArea Component
 * Adds message pagination, validation, and real-time updates
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { messageService } from '../services/database';
import { formatMessageTime, MESSAGE_CHAR_LIMIT, isMessageValid } from '../utils';

function ChatArea() {
  const {
    currentConversation,
    messages,
    walletAddress,
    hasMoreMessages,
    nextMessageCursor,
    isLoadingMessages,
    setMessagesPage,
    setMessagesLoading,
    addMessageOptimistic,
    confirmMessage,
    failMessage,
  } = useAppStore();

  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState(null);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const pendingLoadMoreRef = useRef(false);
  const previousScrollHeightRef = useRef(0);
  const shouldAutoScrollRef = useRef(true);

  const loadMessages = useCallback(
    async ({ cursor } = {}) => {
      if (!currentConversation) return;
      if (isLoadingMessages && !cursor) return;

      try {
        setMessagesLoading(true);
        const page = await messageService.loadMessages(currentConversation.peerAddress, { cursor });
        setMessagesPage(page);
      } catch (error) {
        console.error('❌ [ChatArea] Failed to load messages:', error);
      } finally {
        setMessagesLoading(false);
      }
    },
    [currentConversation, isLoadingMessages, setMessagesLoading, setMessagesPage],
  );

  useEffect(() => {
    if (!currentConversation) {
      return undefined;
    }

    shouldAutoScrollRef.current = true;
    loadMessages({ cursor: null });

    const unsubscribe = messageService.onMessage((newMessage) => {
      if (newMessage.conversationId === currentConversation.id) {
        console.log('📬 [UI] New message in current conversation, reloading...');
        loadMessages({ cursor: null });
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [currentConversation, loadMessages]);

  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (pendingLoadMoreRef.current) {
      const diff = container.scrollHeight - previousScrollHeightRef.current;
      container.scrollTop = diff;
      pendingLoadMoreRef.current = false;
    } else if (shouldAutoScrollRef.current) {
      scrollToBottom(messages.length > 0 ? 'smooth' : 'auto');
    }
  }, [messages]);

  const handleLoadMore = useCallback(async () => {
    if (!hasMoreMessages || isLoadingMessages || !currentConversation) {
      return;
    }

    const container = messagesContainerRef.current;
    if (container) {
      pendingLoadMoreRef.current = true;
      previousScrollHeightRef.current = container.scrollHeight;
    }

    await loadMessages({ cursor: nextMessageCursor });
  }, [hasMoreMessages, isLoadingMessages, currentConversation, loadMessages, nextMessageCursor]);

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const nearBottom =
      container.scrollHeight - (container.scrollTop + container.clientHeight) < 80;
    shouldAutoScrollRef.current = nearBottom;

    if (container.scrollTop <= 0 && hasMoreMessages && !isLoadingMessages) {
      handleLoadMore();
    }
  }, [hasMoreMessages, isLoadingMessages, handleLoadMore]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  const sendMessage = async (e) => {
    e.preventDefault();
    setSendError(null);

    if (!currentConversation) return;

    const content = messageInput.substring(0, MESSAGE_CHAR_LIMIT).trim();
    if (!isMessageValid(content)) {
      setSendError('Message must be between 1 and 1000 characters.');
      return;
    }

    const tempId = `temp-${Date.now()}`;
    addMessageOptimistic(content, tempId);

    setMessageInput('');
    setIsSending(true);

    try {
      const messageId = await messageService.sendMessage(currentConversation.peerAddress, content);
      confirmMessage(tempId, messageId);
      shouldAutoScrollRef.current = true;
      await loadMessages({ cursor: null });
    } catch (error) {
      console.error('Failed to send message:', error);
      failMessage(tempId);
      setSendError(error.message || 'Failed to send message. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const getMessageStatusIcon = (message) => {
    if (message.status === 'sending') return '⏳';
    if (message.status === 'failed') return '❌';
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

      <div className="messages-container" ref={messagesContainerRef}>
        {hasMoreMessages && (
          <button
            className="load-more-btn"
            onClick={handleLoadMore}
            disabled={isLoadingMessages}
          >
            {isLoadingMessages ? 'Loading…' : 'Load previous messages'}
          </button>
        )}

        {messages.length === 0 && !isLoadingMessages ? (
          <div className="empty-messages">
            <p>No messages yet</p>
            <p className="hint">Send the first message to start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => {
            const isMine = message.senderAddress?.toLowerCase() === walletAddress?.toLowerCase();
            const key = message.id || message.firebaseId || `${message.timestamp}`;

            return (
              <div
                key={key}
                className={`message ${isMine ? 'message-sent' : 'message-received'}`}
              >
                <div className="message-content">{message.content}</div>
                <div className="message-meta">
                  <span className="message-time">{formatMessageTime(message.timestamp)}</span>
                  {isMine && <span className="message-status">{getMessageStatusIcon(message)}</span>}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="message-input-container">
        <form onSubmit={sendMessage}>
          <div className="input-row">
            <div className="input-wrapper">
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value.slice(0, MESSAGE_CHAR_LIMIT))}
                placeholder="Type a message..."
                disabled={isSending}
                className="message-input"
              />
              <span className="char-count">
                {messageInput.length}/{MESSAGE_CHAR_LIMIT}
              </span>
            </div>

            <button
              type="submit"
              disabled={isSending || !isMessageValid(messageInput)}
              className="send-button"
            >
              {isSending ? '...' : '➤'}
            </button>
          </div>

          {sendError && <div className="error-text">{sendError}</div>}
        </form>
      </div>
    </div>
  );
}

export default ChatArea;
