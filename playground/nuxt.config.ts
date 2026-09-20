import tailwindcss from '@tailwindcss/vite'
import Aura from '@primeuix/themes/aura'

export default defineNuxtConfig({
  modules: ['../src/module', '@primevue/nuxt-module'],

  // SSR stays on deliberately: it is what proves the client-only boundary
  // around Cornerstone actually holds.
  ssr: true,

  devtools: { enabled: true },
  css: ['primeicons/primeicons.css', '~/assets/css/main.css'],
  compatibilityDate: '2025-09-19',

  vite: {
    plugins: [tailwindcss()],
  },

  primevue: {
    options: {
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.dark',
          // Keep PrimeVue in its own cascade layer so Tailwind utilities can
          // override it without `!`.
          cssLayer: { name: 'primevue', order: 'theme, base, primevue' },
        },
      },
    },
    components: {
      include: ['Button', 'FileUpload', 'Message', 'ProgressBar', 'Select', 'SelectButton', 'Slider', 'Tag'],
    },
  },

  cornerstone: {
    // Everything here is a default; spelled out as documentation.
    autoInit: true,
    renderingEngineId: 'playground-engine',
    toolGroupId: 'playground-tools',
  },
})
