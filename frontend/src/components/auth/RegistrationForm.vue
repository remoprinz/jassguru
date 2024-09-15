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
      <v-text-field
        v-model="passwordConfirmation"
        :rules="passwordConfirmationRules"
        label="Passwort bestätigen"
        type="password"
        required
        class="text-field"
      ></v-text-field>
      <OkButton :loading="isLoading" :disabled="!valid" @click="submit" class="submit-button">
        Jetzt registrieren
      </OkButton>
    </v-form>
  </div>
</template>

<script>
import OkButton from '@/components/common/OkButton.vue';

export default {
  name: 'RegistrationForm',
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
      passwordConfirmation: '',
      emailRules: [
        v => !!v || 'E-Mail ist erforderlich',
        v => /.+@.+\..+/.test(v) || 'E-Mail muss gültig sein'
      ],
      passwordRules: [
        v => !!v || 'Passwort ist erforderlich',
        v => v.length >= 8 || 'Passwort muss mindestens 8 Zeichen lang sein'
      ],
      passwordConfirmationRules: [
        v => !!v || 'Passwortbestätigung ist erforderlich',
        v => v === this.password || 'Passwörter stimmen nicht überein'
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
  --top-padding-portrait: 0%;
  --top-padding-landscape:0%;
  background-color: transparent;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
  height: 50dvh;
}

.text-field, .submit-button {
  width: 100%;
  max-width: 450px;
  margin: 0 auto;
  margin-bottom: 16px;
}

@media screen and (orientation: portrait) {
  .myforms-container {
    padding-top: var(--top-padding-portrait);
  }
  .form-input {
    width: 120%;
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