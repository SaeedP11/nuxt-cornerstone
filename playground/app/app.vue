<script setup lang="ts">
const { locale, dir, isRtl } = useCornerstoneI18n()

/**
 * Vazirmatn is fetched only for RTL locales, so an English session pays
 * nothing for it and an offline session falls back to the stack in main.css.
 */
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600&display=swap'

const fontLinks = computed(() =>
  isRtl.value
    ? [
        { rel: 'preconnect' as const, href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect' as const, href: 'https://fonts.gstatic.com', crossorigin: 'anonymous' as const },
        { rel: 'stylesheet' as const, href: FONT_HREF },
      ]
    : [],
)

// A viewer is read in a darkened room; the demo is dark-only.
useHead({
  htmlAttrs: {
    class: 'dark',
    // Refs are passed through rather than unwrapped, so switching locale
    // updates <html lang dir> without a reload.
    lang: locale,
    dir,
  },
  link: fontLinks,
})
</script>

<template>
  <NuxtPage />
</template>

<style>
html,
body,
#__nuxt {
  height: 100%;
  margin: 0;
}
</style>
