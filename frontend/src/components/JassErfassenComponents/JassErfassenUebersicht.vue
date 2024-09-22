<template>
  <div v-if="istDatenValid" class="jass-erfassen-uebersicht">
    <h2>Übersicht</h2>
    <p><strong>Datum:</strong> {{ formatiereDatum }}</p>
    <p v-if="standortInfo"><strong>Ort:</strong> {{ standortInfo.ortsname }}</p>
    <p><strong>Gruppe:</strong> {{ overviewData.selectedGroup?.name || 'Nicht ausgewählt' }}</p>
    <h3>Team 1</h3>
    <ul>
      <li v-for="player in overviewData.team1Players" :key="player.id">
        {{ player.nickname }} {{ istRosen10Spieler(player) ? '(Rosen 10)' : '' }}
      </li>
    </ul>
    <h3>Team 2</h3>
    <ul>
      <li v-for="player in overviewData.team2Players" :key="player.id">
        {{ player.nickname }} {{ istRosen10Spieler(player) ? '(Rosen 10)' : '' }}
      </li>
    </ul>
    <OkButton @click="bestätigenUndFortfahren" :disabled="istLadend || !standortInfo">
      {{ istLadend ? 'Wird erstellt...' : 'Bestätigen' }}
    </OkButton>
  </div>
  <div v-else-if="istLadend" class="loading-message">
    Lade Übersichtsdaten...
  </div>
  <div v-else-if="fehler" class="error-message">
    {{ fehler }}
  </div>
  <div v-else class="error-message">
    Unvollständige Daten. Bitte versuchen Sie es erneut.
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useStore } from 'vuex';
import { useRouter } from 'vue-router';
import OkButton from '@/components/common/OkButton.vue';
import { JASS_ERFASSEN_MESSAGES } from '@/constants/jassErfassenMessages';
import { logError, logInfo } from '@/utils/logger';
import axios from 'axios';

const store = useStore();
const router = useRouter();
const istLadend = ref(false);
const standortInfo = ref(null);
const fehler = ref(null);

const overviewData = computed(() => store.getters['jassErfassen/getOverviewData']);

const istDatenValid = computed(() => {
  return overviewData.value &&
         overviewData.value.selectedMode &&
         overviewData.value.selectedGroup &&
         overviewData.value.team1Players &&
         overviewData.value.team1Players.length === 2 &&
         overviewData.value.team2Players &&
         overviewData.value.team2Players.length === 2 &&
         overviewData.value.rosen10Player &&
         standortInfo.value;
});

const formatiereDatum = computed(() => {
  const datum = overviewData.value.currentDate;
  if (!datum) return 'Kein Datum verfügbar';
  try {
    const datumObjekt = new Date(datum);
    if (isNaN(datumObjekt.getTime())) {
      throw new Error('Ungültiges Datum');
    }
    return datumObjekt.toLocaleString('de-CH', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Zurich'
    });
  } catch (error) {
    logError('JassErfassenUebersicht', 'Fehler bei der Datumsformatierung', error);
    return 'Ungültiges Datum';
  }
});

const istRosen10Spieler = (player) => {
  return overviewData.value.rosen10Player && player.id === overviewData.value.rosen10Player.id;
};

const holeStandort = async () => {
  try {
    const { latitude, longitude } = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(position.coords),
        (error) => reject(new Error(`Standortermittlung fehlgeschlagen: ${error.message}`)),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
    
    const ortsname = await holeOrtsname(latitude, longitude);
    standortInfo.value = { ortsname, latitude, longitude };
    await store.dispatch('jassErfassen/setLocation', { latitude, longitude, location_name: ortsname });
  } catch (error) {
    logError('JassErfassenUebersicht', 'Fehler bei der Standortermittlung', error);
    standortInfo.value = { ortsname: 'Standort nicht verfügbar' };
    store.dispatch('snackbar/showSnackbar', {
      message: `Standortermittlung fehlgeschlagen: ${error.message}`,
      color: 'warning'
    });
  }
};

const holeOrtsname = async (lat, lon) => {
  try {
    logInfo('JassErfassenUebersicht', `Versuche Ortsnamen für Lat ${lat}, Lon ${lon} zu holen`);
    const response = await axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
    const ortsname = response.data.address.city || response.data.address.town || response.data.address.village || 'Unbekannt';
    logInfo('JassErfassenUebersicht', `Ortsname ermittelt: ${ortsname}`);
    return ortsname;
  } catch (error) {
    logError('JassErfassenUebersicht', 'Fehler beim Abrufen des Ortsnamens', error);
    return 'Nicht verfügbar';
  }
};

const bestätigenUndFortfahren = async () => {
  if (!standortInfo.value) {
    store.dispatch('snackbar/showSnackbar', {
      message: 'Bitte warten Sie, bis der Standort ermittelt wurde.',
      color: 'warning'
    });
    return;
  }

  istLadend.value = true;
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
  } finally {
    istLadend.value = false;
  }
};

onMounted(async () => {
  istLadend.value = true;
  try {
    await store.dispatch('jassErfassen/ensureDataLoaded');
    await holeStandort();
  } catch (error) {
    logError('JassErfassenUebersicht', 'Fehler beim Laden der Daten', error);
    fehler.value = `Fehler beim Laden der Daten: ${error.message}`;
  } finally {
    istLadend.value = false;
  }
});
</script>

<style scoped>
.jass-erfassen-uebersicht {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.loading-message, .error-message {
  text-align: center;
  margin-top: 20px;
  font-weight: bold;
}

.error-message {
  color: red;
}
</style>