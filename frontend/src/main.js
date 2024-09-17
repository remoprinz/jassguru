// src/main.js
import { createApp } from 'vue';
import App from './App.vue';
import vuetify from './plugins/vuetify';
import router from './router';
import store from './store';
import '@mdi/font/css/materialdesignicons.css';
import './assets/styles/global.css';
import axios from 'axios';
import { auth } from './firebaseInit';
import { onAuthStateChanged } from 'firebase/auth';

let appInstance = null;
let authInitialized = false;

function initializeApp() {
  // App wird nur einmal initialisiert und gemountet
  if (!appInstance) {
    console.log("Creating and mounting the app.");
    appInstance = createApp(App);
    
    // Plugins registrieren
    appInstance.use(router);
    appInstance.use(store);
    appInstance.use(vuetify);
    
    appInstance.mount('#app');
    console.log("App has been mounted.");
  } else {
    console.log("App is already mounted. Skipping re-mount.");
  }
}

// Warten auf den ersten Auth-Status bevor die App gemountet wird
onAuthStateChanged(auth, (user) => {
  console.log("onAuthStateChanged fired");

  if (user) {
    console.log("User is logged in:", user);
    store.commit('auth/setUser', user);
  } else {
    console.log("No user is logged in.");
    store.commit('auth/setUser', null);
  }

  if (!authInitialized) {
    authInitialized = true;
    initializeApp();
  }
});

// Axios Standardkonfiguration
axios.defaults.baseURL = 'http://127.0.0.1:5000';

// Neue Funktion für die Interceptors
export const setupInterceptors = (router) => {
  axios.interceptors.response.use(
    response => response,
    async error => {
      if (error.response && error.response.status === 401) {
        await store.dispatch('auth/handleLogout');
        router.push('/login');
      }
      console.error('API Error:', error);
      return Promise.reject(error);
    }
  );
};

// Aufruf der setupInterceptors Funktion
setupInterceptors(router);
