import React, { useState, useEffect, forwardRef } from 'react';
import { animated, SpringValue } from 'react-spring';
import ZShape from './ZShape';
import useSwipeGesture from '../../hooks/useSwipeGesture';
import StrichContainer from './StrichContainer';

interface SplitContainerProps {
  position: 'top' | 'bottom';
  height: number;
  zShapeConfig: {
    innerSpacing: number;
    sideSpacing: number;
    edgeSpacing: number;
  };
  padding: string;
  onSwipe: (direction: 'up' | 'down' | 'left' | 'right', position: 'top' | 'bottom') => void;
  isOpen: boolean;
  y: SpringValue<number>;
  mainOpacity: SpringValue<number>;
  oppositeOpacity: SpringValue<number>;
  getBrightness: (y: number) => number;
  onLongPress: () => void;
  score: number;
  isMenuOpen: boolean;
}

const SplitContainer = forwardRef<HTMLDivElement, SplitContainerProps>(({
  position,
  height,
  zShapeConfig,
  padding,
  onSwipe,
  isOpen,
  y,
  mainOpacity,
  oppositeOpacity,
  getBrightness,
  onLongPress,
  score,
  isMenuOpen,
}, ref) => {
  const [pressTimer, setPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [horizontalSwipe, setHorizontalSwipe] = useState(0);

  const handleMouseDown = () => {
    const timer = setTimeout(() => {
      onLongPress();
    }, 500);
    setPressTimer(timer);
  };

  const handleMouseUp = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
    }
  };

  useEffect(() => {
    return () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
      }
    };
  }, [pressTimer]);

  useSwipeGesture({
    onSwipeLeft: () => {
      console.log('Swipe Left detected');
      onSwipe('left', position);
    },
    onSwipeRight: () => {
      console.log('Swipe Right detected');
      onSwipe('right', position);
    },
    onSwipeUp: () => {
      console.log('Swipe Up detected');
      onSwipe('up', position);
    },
    onSwipeDown: () => {
      console.log('Swipe Down detected');
      onSwipe('down', position);
    },
    element: position
  });

  const containerStyle: React.CSSProperties = {
    width: '100%',
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'visible',
    height: `${height}px`,
    [position]: 0,
    [padding]: 'env(safe-area-inset-top)',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
    touchAction: 'none'
  };

  const zShapeStyle: React.CSSProperties = {
    position: 'absolute',
    width: '110%',
    left: '-1.5%',
    [position === 'top' ? 'bottom' : 'top']: `${zShapeConfig.innerSpacing}px`,
    height: `calc(100% - ${zShapeConfig.edgeSpacing + zShapeConfig.innerSpacing}px)`,
  };

  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'white',
    pointerEvents: 'none', // Erlaubt Interaktionen mit darunter liegenden Elementen
  };

  const handleLongPress = () => {
    if (!isMenuOpen) {
      onLongPress();
    }
  };

  return (
    <animated.div 
      style={{ 
        ...containerStyle, 
        transform: y.to(value => `translateY(${position === 'top' ? -value : value}px)`),
      }}
      data-swipe-area={position} // Hier fügen wir ein data-Attribut hinzu
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onTouchStart={handleMouseDown}
      onTouchEnd={handleMouseUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div style={zShapeStyle}>
        <ZShape 
          className="w-full h-full text-chalk-red" 
          diagonalStrokeWidth={0.6} 
          position={position}
          isReversed={position === 'top'}
        />
      </div>
      <animated.div 
        style={{
          ...overlayStyle,
          opacity: y.to(getBrightness)
        }}
      />
      <animated.div 
        className="absolute inset-0 flex items-center justify-center"
        style={{ opacity: mainOpacity }}
      >
        <span 
          className="text-gray-300 text-[9rem] opacity-50 select-none"
          style={{ transform: position === 'top' ? 'rotate(180deg)' : 'none' }}
        >
          {score}
        </span>
      </animated.div>
      {position === 'bottom' && (
        <StrichContainer
          position={position}
          score={score}
          onStrichClick={(value: number) => console.log(`Strich geklickt: ${value}`)}
          middleLinePosition={height / 2}
        />
      )}
    </animated.div>
  );
});

export default SplitContainer;