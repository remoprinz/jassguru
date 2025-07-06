// iOS Bildschirmsperre Notification Helper
import { isIOS } from './browserDetection';
import { useUIStore } from '../store/uiStore';

// App-Version für localStorage Key (bei App-Updates wird Notification wieder angezeigt)
const APP_VERSION = '2024.12.24'; // Bei jedem größeren Update ändern
const IOS_SCREEN_LOCK_WARNING_KEY = `ios_screen_lock_warning_${APP_VERSION}`;

// Debug-Funktion für localStorage
export const debugiOSNotificationStorage = (): void => {
  const key = IOS_SCREEN_LOCK_WARNING_KEY;
  const value = localStorage.getItem(key);
  const uiState = useUIStore.getState().iosNotification;
  console.log('🔍 [iOS Notification Debug]', { 
    key, 
    localStorage: value, 
    uiStore: uiState,
    APP_VERSION 
  });
};

export interface iOSNotificationOptions {
  onDismiss?: () => void;
  onDontShowAgain?: () => void;
}

// Prüfe localStorage und synchronisiere mit uiStore beim App-Start
const syncLocalStorageWithStore = (): void => {
  try {
    const hasBeenDismissed = localStorage.getItem(IOS_SCREEN_LOCK_WARNING_KEY);
    if (hasBeenDismissed) {
      useUIStore.getState().setIOSNotificationDontShowAgain(true);
      console.log('🔄 [iOS Notification] localStorage → uiStore sync: dismissed');
    }
  } catch (error) {
    console.error('❌ [iOS Notification] Fehler beim Synchronisieren von localStorage:', error);
  }
};

export const shouldShowiOSScreenLockWarning = (): boolean => {
  // Nur auf iOS-Geräten anzeigen
  if (!isIOS()) {
    return false;
  }
  
  // Synchronisiere localStorage mit uiStore beim ersten Aufruf
  syncLocalStorageWithStore();
  
  // Verwende uiStore als Single Source of Truth
  const shouldShow = useUIStore.getState().shouldShowIOSNotification();
  
  // iOS Notification Status ermittelt
  
  return shouldShow;
};

export const markiOSScreenLockWarningAsShown = (): void => {
  try {
    // 1. localStorage für Persistierung zwischen App-Starts
    localStorage.setItem(IOS_SCREEN_LOCK_WARNING_KEY, 'true');
    
    // 2. uiStore für aktuelle Session
    useUIStore.getState().setIOSNotificationDontShowAgain(true);
    
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('❌ [iOS Notification] Fehler beim Speichern:', error);
    }
  }
};

export const resetiOSScreenLockWarning = (): void => {
  localStorage.removeItem(IOS_SCREEN_LOCK_WARNING_KEY);
  useUIStore.getState().setIOSNotificationDontShowAgain(false);
  useUIStore.getState().resetIOSNotificationForSession();
  console.log('🔄 [iOS Notification] Reset completed');
};

// REAKTIVE VERSION - State wird dynamisch über GlobalNotificationContainer verwaltet
export const createSimpleiOSScreenLockNotification = (
  onButtonClick: () => void
) => {
  return {
    type: 'info' as const,
    message: `💡 iOS Tipp: Bildschirmsperre deaktivieren

🔧 Schnelle Lösung:
Einstellungen > Anzeige & Helligkeit
> Automatische Sperre > Nie

⏰ So bleibt der Bildschirm während der Jass-Partie aktiv!`,
    actions: [
      {
        label: 'Verstanden',
        onClick: () => {
          const currentState = useUIStore.getState().iosNotification.dontShowAgain;
          console.log('🎯 [iOS Notification] Verstanden-Button geklickt. Dont Show Again:', currentState);
          
          if (currentState) {
            markiOSScreenLockWarningAsShown();
            console.log('📝 [iOS Notification] Warnung dauerhaft ausgeblendet');
          }
          
          onButtonClick();
        },
      },
    ],
    // SPEZIELLE KENNUNG für iOS-Notification - GlobalNotificationContainer übernimmt Checkbox-Handling
    isIOSNotification: true,
    preventClose: false,
    duration: 0,
  };
}; 