import { createApp } from 'vue';
import App from './App.vue';
import { store } from './store';
import router from './router';
import vuetify from './plugins/vuetify';
import '@mdi/font/css/materialdesignicons.css';
import './assets/styles/global.css';
import { auth } from './firebaseInit';
import { onAuthStateChanged } from 'firebase/auth';
import { setupInterceptors } from './api/apiConfig';
import axios from 'axios';
// import i18n from './i18n'; // Uncomment when implementing internationalization

let app = null;
let appMounted = false;

function initializeApp() {
  if (!app) {
    console.log("App-Instanz wird erstellt.");
    app = createApp(App);
    
    app.use(router);
    app.use(store);
    app.use(vuetify);
    // app.use(i18n); // Uncomment when implementing internationalization
    
    // Globaler Fehlerhandler
    app.config.errorHandler = (err, vm, info) => {
      console.error('Globaler Vue Fehler:', err, vm, info);
      // Implementieren Sie hier zusätzliche Fehlerbehandlung oder Logging
    };
    
    console.log("App-Instanz erstellt und Plugins initialisiert.");
  }
}

function mountApp() {
  if (!appMounted) {
    console.log("App wird gemountet.");
    app.mount('#app');
    appMounted = true;
    console.log("App wurde gemountet.");
  } else {
    console.log("App ist bereits gemountet. Erneutes Mounten wird übersprungen.");
  }
}

// App sofort initialisieren
initializeApp();

// Auth-Statusänderungen behandeln
onAuthStateChanged(auth, (user) => {
  console.log("onAuthStateChanged wurde ausgelöst");

  if (user) {
    console.log("Benutzer ist eingeloggt:", user.uid);
    store.commit('auth/setUser', user);
    // Hier können Sie zusätzliche Aktionen für eingeloggte Benutzer durchführen
  } else {
    console.log("Kein Benutzer ist eingeloggt.");
    store.commit('auth/setUser', null);
    // Hier können Sie zusätzliche Aktionen für ausgeloggte Benutzer durchführen
  }

  mountApp();
});

// Axios Interceptors Setup
setupInterceptors(router);

// Globaler Fehlerhandler für nicht abgefangene Fehler
window.onerror = function(message, source, lineno, colno, error) {
  console.error('Globaler Fehler:', { message, source, lineno, colno, error });
  // Implementieren Sie hier zusätzliche Fehlerbehandlung oder Logging
};

// Globale Konfiguration für axios
axios.defaults.baseURL = process.env.VUE_APP_API_BASE_URL || 'https://api.jassguru.ch';

// Performance-Monitoring (Beispiel)
if (process.env.NODE_ENV === 'production') {
  // Implementieren Sie hier Ihr Performance-Monitoring
  console.log('Performance-Monitoring aktiviert');
}