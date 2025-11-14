/**
 * Hybrid Database + Security Service - v4.4
 * Adds pagination, caching, rate limiting, and signature verification.
 */

import Dexie from 'dexie';
import { database } from '../firebase';
import {
  ref,
  push,
  onChildAdded,
  query,
  orderByChild,
  limitToLast,
  update,
  serverTimestamp,
} from 'firebase/database';
import {
  enforceMessagePolicies,
  sanitizeWalletAddressInput,
  sanitizeMessageContent,
  buildMessagePayload,
  verifyMessageSignature,
  RATE_LIMIT_MAX_PER_MINUTE,
  isValidWalletAddress,
} from '../security';

const MESSAGE_PAGE_SIZE = 70;
const CONVERSATION_PAGE_SIZE = 20;

class LocalDatabase extends Dexie {
  constructor() {
    super('TelegramKillerDB');

    this.version(1).stores({
      messages: '++id, conversationId, senderAddress, timestamp, content, firebaseId',
      conversations: 'id, peerAddress, lastMessageTime, unreadCount',
    });

    this.version(2)
      .stores({
        messages: '++id, conversationId, senderAddress, recipientAddress, timestamp, firebaseId, [conversationId+timestamp]',
        conversations: 'id, peerAddress, lastMessageTime, unreadCount, [lastMessageTime]',
      })
      .upgrade(() => {});

    this.messages = this.table('messages');
    this.conversations = this.table('conversations');
  }
}

const db = new LocalDatabase();

class MessageService {
  constructor() {
    this.resetState();
  }

  resetState() {
    this.walletAddress = null;
    this.messageListeners = [];
    this.firebaseListeners = {};
    this.isFirebaseEnabled = false;
    this.messageCache = new Map();
    this.rateLimitQueue = [];
  }

  initialize(walletAddress) {
    console.log('💾 [DB] Initializing local database...');
    this.walletAddress = sanitizeWalletAddressInput(walletAddress);
    this.messageCache.clear();
    this.rateLimitQueue = [];
    console.log('✅ [DB] Database ready for', this.walletAddress);
    this.checkFirebaseConfig();
    return db;
  }

  checkFirebaseConfig() {
    try {
      if (database && database.app) {
        this.isFirebaseEnabled = true;
        console.log('✅ [FIREBASE] Firebase configured');
      }
    } catch (error) {
      console.warn('⚠️  [FIREBASE] Firebase not configured. Local-only mode.');
      this.isFirebaseEnabled = false;
    }
  }

  getConversationId(address1, address2) {
    const sorted = [address1.toLowerCase(), address2.toLowerCase()].sort();
    return `${sorted[0]}_${sorted[1]}`;
  }

  prepareMessagePayload(toAddress, rawContent, timestamp = Date.now()) {
    if (!this.walletAddress) {
      throw new Error('Database not initialized');
    }
    const recipientAddress = sanitizeWalletAddressInput(toAddress);
    if (!isValidWalletAddress(recipientAddress)) {
      throw new Error('Enter a valid wallet address');
    }
    const content = enforceMessagePolicies(rawContent);
    const conversationId = this.getConversationId(this.walletAddress, recipientAddress);
    const payload = buildMessagePayload({
      sender: this.walletAddress,
      recipient: recipientAddress,
      content,
      timestamp,
    });
    return {
      conversationId,
      recipientAddress,
      content,
      timestamp,
      payload,
    };
  }

  enforceRateLimit() {
    const now = Date.now();
    const windowStart = now - 60 * 1000;
    this.rateLimitQueue = this.rateLimitQueue.filter((ts) => ts > windowStart);
    if (this.rateLimitQueue.length >= RATE_LIMIT_MAX_PER_MINUTE) {
      const retryAfter = Math.ceil((this.rateLimitQueue[0] - windowStart) / 1000);
      throw new Error(`Rate limit hit. Try again in ${retryAfter}s.`);
    }
    this.rateLimitQueue.push(now);
  }

  async ensureConversationMetadata({ conversationId, recipientAddress, content, timestamp }) {
    if (!this.isFirebaseEnabled) return;
    try {
      const updates = {
        [`conversations/${conversationId}/participants/${this.walletAddress}`]: true,
        [`conversations/${conversationId}/participants/${recipientAddress}`]: true,
        [`conversations/${conversationId}/meta/lastMessageTime`]: timestamp,
        [`conversations/${conversationId}/meta/lastMessagePreview`]: content.slice(0, 140),
        [`conversations/${conversationId}/meta/lastSender`]: this.walletAddress,
        [`conversations/${conversationId}/meta/updatedAt`]: serverTimestamp(),
      };
      await update(ref(database), updates);
    } catch (error) {
      console.warn('⚠️  [FIREBASE] Failed to update conversation metadata', error);
    }
  }

  async startListening(conversationId) {
    if (!this.isFirebaseEnabled || !conversationId) {
      return;
    }
    if (this.firebaseListeners[conversationId]) {
      return;
    }

    try {
      const messagesRef = ref(database, `conversations/${conversationId}/messages`);
      const messagesQuery = query(messagesRef, orderByChild('timestamp'), limitToLast(MESSAGE_PAGE_SIZE));

      const unsubscribe = onChildAdded(messagesQuery, async (snapshot) => {
        const firebaseMessage = snapshot.val();
        const firebaseId = snapshot.key;

        if (!firebaseMessage) {
          return;
        }

        const senderAddress = sanitizeWalletAddressInput(firebaseMessage.senderAddress || '');
        if (!isValidWalletAddress(senderAddress)) {
          return;
        }
        if (senderAddress === this.walletAddress) {
          return;
        }

        const existing = await db.messages.where('firebaseId').equals(firebaseId).first();
        if (existing) {
          return;
        }

        const recipientAddress = sanitizeWalletAddressInput(firebaseMessage.recipientAddress || '');
        const sanitizedContent = sanitizeMessageContent(firebaseMessage.content || '');
        const timestamp = firebaseMessage.timestamp || Date.now();
        const payload = buildMessagePayload({
          sender: senderAddress,
          recipient: recipientAddress,
          content: sanitizedContent,
          timestamp,
        });

        const isValidSignature = await verifyMessageSignature({
          payload,
          signature: firebaseMessage.signature,
          expectedAddress: senderAddress,
        });

        if (!isValidSignature) {
          console.warn('⚠️  [SECURITY] Dropping unsigned/invalid message from Firebase');
          return;
        }

        const localMessage = {
          conversationId,
          senderAddress,
          recipientAddress,
          content: sanitizedContent,
          timestamp,
          status: 'received',
          firebaseId,
        };

        const newId = await db.messages.add(localMessage);
        const existingConversation = await db.conversations.get(conversationId);
        await db.conversations.put({
          id: conversationId,
          peerAddress: senderAddress,
          lastMessageTime: timestamp,
          lastMessage: sanitizedContent,
          unreadCount: (existingConversation?.unreadCount || 0) + 1,
        });

        this.invalidateMessageCache(conversationId);
        this.messageListeners.forEach((listener) => listener({ id: newId, ...localMessage }));
      });

      this.firebaseListeners[conversationId] = unsubscribe;
    } catch (error) {
      console.error('❌ [FIREBASE] Listener failed', error);
    }
  }

  invalidateMessageCache(conversationId) {
    if (!conversationId) return;
    this.messageCache.delete(conversationId);
  }

  cacheMessages(conversationId, cacheKey, payload) {
    if (!conversationId) return;
    if (!this.messageCache.has(conversationId)) {
      this.messageCache.set(conversationId, { pages: new Map() });
    }
    this.messageCache.get(conversationId).pages.set(cacheKey, payload);
  }

  getCachedMessages(conversationId, cacheKey) {
    const convoCache = this.messageCache.get(conversationId);
    if (!convoCache) return null;
    return convoCache.pages.get(cacheKey) || null;
  }

  getMessageCacheKey(beforeTimestamp) {
    return beforeTimestamp ? `before:${beforeTimestamp}` : 'latest';
  }

  async loadMessagesPage(peerAddress, { limit = MESSAGE_PAGE_SIZE, beforeTimestamp } = {}) {
    if (!this.walletAddress) {
      console.warn('⚠️  [DB] Cannot load messages: wallet not initialized');
      return { messages: [], hasMore: false, cursor: null };
    }

    const sanitizedPeer = sanitizeWalletAddressInput(peerAddress);
    const conversationId = this.getConversationId(this.walletAddress, sanitizedPeer);
    const cacheKey = this.getMessageCacheKey(beforeTimestamp);
    const cached = this.getCachedMessages(conversationId, cacheKey);
    if (cached) {
      return cached;
    }

    try {
      let collection = db.messages
        .where('[conversationId+timestamp]')
        .between([conversationId, Dexie.minKey], [conversationId, Dexie.maxKey])
        .reverse();

      if (beforeTimestamp) {
        collection = collection.filter((message) => message.timestamp < beforeTimestamp);
      }

      const page = await collection.limit(limit).toArray();
      const ordered = [...page].reverse();
      const hasMore = page.length === limit;
      const nextCursor = hasMore && ordered.length > 0 ? ordered[0].timestamp : null;
      const payload = {
        conversationId,
        peerAddress: sanitizedPeer,
        messages: ordered,
        hasMore,
        cursor: nextCursor,
      };

      this.cacheMessages(conversationId, cacheKey, payload);
      await this.startListening(conversationId);
      return payload;
    } catch (error) {
      console.error('❌ [DB] Failed to load paginated messages', error);
      return { messages: [], hasMore: false, cursor: null };
    }
  }

  async loadMessages(peerAddress, options) {
    const payload = await this.loadMessagesPage(peerAddress, options);
    return payload.messages;
  }

  async getConversationsPage({ limit = CONVERSATION_PAGE_SIZE, cursor } = {}) {
    if (!this.walletAddress) {
      return { items: [], hasMore: false, cursor: null };
    }

    try {
      let collection = db.conversations.orderBy('lastMessageTime').reverse();
      if (cursor) {
        collection = collection.filter(
          (conversation) => (conversation.lastMessageTime || 0) < cursor,
        );
      }

      const page = await collection.limit(limit).toArray();
      const normalized = page
        .filter((conversation) => {
          if (!conversation?.id) return false;
          const [addr1, addr2] = conversation.id.split('_');
          return addr1 === this.walletAddress || addr2 === this.walletAddress;
        })
        .map((conversation) => {
          const [addr1, addr2] = conversation.id.split('_');
          const peerAddress = addr1 === this.walletAddress ? addr2 : addr1;
          return {
            ...conversation,
            peerAddress,
          };
        });

      const hasMore = page.length === limit;
      const nextCursor =
        hasMore && normalized.length > 0
          ? normalized[normalized.length - 1].lastMessageTime
          : null;

      for (const convo of normalized) {
        await this.startListening(convo.id);
      }

      return {
        items: normalized,
        hasMore,
        cursor: nextCursor,
      };
    } catch (error) {
      console.error('❌ [DB] Failed to load conversations', error);
      return { items: [], hasMore: false, cursor: null };
    }
  }

  async getConversations() {
    const { items } = await this.getConversationsPage({ limit: 500 });
    return items;
  }

  async sendMessage(preparedMessage, signature) {
    if (!this.walletAddress) {
      throw new Error('Database not initialized');
    }
    if (!preparedMessage || !signature) {
      throw new Error('Message payload or signature missing');
    }

    this.enforceRateLimit();

    const { recipientAddress, content, timestamp, conversationId } = preparedMessage;

    const messageData = {
      conversationId,
      senderAddress: this.walletAddress,
      recipientAddress,
      content,
      timestamp,
      status: 'sending',
      signature,
    };

    const localMessageId = await db.messages.add(messageData);

    if (this.isFirebaseEnabled) {
      try {
        const messagesRef = ref(database, `conversations/${conversationId}/messages`);
        const firebaseMessage = {
          senderAddress: this.walletAddress,
          recipientAddress,
          content,
          timestamp,
          signature,
          version: '4.4.0',
        };
        const firebaseRef = await push(messagesRef, firebaseMessage);
        const firebaseId = firebaseRef.key;
        await db.messages.update(localMessageId, { firebaseId, status: 'sent' });
        await this.ensureConversationMetadata({ conversationId, recipientAddress, content, timestamp });
      } catch (error) {
        console.error('❌ [FIREBASE] Failed to sync message', error);
        await db.messages.update(localMessageId, { status: 'sent' });
      }
    } else {
      await db.messages.update(localMessageId, { status: 'sent' });
    }

    await db.conversations.put({
      id: conversationId,
      peerAddress: recipientAddress,
      lastMessageTime: timestamp,
      lastMessage: content,
      unreadCount: 0,
    });

    await this.startListening(conversationId);
    this.invalidateMessageCache(conversationId);

    this.messageListeners.forEach((listener) =>
      listener({
        id: localMessageId,
        ...messageData,
        status: 'sent',
      }),
    );

    return localMessageId;
  }

  async markAsRead(conversationId) {
    try {
      const conversation = await db.conversations.get(conversationId);
      if (conversation) {
        await db.conversations.update(conversationId, { unreadCount: 0 });
      }
    } catch (error) {
      console.error('❌ [DB] Mark as read error:', error);
    }
  }

  onMessage(callback) {
    this.messageListeners.push(callback);
    return () => {
      const index = this.messageListeners.indexOf(callback);
      if (index > -1) {
        this.messageListeners.splice(index, 1);
      }
    };
  }

  getAddress() {
    return this.walletAddress;
  }

  isReady() {
    return this.walletAddress !== null;
  }

  cleanup() {
    console.log('🧹 [DB] Cleaning up wallet data...');
    Object.keys(this.firebaseListeners).forEach((conversationId) => {
      const unsubscribe = this.firebaseListeners[conversationId];
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this.resetState();
    console.log('✅ [DB] Wallet data cleared');
  }
}

export const messageService = new MessageService();

export default MessageService;
