import axios from 'axios';
import store from '../store';

const baseURL = process.env.VUE_APP_API_BASE_URL || "http://127.0.0.1:5000/api";

export const apiConfig = {
  baseURL: baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true
};

export const apiService = axios.create(apiConfig);

export const handleApiError = (error) => {
  let errorMessage = 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.';
  let errorCode = 500;

  if (error.response) {
    errorMessage = error.response.data.message || errorMessage;
    errorCode = error.response.status;
  } else if (error.request) {
    errorMessage = 'Keine Antwort vom Server erhalten.';
  } else {
    errorMessage = error.message;
  }

  return {
    message: errorMessage,
    status: errorCode,
  };
};

apiService.interceptors.request.use(async (config) => {
  if (store.getters['auth/isTokenExpired']) {
    await store.dispatch('auth/fetchAuthToken');
  }

  const token = store.getters['auth/currentAuthToken'];
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    console.log("No current token available. Skipping token setting.");
  }
  
  return config;
}, error => {
  console.error('Request Error:', error);
  return Promise.reject(error);
});

export const setupInterceptors = (router) => {
  apiService.interceptors.response.use(
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