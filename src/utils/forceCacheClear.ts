/**
 * Force Cache Clear Utility
 * 
 * Dieses Utility löscht alle Caches und erzwingt einen Service Worker Update,
 * um sicherzustellen, dass Benutzer die neueste Version erhalten.
 */

import { APP_VERSION } from '@/config/version.js';

export const forceCacheClear = async (): Promise<void> => {
  if (typeof window === 'undefined') return;
  
  console.log('🧹 Force Cache Clear gestartet...');
  
  try {
    // 1. Service Worker Caches löschen
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      console.log(`Lösche ${cacheNames.length} Cache(s):`, cacheNames);
      
      await Promise.all(
        cacheNames.map(cacheName => {
          console.log(`Lösche Cache: ${cacheName}`);
          return caches.delete(cacheName);
        })
      );
    }
    
    // 2. Service Worker neu registrieren
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      
      for (const registration of registrations) {
        console.log('Lösche Service Worker Registration');
        await registration.unregister();
      }
      
      // Kurz warten und neu registrieren
      setTimeout(() => {
        if (window.workbox && window.workbox.register) {
          console.log('Service Worker wird neu registriert...');
          window.workbox.register();
        }
      }, 1000);
    }
    
    // 3. LocalStorage für PWA-spezifische Keys löschen
    const keysToRemove = [
      'pwa-update-available',
      'last-sw-version',
      'app-cache-version'
    ];
    
    keysToRemove.forEach(key => {
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
        console.log(`LocalStorage Key entfernt: ${key}`);
      }
    });
    
    // 4. Aktuelle Version in LocalStorage speichern
    localStorage.setItem('app-cache-version', APP_VERSION);
    localStorage.setItem('last-cache-clear', new Date().toISOString());
    
    console.log('✅ Force Cache Clear abgeschlossen');
    
    // 5. Nach 2 Sekunden Page Reload
    setTimeout(() => {
      console.log('🔄 Seite wird neu geladen...');
      window.location.reload();
    }, 2000);
    
  } catch (error) {
    console.error('❌ Fehler beim Cache Clear:', error);
  }
};

// 🛡️ BULLETPROOF: Manuelle Cache-Update-Prüfung (nicht automatisch)
export const checkAndForceCacheUpdate = (): void => {
  if (typeof window === 'undefined') return;
  
  const lastCachedVersion = localStorage.getItem('app-cache-version');
  
  // Wenn die gespeicherte Version nicht der aktuellen entspricht
  if (!lastCachedVersion || lastCachedVersion !== APP_VERSION) {
    console.log(`Version-Mismatch erkannt: ${lastCachedVersion} → ${APP_VERSION}`);
    console.log('Verwende forceCacheClear() für manuellen Cache-Clear');
    // ENTFERNT: Automatischer Cache-Clear für bessere Kontrolle
  }
};

// Für direkten Aufruf als Script
declare global {
  interface Window {
    forceCacheClear: typeof forceCacheClear;
    checkAndForceCacheUpdate: typeof checkAndForceCacheUpdate;
    workbox?: {
      register: () => void;
    };
  }
}

if (typeof window !== 'undefined') {
  window.forceCacheClear = forceCacheClear;
  window.checkAndForceCacheUpdate = checkAndForceCacheUpdate;
} 