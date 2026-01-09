import withPWAInit from 'next-pwa';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { APP_VERSION } from './src/config/version.js'; // 🛡️ BULLETPROOF: Automatische Version-Synchronisation

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  trailingSlash: true,
  outputFileTracingRoot: __dirname, // Verhindert Workspace Root Verwirrung
  // ✅ appDir ist in Next.js 15.5.2 standardmäßig aktiviert - keine experimentelle Konfiguration nötig
  exportPathMap: async function (defaultPathMap, { dev, outDir, distDir }) {
    // Skip dynamic routes during export
    if (outDir) {
      delete defaultPathMap['/game/[activeGameId]'];
      delete defaultPathMap['/groups/[groupId]'];
      delete defaultPathMap['/tournaments/[tournamentId]'];
      delete defaultPathMap['/profile/[playerId]'];
      delete defaultPathMap['/view/session/[sessionId]'];
      delete defaultPathMap['/view/tournament/[tournamentId]'];
      delete defaultPathMap['/view/session/public/[sessionId]'];
    }
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
  // Next.js 16: Leere turbopack-Konfiguration, damit webpack verwendet wird
  // (Turbopack ist in Next.js 16 Standard, aber wir haben webpack-Konfiguration)
  turbopack: {},
  // eslint-Konfiguration entfernt: Next.js 16 unterstützt eslint in next.config.js nicht mehr
  // ESLint wird jetzt über .eslintrc.cjs konfiguriert
  typescript: {
    ignoreBuildErrors: true,
  },
};

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development' || process.env.DISABLE_PWA === 'true',
  register: false, // WICHTIG: Wir nutzen unseren eigenen Service für die Registrierung
  skipWaiting: false, // 🛡️ KONTROLLIERTE Updates verhindern Race Conditions
  clientsClaim: false, // 🛡️ Nicht aggressiv claimen, um Chunk-Mismatches zu vermeiden
  importScripts: ['/sw-ext.js'], // 🛡️ Extension für kontrollierte Updates
  // 🛡️ Vereinfachte Konfiguration für next-pwa v5.6.0
  runtimeCaching: [
      // ✅ Hash-basierte Next-Bundles immer CacheFirst: nie HTML als Fallback!
      {
        urlPattern: /\/_next\/static\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: `next-static-assets-v${APP_VERSION}`,
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      // 🎯 OPTIMIERT: Google Fonts mit Update-sicherer Strategie
      {
        urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
        handler: 'StaleWhileRevalidate', // 🔄 Ermöglicht Updates ohne Blockierung
        options: {
          cacheName: `google-fonts-v${APP_VERSION}`,
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
        urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/.*\/o\/.*%(profilePictures|groupLogos|tournamentLogos)%2F.*/i,
        handler: 'CacheFirst', // 🔥 KRITISCH: Cache zuerst für sofortige Bilder!
        options: {
          cacheName: `firebase-user-images-v${APP_VERSION}`,
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
      // 🛡️ JS/CSS ausserhalb von /_next/static: NetworkFirst für Updates
      {
        urlPattern: /\.(?:js|css)$/i,
        handler: 'NetworkFirst', // 🚀 FIXED: NetworkFirst verhindert HTML-Fallback
        options: {
          cacheName: `static-js-css-assets-v${APP_VERSION}`, // 🛡️ BULLETPROOF: Automatisch synchronisierte Version
          expiration: {
            maxEntries: 50, // Reduziert für weniger Speicher-Konflikte
            maxAgeSeconds: 2 * 60 * 60, // 2 Stunden für häufigere Updates
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
          // 🛡️ KRITISCH: Verhindert HTML-Fallback bei JS/CSS
          plugins: [{
            handlerDidError: async ({ request }) => {
              // Bei Fehlern: Kein Fallback, sondern Fehler
              throw new Error(`Failed to load ${request.url}`);
            }
          }]
        },
      },
      // ⚠️ WICHTIG: Keine generische Caching-Regel für *.googleapis.com,
      // um Firestore Listen/Streaming-Anfragen nicht zu stören (CORS/long-poll)
      // (vorherige NetworkFirst-Regel entfernt)
      {
        urlPattern: /^https:\/\/.*\.firebaseapp\.com\/.*$/i,
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
    '!noprecache/**/*',
    '!index.html', // 🚫 Nie index.html aus /public precachen
    '!*.pdf' // 📄 PDF-Dateien auch nicht precachen für direkten Zugriff
  ],
  // Wichtig: kein document-Fallback definieren, damit Scripts nie HTML bekommen
  fallbacks: {
    image: '/apple-touch-icon.png'
  },
  // Reduziert unnötige Fallback-Generierung
  maximumFileSizeToCacheInBytes: 3000000, // 3MB limit
  exclude: [
    /\.map$/,
    /manifest$/,
    /\.htaccess$/,
    // Reduziert Anzahl Fallback-Dateien für JS
    ({ asset, compilation }) => {
      // 1) niemals index.html precachen -> immer vom Netzwerk holen
      if (asset.name === 'index.html') return true;
      // 2) Keine generierten Fallback-Dateien precachen
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

