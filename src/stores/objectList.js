// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The object list's state and its actions — **UI only** (`TODO/ui-041`; moved into the
 * Inspector by `TODO/ui-049`, which retired the separate Objects panel, its header toggle
 * and its `open` state, and renamed this store from `objectsPanel` since nothing here is a
 * panel any more).
 *
 * The list exists because a body can be entirely inside another, and every other
 * selection route in the app is a raycast that hits the enclosing solid first. Its rows
 * name a body and select it through the **ordinary** selection store, so a body picked
 * from here is indistinguishable, downstream, from a clicked one: same highlight, same
 * Inspector, same gizmo, same count gate for the Operations toolbar.
 *
 * ## Two selections, still never one (`data-002` §13)
 *
 * A History row is a *timeline step*; an Objects row is a *body*. This store touches
 * `useSelectionStore` and never `useTimelineStore.selectRow`, and the timeline store
 * never touches this one — the same separation §13 confirmed.
 *
 * ## Where the list lives (`TODO/ui-049`)
 *
 * In the Inspector: its whole content with nothing selected, and a collapsible **Objects**
 * section at the top of every other state — collapsed by default at 1 selected (the body's
 * own detail is the focus), expanded by default at 2+ (where operand order matters). The
 * section's open/closed state per state is held here, UI-only and remembered for the
 * session. One more rule makes the two-operand route work with no keyboard: a **check**
 * (an additive gesture) leaves the section open for the next operand — for as long as the
 * selection keeps changing through the list — and a **plain** row tap folds it, because a
 * plain tap names one body — "the list must not vanish on the
 * first tap" of a multi-selection, and does not linger over a body the user asked to see.
 *
 * ## What the rows show
 *
 * Whatever the viewport is *announcing* — {@link BodySummary}s from the live document,
 * or from the previewed prefix while History is previewing. It reads the same two
 * sources `Viewport.vue`'s `announcedBodies` does, so the list cannot name a body the
 * scene does not contain: a body past a rollback marker, or one whose step is
 * suppressed, has no summary at all and therefore no row.
 *
 * @module stores/objectList
 */

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { formatMmValue } from '../core/units.js'
import { useDocumentStore } from './document.js'
import { useSelectionStore } from './selection.js'
import { useSketchEditorStore } from './sketchEditor.js'
import { useTimelineStore } from './timeline.js'

/**
 * @typedef {object} ObjectRow
 * @property {string} id A body's lineage-root id — what the selection store holds.
 * @property {string} name Display name (`Cube 1`, `Bolt 1`).
 * @property {string} size `W × D × H mm`, off the world-axis bounding box — what tells a
 *   40 mm shell from the 10 mm bolt inside it when both are called something generic.
 * @property {boolean} selected
 * @property {number} order 1-based position in the selection (1 = Subtract's base), or 0.
 * @property {'base' | 'secondary' | 'none'} role
 * @property {boolean} expandable Whether the body is a composite with parts to show
 *   (`TODO/ui-042`) — a bare solid is not, and gets no chevron.
 * @property {boolean} expanded Whether its part rows are showing. Always `false` when not
 *   {@link ObjectRow.expandable}.
 * @property {PartRow[]} parts Visible parts in group order, then hidden ones. `[]` for a
 *   bare solid, whether or not the row is expanded — the rows carry the tree, the
 *   component decides when to draw it.
 * @property {string | null} drilledPart The part this body is currently addressed at, or
 *   `null` — shown on the row even while it is collapsed so an address is never invisible.
 *   Only ever set for a body that is in the selection.
 */

/**
 * @typedef {object} PartRow
 * @property {string} name The part's name, exactly as `pieces` takes it.
 * @property {boolean} hidden In the group but not drawn (a tap-clearance solid): listed
 *   anyway, because it is exactly what a boolean wants to address.
 * @property {boolean} selected Whether this is the part its body is currently addressed at.
 * @property {number} order The parent body's 1-based place in the selection when this part
 *   is the addressed one, else 0 — Subtract's base is 1.
 * @property {'base' | 'secondary' | 'none'} role As {@link ObjectRow.role}, for this part.
 */

export const useObjectListStore = defineStore('objectList', () => {
  const documentStore = useDocumentStore()
  const selection = useSelectionStore()
  const timeline = useTimelineStore()
  const sketchEditor = useSketchEditorStore()

  /**
   * Whether the Inspector's **Objects** section is open at exactly 1 selected — collapsed
   * by default, so the selected body's detail is the focus (`TODO/ui-049`). Not persisted:
   * session UI state, like every other panel layout choice.
   */
  const singleSectionOpen = ref(false)

  /** The same, at 2+ selected — expanded by default: the list is where operand order shows. */
  const multiSectionOpen = ref(true)

  /**
   * Set by a list **check** (an additive gesture): the user is building a multi-selection
   * from the list, so the section stays open for the next operand even at 1 selected —
   * "the list must not vanish on the first tap". Transient on purpose: it is cleared by a
   * plain row tap and by any selection change that did not come from the list (a viewport
   * click), which then falls back to {@link singleSectionOpen}, the remembered preference.
   */
  const keepOpenForOperands = ref(false)

  /** True while this store is itself changing the selection, so its own change is not "elsewhere". */
  let choosing = false

  watch(
    () => [...selection.ids, selection.subPart?.bodyId, selection.subPart?.partName],
    () => {
      if (!choosing) keepOpenForOperands.value = false
    },
    { flush: 'sync' },
  )

  /**
   * Why the rows cannot select right now, or `''`. Printed in the list rather than
   * left as a silently dead list — the "looks live but isn't" class.
   */
  const disabledReason = computed(() => {
    if (timeline.previewing) return 'Previewing history — read-only. Go back to the latest state to select.'
    if (sketchEditor.active) return 'Editing a sketch — tap Done or Cancel to select solids.'
    return ''
  })

  /** The scene as announced: the previewed prefix while previewing, else the live one. */
  const bodies = computed(() => timeline.previewBodies ?? documentStore.bodies)

  /**
   * Lineage-root ids of the bodies whose part rows are showing (`TODO/ui-042`) — **UI-only**
   * state, exactly what `CLAUDE.md` keeps in a store and out of the document.
   *
   * Keyed by the body's lineage-root id, so a move, a rename or a param edit (all of which
   * supersede the record but keep the root) leave an expansion alone. A body that leaves the
   * *live* scene — deleted, undone, rolled back, suppressed — forgets it, so the state cannot
   * grow without bound and a body that later reappears (or a different document that reuses
   * `pi-1`) starts collapsed rather than inheriting a stale open row. That is watched against
   * the live document, deliberately not against {@link bodies}: History's preview swaps that
   * to a prefix, and merely looking at a past step must not collapse anything.
   *
   * @type {import('vue').Ref<string[]>}
   */
  const expandedIds = ref([])

  watch(
    () => documentStore.bodies,
    (live) => {
      if (expandedIds.value.length === 0) return
      const present = new Set(live.map((body) => body.id))
      const kept = expandedIds.value.filter((id) => present.has(id))
      if (kept.length !== expandedIds.value.length) expandedIds.value = kept
    },
    { flush: 'sync' },
  )

  /** @type {import('vue').ComputedRef<ObjectRow[]>} */
  const rows = computed(() =>
    bodies.value.map((body) => {
      const index = selection.ids.indexOf(body.id)
      const [min, max] = body.bounds
      const role = index === -1 ? 'none' : index === 0 ? 'base' : 'secondary'
      // A depth only means something on a body that is in the selection: `toggle` leaves it
      // behind on a body that was checked out, and that stale address must not light up a
      // child row (`ui-040` designed it to be inert until the body is checked back in).
      const drilled =
        index !== -1 && selection.subPart?.bodyId === body.id ? selection.subPart.partName : null
      const partNames = body.partNames ?? []
      const expandable = partNames.length > 0
      /** @type {PartRow[]} */
      const parts = [
        ...partNames.map((name) => ({ name, hidden: false })),
        ...(body.hiddenPartNames ?? []).map((name) => ({ name, hidden: true })),
      ].map((part) => {
        const addressed = drilled === part.name
        return {
          ...part,
          selected: addressed,
          order: addressed ? index + 1 : 0,
          role: addressed ? role : 'none',
        }
      })
      return {
        id: body.id,
        name: body.name,
        size: `${formatMmValue(max[0] - min[0])} × ${formatMmValue(max[1] - min[1])} × ${formatMmValue(max[2] - min[2])} mm`,
        selected: index !== -1,
        order: index + 1,
        role,
        expandable,
        expanded: expandable && expandedIds.value.includes(body.id),
        parts: expandable ? parts : [],
        drilledPart: drilled,
      }
    })
  )

  /**
   * Whether the Inspector's Objects section is open for a selection of `count` bodies. At 0
   * the list is the Inspector's whole content and is always open.
   *
   * @param {number} count
   * @returns {boolean}
   */
  function isSectionOpen(count) {
    if (count <= 0) return true
    return count === 1 ? singleSectionOpen.value || keepOpenForOperands.value : multiSectionOpen.value
  }

  /**
   * @param {number} count
   * @param {boolean} next
   * @returns {void}
   */
  function setSectionOpen(count, next) {
    if (count <= 0) return
    if (count === 1) {
      singleSectionOpen.value = next
      if (!next) keepOpenForOperands.value = false
    } else multiSectionOpen.value = next
  }

  /**
   * @param {number} count
   * @returns {void}
   */
  function toggleSection(count) {
    setSectionOpen(count, !isSectionOpen(count))
  }

  /**
   * Select the body a row names.
   *
   * - **Plain** — the row becomes the whole selection, and any pick depth is dropped: a
   *   row names a *body*, so choosing it means the whole body, the way a first click on
   *   a group in the viewport does.
   * - **Additive** — Shift/Ctrl/Cmd-click on the row, or the row's own check button,
   *   which is how a touch screen (no Shift key) reaches "2 selected". Exactly what
   *   Shift-click in the viewport does: `toggle`, which is also the one path that
   *   leaves a pick depth alone, so `ui-040`'s sub-part operands still compose.
   *
   * A no-op while {@link disabledReason} is set, and for an id the announced scene
   * does not contain — never a selection of a body that is not there.
   *
   * @param {string} id
   * @param {boolean} [additive]
   * @returns {boolean} Whether the selection changed.
   */
  function choose(id, additive = false) {
    if (disabledReason.value) return false
    if (!bodies.value.some((body) => body.id === id)) return false
    choosing = true
    try {
      if (additive) {
        selection.toggle(id)
      } else {
        selection.select(id)
        selection.stepUp()
      }
    } finally {
      choosing = false
    }
    settleSection(additive)
    return true
  }

  /**
   * After a row gesture: a check keeps the list open for the next operand; a plain tap names
   * one body and hands the Inspector over to it, folding the list (`TODO/ui-049`).
   *
   * @param {boolean} additive
   * @returns {void}
   */
  function settleSection(additive) {
    keepOpenForOperands.value = additive
    if (!additive) singleSectionOpen.value = false
  }

  /**
   * Show or hide a composite body's part rows. Read-only: it selects nothing and touches no
   * document state, so it stays available while the rows themselves are disabled (sketch
   * mode, a History preview) — reading a part's name is not a selection. A no-op for a body
   * with no parts, so there is no expanded state to be stale on a row with no chevron.
   *
   * @param {string} id A body's lineage-root id.
   * @returns {void}
   */
  function toggleExpanded(id) {
    if (expandedIds.value.includes(id)) {
      expandedIds.value = expandedIds.value.filter((candidate) => candidate !== id)
      return
    }
    const body = bodies.value.find((candidate) => candidate.id === id)
    if (!body || (body.partNames ?? []).length === 0) return
    expandedIds.value = [...expandedIds.value, id]
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  function isExpanded(id) {
    return expandedIds.value.includes(id)
  }

  /**
   * Select one part of a body, through the ordinary selection store — see
   * {@link useSelectionStore}'s `selectPart` for the semantics. Same two gestures as
   * {@link choose}, on purpose, so the whole list obeys **one rule**:
   *
   * - **Plain** (tap the child row) — this body, at this part, and nothing else: the
   *   selection is replaced, exactly as a plain tap on a body row replaces it.
   * - **Additive** (the child row's check, or Shift/Ctrl/Cmd on the row) — add this body
   *   *at the end*, addressed at this part; or, if that part is already the addressed one,
   *   step back up to the whole body.
   *
   * That is the answer to the operand-order trap. A boolean's **first** selected body is
   * its base (`ui-014`/`ui-040`) and Subtract removes every later one from it, so for
   * "cut the Pi's `ethernet` jack out of the case" the user must select the **case
   * first**: tap the shell's row, then the `ethernet` row's check. Tapping the child row
   * *plainly* while the shell is selected would throw the shell away (it is a plain tap);
   * making a plain child tap silently *add* instead would give the same tap two meanings
   * depending on hidden state, and disagree with a viewport click, which replaces. The order
   * and the address are on screen before Subtract is pressed: the checks read `1` and `2`,
   * the parent row names `› ethernet`, and the Operations toolbar's operand line reads
   * "Shell 1 then Raspberry Pi B+ › ethernet".
   *
   * A no-op while {@link disabledReason} is set, for a body the announced scene does not
   * contain, and for a part the body does not have (hidden ones included) — never a depth
   * on something that is not there.
   *
   * @param {string} bodyId
   * @param {string} partName
   * @param {boolean} [additive]
   * @returns {boolean} Whether the selection changed.
   */
  function choosePart(bodyId, partName, additive = false) {
    if (disabledReason.value) return false
    const body = bodies.value.find((candidate) => candidate.id === bodyId)
    if (!body) return false
    const known = [...(body.partNames ?? []), ...(body.hiddenPartNames ?? [])]
    if (!known.includes(partName)) return false
    choosing = true
    try {
      selection.selectPart(bodyId, partName, additive)
    } finally {
      choosing = false
    }
    settleSection(additive)
    return true
  }

  return {
    bodies,
    rows,
    disabledReason,
    singleSectionOpen,
    multiSectionOpen,
    keepOpenForOperands,
    isSectionOpen,
    setSectionOpen,
    toggleSection,
    choose,
    choosePart,
    toggleExpanded,
    isExpanded,
  }
})
