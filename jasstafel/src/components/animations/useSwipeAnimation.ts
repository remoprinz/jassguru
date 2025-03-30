import { useSpring } from 'react-spring';

interface UseSwipeAnimationProps {
  initialPosition: number;
  maxOffset: number;
  position: 'top' | 'bottom';
}

const useSwipeAnimation = ({ initialPosition, maxOffset }: UseSwipeAnimationProps) => {
  const [springs, api] = useSpring(() => ({ 
    y: initialPosition,
    mainOpacity: 1,
    oppositeOpacity: 1,
    config: {
      mass: 1,
      tension: 120,
      friction: 26,
      clamp: true,
      duration: 250
    }
  }));

  const animateSwipe = (direction: 'left' | 'right' | boolean) => {
    if (typeof direction === 'boolean') {
      const offset = direction ? maxOffset : initialPosition;
      api.start({ y: offset, mainOpacity: 1, oppositeOpacity: 1 });
    } else {
      api.start({ 
        mainOpacity: 0,
        oppositeOpacity: 0,
        config: {
          duration: 125 // Schnelleres Ausblenden
        },
        onRest: () => {
          api.start({ 
            mainOpacity: 1,
            oppositeOpacity: 1,
            config: {
              duration: 125 // Schnelleres Einblenden
            }
          });
        }
      });
    }
  };

  const getBrightness = (y: number) => {
    if (typeof y !== 'number' || isNaN(y) || typeof maxOffset !== 'number' || maxOffset === 0) {
      return 0;
    }
    const progress = y / maxOffset;
    const maxBrightness = 0.45;
    return Math.max(0, Math.min(progress * maxBrightness, maxBrightness));
  };

  return { 
    y: springs.y, 
    mainOpacity: springs.mainOpacity, 
    oppositeOpacity: springs.oppositeOpacity, 
    animateSwipe, 
    getBrightness 
  };
};

export default useSwipeAnimation;