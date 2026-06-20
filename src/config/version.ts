// Zentrale Version-Verwaltung für die gesamte App
export const APP_VERSION = '3.0.0';

// Für Service Worker (mit 'v' Prefix)
export const SW_VERSION = `v${APP_VERSION}`;

// Für PWA Manifest
export const MANIFEST_VERSION = APP_VERSION;

// Für Package.json Updates (kann mit Scripts automatisiert werden)
export const PACKAGE_VERSION = APP_VERSION;

// Version-Info für Debugging
export const VERSION_INFO = {
  version: APP_VERSION,
  buildDate: new Date().toISOString(),
  environment: process.env.NODE_ENV || 'development',
} as const;

// Hilfsfunktion um Version zu loggen
export const logVersionInfo = () => {
  console.log('🚀 Jassguru App Version:', VERSION_INFO);
}; 