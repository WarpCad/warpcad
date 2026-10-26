// SPDX-License-Identifier: AGPL-3.0-or-later
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
   * The part each selected body is **addressed** at (`TODO/ui-063`), keyed by lineage-root
   * id: `{ [bodyId]: partName }`. A body with no entry is selected whole.
   *
   * Until `ui-063` this was one slot, `subPart: { bodyId, partName } | null`, for the whole
   * selection, so addressing `piMountingPost1` on a screen silently overwrote `hole1` on the
   * Pi that was already addressed, and Snap/Align measured the Pi whole. One entry per body
   * is what lets a commit name a part on **both** sides — the V1 assembly idiom
   * `align('piMountingPad1', rpi.parts.hole1, 'xy')` is exactly that.
   *
   * A second dimension rather than a different kind of selection: `ids` still says *which
   * bodies*, and addressing never changes it, so `count` — what every count gate reads —
   * is untouched by depth (`ui-040`'s invariant).
   *
   * Entries may outlive their body's place in `ids`, but only one way: {@link toggle}
   * *parks* the address of a body it takes out (so `ui-040`'s documented "Shift-click the
   * drilled body out, add the base, Shift-click it back in" lands it second with its part
   * still addressed — `docs/booleans.md`). A parked entry is inert: {@link addresses},
   * {@link partOf} and {@link subPart} only ever report bodies that are selected, so it is
   * never an operand, never a lit row and never a breadcrumb. Every path that *replaces* the
   * selection drops parked entries outright.
   *
   * @type {import('vue').Ref<Record<string, string>>}
   */
  const addressMap = ref({})

  /**
   * The live addresses: {@link addressMap} restricted to bodies in the selection, in
   * selection order.
   *
   * @type {import('vue').ComputedRef<Record<string, string>>}
   */
  const addresses = computed(() => {
    /** @type {Record<string, string>} */
    const live = {}
    for (const id of ids.value) {
      const partName = addressMap.value[id]
      if (partName) live[id] = partName
    }
    return live
  })

  /**
   * The single-body view of the pick depth (`TODO/ui-016`) — what the breadcrumb, the gizmo
   * and `describeSelection` read. Exactly the shape the one slot used to have, and `null`
   * unless **exactly one** body is selected and it is addressed: a multi-selection's
   * addresses are operands, not a breadcrumb, and are read through {@link partOf}.
   *
   * @type {import('vue').ComputedRef<{ bodyId: string, partName: string } | null>}
   */
  const subPart = computed(() => {
    if (ids.value.length !== 1) return null
    const bodyId = ids.value[0]
    const partName = addressMap.value[bodyId]
    return partName ? { bodyId, partName } : null
  })

  /**
   * The part a **selected** body is addressed at, or `null` (whole, or not selected).
   *
   * @param {string | null | undefined} bodyId
   * @returns {string | null}
   */
  function partOf(bodyId) {
    if (!bodyId || !ids.value.includes(bodyId)) return null
    return addressMap.value[bodyId] ?? null
  }

  /**
   * @param {string} bodyId
   * @param {string | null} partName `null` drops the address.
   * @returns {void}
   */
  function setAddress(bodyId, partName) {
    const next = { ...addressMap.value }
    if (partName) next[bodyId] = partName
    else delete next[bodyId]
    addressMap.value = next
  }

  /**
   * After a path that *replaces* the selection: keep only the address of the one body that
   * is still the whole selection, if it had one, and drop everything else — parked entries
   * included. Exactly the old `pruneSubPart`, generalised over the map.
   */
  function pruneAddresses() {
    if (Object.keys(addressMap.value).length === 0) return
    const only = ids.value.length === 1 ? ids.value[0] : null
    const kept = only && addressMap.value[only] ? { [only]: addressMap.value[only] } : {}
    addressMap.value = kept
  }

  /**
   * Replace the selection with a single id, or clear it when given nothing.
   *
   * @param {string | null | undefined} id
   * @returns {void}
   */
  function select(id) {
    ids.value = id ? [id] : []
    pruneAddresses()
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
    addressMap.value = { [ids.value[0]]: partName }
  }

  /**
   * Address one named part of a body **by that body's id** — the Objects list's route to
   * a part of a body no click can reach (`TODO/ui-042`).
   *
   * {@link drillInto} cannot do this and is deliberately left alone: it is the viewport's
   * second-click path, it takes no body id (it trusts that the one selected body is the one
   * the click landed on), and its "exactly one body selected" rule is `ui-016`'s contract.
   * A list row *names* its body, so this action is explicit about which one, and it may
   * therefore also express "this body is the *second* operand and is addressed at a part" —
   * a state a viewport click can only reach through `ui-040`'s toggle-out-and-back-in dance.
   *
   * - **Plain** — the body becomes the whole selection, drilled: exactly `select(bodyId)`
   *   then `drillInto(partName)`. A repeat on the same part leaves it drilled, and a tap on
   *   a sibling re-targets, as a repeat / sibling viewport click does.
   * - **Additive** — the body joins the selection **at the end** (so whatever was picked
   *   first stays the boolean's base — `ui-014`/`ui-040`) with the depth on it; a body that
   *   is already selected keeps its position and only the depth changes. Additive on the
   *   part that is *already* addressed steps back up to the whole body and leaves the body
   *   selected, mirroring how a check toggles.
   *
   * Depth never touches {@link ids}, so `count` — the number every count gate reads — is
   * unchanged by it (`ui-040`'s invariant). Each body keeps its **own** address
   * (`TODO/ui-063`): addressing a part on a second body *adds* an address for that body and
   * leaves the first body's alone, so "Pi › hole1 against screen › piMountingPost1" is one
   * selection. It used to move a single slot, which silently measured the Pi whole.
   *
   * @param {string | null | undefined} bodyId
   * @param {string | null | undefined} partName
   * @param {boolean} [additive]
   * @returns {void}
   */
  function selectPart(bodyId, partName, additive = false) {
    if (!bodyId || !partName) return
    if (!additive) {
      ids.value = [bodyId]
      addressMap.value = { [bodyId]: partName }
      return
    }
    if (partOf(bodyId) === partName) {
      setAddress(bodyId, null)
      return
    }
    if (!ids.value.includes(bodyId)) ids.value = [...ids.value, bodyId]
    setAddress(bodyId, partName)
  }

  /**
   * Step back out to the whole body, leaving {@link ids} alone — the
   * breadcrumb's group segment, and a UI affordance only: nothing here
   * raycasts.
   *
   * With a `bodyId`, only that body steps up and every other body keeps its address
   * (`TODO/ui-063`); without one, every body does — the breadcrumb's and a plain Objects
   * list row tap's meaning, both of which only ever see one selected body.
   *
   * @param {string} [bodyId]
   * @returns {void}
   */
  function stepUp(bodyId) {
    if (bodyId === undefined) addressMap.value = {}
    else setAddress(bodyId, null)
  }

  /**
   * Put addresses back after a path that rebuilt the selection from ids alone — a merge
   * or an Undo restoring the selection a step recorded (`stores/document.js`'s
   * `restoreSelection`). Only bodies that are selected take one; anything else in
   * `addressesByBody` is ignored. The caller checks the part still exists.
   *
   * @param {Record<string, string>} addressesByBody
   * @returns {void}
   */
  function restoreAddresses(addressesByBody) {
    /** @type {Record<string, string>} */
    const next = {}
    for (const id of ids.value) {
      const partName = addressesByBody[id]
      if (typeof partName === 'string' && partName !== '') next[id] = partName
    }
    addressMap.value = next
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
   * Taking a body out *parks* its address rather than deleting it (see
   * {@link addressMap}): inert while the body is out, live again if it is toggled
   * straight back in — `ui-040`'s documented base-first route.
   *
   * @param {string | null | undefined} id
   * @returns {void}
   */
  function toggle(id) {
    if (!id) return
    ids.value = ids.value.includes(id)
      ? ids.value.filter((candidate) => candidate !== id)
      : [...ids.value, id]
  }

  function clear() {
    ids.value = []
    addressMap.value = {}
  }

  /**
   * Take one body out of the selection **and forget its address** (`TODO/ui-089`: the body was
   * just hidden). Unlike {@link toggle}, which parks the address so a body toggled straight
   * back in keeps its part, a hidden body ticked back in from the Objects list comes back
   * whole: the part it was addressed at may be the very thing that was hidden. Every other
   * body keeps its place and its address. A body that is not selected is a no-op.
   *
   * @param {string | null | undefined} id
   * @returns {void}
   */
  function deselect(id) {
    if (!id) return
    if (ids.value.includes(id)) ids.value = ids.value.filter((candidate) => candidate !== id)
    if (Object.hasOwn(addressMap.value, id)) setAddress(id, null)
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
      pruneAddresses()
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
    addresses,
    count: computed(() => ids.value.length),
    onlyId: computed(() => (ids.value.length === 1 ? ids.value[0] : null)),
    select,
    toggle,
    selectMany,
    drillInto,
    selectPart,
    partOf,
    stepUp,
    restoreAddresses,
    clear,
    deselect,
    has,
  }
})
