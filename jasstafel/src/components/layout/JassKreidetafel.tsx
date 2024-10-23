import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { animated } from 'react-spring';
import useViewportHeight from '../../hooks/useViewportHeight';
import SplitContainer from './SplitContainer';
import useSwipeAnimation from '../animations/useSwipeAnimation';
import Calculator from '../game/Calculator';
import { useGameStore } from '../../store/gameStore';
import RoundInfo from '../game/RoundInfo';
import MenuOverlay from '../../components/layout/MenuOverlay';
import { useIntroductionMessage } from '../../hooks/useIntroductionMessage';
import IntroductionMessage from '../ui/IntroductionMessage';
import { useBrowserDetection } from '../../hooks/useBrowserDetection';

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

const isIOS = () => {
  if (typeof window !== 'undefined') {
    const userAgent = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(userAgent);
  }
  return false;
};

const JassKreidetafel: React.FC<JassKreidetafelProps> = ({
  middleLineThickness = 60, // Erhöht von 6 auf 12 oder einen anderen gewünschten Wert
  zShapeConfig
}) => {
  const viewportHeight = useViewportHeight();
  const [mounted, setMounted] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [activeContainer, setActiveContainer] = useState<'top' | 'bottom' | null>(null);
  const [isIntroductionMessageVisible, setIsIntroductionMessageVisible] = useState(false);
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
    currentRound,
    updateScoreByStrich,
    updateStricheCounts,
    resetStricheCounts,
    restZahlen,
    updateRestZahl
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

  useEffect(() => {
    setIsCalculatorOpen(false);
  }, []);

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
        setIsMenuOpen(true);
        animateTopSwipe(true);
        animateBottomSwipe(true);
      } else if (shouldClose) {
        setIsMenuOpen(false);
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
    if (!isMenuOpen) {
      setIsCalculatorOpen(true);
      setActiveContainer(position);
    }
  }, [isMenuOpen]);

  const handleCalculatorClose = useCallback(() => {
    setIsCalculatorOpen(false);
    setActiveContainer(null);
  }, []);

  const handleCalculatorSubmit = (value: number, opponentValue: number) => {
    const position = activeContainer as 'top' | 'bottom';
    const oppositePosition = position === 'top' ? 'bottom' : 'top';

    // Aktualisiere den Gesamtscore
    updateScore(position, value, opponentValue);

    // Zeichne die Striche für beide Positionen
    drawStricheForValue(position, value, false);
    drawStricheForValue(oppositePosition, opponentValue, false);

    setIsCalculatorOpen(false);
    setActiveContainer(null);
  };

  const drawStricheForValue = (position: 'top' | 'bottom', value: number, isNewRound: boolean) => {
    const currentScore = position === 'top' ? topScore : bottomScore;
    const newTotalScore = isNewRound ? currentScore + value : value;

    const striche = {
      hundert: Math.floor(newTotalScore / 100),
      fuenfzig: 0,
      zwanzig: 0
    };

    let restZahl = newTotalScore % 100;

    if (restZahl >= 90) {
      striche.fuenfzig = 1;
      striche.zwanzig = 2;
      restZahl -= 90;
    } else if (restZahl >= 80) {
      striche.zwanzig = 4;
      restZahl -= 80;
    } else if (restZahl >= 70) {
      striche.fuenfzig = 1;
      striche.zwanzig = 1;
      restZahl -= 70;
    } else if (restZahl >= 60) {
      striche.zwanzig = 3;
      restZahl -= 60;
    } else if (restZahl >= 50) {
      striche.fuenfzig = 1;
      restZahl -= 50;
    } else if (restZahl >= 20) {
      striche.zwanzig = Math.floor(restZahl / 20);
      restZahl %= 20;
    }

    // Aktualisiere die Striche
    updateStricheCounts(position, 100, striche.hundert);
    updateStricheCounts(position, 50, striche.fuenfzig);
    updateStricheCounts(position, 20, striche.zwanzig);

    // Aktualisiere die Restzahl
    updateRestZahl(position, restZahl);

    // Aktualisiere den Gesamtscore
    if (isNewRound) {
      updateScore(position, value, 0);
    }
  };

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

  const { showMessage, message, dismissMessage, hasShownIntro } = useIntroductionMessage();
  const { browserMessage, dismissMessage: dismissBrowserMessage } = useBrowserDetection(hasShownIntro);

  const handleStrichClick = useCallback((value: number, position: 'top' | 'bottom') => {
    updateScore(position, value, 0);
  }, [updateScore]);

  const triggerBlendEffect = useCallback((position: 'top' | 'bottom') => {
    if (position === 'top') {
      animateTopSwipe('left');
    } else {
      animateBottomSwipe('left');
    }
  }, [animateTopSwipe, animateBottomSwipe]);

  const topRestZahl = topScore % 20;
  const bottomRestZahl = bottomScore % 20;

  console.log('Top RestZahl:', topRestZahl);
  console.log('Bottom RestZahl:', bottomRestZahl);

  const handleUpdateRestZahl = (position: 'top' | 'bottom', restZahl: number) => {
    updateRestZahl(position, restZahl);
  };

  return (
    <div className="w-full h-full bg-black relative select-none touch-action-none" style={{ height: `${viewportHeight}px` }}>
      {showMessage && (
        <IntroductionMessage
          show={showMessage}
          message={message}
          onDismiss={dismissMessage}
        />
      )}
      {!showMessage && browserMessage.show && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-xs w-full relative text-white">
            <p className="text-lg mb-8 text-center">{browserMessage.message}</p>
            <button
              onClick={dismissBrowserMessage}
              className="bg-yellow-600 text-white px-6 py-2 rounded-full hover:bg-yellow-700 transition-colors w-full text-lg font-semibold"
            >
              Verstanden
            </button>
          </div>
        </div>
      )}
      {!showMessage && !browserMessage.show && (
        <>
          <SplitContainer
            ref={topContainerRef}
            position="top"
            height={topContainerHeight}
            zShapeConfig={zShapeConfig}
            padding="paddingTop"
            onSwipe={handleSwipe}
            isOpen={isMenuOpen}
            y={topY}
            mainOpacity={topMainOpacity}
            oppositeOpacity={topOppositeOpacity}
            getBrightness={getTopBrightness}
            onLongPress={() => handleLongPress('top')}
            score={topScore}
            key={`top-${currentHistoryIndex}`}
            isMenuOpen={isMenuOpen}
            onStrichClick={handleStrichClick}
            triggerBlendEffect={triggerBlendEffect}
            restZahl={restZahlen.top}
          />
          <animated.div 
            style={{
              ...middleLineStyle,
              left: topY.to(y => `${5 - (y / maxOffset) * 5}%`),
              width: topY.to(y => `${90 + (y / maxOffset) * 10}%`),
              top: middleLinePosition - middleLineThickness / 2,
              height: `${middleLineThickness}px`, // Hier fügen wir die Höhe hinzu
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
              height: `${middleLineThickness}px`, // Hier fügen wir die Höhe hinzu
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
            isOpen={isMenuOpen}
            y={bottomY}
            mainOpacity={bottomMainOpacity}
            oppositeOpacity={bottomOppositeOpacity}
            getBrightness={getBottomBrightness}
            onLongPress={() => handleLongPress('bottom')}
            score={bottomScore}
            key={`bottom-${currentHistoryIndex}`}
            isMenuOpen={isMenuOpen}
            onStrichClick={handleStrichClick}
            triggerBlendEffect={triggerBlendEffect}
            restZahl={restZahlen.bottom}
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
              isOpen={isMenuOpen}
            />
          )}
          <MenuOverlay isOpen={isMenuOpen} />
        </>
      )}
    </div>
  );
};

export default JassKreidetafel;
