<template>
  <div class="login-container">
    <JasstafelContainer 
      :bgImage="bgImage" 
      :isLoginProcess="true" 
      :hideImageInLandscape="true"
    >
      <div class="content-wrapper">
        <h1 class="title display-1--text">Login</h1>
        <LoginForm @submit="loginHandler" :isLoading="isLoading" />
        <CloseButton class="dialog-close-button" @click="closeDialog" />
      </div>
    </JasstafelContainer>
  </div>
</template>

<script>
import JasstafelContainer from '@/components/common/JasstafelContainer.vue';
import LoginForm from '@/components/auth/LoginForm.vue';
import CloseButton from "@/components/common/CloseButton.vue";
import { mapActions } from 'vuex';

export default {
  name: 'LoginPage',
  components: {
    JasstafelContainer,
    LoginForm,
    CloseButton,
  },
  data() {
    return {
      bgImage: null,
      isLoading: false,
    };
  },
  created() {
    this.setBgImage();
    window.addEventListener('resize', this.setBgImage);
    window.addEventListener('orientationchange', this.setBgImage);
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.setBgImage);
    window.removeEventListener('orientationchange', this.setBgImage);
  },
  methods: {
    ...mapActions('auth', ['login']), // Login-Aktion aus dem Vuex-Store auth.js referenzieren

    setBgImage() {
      this.bgImage = window.innerWidth >= 1024 || window.matchMedia("(orientation: landscape)").matches
        ? require('@/assets/images/Jasstafel_gedreht.png')
        : require('@/assets/images/Jasstafel.png');
    },
    closeDialog() {
      this.$router.go(-1);
    },

    async loginHandler(formData) {
      this.isLoading = true;
      try {
        // Aufruf der login-Aktion im Vuex-Store auth.js
        await this.login(formData);
        this.$router.push('/'); // Weiterleitung zur Startseite bei erfolgreichem Login
      } catch (error) {
        // Fehlerbehandlung erfolgt in auth.js, daher hier keine Snackbar erforderlich
        console.error('Login fehlgeschlagen:', error); 
      } finally {
        this.isLoading = false; // Ladezustand zurücksetzen
      }
    }
  }
};
</script>

<style scoped>
.login-container {
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

/* Media queries für das Hochformat */
@media screen and (orientation: portrait) {
  .login-container {
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

/* Media queries für das Querformat */
@media screen and (orientation: landscape) {
  .login-container {
    padding-top: 10%;
  }
  .title {
    top: -28%;
    font-size: 3vw;
  }
  .dialog-close-button {
    right: 40px;
    bottom: -25%;
  }
}
</style>

