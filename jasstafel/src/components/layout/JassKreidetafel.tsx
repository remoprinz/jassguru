import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { animated } from 'react-spring';
import useViewportHeight from '../../hooks/useViewportHeight';
import SplitContainer from './SplitContainer';
import useSwipeAnimation from '../animations/useSwipeAnimation';
import Calculator from '../game/Calculator';
import { useOrientation } from '../../hooks/useOrientation';
import { useGameStore } from '../../store/gameStore';
import RoundInfo from '../game/RoundInfo';

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
  middleLineThickness = 6,
  zShapeConfig
}) => {
  const viewportHeight = useViewportHeight();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [activeContainer, setActiveContainer] = useState<'top' | 'bottom' | null>(null);
  const { 
    topScore, 
    bottomScore, 
    topRounds,
    bottomRounds, 
    navigateHistory, 
    currentHistoryIndex, 
    updateScore,
    scoreHistory,
    currentPlayer,
    currentRound
  } = useGameStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    console.log('Aktuelle Werte:', { topScore, bottomScore, currentHistoryIndex, currentPlayer, currentRound });
  }, [topScore, bottomScore, currentHistoryIndex, currentPlayer, currentRound]);

  useEffect(() => {
    console.log('Aktualisierte Werte nach Zustandsänderung:', {
      topScore,
      bottomScore,
      currentHistoryIndex,
      currentPlayer,
      currentRound
    });
  }, [topScore, bottomScore, currentHistoryIndex, currentPlayer, currentRound]);

  const { topContainerHeight, bottomContainerHeight, middleLinePosition } = useMemo(() => {
    if (typeof window === 'undefined' || !mounted) {
      return { topContainerHeight: 0, bottomContainerHeight: 0, middleLinePosition: 0 };
    }
    
    const safeAreaTop = isPWA() ? parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--safe-area-top') || '0') : 0;
    const safeAreaBottom = isPWA() ? parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--safe-area-bottom') || '0') : 0;
    
    const adjustedViewportHeight = viewportHeight - safeAreaTop - safeAreaBottom;
    const middleLinePosition = Math.floor(adjustedViewportHeight / 2);
    const availableHeight = adjustedViewportHeight;
    const halfHeight = Math.floor(availableHeight / 2);
    
    return {
      topContainerHeight: halfHeight,
      bottomContainerHeight: halfHeight,
      middleLinePosition: middleLinePosition + safeAreaTop
    };
  }, [viewportHeight, middleLineThickness, mounted]);

  const { y: topY, mainOpacity: topMainOpacity, oppositeOpacity: topOppositeOpacity, animateSwipe: animateTopSwipe, getBrightness: getTopBrightness } = useSwipeAnimation({
    initialPosition: 0,
    maxOffset: viewportHeight * 0.07,
    position: 'top'
  });

  const { y: bottomY, mainOpacity: bottomMainOpacity, oppositeOpacity: bottomOppositeOpacity, animateSwipe: animateBottomSwipe, getBrightness: getBottomBrightness } = useSwipeAnimation({
    initialPosition: 0,
    maxOffset: viewportHeight * 0.07,
    position: 'bottom'
  });

  const topContainerRef = useRef<HTMLDivElement>(null);
  const bottomContainerRef = useRef<HTMLDivElement>(null);

  const handleSwipe = useCallback((direction: 'up' | 'down' | 'left' | 'right', position: 'top' | 'bottom') => {
    if (direction === 'left' || direction === 'right') {
      const historyDirection = position === 'top' 
        ? (direction === 'left' ? 'forward' : 'backward')
        : (direction === 'left' ? 'backward' : 'forward');
      console.log(`Navigiere in der Historie: ${historyDirection}`);
      navigateHistory(historyDirection);
      // Animiere beide Container
      animateTopSwipe(direction);
      animateBottomSwipe(direction);
    } else {
      const shouldOpen = (position === 'top' && direction === 'up') || (position === 'bottom' && direction === 'down');
      const shouldClose = (position === 'top' && direction === 'down') || (position === 'bottom' && direction === 'up');
      
      if (shouldOpen) {
        setIsOpen(true);
        animateTopSwipe(true);
        animateBottomSwipe(true);
      } else if (shouldClose) {
        setIsOpen(false);
        animateTopSwipe(false);
        animateBottomSwipe(false);
      }
    }
  }, [navigateHistory, animateTopSwipe, animateBottomSwipe]);

  const maxOffset = viewportHeight > 0 ? viewportHeight * 0.07 : 0;

  const middleLineStyle = {
    position: 'absolute' as const,
    height: `${middleLineThickness / 1.5}px`,
    backgroundColor: '#FF0000',
  };

  const handleLongPress = useCallback((position: 'top' | 'bottom') => {
    setIsCalculatorOpen(true);
    setActiveContainer(position);
  }, []);

  const handleCalculatorClose = useCallback(() => {
    setIsCalculatorOpen(false);
    setActiveContainer(null);
  }, []);

  const handleCalculatorSubmit = useCallback((value: number, opponentValue: number) => {
    if (activeContainer) {
      updateScore(activeContainer, value, opponentValue);
      setIsCalculatorOpen(false);
      setActiveContainer(null);
    }
  }, [activeContainer, updateScore]);

  const { orientationMessage, dismissMessage } = useOrientation();

  const handleHorizontalSwipe = useCallback((direction: 'left' | 'right', position: 'top' | 'bottom') => {
    const historyDirection = position === 'top' 
      ? (direction === 'left' ? 'forward' : 'backward')
      : (direction === 'left' ? 'backward' : 'forward');
    navigateHistory(historyDirection);
    if (position === 'top') {
      animateTopSwipe(direction);
    } else {
      animateBottomSwipe(direction);
    }
  }, [navigateHistory, animateTopSwipe, animateBottomSwipe]);

  return (
    <div className="w-full h-full bg-black relative select-none touch-action-none" style={{ height: `${viewportHeight}px` }}>
      <SplitContainer
        ref={topContainerRef}
        position="top"
        height={topContainerHeight}
        zShapeConfig={zShapeConfig}
        padding="paddingTop"
        onSwipe={handleSwipe}
        isOpen={isOpen}
        y={topY}
        mainOpacity={topMainOpacity}
        oppositeOpacity={topOppositeOpacity}
        getBrightness={getTopBrightness}
        onLongPress={() => handleLongPress('top')}
        score={topScore}
        key={`top-${currentHistoryIndex}`}
      />
      <animated.div 
        style={{
          ...middleLineStyle,
          left: topY.to(y => `${5 - (y / maxOffset) * 5}%`),
          width: topY.to(y => `${90 + (y / maxOffset) * 10}%`),
          top: middleLinePosition - middleLineThickness / 2,
          transform: topY.to(y => `translateY(${-y}px)`)
        }} 
        className="bg-chalk-red" 
      />
      <animated.div 
        style={{
          ...middleLineStyle,
          left: bottomY.to(y => `${5 - (y / maxOffset) * 5}%`),
          width: bottomY.to(y => `${90 + (y / maxOffset) * 10}%`),
          top: middleLinePosition,
          transform: bottomY.to(y => `translateY(${y}px)`)
        }} 
        className="bg-chalk-red" 
      />
      <SplitContainer
        ref={bottomContainerRef}
        position="bottom"
        height={bottomContainerHeight}
        zShapeConfig={zShapeConfig}
        padding="paddingBottom"
        onSwipe={handleSwipe}
        isOpen={isOpen}
        y={bottomY}
        mainOpacity={bottomMainOpacity}
        oppositeOpacity={bottomOppositeOpacity}
        getBrightness={getBottomBrightness}
        onLongPress={() => handleLongPress('bottom')}
        score={bottomScore}
        key={`bottom-${currentHistoryIndex}`}
      />
      {isCalculatorOpen && (
        <Calculator
          isOpen={isCalculatorOpen}
          onClose={handleCalculatorClose}
          onSubmit={handleCalculatorSubmit}
          onCancel={handleCalculatorClose}
          initialValue={0}
        />
      )}
      {!isCalculatorOpen && (
        <RoundInfo 
          currentPlayer={currentPlayer}
          currentRound={currentRound}
          opacity={1}
          isOpen={isOpen}
        />
      )}
      {orientationMessage.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full">
            <p className="text-lg mb-4">{orientationMessage.message}</p>
            <button
              onClick={dismissMessage}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default JassKreidetafel;