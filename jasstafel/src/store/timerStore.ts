import {create} from "zustand";

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

interface GameTimerInfo {
  startTime: number;
  totalDuration: number;
  isActive: boolean;
  pausedTime: number;
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
  gameTimers: Map<number, GameTimerInfo>;
  activeGameId: number | null;
}

export interface TimerAnalytics {
  totalJassTime: number;
  currentGameDuration: number;
}

export interface TimerActions {
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
  getElapsedTimes: () => {
    jass: number;
    game: number;
    round: number;
  };
  getTotalPausedTime: () => number;
  restoreTimerSnapshot: (snapshot: TimerSnapshot) => void;
  activateGameTimer: (gameId: number) => void;
  getGameDuration: (gameId: number) => number;
  reactivateGameTimer: (gameId: number) => void;
}

// Importiere TimerSnapshot aus types/jass
import type {TimerSnapshot} from "../types/jass";

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
    rounds: [],
  },
  isPaused: false,
  pauseStartTime: null,
  totalPausedTime: 0,
  lastJassDuration: 0,
  gameTimers: new Map(),
  activeGameId: null,

  // Actions
  startJassTimer: () => {
    set((state) => ({
      ...state,
      jassStartTime: Date.now(),
      history: {
        ...state.history,
        jass: [...state.history.jass, {startTime: Date.now()}],
      },
    }));
  },

  startGameTimer: () => {
    set((state) => ({
      ...state,
      gameStartTime: Date.now(),
      history: {
        ...state.history,
        games: [...state.history.games, {startTime: Date.now()}],
      },
    }));
  },

  startRoundTimer: () => {
    const now = Date.now();
    set((state) => ({
      ...state,
      roundStartTime: now,
      history: {
        ...state.history,
        rounds: [...state.history.rounds, {startTime: now}],
      },
    }));
  },

  completeRound: () => {
    const now = Date.now();
    set((state) => {
      const rounds = [...state.history.rounds];
      const currentRound = rounds[rounds.length - 1];
      if (currentRound) {
        currentRound.endTime = now;
        currentRound.duration = now - currentRound.startTime;
      }
      return {
        ...state,
        roundStartTime: null,
        history: {...state.history, rounds},
      };
    });
  },

  completeGame: () => {
    const now = Date.now();
    set((state) => {
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
        history: {...state.history, games},
      };
    });
  },

  completeJass: () => {
    const now = Date.now();
    const state = get();
    const lastJassDuration = state.jassStartTime ?
      now - state.jassStartTime :
      0;

    set((state) => ({
      ...state,
      lastJassDuration,
      jassStartTime: null,
      gameStartTime: null,
      roundStartTime: null,
      history: {
        ...state.history,
        jass: state.history.jass.slice(0, -1),
      },
    }));
  },

  getAnalytics: () => {
    const state = get();
    const currentTime = get().getCurrentTime();

    // Aktuelle Zeiten berechnen
    const currentGameDuration = state.gameStartTime ?
      getPositiveTime(currentTime - state.gameStartTime) :
      0;

    const totalJassTime = state.jassStartTime ?
      getPositiveTime(currentTime - state.jassStartTime) :
      state.lastJassDuration;

    return {
      totalJassTime,
      currentGameDuration,
    };
  },

  // Bestehende Reset-Methoden
  resetRoundTimer: () => {
    set((state) => ({
      ...state,
      roundStartTime: null,
    }));
  },

  resetGameTimers: () => {
    set((state) => ({
      ...state,
      gameStartTime: null,
      roundStartTime: null,
    }));
  },

  resetAllTimers: () => {
    set((state) => ({
      ...state,
      jassStartTime: null,
      gameStartTime: null,
      roundStartTime: null,
      history: {
        jass: [],
        games: [],
        rounds: [],
      },
    }));
  },

  pauseTimer: () => {
    set((state) => ({
      ...state,
      isPaused: true,
      pauseStartTime: Date.now(),
    }));
  },

  resumeTimer: () => {
    set((state) => {
      const pauseDuration = state.pauseStartTime ? Date.now() - state.pauseStartTime : 0;
      return {
        ...state,
        isPaused: false,
        pauseStartTime: null,
        totalPausedTime: state.totalPausedTime + pauseDuration,
      };
    });
  },

  getCurrentTime: () => {
    const state = get();
    const now = Date.now();

    // Wenn der Timer pausiert ist, verwende die pausierte Zeit
    if (state.isPaused && state.pauseStartTime) {
      return state.pauseStartTime - state.totalPausedTime;
    }

    // Ansonsten berechne die aktuelle Zeit unter Berücksichtigung der Pausen
    return now - state.totalPausedTime;
  },

  prepareJassEnd: () => {
    const now = Date.now();
    const state = get();
    return state.jassStartTime ? now - state.jassStartTime : 0;
  },

  finalizeJassEnd: () => {
    set((state) => ({
      ...state,
      jassStartTime: null,
      gameStartTime: null,
      roundStartTime: null,
      history: {
        ...state.history,
        jass: state.history.jass.slice(0, -1),
      },
    }));
  },

  getElapsedTimes: () => {
    const state = get();
    const now = Date.now();
    const pausedTime = state.totalPausedTime +
      (state.isPaused && state.pauseStartTime ? now - state.pauseStartTime : 0);

    return {
      jass: state.jassStartTime ? now - state.jassStartTime - pausedTime : 0,
      game: state.gameStartTime ? now - state.gameStartTime - pausedTime : 0,
      round: state.roundStartTime ? now - state.roundStartTime - pausedTime : 0,
    };
  },

  getTotalPausedTime: () => {
    const state = get();
    return state.totalPausedTime +
      (state.isPaused && state.pauseStartTime ? Date.now() - state.pauseStartTime : 0);
  },

  restoreTimerSnapshot: (snapshot: TimerSnapshot) => {
    const now = Date.now();
    const currentState = get();

    set((state) => {
      // 1. Basis-Timer-Zustand wiederherstellen
      const baseState = {
        jassStartTime: now - snapshot.elapsedJassTime - snapshot.totalPausedTime,
        gameStartTime: now - snapshot.elapsedGameTime - snapshot.totalPausedTime,
        roundStartTime: now - snapshot.elapsedRoundTime - snapshot.totalPausedTime,
        totalPausedTime: snapshot.totalPausedTime,
        isPaused: false,
        pauseStartTime: null,
      };

      // 2. Game-Timer-Map aktualisieren
      const newTimers = new Map(state.gameTimers);

      if (state.activeGameId) {
        const activeTimer = newTimers.get(state.activeGameId);
        if (activeTimer) {
          activeTimer.startTime = now;
          activeTimer.isActive = true;
          activeTimer.pausedTime = snapshot.totalPausedTime;
        }
      }

      return {
        ...state,
        ...baseState,
        gameTimers: newTimers,
      };
    });
  },

  activateGameTimer: (gameId: number) => {
    const currentState = get();
    const now = Date.now();

    set((state) => {
      // Timer Map klonen
      const newTimers = new Map(state.gameTimers);

      // Aktuellen Timer pausieren
      const oldTimer = state.activeGameId !== null ?
        newTimers.get(state.activeGameId) :
        null;

      if (oldTimer?.isActive) {
        oldTimer.totalDuration += now - oldTimer.startTime - oldTimer.pausedTime;
        oldTimer.isActive = false;
      }

      // Neuen Timer aktivieren
      let gameTimer = newTimers.get(gameId);

      if (!gameTimer) {
        gameTimer = {
          startTime: now,
          totalDuration: 0,
          pausedTime: 0,
          isActive: false,
        };
      }

      gameTimer.startTime = now;
      gameTimer.isActive = true;
      gameTimer.pausedTime = 0;

      newTimers.set(gameId, gameTimer);

      // WICHTIG: jassStartTime beibehalten, falls bereits gesetzt
      const existingJassStartTime = state.jassStartTime;

      return {
        ...state,
        gameTimers: newTimers,
        activeGameId: gameId,
        // Diese beiden Timer IMMER aktualisieren, wie bei "Neues Spiel"
        gameStartTime: now,
        roundStartTime: now,
        // jassStartTime NICHT überschreiben, wenn bereits gesetzt
        jassStartTime: existingJassStartTime,
        // Pausenstatus zurücksetzen
        isPaused: false,
        pauseStartTime: null,
      };
    });
  },

  getGameDuration: (gameId: number): number => {
    const state = get();
    const timer = state.gameTimers.get(gameId);
    if (!timer) return 0;

    if (!timer.isActive) {
      return timer.totalDuration;
    }

    const now = Date.now();
    return timer.totalDuration + (now - timer.startTime - timer.pausedTime);
  },

  // Verbesserte Methode für explizite Timer-Reaktivierung
  reactivateGameTimer: (gameId: number) => {
    const currentState = get();
    const now = Date.now();

    set((state) => {
      const newTimers = new Map(state.gameTimers);
      const gameTimer = newTimers.get(gameId) ?? {
        startTime: now,
        totalDuration: 0,
        pausedTime: 0,
        isActive: false,
      };

      // Timer explizit reaktivieren
      gameTimer.startTime = now;
      gameTimer.isActive = true;
      gameTimer.pausedTime = 0;

      newTimers.set(gameId, gameTimer);

      // WICHTIG: jassStartTime beibehalten
      const existingJassStartTime = state.jassStartTime;

      return {
        ...state,
        gameTimers: newTimers,
        activeGameId: gameId,
        gameStartTime: now,
        roundStartTime: now,
        isPaused: false,
        pauseStartTime: null,
        // jassStartTime NICHT überschreiben, wenn bereits gesetzt
        jassStartTime: existingJassStartTime,
      };
    });
  },
}));
