<template>
  <div class="jass-erfassen-uebersicht">
    <h2>Übersicht</h2>
    <p><strong>Datum:</strong> {{ currentDate }}</p>
    <p><strong>Modus:</strong> {{ selectedMode }}</p>
    <p><strong>Gruppe:</strong> {{ selectedGroup.name }}</p>
    <h3>Team 1</h3>
    <ul>
      <li v-for="player in team1Players" :key="player.id">
        {{ player.nickname }} {{ isRosen10Player(player) ? '(Rosen 10)' : '' }}
      </li>
    </ul>
    <h3>Team 2</h3>
    <ul>
      <li v-for="player in team2Players" :key="player.id">
        {{ player.nickname }} {{ isRosen10Player(player) ? '(Rosen 10)' : '' }}
      </li>
    </ul>
    <OkButton @click="confirmAndProceed">Bestätigen</OkButton>
  </div>
</template>

<script>
import { mapState, mapActions, mapGetters } from 'vuex';
import OkButton from '@/components/common/OkButton.vue';
import { logInfo, logError } from '@/utils/logger';
import { JASS_ERFASSEN_MESSAGES } from '@/constants/jassErfassenMessages';

export default {
  name: 'JassErfassenUebersicht',
  components: { OkButton },
  computed: {
    ...mapState('jassErfassen', ['selectedMode', 'selectedGroup', 'rosen10Player']),
    ...mapGetters('jassErfassen', ['getSelectedPlayersArray']),
    currentDate() {
      return new Date().toLocaleDateString();
    },
    team1Players() {
      return this.getSelectedPlayersArray.slice(0, 2);
    },
    team2Players() {
      return this.getSelectedPlayersArray.slice(2, 4);
    }
  },
  methods: {
    ...mapActions('jassErfassen', ['nextStep']),
    ...mapActions('snackbar', ['showSnackbar']),
    confirmAndProceed() {
      logInfo('JassErfassenUebersicht', 'Bestätigung der Übersicht');
      try {
        // Hier könnte eine API-Anfrage zum Speichern der Daten erfolgen
        this.showSnackbar({
          message: JASS_ERFASSEN_MESSAGES.OVERVIEW.CONFIRMED,
          color: 'success'
        });
        this.nextStep();
      } catch (error) {
        logError('JassErfassenUebersicht', 'Fehler bei der Bestätigung', error);
        this.showSnackbar({
          message: JASS_ERFASSEN_MESSAGES.OVERVIEW.ERROR,
          color: 'error'
        });
      }
    },
    isRosen10Player(player) {
      return this.rosen10Player && player.id === this.rosen10Player.id;
    }
  }
};
</script>

<style scoped>
.jass-erfassen-uebersicht {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}
</style>