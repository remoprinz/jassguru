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
  isPaused: boolean;
  pauseStartTime: number | null;
  totalPausedTime: number;
  lastJassDuration: number;
}

export interface TimerAnalytics {
  totalJassTime: number;
  currentGameDuration: number;
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
  pauseTimer: () => void;
  resumeTimer: () => void;
  getCurrentTime: () => number;
  prepareJassEnd: () => number;
  finalizeJassEnd: () => void;
}

type TimerStore = TimerState & TimerActions;

// Hilfsfunktionen auslagern für bessere Performance
const getPositiveTime = (time: number): number => Math.max(0, time);
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
  isPaused: false,
  pauseStartTime: null,
  totalPausedTime: 0,
  lastJassDuration: 0,

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
    const state = get();
    const lastJassDuration = state.jassStartTime 
      ? now - state.jassStartTime 
      : 0;

    set(state => ({
      ...state,
      lastJassDuration,
      jassStartTime: null,
      gameStartTime: null,
      roundStartTime: null,
      history: {
        ...state.history,
        jass: state.history.jass.slice(0, -1)
      }
    }));
  },

  getAnalytics: () => {
    const state = get();
    const currentTime = get().getCurrentTime();

    // Aktuelle Zeiten berechnen
    const currentGameDuration = state.gameStartTime 
      ? getPositiveTime(currentTime - state.gameStartTime)
      : 0;
    
    const totalJassTime = state.jassStartTime 
      ? getPositiveTime(currentTime - state.jassStartTime)
      : state.lastJassDuration;

    return {
      totalJassTime,
      currentGameDuration
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
  },

  pauseTimer: () => {
    set(state => ({
      ...state,
      isPaused: true,
      pauseStartTime: Date.now()
    }));
  },

  resumeTimer: () => {
    set(state => {
      const pauseDuration = state.pauseStartTime ? Date.now() - state.pauseStartTime : 0;
      return {
        ...state,
        isPaused: false,
        pauseStartTime: null,
        totalPausedTime: state.totalPausedTime + pauseDuration
      };
    });
  },

  getCurrentTime: () => {
    const state = get();
    const now = Date.now();
    const pausedTime = state.isPaused && state.pauseStartTime 
      ? getPositiveTime(now - state.pauseStartTime)
      : 0;
    return getPositiveTime(now - (state.totalPausedTime + pausedTime));
  },

  prepareJassEnd: () => {
    const now = Date.now();
    const state = get();
    return state.jassStartTime ? now - state.jassStartTime : 0;
  },

  finalizeJassEnd: () => {
    set(state => ({
      ...state,
      jassStartTime: null,
      gameStartTime: null,
      roundStartTime: null,
      history: {
        ...state.history,
        jass: state.history.jass.slice(0, -1)
      }
    }));
  }
}));
