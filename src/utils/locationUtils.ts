import postalCodes from 'switzerland-postal-codes';

export const getOrtNameByPlz = (plz: string | null | undefined): string | null => {
  if (!plz) {
    return null;
  }

  // Verwende die vollständige PLZ-Datenbank
  const ortName = postalCodes[plz];
  
  if (ortName) {
    // Debug-Logging entfernt
    return ortName;
  } else {
    // Debug-Logging entfernt
    return null;
  }
}; 