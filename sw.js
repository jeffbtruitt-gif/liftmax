// Offline support: network first, falling back to the last cached copy.
// Network-first means a new deploy shows up on the next load without a version bump.
const CACHE = 'liftmax-v2';
const SHELL = [
  './', './index.html', './css/styles.css', './manifest.webmanifest', './icons/icon.svg',
  './js/app.js', './js/store.js', './js/ui.js', './js/config.js', './js/seed.js',
  './js/adapters/local.js', './js/adapters/supabase.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cacheable = url.origin === location.origin || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com') || url.hostname === 'cdn.jsdelivr.net';
  if (!cacheable) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'))),
  );
});
