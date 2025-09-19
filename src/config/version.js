// 🛡️ BULLETPROOF: Zentrale Version-Verwaltung für die gesamte App
// Diese JavaScript-Datei wird sowohl von next.config.js als auch von TypeScript-Code verwendet

export const APP_VERSION = '2.1.4'; // 🛡️ BULLETPROOF: Legacy-SW Cleanup

// Für Service Worker (mit 'v' Prefix)
export const SW_VERSION = `v${APP_VERSION}`;

// Für PWA Manifest
export const MANIFEST_VERSION = APP_VERSION;

// Für Package.json Updates (kann mit Scripts automatisiert werden)
export const PACKAGE_VERSION = APP_VERSION;

// Build-Timestamp (wird beim Build gesetzt)
export const BUILD_TIMESTAMP = Date.now();

// Version-Info für Debugging
export const VERSION_INFO = {
  version: APP_VERSION,
  buildDate: new Date().toISOString(),
  environment: process.env.NODE_ENV || 'development',
};

// Hilfsfunktion um Version zu loggen
export const logVersionInfo = () => {
  console.log('🚀 Jassguru App Version:', VERSION_INFO);
};
