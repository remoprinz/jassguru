<template>
  <div>
    <v-app-bar app :dense="denseAppBar" color="primary" dark>
      <v-app-bar-nav-icon @click.stop="toggleDrawer"></v-app-bar-nav-icon>
      <v-toolbar-title>{{ pageTitle }}</v-toolbar-title>
      <v-spacer></v-spacer>
      <v-btn icon class="mr-4" @click.stop="goToLogin">
        <v-icon>mdi-account-circle</v-icon>
      </v-btn>
    </v-app-bar>
    <NavigationError />
  </div>
</template>

<script>
import { useRouter } from 'vue-router';
import NavigationError from './NavigationError.vue'; // Vergewissern Sie sich, dass der Pfad korrekt ist

export default {
  name: 'AppBar',
  props: {
    denseAppBar: Boolean,
    pageTitle: String,
  },
  components: {
    NavigationError,
  },
  setup(_, { emit }) {
    const router = useRouter();
    
    const toggleDrawer = () => emit('update:drawer');
    
    const goToLogin = () => {
      router.push({ name: 'login' }); // 'login' entspricht dem Routennamen Ihrer Login-Seite
    };

    return {
      toggleDrawer,
      goToLogin
    };
  },
};
</script>