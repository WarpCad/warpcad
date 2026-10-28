<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
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
 * - An optional **?** in the header (`helpTopic`, a key of `src/help/topics.js`): every dialog
 *   that documents a tool gets its help button by passing one string (`TODO/ui-061`).
 *
 * - **`sheet`** (`TODO/io-017`, the gist token dialog): at phone width a **bottom sheet** instead
 *   of the top-anchored frame, for a dialog whose spec asks for one. The keyboard rule above still
 *   holds: while it is open the sheet is lifted by the on-screen keyboard's height (the
 *   `visualViewport` measure `ChatPanel.vue` uses), so a focused field is never behind it. From
 *   641px it is the ordinary dialog.
 *
 * It owns layout only. What each dialog says and does is its own component's.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import HelpButton from '../controls/HelpButton.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The dialog's own `data-testid`. */
  testid: { type: String, required: true },
  title: { type: String, required: true },
  /** A topic id for the header's **?**; empty for a dialog with nothing to document. */
  helpTopic: { type: String, default: '' },
  /** A bottom sheet at phone width (see the module note); the ordinary dialog from 641px. */
  sheet: { type: Boolean, default: false },
})
defineEmits(['backdrop'])

/** How much of the layout viewport the on-screen keyboard covers, in px; 0 where it does not. */
const keyboardInset = ref(0)
function measureKeyboard() {
  const visual = window.visualViewport
  if (!visual) return
  keyboardInset.value = Math.max(0, Math.round(window.innerHeight - visual.height - visual.offsetTop))
}
function stopMeasuring() {
  window.visualViewport?.removeEventListener('resize', measureKeyboard)
  window.visualViewport?.removeEventListener('scroll', measureKeyboard)
}
watch(
  () => props.sheet && props.open,
  (measuring) => {
    if (typeof window === 'undefined') return
    stopMeasuring()
    keyboardInset.value = 0
    if (!measuring) return
    window.visualViewport?.addEventListener('resize', measureKeyboard)
    window.visualViewport?.addEventListener('scroll', measureKeyboard)
    measureKeyboard()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (typeof window !== 'undefined') stopMeasuring()
})

const frameStyle = computed(() => (props.sheet ? { '--modal-keyboard': `${keyboardInset.value}px` } : undefined))
</script>

<template>
  <Teleport to="body">
    <template v-if="open">
      <div class="modal__backdrop" :data-testid="`${testid}-backdrop`" @click="$emit('backdrop')" />
      <div
        class="modal"
        :class="{ 'modal--sheet': sheet }"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        :data-testid="testid"
        :style="frameStyle"
      >
        <div class="modal__head">
          <h2 class="modal__title">{{ title }}</h2>
          <HelpButton v-if="helpTopic" class="modal__help" :topic="helpTopic" />
        </div>
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

.modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

/* The 44px tap target overhangs the title's line instead of making the header taller, so the
   fields below do not move for a dialog that gains a ?. */
.modal__help {
  margin: -12px -8px -12px 0;
}

.modal__title {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  line-height: 1.3;
  color: var(--text-1);
  /* A file name in a title (the disk-change dialog) can be one long unbroken word. */
  overflow-wrap: anywhere;
}

/* `sheet`, phone width: a bottom sheet, lifted above the on-screen keyboard while it is up. */
@media (max-width: 640px) {
  .modal--sheet {
    top: auto;
    right: 0;
    bottom: var(--modal-keyboard, 0px);
    left: 0;
    transform: none;
    width: 100%;
    max-height: calc(100dvh - 24px - var(--modal-keyboard, 0px));
    padding: 14px 16px calc(14px + env(safe-area-inset-bottom, 0px));
    border-width: 1px 0 0;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }
}
</style>
