<template>
  <v-app>
    <!-- AppBar mit dem Page Title und einem Toggle für die Navigation Drawer -->
    <AppBar 
      :denseAppBar="denseAppBar" 
      @update:drawer="toggleDrawer" 
      :pageTitle="pageTitle"
    />
    <!-- Navigation Drawer zum Navigieren -->
    <NavigationDrawer v-model="drawer" />
    <!-- Hauptbereich der App mit Router-View -->
    <v-main>
      <router-view/>
    </v-main>
    <!-- Snackbar-Komponente zum Anzeigen von Benachrichtigungen -->
    <MySnackbar />
  </v-app>
</template>

<script>
import { ref, watch } from 'vue'; // Importiere ref und watch aus Vue
import { useStore } from 'vuex'; // Verwende Vuex Store
import AppBar from './components/layout/AppBar.vue'; // Importiere AppBar Komponente
import NavigationDrawer from './components/layout/NavigationDrawer.vue'; // Importiere NavigationDrawer Komponente
import MySnackbar from './components/common/MySnackbar.vue'; // Importiere MySnackbar Komponente

export default {
  name: 'App',
  components: {
    AppBar, // Registriere die AppBar Komponente
    NavigationDrawer, // Registriere die NavigationDrawer Komponente
    MySnackbar, // Registriere die MySnackbar Komponente
  },
  setup() {
    const drawer = ref(false); // State für den Drawer (Navigation Drawer)
    const denseAppBar = ref(true); // State für die dichte Darstellung der AppBar
    const pageTitle = ref('jassguru.ch'); // State für den Seitentitel
    const store = useStore(); // Zugriff auf den Vuex Store

    // Watcher für den Snackbar-Zustand im Vuex Store
    watch(
      () => store.state.snackbar.snackbars, // Beobachte Änderungen im Snackbar-Zustand
      (newSnackbars) => {
        console.log('Snackbars updated:', newSnackbars); // Logge die neuen Snackbars, wenn sich etwas ändert
      },
      { deep: true } // Nutze deep, um Änderungen auch innerhalb der Objekte zu verfolgen
    );

    // Funktion zum Umschalten des Drawers (öffnen/schließen)
    const toggleDrawer = () => {
      drawer.value = !drawer.value; // Invertiere den Drawer-Wert
    };

    return {
      drawer, // Gib den Drawer-Zustand zurück
      denseAppBar, // Gib den dichten AppBar-Zustand zurück
      pageTitle, // Gib den Seitentitel zurück
      toggleDrawer, // Gib die Toggle-Funktion für den Drawer zurück
    };
  },
};
</script>
