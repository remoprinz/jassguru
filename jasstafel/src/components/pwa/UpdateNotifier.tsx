import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button'; 
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'; 
import { Rocket } from 'lucide-react'; 

const UpdateNotifier: React.FC = () => {
  const [showReload, setShowReload] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  // Funktion für die gemeinsame Listener-Setup-Logik
  const setupListenersForRegistration = (registration: ServiceWorkerRegistration) => {
    console.log('[UpdateNotifier]', 'Setting up listeners for registration:', registration.scope);
    // Prüfen, ob bereits ein wartender Worker vorhanden ist
    if (registration.waiting) {
      console.log('[UpdateNotifier]', 'Found waiting worker:', registration.waiting);
      setWaitingWorker(registration.waiting);
      setShowReload(true);
    }

    // Lauschen auf neu installierte Worker
    registration.addEventListener('updatefound', () => {
      console.log('[UpdateNotifier]', '"updatefound" event fired.');
      const newWorker = registration.installing;
      if (newWorker) {
        console.log('[UpdateNotifier]', 'New worker found:', newWorker);
        newWorker.addEventListener('statechange', () => {
          console.log('[UpdateNotifier]', 'New worker state changed:', newWorker.state);
          if (newWorker.state === 'installed') {
            console.log('[UpdateNotifier]', 'New worker state is \'installed\'. Controller:', navigator.serviceWorker.controller);
            // Wenn ein Controller existiert, ist es ein Update
            if (navigator.serviceWorker.controller) {
              console.log('[UpdateNotifier]', 'Controller exists, scheduling reload prompt.');
              setWaitingWorker(newWorker);
              setShowReload(true);
            } else {
              console.log('[UpdateNotifier]', 'No controller, assuming initial load/activation.');
            }
          }
        });
      }
    });
  };

  useEffect(() => {
    // Stelle sicher, dass Service Worker unterstützt werden
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      console.log('[UpdateNotifier]', 'Hook mounted, adding event listener for swRegistered...');

      // Höre auf das Event, das die erfolgreiche Registrierung mitteilt
      const handleSWRegistered = (event: Event) => {
        const customEvent = event as CustomEvent<{registration: ServiceWorkerRegistration}>;
        const registration = customEvent.detail.registration;
        
        console.log('[UpdateNotifier]', 'Received registration via swRegistered event. Scope:', registration.scope);
        setupListenersForRegistration(registration);
      };
      
      window.addEventListener('swRegistered', handleSWRegistered);

      // Lauschen auf Controller-Änderung nach Reload
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          console.log("[UpdateNotifier]", "PWA Controller changed, reloading page.");
          refreshing = true; // Verhindere Endlos-Reloads
          window.location.reload();
        }
      });

      // Cleanup-Funktion
      return () => {
        console.log('[UpdateNotifier]', 'Hook unmounted, removing event listener...');
        window.removeEventListener('swRegistered', handleSWRegistered);
      };
    }
  }, []);

  const reloadPage = () => {
    // Da skipWaiting:true gesetzt ist, sollte ein einfacher Reload reichen.
    // Der ControllerChange listener oben fängt den Wechsel ab.
    setShowReload(false); // Verstecke die Meldung sofort
    window.location.reload();

    // // Alternative (falls SKIP_WAITING im SW benötigt würde):
    // if (waitingWorker) {
    //   waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    //   setShowReload(false);
    // }
  };

  if (!showReload) {
    return null; // Nichts anzeigen, wenn kein Update da ist
  }

  return (
    <Alert
      className="fixed bottom-4 right-4 z-50 w-auto max-w-sm bg-blue-900/90 border-blue-700 text-white shadow-lg backdrop-blur-sm"
    >
      <Rocket className="h-4 w-4 text-blue-300" />
      <AlertTitle className="text-white font-semibold">Update verfügbar! (v1.0.2)</AlertTitle>
      <AlertDescription className="text-blue-200 text-sm">
        Eine neue Version der Jass-Tafel ist bereit. Aktualisieren Sie für die neuesten Funktionen.
      </AlertDescription>
      <Button
        onClick={reloadPage}
        variant="default"
        className="mt-3 w-full bg-blue-600 hover:bg-blue-500 text-white"
        size="sm"
      >
        Jetzt aktualisieren
      </Button>
    </Alert>
  );
};

export default UpdateNotifier; 