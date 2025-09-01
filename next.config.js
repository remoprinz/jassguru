import withPWAInit from 'next-pwa';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  trailingSlash: true,
  exportPathMap: async function (defaultPathMap) {
    return {
      ...defaultPathMap,
      '/features': { page: '/features' },
    }
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'lh4.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'lh5.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'lh6.googleusercontent.com',
      },
    ],
  },
  webpack: (config) => {
    return config;
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

const withPWA = withPWAInit({
  dest: 'public',
  register: false, // Custom Registration - wir registrieren konditional
  skipWaiting: true,
  clientsClaim: true,
  scope: '/',
  // disable: true, // 🎯 PWA wieder aktiviert, aber mit Kontrolle
  sw: 'sw.js',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts',
        expiration: {
          maxEntries: 10,
          maxAgeSeconds: 365 * 24 * 60 * 60, // 1 Jahr
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    {
      urlPattern: /\.(?:eot|otf|ttc|ttf|woff|woff2|font)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-font-assets',
        expiration: {
          maxEntries: 10,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Tage
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    // 🚀 NEUE OPTIMIERTE STRATEGIE: Firebase Storage Bilder (Profilbilder, Gruppenlogos)
    {
      urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*\/(profileImages|profilePictures|groupLogos|tournamentLogos)\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'firebase-user-images',
        expiration: {
          maxEntries: 500, // Mehr Platz für Profilbilder/Logos
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Tage - länger, da Änderungen neue URLs generieren
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    // Allgemeine Bilder bleiben StaleWhileRevalidate für häufig ändernde Inhalte
    {
      urlPattern: /\.(?:jpg|jpeg|gif|png|svg|ico|webp|avif)$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-image-assets',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 Tage
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    {
      urlPattern: /\/_next\/image\?url=.+$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'next-image',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 Tage
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    {
      urlPattern: /\.(?:js|css)$/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'static-js-css-assets',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60, // 24 Stunden
        },
        networkTimeoutSeconds: 3,
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    {
      urlPattern: /^https:\/\/.*\.googleapis\.com\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'google-apis-cache',
        expiration: {
          maxEntries: 30,
          maxAgeSeconds: 5 * 60, // 5 Minuten
        },
        networkTimeoutSeconds: 5,
      },
    },
    {
      urlPattern: /^https:\/\/.*\.firebaseapp\.com\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'firebase-cache',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 5 * 60, // 5 Minuten
        },
        networkTimeoutSeconds: 3,
      },
    },
    {
      urlPattern: /^https?.*\.html$/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'html-pages',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 5 * 60, // 5 Minuten für HTML-Seiten
        },
        networkTimeoutSeconds: 3,
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    {
      urlPattern: /^https?.*/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'offlineCache',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 60 * 60, // 1 Stunde für andere Ressourcen
        },
        networkTimeoutSeconds: 3,
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
  ],
  buildExcludes: [
    /middleware-manifest\.json$/,
    /build-manifest\.json$/,
    /_buildManifest\.js$/,
    /dynamic-css-manifest\.json$/, // 🚨 FIX: Diese Datei ausschliessen
  ],
  publicExcludes: [
    '!noprecache/**/*'
  ],
  fallbacks: {
    image: '/apple-touch-icon.png',
    document: '/index.html', // Reduziert separate Fallback-Dateien
    // font: '/apple-touch-icon.png', // Nicht nötig
    // audio: '/apple-touch-icon.png', // Nicht nötig
    // video: '/apple-touch-icon.png', // Nicht nötig
  },
  // Reduziert unnötige Fallback-Generierung
  maximumFileSizeToCacheInBytes: 3000000, // 3MB limit
  exclude: [
    /\.map$/,
    /manifest$/,
    /\.htaccess$/,
    // Reduziert Anzahl Fallback-Dateien für JS
    ({ asset, compilation }) => {
      if (
        asset.name.startsWith('static/') ||
        asset.name.startsWith('_next/static/')
      ) {
        return asset.name.includes('fallback');
      }
      return false;
    },
  ],
});

export default withPWA(nextConfig);