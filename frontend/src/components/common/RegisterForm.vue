<template>
  <div class="myforms-container">
    <v-form ref="form" v-model="valid" @submit.prevent="submit" class="form-input">
      <v-text-field
        v-for="field in schema"
        :key="field.model"
        :label="field.label"
        :required="field.required"
        :type="field.type || 'text'"
        v-model="formData[field.model]"
        :rules="field.rules"
        class="text-field"
      ></v-text-field>
      <OkButton :loading="isLoading" :disabled="!valid" @click="submit">Registrieren</OkButton>
    </v-form>
  </div>
</template>

<script>
import OkButton from '@/components/common/OkButton.vue';

export default {
  name: 'RegisterForm',
  components: {
    OkButton
  },
  props: {
    schema: {
      type: Array,
      required: true
    },
    isLoading: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      valid: false,
      formData: {}
    };
  },
  methods: {
    submit() {
      if (this.$refs.form.validate()) {
        this.$emit('submit', this.formData);
      }
    }
  }
};
</script>


<style scoped>
.myforms-container {
  background-color: transparent;
  height: 50dvh;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
}

.text-field {
  margin-bottom: 1%;
}

@media screen and (orientation: portrait) {
  .form-input {
    width: 150%;
  }

  .text-field {
    margin-bottom: -1em;
  }
}

@media screen and (orientation: landscape) {
  .form-input {
    width: 300%;
  }

  .text-field {
    margin-bottom: -1%;
  }
}
</style>