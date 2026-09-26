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
 * - **0** → the empty state, "(nothing selected)".
 * - **exactly 1** → the full contract: the op's own params plus Transform.
 * - **2+** → *no per-item fields*. There is no single object to describe. The
 *   count is shown and nothing else; critically, the previous single selection's
 *   fields must not linger, which is why `describeSelection` returns a null body
 *   rather than the panel hiding a stale one behind a `v-if`.
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
import { computed, ref, watch } from 'vue'

import { useSelectedBody } from '../../composables/useSelectedBody.js'
import { useSelectionStore } from '../../stores/selection.js'
import { useHiddenPartVisibilityStore } from '../../stores/hiddenPartVisibility.js'
import { useDocumentStore } from '../../stores/document.js'
import { useSketchPreviewStore } from '../../stores/sketchPreview.js'
import { useTransformCommands } from '../../composables/useTransformCommands.js'
import { useParamCommands } from '../../composables/useParamCommands.js'
import { useSketchCommands } from '../../composables/useSketchCommands.js'
import { useColorCommands } from '../../composables/useColorCommands.js'
import { useColorPreviewStore } from '../../stores/colorPreview.js'
import {
  colorIntToCssHex,
  cssHexToColorInt,
  effectiveOverrideOf,
  ownOverrideOf,
} from '../../core/colorOverride.js'
import { BODY_COLORS } from '../../render/mesh.js'
import { lengthOf } from '../../sketch/entity.js'
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
const sketchPreview = useSketchPreviewStore()
const sketchCommands = useSketchCommands()

// --- the sketch-entity branch (TODO/ui-020) -------------------------------

/**
 * The selected sketch entity, with a live endpoint drag folded in — or `null`.
 *
 * **Alongside** the body contract above, never replacing it: a sketch entity
 * and a body are different kinds of thing, and the selection store keeps them
 * mutually exclusive (see its `sketchId`), so exactly one of these two branches
 * is ever non-null.
 *
 * Reading `sketchPreview` here is what makes the fields track an endpoint
 * handle **live** rather than jumping at release — section 7's Q14, and the
 * same contract control 4 already established for the 3D gizmo.
 */
const sketchEntity = computed(() => {
  const id = selection.sketchId
  if (!id) return null
  const entity = documentStore.sketchEntities.find((candidate) => candidate.id === id)
  if (!entity) return null
  if (!sketchPreview.isActive || sketchPreview.entityId !== id) return entity
  /** @type {[number, number]} */
  const point = [sketchPreview.xMm, sketchPreview.yMm]
  const startMm = sketchPreview.which === 'start' ? point : entity.startMm
  const endMm = sketchPreview.which === 'end' ? point : entity.endMm
  // Length is recomputed from the previewed points through the *same* helper
  // the document uses, so the panel and the overlay can never quote two
  // different numbers for one line.
  return { ...entity, startMm, endMm, lengthMm: lengthOf(startMm, endMm) }
})

/**
 * What this panel is currently describing: `'sketch'`, or whatever the body
 * description says. One value, so the sheet state, the auto-open watcher and
 * the template all branch on the same thing rather than three near-copies.
 *
 * @returns {string}
 */
const panelState = computed(() => (sketchEntity.value ? 'sketch' : described.value.state))

/**
 * Commit one typed endpoint coordinate — the same mutation the endpoint handle
 * performs, through the same composable, so typing `40` and dragging to 40 mm
 * cannot produce different records.
 *
 * @param {Event} event
 * @param {'start' | 'end'} which
 * @param {number} axisIndex 0 for X, 1 for Y.
 * @returns {void}
 */
function commitSketchField(event, which, axisIndex) {
  const input = /** @type {HTMLInputElement} */ (event.target)
  const parsed = parseNumeric(input.value)
  const entity = sketchEntity.value
  editingField.value = ''
  if (parsed === null || !entity) return
  sketchCommands.setEndpointAxis(entity.id, which, axisIndex, parsed)
}

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
  return panelState.value === 'empty' ? 'none' : 'tab'
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
  ([state, libraryOpen]) => {
    setOpen(state !== 'empty' && !libraryOpen)
  },
  { immediate: true },
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

/**
 * One field value, formatted for display. Millimetres go through the shared
 * `src/core/units.js` formatter so the panel and the viewport's dimension
 * labels can never round the same number two different ways.
 *
 * @param {number | string | undefined} value
 * @param {string} unit
 * @returns {string}
 */
function displayValue(value, unit) {
  if (typeof value !== 'number') return String(value ?? '')
  return unit === 'mm' ? formatMmValue(value) : String(value)
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
 * Parse what a user typed into a numeric field.
 *
 * Tolerant of the unit suffix the field itself displays — `"12.5 mm"` and `"45°"`
 * round-trip, because a user who selects-all and retypes will often keep it —
 * and of a comma decimal separator. Anything that is not a number is rejected by
 * returning `null`, which restores the field rather than committing a `NaN`
 * transform the kernel would reject anyway.
 *
 * @param {string} text
 * @returns {number | null}
 */
function parseNumeric(text) {
  const cleaned = text.replace(/[°\s]/g, '').replace(/mm$/i, '').replace(',', '.')
  if (cleaned === '' || cleaned === '-') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
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

// --- editable Parameters fields (TODO/ui-029) -----------------------------

const paramCommands = useParamCommands()

/**
 * Plain-language names for the ops that can freeze this section, for the note
 * below. Only the ops that can actually get into a primitive's lineage today
 * need an entry; anything else falls back to its own registry key, which is
 * still more useful than "an operation".
 *
 * @type {Readonly<Record<string, string>>}
 */
const BLOCKING_OP_LABELS = Object.freeze({
  'modify.filletRim': 'Fillet',
  'modify.chamferRim': 'Chamfer',
})

/**
 * Whether this body's own params may be edited, and what stands in the way when
 * they may not.
 *
 * Reads the document imperatively — `documentStore.version` is the reactive
 * trigger, the same pattern `useSelectedBody` uses, because the lineage lives
 * outside Vue's reactivity on purpose (CLAUDE.md's Performance section).
 *
 * @returns {import('../../core/paramEdit.js').ParamEditability}
 */
const paramEditability = computed(() => {
  void documentStore.version
  const selected = body.value
  // A drilled-into sub-part has no record of its own to target — the identical
  // reason the Transform section is already frozen in that state (`ui-016`),
  // extended here rather than re-derived.
  if (!selected || isSubPart.value) return { editable: false, blockedBy: null }
  return paramCommands.canEdit(selected.id)
})

const paramsEditable = computed(() => paramEditability.value.editable)

/**
 * Is the thing standing in the way of an edit the body's **own recipe**, rather
 * than an operation stacked on top of it (`TODO/ui-030`)?
 *
 * A bolt's `spec` is a key into a size table and its `fit` is a clearance class:
 * neither is a millimetre, and the dropdown they need is `ui-029`'s explicit
 * scope cut. The distinction matters on screen, not just in the model — telling
 * someone their bolt is frozen "because an operation is applied on top of it"
 * would be a lie about a part they have only just dropped.
 *
 * @returns {boolean}
 */
const isRecipePart = computed(() => Boolean(body.value?.isRecipe) && !paramsEditable.value)

/** The blocking op's plain-language name, or `''` when nothing is blocking. */
const blockingOpLabel = computed(() => {
  const op = paramEditability.value.blockedBy
  if (!op) return ''
  return BLOCKING_OP_LABELS[op] ?? op
})

/**
 * The last kernel validation error a param edit produced, or `null`.
 *
 * The same user-facing runtime kernel-error contract `ui-027` established for
 * the Fillet/Chamfer popover (`OperationsToolbar.vue`'s `opError`), reused here
 * rather than invented a second time — a diameter of `0` or a negative height
 * hits `requirePositive`'s throw in the registry, and a user who typed it needs
 * to see why nothing happened rather than have it vanish into the console.
 *
 * @type {import('vue').Ref<string | null>}
 */
const paramError = ref(/** @type {string | null} */ (null))

// A message about a value on *this* body must not linger onto the next one.
watch(() => body.value?.id, () => { paramError.value = null })

/**
 * Is this particular field editable? `text`-kind params (a bolt's `spec`/`fit`)
 * stay read-only even on an otherwise editable body: they are enums needing a
 * dropdown, not a numeric parser — `TODO/ui-029`'s explicit scope cut.
 *
 * @param {import('../../core/inspector.js').ParamField} field
 * @returns {boolean}
 */
function fieldEditable(field) {
  return paramsEditable.value && (field.kind === 'number' || field.kind === 'vector')
}

/**
 * Run one param edit, surfacing a kernel rejection in the panel.
 *
 * @param {() => void} edit
 * @returns {void}
 */
function runParamEdit(edit) {
  paramError.value = null
  try {
    edit()
  } catch (error) {
    paramError.value = error instanceof Error ? error.message : String(error)
  }
}

/**
 * Commit a typed scalar param field — a Diameter, a Height.
 *
 * @param {Event} event
 * @param {string} key
 * @returns {void}
 */
function commitParamField(event, key) {
  const input = /** @type {HTMLInputElement} */ (event.target)
  const parsed = parseNumeric(input.value)
  const selectedBody = body.value
  // Released first, so the re-render repaints the field with the document's own
  // formatting — which is also how a rejected value is undone, exactly as the
  // Transform fields already do it.
  editingField.value = ''
  // The fields are `readonly` when this is false, so this should be unreachable
  // — the guard is here rather than assumed, because the failure mode it stands
  // in front of is silent data loss, not a visible error.
  if (parsed === null || !selectedBody || !paramsEditable.value) return
  runParamEdit(() => paramCommands.setParam(selectedBody.id, key, parsed))
}

/**
 * Commit one typed component of a vector param — Size X, Side B.
 *
 * @param {Event} event
 * @param {string} key
 * @param {number} index
 * @returns {void}
 */
function commitParamComponent(event, key, index) {
  const input = /** @type {HTMLInputElement} */ (event.target)
  const parsed = parseNumeric(input.value)
  const selectedBody = body.value
  editingField.value = ''
  if (parsed === null || !selectedBody || !paramsEditable.value) return
  runParamEdit(() => paramCommands.setParamComponent(selectedBody.id, key, index, parsed))
}

// --- the Hidden parts section (TODO/ui-047) -------------------------------

/**
 * The selected body's hidden part names — `src/core/inspector.js`'s
 * `describeBody`, already the exact set the Objects list's ▸ disclosure shows.
 * `[]` while drilled into a sub-part: that state has no record of its own to
 * target, the same reason Transform and Parameters are frozen there, and a part
 * has no parts of its own to hide.
 */
const hiddenParts = computed(() => body.value?.hiddenParts ?? [])

/** Whether the *section* has anything to show — absent, not disabled, when not. */
const hasHiddenParts = computed(() => !isSubPart.value && hiddenParts.value.length > 0)

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

/**
 * Tap a listed hidden part name: drill straight to it, ready to use as an
 * operation operand (`ui-016`'s single-part selection contract, the same route
 * a second viewport click or an Objects-list piece row already uses).
 *
 * @param {string} partName
 */
function onHiddenPartClick(partName) {
  const id = body.value?.id
  if (!id) return
  selection.selectPart(id, partName)
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
    :data-selected-id="sketchEntity?.id ?? body?.id ?? ''"
    :data-sub-part="body?.subPart?.partName ?? ''"
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
      {{ sketchEntity?.name ?? (body ? body.name : 'Inspector') }}
    </button>

    <div id="inspector-sheet" class="inspector__sheet">
      <h2 class="inspector__heading">Inspector</h2>

      <p v-if="panelState === 'empty'" class="inspector__empty" data-testid="inspector-empty">
        (nothing selected)
      </p>

      <!-- A sketch entity (TODO/ui-020). Its own branch, not a variation on the
           body one: there is no registry `ui.defaults` schema to read, no
           Transform section (a line is not moved or turned as a whole here) and
           no gizmo — the two draggable endpoint handles in the viewport are the
           2D equivalent, per section 7's Q14. -->
      <template v-else-if="sketchEntity">
        <p class="inspector__name" data-testid="inspector-name">{{ sketchEntity.name }}</p>
        <p class="inspector__op" data-testid="inspector-op" :data-op="sketchEntity.op">
          Sketch line
        </p>

        <section
          class="inspector__section"
          data-testid="inspector-sketch"
          :data-entity-id="sketchEntity.id"
        >
          <h3 class="inspector__section-title">Geometry</h3>
          <dl class="inspector__fields">
            <template v-for="end in ['start', 'end']" :key="end">
              <dt class="inspector__label">
                {{ end === 'start' ? 'Start' : 'End' }} <span class="inspector__unit">(mm)</span>
              </dt>
              <dd class="inspector__value inspector__value--vector">
                <label
                  v-for="(axis, index) in ['x', 'y']"
                  :key="`${end}-${axis}`"
                  class="inspector__component"
                >
                  <span class="inspector__component-label">{{ axis.toUpperCase() }}</span>
                  <input
                    class="inspector__input inspector__input--editable"
                    type="text"
                    inputmode="decimal"
                    :data-testid="`inspector-sketch-${end}-${axis}`"
                    :aria-label="`${end === 'start' ? 'Start' : 'End'} ${axis.toUpperCase()} in millimetres`"
                    :value="
                      fieldValue(
                        `sketch-${end}-${index}`,
                        formatMmValue((end === 'start' ? sketchEntity.startMm : sketchEntity.endMm)[index]),
                      )
                    "
                    @focus="onFieldFocus($event, `sketch-${end}-${index}`)"
                    @blur="commitSketchField($event, end === 'start' ? 'start' : 'end', index)"
                    @keydown.enter.prevent="onFieldEnter"
                  />
                </label>
              </dd>
            </template>

            <!-- Read-only, like the body panel's Size row and for the same
                 reason: length is a *measurement* of the line, not an input.
                 Typing one would have to decide which endpoint moves, and there
                 is no honest answer to that. -->
            <dt class="inspector__label">Length <span class="inspector__unit">(mm)</span></dt>
            <dd class="inspector__value">
              <input
                class="inspector__input"
                type="text"
                readonly
                data-testid="inspector-sketch-length"
                :value="formatMmValue(sketchEntity.lengthMm)"
              />
            </dd>
          </dl>
        </section>

        <p class="inspector__note" data-testid="inspector-sketch-note">
          Drag either round handle on the line in the 3D view, or type a coordinate here
          and press Enter — both do the same thing. Length follows whichever you change.
        </p>
      </template>

      <template v-else-if="described.state === 'multi'">
        <p class="inspector__count" data-testid="inspector-multi">
          {{ described.count }} selected
        </p>
        <p class="inspector__note">
          Select a single object to see its parameters. Operations that work on several
          objects at once arrive with the boolean tools.
        </p>
      </template>

      <template v-else-if="body">
        <!-- The pick-depth breadcrumb (TODO/ui-016). Present only while a part
             inside a group is the selection, and the whole reason control 6
             asks for it: without it, narrowing from the assembly to one member
             is a silent field swap, indistinguishable on screen from a bug. -->
        <nav
          v-if="body.subPart"
          class="inspector__breadcrumb"
          data-testid="inspector-breadcrumb"
          aria-label="Selection depth"
        >
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
        </nav>
        <p class="inspector__name" data-testid="inspector-name">{{ body.name }}</p>
        <p class="inspector__op" data-testid="inspector-op" :data-op="body.op">
          {{ body.opLabel }}
        </p>

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

        <!-- The Hidden parts section (TODO/ui-047). Absent, not disabled, for a
             body with no hidden parts — a Cube or a Pi board, per this task's own
             precondition — so it adds no noise to every Inspector. -->
        <section
          v-if="hasHiddenParts"
          class="inspector__section"
          data-testid="inspector-hidden-parts"
        >
          <h3 class="inspector__section-title">Hidden parts</h3>
          <label class="inspector__hidden-toggle" data-testid="inspector-hidden-parts-toggle-row">
            <input
              type="checkbox"
              data-testid="inspector-hidden-parts-toggle"
              :checked="hiddenPartsShown"
              @change="onToggleHiddenParts"
            />
            Show hidden parts
          </label>
          <ul class="inspector__hidden-list" data-testid="inspector-hidden-parts-list">
            <li v-for="partName in hiddenParts" :key="partName">
              <button
                type="button"
                class="inspector__hidden-part"
                :data-testid="`inspector-hidden-part-${partName}`"
                @click="onHiddenPartClick(partName)"
              >
                {{ partName }}
              </button>
            </li>
          </ul>
          <p class="inspector__note" data-testid="inspector-hidden-parts-note">
            These parts drive a boolean but are not drawn by default. Turn on
            <strong>Show hidden parts</strong> to see them as a translucent overlay in their
            own colour, or tap a name to select just that part.
          </p>
        </section>

        <section
          class="inspector__section"
          data-testid="inspector-params"
          :data-editable="paramsEditable ? 'true' : 'false'"
          :data-blocked-by="paramEditability.blockedBy ?? ''"
        >
          <h3 class="inspector__section-title">Parameters</h3>
          <dl class="inspector__fields">
            <template v-for="field in body.params" :key="field.key">
              <template v-if="field.kind === 'vector'">
                <dt class="inspector__label">
                  {{ field.label }}<span v-if="field.unit" class="inspector__unit"> ({{ field.unit }})</span>
                </dt>
                <dd class="inspector__value inspector__value--vector">
                  <label
                    v-for="(component, index) in field.components"
                    :key="component.label"
                    class="inspector__component"
                  >
                    <span class="inspector__component-label">{{ component.label }}</span>
                    <input
                      class="inspector__input"
                      :class="{ 'inspector__input--editable': fieldEditable(field) }"
                      type="text"
                      inputmode="decimal"
                      :readonly="!fieldEditable(field)"
                      :data-testid="`inspector-param-${field.key}-${component.label.toLowerCase()}`"
                      :aria-label="`${field.label} ${component.label}${field.unit === 'mm' ? ' in millimetres' : ''}`"
                      :value="
                        fieldValue(
                          `param-${field.key}-${index}`,
                          displayValue(component.value, field.unit),
                        )
                      "
                      @focus="onFieldFocus($event, `param-${field.key}-${index}`)"
                      @blur="commitParamComponent($event, field.key, index)"
                      @keydown.enter.prevent="onFieldEnter"
                    />
                  </label>
                </dd>
              </template>
              <template v-else>
                <dt class="inspector__label">{{ field.label }}</dt>
                <dd class="inspector__value">
                  <input
                    class="inspector__input"
                    :class="{ 'inspector__input--editable': fieldEditable(field) }"
                    type="text"
                    inputmode="decimal"
                    :readonly="!fieldEditable(field)"
                    :data-testid="`inspector-param-${field.key}`"
                    :aria-label="`${field.label}${field.unit === 'mm' ? ' in millimetres' : ''}`"
                    :value="fieldValue(`param-${field.key}`, displayValue(field.value, field.unit))"
                    @focus="onFieldFocus($event, `param-${field.key}`)"
                    @blur="commitParamField($event, field.key)"
                    @keydown.enter.prevent="onFieldEnter"
                  />
                  <span v-if="field.unit" class="inspector__unit">{{ field.unit }}</span>
                </dd>
              </template>
            </template>
          </dl>

          <!-- The same user-facing kernel-error surface `ui-027` established in
               the Fillet/Chamfer popover, reused rather than reinvented: a
               diameter of 0 throws inside the registry, and the user who typed
               it has to see why nothing moved. -->
          <p v-if="paramError" class="inspector__error" data-testid="inspector-param-error">
            {{ paramError }}
          </p>

          <!-- Freeze rather than silently do the wrong thing (`ui-016`'s
               precedent, applied to this section). Rebuilding the creation
               record cannot carry a rounded rim with it, so the fields stay
               read-only and say which op is in the way. -->
          <p
            v-if="!paramsEditable && !isSubPart"
            class="inspector__note"
            data-testid="inspector-params-note"
          >
            <template v-if="isRecipePart">
              These are catalogue values for a ready-made part, not dimensions you can
              type over: {{ body.opLabel }} is built from a size table, so changing it
              means picking another size rather than entering a number. Move, rotate and
              delete all work as usual.
            </template>
            <template v-else>
              These parameters are read-only because this shape has
              {{ blockingOpLabel ? `a ${blockingOpLabel}` : 'another operation' }} applied on
              top of it. Changing a parameter rebuilds the shape from these numbers, which
              would throw that away — so it is frozen rather than done quietly.
            </template>
          </p>
        </section>

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

.inspector__hidden-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}

.inspector__hidden-part {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 40px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.inspector__hidden-part:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
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

.inspector__empty,
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

  /* Nothing selected and nothing to show: the sheet's own tab would just be a
     bar of dead chrome over the 3D view. */
  .inspector[data-state='empty'][data-open='false'] {
    display: none;
  }
}
</style>
