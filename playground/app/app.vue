<script setup lang="ts">
// A viewer is read in a darkened room; the demo is dark-only.
useHead({ htmlAttrs: { class: 'dark' } })
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
