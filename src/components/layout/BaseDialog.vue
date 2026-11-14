<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * **BaseDialog**, the one frame of every modal dialog (`TODO/ui-116`; it began as `ModalShell`,
 * `TODO/ui-033`, the frame of the File-menu dialogs: `docs/decisions/interaction-model-qa.md`
 * §10, §11). It is **always modal**; a non-modal surface is `BaseSheet`, an anchored one
 * `BasePopover`.
 *
 * - **Teleported to `<body>`** at the modal tier (`--z-modal` backdrop, `--z-modal-frame` dialog:
 *   above the popover tier, the Library sheet and the Inspector sheet).
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
 * - **`placement`**: `top` (the default, top-anchored so the keyboard cannot cover it) or `center`
 *   (a confirm or repair dialog that has room to be centred).
 * - **`tone`**: `danger` marks a destructive confirm with a `--danger` top edge.
 * - **`width`**: the frame's preferred width (a CSS length); it still never exceeds the viewport.
 * - **`escapable`**: Escape emits `escape` while the dialog is open, through `useOverlayStack`, so
 *   a dialog without its own Escape handler needs none. Dialogs that already register one leave it off.
 * - Attributes it does not declare (`data-layout`, say) land on the dialog element, not the backdrop.
 *
 * It owns layout only. What each dialog says and does is its own component's.
 */
import { computed, ref } from 'vue'

import { useFocusTrap } from '../../composables/useFocusTrap.js'
import { useKeyboardInset } from '../../composables/useKeyboardInset.js'
import { useOverlayStack } from '../../composables/useOverlayStack.js'
import HelpButton from '../controls/HelpButton.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The dialog's own `data-testid`. */
  testid: { type: String, required: true },
  title: { type: String, required: true },
  /** A topic id for the header's **?**; empty for a dialog with nothing to document. */
  helpTopic: { type: String, default: '' },
  /** A bottom sheet at phone width (see the module note); the ordinary dialog from 641px. */
  sheet: { type: Boolean, default: false },
  /** `top` or `center` (see the module note). */
  placement: { type: String, default: 'top', validator: (/** @type {string} */ v) => v === 'top' || v === 'center' },
  /** `danger` for a destructive confirm. */
  tone: { type: String, default: 'default', validator: (/** @type {string} */ v) => v === 'default' || v === 'danger' },
  /** The frame's preferred width, a CSS length. */
  width: { type: String, default: '420px' },
  /** The backdrop's `data-testid`; defaults to `<testid>-backdrop`. */
  backdropTestid: { type: String, default: '' },
  /** The `data-testid` of the title heading, for a dialog whose spec reads it. */
  titleTestid: { type: String, default: '' },
  /** Register on the overlay stack and emit `escape` when Escape reaches this dialog. */
  escapable: { type: Boolean, default: false },
})
const emit = defineEmits(['backdrop', 'escape'])
useOverlayStack(() => props.escapable && props.open, () => emit('escape'))

/** The dialog element, the focus trap's root. */
const dialogEl = ref(null)
// `aria-modal` is a promise that the page behind is unavailable: keep Tab inside (`TODO/ui-110`).
useFocusTrap(dialogEl, () => props.open)
/** How much of the layout viewport the on-screen keyboard covers, in px; 0 where it does not. */
const { keyboardInsetPx } = useKeyboardInset(() => props.sheet && props.open)

const frameStyle = computed(() => ({
  '--layout-modal-width': props.width,
  '--layout-modal-keyboard': `${props.sheet ? keyboardInsetPx.value : 0}px`,
}))
</script>

<template>
  <Teleport to="body">
    <template v-if="open">
      <div class="modal__backdrop" :data-testid="backdropTestid || `${testid}-backdrop`" @click="$emit('backdrop')" />
      <div
        ref="dialogEl"
        class="modal"
        :class="{ 'modal--sheet': sheet, 'modal--center': placement === 'center', 'modal--danger': tone === 'danger' }"
        v-bind="$attrs"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        :data-testid="testid"
        :style="frameStyle"
      >
        <div class="modal__head">
          <h2 class="modal__title" :data-testid="titleTestid || undefined">{{ title }}</h2>
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
  background: var(--scrim);
  z-index: var(--z-modal);
}

.modal {
  position: fixed;
  top: 64px;
  left: 50%;
  transform: translateX(-50%);
  box-sizing: border-box;
  width: min(var(--layout-modal-width), calc(100vw - 16px));
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
  z-index: var(--z-modal-frame);
}

.modal--center {
  top: 50%;
  transform: translate(-50%, -50%);
  max-height: calc(100dvh - 32px);
}

.modal--danger {
  border-top: 3px solid var(--danger);
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
    bottom: var(--layout-modal-keyboard);
    left: 0;
    transform: none;
    width: 100%;
    max-height: calc(100dvh - 24px - var(--layout-modal-keyboard));
    padding: 14px 16px calc(14px + var(--layout-safe-bottom));
    border-width: 1px 0 0;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }
}
</style>
