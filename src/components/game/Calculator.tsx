// src/components/game/Calculator.tsx
"use client";

import React, {useState, useEffect, useCallback} from "react";
import {useGameStore} from "../../store/gameStore";
import {useUIStore} from "../../store/uiStore";
import {useGroupStore} from "../../store/groupStore";
import {useTournamentStore} from "../../store/tournamentStore";
import {TeamPosition, JassColor, StrichTyp, CardStyle, FarbeModeKey, FarbeSettings, ScoreSettings, StrokeSettings} from "../../types/jass";
import {FiRotateCcw, FiX} from "react-icons/fi";
import {useSpring, animated} from "react-spring";
import {triggerMatschConfetti} from "../effects/MatschConfetti";
import {HISTORY_WARNING_MESSAGE} from "../notifications/HistoryWarnings";
import {FARBE_MODES} from "../../config/FarbeSettings";
import {MAX_SCORE, MATSCH_SCORE} from "../../config/ScoreSettings";
import {getPictogram} from "../../utils/pictogramUtils";
import {usePressableButton} from "../../hooks/usePressableButton";
import {useTutorialStore} from "../../store/tutorialStore";
import {useDeviceScale} from "../../hooks/useDeviceScale";
import {DEFAULT_FARBE_SETTINGS} from "@/config/FarbeSettings";
import { DEFAULT_SCORE_SETTINGS } from "@/config/ScoreSettings";
import { DEFAULT_STROKE_SETTINGS } from "@/config/GameSettings";

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
  } = useGameStore();

  const {calculator, setCalculatorFlipped, settings: {pictogramConfig}, isReadOnlyMode} = useUIStore();
  const {isActive: isTutorialActive, getCurrentStep} = useTutorialStore();
  const currentStep = getCurrentStep();

  // WICHTIG: Hole Kontext-Stores
  const {currentGroup} = useGroupStore();
  const { currentTournamentInstance } = useTournamentStore();

  // NEUE robuste Settings-Hierarchie - bestimmt die korrekten Settings basierend auf Kontext
  const getCorrectSettings = useCallback(() => {
    console.log('[Calculator] getCorrectSettings aufgerufen. Kontext:', {
      isOpen,
      currentTournamentInstance: !!currentTournamentInstance,
      currentGroup: !!currentGroup,
      gameStoreActiveGameId,
      hasGameStoreFarbeSettings: !!gameFarbeSettings,
      hasGameStoreScoreSettings: !!gameScoreSettings,
      hasGameStoreStrokeSettings: !!gameStrokeSettings
    });

    // HIERARCHIE (Höchste Priorität zuerst):
    // 1. TURNIER-SETTINGS (wenn Turnier aktiv)
    if (currentTournamentInstance?.settings) {
      console.log('[Calculator] Verwende TURNIER-Settings:', {
        farbeCardStyle: currentTournamentInstance.settings.farbeSettings?.cardStyle,
        scoreWerte: currentTournamentInstance.settings.scoreSettings?.values,
        strokeSchneider: currentTournamentInstance.settings.strokeSettings?.schneider
      });
      return {
        farbeSettings: currentTournamentInstance.settings.farbeSettings || DEFAULT_FARBE_SETTINGS,
        scoreSettings: currentTournamentInstance.settings.scoreSettings || DEFAULT_SCORE_SETTINGS,
        strokeSettings: currentTournamentInstance.settings.strokeSettings || DEFAULT_STROKE_SETTINGS,
        source: 'tournament'
      };
    }

    // 2. GRUPPEN-SETTINGS (wenn Gruppe aktiv und kein Turnier)
    if (currentGroup) {
      console.log('[Calculator] Verwende GRUPPEN-Settings:', {
        farbeCardStyle: currentGroup.farbeSettings?.cardStyle,
        scoreWerte: currentGroup.scoreSettings?.values,
        strokeSchneider: currentGroup.strokeSettings?.schneider
      });
      return {
        farbeSettings: currentGroup.farbeSettings || DEFAULT_FARBE_SETTINGS,
        scoreSettings: currentGroup.scoreSettings || DEFAULT_SCORE_SETTINGS,
        strokeSettings: currentGroup.strokeSettings || DEFAULT_STROKE_SETTINGS,
        source: 'group'
      };
    }

    // 3. GAMESTORE-SETTINGS (Online-Spiel ohne explizite Gruppe/Turnier)
    if (gameStoreActiveGameId && gameFarbeSettings && gameScoreSettings && gameStrokeSettings) {
      console.log('[Calculator] Verwende GAMESTORE-Settings:', {
        farbeCardStyle: gameFarbeSettings.cardStyle,
        scoreWerte: gameScoreSettings.values,
        strokeSchneider: gameStrokeSettings.schneider
      });
      return {
        farbeSettings: gameFarbeSettings,
        scoreSettings: gameScoreSettings,
        strokeSettings: gameStrokeSettings,
        source: 'gameStore'
      };
    }

    // 4. UISTORE-SETTINGS (Gästemodus - KRITISCH für Problem 1!)
    const uiStoreState = useUIStore.getState();
    if (!gameStoreActiveGameId) { // Gästemodus = kein aktives Online-Spiel
      console.log('[Calculator] Verwende UISTORE-Settings (Gästemodus):', {
        farbeCardStyle: uiStoreState.farbeSettings.cardStyle,
        scoreWerte: uiStoreState.scoreSettings.values,
        strokeSchneider: uiStoreState.strokeSettings.schneider
      });
      return {
        farbeSettings: uiStoreState.farbeSettings,
        scoreSettings: uiStoreState.scoreSettings,
        strokeSettings: uiStoreState.strokeSettings,
        source: 'uiStore'
      };
    }

    // 5. FALLBACK: DEFAULT-SETTINGS (sollte nie auftreten)
    console.warn('[Calculator] FALLBACK auf DEFAULT-Settings! Das sollte nicht passieren.');
    return {
      farbeSettings: DEFAULT_FARBE_SETTINGS,
      scoreSettings: DEFAULT_SCORE_SETTINGS,
      strokeSettings: DEFAULT_STROKE_SETTINGS,
      source: 'defaults'
    };
  }, [
    isOpen,
    currentTournamentInstance,
    currentGroup,
    gameStoreActiveGameId,
    gameFarbeSettings,
    gameScoreSettings,
    gameStrokeSettings
  ]);

  // State für die aktiven Einstellungen - jetzt OHNE Default-Initialisierung
  const [activeFarbeSettings, setActiveFarbeSettings] = useState<FarbeSettings | null>(null);
  const [activeScoreSettings, setActiveScoreSettings] = useState<ScoreSettings | null>(null);
  const [activeStrokeSettings, setActiveStrokeSettings] = useState<StrokeSettings | null>(null);

  // NEUER useEffect: Settings beim Öffnen oder bei Kontext-Änderungen aktualisieren
  useEffect(() => {
    if (!isOpen) return; // Nur aktualisieren, wenn Calculator geöffnet ist

    const correctSettings = getCorrectSettings();

    console.log('[Calculator] Settings-Update Effekt. Neue Settings:', {
      source: correctSettings.source,
      farbeCardStyle: correctSettings.farbeSettings.cardStyle,
      scoreWerte: correctSettings.scoreSettings.values,
      strokeSchneider: correctSettings.strokeSettings.schneider
    });

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

  // Debug Log für die tatsächlich verwendeten Settings
  useEffect(() => {
    if (isOpen && activeFarbeSettings && activeScoreSettings && activeStrokeSettings) {
      console.log("[Calculator] FINAL aktive Settings für Rendering:", {
        farbeCardStyle: activeFarbeSettings.cardStyle,
        farbeValues: activeFarbeSettings.values,
        scoreWerte: activeScoreSettings.values,
        scoreEnabled: activeScoreSettings.enabled,
        strokeSchneider: activeStrokeSettings.schneider,
        strokeKontermatsch: activeStrokeSettings.kontermatsch
      });
    }
  }, [isOpen, activeFarbeSettings, activeScoreSettings, activeStrokeSettings]);

  const [value, setValue] = useState(initialValue?.toString() || "0");
  const [opponentValue, setOpponentValue] = useState("0");
  const [totalValue, setTotalValue] = useState("0");
  const [multiplier, setMultiplier] = useState(1);
  const [selectedColor, setSelectedColor] = useState<JassColor | null>(null);
  const [pressedButtons, setPressedButtons] = useState<Set<number | string>>(new Set());
  const [isMatschActive, setIsMatschActive] = useState(false);
  const [pressedMatsch, setPressedMatsch] = useState(false);
  const [confettiCharge, setConfettiCharge] = useState(0);
  const [chargeInterval, setChargeInterval] = useState<NodeJS.Timeout | null>(null);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [isClient, setIsClient] = useState(false);
  const [numberWasTyped, setNumberWasTyped] = useState(false);

  const {scale, overlayScale} = useDeviceScale();

  const springProps = useSpring({
    opacity: isOpen ? 1 : 0,
    transform: `scale(${isOpen ? overlayScale : 0.95}) rotate(${calculator.isFlipped ? "180deg" : "0deg"})`,
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

  const calculateValues = (inputValue: string, currentMultiplier: number) => {
    if (inputValue === "0") {
      setOpponentValue((MAX_SCORE * currentMultiplier).toString());
      setTotalValue("0");
    } else if (inputValue === MATSCH_SCORE.toString()) {
      setOpponentValue("0");
      const total = MATSCH_SCORE * currentMultiplier;
      setTotalValue(total.toString());
    } else {
      const numericValue = parseInt(inputValue, 10);
      const baseOpponentValue = Math.max(MAX_SCORE - numericValue, 0);
      const multipliedValue = numericValue * currentMultiplier;
      const multipliedOpponentValue = baseOpponentValue * currentMultiplier;

      setOpponentValue(multipliedOpponentValue.toString());
      setTotalValue(multipliedValue.toString());
    }
  };

  useEffect(() => {
    calculateValues(value, multiplier);
  }, [value, multiplier]);

  const validateInput = (input: string): string => {
    const numericValue = parseInt(input, 10);
    if (isNaN(numericValue)) return "0";
    return Math.min(numericValue, 157).toString();
  };

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

  const handleSubmit = useCallback(() => {
    console.log("[Calculator] handleSubmit aufgerufen.");
    
    // WICHTIG: Immer den AKTUELLEN Wert direkt aus dem Store holen
    const currentGameStore = useGameStore.getState();
    const currentActiveGameId = currentGameStore.activeGameId;

    // DEBUG: Log der aktuellen Einstellungen direkt vor der Runden-Finalisierung
    console.log('[Calculator] Aktuelle Settings vor finalizeRound:', {
      strokeSettingsSchneider: currentGameStore.strokeSettings?.schneider,
      cardStyle: currentGameStore.farbeSettings?.cardStyle,
      clickedPosition,
      selectedColor,
      totalValue,
      opponentValue,
      isMatschActive
    });

    if (isReadOnlyMode) {
      console.log(`[Calculator] Abbruch: ReadOnly-Modus aktiv für Spiel ${currentActiveGameId || 'ID unbekannt'}.`);
      useUIStore.getState().showNotification({
        type: 'info',
        message: 'Als Zuschauer können keine Punkte geschrieben werden.'
      });
      return;
    }
    
    const isValid = hasValidScore();
    console.log(`[Calculator] Prüfung für Spiel ${currentActiveGameId || 'ID unbekannt'}: hasValidScore=${isValid}, selectedColor=${selectedColor}`);
    if (!isValid || !selectedColor) {
        console.log("[Calculator] Abbruch: Keine gültige Punktzahl oder keine Farbe gewählt.");
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

    const historyActionValid = validateHistoryAction();
    console.log(`[Calculator] Prüfung: validateHistoryAction=${historyActionValid}`);

    if (!historyActionValid) {
      console.log("[Calculator] History-Warnung wird angezeigt.");
      showHistoryWarning(
        HISTORY_WARNING_MESSAGE,
        () => {
          console.log("[Calculator] History-Warnung bestätigt. Rufe finalizeRound (überschreibend)...");
          // NEU: Angepasster Aufruf basierend auf dem Modus
          if (isOfflineMode) {
            // Gastmodus (Offline): Ohne activeGameId aufrufen
            finalizeRound(
              "", // Leerer String anstelle von undefined für TypeScript
              selectedColor,
              scores.top,
              scores.bottom,
              isMatschActive ? { team: clickedPosition, type: "matsch" as StrichTyp } : undefined
            );
          } else {
            // Online-Modus: Mit activeGameId aufrufen
            finalizeRound(
              currentActiveGameId,
              selectedColor,
              scores.top,
              scores.bottom,
              isMatschActive ? { team: clickedPosition, type: "matsch" as StrichTyp } : undefined
            );
          }
          onClose();
        },
        () => jumpToLatest()
      );
      return;
    }

    console.log(`[Calculator] History gültig für Spiel ${currentActiveGameId || 'lokales Spiel'}. Rufe finalizeRound (normal)...`);
    console.log("[Calculator] Parameter für finalizeRound:", {
        activeGameId: currentActiveGameId || 'nicht vorhanden (Offline-Modus)',
        farbe: selectedColor,
        topScore: scores.top,
        bottomScore: scores.bottom,
        strichInfo: isMatschActive ? { team: clickedPosition, type: "matsch" as StrichTyp } : undefined
    });
    
    try {
        // NEU: Angepasster Aufruf basierend auf dem Modus
        if (isOfflineMode) {
          // Gastmodus (Offline): Ohne activeGameId aufrufen
          finalizeRound(
            "", // Leerer String anstelle von undefined für TypeScript
            selectedColor,
            scores.top,
            scores.bottom,
            isMatschActive ? { team: clickedPosition, type: "matsch" as StrichTyp } : undefined
          );
        } else {
          // Online-Modus: Mit activeGameId aufrufen
          finalizeRound(
            currentActiveGameId,
            selectedColor,
            scores.top,
            scores.bottom,
            isMatschActive ? { team: clickedPosition, type: "matsch" as StrichTyp } : undefined
          );
        }
        console.log("[Calculator] finalizeRound erfolgreich aufgerufen (normal).");
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
    setValue("257");
    setOpponentValue("0");
    setTotalValue((257 * multiplier).toString());
    setIsMatschActive(true);
    setNumberWasTyped(true);
    triggerMatschConfetti(confettiCharge, calculator.isFlipped);
  };

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
    const baseClasses = `grid grid-cols-5 gap-2 mb-4 w-full group ${selectedColor ? "has-active" : ""}`;

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
      return farbeMode?.frStyle?.backgroundColor || "bg-gray-600";
    }

    if (mode === "emoji") {
      return farbeMode?.emojiStyle?.backgroundColor || "bg-gray-600";
    }

    return farbeMode?.standardStyle?.backgroundColor || "bg-gray-600";
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

  // Umwandlung in React-Komponenten
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

    // Angepasster Vergleich für "Misère"
    const isMisereSelected = color.toLowerCase() === "misère" && selectedColor === color;

    return (
      <button
        key={color}
        {...handlers}
        className={`p-1 rounded text-white select-none text-xs h-12 flex items-center justify-center ${
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

  // Nummerntasten als React-Komponente
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
        className={`bg-gray-600 text-white p-4 rounded select-none text-2xl ${buttonClasses}`}
      >
        {num}
      </button>
    );
  };

  // Die alte renderXXX Funktionen durch Aufrufe der neuen Komponenten ersetzen
  const renderFarbeButton = (color: string, multiplier: number) => {
    // Leere Kachel rendern
    if (color === "empty") {
      return (
        <div 
          key="empty-placeholder" 
          className="p-1 rounded text-white select-none text-xs h-12 flex items-center justify-center bg-gray-700"
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

  // Matsch-Button anpassen
  const {isPressedDown: isMatschPressed, handlers: matschHandlers, buttonClasses: matschClasses} = usePressableButton(handleMatsch);

  // Clear-Button anpassen
  const {handlers: clearHandlers, buttonClasses: clearClasses} = usePressableButton(handleClear);

  // OK-Button anpassen
  const {handlers: okHandlers, buttonClasses: okClasses} = usePressableButton(handleSubmit);

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
      className={`fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 transition-opacity duration-300 prevent-interactions ${
        isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
    >
      <animated.div
        style={springProps}
        className="relative w-11/12 max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleFlip();
          }}
          className={`absolute bottom-full mb-[-10px] left-1/2 transform -translate-x-1/2 
            text-white hover:text-gray-300 transition-all duration-1000
            w-24 h-24 flex items-center justify-center
            rounded-full
            ${calculator.isFlipped ? "rotate-180" : "rotate-0"}`}
          aria-label="Umdrehen"
        >
          <FiRotateCcw className="w-8 h-8" />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute right-2 top-2 p-2 text-gray-400 hover:text-white transition-colors z-10"
        >
          <FiX size={24} />
        </button>
        <div
          className="bg-gray-800 p-6 rounded-lg transition-all duration-700 flex flex-col items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-white text-xl mb-4 text-center select-none">
            Runde schreiben
          </h2>
          <div className="flex flex-col w-full space-y-4">
            <input
              type="text"
              value={value}
              readOnly
              className="w-full bg-gray-700 text-white text-6xl p-4 rounded select-none text-center"
            />
            <div className="flex justify-between items-stretch w-full space-x-2 h-10">
              <div className="w-1/3 bg-gray-700 text-white p-1 rounded select-none flex items-center justify-end relative">
                <div className="text-xs absolute top-0 left-1">Gegner:</div>
                <div className="text-xl pr-1">{opponentValue}</div>
              </div>
              <button
                onClick={handleMatsch}
                onMouseDown={() => {
                  setPressedMatsch(true);
                  setConfettiCharge(0);
                  const interval = setInterval(() => {
                    setConfettiCharge((prev) => Math.min(prev + 1, 20));
                  }, 100);
                  setChargeInterval(interval);
                }}
                onMouseUp={() => {
                  setPressedMatsch(false);
                  if (chargeInterval) clearInterval(chargeInterval);
                  handleMatsch();
                }}
                onMouseLeave={() => {
                  setPressedMatsch(false);
                  if (chargeInterval) clearInterval(chargeInterval);
                }}
                onTouchStart={() => {
                  setPressedMatsch(true);
                  setConfettiCharge(0);
                  const interval = setInterval(() => {
                    setConfettiCharge((prev) => Math.min(prev + 1, 20));
                  }, 100);
                  setChargeInterval(interval);
                }}
                onTouchEnd={() => {
                  setPressedMatsch(false);
                  if (chargeInterval) clearInterval(chargeInterval);
                  handleMatsch();
                }}
                className={`w-1/3 p-1 rounded select-none transition-all duration-100 text-lg flex items-center justify-center matsch-button ${
                  isMatschActive ?
                    "bg-orange-500 text-white" :
                    pressedMatsch ?
                      "bg-gray-600 text-white scale-95 opacity-80" :
                      "bg-gray-700 text-white hover:bg-orange-500 scale-100 opacity-100"
                }`}
                disabled={isMatschActive}
              >
                Matsch
              </button>
              <div className="w-1/3 bg-gray-700 text-white p-1 rounded select-none flex items-center justify-end relative">
                <div className="text-xs absolute top-0 left-1">Total:</div>
                <div className="text-xl pr-1">{totalValue}</div>
              </div>
            </div>
          </div>
          <div className="mt-4"></div>
          <div className={getGridClasses(colorMultipliers.length)}>
            {displayColorMultipliers.map(({color, multiplier}) => renderFarbeButton(color, multiplier))}
          </div>
          <div className="grid grid-cols-3 gap-3 w-full">
            {numberOrder.map((num) => renderNumberButton(num))}
            <button
              {...clearHandlers}
              className={`bg-red-600 text-white p-4 rounded select-none text-2xl ${clearClasses}`}
            >
              C
            </button>
            {renderNumberButton(0)}
            <button
              {...okHandlers}
              disabled={!hasValidScore()}
              className={`bg-green-600 text-white p-4 rounded select-none text-2xl ${okClasses}
                ${!hasValidScore() ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              OK
            </button>
          </div>
        </div>
      </animated.div>
    </div>
  );
};

export default Calculator;
