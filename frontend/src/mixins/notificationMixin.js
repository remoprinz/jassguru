// src/mixins/notificationMixin.js

import { mapActions } from 'vuex';

export default {
  methods: {
    ...mapActions('snackbar', ['showSnackbar']),

    showNotification(payload) {
      this.showSnackbar(payload);
    },

    async handleApiCall(apiFunction, ...args) {
      try {
        const response = await apiFunction(...args);
        this.handleApiResponse(response);
        return response;
      } catch (error) {
        this.handleApiError(error);
        throw error;
      }
    },

    handleApiResponse(response) {
      const { code, message } = response;
      const color = ['EMAIL_NOT_EXIST', 'EMAIL_RESENT', 'EMAIL_REGISTRATION_SUCCESS'].includes(code) ? 'success' : 'error';
      this.showSnackbar({ message, color });
    },

    handleApiError(error) {
      this.showSnackbar({ 
        message: error.message || 'Ein unerwarteter Fehler ist aufgetreten', 
        color: 'error' 
      });
    }
  }
};