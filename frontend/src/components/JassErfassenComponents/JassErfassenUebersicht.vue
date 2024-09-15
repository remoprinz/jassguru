<template>
  <div v-if="istDatenGeladen" class="jass-erfassen-uebersicht">
    <h2>Übersicht</h2>
    <p><strong>Datum:</strong> {{ overviewData.currentDate }}</p>
    <p><strong>Modus:</strong> {{ overviewData.selectedMode }}</p>
    <p><strong>Gruppe:</strong> {{ overviewData.selectedGroup.name }}</p>
    <h3>Team 1</h3>
    <ul>
      <li v-for="player in team1Players" :key="player.id">
        {{ player.nickname }} {{ istRosen10Spieler(player) ? '(Rosen 10)' : '' }}
      </li>
    </ul>
    <h3>Team 2</h3>
    <ul>
      <li v-for="player in team2Players" :key="player.id">
        {{ player.nickname }} {{ istRosen10Spieler(player) ? '(Rosen 10)' : '' }}
      </li>
    </ul>
    <OkButton @click="bestätigenUndFortfahren">Bestätigen</OkButton>
  </div>
  <div v-else-if="hatFehler" class="error-message">
    {{ fehlerMeldung }}
  </div>
  <div v-else class="loading-message">
    Lade Übersichtsdaten...
  </div>
</template>

<script>
import { ref, computed, onMounted, watch } from 'vue';
import { useStore } from 'vuex';
import OkButton from '@/components/common/OkButton.vue';
import { JASS_ERFASSEN_MESSAGES } from '@/constants/jassErfassenMessages';
import { logError, logInfo, logDebug } from '@/utils/logger';

export default {
  name: 'JassErfassenUebersicht',
  components: { OkButton },
  setup() {
    const store = useStore();
    const hatFehler = ref(false);
    const fehlerMeldung = ref('');
    const istDatenGeladen = ref(false);

    const overviewData = computed(() => store.getters['jassErfassen/getOverviewData']);

    watch(overviewData, (newValue) => {
      logDebug('JassErfassenUebersicht', 'OverviewData geändert:', newValue);
    });

    const team1Players = computed(() => 
      overviewData.value ? [overviewData.value.selectedPlayers.team1player1, overviewData.value.selectedPlayers.team1player2] : []
    );

    const team2Players = computed(() => 
      overviewData.value ? [overviewData.value.selectedPlayers.team2player1, overviewData.value.selectedPlayers.team2player2] : []
    );

    const istRosen10Spieler = (player) => {
      return overviewData.value && overviewData.value.rosen10Player && player.id === overviewData.value.rosen10Player.id;
    };

    const bestätigenUndFortfahren = async () => {
      try {
        logInfo('JassErfassenUebersicht', 'Bestätigung und Fortfahren gestartet');
        const jassData = await store.dispatch('jassErfassen/finalizeJassErfassen');
        await speichereJassDaten(jassData);
        store.dispatch('snackbar/showSnackbar', {
          message: JASS_ERFASSEN_MESSAGES.OVERVIEW.CONFIRMED,
          color: 'success'
        });
        store.dispatch('router/push', '/spielbrett');
      } catch (error) {
        logError('JassErfassenUebersicht', 'Fehler beim Bestätigen und Fortfahren', error);
        store.dispatch('snackbar/showSnackbar', {
          message: error.message || JASS_ERFASSEN_MESSAGES.OVERVIEW.ERROR,
          color: 'error'
        });
      }
    };

    const speichereJassDaten = async (jassData) => {
      try {
        await store.dispatch('jassErfassen/saveJassData', jassData);
      } catch (error) {
        logError('JassErfassenUebersicht', 'Fehler beim Speichern der Jass-Daten', error);
        throw new Error(JASS_ERFASSEN_MESSAGES.OVERVIEW.SAVE_ERROR);
      }
    };

    onMounted(() => {
      logInfo('JassErfassenUebersicht', 'Komponente wurde gemountet');
      logDebug('JassErfassenUebersicht', 'OverviewData:', overviewData.value);
      if (!overviewData.value || !overviewData.value.selectedMode) {
        hatFehler.value = true;
        fehlerMeldung.value = 'Keine Übersichtsdaten verfügbar. Bitte starten Sie den Prozess erneut.';
        logError('JassErfassenUebersicht', 'Keine oder unvollständige Übersichtsdaten verfügbar');
        store.dispatch('jassErfassen/loadOverviewData');
      } else {
        istDatenGeladen.value = true;
        logInfo('JassErfassenUebersicht', 'Daten erfolgreich geladen', overviewData.value);
      }
    });

    return {
      overviewData,
      team1Players,
      team2Players,
      istRosen10Spieler,
      bestätigenUndFortfahren,
      hatFehler,
      fehlerMeldung,
      istDatenGeladen
    };
  }
};
</script>

<style scoped>
.jass-erfassen-uebersicht {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}
.error-message {
  color: red;
  text-align: center;
  margin-top: 20px;
}
</style>