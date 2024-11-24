// JassKreidetafel.tsx
import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { animated } from 'react-spring';
import useViewportHeight from '../../hooks/useViewportHeight';
import SplitContainer from './SplitContainer';
import useSwipeAnimation from '../animations/useSwipeAnimation';
import Calculator from '../game/Calculator';
import { useGameStore } from '../../store/gameStore';
import MenuOverlay from '../../components/layout/MenuOverlay';
import { useIntroductionMessage } from '../../hooks/useIntroductionMessage';
import IntroductionMessage from '../ui/IntroductionMessage';
import { useBrowserDetection } from '../../hooks/useBrowserDetection';
import StartScreen from './StartScreen';
import RoundInfo from '../game/RoundInfo';
import GameInfoOverlay from '../game/GameInfoOverlay';
import { useDoubleClick } from '../../hooks/useDoubleClick';
import HistoryWarning from '../notifications/HistoryWarnings';
import ResultatKreidetafel from './ResultatKreidetafel';

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
  middleLineThickness = 60, // Erhöht von 6 auf 60 oder einen anderen gewünschten Wert
  zShapeConfig
}) => {
  const viewportHeight = useViewportHeight();
  const [mounted, setMounted] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [activeContainer, setActiveContainer] = useState<'top' | 'bottom' | null>(null);
  const [isGameInfoOpen, setIsGameInfoOpen] = useState(false);
  const [isResultatOpen, setIsResultatOpen] = useState(false);
  
  const { 
    topScore, 
    bottomScore, 
    navigateHistory, 
    currentHistoryIndex, 
    updateScore,
    currentPlayer,
    currentRound,
    restZahlen,
    updateRestZahl,
    resetGame,
    isGameStarted,
    gameStartTime,
    roundStartTime,
    historyWarning,
    hideHistoryWarning,
    executePendingAction
  } = useGameStore();

  useEffect(() => {
    setMounted(true);
    resetGame(); // Initialisiere das Spiel beim Mounten
  }, [resetGame]);

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
      // Korrigierte Zuordnung basierend auf der Position
      let historyDirection: 'forward' | 'backward';
      if (position === 'top') {
        historyDirection = direction === 'left' ? 'forward' : 'backward';
      } else { // position === 'bottom'
        historyDirection = direction === 'left' ? 'backward' : 'forward';
      }
      console.log(`Navigiere in der Historie: ${historyDirection}`);
      navigateHistory(historyDirection);

    } else {
      const shouldOpen = (position === 'top' && direction === 'up') || (position === 'bottom' && direction === 'down');
      const shouldClose = (position === 'top' && direction === 'down') || (position === 'bottom' && direction === 'up');
      
      if (shouldOpen) {
        setIsMenuOpen(true);
        animateTopSwipe(true); // Korrigierte Argumente
        animateBottomSwipe(true); // Korrigierte Argumente
      } else if (shouldClose) {
        setIsMenuOpen(false);
        animateTopSwipe(false); // Korrigierte Argumente
        animateBottomSwipe(false); // Korrigierte Argumente
      }
    }
  }, [navigateHistory, animateTopSwipe, animateBottomSwipe]);

  const maxOffset = viewportHeight > 0 ? viewportHeight * 0.07 : 0;

  const middleLineStyle = {
    position: 'absolute' as const,
    height: `${middleLineThickness}px`,
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

    updateScore(position, value, opponentValue);

    setIsCalculatorOpen(false);
    setActiveContainer(null);
  };

  const handleHorizontalSwipe = useCallback((direction: 'left' | 'right', position: 'top' | 'bottom') => {
    const historyDirection = direction === 'left' ? 'forward' : 'backward';
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

  const handleUpdateRestZahl = (position: 'top' | 'bottom', restZahl: number) => {
    updateRestZahl(position, restZahl);
  };

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const position: 'top' | 'bottom' = e.clientY < window.innerHeight / 2 ? 'top' : 'bottom';
    setIsGameInfoOpen(true);
    useGameStore.setState({ lastDoubleClickPosition: position });
  }, []);

  const handleTafelClick = useDoubleClick(handleDoubleClick);

  useEffect(() => {
    if (mounted) {
      // Initial Berechnung
      const initialCalc = setTimeout(() => {
        const vh = window.innerHeight;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
      }, 0);

      // Zweite Berechnung nach 100ms
      const secondCalc = setTimeout(() => {
        const vh = window.innerHeight;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
      }, 100);

      return () => {
        clearTimeout(initialCalc);
        clearTimeout(secondCalc);
      };
    }
  }, [mounted]);

  return (
    <div 
      className="relative w-full h-full overflow-hidden bg-chalk-black prevent-interactions"
      onClick={handleTafelClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      {!isGameStarted && !isMenuOpen && !browserMessage.show && !showMessage && (
        <StartScreen />
      )}
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
              position: 'absolute',
              left: '5%',
              width: '90%',
              top: middleLinePosition - middleLineThickness / 2,
              height: `${middleLineThickness / 2}px`,
              transform: topY.to(y => `translateY(${-y}px)`)
            }} 
            className="bg-chalk-red" 
          />
          <animated.div 
            style={{
              position: 'absolute',
              left: '5%',
              width: '90%',
              top: middleLinePosition,
              height: `${middleLineThickness / 2}px`,
              transform: bottomY.to(y => `translateY(${y}px)`)
            }} 
            className="bg-chalk-red" 
          />
          <RoundInfo
            currentPlayer={currentPlayer}
            currentRound={currentRound}
            opacity={topMainOpacity.get()}
            isOpen={isMenuOpen}
            isGameStarted={isGameStarted}
            gameStartTime={gameStartTime}
            roundStartTime={roundStartTime}
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
              clickedPosition={activeContainer!}
            />
          )}
          <GameInfoOverlay 
            isOpen={isGameInfoOpen}
            onClose={() => setIsGameInfoOpen(false)}
          />
          <MenuOverlay 
            isOpen={isMenuOpen} 
            onClose={() => setIsMenuOpen(false)} 
            setIsResultatOpen={setIsResultatOpen}
          />
          <HistoryWarning
            show={historyWarning.isVisible}
            message={historyWarning.message}
            onConfirm={executePendingAction}
            onDismiss={hideHistoryWarning}
          />
          {isResultatOpen && (
            <ResultatKreidetafel 
              isOpen={isResultatOpen}
              onClose={() => setIsResultatOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
};

export default JassKreidetafel;