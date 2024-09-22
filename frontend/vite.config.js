import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
// import { VitePWA } from 'vite-plugin-pwa'  // Auskommentieren oder entfernen

export default defineConfig({
  plugins: [
    vue(),
    // VitePWA({ ... })  // Auskommentieren oder entfernen
  ],
  define: {
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false'
  }
})
