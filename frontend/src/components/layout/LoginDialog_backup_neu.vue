<template>
  <div>
    <v-overlay :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
      <ProportionalContainer
        title="Login"
        :bgImage="require('@/assets/images/Jasstafel.png')"
        @close="closeDialog"
      >
        <Login @login-success="closeDialog"></Login>
        <v-btn color="green darken-1" text @click="closeDialog">Schließen</v-btn>
      </ProportionalContainer>
    </v-overlay>
  </div>
</template>

<script>
import { ref } from 'vue'
import ProportionalContainer from '../common/JasstafelContainer.vue'
import Login from "../pages/Login.vue";

export default {
  name: "LoginDialog",
  components: {
    ProportionalContainer,
    Login,
  },
  props: {
    modelValue: {
      type: Boolean,
      required: true,
    },
  },
  emits: ['update:modelValue'],
  methods: {
    closeDialog() {
      this.$emit('update:modelValue', false);
    },
  },
};
</script>

<style scoped>
/* Hier können Sie zusätzlichen CSS-Stil hinzufügen */
</style>
