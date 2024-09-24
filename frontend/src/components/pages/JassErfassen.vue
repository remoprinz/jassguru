<template>
  <div class="jass-erfassen-container">
    <h1 class="title">{{ pageTitle }}</h1>
    <div class="jasstafel-wrapper">
      <JasstafelContainer :bgImage="bgImage" :hideImageInLandscape="true">
        <div class="content-wrapper">
          <ErrorBoundary>
            <component 
              :is="currentStepComponent"
              @next-step="handleNextStep"
              :key="currentStep"
              ref="currentComponent"
              :selectedPlayers="selectedPlayers"
            />
          </ErrorBoundary>
        </div>
      </JasstafelContainer>
      <CloseButton @click="resetJassErfassenProcess" class="close-button" />
    </div>
    <v-overlay :value="isProcessing" color="primary" opacity="0.8">
      <v-progress-circular indeterminate size="64"></v-progress-circular>
    </v-overlay>
  </div>
</template>

<script>
import { mapState, mapActions } from 'vuex';
import JasstafelContainer from '@/components/common/JasstafelContainer.vue';
import ModusErfassen from '@/components/JassErfassenComponents/ModusErfassen.vue';
import GroupSelect from '@/components/JassErfassenComponents/GroupSelect.vue';
import SpielerErfassen from '@/components/JassErfassenComponents/SpielerErfassen.vue';
import Rosen10Player from '@/components/JassErfassenComponents/Rosen10Player.vue';
import JassErfassenUebersicht from '@/components/JassErfassenComponents/JassErfassenUebersicht.vue';
import CloseButton from '@/components/common/CloseButton.vue';
import { logInfo, logError } from '@/utils/logger';
import { useRouter } from 'vue-router';
import { JASS_ERFASSEN_MESSAGES } from '@/constants/jassErfassenMessages';
import { ref, onMounted, onBeforeUnmount } from 'vue';
import ErrorBoundary from '@/components/common/ErrorBoundary.vue';

export default {
  name: 'JassErfassen',
  components: {
    JasstafelContainer,
    ModusErfassen,
    GroupSelect,
    SpielerErfassen,
    Rosen10Player,
    JassErfassenUebersicht,
    CloseButton,
    ErrorBoundary, // Hinzugefügt
  },
  setup() {
    const router = useRouter();
    const bgImage = ref('');

    const setBgImage = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      bgImage.value = isLandscape
        ? require('@/assets/images/Jasstafel_gedreht.png')
        : require('@/assets/images/Jasstafel.png');
    };

    onMounted(() => {
      setBgImage();
      window.addEventListener('resize', setBgImage);
      window.addEventListener('orientationchange', setBgImage);
    });

    onBeforeUnmount(() => {
      window.removeEventListener('resize', setBgImage);
      window.removeEventListener('orientationchange', setBgImage);
    });

    return { router, bgImage };
  },
  computed: {
    ...mapState('jassErfassen', ['currentStep', 'isProcessing', 'selectedGroup', 'selectedPlayers', 'mode', 'rosen10Player']),
    ...mapState('auth', ['isAuthenticated']),
    pageTitle() {
      const titles = {
        1: 'Modus auswählen',
        2: 'Gruppe auswählen',
        3: 'Spieler auswählen',
        4: 'Rosen 10 Spieler',
        5: 'Übersicht',
      };
      return titles[this.currentStep] || 'Jass erfassen';
    },
    currentStepComponent() {
      const components = {
        1: ModusErfassen,
        2: GroupSelect,
        3: SpielerErfassen,
        4: Rosen10Player,
        5: JassErfassenUebersicht,
      };
      const component = components[this.currentStep];
      if (!component) {
        logError('JassErfassen', `Ungültiger Schritt: ${this.currentStep}`);
        return null;
      }
      return component;
    },
  },
  methods: {
    ...mapActions('jassErfassen', [
      'nextStep',
      'saveState',
      'resetJassErfassen',
      'fetchGroupPlayers',
      'resetJassErfassenState',
      'initializeJassErfassenState',
      'initializeJass',
    ]),
    ...mapActions('snackbar', ['showSnackbar', 'clearSnackbars']),
    async initializeJassErfassenState() {
      try {
        await this.$store.dispatch('jassErfassen/initializeJassErfassenState');
        this.setBgImage();
        logInfo('JassErfassen', 'Jass-Erfassen-Zustand erfolgreich initialisiert');
      } catch (error) {
        logError('JassErfassen', 'Fehler beim Initialisieren des Jass-Erfassen-Zustands', error);
        this.showSnackbar({
          message: 'Fehler beim Initialisieren des Jass-Erfassen-Zustands',
          color: 'error',
        });
      }
    },
    async handleNextStep() {
      logInfo('JassErfassen', 'handleNextStep aufgerufen', { currentStep: this.currentStep });
      try {
        await this.clearSnackbars();
        if (this.currentStep === 4) { // Vor dem Übergang zur Übersicht
          await this.$store.dispatch('jassErfassen/prepareOverviewData');
        }
        await this.nextStep();
        logInfo('JassErfassen', `Übergang zum Schritt ${this.currentStep} erfolgreich abgeschlossen`);
      } catch (error) {
        logError('JassErfassen', 'Fehler beim Übergang zum nächsten Schritt', error);
        this.showSnackbar({
          message: 'Fehler beim Laden der nächsten Ansicht. Bitte versuchen Sie es erneut.',
          color: 'error'
        });
      }
    },
    async finishJassErfassen() {
      this.isSubmitting = true;
      try {
        const jassData = {
          mode: this.mode,
          group_id: this.selectedGroup.id,
          players: this.selectedPlayers.map((player, index) => ({
            id: player.id,
            team: index < 2 ? 1 : 2
          })),
          rosen10_player_id: this.rosen10Player.id,
          date: new Date().toISOString(),
          location: this.location // Falls Sie die Standortdaten beibehalten möchten
        };

        logInfo('JassErfassen', 'Finalisiere Jass Erfassen', jassData);

        const result = await this.$store.dispatch('jassErfassen/initializeJass', jassData);
        
        logInfo('JassErfassen', 'Ergebnis der Jass-Initialisierung', result);

        if (result && result.jass_code) {
          this.showSnackbar({
            message: JASS_ERFASSEN_MESSAGES.GAME.STARTED,
            color: 'success'
          });
          this.router.push({ name: 'JassQRCode', params: { jassCode: result.jass_code } });
        } else {
          throw new Error('Kein Jass-Code erhalten');
        }
      } catch (error) {
        logError('JassErfassen', 'Fehler beim Finalisieren des Jass', error);
        this.showSnackbar({
          message: error.message || JASS_ERFASSEN_MESSAGES.GAME.ERROR,
          color: 'error'
        });
      } finally {
        this.isSubmitting = false;
      }
    },
    resetJassErfassenProcess() {
      this.$store.dispatch('jassErfassen/resetJassErfassen');
    },
    async saveCurrentState() {
      try {
        await this.saveState();
        logInfo('JassErfassen', 'Aktueller Zustand erfolgreich gespeichert');
      } catch (error) {
        logError('JassErfassen', 'Fehler beim Speichern des aktuellen Zustands', error);
        this.showSnackbar({
          message: 'Fehler beim Speichern des Zustands',
          color: 'warning',
        });
      }
    },
  },
  watch: {
    isAuthenticated(newValue) {
      if (!newValue) {
        this.$store.dispatch('auth/handleLogout');
      }
    },
    currentStep(newStep, oldStep) {
      logInfo('JassErfassen', `Schritt geändert von ${oldStep} zu ${newStep}`);
    }
  },
};
</script>

<style scoped>
.jass-erfassen-container {
  background-color: #388E3C;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0; /* Unverändert */
  position: relative;
}

.jasstafel-wrapper {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
  margin-bottom: 60px;
}

.close-button {
  position: absolute;
  bottom: -70px; /* Unverändert */
  right: 70px; /* Unverändert */
  z-index: 10;
}

.title {
  font-size: 32px;
  margin-bottom: 40px; /* Angepasst, um den Abstand zu verringern */
  text-align: center;
  color: white;
  margin-top: 40px; /* Hinzugefügt, um den Titel nach unten zu verschieben */
}

.content-wrapper {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

@media screen and (orientation: landscape) {
  .jass-erfassen-container {
    padding-top: 20px; /* Entfernt das obere Padding im Landscape-Modus */
  }

  .title {
    margin-bottom: -40px; /* Sehr geringer Abstand unter dem Titel */
  }

  .jasstafel-wrapper {
    margin-top: -10px; /* Negativer Margin, um den Abstand zu verringern */
  }

  .close-button {
    position: fixed;
    bottom: 20px;
    right: 20px;
  }
}
</style>