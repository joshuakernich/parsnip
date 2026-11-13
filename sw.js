// App files: network first so updates show immediately, cache when offline. Fonts: cache first.
const CACHE = 'parsnip-v11';
const SHELL = [
  './', 'index.html', 'style.css', 'app.js', 'icons.js', 'music.js', 'manifest.webmanifest',
  'img/icon-192.png', 'img/icon-512.png', 'img/apple-touch-icon.png', 'img/sprites.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cacheable = url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!cacheable) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const own = url.origin === location.origin;
      const cached = await cache.match(req, { ignoreSearch: own });
      if (!own && cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      } catch (err) {
        if (cached) return cached;
        throw err;
      }
    })
  );
});

// ----- Daily nudge -----
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch {}
  e.waitUntil(self.registration.showNotification(data.title || 'Parsnip?', {
    body: data.body || '',
    icon: 'img/icon-192.png',
    badge: 'img/icon-192.png',
    tag: 'parsnip-daily',
    data: { url: './?from=nudge' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) if ('focus' in w) return w.focus();
    return self.clients.openWindow(e.notification.data?.url || './');
  })());
});
