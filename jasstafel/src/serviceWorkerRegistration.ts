// src/serviceWorkerRegistration.ts

export function register() {
  console.log('Service Worker Registrierungsfunktion aufgerufen');

  if ('serviceWorker' in navigator) {
    console.log('Service Worker wird vom Browser unterstützt');

    window.addEventListener('load', () => {
      console.log('Fenster geladen, versuche Service Worker zu registrieren');

      const swUrl = '/service-worker.js';
      console.log('Service Worker URL:', swUrl);

      navigator.serviceWorker.register(swUrl)
        .then((registration) => {
          console.log('Service Worker erfolgreich registriert. Scope:', registration.scope);
          
          const workerState = registration.installing 
            ? 'installierend' 
            : registration.waiting 
              ? 'wartend' 
              : registration.active 
                ? 'aktiv' 
                : 'unbekannt';
          console.log('Service Worker Status:', workerState);

          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            console.log('Neuer Service Worker gefunden:', newWorker);

            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                console.log('Service Worker Statusänderung:', newWorker.state);
              });
            }
          });
        })
        .catch((error) => {
          console.error('Fehler bei der Service Worker Registrierung:', error);
          console.log('Navigator serviceWorker Objekt:', navigator.serviceWorker);
        });

      // Überprüfe bestehende Registrierungen
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        console.log('Bestehende Service Worker Registrierungen:', registrations);
      });
    });
  } else {
    console.log('Service Worker werden von diesem Browser nicht unterstützt');
  }
}

// Funktion zum Überprüfen des PWA-Status
function checkPWAStatus() {
  if (window.matchMedia('(display-mode: standalone)').matches) {
    console.log('Anwendung läuft als PWA');
  } else {
    console.log('Anwendung läuft im Browser-Modus');
  }
  console.log('Navigator standalone:', 'standalone' in navigator && (navigator as any).standalone);
  console.log('Display mode:', window.matchMedia('(display-mode: standalone)').matches);
}

// Funktion zum Überprüfen des Manifests
function checkManifest() {
  const manifestLink = document.querySelector('link[rel="manifest"]');
  console.log('Manifest Link-Element:', manifestLink);

  if (manifestLink) {
    const manifestUrl = manifestLink.getAttribute('href') || '';
    fetch(manifestUrl)
      .then(response => response.json())
      .then(data => console.log('Manifest Inhalt:', data))
      .catch(error => console.error('Fehler beim Laden des Manifests:', error));
  } else {
    console.log('Kein Manifest-Link gefunden');
  }
}

// Exportiere zusätzliche Funktionen
export { checkPWAStatus, checkManifest };