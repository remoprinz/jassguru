// src/pwa/serviceWorkerRegistration.ts

// KEIN Store-Import mehr hier!

// Version, die bei jedem Build inkrementiert werden sollte
const SW_VERSION = '1.2.1'; // Muss zur Version im sw.js passen

// Globale Variable zur Speicherung der aktuellen Registrierung
let activeRegistration: ServiceWorkerRegistration | null = null;

// Funktion zum Abrufen der aktuellen Registrierung (wird von PwaUpdateHandler verwendet)
export function getActiveRegistration(): ServiceWorkerRegistration | null {
  console.log('[ServiceWorkerRegistration]', 'getActiveRegistration called, returning:', activeRegistration);
  return activeRegistration;
}

// Helper-Funktion, um das Event auszulösen
const dispatchUpdateReadyEvent = () => {
  if (typeof window !== 'undefined') {
    const event = new CustomEvent('swUpdateReady'); 
    window.dispatchEvent(event);
    console.log('[ServiceWorkerRegistration]', 'Dispatched swUpdateReady event.');
  }
}

// --- Listener-Logik ---
const setupListenersAndNotify = (registration: ServiceWorkerRegistration) => {
  console.log('[ServiceWorkerRegistration]', 'Setting up listeners for registration:', registration.scope);
  
  // Prüfen, ob bereits ein wartender Worker vorhanden ist (direkt nach Registrierung)
  if (registration.waiting) {
    console.log('[ServiceWorkerRegistration]', 'Found waiting worker immediately after registration:', registration.waiting);
    dispatchUpdateReadyEvent(); // Nur Event auslösen
  }

  // Lauschen auf neu installierte Worker
  registration.addEventListener('updatefound', () => {
    console.log('[ServiceWorkerRegistration]', '"updatefound" event fired.');
    const newWorker = registration.installing;
    if (newWorker) {
      console.log('[ServiceWorkerRegistration]', 'New worker found, attaching statechange listener:', newWorker);
      newWorker.addEventListener('statechange', () => {
        console.log('[ServiceWorkerRegistration]', 'New worker state changed:', newWorker.state);
        // Wenn der neue Worker installiert ist und ein alter Controller noch aktiv ist
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          console.log('[ServiceWorkerRegistration]', 'New worker installed, dispatching swUpdateReady event.');
          dispatchUpdateReadyEvent(); // Nur Event auslösen
        }
      });
    }
  });
};
// --- Ende Listener-Logik ---

export function register() {
  const isDevelopment = process.env.NODE_ENV === 'development';
  console.log('[ServiceWorkerRegistration]', 'Umgebung:', process.env.NODE_ENV, 'Entwicklungsmodus:', isDevelopment);
  
  if (isDevelopment) {
    // Simulation im Entwicklungsmodus
    console.log('[ServiceWorkerRegistration]', 'Service Worker-Registrierung in der Entwicklungsumgebung übersprungen.');
    setTimeout(() => {
      console.log('[ServiceWorkerRegistration]', 'Simulating swUpdateReady event for development...');
      dispatchUpdateReadyEvent();
    }, 5000);
    return;
  }
  
  // --- Detailliertes Debugging für Produktionsmodus ---
  console.log('[ServiceWorkerRegistration] Starting registration logic in production mode.');
  
  if (typeof window === 'undefined') {
    console.warn('[ServiceWorkerRegistration] window object is undefined. Cannot register SW.');
    return;
  }
  console.log('[ServiceWorkerRegistration] window object is available.');
  console.log('[ServiceWorkerRegistration] isSecureContext:', window.isSecureContext);
  console.log('[ServiceWorkerRegistration] Location hostname:', window.location.hostname);
  console.log('[ServiceWorkerRegistration] Location protocol:', window.location.protocol);
  
  if (typeof navigator === 'undefined') {
    console.warn('[ServiceWorkerRegistration] navigator object is undefined. Cannot register SW.');
    return;
  }
  console.log('[ServiceWorkerRegistration] navigator object is available.');
  
  // Versuche, auf serviceWorker zuzugreifen und logge das Ergebnis
  let swApiAvailable = false;
  try {
      swApiAvailable = 'serviceWorker' in navigator;
      console.log('[ServiceWorkerRegistration] Check \'serviceWorker\' in navigator result:', swApiAvailable);
      if (!swApiAvailable) {
          console.log('[ServiceWorkerRegistration] Properties available in navigator:', Object.keys(navigator));
          // Falls vorhanden, logge serviceWorker explizit
          if (navigator.hasOwnProperty('serviceWorker')) {
             console.log('[ServiceWorkerRegistration] navigator.serviceWorker property value:', navigator.serviceWorker);
          } else {
             console.log('[ServiceWorkerRegistration] navigator does not have own property \'serviceWorker\'.');
          }
      }
  } catch (e) {
      console.error('[ServiceWorkerRegistration] Error checking for \'serviceWorker\' in navigator:', e);
  }
  // --- Ende detailliertes Debugging ---
  
  // Registrierung nur versuchen, wenn API verfügbar ist
  if (swApiAvailable) {
    const swUrl = `/sw.js?v=${SW_VERSION}`;
    console.log('[ServiceWorkerRegistration]', 'Registering Service Worker at:', swUrl);
    
    try {
      navigator.serviceWorker.register(swUrl)
        .then((registration) => {
          console.log('[ServiceWorkerRegistration]', 'Registration successful, scope is:', registration.scope);
          activeRegistration = registration; 
          setupListenersAndNotify(registration);
          
          if (typeof window !== 'undefined') {
             (window as any).__SW_REGISTRATION = registration;
          }
        })
        .catch((error) => {
          // Dieser Fehler wird nur ausgelöst, wenn register() selbst fehlschlägt (z.B. sw.js nicht gefunden)
          console.error("[ServiceWorkerRegistration]", "Fehler bei navigator.serviceWorker.register():", error);
        });
    } catch (error) {
        // Fängt Fehler ab, falls der Aufruf von register() selbst fehlschlägt
        console.error('[ServiceWorkerRegistration] Error calling navigator.serviceWorker.register():', error);
    }
  } else {
      console.warn("[ServiceWorkerRegistration]", "Service Worker API nicht verfügbar, Registrierung übersprungen.");
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
