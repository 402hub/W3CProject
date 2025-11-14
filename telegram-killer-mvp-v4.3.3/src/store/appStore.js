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
  conversationCursor: null,
  hasMoreConversations: true,
  
  // Messages state
  messages: [],
  messageCursor: null,
  hasMoreMessages: false,
  
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
    conversationCursor: null,
    hasMoreConversations: true,
    messageCursor: null,
    hasMoreMessages: false,
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
  
  setConversations: (conversations, options = {}) => set({
    conversations,
    conversationCursor: options.cursor ?? null,
    hasMoreConversations: options.hasMore ?? true,
  }),

  appendConversations: (newConversations = [], options = {}) => set((state) => {
    const existingIds = new Set(state.conversations.map((c) => c.id));
    const deduped = newConversations.filter((convo) => !existingIds.has(convo.id));
    return {
      conversations: [...state.conversations, ...deduped],
      conversationCursor: options.cursor ?? state.conversationCursor,
      hasMoreConversations: options.hasMore ?? state.hasMoreConversations,
    };
  }),
  
  setCurrentConversation: (conversation) => {
    console.log('🔄 [Store] Setting current conversation:', conversation);
    set({
      currentConversation: conversation,
      messages: [], // Clear messages when switching conversations
      messageCursor: null,
      hasMoreMessages: false,
      status: conversation 
        ? `Chatting with ${conversation.peerAddress.slice(0, 6)}...${conversation.peerAddress.slice(-4)}`
        : 'Select a conversation',
    });
    console.log('✅ [Store] Current conversation set, messages cleared');
  },
  
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message],
  })),
  
  setMessages: (messages, options = {}) => {
    console.log('📥 [Store] Setting messages:', messages.length, messages);
    set({
      messages,
      messageCursor: options.cursor ?? null,
      hasMoreMessages: options.hasMore ?? false,
    });
    console.log('✅ [Store] Messages state updated');
  },

  prependMessages: (olderMessages = [], options = {}) => set((state) => {
    const existingIds = new Set(state.messages.map((msg) => msg.id));
    const deduped = olderMessages.filter((msg) => !existingIds.has(msg.id));
    return {
      messages: [...deduped, ...state.messages],
      messageCursor: options.cursor ?? state.messageCursor,
      hasMoreMessages: options.hasMore ?? state.hasMoreMessages,
    };
  }),
  
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
