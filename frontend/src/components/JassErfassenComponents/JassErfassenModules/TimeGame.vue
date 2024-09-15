<!-- TimeGame.vue -->
<template>
  <div class="time-game">
    <p>{{ currentDateTime }}</p>
  </div>
</template>

<script>
export default {
  data() {
    return {
      currentDateTime: "",
    };
  },
  methods: {
    getCurrentDateTime() {
      const now = new Date();
      const day = String(now.getDate()).padStart(2, "0");
      const month = String(now.getMonth() + 1).padStart(2, "0"); // January is 0!
      const year = now.getFullYear();
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      this.currentDateTime = `${day}.${month}.${year}, ${hours}:${minutes}`;
    },
  },
  created() {
    this.getCurrentDateTime();
  },
};
</script>

<style scoped>
/* CSS-Stile für die TimeGame-Komponente */
</style>
