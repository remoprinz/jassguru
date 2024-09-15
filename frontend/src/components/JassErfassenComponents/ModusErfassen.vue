<template>
  <div class="modus-erfassen">
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
import { logInfo } from '@/utils/logger';
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
    ...mapActions('jassErfassen', ['setMode', 'nextStep']),
    ...mapActions('snackbar', ['clearSnackbars', 'showSnackbar']),

    handleModusSelection(modus) {
      logInfo('ModusErfassen', `Modus selected: ${modus}`);
      this.selectedModus = modus;
    },

    async confirmModus() {
      if (this.selectedModus) {
        logInfo('ModusErfassen', `Confirming modus: ${this.selectedModus}`);
        try {
          await this.setMode(this.selectedModus);
          await this.clearSnackbars();
          this.showSnackbar({
            message: JASS_ERFASSEN_MESSAGES.MODUS_ERFASSEN.SELECTED.replace('{mode}', this.selectedModus),
            color: 'success'
          });
          this.nextStep();
        } catch (error) {
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
  }
};
</script>

<style scoped>
.modus-erfassen {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 300px; /* Verringerte Breite */
  margin: 0 auto;
}

.modus-select, .ok-button {
  width: 100%;
  margin-bottom: 16px;
}

.info-button {
  margin-top: 10px;
}
</style>
