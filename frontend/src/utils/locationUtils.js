import { logError, logInfo } from '@/utils/logger';

export async function holeOrtsname(latitude, longitude) {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=de`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.address.city || data.address.town || data.address.village || 'Unbekannt';
  } catch (error) {
    logError('locationUtils', 'Fehler beim Abrufen des Ortsnamens', error);
    return 'Nicht verfügbar';
  }
}

export function ermittleStandort() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const ortsname = await holeOrtsname(latitude, longitude);
        logInfo('locationUtils', 'Standort ermittelt', { ortsname, latitude, longitude });
        resolve({ ortsname, latitude, longitude });
      },
      (error) => {
        logError('locationUtils', 'Fehler bei der Standortermittlung', error);
        reject(error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}