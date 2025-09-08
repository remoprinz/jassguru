'use client';

import { useEffect, useCallback, useState } from 'react';
import { useUIStore } from '@/store/uiStore';
import { serviceWorkerService } from '@/services/serviceWorkerService';
import type { NotificationConfig } from '@/types/notification';

/**
 * PWA Update Handler Component
 * 
 * Verwaltet Service Worker Updates nur im PWA-Modus
 * - Zeigt Update-Benachrichtigungen
 * - Führt sanfte App-Updates durch
 * - Bereinigt alte Caches
 */
const PwaUpdateHandler: React.FC = () => {
  const showNotification = useUIStore((state) => state.showNotification);
  const [updateNotificationId, setUpdateNotificationId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Update-Benachrichtigung anzeigen
  const showUpdateNotification = useCallback((registration: ServiceWorkerRegistration) => {
    // Keine doppelten Benachrichtigungen
    if (updateNotificationId) return;

    const updateAction = async () => {
      setIsUpdating(true);
      
      try {
        // Update durchführen und auf Reload warten
        await serviceWorkerService.activateUpdate();
        
        // Die Seite wird durch den Service neu geladen, aber wir zeigen für den Fall der Fälle eine Nachricht
        const successConfig: NotificationConfig = {
          message: 'Update erfolgreich! Die App wird neu geladen...',
          type: 'success',
          preventClose: true,
          duration: 3000, // Länger, falls der Reload hängt
        };
        showNotification(successConfig);
        
      } catch (error) {
        console.error('[PWA] Update-Aktivierung fehlgeschlagen:', error);
        
        // Fehler-Nachricht
        const errorConfig: NotificationConfig = {
          message: 'Update fehlgeschlagen. Bitte manuell neu laden.',
          type: 'error',
          duration: 5000,
        };
        showNotification(errorConfig);
        
        setIsUpdating(false);
      }
    };

    // Update-Benachrichtigung
    const notificationConfig: NotificationConfig = {
      message: '🎉 Neue Version verfügbar!\n\nJetzt aktualisieren für die neuesten Features.',
      type: 'info',
      actions: [
        {
          label: isUpdating ? 'Wird aktualisiert...' : 'Jetzt aktualisieren',
          onClick: isUpdating ? () => {} : updateAction,
          className: isUpdating 
            ? 'bg-gray-500 cursor-not-allowed text-white' 
            : 'bg-green-600 hover:bg-green-700 text-white',
        },
      ],
      preventClose: false,
      duration: 30000, // 30 Sekunden
    };

    const notificationId = showNotification(notificationConfig);
    setUpdateNotificationId(notificationId);
    
  }, [showNotification, updateNotificationId, isUpdating]);

  // Service Worker registrieren und auf Updates lauschen
  useEffect(() => {
    // Nur im Browser
    if (typeof window === 'undefined') return;

    // Service Worker registrieren (nur im PWA-Modus)
    serviceWorkerService.register({
      onUpdate: showUpdateNotification,
      onSuccess: (registration) => {
        // Erfolgreiche Registrierung - kein Log nötig
      },
      onError: (error) => {
        console.error('[PWA] Service Worker Fehler:', error);
      }
    });

    // 🛡️ OPTIMIERT: Periodische Checks werden bereits vom serviceWorkerService durchgeführt
    // Keine doppelten Intervalle mehr nötig

    // Update-Check wenn Tab wieder aktiv wird
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        serviceWorkerService.checkForUpdate();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [showUpdateNotification]);

  // Render nichts - diese Komponente arbeitet im Hintergrund
  return null;
};

export default PwaUpdateHandler; 