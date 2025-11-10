// messaging-simple.js - MINIMAL XMTP Implementation (Just Make It Work!)
import { Client } from '@xmtp/xmtp-js';

/**
 * Simple MessagingEngine - No fancy features, just basic XMTP
 */
export class MessagingEngine {
  constructor() {
    this.client = null;
    this.conversations = new Map();
    this.listeners = new Set();
  }

  /**
   * Initialize XMTP client - SIMPLE VERSION
   */
  async initialize(signer, options = {}) {
    try {
      console.log('🔄 Starting XMTP initialization...');
      
      // Create XMTP client with MINIMAL options
      this.client = await Client.create(signer, {
        env: 'dev'  // Use dev network
      });

      console.log('✅ XMTP Client created successfully!');
      console.log('📧 Your XMTP address:', this.client.address);

      // Start listening for messages
      this.startListening();

      return this.client;

    } catch (error) {
      console.error('❌ XMTP initialization failed:', error);
      throw error;
    }
  }

  /**
   * Start listening for messages
   */
  async startListening() {
    try {
      console.log('👂 Starting to listen for messages...');
      
      const stream = await this.client.conversations.streamAllMessages();
      
      for await (const message of stream) {
        console.log('📨 New message:', message.content);
        this.notifyListeners('message', {
          content: message.content,
          senderAddress: message.senderAddress,
          timestamp: message.sent.getTime(),
          conversationId: message.conversation.topic
        });
      }
    } catch (error) {
      console.error('❌ Error listening for messages:', error);
    }
  }

  /**
   * List all conversations
   */
  async listConversations() {
    try {
      if (!this.client) {
        console.warn('⚠️ Client not initialized');
        return [];
      }

      console.log('📋 Loading conversations...');
      const convos = await this.client.conversations.list();
      
      console.log(`✅ Found ${convos.length} conversations`);
      
      return convos.map(convo => ({
        id: convo.topic,
        peerAddress: convo.peerAddress,
        topic: convo.topic,
        lastMessage: '',
        lastMessageTime: Date.now()
      }));
      
    } catch (error) {
      console.error('❌ Error listing conversations:', error);
      return [];
    }
  }

  /**
   * Get or create a conversation
   */
  async getOrCreateConversation(peerAddress) {
    try {
      if (!this.client) {
        throw new Error('Client not initialized');
      }

      console.log('🔍 Getting conversation with:', peerAddress);
      
      // Check if conversation already exists
      const conversations = await this.client.conversations.list();
      const existing = conversations.find(c => c.peerAddress.toLowerCase() === peerAddress.toLowerCase());
      
      if (existing) {
        console.log('✅ Found existing conversation');
        this.conversations.set(peerAddress, existing);
        return existing;
      }

      // Create new conversation
      console.log('🆕 Creating new conversation...');
      const conversation = await this.client.conversations.newConversation(peerAddress);
      
      console.log('✅ Conversation created!');
      this.conversations.set(peerAddress, conversation);
      return conversation;
      
    } catch (error) {
      console.error('❌ Error with conversation:', error);
      throw error;
    }
  }

  /**
   * Get messages for a conversation - SIMPLE VERSION
   */
  async getMessages(peerAddress) {
    try {
      const conversation = this.conversations.get(peerAddress) || 
                          await this.getOrCreateConversation(peerAddress);
      
      console.log('📨 Loading messages...');
      const messages = await conversation.messages();
      
      console.log(`✅ Loaded ${messages.length} messages`);
      
      return messages.map(msg => ({
        id: msg.id,
        content: msg.content,
        senderAddress: msg.senderAddress,
        timestamp: msg.sent.getTime(),
        conversationId: conversation.topic
      }));
      
    } catch (error) {
      console.error('❌ Error loading messages:', error);
      return [];
    }
  }

  /**
   * Send message - SIMPLE VERSION
   */
  async sendMessage(peerAddress, content, options = {}) {
    try {
      if (!this.client) {
        throw new Error('Client not initialized');
      }

      console.log('📤 Sending message to:', peerAddress);
      
      const conversation = this.conversations.get(peerAddress) || 
                          await this.getOrCreateConversation(peerAddress);

      // Just send it - no optimistic updates, no fancy caching
      await conversation.send(content);
      
      console.log('✅ Message sent!');
      
      // Notify listeners
      this.notifyListeners('messageSent', {
        content,
        peerAddress,
        timestamp: Date.now()
      });

      return { success: true };
      
    } catch (error) {
      console.error('❌ Error sending message:', error);
      throw error;
    }
  }

  /**
   * Subscribe to events
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners
   */
  notifyListeners(event, data) {
    this.listeners.forEach(listener => {
      try {
        listener({ event, data });
      } catch (error) {
        console.error('Error in listener:', error);
      }
    });
  }

  /**
   * Get metrics (simplified)
   */
  getMetrics() {
    return {
      messages: 0,
      averageSendTime: 0
    };
  }
}

// Export singleton
export const messagingEngine = new MessagingEngine();
