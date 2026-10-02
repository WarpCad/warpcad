<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Inspector panel: what the current selection *is*.
 *
 * This is the panel half of `docs/decisions/interaction-model-qa.md` control 3.
 * Selection is itself a trigger with a feedback contract, the same as any other
 * trigger — click a body and its own parameters appear here, alongside a
 * standing Transform section (control 3's Q14 explicitly adds that section,
 * because §7b's mockup shows per-op params but no position/rotation fields for
 * the gizmo to agree with).
 *
 * ## Three states, gated on selection *count*
 *
 * CLAUDE.md gates tools on selection count rather than presence, and control 3's
 * Q15 spells this panel's version out:
 *
 * - **0** → the scene's **object list** (`TODO/ui-049`), in place of the old
 *   "(nothing selected)": every body, with the rows, checks and ▸ disclosures the
 *   retired Objects panel had (`ui-041`/`ui-042`).
 * - **exactly 1** → the full contract: the op's own params plus Transform.
 * - **2+** → *no per-item fields*. There is no single object to describe. The
 *   count is shown and nothing else; critically, the previous single selection's
 *   fields must not linger, which is why `describeSelection` returns a null body
 *   rather than the panel hiding a stale one behind a `v-if`.
 *
 * ## The list stays reachable in every state (`TODO/ui-049`)
 *
 * This panel is the one place that lists the scene, and `ui-041`'s two-operand route
 * — the only no-keyboard, no-raycast way to Subtract an enclosed body — needs the list
 * to survive the first tap. So it is not only the empty state: it is a collapsible
 * **Objects** section at the top of every body state, collapsed by default at 1
 * selected (the body's detail is the focus) and expanded at 2+ (where the `1`/`2`
 * operand order is most useful), and a check leaves it open for the next operand
 * (`stores/objectList.js`). The breadcrumb gains a root **Objects** crumb that opens
 * it — "back to the list" as a named control rather than "deselect everything". The
 * section sits *above* the breadcrumb so the list does not move when the first check
 * turns the empty state into a one-body state.
 *
 * A composite's own parts get a **Parts** section — every part in group order, hidden
 * ones labelled — which replaces `ui-047`'s hidden-only list and carries its **Show
 * hidden parts** toggle unchanged.
 *
 * ## Registry-driven fields, not one form per primitive
 *
 * The fields come from `src/core/inspector.js`, which reads the selected
 * record's `op` and that op's own `ui.defaults` schema out of the kernel
 * registry — the same principle `src/core/library.js` established for the
 * Library panel's rows. Registering an eighth primitive gives it a correct
 * Inspector with no change to this file.
 *
 * ## Phone width
 *
 * With nothing selected (and something in the scene) the collapsed tab reads
 * **Objects (n)** and opens the sheet on the list (`TODO/ui-049`); an empty document
 * has no tab, since there is nothing to list and the Library tab is the way in.
 * Selecting from a row inside the open sheet keeps it open, and so does unchecking
 * the last row — the sheet only closes on a deselect the user made elsewhere
 * (swipe, empty viewport space).
 *
 * The sheet **auto-opens on selection, with no extra tap** (control 3, Q16).
 * Requiring a second tap to see the feedback would make selection behave
 * differently by form factor, which is exactly the platform-specific gap
 * `SECOND-ATTEMPT.md` warns about. Swiping the sheet down — or tapping empty
 * viewport space — dismisses it *and* clears the selection: one gesture, one
 * meaning.
 *
 * There is exactly **one** bottom-sheet slot at that width, and the Library
 * wants it too. `ui-011`'s acceptance drive found the two stacking into
 * unreadable mush — the Library's rows bleeding through the Inspector's
 * translucent ground — which no spec could see, because no spec had ever opened
 * both at once. The resolution, and its reasoning:
 *
 * - **Auto-open is suppressed while the Library sheet is up.** The Inspector
 *   collapses to its tab, which now carries the selected body's *name*, one tap
 *   away. This does not weaken Q16: Q16 is about the click-on-a-mesh trigger
 *   control 3 specifies, and with the Library closed that trigger still opens
 *   the sheet with no extra tap. What it protects is the flow underneath
 *   `TODO/ACCEPTANCE.md` scenario 1 — placing several shapes in a row — which
 *   auto-closing the Library on every drop would break.
 * - **Tapping this panel's tab claims the slot**, collapsing the Library. The
 *   user asked for this panel; the other one gets out of the way.
 *
 * ## Transform is writable, and so are the op's own params (TODO/ui-029)
 *
 * `ui-012` made the Transform section's Position and Rotation fields editable,
 * and they are the *same* mutation a gizmo drag performs — both go through
 * `src/composables/useTransformCommands.js`, so typing `40` and dragging to 40 mm
 * cannot produce different records (control 4's "either path results in the same
 * underlying mutation").
 *
 * `ui-029` extends the identical field contract — `editingField`/
 * `editingSnapshot`/`fieldValue`/`parseNumeric`/`onFieldFocus`/`onFieldEnter` —
 * to the **Parameters** section's numeric fields, wired to
 * `src/composables/useParamCommands.js` instead. Not a parallel implementation:
 * the live-typing guard that stops a re-render eating a half-typed value is the
 * same code, keyed by `param-*` rather than `position-*`/`rotation-*`.
 *
 * Three things stay read-only, each deliberately rather than by omission:
 *
 * - **Size**, because it is a *measurement* of the solid, not an input. Resizing
 *   a cylinder means editing its `diameter`/`height` params instead, and a
 *   writable Size box would imply a non-uniform scale op that does not exist.
 * - **`text`-kind params** — a bolt's `spec`/`fit`. Those are enums, not numbers:
 *   they need a dropdown fed by the recipe's own valid values, which is a
 *   genuinely different control and explicitly outside `ui-029`'s scope.
 * - **Every param of a body whose history carries a non-transform op** — a
 *   fillet, a chamfer. Editing a param rebuilds the creation record from
 *   scratch, and that rebuild cannot carry a rounded rim with it, so the panel
 *   freezes those fields and says which op is in the way. This is `ui-016`'s
 *   "freeze rather than silently do the wrong thing" precedent applied to a
 *   second section; the guard itself lives in `src/core/paramEdit.js`, because a
 *   guard against silent data loss that lives only in a component is one `v-if`
 *   away from not being a guard.
 *
 * During a gizmo drag the Position and Rotation fields read the *uncommitted*
 * preview (`src/stores/transformPreview.js`) via `useSelectedBody`, which is what
 * makes them track the drag live rather than jumping at release — control 4's
 * "not only after release". A field the user is actively typing into is left
 * alone, so a live re-render cannot overwrite half-typed input.
 */
import { computed, nextTick, ref, watch } from 'vue'

import { useSelectedBody } from '../../composables/useSelectedBody.js'
import { useSelectionStore } from '../../stores/selection.js'
import { useHiddenPartVisibilityStore } from '../../stores/hiddenPartVisibility.js'
import { useAlignReferenceStore } from '../../stores/alignReference.js'
import AlignToOrigin from './AlignToOrigin.vue'
import ObjectList from './ObjectList.vue'
import BillOfMaterials from '../display/BillOfMaterials.vue'
import DeleteButton from './DeleteButton.vue'
import ParamFields from './ParamFields.vue'
import SketchBodyFields from './SketchBodyFields.vue'
import SketchProfileFields from '../sketch/SketchProfileFields.vue'
import DependentsBanner from './DependentsBanner.vue'
import ConditionRow from './ConditionRow.vue'
import { useObjectListStore } from '../../stores/objectList.js'
import { useDocumentStore } from '../../stores/document.js'
import { useSketchEditorStore } from '../../stores/sketchEditor.js'
import { useTransformCommands } from '../../composables/useTransformCommands.js'
import { parseNumeric } from '../../composables/numericEntry.js'
import { useColorCommands } from '../../composables/useColorCommands.js'
import { useColorPreviewStore } from '../../stores/colorPreview.js'
import {
  colorIntToCssHex,
  cssHexToColorInt,
  effectiveOverrideOf,
  ownOverrideOf,
} from '../../core/colorOverride.js'
import { BODY_COLORS } from '../../render/mesh.js'
import { formatDeg, formatMmValue } from '../../core/units.js'

const props = defineProps({
  /**
   * True while another panel's bottom sheet holds the single phone-width sheet
   * slot — the Library, or (since `TODO/ui-032`) History. Purely a phone-width
   * concern: at tablet and laptop these are persistent columns and nothing
   * competes.
   *
   * Named for the *slot* rather than for the Library specifically, which is
   * what it always meant: this panel does not care which sibling is up, only
   * that one is, so it declines to auto-open over a panel the user deliberately
   * asked for. `AppView.vue` owns the arbitration; it is the only thing that
   * can see all three.
   */
  sheetSlotClaimed: { type: Boolean, default: false },
})

const emit = defineEmits(['sheet-change', 'claim-sheet'])

/** Vertical travel, in pixels, that counts as a deliberate swipe-to-dismiss. */
const SWIPE_DISMISS_PX = 36

const selection = useSelectionStore()
const described = useSelectedBody()
const documentStore = useDocumentStore()
const hiddenPartVisibility = useHiddenPartVisibilityStore()
const alignReference = useAlignReferenceStore()
const objectList = useObjectListStore()
const sketchEditor = useSketchEditorStore()

// --- Align-to-origin's Reference hand-off (TODO/ui-050) -------------------

/**
 * When the user drills into a named part (`TODO/ui-016`) and then steps back
 * up, the Align-to-origin row's Reference preselects that part — "I tapped
 * `mb`, now align from it" with no dropdown re-pick.
 *
 * This has to live here, in the always-mounted-while-single-selected parent,
 * rather than inside `AlignToOrigin.vue` itself: that component is unmounted
 * for exactly the state this watches (sub-part depth is where its own
 * `showRow` is false), so it can never observe its own step-up transition.
 */
watch(
  () => selection.subPart,
  (next, previous) => {
    if (!next && previous) alignReference.set(previous.bodyId, previous.partName)
  },
)

// --- the sketch editor (TODO/sketch-001) ---------------------------------

/**
 * What this panel is currently describing: `'sketch'` while the sketch editor is open —
 * the selected outline's fields, not a body's — or whatever the body description says.
 * One value, so the sheet state, the auto-open watcher and the template all branch on
 * the same thing rather than three near-copies.
 *
 * @returns {string}
 */
const panelState = computed(() => (sketchEditor.active ? 'sketch' : described.value.state))

/**
 * The single selected body, or `null`. Named separately from `described` so the
 * template can guard on it once and every field below reads a non-null value —
 * the shape that makes "2+ selected must not show stale fields" a structural
 * guarantee rather than a rule someone has to remember.
 */
const body = computed(() => described.value.body)

/**
 * True while the selection is drilled into one named part of a group
 * (`TODO/ui-016`).
 *
 * Everything this panel shows is **read-only** in that state, Transform
 * included — not as a policy choice but because there is nothing to write to:
 * `document.bodies()` exposes group-level ids only, so a `transform.*` record
 * committed from here would move the whole group while the panel named one
 * part. The viewport hides the gizmo for the same reason, so the two halves of
 * control 4's "either path results in the same underlying mutation" stay
 * consistent by both being absent rather than one of them lying.
 */
const isSubPart = computed(() => Boolean(body.value?.subPart))

const isOpen = ref(false)

// --- the object list (TODO/ui-049) -----------------------------------------

/** How many bodies are selected — what the Objects section's default depends on. */
const selectedCount = computed(() => described.value.count)

/**
 * Whether the Objects section is showing its rows: always at 0 selected (the list *is*
 * the panel then), otherwise the section's own remembered state for 1 or 2+.
 */
const objectsOpen = computed(() => objectList.isSectionOpen(selectedCount.value))

/** The sheet's own scroller, so the root crumb can bring the section into view. */
const sheetEl = ref(/** @type {HTMLElement | null} */ (null))

/**
 * The phone tab's label: the selection's name, or — with nothing selected — the list it
 * opens onto, with its count, so the tab says what tapping it will show.
 */
const tabLabel = computed(() => {
  if (sketchEditor.active) return 'Sketch'
  if (body.value) return body.value.name
  if (described.value.inactive) return described.value.inactive.name
  if (panelState.value === 'empty') return `Objects (${objectList.rows.length})`
  return 'Inspector'
})

/**
 * Set by a row gesture in the object list just before it selects (`select-intent`), and
 * read by the auto-open watcher below: a selection made from *inside* the open sheet must
 * not close it — unchecking the last row empties the selection, but the user is still
 * working in the list. Cleared on the next macrotask, after the watcher has run.
 */
let listIntent = false

function onListIntent() {
  listIntent = true
  setTimeout(() => {
    listIntent = false
  }, 0)
}

/** The root breadcrumb crumb: open the Objects section and bring it into view. */
async function onObjectsCrumb() {
  objectList.setSectionOpen(selectedCount.value, true)
  await nextTick()
  const section = sheetEl.value?.querySelector('[data-testid="inspector-objects"]')
  if (section && typeof section.scrollIntoView === 'function') section.scrollIntoView({ block: 'nearest' })
}

/**
 * How much of the viewport's bottom edge this panel currently covers at phone
 * width — `'none'`, just its `'tab'`, or the whole `'open'` sheet.
 *
 * Reported as three states rather than a boolean because the viewport's own
 * overlays inset by this amount, and "closed" is not the same as "absent": a
 * collapsed sheet still puts a 44px tab over the 3D view. Getting that wrong is
 * how `ui-011`'s acceptance drive found the scale readout sitting 25px behind
 * the sheet's top edge — the same class of defect `ui-010`'s drive found with
 * the Library tab, and equally invisible to a passing spec.
 *
 * @returns {'none' | 'tab' | 'open'}
 */
function sheetState() {
  if (isOpen.value) return 'open'
  if (panelState.value !== 'empty') return 'tab'
  // Nothing selected: the tab is still there, now labelled `Objects (n)`, as long as there
  // is something to list (`TODO/ui-049`).
  return objectList.rows.length > 0 ? 'tab' : 'none'
}

function reportSheet() {
  emit('sheet-change', sheetState())
}

/** @param {boolean} value */
function setOpen(value) {
  isOpen.value = value
  reportSheet()
}

// The auto-open contract. Watching the *description* rather than the raw ids
// means a selection that resolves to nothing (a stale id) does not pop an empty
// sheet open at phone width.
watch(
  [() => panelState.value, () => props.sheetSlotClaimed],
  ([state, libraryOpen], previous) => {
    const [previousState, previousClaimed] = previous ?? []
    // The sketch editor never auto-opens the sheet (`TODO/sketch-001`): at phone width it
    // would cover the very plane the user is about to draw on — ui-020's finding #3,
    // where an auto-opened sheet cut the reachable canvas from 69% to 29%. The tab stays,
    // labelled "Sketch", for the outline's fields when the user wants them.
    if (state === 'sketch') {
      if (previousState !== 'sketch') setOpen(false)
      return
    }
    if (state !== 'empty') {
      setOpen(!libraryOpen)
      return
    }
    // Nothing selected (`TODO/ui-049`): the sheet is open only because the user opened
    // it from its `Objects (n)` tab, so it closes on a *transition* that means "get out
    // of the way" — the selection emptying from outside the list (a swipe, a tap on
    // empty viewport space), or another sheet taking the slot — and never merely
    // because the Library it just displaced has finished collapsing. A deselect made
    // from a row inside the open sheet leaves it open on the list.
    // (On the immediate first run Vue passes `[]` as the previous values.)
    const initial = previousState === undefined
    const selectionEmptied = !initial && previousState !== 'empty'
    const slotTaken = libraryOpen && !previousClaimed
    if (initial || slotTaken || (selectionEmptied && !(listIntent && isOpen.value))) {
      setOpen(false)
    }
  },
  { immediate: true },
)

// The collapsed tab appears and disappears with the scene's first and last body, so the
// viewport's overlays have to hear about it the same way they hear about a selection.
watch(
  () => objectList.rows.length > 0,
  () => reportSheet(),
)

// --- swipe-to-dismiss (phone width) --------------------------------------

let swipeId = -1
let swipeStartY = 0

/** @param {PointerEvent} event */
function onGripDown(event) {
  swipeId = event.pointerId
  swipeStartY = event.clientY
}

/** @param {PointerEvent} event */
function onGripUp(event) {
  if (event.pointerId !== swipeId) return
  const travelPx = event.clientY - swipeStartY
  swipeId = -1
  if (travelPx > SWIPE_DISMISS_PX) {
    // Same gesture, same meaning as tapping empty viewport space: the sheet
    // closes *and* the selection clears, so the gizmo and dimension lines go
    // with it rather than being left attached to an invisible panel.
    selection.clear()
    setOpen(false)
  }
}

function onTabClick() {
  const next = !isOpen.value
  // Opening claims the single sheet slot, so the Library gets out of the way.
  if (next) emit('claim-sheet')
  setOpen(next)
}

// --- editable Transform fields (TODO/ui-012) ------------------------------

const transformCommands = useTransformCommands()

/**
 * The field the user currently has focus in, e.g. `"position-0"`, or `''`.
 *
 * A live gizmo drag re-renders these fields sixty times a second. Rebinding the
 * `value` of a field somebody is *typing* into would eat their keystrokes and
 * move their caret, so the focused field is left showing exactly what was typed
 * until it commits.
 */
const editingField = ref('')

/**
 * What the focused field displayed at the moment it was focused.
 *
 * Bound back to that field for as long as it stays focused, so the bound value
 * never *changes* and Vue therefore never writes to the element — leaving what
 * the user is typing exactly where it is. Returning `undefined` instead would put
 * the literal string "undefined" in the box, and re-binding the live value would
 * fight the keyboard.
 */
const editingSnapshot = ref('')

/**
 * The value to show in one Transform field: the live number, unless this is the
 * field being edited.
 *
 * @param {string} key
 * @param {string} display Already formatted for display.
 * @returns {string}
 */
function fieldValue(key, display) {
  return editingField.value === key ? editingSnapshot.value : display
}


/**
 * @param {Event} event
 * @param {string} key
 * @returns {void}
 */
function onFieldFocus(event, key) {
  editingSnapshot.value = /** @type {HTMLInputElement} */ (event.target).value
  editingField.value = key
}

/**
 * Commit a typed Transform field — the blur/Enter trigger control 4 specifies.
 *
 * @param {Event} event
 * @param {'position' | 'rotation'} which
 * @param {number} axisIndex
 * @returns {void}
 */
function commitTransformField(event, which, axisIndex) {
  const input = /** @type {HTMLInputElement} */ (event.target)
  const parsed = parseNumeric(input.value)
  const selectedBody = body.value
  // Releasing the field first means the re-render below repaints it with the
  // document's own formatting — which is also how a rejected value is undone,
  // with no separate "restore" path to keep in step.
  editingField.value = ''
  // A drilled-into sub-part's fields are `readonly`, so this should be
  // unreachable — but the guard is here rather than assumed, because the one
  // thing worse than no gizmo in this state is a numeric field that silently
  // moves the whole group (`TODO/ui-016`).
  if (parsed === null || !selectedBody || isSubPart.value) return
  if (which === 'position') transformCommands.setPositionAxis(selectedBody.id, axisIndex, parsed)
  else transformCommands.setRotationAxis(selectedBody.id, axisIndex, parsed)
}

/**
 * Enter commits without waiting for focus to move — a user typing a position and
 * pressing Enter expects the body to move, not to have to click elsewhere first.
 *
 * @param {KeyboardEvent} event
 * @returns {void}
 */
function onFieldEnter(event) {
  /** @type {HTMLInputElement} */ (event.target).blur()
}

// --- the Parts section (TODO/ui-049, superseding ui-047's Hidden parts) -----

/**
 * The selected body's parts, visible then hidden, each flagged — `src/core/inspector.js`'s
 * `describeBody`, the same tree the object list shows under the body's ▸. `[]` while
 * drilled into a sub-part (`describeSubPart` reports none: a part has no parts of its
 * own, the same reason Transform and Parameters are frozen there).
 */
const parts = computed(() => body.value?.parts ?? [])

/** Whether the *section* has anything to show — absent, not disabled, when not. */
const hasParts = computed(() => !isSubPart.value && parts.value.length > 0)

/** Whether the Show hidden parts toggle has anything to show (`ui-047`, unchanged). */
const hasHiddenParts = computed(() => parts.value.some((part) => part.hidden))

/**
 * Whether the selected body's hidden parts are currently drawn translucent —
 * UI-only view state (`src/stores/hiddenPartVisibility.js`), per body and
 * session-persistent, with no document record and no Undo step.
 */
const hiddenPartsShown = computed(() => {
  const id = body.value?.id
  return Boolean(id) && hiddenPartVisibility.isShown(/** @type {string} */ (id))
})

function onToggleHiddenParts() {
  const id = body.value?.id
  if (!id) return
  hiddenPartVisibility.toggle(id)
}

// --- the Color control (TODO/ui-037) --------------------------------------

const colorCommands = useColorCommands()
const colorPreview = useColorPreviewStore()

/**
 * The part the Color control addresses: the drilled-into part's name, or
 * `undefined` for the whole body. Unlike Transform and Parameters, colour *is*
 * editable while drilled in — `TODO/data-005` gave `style.recolor` a `subPart`,
 * so there is a record that means "just this part", which is exactly what those
 * two sections lack.
 */
const colorPart = computed(() => body.value?.subPart?.partName)

/**
 * The selected body's overrides, read off the store's plain-data summaries — the
 * same reactive source the scene list uses, so the swatch and the render cannot
 * disagree about a body's colour.
 */
const bodyColorOverrides = computed(() => {
  const id = body.value?.id
  if (!id) return undefined
  return documentStore.bodies.find((candidate) => candidate.id === id)?.colorOverrides
})

/** This key's own override — what Reset would clear. */
const ownColor = computed(() => ownOverrideOf(bodyColorOverrides.value, colorPart.value))

/** The override actually painting this part (its own, else the whole body's). */
const effectiveColor = computed(() => effectiveOverrideOf(bodyColorOverrides.value, colorPart.value))

/**
 * The recipe's own baked-in colour for this part (`TODO/render-003`), read off
 * `describeBody`/`describeSubPart`'s own precomputed answer (`src/core/inspector.js`)
 * rather than re-deriving it here — `core/colorOverride.js` is the one module that
 * owns colour precedence, and this component should not need a second copy of its
 * "which part has a single answer" rule.
 */
const recipeColor = computed(() => body.value?.recipeColor)

/**
 * The theme's default body colour, for a swatch with neither a user override nor
 * a recipe colour to show. Read from the same palette the viewport draws with,
 * so "Default" swatches the colour the body really is on screen rather than an
 * arbitrary grey.
 */
function defaultBodyColor() {
  const light =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches
  return (light ? BODY_COLORS.light : BODY_COLORS.dark).body
}

/** The swatch's `#rrggbb`: the live pick while the picker is open, else the truth. */
const colorSwatchHex = computed(() => {
  const selected = body.value
  if (
    selected &&
    colorPreview.isActive &&
    colorPreview.bodyId === selected.id &&
    colorPreview.subPart === (colorPart.value ?? '')
  ) {
    return colorIntToCssHex(colorPreview.color)
  }
  return colorIntToCssHex(effectiveColor.value?.color ?? recipeColor.value?.color ?? defaultBodyColor())
})

/**
 * What the readout beside the swatch says. A recipe colour with no user override
 * reads as its plain `#rrggbb` — the same as a user's own pick — rather than the
 * literal word `Default`: a freshly-dropped Washer *is* gray, not "using the
 * default", and `docs/selection-and-inspector.md`'s worked example depends on
 * that reading. `Reset` still disables correctly regardless (`:disabled="!ownColor"`
 * below), since resetting is about clearing a *user* override, not about whether
 * anything is currently showing a colour.
 */
const colorReadout = computed(() => {
  if (ownColor.value) return colorIntToCssHex(ownColor.value.color)
  if (effectiveColor.value) return `${colorIntToCssHex(effectiveColor.value.color)} (whole body)`
  if (recipeColor.value) return colorIntToCssHex(recipeColor.value.color)
  return 'Default'
})

/**
 * `input`: the picker is still open — preview only, nothing written.
 *
 * @param {Event} event
 */
function onColorInput(event) {
  const selected = body.value
  const color = cssHexToColorInt(/** @type {HTMLInputElement} */ (event.target).value)
  if (!selected || color === null) return
  colorCommands.preview(selected.id, color, colorPart.value)
}

/**
 * `change`: the user settled on a colour — one record, one Undo step.
 *
 * @param {Event} event
 */
function onColorChange(event) {
  const selected = body.value
  const color = cssHexToColorInt(/** @type {HTMLInputElement} */ (event.target).value)
  if (!selected || color === null) {
    colorCommands.cancelPreview()
    return
  }
  colorCommands.setColor(selected.id, color, colorPart.value)
}

function onColorReset() {
  const selected = body.value
  if (!selected) return
  colorCommands.resetColor(selected.id, colorPart.value)
}

// A preview belongs to the body (and part) it was started on. If the selection
// moves while a picker is still open — or the picker is dismissed without a
// `change`, then something else is selected — the old body must fall back to its
// committed colour rather than keep a colour nobody chose.
watch([() => body.value?.id, colorPart], () => {
  if (colorPreview.isActive) colorCommands.cancelPreview()
})
</script>

<template>
  <aside
    class="inspector"
    data-testid="inspector"
    :data-state="panelState"
    :data-open="isOpen ? 'true' : 'false'"
    :data-selected-id="sketchEditor.active ? '' : (body?.id ?? '')"
    :data-sub-part="body?.subPart?.partName ?? ''"
    :data-has-objects="objectList.rows.length > 0 ? 'true' : 'false'"
    aria-label="Inspector"
  >
    <button
      type="button"
      class="inspector__tab"
      data-testid="inspector-tab"
      :aria-expanded="isOpen"
      aria-controls="inspector-sheet"
      @click="onTabClick"
      @pointerdown="onGripDown"
      @pointerup="onGripUp"
    >
      <span class="inspector__grip" aria-hidden="true" />
      {{ tabLabel }}
    </button>

    <div id="inspector-sheet" ref="sheetEl" class="inspector__sheet" data-testid="inspector-sheet">
      <h2 class="inspector__heading">Inspector</h2>

      <!-- The object list (TODO/ui-049): the whole content at 0 selected, a collapsible
           section at the top of every body state. One mount point, above the state
           branches, so the list does not move when the first check turns "nothing" into
           "one body". Not shown while the sketch editor is open — it cannot select solids. -->
      <section
        v-if="panelState !== 'sketch'"
        class="inspector__objects"
        data-testid="inspector-objects"
        :data-collapsible="panelState === 'empty' ? 'false' : 'true'"
        :data-open="objectsOpen ? 'true' : 'false'"
      >
        <h3 v-if="panelState === 'empty'" class="inspector__objects-bar">Objects</h3>
        <button
          v-else
          type="button"
          class="inspector__objects-bar inspector__objects-bar--button"
          data-testid="inspector-objects-header"
          :aria-expanded="objectsOpen"
          aria-controls="inspector-objects-list"
          @click="objectList.toggleSection(selectedCount)"
        >
          <span>Objects</span>
          <span class="inspector__objects-count">({{ objectList.rows.length }})</span>
          <span class="inspector__objects-chevron" :class="{ 'inspector__objects-chevron--open': objectsOpen }" aria-hidden="true"
            >▸</span
          >
        </button>
        <div v-if="objectsOpen" id="inspector-objects-list">
          <ObjectList @select-intent="onListIntent" />
        </div>
      </section>

      <!-- The Bill of Materials (TODO/ui-038): read-only, selection-independent, hidden
           until a hardware / kit / Pi part is placed. -->
      <BillOfMaterials v-if="panelState !== 'sketch'" />

      <!-- The sketch editor (TODO/sketch-001): the selected outline's fields, edited in
           the editor's draft. No Transform section and no gizmo — an outline is shaped by
           its own numbers, and the body moves as a whole once it is done. -->
      <template v-if="sketchEditor.active">
        <SketchProfileFields />
      </template>

      <template v-else-if="described.state === 'multi'">
        <p class="inspector__count" data-testid="inspector-multi">
          {{ described.count }} selected
        </p>
        <p class="inspector__note">
          Select a single object to see its parameters. Operations that work on several
          objects at once arrive with the boolean tools.
        </p>
        <!-- Delete every selected object as one step (TODO/ui-051). -->
        <DeleteButton />
      </template>

      <!-- A body a condition is keeping out of the fold (TODO/ui-052): not drawn, so only
           the object list can select it — and this is where its condition is edited. -->
      <template v-else-if="described.state === 'inactive' && described.inactive">
        <nav class="inspector__breadcrumb" data-testid="inspector-breadcrumb" aria-label="Selection depth">
          <button
            type="button"
            class="inspector__crumb inspector__crumb--link"
            data-testid="inspector-breadcrumb-root"
            @click="onObjectsCrumb"
          >
            Objects
          </button>
          <span class="inspector__crumb-sep" aria-hidden="true">▸</span>
          <span class="inspector__crumb" aria-current="true">{{ described.inactive.name }}</span>
        </nav>
        <p class="inspector__name" data-testid="inspector-name">{{ described.inactive.name }}</p>
        <p class="inspector__note" data-testid="inspector-inactive-note">
          <template v-if="described.inactive.state === 'inactive'">
            Not built right now: it only exists while its condition holds, so it isn't drawn and
            can't be picked in the 3D view. Edit or remove the condition to change that.
          </template>
          <template v-else>
            Its condition can't be evaluated any more, so it isn't built. Edit or remove the
            condition to fix it.
          </template>
        </p>
        <ConditionRow :record-id="described.inactive.id" :condition="described.inactive.condition" />
      </template>

      <template v-else-if="body">
        <!-- The pick-depth breadcrumb (TODO/ui-016). Present only while a part
             inside a group is the selection, and the whole reason control 6
             asks for it: without it, narrowing from the assembly to one member
             is a silent field swap, indistinguishable on screen from a bug. -->
        <nav class="inspector__breadcrumb" data-testid="inspector-breadcrumb" aria-label="Selection depth">
          <!-- The root crumb (TODO/ui-049): back to the list, selection intact. -->
          <button
            type="button"
            class="inspector__crumb inspector__crumb--link"
            data-testid="inspector-breadcrumb-root"
            @click="onObjectsCrumb"
          >
            Objects
          </button>
          <span class="inspector__crumb-sep" aria-hidden="true">▸</span>
          <template v-if="body.subPart">
            <button
              type="button"
              class="inspector__crumb inspector__crumb--link"
              data-testid="inspector-breadcrumb-group"
              @click="selection.stepUp()"
            >
              {{ body.subPart.groupName }}
            </button>
            <span class="inspector__crumb-sep" aria-hidden="true">▸</span>
            <span class="inspector__crumb" data-testid="inspector-breadcrumb-part" aria-current="true">
              {{ body.subPart.partName }}
            </span>
          </template>
          <span v-else class="inspector__crumb" data-testid="inspector-breadcrumb-body" aria-current="true">
            {{ body.name }}
          </span>
        </nav>
        <p class="inspector__name" data-testid="inspector-name">{{ body.name }}</p>
        <p class="inspector__op" data-testid="inspector-op" :data-op="body.op">
          {{ body.opLabel }}
        </p>
        <!-- A breakage committed with Leave broken (TODO/ui-052): on the body whose parts
             went missing and on the dependent, each with Resolve…. -->
        <DependentsBanner v-if="!body.subPart" :body="body" />

        <!-- The Color control (TODO/ui-037). Its own small section, and the first
             one, because it is a single row: at phone width it is on screen the
             moment the sheet opens, without scrolling past Parameters. -->
        <section
          class="inspector__section"
          data-testid="inspector-color"
          :data-color="colorIntToCssHex((effectiveColor ?? recipeColor)?.color ?? defaultBodyColor())"
          :data-own-color="ownColor ? colorIntToCssHex(ownColor.color) : ''"
          :data-color-part="colorPart ?? ''"
          :data-recipe-color="recipeColor ? colorIntToCssHex(recipeColor.color) : ''"
        >
          <h3 class="inspector__section-title">Color</h3>
          <div class="inspector__color-row">
            <input
              class="inspector__swatch"
              type="color"
              data-testid="inspector-color-input"
              :aria-label="`Color of ${colorPart ?? body.name}`"
              :value="colorSwatchHex"
              @input="onColorInput"
              @change="onColorChange"
            />
            <span class="inspector__color-value" data-testid="inspector-color-value">{{ colorReadout }}</span>
            <button
              type="button"
              class="inspector__color-reset"
              data-testid="inspector-color-reset"
              :disabled="!ownColor"
              @click="onColorReset"
            >
              Reset
            </button>
          </div>
          <p v-if="colorPart" class="inspector__note" data-testid="inspector-color-note">
            This colours only {{ colorPart }}. Step back up to {{ body.subPart?.groupName }} to
            colour the whole part; a colour set here stays on {{ colorPart }} either way.
          </p>
        </section>

        <!-- The Parts section (TODO/ui-049, superseding ui-047's Hidden parts): every
             part of a composite in group order, hidden ones labelled, in the object
             list's own row style and gestures — tap a part to drill to it, its check to
             add it as an operand, hover to find it in the view. Absent, not disabled,
             for a bare solid. -->
        <section v-if="hasParts" class="inspector__section" data-testid="inspector-parts">
          <h3 class="inspector__section-title">Parts</h3>
          <label
            v-if="hasHiddenParts"
            class="inspector__hidden-toggle"
            data-testid="inspector-hidden-parts-toggle-row"
          >
            <input
              type="checkbox"
              data-testid="inspector-hidden-parts-toggle"
              :checked="hiddenPartsShown"
              @change="onToggleHiddenParts"
            />
            Show hidden parts
          </label>
          <ObjectList mode="parts" :body-id="body.id" @select-intent="onListIntent" />
          <p class="inspector__note" data-testid="inspector-parts-note">
            Tap a part to select just that part, or its check to add it as an operand.
            <template v-if="hasHiddenParts">
              Parts marked <strong>hidden</strong> drive a boolean but are not drawn — turn on
              <strong>Show hidden parts</strong> to see them as a translucent overlay.
            </template>
          </p>
        </section>

        <!-- Parameters (TODO/ui-029, extracted by TODO/ui-052): a primitive's numbers, a
             composite's catalogue choices as native selects, and a drilled-into part's
             parent choices read-only with a way back up. -->
        <!-- A sketch body's outlines and extrusion are not a row of numbers: its own
             section, with Edit sketch (TODO/sketch-001). -->
        <SketchBodyFields v-if="body.op === 'primitive.sketch' && !body.subPart" :body="body" />
        <ParamFields v-else :body="body" />
        <ConditionRow v-if="body.condition && !body.subPart" :record-id="body.id" :condition="body.condition" />

        <section class="inspector__section" data-testid="inspector-transform">
          <h3 class="inspector__section-title">Transform</h3>
          <dl class="inspector__fields">
            <dt class="inspector__label">Position <span class="inspector__unit">(mm)</span></dt>
            <dd class="inspector__value inspector__value--vector">
              <label v-for="(axis, index) in ['x', 'y', 'z']" :key="`p-${axis}`" class="inspector__component">
                <span class="inspector__component-label">{{ axis.toUpperCase() }}</span>
                <input
                  class="inspector__input"
                  :class="{ 'inspector__input--editable': !isSubPart }"
                  type="text"
                  inputmode="decimal"
                  :readonly="isSubPart"
                  :data-testid="`inspector-position-${axis}`"
                  :aria-label="`Position ${axis.toUpperCase()} in millimetres`"
                  :value="fieldValue(`position-${index}`, formatMmValue(body.positionMm[index]))"
                  @focus="onFieldFocus($event, `position-${index}`)"
                  @blur="commitTransformField($event, 'position', index)"
                  @keydown.enter.prevent="onFieldEnter"
                />
              </label>
            </dd>

            <dt class="inspector__label">Rotation <span class="inspector__unit">(°)</span></dt>
            <dd class="inspector__value inspector__value--vector">
              <label v-for="(axis, index) in ['x', 'y', 'z']" :key="`r-${axis}`" class="inspector__component">
                <span class="inspector__component-label">{{ axis.toUpperCase() }}</span>
                <input
                  class="inspector__input"
                  :class="{ 'inspector__input--editable': !isSubPart }"
                  type="text"
                  inputmode="decimal"
                  :readonly="isSubPart"
                  :data-testid="`inspector-rotation-${axis}`"
                  :aria-label="`Rotation ${axis.toUpperCase()} in degrees`"
                  :value="fieldValue(`rotation-${index}`, formatDeg(body.rotationDeg[index]))"
                  @focus="onFieldFocus($event, `rotation-${index}`)"
                  @blur="commitTransformField($event, 'rotation', index)"
                  @keydown.enter.prevent="onFieldEnter"
                />
              </label>
            </dd>

            <!-- The part's own size, on its own axes (`TODO/ui-023`) — the very
                 numbers the viewport's dimension lines quote, so the panel and
                 the overlay can never disagree about how big a rotated part is.
                 The larger world-axis box is a different measurement and is not
                 shown here; it is what the gizmo sizes itself to clear. -->
            <dt class="inspector__label">Size <span class="inspector__unit">(mm)</span></dt>
            <dd class="inspector__value inspector__value--vector">
              <label v-for="(axis, index) in ['x', 'y', 'z']" :key="`s-${axis}`" class="inspector__component">
                <span class="inspector__component-label">{{ axis.toUpperCase() }}</span>
                <input
                  class="inspector__input"
                  type="text"
                  readonly
                  :data-testid="`inspector-size-${axis}`"
                  :value="formatMmValue(body.localSizeMm[index])"
                />
              </label>
            </dd>
          </dl>

          <!-- Align to origin (`TODO/ui-050`) — self-gated, "absent, not
               disabled" the same way the Parts section above is: it
               renders nothing at 2+ selected or at sub-part depth, both of
               which are already impossible here (this whole branch is
               `v-else-if="body"`, and `isSubPart` freezes everything else in
               this section), and nothing for a bare solid's own Reference
               dropdown, so it needs no extra guard from this file. -->
          <AlignToOrigin />
        </section>

        <p v-if="isSubPart" class="inspector__note" data-testid="inspector-transform-note">
          You are looking inside {{ body.subPart?.groupName }}. A part is shown here for
          measurement only — move or turn the whole group instead, by stepping back up to
          it with the {{ body.subPart?.groupName }} link above.
        </p>
        <p v-else class="inspector__note" data-testid="inspector-transform-note">
          Position and rotation are editable — type a value and press Enter, or drag the
          gizmo's arrows and rings in the 3D view. Size is read-only: it is a measurement
          of the shape, not a setting — change the parameters above to resize it.
        </p>

        <!-- Delete / Remove part (TODO/ui-051): last in the section, below ui-050's
             Align row, so a stray tap near the top fields cannot reach it. -->
        <DeleteButton />
      </template>
    </div>
  </aside>
</template>

<style scoped>
/* The Color control (TODO/ui-037). The swatch is the tap target, so it is sized
   like one — 44px square at every width, not shrunk to fit beside the text. */
.inspector__color-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.inspector__swatch {
  flex: none;
  width: 44px;
  height: 44px;
  padding: 2px;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  cursor: pointer;
}

.inspector__swatch:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.inspector__color-value {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.inspector__color-reset {
  flex: none;
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  cursor: pointer;
}

.inspector__color-reset:disabled {
  color: var(--text-3);
  cursor: default;
}

.inspector__color-reset:focus-visible {
  outline: 2px solid var(--accent);
}

/* The Hidden parts section (TODO/ui-047). The toggle's whole label is the tap
   target, not the bare checkbox square — a native checkbox alone is nowhere
   near 44px, and CLAUDE.md's tap-target rule is about the thing a finger has
   to hit, not the box that happens to render inside it. */
.inspector__hidden-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  font-size: 12px;
  color: var(--text-1);
  cursor: pointer;
}

.inspector__hidden-toggle input {
  width: 20px;
  height: 20px;
  flex: none;
  accent-color: var(--accent);
}

/* The object list's section (TODO/ui-049). The bar is the same 44px at every state —
   a plain title at 0 selected, the collapse button otherwise — so the rows below it do
   not move when the first check turns "nothing" into "one body". */
.inspector__objects {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.inspector__objects-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  margin: 0;
  padding: 0;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-3);
}

.inspector__objects-bar--button {
  width: 100%;
  border: none;
  border-bottom: 1px solid var(--border);
  background: transparent;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}

.inspector__objects-bar--button:hover {
  color: var(--text-1);
}

.inspector__objects-bar--button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.inspector__objects-count {
  font-weight: 500;
  letter-spacing: 0;
}

.inspector__objects-chevron {
  margin-left: auto;
  padding-right: 8px;
  font-size: 13px;
  transition: transform 0.12s ease;
}

.inspector__objects-chevron--open {
  transform: rotate(90deg);
}

.inspector {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--surface-1);
  border-left: 1px solid var(--border);
}

.inspector__tab {
  /* Tablet and laptop keep the column visible, so the tab is phone-only. */
  display: none;
}

.inspector__sheet {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  padding: 10px 12px 14px;
  overflow-y: auto;
}

.inspector__heading {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}

.inspector__count {
  margin: 6px 0;
  font-size: 13px;
  color: var(--text-3);
}

.inspector__count {
  font-weight: 600;
  color: var(--text-1);
}

/* The pick-depth breadcrumb (TODO/ui-016). Wraps rather than truncates: a part
   name is the one thing on this row a user needs to read in full, and at 390px
   "Group 1 ▸ Raspberry Pi 5" does not fit on one line. */
.inspector__breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
  font-size: 11px;
  color: var(--text-3);
}

.inspector__crumb {
  min-width: 0;
  padding: 0;
  font-size: 11px;
}

.inspector__crumb--link {
  /* A real tap target at phone width without a button's usual chrome — this
     reads as a breadcrumb, not as a fifth control competing with the toolbar. */
  min-height: 28px;
  padding: 4px 2px;
  border: none;
  background: none;
  color: var(--accent, var(--text-2));
  font: inherit;
  font-size: 11px;
  text-decoration: underline;
  cursor: pointer;
}

.inspector__crumb--link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.inspector__crumb-sep {
  color: var(--text-3);
}

.inspector__name {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
  color: var(--text-1);
}

.inspector__op {
  margin: 0 0 8px;
  font-size: 11px;
  color: var(--text-3);
}

.inspector__section {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.inspector__section-title {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-3);
}

.inspector__fields {
  display: grid;
  gap: 6px 8px;
  margin: 0;
}

.inspector__label {
  font-size: 12px;
  color: var(--text-2);
}

.inspector__value {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 2px;
}

.inspector__value--vector {
  /* Three equal columns rather than three fixed-width boxes: a position of
     `-47.79` has to fit whatever width the panel actually has, at 220px on a
     portrait tablet as much as at 280px on a laptop. The acceptance drive found
     the fixed-em version clipping its own numbers. */
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
}

.inspector__component {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
}

.inspector__component-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
}

.inspector__input {
  width: 100%;
  min-width: 0;
  /* 34px keeps a field a real tap target at phone width without turning the
     panel into a wall of chrome (Responsive Layout). */
  min-height: 34px;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: var(--font-mono);
  font-size: 12px;
}

.inspector__input:read-only {
  color: var(--text-2);
  cursor: default;
}

/* An editable field has to *look* editable, or a user will assume the whole
   panel is still the read-only display `ui-011` shipped and never try typing. */
.inspector__input--editable {
  border-color: var(--border-strong, var(--border));
  color: var(--text-1);
}

.inspector__input--editable:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.inspector__unit {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
}

.inspector__note {
  margin: 10px 0 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-3);
}

/*
 * A kernel validation error from a typed param (TODO/ui-029). Deliberately the
 * same neutral treatment `OperationsToolbar.vue`'s `.ops__popover-error`
 * (TODO/ui-027) already uses — no dedicated "danger" custom property exists in
 * this codebase yet, and inventing a red token for the second message of this
 * kind would leave the two error surfaces looking like different features.
 */
.inspector__error {
  margin: 8px 0 0;
  padding: 6px 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-size: 11px;
  line-height: 1.4;
}

/* --- phone: an auto-opening bottom sheet (interaction-model-qa control 3, Q16) */
@media (max-width: 640px) {
  .inspector {
    position: absolute;
    right: 0;
    /* Stacked directly above the Library sheet's collapsed tab rather than on
       top of it — ui-010's hand-drive found exactly this class of overlap. */
    bottom: var(--library-tab-height, 52px);
    left: 0;
    z-index: 11;
    border-left: none;
    border-top: 1px solid var(--border);
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    /* Opaque, unlike the Library's glass sheet. Two translucent sheets that ever
       overlap render as unreadable mush — the defect `ui-011`'s acceptance drive
       found. The slot coordination above should stop them overlapping at all;
       this is the belt to that pair of braces. */
    background: var(--surface-1);
    box-shadow: var(--shadow-overlay);
  }

  .inspector__tab {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 6px 12px;
    border: none;
    background: transparent;
    color: var(--text-1);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    touch-action: none;
  }

  .inspector__grip {
    width: 32px;
    height: 4px;
    border-radius: 2px;
    background: var(--text-3);
  }

  .inspector__sheet {
    display: none;
    max-height: 38vh;
  }

  .inspector[data-open='true'] .inspector__sheet {
    display: flex;
  }

  /* Nothing selected and nothing in the scene to list: the sheet's own tab would
     just be a bar of dead chrome over the 3D view. With bodies in the scene the tab
     stays, labelled `Objects (n)` (TODO/ui-049). */
  .inspector[data-state='empty'][data-open='false'][data-has-objects='false'] {
    display: none;
  }
}
</style>
