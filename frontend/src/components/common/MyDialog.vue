// components/MyDialog.vue

<template>
    <div>
      <v-dialog v-model="show">
        <v-card>
          <v-card-title>{{ title }}</v-card-title>
          <v-card-text>{{ text }}</v-card-text>
          <v-card-actions>
            <v-btn @click="close">Close</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </div>
  </template>
  
  <script>
  export default {
    props: {
      show: {
        type: Boolean,
        default: false
      },
      title: {
        type: String,
        default: ''
      },
      text: {
        type: String,
        default: ''
      }
    },
    methods: {
      close() {
        this.$emit('update:show', false);
      }
    }
  };
  </script>
  