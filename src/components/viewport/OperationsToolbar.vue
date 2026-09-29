<script setup>
/**
 * The Operations toolbar: Union, Subtract, Intersect (`TODO/ui-014`), Group
 * (`TODO/ui-015`), Snap/Align (`TODO/ui-026`), Fillet/Chamfer (`TODO/ui-027`),
 * and Enlarge/Fit/Bisect (`TODO/ui-028`).
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
 * ### Sub-part-addressed operands (`TODO/ui-035`)
 *
 * `core-013` registered both of these as `rawOperands`/`subPartOperands` entries,
 * so a record may address one operand as `{ id, pieces }` — *measure against this
 * named part of that composite* — instead of as a bare id. `ui-026` never built
 * one: it mapped `selection.ids` straight to ids, so the popover carried a printed
 * disclaimer saying sub-part addressing was unavailable, and the attachment
 * `core-016`'s Raspberry Pi/screen recipes are designed around (a screen's pad
 * against a *particular* hole) was reachable from the command layer and not by
 * hand. `selectedOperands` below closes that: it reads `ui-016`'s pick depth
 * (`selection.subPart`) at commit time and builds the addressed form for whichever
 * operand is drilled into.
 *
 * Three things about it are decisions, not mechanics:
 *
 * 1. **Addressing is asymmetric on purpose.** One operand may be a named part
 *    while the other is a whole body, which is the case the Goal actually names
 *    — a whole screen positioned against one hole on a board. Requiring matched
 *    drill depth on both sides would forbid exactly the realistic use and buy
 *    nothing: the kernel resolves each operand independently (`index.js`'s
 *    `normalizeRef`, `registry.js`'s `referenceOf`), so there is no arithmetic
 *    reason for the two sides to agree. Every other 2-operand control on this
 *    toolbar treats both sides identically, so this is a genuine divergence and
 *    stated here rather than left to be inferred from the code.
 * 2. **`pieces` goes on the operand; `supersedes` stays a bare id.** `supersedes`
 *    names the *record* whose logical body this one continues (`document.js`'s
 *    supersession note) — it is lineage bookkeeping, not an operand, and putting
 *    an object there would break `bodies()` outright. So the same terminal id
 *    appears twice in one record in two different shapes, deliberately.
 * 3. **The addressed part drives the offset; the whole body still moves.** That
 *    is V1's own semantics, carried by `registry.js`'s `group.snap`/`group.align`
 *    entries — a bolt snapped by its head brings its thread along. So a
 *    sub-part-addressed move looks on screen exactly like a whole-object one
 *    (one body slides), which is why the popover now *names* both operands and
 *    their depth: without that, the only way to tell which of two quite
 *    different commits is about to happen is to run it and measure. The
 *    Inspector's own breadcrumb (`ui-016`) is not enough — it is a different
 *    panel, and it only ever describes a single-body selection.
 *
 * This is also the first Snap/Align commit that can be *rejected* by the kernel:
 * a `pieces` naming a part the group does not have, or a bare solid with a stale
 * pick depth hung off it, throws inside the fold (`index.js`). So this pair now
 * carries the same `opError` display Fillet/Chamfer introduced, rather than
 * letting a thrown error vanish into the console mid-click.
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
 * ### The same addressing, for Union/Subtract/Intersect (`TODO/ui-040`)
 *
 * `core-024` opened the other half of that door — the three booleans are
 * `subPartNative` registry entries now, so *"subtract this composite's `tap`,
 * not the whole bolt"* is a record the kernel will evaluate — and nothing in the
 * UI could say it, because `run()` above built every operand from
 * `currentIdOf(id)` alone. That is all this task changes, and three of the four
 * decisions in it are about what it deliberately does **not** change:
 *
 * 1. **`selection.js` is untouched: no relaxed `drillInto`, no second depth
 *    slot.** `TODO/ui-040` proposed one or the other, on the premise that
 *    "shell selected, plus the bolt drilled to `tap`" is not an expressible
 *    selection. It already is, and `ui-035` shipped on exactly that fact: a
 *    depth needs one selected body to be *set*, but `toggle` is deliberately
 *    the one selection path that does not prune it, so clicking the drilled
 *    body out of the selection and back in lands it second with its depth
 *    intact. Both proposed alternatives cost something real for nothing.
 *    Relaxing the exactly-one rule would let a depth attach to a multi-
 *    selection the Inspector cannot display (its breadcrumb only ever
 *    describes a single-body selection), so a user would carry an invisible
 *    pick depth into every count-gated tool on this toolbar — the ambiguity
 *    the task was scoped to avoid, arrived at from the other direction. A
 *    second depth slot would double the state to address a second operand
 *    nothing can use: `group.assemble` refuses `pieces` outright, and the
 *    corpus idiom this exists for cuts *one* composite's named parts out of a
 *    plain shell. Either way `selection.count` is untouched by depth, which is
 *    what keeps every existing count gate meaning exactly what it did.
 * 2. **One operand-building path, not two.** `snapAlignOperands` became
 *    `selectedOperands` and both `run()` and `commitSnapAlign()` read it. The
 *    two buttons groups disagree about operand *count*, *order* and lineage
 *    bookkeeping, but "what does this selection resolve to, at what depth" is
 *    one question with one answer, and having answered it twice is how the two
 *    would drift.
 * 3. **`consumes` stays bare ids, exactly as `supersedes` did.** Both name
 *    *records*, not operands. So a sub-part subtract still retires the whole
 *    bolt from `bodies()` — it was the cutting tool, and a boolean has always
 *    consumed its operands whole. Cutting with one part and keeping the body
 *    would be a non-consuming boolean, which is a different feature.
 * 4. **Group is the exception, and says so on screen.** `group.assemble` is a
 *    plain `native` entry (see its own registry comment on nested composites),
 *    so handing it a `{ id, pieces }` would throw rather than mean anything.
 *    `run()` therefore sends it bare terminal ids even when a depth is set, and
 *    the operand line carries a note saying the depth applies to the three
 *    booleans and not to Group — a silently-ignored address is precisely the
 *    "wrong geometry, no error" class `index.js`'s own operand-resolution note
 *    refuses to allow.
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
 *
 * ## Resize and Bisect are a fourth shape (`TODO/ui-028`)
 *
 * `core-019` ported `modify.enlarge`/`modify.fit`/`modify.bisect` — grow/shrink by
 * a per-axis delta, resize to an absolute per-axis target, and cut one solid into a
 * two-part `negative`/`positive` group. All three are `operandCount: 1`, so they
 * join Fillet/Chamfer's exactly-1 gate (`exactOneDisabled` below, generalised from
 * that pair's own `filletChamferDisabled` rather than duplicated) instead of
 * starting a third selection-count computed.
 *
 * 1. **`supersedes`, not `consumes` — same reasoning as Fillet/Chamfer.** Enlarge
 *    and Fit replace the selected body's geometry in place; Bisect does too, even
 *    though what it replaces it *with* is a two-part group rather than another
 *    solid — `document.js`'s own module doc states `supersedes` says nothing about
 *    the *kind* of geometry on either side of it, only that one logical body's
 *    identity continues. No `name` on the record, for the identical reason
 *    Fillet/Chamfer's own section above gives.
 * 2. **Fit's `0`-means-unchanged sentinel gets a UI affordance, not a silent kernel
 *    match.** Each field defaults to the selected body's own *current* size on that
 *    axis (read from `documentStore.bodies`' own pre-computed `bounds`, never from
 *    raw kernel `geometry` — `stores/document.js`'s own module doc keeps geometry
 *    out of this summary on purpose) rather than `0`, so an untouched field commits
 *    as a no-op scale (target equals current size) without
 *    the user ever having typed the sentinel value by accident. A field the user
 *    *does* set to `0` still means "leave this axis alone" per `fit`'s own doc
 *    comment — the popover's own hint text says so, since typing `0` reads as
 *    "shrink to nothing" to anyone who hasn't read that kernel comment. Commit
 *    stays disabled until at least one field differs from its own opening value,
 *    the same no-op guard Enlarge uses for a zero delta.
 * 3. **Bisect's axis is a dropdown, its offset has no default.** Free axis text
 *    would let a typo reach the kernel as a thrown error instead of a disabled
 *    control; `bisect`'s own doc comment flags `-0`-means-max-face as an easy
 *    convention to get backwards, which is exactly why the offset field is left
 *    blank rather than pre-filled with a value that *looks* safe (`0`, which cuts
 *    at the minimum face, not the centre — `bisect` distinguishes an omitted
 *    offset from a literal `0`, and this popover never omits one).
 *
 * ## Angled Bisect (`TODO/ui-036`)
 *
 * `core-021` shipped `modify.bisect`'s tilted-cut-plane form
 * (`angleDeg`/`rotateAxis`/`rotateOffsetMm`) at the kernel level with, by that
 * file's own admission, "no control anywhere that can reach it." This task adds
 * the three fields to the existing Bisect popover above — no new commit path, no
 * new gating logic, the same `isResizeOp`/`canCommitResize`/`commitResize`
 * plumbing `ui-028` already built, per `core-021`'s own Interaction model section
 * (reused here rather than re-derived, per that file's own note).
 *
 * 1. **Angle defaults to `0`, unlike every other field on this popover.** Every
 *    other field here (Offset, Rotate-offset) is deliberately left blank so a
 *    pre-filled value can never look like a safe default for something that
 *    isn't. Angle is the opposite case: `0` genuinely *is* "no tilt" — the exact
 *    falsy short-circuit `bisect()` itself applies — so defaulting to `0` is
 *    accurate, not a trap.
 * 2. **A falsy Angle must produce a record with the exact same shape as before
 *    this task** — only `axis`/`offsetMm`, no `angleDeg`/`rotateAxis`/
 *    `rotateOffsetMm` keys at all, not those three keys present with falsy
 *    values. `commitResize`'s own regression guard is this shape, not a value
 *    check, per the TODO's own Testing section.
 * 3. **Rotate-axis's default follows the kernel's own per-cut-axis table**
 *    (`DEFAULT_ROTATE_AXIS`, imported from `group.js` rather than duplicated —
 *    the same "import the kernel's constant instead of hand-copying it"
 *    precedent `Viewport.vue` already set for `boundsOf`), and its dropdown only
 *    ever offers the two axes perpendicular to the current cut axis — the
 *    cut axis itself is never a legal tilt axis (`bisect()` throws on that
 *    combination by name). Changing the cut axis re-defaults Rotate-axis rather
 *    than leaving it stranded on a now-invalid value.
 * 4. **Rotate-offset has no default, same convention as the straight Offset
 *    field** — but unlike Offset, an unset Rotate-offset does not block Commit:
 *    the kernel's own default (the third axis's centre) is a real, sensible
 *    answer to "leave it alone," which is exactly the flow this task's own Goal
 *    names as the expected one ("leaving Rotate-offset at its default"). Left
 *    blank, it is *omitted* from `params`, not sent as `0` or `null` — `bisect`'s
 *    doc comment distinguishes an omitted `rotateOffsetMm` (centre) from a
 *    literal `0` (the minimum face), the identical distinction the straight
 *    Offset field already has to make.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import { DEFAULT_ROTATE_AXIS } from '../../core/kernel/group.js'
import { useDocumentStore } from '../../stores/document.js'
import { useOverlaysStore } from '../../stores/overlays.js'
import { useSelectionStore } from '../../stores/selection.js'
import { RIM_FACE_OPTIONS } from '../../core/timelineLabel.js'
import { useTimelineStore } from '../../stores/timeline.js'

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

/**
 * §14, point 3: every Operations toolbar button is disabled while a past step
 * is being previewed. Folded into the three existing gates rather than bolted
 * on at each button, so a future button cannot forget it.
 */
const timeline = useTimelineStore()

/**
 * `TODO/ui-052`: a selected body that a condition has switched off (picked from the object
 * list, the only place it can be picked) is in `selection.count` but has no geometry, so
 * no operation can use it. Folded into all three gates, the same way preview is.
 */
const inactiveSelected = computed(() =>
  selection.ids.some((id) => documentStore.inactiveBodies.some((body) => body.id === id)),
)

const disabled = computed(() => selection.count < MINIMUM_OPERANDS || timeline.previewing || inactiveSelected.value)

/** What a disabled button says when hovered or long-pressed. */
const DISABLED_HINT = `Select ${MINIMUM_OPERANDS} or more solids`

/**
 * The same meaning as {@link DISABLED_HINT}, shortened for the badge's own legend
 * line at phone width (`TODO/ui-043`). Below 640px the full sentence next to the
 * count ("0 selected" / "1 selected") does not fit `.ops`'s own gizmo-avoiding
 * `max-width` on one line, and the wrapped second line was measured pushing this
 * toolbar's total height 21px into `NavigationChrome`'s own top edge — the
 * navigation chrome overlap this constant exists to close. Nothing is lost: the
 * full sentence is still what {@link titleFor} returns for every button's
 * `title`/`aria-label`, this toolbar's own established long-press affordance for
 * exactly this width (see that function's own comment).
 */
const DISABLED_HINT_SHORT = `Select ${MINIMUM_OPERANDS}+`

/**
 * @param {{ label: string, hint: string }} operation
 * @returns {string}
 */
function titleFor(operation) {
  if (disabled.value) return DISABLED_HINT
  // The operand summary rides along in the title as well as in the visible
  // line below the buttons (`TODO/ui-040`), because that line is the one piece
  // of this toolbar that does **not** fit at phone width — measured, not
  // assumed: at 390px the column between this toolbar's top and the navigation
  // chrome's own top holds the badge and the button row with a ~6px margin
  // after `TODO/ui-043`'s fix (see that media-query block's own comment for
  // the full arithmetic), so an extra text line would spend the whole margin
  // and then some, either pushing a button under the chrome or painting behind
  // it. Long-press is this toolbar's own established touch affordance for
  // exactly this (it is how the disabled hint above is read on a
  // phone, and `ACCEPTANCE.md` scenario 4 checks it there), so the depth is
  // reachable at every width rather than only where it can be shown outright.
  return `${operation.label} — ${operation.hint} (${operandSummary.value})`
}

/**
 * The error from the last stateless-button commit that the kernel rejected, or
 * `null` (`TODO/ui-040`). Separate from {@link opError}, which belongs to the
 * popovers: the two can be on screen at the same time (a Snap popover is open
 * while Union/Subtract/Intersect are also enabled, since both gates are met at
 * exactly 2 selected), and one shared ref would print the same message twice in
 * two places.
 *
 * @type {import('vue').Ref<string | null>}
 */
const runError = ref(/** @type {string | null} */ (null))

/**
 * Run one operation over the current selection.
 *
 * @param {string} op Registry key, e.g. `'boolean.union'`.
 * @param {string} label Human label, used to name the result.
 * @returns {void}
 */
function run(op, label) {
  if (disabled.value) return
  runError.value = null

  // Every selected body, resolved to the record that currently represents it
  // and — where the user has drilled in — to a named part (`TODO/ui-040`; see
  // {@link selectedOperands} and the module doc's "Sub-part-addressed operands"
  // section, which is now this component's one operand-building path rather
  // than a Snap/Align-only one). The module note above on why the raw selection
  // ids are the wrong thing to hand the kernel still applies underneath it.
  const operands = selectedOperands.value
  // `boolean.*`'s registry entries are `subPartNative` — they may be handed a
  // `{ id, pieces }`. `group.assemble`'s is plain `native`, deliberately (see
  // its own registry comment on nested composites), so a `pieces` address there
  // would throw rather than do anything: a pick depth is *ignored* for Group,
  // and the operand line below keeps saying so by naming the depth it is
  // dropping. That is the one asymmetry between the four buttons on this row.
  const addressable = op.startsWith('boolean.')
  const [base, ...rest] = operands
  const id = documentStore.raw.nextId(op === 'group.assemble' ? 'group' : 'bool')

  /** @type {import('../../core/kernel/registry.js').OpRecord} */
  const record = {
    id,
    op,
    name: documentStore.raw.nextName(label),
    // `target` before `operands` is the fold's own input order, so the
    // first-selected solid lands at `inputs[0]` — which is what makes it
    // Subtract's minuend without this component knowing any kernel maths.
    target: addressable ? base.ref : base.terminalId,
    operands: rest.map((operand) => (addressable ? operand.ref : operand.terminalId)),
    // Bare terminal ids, always — `consumes` names the *records* this one
    // retires, which is lineage bookkeeping, not an operand reference. Exactly
    // the distinction `ui-035` drew for `supersedes`: an object here would
    // break `bodies()` outright. A sub-part-addressed boolean still retires the
    // whole composite it cut with, the same as a whole-body one.
    consumes: operands.map((operand) => operand.terminalId),
  }

  // `group.assemble` (TODO/ui-015) needs one display name per operand, so the
  // resulting Group's parts are addressable by name rather than by opaque
  // record id (the breadcrumb `ui-016` builds later). `SelectedOperand.name` is
  // the body's own name looked up by **lineage root** id — `documentStore.bodies`
  // keys each summary that way, while an operand's terminal record id only
  // coincides with it for a body that has never been superseded (moved), so
  // looking up by the terminal id would silently miss every moved operand and
  // fall back to its opaque record id. Deliberately `name`, not `label`: a
  // drilled-in operand joins the new group under its own body name, never
  // "Group 1 › Cube 1".
  if (op === 'group.assemble') {
    record.params = { names: operands.map((operand) => operand.name) }
  }

  try {
    documentStore.append(record, { origin: 'local' })
  } catch (error) {
    // New to these four buttons with `TODO/ui-040`: a `pieces` address the fold
    // rejects (a part name the composite no longer has, a pick depth left
    // hanging off a body that is no longer a composite) throws where nothing
    // could throw before — every operand used to be a bare id the fold had
    // already evaluated. Surfaced on the toolbar rather than the console, the
    // path Fillet/Chamfer established and Snap/Align reused; the selection is
    // left alone so the depth can be corrected.
    runError.value = error instanceof Error ? error.message : String(error)
    return
  }

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

const snapAlignDisabled = computed(
  () => selection.count !== EXACT_OPERANDS || timeline.previewing || inactiveSelected.value,
)

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
// Canonical since `TODO/ui-032`: the History panel has to label a *past*
// chamfer with the same words this popover offered when it was created, and two
// copies of this table would drift into a row reading `Top (+Z)` beside a form
// reading `z+`.
const FACE_OPTIONS = RIM_FACE_OPTIONS

/**
 * The exactly-1 precondition, shared by Fillet, Chamfer, Enlarge, Fit and Bisect —
 * CLAUDE.md's single-object-tool case. Named generically (not
 * `filletChamferDisabled`, this constant's original name before `TODO/ui-028`
 * joined three more buttons to the same gate) because it is one selection-count
 * rule five buttons happen to share, not a Fillet/Chamfer-specific concept.
 */
const EXACT_ONE = 1

const exactOneDisabled = computed(() => selection.count !== EXACT_ONE || timeline.previewing || inactiveSelected.value)

/** What a disabled exactly-1-gated button says when hovered or long-pressed. */
const EXACT_ONE_DISABLED_HINT = `Select exactly ${EXACT_ONE} solid`

/**
 * @param {{ label: string, hint: string }} operation
 * @returns {string}
 */
function exactOneTitleFor(operation) {
  return exactOneDisabled.value
    ? EXACT_ONE_DISABLED_HINT
    : `${operation.label} — ${operation.hint}`
}

/**
 * @param {string | null} op
 * @returns {op is 'modify.filletRim' | 'modify.chamferRim'}
 */
function isFilletChamferOp(op) {
  return op === 'modify.filletRim' || op === 'modify.chamferRim'
}

/**
 * @param {string | null} op
 * @returns {op is 'modify.enlarge' | 'modify.fit' | 'modify.bisect'}
 */
function isResizeOp(op) {
  return op === 'modify.enlarge' || op === 'modify.fit' || op === 'modify.bisect'
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
    !exactOneDisabled.value &&
    typeof radiusMm.value === 'number' &&
    Number.isFinite(radiusMm.value) &&
    radiusMm.value > 0,
)

/** Which popover is open, or none. */
const openPopover = ref(
  /** @type {'group.snap' | 'group.align' | 'modify.filletRim' | 'modify.chamferRim' | 'modify.enlarge' | 'modify.fit' | 'modify.bisect' | null} */ (
    null
  ),
)

// Tell the app an operation popover is open, so a background hosted-conflict dialog is deferred
// rather than stacked over it (TODO/ui-033, data-002 §11 rule 5: "no other popover or dialog
// is open"). Reporting only; nothing here reads it back.
const overlays = useOverlaysStore()
watch(openPopover, (open) => overlays.setOpen('ops-popover', open !== null))
onBeforeUnmount(() => overlays.setOpen('ops-popover', false))

/**
 * `TODO/ui-053`: Escape never had a handler here at all, for any of the three
 * popovers this toolbar owns (Snap/Align, Fillet/Chamfer, Enlarge/Fit/Bisect —
 * they all share `openPopover` and the one backdrop below). Pressing it did
 * nothing, so the popover — and its full-viewport `.ops__popover-backdrop`,
 * teleported to `<body>` with `pointer-events: auto` — stayed mounted. The next
 * pointerdown anywhere, including on a Library row, hit that backdrop instead
 * of its real target; the resulting click landed on the backdrop too (mousedown
 * and mouseup both resolve to the topmost element at their own coordinates, and
 * the backdrop covers the whole screen), which ran `closePopover` instead of
 * starting a placement. To the person doing it, that reads as "the popover
 * closed, then the next drag did nothing" — it is really one event doing both.
 * A second, identical drag then lands normally because the backdrop is gone.
 *
 * Registered on the **capture** phase so it always runs before any other
 * `window` keydown listener regardless of mount order — `TimelineStrips.vue`'s
 * own Escape handler already depends on exactly this priority (it checks
 * `event.defaultPrevented` and backs off), matching the "close the open
 * popover/dialog/menu, else leave preview" order its module doc names.
 *
 * @param {KeyboardEvent} event
 */
function onWindowKeydown(event) {
  if (event.key !== 'Escape' || openPopover.value === null) return
  event.preventDefault()
  closePopover()
}

onMounted(() => window.addEventListener('keydown', onWindowKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKeydown, true))

// --- Enlarge / Fit / Bisect (TODO/ui-028) -----------------------------------

/**
 * The three resize/cut ops. See the module doc's "Resize and Bisect are a
 * fourth shape" section for why exactly-1, `supersedes`, and no `name`.
 *
 * @type {ReadonlyArray<{ op: 'modify.enlarge' | 'modify.fit' | 'modify.bisect', label: string, glyph: string, hint: string }>}
 */
const RESIZE_OPERATIONS = Object.freeze([
  {
    op: 'modify.enlarge',
    label: 'Enlarge',
    glyph: '⤢',
    hint: 'Grow or shrink by a millimetre delta on each axis',
  },
  {
    op: 'modify.fit',
    label: 'Fit',
    glyph: '⇱',
    hint: 'Resize to an absolute millimetre size on each axis',
  },
  {
    op: 'modify.bisect',
    label: 'Bisect',
    glyph: '✂',
    hint: 'Cut into two independently selectable parts along one axis',
  },
])

/** Enlarge's per-axis delta (mm) — defaults to 0 (no-op) on every open. */
const enlargeDeltaMm = reactive(/** @type {Record<'x' | 'y' | 'z', number>} */ ({
  x: 0,
  y: 0,
  z: 0,
}))

/**
 * Fit's per-axis target size (mm) — defaults to the selected body's own
 * *current* size on open, not `0` (`fit`'s own sentinel for "leave this axis
 * alone" — see the module doc). `fitOpenedSizeMm` is a frozen snapshot of that
 * same default, used only to detect whether the user actually changed
 * anything (the same no-op guard Enlarge gets from "at least one field
 * non-zero").
 */
const fitSizeMm = reactive(/** @type {Record<'x' | 'y' | 'z', number>} */ ({ x: 0, y: 0, z: 0 }))
const fitOpenedSizeMm = reactive(
  /** @type {Record<'x' | 'y' | 'z', number>} */ ({ x: 0, y: 0, z: 0 }),
)

/** Fit's aspect-ratio checkbox — defaults unchecked on every open. */
const fitKeepAspectRatio = ref(false)

/** Bisect's axis dropdown — defaults to the first option, like Fillet/Chamfer's Face. */
const bisectAxis = ref(/** @type {'x' | 'y' | 'z'} */ (AXES[0]))

/**
 * Bisect's offset (mm). No default — see the module doc's §3: `bisect` treats
 * an omitted offset as "cut at the centre" and a literal `0` as "cut at the
 * minimum face," two different things, so this popover never pre-fills either.
 *
 * @type {import('vue').Ref<number | null>}
 */
const bisectOffsetMm = ref(/** @type {number | null} */ (null))

/**
 * Bisect's tilt angle, degrees. Defaults to `0` — "no tilt," the exact falsy
 * short-circuit `bisect()` itself applies (`TODO/ui-036`; see the module doc's
 * "Angled Bisect" section for why this is the one field on this popover that
 * *should* default to a real value rather than start blank).
 *
 * @type {import('vue').Ref<number | null>}
 */
const bisectAngleDeg = ref(/** @type {number | null} */ (0))

/**
 * Bisect's tilt axis — the world axis the cut plane rotates about. Only the two
 * axes perpendicular to the current cut axis are legal ({@link bisectRotateAxisOptions}),
 * and this ref is re-defaulted to {@link DEFAULT_ROTATE_AXIS}'s entry for the
 * current cut axis whenever that axis changes (see the `watch` below).
 *
 * @type {import('vue').Ref<'x' | 'y' | 'z'>}
 */
const bisectRotateAxis = ref(/** @type {'x' | 'y' | 'z'} */ (DEFAULT_ROTATE_AXIS[bisectAxis.value]))

/**
 * The two axes perpendicular to the current cut axis — the only legal values
 * for {@link bisectRotateAxis}'s dropdown (`bisect()` throws if the tilt axis
 * equals the cut axis).
 *
 * @type {import('vue').ComputedRef<Array<'x' | 'y' | 'z'>>}
 */
const bisectRotateAxisOptions = computed(() => AXES.filter((axis) => axis !== bisectAxis.value))

// Changing the cut axis can strand Rotate-axis on a value that is no longer in
// `bisectRotateAxisOptions` (e.g. cut axis x -> z with Rotate-axis left on
// 'y', still valid, vs. cut axis x -> y with Rotate-axis on 'y', now invalid
// since it equals the new cut axis) — re-default it to the kernel's own table
// every time, rather than only when the stale value would actually be illegal,
// so "leaving it alone" always reproduces the documented common case.
watch(bisectAxis, (axis) => {
  bisectRotateAxis.value = /** @type {'x' | 'y' | 'z'} */ (DEFAULT_ROTATE_AXIS[axis])
})

/**
 * Bisect's tilt hinge position along the third axis (neither the cut axis nor
 * the tilt axis), millimetres. No default — see the module doc's "Angled
 * Bisect" §4: left blank, this is *omitted* from the record at commit time so
 * the kernel's own default (that axis's centre) applies, rather than sent as a
 * literal `0` or `null`.
 *
 * @type {import('vue').Ref<number | null>}
 */
const bisectRotateOffsetMm = ref(/** @type {number | null} */ (null))

const canCommitResize = computed(() => {
  const op = openPopover.value
  if (!isResizeOp(op) || exactOneDisabled.value) return false
  if (op === 'modify.enlarge') {
    return [enlargeDeltaMm.x, enlargeDeltaMm.y, enlargeDeltaMm.z].some(
      (value) => typeof value === 'number' && Number.isFinite(value) && value !== 0,
    )
  }
  if (op === 'modify.fit') {
    const values = [fitSizeMm.x, fitSizeMm.y, fitSizeMm.z]
    if (!values.every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0)) {
      return false
    }
    // A no-op guard, mirroring Enlarge's "at least one non-zero": every field
    // still at the value it opened with means nothing was actually asked for.
    return (
      fitSizeMm.x !== fitOpenedSizeMm.x ||
      fitSizeMm.y !== fitOpenedSizeMm.y ||
      fitSizeMm.z !== fitOpenedSizeMm.z
    )
  }
  // modify.bisect
  return typeof bisectOffsetMm.value === 'number' && Number.isFinite(bisectOffsetMm.value)
})

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

/**
 * @typedef {object} SelectedOperand
 * @property {import('../../core/kernel/registry.js').OperandRef} ref What the
 *   record actually carries: a bare terminal id, or `{ id, pieces }` when this
 *   operand is drilled into a named part (`TODO/ui-035`, `TODO/ui-040`).
 * @property {string} terminalId The same id on its own, for `supersedes` and for
 *   `consumes` — both lineage bookkeeping, never an operand reference (see the
 *   module doc).
 * @property {string} name The body's own name, with no part attached — what
 *   `group.assemble` needs for its `params.names`.
 * @property {string} label What the toolbar shows: {@link name}, plus its part
 *   after a `›` when drilled in.
 * @property {boolean} isSubPart
 */

/**
 * Every selected item, resolved into the operands a record would carry right
 * now — the one place this component decides what its operands actually *are*
 * (`TODO/ui-035`, generalised to every button by `TODO/ui-040`). A computed
 * rather than something each commit works out for itself, because the toolbar
 * has to be able to *show* the same answer before anything is committed.
 *
 * Three reads, each with a reason it cannot be one of the others:
 *
 * - `documentStore.raw.currentIdOf(rootId)` — the *terminal* record id, which is
 *   what the kernel binds geometry to. The same discipline `run()` above states
 *   at length: a selection holds lineage-root ids, and a root's own entry still
 *   holds the geometry the body had when it was first placed.
 * - `documentStore.bodies` — keyed by *root* id, so the display name is looked up
 *   by `rootId`, not by the terminal id above. Exactly the lookup `run()`'s
 *   `group.assemble` names branch already has to make for the same reason.
 * - `selection.subPart` — `ui-016`'s pick depth, which carries the body it
 *   belongs to (`bodyId`, a root id), so it is matched against `rootId` too. It
 *   is a single depth for the whole selection, which is what makes asymmetric
 *   addressing the natural shape here rather than a special case: at most one of
 *   the two operands can be drilled in at a time.
 *
 * @type {import('vue').ComputedRef<SelectedOperand[]>}
 */
const selectedOperands = computed(() =>
  selection.ids.map((rootId) => {
    const terminalId = documentStore.raw.currentIdOf(rootId) ?? rootId
    const body = documentStore.bodies.find((candidate) => candidate.id === rootId)
    const name = body?.name ?? rootId
    const depth = selection.subPart
    const partName = depth && depth.bodyId === rootId ? depth.partName : null
    return {
      ref: partName === null ? terminalId : { id: terminalId, pieces: partName },
      terminalId,
      name,
      label: partName === null ? name : `${name} › ${partName}`,
      isSubPart: partName !== null,
    }
  }),
)

/** Whether any selected operand is currently drilled into a named part. */
const hasSubPartOperand = computed(() =>
  selectedOperands.value.some((operand) => operand.isSubPart),
)

/**
 * Every operand after the first, named — the "…removed from it" half of the
 * badge line. Joined here rather than in the template so the rendered text has
 * no interpolation whitespace to trim around the separator.
 *
 * @type {import('vue').ComputedRef<string>}
 */
const restOperandLabels = computed(() =>
  selectedOperands.value
    .slice(1)
    .map((operand) => operand.label)
    .join(', '),
)

/**
 * The same operand line as one plain string, for a `title`/`aria-label`.
 *
 * @type {import('vue').ComputedRef<string>}
 */
const operandSummary = computed(() => {
  const operands = selectedOperands.value
  if (operands.length === 0) return ''
  const suffix = hasSubPartOperand.value
    ? ' — booleans use that part; Group uses the whole body'
    : ''
  return `${operands[0].label} then ${restOperandLabels.value}${suffix}`
})

// A rejected commit's message describes one particular operand set, so it goes
// stale the moment that set changes — including the pick-depth change that is
// usually how the user *fixes* it. Cleared on any operand change rather than
// only on the next click, so a corrected selection does not sit under a
// message saying the old one was wrong.
watch(selectedOperands, () => {
  runError.value = null
})

/**
 * Any of this toolbar's five exactly-1-gated ops (Fillet, Chamfer, Enlarge,
 * Fit, Bisect) — `TODO/ui-028` joined three more to the pair `isFilletChamferOp`
 * already named, so the two watches below (and each other) need a combined
 * check rather than `isFilletChamferOp` alone missing the new three.
 *
 * @param {string | null} op
 * @returns {boolean}
 */
function isExactOneOp(op) {
  return isFilletChamferOp(op) || isResizeOp(op)
}

// If the selection stops being exactly 2 while a popover is open — a third
// solid picked, or one deselected — the precondition this popover exists to
// enforce is no longer met, so it closes itself rather than staying open for
// a commit that would now throw inside the registry's own `requireTwoOperands`.
watch(snapAlignDisabled, (isDisabled) => {
  if (isDisabled && !isExactOneOp(openPopover.value)) openPopover.value = null
})

// Same self-closing discipline for the exactly-1 precondition Fillet, Chamfer,
// Enlarge, Fit and Bisect all share — deselecting, or extending to a second
// solid, while any of their popovers is open.
watch(exactOneDisabled, (isDisabled) => {
  if (isDisabled && isExactOneOp(openPopover.value)) openPopover.value = null
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
  if (exactOneDisabled.value) return
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

  // Both operands, already resolved to terminal ids and (where the user has
  // drilled in) to a named part — see {@link selectedOperands} and the module
  // doc's "Sub-part-addressed operands" section.
  const [moving, reference] = selectedOperands.value
  if (!moving || !reference) return
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
    target: moving.ref,
    operands: [reference.ref],
    // Not `consumes` — see the module doc's "Snap and Align are a different
    // shape" section for why that would be a real bug here, not a style choice.
    // A bare id even when `target` above is `{ id, pieces }`: this names the
    // record whose logical body continues, not an operand (module doc §2).
    supersedes: moving.terminalId,
    params,
  }

  try {
    documentStore.append(record, { origin: 'local' })
  } catch (error) {
    // New to this pair with `TODO/ui-035`: a `pieces` address the fold rejects
    // (a part name the group no longer has, a pick depth left hanging off a body
    // that is no longer a composite) throws where nothing could throw before.
    // Surfaced in the popover rather than the console, the path Fillet/Chamfer
    // established; the popover stays open so the depth can be corrected.
    opError.value = error instanceof Error ? error.message : String(error)
    return
  }

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

/**
 * Open the Enlarge, Fit or Bisect popover, or close it if its own button is
 * clicked again — same toggle mechanism as {@link toggleFilletChamferPopover},
 * reused a third time rather than reinvented, per this task's own Interaction
 * model. Each op's fields get their own fresh defaults on open; see the module
 * doc's "Resize and Bisect are a fourth shape" section for why Fit's default is
 * the selected body's own current size rather than `0`.
 *
 * @param {'modify.enlarge' | 'modify.fit' | 'modify.bisect'} op
 * @returns {void}
 */
function toggleResizePopover(op) {
  if (exactOneDisabled.value) return
  if (openPopover.value === op) {
    openPopover.value = null
    return
  }
  opError.value = null
  if (op === 'modify.enlarge') {
    // A fresh delta every time — a value left over from a previous Enlarge
    // would otherwise silently carry over onto a different solid.
    enlargeDeltaMm.x = 0
    enlargeDeltaMm.y = 0
    enlargeDeltaMm.z = 0
  } else if (op === 'modify.fit') {
    // `selection.onlyId` is the lineage root; `documentStore.bodies` is keyed
    // by that same root id (`document.js`'s own `bodies()` convention). Its
    // `bounds` — not `geometry` — is what this reads: the store's own module
    // doc states geometry is deliberately kept out of this summary (Vue deep
    // reactivity over a multi-thousand-vertex solid is a performance bug per
    // CLAUDE.md), so `bounds` (already measured off the body's *current*
    // evaluated shape, not its original creation params — a moved/resized
    // body's own params can be stale, per `document.js`'s supersession note)
    // is the pre-computed size this popover needs without reaching past the
    // store's own boundary.
    const onlyId = selection.onlyId
    const body = onlyId ? documentStore.bodies.find((candidate) => candidate.id === onlyId) : undefined
    const [min, max] = body?.bounds ?? [
      [0, 0, 0],
      [0, 0, 0],
    ]
    const sizeX = max[0] - min[0]
    const sizeY = max[1] - min[1]
    const sizeZ = max[2] - min[2]
    fitSizeMm.x = sizeX
    fitSizeMm.y = sizeY
    fitSizeMm.z = sizeZ
    fitOpenedSizeMm.x = sizeX
    fitOpenedSizeMm.y = sizeY
    fitOpenedSizeMm.z = sizeZ
    fitKeepAspectRatio.value = false
  } else {
    // modify.bisect — axis resets to the first option; offset stays blank
    // (see the module doc's §3 for why no default is pre-filled here).
    // Angle/Rotate-axis/Rotate-offset (TODO/ui-036) reset too: Angle to its
    // own falsy default, Rotate-axis to the kernel's table entry for the
    // just-reset axis (the `watch` above also fires from this assignment, but
    // setting it here too keeps this branch a complete, self-contained reset
    // rather than relying on watcher ordering), Rotate-offset left blank.
    bisectAxis.value = AXES[0]
    bisectOffsetMm.value = null
    bisectAngleDeg.value = 0
    bisectRotateAxis.value = /** @type {'x' | 'y' | 'z'} */ (DEFAULT_ROTATE_AXIS[AXES[0]])
    bisectRotateOffsetMm.value = null
  }
  openPopover.value = op
}

/**
 * Commit the open popover's Enlarge, Fit or Bisect. See the module doc's
 * "Resize and Bisect are a fourth shape" section for why this record is
 * `supersedes`-based and unnamed even for Bisect, whose result is a two-part
 * `Group` rather than another bare solid — `supersedes` continues one body's
 * *identity*, and says nothing about which `KernelGeometry` kind sits on
 * either side of it.
 *
 * @returns {void}
 */
function commitResize() {
  const op = openPopover.value
  if (!isResizeOp(op) || !canCommitResize.value) return

  const onlyId = selection.onlyId
  if (!onlyId) return

  // Same operand-resolution discipline as `commitFilletChamfer` above: the
  // selection id is a lineage root, and the kernel needs the operand's
  // *current* terminal id, not the geometry it had when first placed.
  const targetId = documentStore.raw.currentIdOf(onlyId) ?? onlyId
  /** @type {Record<'modify.enlarge' | 'modify.fit' | 'modify.bisect', string>} */
  const idPrefixes = { 'modify.enlarge': 'enlarge', 'modify.fit': 'fit', 'modify.bisect': 'bisect' }
  const id = documentStore.raw.nextId(idPrefixes[op])

  /** @type {Record<string, any>} */
  let params
  if (op === 'modify.enlarge') {
    // A per-axis `[x, y, z]` vector — deliberately not the scalar
    // `group.snap`'s identically-named `deltaMm` param takes (`registry.js`'s
    // own comment on the naming collision, and the module doc's §1 above).
    params = { deltaMm: [enlargeDeltaMm.x, enlargeDeltaMm.y, enlargeDeltaMm.z] }
  } else if (op === 'modify.fit') {
    params = {
      sizeMm: [fitSizeMm.x, fitSizeMm.y, fitSizeMm.z],
      keepAspectRatio: fitKeepAspectRatio.value,
    }
  } else {
    // modify.bisect (TODO/ui-036 extends this with the angled form). A falsy
    // Angle must produce a record with the *exact* same shape as before this
    // task — only `axis`/`offsetMm`, no `angleDeg`/`rotateAxis`/
    // `rotateOffsetMm` keys at all — per the module doc's "Angled Bisect" §2
    // and this task's own Testing section regression guard.
    const angleDeg = bisectAngleDeg.value
    const hasTilt = typeof angleDeg === 'number' && Number.isFinite(angleDeg) && angleDeg !== 0
    if (hasTilt) {
      const rotateOffsetMm = bisectRotateOffsetMm.value
      params = {
        axis: bisectAxis.value,
        offsetMm: bisectOffsetMm.value,
        angleDeg,
        rotateAxis: bisectRotateAxis.value,
        // Omitted, not `null`, when left blank — see the module doc's §4: an
        // omitted rotateOffsetMm hinges on the third axis's own centre, which
        // is a different, real value from a literal `0`.
        ...(typeof rotateOffsetMm === 'number' && Number.isFinite(rotateOffsetMm)
          ? { rotateOffsetMm }
          : {}),
      }
    } else {
      params = { axis: bisectAxis.value, offsetMm: bisectOffsetMm.value }
    }
  }

  /** @type {import('../../core/kernel/registry.js').OpRecord} */
  const record = {
    id,
    op,
    // Unnamed, `supersedes`-based — see the module doc: the same reason
    // Fillet/Chamfer's own record above stays unnamed.
    target: targetId,
    supersedes: targetId,
    params,
  }

  try {
    documentStore.append(record, { origin: 'local' })
  } catch (error) {
    // Same first-user-facing-kernel-error path Fillet/Chamfer established —
    // an out-of-range Enlarge/Fit delta or an unknown Bisect axis surfaces
    // here rather than only in the console. The popover stays open so the
    // value can be corrected.
    opError.value = error instanceof Error ? error.message : String(error)
    return
  }

  // `supersedes` keeps `onlyId` — the lineage root — valid throughout, the
  // same reason a gizmo drag or a Fillet/Chamfer commit never has to reselect.
  selection.select(onlyId)
  closePopover()
}
</script>

<template>
  <div
    class="ops"
    data-testid="operations-toolbar"
    :data-enabled="disabled ? 'false' : 'true'"
    :data-error="runError ? 'true' : 'false'"
    :data-selected-count="selection.count"
    role="group"
    aria-label="Boolean, group, snap/align, fillet/chamfer and resize/bisect operations"
  >
    <p class="ops__badge" data-testid="operations-count">
      <span class="ops__count">{{ selection.count }} selected</span>
      <!-- The base/subtrahend relationship in words, alongside the two colours
           the scene paints it in. A user who has not read the docs still has to
           be able to tell which solid Subtract is going to cut. -->
      <span v-if="!disabled" class="ops__legend" data-testid="operations-legend">
        <span class="ops__swatch ops__swatch--base" aria-hidden="true" />first is the base
      </span>
      <!-- Two strings, one shown at a time by CSS (`TODO/ui-043`): the full
           sentence above 640px, a short one at/below it so the legend never
           wraps to a second line there — see `DISABLED_HINT_SHORT`'s own
           comment for the measured overlap this closes. -->
      <span v-else-if="inactiveSelected" class="ops__legend" data-testid="operations-inactive-note">
        not built — its condition doesn't hold
      </span>
      <span v-else class="ops__legend">
        <span class="ops__legend-full">{{ DISABLED_HINT.toLowerCase() }}</span>
        <span class="ops__legend-short">{{ DISABLED_HINT_SHORT.toLowerCase() }}</span>
      </span>
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
        :disabled="exactOneDisabled"
        :data-testid="`operation-${operation.label.toLowerCase()}`"
        :data-op="operation.op"
        :aria-expanded="openPopover === operation.op"
        :title="exactOneTitleFor(operation)"
        :aria-label="exactOneTitleFor(operation)"
        @click="toggleFilletChamferPopover(operation.op)"
      >
        <span class="ops__glyph" aria-hidden="true">{{ operation.glyph }}</span>
        <span class="ops__label">{{ operation.label }}</span>
      </button>

      <!-- Enlarge/Fit/Bisect (TODO/ui-028): the same exactly-1 gate as
           Fillet/Chamfer above, reusing that pair's own popover toggle
           mechanism a third time — see the module doc's "Resize and Bisect
           are a fourth shape" section for each op's own field set. -->
      <button
        v-for="operation in RESIZE_OPERATIONS"
        :key="operation.op"
        type="button"
        class="ops__btn"
        :disabled="exactOneDisabled"
        :data-testid="`operation-${operation.label.toLowerCase()}`"
        :data-op="operation.op"
        :aria-expanded="openPopover === operation.op"
        :title="exactOneTitleFor(operation)"
        :aria-label="exactOneTitleFor(operation)"
        @click="toggleResizePopover(operation.op)"
      >
        <span class="ops__glyph" aria-hidden="true">{{ operation.glyph }}</span>
        <span class="ops__label">{{ operation.label }}</span>
      </button>
    </div>

    <!-- What these four buttons are actually about to operate on, named
         (TODO/ui-040) — the same feedback Snap/Align's popover carries for the
         same reason, out here because these four commit on a single click with
         no popover to put it in. It is not decoration: a sub-part subtract and
         a whole-body subtract can produce different geometry from an
         identical-looking selection, and for `hardware.bolt` they produce
         literally the same solid, so without this line the only way to tell
         which one is armed is to run it and measure.

         **Below the button row, not above it**, and that is load-bearing rather
         than aesthetic: this toolbar's `max-width` is ~182px at the 390px phone
         reference, so a two-body operand line wraps to two or three lines
         there. Above the buttons, those lines push the whole row down — far
         enough, measured, that `Align` landed underneath the navigation
         chrome's Pan button and stopped being clickable at all (caught by
         `ui-035`'s own phone spec, not by looking at it). Below them, the
         buttons never move, and the text is the only thing that can be pushed
         anywhere. The e2e spec asserts the non-overlap directly at every
         reference viewport rather than trusting this comment. -->
    <p
      v-if="!disabled"
      class="ops__operands"
      data-testid="operation-operands"
      :data-subpart="hasSubPartOperand ? 'true' : 'false'"
    >
      <strong data-testid="operation-operand-base">{{ selectedOperands[0]?.label }}</strong>
      then
      <strong data-testid="operation-operand-rest">{{ restOperandLabels }}</strong>
      <!-- Group is the one button on this row that cannot address a part (its
           registry entry is not `subPartOperands`), so naming the three
           booleans here rather than "these buttons" is the difference between a
           true hint and one that silently mis-describes a fourth case. Folded
           into the same paragraph rather than given its own element, to spend
           as few of the phone layout's scarce lines as the point can be made
           in. -->
      <span v-if="hasSubPartOperand" class="ops__operands-note" data-testid="operation-operands-note">
        — booleans use that part; Group uses the whole body.
      </span>
    </p>

    <!-- A `pieces` address the kernel rejects, surfaced where it happened
         rather than in the console — the path Fillet/Chamfer established and
         Snap/Align reused (TODO/ui-040). -->
    <p v-if="runError" class="ops__error" data-testid="operation-error">{{ runError }}</p>

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

      <!-- Enlarge/Fit/Bisect (TODO/ui-028): this toolbar's third popover
           shape, reusing the Teleport/backdrop mechanism above verbatim.
           One `data-testid="resize-popover"` shared across all three ops,
           distinguished by `data-op` and the field set inside — the same
           "one popover, `data-op` tells them apart" shape Fillet/Chamfer's
           own popover above already established. -->
      <div
        v-else-if="openPopover && isResizeOp(openPopover)"
        class="ops__popover"
        data-testid="resize-popover"
        :data-op="openPopover"
      >
        <template v-if="openPopover === 'modify.enlarge'">
          <p class="ops__popover-note">
            Grows (positive) or shrinks (negative) the shape by this many
            millimetres on each axis, scaled about its own centre.
          </p>
          <label class="ops__popover-field">
            X delta (mm)
            <input type="number" v-model.number="enlargeDeltaMm.x" data-testid="resize-enlarge-dx" />
          </label>
          <label class="ops__popover-field">
            Y delta (mm)
            <input type="number" v-model.number="enlargeDeltaMm.y" data-testid="resize-enlarge-dy" />
          </label>
          <label class="ops__popover-field">
            Z delta (mm)
            <input type="number" v-model.number="enlargeDeltaMm.z" data-testid="resize-enlarge-dz" />
          </label>
        </template>

        <template v-else-if="openPopover === 'modify.fit'">
          <p class="ops__popover-note">
            Resizes the shape to this exact size on each axis. Fields start at
            the shape's own current size — leaving a field as-is, or setting it
            back to <strong>0</strong>, leaves that axis unchanged rather than
            shrinking it to nothing.
          </p>
          <label class="ops__popover-field">
            X size (mm)
            <input type="number" v-model.number="fitSizeMm.x" min="0" data-testid="resize-fit-x" />
          </label>
          <label class="ops__popover-field">
            Y size (mm)
            <input type="number" v-model.number="fitSizeMm.y" min="0" data-testid="resize-fit-y" />
          </label>
          <label class="ops__popover-field">
            Z size (mm)
            <input type="number" v-model.number="fitSizeMm.z" min="0" data-testid="resize-fit-z" />
          </label>
          <label class="ops__checkbox">
            <input type="checkbox" v-model="fitKeepAspectRatio" data-testid="resize-fit-keep-aspect" />
            Keep aspect ratio
          </label>
        </template>

        <template v-else>
          <p class="ops__popover-note">
            Cuts the shape into two independently selectable parts along one
            axis — the near part becomes <strong>negative</strong>, the far
            part <strong>positive</strong>.
          </p>
          <label class="ops__popover-field">
            Axis
            <select v-model="bisectAxis" data-testid="resize-bisect-axis">
              <option v-for="axis in AXES" :key="axis" :value="axis">{{ axis.toUpperCase() }}</option>
            </select>
          </label>
          <label class="ops__popover-field">
            Offset (mm)
            <input type="number" v-model.number="bisectOffsetMm" data-testid="resize-bisect-offset" />
          </label>
          <p class="ops__popover-hint">
            No default on purpose — type where along the axis to cut, measured
            from that axis's minimum face.
          </p>

          <!-- Angled Bisect (TODO/ui-036): tilts the cut plane instead of
               leaving it perpendicular to Axis. Angle at 0 (its own default)
               collapses to exactly the straight cut above, down to the
               record's own shape — see the module doc's "Angled Bisect"
               section. -->
          <label class="ops__popover-field">
            Angle (degrees)
            <input type="number" v-model.number="bisectAngleDeg" data-testid="resize-bisect-angle" />
          </label>
          <label class="ops__popover-field">
            Rotate-axis
            <select v-model="bisectRotateAxis" data-testid="resize-bisect-rotate-axis">
              <option v-for="axis in bisectRotateAxisOptions" :key="axis" :value="axis">
                {{ axis.toUpperCase() }}
              </option>
            </select>
          </label>
          <label class="ops__popover-field">
            Rotate-offset (mm)
            <input
              type="number"
              v-model.number="bisectRotateOffsetMm"
              data-testid="resize-bisect-rotate-offset"
            />
          </label>
          <p class="ops__popover-hint">
            No default on purpose, same as Offset above — left blank, the tilt
            hinges on the third axis's own centre.
          </p>
        </template>

        <!-- Same first-user-facing-kernel-error path Fillet/Chamfer established. -->
        <p v-if="opError" class="ops__popover-error" data-testid="resize-error">
          {{ opError }}
        </p>

        <div class="ops__popover-actions">
          <button
            type="button"
            class="ops__popover-cancel"
            data-testid="resize-cancel"
            @click="closePopover"
          >
            Cancel
          </button>
          <button
            type="button"
            class="ops__popover-commit"
            :disabled="!canCommitResize"
            data-testid="resize-commit"
            @click="commitResize"
          >
            {{ RESIZE_OPERATIONS.find((operation) => operation.op === openPopover)?.label }}
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

        <!-- What is actually about to be committed, named (TODO/ui-035). This
             replaces ui-026's printed "sub-part addressing isn't available yet"
             disclaimer, which is now false. It is not decoration: a
             sub-part-addressed move and a whole-object one both just slide one
             body, so without this line the only way to tell which of the two is
             armed is to run it and measure. The Inspector's breadcrumb is a
             different panel and only ever describes a single-body selection. -->
        <p
          class="ops__popover-operands"
          data-testid="snap-align-operands"
          :data-subpart="hasSubPartOperand ? 'true' : 'false'"
        >
          {{ openPopover === 'group.snap' ? 'Snapping' : 'Aligning' }}
          <strong data-testid="snap-align-operand-moving">{{ selectedOperands[0]?.label }}</strong>
          to
          <strong data-testid="snap-align-operand-reference">{{
            selectedOperands[1]?.label
          }}</strong>
        </p>

        <!-- A `pieces` address the kernel rejects — the same first-user-facing
             kernel-error path Fillet/Chamfer established, reused rather than
             reinvented (TODO/ui-035). -->
        <p v-if="opError" class="ops__popover-error" data-testid="snap-align-error">
          {{ opError }}
        </p>

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

/*
 * The disabled-state legend's short form (`TODO/ui-043`) stays hidden above
 * 640px, where the full sentence fits `.ops`'s own width on one line — see
 * `DISABLED_HINT_SHORT`'s own comment in the script block for the measurement
 * that makes the swap necessary below that width.
 */
.ops__legend-short {
  display: none;
}

/*
 * The operand line (TODO/ui-040). `overflow-wrap: anywhere` for the same reason
 * `.ops__popover-operands` has it: a body name is user-visible text of no fixed
 * length, and this box is deliberately narrow (`.ops`'s gizmo-avoiding
 * `max-width` is ~182px at the 390px phone reference), so a long name has to
 * break rather than push the toolbar out from under its own max-width.
 */
.ops__operands {
  margin: 0;
  padding: 0 2px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-3);
  overflow-wrap: anywhere;
}

.ops__operands strong {
  color: var(--text-2);
  font-weight: 650;
}

.ops__operands-note {
  color: var(--text-3);
}

/*
 * Same neutral treatment as `.ops__popover-error` — this codebase has no
 * "danger" custom property, and that pair's own comment records the decision
 * not to introduce one for a single message.
 */
.ops__error {
  margin: 0;
  padding: 6px 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-1);
  font-size: 11px;
  line-height: 1.4;
  overflow-wrap: anywhere;
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
  /* Above the phone Inspector bottom sheet (z-index 11), the SketchToolbar (12)
     and the open Library sheet (20) on purpose (TODO/ui-036): the popover is
     modal, and once Bisect grew to six fields its lower controls extended into
     the band the auto-opened Inspector sheet occupies at 390px, which then
     intercepted every pointer event aimed at Commit. */
  z-index: 30;
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
  z-index: 31;
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
 * The named operands (TODO/ui-035). Deliberately *not* `.ops__popover-hint`'s
 * 10px muted grey: this is the line that says which of two visually identical
 * commits is armed, so it reads at the note's weight rather than a footnote's.
 * `overflow-wrap: anywhere` because a composite's part names are not budgeted
 * (`raspberrypi.bplus` ships parts like `piMountingPad1`), and the popover is
 * only `min(260px, 100vw - 32px)` wide — a long name has to wrap inside that
 * box rather than push it past the 390px phone width the popover's own CSS
 * comment above guards.
 */
.ops__popover-operands {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.ops__popover-operands strong {
  color: var(--text-1);
  font-weight: 650;
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

/*
 * The kernel-error message is transient and has to be readable when it does
 * appear, and at phone width it lands in the same band as the navigation
 * chrome's own buttons (see `.ops__operands`'s phone rule below for the
 * measurement). The chrome carries no `z-index` of its own and simply paints
 * later, so lifting this box only while an error is showing puts the message in
 * front for as long as it exists and changes nothing the rest of the time —
 * deliberately not a standing `z-index` on `.ops`, which would park this
 * toolbar permanently over controls it has no business covering.
 */
.ops[data-error='true'] {
  z-index: 2;
}

@media (max-width: 640px) {
  /*
   * The operand line is the one thing on this toolbar that does not fit at
   * phone width, and that is measured rather than judged: at 390x844 the
   * column between this toolbar's top (y=61) and the navigation chrome's top
   * (y=207, after `TODO/ui-043`'s fix below closed the badge's own wrap) is
   * ~146px, and the button row alone already spends ~122px of it (11
   * icon-only buttons wrapped across three rows), leaving no room for an
   * extra line without reopening the overlap `TODO/ui-043` closed. An extra
   * line either pushes a button under the chrome — which happened once, and
   * took `ui-035`'s Align button out of reach entirely — or is painted behind
   * it, since the chrome paints later. So at this width the same text is read
   * by long-pressing any of the four buttons instead (`titleFor`), which is
   * this toolbar's own established touch affordance for its disabled hint,
   * not a hover-only fallback.
   */
  .ops__operands {
    display: none;
  }

  .ops {
    top: 8px;
    left: 8px;
    padding: 2px 4px;
    /* Tighter than the base rule's 6px (`TODO/ui-043`): this toolbar's own
       total height, not just the badge's line count, is what has to fit above
       `NavigationChrome` at this width — see `.ops__row`'s own gap override
       below and `DISABLED_HINT_SHORT`'s script-block comment for the full
       measurement. Trimming *this* container's padding/gap, never a bottom
       sheet's height or `--tap-compact`, is the budget this fix is allowed to
       spend from. */
    gap: 2px;
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

  /*
   * The badge's disabled-state legend swaps to its short form here
   * (`TODO/ui-043`) — see `DISABLED_HINT_SHORT`'s own script-block comment.
   */
  .ops__legend-full {
    display: none;
  }

  .ops__legend-short {
    display: inline;
  }

  /*
   * The base rule's 4px row/column gap, tightened (`TODO/ui-043`): this row
   * wraps to three lines at this width (11 icon-only buttons, `.ops`'s own
   * gizmo-avoiding `max-width`), so the *vertical* saving compounds across two
   * row-gaps. `--tap-compact` (the button size itself) and the row content are
   * both untouched — only the breathing room between rows/buttons shrinks.
   */
  .ops__row {
    gap: 2px;
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
