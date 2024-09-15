// Maximale Anzahl der gleichzeitig sichtbaren Snackbars
const MAX_SNACKBARS = 3;

const state = {
  // Array, das die aktiven Snackbars speichert
  snackbars: []
};

const mutations = {
  // Mutation zum Hinzufügen einer Snackbar
  ADD_SNACKBAR(state, snackbar) {
    console.log('Mutation: ADD_SNACKBAR', snackbar); // Logge das hinzugefügte Snackbar-Objekt
    if (state.snackbars.length >= MAX_SNACKBARS) {
      console.log('Maximale Anzahl der Snackbars erreicht, entferne die älteste Snackbar');
      // Entferne die älteste Snackbar, wenn das Limit erreicht wurde
      state.snackbars.shift();
    }
    state.snackbars.push(snackbar); // Füge die neue Snackbar dem Zustand hinzu
    console.log('Current snackbars state:', state.snackbars); // Logge den aktuellen Zustand des Snackbar-Arrays
  },
  
  // Mutation zum Entfernen einer Snackbar basierend auf der ID
  REMOVE_SNACKBAR(state, id) {
    console.log('Mutation: REMOVE_SNACKBAR, ID:', id);
    state.snackbars = state.snackbars.filter(s => s.id !== id); // Entferne die Snackbar mit der entsprechenden ID
  },
  
  // Mutation zum Löschen aller Snackbars
  CLEAR_SNACKBARS(state) {
    console.log('Mutation: CLEAR_SNACKBARS');
    state.snackbars = []; // Lösche alle Snackbars
  }
};

const actions = {
  // Zeige eine neue Snackbar an
  showSnackbar({ commit }, payload) {
    console.log('Action: showSnackbar, Payload:', payload); // Logge die erhaltene Payload

    // Wenn keine Nachricht übergeben wird, wird die Snackbar nicht angezeigt
    if (!payload.message) {
      console.warn('Snackbar message is missing, skipping snackbar display.');
      return; // Verhindere das Hinzufügen einer Snackbar ohne Nachricht
    }

    // Generiere eine eindeutige ID für jede Snackbar
    const id = Date.now() + Math.random();

    // Erstelle das Snackbar-Objekt mit isActive-Flag
    const snackbar = {
      id,
      message: payload.message,  // Verwende die übergebene Nachricht
      color: payload.color || 'info', // Standardfarbe ist 'info'
      timeout: payload.timeout || 5000, // Standard-Timeout ist 5000ms
      isActive: true // Snackbar aktiv setzen
    };

    // Füge die Snackbar dem Zustand hinzu
    commit('ADD_SNACKBAR', snackbar);

    // Entferne die Snackbar automatisch nach dem festgelegten Timeout
    setTimeout(() => {
      console.log('Snackbar Timeout abgelaufen, ID:', id);
      commit('REMOVE_SNACKBAR', id);
    }, snackbar.timeout);
  },

  // Manuelles Entfernen einer Snackbar
  hideSnackbar({ commit }, id) {
    console.log('Action: hideSnackbar, ID:', id); // Logge die ID der zu entfernenden Snackbar
    // Entferne die Snackbar sofort, ohne auf den Timeout zu warten
    commit('REMOVE_SNACKBAR', id);
  },

  // Entferne alle Snackbars aus dem Zustand
  clearSnackbars({ commit }) {
    console.log('Action: clearSnackbars'); // Logge die Aktion des Löschens aller Snackbars
    commit('CLEAR_SNACKBARS');
  }
};

const getters = {
  // Gibt alle aktiven Snackbars zurück
  activeSnackbars: state => state.snackbars // Rückgabe der aktiven Snackbars aus dem Zustand
};

export default {
  namespaced: true,  // Namespacing des Moduls
  state,
  mutations,
  actions,
  getters
};
