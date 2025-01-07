// src/components/layout/JassKreidetafel.tsx

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { animated } from 'react-spring';
import useViewportHeight from '../../hooks/useViewportHeight';
import SplitContainer from './SplitContainer';
import useSwipeAnimation from '../animations/useSwipeAnimation';
import Calculator from '../game/Calculator';
import { useGameStore } from '../../store/gameStore';
import StartScreen from './StartScreen';
import RoundInfo from '../game/RoundInfo';
import { useDoubleClick } from '../../hooks/useDoubleClick';
import { PlayerNumber, TeamPosition, OnboardingContent, OnboardingState, OnboardingActions, BrowserOnboardingStep } from '../../types/jass';
import { useUIStore } from '../../store/uiStore';
import MenuOverlay from './MenuOverlay';
import ResultatKreidetafel from './ResultatKreidetafel';
import { useNavigationHistory } from '../../hooks/useNavigationHistory';
import HistoryWarning from '../notifications/HistoryWarnings';
import GameInfoOverlay from '../game/GameInfoOverlay';
import { useJassStore } from '../../store/jassStore';
import { useOnboardingFlow } from '../../hooks/useOnboardingFlow';
import OnboardingFlow from '../onboarding/OnboardingFlow';
import { isPWA } from '../../utils/browserDetection';
import { isDev, FORCE_PWA_INSTALL } from '../../utils/devUtils';

interface JassKreidetafelProps {
  middleLineThickness?: number;
  zShapeConfig: {
    innerSpacing: number;
    sideSpacing: number;
    edgeSpacing: number;
  };
}

const JassKreidetafel: React.FC<JassKreidetafelProps> = ({
  middleLineThickness = 60,
  zShapeConfig
}) => {
  const [mounted, setMounted] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [activeContainer, setActiveContainer] = useState<'top' | 'bottom' | null>(null);

  const { 
    isGameStarted,
    isGameCompleted,
    scores: { top: topScore, bottom: bottomScore },
    currentPlayer,
    currentRound,
    updateScoreByStrich
  } = useGameStore();

  const { isJassStarted } = useJassStore();

  const { 
    menu: { isOpen: isMenuOpen },
    setMenuOpen,
    historyWarning,
    isGameInfoOpen,
    setGameInfoOpen,
    setLastDoubleClickPosition,
    setOverlayPosition
  } = useUIStore();

  const viewportHeight = useViewportHeight();

  // PWA Status und Browser Onboarding
  const [isPWAInstalled] = useState(() => isPWA());
  const [isBrowserOnboarding, setIsBrowserOnboarding] = useState(!isPWAInstalled);
  const [forceOnboarding, setForceOnboarding] = useState(false);

  const { 
    currentStep, 
    showOnboarding, 
    content,
    handleNext,
    handlePrevious,
    handleDismiss,
    canBeDismissed 
  } = useOnboardingFlow(isBrowserOnboarding);

  // Beim ersten Laden das Onboarding anzeigen
  useEffect(() => {
    if (!isPWAInstalled) {
      useUIStore.getState().showOnboarding(true, isPWAInstalled);
      setForceOnboarding(true); // Immer true
    }
  }, []);

  const isFirstTimeLoad = useMemo(() => 
    !isJassStarted && !isGameStarted
  , [isJassStarted, isGameStarted]);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    const midLinePos = Math.floor(adjustedViewportHeight / 2);
    const availableHeight = adjustedViewportHeight;
    const halfHeight = Math.floor(availableHeight / 2);

    return {
      topContainerHeight: halfHeight,
      bottomContainerHeight: halfHeight,
      middleLinePosition: midLinePos + safeAreaTop
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

  const triggerBlendEffect = useCallback((position: 'top' | 'bottom', direction: 'left' | 'right' = 'left') => {
    const animate = position === 'top' ? animateTopSwipe : animateBottomSwipe;
    animate(direction);

    // Optional: Visuelles Feedback
    const brightness = position === 'top' ? getTopBrightness : getBottomBrightness;
    brightness(1.2); // Kurzzeitig aufhellen
    
    setTimeout(() => {
      brightness(1); // Zurück zur normalen Helligkeit
    }, 300);
  }, [animateTopSwipe, animateBottomSwipe, getTopBrightness, getBottomBrightness]);

  // History Navigation Hooks
  const topHistoryNav = useNavigationHistory('top');
  const bottomHistoryNav = useNavigationHistory('bottom');

  const handleSwipe = useCallback((direction: 'up' | 'down' | 'left' | 'right', pos: TeamPosition) => {
    if (direction === 'left' || direction === 'right') {
      const historyNav = pos === 'top' ? topHistoryNav : bottomHistoryNav;
      historyNav.handleSwipe(direction);
      triggerBlendEffect(pos, direction);
      return;
    }

    // Bestehende Menü-Navigation
    if (direction === 'up' || direction === 'down') {
      const shouldOpen = (pos === 'top' && direction === 'up') || 
                        (pos === 'bottom' && direction === 'down');
      const shouldClose = (pos === 'top' && direction === 'down') || 
                         (pos === 'bottom' && direction === 'up');

      if (shouldOpen) {
        setOverlayPosition(pos);
        setActiveContainer(pos);
        setTimeout(() => {
          setMenuOpen(true);
          animateTopSwipe(true);
          animateBottomSwipe(true);
        }, 0);
      } else if (shouldClose) {
        setMenuOpen(false);
        setActiveContainer(null);
        setOverlayPosition(null);
        animateTopSwipe(false);
        animateBottomSwipe(false);
      }
    }
  }, [topHistoryNav, bottomHistoryNav, animateTopSwipe, animateBottomSwipe, setMenuOpen, triggerBlendEffect, setOverlayPosition]);

  const handleLongPress = useCallback((position: 'top' | 'bottom') => {
    if (!isMenuOpen) {
      setOverlayPosition(position);
      setActiveContainer(position);
      setIsCalculatorOpen(true);
    }
  }, [isMenuOpen]);

  const handleCalculatorClose = useCallback(() => {
    setIsCalculatorOpen(false);
    setActiveContainer(null);
    setOverlayPosition(null);
  }, []);

  const handleTafelClick = useDoubleClick((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isMenuOpen) {
      const clickY = e.clientY;
      const position: TeamPosition = clickY < middleLinePosition ? 'top' : 'bottom';
      
      setOverlayPosition(position);
      setLastDoubleClickPosition(position);
      setGameInfoOpen(true);
    }
  });

  useEffect(() => {
    if (mounted) {
      const initialCalc = setTimeout(() => {
        const vh = window.innerHeight;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
      }, 0);

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

  useEffect(() => {
    const handleScroll = () => {
      // Falls wir später scroll-abhängige Logik brauchen
    };

    window.addEventListener('scroll', handleScroll, { passive: false });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Blend-Effekt bei Punkteänderungen
  const prevTopScore = usePrevious(topScore);
  const prevBottomScore = usePrevious(bottomScore);

  useEffect(() => {
    if (prevTopScore !== undefined && topScore !== prevTopScore) {
      triggerBlendEffect('top', topScore > prevTopScore ? 'left' : 'right');
    }
  }, [topScore, prevTopScore, triggerBlendEffect]);

  useEffect(() => {
    if (prevBottomScore !== undefined && bottomScore !== prevBottomScore) {
      triggerBlendEffect('bottom', bottomScore > prevBottomScore ? 'left' : 'right');
    }
  }, [bottomScore, prevBottomScore, triggerBlendEffect]);

  const handleMenuClose = useCallback(() => {
    setMenuOpen(false);
    setActiveContainer(null);
    
    // Animation für beide Container zurücksetzen
    animateTopSwipe(false);
    animateBottomSwipe(false);
  }, [setMenuOpen, animateTopSwipe, animateBottomSwipe]);

  const handleStrichClick = useCallback((value: number, position: TeamPosition) => {
    updateScoreByStrich(position, value);
  }, [updateScoreByStrich]);

  const handleBlendEffect = useCallback((position: TeamPosition) => {
    // TODO: Blend-Effekt Implementierung
  }, []);

  // Debug-Log entfernen
  useEffect(() => {
    console.log('Onboarding Status:', {
      showOnboarding,
      forceOnboarding,
      canBeDismissed,
      isPWAInstalled
    });
  }, [showOnboarding, forceOnboarding, canBeDismissed, isPWAInstalled]);

  // Render-Logik vereinfacht
  if (!mounted) return null;

  return (
    <div 
      className="relative w-full h-full overflow-hidden bg-chalk-black prevent-interactions"
      onClick={handleTafelClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <OnboardingFlow 
        show={showOnboarding && forceOnboarding}
        step={currentStep as BrowserOnboardingStep}
        content={content}
        onNext={handleNext}
        onPrevious={handlePrevious}
        onDismiss={() => {}} // Leere Funktion
        canBeDismissed={false} // Immer false
        isPWA={isPWAInstalled}
        isBrowserOnboarding={isBrowserOnboarding}
      />
      {isFirstTimeLoad ? (
        <StartScreen />
      ) : (
        <>
          <SplitContainer
            position="top"
            height={topContainerHeight}
            zShapeConfig={zShapeConfig}
            padding="paddingTop"
            onSwipe={handleSwipe}
            y={topY}
            mainOpacity={topMainOpacity}
            getBrightness={getTopBrightness}
            onLongPress={() => handleLongPress('top')}
            score={topScore}
            triggerBlendEffect={handleBlendEffect}
            isHistoryNavigationActive={topHistoryNav.isInPast}
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
            currentPlayer={currentPlayer as PlayerNumber}
            currentRound={currentRound}
            opacity={topMainOpacity.get()}
            isOpen={isMenuOpen}
            isGameStarted={!isGameCompleted}
            gameStartTime={null} 
            roundStartTime={null}
          />
          <SplitContainer
            position="bottom"
            height={bottomContainerHeight}
            zShapeConfig={zShapeConfig}
            padding="paddingBottom"
            onSwipe={handleSwipe}
            y={bottomY}
            mainOpacity={bottomMainOpacity}
            getBrightness={getBottomBrightness}
            onLongPress={() => handleLongPress('bottom')}
            score={bottomScore}
            triggerBlendEffect={handleBlendEffect}
            isHistoryNavigationActive={bottomHistoryNav.isInPast}
          />
          {isCalculatorOpen && (
            <Calculator
              isOpen={isCalculatorOpen}
              onClose={handleCalculatorClose}
              onCancel={handleCalculatorClose}
              initialValue={0}
              clickedPosition={activeContainer!}
            />
          )}
          <MenuOverlay 
            isOpen={isMenuOpen}
            onClose={handleMenuClose}
            swipePosition={activeContainer || 'bottom'}
          />
          <ResultatKreidetafel />
        </>
      )}
      <HistoryWarning
        show={historyWarning.show}
        message={historyWarning.message}
        onConfirm={historyWarning.onConfirm}
        onDismiss={historyWarning.onCancel}
      />
      <GameInfoOverlay 
        isOpen={isGameInfoOpen}
        onClose={() => setGameInfoOpen(false)}
      />
    </div>
  );
};

// Helper Hook für Vergleich mit vorherigem Wert
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  
  useEffect(() => {
    ref.current = value;
  }, [value]);
  
  return ref.current;
}

export default JassKreidetafel;