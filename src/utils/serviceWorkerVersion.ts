/**
 * Service Worker Versioning System
 * 
 * Stellt sicher, dass Service Worker und App-Version synchron sind
 * und verhindert Cache-Konflikte bei Updates
 */

// 🛡️ BULLETPROOF: Verwende zentrale Version ohne problematische Imports
export const APP_VERSION = '2.7.2'; // Wird von CI/CD automatisch aktualisiert

// 🛡️ DETERMINISTISCH: Build-Timestamp aus Umgebungsvariablen oder statisch
export const BUILD_TIMESTAMP = process.env.NEXT_PUBLIC_BUILD_TIMESTAMP || '1703686800000'; // Fallback: fixer Timestamp

// Kombinierte Version für Service Worker
export const SERVICE_WORKER_VERSION = `${APP_VERSION}-${BUILD_TIMESTAMP}`;

// Cache-Namen mit Versionierung
export const CACHE_NAMES = {
  PRECACHE: `precache-v${SERVICE_WORKER_VERSION}`,
  RUNTIME: `runtime-v${SERVICE_WORKER_VERSION}`,
  STATIC: `static-v${SERVICE_WORKER_VERSION}`,
  IMAGES: `images-v${SERVICE_WORKER_VERSION}`,
} as const;

/**
 * Prüft ob eine Cache-Version veraltet ist
 */
export function isOutdatedCache(cacheName: string): boolean {
  return !(Object.values(CACHE_NAMES) as string[]).includes(cacheName);
}

/**
 * Bereinigt alte Cache-Versionen
 */
export async function cleanupOldCaches(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  
  try {
    const cacheNames = await caches.keys();
    const currentCaches = Object.values(CACHE_NAMES) as string[];
    
    await Promise.all(
      cacheNames
        .filter(name => !currentCaches.includes(name))
        .map(name => {
          console.log(`[SW] Lösche veralteten Cache: ${name}`);
          return caches.delete(name);
        })
    );
  } catch (error) {
    console.error('[SW] Fehler beim Bereinigen alter Caches:', error);
  }
}

/**
 * Generiert einen eindeutigen Build-Hash
 * Wird beim Build-Prozess verwendet
 */
export function generateBuildHash(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `${timestamp}-${random}`;
}
