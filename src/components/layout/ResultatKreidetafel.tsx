import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { useUIStore, UIStore } from '@/store/uiStore';
import { useGameStore } from '@/store/gameStore';
import { FiX, FiRotateCcw, FiSkipBack, FiLoader } from 'react-icons/fi';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';

// --- Werte aus @/types/jass ---
import {
  determineNextStartingPlayer,
  getTeamForPlayer,
  isJassRoundEntry // Funktion als Wert importieren
} from '@/types/jass';

// --- Typen aus @/types/jass ---
import type { 
  GameStore, 
  TeamPosition, 
  StricheRecord,
  JassStore,
  PlayerNumber, 
  GameEntry,
  PlayerNames,
  TeamScores,
  CompletedGameSummary,
  RoundEntry,
  StrokeSettings,
  JassColor,
  TeamConfig, // TeamConfig importieren
  SessionTeams, // NEU: Import für SessionTeams
  SessionTeamPlayer // NEU: Import für SessionTeamPlayer
} from '@/types/jass';

// --- Import für generatePairingId ---
import { generatePairingId } from '@/utils/jassUtils';

// --- Wert aus @/utils/stricheCalculations ---
import { getNormalStricheCount } from '@/utils/stricheCalculations'; 

// --- Andere Imports ---
import { STATISTIC_MODULES } from '@/statistics/registry';
import { StricheStatistik } from '@/statistics/StricheStatistik';
import { JasspunkteStatistik } from '@/statistics/JasspunkteStatistik';
import { useJassStore } from '@/store/jassStore';
import { useSpring, animated } from 'react-spring';
import html2canvas from 'html2canvas';
import { useTimerStore, TimerAnalytics } from '@/store/timerStore';
import { usePressableButton } from '@/hooks/usePressableButton';
import JassFinishNotification from '../notifications/JassFinishNotification';
import { useTutorialStore } from '@/store/tutorialStore';
import { TUTORIAL_STEPS } from '@/types/tutorial';
import { getJassSpruch } from '@/utils/jasssprueche';
import { calculateTeamStats } from '@/utils/teamCalculations';
import { useDeviceScale } from '@/hooks/useDeviceScale';
import { useSwipeable } from 'react-swipeable';
import { useGroupStore } from '@/store/groupStore';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings';
import { DEFAULT_FARBE_SETTINGS } from '@/config/FarbeSettings';

// --- Werte aus firebase/firestore ---
import { getFirestore, doc, updateDoc, increment, serverTimestamp, Timestamp, collection, query, orderBy, onSnapshot, Unsubscribe, writeBatch, runTransaction, getDoc } from 'firebase/firestore';

// --- Firebase Init & Services ---
import { firebaseApp } from "@/services/firebaseInit";
import { 
  updateGameStatus, 
  saveCompletedGameToFirestore, 
  createNewActiveGame, // NEU
  updateSessionActiveGameId // WIEDER HINZUGEFÜGT
} from "@/services/gameService"; 
import { completeAndRecordTournamentPasse } from "@/services/tournamentService"; // NEU: Importieren
// NEU: Import für Firebase Functions
import { getFunctions, httpsCallable } from "firebase/functions"; // HttpsError entfernt

// --- Auth Store & Typen ---
import { useAuthStore } from '@/store/authStore';
import type { AuthUser } from '@/types/auth'; // AuthUser als Typ
import FullscreenLoader from "@/components/ui/FullscreenLoader"; // KORREKTER IMPORT HIER

// --- NEU: Interface für Callable Function Daten (wie in der Function definiert) ---
interface InitialSessionDataClient {
  participantUids: string[];
  playerNames: PlayerNames;
  // GEÄNDERT: teams ist jetzt vom Typ SessionTeams oder null, nicht mehr TeamConfig
  teams?: SessionTeams | null;
  // NEU: Paarungs-IDs hinzufügen
  pairingIdentifiers?: {
    teamA: string;
    teamB: string;
  } | null;
  gruppeId: string | null;
  // NEU: startedAt hinzufügen
  startedAt?: number | Timestamp;
}

interface FinalizeSessionDataClient {
  sessionId: string;
  expectedGameNumber: number;
  initialSessionData?: InitialSessionDataClient; // Optionales Feld hinzugefügt
}
// --- ENDE NEU ---

// --- Andere Komponenten & Router ---
import { useRouter } from 'next/router';
import { Button } from '@/components/ui/button';

// --- NEU: Interface für Viewer-Daten --- 
interface ResultatKreidetafelViewerData {
  games: GameEntry[];           // Komplette Spielhistorie
  playerNames: PlayerNames;     // Spielernamen
  currentScores: TeamScores;    // Aktueller Punktestand des angezeigten Spiels
  currentStriche: {             // Aktuelle Striche des angezeigten Spiels
    top: StricheRecord;
    bottom: StricheRecord;
  };
  weisPoints: TeamScores;       // Aktuelle Weispunkte
  // Ggf. weitere benötigte Daten, z.B. für canStartNewGame?
  canStartNewGameLogic?: boolean; // Einfacher Flag statt komplexer Berechnung
}

// --- NEU: Props für die Komponente --- 
interface ResultatKreidetafelProps {
  isReadOnly?: boolean;                 // Für den Zuschauermodus
  viewerData?: ResultatKreidetafelViewerData; // Optionale Daten für Viewer
  gameTypeLabel?: string; // NEU: Optionales Label
}

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

// Importiere die neue Hilfsfunktion
import { debouncedRouterPush } from '../../utils/routerUtils';

/**
 * Bereitet die SessionTeams und pairingIdentifiers für den finalizeSessionSummary-Aufruf vor.
 * 
 * @param participantUids Array mit User-IDs der Teilnehmer (Auth-UIDs)
 * @param playerNames Objekt mit Spielernamen (Position -> Name)
 * @returns Objekt mit teams und pairingIdentifiers
 */
const prepareSessionTeamsData = (participantUids: string[], playerNames: PlayerNames) => {
  // Mindestens 4 Spieler nötig - füllen wir Lücken mit Platzhaltern
  const uids = [...participantUids];
  while (uids.length < 4) {
    uids.push(`placeholder_${uids.length + 1}`);
  }
  
  // Team-Zuordnung: Standard-Konvention in der App
  // Spieler 1+3 = Team A/Bottom, Spieler 2+4 = Team B/Top
  const teamAPlayers: SessionTeamPlayer[] = [
    { playerId: uids[0], displayName: playerNames[1] || 'Spieler 1' },
    { playerId: uids[2], displayName: playerNames[3] || 'Spieler 3' }
  ];
  
  const teamBPlayers: SessionTeamPlayer[] = [
    { playerId: uids[1], displayName: playerNames[2] || 'Spieler 2' },
    { playerId: uids[3], displayName: playerNames[4] || 'Spieler 4' }
  ];
  
  const sessionTeams: SessionTeams = {
    teamA: { players: teamAPlayers },
    teamB: { players: teamBPlayers }
  };
  
  // Paarungs-IDs erzeugen (kanonische IDs unabhängig von Reihenfolge)
  const pairingIdentifiers = {
    teamA: generatePairingId(uids[0], uids[2]),
    teamB: generatePairingId(uids[1], uids[3])
  };
  
  return { 
    teams: sessionTeams, 
    pairingIdentifiers 
  };
};

const ResultatKreidetafel = ({ 
  isReadOnly = false, 
  viewerData,
  gameTypeLabel // NEU
}: ResultatKreidetafelProps): React.ReactElement | null => {
  // 1. Basis Store-Zugriffe & Zustände
  const isOpen = useUIStore(state => state.resultatKreidetafel.isOpen);
  const swipePosition = useUIStore(state => state.resultatKreidetafel.swipePosition);
  const isFlipped = swipePosition === 'top';
  const currentStatisticId = useUIStore((state: UIStore) => state.resultatKreidetafel.currentStatistic);
  const closeResultatKreidetafel = useCallback(() => {
    useUIStore.setState(state => ({
      resultatKreidetafel: {
        ...state.resultatKreidetafel,
        isOpen: false
      },
      jassFinishNotification: {
        isOpen: false,
        mode: 'share',
        message: { text: '', icon: '♥️' }, 
        onShare: undefined,
        onBack: undefined,
        onContinue: undefined
      },
      signingState: 'idle',
      team1Signed: false, 
      team2Signed: false  
    }));
  }, []);
  const { signingState, team1Signed, team2Signed } = useUIStore(); 
  const { isActive: isTutorialActive, getCurrentStep } = useTutorialStore();
  const currentStep = getCurrentStep();
  const { user, status: authStatus, isAuthenticated } = useAuthStore();
  const router = useRouter();

  // --- State für Ladezustände und UI-Logik (hier einfügen) ---
  const [isScreenshotting, setIsScreenshotting] = useState(false); // Wiederherstellen/Sicherstellen
  const [showBackButton, setShowBackButton] = useState(false); // Wiederherstellen/Sicherstellen
  const [showNextButton, setShowNextButton] = useState(false); // Wiederherstellen/Sicherstellen
  const [isCompletingPasse, setIsCompletingPasse] = useState(false); // Wiederherstellen der Deklaration
  const [isFinalizingSession, setIsFinalizingSession] = useState(false); // Hinzufügen/Korrigieren
  const [showConfetti, setShowConfetti] = useState(false); // HINZUGEFÜGT

  // NEU: Turnierkontext-Erkennung
  const { currentSession } = useJassStore();
  const gameStoreActiveGameId = useGameStore((state) => state.activeGameId);
  const isTournamentPasse = useMemo(() => {
    return !!(currentSession?.isTournamentSession && currentSession?.tournamentInstanceId && gameStoreActiveGameId);
  }, [currentSession, gameStoreActiveGameId]);
  const tournamentInstanceId = useMemo(() => {
    return currentSession?.isTournamentSession ? currentSession?.tournamentInstanceId : undefined;
  }, [currentSession]);

  // 2. Gruppen & Settings
  const { currentGroup } = useGroupStore();
  const uiStoreStrokeSettings = useUIStore((state) => state.strokeSettings);
  const activeStrokeSettings = currentGroup?.strokeSettings ?? uiStoreStrokeSettings ?? DEFAULT_STROKE_SETTINGS;
  const activeScoreSettings = currentGroup?.scoreSettings ?? useUIStore.getState().scoreSettings;
  const activeFarbeSettings = currentGroup?.farbeSettings ?? DEFAULT_FARBE_SETTINGS;
  const cardStyle = activeFarbeSettings.cardStyle; // cardStyle extrahieren

  // 3. JassStore Zugriffe (Session, Navigation, Spiele)
  const jassStoreSetState = useJassStore.setState;
  const currentSessionId = useJassStore(state => state.currentSession?.id);
  const localGames = useJassStore(state => state.games);
  const onlineCompletedGames = useJassStore(state => state.onlineCompletedGames);
  const canNavigateBack = useJassStore(state => state.canNavigateBack());
  const canNavigateForward = useJassStore(state => state.canNavigateForward());
  const currentGameId = useJassStore(state => state.currentGameId);
  const teams = useJassStore(state => state.teams);

  // 4. GameStore Zugriffe (Aktives Spiel)
  const activeGameId = useGameStore((state) => state.activeGameId);
  const isOnlineMode = !!activeGameId;
  const playerNames = viewerData?.playerNames ?? useGameStore(state => state.playerNames);
  const currentScores = viewerData?.currentScores ?? useGameStore(state => state.scores);
  const topScore = currentScores?.top ?? 0;
  const bottomScore = currentScores?.bottom ?? 0;
  const weisPoints = viewerData?.weisPoints ?? useGameStore(state => state.weisPoints);
  const storeStriche = viewerData?.currentStriche ?? useGameStore(state => state.striche);

  // NEU: Helper-Funktion zur Identifikation echter Online-Sessions
  const isRealOnlineSession = useMemo(() => {
    const authStore = useAuthStore.getState();
    const gameStore = useGameStore.getState();
    const jassStore = useJassStore.getState();
    
    return authStore.isAuthenticated() && // Benutzer ist eingeloggt
           !!gameStore.activeGameId && // Es gibt eine aktive Game ID
           !!jassStore.currentSession?.id && // Es gibt eine Session ID
           !authStore.isGuest; // Benutzer ist kein Gast
  }, []);

  // 5. Abgeleitete Werte & Zustände
  const gamesToDisplay = isOnlineMode ? onlineCompletedGames : localGames; 
  const currentDate = format(new Date(), 'd.M.yyyy');
  const nextGameButtonText = canNavigateForward ? "1 Spiel\nvorwärts" : "Neues\nSpiel";
  const [touchStart, setTouchStart] = React.useState<number | null>(null);
  const [touchEnd, setTouchEnd] = React.useState<number | null>(null);
  const [swipeDirection, setSwipeDirection] = React.useState<'left' | 'right' | null>(null);

  // --- LOGGING START ---
  // const onlineCompletedGamesForLog = useJassStore.getState().onlineCompletedGames;
  // const localGamesForLog = useJassStore.getState().games;
  // console.log(`[ResultatKreidetafel RENDER] isOnlineMode=${isOnlineMode}. onlineCompletedGames count: ${onlineCompletedGamesForLog?.length ?? 'N/A'}. localGames count: ${localGamesForLog?.length ?? 'N/A'}`);
  // --- LOGGING END ---

  // 6. Memoized Berechnungen (hängen von Stores ab)
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

  // Diese Ref verfolgt, von welcher Quelle (Firebase oder lokal) der letzte Score-Update kam
  const lastScoreUpdateSourceRef = useRef<'firebase' | 'local'>('local');

  // Wenn ein Online-Modus aktiv ist und wir Punkte von Firebase erhalten, markieren wir die Quelle
  useEffect(() => {
    if (isOnlineMode && activeGameId) {
      // Nur wenn sich der Score ändert, gehen wir von einer Firebase-Aktualisierung aus
      lastScoreUpdateSourceRef.current = 'firebase';
      
      // Nach Firebase-Update einen Timer setzen, der lokale Weis zurücksetzt
      // Dies verhindert Doppelzählung, wenn die Firestore-Daten bereits Weis enthalten
      const resetTimer = setTimeout(() => {
        if (lastScoreUpdateSourceRef.current === 'firebase' && !isReadOnly) {
          // Setze Weis auf 0, ABER NUR wenn wir nicht im Read-Only Modus sind
          useGameStore.setState(state => ({
            ...state,
            weisPoints: { top: 0, bottom: 0 },
            currentRoundWeis: []
          }));
        }
      }, 100); // Kurzer Timeout von 100ms
      
      return () => clearTimeout(resetTimer);
    }
  }, [isOnlineMode, activeGameId, topScore, bottomScore, isReadOnly]); // isReadOnly als Abhängigkeit hinzugefügt

  const canStartNewGame = useMemo(() => {
    if (isReadOnly) return viewerData?.canStartNewGameLogic ?? false;
    return storeStriche.top.sieg > 0 || storeStriche.bottom.sieg > 0;
  }, [storeStriche, isReadOnly, viewerData]);

  const currentTotals = useMemo(() => {
    // Zugriff auf die aktuellen weisPoints aus dem GameStore für die Berechnung
    const currentWeisPoints = viewerData?.weisPoints ?? useGameStore.getState().weisPoints;
    const {scoreSettings} = useUIStore.getState(); // OK, getState ist synchron
    
    // Funktion zur Berechnung des Strich-Werts eines Spiels
    const calculateStricheValue = (striche: StricheRecord, strokeSettings: typeof DEFAULT_STROKE_SETTINGS, scoreSettingsEnabled: { berg: boolean, schneider: boolean }): number => {
      let totalValue = 0;
      // Addiere nur die Striche, die auch aktiviert sind und zählen
      if (scoreSettingsEnabled.berg) {
        totalValue += striche.berg; // Wert für Berg (normalerweise 1)
      }
      // Sieg direkt addieren
      totalValue += striche.sieg;
      
      // KORREKTUR: Schneider-Striche NICHT nochmal multiplizieren, da der Wert bereits korrekt gesetzt wurde
      if (scoreSettingsEnabled.schneider) {
        totalValue += striche.schneider; // Schneider-Wert direkt übernehmen
      }
      
      // Matsch zählt einfach
      totalValue += striche.matsch;
      // Kontermatsch-Wert DIREKT übernehmen, da er bereits multipliziert ist
      // UND NICHT MEHR mit strokeSettings.kontermatsch multiplizieren
      totalValue += striche.kontermatsch; // KORREKTUR: Wert direkt übernehmen
      return totalValue;
    };

    // Summe der Strich-Werte aller *vorherigen* Spiele
    const baseTotals = gamesToDisplay // Verwende gamesToDisplay
      .filter(game => {
         // Filter logic needs to handle both types correctly
         const gameId = 'gameNumber' in game ? game.gameNumber : ('id' in game ? game.id : 0);
         // Ensure comparison works for numbers and potential string IDs (less likely here but safer)
         return (typeof gameId === 'number' ? gameId : 0) < currentGameId; 
      })
      .reduce((totals, game) => {
         // Initialize with defaults
         let topStriche: StricheRecord = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
         let bottomStriche: StricheRecord = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
         let topTotal: number = 0;
         let bottomTotal: number = 0;

         // Verbesserter Type Guard: Prüft spezifisch auf die erwarteten Strukturen
         if ('teams' in game && game.teams && 
             'top' in game.teams && 'bottom' in game.teams && 
             'striche' in game.teams.top && 'striche' in game.teams.bottom) {
            // Jetzt können wir sicher auf die Eigenschaften zugreifen
            topStriche = game.teams.top.striche;
            bottomStriche = game.teams.bottom.striche;
            // Verwende optional chaining für `total` mit Fallback auf 0
            topTotal = game.teams.top.total ?? 0;
            bottomTotal = game.teams.bottom.total ?? 0;
         } else if ('finalStriche' in game && 'finalScores' in game) { // CompletedGameSummary
            topStriche = game.finalStriche.top;
            bottomStriche = game.finalStriche.bottom;
            topTotal = game.finalScores.top ?? 0; // Add fallback
            bottomTotal = game.finalScores.bottom ?? 0; // Add fallback
         }

         // Berechne Strich-Werte für dieses Spiel (using the extracted values)
         const gameStricheValueTop = calculateStricheValue(topStriche, activeStrokeSettings, activeScoreSettings.enabled);
         const gameStricheValueBottom = calculateStricheValue(bottomStriche, activeStrokeSettings, activeScoreSettings.enabled);
         
         // Addiere zu den Gesamtsummen (Types should now be guaranteed numbers)
         return {
           striche: {
             top: (totals.striche.top || 0) + (gameStricheValueTop || 0),
             bottom: (totals.striche.bottom || 0) + (gameStricheValueBottom || 0)
           },
           punkte: { 
             top: (totals.punkte.top || 0) + (topTotal || 0), 
             bottom: (totals.punkte.bottom || 0) + (bottomTotal || 0) 
           }
         };
      }, { striche: { top: 0, bottom: 0 }, punkte: { top: 0, bottom: 0 } });

    // Strich-Wert des *aktuellen* Spiels
    const currentTopStricheValue = calculateStricheValue(uiStriche.top, activeStrokeSettings, activeScoreSettings.enabled);
    const currentBottomStricheValue = calculateStricheValue(uiStriche.bottom, activeStrokeSettings, activeScoreSettings.enabled);

    // Endgültiges Total = Summe vorheriger Spiele + aktuelles Spiel (inkl. aktueller Weis)
    return {
      striche: {
        top: baseTotals.striche.top + currentTopStricheValue,
        bottom: baseTotals.striche.bottom + currentBottomStricheValue
      },
      // KORREKTUR: Addiere die aktuellen weisPoints zum topScore/bottomScore des aktuellen Spiels
      punkte: {
        top: baseTotals.punkte.top + topScore + (currentWeisPoints?.top ?? 0),
        bottom: baseTotals.punkte.bottom + bottomScore + (currentWeisPoints?.bottom ?? 0)
      }
    };
    // Füge currentWeisPoints zu den Abhängigkeiten hinzu
  }, [currentGameId, uiStriche, topScore, bottomScore, gamesToDisplay, activeStrokeSettings, activeScoreSettings, weisPoints]);

  const timerAnalytics = useMemo(() => {
    if (isReadOnly) return { totalJassTime: 0, currentGameDuration: 0 }; 
    const timerStore = useTimerStore.getState();
    return timerStore.getAnalytics();
  }, [gamesToDisplay.length, isReadOnly]);

  const teamStats = useMemo(() => calculateTeamStats({
    playerNames: Object.values(playerNames).filter(Boolean),
    currentStatistic: currentStatisticId === 'jasspunkte' ? 'punkte' : currentStatisticId,
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
      totalGames: gamesToDisplay.length
    },
    currentStriche: {
      team1: {
        ...storeStriche.top,
        sieg: storeStriche.top.sieg
      },
      team2: {
        ...storeStriche.bottom,
        sieg: storeStriche.bottom.sieg
      }
    }
  }), [currentTotals, currentGameId, gamesToDisplay.length, playerNames, currentStatisticId, uiStriche, storeStriche, activeScoreSettings]);

  // 7. Callbacks (hängen von Stores und abgeleiteten Werten ab)
  const handleBack = useCallback(() => {
    const jassStore = useJassStore.getState();
    const gameStore = useGameStore.getState();
    
    if (jassStore.canNavigateBack()) {
      // 2. Zum vorherigen Spiel navigieren
      jassStore.navigateToPreviousGame();
      
      // 3. GameStore VOLLSTÄNDIG mit historischen Daten aktualisieren
      const previousGame = jassStore.getCurrentGame();
      if (previousGame) {
        // Erst alles zurücksetzen MIT dem Starter des vorherigen Spiels
        gameStore.resetGame(previousGame.initialStartingPlayer);
        
        // Dann VOLLSTÄNDIGEN Spielzustand wiederherstellen
        useGameStore.setState(state => ({
          ...state,
          isGameStarted: true,
          currentRound: previousGame.currentRound || 1,
          currentPlayer: previousGame.currentPlayer,
          startingPlayer: previousGame.startingPlayer,
          initialStartingPlayer: previousGame.initialStartingPlayer,
          
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

  // Neue Share-Funktion
  const handleShareAndComplete = useCallback(async () => {
    // Variablen für Styles und Zustand
    let localStatistikContainer: HTMLElement | null = null;
    let localActionArea: HTMLElement | null = null;
    let localRoundHistoryContainers: HTMLElement[] = []; 
    const localOriginalStyles = { maxHeight: '', overflowY: '', buttonDisplay: '' };
    const localOriginalState = useUIStore.getState().resultatKreidetafel;

    try {
      console.log("🔄 Screenshot-Prozess gestartet");
      useUIStore.setState(state => ({ resultatKreidetafel: { ...state.resultatKreidetafel, swipePosition: 'bottom', isFlipped: false } }));
      await new Promise(resolve => setTimeout(resolve, 1000)); 

      // Screenshot-Element finden
      const kreidetafelContent = document.querySelector('.relative.w-11\\/12.max-w-md') as HTMLElement | null;
      if (!kreidetafelContent) throw new Error('Kreidetafel-Element nicht gefunden');

      // Container für Styles identifizieren
      localStatistikContainer = kreidetafelContent.querySelector('.statistik-container') as HTMLElement | null;
      localActionArea = kreidetafelContent.querySelector('#resultat-action-area') as HTMLElement | null; // Suche innerhalb des Haupt-Elements
      if (localStatistikContainer) {
        localRoundHistoryContainers = Array.from(localStatistikContainer.querySelectorAll('.space-y-0.px-1')) as HTMLElement[];
      }

      // Styles für Screenshot anpassen
      if (localStatistikContainer && localActionArea) {
        localOriginalStyles.maxHeight = localStatistikContainer.style.maxHeight;
        localOriginalStyles.overflowY = localStatistikContainer.style.overflowY;
        localOriginalStyles.buttonDisplay = localActionArea.style.display;
        
        localStatistikContainer.style.maxHeight = 'none'; 
        localStatistikContainer.style.overflowY = 'visible'; 
        localActionArea.style.display = 'none'; // Action Area ausblenden
        localRoundHistoryContainers.forEach(container => {
 container.style.maxHeight = 'none'; container.style.overflowY = 'visible';
});
        await new Promise(resolve => setTimeout(resolve, 250));
      } else {
        console.warn("⚠️ Statistik-Container oder Action-Area nicht gefunden, Styles nicht angepasst.");
      }

      // Screenshot erstellen
      const canvas = await html2canvas(kreidetafelContent, {
        background: '#1F2937', // Dunkelgrau Hintergrund
        useCORS: true,
        logging: false, // Logging ggf. deaktivieren
        width: kreidetafelContent.offsetWidth,
        height: kreidetafelContent.offsetHeight,
        scale: 2, // Höhere Auflösung
      } as ScreenshotOptions);

      // Blob erstellen
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error("Fehler beim Erstellen des Bild-Blobs.");

      // File erstellen
      const file = new File([blob], 'jass-resultat.png', { type: 'image/png' });

      // Share API verwenden
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        const notification = useUIStore.getState().jassFinishNotification;
        const shareText = notification?.message 
          ? typeof notification.message === 'string' ? notification.message : notification.message.text
          : 'Jass Resultat';
        const fullShareText = `${shareText}\n\nGeneriert von:\n👉 https://jassguru.ch`; 
        
        await navigator.share({ files: [file], text: fullShareText });
        console.log("✅ Teilen mit Bild erfolgreich!");
      } else {
        console.warn("⚠️ Teilen von Dateien nicht unterstützt oder fehlgeschlagen. Teilen nur mit Text.");
        const notification = useUIStore.getState().jassFinishNotification;
        const shareText = notification?.message 
          ? typeof notification.message === 'string' ? notification.message : notification.message.text
          : 'Jass Resultat';
        const fullShareText = `${shareText}\n\nGeneriert von:\n👉 https://jassguru.ch`;
        if (navigator.share) {
            await navigator.share({ text: fullShareText });
            console.log("✅ Teilen nur mit Text erfolgreich!");
        } else {
            console.error("❌ navigator.share wird nicht unterstützt.");
            throw new Error("Teilen nicht unterstützt.");
        }
      }

    } catch (error) {
       console.error("❌ Schwerwiegender Fehler im Screenshot-Prozess:", error);
       useUIStore.getState().showNotification({
         type: 'error',
         message: 'Fehler beim Erstellen des Screenshots. Teilen nicht möglich.',
       });
    } finally {
      // Styles wiederherstellen
      if (localStatistikContainer && localActionArea) {
        localStatistikContainer.style.maxHeight = localOriginalStyles.maxHeight || '';
        localStatistikContainer.style.overflowY = localOriginalStyles.overflowY || '';
        localActionArea.style.display = localOriginalStyles.buttonDisplay || ''; // Action Area wiederherstellen
        localRoundHistoryContainers.forEach(container => {
 container.style.maxHeight = ''; container.style.overflowY = '';
});
      }

      // UI-Zustand wiederherstellen
      useUIStore.setState(state => ({ resultatKreidetafel: { ...state.resultatKreidetafel, ...localOriginalState } }));
      console.log("✅ UI-Zustand und Styles wiederhergestellt");
    }

    // Das Schließen wird jetzt vom aufrufenden Callback (finalizeAndReset...) übernommen
    // closeResultatKreidetafel(); 
  }, [closeResultatKreidetafel]); // Abhängigkeit bleibt für alle Fälle?

  const handleStatisticChange = React.useCallback((direction: 'left' | 'right') => {
    const currentIndex = STATISTIC_MODULES.findIndex(mod => mod.id === currentStatisticId);
    const nextIndex = direction === 'right' 
      ? (currentIndex + 1) % STATISTIC_MODULES.length
      : (currentIndex - 1 + STATISTIC_MODULES.length) % STATISTIC_MODULES.length;
    useUIStore.setState(state => ({
      resultatKreidetafel: {
        ...state.resultatKreidetafel,
        currentStatistic: STATISTIC_MODULES[nextIndex].id
      }
    }));
  }, [currentStatisticId]);

  // Swipe-Handler mit useSwipeable konfigurieren
  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => handleStatisticChange('right'), // Nach links wischen -> Nächste Statistik (rechts)
    onSwipedRight: () => handleStatisticChange('left'), // Nach rechts wischen -> Vorherige Statistik (links)
    preventScrollOnSwipe: true, // Verhindert Scrollen während des Swipens
    trackMouse: true // Ermöglicht auch Maus-Swipes
  });

  const handleBeendenClick = useCallback(async () => {
    const uiStore = useUIStore.getState();
    const timerStore = useTimerStore.getState();
    const gameStore = useGameStore.getState();
    const authStore = useAuthStore.getState();
    const jassStore = useJassStore.getState();

    // ReadOnly-Modus prüfen
    if (uiStore.isReadOnlyMode) {
      uiStore.showNotification({
        type: 'info',
        message: 'Als Zuschauer können keine Partien beendet werden.',
        position: swipePosition ?? undefined // Konvertiere null zu undefined
      });
      return;
    }

    // Prüfen, ob bedankt wurde (unverändert)
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

    // --- NEUE LOGIK --- 
    const currentActiveGameId = gameStore.activeGameId; 
    const isUserAuthenticated = authStore.isAuthenticated();

    // Fall 1: Eingeloggter Benutzer im Online-Modus -> Signieren starten
    if (isUserAuthenticated && currentActiveGameId) {
        console.log("[ResultatKreidetafel] Beenden geklickt (Online-Modus). Starte Signaturprozess...");
        uiStore.startSigningProcess(); 
        return; 
    }

    // Fall 2: Gastmodus oder Offline -> Direkt Teilen/Abschliessen anzeigen
    console.log("[ResultatKreidetafel] Beenden geklickt (Gast/Offline-Modus). Zeige Teilen/Abschliessen...");
    const timerAnalytics = timerStore.getAnalytics();
    const jassDuration = timerStore.prepareJassEnd();
    const spruch = getJassSpruch({ /* ... (Parameter wie gehabt) ... */ 
      stricheDifference: Math.abs(currentTotals.striche.top - currentTotals.striche.bottom),
      pointDifference: Math.abs(currentTotals.punkte.top - currentTotals.punkte.bottom),
      isUnentschieden: currentStatisticId === 'striche' 
        ? currentTotals.striche.top === currentTotals.striche.bottom 
        : currentTotals.punkte.top === currentTotals.punkte.bottom,
      winnerNames: currentStatisticId === 'striche'
        ? currentTotals.striche.top > currentTotals.striche.bottom
          ? [playerNames[2], playerNames[4]].filter(Boolean)
          : [playerNames[1], playerNames[3]].filter(Boolean)
        : currentTotals.punkte.top > currentTotals.punkte.bottom
          ? [playerNames[2], playerNames[4]].filter(Boolean)
          : [playerNames[1], playerNames[3]].filter(Boolean),
      loserNames: currentStatisticId === 'striche'
        ? currentTotals.striche.top > currentTotals.striche.bottom
          ? [playerNames[1], playerNames[3]].filter(Boolean)
          : [playerNames[2], playerNames[4]].filter(Boolean)
        : currentTotals.punkte.top > currentTotals.punkte.bottom
          ? [playerNames[1], playerNames[3]].filter(Boolean)
          : [playerNames[2], playerNames[4]].filter(Boolean),
      isStricheMode: currentStatisticId === 'striche',
      type: 'jassEnd',
      timerAnalytics, 
      matchCount: {
        team1: uiStriche.top.matsch ?? 0,
        team2: uiStriche.bottom.matsch ?? 0
      },
      totalMatsche: (uiStriche.top.matsch ?? 0) + (uiStriche.bottom.matsch ?? 0),
      isSchneider: currentTotals.punkte.top < activeScoreSettings.values.schneider || 
                  currentTotals.punkte.bottom < activeScoreSettings.values.schneider,
      gameStats: teamStats.gameStats,
      gesamtStand: teamStats.gesamtStand,
      previousGesamtStand: teamStats.previousGesamtStand
    });

    // Logik zum Finalisieren und Resetten (wird von beiden Buttons verwendet)
    const finalizeAndResetLocal = async () => {
      console.log("[ResultatKreidetafel] Finalizing and resetting (Guest/Offline)");

      // --- KORRIGIERTE LOGIK: Nur für echte Online-Sessions Firebase aufrufen ---
      if (isRealOnlineSession) {
          const currentSessionIdLocal = jassStore.currentSession?.id;
          const totalGamesPlayedInSessionLocal = jassStore.games.length;
          const currentGameNumberLocal = totalGamesPlayedInSessionLocal;

          console.log(`[ResultatKreidetafel] Calling finalizeSession for REAL online session ${currentSessionIdLocal}, game ${currentGameNumberLocal} - JassStore.games.length: ${jassStore.games.length}, JassStore.currentGameId: ${jassStore.currentGameId}`);
          try {
              const functions = getFunctions(firebaseApp, "us-central1");
              const finalizeFunction = httpsCallable<FinalizeSessionDataClient, { success: boolean; message: string }>(functions, 'finalizeSession');
              
              const playerNamesLocal = gameStore.playerNames;
              const participantUidsLocal = jassStore.currentSession?.participantUids || [];
              const sessionTeamsData = prepareSessionTeamsData(participantUidsLocal, playerNamesLocal);
              
              const initialSessionData = {
                participantUids: participantUidsLocal,
                playerNames: playerNamesLocal,
                gruppeId: jassStore.currentSession?.gruppeId || null,
                startedAt: jassStore.currentSession?.startedAt,
                teams: sessionTeamsData.teams,
                pairingIdentifiers: sessionTeamsData.pairingIdentifiers
              };
              
              const result = await finalizeFunction({ 
                sessionId: currentSessionIdLocal, 
                expectedGameNumber: currentGameNumberLocal,
                initialSessionData: initialSessionData 
              }); 
              console.log("[ResultatKreidetafel] finalizeSession result (Real Online Session):", result.data);
          } catch (error) {
              console.error("[ResultatKreidetafel] Error calling finalizeSession (Real Online Session):", error);
              uiStore.showNotification({type: "error", message: "Fehler beim Finalisieren der Session-Statistik."});
          }
      } else {
           console.log(`[ResultatKreidetafel] Skipping finalizeSession call: Not a real online session. IsRealOnlineSession: ${isRealOnlineSession}`);
      }
      // --- ENDE: finalizeSessionSummary aufrufen ---

      // Bestehende Reset-Logik
      timerStore.finalizeJassEnd();
      jassStore.resetJass(); 
      gameStore.resetGame(1);
      uiStore.resetSigningProcess();
      uiStore.closeJassFinishNotification();
      closeResultatKreidetafel();
      
      // Weiterleitung für alle (Gäste zur Registrierung, eingeloggte Benutzer zur Startseite)
      const authStore = useAuthStore.getState();
      await debouncedRouterPush(router, authStore.isAuthenticated() ? '/start' : '/auth/register?origin=offline', undefined, true);
    };

    // Teilen-Dialog für Gäste/Offline
    uiStore.showJassFinishNotification({
      mode: 'share',
      message: spruch,
      onShare: async () => { 
        await handleShareAndComplete();
        await finalizeAndResetLocal(); // Aufruf der angepassten Funktion
      },
      onBack: finalizeAndResetLocal, // Aufruf der angepassten Funktion
      onBackLabel: "Nicht teilen"
    });
    
  }, [ /* ... alte Abhängigkeiten + authStore, jassStore ... */ 
    canStartNewGame,
    swipePosition,
    closeResultatKreidetafel,
    handleShareAndComplete, 
    currentTotals,
    currentStatisticId,
    playerNames,
    activeScoreSettings,
    teamStats,
    router,
    uiStriche,
    // authStore, // Entfernt, da über getState() zugegriffen wird
    // jassStore // Entfernt, da über getState() zugegriffen wird
  ]);

  // handleNextGameClick NACHDEM alle seine Abhängigkeiten definiert wurden
  const handleNextGameClick = useCallback(() => {
    const jassStore = useJassStore.getState();
    const gameStore = useGameStore.getState();
    const timerStore = useTimerStore.getState();
    const uiStore = useUIStore.getState();
    const db = getFirestore(firebaseApp);

    // ReadOnly-Modus prüfen
    if (uiStore.isReadOnlyMode) {
      uiStore.showNotification({
        type: 'info',
        message: 'Als Zuschauer können keine neuen Spiele gestartet werden.',
        position: swipePosition ?? undefined // Konvertiere null zu undefined
      });
      return;
    }

    const startNewGameSequence = async () => {
      // Hole aktive Game ID *bevor* weitere Aktionen
      const currentActiveGameId = gameStore.activeGameId;
      const currentSession = jassStore.currentSession;

      // --- NEU: Spielzusammenfassung speichern (nur im Online-Modus) ---
      if (currentActiveGameId && currentSession) {
        // Preparing to save summary for game ${jassStore.currentGameId} in session ${currentSession.id}
        const sessionId = currentSession.id;
        const gameNumber = jassStore.currentGameId;
        
        // Daten extrahieren (aus gameStore VOR dem Reset)
        const finalScores = { ...gameStore.scores };
        const finalStriche = { 
          top: { ...gameStore.striche.top }, 
          bottom: { ...gameStore.striche.bottom }
        };
        const finalWeisPoints = { ...gameStore.weisPoints };
        const finalRoundHistory = [...gameStore.roundHistory];
        const finalStartingPlayer = gameStore.startingPlayer;
        const finalInitialStartingPlayer = gameStore.initialStartingPlayer;
        const finalPlayerNames = { ...gameStore.playerNames };
        const durationMillis = timerStore.getGameDuration(gameNumber);
        const participantUids = currentSession.participantUids ?? [];
        const groupId = currentSession.gruppeId ?? null;

        // Trumpffarben extrahieren
        const trumpColorsPlayedSet = new Set<string>();

        // NEU: RoundHistory bereinigen (undefined -> null) und dabei Trumpffarben sammeln
        const filteredRoundHistory = finalRoundHistory.filter(entry => entry.isActive === undefined || entry.isActive === true);
        const cleanedRoundHistory = filteredRoundHistory.map(entry => {
          const cleanedEntry = { ...entry }; // Kopie erstellen
          if (isJassRoundEntry(cleanedEntry)) {
            if (cleanedEntry.farbe) {
              trumpColorsPlayedSet.add(cleanedEntry.farbe); // Trumpf hier sammeln
            }
            if (cleanedEntry.strichInfo === undefined) {
              delete cleanedEntry.strichInfo; // Optionales Feld entfernen statt null?
            }
          }
          // Weitere optionale Felder aus BaseRoundEntry prüfen und ggf. null setzen oder entfernen
          if (cleanedEntry.ansager === undefined) delete cleanedEntry.ansager;
          if (cleanedEntry.startTime === undefined) delete cleanedEntry.startTime;
          if (cleanedEntry.endTime === undefined) delete cleanedEntry.endTime;
          if (cleanedEntry.playerTurns === undefined) delete cleanedEntry.playerTurns;
          if (cleanedEntry.timerSnapshot === undefined) delete cleanedEntry.timerSnapshot;
          if (cleanedEntry.previousRoundId === undefined) delete cleanedEntry.previousRoundId;
          if (cleanedEntry.nextRoundId === undefined) delete cleanedEntry.nextRoundId;

          // Sicherstellen, dass verschachtelte Objekte keine undefined Werte haben (vereinfachte Prüfung)
          if (cleanedEntry.scores?.weisPoints === undefined) {
            if (cleanedEntry.scores) cleanedEntry.scores.weisPoints = {top: 0, bottom: 0}; // Default
          }
          // Korrigierte Defaults für visualStriche
          if (cleanedEntry.visualStriche?.top === undefined) {
            if (cleanedEntry.visualStriche) cleanedEntry.visualStriche.top = {stricheCounts: { 20: 0, 50: 0, 100: 0 }, restZahl: 0}; 
          }
          if (cleanedEntry.visualStriche?.bottom === undefined) {
            if (cleanedEntry.visualStriche) cleanedEntry.visualStriche.bottom = {stricheCounts: { 20: 0, 50: 0, 100: 0 }, restZahl: 0};
          }

          return cleanedEntry;
        });
        const trumpColorsPlayed = Array.from(trumpColorsPlayedSet) as string[]; // Expliziter Type Cast

        // Summary Objekt erstellen - verwende cleanedRoundHistory
        const summaryData: CompletedGameSummary = {
          gameNumber: gameNumber,
          timestampCompleted: serverTimestamp(),
          durationMillis: durationMillis ?? 0,
          finalScores: finalScores,
          finalStriche: finalStriche,
          weisPoints: finalWeisPoints,
          startingPlayer: finalStartingPlayer,
          initialStartingPlayer: finalInitialStartingPlayer,
          playerNames: finalPlayerNames,
          trumpColorsPlayed: trumpColorsPlayed,
          roundHistory: cleanedRoundHistory, // Bereinigte History verwenden
          participantUids: participantUids,
          groupId: groupId,
          activeGameId: String(gameStore.activeGameId || ''), // Explizite Konvertierung und Fallback
        };

        // Speichern mit Fehlerbehandlung
        try {
          // Korrigierter Funktionsaufruf:
          // NEUES LOGGING HINZUFÜGEN
          console.log("[ResultatKreidetafel -> startNewGameSequence] Daten VOR saveCompletedGameToFirestore:", { sessionId, gameNumber, summaryData: JSON.parse(JSON.stringify(summaryData)) }); 
          await saveCompletedGameToFirestore(sessionId, gameNumber, summaryData, false);
        } catch (error) {
          // Fehler wurde bereits in saveCompletedGameToFirestore geloggt und Notification gezeigt
          console.error("[ResultatKreidetafel -> startNewGameSequence] Fehler beim Aufruf von saveCompletedGameToFirestore, lokaler Ablauf geht weiter.");
        }
      }
      // --- ENDE Spielzusammenfassung speichern ---

      // Nächsten Starter bestimmen
      const currentGameEntryForNextStart = jassStore.getCurrentGame();
      
      // Ermittle den Spieler, der als NÄCHSTES dran gewesen wäre
      const playerWhoWouldBeNext = gameStore.currentPlayer;
      // Berechne daraus den Spieler, der die letzte Aktion TATSÄCHLICH ausgeführt hat
      // Formel: ((Nächster - 2 + 4) % 4) + 1
      const lastRoundFinishingPlayer = (((playerWhoWouldBeNext - 2 + 4) % 4) + 1) as PlayerNumber;
      
      // Korrekte Berechnung mit dem tatsächlich letzten Spieler
      const initialStartingPlayerForNextGame = determineNextStartingPlayer(
        currentGameEntryForNextStart ?? null,
        lastRoundFinishingPlayer
      );
      // startNewGameSequence starting player: ${initialStartingPlayerForNextGame}

      // --- Firestore Update VOR lokalen Store-Änderungen (geändert) ---
      let newActiveGameId: string | null = null; // Variable für die neue ID
      if (currentSession) { // Nur fortfahren, wenn eine Session existiert
        try {
          // 1. Initialen Zustand für das neue Spiel vorbereiten
          // KORREKTUR: playerNames zuerst holen
          const initialPlayerNames = { ...gameStore.playerNames }; 
          const initialStateForNewGame = {
            sessionId: currentSession.id,
            groupId: currentSession.gruppeId ?? '', 
            participantUids: currentSession.participantUids ?? [],
            playerNames: initialPlayerNames, // Verwende die Variable
            teams: {
              top: { 
                players: [initialPlayerNames[2] ?? 'Spieler 2', initialPlayerNames[4] ?? 'Spieler 4'], // Verwende die Variable
                striche: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }, 
                jassPoints: 0, weisPoints: 0, total: 0,
                bergActive: false, bedankenActive: false, isSigned: false, playerStats: {}
              },
              bottom: {
                players: [initialPlayerNames[1] ?? 'Spieler 1', initialPlayerNames[3] ?? 'Spieler 3'], // Verwende die Variable
                striche: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
                jassPoints: 0, weisPoints: 0, total: 0,
                bergActive: false, bedankenActive: false, isSigned: false, playerStats: {}
              }
            }, 
            currentGameNumber: (jassStore.currentGameId ?? 0) + 1, 
            scores: { top: 0, bottom: 0 },
            striche: { // Dieses Feld wird im ActiveGame-Typ erwartet, initialisieren wir es auch hier
              top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
              bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
            },
            weisPoints: { top: 0, bottom: 0 },
            currentRound: 1,
            currentPlayer: initialStartingPlayerForNextGame,
            startingPlayer: initialStartingPlayerForNextGame,
            initialStartingPlayer: initialStartingPlayerForNextGame, // Auch initial setzen
            // Fügen Sie hier weitere notwendige Felder hinzu, die ActiveGame erfordert
          };

          // 2. Neues activeGames Dokument erstellen
          console.log("[ResultatKreidetafel] Attempting to create NEW active game document...");
          // !!! NEUES LOGGING HINZUGEFÜGT !!!
          // console.log("!!! DEBUG !!! initialStateForNewGame direkt VOR createNewActiveGame:", JSON.stringify(initialStateForNewGame, null, 2));
          // ZUSÄTZLICHES LOGGING für participantUids aus der Session:
          // if (currentSession) {
          //   console.log("!!! DEBUG !!! currentSession.participantUids VOR createNewActiveGame:", JSON.stringify(currentSession.participantUids, null, 2));
          // }
          newActiveGameId = await createNewActiveGame(initialStateForNewGame as any); // `as any` zur Vereinfachung, Typ sollte genauer sein
          console.log(`[ResultatKreidetafel] NEW active game document created with ID: ${newActiveGameId}`);

          // 3. **WIEDER EINGEFÜGT:** Session-Dokument mit der neuen activeGameId aktualisieren
          console.log(`[ResultatKreidetafel] Attempting to update session ${currentSession.id} with new activeGameId: ${newActiveGameId}`);
          await updateSessionActiveGameId(currentSession.id, newActiveGameId);
          console.log(`[ResultatKreidetafel] Session ${currentSession.id} updated successfully.`);

        } catch (error) {
          console.error(`[ResultatKreidetafel] Error creating new game or updating session:`, error);
          useUIStore.getState().showNotification({
            type: "error",
            message: "Fehler beim Starten des nächsten Online-Spiels. Lokaler Ablauf gestoppt.",
          });
          return; // Wichtig: Ablauf hier stoppen, um inkonsistente Zustände zu vermeiden
        }
      } else {
        console.warn("[ResultatKreidetafel] startNewGameSequence: No currentSession found, cannot proceed with online game creation.");
        return; // Stoppen, wenn keine Session da ist
      }
      // --- ENDE Firestore Update ---

      // Lokale Store-Updates für "Neues Spiel" (angepasst)
      jassStore.finalizeGame(); // Markiert altes Spiel als fertig
      // KORREKTUR: Temporär nur ein Argument für jassStore.startNextGame
      jassStore.startNextGame(initialStartingPlayerForNextGame); // TODO: Muss ggf. angepasst werden, um ID zu akzeptieren
      
      // KORREKTUR: Hole die resetGame Action frisch aus dem Store
      const resetGameAction = useGameStore.getState().resetGame;
      resetGameAction(initialStartingPlayerForNextGame, newActiveGameId ?? undefined); // Übergibt neue ID an gameStore für Reset
      
      // Explizites Setzen von isGameStarted etc. (könnte Teil von resetGame sein)
      useGameStore.setState(state => ({
        ...state,
        isGameStarted: true,
        currentRound: 1,
        isGameCompleted: false,
        isRoundCompleted: false
      }));
    };

    // Fallunterscheidung: Navigation oder Neues Spiel (unverändert)
    if (canNavigateForward) {
      if (jassStore.canNavigateForward()) {
          jassStore.navigateToNextGame();
          const nextGame = jassStore.getCurrentGame();
          if (nextGame) {
              const defaultStriche: StricheRecord = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
              gameStore.resetGame(nextGame.initialStartingPlayer);
              useGameStore.setState(state => ({
                ...state,
                isGameStarted: true,
                currentRound: nextGame.currentRound ?? 1,
                currentPlayer: nextGame.currentPlayer ?? 1,
                startingPlayer: nextGame.startingPlayer ?? 1,
                initialStartingPlayer: nextGame.initialStartingPlayer ?? 1,
                scores: {
                  top: (nextGame.teams.top.jassPoints ?? 0) + (nextGame.teams.top.weisPoints ?? 0),
                  bottom: (nextGame.teams.bottom.jassPoints ?? 0) + (nextGame.teams.bottom.weisPoints ?? 0)
                },
                weisPoints: {
                  top: nextGame.teams.top.weisPoints ?? 0,
                  bottom: nextGame.teams.bottom.weisPoints ?? 0
                },
                striche: {
                  top: { ...defaultStriche, ...(nextGame.teams.top.striche ?? {}) },
                  bottom: { ...defaultStriche, ...(nextGame.teams.bottom.striche ?? {}) }
                },
                roundHistory: nextGame.roundHistory ?? [],
                isGameCompleted: false,
                isRoundCompleted: false
              }));
          }
      }
      return;
    }

    // Fall: Neues Spiel
    if (!canStartNewGame) {
      // Notification "Bitte erst bedanken..." (unverändert)
      useUIStore.getState().showNotification({
        message: "Bitte erst bedanken, bevor ein neues Spiel gestartet wird.",
        type: 'warning',
        position: swipePosition ?? undefined, // Konvertiere null zu undefined
        isFlipped: swipePosition === 'top',
        actions: [{ label: 'Verstanden', onClick: closeResultatKreidetafel }]
      });
      return;
    }

    // NEU: Prüfung, ob Benutzer ein Gast ist
    const isGuestUser = useAuthStore.getState().isGuest;
    if (isGuestUser) {
      // Benachrichtigung für Gäste, dass die Funktion nur für registrierte Benutzer verfügbar ist
      useUIStore.getState().showNotification({
        message: "Im Gastmodus ist immer nur ein aktuelles Spiel möglich. Um deine Spielhistorie und Statistiken zu speichern, melde dich bitte an oder registriere dich.",
        type: 'info',
        position: swipePosition ?? undefined,
        isFlipped: swipePosition === 'top',
        actions: [
          { 
            label: 'Zurück', 
            onClick: closeResultatKreidetafel 
          },
          { 
            label: 'OK', 
            onClick: () => {
              closeResultatKreidetafel();
              // KORREKTUR: Direkt zur Registrierung weiterleiten, nicht zur Startseite
              debouncedRouterPush(router, '/auth/register?origin=offline', undefined, true);
            }
          }
        ]
      });
      return;
    }

    // Confirmation Notification (nur für eingeloggte Benutzer)
    useUIStore.setState({
      jassFinishNotification: {
        isOpen: true,
        mode: 'continue',
        message: {
          text: "Möchtest du das nächste Spiel beginnen?",
          icon: '✅'
        },
        onBack: closeResultatKreidetafel,
        // Rufe startNewGameSequence ohne Argument auf
        onContinue: async () => {
          closeResultatKreidetafel();
          await startNewGameSequence(); // Kein Argument mehr übergeben
        }
      }
    });
  }, [
    canNavigateForward,
    canStartNewGame,
    swipePosition,
    closeResultatKreidetafel,
  ]);

  const handleSignatureClick = useCallback(async () => {
    // LOG 1: Am Anfang des Callbacks
    // console.log(`[handleSignatureClick - LOG 1] Start. Spiel: ${useJassStore.getState().currentGameId}, History Length: ${useGameStore.getState().roundHistory.length}`);
    
    const currentSigningState = useUIStore.getState().signingState;
    const currentSwipePosition = useUIStore.getState().resultatKreidetafel.swipePosition;
    const uiStore = useUIStore.getState();
    const gameStore = useGameStore.getState();
    const timerStore = useTimerStore.getState();
    const jassStore = useJassStore.getState();

    let teamSigningNow: TeamPosition | null = null;
    if (currentSigningState === 'waitingTeam1' && currentSwipePosition === 'bottom') {
 teamSigningNow = 'bottom';
} else if (currentSigningState === 'waitingTeam2' && currentSwipePosition === 'top') {
 teamSigningNow = 'top';
} else {
 return;
} // Frühzeitig beenden, wenn falsches Team

    if (teamSigningNow) {
        uiStore.recordSignature(teamSigningNow);
        const newState = useUIStore.getState().signingState;

        if (newState === 'completed') {
            const activeGameId = gameStore.activeGameId;
            const currentSessionIdFromStore = jassStore.currentSession?.id;
            // KORREKTUR: Verwende games.length für robustere Spielanzahl-Bestimmung
            // Bei Turnieren ist es immer 1 (eine Passe = ein Spiel)
            const totalGamesPlayedInSession = isTournamentPasse ? 1 : jassStore.games.length;
            const currentGameNumber = totalGamesPlayedInSession;
            console.log(`[handleSignatureClick] Session ${currentSessionIdFromStore}: Determined expectedGameNumber=${currentGameNumber} (Tournament: ${isTournamentPasse}, JassStore.games.length: ${jassStore.games.length}, JassStore.currentGameId: ${jassStore.currentGameId})`);
            let statusUpdated = false;

            // LOG 2: Direkt vor updateGameStatus
            // console.log(`[handleSignatureClick - LOG 2] Vor updateGameStatus. Spiel: ${currentGameNumber}, History Length: ${useGameStore.getState().roundHistory.length}`);

            // 1. Firestore Status aktualisieren
            if (activeGameId) {
                try {
                    await updateGameStatus(activeGameId, 'completed');
                    statusUpdated = true;
                } catch (err) {
                    console.error("Failed to update game status:", err);
                    uiStore.showNotification({ type: "error", message: "Fehler beim Speichern des Spielstatus." });
                    return; // Nicht fortfahren
                }
            } else {
                statusUpdated = true;
            }

            // LOG 3: Direkt nach updateGameStatus (vor dem Speichern)
            // console.log(`[handleSignatureClick - LOG 3] Nach updateGameStatus. Spiel: ${currentGameNumber}, History Length: ${useGameStore.getState().roundHistory.length}`);

            // 2. CompletedGameSummary erstellen und speichern (nur wenn Status OK und online)
            if (statusUpdated && currentSessionIdFromStore && currentGameNumber !== null && activeGameId) {
              try {
                // LOG 4: Direkt vor dem Auslesen der History für summaryToSave
                // console.log(`[handleSignatureClick - LOG 4] Im try-Block, vor History-Extraktion. Spiel: ${currentGameNumber}, History Length: ${useGameStore.getState().roundHistory.length}`);
                
                // Daten aus den Stores sammeln (VOR dem Reset!)
                const finalStriche = gameStore.striche;
                // finalScores sind die Gesamtpunkte des Spiels (Jass-Punkte + Weis der LETZTEN Runde aus gameStore.scores)
                // Dies ist NICHT die Summe aller Rundenpunkte.
                // Die korrekten Endpunkte des Spiels (inkl. aller Weispunkte) sind in jassStore.getCurrentGame().teams.X.total
                const jassStoreCurrentGame = jassStore.getCurrentGame();
                const finalScoresCorrected = {
                  top: jassStoreCurrentGame?.teams.top.total || 0,
                  bottom: jassStoreCurrentGame?.teams.bottom.total || 0,
                };

                const finalPlayerNames = gameStore.playerNames;
                const finalDuration = timerStore.getGameDuration(currentGameNumber);
                
                // Korrekte Quelle für die Gesamt-Weispunkte der Partie aus dem jassStore
                const accumulatedWeisPointsForGame = {
                  top: jassStoreCurrentGame?.teams.top.weisPoints || 0,
                  bottom: jassStoreCurrentGame?.teams.bottom.weisPoints || 0,
                };
                                
                const finalStartingPlayer = gameStore.startingPlayer;
                const finalInitialStartingPlayer = gameStore.initialStartingPlayer;
                // WICHTIG: roundHistory direkt aus dem gameStore nehmen.
                // Diese SOLLTE die korrekten runden-spezifischen weisPoints enthalten,
                // da gameStore.createRoundEntry diese aus currentRoundWeisSum setzt.
                const finalRoundHistory = [...gameStore.roundHistory]; 
                const finalParticipantUids = (jassStore.currentSession?.participantUids ?? []) as string[];
                const finalGroupId = jassStore.currentSession?.gruppeId ?? null;

                const filteredRoundHistory = finalRoundHistory.filter(entry => entry.isActive === undefined || entry.isActive === true);
                const trumpColorsPlayedSet = new Set<string>();
                
                const cleanedRoundHistory = filteredRoundHistory.map(entry => {
                  const cleanedEntry = { ...entry };
                  // Das Feld _savedWeisPoints ist nicht Teil von RoundEntry und sollte entfernt werden, falls es existiert
                  if ('_savedWeisPoints' in cleanedEntry) {
                    delete (cleanedEntry as any)._savedWeisPoints;
                  }

                  if (isJassRoundEntry(cleanedEntry)) {
                    if (cleanedEntry.farbe) {
                       trumpColorsPlayedSet.add(cleanedEntry.farbe);
                  }
                    if (cleanedEntry.strichInfo === undefined) {
                      delete cleanedEntry.strichInfo;
                    }
                    // Die weisPoints in JassRoundEntry sollten hier bereits die Summe der Weis DIESER Runde sein,
                    // gesetzt durch createRoundEntry(stateForEntryCreation) in gameStore.finalizeRound.
                    // Wir müssen sicherstellen, dass sie nicht {0,0} sind, falls die Runde Weis hatte.
                    // Die `weisActions` sind der Ground Truth für die Weispunkte dieser Runde.
                    // Wenn `cleanedEntry.weisPoints` nicht die Summe der `weisActions` ist, gibt es ein Problem in `createRoundEntry`.
                    // Für die Korrektur hier, stellen wir sicher, dass es konsistent ist, falls createRoundEntry fehlschlägt:
                    let roundSpecificWeisSum = { top: 0, bottom: 0 };
                    (cleanedEntry.weisActions || []).forEach(wa => {
                      roundSpecificWeisSum[wa.position] = (roundSpecificWeisSum[wa.position] || 0) + wa.points;
                    });
                    cleanedEntry.weisPoints = roundSpecificWeisSum;

                  }
                  if (cleanedEntry.ansager === undefined) delete cleanedEntry.ansager;
                  if (cleanedEntry.startTime === undefined) delete cleanedEntry.startTime;
                  if (cleanedEntry.endTime === undefined) delete cleanedEntry.endTime;
                  if (cleanedEntry.playerTurns === undefined) delete cleanedEntry.playerTurns;
                  if (cleanedEntry.timerSnapshot === undefined) delete cleanedEntry.timerSnapshot;
                  if (cleanedEntry.previousRoundId === undefined) delete cleanedEntry.previousRoundId;
                  if (cleanedEntry.nextRoundId === undefined) delete cleanedEntry.nextRoundId;

                  if (cleanedEntry.scores?.weisPoints === undefined) { // Dieses 'weisPoints' in 'scores' ist meist {0,0}
                    if (cleanedEntry.scores) cleanedEntry.scores.weisPoints = {top: 0, bottom: 0};
                  }
                  if (cleanedEntry.visualStriche?.top === undefined) {
                    if (cleanedEntry.visualStriche) cleanedEntry.visualStriche.top = {stricheCounts: { 20: 0, 50: 0, 100: 0 }, restZahl: 0}; 
                  }
                  if (cleanedEntry.visualStriche?.bottom === undefined) {
                    if (cleanedEntry.visualStriche) cleanedEntry.visualStriche.bottom = {stricheCounts: { 20: 0, 50: 0, 100: 0 }, restZahl: 0};
                  }
                  return cleanedEntry;
                });
                const finalTrumpColorsPlayed = Array.from(trumpColorsPlayedSet) as string[];

                const summaryToSave: CompletedGameSummary = {
                  gameNumber: currentGameNumber, 
                  finalScores: finalScoresCorrected, // Korrigierte Gesamtpunkte des Spiels
                  finalStriche: finalStriche, 
                  playerNames: finalPlayerNames, 
                  timestampCompleted: Timestamp.now(), 
                  weisPoints: accumulatedWeisPointsForGame, // Verwende die akkumulierten Gesamt-Weispunkte für das SPIEL
                  startingPlayer: finalStartingPlayer, 
                  initialStartingPlayer: finalInitialStartingPlayer, 
                  trumpColorsPlayed: finalTrumpColorsPlayed,
                  roundHistory: cleanedRoundHistory, // History mit korrigierten/validierten runden-spezifischen weisPoints
                  participantUids: finalParticipantUids, 
                  groupId: finalGroupId, 
                  activeGameId: activeGameId,
                  completedAt: Timestamp.now(),
                  durationMillis: finalDuration ?? 0,
                };

                // Die aggressive Regex-Bereinigung wird entfernt. Das Objekt sollte jetzt korrekt sein.
                console.log("[ResultatKreidetafel] Attempting to save completed game summary (Struktur überarbeitet)...", { currentSessionIdFromStore, currentGameNumber, summaryToSave: JSON.parse(JSON.stringify(summaryToSave)) }); 
                    await saveCompletedGameToFirestore(currentSessionIdFromStore, currentGameNumber, summaryToSave);
                
                console.log("[ResultatKreidetafel] Completed game summary saved successfully."); 

                // NEU: Sofort nach dem Speichern das aktive Spiel als "completed" markieren
                // Dies verhindert Duplizierung in gamesForStatistik zwischen Speichern und Reset
                useGameStore.setState(state => ({
                  ...state,
                  isGameCompleted: true
                }));
                console.log("[ResultatKreidetafel] Marked active game as completed to prevent duplication.");

                // LOG 5: Nach saveCompletedGameToFirestore
                // console.log(`[handleSignatureClick - LOG 5] Nach saveCompletedGameToFirestore. Spiel: ${currentGameNumber}, History Length: ${useGameStore.getState().roundHistory.length}`);

                // --- NEU: Kurze Verzögerung vor dem Finalize-Aufruf --- 
                await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 Sekunden warten
                console.log(`[handleSignatureClick] Verzögerung beendet, fahre fort mit Finalisierung.`);
                // --- ENDE Verzögerung ---

              } catch (saveError) {
                console.error("Failed to save completed game summary:", saveError);
                uiStore.showNotification({ type: "error", message: "Fehler beim Archivieren des Spiels." });
              }
            } else if (!activeGameId) {
                 console.log("[ResultatKreidetafel] Skipping summary save because no activeGameId (Offline/Guest).");
            } else if (!statusUpdated) {
                console.warn("[ResultatKreidetafel] Skipping summary save because status update failed.");
            } else if (!currentSessionIdFromStore || !(currentGameNumber > 0)) {
                console.warn("[ResultatKreidetafel] Skipping summary save due to missing sessionId or gameNumber.", { currentSessionIdFromStore, currentGameNumber });
            }

            // LOG 6: Vor Definition finalizeAndResetOnline
            // console.log(`[handleSignatureClick - LOG 6] Vor Definition finalizeAndResetOnline. Spiel: ${currentGameNumber}, History Length: ${useGameStore.getState().roundHistory.length}`);

            // 3. Logik zum Finalisieren und Resetten definieren
            const finalizeAndResetOnline = async () => {
                console.log("[ResultatKreidetafel] Finalizing and resetting (Online after Sign/Share)");
                jassStore.finalizeGame(); 
                timerStore.finalizeJassEnd();
                gameStore.resetGame(1);
                timerStore.resetAllTimers();
                uiStore.clearResumableGameId();
                uiStore.resetSigningProcess();
                uiStore.closeJassFinishNotification();
                closeResultatKreidetafel();
                await debouncedRouterPush(router, '/start');
            };

            // Timer Analytics holen
            const timerAnalytics = timerStore.getAnalytics();

            // LOG 7: Vor Aufruf finalizeSessionSummary
            // console.log(`[handleSignatureClick - LOG 7] Vor Aufruf finalizeSessionSummary. Spiel: ${currentGameNumber}, History Length: ${useGameStore.getState().roundHistory.length}`);

            // --- KORRIGIERTER Aufruf der Callable Function finalizeSession mit Retry --- 
            if (statusUpdated && currentSessionIdFromStore && currentGameNumber > 0 && isRealOnlineSession) {
                console.log(`[ResultatKreidetafel] Attempting to call finalizeSession Cloud Function for REAL online session ${currentSessionIdFromStore}, expecting game ${currentGameNumber}`);

                if (isFinalizingSession) {
                  console.warn("[ResultatKreidetafel] finalizeSession is already in progress. Skipping duplicate call.");
                  // Optional: return hier, wenn die gesamte handleSignatureClick nicht weiterlaufen soll
                  // Oder spezifische UI-Rückmeldung geben
                } else {
                  setIsFinalizingSession(true); // Setze den Flag, bevor der Prozess beginnt

                  const functions = getFunctions(firebaseApp, "us-central1");
                  const finalizeFunction = httpsCallable<FinalizeSessionDataClient, { success: boolean; message: string }>(functions, 'finalizeSession');

                  let attempts = 0;
                  const maxAttempts = 3;
                  const retryDelay = 2000;

                  try {
                    while (attempts < maxAttempts) {
                      attempts++;
                      try {
                        console.log(`[ResultatKreidetafel] Calling finalizeSession (Attempt ${attempts})...`);

                        let initialPayloadData: InitialSessionDataClient | undefined = undefined;
                        if (jassStore.currentSession) {
                          const playerNamesLocal = gameStore.playerNames;
                          const participantUidsLocal = jassStore.currentSession.participantUids || [];
                          const sessionTeamsData = prepareSessionTeamsData(participantUidsLocal, playerNamesLocal);

                          initialPayloadData = {
                            participantUids: participantUidsLocal,
                            playerNames: playerNamesLocal,
                            gruppeId: jassStore.currentSession.gruppeId || null,
                            startedAt: jassStore.currentSession?.startedAt,
                            teams: sessionTeamsData.teams,
                            pairingIdentifiers: sessionTeamsData.pairingIdentifiers
                          };
                          console.log("[ResultatKreidetafel] initialSessionData prepared:", JSON.stringify(initialPayloadData));
                        } else {
                          console.warn("[ResultatKreidetafel] currentSession in jassStore is null, cannot send full initialSessionData.");
                        }

                        const result = await finalizeFunction({
                          sessionId: currentSessionIdFromStore!,
                          expectedGameNumber: currentGameNumber!,
                          initialSessionData: initialPayloadData
                        });

                        console.log(`[ResultatKreidetafel] finalizeSession SUCCESS (Attempt ${attempts}):`, result.data);
                        break;
                      } catch (error: any) {
                        console.warn(`[ResultatKreidetafel] finalizeSession FAILED (Attempt ${attempts}):`, error);
                        if ((error as any)?.details?.customCode === 'GAME_NOT_YET_VISIBLE' && attempts < maxAttempts) {
                          console.log(`[ResultatKreidetafel] Custom Precondition failed (Game ${currentGameNumber} likely not visible yet). Retrying in ${retryDelay / 1000}s...`);
                          await new Promise(resolve => setTimeout(resolve, retryDelay));
                          continue;
                        } else {
                          console.error(`[ResultatKreidetafel] FINAL Error calling finalizeSession after ${attempts} attempts:`, error);
                          let errorMessage = "Fehler beim Finalisieren der Session-Statistik.";
                          if (error.code && error.message) {
                            errorMessage = `Fehler (${error.code}): ${error.message}`;
                          } else if (error instanceof Error) {
                            errorMessage = error.message;
                          }
                          uiStore.showNotification({type: "error", message: errorMessage });
                          break;
                        }
                      }
                    } // Ende while loop
                  } finally {
                    setIsFinalizingSession(false); // Setze den Flag zurück, egal ob erfolgreich oder nicht
                  }
                } // Ende if (!isFinalizingSession)
            } else {
                console.warn(`[ResultatKreidetafel] Skipping finalizeSession Cloud Function call: Not a real online session or missing data. IsRealOnlineSession: ${isRealOnlineSession}, StatusUpdated: ${statusUpdated}, SessionID: ${!!currentSessionIdFromStore}, GameNumber: ${currentGameNumber}`);
            }
            // --- ENDE Aufruf finalizeSessionSummary mit Retry ---

            // 4. Spruch berechnen 
            const spruch = getJassSpruch({
                stricheDifference: Math.abs(currentTotals.striche.top - currentTotals.striche.bottom),
                pointDifference: Math.abs(currentTotals.punkte.top - currentTotals.punkte.bottom),
                isUnentschieden: currentStatisticId === 'striche'
                  ? currentTotals.striche.top === currentTotals.striche.bottom
                  : currentTotals.punkte.top === currentTotals.punkte.bottom,
                winnerNames: currentStatisticId === 'striche'
                  ? currentTotals.striche.top > currentTotals.striche.bottom
                    ? [playerNames[2], playerNames[4]].filter(Boolean)
                    : [playerNames[1], playerNames[3]].filter(Boolean)
                  : currentTotals.punkte.top > currentTotals.punkte.bottom
                    ? [playerNames[2], playerNames[4]].filter(Boolean)
                    : [playerNames[1], playerNames[3]].filter(Boolean),
                loserNames: currentStatisticId === 'striche'
                  ? currentTotals.striche.top > currentTotals.striche.bottom
                    ? [playerNames[1], playerNames[3]].filter(Boolean)
                    : [playerNames[2], playerNames[4]].filter(Boolean)
                  : currentTotals.punkte.top > currentTotals.punkte.bottom
                    ? [playerNames[1], playerNames[3]].filter(Boolean)
                    : [playerNames[2], playerNames[4]].filter(Boolean),
                isStricheMode: currentStatisticId === 'striche',
                type: 'jassEnd',
                timerAnalytics, 
                matchCount: {
                  team1: uiStriche.top.matsch ?? 0,
                  team2: uiStriche.bottom.matsch ?? 0
                },
                totalMatsche: (uiStriche.top.matsch ?? 0) + (uiStriche.bottom.matsch ?? 0),
                isSchneider: currentTotals.punkte.top < activeScoreSettings.values.schneider || 
                            currentTotals.punkte.bottom < activeScoreSettings.values.schneider,
                gameStats: teamStats.gameStats,
                gesamtStand: teamStats.gesamtStand,
                previousGesamtStand: teamStats.previousGesamtStand
            });

            // 5. JassFinishNotification anzeigen
            console.log("[ResultatKreidetafel] Attempting to show JassFinishNotification."); 
            uiStore.showJassFinishNotification({
                mode: 'share',
                message: spruch,
                onShare: async () => {
                    console.log("[ResultatKreidetafel] Sign-Flow: Share button clicked.");
                    await handleShareAndComplete();
                    await finalizeAndResetOnline(); // Reset NACH dem Teilen
                },
                onBack: async () => { // Wird jetzt als "Nicht teilen" angezeigt
                    console.log("[ResultatKreidetafel] Sign-Flow: Nicht teilen button clicked.");
                    await finalizeAndResetOnline(); // Direkter Reset
                },
                onBackLabel: "Weiter" // Das Label für den onBack Button
            });

        } else {
            // Noch nicht fertig, automatisch flippen
            const nextPosition = teamSigningNow === 'bottom' ? 'top' : 'bottom';
            uiStore.setResultatPosition(nextPosition); 
        }
    }
  }, [
      closeResultatKreidetafel,
      router,
      currentTotals,
      currentStatisticId,
      playerNames,
      activeScoreSettings,
      teamStats,
      uiStriche,
      handleNextGameClick, // Bleibt wichtig für Spruch-Berechnung via teamStats
      handleShareAndComplete, // Wichtig für onShare
      isRealOnlineSession // NEU: Wichtig für Firebase-Aufrufe
      // Stores (gameStore, jassStore, timerStore, uiStore, authStore) werden über getState geholt
  ]);

  // 8. Hooks für UI-Effekte & Refs
  const backButton = usePressableButton(handleBack);
  const shareButton = usePressableButton(handleShareAndComplete);
  const nextButton = usePressableButton(handleNextGameClick); // Jetzt ist handleNextGameClick definiert
  const kreidetafelRef = useRef<HTMLDivElement>(null);
  const { overlayScale } = useDeviceScale();
  const springProps = useSpring({ 
    opacity: isOpen ? 1 : 0,
    transform: `scale(${isOpen ? overlayScale : 0.95}) rotate(${isFlipped ? "180deg" : "0deg"})`,
    config: { mass: 1, tension: 300, friction: 20 },
  });
  const swipeAnimation = useSpring({ /* ... Animation ... */ });

  // 9. useEffect Hooks (NACH allen anderen Hook-Definitionen)
  useEffect(() => { // Firestore Listener
    const unsubscribe: Unsubscribe | null = null;
    if (isOnlineMode && currentSessionId) {/* ... Listener Logik ... */} else {/* ... Aufräumen ... */}
    return () => {/* ... unsubscribe ... */};
  }, [isOnlineMode, currentSessionId, jassStoreSetState]);

  useEffect(() => { // Scroll Effekt
    if (kreidetafelRef.current && isOpen) {/* ... Scroll Logik ... */}
  }, [isOpen, gamesToDisplay.length, currentGameId]);

  useEffect(() => { // Tutorial Effekt
    if (isOpen && isTutorialActive && (!currentStep || currentStep.id !== TUTORIAL_STEPS.RESULTAT_INFO)) {
      closeResultatKreidetafel();
    }
  }, [isOpen, isTutorialActive, currentStep, closeResultatKreidetafel]);

  useEffect(() => { // JassFinishNotification Reset bei Öffnen
    if (isOpen) {
 useUIStore.setState(state => ({ /* ... Reset ... */ }));
}
  }, [isOpen]);
  
  // --- NEU: Kombinierte Spieleliste für Statistik erstellen ---
  const gamesForStatistik = useMemo(() => {
    const gameStoreState = useGameStore.getState();
    const onlineGamesFromJassStore = useJassStore.getState().onlineCompletedGames;
    const localGamesFromJassStore = useJassStore.getState().games;
    const currentJassGameId = useJassStore.getState().currentGameId;

    // === NEUE BEDINGUNG für Turniermodus ===
    if (isTournamentPasse) {
      // Im Turniermodus NUR das aktive Spiel aus dem GameStore nehmen, falls vorhanden
      const localActiveGameId = gameStoreState.activeGameId;
      if (gameStoreState.isGameStarted && !gameStoreState.isGameCompleted && localActiveGameId) {
        // Erstelle die Repräsentation des aktiven Spiels (ähnlich wie unten)
        const activeGameRepresentation: GameEntry = {
          id: localActiveGameId, 
          gameNumber: localActiveGameId, // Oder passeNumber?
          teams: {
            top: { 
              striche: {...storeStriche.top},
              jassPoints: gameStoreState.scores.top - (gameStoreState.weisPoints.top ?? 0),
              weisPoints: gameStoreState.weisPoints.top ?? 0,
              total: gameStoreState.scores.top,
              bergActive: false, bedankenActive: false, isSigned: false, playerStats: {}
            },
            bottom: { 
              striche: {...storeStriche.bottom},
              jassPoints: gameStoreState.scores.bottom - (gameStoreState.weisPoints.bottom ?? 0),
              weisPoints: gameStoreState.weisPoints.bottom ?? 0,
              total: gameStoreState.scores.bottom,
              bergActive: false, bedankenActive: false, isSigned: false, playerStats: {}
            }
          },
          timestamp: Date.now(),
          sessionId: currentSessionId ?? '',
          currentRound: gameStoreState.currentRound,
          startingPlayer: gameStoreState.startingPlayer,
          initialStartingPlayer: gameStoreState.initialStartingPlayer,
          currentPlayer: gameStoreState.currentPlayer,
          roundHistory: gameStoreState.roundHistory,
          currentHistoryIndex: gameStoreState.currentHistoryIndex,
          historyState: gameStoreState.historyState,
          isGameStarted: gameStoreState.isGameStarted,
          isRoundCompleted: gameStoreState.isRoundCompleted,
          isGameCompleted: gameStoreState.isGameCompleted,
          __isPlaceholder: true, 
          __isActive: true      
        } as unknown as GameEntry;
        // Gib eine Liste NUR mit diesem Spiel zurück
        return [activeGameRepresentation];
      } else {
        // Kein aktives Spiel im Turniermodus für die Statistik relevant
        return [];
      }
    }
    // === ENDE NEUE BEDINGUNG ===

    // Original-Logik für Gruppenmodus (Online/Offline)
    let combinedGames: Array<GameEntry | CompletedGameSummary> = [];
    
    if (isOnlineMode) {
        combinedGames = [...onlineGamesFromJassStore]; 
        const localActiveGameId = gameStoreState.activeGameId; 
        if (gameStoreState.isGameStarted && !gameStoreState.isGameCompleted && localActiveGameId) { 
          const gameAlreadyExists = combinedGames.some(game => { 
             const id = 'gameNumber' in game ? game.gameNumber : game.id;
             // Prüfe gegen die ID aus dem gameStore
             return String(id) === String(localActiveGameId); 
           });
          if (!gameAlreadyExists) { 
            const activeGameRepresentation: GameEntry = {
              id: localActiveGameId, 
              gameNumber: localActiveGameId,
              teams: {
                top: { 
                  striche: {...storeStriche.top},
                  jassPoints: gameStoreState.scores.top - (gameStoreState.weisPoints.top ?? 0),
                  weisPoints: gameStoreState.weisPoints.top ?? 0,
                  total: gameStoreState.scores.top,
                  bergActive: false, bedankenActive: false, isSigned: false, playerStats: {}
                },
                bottom: { 
                  striche: {...storeStriche.bottom},
                  jassPoints: gameStoreState.scores.bottom - (gameStoreState.weisPoints.bottom ?? 0),
                  weisPoints: gameStoreState.weisPoints.bottom ?? 0,
                  total: gameStoreState.scores.bottom,
                  bergActive: false, bedankenActive: false, isSigned: false, playerStats: {}
                }
              },
              timestamp: Date.now(),
              sessionId: currentSessionId ?? '',
              currentRound: gameStoreState.currentRound,
              startingPlayer: gameStoreState.startingPlayer,
              initialStartingPlayer: gameStoreState.initialStartingPlayer,
              currentPlayer: gameStoreState.currentPlayer,
              roundHistory: gameStoreState.roundHistory,
              currentHistoryIndex: gameStoreState.currentHistoryIndex,
              historyState: gameStoreState.historyState,
              isGameStarted: gameStoreState.isGameStarted,
              isRoundCompleted: gameStoreState.isRoundCompleted,
              isGameCompleted: gameStoreState.isGameCompleted,
              __isPlaceholder: true, 
              __isActive: true      
            } as unknown as GameEntry;
            combinedGames.push(activeGameRepresentation);
          }
        }
    } else {
        combinedGames = localGamesFromJassStore; 
    }
    
    const sortedGames = combinedGames.sort((a, b) => {
      let timestampA: number;
      let timestampB: number;
      
      if ('timestampCompleted' in a && a.timestampCompleted) {
        timestampA = a.timestampCompleted instanceof Timestamp ? 
                    a.timestampCompleted.toMillis() : 
                    a.timestampCompleted as any;
      } else if ('timestamp' in a) {
        timestampA = a.timestamp as number;
      } else {
        timestampA = 0; 
      }
      
      if ('timestampCompleted' in b && b.timestampCompleted) {
        timestampB = b.timestampCompleted instanceof Timestamp ? 
                    b.timestampCompleted.toMillis() : 
                    b.timestampCompleted as any;
      } else if ('timestamp' in b) {
        timestampB = b.timestamp as number;
      } else {
        timestampB = 0; 
      }
      return timestampA - timestampB;
    });

    const finalGamesWithDisplayNumber = sortedGames.map((game, index) => ({
      ...game,
      displayNumber: index + 1 
    }));
    
    return finalGamesWithDisplayNumber;

  // }, [isOnlineMode, onlineCompletedGames, localGames, storeStriche, currentSessionId, currentGameId, useGameStore.getState()]); // Alter Kommentar
  // NEUE Abhängigkeiten: isTournamentPasse und gameStore states hinzufügen, die verwendet werden
  }, [isTournamentPasse, isOnlineMode, onlineCompletedGames, localGames, storeStriche, currentSessionId, useGameStore.getState().isGameStarted, useGameStore.getState().isGameCompleted, useGameStore.getState().activeGameId]);

  // --- ENDE NEU ---

  // --- Korrekter Hook für automatisches Scrollen (NACH gamesForStatistik Definition) --- 
  useEffect(() => { 
    const container = kreidetafelRef.current;
    if (isOpen && container) {
      const timeoutId = setTimeout(() => {
        if (kreidetafelRef.current) {
          kreidetafelRef.current.scrollTop = kreidetafelRef.current.scrollHeight;
        }
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [isOpen, currentStatisticId, gamesForStatistik]); 
  // --- ENDE Hook für automatisches Scrollen ---

  // 10. Touch-Handler (verwenden Callbacks)
  const handleTouchStart = (e: React.TouchEvent) => {/* ... */};
  const handleTouchMove = (e: React.TouchEvent) => {/* ... */};
  const handleTouchEnd = () => {/* ... */};

  // 11. Modul-Rendering Logik
  const currentModule = STATISTIC_MODULES.find(mod => mod.id === currentStatisticId);
  const FallbackModuleComponent = JasspunkteStatistik;
  const ModuleComponent = currentModule ? currentModule.component : FallbackModuleComponent;
  const moduleTitle = currentModule ? currentModule.title : 'Jassergebnis';

  // NEU: Handler für den Abschluss einer Turnierpasse (Implementierung)
  const handleCompletePasseClick = useCallback(async () => {
    if (!isTournamentPasse || !gameStoreActiveGameId || !tournamentInstanceId) {
      console.error("[ResultatKreidetafel] Incomplete data for completing passe.");
      useUIStore.getState().showNotification({ type: 'error', message: 'Fehlende Daten zum Abschließen der Passe.' });
      return;
    }

    // NEU: Prüfung, ob bedankt wurde, bevor die Turnierpasse abgeschlossen wird
    if (!canStartNewGame) {
      useUIStore.getState().showNotification({
        message: "Bitte erst bedanken, bevor die Passe abgeschlossen wird.",
        type: 'warning',
        position: swipePosition === 'top' ? 'top' : 'bottom', // swipePosition verwenden
        isFlipped: swipePosition === 'top',
        actions: [{ label: 'Verstanden', onClick: () => closeResultatKreidetafel() }] // KORRIGIERT
      });
      return;
    }

    setIsCompletingPasse(true); // Korrigiert: Zurück zu setIsCompletingPasse
    try {
      const success = await completeAndRecordTournamentPasse(gameStoreActiveGameId, tournamentInstanceId);
      
      if (success) {
        // console.log("Passe erfolgreich abgeschlossen, starte Navigation zurück zum Turnier..."); // DEBUG-LOG ENTFERNT
        useUIStore.getState().showNotification({ type: 'success', message: 'Passe erfolgreich abgeschlossen!' });
        
        useGameStore.getState().resetGame(1); 
        useJassStore.getState().clearActiveGameForSession(tournamentInstanceId);
        
        closeResultatKreidetafel(); 

        // console.log(`[ResultatKreidetafel] Navigating to /tournaments/${tournamentInstanceId}`); // DEBUG-LOG ENTFERNT
        await debouncedRouterPush(router, `/tournaments/${tournamentInstanceId}`);

      } else {
        // Fehler wurde wahrscheinlich schon im Service geloggt/behandelt
        // Zeige hier eine generische Fehlermeldung
        useUIStore.getState().showNotification({ type: 'error', message: 'Fehler beim Abschließen der Passe.' });
      }

    } catch (error) {
      console.error("[ResultatKreidetafel] Unexpected error completing passe:", error);
      useUIStore.getState().showNotification({ type: 'error', message: 'Unerwarteter Fehler beim Abschließen der Passe.' });
    } finally {
      setIsCompletingPasse(false); // Korrigiert: Zurück zu setIsCompletingPasse
    }
  }, [isTournamentPasse, gameStoreActiveGameId, tournamentInstanceId, closeResultatKreidetafel, router, canStartNewGame, swipePosition]); // NEU: canStartNewGame und swipePosition als Abhängigkeiten hinzugefügt

  // --- Component Return --- 
  if (!isOpen) return null;

  return (
    <>
      {isFinalizingSession && <FullscreenLoader text="Jass wird gespeichert. Bitte warten..." />}
      {showConfetti && (
        <div className="fixed inset-0 bg-white bg-opacity-70 z-50">
          {/* Add your confetti animation or image here */}
        </div>
      )}
      <div 
        className={`fixed inset-0 flex items-center justify-center z-50 ${isOpen ? '' : 'pointer-events-none'}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            closeResultatKreidetafel();
          }
        }}
        // Touch-Handler bleiben hier für potenzielles Schließen durch Swipe nach unten (optional)
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Swipe-Handler für Statistik-Navigation hier auf dieses Div anwenden */}
        <animated.div 
          {...swipeHandlers} // Swipe-Handler hier hinzugefügt
          style={springProps}
          className="relative w-11/12 max-w-md bg-gray-800 bg-opacity-95 rounded-xl p-6 shadow-lg select-none"
          onClick={(e) => e.stopPropagation()} // Verhindert Schließen bei Klick innen
        >
          {/* Header */}
          <div className="text-center mb-4">
            <h2 className="text-2xl font-bold text-white">
              {moduleTitle} 
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
          {!isReadOnly && canNavigateBack && !canNavigateForward && (
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
                isStarter={gamesToDisplay && gamesToDisplay.length > 0 && gamesToDisplay[0]?.initialStartingPlayer === 1} 
              />
              <PlayerName 
                name={playerNames[3]} 
                isStarter={gamesToDisplay && gamesToDisplay.length > 0 && gamesToDisplay[0]?.initialStartingPlayer === 3} 
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <PlayerName 
                name={playerNames[2]} 
                isStarter={gamesToDisplay && gamesToDisplay.length > 0 && gamesToDisplay[0]?.initialStartingPlayer === 2} 
              />
              <PlayerName 
                name={playerNames[4]} 
                isStarter={gamesToDisplay && gamesToDisplay.length > 0 && gamesToDisplay[0]?.initialStartingPlayer === 4} 
              />
            </div>
          </div>

          {/* Statistik-Container mit Scroll und Swipe-Animation */}
          <div className="border-t border-b border-gray-700">
            <div 
              ref={kreidetafelRef}
              className="statistik-container max-h-[280px] overflow-y-auto overflow-x-auto"
            >
              {/* Swipe-Handler hier ENTFERNEN */}
              <animated.div style={swipeAnimation} className="py-2 min-w-max">
                <ModuleComponent
                  teams={teams}
                  games={gamesForStatistik}
                  currentGameId={currentGameId}
                  playerNames={playerNames}
                  cardStyle={cardStyle}
                  strokeSettings={activeStrokeSettings}
                  scoreSettings={activeScoreSettings} // KORREKTUR: Die verfügbare Variable verwenden
                  onSwipe={handleStatisticChange}
                  gameTypeLabel={gameTypeLabel} // KORREKTUR: Die verfügbare Variable verwenden
                />
              </animated.div>
            </div>
          </div>

          {/* Totals - verwenden bereits currentTotals, das angepasst wurde */}
          <div className="grid grid-cols-[0.5fr_5fr_5fr] gap-4 mt-4">
            <div className="text-gray-400 text-center pr-4">Total:</div>
            <div className="flex justify-center -ml-[30px]">
              <div className="text-2xl font-bold text-white w-[100px] text-center">
                {currentStatisticId === 'striche' 
                  ? currentTotals.striche.bottom 
                  : currentTotals.punkte.bottom}
              </div>
            </div>
            <div className="flex justify-center -ml-[12px]">
              <div className="text-2xl font-bold text-white w-[100px] text-center">
                {currentStatisticId === 'striche' 
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
                    currentStatisticId === mod.id 
                      ? 'bg-white/80 shadow-sm' 
                      : 'bg-gray-500/50'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* === NEU: Wrapper Div für Aktionsbuttons === */}
          <div id="resultat-action-area">
            {!isReadOnly ? (
              // --- NEUE BEDINGUNG: Unterscheidung Turnier / Normal ---
              isTournamentPasse ? (
                // --- TURNIERMODUS --- 
                <div className="mt-4">
                  <button 
                    onClick={handleCompletePasseClick} // NEUER HANDLER
                    className={`
                      w-full py-3 px-6 text-white rounded-lg font-medium text-base
                      transition-all duration-150
                      bg-blue-600 hover:bg-blue-700
                      flex items-center justify-center gap-2
                      leading-tight
                      ${shareButton.buttonClasses} // Wiederverwende Button-Stil?
                      ${isFinalizingSession ? 'opacity-70 cursor-wait' : ''} // NEU: Ladezustand-Styling
                    `}
                    disabled={isFinalizingSession} // NEU: Button während Laden deaktivieren
                  >
                    {isFinalizingSession ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Schließe Passe ab...
                      </>
                    ) : (
                      'Passe abschließen'
                    )}
                  </button>
                </div>
              ) : signingState === 'idle' ? (
                // --- NORMALER MODUS (IDLE STATE) ---
                <div 
                  // id="resultat-buttons-container" // Alte ID nicht mehr unbedingt nötig
                  className={`
                    grid gap-4 mt-4 
                    ${canNavigateForward && canNavigateBack
                      ? 'grid-cols-3' 
                      : 'grid-cols-2 justify-between' 
                    }
                  `}>
                  {/* Navigation Mode Buttons (wenn aktiv) */}
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
                      {["1 Spiel", "zurück"].map((line, i) => (<React.Fragment key={i}>{line}{i === 0 && <br />}</React.Fragment>))}
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
                    {["Jass", "beenden"].map((line, i) => (<React.Fragment key={i}>{line}{i === 0 && <br />}</React.Fragment>))}
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
                    {nextGameButtonText.split('\n').map((line, i) => (<React.Fragment key={i}>{line}{i === 0 && nextGameButtonText.includes('\n') && <br />}</React.Fragment>))}
                  </button>
                </div>
              ) : (
                // --- Signatur-Modus Button --- 
                <div /* id="resultat-signing-container" // Alte ID nicht mehr unbedingt nötig */ className="mt-4">
                  <button
                    onClick={handleSignatureClick}
                    className={`w-full bg-amber-400 text-white text-lg font-bold py-4 px-8 rounded-xl shadow-lg hover:bg-amber-500 transition-colors border-b-4 border-amber-600 active:scale-[0.98] active:border-b-2 disabled:opacity-50 disabled:cursor-not-allowed
                               ${(swipePosition === 'bottom' && team1Signed) || (swipePosition === 'top' && team2Signed) ? 'opacity-70 cursor-default' : ''}`}
                    disabled={ 
                      (signingState === 'waitingTeam1' && swipePosition === 'top') || // Warten auf T1, aber T2 sichtbar
                      (signingState === 'waitingTeam2' && swipePosition === 'bottom') || // Warten auf T2, aber T1 sichtbar
                      (swipePosition === 'bottom' && team1Signed) || // Team 1 (unten) hat bereits signiert
                      (swipePosition === 'top' && team2Signed)    // Team 2 (oben) hat bereits signiert
                    }
                  >
                    {(swipePosition === 'bottom' && team1Signed) || (swipePosition === 'top' && team2Signed)
                      ? 'SIGNIERT'
                      : `Signieren Team ${swipePosition === 'bottom' ? '1' : '2'}`
                    }
                  </button>
                </div>
              )
            ) : (
               // --- ReadOnly Modus: Keine Buttons oder nur Schliessen? ---
               <div className="h-16">{/* Platzhalter oder Schliessen-Button */}</div>
            )}
          </div>
          {/* === ENDE Wrapper Div === */}

        </animated.div>

        {/* JassFinishNotification einbinden */}
        <JassFinishNotification />
      </div>
    </>
  );
};

export default ResultatKreidetafel;