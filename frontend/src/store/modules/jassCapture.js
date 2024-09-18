import { apiService } from '@/api/apiConfig';
import { logError, logInfo } from '@/utils/logger';
import { validateJassData, validateScores, validateRoundData } from '@/utils/validators';

const state = {
  currentJass: {
    id: null,
    mode: null,
    group_id: null,
    date: null,
    status: null,
  },
  players: [],
  jassCode: null,
  scores: [],
  isCapturing: false,
  error: null,
};

const mutations = {
  SET_CURRENT_JASS(state, jass) {
    state.currentJass = { ...state.currentJass, ...jass };
  },
  SET_PLAYERS(state, players) {
    state.players = players;
  },
  SET_JASS_CODE(state, code) {
    state.jassCode = code;
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
  async initializeJass({ commit }, jassData) {
    try {
      if (!validateJassData(jassData)) {
        throw new Error('Ungültige Jass-Daten');
      }
      const response = await apiService.post('/jass/initialize', jassData);
      commit('SET_CURRENT_JASS', response.data.jass);
      commit('SET_PLAYERS', response.data.players);
      commit('SET_JASS_CODE', response.data.jass_code);
      commit('SET_IS_CAPTURING', true);
      commit('SET_ERROR', null);
      logInfo('jassCapture', 'Jass initialisiert', response.data);
      return response.data.jass_code;
    } catch (error) {
      commit('SET_ERROR', error.message);
      logError('jassCapture', 'Fehler beim Initialisieren des Jass', error);
      throw error;
    }
  },
  
  async syncJassData({ commit, state }) {
    try {
      const response = await apiService.get(`/api/jass/${state.currentJass.id}/sync`);
      if (!validateScores(response.data.scores)) {
        throw new Error('Ungültige Punktedaten empfangen');
      }
      commit('UPDATE_SCORES', response.data.scores);
      logInfo('jassCapture', 'Jass-Daten synchronisiert', response.data);
    } catch (error) {
      logError('jassCapture', 'Fehler beim Synchronisieren der Jass-Daten', error);
      throw error;
    }
  },
  
  async finishJass({ commit, state }) {
    try {
      await apiService.put(`/api/jass/${state.currentJass.id}/finish`);
      commit('SET_IS_CAPTURING', false);
      logInfo('jassCapture', 'Jass beendet');
    } catch (error) {
      logError('jassCapture', 'Fehler beim Beenden des Jass', error);
      throw error;
    }
  },

  async checkJassInitialized({ commit }, jassCode) {
    try {
      const response = await apiService.get(`/api/jass/${jassCode}/check`);
      return response.data.isInitialized;
    } catch (error) {
      commit('SET_ERROR', error.message);
      logError('jassCapture', 'Fehler beim Überprüfen des Jass-Status', error);
      throw error;
    }
  },

  async addRound({ state }, roundData) {
    try {
      if (!validateRoundData(roundData)) {
        throw new Error('Ungültige Rundendaten');
      }
      await apiService.post(`/api/jass/${state.currentJass.id}/add_round`, roundData);
      logInfo('jassCapture', 'Runde hinzugefügt', roundData);
    } catch (error) {
      logError('jassCapture', 'Fehler beim Hinzufügen einer Runde', error);
      throw error;
    }
  },

  async getJassStats({ state }) {
    try {
      const response = await apiService.get(`/api/jass/${state.currentJass.id}/stats`);
      logInfo('jassCapture', 'Jass-Statistiken abgerufen', response.data);
      return response.data;
    } catch (error) {
      logError('jassCapture', 'Fehler beim Abrufen der Jass-Statistiken', error);
      throw error;
    }
  },
};

const getters = {
  isJassActive: state => !!state.currentJass.id && state.isCapturing,
  getCurrentScores: state => state.scores,
  getJassCode: state => state.jassCode,
  getPlayers: state => state.players,
  getCurrentJassId: state => state.currentJass.id,
};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters,
};