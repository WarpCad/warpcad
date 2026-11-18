<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * **BaseSheet**, the one frame of every sheet (`TODO/ui-116`). A sheet is a panel that slides in
 * from an edge instead of floating over the page like a dialog.
 *
 * - **`side`**: `bottom` (a full-width bottom sheet, with the safe-area padding and the on-screen
 *   keyboard lift built in, so a focused field is never behind it on any sheet) or `right` (a
 *   docked side panel).
 * - **`modal`** (default `false`). A modal sheet dims the page behind it with a backdrop that
 *   catches clicks, keeps Tab inside, and says `aria-modal`. A non-modal sheet (the Split and
 *   Repeat sheets: the user keeps working in the viewport while they are open) has no backdrop and
 *   no focus trap. Both join the overlay stack, so Escape closes the top overlay only.
 * - **`card`**: from 641px a `bottom` sheet becomes a card (top-right, `width` wide; `top` and `right`
 *   anchor it under a button) instead of
 *   staying a bottom edge; the Library and Share sheets want that.
 * - **`teleport`** (default `true`): to `<body>`; a docked sheet that lives inside its panel
 *   passes `false`.
 * - **`scrim`**: `dim` (default) or `clear`, the backdrop of a modal sheet.
 * - **`stack`** (default `true`): whether Escape reaches the sheet through the overlay stack. The
 *   Repeat sheet opts out: its Escape belongs to the Operations toolbar.
 * - **`tier`**: `popover`, `modal`, `help` or `dock` (a docked sheet's one layer, `--z-dock`), the `--z-*` tier the sheet sits in; the frame is
 *   the tier plus one, the backdrop the tier.
 * - **`as`**: the frame's element, `div` or `form`.
 * - **`title`** labels the dialog; **`helpTopic`** adds the header's **?** (`HelpButton`) next to a
 *   visible heading. With no `helpTopic` the sheet draws no header and the slot owns everything.
 *
 * Attributes it does not declare land on the frame element, not the backdrop.
 */
import { computed, ref } from 'vue'

import { useFocusTrap } from '../../composables/useFocusTrap.js'
import { useKeyboardInset } from '../../composables/useKeyboardInset.js'
import { useOverlayStack } from '../../composables/useOverlayStack.js'
import HelpButton from '../controls/HelpButton.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The frame's own `data-testid`. */
  testid: { type: String, required: true },
  /** The backdrop's `data-testid`; defaults to `<testid>-backdrop`. */
  backdropTestid: { type: String, default: '' },
  title: { type: String, required: true },
  helpTopic: { type: String, default: '' },
  side: { type: String, default: 'bottom', validator: (/** @type {string} */ v) => v === 'bottom' || v === 'right' },
  modal: { type: Boolean, default: false },
  card: { type: Boolean, default: false },
  /** The card's width, a CSS length. */
  width: { type: String, default: '340px' },
  /** The card's offset from the top and right edge, CSS lengths; a Share sheet anchors under its button with them. */
  top: { type: String, default: '64px' },
  right: { type: String, default: '16px' },
  teleport: { type: Boolean, default: true },
  tier: { type: String, default: 'popover', validator: (/** @type {string} */ v) => ['popover', 'modal', 'help', 'dock'].includes(v) },
  /** `dim` (the scrim) or `clear`: a modal sheet whose backdrop catches the click but does not dim. */
  scrim: { type: String, default: 'dim', validator: (/** @type {string} */ v) => v === 'dim' || v === 'clear' },
  /** Whether Escape reaches this sheet through the overlay stack; a docked sheet whose Escape belongs elsewhere says `false`. */
  stack: { type: Boolean, default: true },
  as: { type: String, default: 'div', validator: (/** @type {string} */ v) => v === 'div' || v === 'form' },
})
const emit = defineEmits(['backdrop', 'escape'])

const frameEl = ref(null)
useFocusTrap(frameEl, () => props.modal && props.open)
useOverlayStack(() => props.open && props.stack, () => emit('escape'))
const { keyboardInsetPx } = useKeyboardInset(() => props.side === 'bottom' && props.open)

/** Each tier's backdrop and frame layers, spelled out so the token names stay greppable. */
/** @type {Record<string, string[]>} */
const TIER_LAYERS = {
  popover: ['var(--z-popover)', 'var(--z-popover-frame)'],
  modal: ['var(--z-modal)', 'var(--z-modal-frame)'],
  help: ['var(--z-help)', 'var(--z-help-frame)'],
  dock: ['var(--z-dock)', 'var(--z-dock)'],
}

const frameStyle = computed(() => ({
  '--layout-sheet-width': props.width,
  '--layout-sheet-top': props.top,
  '--layout-sheet-right': props.right,
  '--layout-sheet-keyboard': `${keyboardInsetPx.value}px`,
  '--layout-sheet-z': TIER_LAYERS[props.tier][0],
  '--layout-sheet-z-frame': TIER_LAYERS[props.tier][1],
}))
</script>

<template>
  <Teleport to="body" :disabled="!teleport">
    <template v-if="open">
      <div v-if="modal" class="sheet__backdrop" :class="{ 'sheet__backdrop--clear': scrim === 'clear' }" :style="frameStyle" :data-testid="backdropTestid || `${testid}-backdrop`" @click="emit('backdrop')" />
      <component
        :is="as"
        ref="frameEl"
        class="sheet"
        :class="[`sheet--${side}`, { 'sheet--card': card }]"
        v-bind="$attrs"
        role="dialog"
        :aria-modal="modal ? 'true' : undefined"
        :aria-label="title"
        :data-testid="testid"
        :data-modal="modal ? 'true' : 'false'"
        :style="frameStyle"
      >
        <div v-if="helpTopic" class="sheet__head">
          <h2 class="sheet__title">{{ title }}</h2>
          <HelpButton class="sheet__help" :topic="helpTopic" />
        </div>
        <slot />
      </component>
    </template>
  </Teleport>
</template>

<style scoped>
.sheet__backdrop {
  position: fixed;
  inset: 0;
  background: var(--scrim);
  z-index: var(--layout-sheet-z);
}

.sheet__backdrop--clear {
  background: transparent;
}

.sheet {
  position: fixed;
  z-index: var(--layout-sheet-z-frame);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  overflow-y: auto;
  padding: var(--space-5);
  border: 1px solid var(--border);
  background: var(--surface-1);
  color: var(--text-1);
  font-family: var(--font);
  box-shadow: var(--shadow-overlay);
}

.sheet--bottom {
  right: 0;
  bottom: var(--layout-sheet-keyboard);
  left: 0;
  max-height: calc(86dvh - var(--layout-sheet-keyboard));
  padding-bottom: calc(var(--space-5) + var(--layout-safe-bottom));
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}

.sheet--right {
  top: 0;
  right: 0;
  bottom: 0;
  width: min(var(--layout-sheet-width), 100vw);
  padding-bottom: calc(var(--space-5) + var(--layout-safe-bottom));
  border-width: 0 0 0 1px;
}

.sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

/* The 44px target overhangs the title line rather than growing the header. */
.sheet__help {
  margin: -12px -8px -12px 0;
}

.sheet__title {
  margin: 0;
  font-size: var(--font-size-5);
  font-weight: var(--weight-medium);
}

@media (min-width: 641px) {
  .sheet--card.sheet--bottom {
    top: var(--layout-sheet-top);
    right: var(--layout-sheet-right);
    bottom: auto;
    left: auto;
    width: min(var(--layout-sheet-width), calc(100vw - 32px));
    max-height: calc(100dvh - var(--layout-sheet-top) - 32px);
    padding-bottom: var(--space-5);
    border-radius: var(--radius-lg);
  }
}
</style>
