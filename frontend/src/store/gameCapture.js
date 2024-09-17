import { apiService } from '@/api/apiConfig';
import { logError, logInfo } from '@/utils/logger';
import { validateJassData, validateScores } from '@/utils/validators';

const state = {
  currentGame: {
    id: null,
    mode: null,
    group_id: null,
    date: null,
    status: null,
  },
  players: [],
  gameCode: null,
  scores: [],
  isCapturing: false,
  error: null,
};

const mutations = {
  SET_CURRENT_GAME(state, game) {
    state.currentGame = { ...state.currentGame, ...game };
  },
  SET_PLAYERS(state, players) {
    state.players = players;
  },
  SET_GAME_CODE(state, code) {
    state.gameCode = code;
  },
  UPDATE_SCORES(state, scores) {
    state.scores = scores;
  },
  SET_IS_CAPTURING(state, isCapturing) {
    state.isCapturing = isCapturing;
  },
  SET_ERROR(state, error) {
    state.error = error;
  },
};

const actions = {
  async initializeGame({ commit }, jassData) {
    try {
      if (!validateJassData(jassData)) {
        throw new Error('Ungültige Jass-Daten');
      }
      const response = await apiService.post('/api/games', jassData);
      commit('SET_CURRENT_GAME', response.data.game);
      commit('SET_PLAYERS', response.data.players);
      commit('SET_GAME_CODE', response.data.gameCode);
      commit('SET_IS_CAPTURING', true);
      commit('SET_ERROR', null);
      logInfo('gameCapture', 'Spiel initialisiert', response.data);
      return response.data.gameCode;
    } catch (error) {
      commit('SET_ERROR', error.message);
      logError('gameCapture', 'Fehler beim Initialisieren des Spiels', error);
      throw error;
    }
  },
  
  async syncGameData({ commit, state }) {
    try {
      const response = await apiService.get(`/api/games/${state.currentGame.id}/sync`);
      if (!validateScores(response.data.scores)) {
        throw new Error('Ungültige Punktedaten empfangen');
      }
      commit('UPDATE_SCORES', response.data.scores);
      logInfo('gameCapture', 'Spieldaten synchronisiert', response.data);
    } catch (error) {
      logError('gameCapture', 'Fehler beim Synchronisieren der Spieldaten', error);
      throw error;
    }
  },
  
  async finishGame({ commit, state }) {
    try {
      await apiService.put(`/api/games/${state.currentGame.id}/finish`);
      commit('SET_IS_CAPTURING', false);
      logInfo('gameCapture', 'Spiel beendet');
    } catch (error) {
      logError('gameCapture', 'Fehler beim Beenden des Spiels', error);
      throw error;
    }
  },

  async checkGameInitialized({ commit }, gameCode) {
    try {
      const response = await apiService.get(`/api/games/${gameCode}/check`);
      return response.data.isInitialized;
    } catch (error) {
      commit('SET_ERROR', error.message);
      logError('gameCapture', 'Fehler beim Überprüfen des Spielstatus', error);
      throw error;
    }
  },
};

const getters = {
  isGameActive: state => !!state.currentGame && state.isCapturing,
  getCurrentScores: state => state.scores,
  getGameCode: state => state.gameCode,
};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters,
};