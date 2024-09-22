import { createApp } from 'vue';
import { createI18n } from 'vue-i18n';
import App from './App.vue';
import vuetify from './plugins/vuetify';
import router from './router';
import store from './store';
import axios from 'axios';
import { auth } from './firebaseInit';
import { onAuthStateChanged } from 'firebase/auth';
import { errorHandler } from './utils/errorHandler';
import { logInfo, logError } from './utils/logger';
import deMessages from './locales/de.json';

import '@mdi/font/css/materialdesignicons.css';
import './assets/styles/global.css';

let appInitialized = false;

let i18n;
try {
  i18n = createI18n({
    locale: 'de',
    fallbackLocale: 'de',
    messages: { de: deMessages }
  });
} catch (error) {
  logError('Fehler bei der Initialisierung von i18n:', error);
  // Fallback-Optionen hier implementieren
}

function initializeApp() {
  if (appInitialized) {
    logInfo("App ist bereits initialisiert.");
    return;
  }
  
  logInfo("App wird initialisiert.");
  const app = createApp(App);
  
  app.use(router);
  app.use(store);
  app.use(vuetify);
  app.use(i18n);
  
  app.config.errorHandler = errorHandler;
  
  app.mount('#app');
  appInitialized = true;
  logInfo("App wurde erfolgreich initialisiert und gemountet.");
  
  setupInterceptors(router);
}

onAuthStateChanged(auth, (user) => {
  logInfo("onAuthStateChanged ausgelöst");
  if (user) {
    logInfo("Benutzer ist eingeloggt:", user);
    store.commit('auth/setUser', user);
  } else {
    logInfo("Kein Benutzer eingeloggt.");
    store.commit('auth/setUser', null);
  }
  
  if (!appInitialized) {
    initializeApp();
  }
});

axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5000';

export const setupInterceptors = (router) => {
  axios.interceptors.response.use(
    response => response,
    async error => {
      if (error.response && error.response.status === 401) {
        await store.dispatch('auth/handleLogout');
        router.push('/login');
      }
      logError('API-Fehler:', error);
      return Promise.reject(error);
    }
  );
};

// Entfernen oder auskommentieren Sie diesen Block
/*
if (import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}
*/
