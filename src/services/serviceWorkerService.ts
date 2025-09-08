/**
 * 🛡️ BULLETPROOF Service Worker Management Service
 * 
 * Sichere Service Worker Registrierung mit:
 * - Race-Condition-freie Updates
 * - Graceful Fallbacks bei Fehlern  
 * - Intelligent Backoff-Strategies
 * - Zero-Downtime Updates
 * - Update-Hänger-Prevention
 */

interface ServiceWorkerConfig {
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
  onError?: (error: Error) => void;
}

// 🛡️ NEU: Update-Status für sichere State-Verwaltung
type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'activating' | 'error';

// 🛡️ NEU: Backoff-Strategy für fehlgeschlagene Updates
interface BackoffConfig {
  maxAttempts: number;
  delays: number[]; // in Millisekunden
  currentAttempt: number;
}

class ServiceWorkerService {
  private static instance: ServiceWorkerService;
  private registration: ServiceWorkerRegistration | null = null;
  private updateAvailable = false;
  
  // 🛡️ NEU: Sichere Update-State-Verwaltung
  private updateStatus: UpdateStatus = 'idle';
  private updatePromise: Promise<void> | null = null;
  private backoffConfig: BackoffConfig = {
    maxAttempts: 3,
    delays: [5000, 15000, 60000], // 5s, 15s, 60s
    currentAttempt: 0
  };
  
  // 🛡️ NEU: Update-Timeout Protection
  private updateTimeoutId: NodeJS.Timeout | null = null;
  private readonly UPDATE_TIMEOUT = 15000; // 15 Sekunden
  
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
   * Deregistriert alle Service Worker (für Browser-Cleanup)
   */
  async unregisterAll(): Promise<void> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      
      for (const registration of registrations) {
        await registration.unregister();
        console.log('[ServiceWorker] Service Worker deregistriert:', registration.scope);
      }
      
      // Cache cleanup
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        for (const cacheName of cacheNames) {
          await caches.delete(cacheName);
          console.log('[ServiceWorker] Cache gelöscht:', cacheName);
        }
      }
    } catch (error) {
      console.error('[ServiceWorker] Fehler beim Deregistrieren:', error);
    }
  }

  /**
   * Registriert Service Worker nur wenn im PWA-Modus
   */
  async register(config: ServiceWorkerConfig = {}): Promise<void> {
    // ✅ NEU: Service Worker auch im Browser-Modus registrieren, 
    // damit Runtime-Caching (Bilder) überall wirkt (PWA & Browser)
    // Hinweis: Die Registrierung bleibt weiterhin nur in Production aktiv (siehe unten)
    
    // Nur in Production
    if (process.env.NODE_ENV !== 'production') {
      return;
    }
    
    // Service Worker Support prüfen
    if (!('serviceWorker' in navigator)) {
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
      
      // 🛡️ Sichere periodische Update-Checks mit intelligenten Schutzmaßnahmen
      setInterval(() => {
        // Nur prüfen wenn nicht bereits aktiv und App sichtbar ist
        if (document.visibilityState === 'visible' && this.updateStatus === 'idle') {
          this.checkForUpdate();
        }
      }, 30 * 60 * 1000); // 30 Minuten
      
    } catch (error) {
      // Nur echte Fehler loggen
      console.error('[PWA] Service Worker Registrierung fehlgeschlagen:', error);
      if (config.onError) {
        config.onError(error as Error);
      }
    }
  }
  
  /**
   * 🛡️ BULLETPROOF Update-Aktivierung ohne Race Conditions
   */
  async activateUpdate(): Promise<void> {
    // 🛡️ Verhindere mehrfache gleichzeitige Updates
    if (this.updateStatus === 'activating' || this.updatePromise) {
      console.log('[PWA] Update bereits in Bearbeitung - warte auf Abschluss');
      return this.updatePromise || Promise.resolve();
    }

    if (!this.registration || !this.registration.waiting) {
      console.log('[PWA] Kein wartender Service Worker zum Aktivieren gefunden.');
      return;
    }

    this.updateStatus = 'activating';
    
    // 🛡️ Erstelle sichere Update-Promise mit Timeout-Protection
    this.updatePromise = new Promise<void>((resolve, reject) => {
      const waitingWorker = this.registration!.waiting!;
      let hasCompleted = false;

      // 🛡️ Timeout-Schutz gegen hängende Updates
      const timeoutId = setTimeout(() => {
        if (!hasCompleted) {
          hasCompleted = true;
          this.updateStatus = 'error';
          this.updatePromise = null;
          reject(new Error('Update-Timeout: Service Worker hat nicht rechtzeitig reagiert'));
        }
      }, this.UPDATE_TIMEOUT);

      // 🛡️ Sichere Controller-Change-Behandlung
      const onControllerChange = () => {
        if (hasCompleted) return; // Verhindere doppelte Ausführung
        hasCompleted = true;
        
        clearTimeout(timeoutId);
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        
        this.updateStatus = 'idle';
        this.updatePromise = null;
        this.backoffConfig.currentAttempt = 0; // Reset bei Erfolg
        
        console.log('[PWA] ✅ Service Worker Update erfolgreich aktiviert');
        
        // 🛡️ Graceful Page Reload mit kleiner Verzögerung
        setTimeout(() => {
          try {
            window.location.reload();
          } catch (error) {
            console.error('[PWA] Fehler beim Page Reload:', error);
            // Fallback: Hard-Navigation
            window.location.href = window.location.href;
          }
        }, 100);
        
        resolve();
      };

      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

      try {
        console.log('[PWA] 🚀 Sende SKIP_WAITING an Service Worker...');
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      } catch (error) {
        if (!hasCompleted) {
          hasCompleted = true;
          clearTimeout(timeoutId);
          navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
          this.updateStatus = 'error';
          this.updatePromise = null;
          reject(error);
        }
      }
    });

    try {
      await this.updatePromise;
    } catch (error) {
      console.error('[PWA] ❌ Update-Aktivierung fehlgeschlagen:', error);
      await this.handleUpdateError(error as Error);
      throw error;
    }
  }

  /**
   * 🛡️ NEU: Intelligente Error-Behandlung mit Backoff-Strategy
   */
  private async handleUpdateError(error: Error): Promise<void> {
    this.backoffConfig.currentAttempt++;
    
    if (this.backoffConfig.currentAttempt >= this.backoffConfig.maxAttempts) {
      console.error('[PWA] 🚫 Max Update-Versuche erreicht - gebe auf', {
        attempts: this.backoffConfig.currentAttempt,
        error: error.message
      });
      
      // Reset für nächste Update-Zyklen
      this.backoffConfig.currentAttempt = 0;
      return;
    }
    
    const delay = this.backoffConfig.delays[this.backoffConfig.currentAttempt - 1] || 60000;
    console.log(`[PWA] ⏰ Update-Retry in ${delay}ms (Versuch ${this.backoffConfig.currentAttempt})`);
    
    setTimeout(() => {
      this.activateUpdate().catch(console.error);
    }, delay);
  }

  /**
   * 🛡️ Sichere Update-Checks mit Backoff-Protection
   */
  async checkForUpdate(): Promise<void> {
    if (!this.registration) {
      console.log('[PWA] Keine Service Worker Registrierung für Update-Check gefunden.');
      return;
    }
    
    if (this.updateStatus === 'checking' || this.updateStatus === 'activating') {
      console.log('[PWA] Update-Check bereits aktiv - überspringe');
      return;
    }
    
    this.updateStatus = 'checking';
    
    try {
      console.log('[PWA] 🔍 Suche nach Updates...');
      await this.registration.update();
      this.updateStatus = 'idle';
    } catch (error) {
      this.updateStatus = 'error';
      console.error('[PWA] ❌ Fehler beim Suchen nach Updates:', error);
      
      // Backoff auch für Update-Checks
      const delay = Math.min(30000 * this.backoffConfig.currentAttempt, 300000); // Max 5 Minuten
      setTimeout(() => {
        this.updateStatus = 'idle';
      }, delay);
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