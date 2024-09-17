<template>
  <div class="add-player-container">
    <JasstafelContainer :bgImage="bgImage" :isAddPlayerProcess="true" :hideImageInLandscape="true">
      <div class="content-wrapper">
        <h1 class="title display-1--text">{{ pageTitle }}</h1>
        <component 
          :is="currentComponent" 
          @submit="handleSubmit" 
          :isLoading="isLoading" 
          :nickname="nickname"
          :token="token"
        />
        <CloseButton class="dialog-close-button" @click="closeDialog" />
      </div>
    </JasstafelContainer>
    <MyAddPlayerPopup
      v-if="currentStep === 'initial' && showInstructionPopup"
      v-model:show="showInstructionPopup"
      title="Spieler hinzufügen"
    />
    <MyConfirmAddPlayerPopup
      v-if="currentStep === 'confirm' && showConfirmPopup"
      v-model:show="showConfirmPopup"
      :title="'Willkommen bei Jassguru!'"
      :nickname="nickname"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useStore } from 'vuex';
import { useRouter, useRoute } from 'vue-router';
import JasstafelContainer from '@/components/common/JasstafelContainer.vue';
import AddPlayerForm from '@/components/auth/AddPlayerForm.vue';
import ConfirmAddPlayerForm from '@/components/auth/ConfirmAddPlayerForm.vue';
import CloseButton from "@/components/common/CloseButton.vue";
import MyAddPlayerPopup from '@/components/popups/MyAddPlayerPopup.vue';
import MyConfirmAddPlayerPopup from '@/components/popups/MyConfirmAddPlayerPopup.vue';
import confetti from 'canvas-confetti';
import { logError } from '@/utils/logger';

const store = useStore();
const router = useRouter();
const route = useRoute();

const bgImage = ref(null);
const isLoading = ref(false);
const currentStep = ref('initial');
const token = ref('');
const nickname = ref('');
const showInstructionPopup = ref(true);
const showConfirmPopup = ref(true);

const isAuthenticated = computed(() => store.state.auth.isAuthenticated);

const currentComponent = computed(() => 
  currentStep.value === 'initial' ? AddPlayerForm : ConfirmAddPlayerForm
);

const pageTitle = computed(() => 
  currentStep.value === 'initial' ? 'Spieler hinzufügen' : 'Spieler bestätigen'
);

watch(isAuthenticated, (newValue) => {
  if (!newValue) {
    router.push('/login');
  }
});

onMounted(() => {
  if (!isAuthenticated.value) {
    router.push('/login');
    return;
  }
  setBgImage();
  window.addEventListener('resize', setBgImage);
  window.addEventListener('orientationchange', setBgImage);

  const routeToken = route.query.token;
  if (routeToken) {
    token.value = routeToken;
    currentStep.value = 'confirm';
    decodeToken(routeToken);
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', setBgImage);
  window.removeEventListener('orientationchange', setBgImage);
});

const setBgImage = () => {
  bgImage.value = window.innerWidth >= 1024 || window.matchMedia("(orientation: landscape)").matches
    ? require('@/assets/images/Jasstafel_gedreht.png')
    : require('@/assets/images/Jasstafel.png');
};

const closeDialog = () => {
  router.go(-1);
};

const decodeToken = async (tokenValue) => {
  try {
    const decodedData = await store.dispatch('auth/decodeAddPlayerToken', tokenValue);
    nickname.value = decodedData.nickname;
  } catch (error) {
    logError('AddPlayerPage', 'Fehler beim Dekodieren des Tokens', error);
    store.dispatch('snackbar/showSnackbar', {
      message: 'Ungültiger oder abgelaufener Token',
      color: 'error'
    });
    router.push('/');
  }
};

const handleSubmit = async (formData) => {
  isLoading.value = true;
  try {
    if (currentStep.value === 'initial') {
      await handleInitialSubmit(formData);
    } else {
      await handleConfirmSubmit(formData);
    }
  } catch (error) {
    logError('AddPlayerPage', 'Fehler beim Hinzufügen des Spielers', error);
    store.dispatch('snackbar/showSnackbar', {
      message: error.message || 'Ein Fehler ist aufgetreten',
      color: 'error'
    });
  } finally {
    isLoading.value = false;
  }
};

const handleInitialSubmit = async (formData) => {
  const response = await store.dispatch('auth/initiateAddPlayer', formData);
  nickname.value = formData.nickname;
  store.dispatch('snackbar/showSnackbar', {
    message: response.message,
    color: 'success'
  });
  triggerConfetti();

  if (route.query.returnTo === 'jass_erfassen') {
    await addNewPlayerToJassErfassen(response.playerId);
  }
};

const handleConfirmSubmit = async (formData) => {
  const response = await store.dispatch('auth/confirmAddPlayer', { 
    password: formData.password,
    token: token.value,
    nickname: nickname.value
  });
  store.dispatch('snackbar/showSnackbar', {
    message: response.message,
    color: 'success'
  });
  triggerConfetti();

  if (route.query.returnTo === 'jass_erfassen') {
    router.push({
      path: '/jass_erfassen',
      query: { 
        step: 'spieler_erfassen',
        newPlayer: nickname.value,
        groupId: route.query.groupId
      }
    });
  } else {
    setTimeout(() => {
      router.push('/');
    }, 2000);
  }
};

const addNewPlayerToJassErfassen = async (playerId) => {
  const newPlayer = {
    id: playerId,
    nickname: nickname.value
  };
  await store.dispatch('jassErfassen/addNewPlayerAndSelect', newPlayer);
  router.push('/jass_erfassen');
};

const triggerConfetti = () => {
  confetti({
    particleCount: 150,
    spread: 70,
    origin: { y: 0.6 }
  });
};
</script>

<style scoped>
.add-player-container {
  background-color: #388E3C;
  display: flex;
  flex-direction: column;
}

.content-wrapper {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  flex-grow: 1;
}

.title {
  position: relative;
  font-size: 5vw;
}

.dialog-close-button {
  position: absolute;
  right: 35px;
}

@media screen and (orientation: portrait) {
  .add-player-container {
    min-height: 100vh;
    padding-top: 35%;
  }
  .title {
    top: -10%;
    font-size: 8vw;
  }
  .dialog-close-button {
    right: 30px;
    bottom: -15%;
  }
}

@media screen and (orientation: landscape) {
  .add-player-container {
    min-height: 130vh;
    padding-top: 0;
  }
  .title {
    top: -5%;
    font-size: 3vw;
  }
  .dialog-close-button {
    right: 40px;
    bottom: -65%;
  }
}
</style>
