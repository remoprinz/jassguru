// gameStore.tsx
import { create } from 'zustand';
import { GameSettings, defaultGameSettings, validateGameSettings, BERG_SCORE, SIEG_SCORE, SCHNEIDER_SCORE } from '../config/GameSettings';
import { validateAndClampScore } from '../game/GameLogic';
import { useJassStore } from './jassStore';
import { calculateStricheCounts } from '../game/scoreCalculations';

interface WeisAction {
  points: number;
  position: 'top' | 'bottom';
}

export interface ScoreHistoryEntry {
  topScore: number;
  bottomScore: number;
  topRounds: number;
  bottomRounds: number;
  totalPoints: {
    top: number;
    bottom: number;
  };
  weisPoints: {
    top: number;
    bottom: number;
  };
  currentPlayer: number;
  currentRound: number;
  farbe?: string;
  stricheCounts: { top: Record<number, number>, bottom: Record<number, number> };
  restZahlen: { top: number; bottom: number };
  weisActions: WeisAction[];
  isRoundCompleted: boolean;
}

interface TeamTiming {
  totalTime: number;
  lastStartTime: number | null;
}

interface GameState extends Omit<ScoreHistoryEntry, 'weisActions' | 'isRoundCompleted'> {
  currentHistoryIndex: number;
  scoreHistory: ScoreHistoryEntry[];
  settings: GameSettings;
  isCalculatorFlipped: boolean;
  currentRoundWeis: WeisAction[];
  isRoundCompleted: boolean;
  isGameStarted: boolean;
  isGameCompleted: boolean;
  isJassCompleted: boolean;
  gameStartTime: number | null;
  roundStartTime: number | null;
  teamTimings: {
    top: TeamTiming;
    bottom: TeamTiming;
  };
  isPaused: boolean;
  pauseStartTime: number | null;
  currentMultiplier: Multiplier;
  historyWarning: {
    isVisible: boolean;
    message: string;
    pendingAction: (() => void) | null;
  };
  lastDoubleClickPosition: 'top' | 'bottom' | null;
  isGameInfoOpen: boolean;
}

type GameStore = GameState & {
  setTopScore: (score: number) => void;
  setBottomScore: (score: number) => void;
  incrementTopRound: () => void;
  incrementBottomRound: () => void;
  updateSettings: (newSettings: Partial<GameSettings>) => void;
  resetGame: () => void;
  updateScore: (position: 'top' | 'bottom', score: number, opponentScore: number) => void;
  addToHistory: () => void;
  navigateHistory: (direction: 'forward' | 'backward') => void;
  incrementCurrentPlayer: () => void;
  incrementCurrentRound: () => void;
  setCalculatorFlipped: (flipped: boolean) => void;
  updateScoreByStrich: (position: 'top' | 'bottom', value: number) => void;
  updateStricheCounts: (position: 'top' | 'bottom', value: number, count: number) => void;
  resetStricheCounts: (position: 'top' | 'bottom') => void;
  resetRestZahl: () => void;
  updateRestZahl: (position: 'top' | 'bottom', restZahl: number) => void;
  addWeisPoints: (position: 'top' | 'bottom', points: number) => void;
  undoLastWeis: () => void;
  finalizeRound: (farbe: string) => void;
  startGame: () => void;
  finalizeGame: () => void;
  finalizeJass: () => void;
  startTeamTurn: (player: number) => void;
  pauseGame: () => void;
  resumeGame: () => void;
  getRemainingPoints: (position: 'top' | 'bottom') => { title: string; remaining: number };
  setMultiplier: (multiplier: Multiplier) => void;
  getDividedPoints: (points: number) => number;
  showHistoryWarning: (message: string, action: () => void) => void;
  hideHistoryWarning: () => void;
  executePendingAction: () => void;
  jumpToLatest: () => void;
  setIsGameInfoOpen: (isOpen: boolean) => void;
  determineNextStartingPlayer: () => number;
  startNewGame: () => void;
};

// Neue Typen
type Multiplier = 2 | 3 | 4 | 5 | 6 | 7;

// Hilfsfunktionen
const createStateSnapshot = (state: Partial<GameState>): ScoreHistoryEntry => ({
  topScore: state.topScore ?? 0,
  bottomScore: state.bottomScore ?? 0,
  topRounds: state.topRounds ?? 0,
  bottomRounds: state.bottomRounds ?? 0,
  totalPoints: state.totalPoints ?? { top: 0, bottom: 0 },
  weisPoints: state.weisPoints ?? { top: 0, bottom: 0 },
  currentPlayer: state.currentPlayer ?? 1,
  currentRound: state.currentRound ?? 1,
  stricheCounts: state.stricheCounts ?? { top: {}, bottom: {} },
  restZahlen: state.restZahlen ?? { top: 0, bottom: 0 },
  farbe: state.farbe,
  weisActions: state.currentRoundWeis ?? [],
  isRoundCompleted: state.isRoundCompleted ?? false
});

const createScoreUpdate = (state: GameState, position: 'top' | 'bottom', points: number) => {
  const newTotalPoints: { top: number; bottom: number } = {
    ...state.totalPoints,
    [position]: state.totalPoints[position] + points
  };

  return {
    [`${position}Score`]: state[`${position}Score`] + points,
    totalPoints: newTotalPoints
  };
};

export const useGameStore = create<GameStore>((set, get) => ({
  // Initial state
  topScore: 0,
  bottomScore: 0,
  topRounds: 0,
  bottomRounds: 0,
  settings: defaultGameSettings,
  scoreHistory: [],
  currentHistoryIndex: -1,
  currentPlayer: 1,
  currentRound: 1,
  isCalculatorFlipped: false,
  stricheCounts: { top: {}, bottom: {} },
  restZahlen: { top: 0, bottom: 0 },
  totalPoints: { top: 0, bottom: 0 },
  weisPoints: { top: 0, bottom: 0 },
  farbe: undefined,
  currentRoundWeis: [],
  isRoundCompleted: false,
  isGameStarted: false,
  isGameCompleted: false,
  isJassCompleted: false,
  gameStartTime: null,
  roundStartTime: null,
  teamTimings: {
    top: { totalTime: 0, lastStartTime: null },
    bottom: { totalTime: 0, lastStartTime: null }
  },
  isPaused: false,
  pauseStartTime: null,
  currentMultiplier: 7,
  historyWarning: {
    isVisible: false,
    message: '',
    pendingAction: null
  },
  lastDoubleClickPosition: null,
  isGameInfoOpen: false,

  // Actions
  setTopScore: (score: number) => set({ topScore: score }),
  setBottomScore: (score: number) => set({ bottomScore: score }),
  incrementTopRound: () => set((state) => ({ topRounds: state.topRounds + 1 })),
  incrementBottomRound: () => set((state) => ({ bottomRounds: state.bottomRounds + 1 })),
  
  updateSettings: (newSettings: Partial<GameSettings>) => set((state) => {
    const mergedSettings = { ...state.settings, ...newSettings };
    if (validateGameSettings(mergedSettings)) {
      return { settings: mergedSettings };
    }
    console.error('Ungültige Spieleinstellungen');
    return state;
  }),

  resetGame: () => set((state) => {
    const initialHistoryEntry = createStateSnapshot({
      topScore: 0,
      bottomScore: 0,
      topRounds: 0,
      bottomRounds: 0,
      currentPlayer: 1,
      currentRound: 1,
      totalPoints: { top: 0, bottom: 0 },
      weisPoints: { top: 0, bottom: 0 },
      stricheCounts: { top: {}, bottom: {} },
      restZahlen: { top: 0, bottom: 0 }
    });

    return {
      ...state,
      topScore: 0,
      bottomScore: 0,
      topRounds: 0,
      bottomRounds: 0,
      currentHistoryIndex: 0,
      scoreHistory: [initialHistoryEntry],
      currentPlayer: 1,
      currentRound: 1,
      stricheCounts: { top: {}, bottom: {} },
      restZahlen: { top: 0, bottom: 0 },
      totalPoints: { top: 0, bottom: 0 },
      weisPoints: { top: 0, bottom: 0 },
      isGameStarted: false,
      isGameCompleted: false,
      isJassCompleted: false,
      gameStartTime: null,
      roundStartTime: null,
      teamTimings: {
        top: { totalTime: 0, lastStartTime: null },
        bottom: { totalTime: 0, lastStartTime: null }
      }
    };
  }),

  updateScore: (position: 'top' | 'bottom', score: number, opponentScore: number) => 
    set((state) => {
      const oppositePosition = position === 'top' ? 'bottom' : 'top';
      const scores = {
        [position]: validateAndClampScore(state[`${position}Score`] + score),
        [oppositePosition]: validateAndClampScore(state[`${oppositePosition}Score`] + opponentScore)
      };
      
      const stricheCounts = {
        top: calculateStricheCounts(scores.top).striche,
        bottom: calculateStricheCounts(scores.bottom).striche
      };

      const newTotalPoints = {
        top: position === 'top' ? state.totalPoints.top + score : state.totalPoints.top,
        bottom: position === 'bottom' ? state.totalPoints.bottom + score : state.totalPoints.bottom
      };

      const newState = {
        topScore: scores.top,
        bottomScore: scores.bottom,
        currentRound: state.currentRound + 1,
        currentPlayer: (state.currentPlayer % 4) + 1,
        stricheCounts,
        totalPoints: newTotalPoints,
        restZahlen: {
          top: scores.top % 10,
          bottom: scores.bottom % 10
        },
        roundStartTime: Date.now(),
        teamTimings: {
          top: { totalTime: 0, lastStartTime: null },
          bottom: { totalTime: 0, lastStartTime: null }
        }
      };

      return {
        ...newState,
        scoreHistory: [
          ...state.scoreHistory.slice(0, state.currentHistoryIndex + 1),
          createStateSnapshot({ ...state, ...newState })
        ],
        currentHistoryIndex: state.currentHistoryIndex + 1
      };
    }),

  addToHistory: () => set((state) => ({
    scoreHistory: [
      ...state.scoreHistory.slice(0, state.currentHistoryIndex + 1),
      createStateSnapshot(state)
    ],
    currentHistoryIndex: state.currentHistoryIndex + 1
  })),

  navigateHistory: (direction: 'forward' | 'backward') => set((state) => {
    const newIndex = direction === 'forward'
      ? Math.min(state.currentHistoryIndex + 1, state.scoreHistory.length - 1)
      : Math.max(state.currentHistoryIndex - 1, 0);

    if (newIndex === state.currentHistoryIndex) return state;

    const entry = state.scoreHistory[newIndex];
    return { ...entry, currentHistoryIndex: newIndex };
  }),

  incrementCurrentPlayer: () => set((state) => ({ 
    currentPlayer: (state.currentPlayer % 4) + 1 
  })),

  incrementCurrentRound: () => set((state) => ({
    currentRound: state.currentRound + 1
  })),
  
  setCalculatorFlipped: (flipped: boolean) => set({ 
    isCalculatorFlipped: flipped 
  }),

  updateScoreByStrich: (position: 'top' | 'bottom', value: number) => set((state) => {
    const newScore = state[`${position}Score`] + value;
    const { striche, restZahl } = calculateStricheCounts(newScore);

    const newState = {
      [`${position}Score`]: newScore,
      stricheCounts: {
        ...state.stricheCounts,
        [position]: striche
      },
      restZahlen: {
        ...state.restZahlen,
        [position]: restZahl
      }
    };

    return {
      ...newState,
      scoreHistory: [
        ...state.scoreHistory.slice(0, state.currentHistoryIndex + 1),
        createStateSnapshot({ ...state, ...newState })
      ],
      currentHistoryIndex: state.currentHistoryIndex + 1
    };
  }),

  updateStricheCounts: (position: 'top' | 'bottom', value: number, count: number) => 
    set((state) => ({
      stricheCounts: {
        ...state.stricheCounts,
        [position]: {
          ...state.stricheCounts[position],
          [value]: count
        }
      }
    })),

  resetStricheCounts: (position: 'top' | 'bottom') => set((state) => ({
    stricheCounts: {
      ...state.stricheCounts,
      [position]: {}
    }
  })),

  resetRestZahl: () => set(state => ({
    topScore: Math.floor(state.topScore / 10) * 20,
    bottomScore: Math.floor(state.bottomScore / 10) * 20,
    stricheCounts: { top: {}, bottom: {} },
    restZahlen: { top: 0, bottom: 0 }
  })),

  updateRestZahl: (position: 'top' | 'bottom', restZahl: number) => set(state => ({
    restZahlen: {
      ...state.restZahlen,
      [position]: restZahl
    }
  })),

  addWeisPoints: (position: 'top' | 'bottom', points: number) => set((state) => ({
    currentRoundWeis: [...state.currentRoundWeis, { points, position }]
  })),

  undoLastWeis: () => set((state) => ({
    currentRoundWeis: state.currentRoundWeis.slice(0, -1)
  })),

  finalizeRound: (farbe: string) => set((state) => {
    const weisTotal = state.currentRoundWeis.reduce((totals, action) => ({
      ...totals,
      [action.position]: totals[action.position] + action.points
    }), { top: 0, bottom: 0 });

    const newState = {
      topScore: state.topScore + weisTotal.top,
      bottomScore: state.bottomScore + weisTotal.bottom,
      weisPoints: {
        top: state.weisPoints.top + weisTotal.top,
        bottom: state.weisPoints.bottom + weisTotal.bottom
      },
      farbe,
      isRoundCompleted: true,
      currentRoundWeis: [],
      roundStartTime: Date.now(),
      currentRound: state.currentRound + 1,
      currentPlayer: (state.currentPlayer % 4) + 1,
      teamTimings: {
        top: { totalTime: 0, lastStartTime: null },
        bottom: { totalTime: 0, lastStartTime: null }
      }
    };

    return {
      ...newState,
      scoreHistory: [
        ...state.scoreHistory.slice(0, state.currentHistoryIndex + 1),
        createStateSnapshot({ ...state, ...newState })
      ],
      currentHistoryIndex: state.currentHistoryIndex + 1
    };
  }),

  startGame: () => set((state) => ({
    ...state,
    isGameStarted: true,
    gameStartTime: Date.now(),
    roundStartTime: Date.now(),
    currentRound: 1,
    currentPlayer: 1,
    teamTimings: {
      top: { totalTime: 0, lastStartTime: Date.now() },  // Spieler 1 startet (top)
      bottom: { totalTime: 0, lastStartTime: null }
    },
    scoreHistory: [createStateSnapshot(state)],
    currentHistoryIndex: 0
  })),

  finalizeGame: () => set((state) => {
    // Letzte Team-Zeit berechnen
    const activeTeam = state.currentPlayer <= 2 ? 'top' : 'bottom';
    const lastTeamTime = state.teamTimings[activeTeam].lastStartTime
      ? Date.now() - state.teamTimings[activeTeam].lastStartTime
      : 0;

    const finalTeamTimings = {
      ...state.teamTimings,
      [activeTeam]: {
        totalTime: state.teamTimings[activeTeam].totalTime + lastTeamTime,
        lastStartTime: null
      }
    };

    return {
      ...state,
      isGameCompleted: true,
      isRoundCompleted: true,
      teamTimings: finalTeamTimings,
      scoreHistory: [
        ...state.scoreHistory,
        createStateSnapshot({
          ...state,
          isGameCompleted: true,
          isRoundCompleted: true,
          teamTimings: finalTeamTimings
        })
      ],
      currentHistoryIndex: state.currentHistoryIndex + 1
    };
  }),

  finalizeJass: () => set((state) => ({
    ...state,
    isJassCompleted: true,
    scoreHistory: [
      ...state.scoreHistory,
      createStateSnapshot({
        ...state,
        isJassCompleted: true
      })
    ],
    currentHistoryIndex: state.currentHistoryIndex + 1
  })),

  startTeamTurn: (player: number) => set((state) => {
    const team = player === 1 || player === 3 ? 'bottom' : 'top';
    const oppositeTeam = team === 'top' ? 'bottom' : 'top';
    
    console.log('Team Turn Debug:', {
      player,
      activeTeam: team,
      oppositeTeam
    });
    
    // Stoppe Zeit des anderen Teams
    const oppositeTime = state.teamTimings[oppositeTeam].lastStartTime
      ? Date.now() - state.teamTimings[oppositeTeam].lastStartTime
      : 0;

    return {
      teamTimings: {
        ...state.teamTimings,
        [team]: {
          ...state.teamTimings[team],
          lastStartTime: Date.now()
        },
        [oppositeTeam]: {
          totalTime: state.teamTimings[oppositeTeam].totalTime + oppositeTime,
          lastStartTime: null
        }
      }
    };
  }),

  pauseGame: () => set((state) => ({
    ...state,
    isPaused: true,
    pauseStartTime: Date.now()
  })),

  resumeGame: () => set((state) => {
    if (!state.pauseStartTime) return state;
    
    const pauseDuration = Date.now() - state.pauseStartTime;
    
    return {
      ...state,
      isPaused: false,
      pauseStartTime: null,
      gameStartTime: state.gameStartTime ? state.gameStartTime + pauseDuration : null,
      roundStartTime: state.roundStartTime ? state.roundStartTime + pauseDuration : null
    };
  }),

  getRemainingPoints: (position: 'top' | 'bottom') => {
    const state = get();
    const jassState = useJassStore.getState();
    const score = position === 'top' ? state.topScore : state.bottomScore;
    const oppositeTeam = position === 'top' ? 'bottom' : 'top';
    
    // Wenn das andere Team Berg hat und man unter Schneider ist
    if (jassState.teams[oppositeTeam].bergActive && score < SCHNEIDER_SCORE) {
      return {
        title: "Punkte bis Schneider",
        remaining: SCHNEIDER_SCORE - score
      };
    }
    
    // Standardfall: Punkte bis Berg
    if (score < BERG_SCORE) {
      return {
        title: "Punkte bis Berg",
        remaining: BERG_SCORE - score
      };
    }
    
    return {
      title: "Punkte bis Sieg",
      remaining: SIEG_SCORE - score
    };
  },

  setMultiplier: (multiplier: Multiplier) => {
    set({ currentMultiplier: multiplier });
  },

  getDividedPoints: (points: number) => {
    const { currentMultiplier } = get();
    return Math.ceil(points / currentMultiplier);
  },

  showHistoryWarning: (message: string, action: () => void) => set({
    historyWarning: {
      isVisible: true,
      message,
      pendingAction: action
    }
  }),

  hideHistoryWarning: () => set({
    historyWarning: {
      isVisible: false,
      message: '',
      pendingAction: null
    }
  }),

  executePendingAction: () => {
    const state = get();
    if (state.historyWarning.pendingAction) {
      state.historyWarning.pendingAction();
    }
    get().hideHistoryWarning();
  },

  jumpToLatest: () => set((state) => {
    const latestIndex = state.scoreHistory.length - 1;
    const latestEntry = state.scoreHistory[latestIndex];
    return { ...latestEntry, currentHistoryIndex: latestIndex };
  }),

  setIsGameInfoOpen: (isOpen: boolean) => set({ isGameInfoOpen: isOpen }),

  determineNextStartingPlayer: () => {
    const state = get();
    const { teams } = useJassStore.getState();
    const currentPlayer = state.currentPlayer;
    
    // Berechne die Gesamtpunkte beider Teams
    const topTotal = teams.top.total;
    const bottomTotal = teams.bottom.total;
    
    // Bestimme das Gewinnerteam
    const topTeamWon = topTotal > bottomTotal;
    
    // Verliererteam beginnt immer
    if (topTeamWon) {
      // Team 1 (bottom) hat verloren
      return currentPlayer === 1 ? 2 : 4;
    } else {
      // Team 2 (top) hat verloren
      return currentPlayer === 2 ? 3 : 1;
    }
  },

  startNewGame: () => set((state) => {
    const nextPlayer = state.determineNextStartingPlayer();
    return {
      ...state,
      currentRound: state.currentRound + 1,
      currentPlayer: nextPlayer,
      isGameStarted: true,
      gameStartTime: Date.now(),
      roundStartTime: Date.now()
    };
  }),
}));