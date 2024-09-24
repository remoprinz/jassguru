<template>
  <div v-if="isDataReady" class="jass-erfassen-uebersicht">
    <h2>Übersicht</h2>
    <p><strong>Datum:</strong> {{ formatiereDatum }}</p>
    <p><strong>Ort:</strong> {{ standortInfo.ortsname || 'Wird ermittelt...' }}</p>
    <p><strong>Gruppe:</strong> {{ groupName }}</p>
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
    <OkButton @click="bestätigenUndFortfahren" :disabled="!isDataComplete">Bestätigen</OkButton>
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
    const standortInfo = ref({ ortsname: null, latitude: null, longitude: null });

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

    const holeStandort = async () => {
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          });
        });

        const { latitude, longitude } = position.coords;
        const ortsname = await holeOrtsname(latitude, longitude);
        standortInfo.value = { ortsname, latitude, longitude };
        await store.dispatch('jassErfassen/setLocation', { latitude, longitude, location_name: ortsname });
      } catch (error) {
        logError('JassErfassenUebersicht', 'Fehler bei der Standortermittlung', error);
        standortInfo.value = { ortsname: 'Standort nicht verfügbar', latitude: null, longitude: null };
        store.dispatch('snackbar/showSnackbar', {
          message: `Standortermittlung fehlgeschlagen: ${error.message}`,
          color: 'warning'
        });
      }
    };

    const holeOrtsname = async (lat, lon) => {
      try {
        logInfo('JassErfassenUebersicht', `Versuche Ortsnamen für Lat ${lat}, Lon ${lon} zu holen`);
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
        const data = await response.json();
        return data.address.city || data.address.town || data.address.village || 'Unbekannt';
      } catch (error) {
        logError('JassErfassenUebersicht', 'Fehler beim Abrufen des Ortsnamens', error);
        return 'Nicht verfügbar';
      }
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
        await holeStandort();
        istDatenGeladen.value = true;
      } catch (error) {
        logError('JassErfassenUebersicht', 'Fehler beim Laden der Daten', error);
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