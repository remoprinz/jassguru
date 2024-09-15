<template>
  <div class="add-player-container">
    <JasstafelContainer :bgImage="bgImage" :isAddPlayerProcess="true" :hideImageInLandscape="true">
      <div class="content-wrapper">
        <h1 class="title display-1--text">{{ pageTitle }}</h1>
        <component 
          :is="currentComponent" 
          @submit="handleSubmit" 
          :isLoading="isLoading" 
          :nickname="nickname"
          :token="token"
        />
        <CloseButton class="dialog-close-button" @click="closeDialog" />
      </div>
    </JasstafelContainer>
    <MyAddPlayerPopup
      v-if="currentStep === 'initial' && showInstructionPopup"
      v-model:show="showInstructionPopup"
      title="Spieler hinzufügen"
    />
    <MyConfirmAddPlayerPopup
      v-if="currentStep === 'confirm' && showConfirmPopup"
      v-model:show="showConfirmPopup"
      :title="'Willkommen bei Jassguru!'"
      :nickname="nickname"
    />
  </div>
</template>

<script>
import JasstafelContainer from '@/components/common/JasstafelContainer.vue';
import AddPlayerForm from '@/components/auth/AddPlayerForm.vue';
import ConfirmAddPlayerForm from '@/components/auth/ConfirmAddPlayerForm.vue';
import CloseButton from "@/components/common/CloseButton.vue";
import MyAddPlayerPopup from '@/components/popups/MyAddPlayerPopup.vue';
import MyConfirmAddPlayerPopup from '@/components/popups/MyConfirmAddPlayerPopup.vue';
import { mapActions } from 'vuex';
import confetti from 'canvas-confetti';

export default {
  name: 'AddPlayerPage',
  components: {
    JasstafelContainer,
    AddPlayerForm,
    ConfirmAddPlayerForm,
    CloseButton,
    MyAddPlayerPopup,
    MyConfirmAddPlayerPopup
  },
  data() {
    return {
      bgImage: null,
      isLoading: false,
      currentStep: 'initial',
      token: '',
      nickname: '',
      showInstructionPopup: true,
      showConfirmPopup: true
    };
  },
  computed: {
    currentComponent() {
      return this.currentStep === 'initial' ? 'AddPlayerForm' : 'ConfirmAddPlayerForm';
    },
    pageTitle() {
      return this.currentStep === 'initial' ? 'Spieler hinzufügen' : 'Spieler bestätigen';
    },
  },
  created() {
    this.setBgImage();
    window.addEventListener('resize', this.setBgImage);
    window.addEventListener('orientationchange', this.setBgImage);

    const token = this.$route.query.token;
    if (token) {
      this.token = token;
      this.currentStep = 'confirm';
      this.decodeToken(token);
    }
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.setBgImage);
    window.removeEventListener('orientationchange', this.setBgImage);
  },
  methods: {
    ...mapActions('auth', ['initiateAddPlayer', 'confirmAddPlayer', 'decodeAddPlayerToken', 'addPlayerToGroup']),
    ...mapActions('snackbar', ['showSnackbar']),

    setBgImage() {
      this.bgImage = window.innerWidth >= 1024 || window.matchMedia("(orientation: landscape)").matches
        ? require('@/assets/images/Jasstafel_gedreht.png')
        : require('@/assets/images/Jasstafel.png');
    },
    closeDialog() {
      this.$router.go(-1);
    },
    async decodeToken(token) {
      try {
        const decodedData = await this.decodeAddPlayerToken(token);
        this.nickname = decodedData.nickname;
      } catch (error) {
        this.showSnackbar({
          message: 'Ungültiger oder abgelaufener Token',
          color: 'red'
        });
        this.$router.push('/');
      }
    },
    async handleSubmit(formData) {
      this.isLoading = true;
      try {
        if (this.currentStep === 'initial') {
          const response = await this.initiateAddPlayer(formData);
          this.nickname = formData.nickname;
          this.showSnackbar({
            message: response.message,
            color: 'green'
          });
          this.triggerConfetti();

          if (this.$route.query.returnTo === 'jass_erfassen') {
            // Spieler zur Gruppe hinzufügen und auswählen
            const newPlayer = {
              id: response.playerId,
              nickname: this.nickname
            };
            await this.$store.dispatch('jassErfassen/addNewPlayerAndSelect', newPlayer);
            this.$router.push('/jass_erfassen');
          }
        } else {
          const response = await this.confirmAddPlayer({ 
            password: formData.password,
            token: this.token,
            nickname: this.nickname
          });
          this.showSnackbar({
            message: response.message,
            color: 'green'
          });
          this.triggerConfetti();

          if (this.$route.query.returnTo === 'jass_erfassen') {
            this.$router.push({
              path: '/jass_erfassen',
              query: { 
                step: 'spieler_erfassen',
                newPlayer: this.nickname,
                groupId: this.$route.query.groupId
              }
            });
          } else {
            setTimeout(() => {
              this.$router.push('/');
            }, 2000);
          }
        }
      } catch (error) {
        this.showSnackbar({
          message: error.message || 'Ein Fehler ist aufgetreten',
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
.add-player-container {
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
  .add-player-container {
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
  .add-player-container {
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
