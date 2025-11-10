// service-worker.js - Offline Support & Background Sync
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Precache static assets
precacheAndRoute(self.__WB_MANIFEST);

// ============ CACHING STRATEGIES ============

// Cache IPFS media with long expiration
registerRoute(
  ({ url }) => url.hostname.includes('ipfs') || url.hostname.includes('cloudflare-ipfs'),
  new CacheFirst({
    cacheName: 'ipfs-media-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 500,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        purgeOnQuotaError: true
      })
    ]
  })
);

// Cache API responses with stale-while-revalidate
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new StaleWhileRevalidate({
    cacheName: 'api-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 5 * 60 // 5 minutes
      })
    ]
  })
);

// Cache images with cache-first strategy
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'image-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 7 * 24 * 60 * 60 // 7 days
      })
    ]
  })
);

// Network first for HTML (always try fresh content)
registerRoute(
  ({ request }) => request.destination === 'document',
  new NetworkFirst({
    cacheName: 'html-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10
      })
    ]
  })
);

// ============ BACKGROUND SYNC ============

// Register background sync for pending messages
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncPendingMessages());
  }
});

async function syncPendingMessages() {
  try {
    console.log('[SW] Background sync: sending pending messages');
    
    // Open IndexedDB
    const db = await openDatabase();
    const tx = db.transaction('pendingMessages', 'readonly');
    const store = tx.objectStore('pendingMessages');
    const pendingMessages = await store.getAll();

    // Notify main thread to process pending messages
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_PENDING_MESSAGES',
        count: pendingMessages.length
      });
    });

    return true;
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
    return false;
  }
}

// ============ PUSH NOTIFICATIONS ============

self.addEventListener('push', (event) => {
  const data = event.data.json();
  
  const options = {
    body: data.body || 'New message received',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: data.tag || 'message',
    data: data.data || {},
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'close', title: 'Close' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'New Message', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow(event.notification.data.url || '/')
    );
  }
});

// ============ MESSAGE HANDLING ============

self.addEventListener('message', (event) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CACHE_MEDIA':
      event.waitUntil(cacheMediaFiles(payload.urls));
      break;
      
    case 'CLEAR_CACHE':
      event.waitUntil(clearAllCaches());
      break;
      
    default:
      console.log('[SW] Unknown message type:', type);
  }
});

// ============ UTILITIES ============

async function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('TelegramKillerDB', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function cacheMediaFiles(urls) {
  const cache = await caches.open('ipfs-media-cache');
  await Promise.all(
    urls.map(url => cache.add(url).catch(err => console.error('Cache failed:', url, err)))
  );
  console.log(`[SW] Cached ${urls.length} media files`);
}

async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.map(name => caches.delete(name))
  );
  console.log('[SW] All caches cleared');
}

// ============ INSTALL & ACTIVATE ============

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    clients.claim().then(() => {
      console.log('[SW] Service worker activated');
    })
  );
});

// ============ OFFLINE FALLBACK ============

const OFFLINE_VERSION = 1;
const OFFLINE_URL = '/offline.html';

self.addEventListener('fetch', (event) => {
  // Only handle HTTP(S) requests
  if (!event.request.url.startsWith('http')) {
    return;
  }

  // Special handling for navigation requests
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(OFFLINE_URL);
      })
    );
  }
});

console.log('[SW] Service worker loaded successfully ✅');
