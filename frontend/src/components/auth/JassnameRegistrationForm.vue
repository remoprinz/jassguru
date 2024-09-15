<template>
  <div class="register-container">
    <JasstafelContainer :bgImage="bgImage" :isRegisterProcess="true" :hideImageInLandscape="true">
      <div class="content-wrapper">
        <h1 class="title display-1--text">Jassname wählen</h1>
        <v-form ref="form" v-model="valid" @submit.prevent="submit" class="form-input">
          <v-text-field
            v-model="jassname"
            :rules="jassnameRules"
            label="Jassname"
            required
            class="text-field"
          ></v-text-field>
          <OkButton :loading="isLoading" :disabled="!valid" @click="submit" class="submit-button">
            Jetzt registrieren!
          </OkButton>
        </v-form>
        <CloseButton class="dialog-close-button" @click="closeDialog" />
      </div>
    </JasstafelContainer>
    <MyJassnamePopup
      v-if="showPopup"
      v-model:show="showPopup"
      title="Jassname Anleitung"
    />
  </div>
</template>

<script>
import JasstafelContainer from '@/components/common/JasstafelContainer.vue';
import OkButton from '@/components/common/OkButton.vue';
import CloseButton from "@/components/common/CloseButton.vue";
import MyJassnamePopup from '@/components/popups/MyJassnamePopup.vue';
import { mapActions } from 'vuex';
import confetti from 'canvas-confetti';

export default {
  name: 'JassnameRegistrationForm',
  components: {
    JasstafelContainer,
    OkButton,
    CloseButton,
    MyJassnamePopup
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
      isLoading: false,
      jassname: '',
      bgImage: null,
      showPopup: true,
      jassnameRules: [
        v => !!v || 'Jassname ist erforderlich',
        v => v.length >= 2 || 'Jassname muss mindestens 2 Zeichen lang sein',
        v => v.length <= 25 || 'Jassname darf maximal 25 Zeichen lang sein'
      ]
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
    ...mapActions('auth', ['registerJassname']),
    async submit() {
      if (this.$refs.form.validate()) {
        this.isLoading = true;
        try {
          await this.registerJassname({ jassname: this.jassname, token: this.token });
          this.triggerConfetti(); // Konfetti-Regen im Erfolgsfall
          this.$router.push('/');
        } catch (error) {
          console.error('Fehler bei der Jassname-Registrierung:', error);
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
    setBgImage() {
      this.bgImage = window.innerWidth >= 1024 || window.matchMedia("(orientation: landscape)").matches
        ? require('@/assets/images/Jasstafel_gedreht.png')
        : require('@/assets/images/Jasstafel.png');
    },
    closeDialog() {
      this.$router.go(-1);
    },
  }
};
</script>

<style scoped>
.confirm-add-player-container {
  background-color: #388E3C; /* Hintergrundfarbe des Containers */
  display: flex; /* Flexbox-Layout aktivieren */
  flex-direction: column; /* Elemente vertikal anordnen */
  align-items: center; /* Zentrierung der Elemente horizontal */
}

.content-wrapper {
  display: flex; /* Flexbox-Layout aktivieren */
  flex-direction: column; /* Elemente vertikal anordnen */
  justify-content: center; /* Vertikale Zentrierung der Inhalte */
  align-items: center; /* Horizontale Zentrierung der Inhalte */
  flex-grow: 1; /* Container wächst, um den verfügbaren Platz zu füllen */
  width: 100%; /* Breite des Containers auf 100% setzen */
  max-width: 450px; /* Maximale Breite des Containers auf 450px reduzieren */
  padding: 0 20px; /* Innenabstand links und rechts */
  margin: 0 auto; /* Zentriert den content-wrapper */
}

.title {
  position: relative; /* Ermöglicht das Verschieben der Position relativ zu sich selbst */
  font-size: 5vw; /* Schriftgröße des Titels (angepasst an die Bildschirmbreite) */
  top: 10%; /* Verschiebt den Titel weiter nach oben */
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
  margin: 0 auto; /* Zentriert das Element */
  margin-bottom: 16px; /* Abstand nach unten zwischen den Elementen */
  box-sizing: border-box; /* Stellt sicher, dass Padding und Border in die Breite einbezogen werden */
}

.form-input {
  width: 100%; /* Maximale Breite des Formulars */
  max-width: 450px;
  margin: 0 auto; /* Zentriert das Formular */
  box-sizing: border-box; /* Stellt sicher, dass Padding und Border in die Breite einbezogen werden */
}

@media screen and (orientation: portrait) {
  .confirm-add-player-container {
    min-height: 100vh; /* Minimale Höhe des Containers */
    padding-top: 35%; /* Abstand vom oberen Rand des Containers */
  }
  .title {
    top: -10%; /* Verschiebt den Titel weiter nach oben */
    font-size: 8vw; /* Schriftgröße des Titels */
  }
  .text-field, .submit-button {
    width: 100%; /* Entfernen Sie die zusätzliche Breite */
    max-width: 450px;
    margin: 0 auto; /* Zentriert das Element */
    box-sizing: border-box; /* Stellt sicher, dass Padding und Border in die Breite einbezogen werden */
  }
  .dialog-close-button {
    right: 30px; /* Abstand von der rechten Seite */
    bottom: -15%; /* Abstand vom unteren Rand */
  }
}

@media screen and (orientation: landscape) {
  .confirm-add-player-container {
    min-height: 130vh; /* Minimale Höhe des Containers */
    padding-top: 0; /* Kein zusätzlicher Abstand oben */
  }
  .title {
    top: -5%; /* Verschiebt den Titel weiter nach oben */
    font-size: 3vw; /* Schriftgröße des Titels */
  }
  .text-field, .submit-button {
    width: 100%; /* Entfernen Sie die zusätzliche Breite */
    max-width: 450px;
    margin: 0 auto; /* Zentriert das Element */
    box-sizing: border-box; /* Stellt sicher, dass Padding und Border in die Breite einbezogen werden */
  }
  .dialog-close-button {
    right: 40px; /* Abstand von der rechten Seite */
    bottom: -65%; /* Abstand vom unteren Rand */
  }
}
</style>
