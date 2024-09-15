<template>
  <div class="reset-password-container">
    <JasstafelContainer :bgImage="bgImage">
      <div class="content-wrapper">
        <h1 class="title display-1--text">Passwort zurücksetzen</h1>
        <ResetPasswordComponent></ResetPasswordComponent>
        <CloseButton class="dialog-close-button" @click="closeDialog"></CloseButton>
      </div>
    </JasstafelContainer>
  </div>
</template>

<script>
import JasstafelContainer from '@/components/common/JasstafelContainer.vue';
import ResetPasswordComponent from "@/components/processes/reset_password_process/ResetPasswordComponent.vue";
import CloseButton from "@/components/common/CloseButton.vue";

export default {
  name: "ResetPassword",
  components: {
    JasstafelContainer,
    ResetPasswordComponent,
    CloseButton
  },
  data() {
    return {
      bgImage: null,
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
    setBgImage() {
      this.bgImage = window.innerWidth >= 1024 || window.matchMedia("(orientation: landscape)").matches
        ? require('@/assets/images/Jasstafel_gedreht.png')
        : require('@/assets/images/Jasstafel.png');
    },
    closeDialog() {
      this.$router.go(-1);
    },
  },
};
</script>

<style scoped>
.reset-password-container {
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
  font-size: 4vw;
  top: 0;
}

.dialog-close-button {
  position: absolute;
  right: 35px;
}

/* Media queries for portrait orientation */
@media screen and (orientation: portrait) {
  .reset-password-container {
    padding-top: 45%;  /* Increased padding to accommodate the title */
  }
  .title {
    top: 0%;  /* Further moved down */
    font-size: 7vw;  /* Adjusted font size */
  }
  .dialog-close-button {
    right: 30px;
    bottom: -15%;
  }
}

/* Media queries for landscape orientation */
@media screen and (orientation: landscape) {
  .reset-password-container {
    padding-top: 10%;
  }
  .title {
    top: -25%;
    font-size: 3vw;
  }
  .dialog-close-button {
    right: 40px;
    bottom: -25%;
  }
}
</style>
