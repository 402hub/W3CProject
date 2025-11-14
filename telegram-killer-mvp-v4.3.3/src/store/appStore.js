/**
 * Zustand Store - Single Source of Truth
 * All app state lives here
 */

import { create } from 'zustand';

export const useAppStore = create((set, get) => ({
  // Wallet state
  isWalletConnected: false,
  walletAddress: null,
  
  // Database state
  isDbInitialized: false,
  dbClient: null,
  dbError: null,
  
  // Conversations state
  conversations: [],
  currentConversation: null,
  hasMoreConversations: true,
  nextConversationCursor: null,
  isLoadingConversations: false,
  
  // Messages state
  messages: [],
  hasMoreMessages: false,
  nextMessageCursor: null,
  isLoadingMessages: false,
  
  // UI state
  isLoading: false,
  status: 'Connect your wallet to start messaging',
  
  // Actions
  setWalletConnected: (address) => set({
    isWalletConnected: true,
    walletAddress: address,
    status: `Wallet connected: ${address.slice(0, 6)}...${address.slice(-4)}`,
  }),
  
  setWalletDisconnected: () => set({
    isWalletConnected: false,
    walletAddress: null,
    isDbInitialized: false,
    dbClient: null,
    conversations: [],
    hasMoreConversations: true,
    nextConversationCursor: null,
    currentConversation: null,
    messages: [],
    hasMoreMessages: false,
    nextMessageCursor: null,
    status: 'Wallet disconnected',
  }),
  
  setDbInitialized: (client) => set({
    isDbInitialized: true,
    dbClient: client,
    dbError: null,
    status: 'Local messaging ready! Enter an address to start.',
  }),
  
  setDbError: (error) => set({
    dbError: error,
    status: `Error: ${error.message}`,
  }),
  
  setConversationsPage: ({ conversations, hasMore, nextCursor }) => set({
    conversations,
    hasMoreConversations: hasMore,
    nextConversationCursor: nextCursor,
  }),

  setConversationsLoading: (isLoading) => set({ isLoadingConversations: isLoading }),
  
  setCurrentConversation: (conversation) => {
    console.log('🔄 [Store] Setting current conversation:', conversation);
    set({
      currentConversation: conversation,
      messages: [], // Clear messages when switching conversations
      hasMoreMessages: false,
      nextMessageCursor: null,
      status: conversation 
        ? `Chatting with ${conversation.peerAddress.slice(0, 6)}...${conversation.peerAddress.slice(-4)}`
        : 'Select a conversation',
    });
    console.log('✅ [Store] Current conversation set, messages cleared');
  },
  
  setMessagesPage: ({ messages, hasMore, nextCursor }) => {
    console.log('📥 [Store] Setting messages:', messages.length);
    set({
      messages,
      hasMoreMessages: hasMore,
      nextMessageCursor: nextCursor,
    });
    console.log('✅ [Store] Messages state updated');
  },

  setMessagesLoading: (isLoading) => set({ isLoadingMessages: isLoading }),
  
  addMessageOptimistic: (content, tempId) => {
    const state = get();
    const optimisticMessage = {
      id: tempId,
      content,
      senderAddress: state.walletAddress,
      timestamp: Date.now(),
      status: 'sending',
      isOptimistic: true,
    };
    
    set((state) => ({
      messages: [...state.messages, optimisticMessage],
    }));
    
    return tempId;
  },
  
  confirmMessage: (tempId, realId) => set((state) => ({
    messages: state.messages.map(msg => 
      msg.id === tempId 
        ? { ...msg, id: realId, status: 'sent', isOptimistic: false }
        : msg
    ),
  })),
  
  failMessage: (tempId) => set((state) => ({
    messages: state.messages.map(msg => 
      msg.id === tempId 
        ? { ...msg, status: 'failed', isOptimistic: false }
        : msg
    ),
  })),
  
  setLoading: (isLoading) => set({ isLoading }),
  
  setStatus: (status) => set({ status }),
  
  resetMessagingState: () => set({
    messages: [],
    hasMoreMessages: false,
    nextMessageCursor: null,
    conversations: [],
    hasMoreConversations: true,
    nextConversationCursor: null,
  }),
}));
