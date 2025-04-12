'use client';

import { useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import { getActiveRegistration } from '@/pwa/serviceWorkerRegistration';
import type { NotificationConfig, NotificationVariant, Notification } from '@/types/notification';

// Diese Komponente ist unsichtbar und nur für die Logik zuständig.
const PwaUpdateHandler: React.FC = () => {
  const showNotification = useUIStore((state) => state.showNotification);
  const removeNotification = useUIStore((state) => state.removeNotification);

  // Zusätzliches Debugging beim Mounten der Komponente
  useEffect(() => {
    console.log('[PwaUpdateHandler] Component mounted.');
    if (typeof navigator !== 'undefined') {
        console.log('[PwaUpdateHandler] Checking navigator.serviceWorker availability...');
        const swAvailable = 'serviceWorker' in navigator;
        console.log('[PwaUpdateHandler] \'serviceWorker\' in navigator:', swAvailable);
        if (!swAvailable) {
            try {
                console.log('[PwaUpdateHandler] Properties in navigator:', Object.keys(navigator));
            } catch (e) {
                console.error('[PwaUpdateHandler] Error getting navigator keys:', e);
            }
        }
    } else {
        console.log('[PwaUpdateHandler] Navigator object is not available here either.');
    }
  }, []);

  useEffect(() => {
    // Nur im Browser ausführen
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      console.log('[PwaUpdateHandler] Service Worker API not available or not in browser.');
      return;
    }

    const handleUpdateReady = (event: Event) => {
      const registration = getActiveRegistration();
      if (!registration || !registration.waiting) {
        console.log('[PwaUpdateHandler] handleUpdateReady called, but no waiting worker found.');
        return;
      }

      const worker = registration.waiting;
      console.log('[PwaUpdateHandler] New service worker waiting:', worker);

      const UPDATE_MESSAGE = 'Eine neue Version ist verfügbar. Möchtest du die App jetzt aktualisieren?';

      const updateAction = () => {
        console.log('[PwaUpdateHandler] Update Now clicked. Sending SKIP_WAITING.');
        worker.postMessage({ type: 'SKIP_WAITING' });
        setTimeout(() => {
            window.location.reload();
        }, 100);
      };

      // Definiere die laterAction neu: Holt sich den *aktuellen* State beim Klick
      const laterAction = () => {
        console.log(`[PwaUpdateHandler] Later clicked.`);
        
        // Hole den aktuellsten Notification-State direkt vom Store
        const latestNotifications = useUIStore.getState().notifications;
        
        // Finde die Benachrichtigung im aktuellsten State anhand der Nachricht
        const notificationToRemove = latestNotifications.find(
            (n: Notification) => n.message === UPDATE_MESSAGE
        );
        
        if (notificationToRemove) {
            removeNotification(notificationToRemove.id);
        } else {
            console.warn(`[PwaUpdateHandler] Could not find the PWA update notification to remove in the latest state.`);
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

      console.log('[PwaUpdateHandler] Showing update notification:', notificationConfig);
      showNotification(notificationConfig);
    };

    // Event-Listener hinzufügen
    console.log('[PwaUpdateHandler] Adding event listener for swUpdateReady.');
    window.addEventListener('swUpdateReady', handleUpdateReady);

    // Cleanup-Funktion
    return () => {
      console.log('[PwaUpdateHandler] Removing event listener for swUpdateReady.');
      window.removeEventListener('swUpdateReady', handleUpdateReady);
    };
  }, [showNotification, removeNotification]);

  return null; // Diese Komponente rendert nichts
};

export default PwaUpdateHandler; 