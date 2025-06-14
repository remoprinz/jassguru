// src/pwa/serviceWorkerRegistration.ts

// KEIN Store-Import mehr hier!

// Version, die bei jedem Build inkrementiert werden sollte
const SW_VERSION = 'v2.1.0'; // Muss zur Version im sw-custom.js passen

// Globale Variable zur Speicherung der aktuellen Registrierung
let activeRegistration: ServiceWorkerRegistration | null = null;

// Funktion zum Abrufen der aktuellen Registrierung (wird von PwaUpdateHandler verwendet)
export function getActiveRegistration(): ServiceWorkerRegistration | null {
  // console.log('[ServiceWorkerRegistration]', 'getActiveRegistration called, returning:', activeRegistration);
  return activeRegistration;
}

// Helper-Funktion, um das Event auszulösen
const dispatchUpdateReadyEvent = () => {
  console.log('[ServiceWorkerRegistration] dispatchUpdateReadyEvent CALLED'); // LOG
  if (typeof window !== 'undefined') {
    const event = new CustomEvent('swUpdateReady'); 
    window.dispatchEvent(event);
    console.log('[ServiceWorkerRegistration]', 'Dispatched swUpdateReady event.'); // LOG
  }
};

// --- Listener-Logik ---
const setupListenersAndNotify = (registration: ServiceWorkerRegistration) => {
  console.log('[ServiceWorkerRegistration] setupListenersAndNotify CALLED for scope:', registration.scope); // LOG
  activeRegistration = registration; // Store the active registration
  
  // Prüfen, ob bereits ein wartender Worker vorhanden ist
  if (registration.waiting) {
    console.log('[ServiceWorkerRegistration]', 'Found waiting worker immediately (state:', registration.waiting.state, '). Dispatching event.'); // LOG
    dispatchUpdateReadyEvent();
  }

  // Lauschen auf neu gefundene Worker (die zu installieren beginnen)
  registration.addEventListener('updatefound', () => {
    console.log("[ServiceWorkerRegistration] 'updatefound' event FIRED."); // LOG
    const newWorker = registration.installing;
    if (newWorker) {
      console.log('[ServiceWorkerRegistration]', 'New worker found during installation:', newWorker); // LOG
      
      // Lauschen auf den 'statechange' des neuen Workers
      newWorker.addEventListener('statechange', () => {
        console.log('[ServiceWorkerRegistration]', 'Track new worker state changed:', newWorker.state); // LOG
        
        // Event erst auslösen, wenn der Worker installiert ist
        if (newWorker.state === 'installed') {
           console.log('[ServiceWorkerRegistration]', 'New worker finished installing.'); // LOG
           dispatchUpdateReadyEvent(); // Dispatch moved here
        } else if (newWorker.state === 'activated') {
           console.log('[ServiceWorkerRegistration]', 'New worker activated.'); // LOG
        }
      });
    } else {
      console.warn("[ServiceWorkerRegistration] 'updatefound' event fired but registration.installing is null."); // LOG
    }
  });

  // Log, dass Listener gesetzt wurden
  console.log('[ServiceWorkerRegistration] Event listeners (updatefound) attached.'); // LOG
};
// --- Ende Listener-Logik ---

export function register() {
  console.log('[ServiceWorkerRegistration] register() CALLED');
  const isDevelopment = process.env.NODE_ENV === 'development';
  // console.log('[ServiceWorkerRegistration]', 'Umgebung:', process.env.NODE_ENV, 'Entwicklungsmodus:', isDevelopment);
  
  if (isDevelopment) {
    // Simulation im Entwicklungsmodus
    // console.log('[ServiceWorkerRegistration]', 'Service Worker-Registrierung in der Entwicklungsumgebung übersprungen.');
    setTimeout(() => {
      // console.log('[ServiceWorkerRegistration]', 'Simulating swUpdateReady event for development...');
      dispatchUpdateReadyEvent();
    }, 5000);
    return;
  }
  
  // --- Detailliertes Debugging für Produktionsmodus ---
  
  if (typeof window === 'undefined') {
    // console.warn('[ServiceWorkerRegistration] window object is undefined. Cannot register SW.');
    return;
  }
  
  if (typeof navigator === 'undefined') {
    // console.warn('[ServiceWorkerRegistration] navigator object is undefined. Cannot register SW.');
    return;
  }
  
  // Versuche, auf serviceWorker zuzugreifen und logge das Ergebnis
  let swApiAvailable = false;
  try {
      swApiAvailable = 'serviceWorker' in navigator;
      // console.log('[ServiceWorkerRegistration] Check \'serviceWorker\' in navigator result:', swApiAvailable);
      if (!swApiAvailable) {
          console.log('[ServiceWorkerRegistration] Service Worker API not available in navigator. Exiting register().'); // LOG
          return; 
      }
  } catch (e) {
      // console.error('[ServiceWorkerRegistration] Error checking for \'serviceWorker\' in navigator:', e);
  }

  // ===== NEU =====
  // Funktion zur Registrierung des Service Workers
  const registerServiceWorker = () => {
    const swUrl = `/sw-custom.js?v=${SW_VERSION}`;
    console.log(`[ServiceWorkerRegistration] Attempting to register Service Worker: ${swUrl}`);
    
    navigator.serviceWorker
      .register(swUrl)
      .then((registration) => {
        console.log('[ServiceWorkerRegistration] Service Worker registered successfully:', registration);
        setupListenersAndNotify(registration);
      })
      .catch((error) => {
        console.error('[ServiceWorkerRegistration] Service Worker registration failed:', error);
      });
  };
  
  // Prüfen, ob 'load' Event bereits abgefeuert wurde
  if (document.readyState === 'complete') {
    // Die Seite ist bereits geladen, sofort registrieren
    console.log('[ServiceWorkerRegistration] Document already loaded (readyState=complete). Registering immediately.');
    registerServiceWorker();
  } else {
    // Noch nicht geladen, auf 'load' Event warten
    console.log('[ServiceWorkerRegistration] Document not yet loaded. Waiting for load event.');
    window.addEventListener('load', () => {
      console.log("[ServiceWorkerRegistration] 'load' event fired. Proceeding with registration.");
      registerServiceWorker();
    });
  }
  // ===== ENDE NEU =====
}

export function checkPWAStatus(): boolean {
  if (typeof window !== "undefined") {
    return window.matchMedia("(display-mode: standalone)").matches;
  }
  return false;
}

export function checkManifest(): void {
  const manifestLink = document.querySelector("link[rel=\"manifest\"]");
  // console.log("Manifest Link-Element:", manifestLink);

  if (manifestLink) {
    const manifestUrl = manifestLink.getAttribute("href") || "";
    fetch(manifestUrl)
      .then((response) => response.json())
      .then((data) => {/* Log entfernt */})
      .catch((error) => {/* Log entfernt */});
  } else {
    // console.log("Kein Manifest-Link gefunden");
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
        // console.error("Fehler beim Abmelden des Service Workers:", error);
      });
  }
}
