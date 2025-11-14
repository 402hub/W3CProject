/**
 * ConversationList Component
 * Lazy loads conversations with virtual scrolling
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { messageService } from '../services/database';
import { formatRelativeTime, shortenAddress } from '../utils';

const ITEM_HEIGHT = 72;
const BUFFER_ROWS = 5;

function ConversationList() {
  const {
    conversations,
    currentConversation,
    walletAddress,
    hasMoreConversations,
    nextConversationCursor,
    isLoadingConversations,
    setConversationsPage,
    setCurrentConversation,
    setConversationsLoading,
  } = useAppStore();

  const [newAddress, setNewAddress] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [virtualStartIndex, setVirtualStartIndex] = useState(0);
  const listRef = useRef(null);

  const loadConversations = useCallback(
    async ({ reset = false, cursor } = {}) => {
      if (!walletAddress) return;
      if (isLoadingConversations && !reset && !cursor) return;

      try {
        setConversationsLoading(true);
        const page = await messageService.getConversations(
          cursor ? { cursor } : reset ? {} : {},
        );
        setConversationsPage(page);
      } catch (error) {
        console.error('Failed to load conversations:', error);
      } finally {
        setConversationsLoading(false);
      }
    },
    [walletAddress, isLoadingConversations, setConversationsLoading, setConversationsPage],
  );

  useEffect(() => {
    loadConversations({ reset: true });

    const unsubscribe = messageService.onMessage(() => {
      loadConversations({ reset: true });
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [loadConversations]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;

    const handleScroll = () => {
      const scrollTop = node.scrollTop;
      const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER_ROWS);
      setVirtualStartIndex(startIndex);

      const nearBottom = scrollTop + node.clientHeight >= node.scrollHeight - ITEM_HEIGHT * 2;
      if (nearBottom && hasMoreConversations && !isLoadingConversations) {
        loadConversations({ cursor: nextConversationCursor });
      }
    };

    node.addEventListener('scroll', handleScroll);
    return () => {
      node.removeEventListener('scroll', handleScroll);
    };
  }, [hasMoreConversations, isLoadingConversations, nextConversationCursor, loadConversations]);

  const totalHeight = conversations.length * ITEM_HEIGHT + (hasMoreConversations ? ITEM_HEIGHT : 0);
  const viewportHeight = listRef.current?.clientHeight || 600;
  const visibleCount = Math.ceil(viewportHeight / ITEM_HEIGHT) + BUFFER_ROWS * 2;

  const visibleConversations = useMemo(() => {
    if (conversations.length === 0) {
      return [];
    }

    const start = Math.min(virtualStartIndex, Math.max(conversations.length - visibleCount, 0));
    const end = Math.min(conversations.length, start + visibleCount);
    return conversations.slice(start, end).map((conversation, index) => ({
      conversation,
      offset: (start + index) * ITEM_HEIGHT,
    }));
  }, [conversations, virtualStartIndex, visibleCount]);

  const startNewConversation = async (e) => {
    e.preventDefault();

    if (!newAddress.trim()) {
      return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(newAddress)) {
      alert('Please enter a valid Ethereum address');
      return;
    }

    setIsStarting(true);

    try {
      const conversation = {
        id: messageService.getConversationId(newAddress, walletAddress),
        peerAddress: newAddress.toLowerCase(),
        unreadCount: 0,
      };

      setCurrentConversation(conversation);
      await loadConversations({ reset: true });
      setNewAddress('');
    } catch (error) {
      console.error('Failed to start conversation:', error);
      alert(`Failed to start conversation: ${error.message}`);
    } finally {
      setIsStarting(false);
    }
  };

  const selectConversation = async (conversation) => {
    setCurrentConversation(conversation);
    await messageService.markAsRead(conversation.id);
    await loadConversations({ reset: true });
  };

  const handleLoadMoreClick = () => {
    if (!hasMoreConversations || isLoadingConversations) return;
    loadConversations({ cursor: nextConversationCursor });
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h3>Messages</h3>
        {conversations.length > 0 && (
          <span className="conversation-count-badge">{conversations.length}</span>
        )}
      </div>

      <div className="new-conversation">
        <form onSubmit={startNewConversation}>
          <input
            type="text"
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            placeholder="Enter address to message..."
            disabled={isStarting}
          />
          <button type="submit" disabled={isStarting || !newAddress.trim()}>
            {isStarting ? '...' : '+'}
          </button>
        </form>
      </div>

      <div className="conversations-list" ref={listRef}>
        {conversations.length === 0 ? (
          <div className="empty-conversations">
            <p>No conversations yet</p>
            <p className="hint">Enter an address above to start</p>
          </div>
        ) : (
          <div className="virtual-list" style={{ height: totalHeight || '100%', position: 'relative' }}>
            {visibleConversations.map(({ conversation, offset }) => {
              const isActive = currentConversation?.id === conversation.id;
              const peerAddress = conversation.peerAddress;
              const shortAddress = shortenAddress(peerAddress);
              const hasUnread = conversation.unreadCount > 0;

              return (
                <div
                  key={conversation.id}
                  style={{ position: 'absolute', top: offset, left: 0, right: 0 }}
                  className={`conversation-item ${isActive ? 'active' : ''}`}
                  onClick={() => selectConversation(conversation)}
                >
                  <div className="conversation-avatar">
                    {peerAddress.slice(2, 4).toUpperCase()}
                  </div>
                  <div className="conversation-info">
                    <div className="conversation-header">
                      <div className="conversation-address">{shortAddress}</div>
                      {conversation.lastMessageTime && (
                        <div className="conversation-time">
                          {formatRelativeTime(conversation.lastMessageTime)}
                        </div>
                      )}
                    </div>
                    <div className="conversation-last-message">
                      {conversation.lastMessage
                        ? conversation.lastMessage.substring(0, 30) +
                          (conversation.lastMessage.length > 30 ? '...' : '')
                        : 'Click to open'}
                    </div>
                  </div>
                  {hasUnread && <div className="unread-badge">{conversation.unreadCount}</div>}
                </div>
              );
            })}

            {isLoadingConversations && (
              <div className="loading-more">Loading conversations...</div>
            )}

            {!isLoadingConversations && hasMoreConversations && (
              <div className="load-more-placeholder">
                <button className="load-more-btn" onClick={handleLoadMoreClick}>
                  Load more conversations
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ConversationList;
