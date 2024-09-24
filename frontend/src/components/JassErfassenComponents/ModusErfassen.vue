<template>
  <div class="modus-erfassen">
    <div class="input-container">
      <v-select
        v-model="selectedModus"
        :items="modusOptions"
        label="Spielmodus auswählen"
        outlined
        @change="handleModusSelection"
        class="modus-select"
      ></v-select>
      <OkButton 
        :disabled="!selectedModus" 
        @click="confirmModus"
        class="ok-button"
      >
        Bestätigen
      </OkButton>
    </div>
    <v-btn
      icon
      @click="showInfoPopup"
      class="info-button"
    >
      <v-icon>mdi-information</v-icon>
    </v-btn>
    <MyModusInfoPopup
      v-if="showPopup"
      v-model:show="showPopup"
      title="Spielmodus Informationen"
    />
  </div>
</template>

<script>
import { mapActions } from 'vuex';
import OkButton from '@/components/common/OkButton.vue';
import MyModusInfoPopup from '@/components/popups/MyModusInfoPopup.vue';
import { logInfo, logError } from '@/utils/logger';
import { JASS_ERFASSEN_MESSAGES } from '@/constants/jassErfassenMessages';

export default {
  name: 'ModusErfassen',
  components: {
    OkButton,
    MyModusInfoPopup
  },
  data() {
    return {
      selectedModus: null,
      modusOptions: ['Jassgruppe', 'Turnier', 'Einzelspiel', 'Liga'],
      showPopup: false,
    };
  },
  methods: {
    ...mapActions('jassErfassen', ['setMode', 'nextStep', 'resetJassErfassenState']),
    ...mapActions('snackbar', ['clearSnackbars', 'showSnackbar']),

    handleModusSelection(modus) {
      logInfo('ModusErfassen', `Modus selected: ${modus}`);
      this.selectedModus = modus;
    },

    async confirmModus() {
      if (this.selectedModus) {
        logInfo('ModusErfassen', `Bestätige Modus: ${this.selectedModus}`);
        try {
          if (this.selectedModus !== this.$store.state.jassErfassen.selectedMode) {
            await this.resetJassErfassenState();
          }
          await this.setMode(this.selectedModus);
          this.showSnackbar({
            message: JASS_ERFASSEN_MESSAGES.MODUS_ERFASSEN.SELECTED.replace('{mode}', this.selectedModus),
            color: 'success'
          });
          this.nextStep();
        } catch (error) {
          logError('ModusErfassen', 'Fehler bei der Modusbestätigung', error);
          this.showSnackbar({
            message: JASS_ERFASSEN_MESSAGES.MODUS_ERFASSEN.ERROR,
            color: 'error'
          });
        }
      }
    },

    showInfoPopup() {
      this.showPopup = true;
    }
  },
};
</script>

<style scoped>
.modus-erfassen {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.input-container {
  width: 180%;
  max-width: 240px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.modus-select,
.ok-button {
  width: 100%;
  max-width: 100%; /* Verhindert Überschreitung der Container-Breite */
  margin-bottom: 16px;
}

.info-button {
  margin-top: 16px;
}

:deep(.v-input__control),
:deep(.v-input__slot),
:deep(.v-text-field__slot) {
  width: 100%;
}

:deep(.v-select__selections) {
  max-width: 100%;
}

@media screen and (orientation: landscape) {
  .modus-erfassen {
    padding-top: 0;
  }

  .input-container {
    margin-top: 0; /* Entfernt den negativen Margin */
    transform: scale(0.9); /* Verkleinert die Komponente leicht */
    transform-origin: top center;
  }

  .modus-select {
    margin-bottom: 30px; /* Noch geringerer Abstand zwischen Select und Button */
  }

  .ok-button {
    margin-top: -20px; /* Geringer Abstand über dem Button */
  }

  .info-button {
    bottom: 20px; /* Platzieren Sie den Info-Button weiter oben im Landscape-Modus */
  }
}
</style>

