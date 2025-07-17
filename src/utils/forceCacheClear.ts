/**
 * Force Cache Clear Utility
 * 
 * Dieses Utility löscht alle Caches und erzwingt einen Service Worker Update,
 * um sicherzustellen, dass Benutzer die neueste Version erhalten.
 */

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
    localStorage.setItem('app-cache-version', '2.5.6');
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

// Auto-Execute auf bestimmte Bedingungen
export const checkAndForceCacheUpdate = (): void => {
  if (typeof window === 'undefined') return;
  
  const currentVersion = '2.5.6';
  const lastCachedVersion = localStorage.getItem('app-cache-version');
  
  // Wenn die gespeicherte Version nicht der aktuellen entspricht
  if (!lastCachedVersion || lastCachedVersion !== currentVersion) {
    console.log(`Version-Mismatch erkannt: ${lastCachedVersion} → ${currentVersion}`);
    
    // Stille Aktualisierung ohne Benutzerinteraktion für bessere UX
    console.log('Führe automatischen Cache-Clear durch...');
    forceCacheClear();
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