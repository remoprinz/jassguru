// src/components/layout/JassKreidetafel.tsx

import React, {useState, useEffect, useMemo, useCallback, useRef, CSSProperties } from "react";
import {animated} from "react-spring";
import { useRouter } from 'next/router';
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
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import {isPWA} from "../../utils/browserDetection";
import {useTutorialStore} from "../../store/tutorialStore";
import TutorialOverlay from "../tutorial/TutorialOverlay";
import TutorialInfoDialog from "../tutorial/TutorialInfoDialog";
import { isDev, FORCE_TUTORIAL } from "../../utils/devUtils";
import {useDeviceScale} from "../../hooks/useDeviceScale";
import html2canvas from "html2canvas";
import {useAuthStore, AuthStatus} from "../../store/authStore";
import {BrowserOnboardingStep} from "../../constants/onboardingContent";
import { updateUserDocument } from "../../services/authService";
import { useGroupStore } from "@/store/groupStore";

// Definiere HTML2Canvas-Optionen Typ
interface HTML2CanvasOptions {
  useCORS: boolean;
  logging: boolean;
  width: number;
  height: number;
  scale: number;
}

// NEU: Typ hier definieren
type NavigationDirection = "forward" | "backward";

interface JassKreidetafelProps {
  middleLineThickness?: number;
  zShapeConfig: {
    innerSpacing: number;
    sideSpacing: number;
    edgeSpacing: number;
  };
}

// Define paths where the browser onboarding flow should NOT be shown
const onboardingExcludedPaths = ['/join', '/login', '/register', '/groups/new', '/groups/join']; // Add more if needed

// NEU: Hook zur Prüfung, ob ein Overlay aktiv ist
const useIsOverlayActive = () => {
  // OPTIMIERT: Selektiere einzelne primitive Werte statt eines Objekts
  const isMenuOpen = useUIStore(state => state.menu.isOpen);
  const isCalculatorOpen = useUIStore(state => state.calculator.isOpen);
  const isResultatOpen = useUIStore(state => state.resultatKreidetafel.isOpen);
  const isGameInfoOpen = useUIStore(state => state.isGameInfoOpen);
  const isSettingsOpen = useUIStore(state => state.settings.isOpen);
  const isTutorialInfoOpen = useUIStore(state => state.isTutorialInfoOpen);
  const isFarbeSettingsModalOpen = useUIStore(state => state.isFarbeSettingsModalOpen);
  const isJassFinishOpen = useUIStore(state => state.jassFinishNotification.isOpen);
  const isHistoryWarningShown = useUIStore(state => state.historyWarning.show);
  const isOnboardingShown = useUIStore(state => state.onboarding.show);

  return useMemo(() => {
    const isActive = isMenuOpen ||
           isCalculatorOpen ||
           isResultatOpen ||
           isGameInfoOpen ||
           isSettingsOpen ||
           isTutorialInfoOpen ||
           isFarbeSettingsModalOpen ||
           isJassFinishOpen ||
           isHistoryWarningShown ||
           isOnboardingShown;
    return isActive;
  }, [ // Dependencies sind jetzt die primitiven Booleans
    isMenuOpen, isCalculatorOpen, isResultatOpen, isGameInfoOpen, isSettingsOpen,
    isTutorialInfoOpen, isFarbeSettingsModalOpen, isJassFinishOpen, isHistoryWarningShown,
    isOnboardingShown
  ]);
};

const JassKreidetafel: React.FC<JassKreidetafelProps> = ({
  middleLineThickness = 4,
  zShapeConfig,
}) => {
  const currentPath = useRouter().pathname;

  const [mounted, setMounted] = useState(false);
  const [activeContainer, setActiveContainer] = useState<"top" | "bottom" | null>(null);
  const justSwipedRef = useRef(false); // NEU: Ref, um eine kürzliche Wischgeste zu verfolgen
  const lastWeisClickRef = useRef<{ team: TeamPosition; time: number } | null>(null); // NEU für Debounce

  const router = useRouter();
  const pathname = router.pathname;

  const {
    isGameStarted,
    isGameCompleted,
    scores,
    addWeisPoints,
    weisPoints,
    activeGameId,
    isRoundCompleted,
  } = useGameStore();
  
  // Sichere Destrukturierung der scores mit Fallback
  const { top: topScore = 0, bottom: bottomScore = 0 } = scores || { top: 0, bottom: 0 };
  
  const isOnlineMode = !!activeGameId; // Definition von isOnlineMode

  const {isJassStarted} = useJassStore();

  const {
    menu: {isOpen: isMenuOpen},
    setMenuOpen,
    historyWarning,
    isGameInfoOpen,
    setGameInfoOpen,
    setOverlayPosition,
    isTutorialInfoOpen,
    onboarding,
    showOnboarding: showOnboardingAction,
    hideOnboarding: hideOnboardingAction,
    calculator, // Calculator-State für die Prüfung, ob er geöffnet ist
    openCalculator, // Action zum Öffnen
    closeCalculator, // Action zum Schliessen
    setLastDoubleClickPosition,
  } = useUIStore();

  // Verwende calculator.isOpen aus dem UIStore
  const isCalculatorOpen = calculator.isOpen;

  // Auth-Status abrufen
  const authStatus = useAuthStore((state) => state.status);

  // Tutorial Store Hook
  const {
    isActive: isTutorialActive,
    hasCompletedTutorial,
    getCurrentStep,
    startTutorial,
  } = useTutorialStore();

  // Verwende den neuen Hook
  const isOverlayActive = useIsOverlayActive();

  const viewportHeight = useViewportHeight();

  // Leite den Status direkt aus dem Store ab
  const showOnboardingState = onboarding.show;
  const canBeDismissedState = onboarding.canBeDismissed;

  const [isPWAInstalled] = useState(() => isPWA());

  // Bestimme *ob* Browser Onboarding erforderlich ist
  const isBrowserOnboardingRequired = useMemo(() => {
    const currentPath = pathname;
    const isExcluded = onboardingExcludedPaths.includes(currentPath);
    const result = !isDev && !isPWAInstalled && !isExcluded;
    return result;
  }, [isDev, isPWAInstalled, pathname]);

  // Hook liefert showOnboarding nicht mehr
  const {
    currentStep,
    content,
    handleNext,
    handlePrevious,
    handleDismiss,
    canBeDismissed,
  } = useOnboardingFlow(isBrowserOnboardingRequired);

  // Auth-Status abrufen
  const {isAuthenticated} = useAuthStore();

  // Device Scale Hook
  const {scale, deviceType} = useDeviceScale();

  const isFirstTimeLoad = useMemo(() => {
    const result = !isJassStarted && !isGameStarted;
    return result;
  }, [isJassStarted, isGameStarted]);

  const isReadOnlyMode = useUIStore(state => state.isReadOnlyMode); // Verhindere Tutorial im Zuschauermodus

  useEffect(() => {
    setMounted(true);
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

  // Swipes - JETZT MIT isOverlayActive Prüfung
  const handleSwipe = useCallback(
    (direction: "up" | "down" | "left" | "right", pos: TeamPosition) => {
      if (direction === "left" || direction === "right") {
        // Blockiere History-Navigation, wenn ein Overlay aktiv ist
        if (isOverlayActive) {
          return;
        }
        const historyNav = pos === "top" ? topHistoryNav : bottomHistoryNav;
        
        // Bestimme die LOGISCHE Navigationsrichtung
        const logicalDirection: NavigationDirection = direction === 'left' ? 'backward' : 'forward';

        // Rufe die Navigationslogik mit der physischen Richtung auf
        historyNav.handleSwipe(direction);
        
        // Löse den visuellen Effekt KONSISTENT basierend auf der LOGISCHEN Richtung aus
        const visualEffectDirection = logicalDirection === 'backward' ? 'left' : 'right';
        triggerBlendEffect(pos, visualEffectDirection); // Konsistenter visueller Effekt
        
        return;
      }

      // Up/Down Swipe Logik (Menü öffnen/schliessen) - KEINE Blockade hier, da Menü selbst das Overlay ist
      if (direction === "up" || direction === "down") {
        // NEU: Setze ein Flag, dass eine Wischgeste stattgefunden hat, um LongPress zu verhindern
        justSwipedRef.current = true;
        setTimeout(() => {
          justSwipedRef.current = false;
        }, 500); // 500ms Verzögerung, um Konflikte zu vermeiden

        const shouldOpen = (pos === "top" && direction === "up") || (pos === "bottom" && direction === "down");
        const shouldClose = (pos === "top" && direction === "down") || (pos === "bottom" && direction === "up");

        // Verhindere Öffnen, wenn bereits ein anderes Overlay aktiv ist (ausser dem Menü selbst)
        const canOpenMenu = !isOverlayActive || isMenuOpen;

        if (shouldOpen && canOpenMenu) {
          setOverlayPosition(pos);
          setActiveContainer(pos);
          setTimeout(() => {
            setMenuOpen(true); // Öffnet das Menü
            animateTopSwipe(true);
            animateBottomSwipe(true);
          }, 0);
        } else if (shouldClose && isMenuOpen) { // Schliessen nur, wenn Menü offen war
          setMenuOpen(false); // Schliesst das Menü
          setActiveContainer(null);
          setOverlayPosition(null);
          animateTopSwipe(false);
          animateBottomSwipe(false);
        } else if (shouldOpen && !canOpenMenu) {
        }
      }
    },
    [isOverlayActive, isMenuOpen, // Füge isOverlayActive und isMenuOpen hinzu
      topHistoryNav, bottomHistoryNav, animateTopSwipe, animateBottomSwipe, setMenuOpen, setOverlayPosition, triggerBlendEffect]
  );

  // LongPress → Kalkulator - JETZT MIT isOverlayActive Prüfung
  const handleLongPress = useCallback(
    (position: TeamPosition) => {
      // NEU: Verhindere LongPress, wenn gerade eine Wischgeste stattgefunden hat
      if (justSwipedRef.current) {
        return;
      }
      
      // Blockiere LongPress, wenn ein Overlay aktiv ist
      if (isOverlayActive) {
        return;
      }
      setOverlayPosition(position);
      setActiveContainer(position);
      openCalculator(); // Verwende Action aus UIStore
      window.dispatchEvent(new CustomEvent("calculatorOpen"));
    },
    [isOverlayActive, // Füge isOverlayActive hinzu
      setOverlayPosition, setActiveContainer, openCalculator] // Verwende openCalculator
  );

  // Calculator Close Handler - Verwende Action aus UIStore
  const handleCalculatorClose = useCallback(() => {
    closeCalculator(); // Verwende Action aus UIStore
    setActiveContainer(null);
    setOverlayPosition(null);
  }, [closeCalculator, setActiveContainer, setOverlayPosition]); // Füge closeCalculator hinzu

  // "Einzelklick" vs. "Doppelklick" in useGlobalClick - JETZT MIT isOverlayActive Prüfung
  const {handleGlobalClick} = useGlobalClick({
    onSingleClick: (position, boxType) => {
      // NEU: Debounce-Check für Weispunkte
      const now = Date.now();
      if (
        lastWeisClickRef.current &&
        lastWeisClickRef.current.team === position &&
        now - lastWeisClickRef.current.time < 300 // 300ms Cooldown
      ) {
        console.log("⏱️ Weispunkt-Click zu schnell, wird ignoriert (Debounced).");
        return;
      }

      setActiveContainer(position);

      // Hier die Logik für die Restzahl-Box hinzufügen
      if (boxType === "restzahl") {
        lastWeisClickRef.current = {team: position, time: now};
        addWeisPoints(position, 1); // Genau 1 Punkt für Restzahl-Weis
      } else {
        const numeric = parseInt(boxType, 10) || 20;
        lastWeisClickRef.current = {team: position, time: now};
        addWeisPoints(position, numeric); // addWeisPoints statt updateScoreByStrich
      }

      // Blend-Effekt auslösen
      triggerBlendEffect(position, 'left'); // 'left' für "positiv" bzw. Punkte hinzugefügt
    },
    // --- NEU: onDoubleClick Handler hinzufügen --- 
    onDoubleClick: (position, boxType) => {
      // Öffne GameInfo nur, wenn kein Overlay aktiv ist (ausser GameInfo selbst)
      if (isOverlayActive && !isGameInfoOpen) {
        return;
      }
      setLastDoubleClickPosition(position);
      setGameInfoOpen(true);
    },
    middleLinePosition,
    delay: 230, // Konsistent mit GameInfoOverlay
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

  // Punkte-Änderungen für Blend-Effekt (vereinfacht)
  const prevTopScore = usePrevious(topScore);
  const prevBottomScore = usePrevious(bottomScore);
  const prevTopWeis = usePrevious(weisPoints.top);
  const prevBottomWeis = usePrevious(weisPoints.bottom);

  useEffect(() => {
    // Prüfe die Summe, da weisPoints nun Teil der Anzeige sind
    const currentTopTotal = topScore + weisPoints.top;
    const prevTopTotal = (prevTopScore ?? topScore) + (prevTopWeis ?? weisPoints.top);
    if (prevTopScore !== undefined && currentTopTotal !== prevTopTotal) {
      triggerBlendEffect("top", currentTopTotal > prevTopTotal ? "left" : "right");
    }
  }, [topScore, weisPoints.top, prevTopScore, prevTopWeis, triggerBlendEffect]);

  useEffect(() => {
    const currentBottomTotal = bottomScore + weisPoints.bottom;
    const prevBottomTotal = (prevBottomScore ?? bottomScore) + (prevBottomWeis ?? weisPoints.bottom);
    if (prevBottomScore !== undefined && currentBottomTotal !== prevBottomTotal) {
      triggerBlendEffect("bottom", currentBottomTotal > prevBottomTotal ? "left" : "right");
    }
  }, [bottomScore, weisPoints.bottom, prevBottomScore, prevBottomWeis, triggerBlendEffect]);

  // Debug-Log für Score-Änderungen (unverändert)
  useEffect(() => {
    // console.log(`[JassKreidetafel] Score-Änderung - Top: ${topScore} + ${weisPoints.top} = ${topScore + weisPoints.top}, Bottom: ${bottomScore} + ${weisPoints.bottom} = ${bottomScore + weisPoints.bottom}`);
    if (activeGameId) {
      // console.log(`[JassKreidetafel] Online-Modus aktiv (ID: ${activeGameId})`);
    }
  }, [topScore, bottomScore, weisPoints.top, weisPoints.bottom, activeGameId]);

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

  // Funktion, die entscheidet, ob das Tutorial angezeigt werden soll (Hierher verschoben)
  const shouldShowTutorial = useCallback(() => {
    // 1. Prüfe zuerst, ob das Tutorial bereits abgeschlossen wurde
    if (hasCompletedTutorial) {
      return false;
    }
    
    // 2. Tutorial nicht anzeigen, wenn der Benutzer ECHT eingeloggt ist (nicht nur Gast)
    if (authStatus === 'authenticated') {
      return false;
    }
    
    // 3. Standard Tutorial-Logik für Gäste und nicht eingeloggte Benutzer
    return !isGameStarted && !isJassStarted && !isTutorialInfoOpen;
  }, [isGameStarted, isJassStarted, isTutorialInfoOpen, hasCompletedTutorial, authStatus]);

  // Tutorial
  useEffect(() => {
    if (isReadOnlyMode) {
      return;
    }

    // Hole die aktuellsten Werte direkt aus dem Store für die Entscheidung
    const storeState = useTutorialStore.getState();
    const currentIsActive = storeState.isActive;
    const currentHasCompleted = storeState.hasCompletedTutorial;

    // Definiere die Bedingungen für den Tutorial-Start hier direkt
    // basierend auf den aktuellsten Store-Werten und anderen reaktiven Props.
    const conditionsMetForTutorialStart = 
      !currentHasCompleted &&         // Tutorial ist definitiv NICHT abgeschlossen
      authStatus !== 'authenticated' && // User ist Gast oder nicht eingeloggt
      !isGameStarted &&
      !isJassStarted &&
      !isTutorialInfoOpen;

    if (
      mounted &&
      !currentIsActive && // Prüfe den aktuellen Aktiv-Status aus dem Store
      (conditionsMetForTutorialStart || (isDev && FORCE_TUTORIAL))
    ) {
      startTutorial();
    }
    // Abhängigkeiten: Dieser Effekt soll neu laufen, wenn sich einer dieser Werte ändert.
    // authStatus, isGameStarted, etc. sind für conditionsMetForTutorialStart relevant.
    // isTutorialActive und hasCompletedTutorial (die reaktiven Pendants zu currentIsActive/currentHasCompleted)
    // stellen sicher, dass der Hook bei Store-Änderungen erneut getriggert wird.
  }, [mounted, authStatus, isGameStarted, isJassStarted, isTutorialInfoOpen, isReadOnlyMode, startTutorial, isTutorialActive, hasCompletedTutorial, isDev]);

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
      const {action, teamPosition} = evt.detail;
      if (action === "open") {
        setOverlayPosition(teamPosition);
        setActiveContainer(teamPosition);
        setMenuOpen(true);

        requestAnimationFrame(() => {
          animateTopSwipe(true);
          animateBottomSwipe(true);
        });
      } else if (action === "close") {
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
  }, [animateTopSwipe, animateBottomSwipe, setMenuOpen, setOverlayPosition, setActiveContainer]);

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
          const fullShareText = `${message}

Generiert von:
👉 https://jassguru.ch`;

          await navigator.share({
            files: [new File([blob], "jass-resultat.png", { type: "image/png" })],
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

  // Diese Definitionen müssen vorhanden sein
  const { currentGroup } = useGroupStore();
  const { user } = useAuthStore();
  const lastProcessedGroupId = useRef<string | null>(null);

  useEffect(() => {
    const userId = user?.uid;
    const groupId = currentGroup?.id ?? null; // Aktuelle Group ID oder null

    // Nur ausführen, wenn sich die ID tatsächlich geändert hat und der User bekannt ist
    if (userId && groupId !== lastProcessedGroupId.current) {
      lastProcessedGroupId.current = groupId; // Update nach erfolgreichem Schreiben
    } else if (!userId && lastProcessedGroupId.current !== null) {
       // Wenn der User sich ausloggt, den gespeicherten Wert zurücksetzen
       lastProcessedGroupId.current = null;
    }

  }, [user, currentGroup]);

  // Hole den gesamten GameStore-State separat für RoundInfo Props
  const gameStoreStateForRoundInfo = useGameStore();

  if (!mounted) return null;

  // Bedingung für das Anzeigen des StartScreens
  const showStartScreenCondition = isFirstTimeLoad && !isTutorialActive;

  return (
    <div
      className="relative w-full h-screen overflow-hidden bg-chalk-black prevent-interactions max-w-xl mx-auto flex flex-col justify-center"
      onClick={handleGlobalClick} // handleGlobalClick prüft jetzt intern auf Overlays
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

      {/* Rendere OnboardingFlow wenn erforderlich */}
      {isBrowserOnboardingRequired && (() => {
        return (
          <OnboardingFlow
            show={isBrowserOnboardingRequired && !isDev} // Vereinfachte Bedingung
            step={currentStep as BrowserOnboardingStep}
            content={content}
            onNext={handleNext}
            onPrevious={handlePrevious}
            onDismiss={handleDismiss}
            canBeDismissed={canBeDismissedState ?? false}
            isPWA={isPWAInstalled}
            isBrowserOnboarding={isBrowserOnboardingRequired}
          />
        );
      })()}

      {showStartScreenCondition ? (
        <StartScreen />
      ) : (
        <>
          {/* TOP */}
          <SplitContainer
            position="top"
            height={topContainerHeight}
            zShapeConfig={zShapeConfig}
            padding="paddingTop"
            onSwipe={tutorialInteractions?.handleSwipe ?? handleSwipe} // handleSwipe prüft jetzt intern
            y={topY}
            mainOpacity={topMainOpacity}
            getBrightness={getTopBrightness}
            onLongPress={tutorialInteractions?.handleLongPress ?? handleLongPress} // handleLongPress prüft jetzt intern
            score={topScore + weisPoints.top} 
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
            } as unknown as CSSProperties}
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
            } as unknown as CSSProperties}
            className="bg-chalk-red"
          />

          <RoundInfo
            currentPlayer={gameStoreStateForRoundInfo.currentPlayer as PlayerNumber}
            startingPlayer={gameStoreStateForRoundInfo.startingPlayer as PlayerNumber}
            currentRound={gameStoreStateForRoundInfo.currentRound}
            opacity={topMainOpacity.get()}
            isOpen={isMenuOpen}
            isGameStarted={!gameStoreStateForRoundInfo.isGameCompleted}
            gameStartTime={null}
            roundStartTime={null}
            startFadeIn={!isMenuOpen}
          />

          {/* BOTTOM */}
          <SplitContainer
            position="bottom"
            height={bottomContainerHeight}
            zShapeConfig={zShapeConfig}
            padding="paddingBottom"
            onSwipe={tutorialInteractions?.handleSwipe ?? handleSwipe} // handleSwipe prüft jetzt intern
            y={bottomY}
            mainOpacity={bottomMainOpacity}
            getBrightness={getBottomBrightness}
            onLongPress={tutorialInteractions?.handleLongPress ?? handleLongPress} // handleLongPress prüft jetzt intern
            score={bottomScore + weisPoints.bottom}
            triggerBlendEffect={handleBlendEffect}
            isHistoryNavigationActive={bottomHistoryNav.isInPast}
          />

          {/* Render Calculator only if its state is open */}
          {isCalculatorOpen && ( // Verwende isCalculatorOpen aus dem UIStore
            <Calculator
              isOpen={isCalculatorOpen} // Übergebe den Zustand
              onClose={handleCalculatorClose}
              onCancel={handleCalculatorClose}
              initialValue={0}
              clickedPosition={activeContainer || "bottom"} // Fallback für Position
            />
          )}
          <MenuOverlay
            isOpen={isMenuOpen} // Verwende isMenuOpen aus dem UIStore
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
