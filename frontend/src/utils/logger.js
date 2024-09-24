// src/utils/logger.js

const logWithContext = (level, context, message, data = {}) => {
  const logMessage = `[${context}] ${message}`;
  switch (level) {
    case 'error':
      console.error(logMessage, data);
      break;
    case 'warn':
      console.warn(logMessage, data);
      break;
    case 'info':
      console.info(logMessage, data);
      break;
    case 'debug':
      if (process.env.NODE_ENV !== 'production') {
        console.debug(logMessage, data);
      }
      break;
  }
};

export const logError = (context, message, error = {}) => {
  logWithContext('error', context, message, error);
};

export const logWarning = (context, message, data = {}) => {
  logWithContext('warn', context, message, data);
};

export const logInfo = (context, message, data = {}) => {
  logWithContext('info', context, message, data);
};

export const logDebug = (context, message, data = {}) => {
  logWithContext('debug', context, message, data);
};
