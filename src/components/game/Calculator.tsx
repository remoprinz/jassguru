// src/components/game/Calculator.tsx
"use client";

import React, {useState, useEffect, useCallback, useRef} from "react";
import {useGameStore} from "../../store/gameStore";
import {useUIStore} from "../../store/uiStore";
import {useGroupStore} from "../../store/groupStore";
import {useTournamentStore} from "../../store/tournamentStore";
import {TeamPosition, JassColor, StrichTyp, CardStyle, FarbeModeKey, FarbeSettings, ScoreSettings, StrokeSettings} from "../../types/jass";
import {FaUndo, FaTimes} from "react-icons/fa";
import {useSpring, animated} from "react-spring";
import {triggerMatschConfetti} from "../effects/MatschConfetti";
import {HISTORY_WARNING_MESSAGE} from "../notifications/HistoryWarnings";
import {FARBE_MODES} from "../../config/FarbeSettings";
import {MAX_SCORE, MATSCH_SCORE} from "../../config/ScoreSettings";
import {getPictogram} from "../../utils/pictogramUtils";
import {usePressableButton} from "../../hooks/usePressableButton";
import {useTutorialStore} from "../../store/tutorialStore";
import {useDeviceScale} from "../../hooks/useDeviceScale";
import {useVerticalScale} from "../../hooks/useVerticalScale";
import {DEFAULT_FARBE_SETTINGS} from "@/config/FarbeSettings";
import { DEFAULT_SCORE_SETTINGS } from "@/config/ScoreSettings";
import { DEFAULT_STROKE_SETTINGS } from "@/config/GameSettings";
import { useJassStore } from "@/store/jassStore";
import {triggerProgressivePressHaptic} from "@/utils/haptics";

interface CalculatorProps {
  isOpen: boolean;
  onClose: () => void;
  onCancel: () => void;
  initialValue?: number;
  clickedPosition: TeamPosition;
}

// Füge einen PictogramConfig Typ hinzu oder importiere ihn, falls er existiert
type PictogramConfig = {
  isEnabled: boolean;
  mode: "svg" | "emoji";
};

const FarbeButton: React.FC<{
  color: string,
  multiplier: number,
  handleColorClick: (color: string, multiplier: number) => void,
  selectedColor: string,
  pictogramConfig: PictogramConfig,
  isClient: boolean,
  getButtonStyle: (color: string, isSelected: boolean, mode: "svg" | "emoji") => string,
  getPictogram: (color: JassColor, mode: "svg" | "emoji", style: CardStyle) => string,
  cardStyle: CardStyle,
  getDisplayName: (color: string) => string
}> = ({
  color,
  multiplier,
  handleColorClick,
  selectedColor,
  pictogramConfig,
  isClient,
  getButtonStyle,
  getPictogram,
  cardStyle,
  getDisplayName,
}) => {
  const {handlers, buttonClasses} = usePressableButton(
    () => handleColorClick(color, multiplier)
  );

  const isMisereSelected = color.toLowerCase() === "misère" && selectedColor === color;

  return (
    <button
      key={color}
      {...handlers}
      className={`p-1 rounded-xl text-white select-none text-xs h-12 flex items-center justify-center ${
        selectedColor === color ? "active" : ""
      } ${getButtonStyle(color, selectedColor === color, pictogramConfig.mode)} ${buttonClasses}`}
      aria-label={`${color}`}
    >
      {isClient && pictogramConfig.isEnabled ? (
        pictogramConfig.mode === "emoji" ? (
          <span className="text-2xl">
            {getPictogram(color as JassColor, "emoji", cardStyle)}
          </span>
        ) : (
          <img
            src={getPictogram(color as JassColor, "svg", cardStyle)}
            alt={color}
            className={`w-10 h-10 object-contain ${
              isMisereSelected ? "invert brightness-0" : ""
            }`}
            onError={(e) => {
              e.currentTarget.style.display = "none";
              const parent = e.currentTarget.parentElement;
              if (parent) {
                parent.textContent = getDisplayName(color);
              }
            }}
          />
        )
      ) : getDisplayName(color)}
    </button>
  );
};

const NumberButton: React.FC<{
  num: number,
  handleNumberClick: (num: number) => void
}> = ({
  num,
  handleNumberClick,
}) => {
  const {handlers, buttonClasses} = usePressableButton(
    () => handleNumberClick(num)
  );

  return (
    <button
      key={num}
      {...handlers}
      className={`bg-gradient-to-b from-gray-600 to-gray-700 shadow-inner border border-gray-500/30 text-white p-4 rounded-xl select-none text-2xl font-bold font-sans ${buttonClasses}`}
    >
      {num}
    </button>
  );
};

const Calculator: React.FC<CalculatorProps> = ({
  isOpen,
  onClose,
  onCancel,
  initialValue = 0,
  clickedPosition,
}) => {
  // Hole den gesamten gameStore-State einmal, um auf alle Properties sicher zugreifen zu können
  const gameStoreState = useGameStore.getState();
  const {
    finalizeRound, 
    currentHistoryIndex, 
    roundHistory, 
    showHistoryWarning, 
    jumpToLatest, 
    validateHistoryAction, 
    activeGameId: gameStoreActiveGameId, // Hole activeGameId direkt für die Übergabe
    farbeSettings: gameFarbeSettings, 
    scoreSettings: gameScoreSettings,
    strokeSettings: gameStrokeSettings,
    setFarbe, // NEU: Füge setFarbe hinzu
    currentPlayer,
    striche,
    scores,
  } = useGameStore();

  const {calculator, setCalculatorFlipped, settings: {pictogramConfig}, isReadOnlyMode, setGlobalClickDisabled} = useUIStore();
  const {isActive: isTutorialActive, getCurrentStep} = useTutorialStore();
  const currentStep = getCurrentStep();

  // WICHTIG: Hole Kontext-Stores
  const {currentGroup} = useGroupStore();
  const { currentTournamentInstance } = useTournamentStore();

  const { currentSession } = useJassStore();

  // KORRIGIERTE Settings-Hierarchie - explizit UIStore für Gästemodus priorisieren
  const getCorrectSettings = useCallback(() => {
    // Hole die neuesten States direkt hier, um Aktualität zu garantieren
    const { 
        activeGameId, 
        farbeSettings: gameFarbeSettings, 
        scoreSettings: gameScoreSettings,
        strokeSettings: gameStrokeSettings
    } = useGameStore.getState();
    const { currentTournamentInstance } = useTournamentStore.getState();
    const { currentGroup } = useGroupStore.getState();
    const uiStoreState = useUIStore.getState();

    // 1. ABSOLUTE PRIORITÄT: Ein aktives Online-Spiel
    // Der gameStore ist die EINZIGE Wahrheit für ein laufendes Spiel.
    if (activeGameId && gameFarbeSettings && gameScoreSettings && gameStrokeSettings) {
      return {
        farbeSettings: gameFarbeSettings,
        scoreSettings: gameScoreSettings,
        strokeSettings: gameStrokeSettings,
        source: 'gameStore-active'
      };
    }
    
    // --- FALLBACK-HIERARCHIE (NUR WENN KEIN SPIEL AKTIV IST) ---

    // 2. Turniereinstellungen (falls ein Turnier-Kontext besteht, aber das Spiel noch nicht gestartet ist)
    if (currentTournamentInstance?.settings) {
       console.log('[Calculator] PRIORITÄT 2: Turnier-Kontext. Verwende TURNIER-Settings.');
      return {
        farbeSettings: currentTournamentInstance.settings.farbeSettings || DEFAULT_FARBE_SETTINGS,
        scoreSettings: {
          ...DEFAULT_SCORE_SETTINGS,
          ...(currentTournamentInstance.settings.scoreSettings || {}),
        },
        strokeSettings: currentTournamentInstance.settings.strokeSettings || DEFAULT_STROKE_SETTINGS,
        source: 'tournament'
      };
    }

    // 3. Gruppeneinstellungen (falls Gruppen-Kontext)
    if (currentGroup) {
       console.log('[Calculator] PRIORITÄT 3: Gruppen-Kontext. Verwende GRUPPEN-Settings.');
      return {
        farbeSettings: currentGroup.farbeSettings || DEFAULT_FARBE_SETTINGS,
        scoreSettings: {
          ...DEFAULT_SCORE_SETTINGS,
          ...(currentGroup.scoreSettings || {}),
        },
        strokeSettings: currentGroup.strokeSettings || DEFAULT_STROKE_SETTINGS,
        source: 'group'
      };
    }

    // 4. UI Store Einstellungen (für Gastmodus/Offline)
    console.log('[Calculator] PRIORITÄT 4: Kein Online-Kontext. Verwende UI-STORE-Settings (Gastmodus).');
    return {
        farbeSettings: uiStoreState.farbeSettings,
        scoreSettings: uiStoreState.scoreSettings,
        strokeSettings: uiStoreState.strokeSettings,
        source: 'uiStore-guest'
    };
    
  }, []); // Keine Abhängigkeiten mehr, da der State frisch geholt wird.

  // State für die aktiven Einstellungen - jetzt OHNE Default-Initialisierung
  const [activeFarbeSettings, setActiveFarbeSettings] = useState<FarbeSettings | null>(null);
  const [activeScoreSettings, setActiveScoreSettings] = useState<ScoreSettings | null>(null);
  const [activeStrokeSettings, setActiveStrokeSettings] = useState<StrokeSettings | null>(null);

  // NEUER useEffect: Settings beim Öffnen oder bei Kontext-Änderungen aktualisieren
  useEffect(() => {
    if (!isOpen) return; // Nur aktualisieren, wenn Calculator geöffnet ist

    const correctSettings = getCorrectSettings();


    // IMMER die korrekten Settings setzen (keine Vergleiche mehr)
    setActiveFarbeSettings(correctSettings.farbeSettings);
    setActiveScoreSettings(correctSettings.scoreSettings);
    setActiveStrokeSettings(correctSettings.strokeSettings);

  }, [
    isOpen, 
    getCorrectSettings // Alles was getCorrectSettings beeinflusst, triggert Update
  ]);

  // Fallback für Rendering: Falls Settings noch nicht geladen (sollte nie auftreten)
  const renderFarbeSettings = activeFarbeSettings || DEFAULT_FARBE_SETTINGS;
  const renderScoreSettings = activeScoreSettings || DEFAULT_SCORE_SETTINGS;
  const renderStrokeSettings = activeStrokeSettings || DEFAULT_STROKE_SETTINGS;


  const [value, setValue] = useState(initialValue?.toString() || "0");
  const [opponentValue, setOpponentValue] = useState("0");
  const [totalValue, setTotalValue] = useState("0");
  const [multiplier, setMultiplier] = useState(1);
  const [selectedColor, setSelectedColor] = useState<JassColor | null>(null);
  const [pressedButtons, setPressedButtons] = useState<Set<number | string>>(new Set());
  const [isMatschActive, setIsMatschActive] = useState(false);
  const [pressedMatsch, setPressedMatsch] = useState(false);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [isClient, setIsClient] = useState(false);
  const [numberWasTyped, setNumberWasTyped] = useState(false);
  const chargeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const confettiChargeRef = useRef(0);
  const touchStartedRef = useRef(false);
  const matschPressStartRef = useRef<number | null>(null);

  const {scale, overlayScale} = useDeviceScale();

  const calculatorWrapperRef = React.useRef<HTMLDivElement>(null);
  const verticalScale = useVerticalScale(calculatorWrapperRef);

  // Vertikale Verschiebung von der Mittelachse.
  // Ein negativer Wert verschiebt nach oben. Da die Verschiebung NACH der Rotation
  // angewendet wird, bewirkt derselbe negative Wert im gedrehten Zustand eine
  // Verschiebung nach unten, was eine perfekte Spiegelung ergibt.
  const offsetY = -3; // vh

  const springProps = useSpring({
    opacity: isOpen ? 1 : 0,
    transform: `scale(${isOpen ? overlayScale * verticalScale : 0.95}) rotate(${calculator.isFlipped ? "180deg" : "0deg"}) translateY(${offsetY}vh)`,
    config: {mass: 1, tension: 300, friction: 20},
  });

  useEffect(() => {
    if (isOpen) {
      setCalculatorFlipped(false);
      setNumberWasTyped(false);
    }
  }, [isOpen, setCalculatorFlipped, initialValue]);

  useEffect(() => {
    if (isOpen && clickedPosition) {
      setCalculatorFlipped(clickedPosition === "top");
    }
  }, [isOpen, clickedPosition, setCalculatorFlipped]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // NEU: Dynamische Matsch-Berechnung basierend auf Settings
  const calculateMatschScore = useCallback(() => {
    const settings = getCorrectSettings();
    return settings.scoreSettings.matschBonus ? 257 : 157; // 157 ohne Bonus, 257 mit Bonus
  }, [getCorrectSettings]);

  const calculateValues = useCallback((inputValue: string, currentMultiplier: number) => {
    const matschScore = calculateMatschScore(); // NEU: Dynamische Matsch-Berechnung
    
    if (inputValue === "0") {
      setOpponentValue((MAX_SCORE * currentMultiplier).toString());
      setTotalValue("0");
    } else if (inputValue === matschScore.toString()) { // NEU: Dynamische Prüfung
      setOpponentValue("0");
      const total = matschScore * currentMultiplier; // NEU: Dynamische Berechnung
      setTotalValue(total.toString());
    } else {
      const numericValue = parseInt(inputValue, 10);
      const baseOpponentValue = Math.max(MAX_SCORE - numericValue, 0);
      const multipliedValue = numericValue * currentMultiplier;
      const multipliedOpponentValue = baseOpponentValue * currentMultiplier;

      setOpponentValue(multipliedOpponentValue.toString());
      setTotalValue(multipliedValue.toString());
    }
  }, [calculateMatschScore]);

  useEffect(() => {
    calculateValues(value, multiplier);
  }, [value, multiplier, calculateValues]);


  const hasValidScore = () => {
    return numberWasTyped && selectedColor !== null;
  };

  const handleNumberClick = (num: number) => {
    if (isMatschActive) return;
    const now = Date.now();
    if (now - lastClickTime < 100) return;
    setLastClickTime(now);

    setValue((prevValue) => {
      // Handle first digit typed
      if (prevValue === "0") {
          // If the first digit typed is 0, the value remains "0"
          // If the first digit typed is not 0, the value becomes that digit
          return num === 0 ? "0" : num.toString();
      }

      // Handle subsequent digits
      const newValue = prevValue + num.toString();
      const numericValue = parseInt(newValue, 10);

      // Prevent exceeding MAX_SCORE
      if (numericValue > MAX_SCORE) {
          return prevValue; // Keep previous value if new value exceeds max
      }

      return newValue; // Otherwise, update to the new value
    });

    setNumberWasTyped(true); // Set flag *after* attempting to set value

    setPressedButtons((prev) => new Set(prev).add(num));
    setTimeout(() => {
      setPressedButtons((prev) => {
        const newSet = new Set(prev);
        newSet.delete(num);
        return newSet;
      });
    }, 100);
  };

  const handleColorClick = (color: string, mult: number) => {
    setSelectedColor(color as JassColor);
    setMultiplier(mult);
    calculateValues(value, mult);
  };

  const handleSubmit = useCallback((e?: React.MouseEvent) => {

    
    // BUGFIX: Event-Propagation stoppen, um Konflikt mit HistoryWarning zu vermeiden
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent?.stopImmediatePropagation?.();
    }
    
    // WICHTIG: Immer den AKTUELLEN Wert direkt aus dem Store holen
    const currentGameStore = useGameStore.getState();
    const currentActiveGameId = currentGameStore.activeGameId;


    if (isReadOnlyMode) {
      console.log(`[Calculator] Abbruch: ReadOnly-Modus aktiv für Spiel ${currentActiveGameId || 'ID unbekannt'}.`);
      useUIStore.getState().showNotification({
        type: 'info',
        message: 'Als Zuschauer können keine Punkte geschrieben werden.'
      });
      return;
    }
    
    const isValid = hasValidScore();
    if (!isValid || !selectedColor) {
        return;
    }

    // NEU: Unterscheidung zwischen Online- und Gastmodus (Offline)
    const isOfflineMode = !currentActiveGameId;
    
    if (!isOfflineMode && !currentActiveGameId) {
      console.error("[Calculator] FEHLER: currentActiveGameId ist nicht verfügbar beim Versuch, die Runde abzuschliessen!");
      useUIStore.getState().showNotification({
        type: 'error',
        message: 'Spielfehler: Spiel-ID nicht gefunden. Bitte neu laden.'
      });
      return;
    }

    const finalScore = parseInt(totalValue, 10);
    const finalOpponentScore = parseInt(opponentValue, 10);

    const scores = {
      top: clickedPosition === "top" ? finalScore : finalOpponentScore,
      bottom: clickedPosition === "bottom" ? finalScore : finalOpponentScore,
    };

    // NEUE KORREKTE MATSCH/KONTERMATSCH-LOGIK
    let strichInfo: { team: TeamPosition; type: "matsch" | "kontermatsch" } | undefined = undefined;
    
    if (isMatschActive) {
      // Hole den aktuellen Spieler aus dem gameStore
      const currentPlayer = useGameStore.getState().currentPlayer;
      
      // Team-Zuordnung: Bottom Team (Spieler 1, 3), Top Team (Spieler 2, 4)
      const currentPlayerTeam = (currentPlayer === 1 || currentPlayer === 3) ? "bottom" : "top";
      
      // Entscheidungslogik:
      // Matsch: Das Team, das an der Reihe ist (currentPlayer), macht Matsch
      // Kontermatsch: Das Team, das NICHT an der Reihe ist, macht Matsch
      const strichType = (clickedPosition === currentPlayerTeam) ? "matsch" : "kontermatsch";
      
      strichInfo = { team: clickedPosition, type: strichType };
    }

    // NEU: Globale Klicksperre für 1.5 Sekunden aktivieren
    // console.log("⚡️ Globale Klicksperre für 1.5s aktiviert.");
    setGlobalClickDisabled(true, 1500);

    const isHistoryValid = validateHistoryAction();
    if (!isHistoryValid) {
      
      // BUGFIX: Verzögerung einbauen, um Event-Propagation-Konflikt zu vermeiden
      setTimeout(() => {
        showHistoryWarning(
          HISTORY_WARNING_MESSAGE,
          () => {
            // NEU: Setze die Farbe vor dem Aufruf
            setFarbe(selectedColor);
            
            // Korrigierter Aufruf mit korrekter strichInfo
            finalizeRound(scores, strichInfo);
            onClose();
          },
          () => jumpToLatest()
        );
      }, 100);
      return;
    }

    
    try {
        // NEU: Setze die Farbe vor dem Aufruf
        setFarbe(selectedColor);
        
        // Korrigierter Aufruf mit korrekter strichInfo
        finalizeRound(scores, strichInfo);
    } catch (error) {
        console.error("[Calculator] Fehler beim Aufruf von finalizeRound:", error);
        useUIStore.getState().showNotification({ type: 'error', message: 'Fehler beim Verarbeiten der Runde.' });
    }

    onClose();
  }, [
    hasValidScore,
    selectedColor,
    totalValue,
    opponentValue,
    clickedPosition,
    isMatschActive,
    currentHistoryIndex,
    roundHistory.length,
    showHistoryWarning,
    jumpToLatest,
    finalizeRound,
    onClose,
    validateHistoryAction,
    isReadOnlyMode,
    setFarbe,
    setGlobalClickDisabled,
  ]);

  const handleClear = () => {
    setValue("0");
    setOpponentValue("0");
    setMultiplier(1);
    setSelectedColor(null);
    setIsMatschActive(false);
    setNumberWasTyped(false);
  };

  const handleFlip = () => {
    setCalculatorFlipped(!calculator.isFlipped);
  };

  const handleMatsch = (e?: React.MouseEvent | React.TouchEvent) => {
    e?.stopPropagation();
    const matschScore = calculateMatschScore();
    setValue(matschScore.toString());
    setOpponentValue("0");
    setTotalValue((matschScore * multiplier).toString());
    setIsMatschActive(true);
    setNumberWasTyped(true);
    triggerMatschConfetti(confettiChargeRef.current, calculator.isFlipped);
  };

  const startMatschCharge = () => {
    if (isMatschActive) return;
    setPressedMatsch(true);
    confettiChargeRef.current = 0;
    matschPressStartRef.current = Date.now();

    if (chargeIntervalRef.current) {
      clearInterval(chargeIntervalRef.current);
    }

    chargeIntervalRef.current = setInterval(() => {
      confettiChargeRef.current = Math.min(confettiChargeRef.current + 1, 20);
    }, 100);
  };

  const stopMatschCharge = (shouldTriggerMatsch: boolean) => {
    const pressDuration = matschPressStartRef.current ?
      Date.now() - matschPressStartRef.current :
      0;

    setPressedMatsch(false);
    if (chargeIntervalRef.current) {
      clearInterval(chargeIntervalRef.current);
      chargeIntervalRef.current = null;
    }
    if (shouldTriggerMatsch && !isMatschActive) {
      triggerProgressivePressHaptic(pressDuration);
      handleMatsch();
    }
    matschPressStartRef.current = null;
  };

  useEffect(() => {
    return () => {
      if (chargeIntervalRef.current) {
        clearInterval(chargeIntervalRef.current);
      }
    };
  }, []);

  const numberOrder = calculator.isFlipped ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 2, 3, 4, 5, 6, 7, 8, 9];

  // Erweiterte Farben-Map (nur mit den wirklich benötigten Eigenschaften)
  const colorMultipliers = FARBE_MODES
    .map((mode) => ({
      color: mode.name,
      multiplier: renderFarbeSettings.values[mode.id as FarbeModeKey] ?? 0,
    }))
    .filter((item) => item.multiplier > 0)
    .sort((a, b) => a.multiplier - b.multiplier);

  // Aufbereitete Farbenliste für die Anzeige, mit leerer Kachel bei ungerader Anzahl
  const displayColorMultipliers = colorMultipliers.length % 2 === 1 ?
    [{ color: "empty", multiplier: 0 }, ...colorMultipliers] :
    colorMultipliers;

  const getGridClasses = (activeColors: number): string => {
    // Basis-Grid-Klassen mit group und has-active wenn ein Button selektiert ist
    const baseClasses = `grid grid-cols-5 gap-2 w-full group ${selectedColor ? "has-active" : ""}`;

    if (activeColors <= 4) {
      return baseClasses.replace("grid-cols-5", "grid-cols-4");
    } else if (activeColors <= 6) {
      return baseClasses.replace("grid-cols-5", "grid-cols-3");
    } else if (activeColors <= 8) {
      return baseClasses.replace("grid-cols-5", "grid-cols-4");
    }

    return baseClasses;
  };

  // Neue Funktion für das Button-Styling
  const getButtonStyle = (color: string, isSelected: boolean, mode: "svg" | "emoji"): string => {
    const farbeMode = FARBE_MODES.find((m) => m.name === color);

    if (isSelected) {
      return "bg-orange-500";
    }

    if (renderFarbeSettings.cardStyle === "FR") {
      return farbeMode?.frStyle?.backgroundColor || "bg-gray-700";
    }

    if (mode === "emoji") {
      return farbeMode?.emojiStyle?.backgroundColor || "bg-gray-700";
    }

    return farbeMode?.standardStyle?.backgroundColor || "bg-gray-700";
  };

  // Neue Hilfsfunktion für die Namensanpassung
  const getDisplayName = (color: string): string => {
    // Wenn keine Piktogramme aktiviert sind, spezielle Behandlung für "Une"
    if (!pictogramConfig.isEnabled && color.toLowerCase() === "une") {
      return "Unde";
    }

    if (renderFarbeSettings.cardStyle === "FR" && !pictogramConfig.isEnabled) {
      // Mapping für französische Namen wenn keine Piktogramme
      const frenchNames: Record<string, string> = {
        "Eicheln": "Schaufel",
        "Rosen": "Kreuz",
        "Schellen": "Herz",
        "Schilten": "Ecke",
      };
      return frenchNames[color] || color;
    }
    return color;
  };

  // Die renderXXX-Funktionen verwenden stabile Komponenten (kein Remount pro Tick)
  const renderFarbeButton = (color: string, multiplier: number) => {
    // Leere Kachel rendern
    if (color === "empty") {
      return (
        <div 
          key="empty-placeholder" 
          className="p-1 rounded-xl text-white select-none text-xs h-12 flex items-center justify-center bg-gradient-to-b from-gray-600 to-gray-700 shadow-inner border border-gray-500/30"
        />
      );
    }
    
    return (
      <FarbeButton
        key={color}
        color={color}
        multiplier={multiplier}
        handleColorClick={handleColorClick}
        selectedColor={selectedColor || ""}
        pictogramConfig={pictogramConfig}
        isClient={isClient}
        getButtonStyle={getButtonStyle}
        getPictogram={getPictogram}
        cardStyle={renderFarbeSettings.cardStyle}
        getDisplayName={getDisplayName}
      />
    );
  };

  const renderNumberButton = (num: number) => {
    return (
      <NumberButton
        key={num}
        num={num}
        handleNumberClick={handleNumberClick}
      />
    );
  };

  // Clear-Button anpassen
  const {handlers: clearHandlers, buttonClasses: clearClasses} = usePressableButton(handleClear);

  // OK-Button anpassen
  const {handlers: okHandlers, buttonClasses: okClasses} = usePressableButton((e?: React.MouseEvent) => handleSubmit(e));

  // Prüfen ob Calculator geöffnet werden darf
  useEffect(() => {
    const tutorialState = useTutorialStore.getState();
    const currentStep = tutorialState.getCurrentStep();
    // console.log("🧮 Calculator Effect:", {
    //   isOpen,
    //   isTutorialActive: tutorialState.isActive,
    //   currentStepId: currentStep?.id,
    //   shouldClose: tutorialState.tutorialUIBlocking.calculatorClose
    // });

    // Tutorial-bedingtes Schließen
    if (isOpen && tutorialState.isActive && tutorialState.tutorialUIBlocking.calculatorClose) {
      // console.log("🧮 Calculator wird wegen Tutorial-Block geschlossen");
      // onCancel(); // Schließen auslösen
    }
  }, [isOpen, onCancel]); // Abhängigkeiten: isOpen und onCancel

  // Event-Handling wie in GameInfoOverlay
  useEffect(() => {
    if (isOpen) {
      document.dispatchEvent(new Event("calculatorOpen"));
    }
  }, [isOpen]);

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 transition-opacity duration-300 prevent-interactions pb-2 ${
        isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
    >
      <animated.div
        ref={calculatorWrapperRef}
        style={springProps}
        className="flex flex-col items-center w-11/12 max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drehbutton als Teil des Layout-Flows */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleFlip();
          }}
          className={`text-white hover:text-gray-300 transition-all duration-1000
            w-24 h-24 flex items-center justify-center rounded-full
            mb-[-10px] z-10
            ${calculator.isFlipped ? "rotate-180" : "rotate-0"}`}
          aria-label="Umdrehen"
        >
          <FaUndo className="w-8 h-8" />
        </button>

        {/* Calculator Container */}
        <div 
          className="relative bg-gray-800 p-6 rounded-xl shadow-2xl border border-white/10 transition-all duration-700 flex flex-col items-center w-full font-sans"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Titel echt mittig: symmetrisches Padding wie Platz für Schließen-Button */}
          <div className="relative w-full border-b border-white/10 pb-3 mb-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-white transition-colors z-10"
              aria-label="Schliessen"
            >
              <FaTimes size={24} />
            </button>
            <h2 className="text-white text-xl font-semibold text-center select-none w-full px-12">
              Runde schreiben
            </h2>
          </div>
          {/* Einheitlicher vertikaler Rhythmus zwischen allen Blöcken */}
          <div className="flex flex-col w-full gap-3">
            {/* === ZONE 1: OUTPUT (Screen-Insel) — nur ablesen, nicht klicken === */}
            <input
              type="text"
              value={value}
              readOnly
              className="w-full bg-gray-700/45 border border-gray-600/25 shadow-inner text-white text-6xl p-4 rounded-xl select-none text-center font-bold font-sans"
            />
            <div className="flex justify-between items-stretch w-full gap-2 h-12">
              <div className="w-1/3 bg-gray-700/45 border border-gray-600/25 shadow-inner text-white py-1 pl-2.5 pr-2.5 rounded-xl select-none flex items-center justify-end relative min-w-0">
                <div className="text-xs uppercase tracking-wider absolute top-0 left-2.5 text-stone-400">
                  Gegner:
                </div>
                {/* Wie Hauptdisplay: <input> → gleiche WebKit/Inter-Darstellung wie die grosse Zahl */}
                <div className="w-full text-right text-xl font-bold tabular-nums text-white font-sans">
                  {opponentValue}
                </div>
              </div>
              {/* Matsch: gleiche Graustufe wie Ziffernblock; Displays leicht aufgehellt (gray-700/45) → weniger Kontrast */}
              <button
                onMouseDown={() => {
                  if (!touchStartedRef.current) startMatschCharge();
                }}
                onMouseUp={() => {
                  if (!touchStartedRef.current) stopMatschCharge(true);
                }}
                onMouseLeave={() => {
                  if (!touchStartedRef.current) stopMatschCharge(false);
                }}
                onTouchStart={() => {
                  touchStartedRef.current = true;
                  startMatschCharge();
                }}
                onTouchEnd={() => {
                  stopMatschCharge(true);
                  touchStartedRef.current = false;
                }}
                onTouchCancel={() => {
                  stopMatschCharge(false);
                  touchStartedRef.current = false;
                }}
                className={`w-1/3 min-h-12 rounded-xl select-none transition-all duration-100 text-lg font-bold font-sans flex items-center justify-center matsch-button shadow-inner border ${
                  isMatschActive ?
                    "bg-gradient-to-b from-orange-500 to-orange-600 border-orange-400/50 text-white cursor-default" :
                    pressedMatsch ?
                      "bg-gradient-to-b from-gray-600 to-gray-700 border-gray-500/30 text-white scale-95 opacity-80" :
                      "bg-gradient-to-b from-gray-600 to-gray-700 border-gray-500/30 text-white scale-100 opacity-100"
                }`}
                disabled={isMatschActive}
              >
                Matsch
              </button>
              <div className="w-1/3 bg-gray-700/45 border border-gray-600/25 shadow-inner text-white py-1 pl-2.5 pr-2.5 rounded-xl select-none flex items-center justify-end relative min-w-0">
                <div className="text-xs uppercase tracking-wider absolute top-0 left-2.5 text-stone-400">
                  Total:
                </div>
                <div className="w-full text-right text-xl font-bold tabular-nums text-white font-sans">
                  {totalValue}
                </div>
              </div>
            </div>

            {/* === ZONE 2: INPUT — alles Klickbare, einheitlich bg-gray-700 === */}
            <div className={getGridClasses(colorMultipliers.length)}>
              {displayColorMultipliers.map(({color, multiplier}) => renderFarbeButton(color, multiplier))}
            </div>
            <div className="grid grid-cols-3 gap-3 w-full">
              {numberOrder.map((num) => renderNumberButton(num))}
              <button
                {...clearHandlers}
                className={`bg-gradient-to-b from-red-500 to-red-600 shadow-inner border border-red-400/40 text-white p-4 rounded-xl select-none text-2xl font-semibold ${clearClasses}`}
              >
                C
              </button>
              {renderNumberButton(0)}
              <button
                {...okHandlers}
                disabled={!hasValidScore()}
                className={`bg-gradient-to-b from-green-500 to-green-600 shadow-inner border border-green-400/40 text-white p-4 rounded-xl select-none text-2xl font-semibold ${okClasses}
                  ${!hasValidScore() ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      </animated.div>
    </div>
  );
};

export default Calculator;
