<template>
  <div>
    <SetPasswordForm @setPassword="setPassword" :isLoading="isLoading" />
    <v-snackbar
      v-model="showSnackbar"
      :color="snackbarColor"
      :timeout="5000"
    >
      {{ snackbarMessage }}
    </v-snackbar>
  </div>
</template>

<script>
import SetPasswordForm from './SetPasswordForm.vue';
import { setPassword, handleApiError } from '../../../api/apiServices.js';

export default {
  components: {
    SetPasswordForm
  },
  data() {
    return {
      isLoading: false,
      showSnackbar: false,
      snackbarMessage: '',
      snackbarColor: ''
    };
  },
  methods: {
    async setPassword(token, password, passwordConfirmation) {
      this.isLoading = true;
      if (!token) {
        this.updateSnackbar('Token ist ungültig oder fehlt.', 'red');
        return;
      }
      try {
        const response = await setPassword(token, password, passwordConfirmation);
        if (response.status === 200) {
          this.$router.push('/login');
          this.updateSnackbar('Passwort erfolgreich gesetzt!', 'green');
        }
      } catch (error) {
        this.updateSnackbar(handleApiError(error), 'red');
      } finally {
        this.isLoading = false;
      }
    },
    updateSnackbar(message, color) {
      this.snackbarMessage = message;
      this.snackbarColor = color;
      this.showSnackbar = true;
    }
  },
  created() {
    const urlParams = new URLSearchParams(window.location.search);
    this.token = urlParams.get('token');
  }
}
</script>
