<template>
  <div class="myforms-container">
    <v-form ref="form" v-model="valid" @submit.prevent="submit" class="form-input">
      <v-text-field
        v-for="field in schema"
        :key="field.model"
        :label="field.label"
        :required="field.required"
        v-model="model[field.model]"
        :rules="field.rules"
        class="text-field"
      ></v-text-field>
      <MyOkButton :loading="loading" :disabled="!valid" @click="senden">SENDEN</MyOkButton>
    </v-form>
  </div>
</template>



<script>
import OkButton from '@/components/common/OkButton.vue';

export default {
  name: 'MyForm',
  components: {
    MyOkButton
  },
  props: {
    schema: { type: Array, required: true },
  },
  data() {
    return {
      model: {},
      valid: false,
      loading: false,
    };
  },
  methods: {
    async submit() {
      if (this.$refs.form.validate()) {
        this.loading = true;
        try {
          await this.$emit("submit", this.model);
        } catch (error) {
          // Behandeln Sie den Fehler hier. Sie könnten z.B. eine Snackbar anzeigen
        } finally {
          this.loading = false;
        }
      }
    },
  },
};
</script>

<style scoped>
.myforms-container {
  background-color: transparent;
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center; 
  align-items: center;
}

.form-input {
  width: 500%; 
}

.text-field {
  height: 27%;
  margin-bottom: 8%; 
}

@media screen and (orientation: portrait) {
  .form-input {
    width: 220%; 
  }
}

@media screen and (orientation: landscape) {
  .form-input {
    width: 300%; 
  }
}
</style>
