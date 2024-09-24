// src/store/index.js

import { createStore } from 'vuex';
import VuexPersistence from 'vuex-persist';

import auth from './auth';
import navigation from './navigation';
import apiStatus from './modules/apiStatus';
import group from './modules/group';
import jassErfassen from './modules/jassErfassen';
import jassCapture from './modules/jassCapture';

// VuexPersistence Setup
const vuexLocal = new VuexPersistence({ 
  storage: window.localStorage,
  modules: ['jassErfassen']
});

// Erstellen des Vuex-Stores
const store = createStore({
  modules: {
    auth,
    navigation,
    apiStatus,
    group,
    jassErfassen,
    jassCapture
  },
  plugins: [vuexLocal.plugin],
  state: {
    snackbar: {
      istSichtbar: false,
      nachricht: '',
      farbe: 'info'
    }
  },
  mutations: {
    SET_SNACKBAR(state, payload) {
      state.snackbar = { ...state.snackbar, ...payload };
    }
  },
  actions: {
    showSnackbar({ commit }, payload) {
      commit('SET_SNACKBAR', { istSichtbar: true, ...payload });
    }
  }
});

// Benannte Exporte
export { store };

// Default-Export
export default store;