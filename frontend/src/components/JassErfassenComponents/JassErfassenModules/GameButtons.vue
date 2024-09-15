<template>
  <div class="game-buttons">
    <button @click="emitResetGame">Spiel löschen</button>
    <button @click="emitNewGame">Neues Spiel</button>
  </div>
</template>

<script>
export default {
  methods: {
    emitNewGame() {
      this.$emit("newGame");
    },
    emitResetGame() {
      this.$emit("resetGame");
    },
  },
};
</script>

<style scoped>
.game-buttons {
  display: flex;
  justify-content: space-around;
  margin-bottom: 10px;
}
</style>
