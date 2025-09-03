/**
 * Image Performance Utilities
 * Optimierungen für schnellere Bildladezeiten
 */

/**
 * Preload kritische Bilder für bessere Performance
 * Sollte für Hauptprofilbilder und Gruppenlogos verwendet werden
 */
export const preloadImage = (url: string): void => {
  if (typeof window === 'undefined' || !url) return;
  
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = url;
  document.head.appendChild(link);
};

/**
 * Lazy Load Images mit Intersection Observer
 * Für bessere Performance bei langen Listen
 */
export const setupLazyLoading = (): void => {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;

  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target as HTMLImageElement;
        const src = img.dataset.src;
        
        if (src) {
          img.src = src;
          img.removeAttribute('data-src');
          observer.unobserve(img);
        }
      }
    });
  }, {
    rootMargin: '50px 0px', // Start loading 50px before entering viewport
    threshold: 0.01
  });

  // Observe all images with data-src
  document.querySelectorAll('img[data-src]').forEach(img => {
    imageObserver.observe(img);
  });
};

/**
 * Optimierte Firebase Storage URL mit Größenparametern
 * Nutzt Firebase's Image Serving API (falls verfügbar)
 */
export const getOptimizedFirebaseUrl = (
  originalUrl: string, 
  width?: number,
  format: 'webp' | 'jpeg' = 'jpeg'
): string => {
  if (!originalUrl || !originalUrl.includes('firebasestorage.googleapis.com')) {
    return originalUrl;
  }

  // Firebase Storage unterstützt leider keine direkte Bildtransformation
  // Aber wir können die URL für CDN-Caching optimieren
  try {
    const url = new URL(originalUrl);
    
    // Füge Cache-Buster nur bei Bedarf hinzu
    // url.searchParams.set('t', Date.now().toString());
    
    return url.toString();
  } catch {
    return originalUrl;
  }
};

/**
 * Progressive Image Loading
 * Lädt erst eine kleine Version, dann die volle Auflösung
 */
export class ProgressiveImageLoader {
  private loadedImages = new Set<string>();

  loadImage(
    thumbnailUrl: string,
    fullUrl: string,
    onLoad?: (url: string) => void
  ): void {
    // Skip if already loaded
    if (this.loadedImages.has(fullUrl)) {
      onLoad?.(fullUrl);
      return;
    }

    // Load thumbnail first
    const thumbnailImg = new Image();
    thumbnailImg.src = thumbnailUrl;
    
    // Then load full image
    const fullImg = new Image();
    fullImg.onload = () => {
      this.loadedImages.add(fullUrl);
      onLoad?.(fullUrl);
    };
    fullImg.src = fullUrl;
  }

  preloadImages(urls: string[]): void {
    urls.forEach(url => {
      if (!this.loadedImages.has(url)) {
        const img = new Image();
        img.onload = () => this.loadedImages.add(url);
        img.src = url;
      }
    });
  }
}

// Singleton instance
export const imageLoader = new ProgressiveImageLoader();

/**
 * Service Worker Message für Cache-Verwaltung
 */
export const clearImageCache = async (): Promise<void> => {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CLEAR_IMAGE_CACHE'
    });
  }
  
  // Zusätzlich Browser-Cache leeren
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    const imageCaches = cacheNames.filter(name => 
      name.includes('image') || name.includes('firebase-user-images')
    );
    
    await Promise.all(
      imageCaches.map(cacheName => caches.delete(cacheName))
    );
  }
};

/**
 * Überprüfe ob Bild im Cache ist
 */
export const isImageCached = async (url: string): Promise<boolean> => {
  if (!('caches' in window)) return false;
  
  try {
    const cache = await caches.open('firebase-user-images');
    const response = await cache.match(url);
    return !!response;
  } catch {
    return false;
  }
};

/**
 * Prefetch wichtige Bilder für offline Verfügbarkeit
 */
export const prefetchImages = async (urls: string[]): Promise<void> => {
  if (!('caches' in window)) return;
  
  try {
    const cache = await caches.open('firebase-user-images');
    await cache.addAll(urls);
  } catch (error) {
    console.warn('Failed to prefetch images:', error);
  }
};
