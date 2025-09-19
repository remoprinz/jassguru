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

    // Registrierung: überall (auch Browser), aber Update-Notify nur, wenn nicht öffentliche Route
    serviceWorkerService.register({
      onUpdate: (reg) => {
        if (typeof window !== 'undefined') {
          const onPublic = isPublicPath(window.location.pathname);
          if (!onPublic) handleUpdate(reg);
        }
      },
    });

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        serviceWorkerService.checkForUpdate();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleUpdate]);

  return null;
};

export default PwaUpdateHandler; 