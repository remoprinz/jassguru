<template>
    <div>
      <v-snackbar v-model="visibility" :color="color" :timeout="timeout">
        {{ message }}
        <v-btn text @click="closeSnackbar">Schließen</v-btn>
      </v-snackbar>
    </div>
  </template>
  
  <script>
  import { mapState, mapActions } from "vuex";
  
  export default {
    computed: {
      ...mapState("snackbar", ["visibility", "message", "color", "timeout"]),
    },
    methods: {
      ...mapActions("snackbar", ["hideSnackbar"]),
      closeSnackbar() {
        this.hideSnackbar();
      },
    },
    watch: {
      visibility: function (newVal) {
        console.log("MySnackbar: visibility state updated to:", newVal);
      },
      message(newVal) {
        console.log("MySnackbar: Message state updated to:", newVal);
      },
      color(newVal) {
        console.log("MySnackbar: Color state updated to:", newVal);
      },
      timeout(newVal) {
        console.log("MySnackbar: Timeout state updated to:", newVal);
      },
    },
  };
  </script>
  