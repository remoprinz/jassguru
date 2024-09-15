<template>
  <!-- Ihr HTML-Template hier, z. B.: -->
  <div>
    <h1>Spielerliste</h1>
    <ul>
      <li v-for="player in players" :key="player.id">
        {{ player.name }}
      </li>
    </ul>
  </div>
</template>

<script>
import api from '@/apiServices.js';

export default {
  data() {
    return {
      players: [],
    };
  },
  methods: {
    async fetchPlayers() {
      try {
        const response = await api.getPlayers();
        this.players = response.data;
      } catch (error) {
        console.error('Error fetching players:', error);
      }
    },
  },
  created() {
    this.fetchPlayers();
  },
};
</script>

<style scoped>
/* Ihre CSS-Stile hier, z. B.: */
h1 {
  font-size: 2em;
  margin-bottom: 1em;
}
</style>
