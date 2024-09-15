<!-- Snackbar.vue -->

<template>
    <v-snackbar
      v-model="visible"
      :color="color"
      :timeout="5000"
      :top="true"
      :multi-line="true"
    >
      {{ message }}
      <v-btn color="white" text @click="visible = false">Schließen</v-btn>
    </v-snackbar>
  </template>
  
  <script>
  export default {
    props: {
      visible: {
        type: Boolean,
        default: false,
      },
      color: {
        type: String,
        default: "info",
      },
      message: {
        type: String,
        default: "",
      },
    },
    watch: {
      visible(val) {
        this.$emit("input", val);
      },
    },
  };
  </script>
  
  <style scoped>
  /* Fügen Sie hier gegebenenfalls CSS-Stile hinzu */
  </style>
  