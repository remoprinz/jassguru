import { create } from 'zustand';

// Types
interface TimeDuration {
  startTime: number;
  endTime?: number;
  duration?: number;
}

interface TimerHistory {
  jass: TimeDuration[];
  games: TimeDuration[];
  rounds: TimeDuration[];
}

interface TimerState {
  jassStartTime: number | null;
  gameStartTime: number | null;
  roundStartTime: number | null;
  history: TimerHistory;
}

interface TimerAnalytics {
  averageRoundDuration: number;
  averageGameDuration: number;
  averageJassDuration: number;
  totalJassTime: number;
  currentJassDuration: number;
  currentGameDuration: number;
  currentRoundDuration: number;
}

interface TimerActions {
  startJassTimer: () => void;
  startGameTimer: () => void;
  startRoundTimer: () => void;
  resetRoundTimer: () => void;
  resetGameTimers: () => void;
  resetAllTimers: () => void;
  completeRound: () => void;
  completeGame: () => void;
  completeJass: () => void;
  getAnalytics: () => TimerAnalytics;
}

type TimerStore = TimerState & TimerActions;

// Store
export const useTimerStore = create<TimerStore>((set, get) => ({
  // Initial State
  jassStartTime: null,
  gameStartTime: null,
  roundStartTime: null,
  history: {
    jass: [],
    games: [],
    rounds: []
  },

  // Actions
  startJassTimer: () => {
    set(state => ({
      ...state,
      jassStartTime: Date.now(),
      history: {
        ...state.history,
        jass: [...state.history.jass, { startTime: Date.now() }]
      }
    }));
  },

  startGameTimer: () => {
    set(state => ({
      ...state,
      gameStartTime: Date.now(),
      history: {
        ...state.history,
        games: [...state.history.games, { startTime: Date.now() }]
      }
    }));
  },

  startRoundTimer: () => {
    set(state => ({
      ...state,
      roundStartTime: Date.now(),
      history: {
        ...state.history,
        rounds: [...state.history.rounds, { startTime: Date.now() }]
      }
    }));
  },

  completeRound: () => {
    const now = Date.now();
    set(state => {
      const rounds = [...state.history.rounds];
      const currentRound = rounds[rounds.length - 1];
      if (currentRound) {
        currentRound.endTime = now;
        currentRound.duration = now - currentRound.startTime;
      }
      return {
        ...state,
        roundStartTime: null,
        history: { ...state.history, rounds }
      };
    });
  },

  completeGame: () => {
    const now = Date.now();
    set(state => {
      const games = [...state.history.games];
      const currentGame = games[games.length - 1];
      if (currentGame) {
        currentGame.endTime = now;
        currentGame.duration = now - currentGame.startTime;
      }
      return {
        ...state,
        gameStartTime: null,
        roundStartTime: null,
        history: { ...state.history, games }
      };
    });
  },

  completeJass: () => {
    const now = Date.now();
    set(state => {
      const jassHistory = [...state.history.jass];
      const currentJass = jassHistory[jassHistory.length - 1];
      if (currentJass) {
        currentJass.endTime = now;
        currentJass.duration = now - currentJass.startTime;
      }
      return {
        ...state,
        jassStartTime: null,
        gameStartTime: null,
        roundStartTime: null,
        history: { ...state.history, jass: jassHistory }
      };
    });
  },

  getAnalytics: () => {
    const state = get();
    const now = Date.now();

    // Hilfsfunktion für Durchschnittsberechnung
    const calculateAverage = (durations: number[]) => 
      durations.length > 0 
        ? durations.reduce((a, b) => a + b, 0) / durations.length 
        : 0;

    // Abgeschlossene Zeiten
    const completedRounds = state.history.rounds
      .filter(r => r.duration)
      .map(r => r.duration as number);
    
    const completedGames = state.history.games
      .filter(g => g.duration)
      .map(g => g.duration as number);
    
    const completedJass = state.history.jass
      .filter(j => j.duration)
      .map(j => j.duration as number);

    // Aktuelle Zeiten
    const currentJassDuration = state.jassStartTime 
      ? now - state.jassStartTime 
      : 0;
    
    const currentGameDuration = state.gameStartTime 
      ? now - state.gameStartTime 
      : 0;
    
    const currentRoundDuration = state.roundStartTime 
      ? now - state.roundStartTime 
      : 0;

    return {
      averageRoundDuration: calculateAverage(completedRounds),
      averageGameDuration: calculateAverage(completedGames),
      averageJassDuration: calculateAverage(completedJass),
      totalJassTime: completedJass.reduce((a, b) => a + b, 0) + currentJassDuration,
      currentJassDuration,
      currentGameDuration,
      currentRoundDuration
    };
  },

  // Bestehende Reset-Methoden
  resetRoundTimer: () => {
    set(state => ({
      ...state,
      roundStartTime: null
    }));
  },

  resetGameTimers: () => {
    set(state => ({
      ...state,
      gameStartTime: null,
      roundStartTime: null
    }));
  },

  resetAllTimers: () => {
    set(state => ({
      ...state,
      jassStartTime: null,
      gameStartTime: null,
      roundStartTime: null,
      history: {
        jass: [],
        games: [],
        rounds: []
      }
    }));
  }
}));
