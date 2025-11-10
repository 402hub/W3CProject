// messaging.js - Core Messaging Engine (Faster than Telegram!)
import { Client } from '@xmtp/xmtp-js';
import { db } from './db';
import { mediaHandler } from './media';

/**
 * MessagingEngine - Handles all message operations with speed optimizations
 */
export class MessagingEngine {
  constructor() {
    this.client = null;
    this.conversations = new Map();
    this.messageStreams = new Map();
    this.isOnline = navigator.onLine;
    this.syncQueue = [];
    this.listeners = new Set();
    
    // Performance metrics
    this.metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      averageSendTime: 0,
      cacheHitRate: 0
    };

    // Setup online/offline listeners
    this.setupNetworkListeners();
  }

  // ============ CLIENT INITIALIZATION ============

  /**
   * Initialize XMTP client with wallet signer
   * @param {Object} signer - Ethers signer from wallet
   * @param {Object} options - Client options
   */
  async initialize(signer, options = {}) {
    try {
      const startTime = performance.now();
      
      // Create XMTP client with optimizations
      this.client = await Client.create(signer, {
        env: options.env || 'dev', // 'production' for mainnet
        persistConversations: true,
        ...options
      });

      const initTime = performance.now() - startTime;
      console.log(`✅ XMTP Client initialized in ${initTime.toFixed(2)}ms`);

      // Start listening for new messages
      await this.startMessageStream();

      // Sync conversations from cache
      await this.syncConversationsFromCache();

      // Process any pending offline messages
      await this.processPendingMessages();

      return this.client;

    } catch (error) {
      console.error('Failed to initialize messaging:', error);
      throw error;
    }
  }

  // ============ MESSAGE OPERATIONS ============

  /**
   * Send message with optimistic update (INSTANT UI feedback)
   * @param {string} conversationId - Target conversation
   * @param {string} content - Message content
   * @param {Object} options - Additional options (media, etc)
   */
  async sendMessage(conversationId, content, options = {}) {
    const startTime = performance.now();
    
    // Generate temporary message ID for optimistic update
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const optimisticMessage = {
      id: tempId,
      conversationId,
      content,
      senderAddress: this.client.address,
      timestamp: Date.now(),
      status: 'sending',
      localOnly: true,
      ...options
    };

    try {
      // 1. INSTANT: Save to local DB (optimistic update)
      await db.saveMessage(optimisticMessage);
      
      // 2. INSTANT: Notify UI listeners
      this.notifyListeners('message', optimisticMessage);

      // 3. BACKGROUND: Send to XMTP (if online)
      if (this.isOnline) {
        const conversation = await this.getOrCreateConversation(conversationId);
        
        // Handle media attachment
        let messageContent = content;
        if (options.media) {
          const mediaResult = await mediaHandler.uploadFile(options.media);
          messageContent = JSON.stringify({
            text: content,
            media: {
              hash: mediaResult.ipfsHash,
              thumbnail: mediaResult.thumbnailHash,
              fileName: mediaResult.fileName,
              fileType: mediaResult.fileType,
              fileSize: mediaResult.fileSize,
              data: mediaResult.data
            }
          });
        }

        const sentMessage = await conversation.send(messageContent);
        
        // Update message status in DB
        await this.updateMessageStatus(tempId, {
          id: sentMessage.id,
          status: 'sent',
          localOnly: false,
          xmtpId: sentMessage.id
        });

        const sendTime = performance.now() - startTime;
        this.metrics.messagesSent++;
        this.metrics.averageSendTime = 
          (this.metrics.averageSendTime * (this.metrics.messagesSent - 1) + sendTime) / this.metrics.messagesSent;

        console.log(`✅ Message sent in ${sendTime.toFixed(2)}ms (UI updated instantly)`);

        return sentMessage;

      } else {
        // OFFLINE: Add to pending queue
        await db.addPendingMessage(optimisticMessage);
        console.log('📤 Message queued for offline sending');
        
        return optimisticMessage;
      }

    } catch (error) {
      console.error('Send message error:', error);
      
      // Update message status to failed
      await this.updateMessageStatus(tempId, {
        status: 'failed',
        error: error.message
      });

      // Add to retry queue if offline
      if (!this.isOnline) {
        await db.addPendingMessage(optimisticMessage);
      }

      throw error;
    }
  }

  /**
   * Load conversation messages (LOCAL FIRST for speed)
   * @param {string} conversationId 
   * @param {number} limit 
   */
  async loadMessages(conversationId, limit = 50) {
    const startTime = performance.now();
    
    try {
      // 1. INSTANT: Load from local cache
      const cachedMessages = await db.getMessages(conversationId, limit);
      
      if (cachedMessages.length > 0) {
        const cacheTime = performance.now() - startTime;
        console.log(`✅ Loaded ${cachedMessages.length} messages from cache in ${cacheTime.toFixed(2)}ms`);
        this.metrics.cacheHitRate++;
        
        // Return cached messages immediately
        return cachedMessages;
      }

      // 2. BACKGROUND: Fetch from XMTP if cache miss
      if (this.isOnline && this.client) {
        const conversation = await this.getConversation(conversationId);
        if (conversation) {
          const messages = await conversation.messages({ limit });
          
          // Save to cache for next time
          const messagesToCache = messages.map(msg => this.formatXMTPMessage(msg, conversationId));
          await db.bulkSaveMessages(messagesToCache);
          
          const totalTime = performance.now() - startTime;
          console.log(`✅ Loaded ${messages.length} messages from XMTP in ${totalTime.toFixed(2)}ms`);
          
          return messagesToCache;
        }
      }

      return [];

    } catch (error) {
      console.error('Load messages error:', error);
      // Return cached messages even on error
      return await db.getMessages(conversationId, limit);
    }
  }

  /**
   * Start real-time message stream
   */
  async startMessageStream() {
    if (!this.client) return;

    try {
      // Stream all messages from all conversations
      const stream = await this.client.conversations.streamAllMessages();

      // Process incoming messages
      for await (const message of stream) {
        this.handleIncomingMessage(message);
      }

    } catch (error) {
      console.error('Message stream error:', error);
      // Retry after delay
      setTimeout(() => this.startMessageStream(), 5000);
    }
  }

  /**
   * Handle incoming message from stream
   */
  async handleIncomingMessage(xmtpMessage) {
    try {
      const conversationId = xmtpMessage.conversation.peerAddress;
      
      const message = this.formatXMTPMessage(xmtpMessage, conversationId);
      
      // Save to local DB
      await db.saveMessage(message);
      
      // Notify UI listeners
      this.notifyListeners('message', message);
      
      // Pre-load media if present
      if (message.media) {
        mediaHandler.downloadFile(message.media.ipfsHash).catch(() => {});
      }

      this.metrics.messagesReceived++;
      console.log('✅ New message received:', message.content.substring(0, 50));

    } catch (error) {
      console.error('Handle incoming message error:', error);
    }
  }

  // ============ CONVERSATION MANAGEMENT ============

  /**
   * Get or create conversation
   */
  async getOrCreateConversation(peerAddress) {
    if (this.conversations.has(peerAddress)) {
      return this.conversations.get(peerAddress);
    }

    const conversation = await this.client.conversations.newConversation(peerAddress);
    this.conversations.set(peerAddress, conversation);
    
    // Save to DB
    await db.conversations.put({
      id: peerAddress,
      peerAddress,
      lastMessageTime: Date.now(),
      lastMessage: '',
      unreadCount: 0
    });

    return conversation;
  }

  /**
   * Get existing conversation
   */
  async getConversation(peerAddress) {
    if (this.conversations.has(peerAddress)) {
      return this.conversations.get(peerAddress);
    }

    const convos = await this.client.conversations.list();
    const conversation = convos.find(c => c.peerAddress === peerAddress);
    
    if (conversation) {
      this.conversations.set(peerAddress, conversation);
    }

    return conversation;
  }

  /**
   * List all conversations
   */
  async listConversations() {
    try {
      // Try cache first
      const cached = await db.getRecentConversations();
      
      if (cached.length > 0) {
        return cached;
      }

      // Fetch from XMTP
      if (this.client && this.isOnline) {
        const conversations = await this.client.conversations.list();
        
        // Cache them
        const formatted = conversations.map(c => ({
          id: c.peerAddress,
          peerAddress: c.peerAddress,
          lastMessageTime: c.updatedAt || Date.now(),
          lastMessage: '',
          unreadCount: 0
        }));

        await Promise.all(
          formatted.map(c => db.conversations.put(c))
        );

        return formatted;
      }

      return cached;

    } catch (error) {
      console.error('List conversations error:', error);
      return await db.getRecentConversations();
    }
  }

  // ============ OFFLINE SUPPORT ============

  /**
   * Process pending messages when back online
   */
  async processPendingMessages() {
    if (!this.isOnline || !this.client) return;

    const pending = await db.getPendingMessages();
    console.log(`📤 Processing ${pending.length} pending messages...`);

    for (const msg of pending) {
      try {
        await this.sendMessage(msg.conversationId, msg.content, {
          ...msg,
          retry: true
        });
        
        await db.removePendingMessage(msg.id);
        console.log('✅ Pending message sent:', msg.id);

      } catch (error) {
        console.error('Failed to send pending message:', error);
        await db.incrementRetry(msg.id);
        
        // Remove if too many retries
        if (msg.retryCount >= 5) {
          await db.removePendingMessage(msg.id);
          console.log('❌ Pending message removed after 5 retries');
        }
      }
    }
  }

  /**
   * Sync conversations from cache
   */
  async syncConversationsFromCache() {
    const cached = await db.getRecentConversations();
    console.log(`✅ Synced ${cached.length} conversations from cache`);
    return cached;
  }

  // ============ NETWORK LISTENERS ============

  setupNetworkListeners() {
    window.addEventListener('online', () => {
      console.log('🌐 Back online!');
      this.isOnline = true;
      this.processPendingMessages();
      this.notifyListeners('online', true);
    });

    window.addEventListener('offline', () => {
      console.log('📴 Gone offline');
      this.isOnline = false;
      this.notifyListeners('offline', true);
    });
  }

  // ============ EVENT LISTENERS ============

  /**
   * Subscribe to messaging events
   * @param {Function} callback - Listener callback
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners
   */
  notifyListeners(event, data) {
    this.listeners.forEach(callback => {
      try {
        callback({ event, data });
      } catch (error) {
        console.error('Listener error:', error);
      }
    });
  }

  // ============ UTILITIES ============

  formatXMTPMessage(xmtpMessage, conversationId) {
    let content = xmtpMessage.content;
    let media = null;

    // Parse media if present
    try {
      const parsed = JSON.parse(content);
      if (parsed.media) {
        media = parsed.media;
        content = parsed.text || '';
      }
    } catch {
      // Not JSON, just text
    }

    return {
      id: xmtpMessage.id,
      conversationId,
      content,
      media,
      senderAddress: xmtpMessage.senderAddress,
      timestamp: xmtpMessage.sent?.getTime() || Date.now(),
      status: 'received',
      xmtpId: xmtpMessage.id
    };
  }

  async updateMessageStatus(tempId, updates) {
    const messages = await db.messages.where('id').equals(tempId).toArray();
    if (messages.length > 0) {
      await db.messages.update(messages[0].id, updates);
      this.notifyListeners('messageUpdate', { tempId, ...updates });
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      isOnline: this.isOnline,
      conversationsCount: this.conversations.size
    };
  }

  /**
   * Cleanup
   */
  async cleanup() {
    this.listeners.clear();
    this.conversations.clear();
    this.messageStreams.clear();
  }
}

// Singleton instance
export const messagingEngine = new MessagingEngine();
