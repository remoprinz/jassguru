import { useRef, MouseEvent, TouchEvent, useCallback } from 'react';

const SCROLL_THRESHOLD = 10; // Pixel-Schwelle, ab der eine Bewegung als Scrollen gilt

/**
 * Ein Custom Hook, der zwischen einem echten Klick und einer Scroll-Geste unterscheidet,
 * um unbeabsichtigte Klicks beim Scrollen auf Touch-Geräten zu verhindern.
 */
export const useClickAndScrollHandler = () => {
  const hasMovedRef = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  /**
   * Wird bei mousedown oder touchstart ausgelöst.
   * Setzt den Bewegungs-Status zurück und speichert die Startkoordinaten.
   */
  const onInteractionStart = useCallback((e: MouseEvent | TouchEvent) => {
    hasMovedRef.current = false;
    const currentX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const currentY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startPos.current = { x: currentX, y: currentY };
  }, []);

  /**
   * Wird bei mousemove oder touchmove ausgelöst.
   * Prüft, ob die Bewegung den Schwellenwert überschreitet und markiert es als Scroll-Geste.
   */
  const onInteractionMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (hasMovedRef.current) return; // Wenn bereits als "bewegt" markiert, keine weitere Prüfung nötig
    
    const currentX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const currentY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const deltaX = Math.abs(currentX - startPos.current.x);
    const deltaY = Math.abs(currentY - startPos.current.y);

    if (deltaX > SCROLL_THRESHOLD || deltaY > SCROLL_THRESHOLD) {
      hasMovedRef.current = true;
    }
  }, []);

  /**
   * Fängt den Klick in der "Capture"-Phase ab (bevor er das Link-Element erreicht).
   * Wenn eine Scroll-Bewegung erkannt wurde, wird das Klick-Event unterdrückt.
   */
  const onClickCapture = useCallback((e: MouseEvent) => {
    if (hasMovedRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  return {
    onMouseDown: onInteractionStart,
    onTouchStart: onInteractionStart,
    onMouseMove: onInteractionMove,
    onTouchMove: onInteractionMove,
    onClickCapture,
  };
}; 