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
 * ## Transform is writable; the op's own params are not (yet)
 *
 * `ui-012` made the Transform section's Position and Rotation fields editable,
 * and they are the *same* mutation a gizmo drag performs — both go through
 * `src/composables/useTransformCommands.js`, so typing `40` and dragging to 40 mm
 * cannot produce different records (control 4's "either path results in the same
 * underlying mutation").
 *
 * Two things stay read-only, deliberately rather than by omission:
 *
 * - **Size**, because it is a *measurement* of the solid, not an input. Resizing
 *   a cylinder means editing its `diameter`/`height` params, which is the next
 *   bullet, and a writable Size box would imply a non-uniform scale op that does
 *   not exist.
 * - **The op's own params** (`diameter`, `height`, `size`…). Editing those is a
 *   different mutation — rewriting a creation record's params and re-evaluating
 *   everything downstream of it, rather than appending a transform — and it
 *   belongs with the task that lands it. The panel says which is which out loud
 *   rather than leaving a user poking at a box that silently ignores them.
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
import { useDocumentStore } from '../../stores/document.js'
import { useSketchPreviewStore } from '../../stores/sketchPreview.js'
import { useTransformCommands } from '../../composables/useTransformCommands.js'
import { useSketchCommands } from '../../composables/useSketchCommands.js'
import { lengthOf } from '../../sketch/entity.js'
import { formatDeg, formatMmValue } from '../../core/units.js'

const props = defineProps({
  /**
   * True while the Library's bottom sheet holds the single phone-width sheet
   * slot. Purely a phone-width concern: at tablet and laptop both panels are
   * persistent columns and nothing competes.
   */
  librarySheetOpen: { type: Boolean, default: false },
})

const emit = defineEmits(['sheet-change', 'claim-sheet'])

/** Vertical travel, in pixels, that counts as a deliberate swipe-to-dismiss. */
const SWIPE_DISMISS_PX = 36

const selection = useSelectionStore()
const described = useSelectedBody()
const documentStore = useDocumentStore()
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
  [() => panelState.value, () => props.librarySheetOpen],
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

        <section class="inspector__section" data-testid="inspector-params">
          <h3 class="inspector__section-title">Parameters</h3>
          <dl class="inspector__fields">
            <template v-for="field in body.params" :key="field.key">
              <template v-if="field.kind === 'vector'">
                <dt class="inspector__label">
                  {{ field.label }}<span v-if="field.unit" class="inspector__unit"> ({{ field.unit }})</span>
                </dt>
                <dd class="inspector__value inspector__value--vector">
                  <label
                    v-for="component in field.components"
                    :key="component.label"
                    class="inspector__component"
                  >
                    <span class="inspector__component-label">{{ component.label }}</span>
                    <input
                      class="inspector__input"
                      type="text"
                      readonly
                      :data-testid="`inspector-param-${field.key}-${component.label.toLowerCase()}`"
                      :value="displayValue(component.value, field.unit)"
                    />
                  </label>
                </dd>
              </template>
              <template v-else>
                <dt class="inspector__label">{{ field.label }}</dt>
                <dd class="inspector__value">
                  <input
                    class="inspector__input"
                    type="text"
                    readonly
                    :data-testid="`inspector-param-${field.key}`"
                    :value="displayValue(field.value, field.unit)"
                  />
                  <span v-if="field.unit" class="inspector__unit">{{ field.unit }}</span>
                </dd>
              </template>
            </template>
          </dl>
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
          gizmo's arrows and rings in the 3D view. Size and the parameters above are
          read-only for now.
        </p>
      </template>
    </div>
  </aside>
</template>

<style scoped>
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
