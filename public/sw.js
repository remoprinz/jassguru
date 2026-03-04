/**
 * Jassguru Service Worker v2.8.3
 *
 * Eigenständiger SW mit Workbox 6.6.0 (CDN).
 * Kein Build-Tool-Generierung – alle Dateien sind im Repo versioniert.
 *
 * Caching-Strategien:
 *   /_next/static/**  → CacheFirst  (hash-basiert, unveränderlich)
 *   Google Fonts      → StaleWhileRevalidate
 *   Statische Fonts   → CacheFirst
 *   Firebase Images   → CacheFirst
 *   Allg. Bilder      → StaleWhileRevalidate
 *   JS/CSS (nicht _next/static) → NetworkFirst
 *   Firebase App      → NetworkFirst
 *   Alles andere      → StaleWhileRevalidate
 */

// Workbox 6.6.0 von Google CDN laden
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.6.0/workbox-sw.js');

// SKIP_WAITING per postMessage
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Nach Aktivierung: ACK an alle Clients senden
self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.clients.claim().then(() => {
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SW_ACTIVATED' });
        });
      });
    })
  );
});

if (workbox) {
  // Veraltete Caches aufräumen
  workbox.precaching.cleanupOutdatedCaches();

  const APP_VERSION = '2.8.3';

  // 1) /_next/static/** → CacheFirst (hash-basiert, immutable)
  workbox.routing.registerRoute(
    /\/_next\/static\/.*/i,
    new workbox.strategies.CacheFirst({
      cacheName: 'next-static-assets-v' + APP_VERSION,
      plugins: [
        new workbox.expiration.ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }),
      ],
    })
  );

  // 2) Google Fonts → StaleWhileRevalidate
  workbox.routing.registerRoute(
    /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'google-fonts-v' + APP_VERSION,
      plugins: [
        new workbox.expiration.ExpirationPlugin({ maxEntries: 15, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }),
      ],
    })
  );

  // 3) Statische Font-Dateien → CacheFirst
  workbox.routing.registerRoute(
    /\.(?:eot|otf|ttc|ttf|woff|woff2|font)$/i,
    new workbox.strategies.CacheFirst({
      cacheName: 'static-font-assets',
      plugins: [
        new workbox.expiration.ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }),
      ],
    })
  );

  // 4) Firebase Storage: Profilbilder/Logos → CacheFirst
  workbox.routing.registerRoute(
    /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/.*\/o\/.*%(profilePictures|groupLogos|tournamentLogos)%2F.*/i,
    new workbox.strategies.CacheFirst({
      cacheName: 'firebase-user-images-v' + APP_VERSION,
      plugins: [
        new workbox.expiration.ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }),
      ],
    })
  );

  // 5) Firebase Storage: Alle anderen → CacheFirst
  workbox.routing.registerRoute(
    /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
    new workbox.strategies.CacheFirst({
      cacheName: 'firebase-storage-all',
      plugins: [
        new workbox.expiration.ExpirationPlugin({ maxEntries: 1000, maxAgeSeconds: 7 * 24 * 60 * 60 }),
        new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }),
      ],
    })
  );

  // 6) Allgemeine Bilder → StaleWhileRevalidate
  workbox.routing.registerRoute(
    /\.(?:jpg|jpeg|gif|png|svg|ico|webp|avif)$/i,
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'static-image-assets',
      plugins: [
        new workbox.expiration.ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 }),
        new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }),
      ],
    })
  );

  // 7) Next.js Image Optimization → StaleWhileRevalidate
  workbox.routing.registerRoute(
    /\/_next\/image\?url=.+$/i,
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'next-image',
      plugins: [
        new workbox.expiration.ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 }),
        new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }),
      ],
    })
  );

  // 8) JS/CSS (nicht /_next/static) → NetworkFirst – nie HTML als Fallback!
  workbox.routing.registerRoute(
    /\.(?:js|css)$/i,
    new workbox.strategies.NetworkFirst({
      cacheName: 'static-js-css-assets-v' + APP_VERSION,
      plugins: [
        new workbox.expiration.ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 2 * 60 * 60 }),
        new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }),
      ],
    })
  );

  // 9) Firebase App Hosting → NetworkFirst
  workbox.routing.registerRoute(
    /^https:\/\/.*\.firebaseapp\.com\/.*$/i,
    new workbox.strategies.NetworkFirst({
      cacheName: 'firebase-cache',
      plugins: [
        new workbox.expiration.ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 5 * 60 }),
      ],
    })
  );

  // 10) Alles andere → StaleWhileRevalidate (Catch-all)
  workbox.routing.registerRoute(
    /^https?.*/,
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'offlineCache',
      plugins: [
        new workbox.expiration.ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 }),
        new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }),
      ],
    })
  );
}
