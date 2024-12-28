import React, { useState, useEffect, forwardRef } from 'react';
import { animated, SpringValue } from 'react-spring';
import ZShape from './ZShape';
import useSwipeGesture from '../../hooks/useSwipeGesture';
import StrichContainer from './StrichContainer';
import type { TeamPosition } from '../../types/jass';

interface SplitContainerProps {
  position: TeamPosition;
  height: number;
  zShapeConfig: {
    innerSpacing: number;
    sideSpacing: number;
    edgeSpacing: number;
  };
  padding: string;
  onSwipe: (direction: 'up' | 'down' | 'left' | 'right', position: TeamPosition) => void;
  y: SpringValue<number>;
  mainOpacity: SpringValue<number>;
  getBrightness: (y: number) => number;
  onLongPress: () => void;
  score: number;
  triggerBlendEffect: (position: TeamPosition) => void;
  isHistoryNavigationActive?: boolean;
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
  triggerBlendEffect,
  isHistoryNavigationActive,
}, ref) => {
  const [pressTimer, setPressTimer] = useState<NodeJS.Timeout | null>(null);

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
    onSwipeLeft: () => onSwipe('left', position),
    onSwipeRight: () => onSwipe('right', position),
    onSwipeUp: () => onSwipe('up', position),
    onSwipeDown: () => onSwipe('down', position),
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
    left: '-1%',
    [position === 'top' ? 'bottom' : 'top']: `${zShapeConfig.innerSpacing * 1.5}px`,
    height: `calc(100% - ${zShapeConfig.edgeSpacing * 1.5 + zShapeConfig.innerSpacing * 0.8}px)`,
  };

  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'white',
    pointerEvents: 'none',
  };

  return (
    <animated.div 
      style={{ 
        ...containerStyle, 
        transform: y.to(value => 
          value === 0 ? 'none' : `translateY(${position === 'top' ? -value : value}px)`
        ),
      }}
      data-swipe-area={position}
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
        onBlendEffect={triggerBlendEffect}
      />
    </animated.div>
  );
});

export default SplitContainer;