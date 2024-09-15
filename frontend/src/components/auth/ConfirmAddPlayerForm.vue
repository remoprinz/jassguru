<template>
  <div class="confirm-add-player-container">
    <JasstafelContainer :bgImage="bgImage" :isConfirmAddPlayerProcess="true" :hideImageInLandscape="true">
      <div class="content-wrapper">
        <h1 class="title display-1--text">Spieler bestätigen</h1>
        <p v-if="nickname">Willkommen, {{ nickname }}!</p>
        <p v-else>Laden...</p>
        <v-form ref="form" v-model="valid" @submit.prevent="submit" class="form-input">
          <v-text-field
            v-model="password"
            :rules="passwordRules"
            label="Passwort"
            type="password"
            required
            class="text-field"
          ></v-text-field>
          <v-text-field
            v-model="passwordConfirmation"
            :rules="passwordConfirmationRules"
            label="Passwort bestätigen"
            type="password"
            required
            class="text-field"
          ></v-text-field>
          <OkButton :loading="isLoading" :disabled="!valid" @click="submit" class="submit-button">
            Bestätigen
          </OkButton>
        </v-form>
        <v-alert v-if="error" type="error" class="mt-4">{{ error }}</v-alert>
        <CloseButton class="dialog-close-button" @click="closeDialog" />
      </div>
    </JasstafelContainer>
    <MyConfirmAddPlayerPopup
      v-model:show="showConfirmPopup"
      :title="'Willkommen bei Jassguru!'"
      :nickname="nickname"
    />
  </div>
</template>

<script>
import { mapActions } from 'vuex';
import JasstafelContainer from '@/components/common/JasstafelContainer.vue';
import OkButton from '@/components/common/OkButton.vue';
import CloseButton from "@/components/common/CloseButton.vue";
import MyConfirmAddPlayerPopup from '@/components/popups/MyConfirmAddPlayerPopup.vue';
import confetti from 'canvas-confetti';

export default {
  name: 'ConfirmAddPlayerForm',
  components: {
    JasstafelContainer,
    OkButton,
    CloseButton,
    MyConfirmAddPlayerPopup,
  },
  props: {
    token: {
      type: String,
      required: true
    }
  },
  data() {
    return {
      valid: false,
      nickname: '',
      password: '',
      passwordConfirmation: '',
      isLoading: false,
      error: null,
      bgImage: null,
      showConfirmPopup: true, // Initialize to true to show the popup immediately
      passwordRules: [
        v => !!v || 'Passwort ist erforderlich',
        v => v.length >= 8 || 'Passwort muss mindestens 8 Zeichen lang sein'
      ],
      passwordConfirmationRules: [
        v => !!v || 'Passwortbestätigung ist erforderlich',
        v => v === this.password || 'Passwörter stimmen nicht überein'
      ]
    };
  },
  methods: {
    ...mapActions('auth', ['decodeAddPlayerToken', 'confirmAddPlayer']),
    setBgImage() {
      this.bgImage = window.innerWidth >= 1024 || window.matchMedia("(orientation: landscape)").matches
        ? require('@/assets/images/Jasstafel_gedreht.png')
        : require('@/assets/images/Jasstafel.png');
    },
    async submit() {
      if (this.$refs.form.validate()) {
        this.isLoading = true;
        this.error = null;
        console.log('Bestätigungsversuch mit Token:', this.token);
        try {
          await this.confirmAddPlayer({
            nickname: this.nickname,
            password: this.password,
            token: this.token
          });
          console.log('Spieler erfolgreich bestätigt');
          this.triggerConfetti();
          setTimeout(() => {
            this.$router.push('/login');
          }, 2000);
        } catch (error) {
          console.error('Fehler bei der Bestätigung:', error);
          this.error = 'Fehler bei der Bestätigung. Bitte versuchen Sie es erneut.';
        } finally {
          this.isLoading = false;
        }
      }
    },
    triggerConfetti() {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 }
      });
    },
    closeDialog() {
      this.$router.go(-1);
    },
  },
  created() {
    console.log('ConfirmAddPlayerForm created');
    this.setBgImage();
    window.addEventListener('resize', this.setBgImage);
    window.addEventListener('orientationchange', this.setBgImage);

    if (this.token) {
      this.decodeAddPlayerToken(this.token).then(decodedData => {
        this.nickname = decodedData.nickname;
        // Ensure the popup is shown after the nickname is set
        this.showConfirmPopup = true;
      }).catch(error => {
        console.error('Fehler beim Dekodieren des Tokens:', error);
        this.error = 'Ungültiger oder abgelaufener Token. Bitte fordern Sie einen neuen an.';
      });
    }
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.setBgImage);
    window.removeEventListener('orientationchange', this.setBgImage);
  }
};
</script>

<style scoped>
.confirm-add-player-container {
  background-color: #388E3C; /* Hintergrundfarbe des Containers */
  display: flex; /* Flexbox-Layout aktivieren */
  flex-direction: column; /* Elemente vertikal anordnen */
  align-items: center; /* Zentrierung der Elemente horizontal */
  justify-content: flex-start; /* Startet den Inhalt oben im Container */
  min-height: 100vh; /* Container füllt mindestens die Höhe des Viewports */
}

.content-wrapper {
  display: flex; /* Flexbox-Layout aktivieren */
  flex-direction: column; /* Elemente vertikal anordnen */
  justify-content: flex-start; /* Inhalt bleibt am oberen Rand */
  align-items: center; /* Horizontale Zentrierung der Inhalte */
  width: 100%; /* Breite des Containers auf 100% setzen */
  max-width: 800px; /* Maximale Breite des Containers */
  padding: 0 20px; /* Innenabstand links und rechts */
  box-sizing: border-box; /* Stellt sicher, dass Padding und Border in die Breite einbezogen werden */
  margin: 0 auto; /* Zentriert den content-wrapper */
}

.title {
  position: relative; /* Ermöglicht das Verschieben der Position relativ zu sich selbst */
  font-size: 5vw; /* Schriftgröße des Titels (angepasst an die Bildschirmbreite) */
  top: 10px; /* Verschiebt den Titel weiter nach oben */
  text-align: center; /* Zentriert den Titeltext */
}

.dialog-close-button {
  position: absolute; /* Ermöglicht das Positionieren des Buttons relativ zum nächsten Positionierungs-Elternteil */
  right: 35px; /* Abstand von der rechten Seite */
  bottom: -15%; /* Abstand vom unteren Rand */
}

.text-field, .submit-button {
  width: 100%; /* Breite der Eingabefelder und des Buttons auf 100% des Containers setzen */
  max-width: 450px; /* Maximale Breite der Eingabefelder und des Buttons */
  margin: 0 auto; /* Zentrierung des Elements */
  margin-bottom: -10px; /* Abstand nach unten zwischen den Elementen */
  box-sizing: border-box; /* Stellt sicher, dass Padding und Border in die Breite einbezogen werden */
}

.form-input {
  width: 100%; /* Maximale Breite des Formulars */
  max-width: 450px; /* Maximale Breite des Formulars */
  margin: 0 auto; /* Zentriert das Formular */
  box-sizing: border-box; /* Stellt sicher, dass Padding und Border in die Breite einbezogen werden */
}

@media screen and (orientation: portrait) {
  .confirm-add-player-container {
    padding-top: 40%; /* Abstand vom oberen Rand des Containers */
  }
  .form-input {
    margin-top: 10px; /* Verschiebt die Formulareinträge (Textfelder + Button) nach oben */
  }
  .title {
    top: -80px; /* Verschiebt den Titel weiter nach oben */
    font-size: 8vw; /* Schriftgröße des Titels */
  }
  .text-field, .submit-button {
    width: 100%; /* Breite der Eingabefelder und des Buttons im Portrait-Modus */
    max-width: 450px; /* Maximale Breite der Eingabefelder und des Buttons im Portrait-Modus */
    margin-top: 0; /* Setzt den oberen Rand zurück */
  }
  .dialog-close-button {
    right: 30px; /* Abstand von der rechten Seite */
    bottom: -15%; /* Abstand vom unteren Rand */
  }
}

@media screen and (orientation: landscape) {
  .confirm-add-player-container {
    padding-top: 15%; /* Kein zusätzlicher Abstand oben */
    justify-content: flex-start; /* Startet den Inhalt oben im Container */
  }
  .form-input {
    margin-top: 50px; /* Verschiebt die Formulareinträge (Textfelder + Button) nach unten */
  }
  .title {
    top: 0%; /* Verschiebt den Titel weiter nach oben */
    font-size: 3vw; /* Schriftgröße des Titels */
  }
  .text-field, .submit-button {
    width: 100%; /* Breite der Eingabefelder und des Buttons im Landscape-Modus */
    max-width: 450px; /* Maximale Breite der Eingabefelder und des Buttons im Landscape-Modus */
    margin-top: 0px; /* Fügt zusätzlichen Abstand nach oben hinzu, um die Elemente nach unten zu verschieben */
  }
  .dialog-close-button {
    right: 40px; /* Abstand von der rechten Seite */
    bottom: -80px; /* Abstand vom unteren Rand anpassen, um sicherzustellen, dass der Button innerhalb des Containers bleibt */
  }
}
</style>
