// Zentrale PWA-Detection für intelligente Feature-Unterscheidung

export interface PWAContext {
  isPWA: boolean;
  isStandalone: boolean;
  isBrowser: boolean;
  platform: 'ios' | 'android' | 'desktop' | 'unknown';
}

/**
 * Erkennt ob die App als PWA oder im Browser läuft
 */
export function detectPWAContext(): PWAContext {
  if (typeof window === 'undefined') {
    return {
      isPWA: false,
      isStandalone: false,
      isBrowser: true,
      platform: 'unknown'
    };
  }

  // PWA Detection
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                      (window.navigator as any).standalone === true ||
                      document.referrer.includes('android-app://');

  // Platform Detection
  const userAgent = navigator.userAgent.toLowerCase();
  let platform: PWAContext['platform'] = 'unknown';
  
  if (/iphone|ipad|ipod/.test(userAgent)) {
    platform = 'ios';
  } else if (/android/.test(userAgent)) {
    platform = 'android';
  } else if (/windows|mac|linux/.test(userAgent)) {
    platform = 'desktop';
  }

  return {
    isPWA: isStandalone,
    isStandalone,
    isBrowser: !isStandalone,
    platform
  };
}

/**
 * Prüft ob PWA-Features (wie Update-Notifications) angezeigt werden sollen
 */
export function shouldShowPWAFeatures(): boolean {
  const context = detectPWAContext();
  
  // PWA-Features nur in echten PWA-Umgebungen anzeigen
  return context.isPWA && (context.platform === 'ios' || context.platform === 'android');
}

/**
 * Prüft ob aggressive Cache-Invalidierung nötig ist
 */
export function shouldUseAggressiveCaching(): boolean {
  const context = detectPWAContext();
  
  // Aggressive Caching nur in PWA, im Browser normale Browser-Cache-Regeln
  return context.isPWA;
} 