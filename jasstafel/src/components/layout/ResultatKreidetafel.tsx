import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { useUIStore, UIStore } from '../../store/uiStore';
import { useGameStore } from '../../store/gameStore';
import { FiX, FiRotateCcw, FiSkipBack } from 'react-icons/fi';
import { format } from 'date-fns';
import type { GameStore, StricheCount } from '../../types/jass';
import { 
  TeamPosition, 
  StricheRecord,
  type JassStore,
  PlayerNumber, 
  GameEntry,
  determineNextStartingPlayer
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
import { useDeviceScale } from '../../hooks/useDeviceScale';
import { ArrowLeft, ArrowRight, Share } from 'lucide-react';
import { useSwipeable } from 'react-swipeable';

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

interface ElementStyles {
  element: HTMLElement;
  originalDisplay: string;
}

interface StatistikStyles {
  element: HTMLElement;
  originalMaxHeight: string;
  originalOverflow: string;
}

interface ScreenshotOptions {
  background: string;
  useCORS: boolean;
  logging: boolean;
  scale: number;
}

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
      try {
        console.log('🔄 [START] Navigation zum nächsten Spiel initiieren...');
        
        // Prüfen ob im AKTUELLEN Spiel mindestens ein Sieg existiert
        const currentStriche = gameStore.striche;
        const hasSieg = currentStriche.top.sieg > 0 || currentStriche.bottom.sieg > 0;

        if (!hasSieg) {
          useUIStore.getState().showNotification({
            message: "Bitte erst bedanken, bevor zum nächsten Spiel navigiert wird.",
            type: 'warning',
            position: swipePosition === 'top' ? 'top' : 'bottom',
            isFlipped: swipePosition === 'top',
            actions: [{ label: 'Verstanden', onClick: closeResultatKreidetafel }]
          });
          return;
        }
        
        console.log('✅ "Bedanken" vorhanden, Navigation kann fortgesetzt werden');
        
        // 1. WICHTIG: Den aktuellen Spielzustand finalisieren
        jassStore.finalizeGame();
        console.log('✅ Aktuelles Spiel finalisiert');
        
        // 2. Zum nächsten Spiel navigieren (ändert currentGameId)
        const nextGameId = jassStore.currentGameId + 1;
        console.log(`🎲 Navigation zu Spiel #${nextGameId} wird vorbereitet...`);
        jassStore.navigateToNextGame();
        
        console.log(`✅ Navigation zu Spiel #${jassStore.currentGameId} abgeschlossen`);
        
        // 3. WICHTIG: Timer sofort reaktivieren (ohne Verzögerung)
        console.log('⏱️ Timer-Reaktivierung wird durchgeführt...');
        const timerStore = useTimerStore.getState();
        
        // reactivateGameTimer setzt roundStartTime & gameStartTime
        timerStore.reactivateGameTimer(jassStore.currentGameId);
        console.log('✅ Timer wurden reaktiviert mit:', {
          gameId: jassStore.currentGameId,
          gameStartTime: new Date(timerStore.gameStartTime || 0).toISOString(),
          roundStartTime: new Date(timerStore.roundStartTime || 0).toISOString()
        });
        
        // 4. Falls GameInfoOverlay offen ist, erzwinge UI-Update
        if (useUIStore.getState().isGameInfoOpen) {
          console.log('🔄 GameInfoOverlay ist offen - erzwinge Update...');
          const uiStore = useUIStore.getState();
          uiStore.setGameInfoOpen(false);
          setTimeout(() => uiStore.setGameInfoOpen(true), 20);
          console.log('✅ GameInfoOverlay-Update erzwungen');
        }
        
        // 5. Spielzustand aktualisieren
        const nextGame = jassStore.getCurrentGame();
        if (nextGame) {
          console.log('🎲 Spieldaten werden aktualisiert...');
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
          console.log('✅ Spieldaten aktualisiert');
        }
        
        console.log('🎉 Navigation zum nächsten Spiel erfolgreich abgeschlossen!');
      } catch (error) {
        console.error('❌ Fehler bei der Navigation zum nächsten Spiel:', error);
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
      const { gamePlayers } = gameStore; // Get GamePlayers object from gameStore
      const { teams } = jassStore; // Get teams from jassStore
      
      // Prüfen, ob gamePlayers gesetzt ist (sollte es sein)
      if (!gamePlayers) {
        console.error("FEHLER: gamePlayers ist null in handleNextGame!");
        // Hier ggf. Fehlerbehandlung oder Fallback
        return; 
      }

      // Nächsten Startspieler bestimmen
      const currentGameEntry = jassStore.getCurrentGame();
      const initialStartingPlayer = determineNextStartingPlayer(
        currentGameEntry ?? null, // Konvertiere undefined zu null
        gameStore.initialStartingPlayer
      );
      
      jassStore.startGame(gamePlayers, initialStartingPlayer); // Pass GamePlayers und Startspieler
      
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
  }, [canStartNewGame, swipePosition, closeResultatKreidetafel]);

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
  const { overlayScale } = useDeviceScale();

  const springProps = useSpring({
    opacity: isOpen ? 1 : 0,
    transform: `scale(${isOpen ? overlayScale : 0.95}) rotate(${isFlipped ? '180deg' : '0deg'})`,
    config: { mass: 1, tension: 300, friction: 20 },
    onRest: () => {
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
    // Diese Variablen außerhalb von try/finally deklarieren, 
    // damit sie in beiden Blöcken sichtbar sind
    let localStatistikContainer: HTMLElement | null = null;
    let localButtonContainer: HTMLElement | null = null;
    const localOriginalStyles = {
      maxHeight: '',
      overflowY: '',
      buttonDisplay: ''
    };
    const localOriginalState = useUIStore.getState().resultatKreidetafel;

    try {
      console.log("🔄 Screenshot-Prozess gestartet");
      
      // 2. Komponente vollständig auf "bottom" setzen
      useUIStore.setState(state => ({
        resultatKreidetafel: {
          ...state.resultatKreidetafel,
          swipePosition: 'bottom',
          isFlipped: false
        }
      }));

      // 3. Warten auf vollständiges Re-render
      console.log("⏳ Warte auf Re-render");
      await new Promise(resolve => setTimeout(resolve, 500));

      // 4. Screenshot-Logik - präzise Auswahlkriterien
      const animatedDiv = document.querySelector('animated.div');
      const kreidetafelContent = document.querySelector('.relative.w-11\\/12.max-w-md'); // Hauptcontainer
      console.log("🔍 Suche nach Kreidetafel-Element:", kreidetafelContent);
      
      if (!kreidetafelContent || !(kreidetafelContent instanceof HTMLElement)) {
        throw new Error('Kreidetafel-Element nicht gefunden');
      }
      
      console.log("✅ Element für Screenshot gefunden:", kreidetafelContent);

      // 5. Alle relevanten Container identifizieren
      localStatistikContainer = document.querySelector('.statistik-container') as HTMLElement | null;
      localButtonContainer = document.querySelector('.grid.gap-4.mt-4') as HTMLElement | null;
      
      if (localStatistikContainer && localButtonContainer) {
        // Speichern der originalen Stile
        localOriginalStyles.maxHeight = localStatistikContainer.style.maxHeight;
        localOriginalStyles.overflowY = localStatistikContainer.style.overflowY;
        localOriginalStyles.buttonDisplay = localButtonContainer.style.display;
        
        // Styles für optimalen Screenshot anpassen
        localStatistikContainer.style.maxHeight = 'none'; // Alles anzeigen
        localStatistikContainer.style.overflowY = 'visible'; // Kein Scrolling
        localButtonContainer.style.display = 'none'; // Buttons ausblenden
        console.log("✅ Container-Styles angepasst für vollständigen Screenshot");
      } else {
        console.warn("⚠️ Nicht alle Container gefunden, fahre mit Fallback-Logik fort");
      }

      console.log("📸 Erstelle Screenshot mit html2canvas");
      const canvas = await html2canvas(kreidetafelContent, {
        background: '#1F2937',
        useCORS: true,
        logging: true,
        width: kreidetafelContent.scrollWidth,
        height: kreidetafelContent.scrollHeight,
        scale: 2
      } as ScreenshotOptions);

      console.log("✅ Canvas erstellt:", { 
        width: canvas.width, 
        height: canvas.height 
      });

      // 7. Blob erstellen
      const blob = await new Promise<Blob>((resolve, reject) => {
        try {
          canvas.toBlob((b) => {
            if (b) {
              console.log("✅ Blob erstellt:", { 
                size: b.size, 
                type: b.type 
              });
              resolve(b);
            } else {
              reject(new Error("Blob ist null"));
            }
          }, 'image/png', 1.0);
        } catch (error) {
          console.error("❌ Fehler bei toBlob():", error);
          reject(error);
        }
      });

      // 8. File erstellen
      const file = new File([blob], 'jass-resultat.png', { type: 'image/png' });
      console.log("✅ File erstellt:", { 
        name: file.name, 
        size: file.size, 
        type: file.type 
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
        
        const shareData = { 
          files: [file],
          text: fullShareText
        };
        
        // WICHTIG: Überprüfen ob das Teilen von Files unterstützt wird
        if (navigator.canShare && navigator.canShare(shareData)) {
          console.log("🔄 Teile mit Files:", shareData);
          await navigator.share(shareData);
          console.log("✅ Teilen mit Files erfolgreich!");
        } else {
          console.warn("⚠️ Teilen von Files wird nicht unterstützt - versuche Fallback mit nur Text");
          // Fallback: Nur Text teilen
          await navigator.share({ text: fullShareText });
          console.log("✅ Teilen nur mit Text erfolgreich!");
        }
      } else {
        console.error("❌ navigator.share wird nicht unterstützt");
      }
    } finally {
      // 10. Ursprüngliche Styles wiederherstellen
      if (localStatistikContainer && localButtonContainer) {
        localStatistikContainer.style.maxHeight = localOriginalStyles.maxHeight || '';
        localStatistikContainer.style.overflowY = localOriginalStyles.overflowY || '';
        localButtonContainer.style.display = localOriginalStyles.buttonDisplay || '';
        console.log("✅ Container-Styles wiederhergestellt");
      }

      // 11. Ursprünglichen Zustand wiederherstellen
      useUIStore.setState(state => ({
        resultatKreidetafel: {
          ...state.resultatKreidetafel,
          ...localOriginalState
        }
      }));
      console.log("✅ UI-Zustand wiederhergestellt");
    }

    closeResultatKreidetafel();
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

    // Wichtig: Hier wird die JassFinishNotification mit dem Share-Handler geöffnet
    useUIStore.setState({
      jassFinishNotification: {
        isOpen: true,
        mode: 'share',
        message: spruch,
        onShare: async () => {
          timerStore.finalizeJassEnd();  // Wichtig: Timer wird erst hier finalisiert
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

    // Einfache Nachricht statt komplexem Spruch
    useUIStore.setState({
      jassFinishNotification: {
        isOpen: true,
        mode: 'continue',
        message: { 
          text: "Bist du sicher, dass du ein neues Spiel beginnen möchtest? Die Daten des aktuellen Spiels werden gespeichert.", 
          icon: '✅' 
        },
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
    <div 
      className={`fixed inset-0 flex items-center justify-center z-50 ${isOpen ? '' : 'pointer-events-none'}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          closeResultatKreidetafel();
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <animated.div 
        style={springProps}
        className="relative w-11/12 max-w-md bg-gray-800 bg-opacity-95 rounded-xl p-6 shadow-lg select-none"
        onClick={(e) => e.stopPropagation()}
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

        {/* Neuer Back-Button oben links, nur wenn canNavigateBack UND NICHT im Navigations-Modus */}
        {canNavigateBack && !canNavigateForward && (
          <button 
            onClick={handleBack}
            className={`
              absolute left-2 top-2
              w-10 h-10 rounded-full 
              flex items-center justify-center
              bg-gray-600 hover:bg-gray-500
              text-white hover:text-white
              transition-all duration-150
              shadow-md hover:shadow-lg
            `}
            aria-label="Zurück"
          >
            <FiSkipBack className="w-5 h-5" />
          </button>
        )}

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

        {/* Button Container (jetzt Teil des Hauptcontainers, nicht in einem separaten div) */}
        <div className={`
          grid gap-4 mt-4 
          ${canNavigateForward && canNavigateBack
            ? 'grid-cols-3' // Navigation Mode: 3 Spalten
            : 'grid-cols-2 justify-between' // Normal: 2 Spalten, volle Breite
          }
        `}>
          {/* Navigation Mode Buttons */}
          {canNavigateBack && canNavigateForward && (
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

          {/* Immer sichtbare Buttons */}
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

      {/* JassFinishNotification einbinden */}
      <JassFinishNotification />
    </div>
  );
};

export default ResultatKreidetafel;