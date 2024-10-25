// gameStore.tsx
import { create } from 'zustand';
import { GameSettings, defaultGameSettings, validateGameSettings } from '../config/GameSettings';
import { validateAndClampScore } from '../game/GameLogic';

interface ScoreHistoryEntry {
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
}

interface GameState {
  topScore: number;
  bottomScore: number;
  topRounds: number;
  bottomRounds: number;
  currentHistoryIndex: number;
  scoreHistory: ScoreHistoryEntry[];
  settings: GameSettings;
  currentPlayer: number;
  currentRound: number;
  isCalculatorFlipped: boolean;
  stricheCounts: { top: Record<number, number>, bottom: Record<number, number> };
  restZahlen: { top: number; bottom: number };
  totalPoints: {
    top: number;
    bottom: number;
  };
  weisPoints: {
    top: number;
    bottom: number;
  };
  farbe?: string;
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
};

export const useGameStore = create<GameStore>((set) => ({
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

  setTopScore: (score: number) => set({ topScore: score }),

  setBottomScore: (score: number) => set({ bottomScore: score }),

  incrementTopRound: () => set((state) => ({ topRounds: state.topRounds + 1 })),

  incrementBottomRound: () => set((state) => ({ bottomRounds: state.bottomRounds + 1 })),

  updateSettings: (newSettings: Partial<GameSettings>) => set((state) => {
    if (validateGameSettings(newSettings)) {
      return { settings: { ...state.settings, ...newSettings } };
    }
    console.error('Ungültige Spieleinstellungen');
    return state;
  }),

  resetGame: () => set((state) => {
    const initialHistoryEntry: ScoreHistoryEntry = {
      topScore: 0,
      bottomScore: 0,
      topRounds: 0,
      bottomRounds: 0,
      totalPoints: { top: 0, bottom: 0 },
      weisPoints: { top: 0, bottom: 0 },
      currentPlayer: 1,
      currentRound: 1,
      stricheCounts: { top: {}, bottom: {} },
      restZahlen: { top: 0, bottom: 0 },
      farbe: undefined
    };
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
      weisPoints: { top: 0, bottom: 0 }
    };
  }),

  updateScore: (position: 'top' | 'bottom', score: number, opponentScore: number) => 
    set((state) => {
      const oppositePosition = position === 'top' ? 'bottom' : 'top';
      const newScore = validateAndClampScore(state[`${position}Score`] + score, state.settings.maxScore);
      const newOpponentScore = validateAndClampScore(state[`${oppositePosition}Score`] + opponentScore, state.settings.maxScore);
      const newRound = state.currentRound + 1;

      // Berechnung der neuen stricheCounts und restZahlen für beide Positionen
      const { striche: strichePosition, restZahl: restZahlPosition } = calculateStricheCounts(newScore);
      const { striche: stricheOpponent, restZahl: restZahlOpponent } = calculateStricheCounts(newOpponentScore);

      const newStricheCounts = {
        ...state.stricheCounts,
        [position]: strichePosition,
        [oppositePosition]: stricheOpponent
      };

      const newRestZahlen = {
        ...state.restZahlen,
        [position]: restZahlPosition,
        [oppositePosition]: restZahlOpponent
      };

      const newState = {
        topScore: position === 'top' ? newScore : newOpponentScore,
        bottomScore: position === 'bottom' ? newScore : newOpponentScore,
        topRounds: position === 'top' ? state.topRounds + 1 : state.topRounds,
        bottomRounds: position === 'bottom' ? state.bottomRounds + 1 : state.bottomRounds,
        currentPlayer: (state.currentPlayer % 4) + 1,
        currentRound: newRound,
        totalPoints: {
          ...state.totalPoints,
          [position]: state.totalPoints[position] + score,
          [oppositePosition]: state.totalPoints[oppositePosition] + opponentScore
        },
        weisPoints: { ...state.weisPoints },
        stricheCounts: newStricheCounts,
        restZahlen: newRestZahlen
      };

      const newHistoryEntry: ScoreHistoryEntry = {
        ...newState,
        farbe: state.farbe
      };

      return {
        ...newState,
        scoreHistory: [...state.scoreHistory.slice(0, state.currentHistoryIndex + 1), newHistoryEntry],
        currentHistoryIndex: state.currentHistoryIndex + 1
      };
    }),

  addToHistory: () => set((state) => {
    const newHistoryEntry: ScoreHistoryEntry = {
      ...state,
      currentRound: state.currentRound,
      farbe: state.farbe
    };
    return {
      scoreHistory: [...state.scoreHistory.slice(0, state.currentHistoryIndex + 1), newHistoryEntry],
      currentHistoryIndex: state.currentHistoryIndex + 1
    };
  }),

  navigateHistory: (direction: 'forward' | 'backward') => 
    set((state) => {
      let newIndex = state.currentHistoryIndex;
      
      if (direction === 'backward' && newIndex > 0) {
        newIndex -= 1;
      } else if (direction === 'forward' && newIndex < state.scoreHistory.length - 1) {
        newIndex += 1;
      }
      
      if (newIndex !== state.currentHistoryIndex && state.scoreHistory.length > 0) {
        const historyEntry = state.scoreHistory[newIndex];
        return {
          ...state, // Behalten Sie den restlichen Zustand bei
          topScore: historyEntry.topScore,
          bottomScore: historyEntry.bottomScore,
          topRounds: historyEntry.topRounds,
          bottomRounds: historyEntry.bottomRounds,
          totalPoints: historyEntry.totalPoints,
          weisPoints: historyEntry.weisPoints,
          currentPlayer: historyEntry.currentPlayer,
          currentRound: historyEntry.currentRound,
          stricheCounts: historyEntry.stricheCounts,
          restZahlen: historyEntry.restZahlen,
          farbe: historyEntry.farbe,
          currentHistoryIndex: newIndex,
          // scoreHistory bleibt unverändert
        };
      }
      
      return state;
    }),

  incrementCurrentPlayer: () => set((state) => ({ currentPlayer: (state.currentPlayer % 4) + 1 })),

  incrementCurrentRound: () => set((state) => ({
    currentRound: state.currentRound + 1
  })),
  
  setCalculatorFlipped: (flipped: boolean) => set({ isCalculatorFlipped: flipped }),

  updateScoreByStrich: (position: 'top' | 'bottom', value: number) => set((state) => {
    const currentScore = state[`${position}Score`];
    const currentStricheCounts = state.stricheCounts[position];
    
    const isBoxFull = (boxValue: number) => (currentStricheCounts[boxValue] || 0) * boxValue > 500;

    let newScore = currentScore + value;
    let newStricheCounts = { ...currentStricheCounts };

    if (value === 50 || value === 20) {
      if (isBoxFull(value)) {
        const { striche, restZahl } = calculateStricheCounts(newScore);
        newStricheCounts = striche;
      } else {
        newStricheCounts[value] = (newStricheCounts[value] || 0) + 1;
      }
    } else {
      const { striche, restZahl } = calculateStricheCounts(newScore);
      newStricheCounts = striche;
    }

    // Berechnung der Restzahl anpassen
    let restZahl = newScore % 10;
    if (newScore < 20) {
      restZahl = newScore;
    }

    return {
      [`${position}Score`]: newScore,
      stricheCounts: {
        ...state.stricheCounts,
        [position]: newStricheCounts
      },
      restZahlen: {
        ...state.restZahlen,
        [position]: restZahl
      }
    };
  }),

  updateStricheCounts: (position: 'top' | 'bottom', value: number, count: number) => set((state) => ({
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
    topScore: Math.floor(state.topScore / 20) * 20,
    bottomScore: Math.floor(state.bottomScore / 20) * 20,
    stricheCounts: { top: {}, bottom: {} },
    restZahlen: { top: 0, bottom: 0 }
  })),

  updateRestZahl: (position: 'top' | 'bottom', restZahl: number) => set(state => ({
    restZahlen: {
      ...state.restZahlen,
      [position]: restZahl
    }
  })),

  addWeisPoints: (position: 'top' | 'bottom', points: number) => set((state) => {
    const newWeisPoints = {
      ...state.weisPoints,
      [position]: state.weisPoints[position] + points
    };
    const newScore = state[`${position}Score`] + points;
    const newHistoryEntry: ScoreHistoryEntry = {
      ...state.scoreHistory[state.currentHistoryIndex],
      [`${position}Score`]: newScore,
      weisPoints: newWeisPoints,
      totalPoints: {
        ...state.totalPoints,
        [position]: state.totalPoints[position] + points
      }
    };
    const newHistory = [...state.scoreHistory.slice(0, state.currentHistoryIndex + 1), newHistoryEntry];
    return {
      [`${position}Score`]: newScore,
      weisPoints: newWeisPoints,
      totalPoints: {
        ...state.totalPoints,
        [position]: state.totalPoints[position] + points
      },
      scoreHistory: newHistory,
      currentHistoryIndex: newHistory.length - 1
    };
  }),
}));

const calculateStricheCounts = (score: number) => {
  const striche = {
    100: Math.floor(score / 100),
    50: 0,
    20: 0
  };

  let restZahl = score % 100;

  if (restZahl >= 90) {
    striche[50] = 1;
    striche[20] = 2;
    restZahl -= 90;
  } else if (restZahl >= 80) {
    striche[20] = 4;
    restZahl -= 80;
  } else if (restZahl >= 70) {
    striche[50] = 1;
    striche[20] = 1;
    restZahl -= 70;
  } else if (restZahl >= 60) {
    striche[20] = 3;
    restZahl -= 60;
  } else if (restZahl >= 50) {
    striche[50] = 1;
    restZahl -= 50;
  } else if (restZahl >= 20) {
    striche[20] = Math.floor(restZahl / 20);
    restZahl %= 20;
  }

  return { striche, restZahl };
};
