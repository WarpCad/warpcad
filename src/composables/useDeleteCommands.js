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
 * A linked Repeat (`TODO/ui-069`, `TODO/core-061` decisions 7 and 8) adds two cases:
 *
 * - **One member** — drilled into `hole3` of a repeat body (or into one of that member's own
 *   parts, `hole3.tap`), the button reads **Remove this repeat** and removes just that member
 *   (core drops the target: one Undo step). The last member removes the repeat body.
 * - **A body repeats follow** — deleting Bolt 1 (or the Pi its repeats are aimed at) would
 *   break them, which core refuses. Instead of that refusal, the command asks: **Delete the
 *   repeats too** or **Leave them broken** (`stores/repeat.js`'s `deleteConfirm`, shared with
 *   the Delete key's own instance of this command), answered by {@link resolveDelete}.
 *
 * The mutation itself, the selection bookkeeping and the undo meta live in
 * `src/stores/document.js` (`deleteBodies`/`removePart`); this file only decides.
 *
 * @module composables/useDeleteCommands
 */

import { computed, ref } from 'vue'

import { useDocumentStore } from '../stores/document.js'
import { usePlacementStore } from '../stores/placement.js'
import { useRepeatStore } from '../stores/repeat.js'
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
 * @property {string} [member] `TODO/ui-069`: the repeat member the part belongs to, when the
 *   body is a repeat — what Delete removes.
 * @property {boolean} [lastMember] It is the repeat's only member, so the body goes with it.
 */

export function useDeleteCommands() {
  const documentStore = useDocumentStore()
  const selection = useSelectionStore()
  const placement = usePlacementStore()
  const transformPreview = useTransformPreviewStore()
  const sketchEditor = useSketchEditorStore()
  const timeline = useTimelineStore()
  const repeat = useRepeatStore()

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
      /** @type {DeleteTarget} */
      const part = { kind: 'part', ids, partName: subPart.partName, bodyName: body?.name ?? ids[0] }
      // A member of a repeat is named by its target; its own parts ride under `<target>.`.
      const targets = body?.repeat?.targets ?? []
      const member = targets.find((name) => subPart.partName === name || subPart.partName.startsWith(`${name}.`))
      if (member !== undefined) {
        part.member = member
        part.lastMember = targets.length === 1
      }
      return part
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
    if (current.kind === 'part' && current.member === undefined) {
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
  const label = computed(() => {
    const current = target.value
    if (current?.kind !== 'part') return 'Delete'
    return current.member === undefined ? 'Remove part' : 'Remove this repeat'
  })

  /** A longer description for the tooltip / aria-label when enabled. */
  const describe = computed(() => {
    const current = target.value
    if (!current) return label.value
    if (current.kind === 'part' && current.member !== undefined) return `Remove the repeat on ${current.member}`
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
      if (current.kind === 'part' && current.lastMember) {
        // Core would delete the repeat body here anyway; deleting it as a body clears the
        // selection the way every other delete does, rather than leaving it on a gone body.
        documentStore.deleteBodies(current.ids)
      } else if (current.kind === 'part') {
        documentStore.removePart(current.ids[0], /** @type {string} */ (current.member ?? current.partName))
      } else if (repeat.askDelete(current.ids)) {
        // Repeats follow one of these bodies: the question is on screen, nothing is deleted yet.
        return false
      } else {
        documentStore.deleteBodies(current.ids)
      }
      return true
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught)
      return false
    }
  }

  /**
   * Answer the pending delete question (`TODO/ui-069`): `'with-repeats'` deletes the repeats
   * along with what they follow, `'leave-broken'` deletes only what was asked and leaves the
   * repeat rows broken in History (each one undo step), `null` cancels. Returns whether
   * anything was deleted.
   *
   * @param {'with-repeats' | 'leave-broken' | null} choice
   * @returns {boolean}
   */
  function resolveDelete(choice) {
    error.value = ''
    const pending = repeat.deleteConfirm
    repeat.clearDeleteConfirm()
    if (!pending || choice === null) return false
    const followers = pending.followers.map((follower) => follower.id)
    try {
      if (choice === 'with-repeats') documentStore.deleteBodies([...pending.ids, ...followers])
      else documentStore.deleteBodies(pending.ids, { leaveBroken: followers })
      return true
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught)
      return false
    }
  }

  return { target, enabled, reason, label, describe, error, run, resolveDelete }
}
