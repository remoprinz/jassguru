// src/router/index.js

import { createRouter, createWebHistory } from 'vue-router';
import { store } from '../store';  // Änderung hier
import HomePage from '@/components/pages/HomePage.vue';
import RegisterPage from '@/components/pages/RegisterPage.vue';
import LoginPage from '@/components/pages/LoginPage.vue';
import AddPlayerPage from '@/components/pages/AddPlayerPage.vue';
import ResetPassword from '@/components/pages/ResetPassword.vue';
import GroupRegisterPage from '@/components/pages/GroupRegisterPage.vue';
import JassErfassen from '@/components/pages/JassErfassen.vue';
import JassnameRegistrationForm from '@/components/auth/JassnameRegistrationForm.vue';
import ConfirmAddPlayerForm from '@/components/auth/ConfirmAddPlayerForm.vue';
import JassQRCode from '@/components/JassTransition/JassQRCode.vue';

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomePage,
  },
  {
    path: '/register',
    name: 'register',
    component: RegisterPage,
  },
  {
    path: '/confirm',
    name: 'confirm',
    component: JassnameRegistrationForm,
    props: (route) => ({ token: route.query.token }),
  },
  {
    path: '/login',
    name: 'login',
    component: LoginPage,
  },
  {
    path: '/add_player',
    name: 'addplayer',
    component: AddPlayerPage,
    meta: { requiresAuth: true },
  },
  {
    path: '/confirm-added-player',
    name: 'confirmAddedPlayer',
    component: ConfirmAddPlayerForm,
    props: route => ({ token: route.query.token }),
  },
  {
    path: '/reset_password',
    name: 'resetpassword',
    component: ResetPassword,
  },
  {
    path: '/group_register',
    name: 'groupRegister',
    component: GroupRegisterPage,
    meta: { requiresAuth: true },
  },
  {
    path: '/jass_erfassen',
    name: 'jasserfassen',
    component: JassErfassen,
    meta: { requiresAuth: true },
    beforeEnter: (to, from, next) => {
      store.dispatch('jassErfassen/resetStateOnLogin');
      next();
    }
  },
  {
    path: '/jass-qr-code/:jassCode',
    name: 'JassQRCode',
    component: JassQRCode,
    props: true,
    meta: { requiresAuth: true },
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
});

// Navigation Guard
router.beforeEach((to, from, next) => {
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);
  const isAuthenticated = store.getters['auth/isAuthenticated'];

  if (requiresAuth && !isAuthenticated) {
    next('/login');
  } else {
    next();
  }
});

export default router;
