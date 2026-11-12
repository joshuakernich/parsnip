// Stale-while-revalidate: open instantly from cache, refresh in the background.
const CACHE = 'parsnip-v2';
const SHELL = [
  './', 'index.html', 'style.css', 'app.js', 'icons.js', 'manifest.webmanifest',
  'img/icon-192.png', 'img/icon-512.png', 'img/apple-touch-icon.png',
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
      const cached = await cache.match(req, { ignoreSearch: url.origin === location.origin });
      const fresh = fetch(req)
        .then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; })
        .catch(() => cached);
      return cached || fresh;
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
