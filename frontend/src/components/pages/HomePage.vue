<template>
  <div class="home-page">
    <v-container fluid>
      <v-row>
        <v-col>
          <div class="content-container">
            <v-row class="titleContainer">
              <v-col>
                <h1 class="display-1 text--on-background">{{ isAuthenticated ? 'Viel Vergnügen beim Jassen!' : 'Willkommen bei jassguru.ch' }}</h1>
              </v-col>
            </v-row>
            <v-row class="subtitleContainer">
              <v-col>
                <p class="title text--on-background">
                  {{ isAuthenticated ? 'Wer von euren Freunden hat Gurupotential? Lade sie zu jassguru.ch ein und klopft einen Jass zusammen.' : 'Jassguru.ch ist die Plattform für alle Jassfans, um Spiele, Statistiken und Jassgruppen zu verwalten. Jassgurus haben eine Mission: Das Jassen fördern.' }}
                </p>
              </v-col>
            </v-row>
            <v-row class="bodyContainer">
              <v-col>
                <p class="body-1 text--on-background">
                  {{ isAuthenticated ? 'Gutes Ablupfen allerseits.' : 'Gründet eine Jassruppe, tretet einer Liga bei oder habt einfach Spass mit den Jassprofilen.' }}
                </p>
              </v-col>
            </v-row>
            <v-row class="buttonContainer">
              <v-col>
                <!-- Removed the router-link and moved the navigation logic to the buttonAction method -->
                <C2AButton @click="buttonAction">
                  {{ isAuthenticated ? 'JASS ERFASSEN' : 'Jetzt Jassguru werden' }}
                </C2AButton>
              </v-col>
            </v-row>
          </div>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script>
import { computed } from 'vue';
import { useStore } from 'vuex';
import { useRouter } from 'vue-router';
import C2AButton from '@/components/common/C2AButton.vue';

export default {
  components: {
    C2AButton
  },
  setup() {
    const store = useStore();
    const router = useRouter();
    const isAuthenticated = computed(() => store.getters['auth/isAuthenticated']);

    const buttonAction = () => {
      const destination = isAuthenticated.value ? '/jass_erfassen' : '/register';
      router.push({ path: destination });
    };

    return {
      isAuthenticated,
      buttonAction,
    };
  },
};
</script>

<style scoped>
.home-page {
  position: relative;
  background-image: url('@/assets/images/gurupic.png'), radial-gradient(circle at center, rgba(135,206,235, 1), rgba(135,206,235, 0.5) 25%, rgba(135,206,235, 0) 90%);
  background-repeat: no-repeat;
  background-size: calc(2 / 3 * 200%);
  background-position: right bottom;
  min-height: 100vh;
  z-index: 1;
}


.content-container {
  width: 100%;
  max-width: calc(100% - 24px);
  padding: 2px;
  box-sizing: border-box;
}

.display-1, .title, .body-1 {
  text-align: left;
}

/* Hochformat */
@media (orientation: portrait) {
  .home-page {
    background-size: auto calc(2 / 3 * 90%), cover;
  }

  .display-1 {
    font-size: 1.5rem;
  }

  .title {
    font-size: 1.25rem;
  }

  .body-1 {
    font-size: 1rem;
  }
}

/* Breitformat */
@media (orientation: landscape) {
  .home-page {
    background-size: calc(2 / 3 * 75%), cover;
    background-position: right bottom, center center;
  }
  .content-container {
    max-width: calc(60% - 24px);
  }

  .display-1 {
    font-size: 2.5rem;
  }

  .title {
    font-size: 2rem;
  }

  .body-1 {
    font-size: 1.5rem;
  }
}
</style>
