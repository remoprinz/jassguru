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
  MatschResult,
  GameEntry
} from '../types/jass';

const createInitialTeamStand = (): TeamStand => ({
  bergActive: false,
  bedankenActive: false,
  isSigned: false,
  striche: {
    berg: 0,
    sieg: 0,
    matsch: 0,
    schneider: 0,
    kontermatsch: 0
  },
  total: 0,
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

const STRICH_WERTE: Record<keyof StrichTyp, number> = {
  berg: 1,
  sieg: 2,
  matsch: 1,
  schneider: 2,
  kontermatsch: 2
};

const updateTeamStriche = (
  state: JassState,
  team: TeamPosition,
  type: keyof StrichTyp,
  isActive?: boolean
): Partial<JassState> => {
  const teamStand = state.teams[team];
  const strichWert = STRICH_WERTE[type];
  
  return {
    teams: {
      ...state.teams,
      [team]: {
        ...teamStand,
        ...(isActive !== undefined && { [`${type}Active`]: isActive }),
        striche: {
          ...teamStand.striche,
          [type]: (teamStand.striche[type] || 0) + 1
        },
        total: teamStand.total + strichWert
      }
    }
  };
};

export const useJassStore = create<JassStore>()((set, get) => ({
  // Basis-Zustand
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
  // Neue Basis-Zustände
  games: [{
    id: 1,
    timestamp: Date.now(),
    teams: {
      top: createInitialTeamStand(),
      bottom: createInitialTeamStand()
    },
    milestones: {}
  }],
  currentGameId: 1,

  // Aktionen
  startBergCharge: (team: TeamPosition) => {
    const state = get();
    if (state.bergChargeInterval) return;

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
    if (state.bergChargeInterval) {
      clearInterval(state.bergChargeInterval);
      
      const targetTeam = getTargetTeam(clickedPosition);
      
      if (!state.teams[targetTeam].bergActive) {
        set({
          ...updateTeamStriche(state, targetTeam, 'berg', true),
          bergChargeInterval: null,
          bergChargeAmount: 0,
          bergPressStartTime: null
        });
        triggerBergConfetti(state.bergChargeAmount);
      }
    }
  },

  startBedankenCharge: (team: TeamPosition) => {
    const state = get();
    const hasBerg = state.teams.top.bergActive || state.teams.bottom.bergActive;
    
    if (!hasBerg || state.bedankenChargeInterval) return;

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

  stopBedankenCharge: (team: TeamPosition) => {
    const state = get();
    if (state.bedankenChargeInterval) {
      clearInterval(state.bedankenChargeInterval);
      
      if (!team || !state.teams || !state.teams[team]) {
        console.warn('Invalid team state:', { team, state });
        return;
      }
      
      const hasBerg = state.teams.top.bergActive || state.teams.bottom.bergActive;
      if (hasBerg) {
        const currentStatus = state.teams[team].bedankenActive;
        const teamStand = state.teams[team];
        
        if (!currentStatus) {
          const newStriche = {
            ...teamStand.striche,
            sieg: (teamStand.striche.sieg || 0) + 1
          };
          
          set({ 
            teams: {
              ...state.teams,
              [team]: {
                ...teamStand,
                bedankenActive: true,
                striche: newStriche,
                total: teamStand.total + 2
              }
            },
            bedankenChargeInterval: null,
            bedankenChargeAmount: 0,
            bedankenPressStartTime: null
          });
          
          const oppositeTeam = team === 'top' ? 'bottom' : 'top';
          const oppositeScore = state.teams[oppositeTeam].total;
          const isSchneider = oppositeScore < SCHNEIDER_SCORE;

          if (isSchneider) {
            set((state) => ({
              teams: {
                ...state.teams,
                [team]: {
                  ...state.teams[team],
                  striche: {
                    ...state.teams[team].striche,
                    schneider: (state.teams[team].striche.schneider || 0) + 1
                  }
                }
              }
            }));
            triggerSchneiderEffect();
          } else {
            triggerBedankenFireworks(state.bedankenChargeAmount);
          }
        }
      }
    }
  },

  hasBergForTeam: (team: TeamPosition): boolean => {
    return get().teams[team].bergActive;
  },

  hasBedankenForTeam: (team: TeamPosition): boolean => {
    return get().teams[team].bedankenActive;
  },

  addStrich: (clickedPosition: TeamPosition, type: keyof StrichTyp) => set((state) => {
    const targetTeam = getTargetTeam(clickedPosition);
    if (!targetTeam || !state.teams[targetTeam]) {
      console.warn('Ungültiges Team:', targetTeam);
      return state;
    }
    return updateTeamStriche(state, targetTeam, type);
  }),

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

  resetJass: () => {
    set(() => ({
      games: [],
      currentGameId: 1,
      teams: {
        top: createInitialTeamStand(),
        bottom: createInitialTeamStand()
      },
      isJassCompleted: false
    }));
  },

  startNewGame: () => {
    const state = get();
    const newGame: GameEntry = {
      id: state.currentGameId,
      timestamp: Date.now(),
      teams: {
        top: {
          striche: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
          total: 0,
          playerStats: { 2: { striche: 0, points: 0 }, 4: { striche: 0, points: 0 } }
        },
        bottom: {
          striche: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
          total: 0,
          playerStats: { 1: { striche: 0, points: 0 }, 3: { striche: 0, points: 0 } }
        }
      },
      milestones: {}
    };

    set((state) => ({
      ...state,
      games: [...state.games, newGame],
      teams: {
        top: createInitialTeamStand(),
        bottom: createInitialTeamStand()
      }
    }));
  },

  getGameHistory: () => get().games,
  
  getCurrentGame: () => {
    const state = get();
    return state.games.find(game => game.id === state.currentGameId);
  },

  calculateTotalPoints: () => {
    const state = get();
    
    // Summiere die Punkte aller abgeschlossenen Spiele
    const gameTotals = state.games.reduce((acc, game) => ({
      top: acc.top + (game.teams.top.total || 0),
      bottom: acc.bottom + (game.teams.bottom.total || 0)
    }), { top: 0, bottom: 0 });

    // Füge die Punkte des aktuellen Spiels hinzu
    return {
      top: gameTotals.top + state.teams.top.total,
      bottom: gameTotals.bottom + state.teams.bottom.total
    };
  },

  finalizeGame: () => {
    const state = get();
    const currentGame = state.games.find(game => game.id === state.currentGameId);
    
    if (currentGame) {
      // Aktuelles Spiel mit finalen Werten aktualisieren
      const updatedGame = {
        ...currentGame,
        teams: {
          top: {
            ...currentGame.teams.top,
            striche: state.teams.top.striche,
            total: state.teams.top.total
          },
          bottom: {
            ...currentGame.teams.bottom,
            striche: state.teams.bottom.striche,
            total: state.teams.bottom.total
          }
        }
      };

      // Behalte die Gesamtpunkte beim Spielwechsel
      const totalPoints = state.calculateTotalPoints();

      set((state) => ({
        games: state.games.map(game => 
          game.id === state.currentGameId ? updatedGame : game
        ),
        currentGameId: state.currentGameId + 1,
        teams: {
          top: {
            ...createInitialTeamStand(),
            total: totalPoints.top
          },
          bottom: {
            ...createInitialTeamStand(),
            total: totalPoints.bottom
          }
        }
      }));
    }
  }
}));