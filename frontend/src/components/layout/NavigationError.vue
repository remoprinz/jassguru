<!-- src/components/layout/NavigationError.vue -->
<template>
  <div v-if="error" class="error-notification">
    <p>Navigation error: {{ error.message }}</p>
  </div>
</template>

<script>
import { mapState } from 'vuex';

export default {
  computed: {
    ...mapState('navigation', ['navigationError']),
  },
  data() {
    return {
      error: null,
    };
  },
  watch: {
    navigationError(newValue) {
      this.error = newValue;
    },
  },
};
</script>

<style scoped>
.error-notification {
  color: red;
  border: 1px solid red;
  padding: 10px;
}
</style>
