/**
 * Utility-Funktionen zur Geräteerkennung
 */

/**
 * Erkennt, ob das Gerät ein Desktop-Computer ist
 * Basiert auf Bildschirmgröße und Touchscreen-Verfügbarkeit
 */
export function isDesktopDevice(): boolean {
  // Wenn im Browser ausgeführt
  if (typeof window !== "undefined") {
    // Keine Touch-Unterstützung deutet auf Desktop hin
    if (!("ontouchstart" in window || navigator.maxTouchPoints > 0)) {
      return true;
    }
    // Große Bildschirme sind wahrscheinlich Desktops (>= 1024px)
    if (window.innerWidth >= 1024) {
      return true;
    }
  }
  return false;
}

/**
 * Erkennt, ob das Gerät ein Tablet ist
 * Basiert auf Bildschirmgröße und Touchscreen-Verfügbarkeit
 */
export function isTabletDevice(): boolean {
  // Wenn im Browser ausgeführt
  if (typeof window !== "undefined") {
    // Tablet ist ein Touchscreen-Gerät mit mittlerer Bildschirmgröße
    if (("ontouchstart" in window || navigator.maxTouchPoints > 0) &&
        window.innerWidth >= 768 && window.innerWidth < 1024) {
      return true;
    }
  }
  return false;
}

/**
 * Erkennt, ob das Gerät ein Smartphone ist
 * Basiert auf Bildschirmgröße und Touchscreen-Verfügbarkeit
 */
export function isMobileDevice(): boolean {
  // Wenn im Browser ausgeführt
  if (typeof window !== "undefined") {
    // Smartphone ist ein Touchscreen-Gerät mit kleiner Bildschirmgröße
    if (("ontouchstart" in window || navigator.maxTouchPoints > 0) &&
        window.innerWidth < 768) {
      return true;
    }
  }
  return false;
}
