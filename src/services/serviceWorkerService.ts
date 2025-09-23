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
  private static isGloballyUpdating = false; // 🛡️ Eleganter Global Lock ohne "as any"
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
  private readonly UPDATE_TIMEOUT = 30000; // 30 Sekunden - Erhöht für langsamere Netzwerke
  
  // 🔁 Auto-Fallback-Konfiguration
  private readonly FAIL_COUNT_KEY = 'swActivationFailures';
  private readonly MAX_FAILS_BEFORE_KILL = 2;
  
  private constructor() {}
  
  static getInstance(): ServiceWorkerService {
    if (!ServiceWorkerService.instance) {
      ServiceWorkerService.instance = new ServiceWorkerService();
    }
    return ServiceWorkerService.instance;
  }
  
  // ===== Helper: Persistente Fehlversuchs-Zählung =====
  private getActivationFailCount(): number {
    try {
      const raw = localStorage.getItem(this.FAIL_COUNT_KEY);
      const n = raw ? parseInt(raw, 10) : 0;
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }

  private setActivationFailCount(count: number): void {
    try {
      localStorage.setItem(this.FAIL_COUNT_KEY, String(Math.max(0, count)));
    } catch {}
  }

  private resetActivationFailCount(): void {
    this.setActivationFailCount(0);
  }

  private handleActivationFailureAndMaybeKill(): void {
    const next = this.getActivationFailCount() + 1;
    this.setActivationFailCount(next);
    
    // Verhindere Redirect-Schleifen: wenn wir bereits auf kill-sw.html sind, nichts tun
    const onKillPage = typeof window !== 'undefined' && window.location.pathname.endsWith('/kill-sw.html');
    if (onKillPage) {
      return;
    }
    
    if (next >= this.MAX_FAILS_BEFORE_KILL) {
      // Zähler zurücksetzen und harten Cleanup triggern
      this.resetActivationFailCount();
      try {
        window.location.href = '/kill-sw.html';
      } catch {
        // Fallback: normales Reload
        try { window.location.reload(); } catch {}
      }
    }
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
   * 🛡️ BULLETPROOF: Bereinigt Legacy Service Worker mit /pwa/ Scope
   */
  private async cleanupLegacyServiceWorkers(): Promise<void> {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      
      for (const registration of registrations) {
        const scriptURL = registration.active?.scriptURL || '';
        
        // Legacy-Registrierungen mit /pwa/ Scope ODER /pwa/sw.js Script deregistrieren
        if (registration.scope.includes('/pwa/') || scriptURL.includes('/pwa/sw.js')) {
          // console.log('[ServiceWorker] 🧹 Bereinige Legacy SW:', {
          //   scope: registration.scope,
          //   script: scriptURL
          // });
          await registration.unregister();
        }
      }
    } catch (error) {
      console.warn('[ServiceWorker] Legacy cleanup fehlgeschlagen (nicht kritisch):', error);
    }
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
        // console.log('[ServiceWorker] Service Worker deregistriert:', registration.scope);
      }
      
      // Cache cleanup
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        for (const cacheName of cacheNames) {
          await caches.delete(cacheName);
          // console.log('[ServiceWorker] Cache gelöscht:', cacheName);
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

    // Hard-Bypass wenn ?no-sw=1 aktiv ist (Failsafe nach Hänger)
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('no-sw') === '1') {
        // console.warn('[PWA] Service Worker Registrierung übersprungen wegen ?no-sw=1');
        return;
      }
    } catch {}

    // 🛡️ BULLETPROOF: Legacy Service Worker Cleanup
    await this.cleanupLegacyServiceWorkers();
    
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
            // 🛡️ FIX: Update-Notifications auch im Browser-Modus ermöglichen
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
    // 🛡️ Elegante Verhinderung mehrfacher gleichzeitiger Updates
    if (this.updateStatus === 'activating' || this.updatePromise) {
      // console.log('[PWA] Update bereits in Bearbeitung - warte auf Abschluss');
      return this.updatePromise || Promise.resolve();
    }

    // 🛡️ TypeScript-konforme Global Lock-Prüfung
    if (ServiceWorkerService.isGloballyUpdating) {
      // console.log('[PWA] Update bereits global in Bearbeitung - überspringe');
      return Promise.resolve();
    }

    if (!this.registration || !this.registration.waiting) {
      // console.log('[PWA] Kein wartender Service Worker zum Aktivieren gefunden. Führe sicheren Hard-Reload durch...');
      try {
        const alreadyReloaded = (() => {
          try { return sessionStorage.getItem('pwaUpdateReloaded') === '1'; } catch { return false; }
        })();
        if (!alreadyReloaded) {
          try { sessionStorage.setItem('pwaUpdateReloaded', '1'); } catch {}
          // Fallback: Wenn der SW bereits skipWaiting() nutzt (z. B. iOS/next-pwa),
          // existiert oft kein "waiting". Ein Hard-Reload lädt die neue Version dennoch zuverlässig.
          window.location.href = window.location.href.split('?')[0] + '?updated=' + Date.now();
        }
      } catch (err) {
        // Als letzte Rückfallebene normales Reload versuchen
        try {
          window.location.reload();
        } catch (_) {}
      }
      return;
    }

    this.updateStatus = 'activating';
    ServiceWorkerService.isGloballyUpdating = true; // 🛡️ TypeScript-konformer Global Lock
    
    // 🛡️ Erstelle sichere Update-Promise mit Timeout-Protection
    this.updatePromise = new Promise<void>((resolve, reject) => {
      const waitingWorker = this.registration!.waiting!;
      let hasCompleted = false;

      // 🛡️ Timeout-Schutz gegen hängende Updates mit sanftem Fallback
      const timeoutId = setTimeout(() => {
        if (!hasCompleted) {
          hasCompleted = true;
          this.updateStatus = 'idle';
          this.updatePromise = null;
          ServiceWorkerService.isGloballyUpdating = false; // 🛡️ Eleganter Lock-Reset
          
          navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
          
          // console.warn('[PWA] ⚠️ Service Worker Update-Timeout - versuche Fallback-Aktivierung...');
          
          // 🔁 Auto-Fallback-Zähler erhöhen und ggf. Kill-Switch auslösen
          this.handleActivationFailureAndMaybeKill();

          // 🛡️ BULLETPROOF FALLBACK: Hard Reload auch bei Timeout (einmalig)
          try {
            const alreadyReloaded = (() => { try { return sessionStorage.getItem('pwaUpdateReloaded') === '1'; } catch { return false; } })();
            if (!alreadyReloaded) {
              try { sessionStorage.setItem('pwaUpdateReloaded', '1'); } catch {}
              window.location.href = window.location.href.split('?')[0] + '?updated=' + Date.now();
            }
          } catch (fallbackError) {
            // console.warn('[PWA] Fallback-Reload fehlgeschlagen, aber kein kritischer Fehler:', fallbackError);
          }
          
          // IMMER als Erfolg behandeln - keine kritischen Fehler mehr
          resolve();
        }
      }, this.UPDATE_TIMEOUT);

      // 🛡️ Sichere Controller-Change-Behandlung
      const onControllerChange = () => {
        if (hasCompleted) return; // Verhindere doppelte Ausführung
        hasCompleted = true;
        
        clearTimeout(timeoutId);
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        navigator.serviceWorker.removeEventListener('message', onSWMessage);
        
        this.updateStatus = 'idle';
        this.updatePromise = null;
        this.backoffConfig.currentAttempt = 0; // Reset bei Erfolg
        ServiceWorkerService.isGloballyUpdating = false; // 🛡️ Eleganter Lock-Reset
        
        // console.log('[PWA] ✅ Service Worker Update erfolgreich aktiviert, lade Seite neu...');
        
        // Erfolg -> Fehlversuche zurücksetzen
        this.resetActivationFailCount();

        // 🛡️ BULLETPROOF: Hard Reload mit Cache-Bypass (einmalig)
        try { sessionStorage.setItem('pwaUpdateReloaded', '1'); } catch {}
        window.location.href = window.location.href.split('?')[0] + '?updated=' + Date.now();
        
        resolve();
      };

      // 🛡️ NEU: ACK-Kanal vom SW (public/sw-ext.js) – besonders für iOS/Safari
      const onSWMessage = (event: MessageEvent) => {
        try {
          const data: any = (event as any).data;
          if (!data || typeof data !== 'object') return;
          if (data.type === 'SW_ACTIVATED' && !hasCompleted) {
            onControllerChange();
          }
        } catch (_) {
          // ignore
        }
      };
      navigator.serviceWorker.addEventListener('message', onSWMessage);

      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

      try {
        // console.log('[PWA] 🚀 Sende SKIP_WAITING an Service Worker...');
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      } catch (error) {
        if (!hasCompleted) {
          hasCompleted = true;
          clearTimeout(timeoutId);
          navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
          this.updateStatus = 'error';
          this.updatePromise = null;
          ServiceWorkerService.isGloballyUpdating = false; // 🛡️ Eleganter Lock-Reset
          // 🔁 Auto-Fallback-Zähler erhöhen und ggf. Kill-Switch auslösen
          this.handleActivationFailureAndMaybeKill();
          reject(error);
        }
      }
    });

    try {
      await this.updatePromise;
    } catch (error) {
      console.error('[PWA] ❌ Update-Aktivierung fehlgeschlagen:', error);
      // 🛡️ Sicherheitsreset: Eleganter Lock-Reset falls noch gesetzt
      ServiceWorkerService.isGloballyUpdating = false;
      this.updateStatus = 'idle';
      this.updatePromise = null;
      // Fehler wird bereits in der Promise-Logik behandelt. Hier nur weiterwerfen.
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
    // console.log(`[PWA] ⏰ Update-Retry in ${delay}ms (Versuch ${this.backoffConfig.currentAttempt})`);
    
    setTimeout(() => {
      this.activateUpdate().catch(console.error);
    }, delay);
  }

  /**
   * 🛡️ Sichere Update-Checks mit Backoff-Protection
   */
  async checkForUpdate(): Promise<void> {
    if (!this.registration) {
      // console.log('[PWA] Keine Service Worker Registrierung für Update-Check gefunden.');
      return;
    }
    
    if (this.updateStatus === 'checking' || this.updateStatus === 'activating') {
      // console.log('[PWA] Update-Check bereits aktiv - überspringe');
      return;
    }
    
    this.updateStatus = 'checking';
    
    try {
      // console.log('[PWA] 🔍 Suche nach Updates...');
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