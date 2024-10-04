import React, { useMemo, useEffect, useState } from 'react';
import ZShape from './ZShape';
import useViewportHeight from '../../hooks/useViewportHeight';
import SplitContainer from './SplitContainer';
import useSwipeAnimation from '../animations/useSwipeAnimation';

interface JassKreidetafelProps {
  middleLineThickness?: number;
  zShapeConfig: {
    innerSpacing: number;
    sideSpacing: number;
    edgeSpacing: number;
  };
}

const isPWA = () => {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as any).standalone ||
         document.referrer.includes('android-app://');
};

const JassKreidetafel: React.FC<JassKreidetafelProps> = ({
  middleLineThickness = 3,
  zShapeConfig
}) => {
  const viewportHeight = useViewportHeight();
  const [mounted, setMounted] = useState(false);
  const [isTopOpen, setIsTopOpen] = useState(false);
  const [isBottomOpen, setIsBottomOpen] = useState(false);

  const { y: topY, animateSwipe: animateTopSwipe } = useSwipeAnimation({
    initialPosition: 0,
    maxOffset: viewportHeight * 0.07,
    position: 'top'
  });

  const { y: bottomY, animateSwipe: animateBottomSwipe } = useSwipeAnimation({
    initialPosition: 0,
    maxOffset: viewportHeight * 0.07,
    position: 'bottom'
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const { topContainerHeight, bottomContainerHeight, middleLinePosition } = useMemo(() => {
    if (typeof window === 'undefined' || !mounted) {
      return { topContainerHeight: 0, bottomContainerHeight: 0, middleLinePosition: 0 };
    }
    
    const safeAreaTop = parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--safe-area-top') || '0');
    const safeAreaBottom = parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--safe-area-bottom') || '0');
    
    const adjustedViewportHeight = viewportHeight - safeAreaTop - safeAreaBottom;
    const middleLinePosition = Math.floor(adjustedViewportHeight / 2) + safeAreaTop;
    const availableHeight = adjustedViewportHeight - middleLineThickness;
    const halfHeight = Math.floor(availableHeight / 2);
    
    return {
      topContainerHeight: halfHeight,
      bottomContainerHeight: halfHeight,
      middleLinePosition
    };
  }, [viewportHeight, middleLineThickness, mounted]);

  const handleSwipe = (direction: 'up' | 'down', position: 'top' | 'bottom') => {
    const shouldOpen = (position === 'top' && direction === 'up') || (position === 'bottom' && direction === 'down');
    setIsTopOpen(shouldOpen);
    setIsBottomOpen(shouldOpen);
    animateTopSwipe(shouldOpen);
    animateBottomSwipe(shouldOpen);
  };

  if (!mounted) {
    return null;
  }

  const middleLineStyle: React.CSSProperties = {
    position: 'absolute',
    top: `${middleLinePosition}px`,
    left: '5%',
    right: '5%',
    height: `${middleLineThickness}px`,
    transform: 'translateY(-50%)',
  };

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <SplitContainer
        position="top"
        height={topContainerHeight}
        zShapeConfig={zShapeConfig}
        padding="paddingTop"
        onSwipe={handleSwipe}
        isOpen={isTopOpen}
        y={topY}
      />
      <SplitContainer
        position="bottom"
        height={bottomContainerHeight}
        zShapeConfig={zShapeConfig}
        padding="paddingBottom"
        onSwipe={handleSwipe}
        isOpen={isBottomOpen}
        y={bottomY}
      />
      <div style={middleLineStyle} className="bg-chalk-red" />
    </div>
  );
};

export default JassKreidetafel;