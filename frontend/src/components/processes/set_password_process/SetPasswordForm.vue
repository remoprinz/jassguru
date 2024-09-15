<template>
  <div>
    <h2>Passwort festlegen für {{ nickname }}</h2>
    
    <div>
      <label for="password">Passwort:</label>
      <input type="password" id="password" v-model="password" />
    </div>
    
    <div>
      <label for="passwordConfirmation">Passwort bestätigen:</label>
      <input type="password" id="passwordConfirmation" v-model="passwordConfirmation" />
    </div>

    <button @click="onSubmit">Registrieren</button>
  </div>
</template>

<script>
export default {
  props: ['nickname'],
  data() {
    return {
      password: '',
      passwordConfirmation: ''
    };
  },
  methods: {
    onSubmit() {
      if (!this.password || !this.passwordConfirmation) {
        alert('Bitte füllen Sie beide Felder aus.');
        return;
      }
      
      if (this.password !== this.passwordConfirmation) {
        alert('Die Passwörter stimmen nicht überein.');
        return;
      }

      const token = new URLSearchParams(window.location.search).get('token');
      if (!token) {
        alert('Token fehlt in der URL. Bitte überprüfen Sie den Link aus Ihrer E-Mail.');
        return;
      }

      this.$emit('register', token, this.password, this.passwordConfirmation);
    }
  }
}
</script>
