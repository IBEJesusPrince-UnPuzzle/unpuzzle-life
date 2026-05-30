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
      if (cached) {
        return cached;
      }
      // Try network fetch with error handling
      return fetch(event.request).then((response) => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch((error) => {
        // Network fetch failed - return a basic error response
        console.error('Fetch failed:', error);
        return new Response('Network error', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});

// Push notification handler
self.addEventListener('push', (event) => {
  console.log('[SW] Push event received');

  if (!event.data) {
    console.error('[SW] Push event has no data');
    return;
  }

  const data = event.data.json();
  console.log('[SW] Push data:', data);

  const customData = data.data || {};

  // Parse custom fields from data payload
  const iconUrl = customData.iconUrl || './icon-192x192.png';
  const imageUrl = customData.imageUrl || '';
  let actions = [];

  // Parse actions if provided
  if (customData.actions) {
    try {
      actions = JSON.parse(customData.actions);
    } catch (e) {
      console.error('[SW] Failed to parse notification actions:', e);
    }
  }

  const title = data.notification?.title || 'UnPuzzle Life';
  const body = data.notification?.body || 'You have a new notification';

  const options = {
    body: body,
    icon: iconUrl,
    badge: './icon-192x192.png',
    image: imageUrl || undefined,
    tag: data.notification?.tag || 'default',
    requireInteraction: data.notification?.requireInteraction || false,
    data: {
      ...customData,
      url: customData.url || '/',
    },
    actions: actions.length > 0 ? actions : undefined,
  };

  console.log('[SW] Showing notification:', { title, body, options });

  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => {
        console.log('[SW] Notification shown successfully');
      })
      .catch((error) => {
        console.error('[SW] Failed to show notification:', error);
      })
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data;
  const url = data.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a client is already open, focus it and navigate to the target URL
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus().then(() => client.navigate(url));
        }
      }
      // Otherwise, open a new window to the target URL
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
