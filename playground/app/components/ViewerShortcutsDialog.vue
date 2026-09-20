<script setup lang="ts">
const visible = defineModel<boolean>('visible', { required: true })

const { t } = useCornerstoneI18n()

/**
 * Key names are identifiers on the keyboard, so they are not translated and
 * the column stays LTR. Each horizontal pair is listed as a pair rather than
 * as "left = back", because which arrow goes forward follows the reading
 * direction.
 */
const BINDINGS = [
  { keys: ['↑', '↓', '←', '→'], key: 'app.shortcuts.slice' },
  { keys: ['Page Up', 'Page Down'], key: 'app.shortcuts.page' },
  { keys: ['Home', 'End'], key: 'app.shortcuts.ends' },
  { keys: ['1 – 7'], key: 'app.shortcuts.tools' },
  { keys: ['R'], key: 'app.shortcuts.reset' },
  { keys: ['?'], key: 'app.shortcuts.help' },
]
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    dismissable-mask
    :header="t('app.shortcuts.title')"
    :style="{ width: '28rem' }"
  >
    <dl class="m-0 grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3">
      <template
        v-for="binding in BINDINGS"
        :key="binding.key"
      >
        <dt
          dir="ltr"
          class="flex gap-1"
        >
          <kbd
            v-for="name in binding.keys"
            :key="name"
            class="rounded border border-[var(--p-content-border-color)] bg-[var(--p-surface-800)] px-2 py-0.5 font-mono text-xs"
          >{{ name }}</kbd>
        </dt>
        <dd class="m-0 text-sm text-[var(--p-text-muted-color)]">
          {{ t(binding.key) }}
        </dd>
      </template>
    </dl>
  </Dialog>
</template>
