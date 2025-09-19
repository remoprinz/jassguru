'use client';

import { useState } from 'react';
import { useUIStore } from '@/store/uiStore';
import { serviceWorkerService } from '@/services/serviceWorkerService';
import { isPublicPath } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Rocket, Loader2 } from 'lucide-react';

export const UpdateBanner = () => {
  const { isUpdateAvailable, triggerUpdate } = useUIStore();
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
      // Kurze Verzögerung, um sicherzustellen, dass der State-Update gerendert wird, bevor der SW-Update-Prozess den Main Thread blockieren könnte.
      setTimeout(() => {
        triggerUpdate();
      }, 50); // Eine kleine Verzögerung von 50ms ist robuster als 0.
    }
  };

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
