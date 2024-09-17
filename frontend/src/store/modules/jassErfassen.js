// src/store/modules/jassErfassen.js

import { apiService } from '@/api/apiConfig';
import { logError, logInfo, logDebug } from '@/utils/logger';
import { JASS_ERFASSEN_MESSAGES } from '@/constants/jassErfassenMessages';
import VuexPersistence from 'vuex-persist';
import router from '@/router';

// Vuex-Persistenz-Konfiguration
const vuexLocal = new VuexPersistence({
  storage: window.localStorage,
  key: 'jassErfassenState',
  reducer: (state) => ({
    currentStep: state.currentStep,
    selectedMode: state.selectedMode,
    selectedGroup: state.selectedGroup ? {
      id: state.selectedGroup.id,
      name: state.selectedGroup.name
    } : null,
    selectedPlayers: state.selectedPlayers,
    rosen10Player: state.rosen10Player,
    location: state.location, // Standortinformation hinzugefügt
  }),
});

// Initial state definition
const initialState = {
  currentStep: 1,
  selectedMode: null,
  selectedGroup: null,
  selectedPlayers: {
    team1player1: null,
    team1player2: null,
    team2player1: null,
    team2player2: null
  },
  groupPlayers: [],
  rosen10Player: null,
  isProcessing: false,
  currentProcessState: null,
  apiError: null,
  players: [],
  selectedPlayer: null,
  location: null, // Standortinformation hinzugefügt
};

// State
const state = { ...initialState };

// Mutations
const mutations = {
  setCurrentStep(state, step) {
    logInfo('jassErfassen Store', `Aktueller Schritt wird auf ${step} gesetzt`);
    state.currentStep = step;
  },

  setSelectedMode(state, mode) {
    const validModes = ['Jassgruppe', 'Turnier', 'Einzelspiel', 'Liga'];
    if (typeof mode !== 'string' || !validModes.includes(mode)) {
      throw new Error('Invalid mode value');
    }
    logDebug('Mutation: Setting selected mode', mode);
    state.selectedMode = mode;
  },

  setSelectedGroup(state, group) {
    if (!group || typeof group !== 'object' || !('id' in group) || !('name' in group)) {
      logError('Invalid group object in mutation', group);
      state.selectedGroup = null;
      return;
    }
    logDebug('Mutation: Setting selected group', group);
    state.selectedGroup = { ...group };
  },

  SET_SELECTED_PLAYER(state, { slot, player }) {
    state.selectedPlayers = {
      ...state.selectedPlayers,
      [slot]: player
    };
    logDebug('Updated state of selectedPlayers:', state.selectedPlayers);
  },

  RESET_SELECTED_PLAYERS(state) {
    state.selectedPlayers = {
      team1player1: null,
      team1player2: null,
      team2player1: null,
      team2player2: null
    };
    logDebug('Reset selectedPlayers:', state.selectedPlayers);
  },

  setGroupPlayers(state, players) {
    state.groupPlayers = players;
  },

  addPlayerToGroup(state, player) {
    if (!player || typeof player !== 'object' || !('id' in player) || !('nickname' in player)) {
      throw new Error('Invalid player object');
    }
    logDebug('Mutation: Adding player to group', player);
    if (!state.selectedGroup.players) {
      state.selectedGroup.players = [];
    }
    if (!state.selectedGroup.players.some((p) => p.id === player.id)) {
      state.selectedGroup.players.push({ ...player });
    }
  },

  addPlayerToGroupPlayers(state, player) {
    if (!player || typeof player !== 'object' || !('id' in player) || !('nickname' in player)) {
      throw new Error('Invalid player object');
    }
    logDebug('Mutation: Adding player to groupPlayers', player);
    if (!state.groupPlayers.some((p) => p.id === player.id)) {
      state.groupPlayers.push({ ...player });
    }
  },

  setRosen10Player(state, player) {
    state.rosen10Player = player;
    logInfo('jassErfassen Store', `Rosen 10 Spieler gesetzt: ${player.nickname}`);
  },

  resetState(state) {
    Object.assign(state, JSON.parse(JSON.stringify(initialState)));
    logDebug('Jass Erfassen state reset to initial state');
  },

  setIsProcessing(state, isProcessing) {
    if (typeof isProcessing !== 'boolean') {
      throw new Error('isProcessing must be a boolean');
    }
    logDebug('Mutation: Setting isProcessing', isProcessing);
    state.isProcessing = isProcessing;
  },

  setCurrentProcessState(state, processState) {
    if (typeof processState !== 'string') {
      throw new Error('processState must be a string');
    }
    logDebug('Mutation: Setting current process state', processState);
    state.currentProcessState = processState;
  },

  setApiError(state, error) {
    logError('Mutation: Setting API error', error);
    state.apiError = error ? { ...error } : null;
  },

  SET_SELECTED_PLAYERS(state, players) {
    if (players && typeof players === 'object') {
      state.selectedPlayers = { ...players };
      logDebug('Store updated with new selectedPlayers:', state.selectedPlayers);
    } else {
      logError('SET_SELECTED_PLAYERS', 'Ungültiges Spielerobjekt erkannt:', players);
    }
  },

  setPlayers(state, players) {
    state.players = players;
  },

  setSelectedPlayer(state, player) {
    state.selectedPlayer = player;
  },

  UPDATE_SELECTED_PLAYERS(state, players) {
    state.selectedPlayers = { ...players };
  },

  setOverviewData(state, data) {
    state.overviewData = data;
    logInfo('jassErfassen', 'Übersichtsdaten im State aktualisiert');
  },

  setLocation(state, location) {
    state.location = location;
  },
};

// Actions
const actions = {
  resetJassErfassenState({ commit, dispatch }) {
    commit('resetState');
    localStorage.removeItem('jassErfassenState');
    router.push({ name: 'jasserfassen' });
    dispatch('snackbar/showSnackbar', {
      message: 'Jass Erfassen Prozess wurde zurückgesetzt',
      color: 'info',
    }, { root: true });
  },

  async fetchGroupPlayers({ commit }, groupId) {
    try {
      const response = await apiService.get(`/groups/${groupId}/players`);
      commit('setGroupPlayers', response.data);
    } catch (error) {
      logError('fetchGroupPlayers', error);
      throw error;
    }
  },

  async setGroup({ commit, dispatch }, group) {
    logInfo('Setting group in store', group, {}, false);
    if (group && typeof group === 'object' && 'id' in group) {
      commit('setSelectedGroup', group);
      const groupId = group.id.toString();
      logDebug('Fetching players for group', groupId);
      try {
        await dispatch('fetchGroupPlayers', groupId);
        logDebug('Players fetched successfully');

        dispatch('snackbar/showSnackbar', {
          message: JASS_ERFASSEN_MESSAGES.GROUP_SELECT.CONFIRMED.replace('{groupName}', group.name),
          color: 'success',
        }, { root: true });
      } catch (error) {
        logError('setGroup', error);
        commit('setApiError', error.message);

        dispatch('snackbar/showSnackbar', {
          message: JASS_ERFASSEN_MESSAGES.GROUP_SELECT.ERROR,
          color: 'error',
        }, { root: true });
      }
    } else {
      const error = new Error('Invalid group object');
      logError('setGroup', error);
      commit('setApiError', error.message);

      dispatch('snackbar/showSnackbar', {
        message: JASS_ERFASSEN_MESSAGES.GROUP_SELECT.ERROR,
        color: 'error',
      }, { root: true });
    }
    dispatch('saveState');
  },

  setSelectedPlayer({ commit, dispatch }, { slot, player }) {
    commit('SET_SELECTED_PLAYER', { slot, player });
    logInfo(`Spieler für Slot ${slot} erfolgreich zum Store hinzugefügt:`, player);
    dispatch('saveState');
  },

  removeSelectedPlayer({ commit, dispatch }, slot) {
    commit('SET_SELECTED_PLAYER', { slot, player: null });
    logDebug(`Player removed from slot ${slot}`);
    dispatch('saveState');
  },

  resetSelectedPlayers({ commit, dispatch }) {
    commit('RESET_SELECTED_PLAYERS');
    dispatch('saveState');
  },

  async validateSelectedPlayers({ state }) {
    const selectedPlayers = Object.values(state.selectedPlayers).filter(Boolean);
    if (selectedPlayers.length !== 4) {
      throw new Error('Es müssen genau 4 Spieler ausgewählt werden.');
    }
    // Hier können weitere Validierungen hinzugefügt werden
  },

  addPlayerToGroupPlayers({ commit }, player) {
    commit('addPlayerToGroupPlayers', player);
  },

  async addPlayerToGroup({ commit, dispatch, state }, player) {
    if (!state.selectedGroup || !state.selectedGroup.id) {
      const error = new Error('Cannot add player: No valid group selected.');
      logError('addPlayerToGroup', error);
      commit('setApiError', error.message);
      return { success: false, message: error.message };
    }
    commit('setIsProcessing', true);
    try {
      const response = await apiService.post(`/groups/${state.selectedGroup.id}/players`, { playerId: player.id });
      if (response.data && response.data.name) {
        commit('addPlayerToGroup', player);
        commit('addPlayerToGroupPlayers', player);

        dispatch('snackbar/showSnackbar', {
          message: JASS_ERFASSEN_MESSAGES.PLAYER_SELECT.PLAYER_ADDED.replace('{playerName}', player.nickname).replace('{position}', 'zur Gruppe'),
          color: 'success',
        }, { root: true });

        return { success: true, message: JASS_ERFASSEN_MESSAGES.PLAYER_SELECT.PLAYER_ADDED.replace('{playerName}', player.nickname).replace('{position}', 'zur Gruppe') };
      }
      throw new Error('Unexpected response from server');
    } catch (error) {
      logError('addPlayerToGroup', error);
      const errorMessage = error.response && error.response.data && error.response.data.message
        ? error.response.data.message
        : JASS_ERFASSEN_MESSAGES.PLAYER_SELECT.ERROR;
      commit('setApiError', errorMessage);

      dispatch('snackbar/showSnackbar', {
        message: errorMessage,
        color: 'error',
      }, { root: true });

      return { success: false, message: errorMessage };
    } finally {
      commit('setIsProcessing', false);
    }
  },

  async addNewPlayerAndSelect({ dispatch, state }, newPlayer) {
    try {
      await dispatch('addPlayerToGroup', newPlayer);
      await dispatch('fetchGroupPlayers', state.selectedGroup.id);
      dispatch('selectPlayerAutomatically', newPlayer);
    } catch (error) {
      logError('addNewPlayerAndSelect', error);
      throw error;
    }
  },

  selectPlayerAutomatically({ commit, state }, player) {
    const slots = ['team1player1', 'team1player2', 'team2player1', 'team2player2'];
    const emptySlot = slots.find((slot) => !state.selectedPlayers[slot]);
    if (emptySlot) {
      commit('SET_SELECTED_PLAYER', { slot: emptySlot, player });
    }
  },

  nextStep({ commit, state, dispatch }) {
    logInfo('jassErfassen', 'Übergang zum nächsten Schritt wird eingeleitet', { currentStep: state.currentStep });
    const newStep = state.currentStep + 1;
    commit('setCurrentStep', newStep);
    dispatch('saveState');
    logInfo('jassErfassen', `Übergang zu Schritt ${newStep} abgeschlossen`);
    
    if (newStep === 5) {
      logInfo('jassErfassen', 'Lade Übersichtsdaten für JassErfassenUebersicht');
      dispatch('loadOverviewData');
    }
  },

  loadOverviewData({ state, commit }) {
    logInfo('jassErfassen', 'Lade Übersichtsdaten');
    const overviewData = {
      currentDate: new Date().toLocaleDateString('de-CH'),
      selectedMode: state.selectedMode,
      selectedGroup: state.selectedGroup,
      selectedPlayers: state.selectedPlayers,
      rosen10Player: state.rosen10Player,
      location: state.location, // Standortinformation hinzugefügt
    };
    logDebug('jassErfassen', 'Übersichtsdaten:', overviewData);
    commit('setOverviewData', overviewData);
  },

  previousStep({ commit, state, dispatch }) {
    if (state.currentStep > 1) {
      const prevStep = state.currentStep - 1;
      logDebug('Going back to previous step', prevStep);
      commit('setCurrentStep', prevStep);
      dispatch('saveState');
    }
  },

  setMode({ commit, dispatch }, mode) {
    commit('setSelectedMode', mode);
    dispatch('saveState');

    dispatch('snackbar/clearSnackbars', null, { root: true });
    dispatch('snackbar/showSnackbar', {
      message: JASS_ERFASSEN_MESSAGES.MODUS_ERFASSEN.SELECTED.replace('{mode}', mode),
      color: 'success',
    }, { root: true });
  },

  setRosen10Player({ commit, dispatch }, player) {
    commit('setRosen10Player', player);
    dispatch('saveState');

    dispatch('snackbar/showSnackbar', {
      message: JASS_ERFASSEN_MESSAGES.ROSEN10_PLAYER.SELECTED.replace('{playerName}', player.nickname),
      color: 'success',
    }, { root: true });
  },

  saveState({ getters }) {
    logDebug('Saving state to localStorage');
    const currentState = getters.getCurrentState;
    localStorage.setItem('jassErfassenState', JSON.stringify(currentState));
    logDebug('Saved state:', currentState);
  },

  loadState({ commit }) {
    const savedState = localStorage.getItem('jassErfassenState');
    if (savedState) {
      logDebug('Loading state from localStorage');
      try {
        const parsedState = JSON.parse(savedState);
        logDebug('Loaded state:', parsedState);
        Object.keys(parsedState).forEach((key) => {
          const mutationName = `set${key.charAt(0).toUpperCase() + key.slice(1)}`;
          if (mutations[mutationName]) {
            commit(mutationName, parsedState[key]);
          }
        });
      } catch (error) {
        logError('loadState', 'Error loading saved state', error);
        localStorage.removeItem('jassErfassenState');
      }
    } else {
      logDebug('No saved state found in localStorage');
    }
  },

  resetJassErfassen({ commit, dispatch }) {
    logDebug('Resetting JassErfassen state');
    commit('resetState');
    localStorage.removeItem('jassErfassenState');
    commit('setCurrentStep', 1);
    dispatch('snackbar/clearSnackbars', null, { root: true });
    dispatch('snackbar/showSnackbar', {
      message: 'Jass Erfassen Prozess wurde zurückgesetzt',
      color: 'info',
    }, { root: true });
  },

  initializeState({ dispatch, state, commit }) {
    logDebug('Initializing state from localStorage');
    dispatch('loadState');

    if (state.selectedGroup) {
      dispatch('restoreSelectedGroup', state.selectedGroup);
    }

    if (state.currentStep > 1 && state.selectedGroup && typeof state.selectedGroup === 'object' && 'id' in state.selectedGroup) {
      dispatch('fetchGroupPlayers', state.selectedGroup.id);
    } else {
      logDebug('No valid group found, resetting state');
      commit('resetState');
    }
  },

  async loadPlayerData({ commit, dispatch }) {
    try {
      const savedState = localStorage.getItem('vuex');
      if (savedState) {
        const { jassErfassen } = JSON.parse(savedState);
        if (jassErfassen && jassErfassen.selectedPlayers) {
          commit('SET_SELECTED_PLAYERS', jassErfassen.selectedPlayers);
          logInfo('Spielerdaten erfolgreich aus dem lokalen Speicher geladen');
        }
      }
    } catch (error) {
      logError('loadPlayerData', 'Fehler beim Laden der Spielerdaten', error);
      dispatch('snackbar/showSnackbar', {
        message: 'Fehler beim Laden der Spielerdaten. Bitte versuchen Sie es erneut.',
        color: 'error'
      }, { root: true });
    }
  },

  restoreState({ commit }, savedState) {
    commit('setCurrentStep', savedState.currentStep);
    commit('setSelectedMode', savedState.selectedMode);
    commit('setSelectedGroup', savedState.selectedGroup);
    commit('SET_SELECTED_PLAYERS', savedState.selectedPlayers);
    commit('SET_ROSEN10_PLAYER', savedState.rosen10Player);
  },

  resetStateOnLogin({ commit, dispatch }) {
    logDebug('Setze JassErfassen-Zustand beim Einloggen zurück');
    commit('resetState');
    commit('setCurrentStep', 1);
    localStorage.removeItem('jassErfassenState');
    dispatch('snackbar/clearSnackbars', null, { root: true });
  },

  async fetchPlayers({ commit }) {
    try {
      const response = await apiService.get('/api/players');
      commit('setPlayers', response.data);
    } catch (error) {
      console.error('Fehler beim Abrufen der Spieler:', error);
      throw error;
    }
  },

  // Fügen Sie diese Aktion zu Ihren bestehenden Aktionen hinzu
  initializeJassErfassenState({ dispatch, commit }) {
    logInfo('Initialisiere Jass-Erfassen-Zustand');
    commit('resetState');
    dispatch('loadState');
    dispatch('fetchInitialData');
  },

  // Fügen Sie auch diese Hilfsaktion hinzu
  async fetchInitialData({ dispatch, state }) {
    if (state.selectedGroup && state.selectedGroup.id) {
      await dispatch('fetchGroupPlayers', state.selectedGroup.id);
    }
  },

  async finalizeJassErfassen({ state }) {
    try {
      logInfo('jassErfassen', 'Finalisiere Jass Erfassen', state);
      const jassData = {
        mode: state.selectedMode,
        group_id: state.selectedGroup.id,
        players: [
          { id: state.selectedPlayers.team1player1.id, team: 1 },
          { id: state.selectedPlayers.team1player2.id, team: 1 },
          { id: state.selectedPlayers.team2player1.id, team: 2 },
          { id: state.selectedPlayers.team2player2.id, team: 2 },
        ],
        rosen10_player_id: state.rosen10Player.id,
        date: new Date().toISOString(),
        location: state.location, // Standortinformation hinzugefügt
      };
      logInfo('jassErfassen', 'Jass Daten erstellt', jassData);
      
      try {
        const response = await apiService.post('/jass/initialize', jassData);
        console.log('API Response:', response);
        const { jass_code } = response.data;
        
        return { jassData, jassCode: jass_code };
      } catch (error) {
        console.error('API Error:', error.response);
        throw error;
      }
    } catch (error) {
      logError('jassErfassen', 'Fehler beim Finalisieren des Jass Erfassens', error);
      throw new Error(JASS_ERFASSEN_MESSAGES.FINALIZE.ERROR);
    }
  },   

  async saveJassData({ commit, dispatch }, { jassCode }) {
    try {
      commit('resetState');
      
      // Navigiere zur QR-Code-Seite
      dispatch('router/push', { name: 'JassQRCode', params: { jassCode } }, { root: true });
      
      return { message: 'Jass erfolgreich erstellt', jassCode };
    } catch (error) {
      logError('jassErfassen', 'Fehler beim Speichern der Jass-Daten:', error);
      throw new Error(JASS_ERFASSEN_MESSAGES.SAVE.ERROR);
    }
  },

  getOverviewData({ state }) {
    logInfo('jassErfassen', 'Übersichtsdaten werden abgerufen');
    const overviewData = {
      selectedMode: state.selectedMode,
      selectedGroup: state.selectedGroup,
      selectedPlayers: state.selectedPlayers,
      rosen10Player: state.rosen10Player,
      location: state.location, // Standortinformation hinzugefügt
    };
    logDebug('jassErfassen', 'Übersichtsdaten:', overviewData);
    return overviewData;
  },

  async getJassData({ state }) {
    return {
      mode: state.selectedMode,
      group_id: state.selectedGroup.id,
      players: [
        { id: state.selectedPlayers.team1player1.id, team: 1 },
        { id: state.selectedPlayers.team1player2.id, team: 1 },
        { id: state.selectedPlayers.team2player1.id, team: 2 },
        { id: state.selectedPlayers.team2player2.id, team: 2 },
      ],
      rosen10_player_id: state.rosen10Player.id,
      date: new Date().toISOString(),
    };
  },

  async restoreSelectedGroup({ commit, dispatch }, savedGroup) {
    if (savedGroup && savedGroup.id) {
      try {
        const fullGroupData = await apiService.get(`/groups/${savedGroup.id}`);
        commit('setSelectedGroup', fullGroupData.data);
        await dispatch('fetchGroupPlayers', savedGroup.id);
      } catch (error) {
        logError('restoreSelectedGroup', error);
        commit('setSelectedGroup', null);
      }
    }
  },

  setLocation({ commit }, location) {
    commit('setLocation', location);
  },
};

// Getters
const getters = {
  isStepComplete: (state) => (step) => {
    switch (step) {
      case 1:
        return !!state.selectedMode;
      case 2:
        return !!state.selectedGroup;
      case 3: {
        const selectedPlayersCount = Object.values(state.selectedPlayers).filter(Boolean).length;
        const result = selectedPlayersCount === 4;
        logDebug(`isStepComplete for step 3: ${result}`);
        logDebug('Current state of selectedPlayers:', state.selectedPlayers);
        return result;
      }
      case 4:
        return !!state.rosen10Player;
      default:
        return false;
    }
  },

  canProceed: (state, getters) => {
    const canProceed = getters.isStepComplete(state.currentStep);
    logDebug(`canProceed for step ${state.currentStep}: ${canProceed}`);
    logDebug('Current state of selectedPlayers:', state.selectedPlayers);
    return canProceed;
  },

  currentStepComponent: (state) => {
    switch (state.currentStep) {
      case 1:
        return 'ModusErfassen';
      case 2:
        return 'GroupSelect';
      case 3:
        return 'SpielerErfassen';
      case 4:
        return 'Rosen10Player';
      case 5:
        return 'JassErfassenUebersicht';
      default:
        return null;
    }
  },

  availablePlayers: (state) => {
    if (!state.selectedGroup || !state.groupPlayers) return [];
    const selectedPlayerIds = Object.values(state.selectedPlayers)
      .filter((player) => player !== null)
      .map((player) => player.id);
    return state.groupPlayers.filter((player) => !selectedPlayerIds.includes(player.id));
  },

  getSelectedPlayer: (state) => (slot) => state.selectedPlayers[slot],

  getSelectedPlayersCount: (state) => Object.keys(state.selectedPlayers).length,

  getSelectedPlayers: (state) => Object.values(state.selectedPlayers).filter(Boolean),

  allPlayersSelected: (state) => {
    const allSelected = Object.values(state.selectedPlayers).every(Boolean);
    logDebug('All players selected:', allSelected);
    return allSelected;
  },

  getCurrentState: (state) => {
    return {
      currentStep: state.currentStep,
      selectedMode: state.selectedMode,
      selectedGroup: state.selectedGroup,
      selectedPlayers: state.selectedPlayers,
      rosen10Player: state.rosen10Player,
      location: state.location, // Standortinformation hinzugefügt
    };
  },

  isValidPlayer: () => (player) => {
    return player && typeof player === 'object' && 'id' in player && 'nickname' in player;
  },

  getSelectedPlayersArray: (state) => {
    return Object.values(state.selectedPlayers).filter(Boolean);
  },

  getPlayers: (state) => state.players,
  // getSelectedPlayer: (state) => state.selectedPlayer, // Doppelter Getter entfernt

  getOverviewData: (state) => {
    return {
      currentDate: new Date().toLocaleDateString(),
      selectedMode: state.selectedMode,
      selectedGroup: state.selectedGroup,
      selectedPlayers: state.selectedPlayers,
      rosen10Player: state.rosen10Player,
      location: state.location, // Standortinformation hinzugefügt
    };
  },
};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters,
  plugins: [vuexLocal.plugin],
};