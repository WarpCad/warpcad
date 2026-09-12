/**
 * What is currently selected — UI state, exactly the kind CLAUDE.md says Pinia is
 * for (selection, active tool, panel layout).
 *
 * `TODO/ui-010` only needs to *set* this: a freshly dropped body becomes the
 * current selection so `ui-011` has something to react to. The inspector, the
 * dimension lines and the transform gizmo are `ui-011`'s job and deliberately are
 * not built here.
 *
 * `count` exists from the start because CLAUDE.md gates tool enablement on
 * selection **count**, not selection presence — a store that only answered "is
 * something selected?" would push every tool into re-deriving the count itself.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useSelectionStore = defineStore('selection', () => {
  /** @type {import('vue').Ref<string[]>} */
  const ids = ref([])

  /**
   * How deep inside the selected body the selection currently points
   * (`TODO/ui-016`), or `null` for the ordinary whole-body selection.
   *
   * A second dimension rather than a different kind of selection: `ids` still
   * says *which body*, and drilling in never changes it, so stepping back up is
   * a matter of dropping this and nothing else. That is what lets the gizmo's
   * whole-group contract return byte-identically from the breadcrumb.
   *
   * @type {import('vue').Ref<{ bodyId: string, partName: string } | null>}
   */
  const subPart = ref(null)

  /**
   * The selected **sketch entity**, or `null` (`TODO/ui-020`).
   *
   * A separate ref rather than another id in {@link ids}, deliberately. Every
   * count-gated tool in this app reads `count` — the Operations toolbar's
   * Union/Subtract, the gizmo's "exactly one body" precondition — and CLAUDE.md
   * gates those on the number of *applicable* operands. A sketch line is not a
   * solid: putting its id into `ids` would light up Union with a line as an
   * operand, which is the creation-vs-operation failure that rule exists to
   * prevent, discovered at the point the kernel was handed something it cannot
   * boolean.
   *
   * The two are mutually exclusive, which is why every path that sets one
   * clears the other: a click selects one thing.
   *
   * @type {import('vue').Ref<string | null>}
   */
  const sketchId = ref(null)

  /**
   * Drop a pick depth that no longer names the single selected body.
   *
   * Called from the paths that *replace* a selection. Deliberately not from
   * {@link toggle}: the additive path is untouched by this task, and a depth
   * left behind by a Shift-click is inert anyway, because `describeSelection`
   * only honours one whose `bodyId` is the single selected body.
   */
  function pruneSubPart() {
    const current = subPart.value
    if (!current) return
    if (ids.value.length !== 1 || ids.value[0] !== current.bodyId) subPart.value = null
  }

  /**
   * Replace the selection with a single id, or clear it when given nothing.
   *
   * @param {string | null | undefined} id
   * @returns {void}
   */
  function select(id) {
    ids.value = id ? [id] : []
    sketchId.value = null
    pruneSubPart()
  }

  /**
   * Select one sketch entity, replacing whatever was selected before — bodies
   * included. See {@link sketchId} for why this is not just another id in
   * {@link ids}.
   *
   * @param {string | null | undefined} id
   * @returns {void}
   */
  function selectSketch(id) {
    ids.value = []
    subPart.value = null
    sketchId.value = id || null
  }

  /**
   * Narrow the selection to one named part **inside** the already-selected body
   * — control 6's pick depth. Called with a part name the raycast actually landed
   * on, so a second click on a sibling re-targets straight to it rather than
   * having to step up first.
   *
   * A no-op unless exactly one body is selected: control 6's precondition is
   * that a group is already selected as a whole, and a depth hung off a multi-
   * or empty selection would describe something the user is not looking at.
   *
   * @param {string | null | undefined} partName
   * @returns {void}
   */
  function drillInto(partName) {
    if (!partName || ids.value.length !== 1) return
    subPart.value = { bodyId: ids.value[0], partName }
  }

  /**
   * Step back out to the whole body, leaving {@link ids} alone — the
   * breadcrumb's group segment, and a UI affordance only: nothing here
   * raycasts.
   *
   * @returns {void}
   */
  function stepUp() {
    subPart.value = null
  }

  /**
   * Add an id to the selection, or drop it if it is already there.
   *
   * The minimum multi-select `ui-011` needs to reach the "2+ selected" Inspector
   * state control 3's Q15 specifies — deliberately *only* that. The Operations
   * toolbar that multi-selection eventually feeds (a live count badge, the
   * base/subtrahend order indicator, count-gated boolean buttons) is `ui-014`'s
   * contract, and building any of it here would leave it half-owned.
   *
   * Clearing to nothing when the last selected id is toggled off is the same
   * end state as clicking empty space, so the Inspector, gizmo and dimension
   * lines all fall back to their empty contract without a special case.
   *
   * @param {string | null | undefined} id
   * @returns {void}
   */
  function toggle(id) {
    if (!id) return
    // Additive body selection and sketch selection are still exclusive: adding
    // a body to the selection is a statement about solids.
    sketchId.value = null
    ids.value = ids.value.includes(id)
      ? ids.value.filter((candidate) => candidate !== id)
      : [...ids.value, id]
  }

  function clear() {
    ids.value = []
    sketchId.value = null
    pruneSubPart()
  }

  /**
   * Replace the selection with a whole set of ids, or add them to whatever is
   * already selected — the marquee-select response (`TODO/ui-024`): replacing
   * on a plain drag, matching what a plain click already does; adding when
   * the drag is additive, matching what Shift already means for a click.
   *
   * An empty `selectedIds` in additive mode is a no-op: "the drag enclosed
   * nothing" must not clear a selection the user already had. In replace
   * mode an empty list *does* clear it, the same as {@link select}'s own
   * empty-clears-everything contract — a marquee dragged over nothing is the
   * drag-gesture equivalent of clicking empty space.
   *
   * @param {string[]} selectedIds
   * @param {boolean} [additive]
   * @returns {void}
   */
  function selectMany(selectedIds, additive = false) {
    if (!additive) {
      ids.value = [...selectedIds]
      sketchId.value = null
      pruneSubPart()
      return
    }
    if (selectedIds.length === 0) return
    const next = new Set(ids.value)
    for (const id of selectedIds) next.add(id)
    ids.value = [...next]
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  function has(id) {
    return ids.value.includes(id)
  }

  return {
    ids,
    subPart,
    sketchId,
    count: computed(() => ids.value.length),
    onlyId: computed(() => (ids.value.length === 1 ? ids.value[0] : null)),
    select,
    selectSketch,
    toggle,
    selectMany,
    drillInto,
    stepUp,
    clear,
    has,
  }
})
