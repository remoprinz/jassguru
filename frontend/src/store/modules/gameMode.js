// gameMode.js

const state = {
  selectedGameMode: null,
  selectedGroupId: null,
};

const mutations = {
  SET_GAME_MODE(state, gameMode) {
    console.log('Mutation: SET_GAME_MODE called with:', gameMode);
    state.selectedGameMode = gameMode;
  },
  SET_SELECTED_GROUP(state, groupId) {
    console.log('Mutation: SET_SELECTED_GROUP called with:', groupId);
    state.selectedGroupId = groupId;
  },
  RESET_GAME_MODE(state) {
    console.log('Mutation: RESET_GAME_MODE called');
    state.selectedGameMode = null;
    state.selectedGroupId = null;
  },
};

const actions = {
  setGameMode({ commit, dispatch }, gameMode) {
    console.log('Action: setGameMode called with:', gameMode);
    commit('SET_GAME_MODE', gameMode);
    dispatch('snackbar/showSnackbar', {
      message: `Modus "${gameMode}" ausgewählt.`,
      color: 'success'
    }, { root: true });
    dispatch('jassErfassen/nextStep', null, { root: true });
  },
  setSelectedGroup({ commit }, groupId) {
    console.log('Action: setSelectedGroup called with:', groupId);
    commit('SET_SELECTED_GROUP', groupId);
  },
  resetGameMode({ commit }) {
    console.log('Action: resetGameMode called');
    commit('RESET_GAME_MODE');
  },
};

const getters = {
  selectedGameMode: (state) => {
    console.log('Getter: selectedGameMode called, returning:', state.selectedGameMode);
    return state.selectedGameMode;
  },
  selectedGroupId: (state) => {
    console.log('Getter: selectedGroupId called, returning:', state.selectedGroupId);
    return state.selectedGroupId;
  },
  isGroupGame: (state) => {
    const isGroup = state.selectedGameMode === 'Jassgruppe';
    console.log('Getter: isGroupGame called, returning:', isGroup);
    return isGroup;
  },
};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters,
};
