<template>
  <v-btn
    :color="color"
    rounded
    :loading="loading"
    class="my-ok-button"
    v-bind="$attrs"
    block
  >
    <slot></slot>
  </v-btn>
</template>

<script>
export default {
  inheritAttrs: false,
  props: {
    color: {
      type: String,
      default: 'success'
    },
    loading: {
      type: Boolean,
      default: false
    }
  }
}
</script>

<style scoped>
.my-ok-button {
  color: var(--v-theme-onSuccess);
  background-color: var(--v-theme-success);
  border: none;
  border-radius: 50px; 
  width: 100% !important;
}
</style>
