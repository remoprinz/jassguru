'use client';

import { useEffect, useCallback } from 'react';
import { useUIStore } from '@/store/uiStore';
import { serviceWorkerService } from '@/services/serviceWorkerService';
import { isPublicPath } from '@/lib/utils';

const PwaUpdateHandler: React.FC = () => {
  const { setUpdateAvailable, setTriggerUpdate } = useUIStore();

  const handleUpdate = useCallback((registration: ServiceWorkerRegistration) => {
    setUpdateAvailable(true);
    // KORREKTUR: Übergebe die Funktion direkt, nicht eine Funktion, die eine Funktion zurückgibt.
    setTriggerUpdate(() => serviceWorkerService.activateUpdate());
  }, [setUpdateAvailable, setTriggerUpdate]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // ✅ FIX: Prüfe ob wir gerade von einem Update-Reload kommen
    const checkAndClearUpdateFlag = () => {
      try {
        const wasUpdated = sessionStorage.getItem('pwaUpdateReloaded') === '1';
        const urlParams = new URLSearchParams(window.location.search);
        const hasUpdatedParam = urlParams.has('updated');
        
        if (wasUpdated || hasUpdatedParam) {
          // Update wurde erfolgreich durchgeführt
          sessionStorage.removeItem('pwaUpdateReloaded');
          setUpdateAvailable(false);
          
          // ✅ Entferne ?updated= Parameter aus URL (clean URL)
          if (hasUpdatedParam) {
            const cleanUrl = window.location.href.split('?')[0];
            window.history.replaceState({}, '', cleanUrl);
          }
          
          return true; // Signal: Update wurde gerade abgeschlossen
        }
      } catch (error) {
        console.warn('[PwaUpdateHandler] Error checking update flag:', error);
      }
      return false;
    };

    const justUpdated = checkAndClearUpdateFlag();

    // Registrierung: überall (auch Browser), aber Update-Notify nur, wenn nicht öffentliche Route
    serviceWorkerService.register({
      onUpdate: (reg) => {
        if (typeof window !== 'undefined') {
          const onPublic = isPublicPath(window.location.pathname);
          // ✅ Nur Update-Notification zeigen wenn wir NICHT gerade ein Update abgeschlossen haben
          if (!onPublic && !justUpdated) {
            handleUpdate(reg);
          }
        }
      },
    });

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // ✅ Nur Update-Check wenn nicht gerade ein Update abgeschlossen wurde
        const wasJustUpdated = sessionStorage.getItem('pwaUpdateReloaded') === '1';
        if (!wasJustUpdated) {
          serviceWorkerService.checkForUpdate();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleUpdate, setUpdateAvailable]);

  return null;
};

export default PwaUpdateHandler; 