// src/utils/logger.js

// Dynamischer Zugriff auf den Store
const getStore = () => require('@/store').default;

// Fehler-Logging mit Benachrichtigung an den Benutzer
export const logError = (context, error, additionalInfo = {}) => {
  console.error(`[${context}] Fehler:`, {
    nachricht: error?.message || 'Unbekannter Fehler',
    stack: error?.stack || 'Keine Stack-Informationen verfügbar',
    ...additionalInfo
  });

  let nachricht = 'Ein unerwarteter Fehler ist aufgetreten.';
  let farbe = 'error';  // Standardfarbe für Fehler

  if (error?.response?.data?.message) {
    nachricht = error.response.data.message;
  } else if (error?.message) {
    nachricht = error.message;
  }

  // Dynamischer Store-Zugriff
  getStore().dispatch('snackbar/showSnackbar', {
    nachricht,
    farbe,
    timeout: 5000
  });
};

// Debugging-Logs, die **nur** in der Konsole erscheinen
export const logDebug = (context, nachricht, additionalInfo = {}) => {
  if (process.env.NODE_ENV !== 'production') {
    console.debug(`[${context}] Debug:`, nachricht, additionalInfo);
  }
};

// Info-Logging, das **nur für Benutzerrelevante Informationen** die Snackbar anzeigt
export const logInfo = (context, nachricht, additionalInfo = {}, zeigeInSnackbar = false) => {
  console.log(`[${context}] Info:`, nachricht, additionalInfo);

  if (zeigeInSnackbar) {
    getStore().dispatch('snackbar/showSnackbar', {
      nachricht,
      farbe: 'info',
      timeout: 3000
    });
  }
};

export const logWarnung = (context, nachricht, additionalInfo = {}) => {
  console.warn(`[${context}] Warnung:`, nachricht, additionalInfo);
};
