export default {
  state: {
    apiError: null,
    apiStatus: null,
  },
  mutations: {
    setApiError(state, error) {
      state.apiError = error;
    },
    setApiStatus(state, status) {
      state.apiStatus = status;
    },
  },
  actions: {
    updateApiStatus({ commit }, { status, error }) {
      commit('setApiStatus', status);
      commit('setApiError', error);
    },
  },
  getters: {
    apiError: state => state.apiError,
    apiStatus: state => state.apiStatus,
  },
};
