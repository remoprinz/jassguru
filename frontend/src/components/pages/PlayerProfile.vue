<!-- In PlayerProfile.vue -->
<template>
  <div>
    <h1>{{ playerProfile.name }}</h1>
    <!-- Weitere Profilinformationen hier -->
    <button @click="editProfile">Profil bearbeiten</button>
  </div>
</template>

<script>
import api from '@/apiServices.js';

export default {
  data() {
    return {
      playerProfile: {},
    };
  },
  methods: {
    async fetchProfile() {
      // Rufen Sie die Spielerprofilinformationen von der API ab
      try {
        const response = await api.getPlayer(this.$route.params.player_id);
        this.playerProfile = response.data;
      } catch (error) {
        console.error('Error fetching player profile:', error);
      }
    },
    editProfile() {
      // Implementieren Sie die Logik zum Bearbeiten des Spielerprofils
    },
  },
  mounted() {
    this.fetchProfile();
  },
};
</script>

