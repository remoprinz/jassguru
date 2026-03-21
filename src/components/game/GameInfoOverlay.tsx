import React, {useState, useEffect} from "react";
import {animated, useSpring} from "react-spring";
import {FiPlay} from "react-icons/fi";
import {FaUndo, FaTimes} from "react-icons/fa";
import {FaPause} from "react-icons/fa6";
import {FiChevronDown, FiX as FiXIcon} from "react-icons/fi";
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
import {DEFAULT_TEAM_CONFIG} from "@/types/jass";
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
import {triggerSchneiderEffect} from "@/components/effects/SchneiderEffect";
import {triggerBedankenFireworks} from "@/components/effects/effects";

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

  // Einheitliches Timing für Berg/Bedanken-Feedback.
  // Kürzere Delays sorgen für ein direkteres, matsch-ähnliches Gefühl.
  const getNotificationDelayForChargeLevel = (level: ChargeLevel): number => {
    const baseDelay = 200;
    switch (level) {
    case "extreme": return baseDelay + 1800;
    case "super": return baseDelay + 1200;
    case "high": return baseDelay + 800;
    case "medium": return baseDelay + 500;
    case "low": return baseDelay + 250;
    default: return baseDelay;
    }
  };

  const getReducedSiegChargeLevel = (level: ChargeLevel): ChargeLevel => {
    if (level === "extreme" || level === "super" || level === "high") {
      return "medium";
    }
    return level;
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
      }, getNotificationDelayForChargeLevel(actionProps.chargeDuration.level));
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
    const hadSchneiderBefore = useGameStore.getState().striche[team].schneider > 0;
    console.log("[GameInfoOverlay] BEDANKEN Click - VOR addSieg:", {
      team,
      wasSiegActiveBefore,
      hadSchneiderBefore,
      actionProps_isActivating: actionProps.isActivating,
      chargeLevel: actionProps.chargeDuration.level,
      chargeDuration: actionProps.chargeDuration.duration,
    });
    
    // 1. Sofort BEDANKEN einloggen
    addSieg(team);

    // 🔧 FIX: Prüfe State NACH dem addSieg-Call (synchron, da addSieg synchron ist)
    const isSiegActiveNow = useGameStore.getState().isSiegActive(team);
    const hasSchneiderNow = useGameStore.getState().striche[team].schneider > 0;
    
    // 🚀 TEMPORÄR: Notification nur zeigen, wenn skipBedankenNotification false ist
    const shouldSkipNotification = useUIStore.getState().skipBedankenNotification;

    console.log("[GameInfoOverlay] BEDANKEN Click - NACH addSieg:", {
      team,
      wasSiegActiveBefore,
      isSiegActiveNow,
      hasSchneiderNow,
      shouldSkipNotification,
      shouldRedirect: shouldSkipNotification && isSiegActiveNow && !wasSiegActiveBefore,
    });

    // Spezialeffekt nur beim echten Übergang auf Schneider
    if (!hadSchneiderBefore && hasSchneiderNow) {
      triggerSchneiderEffect({
        chargeLevel: actionProps.chargeDuration.level,
        durationMs: actionProps.chargeDuration.duration,
      });
    }

    // Bedanken-Feuerwerk nur ohne Schneider und in reduzierter Intensität.
    if (
      actionProps.isActivating &&
      isSiegActiveNow &&
      !wasSiegActiveBefore &&
      !hasSchneiderNow
    ) {
      triggerBedankenFireworks({
        chargeLevel: getReducedSiegChargeLevel(actionProps.chargeDuration.level),
        team,
        effectType: "firework",
        isFlipped: isCalculatorFlipped,
      });
    }

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
      }, getNotificationDelayForChargeLevel(actionProps.chargeDuration.level));
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
  const opponentTeam = activeTeam === "top" ? "bottom" : "top";
  const ownTarget = getRemainingPoints(activeTeam, safeScores);
  const oppTarget = getRemainingPoints(opponentTeam, safeScores);

  // Teamnamen: bottom = Spieler 1+3, top = Spieler 2+4
  const getTeamLabel = (team: "top" | "bottom") => {
    const slots = DEFAULT_TEAM_CONFIG[team];
    const name1 = safePlayerNames[slots[0] as PlayerNumber] || `Spieler ${slots[0]}`;
    const name2 = safePlayerNames[slots[1] as PlayerNumber] || `Spieler ${slots[1]}`;
    return `${name1} + ${name2}`;
  };

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center z-50 ${isOpen ? "bg-black/60" : "pointer-events-none"}`}
      onClick={(e) => {
        if (!canClose) return;
        if (e.target === e.currentTarget) {
          setIsPlayerSelectOpen(false);
          handleClose();
        }
      }}
    >
      <animated.div
        style={springProps}
        className="relative w-11/12 max-w-md bg-gray-800/95 rounded-xl p-6 shadow-2xl border border-white/10 select-none font-sans"
        onClick={(e) => {
          e.stopPropagation();
          if (isPlayerSelectOpen) setIsPlayerSelectOpen(false);
        }}
      >
        {/* Flip-Button */}
        <button
          onClick={() => setCalculatorFlipped(!isCalculatorFlipped)}
          className={`absolute bottom-full mb-[-10px] left-1/2 transform -translate-x-1/2
            text-white hover:text-gray-300 transition-all duration-1000
            w-24 h-24 flex items-center justify-center
            rounded-full
            ${isCalculatorFlipped ? "rotate-180" : "rotate-0"}`}
          aria-label="Umdrehen"
        >
          <FaUndo className="w-8 h-8" />
        </button>

        {/* === Header === */}
        <div className="relative w-full pb-3 mb-4">
          <button
            onClick={isPaused ? handleResumeClick : handlePauseClick}
            className={`absolute left-0 top-1/2 -translate-y-1/2
              w-10 h-10 rounded-full flex items-center justify-center
              ${isPaused ? "bg-green-600 hover:bg-green-500" : "bg-gray-600 hover:bg-gray-500"}
              text-white transition-all duration-150 shadow-md`}
            aria-label={isPaused ? "Weiter" : "Pause"}
          >
            {isPaused ? <FiPlay className="w-5 h-5" /> : <FaPause className="w-4 h-4" />}
          </button>
          <h2 className="text-xl font-semibold text-white text-center select-none px-12">
            Spielstand
          </h2>
          <button
            onClick={handleClose}
            className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-white transition-colors z-10"
            aria-label="Schliessen"
          >
            <FaTimes size={24} />
          </button>
        </div>
        {/* Stats-Zeile */}
        <div className="text-center text-xs text-gray-500 uppercase tracking-wider mb-3">
          <span>Spiel </span>
          <span className="text-white font-semibold tabular-nums">{currentGameId}</span>
          <span className="mx-1.5 text-gray-600">·</span>
          <span>Runde </span>
          <span className="text-white font-semibold tabular-nums">{currentRound}</span>
        </div>

        {/* === Spieler + Rundenzeit — 50/50, harmonisch zur 2-Spalten-Anzeige === */}
        <div className="grid grid-cols-2 gap-3 text-white mb-5">
          <div className="min-w-0 relative flex flex-col items-center">
            <span className="text-gray-400 text-xs uppercase tracking-widest text-center">Spieler</span>
            <button
              onClick={() => setIsPlayerSelectOpen(!isPlayerSelectOpen)}
              className="relative flex w-full min-w-0 items-center justify-center gap-1 mt-1 py-2 pl-2 pr-9 text-xl font-bold bg-gray-700/50 hover:bg-gray-600/60
                        rounded-xl transition-colors"
            >
              <span className="min-w-0 flex-1 truncate text-center">
                {safePlayerNames[safeCurrentPlayer as PlayerNumber] || `Spieler ${safeCurrentPlayer}`}
              </span>
              <FiChevronDown className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 transition-transform ${isPlayerSelectOpen ? "rotate-180" : ""}`} />
            </button>

            {isPlayerSelectOpen && (
              <div className="absolute left-0 right-0 mt-1 bg-gray-700 rounded-xl overflow-hidden shadow-lg z-50">
                <div className="flex items-center justify-between px-3 pt-2 pb-1">
                  <span className="text-gray-400 text-xs uppercase tracking-widest">Spieler wählen</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsPlayerSelectOpen(false); }}
                    className="text-gray-400 hover:text-white p-1"
                  >
                    <FiXIcon className="w-4 h-4" />
                  </button>
                </div>
                {Object.entries(safePlayerNames).map(([num, name]) => (
                  <button
                    key={num}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayerSelect(Number(num) as PlayerNumber);
                      setIsPlayerSelectOpen(false);
                    }}
                    className={`w-full p-3 text-left hover:bg-gray-600 transition-colors ${
                      Number(num) === safeCurrentPlayer ? "bg-gray-600/50 font-semibold" : ""
                    }`}
                  >
                    {name || `Spieler ${num}`}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="min-w-0 flex flex-col items-center">
            <span className="text-gray-400 text-xs uppercase tracking-widest text-center">Rundenzeit</span>
            <div className="w-full text-xl font-bold tabular-nums px-2 py-2 bg-gray-700/50 rounded-xl text-center mt-1 min-h-[2.75rem] flex items-center justify-center">
              {roundTime}
            </div>
          </div>
        </div>

        {/* === Punkte bis + Multiplier === */}
        <div className="text-center text-white mb-6">
          <span className="text-gray-400 text-sm tracking-wide">Punkte bis</span>
          <MultiplierCalculator variant="multiplierOnly" scores={safeScores} />
        </div>

        {/* === Zahlen-Display — kompakte Karten (wie vorher); Gegner kleiner === */}
        <div className="text-white mb-2">
          {/* Eigenes Team */}
          <div className="text-center text-white text-base font-semibold mb-2.5 mt-1">
            {getTeamLabel(activeTeam)}
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-black/30 rounded-xl py-2.5 px-2 relative">
              <div className="text-xs uppercase tracking-wider text-gray-400 absolute top-1.5 left-2.5">{ownTarget.title}</div>
              <div className="text-center text-3xl font-extrabold tabular-nums mt-2" style={{fontFamily: 'system-ui, -apple-system, sans-serif'}}>{ownTarget.remaining}</div>
            </div>
            <div className="bg-black/30 rounded-xl py-2.5 px-2 relative">
              <div className="text-xs tabular-nums text-gray-400 absolute top-1.5 left-2.5">{currentMultiplier}-fach</div>
              <div className="text-center text-3xl font-extrabold tabular-nums mt-2" style={{fontFamily: 'system-ui, -apple-system, sans-serif'}}>{getDividedPoints(ownTarget.remaining)}</div>
            </div>
          </div>

          {/* Gegner-Team — kleinere Typo, flachere Karten */}
          <div className="text-center text-gray-400 text-sm font-medium mb-2">
            {getTeamLabel(opponentTeam)}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-black/30 rounded-xl py-2 px-2 relative">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 absolute top-1.5 left-2">{oppTarget.title}</div>
              <div className="text-center text-xl font-bold tabular-nums mt-1.5" style={{fontFamily: 'system-ui, -apple-system, sans-serif'}}>{oppTarget.remaining}</div>
            </div>
            <div className="bg-black/30 rounded-xl py-2 px-2 relative">
              <div className="text-[10px] tabular-nums text-gray-500 absolute top-1.5 left-2">{currentMultiplier}-fach</div>
              <div className="text-center text-xl font-bold tabular-nums mt-1.5" style={{fontFamily: 'system-ui, -apple-system, sans-serif'}}>{getDividedPoints(oppTarget.remaining)}</div>
            </div>
          </div>
        </div>

        {/* === Berg / Bedanken — eigene Sektion mit Kontextlabel === */}
        <div className="text-center text-gray-400 text-sm font-semibold mt-8 mb-3">
          {isBergActive(activeTeam) && isSiegActive(activeTeam)
            ? ""
            : isBergActiveForAnyTeam()
              ? "Bedanken:"
              : activeScoreSettings?.enabled?.berg
                ? "Berg schreiben:"
                : "Bedanken:"
          }
        </div>
        <div className="space-y-4 max-w-md mx-auto mb-4">
          {activeScoreSettings?.enabled?.berg ? (
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
                suppressDefaultEffect={true}
                type="sieg"
                team={activeTeam}
              >
                <span className="text-2xl">Bedanken</span>
              </ChargeButton>
            </div>
          ) : (
            <ChargeButton
              onAction={handleSiegClick}
              isButtonActive={isSiegActive(activeTeam)}
              isActiveGlobal={isSiegActive("top") || isSiegActive("bottom")}
              color="yellow"
              disabled={isPaused || !canActivateSieg()}
              suppressDefaultEffect={true}
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
