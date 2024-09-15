<template>
  <div class="rosen10-player">
    <v-progress-circular v-if="isLoading" indeterminate color="primary" class="loader"></v-progress-circular>
    <template v-else>
      <v-select
        v-model="selectedRosen10Player"
        :items="playerOptions"
        item-title="nickname"
        item-value="id"
        label="Wer darf zuerst ansagen?"
        @change="handlePlayerSelection"
        class="player-select"
      ></v-select>
      <OkButton
        :disabled="!selectedRosen10Player"
        @click="confirmRosen10Player"
        class="ok-button"
      >
        Bestätigen
      </OkButton>
      <v-btn @click="confirmRosen10Player" :disabled="!selectedRosen10Player">
        Bestätigen und fortfahren
      </v-btn>
    </template>
  </div>
</template>

<script>
import { mapState, mapGetters } from 'vuex';
import { logInfo, logDebug, logError, logWarning } from '@/utils/logger';
import { JASS_ERFASSEN_MESSAGES } from '@/constants/jassErfassenMessages';
import OkButton from '@/components/common/OkButton.vue';
import { mapActions } from 'vuex';

export default {
  name: 'Rosen10Player',
  components: {
    OkButton
  },
  data() {
    return {
      selectedRosen10Player: null,
      isLoading: true,
    };
  },
  computed: {
    ...mapGetters('jassErfassen', ['getSelectedPlayers']),
    ...mapState('jassErfassen', ['selectedPlayers']),
    playerOptions() {
      logDebug('Rosen10Player: Computing playerOptions');
      return this.selectedPlayers.map(player => ({
        title: player.nickname,
        value: player.id,
        ...player
      }));
    },
  },
  methods: {
    ...mapActions('jassErfassen', ['setRosen10Player', 'nextStep']),
    ...mapActions('snackbar', ['showSnackbar']),

    handlePlayerSelection(playerId) {
      logDebug('handlePlayerSelection called with playerId:', playerId);
      const player = this.getSelectedPlayers.find(p => p.id === playerId);
      if (player) {
        logDebug('Selected Rosen10 player:', player);
        this.selectedRosen10Player = player;
      } else {
        logError('handlePlayerSelection', 'Player not found for id:', playerId);
      }
    },

    async confirmRosen10Player() {
      logDebug('Confirming Rosen10 player selection:', this.selectedRosen10Player);
      if (this.selectedRosen10Player) {
        try {
          await this.setRosen10Player(this.selectedRosen10Player);
          logInfo('Rosen10Player', 'Rosen10 player successfully set', this.selectedRosen10Player);
          this.showSnackbar({
            message: JASS_ERFASSEN_MESSAGES.ROSEN10_SELECT.SELECTED.replace('{playerName}', this.selectedRosen10Player.nickname),
            color: 'success'
          });
          this.nextStep();
        } catch (error) {
          logError('Rosen10Player', 'Error confirming Rosen10 player', error);
          this.showSnackbar({
            message: JASS_ERFASSEN_MESSAGES.ROSEN10_SELECT.ERROR,
            color: 'error'
          });
        }
      } else {
        logError('Rosen10Player', 'No Rosen10 player selected');
        this.showSnackbar({
          message: JASS_ERFASSEN_MESSAGES.ROSEN10_SELECT.INVALID,
          color: 'warning'
        });
      }
    },

    checkPlayersLoaded() {
      logDebug('Rosen10Player: Checking players loaded');
      logDebug('selectedPlayers:', this.selectedPlayers);
      logDebug('getSelectedPlayers:', this.getSelectedPlayers);
      if (this.getSelectedPlayers.length > 0) {
        this.isLoading = false;
        logInfo('Rosen10Player', 'Players loaded', this.getSelectedPlayers);
      } else {
        this.isLoading = true;
        logWarning('Rosen10Player: Keine Spieler geladen. Dies könnte ein Problem sein.');
      }
    }
  },
  created() {
    logInfo('Rosen10Player', 'Component created, selectedPlayers:', this.selectedPlayers);
    this.checkPlayersLoaded();
  },
  watch: {
    getSelectedPlayers: {
      immediate: true,
      handler() {
        this.checkPlayersLoaded();
      }
    }
  }
};
</script>

<style scoped>
.rosen10-player {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 300px;
  margin: 0 auto;
}

.player-select,
.ok-button {
  width: 100%;
  margin-bottom: 16px;
}

.loader {
  margin-top: 50px;
}
</style>