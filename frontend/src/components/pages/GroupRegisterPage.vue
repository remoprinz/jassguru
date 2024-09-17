<template>
  <div class="group-register-container">
    <JasstafelContainer :bgImage="bgImage">
      <div class="content-wrapper">
        <h1 class="title display-1--text">Gruppe registrieren</h1>
        <GroupRegisterForm @submit="handleSubmit" :isLoading="isLoading" />
        <CloseButton class="dialog-close-button" @click="closeDialog" />
      </div>
    </JasstafelContainer>
    <MyGroupRegisterPopup
      v-if="showInstructionPopup"
      v-model:show="showInstructionPopup"
      title="Gruppenregistrierung"
    />
  </div>
</template>

<script>
import JasstafelContainer from '@/components/common/JasstafelContainer.vue';
import GroupRegisterForm from '@/components/group/GroupRegisterForm.vue';
import CloseButton from "@/components/common/CloseButton.vue";
import MyGroupRegisterPopup from '@/components/popups/MyGroupRegisterPopup.vue';
import { mapActions, mapState } from 'vuex';
import confetti from 'canvas-confetti';

export default {
  name: 'GroupRegisterPage',
  components: {
    JasstafelContainer,
    GroupRegisterForm,
    CloseButton,
    MyGroupRegisterPopup
  },
  data() {
    return {
      bgImage: null,
      isLoading: false,
      showInstructionPopup: true
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
    ...mapActions('group', ['createNewGroup']),
    ...mapActions('snackbar', ['showSnackbar']),

    setBgImage() {
      this.bgImage = window.innerWidth >= 1024 || window.matchMedia("(orientation: landscape)").matches
        ? require('@/assets/images/Jasstafel_gedreht.png')
        : require('@/assets/images/Jasstafel.png');
    },
    closeDialog() {
      this.$router.go(-1);
    },
    async handleSubmit(groupName) {
      this.isLoading = true;
      try {
        const createdGroup = await this.createNewGroup(groupName);
        this.showSnackbar({
          message: `Die Jassgruppe "${createdGroup.name}" wurde erfolgreich erstellt. Du kannst nun einen Jass unter dieser Gruppe erfassen und die Spieler hinzufügen.`,
          color: 'success'
        });
        this.triggerConfetti();
        setTimeout(() => {
          this.$router.push('/jass_erfassen');
        }, 2000);
      } catch (error) {
        console.error('Error in handleSubmit:', error);
        this.showSnackbar({
          message: 'Ein Fehler ist bei der Gruppenregistrierung aufgetreten',
          color: 'error'
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
.group-register-container {
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
  .group-register-container {
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
  .group-register-container {
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
