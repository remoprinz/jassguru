// src/store/jassStore.ts

import {create, StateCreator} from "zustand";
import {useGameStore} from "./gameStore";
import {jassStorage} from "./jassStorage";
import {
  TeamPosition,
  PlayerNames,
  JassStore,
  GameEntry,
  TeamStand,
  TeamScores,

  JassSession,
  GameTotals,
  StricheRecord,
  PlayerNumber,
  determineNextStartingPlayer,
  GameUpdate,
  JassColor,
} from "../types/jass";
import {useTimerStore} from "./timerStore";
import {aggregateStricheForTeam} from "../utils/stricheCalculations";

const createGameEntry = (
  id: number,
  startingPlayer: PlayerNumber,
  sessionId: string = "default"
): GameEntry => {
  console.log("📝 Creating Game Entry:", {
    id,
    startingPlayer,
    sessionId,
  });
  return ({
    id,
    timestamp: Date.now(),
    teams: {
      top: createInitialTeamStand(),
      bottom: createInitialTeamStand(),
    },
    sessionId,
    currentRound: 1,
    startingPlayer: startingPlayer,
    initialStartingPlayer: startingPlayer,
    currentPlayer: startingPlayer,
    roundHistory: [],
    currentHistoryIndex: -1,
    historyState: {
      isNavigating: false,
      lastNavigationTimestamp: Date.now(),
    },
    isGameStarted: false,
    isRoundCompleted: false,
    isGameCompleted: false,
  });
};

export const createInitialTeamStand = (): TeamStand => ({
  bergActive: false,
  bedankenActive: false,
  isSigned: false,
  striche: {berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0},
  total: 0,
  jassPoints: 0,
  weisPoints: 0,
  playerStats: {
    1: {striche: 0, points: 0, weisPoints: 0},
    2: {striche: 0, points: 0, weisPoints: 0},
    3: {striche: 0, points: 0, weisPoints: 0},
    4: {striche: 0, points: 0, weisPoints: 0},
  },
});

const aggregateGameResult = (teams: Record<TeamPosition, TeamStand>, scores: TeamScores): Record<TeamPosition, TeamStand> => {
  const newTeams = {...teams};
  newTeams.top = {
    ...newTeams.top,
    jassPoints: newTeams.top.jassPoints + scores.top,
    weisPoints: newTeams.top.weisPoints + (scores.weisPoints?.top || 0),
    total: newTeams.top.total + scores.top + (scores.weisPoints?.top || 0),
  };
  newTeams.bottom = {
    ...newTeams.bottom,
    jassPoints: newTeams.bottom.jassPoints + scores.bottom,
    weisPoints: newTeams.bottom.weisPoints + (scores.weisPoints?.bottom || 0),
    total: newTeams.bottom.total + scores.bottom + (scores.weisPoints?.bottom || 0),
  };
  return newTeams;
};

const calculateStricheTotal = (striche: StricheRecord): number =>
  Object.values(striche).reduce((sum, count) => sum + count, 0);

// 1. Initial PlayerNames definieren
const initialPlayerNames: PlayerNames = {
  1: "", 2: "", 3: "", 4: "",
};

// 2. Initial Session State
const initialSession = {
  id: "initial",
  gruppeId: "default",
  startedAt: Date.now(),
  playerNames: initialPlayerNames,
  games: [],
  metadata: {},
};

// 3. Vollständiger Initial State
const initialJassState = {
  isJassStarted: false,
  currentSession: initialSession,
  currentRound: 1,
  currentGameId: 1,
  isJassCompleted: false,
  teams: {
    top: createInitialTeamStand(),
    bottom: createInitialTeamStand(),
  },
  games: [],
  currentGameCache: null,
};

const createJassStore: StateCreator<JassStore> = (set, get) => ({
  // Initial-State verwenden
  ...initialJassState,

  saveSession: async () => {
    const state = get();
    const gameStore = useGameStore.getState();

    // Striche für beide Teams aggregieren
    const topStriche = aggregateStricheForTeam(state.games, "top");
    const bottomStriche = aggregateStricheForTeam(state.games, "bottom");

    const session: JassSession = {
      id: `session_${Date.now()}`,
      gruppeId: "default",
      startedAt: state.games[0]?.timestamp || Date.now(),
      endedAt: Date.now(),
      playerNames: gameStore.playerNames,
      games: state.games.map((g) => g.id),
      metadata: {
        location: "Standard Location",
        notes: "",
      },
      statistics: {
        gamesPlayed: state.games.length,
        totalDuration: Date.now() - (state.games[0]?.timestamp || Date.now()),
        scores: {
          top: state.teams.top.total,
          bottom: state.teams.bottom.total,
        },
        weisCount: state.games.reduce((acc, game) =>
          acc + (game.teams.top.weisPoints + game.teams.bottom.weisPoints), 0),
        stricheCount: {
          berg: topStriche.berg + bottomStriche.berg,
          sieg: topStriche.sieg + bottomStriche.sieg,
          matsch: topStriche.matsch + bottomStriche.matsch,
          schneider: topStriche.schneider + bottomStriche.schneider,
          kontermatsch: topStriche.kontermatsch + bottomStriche.kontermatsch,
        },
      },
    };

    try {
      await jassStorage.saveSession(session);
      return session.id;
    } catch (error) {
      console.error("Fehler beim Speichern der Session:", error);
      throw error;
    }
  },

  loadSession: async (sessionId: string) => {
    try {
      const session = await jassStorage.loadSession(sessionId);
      // TODO: State aus der Session wiederherstellen
      // Dies erfordert zusätzliche Logik, da wir die kompletten Game-Daten
      // separat speichern müssen
    } catch (error) {
      console.error("Fehler beim Laden der Session:", error);
      throw error;
    }
  },

  startJass: (config: {
    playerNames: PlayerNames;
    initialStartingPlayer: PlayerNumber;
  }) => {
    const firstGame = createGameEntry(
      1,
      config.initialStartingPlayer,
      "default"
    );

    console.log("🃏 First Game Created:", firstGame);

    set({
      currentGameId: 1,
      games: [firstGame],
      currentSession: {
        id: `jass_${Date.now()}`,
        gruppeId: "default",
        startedAt: Date.now(),
        playerNames: config.playerNames,
        games: [1],
        metadata: {
          location: "Standard Location",
          notes: "",
        },
        statistics: {
          gamesPlayed: 1,
          totalDuration: 0,
          scores: {top: 0, bottom: 0},
          weisCount: 0,
          stricheCount: {
            berg: 0, sieg: 0, matsch: 0,
            schneider: 0, kontermatsch: 0,
          },
        },
      },
      isJassStarted: true,
    });

    const timerStore = useTimerStore.getState();
    timerStore.startJassTimer();
  },

  startNextGame: (initialStartingPlayer: PlayerNumber) => {
    const state = get();
    if (!state.isJassStarted || !state.currentSession) {
      console.warn(
        "Versuch, nächstes Spiel zu starten, ohne gestarteten Jass oder aktive Session."
      );
      return;
    }
    const currentSession = state.currentSession;

    const nextGameId = state.currentGameId + 1;
    const newGameEntry = createGameEntry(
      nextGameId, 
      initialStartingPlayer, 
      currentSession.id
    );

    console.log(`✨ Starting Next Game (ID: ${nextGameId}) with starting player: ${initialStartingPlayer}`);

    set((currentState) => {
       if (!currentState.currentSession) return {}; 

       // Expliziter Aufbau des neuen statistics-Objekts
       const currentStats = currentState.currentSession.statistics;       
       const newStatistics: JassSession['statistics'] = {
          // Übernehme existierende Werte oder setze Defaults/undefined
          gamesPlayed: nextGameId,
          totalDuration: currentStats?.totalDuration, // Bleibt optional
          scores: currentStats?.scores ?? { top: 0, bottom: 0 }, // <-- Default-Objekt hinzugefügt
          weisCount: currentStats?.weisCount ?? 0, // Default 0 wenn undefined
          stricheCount: currentStats?.stricheCount ?? { // Default leer wenn undefined
             berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 
          },
       };

       return {
          currentGameId: nextGameId,
          games: [...currentState.games, newGameEntry],
          currentSession: {
            ...currentState.currentSession, 
            games: [...currentState.currentSession.games, nextGameId],
            statistics: newStatistics, // Verwende das explizit erstellte Objekt
          },
          currentRound: 1,
          isJassCompleted: false,
       };
    });

    const timerStore = useTimerStore.getState();
    timerStore.reactivateGameTimer(nextGameId);
    console.log(`⏱️ Timer reaktiviert für Spiel ${nextGameId}`);
  },

  finalizeGame: () => {
    const state = get();
    const gameStore = useGameStore.getState();
    const currentGame = state.games.find((game) => game.id === state.currentGameId);
    if (!currentGame) return;

    // 1. Finale Spielzeit vom Timer holen
    const timerStore = useTimerStore.getState();
    const finalDuration = timerStore.getGameDuration(state.currentGameId);

    // 2. VOLLSTÄNDIGER Spielzustand wird gespeichert
    const updatedGame: GameEntry = {
      ...currentGame,
      // Basis-Informationen
      teams: {
        top: {
          ...currentGame.teams.top,
          jassPoints: gameStore.scores.top,
          total: gameStore.scores.top,
          striche: {...gameStore.striche.top},
        },
        bottom: {
          ...currentGame.teams.bottom,
          jassPoints: gameStore.scores.bottom,
          total: gameStore.scores.bottom,
          striche: {...gameStore.striche.bottom},
        },
      },
      // Komplette Spielhistorie
      roundHistory: gameStore.roundHistory,
      currentRound: gameStore.currentRound,
      currentPlayer: gameStore.currentPlayer,

      // Navigationszustand
      currentHistoryIndex: gameStore.currentHistoryIndex,
      historyState: gameStore.historyState,

      // Spielstatus
      isGameStarted: gameStore.isGameStarted,
      isRoundCompleted: gameStore.isRoundCompleted,
      isGameCompleted: true,

      // Metadata mit Timer-Informationen
      metadata: {
        duration: finalDuration,
        completedAt: Date.now(),
        roundStats: currentGame.metadata?.roundStats ?? {
          weisCount: 0,
          colorStats: {} as { [K in JassColor]: number },
        },
      },
    };

    // 3. Update games array
    set((state) => ({
      games: state.games.map((game) =>
        game.id === currentGame.id ? updatedGame : game
      ),
    }));

    // 4. Timer für dieses Spiel stoppen
    timerStore.completeGame();
  },

  resetJass: () => {
    set(initialJassState);
  },

  undoNewGame: () => {
    const state = get();
    if (state.games.length <= 1) return;

    const newGames = state.games.slice(0, -1);
    const previousGame = newGames[newGames.length - 1];
    if (!previousGame) return;

    const gameStore = useGameStore.getState();
    gameStore.resetGamePoints();
    gameStore.setScore("top", previousGame.teams.top.jassPoints);
    gameStore.setScore("bottom", previousGame.teams.bottom.jassPoints);

    const removedGame = state.games[state.games.length - 1];
    const reversedTeams = {...state.teams};

    reversedTeams.top = {
      ...reversedTeams.top,
      jassPoints: reversedTeams.top.jassPoints - removedGame.teams.top.jassPoints,
      total: reversedTeams.top.total - removedGame.teams.top.jassPoints,
    };

    reversedTeams.bottom = {
      ...reversedTeams.bottom,
      jassPoints: reversedTeams.bottom.jassPoints - removedGame.teams.bottom.jassPoints,
      total: reversedTeams.bottom.total - removedGame.teams.bottom.jassPoints,
    };

    set({
      games: newGames,
      currentGameId: previousGame.id,
      teams: reversedTeams,
    });
  },

  navigateToGame: (gameId: number) => {
    const state = get();
    const targetGame = state.games.find((game) => game.id === gameId);
    if (!targetGame) return;

    const isLatestGame = gameId === state.games.length;
    const lastHistoryIndex = (targetGame.roundHistory?.length || 0) - 1;

    // 1. Timer GENAU WIE BEI NEUEM SPIEL aktivieren
    const timerStore = useTimerStore.getState();
    timerStore.activateGameTimer(gameId);
    timerStore.startGameTimer(); // NEU: Explizit aufrufen
    timerStore.startRoundTimer(); // NEU: Explizit aufrufen

    // 2. JassStore aktualisieren
    set((state) => ({
      ...state,
      currentGameId: gameId,
      teams: targetGame.teams,
    }));

    // 3. GameStore aktualisieren GENAU WIE BEI NEUEM SPIEL
    useGameStore.setState((state) => ({
      ...state,
      isGameStarted: true, // Immer auf true setzen
      isRoundCompleted: false, // NEU: Immer auf false setzen
      isGameCompleted: false, // NEU: Immer auf false setzen
      currentRound: targetGame.currentRound || 1,
      currentPlayer: targetGame.currentPlayer,
      scores: {
        top: targetGame.teams.top.jassPoints,
        bottom: targetGame.teams.bottom.jassPoints,
      },
      weisPoints: {
        top: targetGame.teams.top.weisPoints || 0,
        bottom: targetGame.teams.bottom.weisPoints || 0,
      },
      striche: {
        top: {...targetGame.teams.top.striche},
        bottom: {...targetGame.teams.bottom.striche},
      },
      roundHistory: targetGame.roundHistory || [],
      currentHistoryIndex: isLatestGame ? lastHistoryIndex : -1,
      historyState: {
        isNavigating: !isLatestGame,
        lastNavigationTimestamp: Date.now(),
      },
    }));

    // 4. Debug-Logging
    console.log("🎮 Game Navigation Complete:", {
      gameId,
      timersStarted: true,
      gameStarted: true,
      roundStarted: true,
    });
  },

  navigateToPreviousGame: () => {
    const state = get();
    if (state.currentGameId > 1) {
      get().navigateToGame(state.currentGameId - 1);
      return true;
    }
    return false;
  },

  navigateToNextGame: () => {
    const state = get();
    if (state.currentGameId < state.games.length) {
      // Debug-Logging vor der Navigation
      console.log("⏭️ Navigating to next game:", {
        from: state.currentGameId,
        to: state.currentGameId + 1,
      });

      // Explizit die Timer starten, bevor wir navigieren
      const timerStore = useTimerStore.getState();
      const nextGameId = state.currentGameId + 1;

      // Navigieren
      get().navigateToGame(state.currentGameId + 1);

      // Zusätzlich explizit die Timer starten
      timerStore.startGameTimer();
      timerStore.startRoundTimer();

      return true;
    }
    return false;
  },

  canNavigateBack: () => {
    const state = get();
    return state.currentGameId > 1;
  },

  canNavigateForward: () => {
    const state = get();
    return state.currentGameId < state.games.length;
  },

  calculateTotalPoints: () => {
    const state = get();
    return {
      top: state.teams.top.total,
      bottom: state.teams.bottom.total,
    };
  },

  calculateTotalJassPoints: () => {
    const state = get();
    return {
      top: state.teams.top.jassPoints,
      bottom: state.teams.bottom.jassPoints,
    };
  },

  getGameHistory: () => get().games,

  getCurrentGame: () => {
    const state = get();
    return state.games.find((game) => game.id === state.currentGameId);
  },

  getVisibleGames: () => {
    const state = get();
    return state.games.filter((game) => game.id <= state.currentGameId);
  },

  getState: () => get(),
  setState: (partial) => set(partial),
  subscribe: (listener) => useJassStore.subscribe(listener),

  updateWeisPoints: (team: TeamPosition, points: number) => {
    set((state) => {
      const newTeams = {...state.teams};
      newTeams[team].weisPoints += points;
      newTeams[team].total += points;

      return {
        teams: newTeams,
      };
    });
  },

  updateCurrentGame: (update: GameUpdate) => {
    set((state) => {
      const currentGame = state.games.find((g) => g.id === state.currentGameId);
      if (!currentGame) return state;

      // Tiefes Merge der Teams mit Typensicherheit
      const updatedTeams = update.teams ? {
        top: {
          ...currentGame.teams.top,
          ...update.teams.top,
        },
        bottom: {
          ...currentGame.teams.bottom,
          ...update.teams.bottom,
        },
      } : currentGame.teams;

      const updatedGame = {
        ...currentGame,
        ...update,
        teams: updatedTeams,
      };

      return {
        ...state,
        games: state.games.map((g) =>
          g.id === updatedGame.id ? updatedGame : g
        ),
      };
    });
  },

  getTotalsUpToGame: (gameId: number): GameTotals => {
    const state = get();
    const relevantGames = state.games.filter((g) => g.id <= gameId);

    const initialTotals: GameTotals = {
      striche: {
        top: {berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0},
        bottom: {berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0},
      },
      punkte: {
        top: 0,
        bottom: 0,
      },
    };

    return relevantGames.reduce((totals, game) => ({
      striche: {
        top: {
          berg: totals.striche.top.berg + game.teams.top.striche.berg,
          sieg: totals.striche.top.sieg + game.teams.top.striche.sieg,
          matsch: totals.striche.top.matsch + game.teams.top.striche.matsch,
          schneider: totals.striche.top.schneider + game.teams.top.striche.schneider,
          kontermatsch: totals.striche.top.kontermatsch + game.teams.top.striche.kontermatsch,
        },
        bottom: {
          berg: totals.striche.bottom.berg + game.teams.bottom.striche.berg,
          sieg: totals.striche.bottom.sieg + game.teams.bottom.striche.sieg,
          matsch: totals.striche.bottom.matsch + game.teams.bottom.striche.matsch,
          schneider: totals.striche.bottom.schneider + game.teams.bottom.striche.schneider,
          kontermatsch: totals.striche.bottom.kontermatsch + game.teams.bottom.striche.kontermatsch,
        },
      },
      punkte: {
        top: totals.punkte.top + game.teams.top.total,
        bottom: totals.punkte.bottom + game.teams.bottom.total,
      },
    }), initialTotals);
  },

  startGame: () => {
    const state = get();
    if (!state.currentSession) {
      console.error("Keine gültige Session gefunden");
      return;
    }

    // 1. Neues Spiel vorbereiten
    const newGameId = state.currentGameId + 1;
    const currentGame = state.games.find((game) => game.id === state.currentGameId);
    const nextStartingPlayer = determineNextStartingPlayer(
      currentGame || null,
      useGameStore.getState().startingPlayer
    );

    // 2. Neues Spiel erstellen
    const newGame = createGameEntry(
      newGameId,
      nextStartingPlayer,
      state.currentSession.id
    );

    // 3. Timer für neues Spiel aktivieren
    const timerStore = useTimerStore.getState();
    timerStore.activateGameTimer(newGameId);
    timerStore.startGameTimer();
    timerStore.startRoundTimer();

    // 4. GameStore zurücksetzen
    useGameStore.setState((state) => ({
      ...state,
      currentPlayer: nextStartingPlayer,
      startingPlayer: nextStartingPlayer,
      scores: {top: 0, bottom: 0},
      weisPoints: {top: 0, bottom: 0},
      striche: {
        top: {berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0},
        bottom: {berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0},
      },
      roundHistory: [],
      currentRound: 1,
      isGameStarted: true,
      isRoundCompleted: false,
      isGameCompleted: false,
    }));

    // 5. JassStore aktualisieren
    set((state) => ({
      ...state,
      currentGameId: newGameId,
      games: [...state.games, newGame],
      currentSession: {
        ...state.currentSession!,
        games: [...state.currentSession!.games, newGameId],
        statistics: {
          ...state.currentSession!.statistics,
          gamesPlayed: (state.currentSession!.statistics?.gamesPlayed || 0) + 1,
          totalDuration: Date.now() - state.currentSession!.startedAt,
          scores: {
            top: state.teams.top.total,
            bottom: state.teams.bottom.total,
          },
          weisCount: state.currentSession!.statistics?.weisCount || 0,
          stricheCount: state.currentSession!.statistics?.stricheCount || {
            berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0,
          },
        },
      },
    }));

    // 6. Session speichern
    get().saveSession().catch(console.error);
  },
});

export const useJassStore = create<JassStore>()(createJassStore);
