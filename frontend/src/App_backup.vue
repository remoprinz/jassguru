<template>
  <v-app>
    <AppBar 
      :drawer="drawer" 
      @update:drawer="drawer = $event" 
      :profileDialog="profileDialog" 
      @update:profileDialog="profileDialog = $event" 
    />
    <NavigationDrawer v-model="drawer" />
    <v-main>
      <router-view/>
    </v-main>
    <LoginDialog 
      v-model="profileDialog"
    />
  </v-app>
</template>

<script>
import { ref } from 'vue'
import AppBar from './components/layout/AppBar.vue'
import LoginDialog from './components/layout/LoginDialog.vue'
import NavigationDrawer from './components/layout/NavigationDrawer.vue'

export default {
  name: 'App',
  components: {
    AppBar,
    LoginDialog,
    NavigationDrawer
  },
  setup() {
    const drawer = ref(false)
    const profileDialog = ref(false)

    return {
      drawer,
      profileDialog
    }
  }
}
</script>
