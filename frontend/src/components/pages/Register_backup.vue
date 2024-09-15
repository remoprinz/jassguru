<!-- components/register.vue -->
<template>
  <v-container fluid>
    <v-row align="center" justify="center">
      <v-col cols="10" sm="10" md="10">
        <v-card>
          <v-toolbar color="primary" dark>
            <v-toolbar-title>Registrierung</v-toolbar-title>
          </v-toolbar>
          <v-card-text>
            <MyForm :schema="formSchema" :submitLabel="'Registrieren'" @submit="validateAndRegister"></MyForm>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
import { ref } from 'vue';
import MyForm from '@/components/common/MyForm.vue';
import apiService from '@/api/apiServices';

export default {
  components: {
    MyForm,
  },
  setup() {
    const formSchema = [
      { 
        model: 'name', 
        label: 'Jassname (z.B. Jassruedi86)', 
        required: true,
        rules: [(v) => !!v || 'Name ist erforderlich'],
      },
      { 
        model: 'email', 
        label: 'E-Mail', 
        required: true,
        rules: [(v) => /.+@.+\..+/.test(v) || 'E-Mail muss gültig sein'],
      },
      { 
        model: 'password', 
        label: 'Passwort', 
        required: true, 
        type: 'password',
        rules: [
          (v) => !!v || 'Passwort ist erforderlich',
          (v) => (v && v.length >= 8) || 'Passwort muss mindestens 8 Zeichen lang sein',
        ],
      },
      { 
        model: 'confirmPassword', 
        label: 'Passwort bestätigen', 
        required: true, 
        type: 'password',
        rules: [
          (v) => !!v || 'Bestätigung des Passworts ist erforderlich',
          (v, model) => v === model.password || 'Die Passwörter stimmen nicht überein',
        ],
      },
    ];

    const validateAndRegister = async (model) => {
      if (model.password === model.confirmPassword) {
        try {
          const response = await apiService.post('/players', {
            nickname: model.name,
            email: model.email,
            password: model.password
          });
          console.log('User account created: ', response.data);
        } catch (error) {
          console.error('Error signing up: ', error);
        }
      } else {
        console.error('Die Passwörter stimmen nicht überein');
      }
    };

    return {
      formSchema,
      validateAndRegister,
    };
  },
};
</script>

<style scoped>
@import '@/components/common/MyFormStyle.vue';
</style>
