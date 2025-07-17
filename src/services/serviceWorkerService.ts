/**
 * Service Worker Management Service
 * 
 * Intelligente, sichere Service Worker Registrierung mit:
 * - Konditionale Registrierung (nur in PWA-Modus)
 * - Automatische Update-Erkennung
 * - Fehler-Recovery
 * - Version-Tracking
 */

interface ServiceWorkerConfig {
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
  onError?: (error: Error) => void;
}

class ServiceWorkerService {
  private static instance: ServiceWorkerService;
  private registration: ServiceWorkerRegistration | null = null;
  private updateAvailable = false;
  
  private constructor() {}
  
  static getInstance(): ServiceWorkerService {
    if (!ServiceWorkerService.instance) {
      ServiceWorkerService.instance = new ServiceWorkerService();
    }
    return ServiceWorkerService.instance;
  }
  
  /**
   * Prüft ob die App im PWA-Modus läuft
   */
  isPWAMode(): boolean {
    // Mehrere Checks für maximale Zuverlässigkeit
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isFullscreen = window.matchMedia('(display-mode: fullscreen)').matches;
    const isMinimalUI = window.matchMedia('(display-mode: minimal-ui)').matches;
    
    // iOS Safari spezifischer Check
    const isIOSPWA = ('standalone' in window.navigator) && 
                     (window.navigator as any).standalone === true;
    
    return isStandalone || isFullscreen || isMinimalUI || isIOSPWA;
  }
  
  /**
   * Registriert Service Worker nur wenn im PWA-Modus
   */
  async register(config: ServiceWorkerConfig = {}): Promise<void> {
    // Nur in Production
    if (process.env.NODE_ENV !== 'production') {
      return;
    }
    
    // Service Worker Support prüfen
    if (!('serviceWorker' in navigator)) {
      return;
    }
    
    // NUR im PWA-Modus registrieren
    if (!this.isPWAMode()) {
      // Entferne den Log für Browser-Modus
      return;
    }
    
    // Service Worker registrieren - nur in PWA
    try {
      // Warte bis die Seite geladen ist
      await new Promise<void>((resolve) => {
        if (document.readyState === 'complete') {
          resolve();
        } else {
          window.addEventListener('load', () => resolve());
        }
      });
      
      // Service Worker registrieren
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      
      this.registration = registration;
      
      // Update-Mechanismus
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // Neuer Service Worker bereit
            this.updateAvailable = true;
            if (config.onUpdate) {
              config.onUpdate(registration);
            }
          }
        });
      });
      
      // Erfolgs-Callback
      if (config.onSuccess) {
        config.onSuccess(registration);
      }
      
      // Periodische Update-Checks (alle 30 Minuten)
      setInterval(() => {
        registration.update();
      }, 30 * 60 * 1000);
      
    } catch (error) {
      // Nur echte Fehler loggen
      console.error('[PWA] Service Worker Registrierung fehlgeschlagen:', error);
      if (config.onError) {
        config.onError(error as Error);
      }
    }
  }
  
  /**
   * Führt ein Service Worker Update durch
   */
  async update(): Promise<void> {
    if (!this.registration) {
      return;
    }
    
    try {
      await this.registration.update();
      
      // Wenn Update verfügbar, aktiviere es
      if (this.updateAvailable && this.registration.waiting) {
        // Sende Skip-Waiting Nachricht
        this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        
        // Warte auf Aktivierung
        await new Promise<void>((resolve) => {
          const onControllerChange = () => {
            window.location.reload();
            resolve();
          };
          navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
        });
      }
    } catch (error) {
      console.error('[PWA] Update fehlgeschlagen:', error);
    }
  }
  
  /**
   * Deregistriert Service Worker (für Notfälle)
   */
  async unregister(): Promise<void> {
    if (!this.registration) return;
    
    try {
      const success = await this.registration.unregister();
      if (success) {
        this.registration = null;
      }
    } catch (error) {
      console.error('[PWA] Deregistrierung fehlgeschlagen:', error);
    }
  }
  
  /**
   * Prüft ob ein Update verfügbar ist
   */
  hasUpdate(): boolean {
    return this.updateAvailable;
  }
  
  /**
   * Gibt die aktuelle Service Worker Registrierung zurück
   */
  getRegistration(): ServiceWorkerRegistration | null {
    return this.registration;
  }
}

export const serviceWorkerService = ServiceWorkerService.getInstance();
export type { ServiceWorkerConfig }; 