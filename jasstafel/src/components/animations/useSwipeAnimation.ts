import { useSpring } from 'react-spring';

interface UseSwipeAnimationProps {
  initialPosition: number;
  maxOffset: number;
  position: 'top' | 'bottom';
}

const useSwipeAnimation = ({ initialPosition, maxOffset, position }: UseSwipeAnimationProps) => {
  const [springs, api] = useSpring(() => ({ 
    y: initialPosition,
    config: {
      mass: 1,
      tension: 120,
      friction: 26,
      clamp: true,
      duration: 400
    }
  }));

  const animateSwipe = (open: boolean) => {
    const offset = open ? maxOffset : initialPosition;
    api.start({ y: offset });
  };

  return { y: springs.y, animateSwipe };
};

export default useSwipeAnimation;