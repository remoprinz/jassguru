<template>
  <div class="myforms-container">
    <v-form ref="form" v-model="valid" @submit.prevent="submit" class="form-input">
      <v-text-field
        v-model="groupName"
        :rules="groupNameRules"
        label="Gruppenname"
        required
        class="text-field"
      ></v-text-field>
      <OkButton :loading="isLoading" :disabled="!valid" @click="submit" class="submit-button">
        Gruppe registrieren
      </OkButton>
    </v-form>
  </div>
</template>

<script>
import OkButton from '@/components/common/OkButton.vue';

export default {
  name: 'GroupRegisterForm',
  components: {
    OkButton
  },
  props: {
    isLoading: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      valid: false,
      groupName: '',
      groupNameRules: [
        v => !!v || 'Gruppenname ist erforderlich',
        v => v.length >= 2 || 'Gruppenname muss mindestens 2 Zeichen lang sein',
        v => v.length <= 25 || 'Gruppenname darf maximal 25 Zeichen lang sein'
      ]
    };
  },
  methods: {
    submit() {
      if (this.$refs.form.validate()) {
        this.$emit('submit', this.groupName);
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

.text-field, .submit-button {
  width: 100%;
  max-width: 450px;
  margin: 0 auto;
  margin-bottom: 16px;
}

.form-input {
  width: 100%;
  max-width: 450px;
  margin: 0 auto;
}

@media screen and (orientation: portrait) {
  .form-input {
    width: 100%;
  }
  .text-field {
    margin-bottom: -1em;
  }
}

@media screen and (orientation: landscape) {
  .form-input {
    width: 100%;
  }
  .text-field {
    margin-bottom: -5%;
  }
}
</style>