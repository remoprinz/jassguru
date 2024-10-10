// src/pwa/serviceWorkerRegistration.ts

export function register() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = '/sw/service-worker.js';
      navigator.serviceWorker.register(swUrl)
        .then((registration) => {
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('Neue Version verfügbar. Bitte aktualisieren Sie die Seite.');
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error('Fehler bei der Service Worker Registrierung:', error);
        });
    });
  }
}

export function checkPWAStatus(): boolean {
  if (typeof window !== 'undefined') {
    return window.matchMedia('(display-mode: standalone)').matches;
  }
  return false;
}

export function checkManifest(): void {
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

// Optional: Add a function to unregister the service worker if needed
export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch((error) => {
        console.error('Fehler beim Abmelden des Service Workers:', error);
      });
  }
}