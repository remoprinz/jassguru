/**
 * Utility für Bildoptimierung und Performance
 */

// Generiert eine sehr kleine Base64-kodierte Placeholder-Bild URL
export const generateBlurPlaceholder = (width: number = 4, height: number = 4): string => {
  // Transparentes 1x1 Pixel GIF als ultraleichter Placeholder
  return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
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

// Fügt Query-Parameter für Größenbeschränkung hinzu (Firebase Storage)
export const getOptimizedImageUrl = (url: string, maxWidth: number): string => {
  if (!url || !url.includes('firebasestorage.googleapis.com')) {
    return url;
  }
  
  // Firebase Storage unterstützt keine direkte Bildtransformation
  // Wir müssen die Bilder beim Upload optimieren
  return url;
}; 