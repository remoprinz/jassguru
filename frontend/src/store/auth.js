// src/store/auth.js

import { 
  auth, 
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from '../firebaseInit';
import { onAuthStateChanged, signOut, getIdToken } from 'firebase/auth';
import axios from 'axios';
import { 
  registerEmail as apiRegisterEmail, 
  registerJassname as apiRegisterJassname,
  initiateAddPlayer as apiInitiateAddPlayer,
  apiConfirmAddPlayer,
  decodeAddPlayerToken as apiDecodeAddPlayerToken 
} from '@/api/apiServices';

export default {
  namespaced: true,

  state: {
    user: null,
    error: null,
    authToken: null,
    tokenExpiry: null,
    tokenRefreshInterval: null,
  },

  mutations: {
    setUser(state, user) {
      console.log('setUser Mutation called with', user);
      state.user = user;
      if (user) {
        state.user.id = user.uid;
      }
    },
    setError(state, error) {
      console.error('setError Mutation called with', error);
      state.error = error;
    },
    clearError(state) {
      state.error = null;
    },
    setAuthToken(state, token) {
      console.log('setAuthToken Mutation called with', token);
      state.authToken = token;
    },
    setTokenExpiry(state, expiry) {
      console.log('setTokenExpiry Mutation called with', expiry);
      state.tokenExpiry = expiry;
    },
    updatePlayerData(state, playerData) {
      console.log('updatePlayerData Mutation called with', playerData);
      state.user = { ...state.user, ...playerData };
    },
    setTokenRefreshInterval(state, interval) {
      state.tokenRefreshInterval = interval;
    },
    clearTokenRefreshInterval(state) {
      clearInterval(state.tokenRefreshInterval);
      state.tokenRefreshInterval = null;
    },
  },

  actions: {
    initializeAuthState({ commit, dispatch }) {
      onAuthStateChanged(auth, async (user) => {
        commit('setUser', user ? user : null);
        if (user) {
          dispatch('startTokenRefreshInterval');
        }
      });
    },

    startTokenRefreshInterval({ commit, dispatch }) {
      const refreshInterval = 59 * 60 * 1000; // 59 Minuten in Millisekunden
      const interval = setInterval(() => {
        dispatch('fetchAuthToken');
      }, refreshInterval);
      commit('setTokenRefreshInterval', interval);
    },

    async fetchAuthToken({ commit }) {
      try {
        if (auth.currentUser) {
          console.log('Fetching auth token for user:', auth.currentUser.uid);
          const token = await getIdToken(auth.currentUser, true);
          if (token) {
            console.log('Auth token retrieved:', token.substring(0, 20) + '...');
            try {
              const decodedToken = parseJwt(token);
              const expiryTimeMs = decodedToken.exp * 1000;
              commit('setAuthToken', token);
              commit('setTokenExpiry', expiryTimeMs);
            } catch (parseError) {
              console.error('Error parsing auth token:', parseError);
              commit('setError', 'Invalid auth token format');
            }
          } else {
            console.error('No auth token was retrieved.');
            commit('setError', 'No auth token retrieved');
          }
        }
      } catch (error) {
        console.error('Error fetching auth token:', error);
        commit('setError', error.message);
      }
    },

    async registerEmail({ dispatch }, { email, password }) {
      try {
        const response = await apiRegisterEmail(email, password);
        if (response.code === 'EMAIL_REGISTRATION_SUCCESS') {
          dispatch('snackbar/showSnackbar', {
            message: response.message,
            color: 'success'
          }, { root: true });
          return response;
        } else {
          throw new Error(response.message);
        }
      } catch (error) {
        dispatch('snackbar/showSnackbar', {
          message: error.message,
          color: 'error'
        }, { root: true });
        throw error;
      }
    },

    async registerJassname({ commit, dispatch }, { jassname, token }) {
      try {
        const response = await apiRegisterJassname(jassname, token);
        if (response.code === 'JASSNAME_REGISTRATION_SUCCESS') {
          commit('updatePlayerData', { nickname: jassname });
          dispatch('snackbar/showSnackbar', {
            message: response.message,
            color: 'success'
          }, { root: true });
          return response;
        } else {
          throw new Error(response.message);
        }
      } catch (error) {
        dispatch('snackbar/showSnackbar', {
          message: error.message,
          color: 'error'
        }, { root: true });
        throw error;
      }
    },

    async login({ commit, dispatch }, { email, password }) {
      try {
        commit('clearError');
        console.log('Logging in user...');
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log('User logged in successfully:', userCredential.user);
        commit('setUser', userCredential.user);
        await dispatch('fetchAuthToken');
        dispatch('snackbar/showSnackbar', {
          message: 'Login erfolgreich! Du bist bereit zu Jassen.',
          color: 'success'
        }, { root: true });
        dispatch('startTokenRefreshInterval');
      } catch (error) {
        console.error('Error logging in:', error);
        commit('setError', error.message);
        dispatch('snackbar/showSnackbar', {
          message: `Login fehlgeschlagen: ${error.message}`,
          color: 'error'
        }, { root: true });
      }
    },

    async resetPassword({ dispatch }, email) {
      try {
        await sendPasswordResetEmail(auth, email);
        dispatch('snackbar/showSnackbar', {
          message: 'Eine E-Mail zum Zurücksetzen des Passworts wurde gesendet.',
          color: 'success'
        }, { root: true });
      } catch (error) {
        dispatch('snackbar/showSnackbar', {
          message: `Fehler beim Zurücksetzen des Passworts: ${error.message}`,
          color: 'error'
        }, { root: true });
        throw error;
      }
    },

    async logout({ commit, dispatch }) {
      try {
        console.log('Logging out user...');
        await signOut(auth);
        console.log('User logged out successfully');
        commit('setUser', null);
        commit('setAuthToken', null);
        commit('setTokenExpiry', null);
        commit('clearTokenRefreshInterval');
        commit('jassErfassen/resetState', null, { root: true });
        localStorage.removeItem('jassErfassenState'); // Entfernen des gespeicherten Zustands

        dispatch('snackbar/showSnackbar', {
          message: 'Sie haben sich erfolgreich ausgeloggt.',
          color: 'success'
        }, { root: true });
      } catch (error) {
        console.error('Error logging out:', error);
        commit('setError', error.message);
        dispatch('snackbar/showSnackbar', {
          message: `Logout fehlgeschlagen: ${error.message}`,
          color: 'error'
        }, { root: true });
      }
    },

    async addPlayer({ commit }) {
      try {
        console.log('Adding player...');
        const token = await auth.currentUser.getIdToken(true);
        const config = {
          headers: {
            Authorization: `Bearer ${token}`
          }
        };
        const response = await axios.post('/api/auth/add-player', {}, config);
        console.log('Player added successfully:', response.data);
        commit('updatePlayerData', response.data);
        return response.data;
      } catch (error) {
        console.error('Error adding player:', error);
        commit('setError', error.message);
        throw error;
      }
    },

    async decodeAddPlayerToken({ commit }, token) {
      try {
        const response = await apiDecodeAddPlayerToken(token);
        return response;
      } catch (error) {
        console.error('Fehler beim Dekodieren des Tokens:', error);
        commit('setError', error.message);
        throw error;
      }
    },

    async initiateAddPlayer({ dispatch }, { nickname, email }) {
      try {
        const response = await apiInitiateAddPlayer(nickname, email);
        if (response.code === 'PLAYER_ADDED_EMAIL_SENT' || response.code === 'PLAYER_ADDED_NO_EMAIL_REQUIRED') {
          dispatch('snackbar/showSnackbar', {
            message: response.message,
            color: 'success'
          }, { root: true });
          return response;
        } else {
          throw new Error(response.message);
        }
      } catch (error) {
        dispatch('snackbar/showSnackbar', {
          message: error.message,
          color: 'error'
        }, { root: true });
        throw error;
      }
    },

    async confirmAddPlayer({ commit, dispatch }, { nickname, password, token }) {
      try {
        const response = await apiConfirmAddPlayer(nickname, password, token); 
        if (response.code === 'PLAYER_CONFIRMED') {
          commit('updatePlayerData', { 
            nickname,
            isConfirmed: true,
            isGuest: false
          });
          dispatch('snackbar/showSnackbar', {
            message: 'Spieler erfolgreich bestätigt. Sie können sich nun anmelden.',
            color: 'success'
          }, { root: true });
          return response;
        } else {
          throw new Error(response.message || 'Fehler bei der Bestätigung des Spielers');
        }
      } catch (error) {
        console.error('Fehler in confirmAddPlayer:', error);
        dispatch('snackbar/showSnackbar', {
          message: error.message || 'Ein Fehler ist aufgetreten',
          color: 'error'
        }, { root: true });
        throw error;
      }
    },

    async handleLogout({ dispatch }) {
      await dispatch('logout');
      dispatch('jassErfassen/resetJassErfassenState', null, { root: true });
      dispatch('snackbar/showSnackbar', {
        message: 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.',
        color: 'warning'
      }, { root: true });
      dispatch('router/push', '/login', { root: true });
    },
  },

  getters: {
    isAuthenticated: (state) => !!state.user,
    FirebaseUID: (state) => state.user ? state.user.uid : null,
    isTokenValid: (state) => state.tokenExpiry > Date.now(),
    currentAuthToken: (state) => state.authToken,
    isTokenExpired: (state) => state.tokenExpiry ? state.tokenExpiry <= Date.now() : true
  },
};

function parseJwt(token) {
  try {
    const [, payload] = token.split('.');
    const decodedPayload = decodeURIComponent(atob(payload.replace(/_/g, '/').replace(/-/g, '+')));
    return JSON.parse(decodedPayload);
  } catch (error) {
    console.error('Error parsing JWT:', error);
    throw new Error('Invalid token format');
  }
}
