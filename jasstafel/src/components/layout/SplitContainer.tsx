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
  onStrichClick: (value: number, position: 'top' | 'bottom') => void;
  triggerBlendEffect: (position: 'top' | 'bottom') => void;
  restZahl: number;
  top100erOffset?: string;
  bottom100erOffset?: string;
  top20erOffset?: string;
  bottom20erOffset?: string;
}

const SplitContainer = forwardRef<HTMLDivElement, SplitContainerProps>(({
  position,
  height,
  zShapeConfig,
  padding,
  onSwipe,
  y,
  mainOpacity,
  getBrightness,
  onLongPress,
  score,
  isMenuOpen,
  onStrichClick,
  triggerBlendEffect,
  restZahl,
  top100erOffset,
  bottom100erOffset,
  top20erOffset,
  bottom20erOffset,
}, ref) => {
  const [pressTimer, setPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [horizontalSwipe, setHorizontalSwipe] = useState(0);

  const handleMouseDown = () => {
    const timer = setTimeout(() => {
      onLongPress();
    }, 400);
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
    width: '110%', // Reduziert von 110% auf 100%
    left: '-1%', // Geändert von -1.5% auf 0%
    [position === 'top' ? 'bottom' : 'top']: `${zShapeConfig.innerSpacing * 1.5}px`, // Erhöht den Abstand zur Mittellinie
    height: `calc(100% - ${zShapeConfig.edgeSpacing * 1.5 + zShapeConfig.innerSpacing * 0.8}px)`, // Angepasst für die neue Position
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

  const handleStrichClick = (value: number, clickPosition: 'top' | 'bottom') => {
    if (clickPosition === position) {
      onStrichClick(value, position);
      triggerBlendEffect(position);
    }
  };

  useEffect(() => {
    const handleCloseMenu = (event: CustomEvent) => {
      const { direction, position, isClosing } = event.detail;
      if (isClosing) {
        onSwipe('up', 'bottom');
      }
    };

    window.addEventListener('closeMenu', handleCloseMenu as EventListener);
    return () => {
      window.removeEventListener('closeMenu', handleCloseMenu as EventListener);
    };
  }, [onSwipe]);

  return (
    <animated.div 
      style={{ 
        ...containerStyle, 
        transform: y.to(value => 
          value === 0 ? 'none' : `translateY(${position === 'top' ? -value : value}px)`
        ),
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
      <StrichContainer
        position={position}
        onStrichClick={handleStrichClick}
        onBlendEffect={triggerBlendEffect}
        restZahl={restZahl}
        top100erOffset={top100erOffset}
        bottom100erOffset={bottom100erOffset}
        top20erOffset={top20erOffset}
        bottom20erOffset={bottom20erOffset}
      />
    </animated.div>
  );
});

export default SplitContainer;