import { create } from 'zustand';
import { GameSettings, defaultGameSettings, validateGameSettings } from '../config/GameSettings';
import { validateAndClampScore } from '../game/GameLogic';

interface ScoreHistory {
  topScore: number;
  bottomScore: number;
  topRounds: number;
  bottomRounds: number;
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

  resetGame: () => set({
    topScore: 0,
    bottomScore: 0,
    topRounds: 0,
    bottomRounds: 0,
    currentHistoryIndex: -1,
    scoreHistory: [],
    currentPlayer: 1,
    currentRound: 1,
  }),

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

    // Schneide die Historie ab dem aktuellen Index ab und füge den neuen Eintrag hinzu
    const newHistory = [
      ...state.scoreHistory.slice(0, state.currentHistoryIndex + 1),
      {
        topScore: newState.topScore,
        bottomScore: newState.bottomScore,
        topRounds: newState.topRounds,
        bottomRounds: newState.bottomRounds
      }
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
      bottomRounds: state.bottomRounds
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
}));