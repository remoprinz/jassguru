// src/store/gameStore.ts

import { create } from 'zustand';
import { useJassStore } from './jassStore';
import { calculateStricheCounts } from '../game/scoreCalculations';
import { 
  RoundEntry, 
  isJassRoundEntry, 
  determineNextStartingPlayer,
  getNextPlayer
} from '../types/jass';
import type { 
  TeamPosition, 
  PlayerNumber,
  PlayerNames,
  TeamScores, 
  StrichTyp,
  StricheRecord,
  JassColor,
  GameStore,
  GameState,
  HistoryState,
  WeisRoundEntry,
  JassRoundEntry,
  CardStyle
} from '../types/jass';
import { useUIStore } from './uiStore';
import { HISTORY_WARNING_MESSAGE } from '../components/notifications/HistoryWarnings';
import { jassAnalytics } from '../statistics/jassAnalytics';
import { useTimerStore } from './timerStore';
import { STRICH_WERTE } from '../config/GameSettings';
import { CARD_SYMBOL_MAPPINGS } from '../config/CardStyles';
import { createInitialHistoryState } from '../types/jass';

// Hilfsfunktion für die Farbenübersetzung (vereinfacht)
const getDBFarbe = (farbe: JassColor, cardStyle: CardStyle): string => {
  return CARD_SYMBOL_MAPPINGS[farbe][cardStyle];
};

// Hilfsfunktion für Farbe (am Anfang der Datei, nach den Imports)
const getFarbe = (entry: RoundEntry): JassColor | undefined => {
  return isJassRoundEntry(entry) ? entry.farbe : undefined;
};

// Explizite Typ-Initialisierungen
const initialTeamScores: TeamScores = { top: 0, bottom: 0 };

const initialStricheRecord: StricheRecord = { 
  berg: 0, 
  sieg: 0, 
  matsch: 0, 
  schneider: 0, 
  kontermatsch: 0 
};

// Explizite Verwendung von StrichTyp
const validStrichTypes: StrichTyp[] = ['berg', 'sieg', 'matsch', 'schneider', 'kontermatsch'];

// Explizite Verwendung von JassColor
// const validJassColors: JassColor[] = [
//   'Misère', 'Schellen', 'Schilten', 'Eichel', 'Rosen', 
//   'Une', 'Obe', '3x3', 'Quer', 'Slalom'
// ];

const initialPlayerNames: PlayerNames = { 
  1: '', 
  2: '', 
  3: '', 
  4: '' 
};

const calculateTotalScores = (weis: TeamScores, jass: TeamScores): TeamScores => ({
  top: weis.top + jass.top,
  bottom: weis.bottom + jass.bottom,
  weisPoints: weis
});

const createInitialState = (initialPlayer: PlayerNumber): GameState => ({
  currentPlayer: initialPlayer,
  startingPlayer: initialPlayer,
  initialStartingPlayer: initialPlayer,
  isGameStarted: false,
  currentRound: 1,
  weisPoints: { top: 0, bottom: 0 },
  jassPoints: { top: 0, bottom: 0 },
  scores: { top: 0, bottom: 0 },
  striche: {
    top: { ...initialStricheRecord },
    bottom: { ...initialStricheRecord }
  },
  roundHistory: [],
  currentRoundWeis: [],
  isGameCompleted: false,
  isRoundCompleted: false,
  farbeSettings: {
    colors: [],
    multipliers: []
  },
  scoreSettings: {
    scores: [],
    enabled: []
  },
  playerNames: initialPlayerNames,
  currentHistoryIndex: -1,
  historyState: createInitialHistoryState(),
});

// Hilfsfunktionen für die History
const createRoundEntry = (
  state: GameState,
  store: GameStore,
  type: 'weis' | 'jass',
  options?: { 
    farbe?: JassColor; 
    strichType?: StrichTyp; 
    cardStyle?: CardStyle 
  }
): RoundEntry => {
  const { settings } = useUIStore.getState();
  const cardStyle = options?.cardStyle || settings.cardStyle;
  
  const baseEntry = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    roundId: state.currentRound,
    weisPoints: { ...state.weisPoints },
    jassPoints: { ...state.jassPoints },
    scores: { ...state.scores },
    weisActions: [...state.currentRoundWeis],
    currentPlayer: state.currentPlayer,
    visualStriche: {
      top: store.getVisualStriche('top'),
      bottom: store.getVisualStriche('bottom')
    },
    previousRoundId: state.roundHistory.length > 0 
      ? state.roundHistory[state.roundHistory.length - 1].roundId 
      : undefined,
    nextRoundId: undefined,
    roundState: {
      roundNumber: state.currentRound,
      nextPlayer: state.currentPlayer
    },
    striche: {  // NEU: Striche aus dem State mitgeben
      top: { ...state.striche.top },
      bottom: { ...state.striche.bottom }
    }
  };

  if (type === 'weis') {
    return {
      ...baseEntry,
      actionType: 'weis',
      isRoundFinalized: false,
      isCompleted: false
    } as WeisRoundEntry;
  }

  // Bei Jass-Runden die übersetzte Farbe verwenden
  return {
    ...baseEntry,
    actionType: 'jass',
    isRoundFinalized: true,
    isCompleted: true,
    farbe: options?.farbe ? getDBFarbe(options.farbe, cardStyle) : options?.farbe!,
    cardStyle: cardStyle,
    strichType: options?.strichType
  } as JassRoundEntry;
};

const validateScore = (score: number): number => Math.max(0, score);

// Konstanten für die Navigation
const NAVIGATION_COOLDOWN = 300; // 300ms Cooldown zwischen Navigationen

// Typ für die Navigationsrichtung
type NavigationDirection = 'forward' | 'backward';

// Hilfsfunktion für die Navigation
const calculateNewIndex = (
  currentIndex: number, 
  direction: NavigationDirection, 
  historyLength: number
): number => {
  const newIndex = direction === 'forward' 
    ? currentIndex + 1 
    : currentIndex - 1;
  
  // Boundary check
  return Math.min(Math.max(0, newIndex), historyLength - 1);
};

// Neue Hilfsfunktion für History-Management
const truncateFutureAndAddEntry = (state: GameState, newEntry: RoundEntry): Partial<GameState> => {
  const currentIndex = state.currentHistoryIndex;
  const newHistory = state.roundHistory.slice(0, currentIndex + 1);
  
  return {
    roundHistory: [...newHistory, newEntry],
    currentHistoryIndex: newHistory.length,
    historyState: {
      isNavigating: false,
      lastNavigationTimestamp: Date.now()
    }
  };
};

// Neue Helper-Funktion für einheitliches Logging
const logRoundDetails = (
  state: GameState,
  farbe: JassColor | undefined,
  score: number,
  opponentScore: number,
  strichType?: StrichTyp,
  team?: TeamPosition
) => {
  // Aktuelle Runde direkt aus dem Store
  const currentRoundId = state.currentRound;
  
  // Aktueller Spieler direkt aus dem Store
  const currentPlayer = state.currentPlayer;
  
  // Punkte dieser Runde
  const currentRoundPoints = {
    top: team === 'top' ? score : opponentScore,
    bottom: team === 'bottom' ? score : opponentScore
  };

  console.group('🎲 Runden-Details:');
  console.log({
    // Runde aus dem Store (NICHT erhöhen!)
    nummer: `Runde ${currentRoundId}`,
    
    // Spieler aus dem Store
    spieler: state.playerNames[currentPlayer] || `Spieler ${currentPlayer}`,
    
    // Farbe und Strich-Typ
    ...(farbe && { farbe }),
    ...(strichType && { strichTyp: strichType }),
    ...(team && { team }),
    
    // Punkte-Details
    punkte: {
      dieseRunde: currentRoundPoints,
      weis: {
        top: state.weisPoints.top,
        bottom: state.weisPoints.bottom,
        aktuelleRunde: state.currentRoundWeis
      },
      total: state.jassPoints
    },
    
    // Aktuelle Weis-Aktionen
    weis: state.currentRoundWeis,
    
    // Aktueller Striche-Stand
    striche: state.striche
  });

  // History-Log mit allen Details
  console.log('Gesamter Spielverlauf:', state.roundHistory.map(entry => ({
    roundId: entry.roundId,
    farbe: isJassRoundEntry(entry) ? entry.farbe : undefined,
    strichInfo: isJassRoundEntry(entry) ? entry.strichInfo : undefined,
    timestamp: new Date(entry.timestamp).toLocaleString('de-CH'),
    currentPlayer: entry.currentPlayer,
    points: {
      top: entry.jassPoints.top,
      bottom: entry.jassPoints.bottom
    },
    weisPoints: {
      top: entry.weisPoints.top,
      bottom: entry.weisPoints.bottom
    },
    totalPoints: {
      top: entry.scores.top,
      bottom: entry.scores.bottom
    }
  })));
  
  console.groupEnd();
};

// Hilfsfunktion für die Konvertierung (NEU)
const convertVisualToStriche = (
  visualStriche: { 
    top: { stricheCounts: Record<string, number>; restZahl: number };
    bottom: { stricheCounts: Record<string, number>; restZahl: number };
  }
): Record<TeamPosition, StricheRecord> => {
  // Wir müssen die tatsächlichen Striche aus dem visualStriche-Objekt extrahieren
  return {
    top: {
      berg: visualStriche.top.stricheCounts['berg'] || 0,
      sieg: visualStriche.top.stricheCounts['sieg'] || 0,
      matsch: visualStriche.top.stricheCounts['matsch'] || 0,
      schneider: visualStriche.top.stricheCounts['schneider'] || 0,
      kontermatsch: visualStriche.top.stricheCounts['kontermatsch'] || 0
    },
    bottom: {
      berg: visualStriche.bottom.stricheCounts['berg'] || 0,
      sieg: visualStriche.bottom.stricheCounts['sieg'] || 0,
      matsch: visualStriche.bottom.stricheCounts['matsch'] || 0,
      schneider: visualStriche.bottom.stricheCounts['schneider'] || 0,
      kontermatsch: visualStriche.bottom.stricheCounts['kontermatsch'] || 0
    }
  };
};

// Neue Hilfsfunktion für bessere Lesbarkeit
const isLatestState = (index: number, history: RoundEntry[]): boolean => {
  return index === history.length;
};

// Neue Hilfsfunktion für die Extraktion des States aus einem Entry
const extractStateFromEntry = (entry: RoundEntry) => ({
  weisPoints: entry.weisPoints,
  jassPoints: entry.jassPoints,
  scores: entry.scores,
  currentPlayer: entry.roundState.nextPlayer,
  currentRound: entry.roundState.roundNumber,
  striche: convertVisualToStriche(entry.visualStriche),
  isRoundCompleted: entry.isCompleted,
  currentRoundWeis: entry.weisActions,
  farbe: getFarbe(entry)
});

// Neue Hilfsfunktionen für bessere Lesbarkeit
const getActiveStrichTeam = (
  state: GameState, 
  type: StrichTyp  // NEU: Verwenden wir den StrichTyp aus jass.ts
) => {
  if (state.striche.top[type] > 0) return 'top';
  if (state.striche.bottom[type] > 0) return 'bottom';
  return undefined;
};

// Neue Hilfsfunktion für die Berechnung der Gesamtstriche
const calculateTotalStriche = (striche: StricheRecord): number => {
  return Object.values(striche).reduce((sum, count) => sum + count, 0);
};

// Hilfsfunktion für die Synchronisation mit dem JassStore
const syncWithJassStore = (state: GameState) => {
  const jassStore = useJassStore.getState();
  const currentGame = jassStore.getCurrentGame();
  if (!currentGame) return;

  // Wichtig: Aktualisiere das aktuelle Spiel im jassStore
  jassStore.updateCurrentGame({
    teams: {
      top: {
        ...currentGame.teams.top,
        striche: state.striche.top,
        jassPoints: state.jassPoints.top,
        weisPoints: state.weisPoints.top,
        total: state.scores.top
      },
      bottom: {
        ...currentGame.teams.bottom,
        striche: state.striche.bottom,
        jassPoints: state.jassPoints.bottom,
        weisPoints: state.weisPoints.bottom,
        total: state.scores.bottom
      }
    },
    roundHistory: state.roundHistory,
    currentRound: state.currentRound,
    currentPlayer: state.currentPlayer
  });
};

export const useGameStore = create<GameStore>((set, get) => {
  const defaultPlayer: PlayerNumber = 1;
  
  return {
    ...createInitialState(defaultPlayer),

    startGame: () => {
      const jassStore = useJassStore.getState();
      const isFirstGame = !jassStore.isJassStarted;
      const state = get();

      if (isFirstGame) {
        console.log('🎮 Starting first game of Jass');
        jassStore.startJass({
          playerNames: state.playerNames,
          initialStartingPlayer: state.currentPlayer
        });
      } else {
        console.log('🎮 Starting next game');
        const currentGame = jassStore.getCurrentGame() || null;
        const nextStartingPlayer = determineNextStartingPlayer(
          currentGame,
          state.currentPlayer
        );
        set({ currentPlayer: nextStartingPlayer });
        jassStore.startGame();
      }

      set({ isGameStarted: true });
    },

    // 3. Rundenstart (exakt wie vorher)
    startRound: () => {
      const state = get();
      const timerStore = useTimerStore.getState();

      // Wenn es die erste Runde ist, starten wir den Spiel-Timer
      if (state.currentRound === 1) {
        timerStore.startGameTimer();
      }

      // Neuen Timer für diese Runde starten
      timerStore.startRoundTimer();

      set(() => ({
        isRoundCompleted: false,
        farbe: undefined,
        currentRoundWeis: []
      }));
    },

    finalizeRound: (
      farbe: JassColor, 
      topScore: number, 
      bottomScore: number,
      strichInfo?: {
        team: TeamPosition,
        type: StrichTyp
      }
    ) => {
      const timerStore = useTimerStore.getState();
      const { settings } = useUIStore.getState(); // UI Store für cardStyle

      // Timer explizit zurücksetzen bevor wir einen neuen starten
      timerStore.resetRoundTimer();
      timerStore.startRoundTimer();

      set((state) => {
        const { strokeSettings } = useUIStore.getState(); // Hole aktuelle Stroke-Settings

        const newJassPoints = {
          top: state.jassPoints.top + topScore,
          bottom: state.jassPoints.bottom + bottomScore
        };

        const newStriche = { ...state.striche };
        let finalStrichType: StrichTyp | undefined;

        if (strichInfo) {
          const isTeamsTurn = state.currentPlayer % 2 === (strichInfo.team === 'top' ? 0 : 1);
          finalStrichType = isTeamsTurn ? 'matsch' : 'kontermatsch';
          
          // Verwende die korrekten Stroke-Settings
          const increment = finalStrichType === 'kontermatsch' 
            ? strokeSettings.kontermatsch 
            : STRICH_WERTE[finalStrichType];
          
          newStriche[strichInfo.team] = {
            ...newStriche[strichInfo.team],
            [finalStrichType]: newStriche[strichInfo.team][finalStrichType] + increment
          };

          console.log('🎲 Aktualisierte Striche:', {
            team: strichInfo.team,
            type: finalStrichType,
            settings: strokeSettings,
            increment,
            vorher: state.striche[strichInfo.team][finalStrichType],
            nachher: newStriche[strichInfo.team][finalStrichType]
          });
        }

        const totalScores = calculateTotalScores(state.weisPoints, newJassPoints);
        const nextPlayer = getNextPlayer(state.currentPlayer);

        // Erst den State aktualisieren
        const updatedState = {
          ...state,
          jassPoints: newJassPoints,
          scores: totalScores,
          striche: newStriche,
          isRoundCompleted: true,
          currentRound: state.currentRound + 1,
          currentPlayer: nextPlayer,  // Bereits berechneten nextPlayer verwenden
          currentRoundWeis: [],
          farbe
        };

        // Neuer History-Eintrag mit cardStyle
        const newEntry = createRoundEntry(updatedState, get(), 'jass', { 
          farbe, 
          strichType: finalStrichType,
          cardStyle: settings.cardStyle  // Neu: Kartenstil mitspeichern
        });

        // Direkt in jassStore aktualisieren
        const jassStore = useJassStore.getState();
        jassStore.updateCurrentGame({
          teams: {
            top: {
              jassPoints: newJassPoints.top,
              weisPoints: state.weisPoints.top,
              striche: newStriche.top,
              total: totalScores.top,
              bergActive: state.striche.top.berg > 0,
              bedankenActive: false,  // oder aus state wenn verfügbar
              isSigned: false,        // oder aus state wenn verfügbar
              playerStats: {          // oder aus state wenn verfügbar
                1: { striche: 0, points: 0, weisPoints: 0 },
                2: { striche: 0, points: 0, weisPoints: 0 },
                3: { striche: 0, points: 0, weisPoints: 0 },
                4: { striche: 0, points: 0, weisPoints: 0 }
              }
            },
            bottom: {
              jassPoints: newJassPoints.bottom,
              weisPoints: state.weisPoints.bottom,
              striche: newStriche.bottom,
              total: totalScores.bottom,
              bergActive: state.striche.bottom.berg > 0,
              bedankenActive: false,  // oder aus state wenn verfügbar
              isSigned: false,        // oder aus state wenn verfügbar
              playerStats: {          // oder aus state wenn verfügbar
                1: { striche: 0, points: 0, weisPoints: 0 },
                2: { striche: 0, points: 0, weisPoints: 0 },
                3: { striche: 0, points: 0, weisPoints: 0 },
                4: { striche: 0, points: 0, weisPoints: 0 }
              }
            }
          },
          roundHistory: [...state.roundHistory, newEntry],
          currentRound: state.currentRound + 1,
          currentPlayer: nextPlayer
        });

        // Timer für diese Runde stoppen
        timerStore.resetRoundTimer();
        // Timer für die nächste Runde starten
        timerStore.startRoundTimer();

        return {
          ...updatedState,
          roundHistory: [...state.roundHistory, newEntry],
          currentHistoryIndex: state.roundHistory.length
        };
      });
    },

    updateScore: (team, score, opponentScore) => {
      set((state) => {
        const newScores = { ...state.scores };
        const oppositeTeam: TeamPosition = team === 'top' ? 'bottom' : 'top';
        newScores[team] = validateScore(score);
        newScores[oppositeTeam] = validateScore(opponentScore);
        return { scores: newScores };
      });
    },

    addStrich: (team: TeamPosition, type: StrichTyp) => {
      set(state => {
        // Neues Striche-Objekt mit allen Kategorien
        const newStriche = {
          ...state.striche[team],
          [type]: state.striche[team][type] + 1
        };

        // Sofortige Synchronisation mit JassStore
        const jassStore = useJassStore.getState();
        jassStore.updateCurrentGame({
          teams: {
            [team]: {
              striche: newStriche // Übergebe kompletten StricheRecord
            }
          }
        });

        // Debug-Logging
        console.log('🎲 Strich hinzugefügt:', {
          team,
          type,
          newValue: newStriche[type],
          allStriche: newStriche
        });

        return {
          ...state,
          striche: {
            ...state.striche,
            [team]: newStriche
          }
        };
      });
    },

    addWeisPoints: (team: TeamPosition, points: number) => {
      console.trace('🔍 addWeisPoints called from:');  // Zeigt den Stack-Trace
      set((state) => {
        const newWeisPoints = { ...state.weisPoints };
        newWeisPoints[team] += points;
        
        const newScores = calculateTotalScores(
          newWeisPoints,
          state.jassPoints
        );
        
        const newWeisAction = { position: team, points };
        
        const newEntry = createRoundEntry(
          { 
            ...state,
            weisPoints: newWeisPoints,
            scores: newScores,
            currentRoundWeis: [...state.currentRoundWeis, newWeisAction],
            currentRound: state.currentRound
          },
          get(),
          'weis'
        );

        const historyUpdate = truncateFutureAndAddEntry(state, newEntry);
        
        return {
          ...state,
          weisPoints: newWeisPoints,
          scores: newScores,
          currentRoundWeis: [...state.currentRoundWeis, newWeisAction],
          ...historyUpdate
        };
      });

      // Debug-Log für bessere Nachverfolgung
      const updatedState = get();
      console.group('🎲 WEIS UPDATE:');
      console.log('Team:', team);
      console.log('Points:', points);
      console.log('New State:', {
        weisPoints: updatedState.weisPoints,
        currentRoundWeis: updatedState.currentRoundWeis,
        scores: updatedState.scores
      });
      console.groupEnd();
    },

    undoLastWeis: () => {
      set((state) => ({
        currentRoundWeis: state.currentRoundWeis.slice(0, -1)
      }));
    },

    finalizeGame: () => {
      set(() => ({
        isGameCompleted: true
      }));
    },

    resetGame: () => {
      const jassStore = useJassStore.getState();
      const state = get();
      
      set((state) => ({
        ...createInitialState(state.currentPlayer),  // Behalte aktuellen Spieler
        playerNames: jassStore.currentSession?.playerNames || state.playerNames,
        scoreSettings: state.scoreSettings,    // Behalte Score-Settings
        farbeSettings: state.farbeSettings     // Behalte Farben-Settings
      }));
    },

    resetGamePoints: () => {
      set(() => ({
        scores: { top: 0, bottom: 0 }
      }));
    },

    setScore: (team, score) => {
      set((state) => {
        const newScores = { ...state.scores };
        newScores[team] = validateScore(score);
        return { scores: newScores };
      });
    },

    setPlayerNames: (names) => {
      set(() => ({ playerNames: names }));
    },

    updateScoreByStrich: (position: TeamPosition, points: number) => {
      const state = get();
      const { showHistoryWarning } = useUIStore.getState();
      
      const updatePoints = () => {
        set(state => {
          const newScores = { ...state.scores };
          newScores[position] += points;
          
          const newEntry = createRoundEntry(
            { ...state, scores: newScores },
            get(),
            'jass'
          );

          const historyUpdate = truncateFutureAndAddEntry(state, newEntry);
          
          return {
            scores: newScores,
            ...historyUpdate
          };
        });
      };

      if (state.currentHistoryIndex < state.roundHistory.length - 1) {
        showHistoryWarning({
          message: HISTORY_WARNING_MESSAGE,
          onConfirm: updatePoints,
          onCancel: () => get().jumpToLatest()
        });
        return;
      }

      // Direkte Ausführung wenn nicht in der Vergangenheit
      updatePoints();
    },

    getVisualStriche: (position: TeamPosition) => {
      const state = get();
      const score = state.scores[position];
      const { striche, restZahl } = calculateStricheCounts(score);
      
      return {
        stricheCounts: {
          20: striche['20'],
          50: striche['50'],
          100: striche['100']
        },
        restZahl
      };
    },

    showHistoryWarning: (
      message: string, 
      onConfirm: () => void,
      onCancel: () => void = () => get().jumpToLatest()
    ) => {
      const state = get();
      if (state.currentHistoryIndex < state.roundHistory.length - 1) {
        const uiStore = useUIStore.getState();
        uiStore.showHistoryWarning({
          message,
          onConfirm,
          onCancel
        });
      } else {
        onConfirm();
      }
    },

    // Neue History-Navigation Actions
    navigateHistory: (direction: NavigationDirection) => {
      set(state => {
        const now = Date.now();
        
        if (state.historyState.isNavigating && 
            (now - state.historyState.lastNavigationTimestamp) < NAVIGATION_COOLDOWN) {
          return state;
        }

        const newIndex = direction === 'forward' 
          ? state.currentHistoryIndex + 1 
          : state.currentHistoryIndex - 1;

        // Wichtig: Erlaube Navigation zu -1 für den initialen Zustand
        if (newIndex === -1) {
          const initialState = {
            ...createInitialState(state.startingPlayer),
            playerNames: state.playerNames,
            roundHistory: state.roundHistory,
            currentHistoryIndex: -1,
            scores: { top: 0, bottom: 0 },       // Explizit auf 0 setzen
            weisPoints: { top: 0, bottom: 0 },   // Explizit auf 0 setzen
            jassPoints: { top: 0, bottom: 0 },   // Explizit auf 0 setzen
            striche: {                           // Explizit auf 0 setzen
              top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
              bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
            },
            historyState: {
              isNavigating: true,
              lastNavigationTimestamp: now
            }
          };

          // Synchronisiere mit JassStore
          syncWithJassStore(initialState);
          return initialState;
        }

        const targetEntry = state.roundHistory[newIndex];
        const timerStore = useTimerStore.getState();
        const jassStore = useJassStore.getState();  // Hole den jassStore
        
        if (direction === 'forward') {
          // Beim Vorwärtsgehen Timer explizit reaktivieren
          timerStore.reactivateGameTimer(jassStore.currentGameId);  // Verwende currentGameId vom jassStore
        } else if (targetEntry?.timerSnapshot) {
          // Beim Rückwärtsgehen Timer-Snapshot wiederherstellen
          timerStore.restoreTimerSnapshot(targetEntry.timerSnapshot);
        }

        // Historischen Spielzustand wiederherstellen
        const newState = {
          ...state,
          currentRound: targetEntry.roundState.roundNumber,
          currentPlayer: targetEntry.roundState.nextPlayer,
          weisPoints: targetEntry.weisPoints,
          jassPoints: targetEntry.jassPoints,
          scores: targetEntry.scores,
          striche: targetEntry.striche,
          currentRoundWeis: targetEntry.weisActions,
          currentHistoryIndex: newIndex,
          historyState: {
            isNavigating: true,
            lastNavigationTimestamp: now
          }
        };

        syncWithJassStore(newState);
        return newState;
      });
    },

    canNavigateForward: () => {
      const state = get();
      return state.currentHistoryIndex < state.roundHistory.length - 1;
    },

    canNavigateBackward: () => {
      const state = get();
      return state.currentHistoryIndex > -1;
    },

    jumpToLatest: () => {
      set(state => {
        const lastIndex = state.roundHistory.length - 1;
        if (lastIndex === state.currentHistoryIndex) return state;

        const latestEntry = state.roundHistory[lastIndex];
        
        // Timer-Zustand wiederherstellen
        if (latestEntry.timerSnapshot) {
          const timerStore = useTimerStore.getState();
          timerStore.restoreTimerSnapshot(latestEntry.timerSnapshot);
        }

        return {
          ...state,
          currentRound: latestEntry.roundState.roundNumber,
          currentPlayer: latestEntry.roundState.nextPlayer,
          weisPoints: latestEntry.weisPoints,
          jassPoints: latestEntry.jassPoints,
          scores: latestEntry.scores,
          striche: latestEntry.striche,
          currentRoundWeis: latestEntry.weisActions,
          currentHistoryIndex: lastIndex,
          historyState: {
            isNavigating: true,
            lastNavigationTimestamp: Date.now()
          }
        };
      });
    },

    // Hilfsmethoden für History-Management
    validateHistoryAction: () => {
      const state = get();
      return state.currentHistoryIndex === state.roundHistory.length - 1;
    },

    syncHistoryState: (entry: RoundEntry) => {
      set(state => ({
        ...state,
        roundHistory: [...state.roundHistory, entry],
        currentHistoryIndex: state.roundHistory.length,
        historyState: {
          isNavigating: false,
          lastNavigationTimestamp: Date.now()
        }
      }));
    },

    logGameHistory: () => {
      const state = get();
      const gameHistory = state.roundHistory
        .filter(entry => entry.isRoundFinalized)
        .map(entry => ({
          roundId: entry.roundId,
          farbe: entry.actionType === 'jass' ? entry.farbe : undefined,
          strichInfo: entry.actionType === 'jass' ? entry.strichInfo : undefined,
          timestamp: new Date(entry.timestamp).toLocaleString('de-CH'),
          points: {
            top: entry.jassPoints.top,
            bottom: entry.jassPoints.bottom
          },
          weisPoints: {
            top: entry.weisPoints.top,
            bottom: entry.weisPoints.bottom
          },
          totalPoints: {
            top: entry.scores.top,
            bottom: entry.scores.bottom
          }
        }));

      console.log('Spielverlauf:', gameHistory);
      return gameHistory;
    },

    updateWeisPoints: (position: TeamPosition, points: number) => {
      const state = get();
      
      set(state => {
        // 1. Neue Weis-Punkte
        const newWeisPoints = { ...state.weisPoints };
        newWeisPoints[position] += points;
        
        // 2. Neue Gesamt-Punkte
        const newScores = {
          top: state.jassPoints.top + newWeisPoints.top,
          bottom: state.jassPoints.bottom + newWeisPoints.bottom
        };

        // 3. Neue Weis-Aktion
        const newWeisAction = { position, points };
        
        // 4. Neuer History-Eintrag
        const newEntry = createRoundEntry(
          { 
            ...state,
            weisPoints: newWeisPoints,
            scores: newScores,
            currentRoundWeis: [...state.currentRoundWeis, newWeisAction]
          },
          get(),
          'weis'
        );

        // 5. History aktualisieren
        const historyUpdate = truncateFutureAndAddEntry(state, newEntry);
        
        console.log('🎲 Weis-Update:', {
          position,
          points,
          newWeisPoints,
          newScores
        });

        return {
          ...state,
          weisPoints: newWeisPoints,
          scores: newScores,
          currentRoundWeis: [...state.currentRoundWeis, newWeisAction],
          ...historyUpdate
        };
      });
    },

    restoreRoundState: (entry: RoundEntry) => {
      set(state => ({
        ...state,
        currentRound: entry.roundState.roundNumber,
        currentPlayer: entry.roundState.nextPlayer
      }));
    },

    // Neue Funktionen hinzufügen
    isBergActive: (team: TeamPosition) => {
      const state = get();
      return state.striche[team].berg > 0;
    },
    
    isSiegActive: (team: TeamPosition) => {
      const state = get();
      return state.striche[team].sieg > 0;
    },

    addBerg: (team: TeamPosition) => {
      set(state => {
        const { scoreSettings } = useUIStore.getState();
        
        if (!scoreSettings?.enabled?.berg) return state;

        const activeTeam = getActiveStrichTeam(state, 'berg');
        const newStriche = { ...state.striche };
        
        if (activeTeam === team) {
          newStriche[team].berg = 0;
        } else if (!activeTeam) {
          const otherTeam = team === 'top' ? 'bottom' : 'top';
          newStriche[team].berg = 1;
          newStriche[otherTeam].berg = 0;
        }

        const newState = {
          ...state,
          striche: newStriche
        };

        // Wichtig: Synchronisiere mit JassStore
        syncWithJassStore(newState);
        return newState;
      });
    },

    addSieg: (team: TeamPosition) => {
      set(state => {
        const { scoreSettings, strokeSettings } = useUIStore.getState();
        const activeTeam = getActiveStrichTeam(state, 'sieg');
        
        // Wenn Berg aktiviert ist, prüfen ob ein Berg existiert
        const bergCheck = scoreSettings?.enabled?.berg 
          ? (state.striche.top.berg > 0 || state.striche.bottom.berg > 0)
          : true;
        
        // Basisstruktur für die Striche
        const baseStriche = {
          ...state.striche
        };

        // Wenn das Team bereits Sieg hat -> komplett entfernen
        if (activeTeam === team) {
          baseStriche[team] = {
            ...baseStriche[team],
            sieg: 0,
            schneider: 0
          };

          const newState = { striche: baseStriche };
          syncWithJassStore({ ...state, ...newState });
          return newState;
        }
        
        // Sieg kann gesetzt werden wenn:
        // - Berg deaktiviert ist ODER
        // - Berg aktiviert ist UND existiert
        if (!activeTeam && bergCheck) {
          const otherTeam = team === 'top' ? 'bottom' : 'top';
          
          // Setze Sieg für aktives Team
          baseStriche[team] = {
            ...baseStriche[team],
            sieg: STRICH_WERTE.sieg
          };
          
          // Entferne Sieg und Schneider vom anderen Team
          baseStriche[otherTeam] = {
            ...baseStriche[otherTeam],
            sieg: 0,
            schneider: 0
          };

          // Automatische Schneider-Prüfung
          if (scoreSettings?.enabled?.schneider) {
            const otherTeamPoints = state.scores[otherTeam];
            if (otherTeamPoints < scoreSettings.values.schneider) {
              baseStriche[team].schneider = strokeSettings.schneider;
            }
          }

          const newState = { striche: baseStriche };
          syncWithJassStore({ ...state, ...newState });
          return newState;
        }

        return {};
      });
    },

    addSchneider: (team: TeamPosition) => {
      set(state => {
        const { scoreSettings, strokeSettings } = useUIStore.getState();
        
        // Debug-Logging
        console.log('🎲 Settings beim Schneider:', {
          scoreSettings,
          strokeSettings,
          team,
          currentStriche: state.striche[team]
        });

        // 1. Prüfen ob das Team SIEG hat
        const hasSieg = state.striche[team].sieg > 0;
        if (!hasSieg) return state;

        // 2. Gegnerteam bestimmen und Punkte prüfen
        const otherTeam = team === 'top' ? 'bottom' : 'top';
        const otherTeamPoints = state.scores[otherTeam];
        
        // Verwende die Score-Settings für den Schwellenwert
        const isSchneider = scoreSettings.enabled.schneider && 
          otherTeamPoints < scoreSettings.values.schneider;

        // 3. SCHNEIDER-Striche setzen wenn Bedingungen erfüllt
        return {
          ...state,
          striche: {
            ...state.striche,
            [team]: {
              ...state.striche[team],
              schneider: isSchneider ? strokeSettings.schneider : 0
            },
            [otherTeam]: {
              ...state.striche[otherTeam],
              schneider: 0
            }
          }
        };
      });
    },

    addMatsch: (team: TeamPosition) => {
      set(state => {
        // Prüfen ob wir in der Vergangenheit sind
        if (state.currentHistoryIndex < state.roundHistory.length - 1) {
          const { showHistoryWarning } = useUIStore.getState();
          showHistoryWarning({
            message: 'Möchten Sie wirklich einen Matsch in der Vergangenheit hinzufügen?',
            onConfirm: () => get().addMatsch(team),
            onCancel: () => get().jumpToLatest()
          });
          return state;
        }

        const newStriche = {
          ...state.striche,
          [team]: {
            ...state.striche[team],
            matsch: state.striche[team].matsch + 1
          }
        };

        // Neuen History-Eintrag erstellen
        const newEntry = createRoundEntry(
          { ...state, striche: newStriche },
          get(),
          'jass',
          { strichType: 'matsch' }
        );

        const historyUpdate = truncateFutureAndAddEntry(state, newEntry);

        return {
          ...state,
          striche: newStriche,
          ...historyUpdate
        };
      });
    },

    // Neue Getter-Methode für die Gesamtstriche
    getTotalStriche: (team: TeamPosition): number => {
      const state = get();
      const { scoreSettings } = useUIStore.getState();
      const striche = state.striche[team];

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
    },

    completeRound: () => {
      const timerStore = useTimerStore.getState();
      
      set(state => ({
        ...state,
        isRoundCompleted: true,
        currentRound: state.currentRound + 1
      }));

      // Timer auf null setzen
      timerStore.resetRoundTimer();
    },

    // Neue Methode für Kontermatsch
    addKontermatsch: (team: TeamPosition) => {
      set(state => {
        if (state.currentHistoryIndex < state.roundHistory.length - 1) {
          const { showHistoryWarning } = useUIStore.getState();
          showHistoryWarning({
            message: 'Möchten Sie wirklich einen Kontermatsch in der Vergangenheit hinzufügen?',
            onConfirm: () => get().addKontermatsch(team),
            onCancel: () => get().jumpToLatest()
          });
          return state;
        }

        const newStriche = {
          ...state.striche,
          [team]: {
            ...state.striche[team],
            kontermatsch: state.striche[team].kontermatsch + 1
          }
        };

        // Neuen History-Eintrag erstellen
        const newEntry = createRoundEntry(
          { ...state, striche: newStriche },
          get(),
          'jass',
          { strichType: 'kontermatsch' }
        );

        const historyUpdate = truncateFutureAndAddEntry(state, newEntry);

        return {
          ...state,
          striche: newStriche,
          ...historyUpdate
        };
      });
    },
  };
});

// Debug-Listener für State-Updates
useGameStore.subscribe(state => {
  console.log('🔄 GameStore State nach Update:', {
    currentPlayer: state.currentPlayer,
    startingPlayer: state.startingPlayer,
    currentRound: state.currentRound,
    isRoundCompleted: state.isRoundCompleted
  });
});

