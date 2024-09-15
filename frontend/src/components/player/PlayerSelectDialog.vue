<template>
  <v-dialog v-model="dialog" max-width="500px">
    <v-card>
      <v-card-title>Spieler auswählen</v-card-title>
      <v-card-text>
        <v-list>
          <v-list-item
            v-for="player in players"
            :key="player.id"
            @click="selectPlayer(player)"
          >
            <v-list-item-title>{{ player.nickname }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="blue darken-1" text @click="close">Abbrechen</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
export default {
  name: 'PlayerSelectionDialog',
  data() {
    return {
      dialog: false,
      players: [],
      selectedPlayer: null,
    };
  },
  methods: {
    open(players) {
      this.dialog = true;
      this.players = players;
      return new Promise((resolve) => {
        this.resolvePromise = resolve;
      });
    },
    close() {
      this.dialog = false;
      if (this.resolvePromise) {
        this.resolvePromise(null);
      }
    },
    selectPlayer(player) {
      this.dialog = false;
      if (this.resolvePromise) {
        this.resolvePromise(player);
      }
    },
  },
};
</script>