import { useState, useEffect } from 'react';

interface SwipeState {
  startY: number | null;
  endY: number | null;
  direction: 'up' | 'down' | null;
}

interface UseSwipeGestureProps {
  threshold?: number;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

const useSwipeGesture = ({ threshold = 50, onSwipeUp, onSwipeDown }: UseSwipeGestureProps = {}) => {
  const [swipeState, setSwipeState] = useState<SwipeState>({
    startY: null,
    endY: null,
    direction: null,
  });

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      setSwipeState(prev => ({ ...prev, startY: e.touches[0].clientY }));
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!swipeState.startY) return;
      setSwipeState(prev => ({ ...prev, endY: e.touches[0].clientY }));
    };

    const handleTouchEnd = () => {
      if (swipeState.startY && swipeState.endY) {
        const diff = swipeState.startY - swipeState.endY;
        if (Math.abs(diff) > threshold) {
          const direction = diff > 0 ? 'up' : 'down';
          setSwipeState(prev => ({ ...prev, direction }));
          if (direction === 'up' && onSwipeUp) onSwipeUp();
          if (direction === 'down' && onSwipeDown) onSwipeDown();
        }
      }
      setSwipeState({ startY: null, endY: null, direction: null });
    };

    document.addEventListener('touchstart', handleTouchStart);
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [swipeState.startY, swipeState.endY, threshold, onSwipeUp, onSwipeDown]);

  return swipeState.direction;
};

export default useSwipeGesture;
