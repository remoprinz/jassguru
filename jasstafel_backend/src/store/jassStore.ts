// src/store/jassStore.ts

import { create, StateCreator } from 'zustand';
import { useGameStore } from './gameStore';
import { jassStorage } from './jassStorage';
import { 
  TeamPosition, 
  PlayerNames,
  JassStore,
  JassState,
  GameEntry,
  TeamStand,
  TeamScores,
  StrichTyp,
  JassSession,
  GameTotals,
  StricheRecord,
  PlayerNumber,
  GameState,
  getTeamConfig,
  determineNextStartingPlayer,
  TeamConfig
} from '../types/jass';
import { useTimerStore } from './timerStore';
import { 
  getNextPlayerInTeam,
  getTeamForPlayer 
} from '../types/jass';

const createGameEntry = (
  id: number, 
  startingPlayer: PlayerNumber,
  sessionId: string = 'default'
): GameEntry => {
  console.log('📝 Creating Game Entry:', {
    id,
    startingPlayer,
    sessionId
  });
  return ({
    id,
    timestamp: Date.now(),
    teams: {
      top: createInitialTeamStand(),
      bottom: createInitialTeamStand()
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
      lastNavigationTimestamp: Date.now()
    },
    isGameStarted: false,
    isRoundCompleted: false,
    isGameCompleted: false
  });
};

export const createInitialTeamStand = (): TeamStand => ({
  bergActive: false,
  bedankenActive: false,
  isSigned: false,
  striche: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
  total: 0,
  jassPoints: 0,
  weisPoints: 0,
  playerStats: {
    1: { striche: 0, points: 0, weisPoints: 0 },
    2: { striche: 0, points: 0, weisPoints: 0 },
    3: { striche: 0, points: 0, weisPoints: 0 },
    4: { striche: 0, points: 0, weisPoints: 0 }
  }
});

const aggregateGameResult = (teams: Record<TeamPosition, TeamStand>, scores: TeamScores): Record<TeamPosition, TeamStand> => {
  const newTeams = { ...teams };
  newTeams.top = {
    ...newTeams.top,
    jassPoints: newTeams.top.jassPoints + scores.top,
    weisPoints: newTeams.top.weisPoints + (scores.weisPoints?.top || 0),
    total: newTeams.top.total + scores.top + (scores.weisPoints?.top || 0)
  };
  newTeams.bottom = {
    ...newTeams.bottom,
    jassPoints: newTeams.bottom.jassPoints + scores.bottom,
    weisPoints: newTeams.bottom.weisPoints + (scores.weisPoints?.bottom || 0),
    total: newTeams.bottom.total + scores.bottom + (scores.weisPoints?.bottom || 0)
  };
  return newTeams;
};

const calculateStricheTotal = (striche: StricheRecord): number => 
  Object.values(striche).reduce((sum, count) => sum + count, 0);

const createJassStore: StateCreator<JassStore> = (set, get) => ({
  isJassStarted: false,
  currentSession: null,
  currentRound: 1,
  isJassCompleted: false,
  teams: {
    top: createInitialTeamStand(),
    bottom: createInitialTeamStand()
  },
  games: [],
  currentGameId: 0,
  currentGameCache: null,

  saveSession: async () => {
    const state = get();
    const gameState = useGameStore.getState();
    
    const session: JassSession = {
      id: `session_${Date.now()}`,
      gruppeId: 'default',
      startedAt: state.games[0]?.timestamp || Date.now(),
      endedAt: Date.now(),
      playerNames: gameState.playerNames,
      games: state.games.map(g => g.id),
      metadata: {
        location: 'Standard Location',
        notes: ''
      },
      statistics: {
        gamesPlayed: state.games.length,
        totalDuration: Date.now() - (state.games[0]?.timestamp || Date.now()),
        scores: {
          top: state.teams.top.total,
          bottom: state.teams.bottom.total
        },
        weisCount: state.games.reduce((acc, game) => 
          acc + (game.teams.top.weisPoints + game.teams.bottom.weisPoints), 0),
        stricheCount: state.games.reduce((acc, game) => ({
          berg: acc.berg + game.teams.top.striche.berg + game.teams.bottom.striche.berg,
          sieg: acc.sieg + game.teams.top.striche.sieg + game.teams.bottom.striche.sieg,
          matsch: acc.matsch + game.teams.top.striche.matsch + game.teams.bottom.striche.matsch,
          schneider: acc.schneider + game.teams.top.striche.schneider + game.teams.bottom.striche.schneider,
          kontermatsch: acc.kontermatsch + game.teams.top.striche.kontermatsch + game.teams.bottom.striche.kontermatsch
        }), { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 })
      }
    };

    try {
      await jassStorage.saveSession(session);
      return session.id;
    } catch (error) {
      console.error('Fehler beim Speichern der Session:', error);
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
      console.error('Fehler beim Laden der Session:', error);
      throw error;
    }
  },

  startJass: (config: {
    playerNames: PlayerNames;
    initialStartingPlayer: PlayerNumber;
  }) => {
    const gameStore = useGameStore.getState();
    
    const firstGame = createGameEntry(
      1,
      gameStore.currentPlayer,
      'default'
    );
    
    console.log('🃏 First Game Created:', firstGame);
    
    set({
      currentGameId: 1,
      games: [firstGame],
      currentSession: {
        id: `jass_${Date.now()}`,
        gruppeId: 'default',
        startedAt: Date.now(),
        playerNames: config.playerNames,
        games: [1],
        metadata: {
          location: 'Standard Location',
          notes: ''
        },
        statistics: {
          gamesPlayed: 1,
          totalDuration: 0,
          scores: { top: 0, bottom: 0 },
          weisCount: 0,
          stricheCount: {
            berg: 0, sieg: 0, matsch: 0, 
            schneider: 0, kontermatsch: 0
          }
        }
      }
    });

    set({ isJassStarted: true });

    const timerStore = useTimerStore.getState();
    timerStore.startJassTimer();
  },

  finalizeGame: () => {
    const state = get();
    const gameStore = useGameStore.getState();
    const currentGame = state.games.find(game => game.id === state.currentGameId);
    if (!currentGame) return;

    // VOLLSTÄNDIGER Spielzustand wird gespeichert
    const updatedGame: GameEntry = {
      ...currentGame,
      // Basis-Informationen
      teams: {
        top: { 
          ...currentGame.teams.top, 
          jassPoints: gameStore.scores.top,
          total: gameStore.scores.top,
          striche: { ...gameStore.striche.top }
        },
        bottom: { 
          ...currentGame.teams.bottom, 
          jassPoints: gameStore.scores.bottom,
          total: gameStore.scores.bottom,
          striche: { ...gameStore.striche.bottom }
        }
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
      isGameCompleted: true // Wird beim Finalisieren auf true gesetzt
    };

    // Update games array
    const newGames = state.games.map(game => 
      game.id === currentGame.id ? updatedGame : game
    );

    set({ games: newGames });
  },

  resetJass: () => {
    set({
      isJassStarted: false,
      currentSession: null,
      currentRound: 0,
      isJassCompleted: false,
      teams: {
        top: createInitialTeamStand(),
        bottom: createInitialTeamStand()
      },
      games: [],
      currentGameId: 0,
    });
  },

  undoNewGame: () => {
    const state = get();
    if (state.games.length <= 1) return;

    const newGames = state.games.slice(0, -1);
    const previousGame = newGames[newGames.length - 1];
    if (!previousGame) return;

    const gameStore = useGameStore.getState();
    gameStore.resetGamePoints();
    gameStore.setScore('top', previousGame.teams.top.jassPoints);
    gameStore.setScore('bottom', previousGame.teams.bottom.jassPoints);

    const removedGame = state.games[state.games.length - 1];
    const reversedTeams = { ...state.teams };

    reversedTeams.top = {
      ...reversedTeams.top,
      jassPoints: reversedTeams.top.jassPoints - removedGame.teams.top.jassPoints,
      total: reversedTeams.top.total - removedGame.teams.top.jassPoints
    };

    reversedTeams.bottom = {
      ...reversedTeams.bottom,
      jassPoints: reversedTeams.bottom.jassPoints - removedGame.teams.bottom.jassPoints,
      total: reversedTeams.bottom.total - removedGame.teams.bottom.jassPoints
    };

    set({
      games: newGames,
      currentGameId: previousGame.id,
      teams: reversedTeams
    });
  },

  navigateToGame: (gameId) => {
    const state = get();
    const targetGame = state.games.find(game => game.id === gameId);
    if (!targetGame) return;

    const isLatestGame = gameId === state.games.length;
    const lastHistoryIndex = targetGame.roundHistory.length - 1;
    const lastRound = targetGame.roundHistory[lastHistoryIndex];

    const roundState = lastRound?.roundState ?? {
      roundNumber: targetGame.currentRound,
      nextPlayer: targetGame.currentPlayer
    };

    // GameStore-State unterschiedlich setzen je nachdem ob aktuelles oder historisches Spiel
    useGameStore.setState({
      scores: {
        top: targetGame.teams.top.jassPoints,
        bottom: targetGame.teams.bottom.jassPoints
      },
      striche: {
        top: targetGame.teams.top.striche,
        bottom: targetGame.teams.bottom.striche
      },
      roundHistory: targetGame.roundHistory,
      currentRound: roundState.roundNumber,
      currentPlayer: roundState.nextPlayer,
      currentHistoryIndex: isLatestGame ? lastHistoryIndex : -1, // Reset bei aktuellem Spiel
      historyState: {
        isNavigating: !isLatestGame, // Nur bei historischen Spielen navigieren
        lastNavigationTimestamp: Date.now()
      },
      isGameStarted: true,
      isRoundCompleted: lastRound?.isRoundFinalized ?? false,
      isGameCompleted: targetGame.isGameCompleted ?? false
    });

    set({
      currentGameId: gameId,
      teams: targetGame.teams
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
      get().navigateToGame(state.currentGameId + 1);
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
      bottom: state.teams.bottom.total
    };
  },

  calculateTotalJassPoints: () => {
    const state = get();
    return {
      top: state.teams.top.jassPoints,
      bottom: state.teams.bottom.jassPoints
    };
  },

  getGameHistory: () => get().games,

  getCurrentGame: () => {
    const state = get();
    return state.games.find(game => game.id === state.currentGameId);
  },

  getVisibleGames: () => {
    const state = get();
    return state.games.filter(game => game.id <= state.currentGameId);
  },

  getState: () => get(),
  setState: (partial) => set(partial),
  subscribe: (listener) => useJassStore.subscribe(listener),

  updateWeisPoints: (team: TeamPosition, points: number) => {
    set(state => {
      const newTeams = { ...state.teams };
      newTeams[team].weisPoints += points;
      newTeams[team].total += points;

      return {
        teams: newTeams
      };
    });
  },

  updateCurrentGame: (update) => {
    set(state => {
      const currentGame = state.games.find(game => game.id === state.currentGameId);
      if (!currentGame) return state;

      // Tiefes Merge der Teams-Daten
      const updatedTeams = update.teams ? {
        top: {
          ...currentGame.teams.top,
          ...update.teams.top
        },
        bottom: {
          ...currentGame.teams.bottom,
          ...update.teams.bottom
        }
      } : currentGame.teams;

      return {
        ...state,
        games: state.games.map(game => 
          game.id === state.currentGameId
            ? {
                ...game,
                ...update,
                teams: updatedTeams
              }
            : game
        )
      };
    });
  },

  getTotalsUpToGame: (gameId: number): GameTotals => {
    const state = get();
    const relevantGames = state.games.filter(game => game.id <= gameId);
    
    return relevantGames.reduce((totals, game) => ({
      striche: {
        top: totals.striche.top + calculateStricheTotal(game.teams.top.striche),
        bottom: totals.striche.bottom + calculateStricheTotal(game.teams.bottom.striche)
      },
      punkte: {
        top: totals.punkte.top + game.teams.top.total,
        bottom: totals.punkte.bottom + game.teams.bottom.total
      }
    }), {
      striche: { top: 0, bottom: 0 },
      punkte: { top: 0, bottom: 0 }
    });
  },

  startGame: () => {
    const state = get();
    if (!state.currentSession) {
      console.error('Keine gültige Session gefunden');
      return;
    }

    const gameStore = useGameStore.getState();
    const newGameId = state.currentGameId + 1;
    
    // Hole das aktuelle Spiel für die Determination
    const currentGame = state.games.find(game => game.id === state.currentGameId);
    
    // Bestimme den korrekten Startspieler
    const nextStartingPlayer = determineNextStartingPlayer(
      currentGame || null,
      gameStore.startingPlayer
    );
    
    // Erstelle neues Spiel mit korrektem Startspieler
    const newGame = createGameEntry(
      newGameId,
      nextStartingPlayer,
      state.currentSession.id
    );
    
    // GameStore aktualisieren
    useGameStore.setState({
      currentPlayer: nextStartingPlayer,
      startingPlayer: nextStartingPlayer,
      scores: { top: 0, bottom: 0 },
      weisPoints: { top: 0, bottom: 0 },
      striche: {
        top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
        bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
      },
      roundHistory: [],
      currentRound: 1,
      isGameStarted: true,
      isRoundCompleted: false,
      isGameCompleted: false
    });
    
    // JassStore aktualisieren
    set((state): JassState => ({
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
            bottom: state.teams.bottom.total
          },
          weisCount: state.currentSession!.statistics?.weisCount || 0,
          stricheCount: state.currentSession!.statistics?.stricheCount || {
            berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0
          }
        }
      }
    }));
    
    // Session speichern
    get().saveSession().catch(console.error);

    // Timer für neues Spiel starten
    const timerStore = useTimerStore.getState();
    timerStore.resetGameTimers();
    timerStore.startGameTimer();
    timerStore.startRoundTimer();
  },
});

export const useJassStore = create<JassStore>()(createJassStore);
