/**
 * Browser-spezifische Fixes für Chrome und andere Browser
 */

export const fixChromeScaling = () => {
  // Prüfe ob wir in Chrome sind
  const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
  
  if (isChrome && typeof window !== 'undefined') {
    // Chrome-spezifische Fixes
    const html = document.documentElement;
    
    // Setze explizite Schriftgröße
    html.style.fontSize = '16px';
    html.style.setProperty('-webkit-text-size-adjust', '100%');
    html.style.setProperty('text-size-adjust', '100%');
    
    // Verhindere automatische Zoom-Anpassung
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      viewport.setAttribute('content', 
        'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
      );
    }
    
    // Chrome-spezifische CSS-Klasse hinzufügen
    html.classList.add('chrome-browser');
    
    console.log('🔧 Chrome-spezifische Skalierungs-Fixes angewendet');
  }
};

export const detectBrowserScaling = () => {
  if (typeof window === 'undefined') return null;
  
  const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
  const isSafari = /Safari/.test(navigator.userAgent) && /Apple Computer/.test(navigator.vendor);
  const isFirefox = /Firefox/.test(navigator.userAgent);
  
  // Erkenne Zoom-Level
  const zoomLevel = window.devicePixelRatio || 1;
  
  return {
    browser: isChrome ? 'chrome' : isSafari ? 'safari' : isFirefox ? 'firefox' : 'other',
    zoomLevel,
    isChrome,
    isSafari,
    isFirefox
  };
};

// Automatisch beim Laden ausführen
if (typeof window !== 'undefined') {
  // Warte bis DOM geladen ist
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixChromeScaling);
  } else {
    fixChromeScaling();
  }
}
