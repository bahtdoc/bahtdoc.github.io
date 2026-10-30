// Offline shell for the free online app (/app/). build-site.js swaps the version token in the cache
// name below for a hash of the app, so every deploy that changes the app starts a fresh cache.
const CACHE = 'thaidoc-app-5eb73b61';
const SHELL = ['./', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const HOME = new Request(new URL('./', self.location).href);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('thaidoc-app-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: answer from the cache at once, refresh it in the background.
// Cross-origin files (Google Fonts) are cached too, so the app looks the same offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const key = e.request.mode === 'navigate' ? HOME : e.request;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const hit = await cache.match(key, { ignoreSearch: true });
      const fresh = fetch(e.request)
        .then(res => { if (res.ok || res.type === 'opaque') cache.put(key, res.clone()); return res; })
        .catch(() => null);
      if (hit) { e.waitUntil(fresh); return hit; }
      return (await fresh) || Response.error();
    })
  );
});
