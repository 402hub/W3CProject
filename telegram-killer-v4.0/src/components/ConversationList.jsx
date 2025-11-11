/**
 * ConversationList Component
 * Shows list of conversations and allows starting new ones
 */

import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { messageService } from '../services/database';

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

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const convos = await messageService.getConversations();
      setConversations(convos);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const startNewConversation = async (e) => {
    e.preventDefault();
    
    if (!newAddress.trim()) {
      return;
    }

    // Basic Ethereum address validation
    if (!/^0x[a-fA-F0-9]{40}$/.test(newAddress)) {
      alert('Please enter a valid Ethereum address');
      return;
    }

    setIsStarting(true);
    
    try {
      const conversation = {
        id: messageService.getConversationId(newAddress, walletAddress),
        peerAddress: newAddress.toLowerCase(),
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
  };

  return (
    <div className="sidebar">
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
          conversations.map((conversation) => {
            const isActive = currentConversation?.id === conversation.id;
            const peerAddress = conversation.peerAddress;
            const shortAddress = `${peerAddress.slice(0, 6)}...${peerAddress.slice(-4)}`;
            
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
                  <div className="conversation-address">{shortAddress}</div>
                  <div className="conversation-last-message">
                    {conversation.lastMessage ? 
                      conversation.lastMessage.substring(0, 30) + (conversation.lastMessage.length > 30 ? '...' : '')
                      : 'Click to open'}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default ConversationList;
