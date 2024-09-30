<template>
  <div v-if="isDataReady" class="jass-erfassen-uebersicht">
    <div class="input-container">
      <div class="content">
        <div class="info-row">
          <span class="label">Datum:</span>
          <span class="value">{{ formatiereDatum }}</span>
        </div>
        <div class="info-row">
          <span class="label">Ort:</span>
          <span class="value">{{ standortInfo.ortsname || 'Wird ermittelt...' }}</span>
        </div>
        <div class="info-row">
          <span class="label">Gruppe:</span>
          <span class="value">{{ groupName }}</span>
        </div>
        <div class="team-section">
          <h3 class="team-title">Team 1</h3>
          <ul>
            <li v-for="player in team1Players" :key="player.id" class="player-item">
              <span class="value">{{ player.nickname }} {{ istRosen10Spieler(player) ? '(Rosen 10)' : '' }}</span>
            </li>
          </ul>
        </div>
        <div class="team-section">
          <h3 class="team-title">Team 2</h3>
          <ul>
            <li v-for="player in team2Players" :key="player.id" class="player-item">
              <span class="value">{{ player.nickname }} {{ istRosen10Spieler(player) ? '(Rosen 10)' : '' }}</span>
            </li>
          </ul>
        </div>
      </div>
      <OkButton 
        @click="bestätigenUndFortfahren" 
        :disabled="!isDataComplete"
        class="confirm-button"
      >
        Bestätigen
      </OkButton>
    </div>
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
import { useRouter } from 'vue-router';
import OkButton from '@/components/common/OkButton.vue';
import { JASS_ERFASSEN_MESSAGES } from '@/constants/jassErfassenMessages';
import { logError, logInfo } from '@/utils/logger';

export default {
  name: 'JassErfassenUebersicht',
  components: { OkButton },
  props: {
    selectedPlayers: {
      type: Object,
      required: true
    },
    // andere Props hier definieren
  },
  setup() {
    const store = useStore();
    const router = useRouter();
    const hatFehler = ref(false);
    const fehlerMeldung = ref('');
    const istDatenGeladen = ref(false);

    // Ändern Sie dies zu einer computed property
    const standortInfo = computed(() => store.state.jassErfassen.standortInfo);

    const overviewData = computed(() => {
      const data = store.getters['jassErfassen/getOverviewData'];
      console.log('Overview Data:', data); // Debugging
      return data || {}; // Stellen Sie sicher, dass immer ein Objekt zurückgegeben wird
    });

    const formatiereDatum = computed(() => {
      const datum = overviewData.value?.currentDate;
      if (!datum) return 'Kein Datum verfügbar';
      try {
        // Da das Datum bereits im korrekten Format ist, können wir es direkt zurückgeben
        return datum;
      } catch (error) {
        logError('JassErfassenUebersicht', 'Fehler bei der Datumsformatierung', error);
        return 'Ungültiges Datum';
      }
    });

    const team1Players = computed(() => overviewData.value?.team1Players || []);
    const team2Players = computed(() => overviewData.value?.team2Players || []);

    const kannBestätigen = computed(() => {
      return istDatenGeladen.value && standortInfo.value.ortsname;
    });

    const istRosen10Spieler = (player) => {
      return overviewData.value?.rosen10Player?.id === player.id;
    };

    const bestätigenUndFortfahren = async () => {
      try {
        const result = await store.dispatch('jassErfassen/finalizeJassErfassen');
        if (result && result.jass_code) {
          logInfo('JassErfassenUebersicht', 'Weiterleitung zur JassQRCode-Seite', { jassCode: result.jass_code });
          router.push({ name: 'JassQRCode', params: { jassCode: result.jass_code } });
        } else {
          throw new Error('Keine gültige Antwort vom Server erhalten');
        }
      } catch (error) {
        logError('JassErfassenUebersicht', 'Fehler beim Finalisieren des Jass', error);
        store.dispatch('snackbar/showSnackbar', {
          message: error.message || JASS_ERFASSEN_MESSAGES.FINALIZE.ERROR,
          color: 'error'
        });
      }
    };

    const ladeDaten = async () => {
      try {
        istDatenGeladen.value = false;
        await store.dispatch('jassErfassen/ensureDataLoaded');
        // Prüfen, ob der Standort bereits vorhanden ist, falls nicht, erneut versuchen
        if (!store.state.jassErfassen.standortInfo.ortsname) {
          await store.dispatch('jassErfassen/ermittleUndSetzeStandort');
        }
        istDatenGeladen.value = true;
        console.log('Daten geladen:', store.state.jassErfassen); // Debugging
      } catch (error) {
        console.error('Fehler beim Laden der Daten:', error);
        hatFehler.value = true;
        fehlerMeldung.value = `Fehler beim Laden der Daten: ${error.message}`;
      }
    };

    const isDataReady = computed(() => {
      return overviewData.value &&
             overviewData.value.selectedGroup &&
             overviewData.value.team1Players &&
             overviewData.value.team2Players;
    });

    const groupName = computed(() => overviewData.value?.selectedGroup?.name || 'Keine Gruppe ausgewählt');

    const isDataComplete = computed(() => {
      return overviewData.value &&
             overviewData.value.selectedMode &&
             overviewData.value.selectedGroup &&
             overviewData.value.team1Players.length === 2 &&
             overviewData.value.team2Players.length === 2 &&
             overviewData.value.rosen10Player;
    });

    onMounted(() => {
      logInfo('JassErfassenUebersicht', 'Komponente wurde gemountet');
      ladeDaten();
    });

    watch(overviewData, (newValue) => {
      console.log('Overview Data updated:', newValue);
      console.log('Team 1 Players:', team1Players.value);
      console.log('Team 2 Players:', team2Players.value);
    }, { deep: true });

    return {
      overviewData,
      team1Players,
      team2Players,
      istRosen10Spieler,
      bestätigenUndFortfahren,
      hatFehler,
      fehlerMeldung,
      istDatenGeladen,
      formatiereDatum,
      standortInfo,
      kannBestätigen,
      isDataReady,
      groupName,
      isDataComplete
    };
  }
};
</script>

<style scoped>
.jass-erfassen-uebersicht {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.input-container {
  width: 180%;
  max-width: 290px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  box-sizing: border-box;
}

.content {
  width: 100%;
  margin-bottom: 20px;
  padding-left: 20px; /* Rückt den gesamten Inhalt etwas nach rechts */
}

.info-row {
  display: flex;
  margin-bottom: 8px;
}

.label {
  font-weight: bold;
  width: 70px; /* Feste Breite für alle Labels */
  flex-shrink: 0;
}

.value {
  padding-left: 0px; /* Einrückung für alle Werte */
}

.team-section {
  margin-top: 16px;
}

.team-title {
  margin-bottom: 8px;
  font-weight: bold;
}

ul {
  list-style-type: none;
  padding-left: 0;
  margin: 0;
}

.player-item {
  margin-bottom: 4px;
  padding-left: 70px; /* Gleiche Einrückung wie bei anderen Werten */
}

.confirm-button {
  width: 100%;
  margin-top: 30px;
}

.error-message {
  color: red;
  text-align: center;
  margin-top: 20px;
}

.loading-message {
  text-align: center;
  margin-top: 20px;
}

@media screen and (orientation: landscape) {
  .input-container {
    padding-top: 8px;
    transform: scale(0.9);
    transform-origin: top center;
  }

  .confirm-button {
    margin-top: 4px;
  }
}
</style>