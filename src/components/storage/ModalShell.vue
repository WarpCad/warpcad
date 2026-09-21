<script setup>
/**
 * The shared frame of the three File-menu dialogs (`TODO/ui-033`): the replace-project
 * confirm, the Connect dialog and the hosted conflict dialog
 * (`docs/decisions/interaction-model-qa.md` §10, §11).
 *
 * - **Teleported to `<body>`** at the modal tier (z-index 40/41 — above the popover tier 30/31,
 *   the Library sheet 20 and the Inspector sheet 11).
 * - **Top-anchored, full width minus 16px** at phone width and never bottom-anchored, so the
 *   on-screen keyboard cannot hide it (§10 Q16); `max-height` plus `overflow-y: auto` so a
 *   short viewport scrolls the dialog rather than clipping its last button.
 * - A dimming backdrop that catches clicks: a modal is not something to click past.
 * - `role="dialog"` + `aria-modal` + a labelled title.
 *
 * It owns layout only. What each dialog says and does is its own component's.
 */
defineProps({
  open: { type: Boolean, default: false },
  /** The dialog's own `data-testid`. */
  testid: { type: String, required: true },
  title: { type: String, required: true },
})
defineEmits(['backdrop'])
</script>

<template>
  <Teleport to="body">
    <template v-if="open">
      <div class="modal__backdrop" :data-testid="`${testid}-backdrop`" @click="$emit('backdrop')" />
      <div class="modal" role="dialog" aria-modal="true" :aria-label="title" :data-testid="testid">
        <h2 class="modal__title">{{ title }}</h2>
        <slot />
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
.modal__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 40;
}

.modal {
  position: fixed;
  top: 64px;
  left: 50%;
  transform: translateX(-50%);
  box-sizing: border-box;
  width: min(420px, calc(100vw - 16px));
  max-height: calc(100dvh - 76px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  color: var(--text-1);
  box-shadow: var(--shadow-overlay);
  z-index: 41;
}

.modal__title {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  line-height: 1.3;
  color: var(--text-1);
}
</style>
