<template>
  <div>
    <!-- Group Registration Form -->
    <GroupRegisterForm @register="registerHandler" :isLoading="isLoading" />
  </div>
</template>

<script>
import GroupRegisterForm from './GroupRegisterForm.vue';
import { mapActions } from 'vuex';
import { mapState } from 'vuex';
import confetti from 'canvas-confetti';
import { createGroup } from '@/api/groupServices.js';

export default {
  components: {
    GroupRegisterForm,
  },
  data() {
    return {
      isLoading: false,
    };
  },
  computed: {
    ...mapState('auth', ['isAuthenticated']),
  },
  watch: {
    isAuthenticated(newValue) {
      if (!newValue) {
        this.$router.push('/login');
      }
    }
  },
  methods: {
    // Snackbar-Aktionen aus dem Vuex-Store
    ...mapActions('snackbar', ['showSnackbar', 'hideSnackbar']),
    
    // Handler für die Gruppenregistrierung
    async registerHandler(groupName) {
      this.isLoading = true;
      try {
        // Aufruf der modularisierten API-Funktion
        const response = await createGroup(groupName);  
        
        // Antwort verarbeiten
        this.handleApiResponse(response);
      } catch (error) {
        // Fehler verarbeiten
        this.handleApiError(error);
      } finally {
        this.isLoading = false;
      }
    },

    // Verarbeitung der API-Antwort
    handleApiResponse(response) {
      console.log("Debugging: Response object received:", response);  // Debugging-Statement
      console.log("Debugging: Response status code:", response.status);  // Debugging-Statement
  
      const status = response.status;
      if (status === 201) {
        confetti({
          particleCount: 300,
          spread: 70120,
          origin: { y: 0.8 }
        });
        this.showSnackbar({
          message: 'Gruppenregistrierung erfolgreich! Du bist Admininstrator, erfasse das erste Spiel mit deinen Jassfreunden.',
          color: 'green'
        });
        setTimeout(() => {
          this.$router.push('/');
        }, 3000);
      } else {
        this.showSnackbar({
          message: `Unerwarteter API-Status: ${status}`,
          color: 'red'
        });
      }
    },

    // Verarbeitung von API-Fehlern
    handleApiError(error) {
      this.showSnackbar({
        message: `Registrierung fehlgeschlagen: ${error.message}`,
        color: 'red'
      });
    },
  },
};
</script>

<style scoped>
.group-register-container {
  background-color: #388E3C;
  height: 100vh;
}

.content-wrapper {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.title {
  position: relative;
  font-size: 5vw;
}

.dialog-close-button {
  position: absolute;
  right: 35px;
}

@media screen and (orientation: portrait) {
  .group-register-container {
    padding-top: 35%;
  }
  .title {
    top: -10%;
    font-size: 8vw;
  }
  .dialog-close-button {
    right: 30px;
    bottom: -15%;
  }
}

@media screen and (orientation: landscape) {
  .group-register-container {
    padding-top: 5%;
  }
  .title {
    top: -5%;
    font-size: 3vw;
  }
  .dialog-close-button {
    right: 40px;
    bottom: -17%;
  }
}
</style>