<template>
  <div class="login-container">
    <div v-if="isDialog">
      <v-overlay :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
        <JasstafelContainer
          :bgImage="bgImage"
        >
          <div class="content-wrapper">
            <h1 class="title">Login</h1>
            <LoginComponent @login-success="closeDialog"></LoginComponent>
            <CloseButton class="dialog-close-button" @click="closeDialog"></CloseButton>
          </div>
        </JasstafelContainer>
      </v-overlay>
    </div>
    <div v-else>
      <JasstafelContainer
          :bgImage="bgImage"
      >
        <div class="content-wrapper">
          <h1 class="title display-1--text">Login</h1>
          <LoginComponent></LoginComponent>
          <CloseButton class="dialog-close-button" @click="closeDialog"></CloseButton>
        </div>
      </JasstafelContainer>
    </div>
  </div>
</template>


<script>
import { ref } from 'vue';
import { useStore } from 'vuex';
import RegisterForm from "../common/RegisterForm.vue";
import Jasstafel from "../common/JasstafelContainer.vue";
import CloseButton from "../common/CloseButton.vue";

export default {
  name: "Register",
  components: {RegisterPageForm,
    Jasstafel,
    CloseButton
  },
  setup() {
    const store = useStore();

    const registerFormSchema = [
      { type: "text", label: "Jass Name", model: "username", required: true },
      { type: "email", label: "E-Mail", model: "email", required: true },
      { type: "password", label: "Passwort", model: "password", required: true },
      { type: "password", label: "Passwort bestätigen", model: "confirmPassword", required: true },
    ];

    const showRegister = ref(true);
    const showSnackbar = ref(false);
    const snackbarMessage = ref('');
    const snackbarColor = ref('');

    const register = async (formData) => {
      if (formData.password !== formData.confirmPassword) {
        passwordError();
        return;
      }
      
      try {
        await store.dispatch('auth/register', formData);
        registerSuccess();
      } catch (error) {
        registerError();
      }
    };

    const closeRegister = () => {
      showRegister.value = false;
    };

    const registerSuccess = () => {
      snackbarMessage.value = 'Registrierung erfolgreich!';
      snackbarColor.value = 'green';
      showSnackbar.value = true;
    };

    const registerError = () => {
      snackbarMessage.value = 'Registrierung fehlgeschlagen. Bitte versuchen Sie es erneut.';
      snackbarColor.value = 'red';
      showSnackbar.value = true;
    };

    const passwordError = () => {
      snackbarMessage.value = 'Passwörter stimmen nicht überein. Bitte versuchen Sie es erneut.';
      snackbarColor.value = 'red';
      showSnackbar.value = true;
    };

    return {
      registerFormSchema,
      register,
      closeRegister,
      showRegister,
      showSnackbar,
      snackbarMessage,
      snackbarColor
    };
  },
};
</script>

<style scoped>
/* Ihr CSS-Code für die Registrierung */
</style>
