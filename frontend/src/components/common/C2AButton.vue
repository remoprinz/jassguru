<template>
  <v-btn class="C2AButton" color="success" rounded>
    <slot></slot>
  </v-btn>
</template>

<script>
export default {
  name: 'C2AButton',
}
</script>

<style scoped>
.C2AButton {
  height: 48px;
  font-weight: bold;
  color: #FFFFFF !important;
  font-size: 1.25rem;
}
</style>
