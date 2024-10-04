import React, { useEffect } from 'react';
import { animated, SpringValue } from 'react-spring';
import ZShape from './ZShape';
import useSwipeGesture from '../../hooks/useSwipeGesture';
import useSwipeAnimation from '../animations/useSwipeAnimation';

interface SplitContainerProps {
  position: 'top' | 'bottom';
  height: number;
  zShapeConfig: {
    innerSpacing: number;
    sideSpacing: number;
    edgeSpacing: number;
  };
  padding: string;
  onSwipe: (direction: 'up' | 'down', position: 'top' | 'bottom') => void;
  isOpen: boolean;
  y: SpringValue<number>; // Hier fügen wir die y-Prop hinzu
}

const SplitContainer: React.FC<SplitContainerProps> = ({
  position,
  height,
  zShapeConfig,
  padding,
  onSwipe,
  isOpen,
  y
}) => {
  const { animateSwipe } = useSwipeAnimation({
    initialPosition: 0,
    maxOffset: height / 2,
    position
  });

  useEffect(() => {
    animateSwipe(isOpen);
  }, [isOpen, animateSwipe]);

  useSwipeGesture({
    onSwipeUp: () => onSwipe('up', position),
    onSwipeDown: () => onSwipe('down', position)
  });

  const containerStyle: React.CSSProperties = {
    width: '100%',
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'visible',
    height: `${height}px`,
    [position]: 0,
    [padding]: 'env(safe-area-inset-top)'
  };

  const zShapeStyle: React.CSSProperties = {
    position: 'absolute',
    width: '110%',
    left: '-1.5%',
    [position === 'top' ? 'bottom' : 'top']: `${zShapeConfig.innerSpacing}px`,
    height: `calc(100% - ${zShapeConfig.edgeSpacing + zShapeConfig.innerSpacing}px)`,
  };

  return (
    <animated.div 
      style={{ 
        ...containerStyle, 
        transform: y.to(value => `translateY(${position === 'top' ? -value : value}px)`)
      }}
    >
      <div style={zShapeStyle}>
        <ZShape className="w-full h-full text-chalk-red" diagonalStrokeWidth={0.6} />
      </div>
    </animated.div>
  );
};

export default SplitContainer;