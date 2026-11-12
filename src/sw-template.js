/*
 * Service worker template — the build fills in the version and the file list below
 * (see vite.config.ts) and writes the result to dist/sw.js. It keeps the whole app on the phone so it works offline.
 * Client data is NOT here: that lives in IndexedDB and is never touched by this file.
 */
const CACHE = 'client-tracker-__VERSION__';
const FILES = __FILES__;

// New version: download every file first; only then take over (the old version keeps working until then).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

// Remove the files of older versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('client-tracker-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Serve the app from the phone; only ask the network for something that isn't stored.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const lookup = request.mode === 'navigate' ? caches.match('./index.html', { cacheName: CACHE }) : caches.match(request, { ignoreSearch: true });
  event.respondWith(lookup.then((cached) => cached || fetch(request)));
});
