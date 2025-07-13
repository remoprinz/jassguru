'use client';

import { useEffect, useCallback, useState } from 'react';
import { useUIStore } from '@/store/uiStore';
import { getActiveRegistration } from '@/pwa/serviceWorkerRegistration';
import { shouldShowPWAFeatures, shouldUseAggressiveCaching } from '@/utils/pwaDetection';
import type { NotificationConfig } from '@/types/notification';
import { appLogger } from '@/utils/logger';

// Verbesserte Update-Strategien
interface UpdateState {
  isUpdateAvailable: boolean;
  isUpdateReady: boolean;
  isUpdating: boolean;
  updateError: boolean;
  lastUpdateCheck: number;
}

const PwaUpdateHandler: React.FC = () => {
  const showNotification = useUIStore((state) => state.showNotification);
  const removeNotification = useUIStore((state) => state.removeNotification);
  const [updateNotificationId, setUpdateNotificationId] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>({
    isUpdateAvailable: false,
    isUpdateReady: false,
    isUpdating: false,
    updateError: false,
    lastUpdateCheck: 0,
  });

  useEffect(() => {
    // Component mounted
  }, []);

    // Improved update check function
  const checkForUpdates = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        appLogger.debug('Checking for updates...');
        
        // 🚨 FIX: Prüfe auf newestWorker null um InvalidStateError zu vermeiden
        // Verwende debug statt warn um Production-Logs zu reduzieren
        if (registration.waiting || registration.installing) {
          appLogger.debug('Service Worker update already in progress - skipping check');
          return;
        }
        
        await registration.update();
        setUpdateState(prev => ({ ...prev, lastUpdateCheck: Date.now() }));
      }
    } catch (error) {
      appLogger.error('Error checking for updates:', error);
      setUpdateState(prev => ({ ...prev, updateError: true }));
    }
  }, []);

  // Enhanced cache cleanup function - löscht ALLE veralteten Caches
  const cleanupOldCaches = useCallback(async () => {
    if (typeof window === 'undefined' || !('caches' in window)) {
      return;
    }

          try {
        const cacheNames = await caches.keys();
        appLogger.debug('Found caches:', cacheNames);

        // Aktuelle Service Worker Version ermitteln
        const currentRegistration = await navigator.serviceWorker.getRegistration();
        const currentSWUrl = currentRegistration?.active?.scriptURL;
        appLogger.debug('Current SW URL:', currentSWUrl);

      // ALLE Caches löschen, außer den aktuellsten
      const cachesToDelete = cacheNames.filter(cacheName => {
        // Behalte nur die neuesten Workbox-Caches
        const isWorkboxCache = cacheName.includes('workbox-') || 
                              cacheName.includes('sw-') ||
                              cacheName.includes('precache-') ||
                              cacheName.includes('runtime-') ||
                              cacheName.includes('google-fonts') ||
                              cacheName.includes('static-') ||
                              cacheName.includes('next-') ||
                              cacheName.includes('firebase-') ||
                              cacheName.includes('offline');
        
        // Lösche alte Versionsmuster
        const hasOldVersionPattern = /-(v\d+\.\d+\.\d+)|-(\d{8})/.test(cacheName);
        
        // Lösche Caches, die älter als 1 Tag sind (basierend auf Namen-Zeitstempel)
        const timestampMatch = cacheName.match(/-(\d{13})$/); // 13-stelliger Timestamp
        if (timestampMatch) {
          const cacheTimestamp = parseInt(timestampMatch[1]);
          const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
          return cacheTimestamp < oneDayAgo;
        }
        
        return hasOldVersionPattern;
      });

              appLogger.debug('Caches to delete:', cachesToDelete);

        // Lösche alle identifizierten veralteten Caches
        for (const cacheName of cachesToDelete) {
          try {
            await caches.delete(cacheName);
            appLogger.debug('✅ Deleted old cache:', cacheName);
          } catch (error) {
            appLogger.warn('⚠️ Could not delete cache:', cacheName, error);
          }
        }

        // Zusätzlich: Lösche auch Browser-Cache-Storage falls verfügbar
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          try {
            const estimate = await navigator.storage.estimate();
            appLogger.debug('Storage usage before cleanup:', estimate);
          } catch (error) {
            appLogger.warn('Could not estimate storage:', error);
          }
        }

        appLogger.info(`Cache cleanup completed. Deleted ${cachesToDelete.length} old caches.`);
      
    } catch (error) {
      appLogger.error('[PwaUpdateHandler] Error during comprehensive cache cleanup:', error);
    }
  }, []);

  // Zusätzliche Storage-Bereinigung für IndexedDB und LocalStorage
  const cleanupOldStorageData = useCallback(async () => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
              appLogger.debug('Starting storage data cleanup...');

      // 1. LocalStorage bereinigen - entferne veraltete Einträge
      const localStorageKeysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.includes('workbox-') ||
          key.includes('sw-') ||
          key.includes('precache-') ||
          key.includes('pwa-update-') ||
          key.match(/cache-\d{13}/) // Timestamp-basierte Cache-Keys
        )) {
          localStorageKeysToRemove.push(key);
        }
      }

      localStorageKeysToRemove.forEach(key => {
        localStorage.removeItem(key);
        appLogger.debug('✅ Removed localStorage key:', key);
      });

      // 2. IndexedDB bereinigen - entferne veraltete Datenbanken
      if ('indexedDB' in window) {
        const dbNamesToCheck = [
          'workbox-background-sync',
          'workbox-expiration',
          'sw-precache-v2',
          'pwa-cache-db'
        ];

        for (const dbName of dbNamesToCheck) {
          try {
            await new Promise<void>((resolve, reject) => {
              const deleteReq = indexedDB.deleteDatabase(dbName);
              deleteReq.onsuccess = () => {
                appLogger.debug(`✅ Deleted IndexedDB: ${dbName}`);
                resolve();
              };
              deleteReq.onerror = () => {
                appLogger.debug(`⚠️ IndexedDB ${dbName} not found (OK)`);
                resolve(); // Nicht als Fehler werten
              };
              deleteReq.onblocked = () => {
                appLogger.debug(`🔄 IndexedDB ${dbName} blocked, continuing...`);
                setTimeout(() => resolve(), 1000);
              };
            });
          } catch (error) {
            appLogger.warn(`[PwaUpdateHandler] Could not delete IndexedDB ${dbName}:`, error);
          }
        }
      }

              appLogger.info('Storage data cleanup completed.');
        
      } catch (error) {
        appLogger.error('Error during storage data cleanup:', error);
      }
    }, []);

    // Enhanced update ready handler
    const handleUpdateReady = useCallback((event: Event) => {
      appLogger.debug('Update ready event received');
      
      // ✅ PWA-Context prüfen - Updates nur in echten PWAs anzeigen
      if (!shouldShowPWAFeatures()) {
        appLogger.debug('Browser-Context erkannt - keine Update-Notification anzeigen');
        return;
      }
    
    const registration = getActiveRegistration();
    if (!registration) {
      appLogger.error('[PwaUpdateHandler] No active registration found');
      return;
    }

    // Wenn bereits eine Update-Benachrichtigung angezeigt wird, nichts tun
    if (updateNotificationId) {
      return;
    }

    setUpdateState(prev => ({ 
      ...prev, 
      isUpdateAvailable: true, 
      isUpdateReady: true 
    }));

    const UPDATE_MESSAGE = 'App-Update verfügbar! 🔄\n\nJetzt neu starten für die neueste Version.';

    const updateAction = async () => {
      // Bestehenden Timer löschen, falls vorhanden
      const forceUpdateTimer = (window as any).jassguruForceUpdateTimer;
      if (forceUpdateTimer) {
        clearTimeout(forceUpdateTimer);
        (window as any).jassguruForceUpdateTimer = null;
      }
      
              appLogger.debug('Starting forced update process...');
        setUpdateState(prev => ({ ...prev, isUpdating: true }));

              try {
          // ✅ Intelligente Cache-Strategie basierend auf Context
          if (shouldUseAggressiveCaching()) {
            await cleanupOldCaches();
            await cleanupOldStorageData();
          } else {
            // Browser: Nur Service Worker Cache, Browser-Cache bleibt
            appLogger.debug('Browser-Context: Sanfte Cache-Bereinigung');
          }

        const sw = navigator.serviceWorker;
        if (!sw) {
          throw new Error('Service Worker API nicht verfügbar');
        }

        const currentController = sw.controller;

        if (registration.waiting) {
          appLogger.debug('Sending SKIP_WAITING to waiting worker');
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });

          // Warte auf Controller-Wechsel mit Timeout
          let checks = 0;
          const maxChecks = 20;
          const checkInterval = 250;

          const waitForNewController = new Promise<void>((resolve, reject) => {
            const intervalId = setInterval(() => {
              checks++;
              const newController = sw.controller;
              
              if (newController && newController !== currentController) {
                appLogger.debug('New controller detected, reloading...');
                clearInterval(intervalId);
                resolve();
              } else if (checks >= maxChecks) {
                appLogger.warn('Timeout waiting for new controller');
                clearInterval(intervalId);
                reject(new Error('Update timeout'));
              }
            }, checkInterval);
          });

          await waitForNewController;
          
          const successConfig: NotificationConfig = {
            message: 'Update erfolgreich! Die App wird neu geladen...',
            type: 'success',
            preventClose: true, // Verhindert Schliessen während dem Reload
          };
          showNotification(successConfig);

          setTimeout(() => {
            window.location.reload();
          }, 1500);

        } else {
          appLogger.warn('[PwaUpdateHandler] No waiting worker found, forcing reload anyway');
          window.location.reload();
        }

      } catch (error) {
        appLogger.error('[PwaUpdateHandler] Forced update failed:', error);
        setUpdateState(prev => ({ 
          ...prev, 
          isUpdating: false, 
          updateError: true 
        }));

        const errorConfig: NotificationConfig = {
          message: 'Update fehlgeschlagen. Erzwinge einen Hard-Reload...',
          type: 'warning',
          preventClose: false,
        };
        showNotification(errorConfig);
        
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    };

    // Erstelle eine kompromisslose Update-Benachrichtigung
    const notificationConfig: NotificationConfig = {
      message: UPDATE_MESSAGE,
      type: 'info',
      actions: [
        {
          label: updateState.isUpdating ? 'Wird aktualisiert...' : 'App jetzt neu starten',
          onClick: updateState.isUpdating ? () => {} : updateAction,
          className: updateState.isUpdating 
            ? 'bg-gray-500 cursor-not-allowed text-white' 
            : 'bg-green-600 hover:bg-green-700 text-white',
        },
      ],
      preventClose: true, // Benutzer MUSS interagieren
      duration: 30000, // 30 Sekunden
    };

    const notificationId = showNotification(notificationConfig);
    setUpdateNotificationId(notificationId);
    
    // Starte einen Timer, der das Update nach 30 Sekunden erzwingt
    appLogger.debug('Starting a 30-second timer to force update.');
    const forceUpdateTimer = setTimeout(updateAction, 30000);
    // Speichere Timer-ID im window-Objekt, um sie global zugänglich zu machen
    (window as any).jassguruForceUpdateTimer = forceUpdateTimer;

  }, [showNotification, cleanupOldCaches, updateNotificationId, updateState.isUpdating]);

  // Service Worker event listener setup
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      appLogger.debug('Service Worker not available');
      return;
    }

    // Listen for update ready events
    window.addEventListener('swUpdateReady', handleUpdateReady);

    // Check for updates periodically (every 30 minutes)
    const updateCheckInterval = setInterval(checkForUpdates, 30 * 60 * 1000);

    // Check for updates on visibility change (when user returns to tab)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // User returned to tab, check for updates if last check was > 2 minutes ago (reduced from 5)
        const now = Date.now();
        const timeSinceLastCheck = now - updateState.lastUpdateCheck;
        if (timeSinceLastCheck > 2 * 60 * 1000) {
          checkForUpdates();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial update check after 5 seconds (reduced from 10)
    const initialCheckTimeout = setTimeout(checkForUpdates, 5000);

    // Cleanup
    return () => {
      window.removeEventListener('swUpdateReady', handleUpdateReady);
      clearInterval(updateCheckInterval);
      clearTimeout(initialCheckTimeout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleUpdateReady, checkForUpdates, updateState.lastUpdateCheck]);

  // Performance monitoring and SW message handling
  useEffect(() => {
    if (typeof window !== 'undefined' && 'navigator' in window && 'serviceWorker' in navigator) {
      const handleSWMessage = (event: MessageEvent) => {
        appLogger.debug('SW Message received:', event.data);
        
        if (event.data && event.data.type === 'SW_UPDATED') {
          appLogger.debug('SW Updated, version:', event.data.version);
          // Trigger page reload after short delay
          setTimeout(() => {
            window.location.reload();
          }, 500);
        }
        
        if (event.data && event.data.type === 'SW_ACTIVATED') {
          appLogger.debug('SW Activated, version:', event.data.version);
        }
        
        if (event.data && event.data.type === 'CACHE_UPDATED') {
          appLogger.debug('Cache updated:', event.data.cacheName);
        }
      };
      
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
      
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      };
    }
  }, []);

  return null; // Diese Komponente rendert nichts
};

export default PwaUpdateHandler; 