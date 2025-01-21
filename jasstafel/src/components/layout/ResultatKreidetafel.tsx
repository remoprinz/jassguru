import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useGameStore } from '../../store/gameStore';
import { FiX, FiRotateCcw } from 'react-icons/fi';
import format from 'date-fns/format';
import type { UIStore } from '../../store/uiStore';
import type { GameStore } from '../../types/jass';
import type { 
  TeamPosition, 
  StricheCount,
  TimerAnalytics
} from '../../types/jass';
import { STATISTIC_MODULES } from '../../statistics/registry';
import { StricheStatistik } from '../../statistics/StricheStatistik';
import { JasspunkteStatistik } from '../../statistics/JasspunkteStatistik';
import { useJassStore } from '../../store/jassStore';
import { useSpring } from 'react-spring';
import { animated } from 'react-spring';
import html2canvas from 'html2canvas';
import { useTimerStore } from '../../store/timerStore';
import { usePressableButton } from '../../hooks/usePressableButton';
import JassFinishNotification from '../notifications/JassFinishNotification';
import { useTutorialStore } from '../../store/tutorialStore';
import { TUTORIAL_STEPS } from '../../types/tutorial';
import { getJassSpruch } from '../../utils/jasssprueche';
import { calculateTeamStats } from '../../utils/teamCalculations';
import { getNormalStricheCount } from '../../utils/stricheCalculations';
import type { StricheRecord } from '../../types/jass';

// Record Type für Team-Striche (verwendet importierte Types)
type TeamStricheRecord = Record<TeamPosition, StricheCount>;

// Initial-Werte mit korrekten Types
const initialStriche: TeamStricheRecord = {
  top: { normal: 0, matsch: 0 },
  bottom: { normal: 0, matsch: 0 }
};

const PlayerName: React.FC<{ 
  name: string, 
  isStarter: boolean 
}> = ({ name, isStarter }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayName, setDisplayName] = useState(name);

  useEffect(() => {
    const measureAndTruncate = () => {
      const container = containerRef.current;
      if (!container) return;

      // Temporäres Element für Messung
      const testDiv = document.createElement('div');
      testDiv.style.visibility = 'hidden';
      testDiv.style.position = 'absolute';
      testDiv.style.whiteSpace = 'nowrap';
      testDiv.className = container.className;
      testDiv.textContent = name + (isStarter ? " ❀" : "");
      document.body.appendChild(testDiv);

      const nameWidth = testDiv.offsetWidth;
      // Erweitern des verfügbaren Platzes um 25%
      const containerWidth = container.offsetWidth * 1.25;
      document.body.removeChild(testDiv);

      if (nameWidth > containerWidth) {
        let start = 0;
        let end = name.length;
        
        while (start < end) {
          const mid = Math.floor((start + end + 1) / 2);
          testDiv.textContent = name.slice(0, mid) + (isStarter ? "❀" : "");
          document.body.appendChild(testDiv);
          const width = testDiv.offsetWidth;
          document.body.removeChild(testDiv);
          
          // Auch hier den erweiterten Platz berücksichtigen
          if (width <= containerWidth) {
            start = mid;
          } else {
            end = mid - 1;
          }
        }
        
        setDisplayName(name.slice(0, start));
      } else {
        setDisplayName(name);
      }
    };

    measureAndTruncate();
    window.addEventListener('resize', measureAndTruncate);
    return () => window.removeEventListener('resize', measureAndTruncate);
  }, [name, isStarter]);

  return (
    <div ref={containerRef} className="text-center text-gray-400 px-1">
      <span className="inline-block">
        {displayName}
        {isStarter && <span>❀</span>}
      </span>
    </div>
  );
};

const ResultatKreidetafel = () => {
  // 1. Basis Store-Zugriffe
  const isOpen = useUIStore(state => state.resultatKreidetafel.isOpen);
  const swipePosition = useUIStore(state => state.resultatKreidetafel.swipePosition);
  
  // 2. JassStore Zugriffe
  const games = useJassStore(state => state.games);
  
  // 3. Timer-Analytics mit Abhängigkeit von games und memoization
  const timerAnalytics = useMemo(() => {
    const timerStore = useTimerStore.getState();
    return timerStore.getAnalytics();
  }, [games.length]); // Nur neu berechnen, wenn sich die Anzahl der Spiele ändert
  
  // Touch-State
  const [touchStart, setTouchStart] = React.useState<number | null>(null);
  const [touchEnd, setTouchEnd] = React.useState<number | null>(null);
  const [swipeDirection, setSwipeDirection] = React.useState<'left' | 'right' | null>(null);

  // Atomare Store-Zugriffe
  const currentStatistic = useUIStore((state: UIStore) => state.resultatKreidetafel.currentStatistic);
  const closeResultatKreidetafel = useCallback(() => {
    useUIStore.setState(state => ({
      resultatKreidetafel: {
        ...state.resultatKreidetafel,
        isOpen: false
      },
      // Wichtig: Notification-State zurücksetzen
      jassFinishNotification: {
        isOpen: false,
        mode: 'share',
        message: { text: '', icon: '♥️' }, // SpruchMitIcon Format
        onShare: undefined,
        onBack: undefined,
        onContinue: undefined
      }
    }));
  }, []);

  // Game Store Zugriffe
  const playerNames = useGameStore((state: GameStore) => state.playerNames);
  const topScore = useGameStore((state: GameStore) => state.scores?.top ?? 0);
  const bottomScore = useGameStore((state: GameStore) => state.scores?.bottom ?? 0);
  const weisPoints = useGameStore((state: GameStore) => state.weisPoints);

  // Abgeleitete Werte
  const isFlipped = swipePosition === 'top';
  const currentDate = format(new Date(), 'd.M.yyyy');
  const currentModule = STATISTIC_MODULES.find(mod => mod.id === currentStatistic);

  // Store-Zugriffe
  const canNavigateBack = useJassStore(state => state.canNavigateBack());
  const canNavigateForward = useJassStore(state => state.canNavigateForward());

  // 1. Store-Zugriffe für aktuelle Striche
  const storeStriche = useGameStore(state => state.striche);

  // Transformation für UI
  const uiStriche = useMemo(() => ({
    top: {
      ...storeStriche.top,
      normal: getNormalStricheCount(storeStriche.top)
    },
    bottom: {
      ...storeStriche.bottom,
      normal: getNormalStricheCount(storeStriche.bottom)
    }
  }), [storeStriche]);

  // 2. Hilfsfunktion für Validierung - NUR aktuelles Spiel
  const canStartNewGame = useMemo(() => {
    // Prüfen ob im AKTUELLEN Spiel mindestens ein Sieg existiert
    return storeStriche.top.sieg > 0 || storeStriche.bottom.sieg > 0;
  }, [storeStriche]);

  // Button-Handler mit Store-Logik
  const handleBack = useCallback(() => {
    const jassStore = useJassStore.getState();
    const gameStore = useGameStore.getState();
    
    if (jassStore.canNavigateBack()) {
      // 2. Zum vorherigen Spiel navigieren
      jassStore.navigateToPreviousGame();
      
      // 3. GameStore VOLLSTÄNDIG mit historischen Daten aktualisieren
      const previousGame = jassStore.getCurrentGame();
      if (previousGame) {
        // Erst alles zurücksetzen
        gameStore.resetGame();
        
        // Dann VOLLSTÄNDIGEN Spielzustand wiederherstellen
        useGameStore.setState(state => ({
          ...state,
          isGameStarted: true,
          currentRound: previousGame.currentRound || 1,
          currentPlayer: previousGame.currentPlayer,
          
          // Alle Punkte
          scores: {
            top: (previousGame.teams.top.jassPoints || 0) + (previousGame.teams.top.weisPoints || 0),
            bottom: (previousGame.teams.bottom.jassPoints || 0) + (previousGame.teams.bottom.weisPoints || 0)
          },
          weisPoints: {
            top: previousGame.teams.top.weisPoints,
            bottom: previousGame.teams.bottom.weisPoints
          },
          
          // Alle Striche
          striche: {
            top: { ...previousGame.teams.top.striche },
            bottom: { ...previousGame.teams.bottom.striche }
          },
          
          // Wichtig: Spielhistorie
          roundHistory: previousGame.roundHistory || [],
          
          // Spielstatus
          isGameCompleted: false,  // Wichtig: Auf false setzen damit weitergespielt werden kann!
          isRoundCompleted: false
        }));
      }
    }
  }, []);

  const handleNextGame = useCallback(() => {
    const jassStore = useJassStore.getState();
    const gameStore = useGameStore.getState();
    
    if (jassStore.canNavigateForward()) {
      // A) Navigation zu existierendem Spiel - immer erlaubt
      jassStore.navigateToNextGame();
      
      const nextGame = jassStore.getCurrentGame();
      if (nextGame) {
        // Historische Daten laden
        gameStore.resetGame();
        useGameStore.setState(state => ({
          ...state,
          isGameStarted: true,
          currentRound: nextGame.currentRound || 1,
          currentPlayer: nextGame.currentPlayer,
          scores: {
            top: (nextGame.teams.top.jassPoints || 0) + (nextGame.teams.top.weisPoints || 0),
            bottom: (nextGame.teams.bottom.jassPoints || 0) + (nextGame.teams.bottom.weisPoints || 0)
          },
          weisPoints: {
            top: nextGame.teams.top.weisPoints,
            bottom: nextGame.teams.bottom.weisPoints
          },
          striche: {
            top: { ...nextGame.teams.top.striche },
            bottom: { ...nextGame.teams.bottom.striche }
          },
          roundHistory: nextGame.roundHistory || [],
          isGameCompleted: false,
          isRoundCompleted: false
        }));
      }
    } else {
      // B) Neues Spiel - nur mit Sieg im aktuellen Spiel erlaubt
      if (!canStartNewGame) {
        useUIStore.getState().showNotification({
          message: "Bitte erst bedanken, bevor ein neues Spiel gestartet wird.",
          type: 'warning',
          position: swipePosition === 'top' ? 'top' : 'bottom',
          isFlipped: swipePosition === 'top',
          actions: [{ label: 'Verstanden', onClick: closeResultatKreidetafel }]
        });
        return;
      }
      
      // 1. Erst aktuelles Spiel finalisieren
      jassStore.finalizeGame();
      
      // 2. Dann neues Spiel im jassStore erstellen
      jassStore.startGame();
      
      // 3. GameStore komplett zurücksetzen für neues Spiel
      gameStore.resetGame();
      
      // 4. Spielstatus richtig setzen
      useGameStore.setState(state => ({
        ...state,
        isGameStarted: true,
        currentRound: 1,
        isGameCompleted: false,
        isRoundCompleted: false
      }));
    }
  }, [canStartNewGame]);

  // Button Text
  const nextGameButtonText = canNavigateForward ? "1 Spiel\nvorwärts" : "Neues\nSpiel";

  // Store-Zugriffe hinzufügen
  const teams = useJassStore(state => state.teams);
  const currentGameId = useJassStore(state => state.currentGameId);
  const currentTotals = useMemo(() => {
    const { scoreSettings } = useUIStore.getState();
    const { games } = useJassStore.getState();
    
    // Hilfsfunktion zur korrekten Berechnung der Striche
    const calculateStriche = (striche: StricheRecord): number => {
      let total = 0;
      // Berg nur wenn aktiviert
      if (scoreSettings?.enabled?.berg) {
        total += striche.berg;
      }
      // Sieg immer
      total += striche.sieg;
      // Schneider nur wenn aktiviert
      if (scoreSettings?.enabled?.schneider) {
        total += striche.schneider;
      }
      // Matsch und Kontermatsch immer
      total += striche.matsch;
      total += striche.kontermatsch;
      return total;
    };

    // 1. Basis-Totale aus vorherigen Spielen (OHNE aktuelles Spiel)
    const baseTotals = games
      .filter(game => game.id < currentGameId)  // Wichtig: < statt <=
      .reduce((totals, game) => ({
        striche: {
          top: totals.striche.top + calculateStriche(game.teams.top.striche),
          bottom: totals.striche.bottom + calculateStriche(game.teams.bottom.striche)
        },
        punkte: {
          top: totals.punkte.top + game.teams.top.total,
          bottom: totals.punkte.bottom + game.teams.bottom.total
        }
      }), {
        striche: { top: 0, bottom: 0 },
        punkte: { top: 0, bottom: 0 }
      });

    // 2. Aktuelle Striche hinzufügen
    return {
      striche: {
        top: baseTotals.striche.top + calculateStriche(uiStriche.top),
        bottom: baseTotals.striche.bottom + calculateStriche(uiStriche.bottom)
      },
      punkte: {
        top: baseTotals.punkte.top + topScore,
        bottom: baseTotals.punkte.bottom + bottomScore
      }
    };
  }, [currentGameId, uiStriche, topScore, bottomScore]);  // Abhängigkeiten aktualisiert

  // Touch-Handler mit korrekter Typisierung
  const handleStatisticChange = React.useCallback((direction: 'left' | 'right') => {
    const currentIndex = STATISTIC_MODULES.findIndex(mod => mod.id === currentStatistic);
    const nextIndex = direction === 'right' 
      ? (currentIndex + 1) % STATISTIC_MODULES.length
      : (currentIndex - 1 + STATISTIC_MODULES.length) % STATISTIC_MODULES.length;

    useUIStore.setState(state => ({
      resultatKreidetafel: {
        ...state.resultatKreidetafel,
        currentStatistic: STATISTIC_MODULES[nextIndex].id
      }
    }));
  }, [currentStatistic]);

  // Touch-Event-Handler
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
    setSwipeDirection(null);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
    
    if (touchStart && e.targetTouches[0].clientX) {
      const distance = touchStart - e.targetTouches[0].clientX;
      if (Math.abs(distance) > 20) {
        setSwipeDirection(distance > 0 ? 'left' : 'right');
      }
    }
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe || isRightSwipe) {
      handleStatisticChange(isLeftSwipe ? 'right' : 'left');
    }

    setTouchStart(null);
    setTouchEnd(null);
    setSwipeDirection(null);
  };

  // Animation mit onRest Callback
  const springProps = useSpring({
    opacity: isOpen ? 1 : 0,
    transform: `scale(${isOpen ? 1 : 0.95}) rotate(${isFlipped ? '180deg' : '0deg'})`,
    config: { mass: 1, tension: 300, friction: 20 },
    onRest: () => {
      // Animation ist fertig
      useUIStore.setState(state => ({
        resultatKreidetafel: {
          ...state.resultatKreidetafel,
          animationComplete: true
        }
      }));
    }
  });

  // Neue Share-Funktion
  const kreidetafelRef = useRef<HTMLDivElement>(null);

  const handleShareAndComplete = useCallback(async () => {
    try {
      // 1. Originale Werte speichern
      const originalState = useUIStore.getState().resultatKreidetafel;
      
      // 2. Komponente vollständig auf "bottom" setzen
      useUIStore.setState(state => ({
        resultatKreidetafel: {
          ...state.resultatKreidetafel,
          swipePosition: 'bottom',
          isFlipped: false
        }
      }));

      // 3. Warten auf vollständiges Re-render
      await new Promise(resolve => setTimeout(resolve, 400));

      // 4. Screenshot-Logik
      const kreidetafelContent = document.querySelector('.kreidetafel-content');
      const statistikContainer = document.querySelector('.statistik-container');
      const buttonContainer = document.querySelector('.button-container');
      
      if (!kreidetafelContent || !statistikContainer || !buttonContainer || 
          !(kreidetafelContent instanceof HTMLElement) ||
          !(statistikContainer instanceof HTMLElement) ||
          !(buttonContainer instanceof HTMLElement)) {
        throw new Error('Erforderliche Elemente nicht gefunden');
      }

      // 5. Originale Styles speichern
      const originalStyles = {
        maxHeight: statistikContainer.style.maxHeight,
        overflowY: statistikContainer.style.overflowY,
        buttonDisplay: buttonContainer.style.display
      };

      // 6. Styles für Screenshot anpassen
      statistikContainer.style.maxHeight = 'none';
      statistikContainer.style.overflowY = 'visible';
      buttonContainer.style.display = 'none';

      try {
        // 7. Screenshot mit originalen Optionen
        const canvas = await html2canvas(kreidetafelContent, {
          backgroundColor: '#1F2937',
          useCORS: true,
          logging: false,
          windowWidth: kreidetafelContent.scrollWidth,
          windowHeight: kreidetafelContent.scrollHeight,
          scale: 2
        } as any);

        // 8. Blob erstellen
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
          }, 'image/png', 1.0);
        });

        // 9. Share API mit Text und Bild
        if (navigator.share) {
          const notification = useUIStore.getState().jassFinishNotification;
          const shareText = notification?.message 
            ? typeof notification.message === 'string' 
              ? notification.message 
              : notification.message.text
            : 'Jass Resultat';
            
          const fullShareText = `${shareText}\n\nGeneriert von:\n👉 https://jassguru.web.app`;
          
          await navigator.share({
            files: [new File([blob], 'jass-resultat.png', { type: 'image/png' })],
            text: fullShareText
          });
        }
      } finally {
        // 10. Ursprüngliche Styles wiederherstellen
        statistikContainer.style.maxHeight = originalStyles.maxHeight;
        statistikContainer.style.overflowY = originalStyles.overflowY;
        buttonContainer.style.display = originalStyles.buttonDisplay;

        // 11. Ursprünglichen Zustand wiederherstellen
        useUIStore.setState(state => ({
          resultatKreidetafel: {
            ...state.resultatKreidetafel,
            ...originalState
          }
        }));
      }

      closeResultatKreidetafel();
    } catch (error) {
      console.error('Screenshot/Share Fehler:', error);
    }
  }, [closeResultatKreidetafel]);

  const completeJass = useTimerStore(state => state.completeJass);

  const backButton = usePressableButton(handleBack);
  const shareButton = usePressableButton(handleShareAndComplete);
  const nextButton = usePressableButton(handleNextGame);

  // Notification State aus dem UIStore
  const isJassFinishOpen = useUIStore((state) => state.jassFinishNotification.isOpen);

  // Team-Statistiken auf Komponenten-Ebene berechnen (NEU)
  const teamStats = useMemo(() => calculateTeamStats({
    playerNames: Object.values(playerNames).filter(Boolean),
    currentStatistic: currentStatistic === 'jasspunkte' ? 'punkte' : currentStatistic,
    totals: {
      striche: {
        team1: currentTotals.striche.top,
        team2: currentTotals.striche.bottom
      },
      punkte: {
        team1: currentTotals.punkte.top,
        team2: currentTotals.punkte.bottom
      }
    },
    matchCount: {
      team1: uiStriche.top.matsch || 0,
      team2: uiStriche.bottom.matsch || 0
    },
    type: 'gameEnd',
    gameHistory: {
      gesamtStand: {
        team1: currentTotals.striche.top,
        team2: currentTotals.striche.bottom
      },
      gameNumber: currentGameId,
      totalGames: games.length
    },
    currentStriche: {
      team1: {
        normal: uiStriche.top.normal,
        matsch: uiStriche.top.matsch
      },
      team2: {
        normal: uiStriche.bottom.normal,
        matsch: uiStriche.bottom.matsch
      }
    }
  }), [currentTotals, currentGameId, games.length, playerNames, currentStatistic, uiStriche]);

  const handleBeendenClick = useCallback(() => {
    const uiStore = useUIStore.getState();
    const timerStore = useTimerStore.getState();

    if (!canStartNewGame) {
      uiStore.showNotification({
        message: "Bitte erst bedanken, bevor der Jass beendet wird.",
        type: 'warning',
        position: swipePosition === 'top' ? 'top' : 'bottom',
        isFlipped: swipePosition === 'top',
        actions: [{ label: 'Verstanden', onClick: closeResultatKreidetafel }]
      });
      return;
    }

    // 1. Timer-Analytics VOR dem prepareJassEnd holen
    const timerAnalytics = timerStore.getAnalytics();
    
    // 2. Jass-Ende vorbereiten (aber noch nicht finalisieren)
    const jassDuration = timerStore.prepareJassEnd();

    const spruch = getJassSpruch({
      stricheDifference: Math.abs(currentTotals.striche.top - currentTotals.striche.bottom),
      pointDifference: Math.abs(currentTotals.punkte.top - currentTotals.punkte.bottom),
      isUnentschieden: currentStatistic === 'striche' 
        ? currentTotals.striche.top === currentTotals.striche.bottom 
        : currentTotals.punkte.top === currentTotals.punkte.bottom,
      winnerNames: currentStatistic === 'striche'
        ? currentTotals.striche.top > currentTotals.striche.bottom
          ? [playerNames[2], playerNames[4]].filter(Boolean)
          : [playerNames[1], playerNames[3]].filter(Boolean)
        : currentTotals.punkte.top > currentTotals.punkte.bottom
          ? [playerNames[2], playerNames[4]].filter(Boolean)
          : [playerNames[1], playerNames[3]].filter(Boolean),
      loserNames: currentStatistic === 'striche'
        ? currentTotals.striche.top > currentTotals.striche.bottom
          ? [playerNames[1], playerNames[3]].filter(Boolean)
          : [playerNames[2], playerNames[4]].filter(Boolean)
        : currentTotals.punkte.top > currentTotals.punkte.bottom
          ? [playerNames[1], playerNames[3]].filter(Boolean)
          : [playerNames[2], playerNames[4]].filter(Boolean),
      isStricheMode: currentStatistic === 'striche',
      type: 'jassEnd',
      timerAnalytics,  // Jetzt korrekt definiert!
      matchCount: {
        team1: uiStriche.top.matsch ?? 0,
        team2: uiStriche.bottom.matsch ?? 0
      },
      totalMatsche: (uiStriche.top.matsch ?? 0) + (uiStriche.bottom.matsch ?? 0),
      isSchneider: currentTotals.punkte.top < uiStore.scoreSettings.values.schneider || 
                  currentTotals.punkte.bottom < uiStore.scoreSettings.values.schneider,
      gameStats: teamStats.gameStats,
      gesamtStand: teamStats.gesamtStand,
      previousGesamtStand: teamStats.previousGesamtStand
    });

    useUIStore.setState({
      jassFinishNotification: {
        isOpen: true,
        mode: 'share',
        message: spruch,
        onShare: async () => {
          timerStore.finalizeJassEnd();
          await handleShareAndComplete();
        },
        onBack: closeResultatKreidetafel
      }
    });
  }, [canStartNewGame, swipePosition, closeResultatKreidetafel, handleShareAndComplete]);

  // Scroll-Effekt für alle relevanten Änderungen
  useEffect(() => {
    if (kreidetafelRef.current && isOpen) {
      // Kleine Verzögerung für Animation
      setTimeout(() => {
        if (kreidetafelRef.current) {
          kreidetafelRef.current.scrollTop = kreidetafelRef.current.scrollHeight;
        }
      }, 50);
    }
  }, [isOpen, games.length, currentGameId]); // Abhängigkeit von currentGameId hinzugefügt

  // Swipe-Animation für den Statistik-Wechsel
  const swipeAnimation = useSpring({
    opacity: swipeDirection ? 0.7 : 1,
    transform: swipeDirection === 'left' 
      ? 'translateX(-10px)' 
      : swipeDirection === 'right' 
        ? 'translateX(10px)' 
        : 'translateX(0px)',
    config: { tension: 280, friction: 20 }
  });

  const { isActive: isTutorialActive, getCurrentStep } = useTutorialStore();
  const currentStep = getCurrentStep();

  useEffect(() => {
    if (isOpen && isTutorialActive && (!currentStep || currentStep.id !== TUTORIAL_STEPS.RESULTAT_INFO)) {
      closeResultatKreidetafel();
    }
  }, [isOpen, isTutorialActive, currentStep, closeResultatKreidetafel]);

  // Button-Handler anpassen
  const handleNextGameClick = useCallback(() => {
    const scoreSettings = useUIStore.getState().scoreSettings;

    if (canNavigateForward) {
      handleNextGame();
      return;
    }

    if (!canStartNewGame) {
      useUIStore.getState().showNotification({
        message: "Bitte erst bedanken, bevor ein neues Spiel gestartet wird.",
        type: 'warning',
        position: swipePosition === 'top' ? 'top' : 'bottom',
        isFlipped: swipePosition === 'top',
        actions: [{ label: 'Verstanden', onClick: closeResultatKreidetafel }]
      });
      return;
    }

    const spruch = getJassSpruch({
      stricheDifference: Math.abs(currentTotals.striche.top - currentTotals.striche.bottom),
      pointDifference: Math.abs(currentTotals.punkte.top - currentTotals.punkte.bottom),
      isUnentschieden: currentStatistic === 'striche' 
        ? currentTotals.striche.top === currentTotals.striche.bottom 
        : currentTotals.punkte.top === currentTotals.punkte.bottom,
      winnerNames: currentStatistic === 'striche'
        ? currentTotals.striche.top > currentTotals.striche.bottom
          ? [playerNames[2], playerNames[4]].filter(Boolean)
          : [playerNames[1], playerNames[3]].filter(Boolean)
        : currentTotals.punkte.top > currentTotals.punkte.bottom
          ? [playerNames[2], playerNames[4]].filter(Boolean)
          : [playerNames[1], playerNames[3]].filter(Boolean),
      loserNames: currentStatistic === 'striche'
        ? currentTotals.striche.top > currentTotals.striche.bottom
          ? [playerNames[1], playerNames[3]].filter(Boolean)
          : [playerNames[2], playerNames[4]].filter(Boolean)
        : currentTotals.punkte.top > currentTotals.punkte.bottom
          ? [playerNames[1], playerNames[3]].filter(Boolean)
          : [playerNames[2], playerNames[4]].filter(Boolean),
      isStricheMode: currentStatistic === 'striche',
      type: 'gameEnd',
      timerAnalytics,
      totalMatsche: (uiStriche.top.matsch ?? 0) + (uiStriche.bottom.matsch ?? 0),
      isSchneider: currentTotals.punkte.top < scoreSettings.values.schneider || 
                  currentTotals.punkte.bottom < scoreSettings.values.schneider,
      gameStats: teamStats.gameStats,
      gesamtStand: teamStats.gesamtStand,
      previousGesamtStand: teamStats.previousGesamtStand,
      matchCount: {
        team1: uiStriche.top.matsch ?? 0,
        team2: uiStriche.bottom.matsch ?? 0
      }
    });

    useUIStore.setState({
      jassFinishNotification: {
        isOpen: true,
        mode: 'continue',
        message: spruch,
        onBack: closeResultatKreidetafel,
        onContinue: () => {
          closeResultatKreidetafel();
          handleNextGame();
        }
      }
    });
  }, [
    canNavigateForward,
    handleNextGame,
    canStartNewGame,
    swipePosition,
    currentTotals,
    currentStatistic,
    playerNames,
    timerAnalytics,
    uiStriche,
    closeResultatKreidetafel
  ]);

  // Auch beim Öffnen der Kreidetafel sollten wir den Notification-State zurücksetzen
  useEffect(() => {
    if (isOpen) {
      useUIStore.setState(state => ({
        jassFinishNotification: {
          isOpen: false,
          mode: 'share',
          message: { text: '', icon: '🎲' }, // SpruchMitIcon Format
          onShare: undefined,
          onBack: undefined,
          onContinue: undefined
        }
      }));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay mit Touch-Handlers */}
      <div 
        className="fixed inset-0 flex items-center justify-center z-50 bg-black/50"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            closeResultatKreidetafel();
          }
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Animierter Wrapper für die gesamte Tafel */}
        <animated.div 
          style={springProps}
          className={`w-11/12 max-w-md ${
            swipeDirection === 'left' ? '-translate-x-4' : 
            swipeDirection === 'right' ? 'translate-x-4' : ''
          }`}
        >
          {/* Screenshot-Bereich */}
          <div 
            className="kreidetafel-content relative bg-gray-800 bg-opacity-95 rounded-t-xl p-6 shadow-lg select-none"
          >
            {/* Header */}
            <div className="text-center mb-4">
              <h2 className="text-2xl font-bold text-white">
                {currentModule?.title || 'Jassergebnis'}
              </h2>
              <p className="text-gray-400">{currentDate}</p>
            </div>

            {/* Dreh-Button */}
            <button
              onClick={() => useUIStore.setState(state => ({
                resultatKreidetafel: {
                  ...state.resultatKreidetafel,
                  swipePosition: isFlipped ? 'bottom' : 'top'
                }
              }))}
              className={`absolute bottom-full mb-[-10px] left-1/2 transform -translate-x-1/2 
                text-white hover:text-gray-300 transition-all duration-1000
                w-24 h-24 flex items-center justify-center
                rounded-full
                ${isFlipped ? 'rotate-180' : 'rotate-0'}`}
              aria-label="Umdrehen"
            >
              <FiRotateCcw className="w-8 h-8" />
            </button>

            {/* Close Button */}
            <button 
              onClick={closeResultatKreidetafel}
              className="absolute right-2 top-2 p-2 text-gray-400 hover:text-white"
            >
              <FiX size={24} />
            </button>

            {/* Teams Header - neue Spaltenbreiten */}
            <div className="grid grid-cols-[1fr_4fr_4fr] gap-4 mb-2">
              <div></div>
              <div className="text-center text-white">Team 1</div>
              <div className="text-center text-white">Team 2</div>
            </div>

            {/* Spielernamen mit manueller Kürzung und Blumensymbol */}
            <div className="grid grid-cols-[1fr_4fr_4fr] gap-4 mb-4">
              <div></div>
              <div className="grid grid-cols-2 gap-2">
                <PlayerName 
                  name={playerNames[1]} 
                  isStarter={games[0]?.initialStartingPlayer === 1} 
                />
                <PlayerName 
                  name={playerNames[3]} 
                  isStarter={games[0]?.initialStartingPlayer === 3} 
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <PlayerName 
                  name={playerNames[2]} 
                  isStarter={games[0]?.initialStartingPlayer === 2} 
                />
                <PlayerName 
                  name={playerNames[4]} 
                  isStarter={games[0]?.initialStartingPlayer === 4} 
                />
              </div>
            </div>

            {/* Statistik-Container mit Scroll und Swipe-Animation */}
            <div className="border-t border-b border-gray-700">
              <div 
                ref={kreidetafelRef}
                className="statistik-container max-h-[280px] overflow-y-auto"
              >
                <animated.div style={swipeAnimation} className="py-2">
                  {currentStatistic === 'striche' ? (
                    <StricheStatistik
                      teams={teams}
                      games={games}
                      currentGameId={currentGameId}
                      onSwipe={handleStatisticChange}
                    />
                  ) : (
                    <JasspunkteStatistik
                      teams={teams}
                      games={games}
                      currentGameId={currentGameId}
                      onSwipe={handleStatisticChange}
                    />
                  )}
                </animated.div>
              </div>
            </div>

            {/* Totals - vollständig unabhängige Positionierung */}
            <div className="grid grid-cols-[0.5fr_5fr_5fr] gap-4 mt-4">
              <div className="text-gray-400 text-center pr-4">Total:</div>
              <div className="flex justify-center -ml-[36px]">
                <div className="text-2xl font-bold text-white w-[100px] text-center">
                  {currentStatistic === 'striche' 
                    ? currentTotals.striche.bottom 
                    : currentTotals.punkte.bottom}
                </div>
              </div>
              <div className="flex justify-center -ml-[12px]">
                <div className="text-2xl font-bold text-white w-[100px] text-center">
                  {currentStatistic === 'striche' 
                    ? currentTotals.striche.top 
                    : currentTotals.punkte.top}
                </div>
              </div>
            </div>

            {/* Statistik Navigation Dots */}
            <div className="flex justify-center mt-4 mb-2">
              <div className="flex justify-center items-center space-x-2 bg-gray-700/50 px-1.5 py-1 rounded-full">
                {STATISTIC_MODULES.map(mod => (
                  <div
                    key={mod.id}
                    className={`w-2 h-2 rounded-full transition-all duration-200 ${
                      currentStatistic === mod.id 
                        ? 'bg-white/80 shadow-sm' 
                        : 'bg-gray-500/50'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Buttons im gleichen Rotationskontext */}
          <div className={`grid gap-4 p-4 bg-gray-800 bg-opacity-95 rounded-b-xl shadow-lg button-container ${
            canNavigateBack ? 'grid-cols-3' : 'grid-cols-2'
          }`}>
            {canNavigateBack && (
              <button 
                {...backButton.handlers}
                disabled={!canNavigateBack}
                className={`
                  py-2 px-4 text-white rounded-lg font-medium text-base
                  transition-all duration-150
                  ${canNavigateBack ? 'bg-gray-600' : 'bg-gray-500/50 cursor-not-allowed'}
                  hover:bg-gray-700
                  leading-tight
                  ${backButton.buttonClasses}
                `}
              >
                {["1 Spiel", "zurück"].map((line, i) => (
                  <React.Fragment key={i}>
                    {line}
                    {i === 0 && <br />}
                  </React.Fragment>
                ))}
              </button>
            )}

            <button 
              onClick={handleBeendenClick}
              className={`
                py-2 px-4 text-white rounded-lg font-medium text-base
                transition-all duration-150
                bg-yellow-600 hover:bg-yellow-700
                flex items-center justify-center gap-2
                leading-tight
                ${shareButton.buttonClasses}
              `}
            >
              {["Jass", "beenden"].map((line, i) => (
                <React.Fragment key={i}>
                  {line}
                  {i === 0 && <br />}
                </React.Fragment>
              ))}
            </button>

            <button 
              onClick={handleNextGameClick}
              className={`
                py-2 px-4 text-white rounded-lg font-medium text-base
                transition-all duration-150
                ${canNavigateForward 
                  ? 'bg-gray-600 hover:bg-gray-700' 
                  : 'bg-green-600 hover:bg-green-700'
                }
                leading-tight
                ${nextButton.buttonClasses}
              `}
            >
              {nextGameButtonText.split('\n').map((line, i) => (
                <React.Fragment key={i}>
                  {line}
                  {i === 0 && nextGameButtonText.includes('\n') && <br />}
                </React.Fragment>
              ))}
            </button>
          </div>
        </animated.div>
      </div>

      {/* JassFinishNotification einbinden */}
      <JassFinishNotification />
    </>
  );
};

export default ResultatKreidetafel;