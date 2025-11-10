// db.js - IndexedDB Layer for Ultra-Fast Message Persistence
import Dexie from 'dexie';

class TelegramKillerDB extends Dexie {
  constructor() {
    super('TelegramKillerDB');
    
    this.version(1).stores({
      // Messages table with compound indexes for fast queries
      messages: '++id, conversationId, timestamp, senderAddress, [conversationId+timestamp]',
      
      // Conversations table
      conversations: 'id, peerAddress, lastMessageTime, lastMessage, unreadCount',
      
      // Media cache - store references and metadata
      media: '++id, messageId, ipfsHash, localUrl, type, size, timestamp',
      
      // Pending messages queue (for offline support)
      pendingMessages: '++id, conversationId, content, timestamp, retryCount, status',
      
      // User settings and preferences
      settings: 'key, value',
      
      // Wallet connections
      wallets: 'address, chainId, lastUsed, metadata'
    });

    // Define TypeScript-like interfaces
    this.messages = this.table('messages');
    this.conversations = this.table('conversations');
    this.media = this.table('media');
    this.pendingMessages = this.table('pendingMessages');
    this.settings = this.table('settings');
    this.wallets = this.table('wallets');
  }

  // OPTIMIZED MESSAGE OPERATIONS

  /**
   * Save message with optimistic update
   * @param {Object} message - Message object
   * @returns {Promise<number>} Message ID
   */
  async saveMessage(message) {
    const messageData = {
      ...message,
      timestamp: message.timestamp || Date.now(),
      status: message.status || 'sent',
      localId: message.localId || this.generateLocalId()
    };

    const id = await this.messages.add(messageData);
    
    // Update conversation metadata
    await this.updateConversationMetadata(message.conversationId, {
      lastMessage: message.content,
      lastMessageTime: messageData.timestamp
    });

    return id;
  }

  /**
   * Bulk save messages (for initial sync) - CRITICAL for speed
   * @param {Array} messages - Array of messages
   */
  async bulkSaveMessages(messages) {
    return await this.transaction('rw', this.messages, async () => {
      await this.messages.bulkAdd(messages);
    });
  }

  /**
   * Get messages for a conversation with pagination
   * @param {string} conversationId 
   * @param {number} limit 
   * @param {number} offset 
   * @returns {Promise<Array>}
   */
  async getMessages(conversationId, limit = 50, offset = 0) {
    return await this.messages
      .where('[conversationId+timestamp]')
      .between(
        [conversationId, Dexie.minKey],
        [conversationId, Dexie.maxKey]
      )
      .reverse() // Newest first
      .offset(offset)
      .limit(limit)
      .toArray();
  }

  /**
   * Get recent conversations sorted by activity
   * @param {number} limit 
   */
  async getRecentConversations(limit = 20) {
    return await this.conversations
      .orderBy('lastMessageTime')
      .reverse()
      .limit(limit)
      .toArray();
  }

  /**
   * Update conversation metadata
   */
  async updateConversationMetadata(conversationId, updates) {
    await this.conversations.update(conversationId, {
      ...updates,
      lastMessageTime: Date.now()
    });
  }

  /**
   * Search messages (for future search feature)
   * @param {string} query 
   * @param {string} conversationId 
   */
  async searchMessages(query, conversationId = null) {
    let collection = this.messages;
    
    if (conversationId) {
      collection = collection.where('conversationId').equals(conversationId);
    }

    const results = await collection.toArray();
    const lowerQuery = query.toLowerCase();
    
    return results.filter(msg => 
      msg.content && msg.content.toLowerCase().includes(lowerQuery)
    );
  }

  // PENDING MESSAGE QUEUE (Offline Support)

  /**
   * Add message to pending queue
   */
  async addPendingMessage(message) {
    return await this.pendingMessages.add({
      ...message,
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    });
  }

  /**
   * Get all pending messages
   */
  async getPendingMessages() {
    return await this.pendingMessages
      .where('status')
      .equals('pending')
      .toArray();
  }

  /**
   * Mark pending message as sent
   */
  async removePendingMessage(id) {
    await this.pendingMessages.delete(id);
  }

  /**
   * Increment retry count
   */
  async incrementRetry(id) {
    const msg = await this.pendingMessages.get(id);
    if (msg) {
      await this.pendingMessages.update(id, {
        retryCount: (msg.retryCount || 0) + 1,
        lastRetry: Date.now()
      });
    }
  }

  // MEDIA CACHE

  /**
   * Cache media file
   */
  async cacheMedia(messageId, ipfsHash, blob, metadata) {
    const localUrl = URL.createObjectURL(blob);
    
    return await this.media.add({
      messageId,
      ipfsHash,
      localUrl,
      type: metadata.type,
      size: metadata.size,
      timestamp: Date.now()
    });
  }

  /**
   * Get cached media
   */
  async getCachedMedia(ipfsHash) {
    return await this.media
      .where('ipfsHash')
      .equals(ipfsHash)
      .first();
  }

  /**
   * Clean old media cache (keep last 7 days)
   */
  async cleanMediaCache() {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    await this.media
      .where('timestamp')
      .below(sevenDaysAgo)
      .delete();
  }

  // UTILITY FUNCTIONS

  generateLocalId() {
    return `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clear all data (for logout)
   */
  async clearAllData() {
    await Promise.all([
      this.messages.clear(),
      this.conversations.clear(),
      this.media.clear(),
      this.pendingMessages.clear()
    ]);
  }

  /**
   * Get database statistics
   */
  async getStats() {
    const [messageCount, conversationCount, pendingCount, mediaCount] = await Promise.all([
      this.messages.count(),
      this.conversations.count(),
      this.pendingMessages.count(),
      this.media.count()
    ]);

    return {
      messages: messageCount,
      conversations: conversationCount,
      pending: pendingCount,
      media: mediaCount
    };
  }
}

// Singleton instance
export const db = new TelegramKillerDB();

// Performance monitoring
if (typeof window !== 'undefined') {
  window.db = db; // For debugging
  
  // Log performance metrics
  const startTime = performance.now();
  db.open().then(() => {
    console.log(`✅ Database opened in ${(performance.now() - startTime).toFixed(2)}ms`);
  });
}
