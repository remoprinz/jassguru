import withPWAInit from 'next-pwa';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  trailingSlash: true,
  outputFileTracingRoot: __dirname, // Verhindert Workspace Root Verwirrung
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
  disable: process.env.NODE_ENV === 'development',
  register: false, // WICHTIG: Wir nutzen unseren eigenen Service für die Registrierung
  skipWaiting: false, // WICHTIG: Wir kontrollieren das Update über 'SKIP_WAITING' Message
  // 🛡️ Vereinfachte Konfiguration für next-pwa v5.6.0
  runtimeCaching: [
      // 🎯 OPTIMIERT: Google Fonts mit Update-sicherer Strategie
      {
        urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
        handler: 'StaleWhileRevalidate', // 🔄 Ermöglicht Updates ohne Blockierung
        options: {
          cacheName: 'google-fonts-v2',
          expiration: {
            maxEntries: 15,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Tage statt 1 Jahr
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
          // 🛡️ NEU: Cache-Invalidierung bei Updates
          plugins: [{
            cacheWillUpdate: async ({ response }) => {
              return response.status === 200 ? response : null;
            }
          }]
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
      // 🚀 OPTIMIERTE STRATEGIE: Firebase Storage Bilder mit StaleWhileRevalidate
      {
        urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/.*\/o\/.*%(profileImages|profilePictures|groupLogos|tournamentLogos)%2F.*/i,
        handler: 'CacheFirst', // 🔥 KRITISCH: Cache zuerst für sofortige Bilder!
        options: {
          cacheName: 'firebase-user-images',
          expiration: {
            maxEntries: 500, // Erhöht für mehr Bilder
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Tage für bessere Performance
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      // 🚀 ZUSÄTZLICHER FALLBACK: Alle Firebase Storage URLs 
      {
        urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'firebase-storage-all',
          expiration: {
            maxEntries: 1000,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 Tage
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
      // 🛡️ KRITISCH: JS/CSS mit Update-sicherer Strategie
      {
        urlPattern: /\.(?:js|css)$/i,
        handler: 'StaleWhileRevalidate', // 🔄 Stale-While-Revalidate für bessere Updates
        options: {
          cacheName: 'static-js-css-assets-v2',
          expiration: {
            maxEntries: 100, // Mehr Speicher für bessere Performance
            maxAgeSeconds: 12 * 60 * 60, // 12 Stunden statt 24h für schnellere Updates
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
          // 🚀 NEU: Intelligente Cache-Invalidierung
          plugins: [{
            cacheWillUpdate: async ({ response, request }) => {
              // Prüfe auf neue Build-Hashes in Dateinamen
              if (response.status === 200 && request.url.includes('/_next/static/')) {
                return response;
              }
              return response.status === 200 ? response : null;
            },
            cacheKeyWillBeUsed: async ({ request }) => {
              // Entferne Query-Parameter für bessere Cache-Hits
              const url = new URL(request.url);
              url.search = '';
              return url.href;
            }
          }]
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
        },
      },
      {
        urlPattern: /^https?.*/,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'offlineCache',
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 60 * 60, // 1 Stunde für andere Ressourcen
          },
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