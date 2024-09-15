<template>
  <div class="jass-erfassen-container">
    <JasstafelContainer :bgImage="bgImage" :hideImageInLandscape="true">
      <div class="content-wrapper">
        <h1 class="title display-1--text">{{ pageTitle }}</h1>
        <component 
          :is="currentStepComponent"
          @next-step="handleNextStep"
          :key="currentStep"
          ref="currentComponent"
          :selectedPlayers="selectedPlayers"
        />
        <CloseButton @click="resetJassErfassenProcess" class="close-button" />
      </div>
    </JasstafelContainer>
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
import { logError, logInfo, logDebug } from '@/utils/logger';

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
  },
  data() {
    return {
      bgImage: null,
    };
  },
  computed: {
    ...mapState('jassErfassen', ['currentStep', 'isProcessing', 'selectedGroup', 'selectedPlayers']),
    pageTitle() {
      const titles = {
        1: 'Modus auswählen',
        2: 'Gruppe auswählen',
        3: 'Spieler auswählen',
        4: 'Rosen 10 Spieler',
        5: 'Jass Erfassen Übersicht',
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
      return components[this.currentStep];
    },
  },
  methods: {
    ...mapActions('jassErfassen', [
      'nextStep',
      'saveState',
      'resetJassErfassen',
      'fetchGroupPlayers',
      'resetJassErfassenState',
    ]),
    ...mapActions('snackbar', ['showSnackbar', 'clearSnackbars']),

    setBgImage() {
      const isLandscape = window.innerWidth > window.innerHeight;
      this.bgImage = isLandscape
        ? require('@/assets/images/Jasstafel_gedreht.png')
        : require('@/assets/images/Jasstafel.png');
    },

    async initializeState() {
      try {
        const savedState = localStorage.getItem('jassErfassenState');
        if (savedState) {
          const parsedState = JSON.parse(savedState);
          await this.$store.dispatch('jassErfassen/restoreState', parsedState);
        } else {
          this.resetJassErfassenState();
        }
        this.setBgImage();
        window.addEventListener('resize', this.setBgImage);
        window.addEventListener('orientationchange', this.setBgImage);

        await this.saveState();
      } catch (error) {
        logError('JassErfassen', 'Error in initializeState:', error);
        this.showSnackbar({
          message: 'Fehler beim Initialisieren der Komponente',
          color: 'error',
        });
      }
    },

    async resetState() {
      logDebug('JassErfassen', 'Setze Zustand zurück');
      try {
        await this.$store.commit('jassErfassen/setCurrentStep', 1);
        await this.$store.commit('jassErfassen/setSelectedGroup', null);
        await this.clearSnackbars();
        logInfo('JassErfassen', 'Zustand erfolgreich zurückgesetzt');
      } catch (error) {
        logError('JassErfassen', 'Fehler beim Zurücksetzen des Zustands:', error);
        this.showSnackbar({
          message: 'Fehler beim Zurücksetzen des Zustands',
          color: 'error',
        });
      }
    },

    async handleNextStep() {
      logInfo('JassErfassen', 'Übergang zum nächsten Schritt wird eingeleitet', { currentStep: this.currentStep });
      try {
        await this.clearSnackbars();
        await this.nextStep();
        logInfo('JassErfassen', `Übergang zum Schritt ${this.currentStep} erfolgreich abgeschlossen`);
        if (this.currentStep === 4) {
          logInfo('JassErfassen', 'Übergang zur Rosen10Player-Komponente');
          console.log('Current state of selectedPlayers:', this.selectedPlayers);
        }
      } catch (error) {
        logError('JassErfassen', 'Fehler beim Übergang zum nächsten Schritt', error);
      }
    },

    resetJassErfassenProcess() {
      this.resetJassErfassenState();
      this.showSnackbar({
        message: 'Jass Erfassen Prozess wurde zurückgesetzt',
        color: 'info',
      });
    },

    resetToFirstStep() {
      this.resetJassErfassenProcess();
      this.setCurrentStep(1);
    },
  },
  created() {
    this.resetToFirstStep();
    this.setBgImage();
    window.addEventListener('resize', this.setBgImage);
    window.addEventListener('orientationchange', this.setBgImage);
  },
  async mounted() {
    this.setBgImage();
    if (this.currentStep > 1 && this.selectedGroup) {
      try {
        await this.fetchGroupPlayers(this.selectedGroup.id);
      } catch (error) {
        logError('JassErfassen', 'Error fetching group players', error);
        this.showSnackbar({
          message: 'Fehler beim Laden der Gruppenspieler',
          color: 'error',
        });
      }
    }
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.setBgImage);
    window.removeEventListener('orientationchange', this.setBgImage);
  },
  watch: {
    currentStep: {
      handler(newStep, oldStep) {
        logInfo('JassErfassen', `Current step changed from ${oldStep} to ${newStep}`);
        if (newStep !== oldStep) {
          this.saveState();
        }
      },
      immediate: true,
    },
  },
};
</script>

<style scoped>
.jass-erfassen-container {
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
  width: 100%;
  max-width: 450px;
  padding: 0 20px;
  margin: 0 auto;
  position: relative;
}

.title {
  position: relative;
  font-size: 5vw;
  margin-bottom: 20px;
  text-align: center;
}

.close-button {
  position: absolute;
  bottom: 20px;
  right: 20px;
}

@media screen and (orientation: portrait) {
  .jass-erfassen-container {
    min-height: 100vh;
    padding-top: 20%;
  }
  .title {
    top: -10%;
    font-size: 8vw;
  }
}

@media screen and (orientation: landscape) {
  .jass-erfassen-container {
    min-height: 130vh;
    padding-top: 10%;
  }
  .title {
    top: -5%;
    font-size: 3vw;
  }
}
</style>