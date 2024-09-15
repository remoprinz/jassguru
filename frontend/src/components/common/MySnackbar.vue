<template>
  <div class="snackbar-container">
    <v-snackbar
      v-for="snackbar in loggedSnackbars"
      :key="snackbar.id"
      :color="snackbar.color"
      :timeout="snackbar.timeout === -1 ? 0 : snackbar.timeout"
      v-model="snackbar.isActive"
      @input="onSnackbarClose(snackbar.id)"
      multi-line
    >
      {{ snackbar.message }}
      <template v-slot:action="{ attrs }">
        <v-btn
          text
          v-bind="attrs"
          @click="hideSnackbar(snackbar.id)"
        >
          Close
        </v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<script>
import { mapGetters, mapActions } from 'vuex';

export default {
  name: 'MySnackbar',
  computed: {
    // Mapping der Vuex-Getters, um die aktiven Snackbars zu erhalten
    ...mapGetters('snackbar', ['activeSnackbars']),

    // Computed property, das Snackbars loggt und zurückgibt
    loggedSnackbars() {
      console.log('Active snackbars in component:', this.activeSnackbars);
      return this.activeSnackbars;
    }
  },
  methods: {
    // Mapping der Vuex-Actions, um die Snackbar zu verstecken
    ...mapActions('snackbar', ['hideSnackbar']),
    
    // Methode, um die Snackbar zu schließen
    onSnackbarClose(id) {
      this.hideSnackbar(id);
    }
  },
  mounted() {
    // Logging, um beim Mounten die aktiven Snackbars anzuzeigen
    console.log('MySnackbar mounted, activeSnackbars:', this.activeSnackbars);
  },
  updated() {
    // Logging, um bei Updates die aktiven Snackbars anzuzeigen
    console.log('MySnackbar updated, activeSnackbars:', this.activeSnackbars);
  }
};
</script>

<style scoped>
.snackbar-container {
  position: fixed;
  bottom: 20px;
  left: 0;
  right: 0;
  z-index: 9999; /* Sicherstellen, dass die Snackbar-Komponente über anderen Elementen liegt */
}
</style>
