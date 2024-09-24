<template>
  <div class="rosen10-player">
    <v-select
      v-model="localSelectedRosen10Player"
      :items="selectedPlayersArray"
      item-title="nickname"
      item-value="id"
      label="Wähle den Rosen 10 Spieler"
      return-object
      outlined
      @update:model-value="handleRosen10Selection"
    >
      <template v-slot:item="{ item, props }">
        <v-list-item v-bind="props" :title="item.raw.nickname"></v-list-item>
      </template>
    </v-select>
    <OkButton 
      :disabled="!localSelectedRosen10Player" 
      @click="confirmRosen10Player"
      class="ok-button"
    >
      Bestätigen
    </OkButton>
  </div>
</template>

<script>
import { mapState, mapActions, mapGetters } from 'vuex';
import OkButton from '@/components/common/OkButton.vue';
import { JASS_ERFASSEN_MESSAGES } from '@/constants/jassErfassenMessages';
import { logInfo, logError } from '@/utils/logger';

export default {
  name: 'Rosen10Player',
  components: { OkButton },
  data() {
    return {
      localSelectedRosen10Player: null,
    };
  },
  computed: {
    ...mapState('jassErfassen', ['selectedPlayers']),
    ...mapGetters('jassErfassen', ['getSelectedPlayersArray']),
    selectedPlayersArray() {
      return this.getSelectedPlayersArray;
    }
  },
  methods: {
    ...mapActions('jassErfassen', ['setRosen10Player', 'nextStep']),
    ...mapActions('snackbar', ['showSnackbar']),
    
    handleRosen10Selection(player) {
      logInfo('Rosen10Player', `Rosen 10 player selected: ${player.nickname}`);
      this.localSelectedRosen10Player = player;
    },
    
    async confirmRosen10Player() {
      if (this.localSelectedRosen10Player) {
        try {
          await this.setRosen10Player(this.localSelectedRosen10Player);
          this.showSnackbar({
            message: JASS_ERFASSEN_MESSAGES.ROSEN10_PLAYER.SELECTED.replace('{playerName}', this.localSelectedRosen10Player.nickname),
            color: 'success'
          });
          await this.nextStep();
          logInfo('Rosen10Player', 'Rosen 10 Spieler bestätigt und nächster Schritt aufgerufen');
        } catch (error) {
          logError('Rosen10Player', 'Fehler beim Bestätigen des Rosen 10 Spielers', error);
          this.showSnackbar({
            message: 'Fehler beim Bestätigen des Rosen 10 Spielers',
            color: 'error'
          });
        }
      }
    },
  },
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

.v-select, .ok-button {
  width: 100%;
  margin-bottom: 16px;
}
</style>