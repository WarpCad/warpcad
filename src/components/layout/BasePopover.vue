<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * **BasePopover**, the one frame of every popover (`TODO/ui-116`): a small panel anchored to the
 * control that opened it.
 *
 * - **`anchor`**: an element or a `DOMRect`-like `{ left, top, right, bottom }`. The frame is
 *   placed from it when the popover opens (`placement`: `bottom-start`, `bottom-end`, `top-start`
 *   or `top-end`) and clamped inside the viewport. With no anchor the frame sits at the top-left
 *   of the page, for a caller that positions it with `class` and `style`.
 * - **Closing**: a press outside the frame, or Escape (the overlay stack: the top overlay only),
 *   emits `close`. A press on the **anchor** does not: the anchor's own toggle runs instead, so a
 *   second tap does not close and re-open it (`useOutsideClick`'s `ignore`).
 * - **`modal`** (default `false`): adds a transparent backdrop that catches clicks, for a popover
 *   that must keep what is under it unreachable while open (the Export popover). The backdrop
 *   emits `close` too.
 * - **`draggable`**: renders a `PopoverGrip` and wires `usePopoverDrag` (`TODO/ui-087`) for the
 *   operation popovers, which move so they do not hide their targets. `dragKey` names the
 *   popover in the panel-layout store.
 * - **`teleport`** (default `true`): to `<body>`.
 *
 * Attributes it does not declare land on the frame element. Every popover sits in the
 * `--z-popover` tier (backdrop) and the frame one above it.
 */
import { computed, ref, watch } from 'vue'

import { useOutsideClick } from '../../composables/useOutsideClick.js'
import { useOverlayStack } from '../../composables/useOverlayStack.js'
import { usePopoverDrag } from '../../composables/usePopoverDrag.js'
import PopoverGrip from '../viewport/PopoverGrip.vue'

defineOptions({ inheritAttrs: false })

/** @typedef {{ left: number, top: number, right: number, bottom: number }} AnchorRect */

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The frame's own `data-testid`. */
  testid: { type: String, required: true },
  title: { type: String, required: true },
  anchor: { type: /** @type {import('vue').PropType<Element | AnchorRect | null>} */ (Object), default: null },
  placement: {
    type: String,
    default: 'bottom-start',
    validator: (/** @type {string} */ v) => ['bottom-start', 'bottom-end', 'top-start', 'top-end'].includes(v),
  },
  modal: { type: Boolean, default: false },
  draggable: { type: Boolean, default: false },
  dragKey: { type: String, default: 'popover' },
  teleport: { type: Boolean, default: true },
})
const emit = defineEmits(['close'])

const frameEl = ref(null)
const close = () => emit('close')

useOverlayStack(() => props.open, close)
useOutsideClick(frameEl, () => props.open && !props.modal, close, {
  ignore: [() => (props.anchor instanceof Element ? props.anchor : null)],
})
usePopoverDrag(computed(() => (props.open && props.draggable ? props.dragKey : null)))

/** The gap between anchor and frame, in px. */
const GAP_PX = 6
const position = ref(/** @type {{ left: number, top: number } | null} */ (null))

/** @returns {AnchorRect | null} */
function anchorRect() {
  const anchor = props.anchor
  if (!anchor) return null
  return anchor instanceof Element ? anchor.getBoundingClientRect() : anchor
}

/**
 * Place the frame from the anchor: below or above it, aligned to its start or end edge, then
 * clamped so it stays on screen. Runs once per open (a popover does not chase its anchor).
 */
function place() {
  const rect = anchorRect()
  const frame = frameEl.value
  if (!rect || !frame) {
    position.value = null
    return
  }
  const box = /** @type {HTMLElement} */ (frame).getBoundingClientRect()
  const [vertical, horizontal] = props.placement.split('-')
  let left = horizontal === 'end' ? rect.right - box.width : rect.left
  let top = vertical === 'top' ? rect.top - box.height - GAP_PX : rect.bottom + GAP_PX
  left = Math.min(Math.max(left, 8), Math.max(8, window.innerWidth - box.width - 8))
  top = Math.min(Math.max(top, 8), Math.max(8, window.innerHeight - box.height - 8))
  position.value = { left, top }
}

watch(
  () => props.open,
  (open) => {
    position.value = null
    // The frame mounts on the same tick as `open`, so measure after the DOM has it.
    if (open) queueMicrotask(place)
  },
  { immediate: true },
)

const frameStyle = computed(() => (position.value ? { left: `${position.value.left}px`, top: `${position.value.top}px` } : undefined))
</script>

<template>
  <Teleport to="body" :disabled="!teleport">
    <template v-if="open">
      <div v-if="modal" class="popover__backdrop" :data-testid="`${testid}-backdrop`" @click="close()" />
      <div
        ref="frameEl"
        class="popover"
        v-bind="$attrs"
        role="dialog"
        :aria-label="title"
        :data-testid="testid"
        :data-popover-frame="draggable ? '' : undefined"
        :style="frameStyle"
      >
        <PopoverGrip v-if="draggable" />
        <slot />
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
/* Transparent so the scene stays legible under the popover. */
.popover__backdrop {
  position: fixed;
  inset: 0;
  background: transparent;
  z-index: var(--z-popover);
}

.popover {
  position: fixed;
  top: 0;
  left: 0;
  box-sizing: border-box;
  max-width: calc(100vw - 16px);
  max-height: calc(100dvh - 16px);
  overflow-y: auto;
  padding: 8px 10px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  color: var(--text-1);
  box-shadow: var(--shadow-overlay);
  z-index: var(--z-popover-frame);
}
</style>
