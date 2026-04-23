// ============================================
// ScanDoc Combined Service Worker
// PWA Only (Monetag removed - replaced with Adsterra)
// ============================================

// ============================================
// PWA Offline Support (Workbox)
// ============================================

importScripts('https://storage.googleapis.com/workbox-cdn/releases/5.1.2/workbox-sw.js');

const CACHE_NAME = "scandoc-pwa-cache-v1";
const OFFLINE_FALLBACK_PAGE = "/offline.html";

// Files to cache for offline functionality
const STATIC_CACHE_URLS = [
  '/',
  '/offline.html',
  '/style.css',
  '/script.js',
  '/logo.png',
  '/favicon.png',
  '/manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_CACHE_URLS);
      })
      .then(() => {
        console.log('[SW] Skip waiting');
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== 'workbox-precache-v2') {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Claiming clients');
      return self.clients.claim();
    })
  );
});

// Enable navigation preload if supported
if (workbox.navigationPreload && workbox.navigationPreload.isSupported()) {
  workbox.navigationPreload.enable();
}

// Helper function to get offline fallback
async function getOfflineFallback() {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(OFFLINE_FALLBACK_PAGE);
  if (cachedResponse) {
    return cachedResponse;
  }
  return new Response(
    '<!DOCTYPE html><html><head><title>Offline</title><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:sans-serif;text-align:center;padding:2rem;background:#f7f9f4}</style></head><body><h1>🔌 You are offline</h1><p>Please check your internet connection and try again.</p><button onclick="location.reload()">Retry</button></body></html>',
    { headers: { 'Content-Type': 'text/html' } }
  );
}

// Fetch event - network first with offline fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || 
      event.request.url.startsWith('chrome-extension')) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const preloadResponse = await event.preloadResponse;
          if (preloadResponse) {
            return preloadResponse;
          }
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          console.log('[SW] Network failed, serving offline fallback');
          return getOfflineFallback();
        }
      })()
    );
    return;
  }

  if (event.request.destination === 'style' ||
      event.request.destination === 'script' ||
      event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const cache = caches.open(CACHE_NAME);
            cache.then(c => c.put(event.request, networkResponse.clone()));
          }
          return networkResponse;
        }).catch(() => {
          if (event.request.destination === 'image') {
            return new Response(null, { status: 204 });
          }
          return getOfflineFallback();
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => {
      if (event.request.destination === 'document') {
        return getOfflineFallback();
      }
      return new Response(null, { status: 204 });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'REFRESH_CACHE') {
    caches.open(CACHE_NAME).then((cache) => {
      STATIC_CACHE_URLS.forEach((url) => {
        fetch(url).then((response) => {
          if (response && response.status === 200) {
            cache.put(url, response);
          }
        });
      });
    });
  }
});

console.log('[SW] Service Worker initialized successfully (Adsterra integration - no Monetag)');
