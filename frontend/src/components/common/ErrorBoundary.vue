<template>
    <div>
      <slot v-if="!error"></slot>
      <div v-else class="error-message">
        Ein Fehler ist aufgetreten: {{ error.message }}
      </div>
    </div>
  </template>
  
  <script>
  export default {
    name: 'ErrorBoundary',
    data() {
      return { error: null }
    },
    errorCaptured(err, vm, info) {
      this.error = err;
      console.error('Gefangener Fehler:', err, info);
      return false;
    }
  }
  </script>
  
  <style scoped>
  .error-message {
    color: red;
    text-align: center;
    margin-top: 20px;
  }
  </style>