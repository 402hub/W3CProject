/**
 * ConversationList Component
 * Shows list of conversations with timestamps and unread badges
 * v4.1: Added relative timestamps, unread badges, conversation count
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { messageService } from '../services/database';
import { formatRelativeTime, shortenAddress } from '../utils';
import {
  sanitizeWalletAddressInput,
  isValidWalletAddress,
  sanitizeTextInput,
} from '../security';

function ConversationList() {
  const {
    conversations,
    currentConversation,
    walletAddress,
    setConversations,
    appendConversations,
    setCurrentConversation,
    conversationCursor,
    hasMoreConversations,
  } = useAppStore();

  const [newAddress, setNewAddress] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [newAddressError, setNewAddressError] = useState(null);
  const [scrollTop, setScrollTop] = useState(0);

  const listRef = useRef(null);

  const ITEM_HEIGHT = 96;
  const BUFFER_ROWS = 5;

  const loadConversations = useCallback(
    async (withSpinner = true) => {
      if (withSpinner) {
        setIsLoading(true);
      }
      try {
        const payload = await messageService.getConversationsPage();
        setConversations(payload.items, {
          cursor: payload.cursor,
          hasMore: payload.hasMore,
        });
      } catch (error) {
        console.error('Failed to load conversations:', error);
      } finally {
        if (withSpinner) {
          setIsLoading(false);
        }
      }
    },
    [setConversations],
  );

  const loadMoreConversations = useCallback(async () => {
    if (!hasMoreConversations || !conversationCursor || isLoadingMore) {
      return;
    }
    setIsLoadingMore(true);
    try {
      const payload = await messageService.getConversationsPage({
        cursor: conversationCursor,
      });
      appendConversations(payload.items, {
        cursor: payload.cursor,
        hasMore: payload.hasMore,
      });
    } catch (error) {
      console.error('Failed to load additional conversations:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [appendConversations, conversationCursor, hasMoreConversations, isLoadingMore]);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
    
    // Listen for new messages to update conversation list
    const unsubscribe = messageService.onMessage(() => {
      console.log('📬 [UI] New message received, reloading conversations...');
      loadConversations(false);
    });
    
    return () => {
      unsubscribe();
    };
  }, [loadConversations]);

  const startNewConversation = async (e) => {
    e.preventDefault();
    
    const normalizedInput = sanitizeWalletAddressInput(newAddress);
    if (!normalizedInput) {
      setNewAddressError('Enter a wallet address to start chatting');
      return;
    }

    if (!isValidWalletAddress(normalizedInput)) {
      setNewAddressError('Please enter a valid Ethereum address');
      return;
    }

    if (normalizedInput === walletAddress?.toLowerCase()) {
      setNewAddressError('You cannot start a conversation with yourself');
      return;
    }

    setNewAddressError(null);
    setIsStarting(true);
    
    try {
        if (!walletAddress) {
          setNewAddressError('Connect your wallet to start messaging');
          return;
        }
        const normalizedWallet = walletAddress.toLowerCase();
        const conversation = {
          id: messageService.getConversationId(normalizedInput, normalizedWallet),
        peerAddress: normalizedInput,
        unreadCount: 0,
      };
      
      // Set as current
      setCurrentConversation(conversation);
      
      // Reload conversations list
      await loadConversations();
      
      // Clear input
      setNewAddress('');
    } catch (error) {
      console.error('Failed to start conversation:', error);
      setNewAddressError(error.message);
    } finally {
      setIsStarting(false);
    }
  };

  const selectConversation = async (conversation) => {
    setCurrentConversation(conversation);
    // Mark as read when opening
    await messageService.markAsRead(conversation.id);
    await loadConversations(); // Refresh to show updated unread count
  };

  const handleScroll = (event) => {
    const { scrollTop: newScrollTop, scrollHeight, clientHeight } = event.target;
    setScrollTop(newScrollTop);
    if (scrollHeight - (newScrollTop + clientHeight) < ITEM_HEIGHT * 2) {
      loadMoreConversations();
    }
  };

  const totalItems = conversations.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER_ROWS);
  const endIndex = Math.min(totalItems, startIndex + BUFFER_ROWS * 2 + 20);
  const visibleConversations = conversations.slice(startIndex, endIndex);
  const paddingTop = startIndex * ITEM_HEIGHT;
  const paddingBottom = Math.max(0, (totalItems - endIndex) * ITEM_HEIGHT);

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
              onChange={(e) => setNewAddress(sanitizeTextInput(e.target.value))}
            placeholder="Enter address to message..."
            disabled={isStarting}
          />
          <button type="submit" disabled={isStarting || !newAddress.trim()}>
            {isStarting ? '...' : '+'}
          </button>
        </form>
          {newAddressError && <p className="input-error">{newAddressError}</p>}
      </div>

        <div
          className="conversations-list"
          onScroll={handleScroll}
          ref={listRef}
        >
          {isLoading && conversations.length === 0 && (
            <div className="empty-conversations">
              <p>Loading conversations…</p>
            </div>
          )}
          {!isLoading && conversations.length === 0 && (
            <div className="empty-conversations">
              <p>No conversations yet</p>
              <p className="hint">Enter an address above to start</p>
            </div>
          )}
          {conversations.length > 0 && (
            <div style={{ paddingTop, paddingBottom }}>
              {visibleConversations.map((conversation) => {
                const isActive = currentConversation?.id === conversation.id;
                const peerAddress = conversation.peerAddress;
                const shortAddress = shortenAddress(peerAddress);
                const hasUnread = conversation.unreadCount > 0;
                
                return (
                  <div
                    key={conversation.id}
                    className={`conversation-item ${isActive ? 'active' : ''}`}
                    onClick={() => selectConversation(conversation)}
                    style={{ height: `${ITEM_HEIGHT}px` }}
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
                        {conversation.lastMessage ?
                          conversation.lastMessage.substring(0, 30) + (conversation.lastMessage.length > 30 ? '...' : '')
                          : 'Click to open'}
                      </div>
                    </div>
                    {hasUnread && (
                      <div className="unread-badge">{conversation.unreadCount}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {isLoadingMore && (
            <div className="list-loader">Loading more conversations…</div>
          )}
        </div>
    </div>
  );
}

export default ConversationList;
