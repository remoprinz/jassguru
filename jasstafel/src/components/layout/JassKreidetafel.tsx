// src/components/layout/JassKreidetafel.tsx

import React, {useState, useEffect, useMemo, useCallback, useRef} from "react";
import {animated} from "react-spring";
import useViewportHeight from "../../hooks/useViewportHeight";
import SplitContainer from "./SplitContainer";
import useSwipeAnimation from "../animations/useSwipeAnimation";
import Calculator from "../game/Calculator";
import {useGameStore} from "../../store/gameStore";
import StartScreen from "./StartScreen";
import RoundInfo from "../game/RoundInfo";
import {useGlobalClick} from "../../hooks/useGlobalClick";
import {PlayerNumber, TeamPosition} from "../../types/jass";
import {useUIStore} from "../../store/uiStore";
import MenuOverlay from "./MenuOverlay";
import ResultatKreidetafel from "./ResultatKreidetafel";
import {useNavigationHistory} from "../../hooks/useNavigationHistory";
import HistoryWarning from "../notifications/HistoryWarnings";
import GameInfoOverlay from "../game/GameInfoOverlay";
import {useJassStore} from "../../store/jassStore";
import {useOnboardingFlow} from "../../hooks/useOnboardingFlow";
import OnboardingFlow from "../onboarding/OnboardingFlow";
import {isPWA} from "../../utils/browserDetection";
import {useTutorialStore} from "../../store/tutorialStore";
import TutorialOverlay from "../tutorial/TutorialOverlay";
import TutorialInfoDialog from "../tutorial/TutorialInfoDialog";
import {isDev, FORCE_TUTORIAL} from "../../utils/devUtils";
import {useDeviceScale} from "../../hooks/useDeviceScale";
import html2canvas from "html2canvas";
import {useAuthStore} from "../../store/authStore";
import {BrowserOnboardingStep} from "../../constants/onboardingContent";

// Definiere HTML2Canvas-Optionen Typ
interface HTML2CanvasOptions {
  useCORS: boolean;
  logging: boolean;
  width: number;
  height: number;
  scale: number;
}

interface JassKreidetafelProps {
  middleLineThickness?: number;
  zShapeConfig: {
    innerSpacing: number;
    sideSpacing: number;
    edgeSpacing: number;
  };
}

const JassKreidetafel: React.FC<JassKreidetafelProps> = ({
  middleLineThickness = 4,
  zShapeConfig,
}) => {
  const [mounted, setMounted] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [activeContainer, setActiveContainer] = useState<"top" | "bottom" | null>(null);

  const {
    isGameStarted,
    isGameCompleted,
    scores: {top: topScore, bottom: bottomScore},
    currentPlayer,
    currentRound,
    addWeisPoints,
  } = useGameStore();

  const {isJassStarted} = useJassStore();

  const {
    menu: {isOpen: isMenuOpen},
    setMenuOpen,
    historyWarning,
    isGameInfoOpen,
    setGameInfoOpen,
    setOverlayPosition,
    isTutorialInfoOpen,
  } = useUIStore();

  const viewportHeight = useViewportHeight();

  // Browser-Onboarding
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
    canBeDismissed,
  } = useOnboardingFlow(isBrowserOnboarding);

  // Tutorial
  const {
    isActive: isTutorialActive,
    hasCompletedTutorial,
    getCurrentStep,
    startTutorial,
  } = useTutorialStore();

  // Auth-Status abrufen
  const {isAuthenticated} = useAuthStore();

  // Device Scale Hook
  const {scale, deviceType} = useDeviceScale();

  // Onboarding beim ersten Laden
  useEffect(() => {
    if (!isPWAInstalled) {
      useUIStore.getState().showOnboarding(true, isPWAInstalled);
      setForceOnboarding(true);
    }
  }, [isPWAInstalled]);

  const isFirstTimeLoad = useMemo(() => !isJassStarted && !isGameStarted, [isJassStarted, isGameStarted]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setIsCalculatorOpen(false);
  }, []);

  // Container-Höhen berechnen
  const {topContainerHeight, bottomContainerHeight, middleLinePosition} = useMemo(() => {
    if (typeof window === "undefined" || !mounted) {
      return {topContainerHeight: 0, bottomContainerHeight: 0, middleLinePosition: 0};
    }
    const safeAreaTop = isPWA() ?
      parseInt(window.getComputedStyle(document.documentElement).getPropertyValue("--safe-area-top") || "0") :
      0;
    const safeAreaBottom = isPWA() ?
      parseInt(window.getComputedStyle(document.documentElement).getPropertyValue("--safe-area-bottom") || "0") :
      0;

    const adjustedViewportHeight = viewportHeight - safeAreaTop - safeAreaBottom;
    const midLinePos = Math.floor(adjustedViewportHeight / 2);
    const halfHeight = Math.floor(adjustedViewportHeight / 2);

    return {
      topContainerHeight: halfHeight,
      bottomContainerHeight: halfHeight,
      middleLinePosition: midLinePos + safeAreaTop,
    };
  }, [viewportHeight, middleLineThickness, mounted]);

  // Animations-Hooks
  const {
    y: topY,
    mainOpacity: topMainOpacity,
    oppositeOpacity: topOppositeOpacity,
    animateSwipe: animateTopSwipe,
    getBrightness: getTopBrightness,
  } = useSwipeAnimation({
    initialPosition: 0,
    maxOffset: viewportHeight * 0.07,
    position: "top",
  });

  const {
    y: bottomY,
    mainOpacity: bottomMainOpacity,
    oppositeOpacity: bottomOppositeOpacity,
    animateSwipe: animateBottomSwipe,
    getBrightness: getBottomBrightness,
  } = useSwipeAnimation({
    initialPosition: 0,
    maxOffset: viewportHeight * 0.07,
    position: "bottom",
  });

  // Blend / History
  const triggerBlendEffect = useCallback(
    (position: "top" | "bottom", direction: "left" | "right" = "left") => {
      const animate = position === "top" ? animateTopSwipe : animateBottomSwipe;
      animate(direction);
      const brightness = position === "top" ? getTopBrightness : getBottomBrightness;
      brightness(1.2);
      setTimeout(() => brightness(1), 300);
    },
    [animateTopSwipe, animateBottomSwipe, getTopBrightness, getBottomBrightness]
  );

  const topHistoryNav = useNavigationHistory("top");
  const bottomHistoryNav = useNavigationHistory("bottom");

  // Swipes
  const handleSwipe = useCallback(
    (direction: "up" | "down" | "left" | "right", pos: TeamPosition) => {
      if (direction === "left" || direction === "right") {
        const historyNav = pos === "top" ? topHistoryNav : bottomHistoryNav;
        historyNav.handleSwipe(direction);
        triggerBlendEffect(pos, direction);
        return;
      }
      if (direction === "up" || direction === "down") {
        const shouldOpen = (pos === "top" && direction === "up") || (pos === "bottom" && direction === "down");
        const shouldClose = (pos === "top" && direction === "down") || (pos === "bottom" && direction === "up");

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
    },
    [topHistoryNav, bottomHistoryNav, animateTopSwipe, animateBottomSwipe, setMenuOpen, setOverlayPosition, triggerBlendEffect]
  );

  // LongPress → Kalkulator
  const handleLongPress = useCallback(
    (position: TeamPosition) => {
      if (!isMenuOpen) {
        setOverlayPosition(position);
        setActiveContainer(position);
        setIsCalculatorOpen(true);
        // Tutorial-Event
        window.dispatchEvent(new CustomEvent("calculatorOpen"));
      }
    },
    [isMenuOpen]
  );

  // Calculator
  const handleCalculatorClose = useCallback(() => {
    setIsCalculatorOpen(false);
    setActiveContainer(null);
    setOverlayPosition(null);
  }, []);

  // "Einzelklick" vs. "Doppelklick" in useGlobalClick
  const {handleGlobalClick} = useGlobalClick({
    onSingleClick: (position, boxType) => {
      setActiveContainer(position);

      // Hier die Logik für die Restzahl-Box hinzufügen
      if (boxType === "restzahl") {
        addWeisPoints(position, 1); // Genau 1 Punkt für Restzahl-Weis
      } else {
        const numeric = parseInt(boxType, 10) || 20;
        addWeisPoints(position, numeric); // addWeisPoints statt updateScoreByStrich
      }
    },
    middleLinePosition,
    delay: 230,
  });

  // Window Resizing
  useEffect(() => {
    if (mounted) {
      const initialCalc = setTimeout(() => {
        const vh = window.innerHeight;
        document.documentElement.style.setProperty("--vh", `${vh}px`);
      }, 0);
      const secondCalc = setTimeout(() => {
        const vh = window.innerHeight;
        document.documentElement.style.setProperty("--vh", `${vh}px`);
      }, 100);
      return () => {
        clearTimeout(initialCalc);
        clearTimeout(secondCalc);
      };
    }
  }, [mounted]);

  // Scroll
  useEffect(() => {
    const handleScroll = () => {};
    window.addEventListener("scroll", handleScroll, {passive: false});
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Punkte-Änderungen
  const prevTopScore = usePrevious(topScore);
  const prevBottomScore = usePrevious(bottomScore);

  useEffect(() => {
    if (prevTopScore !== undefined && topScore !== prevTopScore) {
      triggerBlendEffect("top", topScore > prevTopScore ? "left" : "right");
    }
  }, [topScore, prevTopScore, triggerBlendEffect]);

  useEffect(() => {
    if (prevBottomScore !== undefined && bottomScore !== prevBottomScore) {
      triggerBlendEffect("bottom", bottomScore > prevBottomScore ? "left" : "right");
    }
  }, [bottomScore, prevBottomScore, triggerBlendEffect]);

  // Menü/Overlay
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setActiveContainer(null);
    animateTopSwipe(false);
    animateBottomSwipe(false);
  }, [setMenuOpen, animateTopSwipe, animateBottomSwipe]);

  const handleBlendEffect = useCallback((position: TeamPosition) => {
    // optionaler Blend-Effekt
  }, []);

  // Debug
  useEffect(() => {
    console.log("Onboarding Status:", {showOnboarding, forceOnboarding, canBeDismissed, isPWAInstalled});
  }, [showOnboarding, forceOnboarding, canBeDismissed, isPWAInstalled]);

  // Tutorial
  useEffect(() => {
    console.log("Tutorial Conditions:", {
      isPWA: isPWAInstalled,
      shouldShow: shouldShowTutorial(),
      hasCompleted: hasCompletedTutorial,
      mounted,
      isBrowserOnboarding,
    });
    const tutorialStore = useTutorialStore.getState();
    if (
      (isPWAInstalled || isDev) &&
      shouldShowTutorial() &&
      (!hasCompletedTutorial || FORCE_TUTORIAL) &&
      mounted &&
      !tutorialStore.isActive
    ) {
      console.log("Starting Tutorial!");
      startTutorial();
    }
  }, [mounted, isPWAInstalled]);

  const tutorialInteractions = useMemo(() => {
    if (!isTutorialActive) return null;
    return {
      handleSwipe,
      handleLongPress: (pos: TeamPosition) => handleLongPress(pos),
    };
  }, [isTutorialActive, handleSwipe, handleLongPress]);

  // Tutorial-Events (SplitContainer)
  useEffect(() => {
    const handleTutorialSplitContainer = (evt: CustomEvent) => {
      console.log("🎯 Tutorial Split Container Event:", {
        action: evt.detail.action,
        teamPosition: evt.detail.teamPosition,
        currentStep: getCurrentStep()?.id,
      });
      const {action, teamPosition} = evt.detail;
      if (action === "open") {
        console.log("📂 Opening container with:", {
          teamPosition,
          isMenuOpen: useUIStore.getState().menu.isOpen,
        });
        setOverlayPosition(teamPosition);
        setActiveContainer(teamPosition);
        setMenuOpen(true);

        requestAnimationFrame(() => {
          animateTopSwipe(true);
          animateBottomSwipe(true);
        });
      } else if (action === "close") {
        console.log("📂 Closing container");
        setOverlayPosition(null);
        setActiveContainer(null);
        setMenuOpen(false);

        requestAnimationFrame(() => {
          animateTopSwipe(false);
          animateBottomSwipe(false);
        });
      }
    };

    window.addEventListener("tutorial:splitContainer", handleTutorialSplitContainer as EventListener);
    return () => {
      window.removeEventListener("tutorial:splitContainer", handleTutorialSplitContainer as EventListener);
    };
  }, [animateTopSwipe, animateBottomSwipe, setMenuOpen, getCurrentStep]);

  // Screenshot-Funktion hinzufügen
  const captureAndShareScreenshot = useCallback(async (message: string) => {
    try {
      // 1. Originale Werte speichern
      const originalState = useUIStore.getState().resultatKreidetafel;

      // 2. Komponente vollständig auf "bottom" setzen
      useUIStore.setState((state) => ({
        resultatKreidetafel: {
          ...state.resultatKreidetafel,
          swipePosition: "bottom",
          isFlipped: false,
        },
      }));

      // 3. Warten auf vollständiges Re-render
      await new Promise((resolve) => setTimeout(resolve, 400));

      // 4. Screenshot-Logik
      const kreidetafelContent = document.querySelector(".kreidetafel-content");
      const statistikContainer = document.querySelector(".statistik-container");
      const buttonContainer = document.querySelector(".button-container");

      if (!kreidetafelContent || !statistikContainer || !buttonContainer ||
          !(kreidetafelContent instanceof HTMLElement) ||
          !(statistikContainer instanceof HTMLElement) ||
          !(buttonContainer instanceof HTMLElement)) {
        throw new Error("Erforderliche Elemente nicht gefunden");
      }

      // 5. Originale Styles speichern
      const originalStyles = {
        maxHeight: statistikContainer.style.maxHeight,
        overflowY: statistikContainer.style.overflowY,
        buttonDisplay: buttonContainer.style.display,
      };

      // 6. Styles für Screenshot anpassen
      statistikContainer.style.maxHeight = "none";
      statistikContainer.style.overflowY = "visible";
      buttonContainer.style.display = "none";

      try {
        // 7. Screenshot mit originalen Optionen
        const canvas = await html2canvas(kreidetafelContent, {
          useCORS: true,
          logging: false,
          width: kreidetafelContent.scrollWidth,
          height: kreidetafelContent.scrollHeight,
          scale: 2,
        } as HTML2CanvasOptions);

        // 8. Blob erstellen
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
          }, "image/png", 1.0);
        });

        // 9. Share API mit Text und Bild
        if (navigator.share) {
          const fullShareText = `${message}\n\nGeneriert von:\n👉 https://jassguru.web.app`;

          await navigator.share({
            files: [new File([blob], "jass-resultat.png", {type: "image/png"})],
            text: fullShareText,
          });
        }
      } finally {
        // 10. Ursprüngliche Styles wiederherstellen
        statistikContainer.style.maxHeight = originalStyles.maxHeight;
        statistikContainer.style.overflowY = originalStyles.overflowY;
        buttonContainer.style.display = originalStyles.buttonDisplay;

        // 11. Ursprünglichen Zustand wiederherstellen
        useUIStore.setState((state) => ({
          resultatKreidetafel: {
            ...state.resultatKreidetafel,
            ...originalState,
          },
        }));
      }
    } catch (error) {
      console.error("Screenshot/Share Fehler:", error);
    }
  }, []);

  // Funktion, die entscheidet, ob das Tutorial angezeigt werden soll
  const shouldShowTutorial = useCallback(() => {
    // Tutorial nicht anzeigen, wenn der Benutzer eingeloggt ist
    if (isAuthenticated()) {
      console.log("Tutorial deaktiviert für eingeloggte Benutzer");
      return false;
    }

    // Standard Tutorial-Logik für nicht eingeloggte Benutzer
    return !isGameStarted && !isJassStarted && !isTutorialInfoOpen;
  }, [isAuthenticated, isGameStarted, isJassStarted, isTutorialInfoOpen]);

  if (!mounted) return null;

  return (
    <div
      className="relative w-full h-screen overflow-hidden bg-chalk-black prevent-interactions max-w-xl mx-auto flex flex-col justify-center"
      onClick={handleGlobalClick}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        transform: `scale(${scale})`,
        transformOrigin: "center center",
      }}
    >
      <>
        <TutorialOverlay onCloseMenu={closeMenu} />
        {isTutorialInfoOpen && <TutorialInfoDialog />}
      </>

      {!isPWAInstalled && (
        <OnboardingFlow
          show={showOnboarding && forceOnboarding}
          step={currentStep as BrowserOnboardingStep}
          content={content}
          onNext={handleNext}
          onPrevious={handlePrevious}
          onDismiss={() => {}}
          canBeDismissed={false}
          isPWA={isPWAInstalled}
          isBrowserOnboarding={isBrowserOnboarding}
        />
      )}

      {isFirstTimeLoad && !isTutorialActive ? (
        <StartScreen />
      ) : (
        <>
          {/* TOP */}
          <SplitContainer
            position="top"
            height={topContainerHeight}
            zShapeConfig={zShapeConfig}
            padding="paddingTop"
            onSwipe={tutorialInteractions?.handleSwipe ?? handleSwipe}
            y={topY}
            mainOpacity={topMainOpacity}
            getBrightness={getTopBrightness}
            onLongPress={(pos) => handleLongPress(pos)}
            score={topScore}
            triggerBlendEffect={handleBlendEffect}
            isHistoryNavigationActive={topHistoryNav.isInPast}
          />
          <animated.div
            style={{
              position: "absolute",
              left: "5%",
              width: "90%",
              top: middleLinePosition - middleLineThickness / 2,
              height: `${middleLineThickness / 2}px`,
              transform: topY.to((val) => `translateY(${-val}px)`),
            }}
            className="bg-chalk-red"
          />
          <animated.div
            style={{
              position: "absolute",
              left: "5%",
              width: "90%",
              top: middleLinePosition,
              height: `${middleLineThickness / 2}px`,
              transform: bottomY.to((val) => `translateY(${val}px)`),
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

          {/* BOTTOM */}
          <SplitContainer
            position="bottom"
            height={bottomContainerHeight}
            zShapeConfig={zShapeConfig}
            padding="paddingBottom"
            onSwipe={tutorialInteractions?.handleSwipe ?? handleSwipe}
            y={bottomY}
            mainOpacity={bottomMainOpacity}
            getBrightness={getBottomBrightness}
            onLongPress={(pos) => handleLongPress(pos)}
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
            onClose={closeMenu}
            swipePosition={activeContainer || "bottom"}
          />
          <ResultatKreidetafel />
        </>
      )}
      <HistoryWarning
        show={historyWarning.show}
        message={historyWarning.message}
        onConfirm={historyWarning.onConfirm}
        onDismiss={historyWarning.onCancel}
        swipePosition={activeContainer || "bottom"}
      />
      <GameInfoOverlay isOpen={isGameInfoOpen} onClose={() => setGameInfoOpen(false)} />
    </div>
  );
};

// Helper: usePrevious
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

export default JassKreidetafel;
