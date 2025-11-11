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
  
  // Messages state
  messages: [],
  
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
    currentConversation: null,
    messages: [],
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
  
  setConversations: (conversations) => set({ conversations }),
  
  setCurrentConversation: (conversation) => {
    console.log('🔄 [Store] Setting current conversation:', conversation);
    set({
      currentConversation: conversation,
      messages: [], // Clear messages when switching conversations
      status: conversation 
        ? `Chatting with ${conversation.peerAddress.slice(0, 6)}...${conversation.peerAddress.slice(-4)}`
        : 'Select a conversation',
    });
    console.log('✅ [Store] Current conversation set, messages cleared');
  },
  
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message],
  })),
  
  setMessages: (messages) => {
    console.log('📥 [Store] Setting messages:', messages.length, messages);
    set({ messages });
    console.log('✅ [Store] Messages state updated');
  },
  
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
}));
