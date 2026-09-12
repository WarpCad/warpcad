<script setup>
/**
 * The Operations toolbar: Union, Subtract, Intersect (`TODO/ui-014`), Group
 * (`TODO/ui-015`), and Snap/Align (`TODO/ui-026`).
 *
 * This control exists in this shape because of a rule CLAUDE.md calls
 * non-negotiable:
 *
 * > Creation and operation are never the same list. [...] An operation control is
 * > disabled or hidden until its required operands are actually selected.
 *
 * So these buttons are deliberately **not** rows in the Library panel
 * beside Cube and Cylinder, and deliberately not a dropdown built by iterating
 * the registry — the previous attempt's boolean menu was exactly that, and it
 * offered every registered feature type as if they were interchangeable. An
 * operation is a different kind of thing from a creation, it has a precondition,
 * and the control has to say so before it is pressed rather than failing after.
 *
 * Two things follow from that and are the whole behaviour of the first four
 * buttons:
 *
 * 1. **Enablement is gated on selection _count_, not presence.** Fewer than two
 *    solids and Union/Subtract/Intersect/Group are disabled, with a live "N
 *    selected" badge so the requirement is legible *before* it is met rather
 *    than only after.
 * 2. **Order is part of the operand set, not just membership.** Subtract's base
 *    is the solid picked first; everything picked after it is removed from that.
 *    The badge says so in words, and `Viewport.vue` paints the base and the rest
 *    in two different colours so the same fact reads off the scene itself
 *    (`TODO/ACCEPTANCE.md` scenario 4, step 4).
 *
 * The record `run()` appends names operands by `document.currentIdOf(...)`,
 * never by the selection's own ids. A selection holds *lineage root* ids, which
 * stay stable across a move — but the root's entry in the evaluated scene still
 * holds the geometry the body had when it was first placed. Subtracting that
 * would cut a hole where the body used to be, which is exactly the class of bug
 * that looks fine until someone drags something first.
 *
 * ## Snap and Align are a different shape (`TODO/ui-026`)
 *
 * Two more buttons follow the same operand-resolution discipline but diverge on
 * every other axis, and both divergences are load-bearing, not stylistic:
 *
 * 1. **Exactly 2 operands, not "2 or more".** `group.snap`/`group.align`'s
 *    registry entries (`core-013`) throw on any operand count but 2 — the item
 *    being moved, and the item it is moved against — so these two buttons gate
 *    `disabled` on `selection.count !== 2` rather than the shared
 *    `MINIMUM_OPERANDS` used above.
 * 2. **They need parameters a stateless click cannot supply**, so clicking one
 *    while enabled opens a popover — a toggle-to-open/click-again-to-close
 *    control state borrowed from `ui-019`'s mouse-nav settings gear, though
 *    *not* that popover's row-anchored positioning; see the CSS comment on
 *    `.ops__popover` for why that had to diverge — to collect an axis set, an
 *    orientation (Snap only) and a millimetre offset, rather than appending a
 *    record immediately.
 * 3. **The appended record `supersedes`, never `consumes`.** Every button above
 *    reduces its operands into a *new* body and retires every input — that is
 *    what `consumes` means, and it is correct for a boolean or a Group, both of
 *    which build something new out of their operands. `group.snap`/
 *    `group.align` do the opposite: they return the *moved* geometry for the
 *    first operand alone, and the second operand's value is only ever read, not
 *    written. Semantically that is a transform, not a combination — the same
 *    shape `src/core/transform.js`'s `translateRecord`/`rotateRecord` already
 *    use for a gizmo drag — so the record here targets/supersedes the moving
 *    solid's current terminal id, exactly as those do, and (also like those two)
 *    carries no `name`: `src/core/document.js`'s own module doc states that
 *    `Body.name` is read from a lineage's **root** record, never a superseding
 *    one, so a `name` on this record would be silently unused dead weight —
 *    omitting it matches the established `transform.*` precedent rather than the
 *    `consumes`-based booleans' precedent, which is the wrong one to copy here.
 *    Reusing `consumes` instead would silently retire the *reference* solid from
 *    `bodies()` even though its geometry never changed — a real bug, not a style
 *    choice, per this file's own commit history.
 * 4. **The reference operand's own value is measured, never mutated** — so
 *    unlike every button above, both solids remain independently selectable
 *    after a commit. Only the moving solid's selection changes (it stays
 *    selected; the reference drops out of the selection), and because a
 *    `supersedes`-based move never changes its body's *lineage root* id
 *    (`selection.ids[0]` stays valid throughout, the same fact that lets a
 *    gizmo drag skip reselecting), the post-commit selection is
 *    `selection.select(selection.ids[0])` rather than the new record's own id.
 *
 * `deltaMm`'s two ops do not actually share a shape, which the popover's single
 * offset field respects rather than papering over: `group.js`'s `calcSnap`
 * (which `group.snap` calls) only ever adds its `deltaMm` as one scalar across
 * every checked axis (`axisApply`'s `+ (deltaMm ?? 0)`), while `calcCenterWith`
 * (`group.align`) accepts either a scalar or a per-axis vector. Offering a
 * per-axis vector for Snap would silently hand `calcSnap` an array where it
 * expects a number — array-plus-number arithmetic that produces `NaN` with no
 * thrown error, exactly the "wrong geometry with no error" failure class
 * `core-013`'s own `index.js` comments call out for an unrelated case. So this
 * popover offers one scalar offset field for both ops, applied uniformly across
 * whichever axes are checked; a true per-axis Align offset is left for a later
 * task rather than built here on an untested assumption about `calcSnap`.
 *
 * ## Fillet and Chamfer are a third shape (`TODO/ui-027`)
 *
 * `core-003` ported `modify.filletRim`/`modify.chamferRim` — rounding or
 * bevelling the whole rim of one axis-aligned **face**. Not an edge: this is
 * the one fillet semantics `@jscad/modeling` can support at all (see the
 * `TODO/core-003` addendum in `docs/decisions/geometry-kernel.md`), and every
 * label in this popover says "face" for exactly that reason.
 *
 * 1. **Exactly 1 operand — CLAUDE.md's own named example.** "A fillet on one
 *    edge... stays disabled unless exactly one applicable object is selected"
 *    is CLAUDE.md's literal wording for a single-object tool; both registry
 *    entries are `native(1, ...)`, a lone `inputs[0]`. So this pair gates
 *    `disabled` on `selection.count !== 1`, its own genuine divergence from
 *    every other button on this toolbar (2+ above, exactly 2 for Snap/Align).
 * 2. **`supersedes`, not `consumes` — but unlike Snap/Align, unnamed.** The op
 *    edits the one solid it targets and replaces it in place, the same shape
 *    `src/core/transform.js`'s `translateRecord`/`rotateRecord` use — so the
 *    record here targets/supersedes the selected solid's current terminal id,
 *    never `operands`/`consumes`. `TODO/ui-027`'s own Affected files note
 *    lists a `name` field in this record's shape; deliberately **not**
 *    followed here, because `transform.js`'s own "Why transform records are
 *    unnamed" section gives a specific, checked reason a supersedes-based
 *    record must stay unnamed (`Body.name` reads from a lineage's *root*
 *    record only, so a name here is dead weight at best and, if this id is
 *    ever handed to `combine()`, a duplicate `group.js` does not deduplicate).
 *    Same precedent Snap/Align already followed one section up.
 * 3. **The first user-facing runtime kernel-error display.** Every op above
 *    validates only shape (enough operands, a real axis string). Fillet/
 *    Chamfer's own registry entries validate a *value* — is this radius
 *    positive, and does it fit the solid it's aimed at (`fillet.js`'s
 *    `requireRadius`/`assertPrismaticBand`/`assertRadiusFits`) — and throw a
 *    real `Error` when it doesn't. Nothing before this task has needed to
 *    show a thrown kernel error to a user rather than let it vanish into the
 *    console, so `opError` below and its popover `<p>` are new ground, not a
 *    third copy of an existing pattern.
 */
import { computed, reactive, ref, watch } from 'vue'

import { useDocumentStore } from '../../stores/document.js'
import { useSelectionStore } from '../../stores/selection.js'

const documentStore = useDocumentStore()
const selection = useSelectionStore()

/**
 * The three operations, in the order §6 lists them. Each carries the label its
 * result is named with, so a merged body reads as "Union 1" in the scene list
 * rather than inheriting a name from whichever operand happened to be first.
 *
 * @type {ReadonlyArray<{ op: string, label: string, glyph: string, hint: string }>}
 */
const OPERATIONS = Object.freeze([
  {
    op: 'boolean.union',
    label: 'Union',
    glyph: '∪',
    hint: 'Merge the selected solids into one',
  },
  {
    op: 'boolean.subtract',
    label: 'Subtract',
    glyph: '−',
    hint: 'Remove every later-selected solid from the first',
  },
  {
    op: 'boolean.intersect',
    label: 'Intersect',
    glyph: '∩',
    hint: 'Keep only the volume the selected solids share',
  },
  {
    op: 'group.assemble',
    label: 'Group',
    glyph: '⊞',
    hint: "Combine into one selectable body — each solid's own geometry stays intact",
  },
])

/** The precondition, stated once. CLAUDE.md gates on count, not presence. */
const MINIMUM_OPERANDS = 2

const disabled = computed(() => selection.count < MINIMUM_OPERANDS)

/** What a disabled button says when hovered or long-pressed. */
const DISABLED_HINT = `Select ${MINIMUM_OPERANDS} or more solids`

/**
 * @param {{ label: string, hint: string }} operation
 * @returns {string}
 */
function titleFor(operation) {
  return disabled.value ? DISABLED_HINT : `${operation.label} — ${operation.hint}`
}

/**
 * Run one operation over the current selection.
 *
 * @param {string} op Registry key, e.g. `'boolean.union'`.
 * @param {string} label Human label, used to name the result.
 * @returns {void}
 */
function run(op, label) {
  if (disabled.value) return

  // Resolve every selected body to the record that currently represents it —
  // see the module note above on why the raw selection ids are the wrong thing
  // to hand the kernel as `target`/`operands`.
  const operandIds = selection.ids.map((id) => documentStore.raw.currentIdOf(id) ?? id)
  const [base, ...rest] = operandIds
  const id = documentStore.raw.nextId(op === 'group.assemble' ? 'group' : 'bool')

  /** @type {import('../../core/kernel/registry.js').OpRecord} */
  const record = {
    id,
    op,
    name: documentStore.raw.nextName(label),
    // `target` before `operands` is the fold's own input order, so the
    // first-selected solid lands at `inputs[0]` — which is what makes it
    // Subtract's minuend without this component knowing any kernel maths.
    target: base,
    operands: rest,
    consumes: operandIds,
  }

  // `group.assemble` (TODO/ui-015) needs one display name per operand, so the
  // resulting Group's parts are addressable by name rather than by opaque
  // record id (the breadcrumb `ui-016` builds later). Looked up by
  // **`selection.ids`**, not by `operandIds` above: `documentStore.bodies` keys
  // each summary by its *lineage root* id, while `operandIds` holds each
  // operand's *terminal* record id — the two only coincide for a body that has
  // never been superseded (moved). Looking up by the terminal id would silently
  // miss every moved operand and fall back to its opaque record id instead of
  // its real name.
  if (op === 'group.assemble') {
    record.params = {
      names: selection.ids.map((rootId) => {
        const body = documentStore.bodies.find((candidate) => candidate.id === rootId)
        return body?.name ?? rootId
      }),
    }
  }

  documentStore.append(record, { origin: 'local' })

  // The operands are gone as independent bodies, so leaving them selected would
  // point the Inspector and the gizmo at things that are no longer on screen.
  // Selecting the result instead hands it straight to the ordinary
  // selection → inspector → gizmo contract with no special case.
  selection.select(id)
}

// --- Snap / Align (TODO/ui-026) --------------------------------------------

/**
 * The two operations that need a popover instead of a stateless click.
 *
 * @type {ReadonlyArray<{ op: 'group.snap' | 'group.align', label: string, glyph: string, hint: string }>}
 */
const SNAP_ALIGN_OPERATIONS = Object.freeze([
  {
    op: 'group.snap',
    label: 'Snap',
    glyph: '⇥',
    hint: 'Move the moving item flush against the reference, on the checked axes',
  },
  {
    op: 'group.align',
    label: 'Align',
    glyph: '⇔',
    hint: 'Centre the moving item on the reference, on the checked axes',
  },
])

/** @type {ReadonlyArray<'x' | 'y' | 'z'>} */
const AXES = Object.freeze(['x', 'y', 'z'])

/**
 * The 6 canonical `SNAP_SIDES` keys `group.js` exports, one name per distinct
 * behaviour. `above-*`/`below-*` are literal aliases of four of these six (see
 * `group.js`'s own `SNAP_SIDES` table) — exposing all 10 would just show the
 * same six behaviours under two names each for four of them.
 *
 * @type {ReadonlyArray<{ value: string, label: string }>}
 */
const SNAP_ORIENTATIONS = Object.freeze([
  { value: 'outside+', label: 'Outside +' },
  { value: 'outside-', label: 'Outside −' },
  { value: 'inside+', label: 'Inside +' },
  { value: 'inside-', label: 'Inside −' },
  { value: 'center+', label: 'Center +' },
  { value: 'center-', label: 'Center −' },
])

/** Snap/Align's own precondition: exactly 2, not "2 or more" (see module doc). */
const EXACT_OPERANDS = 2

const snapAlignDisabled = computed(() => selection.count !== EXACT_OPERANDS)

/** What a disabled Snap/Align button says when hovered or long-pressed. */
const SNAP_ALIGN_DISABLED_HINT = `Select exactly ${EXACT_OPERANDS} solids`

/**
 * @param {{ label: string, hint: string }} operation
 * @returns {string}
 */
function snapAlignTitleFor(operation) {
  return snapAlignDisabled.value
    ? SNAP_ALIGN_DISABLED_HINT
    : `${operation.label} — ${operation.hint}`
}

// --- Fillet / Chamfer (TODO/ui-027) -----------------------------------------

/**
 * The two rim ops. See the module doc's "Fillet and Chamfer are a third
 * shape" section for why exactly-1, `supersedes`, and no `name`.
 *
 * @type {ReadonlyArray<{ op: 'modify.filletRim' | 'modify.chamferRim', label: string, glyph: string, hint: string, scopeNote: string }>}
 */
const FILLET_CHAMFER_OPERATIONS = Object.freeze([
  {
    op: 'modify.filletRim',
    label: 'Fillet',
    glyph: '◠',
    hint: 'Round the rim of one face',
    scopeNote: 'Rounds the whole rim of the chosen face — not a single edge.',
  },
  {
    op: 'modify.chamferRim',
    label: 'Chamfer',
    glyph: '◢',
    hint: 'Bevel the rim of one face',
    scopeNote: 'Bevels the whole rim of the chosen face — not a single edge.',
  },
])

/**
 * The six `RIM_ORIENTATIONS` (`src/core/kernel/fillet.js`) by plain-language
 * face label — never "edge", per this task's own labelling requirement.
 *
 * @type {ReadonlyArray<{ value: string, label: string }>}
 */
const FACE_OPTIONS = Object.freeze([
  { value: 'z+', label: 'Top (+Z)' },
  { value: 'z-', label: 'Bottom (−Z)' },
  { value: 'y+', label: 'Front (+Y)' },
  { value: 'y-', label: 'Back (−Y)' },
  { value: 'x+', label: 'Right (+X)' },
  { value: 'x-', label: 'Left (−X)' },
])

/** Fillet/Chamfer's own precondition: exactly 1 — CLAUDE.md's single-object-tool case. */
const EXACT_ONE = 1

const filletChamferDisabled = computed(() => selection.count !== EXACT_ONE)

/** What a disabled Fillet/Chamfer button says when hovered or long-pressed. */
const FILLET_CHAMFER_DISABLED_HINT = `Select exactly ${EXACT_ONE} solid`

/**
 * @param {{ label: string, hint: string }} operation
 * @returns {string}
 */
function filletChamferTitleFor(operation) {
  return filletChamferDisabled.value
    ? FILLET_CHAMFER_DISABLED_HINT
    : `${operation.label} — ${operation.hint}`
}

/**
 * @param {string | null} op
 * @returns {op is 'modify.filletRim' | 'modify.chamferRim'}
 */
function isFilletChamferOp(op) {
  return op === 'modify.filletRim' || op === 'modify.chamferRim'
}

/** Face dropdown state — defaults to the first option, unlike Radius below. */
const faceOrientation = ref(FACE_OPTIONS[0].value)

/**
 * Radius (mm). No default — `modify.filletRim`/`chamferRim`'s own registry
 * entries have none either, and this task's Interaction model says so
 * explicitly, so the popover's commit button stays disabled until a value is
 * actually typed rather than silently committing whatever a stale default was.
 *
 * @type {import('vue').Ref<number | null>}
 */
const radiusMm = ref(/** @type {number | null} */ (null))

/**
 * The first user-facing runtime kernel-error message (see module doc §3), or
 * `null` when nothing has failed. Cleared every time a popover opens or closes
 * so a stale failure from a previous attempt never lingers into the next one.
 *
 * @type {import('vue').Ref<string | null>}
 */
const opError = ref(/** @type {string | null} */ (null))

const canCommitFilletChamfer = computed(
  () =>
    !filletChamferDisabled.value &&
    typeof radiusMm.value === 'number' &&
    Number.isFinite(radiusMm.value) &&
    radiusMm.value > 0,
)

/** Which popover is open, or none. */
const openPopover = ref(
  /** @type {'group.snap' | 'group.align' | 'modify.filletRim' | 'modify.chamferRim' | null} */ (
    null
  ),
)

/** Axis checkboxes — reset to unchecked every time a popover opens. */
const axesChecked = reactive(/** @type {Record<'x' | 'y' | 'z', boolean>} */ ({
  x: false,
  y: false,
  z: false,
}))

/** Snap-only orientation, defaults to the first canonical option on open. */
const orientation = ref(SNAP_ORIENTATIONS[0].value)

/** Millimetre offset, applied uniformly across every checked axis (see module doc). */
const offsetMm = ref(0)

/** The checked axes, in `x`/`y`/`z` order, as the single string the registry wants. */
const axesString = computed(() => AXES.filter((axis) => axesChecked[axis]).join(''))

const canCommitSnapAlign = computed(
  () => !snapAlignDisabled.value && axesString.value.length > 0,
)

// If the selection stops being exactly 2 while a popover is open — a third
// solid picked, or one deselected — the precondition this popover exists to
// enforce is no longer met, so it closes itself rather than staying open for
// a commit that would now throw inside the registry's own `requireTwoOperands`.
watch(snapAlignDisabled, (isDisabled) => {
  if (isDisabled && !isFilletChamferOp(openPopover.value)) openPopover.value = null
})

// Same self-closing discipline for Fillet/Chamfer's own exactly-1 precondition
// — deselecting, or extending to a second solid, while the popover is open.
watch(filletChamferDisabled, (isDisabled) => {
  if (isDisabled && isFilletChamferOp(openPopover.value)) openPopover.value = null
})

/**
 * Open a popover, or close it if its own button is clicked again.
 *
 * @param {'group.snap' | 'group.align'} op
 * @returns {void}
 */
function togglePopover(op) {
  if (snapAlignDisabled.value) return
  if (openPopover.value === op) {
    openPopover.value = null
    return
  }
  // A fresh form every time: an axis/orientation/offset left checked from a
  // previous Snap would otherwise silently carry over onto a different pair
  // of solids.
  axesChecked.x = false
  axesChecked.y = false
  axesChecked.z = false
  orientation.value = SNAP_ORIENTATIONS[0].value
  offsetMm.value = 0
  opError.value = null
  openPopover.value = op
}

/**
 * Open the Fillet or Chamfer popover, or close it if its own button is
 * clicked again — same toggle mechanism as {@link togglePopover}, reused
 * rather than reinvented a third time, per this task's own Interaction model.
 *
 * @param {'modify.filletRim' | 'modify.chamferRim'} op
 * @returns {void}
 */
function toggleFilletChamferPopover(op) {
  if (filletChamferDisabled.value) return
  if (openPopover.value === op) {
    openPopover.value = null
    return
  }
  // A fresh form every time — a face/radius left over from a previous Fillet
  // would otherwise silently carry over onto a different solid or a Chamfer.
  faceOrientation.value = FACE_OPTIONS[0].value
  radiusMm.value = null
  opError.value = null
  openPopover.value = op
}

/** Close whichever popover is open without appending anything. */
function closePopover() {
  openPopover.value = null
  opError.value = null
}

/**
 * Commit the open popover's Snap or Align. See the module doc above for why
 * this appends a `supersedes` record, never a `consumes` one.
 *
 * @returns {void}
 */
function commitSnapAlign() {
  const op = openPopover.value
  if (!op || !canCommitSnapAlign.value) return

  // Same operand-resolution discipline as `run()` above: the raw selection ids
  // are lineage roots, and the kernel needs each operand's *current* terminal
  // id, not the geometry it had when first placed.
  const operandIds = selection.ids.map((id) => documentStore.raw.currentIdOf(id) ?? id)
  const [base, reference] = operandIds
  const id = documentStore.raw.nextId(op === 'group.snap' ? 'snap' : 'align')

  /** @type {Record<string, any>} */
  const params = { axes: axesString.value, deltaMm: offsetMm.value }
  if (op === 'group.snap') params.orientation = orientation.value

  /** @type {import('../../core/kernel/registry.js').OpRecord} */
  const record = {
    id,
    op,
    // `target` before `operands` is the fold's own input order, so the
    // first-selected ("moving") solid lands at `inputs[0]` — exactly the
    // operand `group.snap`/`group.align` move, per `core-013`'s registry.
    target: base,
    operands: [reference],
    // Not `consumes` — see the module doc's "Snap and Align are a different
    // shape" section for why that would be a real bug here, not a style choice.
    supersedes: base,
    params,
  }

  documentStore.append(record, { origin: 'local' })

  // `base` above is the moving solid's *terminal* id (what the record has to
  // build on); `selection.ids[0]` is its *lineage root*, which is what stays a
  // valid identity across this move — the same reason a gizmo drag never has
  // to reselect after committing a `transform.*` record. The reference solid
  // drops out of the selection; only the moved solid stays selected.
  selection.select(selection.ids[0])
  closePopover()
}

/**
 * Commit the open popover's Fillet or Chamfer. See the module doc's "Fillet
 * and Chamfer are a third shape" section for why this record is `supersedes`-
 * based and unnamed, and for why a thrown kernel error is caught and shown
 * here rather than left to the console — `filletRim`/`chamferRim` validate the
 * radius against the solid's own geometry (`assertPrismaticBand`,
 * `assertRadiusFits`, `requireRadius` in `src/core/kernel/fillet.js`) and
 * throw on a perfectly well-formed request against the wrong shape or size,
 * which no button on this toolbar before this one has needed to surface.
 *
 * @returns {void}
 */
function commitFilletChamfer() {
  const op = openPopover.value
  if (!isFilletChamferOp(op) || !canCommitFilletChamfer.value) return

  const onlyId = selection.onlyId
  if (!onlyId) return

  // Same operand-resolution discipline as `run()`/`commitSnapAlign()` above:
  // the selection id is a lineage root, and the kernel needs the operand's
  // *current* terminal id, not the geometry it had when first placed.
  const targetId = documentStore.raw.currentIdOf(onlyId) ?? onlyId
  const id = documentStore.raw.nextId(op === 'modify.filletRim' ? 'fillet' : 'chamfer')

  /** @type {import('../../core/kernel/registry.js').OpRecord} */
  const record = {
    id,
    op,
    // See the module doc: unnamed on purpose, unlike TODO/ui-027's own
    // Affected files note — `Body.name` is read from the lineage's root
    // record only, so a name on a superseding record is inert at best.
    target: targetId,
    supersedes: targetId,
    params: { radius: radiusMm.value, orientation: faceOrientation.value },
  }

  try {
    documentStore.append(record, { origin: 'local' })
  } catch (error) {
    // The first user-facing runtime kernel-error path on this toolbar — shown
    // in the popover itself rather than only thrown to the console, per the
    // module doc's §3. The popover stays open so the value can be corrected.
    opError.value = error instanceof Error ? error.message : String(error)
    return
  }

  // `supersedes` keeps `onlyId` — the lineage root — valid throughout, the
  // same reason a gizmo drag or a Snap/Align commit never has to reselect.
  selection.select(onlyId)
  closePopover()
}
</script>

<template>
  <div
    class="ops"
    data-testid="operations-toolbar"
    :data-enabled="disabled ? 'false' : 'true'"
    :data-selected-count="selection.count"
    role="group"
    aria-label="Boolean, group, snap/align and fillet/chamfer operations"
  >
    <p class="ops__badge" data-testid="operations-count">
      <span class="ops__count">{{ selection.count }} selected</span>
      <!-- The base/subtrahend relationship in words, alongside the two colours
           the scene paints it in. A user who has not read the docs still has to
           be able to tell which solid Subtract is going to cut. -->
      <span v-if="!disabled" class="ops__legend" data-testid="operations-legend">
        <span class="ops__swatch ops__swatch--base" aria-hidden="true" />first is the base
      </span>
      <span v-else class="ops__legend">{{ DISABLED_HINT.toLowerCase() }}</span>
    </p>

    <div class="ops__row">
      <button
        v-for="operation in OPERATIONS"
        :key="operation.op"
        type="button"
        class="ops__btn"
        :disabled="disabled"
        :data-testid="`operation-${operation.label.toLowerCase()}`"
        :data-op="operation.op"
        :title="titleFor(operation)"
        :aria-label="titleFor(operation)"
        @click="run(operation.op, operation.label)"
      >
        <span class="ops__glyph" aria-hidden="true">{{ operation.glyph }}</span>
        <span class="ops__label">{{ operation.label }}</span>
      </button>

      <!-- Snap/Align (TODO/ui-026): appended to the same row as the four
           stateless buttons above, but each opens a popover rather than
           committing immediately — see the module doc's "Snap and Align are a
           different shape" section for why. -->
      <button
        v-for="operation in SNAP_ALIGN_OPERATIONS"
        :key="operation.op"
        type="button"
        class="ops__btn"
        :disabled="snapAlignDisabled"
        :data-testid="`operation-${operation.label.toLowerCase()}`"
        :data-op="operation.op"
        :aria-expanded="openPopover === operation.op"
        :title="snapAlignTitleFor(operation)"
        :aria-label="snapAlignTitleFor(operation)"
        @click="togglePopover(operation.op)"
      >
        <span class="ops__glyph" aria-hidden="true">{{ operation.glyph }}</span>
        <span class="ops__label">{{ operation.label }}</span>
      </button>

      <!-- Fillet/Chamfer (TODO/ui-027): this toolbar's first exactly-1-gated
           pair, per CLAUDE.md's own single-object-tool rule. Same popover
           toggle mechanism as Snap/Align above, a different field set. -->
      <button
        v-for="operation in FILLET_CHAMFER_OPERATIONS"
        :key="operation.op"
        type="button"
        class="ops__btn"
        :disabled="filletChamferDisabled"
        :data-testid="`operation-${operation.label.toLowerCase()}`"
        :data-op="operation.op"
        :aria-expanded="openPopover === operation.op"
        :title="filletChamferTitleFor(operation)"
        :aria-label="filletChamferTitleFor(operation)"
        @click="toggleFilletChamferPopover(operation.op)"
      >
        <span class="ops__glyph" aria-hidden="true">{{ operation.glyph }}</span>
        <span class="ops__label">{{ operation.label }}</span>
      </button>
    </div>

    <!-- Teleported to `<body>`, not left as a normal descendant of `.ops` —
         see this class's own CSS comment for why. `.ops` has a
         `backdrop-filter`, and Chromium treats any element with a
         non-`none` `backdrop-filter` as the *containing block* for its
         `position: fixed` descendants rather than letting them resolve
         against the real browser viewport. That silently re-centred this
         popover on `.ops`'s own ~182px-wide box instead of the page,
         which is what actually produced the off-screen/negative-`x` failure
         a first pass of this file's own e2e spec caught — `<Teleport>` moves
         the DOM node itself out from under `.ops` so `position: fixed` means
         what it says. -->
    <Teleport to="body">
      <div v-if="openPopover" class="ops__popover-backdrop" @click="closePopover" />
      <div
        v-if="openPopover && isFilletChamferOp(openPopover)"
        class="ops__popover"
        data-testid="fillet-chamfer-popover"
        :data-op="openPopover"
      >
        <p class="ops__popover-note">
          {{ FILLET_CHAMFER_OPERATIONS.find((operation) => operation.op === openPopover)?.scopeNote }}
        </p>

        <label class="ops__popover-field">
          Face
          <select v-model="faceOrientation" data-testid="fillet-chamfer-face">
            <option v-for="choice in FACE_OPTIONS" :key="choice.value" :value="choice.value">
              {{ choice.label }}
            </option>
          </select>
        </label>

        <label class="ops__popover-field">
          Radius (mm)
          <input
            type="number"
            v-model.number="radiusMm"
            min="0"
            data-testid="fillet-chamfer-radius"
          />
        </label>

        <!-- The first user-facing runtime kernel-error path on this toolbar —
             see the module doc's §3 and `commitFilletChamfer`'s own comment. -->
        <p v-if="opError" class="ops__popover-error" data-testid="fillet-chamfer-error">
          {{ opError }}
        </p>

        <div class="ops__popover-actions">
          <button
            type="button"
            class="ops__popover-cancel"
            data-testid="fillet-chamfer-cancel"
            @click="closePopover"
          >
            Cancel
          </button>
          <button
            type="button"
            class="ops__popover-commit"
            :disabled="!canCommitFilletChamfer"
            data-testid="fillet-chamfer-commit"
            @click="commitFilletChamfer"
          >
            {{ openPopover === 'modify.filletRim' ? 'Fillet' : 'Chamfer' }}
          </button>
        </div>
      </div>

      <div
        v-else-if="openPopover"
        class="ops__popover"
        data-testid="snap-align-popover"
        :data-op="openPopover"
      >
        <p class="ops__popover-note">
          Moves the <strong>moving</strong> item (first selected) against the
          <strong>reference</strong> item (second selected), which never moves.
          Unlike every other button here, both stay separately selectable
          afterward — nothing is combined.
        </p>

        <fieldset class="ops__popover-axes">
          <legend>Axes</legend>
          <label v-for="axis in AXES" :key="axis" class="ops__checkbox">
            <input
              type="checkbox"
              v-model="axesChecked[axis]"
              :data-testid="`snap-align-axis-${axis}`"
            />
            {{ axis.toUpperCase() }}
          </label>
        </fieldset>

        <label v-if="openPopover === 'group.snap'" class="ops__popover-field">
          Orientation
          <select v-model="orientation" data-testid="snap-align-orientation">
            <option v-for="choice in SNAP_ORIENTATIONS" :key="choice.value" :value="choice.value">
              {{ choice.label }}
            </option>
          </select>
        </label>
        <p v-else class="ops__popover-hint">Align always centres — there is no orientation to pick.</p>

        <label class="ops__popover-field">
          Offset (mm)
          <input type="number" v-model.number="offsetMm" data-testid="snap-align-offset" />
        </label>

        <!-- Named-sub-part addressing ("snap this bolt by its head") is
             explicitly out of scope this cut — TODO/ui-026's Proposed fix. -->
        <p class="ops__popover-hint">Whole-object snap/align only — sub-part addressing isn't available yet.</p>

        <div class="ops__popover-actions">
          <button
            type="button"
            class="ops__popover-cancel"
            data-testid="snap-align-cancel"
            @click="closePopover"
          >
            Cancel
          </button>
          <button
            type="button"
            class="ops__popover-commit"
            :disabled="!canCommitSnapAlign"
            data-testid="snap-align-commit"
            @click="commitSnapAlign"
          >
            {{ openPopover === 'group.snap' ? 'Snap' : 'Align' }}
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/*
 * Top-left of the viewport, which is the one corner none of the other viewport
 * chrome claims: navigation is bottom-left, the scale readout bottom-right, the
 * orientation gizmo top-right. It stays clear of the phone-width Library and
 * Inspector bottom sheets outright rather than by arithmetic, which matters here
 * because this toolbar's *enabled state* is what the user is watching while they
 * pick the second solid — a control that only becomes visible once the sheets
 * are dismissed would be telling them nothing at the moment they need it.
 *
 * `max-width` below is relative to `.viewport` (this component's containing
 * block, `position: relative` in `Viewport.vue`) rather than the page, and
 * that distinction is load-bearing (found by `TODO/ui-015`'s own e2e run, not
 * designed up front): at tablet width the persistent Library and Inspector side
 * panels leave the 3D viewport *pane* itself far narrower than the page (measured
 * ~390px against an 820px page), so the page-width phone breakpoint below never
 * sees the problem. Adding this fourth button pushed the row's natural width
 * (~326px) far enough right to physically overlap the orientation gizmo's own
 * dial — not just its outer box, its clickable view caps — which a Playwright
 * click then reports as "intercepted", not merely a cosmetic overlap. `184px`
 * is the gizmo's own container width (130px) plus its `right: 12px` inset plus
 * a margin, so the row wraps to a second line before it ever reaches that
 * corner, regardless of how a narrower pane's width ends up divided around it.
 */
.ops {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  max-width: calc(100% - 24px - 184px);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-glass);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-overlay);
}

.ops__badge {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 0 2px;
  font-size: 11px;
  line-height: 1.3;
  color: var(--text-3);
}

.ops__count {
  font-weight: 650;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.ops__legend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ops__swatch {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.ops__swatch--base {
  background: var(--accent);
  /* The subtrahend colour, so the badge carries both halves of the pairing the
     scene is painted in rather than only naming one of them. */
  box-shadow: 10px 0 0 var(--accent-secondary);
  margin-right: 10px;
}

.ops__row {
  display: flex;
  gap: 4px;
  /* Unconditional, not gated behind the phone media query below: the new
     `max-width` on `.ops` above is what decides *whether* wrapping is needed
     (container-relative, so it also catches the tablet-pane squeeze), and this
     is what actually performs it once that width is exceeded. */
  flex-wrap: wrap;
}

.ops__btn {
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: var(--tap);
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-size: 12px;
  cursor: pointer;
  touch-action: manipulation;
}

.ops__glyph {
  font-size: 14px;
  line-height: 1;
}

.ops__btn:hover:not(:disabled),
.ops__btn:focus-visible:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
  outline: none;
}

.ops__btn:active:not(:disabled) {
  background: var(--accent);
  color: var(--accent-contrast);
}

.ops__btn:disabled {
  /* Dimmed rather than hidden: the control has to be visible while it is
     unavailable, or the user never learns the operation exists. */
  opacity: 0.45;
  cursor: not-allowed;
  color: var(--text-3);
}

/*
 * Snap/Align's popover (TODO/ui-026) — `position: fixed` and centred near the
 * top of the *viewport*, deliberately not anchored below `.ops` the way
 * `ui-019`'s gear popover anchors below `.chrome`. That was the first design
 * tried here, and it broke two different ways, both found by this file's own
 * e2e spec rather than designed up front:
 *
 * 1. **A row-anchored popover collides with relocated nav chrome.** At phone
 *    width, this popover's own precondition (exactly 2 solids selected) is
 *    exactly the state that auto-opens the Inspector's bottom sheet, which
 *    pushes `NavigationChrome` upward by up to ~430px (`AppView.vue`'s
 *    `--viewport-bottom-inset`, the same custom property `Grid.vue`/
 *    `NavigationChrome.vue` read for their own bottom clearance) — squarely
 *    into the band a row-anchored, six-field popover would occupy. An
 *    `axis-z` checkbox and `nav-step-right` measured at nearly the same
 *    on-screen coordinates, and Playwright's "element intercepts pointer
 *    events" was exactly this, not a flaky test.
 * 2. **`.ops` has a `backdrop-filter`**, which Chromium treats as making `.ops`
 *    the *containing block* for `position: fixed` descendants rather than the
 *    real browser viewport — so even after moving off the button row, a plain
 *    (non-teleported) `position: fixed` popover centred with `left: 50%`
 *    centred on `.ops`'s own ~182px-wide box, not the page, and clipped off
 *    the left edge.
 *
 * Both are solved by the `<Teleport to="body">` in the template, not by
 * anything in this rule: teleporting moves the popover *and* its backdrop to
 * the end of `<body>`, which (a) makes `position: fixed` resolve against the
 * real viewport again, and (b) — since Vue appends teleported content after
 * everything already in `<body>` — puts both above every other viewport
 * overlay in paint order without this rule needing its own `z-index` fight
 * with `NavigationChrome`. The full-page, click-catching backdrop
 * (`.ops__popover-backdrop`) is what actually makes any *geometric* overlap
 * with nav chrome harmless: nothing beneath the backdrop is reachable while a
 * popover is open, regardless of where either box happens to sit on screen.
 *
 * `width` is deliberately capped by `100vw`, not by `.ops`'s own (already
 * tight, gizmo-avoiding) `max-width` — this popover is taller and denser than
 * the six-button row above it, so it needs more room than that budget leaves,
 * and unlike the button row it opens only on demand rather than sitting
 * visible at all times. `min(260px, calc(100vw - 32px))` is what `ui-026`'s
 * own Testing section calls for explicitly: "stays on-screen and reachable by
 * touch at 390px width" — 260px comfortably fits a stacked checkbox/select/
 * number-input form, and the `100vw` clamp is the literal off-screen-clipping
 * guard at any narrower width than that. `max-height` plus `overflow-y: auto`
 * is a matching vertical guard against an unreasonably short viewport —
 * content scrolls inside the popover rather than ever running off-screen.
 */
.ops__popover-backdrop {
  position: fixed;
  inset: 0;
  /* Transparent on purpose: this is a click-catcher, not a dimming overlay —
     the whole point of the popover staying anchored near the top is that the
     scene underneath stays legible while parameters are picked. */
  background: transparent;
  z-index: 9;
}

.ops__popover {
  position: fixed;
  top: 64px;
  left: 50%;
  transform: translateX(-50%);
  width: min(260px, calc(100vw - 32px));
  /* A generic short-viewport guard, not a precise nav-chrome-avoidance
     calculation — `--viewport-bottom-inset` (used above by `.ops`'s siblings)
     does not inherit here, since the teleported popover is no longer a
     descendant of the element that sets it. That precision is unnecessary
     now: the backdrop above is what keeps this popover's on-screen position
     safe to interact with, not this cap. */
  max-height: calc(100vh - 96px);
  overflow-y: auto;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-glass);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-overlay);
  z-index: 10;
}

.ops__popover-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-2);
}

.ops__popover-hint {
  margin: 0;
  font-size: 10px;
  line-height: 1.3;
  color: var(--text-3);
}

/*
 * The first user-facing runtime kernel-error display on this toolbar
 * (TODO/ui-027 — see the module doc's §3). No dedicated "danger" custom
 * property exists in this codebase yet (`Viewport.vue`'s own `.viewport__error`
 * is neutral surface/text colours, not a red), so this follows that same
 * established convention rather than introducing a new token for one message.
 */
.ops__popover-error {
  margin: 0;
  padding: 6px 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-1);
  font-size: 11px;
  line-height: 1.4;
}

.ops__popover-axes {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 0;
  border: none;
}

.ops__popover-axes legend {
  padding: 0;
  margin-right: 2px;
  font-size: 11px;
  color: var(--text-2);
}

.ops__checkbox {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-1);
  cursor: pointer;
  touch-action: manipulation;
}

.ops__checkbox input {
  width: 16px;
  height: 16px;
  margin: 0;
  cursor: pointer;
}

.ops__popover-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 11px;
  color: var(--text-2);
}

.ops__popover-field select,
.ops__popover-field input {
  min-height: var(--tap-compact);
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-1);
  font-size: 13px;
}

.ops__popover-actions {
  display: flex;
  gap: 6px;
  margin-top: 2px;
}

.ops__popover-cancel,
.ops__popover-commit {
  flex: 1;
  min-height: var(--tap-compact);
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
  touch-action: manipulation;
}

.ops__popover-cancel {
  border: 1px solid var(--border-strong);
  background: var(--surface-2);
  color: var(--text-2);
}

.ops__popover-commit {
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}

.ops__popover-commit:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .ops {
    top: 8px;
    left: 8px;
    padding: 4px;
    /* No `max-width` override here on purpose (there used to be one,
       `calc(100vw - 16px)` — removed): at phone width the viewport pane spans
       essentially the whole page (Library/Inspector are bottom sheets there,
       not side panels), so `calc(100vw - 16px)` (≈374px on a 390px phone) is
       *looser* than the base rule's container-relative cap above (≈182px) —
       and because this block is declared later, it was winning and silently
       undoing the base rule's protection at exactly the width where the
       orientation gizmo's corner is tightest. Confirmed by measurement, not
       assumed: Firefox renders this row's button labels ~15px wider than
       Chromium, which was just enough at the old 374px cap to reach past the
       gizmo's Front-view cap's own click point — a real, engine-specific
       regression this fourth button caused, caught by `TODO/ui-015`'s own full
       e2e run. Inheriting the tighter base cap fixes it in every engine at
       once rather than re-deriving a second, phone-specific budget.
    */
  }

  .ops__btn {
    /* Icon-only below (TODO/ui-027 made this necessary — see `.ops__label`'s
       own comment), so this is now a roughly square compact tap target, the
       same `--tap-compact` (38px) square `NavigationChrome.vue`'s own
       icon-only buttons already use at its narrower breakpoint — not a new
       convention, the established one for this exact situation. */
    min-height: var(--tap-compact);
    min-width: var(--tap-compact);
    padding: 0 6px;
    font-size: 11px;
  }

  /*
   * Hidden below 640px, not just shrunk (TODO/ui-027). Eight buttons across
   * four wrapped rows of two (Union/Subtract, Intersect/Group, Snap/Align,
   * Fillet/Chamfer added by this task) reached ~242px tall with a body
   * selected — and selecting a body is `TODO/ui-011`'s own trigger for the
   * phone-width Inspector bottom sheet, which pushes `NavigationChrome`
   * upward by up to ~430px (the same `--viewport-bottom-inset` cited by the
   * Snap/Align popover's own CSS comment above). Measured, not assumed: with
   * a body selected at 390×844, `nav-mode-orbit` sat at `y≈207` while this
   * toolbar's fourth (Fillet/Chamfer) row ended at `y≈242` — a ~35px real
   * overlap Playwright reported as "element intercepts pointer events" on
   * `operation-fillet` itself, discovered by this task's own full e2e run,
   * not designed for up front. A horizontally scrolling row was considered
   * and rejected: CLAUDE.md's Responsive Layout section is explicit that
   * primary UI must "collapse or reflow" at phone width, "never require
   * horizontal scrolling." Hiding the label (each button's `aria-label`/
   * `title` already carries the same text, so nothing is lost for assistive
   * tech) shrinks 8 buttons from 4 wrapped rows of 2 back down to 2 rows of
   * 4, which clears the same gap comfortably at every selection state.
   */
  .ops__label {
    display: none;
  }

  .ops__popover {
    /* Positioning is unchanged at this width — it is already `position: fixed`
       and viewport-relative (see its own CSS comment above), not derived from
       `.ops`'s box, so nothing here needs to move. Only the padding/gaps
       tighten, to match the rest of the toolbar's phone-width density. */
    padding: 8px;
    gap: 6px;
  }
}
</style>
