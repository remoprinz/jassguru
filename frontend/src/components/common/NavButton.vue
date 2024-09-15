<template>
  <v-btn
    :color="color"
    rounded
    :loading="loading"
    class="my-nav-button"
    v-bind="$attrs"
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
      default: 'primary'
    },
    loading: {
      type: Boolean,
      default: false
    }
  }
}
</script>

<style scoped>
.my-nav-button {
  color: white !important; 
  background-color: var(--v-theme-primary);
  border: none;
  border-radius: 8px;
}
</style>
