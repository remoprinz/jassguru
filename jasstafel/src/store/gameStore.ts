import { create } from 'zustand';
import { GameSettings, defaultGameSettings, validateGameSettings } from '../config/GameSettings';
import { validateAndClampScore } from '../game/GameLogic';

interface ScoreHistory {
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
}

interface GameState {
  topScore: number;
  bottomScore: number;
  topRounds: number;
  bottomRounds: number;
  currentHistoryIndex: number;
  scoreHistory: ScoreHistory[];
  settings: GameSettings;
  currentPlayer: number;
  currentRound: number;
  isCalculatorFlipped: boolean;
  stricheCounts: { top: Record<number, number>, bottom: Record<number, number> };
  restZahlen: { top: number; bottom: number };
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

  resetGame: () => set((state) => ({
    ...state,
    topScore: 0,
    bottomScore: 0,
    topRounds: 0,
    bottomRounds: 0,
    currentHistoryIndex: -1,
    scoreHistory: [],
    currentPlayer: 1,
    currentRound: 1,
    // Neue Zeile: Zurücksetzen der Striche
    stricheCounts: { top: {}, bottom: {} },
    restZahlen: { top: 0, bottom: 0 }
  })),

  updateScore: (position: 'top' | 'bottom', score: number, opponentScore: number) => set((state) => {
    const newScore = validateAndClampScore(state[`${position}Score`] + score, state.settings.maxScore);
    const oppositePosition = position === 'top' ? 'bottom' : 'top';
    const newOpponentScore = validateAndClampScore(state[`${oppositePosition}Score`] + opponentScore, state.settings.maxScore);

    const newState = { 
      [`${position}Score`]: newScore,
      [`${oppositePosition}Score`]: newOpponentScore,
      currentPlayer: (state.currentPlayer % 4) + 1,
      currentRound: state.currentRound + 1,
      topRounds: position === 'top' ? state.topRounds + 1 : state.topRounds,
      bottomRounds: position === 'bottom' ? state.bottomRounds + 1 : state.bottomRounds,
    };

    const newHistoryEntry = {
      ...state.scoreHistory[state.currentHistoryIndex],
      topScore: newState.topScore,
      bottomScore: newState.bottomScore,
      topRounds: newState.topRounds,
      bottomRounds: newState.bottomRounds,
      totalPoints: {
        top: position === 'top' ? score : 0,
        bottom: position === 'bottom' ? score : 0
      },
      weisPoints: { top: 0, bottom: 0 }
    };

    const newHistory = [
      ...state.scoreHistory.slice(0, state.currentHistoryIndex + 1),
      newHistoryEntry
    ];

    if (newScore >= state.settings.bergScore || newOpponentScore >= state.settings.bergScore) {
      console.log('BERG erreicht!');
    }

    if (newScore >= state.settings.siegScore || newOpponentScore >= state.settings.siegScore) {
      console.log('SIEG erreicht!');
    }

    return {
      ...newState,
      scoreHistory: newHistory,
      currentHistoryIndex: newHistory.length - 1
    };
  }),

  addToHistory: () => set((state) => {
    const newHistory = [...state.scoreHistory, {
      topScore: state.topScore,
      bottomScore: state.bottomScore,
      topRounds: state.topRounds,
      bottomRounds: state.bottomRounds,
      totalPoints: {
        top: 0,
        bottom: 0
      },
      weisPoints: { top: 0, bottom: 0 }
    }];
    console.log('Neue Historie hinzugefügt:', newHistory);
    return {
      scoreHistory: newHistory,
      currentHistoryIndex: newHistory.length - 1
    };
  }),

  navigateHistory: (direction: 'forward' | 'backward') => set((state) => {
    const newIndex = direction === 'forward'
      ? Math.min(state.currentHistoryIndex + 1, state.scoreHistory.length - 1)
      : Math.max(state.currentHistoryIndex - 1, 0);

    console.log(`Navigiere in der Historie: ${direction}, Aktueller Index: ${state.currentHistoryIndex}, Neuer Index: ${newIndex}`);

    if (newIndex !== state.currentHistoryIndex && state.scoreHistory.length > 0) {
      const historyEntry = state.scoreHistory[newIndex];
      if (historyEntry) {
        console.log(`Historie-Eintrag gefunden:`, historyEntry);
        return {
          ...state,
          topScore: historyEntry.topScore,
          bottomScore: historyEntry.bottomScore,
          currentRound: newIndex + 1,
          currentPlayer: (newIndex % 4) + 1,
          currentHistoryIndex: newIndex
        };
      }
    }
    console.log(`Keine Änderung in der Historie`);
    return state;
  }),

  incrementCurrentPlayer: () => set((state) => ({ currentPlayer: (state.currentPlayer % 4) + 1 })),
  incrementCurrentRound: () => set((state) => ({ currentRound: state.currentRound + 1 })),
  setCalculatorFlipped: (flipped: boolean) => set({ isCalculatorFlipped: flipped }),

  updateScoreByStrich: (position: 'top' | 'bottom', value: number) => set((state) => {
    const currentScore = state[`${position}Score`];
    const currentStricheCounts = state.stricheCounts[position];
    
    const isBoxFull = (boxValue: number) => (currentStricheCounts[boxValue] || 0) * boxValue > 500;

    let newScore = currentScore + value;
    let newStricheCounts = { ...currentStricheCounts };

    if (value === 50 || value === 20) {
      if (isBoxFull(value)) {
        // Wenn die Box voll ist, verteilen wir die Striche neu
        const { striche, restZahl } = calculateStricheCounts(newScore);
        newStricheCounts = striche;
      } else {
        // Sonst fügen wir einfach einen Strich hinzu
        newStricheCounts[value] = (newStricheCounts[value] || 0) + 1;
      }
    } else {
      // Für 100er-Box immer neu verteilen
      const { striche, restZahl } = calculateStricheCounts(newScore);
      newStricheCounts = striche;
    }

    return {
      [`${position}Score`]: newScore,
      stricheCounts: {
        ...state.stricheCounts,
        [position]: newStricheCounts
      },
      restZahlen: {
        ...state.restZahlen,
        [position]: newScore % 20
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
