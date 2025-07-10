import postalCodes from 'switzerland-postal-codes';

export const getOrtNameByPlz = (plz: string | null | undefined): string | null => {
  if (!plz) {
    return null;
  }

  // Verwende die vollständige PLZ-Datenbank
  const ortName = postalCodes[plz];
  
  if (ortName) {
    // Debug-Logging nur in Development-Mode
    if (process.env.NODE_ENV === 'development') {
    console.log(`[LocationUtils] PLZ ${plz} => ${ortName}`);
    }
    return ortName;
  } else {
    // Warnung nur bei unbekannten PLZ in Development
    if (process.env.NODE_ENV === 'development') {
    console.log(`[LocationUtils] PLZ ${plz} nicht in der Datenbank gefunden`);
    }
    return null;
  }
}; 