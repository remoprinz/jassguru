<template>
  <v-navigation-drawer v-model="drawer" :width="drawerWidth" app>
    <v-list dense>
      <v-list-item 
        v-for="item in visibleItems" 
        :key="item.title" 
        class="drawer-item" 
        @click="navigateTo(item)"
        :class="{ 'hovered': activeItem === item.title }"
        @mouseover="activeItem = item.title"
        @mouseout="activeItem = null"
      >
        <div>
          <v-list-item-title>{{ item.title }}</v-list-item-title>
        </div>
      </v-list-item>
    </v-list>
  </v-navigation-drawer>
</template>

<script>
import { computed } from 'vue';
import { useStore } from 'vuex';
import { useRouter } from 'vue-router';

export default {
  data() {
    return {
      drawer: null,
      drawerWidth: 350,
      activeItem: null,
    };
  },
  setup() {
    const store = useStore();
    const router = useRouter();
    const isAuthenticated = computed(() => store.getters['auth/isAuthenticated']);

    const allItems = [
      { title: 'Home', link: '/', altTitle: 'Jass erfassen', altLink: '/jass_erfassen' },
      { title: 'Spieler erfassen', link: '/add_player', requiresAuth: true },
      { title: 'Jassgruppe erstellen', link: '/group_register', requiresAuth: true },
      { title: 'Registrieren', link: '/register', hideWhenAuth: true },
      { title: 'Einloggen', altTitle: 'Ausloggen', altAction: 'logout', link: '/login' },
    ];

    const visibleItems = computed(() => {
      return allItems.map(item => {
        const newItem = { ...item };
        if (item.requiresAuth && !isAuthenticated.value) {
          return null;
        }
        if (item.hideWhenAuth && isAuthenticated.value) {
          return null;
        }
        if (item.altTitle && isAuthenticated.value) {
          newItem.title = item.altTitle;
        }
        if (item.altLink && isAuthenticated.value) {
          newItem.link = item.altLink;
        }
        if (item.altAction && isAuthenticated.value) {
          newItem.action = item.altAction;
        }
        return newItem;
      }).filter(Boolean);
    });

    const resetJassErfassenIfNeeded = () => {
      const currentRoute = router.currentRoute.value;
      if (currentRoute.name !== 'jasserfassen') {
        store.dispatch('jassErfassen/resetJassErfassenState');
      }
    };

    return {
      isAuthenticated,
      visibleItems,
      resetJassErfassenIfNeeded,
    };
  },
  created() {
    this.updateDrawerWidth();
    window.addEventListener('resize', this.updateDrawerWidth);
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.updateDrawerWidth);
  },
  methods: {
    updateDrawerWidth() {
      if (window.innerWidth >= 1200) {
        this.drawerWidth = 350;
      } else if (window.innerWidth >= 600) {
        this.drawerWidth = 300;
      } else {
        this.drawerWidth = 250;
      }
    },
    navigateTo(item) {
      if (item.action === 'logout') {
        this.$store.dispatch('auth/logout');
      } else {
        this.resetJassErfassenIfNeeded();
        this.$router.push(item.link);
      }
    },
  },
};
</script>

<style scoped>
.drawer-item {
  font-size: 1.5rem;
  color: var(--v-primary-base);
  cursor: pointer;
  transition: color 0.3s ease;
  margin: 1.5rem 0;
  line-height: 1.8;
}

.drawer-item.hovered {
  color: var(--v-primary-darken2); 
  background-color: var(--v-primary-lighten5);
}

@media (orientation: portrait) {
  .drawer-item {
    font-size: 1.5rem; 
  }
}

@media (orientation: landscape) {
  .drawer-item {
    font-size: 1.2rem;
  }
}
</style>
