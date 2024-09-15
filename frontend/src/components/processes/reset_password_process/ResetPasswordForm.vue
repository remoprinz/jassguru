<template>
  <div class="myforms-container">
    <v-form ref="form" v-model="valid" @submit.prevent="onSubmit" class="form-input">
      <v-text-field 
        label="Email" 
        type="email" 
        required 
        v-model="email" 
        :rules="emailRules" 
        class="text-field">
      </v-text-field>
      <OkButton :loading="loading" :disabled="!valid" @click="onSubmit">Email bestätigen</OkButton>
    </v-form>
  </div>
</template>

<script>
import OkButton from '@/components/common/OkButton.vue';

export default {
  components: {
    OkButton,
  },
  data() {
    return {
      email: '',
      valid: false,
      loading: false,
      emailRules: [
        v => !!v || 'E-Mail ist erforderlich',
        v => /.+@.+/.test(v) || 'Ungültiges E-Mail-Format',
      ],
    };
  },
  methods: {
    async onSubmit() {
      if (this.$refs.form.validate()) {
        this.loading = true;
        try {
          await this.$emit('resetPassword', this.email);
        } catch (error) {
          this.$emit('handleError', error);
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
  --top-padding-portrait: 50%;
  --top-padding-landscape: -20%;
  background-color: transparent;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
  height: 50dvh;
}

.text-field, .forgot-password {
  margin-bottom: 5%;
  width: 100%;
}

@media screen and (orientation: portrait) {
  .myforms-container {
    padding-top: var(--top-padding-portrait);
  }
  .form-input {
    width: 100%;
  }
  .text-field {
    margin-bottom: -1em;
  }
}

@media screen and (orientation: landscape) {
  .myforms-container {
    padding-top: var(--top-padding-landscape);
  }
  .form-input {
    width: 150%;
  }
  .text-field {
    margin-bottom: -5%;
  }
}
</style>
