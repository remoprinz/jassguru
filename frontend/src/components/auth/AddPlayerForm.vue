<template>
  <div class="myforms-container">
    <v-form ref="form" v-model="valid" @submit.prevent="submit" class="form-input">
      <v-text-field
        v-model="nickname"
        :rules="nicknameRules"
        label="Jassname"
        required
        class="text-field"
      ></v-text-field>
      <v-text-field
        v-model="email"
        :rules="emailRules"
        label="E-Mail (optional)"
        class="text-field"
      ></v-text-field>
      <OkButton :loading="isLoading" :disabled="!valid" @click="submit" class="submit-button">
        Spieler hinzufügen
      </OkButton>
    </v-form>
  </div>
</template>

<script>
import OkButton from '@/components/common/OkButton.vue';

export default {
  name: 'AddPlayerForm',
  components: {
    OkButton
  },
  props: {
    isLoading: Boolean
  },
  data() {
    return {
      valid: false,
      nickname: '',
      email: '',
      nicknameRules: [
        v => !!v || 'Jassname ist erforderlich',
        v => (v && v.length <= 20) || 'Jassname darf nicht länger als 20 Zeichen sein'
      ],
      emailRules: [
        v => !v || /.+@.+\..+/.test(v) || 'E-Mail muss gültig sein'
      ]
    };
  },
  methods: {
    submit() {
      if (this.$refs.form.validate()) {
        this.$emit('submit', { 
          nickname: this.nickname, 
          email: this.email 
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