import React, {useState, useEffect} from "react";
import {animated, useSpring} from "react-spring";
import {FiRotateCcw, FiX, FiPlay, FiPause} from "react-icons/fi";
import {useGameStore} from "@/store/gameStore";
import {useJassStore} from "@/store/jassStore";
import {useGroupStore} from "@/store/groupStore";
import {formatDuration} from "@/utils/timeUtils";
import MultiplierCalculator, {useMultiplierStore} from "./MultiplierCalculator";
import {ChargeButton} from "@/components/ui/ChargeButton";
import type {
  PlayerNumber,
  ChargeLevel,
  ChargeButtonActionProps,
} from "@/types/jass";
import {useUIStore} from "@/store/uiStore";
import {useTimerStore} from "@/store/timerStore";
import {useTutorialStore} from "@/store/tutorialStore";
import {TUTORIAL_STEPS} from "@/types/tutorial";
import { DEFAULT_SCORE_SETTINGS } from '@/config/ScoreSettings';
import { DEFAULT_FARBE_SETTINGS } from '@/config/FarbeSettings';
import {getRandomBedankenSpruch} from "@/utils/sprueche/bedanken";
import {getRandomBergSpruch} from "@/utils/sprueche/berg";
import {useDeviceScale} from "@/hooks/useDeviceScale";
import { serverTimestamp } from 'firebase/firestore';

interface GameInfoOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

const DOUBLE_CLICK_DELAY = 230; // geändert von 200 auf 230, um konsistent mit useGlobalClick zu sein

const GameInfoOverlay: React.FC<GameInfoOverlayProps> = ({isOpen, onClose}) => {
  const {
    currentRound,
    currentPlayer,
    playerNames,
    isBergActive,
    isSiegActive,
    addBerg,
    addSieg,
    scores,
  } = useGameStore();

  const {currentGameId} = useJassStore();
  const currentGroup = useGroupStore((state) => state.currentGroup);

  const [isPressedDown, setIsPressedDown] = useState(false);
  const [showDepth, setShowDepth] = useState(false);
  const [gameTime, setGameTime] = useState("");
  const [roundTime, setRoundTime] = useState("");
  const [jassTime, setJassTime] = useState("");
  const [canClose, setCanClose] = useState(true);

  const {
    pauseTimer,
    resumeTimer,
    getCurrentTime,
    gameStartTime,
    roundStartTime,
    jassStartTime,
  } = useTimerStore();

  const {
    isPaused,
    pauseGame,
    resumeGame,
    lastDoubleClickPosition,
    calculator: {isFlipped: isCalculatorFlipped},
    setCalculatorFlipped,
    showNotification,
    endCharge,
    isReadOnlyMode,
  } = useUIStore();

  const {
    currentMultiplier,
    getDividedPoints,
    getRemainingPoints,
  } = useMultiplierStore();

  const activeTeam = isCalculatorFlipped ? "top" : "bottom";

  const isBergActiveForAnyTeam = () => {
    return isBergActive("top") || isBergActive("bottom");
  };

  const activeScoreSettings = currentGroup?.scoreSettings ?? DEFAULT_SCORE_SETTINGS;
  const activeFarbeSettings = currentGroup?.farbeSettings ?? DEFAULT_FARBE_SETTINGS;

  const canActivateSieg = () => {
    if (!activeScoreSettings?.enabled?.berg) return true;
    return isBergActiveForAnyTeam();
  };

  const handleClose = () => {
    if (isPaused) {
      showNotification({
        message: "Zum Fortfahren bitte die Pause beenden und oben links auf  ▶️  klicken!",
        type: "warning",
        position: isCalculatorFlipped ? "top" : "bottom",
        isFlipped: isCalculatorFlipped,
      });
      return;
    }

    // Beim Schließen den Multiplikator auf den höchsten verfügbaren Wert zurücksetzen
    const multiplierStore = useMultiplierStore.getState();
    
    // Verbesserte Methode zum Bestimmen des höchsten Multiplikators
    // Verwende activeFarbeSettings
    const valueSource = activeFarbeSettings.values;

    const validMultipliers = Object.values(valueSource)
      .filter((v): v is number => typeof v === 'number' && v > 1);
    
    // Höchsten Multiplikator verwenden oder Fallback auf 1
    const highestMultiplier = validMultipliers.length > 0 ? Math.max(...validMultipliers) : 1;
    
    // console.log(`[GameInfoOverlay] Resetting multiplier to highest value: ${highestMultiplier}`);
    multiplierStore.setMultiplier(highestMultiplier);

    onClose();
  };

  const handlePauseClick = () => {
    pauseTimer();
    pauseGame();
    
    // Markiere aktuelle Runde als "pausiert" für Statistiken
    const gameStore = useGameStore.getState();
    if (gameStore.currentRound && gameStore.roundHistory.length > 0) {
      const currentRoundIndex = gameStore.currentHistoryIndex;
      if (currentRoundIndex >= 0 && currentRoundIndex < gameStore.roundHistory.length) {
        // Markiere die aktuelle Runde als pausiert
        const updatedRoundHistory = [...gameStore.roundHistory];
        updatedRoundHistory[currentRoundIndex] = {
          ...updatedRoundHistory[currentRoundIndex],
          wasPaused: true // Flag für Statistiken
        };
        
        useGameStore.setState({
          roundHistory: updatedRoundHistory
        });
        
        console.log(`[GameInfoOverlay] Runde ${gameStore.currentRound} als pausiert markiert`);
      }
    }
  };

  const handleResumeClick = () => {
    resumeTimer();
    resumeGame();
  };

  useEffect(() => {
    // WICHTIG: Sofort die Zeiten aktualisieren, zusätzlich alle 50ms prüfen, wenn das Overlay geöffnet ist
    const updateTimes = () => {
      const currentTime = getCurrentTime();
      if (isOpen) {
        // console.log("⏱️ Timer werden aktualisiert", {
        //   gameStartTime: gameStartTime ? new Date(gameStartTime).toISOString() : null,
        //   roundStartTime: roundStartTime ? new Date(roundStartTime).toISOString() : null,
        //   jassStartTime: jassStartTime ? new Date(jassStartTime).toISOString() : null,
        //   currentGameId,
        // });
      }

      // Timer-Text nur setzen, wenn Werte existieren
      if (gameStartTime) setGameTime(formatDuration(currentTime - gameStartTime, false));
      if (roundStartTime) setRoundTime(formatDuration(currentTime - roundStartTime, true));
      if (jassStartTime) setJassTime(formatDuration(currentTime - jassStartTime, false));
    };

    // Sofort ausführen
    updateTimes();

    if (!isOpen || isPaused) return;

    // Hauptintervall - jede Sekunde
    const interval = setInterval(updateTimes, 1000);

    // Zusätzlicher schneller Check für Timer-Änderungen, wenn Overlay geöffnet ist
    const quickInterval = setInterval(() => {
      // Nur einen schnellen Update für neu gestartete Timer durchführen
      const timerStore = useTimerStore.getState();
      const newGameStartTime = timerStore.gameStartTime;
      const newRoundStartTime = timerStore.roundStartTime;

      // Wenn sich Timer-Werte geändert haben, sofort aktualisieren
      if (newGameStartTime !== gameStartTime || newRoundStartTime !== roundStartTime) {
        console.log("⏱️ [SCHNELLES UPDATE] Timer haben sich geändert");
        updateTimes();
      }
    }, 50);

    return () => {
      clearInterval(interval);
      clearInterval(quickInterval);
    };
  }, [
    isOpen,
    isPaused,
    getCurrentTime,
    gameStartTime,
    roundStartTime,
    jassStartTime,
    currentGameId,
    currentRound,
    scores,
    // WICHTIG: diese Abhängigkeit hinzufügen, um Rerendering zu erzwingen
    useTimerStore.getState().isPaused,
  ]);

  const {overlayScale} = useDeviceScale();

  const springProps = useSpring({
    opacity: isOpen ? 1 : 0,
    transform: `scale(${isOpen ? overlayScale : 0.95}) rotate(${isCalculatorFlipped ? "180deg" : "0deg"})`,
    config: {mass: 1, tension: 300, friction: 20},
  });

  useEffect(() => {
    if (isOpen && lastDoubleClickPosition) {
      setCalculatorFlipped(lastDoubleClickPosition === "top");
    }
  }, [isOpen, lastDoubleClickPosition]);

  const {isActive: isTutorialActive, getCurrentStep} = useTutorialStore();
  const currentStep = getCurrentStep();

  useEffect(() => {
    if (isOpen && isTutorialActive) {
      if (currentStep?.id !== TUTORIAL_STEPS.JASS_SETTINGS &&
          currentStep?.id !== TUTORIAL_STEPS.GAME_INFO) {
        onClose();
      }
    }
  }, [isOpen, isTutorialActive, currentStep, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.dispatchEvent(new Event("gameInfoOpen"));
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setCanClose(false);
      const timer = setTimeout(() => {
        setCanClose(true);
      }, DOUBLE_CLICK_DELAY);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const showPauseNotification = () => {
    showNotification({
      message: "Möchtest du die Pause aufheben um fortzufahren?",
      type: "warning",
      actions: [{
        label: (
          <div className="flex items-center justify-center w-full gap-1.5">
            <FiPlay className="w-4 h-4" />
            <span>Pause aufheben</span>
          </div>
        ),
        onClick: () => {
          resumeGame();
          onClose();
        },
      }],
    });
  };

  const handleBergClick = (actionProps: ChargeButtonActionProps) => {
    // ReadOnly-Modus prüfen
    if (isReadOnlyMode) {
      showNotification({
        type: 'info',
        message: 'Als Zuschauer können keine Punkte geschrieben werden.'
      });
      return;
    }

    if (isPaused) {
      showPauseNotification();
      return;
    }

    const team = isCalculatorFlipped ? "top" : "bottom";
    const oppositeTeam = team === "top" ? "bottom" : "top";

    // Prüfen ob der Gegner bereits BERG hat
    if (isBergActive(oppositeTeam)) {
      showNotification({
        message: "Sorry, dein Gegner hat den BERG schon geschrieben!",
        type: "warning",
        position: team,
        isFlipped: isCalculatorFlipped,
      });
      return;
    }

    // 🔧 FIX: Prüfe State VOR dem addBerg-Call, um Race Conditions zu vermeiden
    const wasBergActiveBefore = isBergActive(team);
    console.log("[GameInfoOverlay] BERG Click - VOR addBerg:", {
      team,
      wasBergActiveBefore,
      actionProps_isActivating: actionProps.isActivating,
      chargeLevel: actionProps.chargeDuration.level,
      chargeDuration: actionProps.chargeDuration.duration,
    });
    
    // BERG einloggen
    addBerg(team);

    // 🔧 FIX: Prüfe State NACH dem addBerg-Call (synchron, da addBerg synchron ist)
    const isBergActiveNow = useGameStore.getState().isBergActive(team);
    
    // 🚀 TEMPORÄR: Notification nur zeigen, wenn skipBedankenNotification false ist
    const shouldSkipNotification = useUIStore.getState().skipBedankenNotification;

    console.log("[GameInfoOverlay] BERG Click - NACH addBerg:", {
      team,
      wasBergActiveBefore,
      isBergActiveNow,
      shouldSkipNotification,
      shouldRedirect: shouldSkipNotification && isBergActiveNow && !wasBergActiveBefore,
    });

    // Nur zur ResultatKreidetafel, wenn BERG jetzt aktiv ist (nicht deaktiviert wurde)
    if (shouldSkipNotification && isBergActiveNow && !wasBergActiveBefore) {
      console.log("[GameInfoOverlay] ✅ BERG: Weiterleitung zur ResultatKreidetafel");
      
      // 🔧 FIX: Zuerst State setzen, dann onClose() mit kleinem Delay aufrufen
      // Direkt zur ResultatKreidetafel ohne Notification
      endCharge(team, "berg");
      
      // Setze State ZUERST
      useUIStore.setState((state) => {
        const newState = {
          resultatKreidetafel: {
            ...state.resultatKreidetafel,
            isOpen: true,
            swipePosition: team,
          },
        };
        console.log("[GameInfoOverlay] ✅ BERG: Setze State:", newState.resultatKreidetafel);
        return newState;
      });
      
      // 🔍 DEBUG: Verifiziere State direkt nach dem Setzen
      setTimeout(() => {
        const verifiedState = useUIStore.getState().resultatKreidetafel;
        console.log("[GameInfoOverlay] ✅ BERG: State-Verifikation nach setState:", verifiedState);
      }, 10);
      
      console.log("[GameInfoOverlay] ✅ BERG: State gesetzt, warte kurz vor onClose()");
      
      // 🔧 FIX: Warte länger und setze State ERNEUT nach onClose(), um sicherzustellen, dass er nicht überschrieben wird
      setTimeout(() => {
        console.log("[GameInfoOverlay] ✅ BERG: Rufe onClose() auf");
        onClose();
        
        // 🔧 KRITISCH: Setze State ERNEUT nach onClose(), um sicherzustellen, dass er nicht überschrieben wird
        setTimeout(() => {
          const currentState = useUIStore.getState().resultatKreidetafel;
          if (!currentState.isOpen) {
            console.log("[GameInfoOverlay] 🔧 BERG: State wurde überschrieben, setze erneut");
            useUIStore.setState((state) => ({
              resultatKreidetafel: {
                ...state.resultatKreidetafel,
                isOpen: true,
                swipePosition: team,
              },
            }));
          } else {
            console.log("[GameInfoOverlay] ✅ BERG: State ist korrekt nach onClose()");
          }
        }, 100);
      }, 50);
      
      return;
    } else {
      console.log("[GameInfoOverlay] ❌ BERG: KEINE Weiterleitung - Bedingungen nicht erfüllt:", {
        shouldSkipNotification,
        isBergActiveNow,
        wasBergActiveBefore,
      });
    }

    // Notification nur zeigen, wenn wir BERG aktivieren UND Notification nicht übersprungen wird
    // 🔧 FIX: Prüfe State direkt, nicht nur actionProps (isBergActiveNow bereits oben deklariert)
    if (actionProps.isActivating && isBergActiveNow && !wasBergActiveBefore) {
      const getNotificationDelay = (level: ChargeLevel): number => {
        const baseDelay = 250;
        switch (level) {
        case "extreme": return baseDelay + 5000;
        case "super": return baseDelay + 3000;
        case "high": return baseDelay + 2000;
        case "medium": return baseDelay + 1000;
        case "low": return baseDelay + 500;
        default: return baseDelay;
        }
      };

      setTimeout(() => {
        const spruch = getRandomBergSpruch(actionProps.chargeDuration.level);

        showNotification({
          type: "bedanken",
          message: spruch.text,
          position: team,
          isFlipped: isCalculatorFlipped,
          preventClose: false,
          actions: [
            {
              label: spruch.buttons.cancel,
              onClick: () => {
                endCharge(team, "berg");
                onClose();
              },
            },
            {
              label: spruch.buttons.confirm,
              onClick: () => {
                endCharge(team, "berg");
                onClose();
                useUIStore.setState((state) => ({
                  resultatKreidetafel: {
                    ...state.resultatKreidetafel,
                    isOpen: true,
                    swipePosition: team,
                  },
                }));
              },
            },
          ],
        });
      }, getNotificationDelay(actionProps.chargeDuration.level));
    }
  };

  const handleSiegClick = (actionProps: ChargeButtonActionProps) => {
    // ReadOnly-Modus prüfen
    if (isReadOnlyMode) {
      showNotification({
        type: 'info',
        message: 'Als Zuschauer kannst du dich nicht bedanken.'
      });
      return;
    }

    if (isPaused) {
      showNotification({
        message: "Bitte Pause-Modus beenden",
        type: "warning",
        position: isCalculatorFlipped ? "top" : "bottom",
        isFlipped: isCalculatorFlipped,
      });
      return;
    }

    const team = isCalculatorFlipped ? "top" : "bottom";
    const oppositeTeam = team === "top" ? "bottom" : "top";

    // Prüfen ob der Gegner bereits BEDANKEN hat
    if (isSiegActive(oppositeTeam)) {
      showNotification({
        type: "warning",
        message: "Der Gegner hat bereits BEDANKEN aktiviert!",
        position: team,
        isFlipped: isCalculatorFlipped,
      });
      return;
    }

    // 🔧 FIX: Prüfe State VOR dem addSieg-Call, um Race Conditions zu vermeiden
    const wasSiegActiveBefore = isSiegActive(team);
    console.log("[GameInfoOverlay] BEDANKEN Click - VOR addSieg:", {
      team,
      wasSiegActiveBefore,
      actionProps_isActivating: actionProps.isActivating,
      chargeLevel: actionProps.chargeDuration.level,
      chargeDuration: actionProps.chargeDuration.duration,
    });
    
    // 1. Sofort BEDANKEN einloggen
    addSieg(team);

    // 🔧 FIX: Prüfe State NACH dem addSieg-Call (synchron, da addSieg synchron ist)
    const isSiegActiveNow = useGameStore.getState().isSiegActive(team);
    
    // 🚀 TEMPORÄR: Notification nur zeigen, wenn skipBedankenNotification false ist
    const shouldSkipNotification = useUIStore.getState().skipBedankenNotification;

    console.log("[GameInfoOverlay] BEDANKEN Click - NACH addSieg:", {
      team,
      wasSiegActiveBefore,
      isSiegActiveNow,
      shouldSkipNotification,
      shouldRedirect: shouldSkipNotification && isSiegActiveNow && !wasSiegActiveBefore,
    });

    // Nur zur ResultatKreidetafel, wenn BEDANKEN jetzt aktiv ist (nicht deaktiviert wurde)
    if (shouldSkipNotification && isSiegActiveNow && !wasSiegActiveBefore) {
      console.log("[GameInfoOverlay] ✅ BEDANKEN: Weiterleitung zur ResultatKreidetafel");
      
      // 🔧 FIX: Zuerst State setzen, dann onClose() mit kleinem Delay aufrufen
      // Direkt zur ResultatKreidetafel ohne Notification
      endCharge(team, "bedanken");
      
      // Setze State ZUERST
      useUIStore.setState((state) => {
        const newState = {
          resultatKreidetafel: {
            ...state.resultatKreidetafel,
            isOpen: true,
            swipePosition: team,
          },
        };
        console.log("[GameInfoOverlay] ✅ BEDANKEN: Setze State:", newState.resultatKreidetafel);
        return newState;
      });
      
      // 🔍 DEBUG: Verifiziere State direkt nach dem Setzen
      setTimeout(() => {
        const verifiedState = useUIStore.getState().resultatKreidetafel;
        console.log("[GameInfoOverlay] ✅ BEDANKEN: State-Verifikation nach setState:", verifiedState);
      }, 10);
      
      console.log("[GameInfoOverlay] ✅ BEDANKEN: State gesetzt, warte kurz vor onClose()");
      
      // 🔧 FIX: Warte länger und setze State ERNEUT nach onClose(), um sicherzustellen, dass er nicht überschrieben wird
      setTimeout(() => {
        console.log("[GameInfoOverlay] ✅ BEDANKEN: Rufe onClose() auf");
        onClose();
        
        // 🔧 KRITISCH: Setze State ERNEUT nach onClose(), um sicherzustellen, dass er nicht überschrieben wird
        setTimeout(() => {
          const currentState = useUIStore.getState().resultatKreidetafel;
          if (!currentState.isOpen) {
            console.log("[GameInfoOverlay] 🔧 BEDANKEN: State wurde überschrieben, setze erneut");
            useUIStore.setState((state) => ({
              resultatKreidetafel: {
                ...state.resultatKreidetafel,
                isOpen: true,
                swipePosition: team,
              },
            }));
          } else {
            console.log("[GameInfoOverlay] ✅ BEDANKEN: State ist korrekt nach onClose()");
          }
        }, 100);
      }, 50);
      
      return;
    } else {
      console.log("[GameInfoOverlay] ❌ BEDANKEN: KEINE Weiterleitung - Bedingungen nicht erfüllt:", {
        shouldSkipNotification,
        isSiegActiveNow,
        wasSiegActiveBefore,
      });
    }

    // 2. Notification nur zeigen, wenn wir BEDANKEN aktivieren UND Notification nicht übersprungen wird
    // 🔧 FIX: Prüfe State direkt, nicht nur actionProps (isSiegActiveNow bereits oben deklariert)
    if (actionProps.isActivating && isSiegActiveNow && !wasSiegActiveBefore) {
      const getNotificationDelay = (level: ChargeLevel): number => {
        const baseDelay = 250;
        switch (level) {
        case "extreme": return baseDelay + 5000;
        case "super": return baseDelay + 3000;
        case "high": return baseDelay + 2000;
        case "medium": return baseDelay + 1000;
        case "low": return baseDelay + 500;
        default: return baseDelay;
        }
      };

      setTimeout(() => {
        const spruch = getRandomBedankenSpruch(actionProps.chargeDuration.level);

        showNotification({
          type: "bedanken",
          message: spruch.text,
          position: team,
          isFlipped: isCalculatorFlipped,
          preventClose: false,
          actions: [
            {
              label: spruch.buttons.cancel,
              onClick: () => {
                endCharge(team, "bedanken");
                onClose();
              },
            },
            {
              label: spruch.buttons.confirm,
              onClick: () => {
                endCharge(team, "bedanken");
                onClose();
                useUIStore.setState((state) => ({
                  resultatKreidetafel: {
                    ...state.resultatKreidetafel,
                    isOpen: true,
                    swipePosition: team,
                  },
                }));
              },
            },
          ],
        });
      }, getNotificationDelay(actionProps.chargeDuration.level));
    }
  };

  const [isPlayerSelectOpen, setIsPlayerSelectOpen] = useState(false);

  const handlePlayerSelect = (selectedPlayer: PlayerNumber) => {
    // 1. Lokalen GameStore sofort aktualisieren
    useGameStore.setState((state) => ({
      ...state,
      currentPlayer: selectedPlayer,
      // Wenn es die erste Runde ist, setzen wir auch den Startspieler
      ...(currentRound === 1 && {startingPlayer: selectedPlayer}),
    }));

    // 2. Sofortige Firebase-Synchronisation für alle Clients
    const activeGameId = useGameStore.getState().activeGameId;
    if (activeGameId) {
      // Asynchron Firebase aktualisieren
      setTimeout(async () => {
        try {
          // MARK LOCAL UPDATE vor Firebase-Write
          if (typeof window !== 'undefined' && window.__FIRESTORE_SYNC_API__?.markLocalUpdate) {
            window.__FIRESTORE_SYNC_API__.markLocalUpdate();
          }

          // Import der updateActiveGame Funktion
          const { updateActiveGame } = await import('@/services/gameService');
          
          // Firebase-Update Daten vorbereiten
          const updateData = {
            currentPlayer: selectedPlayer,
            lastUpdated: serverTimestamp(),
            // Bei erster Runde auch startingPlayer und initialStartingPlayer aktualisieren
            ...(currentRound === 1 && {
              startingPlayer: selectedPlayer,
              initialStartingPlayer: selectedPlayer
            }),
          };

          await updateActiveGame(activeGameId, updateData);
          
          if (process.env.NODE_ENV === 'development') {
            console.log(`[GameInfoOverlay] Player selection synced to Firebase: ${selectedPlayer}`);
          }
        } catch (error) {
          console.error('[GameInfoOverlay] Firebase sync failed:', error);
          showNotification({
            type: 'warning',
            message: 'Spieler-Update konnte nicht synchronisiert werden.'
          });
        }
      }, 0);
    }
  };

  // Sichere Fallback-Behandlung für currentPlayer
  const safeCurrentPlayer = currentPlayer || 1;
  const safePlayerNames = playerNames || {
    1: "Spieler 1",
    2: "Spieler 2", 
    3: "Spieler 3",
    4: "Spieler 4"
  };
  
  // Sichere Fallback-Behandlung für scores
  const safeScores = scores || { top: 0, bottom: 0 };

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center z-50 ${isOpen ? "" : "pointer-events-none"}`}
      onClick={(e) => {
        if (!canClose) return;
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <animated.div
        style={springProps}
        className="relative w-11/12 max-w-md bg-gray-800 bg-opacity-95 rounded-xl p-6 shadow-lg select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setCalculatorFlipped(!isCalculatorFlipped)}
          className={`absolute bottom-full mb-[-10px] left-1/2 transform -translate-x-1/2 
            text-white hover:text-gray-300 transition-all duration-1000
            w-24 h-24 flex items-center justify-center
            rounded-full
            ${isCalculatorFlipped ? "rotate-180" : "rotate-0"}`}
          aria-label="Umdrehen"
        >
          <FiRotateCcw className="w-8 h-8" />
        </button>

        <div className="flex items-center justify-between mb-6">
          <button
            onClick={isPaused ? handleResumeClick : handlePauseClick}
            className={`
              w-10 h-10 rounded-full flex items-center justify-center
              ${isPaused ?
      "bg-green-600 hover:bg-green-500" :
      "bg-gray-600 hover:bg-gray-500"
    }
              text-white hover:text-white
              transition-all duration-150
              shadow-md hover:shadow-lg
            `}
            aria-label={isPaused ? "Weiter" : "Pause"}
          >
            {isPaused ? <FiPlay className="w-5 h-5" /> : <FiPause className="w-5 h-5" />}
          </button>

          <h2 className="text-2xl font-bold text-white text-center">
            Spielstand
          </h2>

          <button
            onClick={handleClose}
            className="w-12 h-12 rounded-full flex items-center justify-center -mr-2 -mt-2
              text-gray-400 hover:text-white
              transition-colors
              -webkit-tap-highlight-color-transparent"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 mb-8">
          <div className="grid grid-cols-4 gap-4 text-white">
            <div className="text-center pl-5">
              <span className="text-gray-400 text-xs">Spiel</span>
              <div className="text-xl font-bold">{currentGameId}</div>
            </div>

            <div className="text-center -ml-10 pl-0">
              <span className="text-gray-400 text-xs">Runde</span>
              <div className="text-xl font-bold">{currentRound}</div>
            </div>

            <div className="text-center -ml-10 pl-0">
              <span className="text-gray-400 text-xs">Spieldauer</span>
              <div className="text-xl font-bold">{gameTime}</div>
            </div>

            <div className="text-center -ml-8 pl-0">
              <span className="text-gray-400 text-xs">Jassdauer</span>
              <div className="text-xl font-bold">{jassTime}</div>
            </div>
          </div>

          <div className="text-center text-white mt-1">
            <span className="text-gray-400">Spieler</span>
            <div className="relative">
              <button
                onClick={() => setIsPlayerSelectOpen(!isPlayerSelectOpen)}
                className="w-full text-3xl font-bold p-2 bg-gray-700 hover:bg-gray-600
                          bg-opacity-50 rounded-xl mt-1 transition-colors"
              >
                {safePlayerNames[safeCurrentPlayer as PlayerNumber] || `Spieler ${safeCurrentPlayer}`}
              </button>

              {isPlayerSelectOpen && (
                <div className="absolute left-0 right-0 mt-1 bg-gray-700 rounded-xl overflow-hidden shadow-lg z-50">
                  {Object.entries(safePlayerNames).map(([num, name]) => (
                    <button
                      key={num}
                      onClick={() => {
                        handlePlayerSelect(Number(num) as PlayerNumber);
                        setIsPlayerSelectOpen(false);
                      }}
                      className="w-full p-3 text-left hover:bg-gray-600 transition-colors"
                    >
                      {name || `Spieler ${num}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="text-center text-white mt-1">
            <span className="text-gray-400">Zeit Runde</span>
            <div className="text-3xl font-bold p-2 bg-gray-700 bg-opacity-50 rounded-xl mt-1">
              {roundTime}
            </div>
          </div>

          <div className="text-center text-white mt-3">
            <MultiplierCalculator
              mainTitle="Punkte bis"
              subTitle={getRemainingPoints(isCalculatorFlipped ? "top" : "bottom", safeScores).title}
              points={getRemainingPoints(isCalculatorFlipped ? "top" : "bottom", safeScores).remaining}
              team={isCalculatorFlipped ? "top" : "bottom"}
              numberSize="text-3xl"
              scoreSettings={activeScoreSettings}
              scores={safeScores}
            />
          </div>

          <div className="text-center text-white mt-1">
            <div>
              <span className="text-gray-400">Gegner</span>
              <div className="grid grid-cols-3 gap-2 -mt-10">
                <div className="text-center">
                  <span className="text-gray-400 text-xs">
                    {getRemainingPoints(isCalculatorFlipped ? "bottom" : "top", safeScores).title}
                  </span>
                  <div className="text-xl font-bold mt-0">
                    {getRemainingPoints(isCalculatorFlipped ? "bottom" : "top", safeScores).remaining}
                  </div>
                </div>
                <div className="invisible">
                  {/* Leere mittlere Spalte für korrektes Alignment */}
                </div>
                <div className="text-center">
                  <span className="text-gray-400 text-xs">{currentMultiplier}-fach</span>
                  <div className="text-xl font-bold mt-0">
                    {getDividedPoints(getRemainingPoints(isCalculatorFlipped ? "bottom" : "top", safeScores).remaining)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 max-w-md mx-auto mt-12 mb-4">
          {activeScoreSettings?.enabled?.berg ? (
            // Berg aktiviert: 2 Buttons nebeneinander
            <div className="grid grid-cols-2 gap-4">
              <ChargeButton
                onAction={handleBergClick}
                isButtonActive={isBergActive(activeTeam)}
                isActiveGlobal={isBergActive("top") || isBergActive("bottom")}
                color="yellow"
                disabled={isPaused}
                type="berg"
                team={activeTeam}
              >
                <span className="text-2xl">Berg</span>
              </ChargeButton>

              <ChargeButton
                onAction={handleSiegClick}
                isButtonActive={isSiegActive(activeTeam)}
                isActiveGlobal={isSiegActive("top") || isSiegActive("bottom")}
                color="yellow"
                disabled={isPaused || !canActivateSieg()}
                type="sieg"
                team={activeTeam}
              >
                <span className="text-2xl">Bedanken</span>
              </ChargeButton>
            </div>
          ) : (
            // Berg deaktiviert: Nur Bedanken-Button über ganze Breite
            <ChargeButton
              onAction={handleSiegClick}
              isButtonActive={isSiegActive(activeTeam)}
              isActiveGlobal={isSiegActive("top") || isSiegActive("bottom")}
              color="yellow"
              disabled={isPaused || !canActivateSieg()}
              type="sieg"
              team={activeTeam}
            >
              <span className="text-2xl">Bedanken</span>
            </ChargeButton>
          )}
        </div>
      </animated.div>
    </div>
  );
};

export default GameInfoOverlay;
