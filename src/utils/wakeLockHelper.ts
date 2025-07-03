// Wake Lock Browser Support & Debug Helper
import { isIOS } from './browserDetection';

export interface WakeLockStatus {
  isSupported: boolean;
  isActive: boolean;
  browserInfo: string;
  platform: string;
  error?: string;
}

export const getWakeLockStatus = async (): Promise<WakeLockStatus> => {
  const platform = navigator.platform;
  const userAgent = navigator.userAgent;
  const browserInfo = `${userAgent.substring(0, 100)}...`;
  
  const status: WakeLockStatus = {
    isSupported: false,
    isActive: false,
    browserInfo,
    platform,
  };

  try {
    if (!('wakeLock' in navigator)) {
      status.error = 'Wake Lock API nicht verfügbar';
      return status;
    }

    status.isSupported = true;

    // Versuche Wake Lock zu aktivieren (Test)
    const testLock = await navigator.wakeLock.request('screen');
    status.isActive = true;
    
    // Sofort wieder freigeben (war nur ein Test)
    await testLock.release();
    
    return status;
  } catch (error: any) {
    status.error = `Wake Lock Fehler: ${error.message}`;
    return status;
  }
};

// Hilfsfunktion für Browser-Support-Check
export const supportsWakeLock = (): boolean => {
  return typeof window !== 'undefined' && 'wakeLock' in navigator;
}; 