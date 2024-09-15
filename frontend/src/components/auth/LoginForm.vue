<template>
  <div class="myforms-container">
    <v-form ref="form" v-model="valid" @submit.prevent="submit" class="form-input">
      <v-text-field
        v-model="email"
        :rules="emailRules"
        label="E-Mail"
        required
        class="text-field"
      ></v-text-field>
      <v-text-field
        v-model="password"
        :rules="passwordRules"
        label="Passwort"
        type="password"
        required
        class="text-field"
      ></v-text-field>
      <OkButton :loading="isLoading" :disabled="!valid" @click="submit" class="submit-button">
        Login
      </OkButton>
    </v-form>
  </div>
</template>

<script>
import OkButton from '@/components/common/OkButton.vue';

export default {
  name: 'LoginForm',
  components: {
    OkButton
  },
  props: {
    isLoading: Boolean
  },
  data() {
    return {
      valid: false,
      email: '',
      password: '',
      emailRules: [
        v => !!v || 'E-Mail ist erforderlich',
        v => /.+@.+\..+/.test(v) || 'E-Mail muss gültig sein'
      ],
      passwordRules: [
        v => !!v || 'Passwort ist erforderlich'
      ]
    };
  },
  methods: {
    submit() {
      if (this.$refs.form.validate()) {
        this.$emit('submit', { 
          email: this.email, 
          password: this.password 
        });
      }
    }
  }
};
</script>

<style scoped>
.myforms-container {
  background-color: transparent;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 50dvh;
  width: 100%;
}

.form-input {
  width: 250%;
  max-width: 600px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.text-field {
  width: 100%;
  margin-bottom: 5px;
}

.submit-button {
  width: 100%;
  margin-bottom: 16px;
}

@media screen and (orientation: portrait) {
  .myforms-container {
    padding-top: 0%; /* Set to 0 initially */
    transform: translateY(-10%); /* Moves the form 20% downwards */
  }
}

@media screen and (orientation: landscape) {
  .myforms-container {
    padding-top: 0%;
    transform: translateY(0); /* No shift in landscape */
  }
}
</style>
