import { useEffect } from 'react';

interface UseSwipeGestureProps {
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  element?: 'top' | 'bottom';
}

const useSwipeGesture = ({
  onSwipeUp,
  onSwipeDown,
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
  element
}: UseSwipeGestureProps) => {
  useEffect(() => {
    let startX: number | null = null;
    let startY: number | null = null;

    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      const swipeArea = target.closest(`[data-swipe-area="${element}"]`);
      if (!swipeArea) return;
      
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (startX === null || startY === null) return;

      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const diffX = startX - currentX;
      const diffY = startY - currentY;

      if (Math.abs(diffX) > Math.abs(diffY)) {
        // Horizontale Bewegung
        if (Math.abs(diffX) > threshold) {
          if (diffX > 0 && onSwipeLeft) {
            onSwipeLeft();
          } else if (diffX < 0 && onSwipeRight) {
            onSwipeRight();
          }
          startX = null;
          startY = null;
        }
      } else {
        // Vertikale Bewegung
        if (Math.abs(diffY) > threshold) {
          if (diffY > 0 && onSwipeUp) {
            onSwipeUp();
          } else if (diffY < 0 && onSwipeDown) {
            onSwipeDown();
          }
          startX = null;
          startY = null;
        }
      }
    };

    document.addEventListener('touchstart', handleTouchStart);
    document.addEventListener('touchmove', handleTouchMove);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
    };
  }, [onSwipeUp, onSwipeDown, onSwipeLeft, onSwipeRight, threshold, element]);
};

export default useSwipeGesture;