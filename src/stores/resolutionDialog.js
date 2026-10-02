// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * **File ▾ → Resolution…** (`TODO/core-035`, surface A) — the design resolution popover's
 * state. Every rule lives here; `ResolutionPopover.vue` is layout.
 *
 * ## Interaction model (the TODO's own, restated as what this store answers)
 *
 * - **Precondition** — none: the resolution is a document property, available with or
 *   without a selection. While History is previewing it is refused with a reason, like
 *   every other document write ({@link unavailableReason}).
 * - **Trigger** — the File menu's `Resolution: Normal` row (`stores/fileMenu.js`'s
 *   `requestResolution`), whose label is {@link menuLabel}, so the setting can be read
 *   without opening anything.
 * - **Feedback** — {@link choose} commits at once through the document store: curved
 *   bodies re-facet, the header's Undo reads `Undo Resolution → Fine`, and the status chip
 *   announces it. The setting is not a History row, deliberately: it is a property of
 *   the whole design, not a step in its log (the TODO's own design decision), so it
 *   lives on the Undo stack and on the menu label instead.
 *
 * @module stores/resolutionDialog
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  CHOOSABLE_RESOLUTIONS,
  isResolution,
  resolutionHint,
  resolutionLabel,
} from '../core/kernel/tessellation.js'
import { useDocumentStore } from './document.js'
import { usePersistenceStore } from './persistence.js'
import { useTimelineStore } from './timeline.js'

/**
 * @typedef {object} ResolutionOption
 * @property {string} value A resolution id.
 * @property {string} label `Fine`, or `Legacy (32 segments)`.
 * @property {string} hint What it means at a reference hole: `Ø20 hole: 52 sides, ≤0.02 mm off`.
 */

export const useResolutionDialogStore = defineStore('resolutionDialog', () => {
  const documentStore = useDocumentStore()
  const timeline = useTimelineStore()
  const persistence = usePersistenceStore()

  const isOpen = ref(false)

  /** The active design resolution — the store's own reactive mirror of the document. */
  const current = computed(() => documentStore.resolution)

  /** What the File menu row says: `Resolution: Normal`. */
  const menuLabel = computed(() => `Resolution: ${resolutionLabel(current.value)}`)

  /**
   * The radio rows: the four presets, plus Legacy **only while it is the active value**
   * — it exists to keep an old file's geometry unchanged, and is never something to
   * choose on purpose.
   *
   * @type {import('vue').ComputedRef<ResolutionOption[]>}
   */
  const options = computed(() =>
    [...(current.value === 'legacy' ? ['legacy'] : []), ...CHOOSABLE_RESOLUTIONS].map((value) => ({
      value,
      label: resolutionLabel(value),
      hint: resolutionHint(value),
    }))
  )

  /** Non-empty when the setting cannot be changed right now, and why. */
  const unavailableReason = computed(() =>
    timeline.previewing ? 'Return to the latest step to change resolution' : ''
  )

  function open() {
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
  }

  /**
   * Commit a new design resolution. A no-op for the current value, an unknown one, or
   * while unavailable (the radios are disabled then; this is the belt to their braces).
   *
   * @param {string} value
   * @returns {boolean} Whether the document changed.
   */
  function choose(value) {
    if (unavailableReason.value !== '' || !isResolution(value) || value === current.value) return false
    documentStore.setResolution(value)
    persistence.announce(`Resolution → ${resolutionLabel(value)}`)
    return true
  }

  return { isOpen, current, menuLabel, options, unavailableReason, open, close, choose }
})
