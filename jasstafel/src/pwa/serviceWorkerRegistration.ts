// src/pwa/serviceWorkerRegistration.ts

// Version, die bei jedem Build inkrementiert werden sollte
// Dies hilft dem Browser zu erkennen, dass es sich um ein echtes Update handelt
const SW_VERSION = '1.0.2'; // Ändern Sie diese Nummer bei jedem Test

// Globale Variable zur Speicherung der aktuellen Registrierung
let activeRegistration: ServiceWorkerRegistration | null = null;

// Funktion zum Abrufen der aktuellen Registrierung
export function getActiveRegistration(): ServiceWorkerRegistration | null {
  return activeRegistration;
}

export function register() {
  if ("serviceWorker" in navigator) {
    // Füge eine Versionsnummer als Query-Parameter hinzu
    const swUrl = `/sw.js?v=${SW_VERSION}`;
    navigator.serviceWorker.register(swUrl)
      .then((registration) => {
        console.log('[ServiceWorkerRegistration]', 'Registration successful with version', SW_VERSION, 'scope is:', registration.scope);
        
        // Speichere die Registrierung in der globalen Variable
        activeRegistration = registration;
        
        // Dispatch eines benutzerdefinierten Events, um die Registrierung an andere Komponenten weiterzugeben
        if (typeof window !== 'undefined') {
          const event = new CustomEvent('swRegistered', { detail: { registration } });
          window.dispatchEvent(event);
          
          // Füge eine globale Variable für direkten Zugriff hinzu
          (window as any).__SW_REGISTRATION = registration;
        }
      })
      .catch((error) => {
        console.error("[ServiceWorkerRegistration]", "Fehler bei der Service Worker Registrierung:", error);
      });
  }
}

export function checkPWAStatus(): boolean {
  if (typeof window !== "undefined") {
    return window.matchMedia("(display-mode: standalone)").matches;
  }
  return false;
}

export function checkManifest(): void {
  const manifestLink = document.querySelector("link[rel=\"manifest\"]");
  console.log("Manifest Link-Element:", manifestLink);

  if (manifestLink) {
    const manifestUrl = manifestLink.getAttribute("href") || "";
    fetch(manifestUrl)
      .then((response) => response.json())
      .then((data) => console.log("Manifest Inhalt:", data))
      .catch((error) => console.error("Fehler beim Laden des Manifests:", error));
  } else {
    console.log("Kein Manifest-Link gefunden");
  }
}

// Optional: Add a function to unregister the service worker if needed
export function unregister() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch((error) => {
        console.error("Fehler beim Abmelden des Service Workers:", error);
      });
  }
}
