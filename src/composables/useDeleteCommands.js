// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The one Delete command (`TODO/ui-051`) — what the Delete/Backspace keys and the
 * Inspector's **Delete** / **Remove part** button all call, so the three triggers can
 * never disagree about what gets removed or when it is allowed.
 *
 * Two depths, read off the selection:
 *
 * - **Body depth** — 1 or more bodies selected. Every one is deleted, as one undoable
 *   step (`Delete Cube 1`, `Delete 3 objects`). Delete is not an operand-count tool
 *   like a boolean: removing N selected things is one well-defined action, so it is
 *   enabled at 1+, never at 0.
 * - **Sub-part depth** — exactly one body selected and drilled into one of its parts
 *   (`ui-016`'s `Raspberry Pi 1 ▸ usb1`). Only that part is removed
 *   (`Remove usb1 from Raspberry Pi 1`); the body stays and the selection steps back
 *   up to it. Refused when the part is the body's last *visible* one — then what the
 *   user wants is to delete the body, and the reason says so.
 *
 * Never available mid-gesture (a placement drag or a gizmo drag), in sketch mode, or
 * while History previews a past state (read-only, §14) — each named in `reason`, which
 * the button shows as its tooltip.
 *
 * The mutation itself, the selection bookkeeping and the undo meta live in
 * `src/stores/document.js` (`deleteBodies`/`removePart`); this file only decides.
 *
 * @module composables/useDeleteCommands
 */

import { computed, ref } from 'vue'

import { useDocumentStore } from '../stores/document.js'
import { usePlacementStore } from '../stores/placement.js'
import { useSelectionStore } from '../stores/selection.js'
import { useSketchEditorStore } from '../stores/sketchEditor.js'
import { useTimelineStore } from '../stores/timeline.js'
import { useTransformPreviewStore } from '../stores/transformPreview.js'

/**
 * @typedef {object} DeleteTarget
 * @property {'bodies' | 'part'} kind
 * @property {string[]} ids Body ids (for `part`, the one parent body).
 * @property {string} [partName]
 * @property {string} [bodyName] The parent body's name, for `part`.
 */

export function useDeleteCommands() {
  const documentStore = useDocumentStore()
  const selection = useSelectionStore()
  const placement = usePlacementStore()
  const transformPreview = useTransformPreviewStore()
  const sketchEditor = useSketchEditorStore()
  const timeline = useTimelineStore()

  /** The last refusal the document layer gave, shown under the button. */
  const error = ref('')

  /** @type {import('vue').ComputedRef<DeleteTarget | null>} */
  const target = computed(() => {
    const live = new Set(documentStore.bodies.map((body) => body.id))
    const ids = selection.ids.filter((id) => live.has(id))
    if (ids.length === 0) return null
    const subPart = selection.subPart
    if (ids.length === 1 && subPart && subPart.bodyId === ids[0]) {
      const body = documentStore.bodies.find((candidate) => candidate.id === ids[0])
      return { kind: 'part', ids, partName: subPart.partName, bodyName: body?.name ?? ids[0] }
    }
    return { kind: 'bodies', ids }
  })

  /** Why the control is disabled, or `''` when it is enabled. */
  const reason = computed(() => {
    if (sketchEditor.active) return 'Not available while editing a sketch'
    if (placement.isDragging) return 'Finish placing first'
    if (transformPreview.isActive) return 'Finish the drag first'
    if (timeline.previewing) return 'Previewing history — read-only'
    const current = target.value
    if (!current) return 'Select an object to delete'
    if (current.kind === 'part') {
      const body = documentStore.bodies.find((candidate) => candidate.id === current.ids[0])
      const visible = body?.partNames ?? []
      if (visible.length === 1 && visible[0] === current.partName) {
        return `Last visible part: delete ${current.bodyName} instead`
      }
    }
    return ''
  })

  const enabled = computed(() => reason.value === '')

  /** What the button says, and what it will do. */
  const label = computed(() => (target.value?.kind === 'part' ? 'Remove part' : 'Delete'))

  /** A longer description for the tooltip / aria-label when enabled. */
  const describe = computed(() => {
    const current = target.value
    if (!current) return label.value
    if (current.kind === 'part') return `Remove ${current.partName} from ${current.bodyName}`
    if (current.ids.length === 1) {
      const body = documentStore.bodies.find((candidate) => candidate.id === current.ids[0])
      return `Delete ${body?.name ?? 'object'}`
    }
    return `Delete ${current.ids.length} objects`
  })

  /**
   * Run the delete. Returns whether anything was removed; a refusal from the document
   * layer is kept in {@link error} rather than thrown, so a key press never surfaces
   * an uncaught exception.
   *
   * @returns {boolean}
   */
  function run() {
    error.value = ''
    const current = target.value
    if (!enabled.value || !current) return false
    try {
      if (current.kind === 'part') {
        documentStore.removePart(current.ids[0], /** @type {string} */ (current.partName))
      } else {
        documentStore.deleteBodies(current.ids)
      }
      return true
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught)
      return false
    }
  }

  return { target, enabled, reason, label, describe, error, run }
}
