import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

export default createConfigForNuxt({
  features: {
    tooling: true,
  },
})
  .append({
    ignores: ['dist', 'node_modules', 'playground/.nuxt', 'playground/.output'],
  })
  .append({
    // Nuxt pages are addressed by route, not by tag name.
    files: ['playground/app/pages/**/*.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  })
