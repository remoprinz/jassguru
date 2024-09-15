<template>
  <v-bottom-navigation fixed color="secondary" app>
    <v-btn to="/news">
      <span>News</span>
      <v-icon :size="iconSize">mdi-newspaper</v-icon>
    </v-btn>
    <v-btn to="/stats">
      <span>Statistiken</span>
      <v-icon :size="iconSize">mdi-chart-bar</v-icon>
    </v-btn>
    <v-btn to="/jassgott">
      <span>Jassgott</span>
      <v-icon :size="iconSize">mdi-account-circle</v-icon>
    </v-btn>
    <v-btn to="/settings">
      <span>Einstellungen</span>
      <v-icon :size="iconSize">mdi-cog</v-icon>
    </v-btn>
  </v-bottom-navigation>
</template>

<script>
import { onMounted, onUnmounted, ref } from 'vue';

export default {
  name: "Footer",
  setup() {
    const iconSize = ref(24);

    const updateIconSize = () => {
      if (window.innerWidth <= 600) {
        iconSize.value = 18;
      } else {
        iconSize.value = 32;
      }
    };

    onMounted(() => {
      window.addEventListener('resize', updateIconSize);
      updateIconSize();
    });

    onUnmounted(() => {
      window.removeEventListener('resize', updateIconSize);
    });

    return { iconSize };
  },
};
</script>
