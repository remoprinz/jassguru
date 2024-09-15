// src/store/navigation.js
const state = () => ({
  currentRoute: '',
  navigationError: null,
})

const mutations = {
  setCurrentRoute(state, routeName) {
    state.currentRoute = routeName
  },
  setNavigationError(state, error) {
    state.navigationError = error
  },
}

const actions = {
  async navigate({ commit }, { router, routeName }) {
    try {
      commit('setCurrentRoute', routeName)
      await router.push({ name: routeName })
    } catch (error) {
      commit('setNavigationError', error)
      console.error(`Navigation to ${routeName} failed: ${error.message}`);
    }
  },
}

export default {
  namespaced: true,
  state,
  mutations,
  actions
}
