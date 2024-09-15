// src/utils/logger.js

// Dynamischer Zugriff auf den Store
const getStore = () => require('@/store').default;

// Fehler-Logging mit Benachrichtigung an den Benutzer
export const logError = (context, error, additionalInfo = {}) => {
  console.error(`[${context}] Error:`, {
    message: error?.message || 'Unbekannter Fehler',
    stack: error?.stack || 'Keine Stack-Informationen verfügbar',
    ...additionalInfo
  });

  let message = 'Ein unerwarteter Fehler ist aufgetreten.';
  let color = 'error';  // Standardfarbe für Fehler

  if (error?.response?.data?.message) {
    message = error.response.data.message;
  } else if (error?.message) {
    message = error.message;
  }

  // Dynamischer Store-Zugriff
  getStore().dispatch('snackbar/showSnackbar', {
    message,
    color,
    timeout: 5000
  });
};

// Debugging-Logs, die **nur** in der Konsole erscheinen
export const logDebug = (context, message, additionalInfo = {}) => {
  console.debug(`[${context}] Debug:`, message, additionalInfo);
};

// Info-Logging, das **nur für Benutzerrelevante Informationen** die Snackbar anzeigt
export const logInfo = (context, message, additionalInfo = {}, showInSnackbar = false) => {
  console.log(`[${context}] Info:`, message, additionalInfo);

  if (showInSnackbar) {
    getStore().dispatch('snackbar/showSnackbar', {
      message,
      color: 'info',
      timeout: 3000
    });
  }
};

export const logWarning = (context, message, additionalInfo = {}) => {
  console.warn(`[${context}] Warning:`, message, additionalInfo);
};
