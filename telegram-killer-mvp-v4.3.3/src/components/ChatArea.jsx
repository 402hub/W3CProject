/**
 * ChatArea Component
 * v4.4: Secure messaging with pagination, rate limiting, and wallet signatures.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSignMessage } from 'wagmi';
import { useAppStore } from '../store/appStore';
import { messageService } from '../services/database';
import { formatMessageTime } from '../utils';
import { MESSAGE_CHAR_LIMIT, getMessageCharactersRemaining } from '../security';

function ChatArea() {
  const {
    currentConversation,
    messages,
    walletAddress,
    setMessages,
    addMessageOptimistic,
    confirmMessage,
    failMessage,
    prependMessages,
    messageCursor,
    hasMoreMessages,
    setStatus,
  } = useAppStore();

  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  const { signMessageAsync } = useSignMessage();

  // Debug log for state changes
  useEffect(() => {
    console.log('🔄 [ChatArea] Messages state updated:', messages.length);
  }, [messages]);

  const scrollToBottom = useCallback(
    (behavior = 'smooth') => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior });
      }
    },
    [],
  );

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, clientHeight, scrollHeight } = messagesContainerRef.current;
    const nearBottom = scrollHeight - (scrollTop + clientHeight) < 120;
    setAutoScrollEnabled(nearBottom);
  };

  const loadLatestMessages = useCallback(
    async (withSpinner = false) => {
      if (!currentConversation) return;
      if (withSpinner) {
        setIsLoadingMessages(true);
      }
      try {
        const payload = await messageService.loadMessagesPage(currentConversation.peerAddress);
        setMessages(payload.messages, {
          cursor: payload.cursor,
          hasMore: payload.hasMore,
        });
      } catch (error) {
        console.error('❌ [ChatArea] Failed to load messages:', error);
        setStatus(`Failed to load messages: ${error.message}`);
      } finally {
        if (withSpinner) {
          setIsLoadingMessages(false);
        }
      }
    },
    [currentConversation, setMessages, setStatus],
  );

  const loadOlderMessages = async () => {
    if (!currentConversation || !hasMoreMessages || !messageCursor || isLoadingOlder) {
      return;
    }
    setIsLoadingOlder(true);
    try {
      const payload = await messageService.loadMessagesPage(currentConversation.peerAddress, {
        beforeTimestamp: messageCursor,
      });
      prependMessages(payload.messages, {
        cursor: payload.cursor,
        hasMore: payload.hasMore,
      });
    } catch (error) {
      console.error('❌ [ChatArea] Failed to load older messages:', error);
      setStatus(`Unable to load older messages: ${error.message}`);
    } finally {
      setIsLoadingOlder(false);
    }
  };

  // Load on conversation change and subscribe for live updates
  useEffect(() => {
    if (!currentConversation) {
      return undefined;
    }

    let isMounted = true;

    (async () => {
      await loadLatestMessages(true);
      if (isMounted) {
        scrollToBottom('auto');
      }
    })();

    const unsubscribe = messageService.onMessage((newMessage) => {
      if (newMessage.conversationId === currentConversation.id) {
        loadLatestMessages(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [currentConversation, loadLatestMessages, scrollToBottom]);

  // Auto-scroll if the user is anchored at the bottom
  useEffect(() => {
    if (autoScrollEnabled) {
      scrollToBottom('smooth');
    }
  }, [messages, autoScrollEnabled, scrollToBottom]);

  const getMessageStatusIcon = (message) => {
    if (message.status === 'sending') {
      return '⏳';
    }
    if (message.status === 'failed') {
      return '❌';
    }
    return '✓';
  };

  const charsRemaining = getMessageCharactersRemaining(messageInput);

  const handleSend = async (event) => {
    event.preventDefault();
    if (!currentConversation || isSending) {
      return;
    }

    setSendError(null);

    let preparedMessage;
    try {
      preparedMessage = messageService.prepareMessagePayload(
        currentConversation.peerAddress,
        messageInput,
      );
    } catch (error) {
      setSendError(error.message);
      return;
    }

    const tempId = `temp-${Date.now()}`;
    addMessageOptimistic(preparedMessage.content, tempId);
    setMessageInput('');
    setIsSending(true);

    try {
      const signature = await signMessageAsync({ message: preparedMessage.payload });
      const messageId = await messageService.sendMessage(preparedMessage, signature);
      confirmMessage(tempId, messageId);
      await loadLatestMessages(false);
      setStatus('Message sent securely');
    } catch (error) {
      console.error('❌ [ChatArea] Failed to send message:', error);
      const friendlyError = error?.shortMessage || error?.message || 'Failed to send message.';
      failMessage(tempId);
      setSendError(friendlyError);
      setStatus(friendlyError);
    } finally {
      setIsSending(false);
    }
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

  const shortAddress = `${currentConversation.peerAddress.slice(
    0,
    6,
  )}...${currentConversation.peerAddress.slice(-4)}`;

  return (
    <div className="chat-area">
      <div className="chat-header">
        <div className="chat-header-info">
          <h3>{shortAddress}</h3>
          <p className="chat-header-address">{currentConversation.peerAddress}</p>
        </div>
      </div>

      <div
        className="messages-container"
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {isLoadingMessages && (
          <div className="messages-loader">Loading messages…</div>
        )}

        {hasMoreMessages && (
          <button
            className="load-more-messages"
            type="button"
            onClick={loadOlderMessages}
            disabled={isLoadingOlder}
          >
            {isLoadingOlder ? 'Loading older messages…' : 'Load older messages'}
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
            return (
              <div
                key={message.id}
                className={`message ${isMine ? 'message-sent' : 'message-received'}`}
              >
                <div className="message-content">{message.content}</div>
                <div className="message-meta">
                  <span className="message-time">{formatMessageTime(message.timestamp)}</span>
                  {isMine && (
                    <span className="message-status" title={message.status}>
                      {getMessageStatusIcon(message)}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}

        <div ref={messagesEndRef} />
      </div>

      {!autoScrollEnabled && messages.length > 0 && (
        <button
          type="button"
          className="scroll-to-latest"
          onClick={() => {
            scrollToBottom('smooth');
            setAutoScrollEnabled(true);
          }}
        >
          Scroll to latest ↓
        </button>
      )}

      <div className="message-input-container">
        <form onSubmit={handleSend}>
          <input
            type="text"
            value={messageInput}
            onChange={(event) => setMessageInput(event.target.value.slice(0, MESSAGE_CHAR_LIMIT))}
            placeholder="Type a message..."
            disabled={isSending}
            className="message-input"
            maxLength={MESSAGE_CHAR_LIMIT}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={isSending || !messageInput.trim()}
            className="send-button"
          >
            {isSending ? '...' : '➤'}
          </button>
        </form>
        <div className="input-meta">
          <span className={`char-counter ${charsRemaining < 0 ? 'char-counter-error' : ''}`}>
            {charsRemaining} chars left
          </span>
          {sendError && <span className="send-error">{sendError}</span>}
        </div>
      </div>
    </div>
  );
}

export default ChatArea;
