<template>
  <div class="jass-qr-code">
    <h2>Jass erfolgreich erstellt</h2>
    <p>Scannen Sie den QR-Code, um das Spiel zu starten:</p>
    <div class="qr-code-container">
      <qrcode-vue :value="gameCodeUrl" :size="200" level="H"></qrcode-vue>
    </div>
    <p>Oder geben Sie folgenden Code ein:</p>
    <div class="game-code">{{ gameCode }}</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useStore } from 'vuex';
import { useRoute, useRouter } from 'vue-router';
import { logInfo, logError } from '@/utils/logger';
import QrcodeVue from 'qrcode.vue';

const store = useStore();
const route = useRoute();
const router = useRouter();
const gameCode = ref('');
const gameCodeUrl = computed(() => `${window.location.origin}/game/${gameCode.value}`);

onMounted(async () => {
  try {
    gameCode.value = route.params.gameCode;
    
    if (!gameCode.value) {
      throw new Error('Kein Game-Code verfügbar');
    }
    
    // Überprüfe, ob das Spiel bereits initialisiert wurde
    const isInitialized = await store.dispatch('gameCapture/checkGameInitialized', gameCode.value);
    
    if (!isInitialized) {
      throw new Error('Spiel wurde nicht korrekt initialisiert');
    }
    
    logInfo('JassQRCode', 'QR-Code-Seite geladen', { gameCode: gameCode.value });
  } catch (error) {
    logError('JassQRCode', 'Fehler beim Laden der QR-Code-Seite', error);
    store.dispatch('snackbar/showSnackbar', {
      message: 'Fehler beim Erstellen des Spiels. Bitte versuchen Sie es erneut.',
      color: 'error'
    });
    router.push({ name: 'JassErfassen' });
  }
});
</script>

<style scoped>
.jass-qr-code {
  text-align: center;
  padding: 20px;
}

.qr-code-container {
  margin: 20px 0;
  display: flex;
  justify-content: center;
}

.game-code {
  font-size: 24px;
  font-weight: bold;
  margin-top: 10px;
}
</style>