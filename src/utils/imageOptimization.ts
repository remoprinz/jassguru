/**
 * Utility für Bildoptimierung und Performance
 */

// Generiert eine sehr kleine Base64-kodierte Placeholder-Bild URL
// OPTIMIERT: Statischer Wert statt Funktionsaufruf bei jedem Render
const BLUR_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export const generateBlurPlaceholder = (width: number = 4, height: number = 4): string => {
  // Verwende statischen Placeholder für bessere Performance
  return BLUR_PLACEHOLDER;
};

// Optimierte Bildgrößen für verschiedene Anwendungsfälle
export const IMAGE_SIZES = {
  avatar: {
    small: 32,
    medium: 64,
    large: 128,
  },
  logo: {
    small: 64,
    medium: 128,
    large: 256,
  }
} as const;

// Generiert optimierte srcSet für responsive Bilder
export const generateSrcSet = (baseUrl: string, sizes: number[]): string => {
  // Da wir unoptimized: true verwenden, können wir keine Next.js Bildoptimierung nutzen
  // Stattdessen verwenden wir Firebase Storage Image Transformation (falls verfügbar)
  return sizes.map(size => `${baseUrl} ${size}w`).join(', ');
};

// 🚀 PERFORMANCE-FIX: Firebase Storage URL-Optimierung 
// WICHTIG: Keine URL-Modifikation, da das die Firebase Storage Token ungültig macht
export const getOptimizedImageUrl = (url: string, maxWidth: number): string => {
  if (!url) return url;
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname !== 'firebasestorage.googleapis.com') return url;
  } catch {
    return url;
  }
  
  // 🔥 RÜCKNAHME: URL-Modifikation macht Firebase Storage URLs ungültig
  // Das Caching muss komplett über den Service Worker laufen
  return url;
}; 