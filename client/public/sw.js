const CACHE_NAME = 'unpuzzle-life-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192x192.png',
  './icon-512x512.png',
];

// Install — cache static shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network-first for API, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls: always network
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Static assets: cache-first, fallback to network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// Push notification handler
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.notification?.body || '',
    icon: './icon-192x192.png',
    badge: './icon-192x192.png',
    tag: data.notification?.tag || 'default',
    requireInteraction: data.notification?.requireInteraction || false,
    data: data.data || {},
  };

  event.waitUntil(
    self.registration.showNotification(data.notification?.title || 'UnPuzzle Life', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data;
  const url = data.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a client is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url === new URL(url, self.location.origin).href && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
