<template>
  <div class="myforms-container">
    <v-form ref="form" v-model="valid" @submit.prevent="onSubmit" class="form-input">
      <v-text-field label="Gruppenname" required v-model="groupName" class="text-field" :rules="[rules.required]"></v-text-field>
      <OkButton :loading="loading" :disabled="!valid" @click="onSubmit">Registrieren</OkButton>
    </v-form>
  </div>
</template>

<script>
import OkButton from '@/components/common/OkButton.vue';

export default {
  components: {
    OkButton
  },
  data() {
    return {
      groupName: '',
      members: '',
      valid: false,
      loading: false,
      rules: {
        required: value => !!value || 'Dieses Feld ist erforderlich.',
      }
    };
  },
  methods: {
    async onSubmit() {
      if (this.$refs.form.validate()) {
        this.loading = true;
        try {
          this.$emit('register', this.groupName, this.members);
        } catch (error) {
          console.error("Error in form submission:", error);
        } finally {
          this.loading = false;
        }
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
  margin-bottom: 5%;
  width: 100%; /* Wir setzen die Breite auf 100%, wie in LoginForm.vue */
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
    width: 200%;
  }

  .text-field {
    margin-bottom: -5%;
  }
}
</style>
