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
import { database, isFirebaseConfigured } from '../firebase';
import { ensureWalletAuth, signOutWalletAuth, isAuthReady } from './auth';
import { ref, push, onChildAdded, query, orderByChild, limitToLast, update } from 'firebase/database';
import { sanitizeMessage, isMessageValid, getRateLimitBucket } from '../utils';

const MESSAGE_PAGE_SIZE = 70;
const CONVERSATION_PAGE_SIZE = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_MESSAGES = 60;

class LocalDatabase extends Dexie {
  constructor() {
    super('TelegramKillerDB');

    this.version(1).stores({
      messages: '++id, conversationId, senderAddress, timestamp, content, firebaseId',
      conversations: 'id, peerAddress, lastMessageTime, unreadCount',
    });

    this.version(2).stores({
      messages: '++id, conversationId, senderAddress, timestamp, content, firebaseId, [conversationId+timestamp], rateLimitBucket',
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
    this.firebaseListeners = {};
    this.isFirebaseEnabled = isFirebaseConfigured && !!database;

    this.messageState = new Map();
    this.rateLimitWindow = [];
    this.conversationState = {
      conversations: [],
      nextCursor: null,
      hasMore: true,
    };
  }

  initialize(walletAddress) {
    console.log('💾 [DB] Initializing local database...');
    this.walletAddress = walletAddress.toLowerCase();
    this.messageState.clear();
    this.conversationState = {
      conversations: [],
      nextCursor: null,
      hasMore: true,
    };
    this.rateLimitWindow = [];

    if (this.isFirebaseEnabled) {
      console.log('✅ [FIREBASE] Firebase ready for synchronization');
    } else {
      console.warn('ℹ️  [FIREBASE] Running in local-first mode (Firebase not configured)');
    }

    return db;
  }

  getConversationId(address1, address2) {
    const sorted = [address1.toLowerCase(), address2.toLowerCase()].sort();
    return `${sorted[0]}_${sorted[1]}`;
  }

  async ensureFirebaseAuth() {
    if (!this.isFirebaseEnabled) {
      return null;
    }

    if (!isAuthReady || !isAuthReady()) {
      return null;
    }

    try {
      return await ensureWalletAuth(this.walletAddress);
    } catch (error) {
      console.warn('⚠️  [FIREBASE] Wallet authentication failed:', error.message);
      return null;
    }
  }

  async startListening(conversationId) {
    if (!this.isFirebaseEnabled || !database) {
      return;
    }

    if (this.firebaseListeners[conversationId]) {
      return;
    }

    await this.ensureFirebaseAuth();

    try {
      const messagesRef = ref(database, `conversations/${conversationId}/messages`);
      const messagesQuery = query(messagesRef, orderByChild('timestamp'), limitToLast(MESSAGE_PAGE_SIZE));

      const unsubscribe = onChildAdded(messagesQuery, async (snapshot) => {
        const firebaseMessage = snapshot.val();
        const firebaseId = snapshot.key;

        if (!firebaseMessage) {
          return;
        }

        if (firebaseMessage.senderAddress?.toLowerCase() === this.walletAddress) {
          return;
        }

        const existing = await db.messages.where('firebaseId').equals(firebaseId).first();
        if (existing) {
          return;
        }

        const sanitizedContent = sanitizeMessage(firebaseMessage.content || '');
        const localMessage = {
          conversationId,
          senderAddress: firebaseMessage.senderAddress?.toLowerCase(),
          recipientAddress: firebaseMessage.recipientAddress?.toLowerCase(),
          content: sanitizedContent,
          timestamp: firebaseMessage.timestamp,
          status: 'received',
          firebaseId,
          rateLimitBucket: firebaseMessage.rateLimitBucket,
        };

        const localId = await db.messages.add(localMessage);

        await this.upsertConversation(conversationId, {
          peerAddress: localMessage.senderAddress,
          lastMessageTime: localMessage.timestamp,
          lastMessage: sanitizedContent,
          incrementUnread: true,
        });

        const messageWithId = { id: localId, ...localMessage };
        this.mergeMessageIntoState(conversationId, messageWithId);

        this.messageListeners.forEach((listener) => listener(messageWithId));
      });

      this.firebaseListeners[conversationId] = unsubscribe;
    } catch (error) {
      console.error('❌ [FIREBASE] Failed to attach listener:', error);
    }
  }

  checkRateLimit() {
    const now = Date.now();
    this.rateLimitWindow = this.rateLimitWindow.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

    if (this.rateLimitWindow.length >= RATE_LIMIT_MAX_MESSAGES) {
      throw new Error('Rate limit exceeded: maximum 60 messages per minute');
    }

    this.rateLimitWindow.push(now);
  }

  async sendMessage(toAddress, rawContent) {
    if (!this.walletAddress) {
      throw new Error('Database not initialized');
    }

    const sanitizedContent = sanitizeMessage(rawContent || '');
    if (!isMessageValid(sanitizedContent)) {
      throw new Error('Message must be between 1 and 1000 characters after sanitization');
    }

    this.checkRateLimit();

    const normalizedRecipient = toAddress.toLowerCase();
    const conversationId = this.getConversationId(this.walletAddress, normalizedRecipient);
    const timestamp = Date.now();
    const rateLimitBucket = getRateLimitBucket(timestamp);

    const messageData = {
      conversationId,
      senderAddress: this.walletAddress,
      recipientAddress: normalizedRecipient,
      content: sanitizedContent,
      timestamp,
      status: 'sending',
      rateLimitBucket,
    };

    const localMessageId = await db.messages.add(messageData);

    await this.upsertConversation(conversationId, {
      peerAddress: normalizedRecipient,
      lastMessageTime: timestamp,
      lastMessage: sanitizedContent,
      unreadCount: 0,
    });

    const messageWithId = { id: localMessageId, ...messageData };
    this.mergeMessageIntoState(conversationId, messageWithId);

    await this.startListening(conversationId);

    if (this.isFirebaseEnabled && database) {
      try {
        await this.ensureFirebaseAuth();

        const conversationRef = ref(database, `conversations/${conversationId}`);
        const messagesRef = ref(database, `conversations/${conversationId}/messages`);

        const firebaseMessage = {
          senderAddress: this.walletAddress,
          recipientAddress: normalizedRecipient,
          content: sanitizedContent,
          timestamp,
          rateLimitBucket,
        };

        const firebaseRef = await push(messagesRef, firebaseMessage);
        const firebaseId = firebaseRef.key;

        await db.messages.update(localMessageId, {
          firebaseId,
          status: 'sent',
        });

        await update(conversationRef, {
          [`participants/${this.walletAddress}`]: true,
          [`participants/${normalizedRecipient}`]: true,
          lastMessage: {
            content: sanitizedContent,
            senderAddress: this.walletAddress,
            timestamp,
          },
        });
      } catch (error) {
        console.error('❌ [FIREBASE] Failed to sync message:', error);
        await db.messages.update(localMessageId, { status: 'sent' });
      }
    } else {
      await db.messages.update(localMessageId, { status: 'sent' });
    }

    this.messageListeners.forEach((listener) =>
      listener({
        ...messageWithId,
        status: 'sent',
      }),
    );

    return localMessageId;
  }

  async fetchMessagesPage(conversationId, cursor = null, limit = MESSAGE_PAGE_SIZE) {
    let collection = db.messages
      .where('[conversationId+timestamp]')
      .between([conversationId, Dexie.minKey], [conversationId, Dexie.maxKey], true, true)
      .reverse();

    if (cursor !== null) {
      collection = db.messages
        .where('[conversationId+timestamp]')
        .between([conversationId, Dexie.minKey], [conversationId, cursor], true, false)
        .reverse();
    }

    const rows = await collection.limit(limit + 1).toArray();
    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;

    const oldest = sliced[sliced.length - 1];
    const normalized = sliced.reverse().map((row) => ({
      ...row,
      senderAddress: row.senderAddress?.toLowerCase(),
      recipientAddress: row.recipientAddress?.toLowerCase(),
    }));

    return {
      messages: normalized,
      hasMore,
      nextCursor: hasMore && oldest ? oldest.timestamp : null,
    };
  }

  getMessageState(conversationId) {
    if (!this.messageState.has(conversationId)) {
      this.messageState.set(conversationId, {
        messages: [],
        nextCursor: null,
        hasMore: true,
      });
    }
    return this.messageState.get(conversationId);
  }

  mergeMessageIntoState(conversationId, message) {
    const state = this.getMessageState(conversationId);
    const existingIndex = state.messages.findIndex((m) => m.id === message.id || m.firebaseId === message.firebaseId);

    if (existingIndex >= 0) {
      state.messages[existingIndex] = { ...state.messages[existingIndex], ...message };
    } else {
      state.messages = [...state.messages, message].sort((a, b) => a.timestamp - b.timestamp);
    }

    this.messageState.set(conversationId, state);
  }

  async loadMessages(otherAddress, options = {}) {
    if (!this.walletAddress) {
      return { messages: [], hasMore: false, nextCursor: null };
    }

    const normalizedAddress = otherAddress.toLowerCase();
    const conversationId = this.getConversationId(this.walletAddress, normalizedAddress);

    const state = this.getMessageState(conversationId);
    const cursor = options.cursor ?? state.nextCursor ?? null;

    const page = await this.fetchMessagesPage(conversationId, cursor, options.limit || MESSAGE_PAGE_SIZE);

    if (cursor) {
      const existingIds = new Set(state.messages.map((m) => m.id));
      const deduped = page.messages.filter((m) => !existingIds.has(m.id));
      state.messages = [...deduped, ...state.messages].sort((a, b) => a.timestamp - b.timestamp);
    } else {
      state.messages = page.messages;
    }

    state.nextCursor = page.nextCursor;
    state.hasMore = page.hasMore;
    this.messageState.set(conversationId, state);

    await this.startListening(conversationId);

    return {
      messages: state.messages,
      hasMore: state.hasMore,
      nextCursor: state.nextCursor,
    };
  }

  async upsertConversation(conversationId, { peerAddress, lastMessageTime, lastMessage, unreadCount, incrementUnread = false }) {
    const normalizedPeer = peerAddress?.toLowerCase();
    const existing = await db.conversations.get(conversationId);

    const nextUnread = incrementUnread
      ? (existing?.unreadCount || 0) + 1
      : unreadCount ?? existing?.unreadCount ?? 0;

    await db.conversations.put({
      id: conversationId,
      peerAddress: normalizedPeer,
      lastMessageTime,
      lastMessage,
      unreadCount: nextUnread,
    });

    const peer = normalizedPeer || this.derivePeerAddress(conversationId);
    this.refreshConversationState({
      id: conversationId,
      peerAddress: peer,
      lastMessageTime,
      lastMessage,
      unreadCount: nextUnread,
    });
  }

  derivePeerAddress(conversationId) {
    if (!this.walletAddress) return '';
    const [addr1, addr2] = conversationId.split('_');
    return addr1 === this.walletAddress ? addr2 : addr1;
  }

  refreshConversationState(conversation) {
    const existingIndex = this.conversationState.conversations.findIndex((c) => c.id === conversation.id);
    if (existingIndex >= 0) {
      this.conversationState.conversations[existingIndex] = {
        ...this.conversationState.conversations[existingIndex],
        ...conversation,
      };
    } else {
      this.conversationState.conversations.push(conversation);
    }

    this.conversationState.conversations.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
  }

  async fetchConversationsPage(cursor = null, limit = CONVERSATION_PAGE_SIZE) {
    let collection = db.conversations.orderBy('lastMessageTime').reverse();

    if (cursor !== null) {
      collection = collection.filter((convo) => (convo.lastMessageTime || 0) < cursor);
    }

    const rows = await collection.limit(limit + 1).toArray();
    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;

    const normalized = sliced
      .filter((convo) => {
        const [addr1, addr2] = convo.id.split('_');
        return addr1 === this.walletAddress || addr2 === this.walletAddress;
      })
      .map((convo) => {
        const peerAddress = this.derivePeerAddress(convo.id);
        return {
          ...convo,
          peerAddress,
        };
      });

    const last = normalized[normalized.length - 1];

    return {
      conversations: normalized,
      hasMore,
      nextCursor: hasMore && last ? last.lastMessageTime || 0 : null,
    };
  }

  async getConversations(options = {}) {
    if (!this.walletAddress) {
      return {
        conversations: [],
        hasMore: false,
        nextCursor: null,
      };
    }

    const cursor = options.cursor ?? this.conversationState.nextCursor ?? null;
    const page = await this.fetchConversationsPage(cursor, options.limit || CONVERSATION_PAGE_SIZE);

    if (cursor) {
      const existingIds = new Set(this.conversationState.conversations.map((c) => c.id));
      const deduped = page.conversations.filter((c) => !existingIds.has(c.id));
      this.conversationState.conversations = [...this.conversationState.conversations, ...deduped].sort(
        (a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0),
      );
    } else {
      this.conversationState.conversations = page.conversations.sort(
        (a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0),
      );
    }

    this.conversationState.nextCursor = page.nextCursor;
    this.conversationState.hasMore = page.hasMore;

    for (const convo of page.conversations) {
      await this.startListening(convo.id);
    }

    return {
      conversations: this.conversationState.conversations,
      hasMore: this.conversationState.hasMore,
      nextCursor: this.conversationState.nextCursor,
    };
  }

  async markAsRead(conversationId) {
    await db.conversations.update(conversationId, { unreadCount: 0 });

    const stateConversation = this.conversationState.conversations.find((c) => c.id === conversationId);
    if (stateConversation) {
      stateConversation.unreadCount = 0;
    }
  }

  onMessage(callback) {
    this.messageListeners.push(callback);
    return () => {
      this.messageListeners = this.messageListeners.filter((listener) => listener !== callback);
    };
  }

  getAddress() {
    return this.walletAddress;
  }

  isReady() {
    return this.walletAddress !== null;
  }

  async cleanup() {
    Object.values(this.firebaseListeners).forEach((unsubscribe) => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });

    this.firebaseListeners = {};
    this.messageListeners = [];
    this.messageState.clear();
    this.conversationState = {
      conversations: [],
      nextCursor: null,
      hasMore: true,
    };
    this.rateLimitWindow = [];
    this.walletAddress = null;

    await signOutWalletAuth();
  }
}

export const messageService = new MessageService();

export default MessageService;
