import axios from 'axios';
import store from '@/store';

export const registerEmail = async (email) => {
  try {
    const response = await axios.post('/api/auth/register-email', { email });
    if (response.data.code === 'EMAIL_SENT') {
      return response.data.message;
    }
    throw new Error(response.data.message);
  } catch (error) {
    store.commit('auth/setError', error.message);
    throw error;
  }
};

export const registerJassname = async (jassname, password, token) => {
  try {
    const response = await axios.post('/api/auth/register-jassname', { jassname, password, token });
    if (response.data.code === 'REGISTRATION_SUCCESS') {
      return response.data;
    }
    throw new Error(response.data.message);
  } catch (error) {
    store.commit('auth/setError', error.message);
    throw error;
  }
};