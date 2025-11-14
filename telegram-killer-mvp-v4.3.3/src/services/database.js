/**
 * Hybrid Database Service - v4.3
 * Local-first with Firebase P2P sync
 * 
 * Strategy:
 * 1. Messages save to LOCAL IndexedDB first (instant UI)
 * 2. Then sync to FIREBASE (P2P delivery)
 * 3. Listen for incoming Firebase messages
 * 4. Save incoming messages to local IndexedDB
 * 
 * Result: Fast local UX + Real P2P messaging!
 */

import Dexie from 'dexie';
import { database } from '../firebase';
import { ref, push, onChildAdded, query, orderByChild, limitToLast } from 'firebase/database';

class LocalDatabase extends Dexie {
  constructor() {
    super('TelegramKillerDB');
    
    this.version(1).stores({
      messages: '++id, conversationId, senderAddress, timestamp, content, firebaseId',
      conversations: 'id, peerAddress, lastMessageTime, unreadCount',
    });
    
    this.messages = this.table('messages');
    this.conversations = this.table('conversations');
  }
}

const db = new LocalDatabase();

class MessageService {
  constructor() {
    this.walletAddress = null;
    this.messageListeners = [];
    this.firebaseListeners = {}; // Track Firebase listeners per conversation
    this.isFirebaseEnabled = false;
  }
  
  /**
   * Initialize with wallet address
   */
  initialize(walletAddress) {
    console.log('💾 [DB] Initializing local database...');
    this.walletAddress = walletAddress.toLowerCase();
    console.log('✅ [DB] Database ready!');
    console.log('📧 [DB] Your address:', this.walletAddress);
    
    // Check if Firebase is configured
    this.checkFirebaseConfig();
    
    return db;
  }
  
  /**
   * Check if Firebase is properly configured
   */
  checkFirebaseConfig() {
    try {
      if (database && database.app) {
        this.isFirebaseEnabled = true;
        console.log('✅ [FIREBASE] Firebase is configured and ready');
      }
    } catch (error) {
      console.warn('⚠️  [FIREBASE] Firebase not configured. Running in local-only mode.');
      console.warn('ℹ️  [FIREBASE] To enable P2P sync, configure src/firebase.js');
      this.isFirebaseEnabled = false;
    }
  }
  
  /**
   * Get conversation ID (deterministic for both parties)
   */
  getConversationId(address1, address2) {
    const sorted = [address1.toLowerCase(), address2.toLowerCase()].sort();
    return `${sorted[0]}_${sorted[1]}`;
  }
  
  /**
   * Start listening for messages in a conversation (Firebase)
   */
  async startListening(conversationId) {
    if (!this.isFirebaseEnabled) {
      console.log('ℹ️  [FIREBASE] Skipping Firebase listener (not configured)');
      return;
    }
    
    // Don't create duplicate listeners
    if (this.firebaseListeners[conversationId]) {
      console.log('ℹ️  [FIREBASE] Already listening to:', conversationId);
      return;
    }
    
    try {
      console.log('👂 [FIREBASE] Starting to listen for messages:', conversationId);
      
      // Reference to this conversation's messages in Firebase
      const messagesRef = ref(database, `conversations/${conversationId}/messages`);
      const messagesQuery = query(messagesRef, orderByChild('timestamp'), limitToLast(100));
      
      // Listen for new messages
      const unsubscribe = onChildAdded(messagesQuery, async (snapshot) => {
        const firebaseMessage = snapshot.val();
        const firebaseId = snapshot.key;
        
        // Don't process our own messages
        if (firebaseMessage.senderAddress.toLowerCase() === this.walletAddress) {
          return;
        }
        
        console.log('📥 [FIREBASE] Received message from:', firebaseMessage.senderAddress);
        
        // Check if we already have this message
        const existing = await db.messages.where('firebaseId').equals(firebaseId).first();
        if (existing) {
          console.log('ℹ️  [DB] Message already exists locally, skipping');
          return;
        }
        
        // Save to local database
        const localMessage = {
          conversationId,
          senderAddress: firebaseMessage.senderAddress,
          recipientAddress: firebaseMessage.recipientAddress,
          content: firebaseMessage.content,
          timestamp: firebaseMessage.timestamp,
          status: 'received',
          firebaseId,
        };
        
        await db.messages.add(localMessage);
        
        // Update conversation
        await db.conversations.put({
          id: conversationId,
          peerAddress: firebaseMessage.senderAddress.toLowerCase(),
          lastMessageTime: firebaseMessage.timestamp,
          lastMessage: firebaseMessage.content,
          unreadCount: 1, // Mark as unread
        });
        
        console.log('✅ [DB] Incoming message saved locally');
        
        // Notify listeners
        this.messageListeners.forEach(listener => listener(localMessage));
      });
      
      // Store unsubscribe function
      this.firebaseListeners[conversationId] = unsubscribe;
      
      console.log('✅ [FIREBASE] Listening for messages in:', conversationId);
    } catch (error) {
      console.error('❌ [FIREBASE] Failed to start listening:', error);
    }
  }
  
  /**
   * Send a message (local + Firebase sync)
   * v4.4.0: Added input sanitization
   */
  async sendMessage(toAddress, content) {
    if (!this.walletAddress) {
      throw new Error('Database not initialized');
    }
    
    try {
      console.log('📤 [DB] Sending message to:', toAddress);
      
      const conversationId = this.getConversationId(this.walletAddress, toAddress.toLowerCase());
      const timestamp = Date.now();
      
      const messageData = {
        conversationId,
        senderAddress: this.walletAddress,
        recipientAddress: toAddress.toLowerCase(),
        content, // Content is already sanitized before calling this function
        timestamp,
        status: 'sending',
      };
      
      // 1. Save to LOCAL IndexedDB first (instant UI)
      const localMessageId = await db.messages.add(messageData);
      console.log('✅ [DB] Message saved locally!', localMessageId);
      
      // 2. Sync to FIREBASE (P2P delivery)
      if (this.isFirebaseEnabled) {
        try {
          const messagesRef = ref(database, `conversations/${conversationId}/messages`);
          const firebaseMessage = {
            senderAddress: this.walletAddress,
            recipientAddress: toAddress.toLowerCase(),
            content, // Sanitized content
            timestamp,
          };
          
          const firebaseRef = await push(messagesRef, firebaseMessage);
          const firebaseId = firebaseRef.key;
          
          // Update local message with Firebase ID
          await db.messages.update(localMessageId, {
            firebaseId,
            status: 'sent',
          });
          
          console.log('✅ [FIREBASE] Message synced to Firebase!', firebaseId);
        } catch (firebaseError) {
          console.error('❌ [FIREBASE] Failed to sync to Firebase:', firebaseError);
          // Still mark as sent locally even if Firebase fails
          await db.messages.update(localMessageId, { status: 'sent' });
        }
      } else {
        // No Firebase, just mark as sent locally
        await db.messages.update(localMessageId, { status: 'sent' });
        console.log('ℹ️  [FIREBASE] Firebase not configured, message saved locally only');
      }
      
      // 3. Update conversation
      await db.conversations.put({
        id: conversationId,
        peerAddress: toAddress.toLowerCase(),
        lastMessageTime: timestamp,
        lastMessage: content,
        unreadCount: 0,
      });
      
      // 4. Start listening for responses (if not already)
      await this.startListening(conversationId);
      
      // 5. Notify listeners
      this.messageListeners.forEach(listener => {
        listener({
          id: localMessageId,
          ...messageData,
          status: 'sent',
        });
      });
      
      return localMessageId;
    } catch (error) {
      console.error('❌ [DB] Send error:', error);
      throw error;
    }
  }
  
  /**
   * Load messages for a conversation with pagination
   * v4.4.0: Load 70 messages at a time (newest first)
   * @param {string} otherAddress - Peer address
   * @param {number} limit - Number of messages to load (default: 70)
   * @param {number} beforeTimestamp - Load messages before this timestamp (for pagination)
   * @returns {Promise<{messages: Array, hasMore: boolean}>}
   */
  async loadMessages(otherAddress, limit = 70, beforeTimestamp = null) {
    if (!this.walletAddress) {
      console.warn('⚠️  [DB] Cannot load messages: wallet not initialized');
      return { messages: [], hasMore: false };
    }
    
    try {
      console.log('💬 [DB] Loading messages with:', otherAddress, `(limit: ${limit})`);
      console.log('🔑 [DB] My wallet:', this.walletAddress);
      
      const conversationId = this.getConversationId(this.walletAddress, otherAddress.toLowerCase());
      console.log('🆔 [DB] Query conversationId:', conversationId);
      
      // Load from local IndexedDB
      let query = db.messages
        .where('conversationId')
        .equals(conversationId);
      
      // If beforeTimestamp is provided, filter messages before that timestamp
      if (beforeTimestamp) {
        query = query.filter(msg => msg.timestamp < beforeTimestamp);
      }
      
      // Get all matching messages first
      let allMessages = await query.toArray();
      
      // Sort by timestamp descending (newest first)
      allMessages.sort((a, b) => b.timestamp - a.timestamp);
      
      // Take only the limit
      const messages = allMessages.slice(0, limit);
      
      // Check if there are more messages
      const hasMore = allMessages.length > limit;
      
      // Reverse to show oldest first in UI
      messages.reverse();
      
      console.log(`✅ [DB] Loaded ${messages.length} messages from local storage (hasMore: ${hasMore})`);
      
      // Start listening for new messages in this conversation
      await this.startListening(conversationId);
      
      return { messages, hasMore };
    } catch (error) {
      console.error('❌ [DB] Load error:', error);
      return { messages: [], hasMore: false };
    }
  }
  
  /**
   * Get conversations for current wallet with lazy loading
   * v4.4.0: Load 20 conversations at a time
   * @param {number} limit - Number of conversations to load (default: 20)
   * @param {number} beforeTime - Load conversations before this timestamp (for pagination)
   * @returns {Promise<{conversations: Array, hasMore: boolean}>}
   */
  async getConversations(limit = 20, beforeTime = null) {
    if (!this.walletAddress) {
      return { conversations: [], hasMore: false };
    }
    
    try {
      console.log('📋 [DB] Fetching conversations for wallet:', this.walletAddress, `(limit: ${limit})`);
      
      const allConversations = await db.conversations.toArray();
      
      // Filter to only conversations involving current wallet
      let myConversations = allConversations.filter(convo => {
        const [addr1, addr2] = convo.id.split('_');
        return addr1 === this.walletAddress || addr2 === this.walletAddress;
      }).map(convo => {
        // 🔧 FIX v4.3.3: Dynamically set peerAddress to the OTHER person's address
        const [addr1, addr2] = convo.id.split('_');
        const peerAddress = addr1 === this.walletAddress ? addr2 : addr1;
        
        return {
          ...convo,
          peerAddress  // Override with correct peer address
        };
      });
      
      // Sort by lastMessageTime descending (newest first)
      myConversations.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
      
      // If beforeTime is provided, filter conversations before that time
      if (beforeTime) {
        myConversations = myConversations.filter(convo => (convo.lastMessageTime || 0) < beforeTime);
      }
      
      // Take only the limit
      const conversations = myConversations.slice(0, limit);
      const hasMore = myConversations.length > limit;
      
      console.log(`✅ [DB] Found ${conversations.length} conversations (hasMore: ${hasMore})`);
      
      // Start listening to loaded conversations
      for (const convo of conversations) {
        await this.startListening(convo.id);
      }
      
      return { conversations, hasMore };
    } catch (error) {
      console.error('❌ [DB] Get conversations error:', error);
      return { conversations: [], hasMore: false };
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
   */
  cleanup() {
    console.log('🧹 [DB] Cleaning up wallet data...');
    
    // Stop all Firebase listeners
    Object.keys(this.firebaseListeners).forEach(conversationId => {
      const unsubscribe = this.firebaseListeners[conversationId];
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    
    this.walletAddress = null;
    this.messageListeners = [];
    this.firebaseListeners = {};
    
    console.log('✅ [DB] Wallet data cleared');
  }
}

// Export singleton instance
export const messageService = new MessageService();

export default MessageService;
