<template>
  <div class="reset-password-form">
    <!-- Hier kommt das Formular zum Zurücksetzen des Passworts -->
    <form @submit.prevent="resetPassword">
      <!-- Formularfelder hier einfügen -->
      <button type="submit">Passwort zurücksetzen</button>
    </form>
  </div>
</template>

<script>
export default {
  name: "ResetPasswordComponent",
  data() {
    return {
      // Daten für das Formular hier
    };
  },
  methods: {
    resetPassword() {
      // Logik zum Zurücksetzen des Passworts hier
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