<script setup>
/**
 * The design resolution popover (`TODO/core-035`, surface A) — opened by **File ▾ →
 * Resolution: Normal** and driven entirely by `stores/resolutionDialog.js`. Built the same
 * way as `ExportPopover.vue`: teleported to `<body>`, a transparent click-catching
 * backdrop at z-index 30 with the popover at 31 (above the Inspector sheet and the Library
 * sheet, so it never stacks under them — the class of bug `ui-036`/`ui-043` fixed),
 * anchored under the File button and full-width at phone width, Escape via
 * `stores/fileMenu.js`'s `dismissTopmost`.
 *
 * ## What it shows
 *
 * - A radio group, coarse to fine: **Draft / Normal / Fine / Print** — plus **Legacy (32
 *   segments)** first, only while it is the active value (an old file's setting, never a
 *   thing to pick). Each row carries a one-line hint of what it means at a reference hole
 *   (`Ø20 hole: 52 sides, ≤0.02 mm off`). Rows are the 44 px tap-target minimum.
 * - Changing the choice **commits it** — one undoable step (`Undo Resolution → Fine`), and
 *   the curved bodies in the viewport re-facet. There is no Apply button to miss.
 * - A short line on what the setting is for (fit, not just looks), and — while History
 *   previews — the reason the choices are disabled.
 *
 * ## Focus
 *
 * Opening focuses the checked radio (Arrows then move through the choices, committing as
 * they go, which is what a radio group does); closing returns focus to the File button.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { useResolutionDialogStore } from '../../stores/resolutionDialog.js'

const props = defineProps({
  /** The File button — the popover anchors under it and gives focus back to it. */
  anchor: { type: /** @type {import('vue').PropType<HTMLElement | null>} */ (Object), default: null },
})

const dialog = useResolutionDialogStore()

/** @type {import('vue').Ref<HTMLElement | null>} */
const rootRef = ref(null)
const position = ref({ top: 60, left: 8, width: 320 })

/** Anchor under the File button, clamped inside the viewport — measured on open, not per frame. */
function measure() {
  const box = props.anchor?.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const width = Math.min(320, viewportWidth - 16)
  const right = box?.right ?? viewportWidth - 8
  const left = Math.max(8, Math.min(right - width, viewportWidth - width - 8))
  position.value = { top: Math.round((box?.bottom ?? 52) + 6), left: Math.round(left), width }
}

const style = computed(() => ({
  top: `${position.value.top}px`,
  left: `${position.value.left}px`,
  width: `${position.value.width}px`,
  maxHeight: `calc(100dvh - ${position.value.top + 12}px)`,
}))

const disabled = computed(() => dialog.unavailableReason !== '')

watch(
  () => dialog.isOpen,
  async (open, was) => {
    if (open) {
      measure()
      window.addEventListener('resize', measure)
      await nextTick()
      const target = /** @type {HTMLElement | null} */ (
        rootRef.value?.querySelector('input[name="design-resolution"]:checked') ??
          rootRef.value?.querySelector('button') ??
          null
      )
      target?.focus()
    } else {
      window.removeEventListener('resize', measure)
      if (was) props.anchor?.focus()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => window.removeEventListener('resize', measure))
</script>

<template>
  <Teleport to="body">
    <template v-if="dialog.isOpen">
      <div class="resolution__backdrop" data-testid="resolution-backdrop" @click="dialog.close()" />
      <div
        ref="rootRef"
        class="resolution"
        role="dialog"
        aria-label="Resolution"
        data-testid="resolution-popover"
        :style="style"
      >
        <p class="resolution__heading" id="resolution-heading">Resolution</p>
        <p class="resolution__intro">
          How finely curves are faceted. Finer means holes and pegs print closer to size.
        </p>
        <div role="radiogroup" aria-labelledby="resolution-heading" class="resolution__group">
          <label
            v-for="option in dialog.options"
            :key="option.value"
            class="resolution__row"
            :data-testid="`resolution-option-${option.value}-label`"
          >
            <input
              type="radio"
              name="design-resolution"
              :value="option.value"
              :data-testid="`resolution-option-${option.value}`"
              :checked="dialog.current === option.value"
              :disabled="disabled"
              @change="dialog.choose(option.value)"
            />
            <span class="resolution__text">
              <span class="resolution__label">{{ option.label }}</span>
              <span class="resolution__hint">{{ option.hint }}</span>
            </span>
          </label>
        </div>
        <p v-if="disabled" class="resolution__note" role="status" data-testid="resolution-blocked">
          {{ dialog.unavailableReason }}
        </p>
        <div class="resolution__actions">
          <button type="button" class="resolution__button" data-testid="resolution-close" @click="dialog.close()">
            Done
          </button>
        </div>
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
/* Transparent so the scene stays legible — and the re-facet visible — under the popover. */
.resolution__backdrop {
  position: fixed;
  inset: 0;
  background: transparent;
  z-index: 30;
}

.resolution {
  position: fixed;
  box-sizing: border-box;
  overflow-y: auto;
  padding: 8px 10px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: var(--shadow-overlay);
  color: var(--text-1);
  z-index: 31;
}

.resolution__heading {
  margin: 4px 2px 2px;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}

.resolution__intro {
  margin: 0 2px 6px;
  font-size: 12px;
  line-height: 1.35;
  color: var(--text-2);
}

.resolution__group {
  display: flex;
  flex-direction: column;
}

.resolution__row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: var(--tap);
  padding: 4px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  touch-action: manipulation;
}

.resolution__row:has(input:disabled) {
  opacity: 0.5;
  cursor: default;
}

.resolution__row:has(input:checked) {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface-1));
}

.resolution__row input {
  flex: none;
  width: 20px;
  height: 20px;
  margin: 0;
  accent-color: var(--accent);
}

.resolution__row:has(input:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.resolution__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.resolution__label {
  font-size: 14px;
  line-height: 1.3;
}

.resolution__hint {
  font-size: 12px;
  line-height: 1.3;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.resolution__note {
  margin: 6px 0 0;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--warn) 14%, var(--surface-1));
  font-size: 12px;
  line-height: 1.35;
}

.resolution__actions {
  display: flex;
  margin-top: 10px;
}

.resolution__button {
  flex: 1;
  min-height: var(--tap);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  touch-action: manipulation;
}

.resolution__button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
