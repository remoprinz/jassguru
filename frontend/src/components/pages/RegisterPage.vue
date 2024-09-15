<template>
  <div class="register-container">
    <JasstafelContainer :bgImage="bgImage" :isRegisterProcess="true" :hideImageInLandscape="true">
      <div class="content-wrapper">
        <h1 class="title display-1--text">{{ pageTitle }}</h1>
        <component 
          :is="currentComponent" 
          @submit="handleSubmit" 
          :isLoading="isLoading" 
          :token="token"
        />
        <CloseButton class="dialog-close-button" @click="closeDialog" />
      </div>
    </JasstafelContainer>
    <MyEmailRegistrationPopup
      v-if="currentStep === 'email'"
      v-model:show="showInstructionPopup"
      title="Registrierungsanleitung"
    />
  </div>
</template>

<script>
import JasstafelContainer from '@/components/common/JasstafelContainer.vue';
import RegistrationForm from '@/components/auth/RegistrationForm.vue';
import JassnameRegistrationForm from '@/components/auth/JassnameRegistrationForm.vue';
import CloseButton from "@/components/common/CloseButton.vue";
import MyEmailRegistrationPopup from '@/components/popups/MyEmailRegistrationPopup.vue';
import { mapActions } from 'vuex';
import confetti from 'canvas-confetti';

export default {
  name: 'RegisterPage',
  components: {
    JasstafelContainer,
    RegistrationForm,
    JassnameRegistrationForm,
    CloseButton,
    MyEmailRegistrationPopup
  },
  data() {
    return {
      bgImage: null,
      isLoading: false,
      currentStep: 'email',
      token: '',
      email: '',
      showInstructionPopup: true
    };
  },
  computed: {
    currentComponent() {
      return this.currentStep === 'email' ? 'RegistrationForm' : 'JassnameRegistrationForm';
    },
    pageTitle() {
      return this.currentStep === 'email' ? 'Registrieren' : 'Jassname setzen';
    },
  },
  created() {
    this.setBgImage();
    window.addEventListener('resize', this.setBgImage);
    window.addEventListener('orientationchange', this.setBgImage);

    const token = this.$route.query.token;
    if (token) {
      this.token = token;
      this.currentStep = 'jassname';
      this.showInstructionPopup = false;
    }
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.setBgImage);
    window.removeEventListener('orientationchange', this.setBgImage);
  },
  methods: {
    ...mapActions('auth', ['registerEmail', 'registerJassname']),
    ...mapActions('notifications', ['showSnackbar']),

    setBgImage() {
      this.bgImage = window.innerWidth >= 1024 || window.matchMedia("(orientation: landscape)").matches
        ? require('@/assets/images/Jasstafel_gedreht.png')
        : require('@/assets/images/Jasstafel.png');
    },
    closeDialog() {
      this.$router.go(-1);
    },
    async handleSubmit(formData) {
      this.isLoading = true;
      try {
        if (this.currentStep === 'email') {
          const response = await this.registerEmail(formData);
          this.email = formData.email;
          this.showSnackbar({
            message: response.message,
            color: 'green'
          });
          this.triggerConfetti();
        } else {
          const response = await this.registerJassname({ ...formData, token: this.token });
          this.showSnackbar({
            message: response.message,
            color: 'green'
          });
          this.triggerConfetti();
          this.$router.push('/login');
        }
      } catch (error) {
        this.showSnackbar({
          message: error.message,
          color: 'red'
        });
      } finally {
        this.isLoading = false;
      }
    },
    triggerConfetti() {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 }
      });
    },
  },
};
</script>

<style scoped>
.register-container {
  background-color: #388E3C;
  display: flex;
  flex-direction: column;
}

.content-wrapper {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  flex-grow: 1;
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
  .register-container {
    min-height: 100vh;
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
  .register-container {
    min-height: 130vh;
    padding-top: 0;
  }
  .title {
    top: -5%;
    font-size: 3vw;
  }
  .dialog-close-button {
    right: 40px;
    bottom: -65%;
  }
}
</style>