/**
 * Local Database Service
 * Using Dexie (IndexedDB wrapper) for fast, reliable local storage
 * 
 * v4.1: Added unread message tracking
 */

import Dexie from 'dexie';

class LocalDatabase extends Dexie {
  constructor() {
    super('TelegramKillerDB');
    
    // Define database schema
    this.version(1).stores({
      messages: '++id, conversationId, senderAddress, timestamp, content',
      conversations: 'id, peerAddress, lastMessageTime, unreadCount',
    });
    
    this.messages = this.table('messages');
    this.conversations = this.table('conversations');
  }
}

// Create database instance
const db = new LocalDatabase();

/**
 * Message Service
 * Handles all message operations
 */
class MessageService {
  constructor() {
    this.walletAddress = null;
    this.messageListeners = [];
  }
  
  /**
   * Initialize with wallet address
   */
  initialize(walletAddress) {
    console.log('💾 [DB] Initializing local database...');
    this.walletAddress = walletAddress.toLowerCase();
    console.log('✅ [DB] Database ready!');
    console.log('📧 [DB] Your address:', this.walletAddress);
    return db;
  }
  
  /**
   * Get conversation ID (deterministic for both parties)
   */
  getConversationId(address1, address2) {
    const sorted = [address1.toLowerCase(), address2.toLowerCase()].sort();
    return `${sorted[0]}_${sorted[1]}`;
  }
  
  /**
   * Send a message
   */
  async sendMessage(toAddress, content) {
    if (!this.walletAddress) {
      throw new Error('Database not initialized');
    }
    
    try {
      console.log('📤 [DB] Sending message to:', toAddress);
      
      const conversationId = this.getConversationId(this.walletAddress, toAddress.toLowerCase());
      const timestamp = Date.now();
      
      const message = {
        conversationId,
        senderAddress: this.walletAddress,
        recipientAddress: toAddress.toLowerCase(),
        content,
        timestamp,
        status: 'sent',
      };
      
      // Add message to database
      const messageId = await db.messages.add(message);
      
      // Update conversation (don't increment unread for sent messages)
      await db.conversations.put({
        id: conversationId,
        peerAddress: toAddress.toLowerCase(),
        lastMessageTime: timestamp,
        lastMessage: content,
        unreadCount: 0, // Reset unread when we send
      });
      
      console.log('✅ [DB] Message saved!', messageId);
      
      // Notify listeners
      this.messageListeners.forEach(listener => {
        listener({
          id: messageId,
          ...message,
        });
      });
      
      return messageId;
    } catch (error) {
      console.error('❌ [DB] Send error:', error);
      throw error;
    }
  }
  
  /**
   * Load messages for a conversation
   */
  async loadMessages(otherAddress) {
    if (!this.walletAddress) {
      return [];
    }
    
    try {
      console.log('💬 [DB] Loading messages with:', otherAddress);
      
      const conversationId = this.getConversationId(this.walletAddress, otherAddress.toLowerCase());
      
      const messages = await db.messages
        .where('conversationId')
        .equals(conversationId)
        .sortBy('timestamp');
      
      console.log(`✅ [DB] Loaded ${messages.length} messages`);
      return messages;
    } catch (error) {
      console.error('❌ [DB] Load error:', error);
      return [];
    }
  }
  
  /**
   * Get all conversations for current wallet ONLY
   * CRITICAL FIX: Filter by wallet address to prevent conversation leakage
   */
  async getConversations() {
    if (!this.walletAddress) {
      return [];
    }
    
    try {
      console.log('📋 [DB] Fetching conversations for wallet:', this.walletAddress);
      
      // Get all conversations from database
      const allConversations = await db.conversations.toArray();
      
      // CRITICAL: Filter to only conversations involving current wallet
      const myConversations = allConversations.filter(convo => {
        // Conversation ID format: "address1_address2"
        const [addr1, addr2] = convo.id.split('_');
        
        // Only include if current wallet is one of the participants
        return addr1 === this.walletAddress || addr2 === this.walletAddress;
      });
      
      // Sort by most recent
      const sorted = myConversations.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
      
      console.log(`✅ [DB] Found ${sorted.length} conversations for this wallet`);
      console.log(`ℹ️ [DB] (Filtered out ${allConversations.length - sorted.length} conversations from other wallets)`);
      
      return sorted;
    } catch (error) {
      console.error('❌ [DB] Get conversations error:', error);
      return [];
    }
  }
  
  /**
   * Mark conversation as read
   */
  async markAsRead(conversationId) {
    try {
      const conversation = await db.conversations.get(conversationId);
      if (conversation) {
        await db.conversations.update(conversationId, { unreadCount: 0 });
        console.log('✅ [DB] Marked as read:', conversationId);
      }
    } catch (error) {
      console.error('❌ [DB] Mark as read error:', error);
    }
  }
  
  /**
   * Register message listener
   */
  onMessage(callback) {
    this.messageListeners.push(callback);
    console.log('👂 [DB] Message listener registered');
    
    return () => {
      const index = this.messageListeners.indexOf(callback);
      if (index > -1) {
        this.messageListeners.splice(index, 1);
        console.log('🔇 [DB] Message listener removed');
      }
    };
  }
  
  /**
   * Get user address
   */
  getAddress() {
    return this.walletAddress;
  }
  
  /**
   * Check if ready
   */
  isReady() {
    return this.walletAddress !== null;
  }
  
  /**
   * Cleanup wallet data (called on disconnect)
   * CRITICAL FIX: Clear wallet address to prevent data leakage
   */
  cleanup() {
    console.log('🧹 [DB] Cleaning up wallet data...');
    this.walletAddress = null;
    this.messageListeners = [];
    console.log('✅ [DB] Wallet data cleared');
  }
}

// Export singleton instance
export const messageService = new MessageService();

export default MessageService;
