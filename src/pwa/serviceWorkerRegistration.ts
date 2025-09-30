// src/pwa/serviceWorkerRegistration.ts

// KEIN Store-Import mehr hier!

// Version wird zentral verwaltet
import { SW_VERSION } from '@/config/version.js';

// Globale Variable zur Speicherung der aktuellen Registrierung
let activeRegistration: ServiceWorkerRegistration | null = null;
let hasDispatchedInitialUpdate = false; // Verhindert mehrfache Initial-Updates

// Funktion zum Abrufen der aktuellen Registrierung (wird von PwaUpdateHandler verwendet)
export function getActiveRegistration(): ServiceWorkerRegistration | null {
  // console.log('[ServiceWorkerRegistration]', 'getActiveRegistration called, returning:', activeRegistration);
  return activeRegistration;
}

// Helper-Funktion, um das Event auszulösen
const dispatchUpdateReadyEvent = () => {
  console.log('[ServiceWorkerRegistration] dispatchUpdateReadyEvent CALLED');
  if (typeof window !== 'undefined') {
    const event = new CustomEvent('swUpdateReady'); 
    window.dispatchEvent(event);
    console.log('[ServiceWorkerRegistration] Dispatched swUpdateReady event.');
  }
};

// --- Listener-Logik ---
const setupListenersAndNotify = (registration: ServiceWorkerRegistration) => {

  activeRegistration = registration;
  
  // Prüfen, ob bereits ein wartender Worker vorhanden ist
  // ABER: Nur dispatchen, wenn es sich um einen echten Update handelt
  if (registration.waiting && !hasDispatchedInitialUpdate) {

    
    // Prüfe, ob der wartende Worker tatsächlich eine andere Version ist
    const currentWorker = registration.active;
    if (currentWorker && currentWorker.scriptURL !== registration.waiting.scriptURL) {

      dispatchUpdateReadyEvent();
      hasDispatchedInitialUpdate = true;
    }
  }

  // Lauschen auf neu gefundene Worker (die zu installieren beginnen)
  registration.addEventListener('updatefound', () => {
    if (process.env.NODE_ENV === 'development') {
      console.log("[ServiceWorkerRegistration] 'updatefound' event FIRED.");
    }
    const newWorker = registration.installing;
    if (newWorker) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[ServiceWorkerRegistration] New worker found during installation:', newWorker);
      }
      
      // Lauschen auf den 'statechange' des neuen Workers
      newWorker.addEventListener('statechange', () => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[ServiceWorkerRegistration] New worker state changed:', newWorker.state);
        }
        
        // Event erst auslösen, wenn der Worker installiert ist
        if (newWorker.state === 'installed') {
          if (process.env.NODE_ENV === 'development') {
            console.log('[ServiceWorkerRegistration] New worker finished installing.');
          }
          
          // Prüfe, ob es sich um einen echten Update handelt
          const currentWorker = registration.active;
          if (currentWorker && currentWorker.scriptURL !== newWorker.scriptURL) {
            if (process.env.NODE_ENV === 'development') {
              console.log('[ServiceWorkerRegistration] Real update detected - dispatching event.');
            }
            dispatchUpdateReadyEvent();
          } else {
            if (process.env.NODE_ENV === 'development') {
              console.log('[ServiceWorkerRegistration] Same worker version - no update event needed.');
            }
          }
        } else if (newWorker.state === 'activated') {
          if (process.env.NODE_ENV === 'development') {
            console.log('[ServiceWorkerRegistration] New worker activated.');
          }
        }
      });
    } else {

    }
  });


};
// --- Ende Listener-Logik ---

export function register() {
  // 🚫 DEAKTIVIERT: Diese Legacy-Registrierung ist durch serviceWorkerService ersetzt
  // Alle Service Worker Registrierungen laufen jetzt zentral über serviceWorkerService
  console.log('[serviceWorkerRegistration] Legacy-Registrierung deaktiviert - verwendet serviceWorkerService');
  return;

  // Legacy-Code bleibt zur Sicherheit erhalten, aber wird nicht ausgeführt
  const isDevelopment = process.env.NODE_ENV === 'development';

  
  if (isDevelopment) {

    return;
  }
  
  // 🚨 BROWSER-SCHUTZ: NIEMALS Service Worker im Browser registrieren!
  if (typeof window !== 'undefined') {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = (window.navigator as any).standalone === true;
    const isPWAInstalled = isStandalone || isIOSStandalone;
    
    if (!isPWAInstalled) {
      // Browser-Modus: Komplett deaktivieren
      console.log('[ServiceWorkerRegistration] Browser-Modus erkannt - Service Worker DEAKTIVIERT');
      return;
    }
  }
  
  // --- Detailliertes Debugging für PWA-Modus ---
  
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

          return; 
      }
  } catch (e) {
      // console.error('[ServiceWorkerRegistration] Error checking for \'serviceWorker\' in navigator:', e);
  }

  // ===== NEU =====
  // Funktion zur Registrierung des Service Workers
  const registerServiceWorker = () => {
    const swUrl = `/sw.js?v=${SW_VERSION}`;
    if (process.env.NODE_ENV === 'development') {
      console.log(`[ServiceWorkerRegistration] Attempting to register Service Worker: ${swUrl}`);
    }
    
    navigator.serviceWorker
      .register(swUrl)
      .then((registration) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[ServiceWorkerRegistration] Service Worker registered successfully:', registration);
        }
        setupListenersAndNotify(registration);
      })
      .catch((error) => {
        console.error('[ServiceWorkerRegistration] Service Worker registration failed:', error);
      });
  };
  
  // Prüfen, ob 'load' Event bereits abgefeuert wurde
  if (document.readyState === 'complete') {
    // Die Seite ist bereits geladen, sofort registrieren
    if (process.env.NODE_ENV === 'development') {
      console.log('[ServiceWorkerRegistration] Document already loaded (readyState=complete). Registering immediately.');
    }
    registerServiceWorker();
  } else {
    // Noch nicht geladen, auf 'load' Event warten
    if (process.env.NODE_ENV === 'development') {
      console.log('[ServiceWorkerRegistration] Document not yet loaded. Waiting for load event.');
    }
    window.addEventListener('load', () => {
      if (process.env.NODE_ENV === 'development') {
        console.log("[ServiceWorkerRegistration] 'load' event fired. Proceeding with registration.");
      }
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
