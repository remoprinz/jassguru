export const isDev = process.env.NODE_ENV === 'development';

// Optional: Spezifischer Dev-Flag für PWA-Testing
export const FORCE_PWA_INSTALL = isDev ? false : true; // Entwickler können dies manuell auf true setzen 