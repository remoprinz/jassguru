<template>
  <div class="jass-qr-code">
    <h2>Jass erfolgreich erstellt</h2>
    <p>Mitspieler scannen den QR-Code, um dem Jass beizutreten:</p>
    <div class="qr-code-container">
      <qrcode-vue :value="jassCodeUrl" :size="200" level="H" render-as="svg"></qrcode-vue>
    </div>
    <p>Oder geben Sie folgenden Code ein:</p>
    <div class="jass-code">{{ jassCode }}</div>
    <OkButton @click="startJass" class="mt-4">JASS STARTEN</OkButton>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useStore } from 'vuex';
import { useRoute, useRouter } from 'vue-router';
import { logInfo, logError } from '@/utils/logger';
import QrcodeVue from 'qrcode.vue';
import OkButton from '@/components/common/OkButton.vue';

const store = useStore();
const route = useRoute();
const router = useRouter();
const jassCode = ref('');
const jassCodeUrl = computed(() => `${window.location.origin}/jass/${jassCode.value}`);

const handleError = (error) => {
  logError('JassQRCode', 'Fehler in der JassQRCode-Komponente', error);
  store.dispatch('snackbar/showSnackbar', {
    message: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.',
    color: 'error'
  });
  router.push({ name: 'jasserfassen' });
};

const startJass = () => {
  logInfo('JassQRCode', 'Jass starten wurde geklickt');
  // Implementieren Sie hier die Logik zum Starten des Jass
  // router.push({ name: 'JassSpiel', params: { jassCode: jassCode.value } });
};

onMounted(async () => {
  try {
    jassCode.value = route.params.jassCode;
    
    if (!jassCode.value) {
      throw new Error('Kein Jass-Code verfügbar');
    }
    
    logInfo('JassQRCode', 'QR-Code-Seite geladen', { jassCode: jassCode.value });
  } catch (error) {
    handleError(error);
  }
});
</script>

<style scoped>
.jass-qr-code {
  text-align: center;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  min-height: 80vh;
}

.qr-code-container {
  margin: 20px 0;
}

.jass-code {
  font-size: 24px;
  font-weight: bold;
  margin-top: 10px;
}

.mt-4 {
  margin-top: auto;
  padding: 12px 24px;
  font-size: 18px;
}
</style>