<template>
  <div class="jass-qr-code">
    <h2>Jass erfolgreich erstellt</h2>
    <p>Mitspieler scannen den QR-Code, um dem Jass beizutreten:</p>
    <div class="qr-code-container">
      <qrcode-vue :value="jassCodeUrl" :size="200" level="H" render-as="svg" />
    </div>
    <p>Oder geben Sie folgenden Code ein:</p>
    <div class="jass-code">{{ jassCode }}</div>
    <OkButton @click="startJass" class="mt-4">JASS STARTEN</OkButton>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStore } from 'vuex';
import QrcodeVue from 'qrcode.vue';
import OkButton from '@/components/common/OkButton.vue';

const route = useRoute();
const router = useRouter();
const store = useStore();

const jassCode = computed(() => route.params.jassCode);
const jassCodeUrl = computed(() => `${window.location.origin}/join-jass/${jassCode.value}`);

const startJass = async () => {
  try {
    // Hier die Logik zum Starten des Jass implementieren
    await store.dispatch('jass/startJass', jassCode.value);
    await router.push({ name: 'JassSpiel', params: { jassCode: jassCode.value } });
  } catch (error) {
    console.error('Fehler beim Starten des Jass:', error);
    store.dispatch('snackbar/showSnackbar', {
      message: 'Fehler beim Starten des Jass. Bitte versuchen Sie es erneut.',
      color: 'error'
    }, { root: true });
  }
};
</script>

<style scoped>
.jass-qr-code {
  text-align: center;
  padding: 20px;
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
  margin-top: 1rem;
}
</style>