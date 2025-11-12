'use client';

import { useState, useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import { serviceWorkerService } from '@/services/serviceWorkerService';
import { isPublicPath } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Rocket, Loader2 } from 'lucide-react';

export const UpdateBanner = () => {
  const { isUpdateAvailable, triggerUpdate, setUpdateAvailable } = useUIStore();
  const [isUpdating, setIsUpdating] = useState(false);

  // Banner nur im PWA-Modus und nicht auf öffentlichen Seiten zeigen
  const isPwa = typeof window !== 'undefined' ? serviceWorkerService.isPWAMode() : false;
  const isPublic = typeof window !== 'undefined' ? isPublicPath(window.location.pathname) : false;

  if (!isUpdateAvailable || !isPwa || isPublic) {
    return null;
  }

  const handleUpdate = () => {
    if (triggerUpdate) {
      setIsUpdating(true);
      
      // ✅ Starte Update im Hintergrund (nicht await - läuft asynchron weiter)
      setTimeout(() => {
        triggerUpdate();
      }, 50);
      
      // ✅ Button nach 5 Sekunden ausblenden (Update läuft im Hintergrund weiter)
      setTimeout(() => {
        setIsUpdating(false);
        setUpdateAvailable(false);
      }, 5000); // 5 Sekunden
    }
  };

  // ✅ Auto-Hide nach 5 Sekunden wenn bereits im Updating-Status
  useEffect(() => {
    if (isUpdating) {
      const timer = setTimeout(() => {
        setIsUpdating(false);
        setUpdateAvailable(false);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [isUpdating, setUpdateAvailable]);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[95%] max-w-lg bg-blue-600 text-white p-4 rounded-lg shadow-lg flex items-center justify-between z-50 animate-fade-in-up">
      <div className="flex items-center">
        <Rocket className="mr-3 h-6 w-6" />
        <div>
          <h3 className="font-bold">Update verfügbar</h3>
          <p className="text-sm">Eine neue Version der App ist bereit.</p>
        </div>
      </div>
      <Button
        onClick={handleUpdate}
        disabled={isUpdating}
        className="bg-white text-blue-600 hover:bg-gray-200 disabled:opacity-75"
      >
        {isUpdating ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Installiere...
          </>
        ) : (
          'Installieren'
        )}
      </Button>
    </div>
  );
};
