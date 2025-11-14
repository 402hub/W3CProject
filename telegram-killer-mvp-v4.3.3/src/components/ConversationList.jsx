/**
 * ConversationList Component
 * Shows list of conversations with timestamps and unread badges
 * v4.1: Added relative timestamps, unread badges, conversation count
 */

import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { messageService } from '../services/database';
import { formatRelativeTime, shortenAddress } from '../utils';
import { validateAddress } from '../utils/validation';

function ConversationList() {
  const {
    conversations,
    currentConversation,
    walletAddress,
    setConversations,
    setCurrentConversation,
  } = useAppStore();

  const [newAddress, setNewAddress] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
    
    // Listen for new messages to update conversation list
    const unsubscribe = messageService.onMessage(() => {
      console.log('📬 [UI] New message received, reloading conversations...');
      loadConversations();
    });
    
    return () => {
      unsubscribe();
    };
  }, []);

  const loadConversations = async (beforeTime = null) => {
    try {
      const result = await messageService.getConversations(20, beforeTime); // Load 20 at a time
      if (beforeTime) {
        // Loading more - append to existing
        setConversations([...conversations, ...result.conversations]);
      } else {
        // Initial load - replace all
        setConversations(result.conversations);
      }
      setHasMoreConversations(result.hasMore);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const loadMoreConversations = async () => {
    if (isLoadingMore || !hasMoreConversations) return;
    
    setIsLoadingMore(true);
    try {
      // Get the oldest conversation timestamp
      const oldestConversation = conversations[conversations.length - 1];
      if (oldestConversation && oldestConversation.lastMessageTime) {
        await loadConversations(oldestConversation.lastMessageTime);
      }
    } catch (error) {
      console.error('Failed to load more conversations:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const startNewConversation = async (e) => {
    e.preventDefault();
    
    if (!newAddress.trim()) {
      return;
    }

    // v4.4.0: Use validation utility
    if (!validateAddress(newAddress)) {
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
      
      // Set as current
      setCurrentConversation(conversation);
      
      // Reload conversations list
      await loadConversations();
      
      // Clear input
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
    // Mark as read when opening
    await messageService.markAsRead(conversation.id);
    await loadConversations(); // Refresh to show updated unread count
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

      <div className="conversations-list">
        {conversations.length === 0 ? (
          <div className="empty-conversations">
            <p>No conversations yet</p>
            <p className="hint">Enter an address above to start</p>
          </div>
        ) : (
          <>
            {conversations.map((conversation) => {
              const isActive = currentConversation?.id === conversation.id;
              const peerAddress = conversation.peerAddress;
              const shortAddress = shortenAddress(peerAddress);
              const hasUnread = conversation.unreadCount > 0;
              
              return (
                <div
                  key={conversation.id}
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
            {hasMoreConversations && (
              <div className="load-more-conversations">
                <button 
                  onClick={loadMoreConversations} 
                  disabled={isLoadingMore}
                  className="load-more-button"
                >
                  {isLoadingMore ? 'Loading...' : 'Load More Conversations'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default ConversationList;
