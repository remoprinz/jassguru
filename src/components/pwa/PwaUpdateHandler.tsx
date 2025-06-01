'use client';

import { useEffect, useCallback, useState } from 'react';
import { useUIStore } from '@/store/uiStore';
import { getActiveRegistration } from '@/pwa/serviceWorkerRegistration';
import type { NotificationConfig, NotificationVariant, Notification } from '@/types/notification';

// Diese Komponente ist unsichtbar und nur für die Logik zuständig.
const PwaUpdateHandler: React.FC = () => {
  const showNotification = useUIStore((state) => state.showNotification);
  const removeNotification = useUIStore((state) => state.removeNotification);
  const [updateNotificationId, setUpdateNotificationId] = useState<string | null>(null);

  // Zusätzliches Debugging beim Mounten der Komponente
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // console.log('[PwaUpdateHandler] Component mounted.');
    if (typeof navigator !== 'undefined') {
        // console.log('[PwaUpdateHandler] Checking navigator.serviceWorker availability...');
        const swAvailable = 'serviceWorker' in navigator;
        // console.log('[PwaUpdateHandler] \'serviceWorker\' in navigator:', swAvailable);
        if (!swAvailable) {
            try {
                // console.log('[PwaUpdateHandler] Properties in navigator:', Object.keys(navigator));
            } catch (e) {
                console.error('[PwaUpdateHandler] Error getting navigator keys:', e);
            }
        }
    } else {
        // console.log('[PwaUpdateHandler] Navigator object is not available here either.');
    }
  }, []);

  useEffect(() => {
    // Nur im Browser ausführen
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      // console.log('[PwaUpdateHandler] Service Worker API not available or not in browser.');
      return;
    }

    const handleUpdateReady = (event: Event) => {
      // console.log('[PwaUpdateHandler] handleUpdateReady called. Update is available.');

      const registration = getActiveRegistration();

      const UPDATE_MESSAGE = 'Eine neue Version ist verfügbar. Möchtest du die App jetzt aktualisieren?';

      const updateAction = () => {
        console.log('[PwaUpdateHandler] updateAction called.');
        const sw = navigator.serviceWorker;
        if (!sw) {
            console.error('[PwaUpdateHandler] navigator.serviceWorker is not available!');
            window.location.reload();
            return;
        }

        const currentController = sw.controller;
        console.log('[PwaUpdateHandler] Current controller:', currentController);

        if (registration && registration.waiting) {
          console.log('[PwaUpdateHandler] Found waiting worker. Sending SKIP_WAITING...');
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          console.log('[PwaUpdateHandler] SKIP_WAITING message sent.');

          let checks = 0;
          const maxChecks = 15;
          const intervalId = setInterval(() => {
            checks++;
            console.log(`[PwaUpdateHandler] Checking controller... Attempt ${checks}/${maxChecks}`);
            const newController = sw.controller;
            console.log('[PwaUpdateHandler] Polling - new controller:', newController);
      
            if (newController && newController !== currentController) {
              console.log('[PwaUpdateHandler] New controller detected! Reloading page.');
              clearInterval(intervalId);
              window.location.reload();
            } else if (checks >= maxChecks) {
              console.warn('[PwaUpdateHandler] Timeout reached waiting for new controller. Forcing reload.');
              clearInterval(intervalId);
              window.location.reload();
            }
          }, 200);
      
        } else {
           console.warn('[PwaUpdateHandler] No waiting worker found in updateAction. Reloading as fallback.');
           window.location.reload();
        }
      };

      // Definiere die laterAction neu: Holt sich den *aktuellen* State beim Klick
      const laterAction = () => {
        // console.log(`[PwaUpdateHandler] Later clicked.`);
        
        // Hole den aktuellsten Notification-State direkt vom Store
        const currentNotificationId = updateNotificationId; // Verwende lokalen State
        
        if (currentNotificationId) {
            removeNotification(currentNotificationId);
        } else {
            // console.warn(`[PwaUpdateHandler] Could not find the PWA update notification to remove in the latest state.`);
        }
      };

      // Erstelle die Konfiguration
      const notificationConfig: NotificationConfig = {
        message: UPDATE_MESSAGE,
        type: 'info',
        actions: [
          {
            label: 'Später',
            onClick: laterAction, // Verwendet die neu definierte laterAction
            className: 'bg-gray-500 hover:bg-gray-600 text-white',
          },
          {
            label: 'Aktualisieren',
            onClick: updateAction,
            className: 'bg-blue-500 hover:bg-blue-600 text-white',
          },
        ],
        preventClose: true,
      };

      // console.log('[PwaUpdateHandler] Showing update notification:', notificationConfig);
      showNotification(notificationConfig);
    };

    // Event-Listener hinzufügen
    // console.log('[PwaUpdateHandler] Adding event listener for swUpdateReady.');
    window.addEventListener('swUpdateReady', handleUpdateReady);

    // Cleanup-Funktion
    return () => {
      // console.log('[PwaUpdateHandler] Removing event listener for swUpdateReady.');
      window.removeEventListener('swUpdateReady', handleUpdateReady);
    };
  }, [showNotification, removeNotification]);

  const showUpdateNotification = useCallback((config: NotificationConfig) => {
    // Rufe die Store-Funktion auf, die die ID zurückgibt
    const notificationId = showNotification(config);
    // Speichere die zurückgegebene ID im lokalen State
    setUpdateNotificationId(notificationId);
    // console.log('[PwaUpdateHandler] Showing update notification with ID:', notificationId, config);
  }, [showNotification]);

  return null; // Diese Komponente rendert nichts
};

export default PwaUpdateHandler; 