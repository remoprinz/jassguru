import { create } from 'zustand';
import { triggerBergConfetti } from '../components/effects/BergConfetti';
import { triggerBedankenFireworks } from '../components/effects/BedankenFireworks';
import { triggerSchneiderEffect } from '../components/effects/SchneiderEffect';
import { triggerKontermatschChaos } from '../components/effects/KontermatschChaos';
import { triggerMatschConfetti } from '../components/effects/MatschConfetti';
import { useGameStore } from './gameStore';
import { SCHNEIDER_SCORE } from '../config/GameSettings';
import { 
  TeamPosition, 
  TeamStand, 
  JassStore,
  StrichTyp,
  JassState,
  GameEntry,
  STRICH_WERTE,
  Teams
} from '../types/jass';

// Hilfsfunktionen
const createInitialTeamStand = (): TeamStand => ({
  bergActive: false,
  bedankenActive: false,
  striche: {
    berg: 0,
    sieg: 0,
    matsch: 0,
    schneider: 0,
    kontermatsch: 0
  },
  total: 0,
  isSigned: false,
  jassPoints: 0,
  playerStats: {
    1: { striche: 0, points: 0 },
    2: { striche: 0, points: 0 },
    3: { striche: 0, points: 0 },
    4: { striche: 0, points: 0 }
  }
});

const getTargetTeam = (clickedPosition: TeamPosition): TeamPosition => {
  return clickedPosition;
};

const updateTeamStriche = (
  state: JassState,
  team: TeamPosition,
  type: keyof StrichTyp,
  isActive?: boolean
): Partial<JassState> => {
  const teamStand = state.teams[team];
  const strichWert = STRICH_WERTE[type];
  const newStricheCount = (teamStand.striche[type] || 0) + 1;
  
  return {
    teams: {
      ...state.teams,
      [team]: {
        ...teamStand,
        ...(isActive !== undefined && { [`${type}Active`]: isActive }),
        striche: {
          ...teamStand.striche,
          [type]: newStricheCount
        },
        total: teamStand.total + strichWert
      }
    }
  };
};

const removeTeamStrich = (
  state: JassState,
  team: TeamPosition,
  type: keyof StrichTyp
): Partial<JassState> => {
  const teamStand = state.teams[team];
  const strichWert = STRICH_WERTE[type];
  const newStricheCount = Math.max(0, (teamStand.striche[type] || 0) - 1);
  
  return {
    teams: {
      ...state.teams,
      [team]: {
        ...teamStand,
        striche: {
          ...teamStand.striche,
          [type]: newStricheCount
        },
        total: Math.max(0, teamStand.total - strichWert)
      }
    }
  };
};

const createInitialState = (): JassState => ({
  bergChargeAmount: 0,
  bedankenChargeAmount: 0,
  matschChargeAmount: 0,
  bergPressStartTime: null,
  bedankenPressStartTime: null,
  matschPressStartTime: null,
  bergChargeInterval: null,
  bedankenChargeInterval: null,
  matschChargeInterval: null,
  currentRound: 1,
  isJassCompleted: false,
  teams: {
    top: createInitialTeamStand(),
    bottom: createInitialTeamStand()
  },
  games: [],
  currentGameId: 1,
  currentGameCache: null,
});

// Typdefinitionen für Store-Selektoren
export interface JassStoreSelectors {
  games: GameEntry[];
  currentGameId: number;
  teams: Teams;
  calculateTotalPoints: () => { top: number; bottom: number };
  calculateTotalJassPoints: () => { top: number; bottom: number };
}

// Store-Definition mit Selektoren
export const useJassStore = create<JassStore>((set, get) => ({
  ...createInitialState(),
  getState: () => get(),
  setState: (partial) => set(partial),
  subscribe: (listener) => {
    return () => {};  // Subscription-Cleanup
  },

  // Berg-Aktionen
  startBergCharge: (team: TeamPosition) => {
    const state = get();
    const otherTeam = team === 'top' ? 'bottom' : 'top';
    if (state.teams[otherTeam].bergActive || state.bergChargeInterval) return;

    const interval = setInterval(() => {
      set((state) => ({
        bergChargeAmount: Math.min(state.bergChargeAmount + 0.1, 1)
      }));
    }, 100);

    set({
      bergPressStartTime: Date.now(),
      bergChargeInterval: interval
    });
  },

  stopBergCharge: (clickedPosition: TeamPosition) => {
    const state = get();
    if (!state.bergChargeInterval) return;
    
    clearInterval(state.bergChargeInterval);
    const targetTeam = getTargetTeam(clickedPosition);
    const teamStand = state.teams[targetTeam];
    
    if (teamStand.bergActive) {
      set((state) => ({
        teams: {
          ...state.teams,
          [targetTeam]: {
            ...state.teams[targetTeam],
            bergActive: false,
            striche: {
              ...state.teams[targetTeam].striche,
              berg: 0
            },
            total: Math.max(0, state.teams[targetTeam].total - STRICH_WERTE.berg)
          }
        },
        bergChargeInterval: null,
        bergChargeAmount: 0,
        bergPressStartTime: null
      }));
    } else if (teamStand.striche.berg >= 1) {
      set({
        bergChargeInterval: null,
        bergChargeAmount: 0,
        bergPressStartTime: null
      });
    } else {
      set({
        ...updateTeamStriche(state, targetTeam, 'berg', true),
        bergChargeInterval: null,
        bergChargeAmount: 0,
        bergPressStartTime: null
      });
      triggerBergConfetti(state.bergChargeAmount);
    }
  },

  // Bedanken-Aktionen
  startBedankenCharge: (team: TeamPosition) => {
    const state = get();
    const otherTeam = team === 'top' ? 'bottom' : 'top';
    const hasBerg = state.teams.top.bergActive || state.teams.bottom.bergActive;
    
    if (!hasBerg || state.teams[otherTeam].bedankenActive || state.bedankenChargeInterval) return;

    const interval = setInterval(() => {
      set((state) => ({
        bedankenChargeAmount: Math.min(state.bedankenChargeAmount + 0.1, 1)
      }));
    }, 100);

    set({
      bedankenPressStartTime: Date.now(),
      bedankenChargeInterval: interval
    });
  },

  stopBedankenCharge: (clickedPosition: TeamPosition) => {
    const state = get();
    const gameState = useGameStore.getState();
    if (!state.bedankenChargeInterval) return;
    
    clearInterval(state.bedankenChargeInterval);
    const targetTeam = getTargetTeam(clickedPosition);
    const teamStand = state.teams[targetTeam];
    const hasBerg = state.teams.top.bergActive || state.teams.bottom.bergActive;
    
    if (teamStand.bedankenActive) {
      set((state) => ({
        teams: {
          ...state.teams,
          [targetTeam]: {
            ...state.teams[targetTeam],
            bedankenActive: false,
            striche: {
              ...state.teams[targetTeam].striche,
              sieg: 0,
              schneider: 0
            },
            total: Math.max(0, state.teams[targetTeam].total - STRICH_WERTE.sieg - (teamStand.striche.schneider ? STRICH_WERTE.schneider * 2 : 0))
          }
        },
        bedankenChargeInterval: null,
        bedankenChargeAmount: 0,
        bedankenPressStartTime: null
      }));
    } else if (hasBerg) {
      const oppositeTeam = targetTeam === 'top' ? 'bottom' : 'top';
      const oppositeScore = oppositeTeam === 'top' ? gameState.topScore : gameState.bottomScore;
      const isSchneider = oppositeScore < SCHNEIDER_SCORE;

      set((state) => ({
        teams: {
          ...state.teams,
          [targetTeam]: {
            ...state.teams[targetTeam],
            bedankenActive: true,
            striche: {
              ...state.teams[targetTeam].striche,
              sieg: (state.teams[targetTeam].striche.sieg || 0) + 1,
              schneider: isSchneider ? 2 : 0
            },
            total: state.teams[targetTeam].total + STRICH_WERTE.sieg + (isSchneider ? STRICH_WERTE.schneider : 0)
          }
        },
        bedankenChargeInterval: null,
        bedankenChargeAmount: 0,
        bedankenPressStartTime: null
      }));
      
      triggerBedankenFireworks(state.bedankenChargeAmount);
      if (isSchneider) {
        triggerSchneiderEffect();
      }
    } else {
      set({
        bedankenChargeInterval: null,
        bedankenChargeAmount: 0,
        bedankenPressStartTime: null
      });
    }
  },

  // Status-Prüfungen
  hasBergForTeam: (team: TeamPosition): boolean => {
    return get().teams[team].bergActive;
  },

  hasBedankenForTeam: (team: TeamPosition): boolean => {
    return get().teams[team].bedankenActive;
  },

  // Strich-Aktionen
  addStrich: (clickedPosition: TeamPosition, type: keyof StrichTyp) => set((state) => {
    const targetTeam = getTargetTeam(clickedPosition);
    if (!targetTeam || !state.teams[targetTeam]) {
      console.warn('Ungültiges Team:', targetTeam);
      return state;
    }

    // Hole den Wert direkt aus STRICH_WERTE
    const strichWert = STRICH_WERTE[type];
    
    // Aktualisiere den gameStore mit dem korrekten Wert
    const gameStore = useGameStore.getState();
    gameStore.updateStricheCounts(targetTeam, strichWert, 1);

    return updateTeamStriche(state, targetTeam, type);
  }),

  // Matsch-Aktionen
  startMatschCharge: (clickedPosition: TeamPosition) => {
    const currentPlayer = useGameStore.getState().currentPlayer;
    console.log('🎮 Start Matsch Debug:', {
      clickedPosition,
      currentPlayer,
      activeTeam: currentPlayer % 2 === 1 ? 'bottom' : 'top'
    });
    
    const state = get();
    if (state.matschChargeInterval) return;

    const interval = setInterval(() => {
      set((state) => ({
        matschChargeAmount: Math.min(state.matschChargeAmount + 0.1, 1)
      }));
    }, 100);

    set({
      matschPressStartTime: Date.now(),
      matschChargeInterval: interval
    });
  },

  stopMatschCharge: (clickedPosition: TeamPosition) => {
    const state = get();
    if (!state.matschChargeInterval) return;

    clearInterval(state.matschChargeInterval);
    
    const currentPlayer = useGameStore.getState().currentPlayer;
    const playerTeam = currentPlayer === 1 || currentPlayer === 3 ? 'bottom' : 'top';
    const isKontermatsch = clickedPosition !== playerTeam;
    const currentChargeAmount = state.matschChargeAmount;
    
    const targetTeam = getTargetTeam(clickedPosition);
    
    set({
      ...updateTeamStriche(state, targetTeam, isKontermatsch ? 'kontermatsch' : 'matsch'),
      matschChargeInterval: null,
      matschChargeAmount: 0,
      matschPressStartTime: null
    });

    if (isKontermatsch) {
      triggerKontermatschChaos(currentChargeAmount);
    } else {
      triggerMatschConfetti(currentChargeAmount, useGameStore.getState().isCalculatorFlipped);
    }
  },

  // Spiel-Management
  resetJass: () => {
    set(() => createInitialState());
  },

  startNewGame: () => set((state) => {
    const newGameId = state.games.length > 0 ? state.games[state.games.length - 1].id + 1 : 1;

    const newGame: GameEntry = {
      id: newGameId,
      timestamp: Date.now(),
      teams: {
        top: createInitialTeamStand(),
        bottom: createInitialTeamStand()
      },
      milestones: {}
    };

    return {
      ...state,
      currentGameId: newGameId,
      games: [...state.games, newGame],
      teams: {
        top: createInitialTeamStand(),
        bottom: createInitialTeamStand()
      }
    };
  }),

// Game Historie und Navigation
getGameHistory: () => get().games,
  
getCurrentGame: () => {
  const state = get();
  return state.games.find(game => game.id === state.currentGameId);
},

calculateTotalPoints: () => {
  const state = get();
  
  // Berechnung der historischen Totals
  const historicalTotals = state.games
    .filter(game => game.id < state.currentGameId)
    .reduce((acc, game) => ({
      top: acc.top + (game.teams.top.total || 0),
      bottom: acc.bottom + (game.teams.bottom.total || 0)
    }), { top: 0, bottom: 0 });

  // Für das aktuelle Spiel nehmen wir einfach die Summe der Striche
  if (state.currentGameId === state.games.length) {
    const currentTeams = state.teams;
    return {
      top: historicalTotals.top + currentTeams.top.total,
      bottom: historicalTotals.bottom + currentTeams.bottom.total
    };
  }

  // Für historische Spiele verwenden wir die gespeicherten Totals
  const currentGame = state.games.find(game => game.id === state.currentGameId);
  return {
    top: historicalTotals.top + (currentGame?.teams.top.total || 0),
    bottom: historicalTotals.bottom + (currentGame?.teams.bottom.total || 0)
  };
},

calculateTotalJassPoints: () => {
  const state = get();
  const gameStore = useGameStore.getState();
  
  const historicalPoints = state.games
    .filter(game => game.id < state.currentGameId)
    .reduce((acc, game) => ({
      top: acc.top + (game.teams.top.jassPoints || 0),
      bottom: acc.bottom + (game.teams.bottom.jassPoints || 0)
    }), { top: 0, bottom: 0 });

  if (state.currentGameId === state.games.length) {
    return {
      top: historicalPoints.top + gameStore.topScore,
      bottom: historicalPoints.bottom + gameStore.bottomScore
    };
  }

  const currentGame = state.games.find(game => game.id === state.currentGameId);
  return {
    top: historicalPoints.top + (currentGame?.teams.top.jassPoints || 0),
    bottom: historicalPoints.bottom + (currentGame?.teams.bottom.jassPoints || 0)
  };
},

finalizeGame: () => {
  const state = get();
  const gameState = useGameStore.getState();
  const currentGame = state.games.find(game => game.id === state.currentGameId);
  
  if (currentGame) {
    const updatedGame = {
      ...currentGame,
      teams: {
        top: {
          ...state.teams.top,
          jassPoints: gameState.topScore
        },
        bottom: {
          ...state.teams.bottom,
          jassPoints: gameState.bottomScore
        }
      }
    };

    useGameStore.getState().resetGamePoints();

    set((state) => ({
      games: state.games.map(game => 
        game.id === state.currentGameId ? updatedGame : game
      ),
      teams: {
        top: createInitialTeamStand(),
        bottom: createInitialTeamStand()
      }
    }));
  }
},

// Neue Navigation Methoden
navigateToPreviousGame: () => {
  const state = get();
  const currentIndex = state.games.findIndex(game => game.id === state.currentGameId);
  
  if (currentIndex <= 0) return false;
  
  // Cache speichern wenn wir im neuesten Spiel sind
  if (state.currentGameId === state.games.length) {
    get().saveCurrentGameToCache();
  }
  
  const previousGame = state.games[currentIndex - 1];
  const gameStore = useGameStore.getState();
  
  gameStore.resetGamePoints(); // Reset vor dem Setzen neuer Daten
  gameStore.setTopScore(previousGame.teams.top.jassPoints);
  gameStore.setBottomScore(previousGame.teams.bottom.jassPoints);
  gameStore.synchronizeStricheCounts(previousGame.teams);
  
  set({
    currentGameId: previousGame.id,
    teams: {
      top: { ...previousGame.teams.top, isSigned: false },
      bottom: { ...previousGame.teams.bottom, isSigned: false }
    }
  });
  
  return true;
},

navigateToNextGame: () => {
  const state = get();
  const currentIndex = state.games.findIndex(game => game.id === state.currentGameId);
  
  if (currentIndex >= state.games.length - 1) return false;
  
  const nextGame = state.games[currentIndex + 1];
  const gameStore = useGameStore.getState();
  
  gameStore.resetGamePoints(); // Reset vor dem Setzen neuer Daten
  
  // Cache wiederherstellen wenn wir zum neuesten Spiel navigieren
  if (nextGame.id === state.games.length) {
    get().restoreCurrentGameFromCache();
  } else {
    gameStore.setTopScore(nextGame.teams.top.jassPoints);
    gameStore.setBottomScore(nextGame.teams.bottom.jassPoints);
    gameStore.synchronizeStricheCounts(nextGame.teams);
  }
  
  set({
    currentGameId: nextGame.id,
    teams: {
      top: { ...nextGame.teams.top, isSigned: false },
      bottom: { ...nextGame.teams.bottom, isSigned: false }
    }
  });
  
  return true;
},

undoNewGame: () => set((state) => {
  const newGames = state.games.slice(0, -1);
  const previousGame = newGames[newGames.length - 1];
  
  if (!previousGame) return state;

  const gameStore = useGameStore.getState();
  gameStore.resetGamePoints();
  gameStore.setTopScore(previousGame.teams.top.jassPoints || 0);
  gameStore.setBottomScore(previousGame.teams.bottom.jassPoints || 0);
  gameStore.synchronizeStricheCounts(previousGame.teams);

  return {
    ...state,
    games: newGames,
    currentGameId: previousGame.id,
    teams: {
      top: { ...previousGame.teams.top, isSigned: false },
      bottom: { ...previousGame.teams.bottom, isSigned: false }
    }
  };
}),

navigateToGame: (gameId: number) => set((state) => {
  const targetGame = state.games.find(game => game.id === gameId);
  if (!targetGame) return state;

  const gameStore = useGameStore.getState();

  // Cache speichern wenn wir im neuesten Spiel sind
  if (state.currentGameId === state.games.length) {
    get().saveCurrentGameToCache();
  }

  // Cache wiederherstellen wenn wir zum neuesten Spiel navigieren
  if (gameId === state.games.length) {
    get().restoreCurrentGameFromCache();
  } else {
    gameStore.resetGamePoints();
    gameStore.setTopScore(targetGame.teams.top.jassPoints || 0);
    gameStore.setBottomScore(targetGame.teams.bottom.jassPoints || 0);
    gameStore.synchronizeStricheCounts(targetGame.teams);
  }

  return {
    ...state,
    currentGameId: gameId,
    teams: {
      top: { ...targetGame.teams.top, isSigned: false },
      bottom: { ...targetGame.teams.bottom, isSigned: false }
    }
  };
}),

canNavigateBack: () => {
  const state = get();
  return state.currentGameId > 1;
},

canNavigateForward: () => {
  const state = get();
  return state.currentGameId < state.games.length;
},

getVisibleGames: () => {
  const state = get();
  return state.games.filter(game => game.id <= state.currentGameId);
},

isCurrentGameEmpty: () => {
  const gameState = useGameStore.getState();
  const state = get();
  
  // Prfe, ob wir im neuesten Spiel sind
  const isLatestGame = state.currentGameId === state.games.length;
  
  if (isLatestGame) {
    // Wenn wir im neuesten Spiel sind, prüfen wir die Punkte aus dem gameStore
    return gameState.topScore === 0 && gameState.bottomScore === 0;
  } else {
    // Ansonsten prüfen wir die Punkte aus dem currentGame im jassStore
    const currentGame = state.games.find(game => game.id === state.currentGameId);
    if (!currentGame) return true; // Keine Daten, also als leer betrachten

    return currentGame.teams.top.jassPoints === 0 && currentGame.teams.bottom.jassPoints === 0;
  }
},

saveCurrentGameToCache: () => {
  const state = get();
  const gameStore = useGameStore.getState();
  
  if (state.currentGameId === state.games.length) {
    set({
      currentGameCache: {
        stricheCounts: gameStore.stricheCounts,
        scores: {
          top: gameStore.topScore,
          bottom: gameStore.bottomScore
        },
        teams: state.teams
      }
    });
  }
},

restoreCurrentGameFromCache: () => {
  const state = get();
  const gameStore = useGameStore.getState();
  
  if (state.currentGameCache) {
    // Teams wiederherstellen
    set({ teams: state.currentGameCache.teams });
    
    // Punkte wiederherstellen
    gameStore.setTopScore(state.currentGameCache.scores.top);
    gameStore.setBottomScore(state.currentGameCache.scores.bottom);
    
    // Striche über den gameStore wiederherstellen
    const cachedStricheCounts = state.currentGameCache.stricheCounts;
    Object.entries(cachedStricheCounts).forEach(([position, counts]) => {
      Object.entries(counts).forEach(([value, count]) => {
        gameStore.updateStricheCounts(
          position as 'top' | 'bottom',
          parseInt(value),
          count
        );
      });
    });
  }
}
}));

// Typ-Sicherheit für Store-Zugriffe
export const getJassState = (): JassStoreSelectors => ({
  games: useJassStore.getState().games,
  currentGameId: useJassStore.getState().currentGameId,
  teams: useJassStore.getState().teams,
  calculateTotalPoints: useJassStore.getState().calculateTotalPoints,
  calculateTotalJassPoints: useJassStore.getState().calculateTotalJassPoints
});