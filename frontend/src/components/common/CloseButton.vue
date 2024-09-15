<template>
  <div>
    <v-btn style="width: 50px; height: 50px;" icon color="background" @click="$emit('click')">
      <v-icon color="onBackground">mdi-close</v-icon>
    </v-btn>
  </div>
</template>

<script>
export default {
  name: 'CloseButton',
  emits: ['click'],
};
</script>

<style scoped>
</style>
