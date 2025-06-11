'use client';

import { useEffect, useCallback, useState } from 'react';
import { useUIStore } from '@/store/uiStore';
import { getActiveRegistration } from '@/pwa/serviceWorkerRegistration';
import type { NotificationConfig } from '@/types/notification';

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

  // Debugging beim Mounten
  useEffect(() => {
    console.log('[PwaUpdateHandler] Component mounted - Enhanced Version');
    if (typeof navigator !== 'undefined') {
      const swAvailable = 'serviceWorker' in navigator;
      console.log('[PwaUpdateHandler] Service Worker available:', swAvailable);
      
      // Prüfe aktuelle Service Worker Registration
      if (swAvailable) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          console.log('[PwaUpdateHandler] Current registrations:', registrations.length);
          registrations.forEach((reg, index) => {
            console.log(`[PwaUpdateHandler] Registration ${index}:`, {
              scope: reg.scope,
              active: !!reg.active,
              waiting: !!reg.waiting,
              installing: !!reg.installing,
            });
          });
        });
      }
    }
  }, []);

  // Improved update check function
  const checkForUpdates = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        console.log('[PwaUpdateHandler] Checking for updates...');
        await registration.update();
        setUpdateState(prev => ({ ...prev, lastUpdateCheck: Date.now() }));
      }
    } catch (error) {
      console.error('[PwaUpdateHandler] Error checking for updates:', error);
      setUpdateState(prev => ({ ...prev, updateError: true }));
    }
  }, []);

  // Cache cleanup function
  const cleanupOldCaches = useCallback(async () => {
    if (typeof window === 'undefined' || !('caches' in window)) {
      return;
    }

    try {
      const cacheNames = await caches.keys();
      console.log('[PwaUpdateHandler] Found caches:', cacheNames);

      // Cache-Namen die älter als 7 Tage sind oder nicht mehr verwendet werden
      const oldCachePattern = /-(v\d+\.\d+\.\d+)|-(\d{8})/;
      
      for (const cacheName of cacheNames) {
        // Prüfe ob Cache veraltet ist
        if (oldCachePattern.test(cacheName)) {
          const match = cacheName.match(oldCachePattern);
          if (match) {
            // Lösche veraltete Caches
            try {
              await caches.delete(cacheName);
              console.log('[PwaUpdateHandler] Deleted old cache:', cacheName);
            } catch (error) {
              console.warn('[PwaUpdateHandler] Could not delete cache:', cacheName, error);
            }
          }
        }
      }
    } catch (error) {
      console.error('[PwaUpdateHandler] Error cleaning up caches:', error);
    }
  }, []);

  // Enhanced update ready handler
  const handleUpdateReady = useCallback((event: Event) => {
    console.log('[PwaUpdateHandler] Update ready event received');
    
    const registration = getActiveRegistration();
    if (!registration) {
      console.error('[PwaUpdateHandler] No active registration found');
      return;
    }

    setUpdateState(prev => ({ 
      ...prev, 
      isUpdateAvailable: true, 
      isUpdateReady: true 
    }));

    const UPDATE_MESSAGE = 'Eine neue Version von Jassguru ist verfügbar! 🚀';

    const updateAction = async () => {
      console.log('[PwaUpdateHandler] Starting update process...');
      setUpdateState(prev => ({ ...prev, isUpdating: true }));

      try {
        // Cleanup old caches first
        await cleanupOldCaches();

        const sw = navigator.serviceWorker;
        if (!sw) {
          throw new Error('Service Worker API nicht verfügbar');
        }

        const currentController = sw.controller;

        if (registration.waiting) {
          console.log('[PwaUpdateHandler] Sending SKIP_WAITING to waiting worker');
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
                console.log('[PwaUpdateHandler] New controller detected, reloading...');
                clearInterval(intervalId);
                resolve();
              } else if (checks >= maxChecks) {
                console.warn('[PwaUpdateHandler] Timeout waiting for new controller');
                clearInterval(intervalId);
                reject(new Error('Update timeout'));
              }
            }, checkInterval);
          });

          await waitForNewController;
          
          // Zeige kurze Erfolgsmeldung vor Reload
          const successConfig: NotificationConfig = {
            message: 'Update erfolgreich! Seite wird neu geladen...',
            type: 'success',
            preventClose: false,
          };
          showNotification(successConfig);

          // Kurz warten damit User die Meldung sieht
          setTimeout(() => {
            window.location.reload();
          }, 1000);

        } else {
          console.warn('[PwaUpdateHandler] No waiting worker found, forcing reload');
          window.location.reload();
        }

      } catch (error) {
        console.error('[PwaUpdateHandler] Update failed:', error);
        setUpdateState(prev => ({ 
          ...prev, 
          isUpdating: false, 
          updateError: true 
        }));

        const errorConfig: NotificationConfig = {
          message: 'Update fehlgeschlagen. Versuche es später erneut.',
          type: 'error',
          preventClose: false,
        };
        showNotification(errorConfig);
      }
    };

    const laterAction = () => {
      console.log('[PwaUpdateHandler] Update postponed by user');
      if (updateNotificationId) {
        removeNotification(updateNotificationId);
        setUpdateNotificationId(null);
      }
      setUpdateState(prev => ({ ...prev, isUpdateReady: false }));

      // Plane nächste Update-Prüfung in 30 Minuten
      setTimeout(checkForUpdates, 30 * 60 * 1000);
    };

    // Erstelle die Update-Benachrichtigung
    const notificationConfig: NotificationConfig = {
      message: UPDATE_MESSAGE,
      type: 'info',
      actions: [
        {
          label: 'Später',
          onClick: laterAction,
          className: 'bg-gray-500 hover:bg-gray-600 text-white',
        },
        {
          label: updateState.isUpdating ? 'Wird aktualisiert...' : 'Jetzt aktualisieren',
          onClick: updateState.isUpdating ? () => {} : updateAction,
          className: updateState.isUpdating 
            ? 'bg-gray-500 cursor-not-allowed text-white' 
            : 'bg-green-600 hover:bg-green-700 text-white',
        },
      ],
      preventClose: true,
    };

    const notificationId = showNotification(notificationConfig);
    setUpdateNotificationId(notificationId);
  }, [showNotification, removeNotification, updateNotificationId, updateState.isUpdating, cleanupOldCaches, checkForUpdates]);

  // Service Worker event listener setup
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      console.log('[PwaUpdateHandler] Service Worker not available');
      return;
    }

    // Listen for update ready events
    window.addEventListener('swUpdateReady', handleUpdateReady);

    // Check for updates periodically (every 30 minutes)
    const updateCheckInterval = setInterval(checkForUpdates, 30 * 60 * 1000);

    // Check for updates on visibility change (when user returns to tab)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // User returned to tab, check for updates if last check was > 5 minutes ago
        const now = Date.now();
        const timeSinceLastCheck = now - updateState.lastUpdateCheck;
        if (timeSinceLastCheck > 5 * 60 * 1000) {
          checkForUpdates();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial update check after 10 seconds
    const initialCheckTimeout = setTimeout(checkForUpdates, 10000);

    // Cleanup
    return () => {
      window.removeEventListener('swUpdateReady', handleUpdateReady);
      clearInterval(updateCheckInterval);
      clearTimeout(initialCheckTimeout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleUpdateReady, checkForUpdates, updateState.lastUpdateCheck]);

  // Performance monitoring
  useEffect(() => {
    if (typeof window !== 'undefined' && 'navigator' in window && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'CACHE_UPDATED') {
          console.log('[PwaUpdateHandler] Cache updated:', event.data.cacheName);
        }
      });
    }
  }, []);

  return null; // Diese Komponente rendert nichts
};

export default PwaUpdateHandler; 