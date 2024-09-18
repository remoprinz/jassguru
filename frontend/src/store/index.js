import { createStore } from 'vuex';
import VuexPersistence from 'vuex-persist';

import auth from './auth';
import navigation from './navigation';
import apiStatus from './modules/apiStatus';
import snackbar from './snackbar';
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
    snackbar,
    group,
    jassErfassen,
    jassCapture
  },
  plugins: [vuexLocal.plugin]
});

export default store;

