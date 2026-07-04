// Grimoire Games service worker — caches the app shell so it works offline once installed.
const CACHE = 'grimoire-v30';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './precons.json', './combos.json',
  './logo.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Live card data (Scryfall API): always try network, fall back to cache if offline.
  if (url.hostname === 'api.scryfall.com') {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // App page: network-first so updates show when online, cached shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy));
        return r;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Fonts, OCR engine, card images, icons: cache-first, then network (and cache it).
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(r => {
      if (r && r.status === 200 && (r.type === 'basic' || r.type === 'cors')) {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return r;
    }).catch(() => cached))
  );
});
