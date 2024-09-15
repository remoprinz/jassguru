<template>
  <v-dialog v-model="dialog" max-width="500px">
    <v-card>
      <v-card-title>Spieler suchen</v-card-title>
      <v-card-text>
        <v-text-field
          v-model="searchTerm"
          label="Suchbegriff eingeben"
          @keyup.enter="search"
        ></v-text-field>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="blue darken-1" text @click="close">Abbrechen</v-btn>
        <v-btn color="blue darken-1" text @click="search">Suchen</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import mitt from 'mitt';

const emitter = mitt();

export default {
  name: 'SearchDialog',
  data() {
    return {
      dialog: false,
      searchTerm: '',
    };
  },
  methods: {
    open() {
      this.dialog = true;
      this.searchTerm = '';
      return new Promise((resolve) => {
        emitter.on('search', resolve);
      });
    },
    close() {
      this.dialog = false;
      emitter.emit('search', null);
    },
    search() {
      this.dialog = false;
      emitter.emit('search', this.searchTerm);
    },
  },
};
</script>
