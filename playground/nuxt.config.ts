import tailwindcss from '@tailwindcss/vite'
import Aura from '@primeuix/themes/aura'
import { messages } from './i18n/messages'

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
    // This allowlist is the only gate on what is available: a component not
    // named here is simply not registered.
    components: {
      include: ['Button', 'Dialog', 'Divider', 'FileUpload', 'Listbox', 'Message', 'ProgressBar', 'Select', 'SelectButton', 'Slider', 'Tag'],
    },
    directives: {
      include: ['Tooltip'],
    },
  },

  cornerstone: {
    // Everything here is a default; spelled out as documentation.
    autoInit: true,
    renderingEngineId: 'playground-engine',
    toolGroupId: 'playground-tools',

    // The demo's own strings ride along in the module's catalogue. Extra keys
    // are allowed, so an app does not need a second i18n library to translate
    // its chrome — see "Internationalisation" in the README.
    i18n: {
      locale: 'en',
      fallbackLocale: 'en',
      messages,
    },
  },
})
