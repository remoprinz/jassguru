// Interface für iOS Navigator mit standalone-Eigenschaft
interface IosNavigator extends Navigator {
  standalone?: boolean;
}

export const isPWA = (): boolean => {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as IosNavigator).standalone ||
    document.referrer.includes("android-app://") ||
    isCapacitorApp()
  );
};

/**
 * Capacitor-native App (iOS/Android via @capacitor/core).
 * Läuft in WKWebView/Android-WebView ohne PWA-Standalone-Mode-Flag,
 * verhält sich aber semantisch wie eine PWA → wird hier so behandelt.
 */
export const isCapacitorApp = (): boolean => {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
};

export const isIOS = (): boolean => {
  if (typeof window === "undefined") return false;
  
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};
