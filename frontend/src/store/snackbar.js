import { ref } from 'vue';
import { defineStore } from 'pinia';

const MAX_SNACKBARS = 1;

export const useSnackbarStore = defineStore('snackbar', () => {
  const snackbars = ref([]);

  function addSnackbar(snackbar) {
    if (snackbars.value.length < MAX_SNACKBARS) {
      snackbars.value.push({ ...snackbar, id: Date.now() });
    }
  }

  function removeSnackbar(id) {
    snackbars.value = snackbars.value.filter(s => s.id !== id);
  }

  function clearSnackbars() {
    snackbars.value = [];
  }

  function showSnackbar(payload) {
    console.log('Action: showSnackbar, Payload:', payload);

    if (!payload.message) {
      console.warn('Snackbar-Nachricht fehlt, Anzeige wird übersprungen.');
      return;
    }

    const existierendeSnackbar = snackbars.value.find(
      (snackbar) => snackbar.message === payload.message
    );
    if (existierendeSnackbar) {
      console.log('Snackbar mit gleicher Nachricht existiert bereits, wird übersprungen.');
      return;
    }

    const snackbar = {
      id: Date.now() + Math.random(),
      message: payload.message,
      color: payload.color || 'info',
      timeout: payload.timeout || 5000,
      istAktiv: true
    };

    if (snackbars.value.length >= MAX_SNACKBARS) {
      removeSnackbar(snackbars.value[0].id);
    }

    addSnackbar(snackbar);
    setTimeout(() => removeSnackbar(snackbar.id), snackbar.timeout);
  }

  return {
    snackbars,
    showSnackbar,
    removeSnackbar,
    clearSnackbars
  };
});
