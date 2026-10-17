<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The **repair dialog** (`TODO/ui-052`): "This change affects 1 item".
 *
 * Opened, through `stores/repairDialog.js`, from three places — an Inspector dropdown
 * whose change would break something (the change is *held*, not committed), a History
 * row's Edit doing the same, and **Resolve…** on a warning banner for a breakage already
 * committed with Leave broken. One row per affected dependent: **who** (hover or focus
 * lights the body in the viewport), the **relationship** (`Snap → avjack`), **why**
 * (`Pi 5 has no part named \`avjack\``), and a **fix**:
 *
 * - **Only when…** keeps the dependent but makes it conditional on the edited body's old
 *   value — offered only for an enum change, and never the default, because it changes
 *   what the design *means*. Its scope defaults to the whole body for a Snap/Align and to
 *   this operation for a boolean, per the task's Interaction model.
 * - **Remap to…** picks a part the new variant really has — pre-filled only from the
 *   recipe's declared aliases, never a fuzzy match.
 * - **Detach** keeps the body where it is and drops the link — Snap/Align only.
 * - **Leave broken** commits anyway, flagged until fixed.
 *
 * **Apply** commits the edit and every fix as one Undo step
 * (`useParamCommands().applyRepair`); **Cancel** (or Escape, or the backdrop) forgets
 * the held edit, which puts the Inspector's select back.
 *
 * A centred modal at tablet/laptop width; at phone width a full-height bottom sheet with
 * each Fix select at full width under its row's text and Apply/Cancel pinned to the
 * bottom edge, 44px tall and clear of the home indicator.
 */
import { computed, onBeforeUnmount, onMounted, ref, toRaw } from 'vue'

import { useParamCommands } from '../../composables/useParamCommands.js'
import { paramOptions } from '../../core/kernel/registry.js'
import { fixKeyOf, offeredFixesOf } from '../../core/repair.js'
import { variableValueLabel, variablesOf } from '../../core/variables.js'
import { useDocumentStore } from '../../stores/document.js'
import { useHoverHighlightStore } from '../../stores/hoverHighlight.js'
import { useRepairDialogStore } from '../../stores/repairDialog.js'

/** @typedef {import('../../core/dependents.js').Breakage} Breakage */
/** @typedef {import('../../core/repair.js').Fix} Fix */
/** @typedef {import('../../core/repair.js').FixKind} FixKind */

const dialog = useRepairDialogStore()
const documentStore = useDocumentStore()
const hover = useHoverHighlightStore()
const paramCommands = useParamCommands()

// --- layout: a bottom sheet at phone width -------------------------------------

const PHONE_QUERY = '(max-width: 640px)'
const isPhone = ref(typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches)
/** @type {MediaQueryList | null} */
let phoneQuery = null
/** @param {MediaQueryListEvent} event */
function onPhoneChange(event) {
  isPhone.value = event.matches
}

/** @param {KeyboardEvent} event */
function onWindowKeydown(event) {
  if (event.key !== 'Escape' || !dialog.open) return
  // Capture phase, like the Operations popovers (`ui-053`): the dialog is on top, so
  // Escape is its Cancel and nothing underneath hears it.
  event.stopPropagation()
  cancel()
}

onMounted(() => {
  if (typeof window.matchMedia === 'function') {
    phoneQuery = window.matchMedia(PHONE_QUERY)
    isPhone.value = phoneQuery.matches
    phoneQuery.addEventListener?.('change', onPhoneChange)
  }
  window.addEventListener('keydown', onWindowKeydown, true)
})
onBeforeUnmount(() => {
  phoneQuery?.removeEventListener?.('change', onPhoneChange)
  window.removeEventListener('keydown', onWindowKeydown, true)
})

// --- what the dialog is about ---------------------------------------------------

/** The edited body's record as it will be — its option labels name the variants. */
const editedRecord = computed(() => {
  const edit = dialog.edit
  if (!edit) return undefined
  return edit.record ?? toRaw(documentStore.raw).recordOf(edit.rootId)
})

const editedName = computed(() => {
  const edit = dialog.edit
  if (!edit) return ''
  return toRaw(documentStore.raw).recordOf(edit.rootId)?.name ?? edit.rootId
})

/** The changed enum param's schema field, or `undefined` for a number change. */
const changedField = computed(() => {
  const edit = dialog.edit
  const record = editedRecord.value
  if (!edit || edit.param === null || !record) return undefined
  const field = paramOptions(record.op, record.params ?? {})[edit.param]
  return field?.kind === 'enum' ? field : undefined
})

/**
 * The project variable a held edit changes (`TODO/ui-059`), if it is one — a variable is
 * not a body param, so its choices come from the variable itself.
 */
const editedVariable = computed(() => {
  const name = dialog.edit?.variable
  if (name === undefined) return undefined
  return variablesOf(toRaw(documentStore.raw)).find((variable) => variable.name === name)
})

/** Whether the change is to a choice **Only when…** can keep a dependent for. */
const conditionable = computed(
  () => changedField.value !== undefined || (editedVariable.value !== undefined && editedVariable.value.kind !== 'number'),
)

/** The values Only when… keeps a dependent for, and their labels. */
const conditionValues = computed(() => {
  const edit = dialog.edit
  if (!edit) return []
  return edit.conditionValues ?? [edit.oldValue]
})

const conditionLabel = computed(() => {
  const variable = editedVariable.value
  if (variable !== undefined) {
    const labels = conditionValues.value.map((value) => variableValueLabel(variable, value))
    return `Only when ${variable.name} is ${labels.join(' or ')}`
  }
  const field = changedField.value
  if (!field) return ''
  const labels = conditionValues.value.map(
    (value) => field.options.find((option) => Object.is(option.value, value))?.label ?? String(value),
  )
  return `Only when ${editedName.value}'s ${field.label} is ${labels.join(' or ')}`
})

const title = computed(() => {
  const count = dialog.breakages.length
  const items = `${count} item${count === 1 ? '' : 's'}`
  return dialog.edit?.record === null ? `${items} need${count === 1 ? 's' : ''} repair` : `This change affects ${items}`
})

// --- per-row fixes ---------------------------------------------------------------

/** @param {Breakage} breakage @returns {FixKind[]} */
function kindsFor(breakage) {
  const kinds = offeredFixesOf(breakage, { enumParam: conditionable.value })
  return kinds.filter((kind) => kind !== 'condition' || conditionValues.value.length > 0)
}

/** @param {FixKind} kind @returns {string} */
function kindLabel(kind) {
  if (kind === 'condition') return conditionLabel.value
  if (kind === 'remap') return 'Remap to another part…'
  if (kind === 'detach') return 'Detach — keep it where it is'
  if (kind === 'removeTarget') return 'Remove this repeat'
  return 'Leave broken'
}

/** @param {Breakage} breakage @returns {Fix | undefined} */
function fixOf(breakage) {
  return dialog.fixes[fixKeyOf(breakage)]
}

/**
 * The scope Only when… starts on: the whole body for a placement (a plug for a jack that
 * does not exist should not exist either), this operation for a boolean (the case stays,
 * without the cut-out).
 *
 * @param {Breakage} breakage
 * @returns {'body' | 'operation'}
 */
function defaultScope(breakage) {
  return breakage.placement && !isSelf(breakage) ? 'body' : 'operation'
}

/**
 * Is this row in the edited body's **own** history (the Pi snapped *by* its AV jack)?
 * Then "the whole body" is not offered: the body cannot be conditioned on itself.
 *
 * @param {Breakage} breakage
 */
function isSelf(breakage) {
  return breakage.dependentBodyId === dialog.edit?.rootId
}

/**
 * @param {Breakage} breakage
 * @param {Event} event
 */
function onKindChange(breakage, event) {
  const kind = /** @type {FixKind} */ (/** @type {HTMLSelectElement} */ (event.target).value)
  /** @type {Fix} */
  let fix
  if (kind === 'condition') fix = { kind, scope: defaultScope(breakage), values: [...conditionValues.value] }
  else if (kind === 'remap') fix = { kind, pieces: { ...breakage.suggestions } }
  else fix = { kind }
  dialog.setFix(fixKeyOf(breakage), fix)
}

/** @param {Breakage} breakage @returns {'body' | 'operation'} */
function scopeOf(breakage) {
  const fix = fixOf(breakage)
  return fix?.kind === 'condition' ? fix.scope : defaultScope(breakage)
}

/**
 * @param {Breakage} breakage
 * @param {Event} event
 */
function onScopeChange(breakage, event) {
  const fix = fixOf(breakage)
  if (fix?.kind !== 'condition') return
  const scope = /** @type {'body' | 'operation'} */ (/** @type {HTMLSelectElement} */ (event.target).value)
  dialog.setFix(fixKeyOf(breakage), { ...fix, scope })
}

/**
 * @param {Breakage} breakage
 * @param {string} piece
 * @param {Event} event
 */
function onRemapChange(breakage, piece, event) {
  const fix = fixOf(breakage)
  if (fix?.kind !== 'remap') return
  const value = /** @type {HTMLSelectElement} */ (event.target).value
  /** @type {Record<string, string>} */
  const pieces = { ...fix.pieces }
  if (value) pieces[piece] = value
  else delete pieces[piece]
  dialog.setFix(fixKeyOf(breakage), { kind: 'remap', pieces })
}

/** @param {Breakage} breakage @param {string} piece */
function remapValue(breakage, piece) {
  const fix = fixOf(breakage)
  return fix?.kind === 'remap' ? (fix.pieces[piece] ?? '') : ''
}

/** Parts a missing piece may be remapped to: the new variant's own, visible ones first. */
function remapTargets(/** @type {Breakage} */ breakage) {
  return breakage.newParts
}

/** @param {Breakage} breakage */
function rowComplete(breakage) {
  const fix = fixOf(breakage)
  if (!fix) return false
  if (fix.kind === 'remap') return breakage.missingPieces.every((piece) => Boolean(fix.pieces[piece]))
  return true
}

/** Apply is disabled until every row has a complete fix. */
const canApply = computed(() => dialog.breakages.length > 0 && dialog.breakages.every(rowComplete))

// --- hover: find the dependent in the viewport -----------------------------------

/** @param {Breakage} breakage */
function hoverOn(breakage) {
  hover.setHover(breakage.dependentBodyId, null)
}

/** @param {Breakage} breakage */
function hoverOff(breakage) {
  hover.clearHover({ bodyId: breakage.dependentBodyId, partName: null })
}

// --- footer ------------------------------------------------------------------------

function cancel() {
  hover.clearHover()
  dialog.close()
}

function apply() {
  const edit = dialog.edit
  if (!edit || !canApply.value) return
  try {
    paramCommands.applyRepair(edit, dialog.breakages, { ...dialog.fixes })
  } catch (error) {
    dialog.error = error instanceof Error ? error.message : String(error)
    return
  }
  hover.clearHover()
  dialog.close()
}
</script>

<template>
  <div v-if="dialog.open" class="repair" :class="{ 'repair--sheet': isPhone }">
    <div class="repair__backdrop" data-testid="repair-backdrop" @click="cancel()"></div>
    <section
      class="repair__panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="repair-title"
      data-testid="repair-dialog"
      :data-layout="isPhone ? 'sheet' : 'modal'"
    >
      <h2 id="repair-title" class="repair__title" data-testid="repair-title">{{ title }}</h2>
      <p class="repair__intro">
        Choose what happens to each item before the change is made. Nothing has changed yet.
      </p>

      <ul class="repair__rows">
        <li
          v-for="breakage in dialog.breakages"
          :key="fixKeyOf(breakage)"
          class="repair__row"
          data-testid="repair-row"
          :data-record-id="breakage.dependentRecordId"
        >
          <div class="repair__who">
            <button
              type="button"
              class="repair__name"
              data-testid="repair-row-name"
              @pointerenter="hoverOn(breakage)"
              @pointerleave="hoverOff(breakage)"
              @focus="hoverOn(breakage)"
              @blur="hoverOff(breakage)"
            >{{ breakage.dependentName }}</button>
            <span class="repair__relationship" data-testid="repair-row-relationship">{{ breakage.relationship }}</span>
          </div>
          <p class="repair__reason" data-testid="repair-row-reason">{{ breakage.reason }}</p>

          <label class="repair__field">
            <span class="repair__field-label">Fix</span>
            <select
              class="repair__select"
              data-testid="repair-fix"
              :value="fixOf(breakage)?.kind ?? ''"
              @change="onKindChange(breakage, $event)"
            >
              <option v-for="kind in kindsFor(breakage)" :key="kind" :value="kind">{{ kindLabel(kind) }}</option>
            </select>
          </label>

          <label v-if="fixOf(breakage)?.kind === 'condition'" class="repair__field">
            <span class="repair__field-label">Applies to</span>
            <select
              class="repair__select"
              data-testid="repair-scope"
              :value="scopeOf(breakage)"
              @change="onScopeChange(breakage, $event)"
            >
              <option v-if="!isSelf(breakage)" value="body">The whole {{ breakage.dependentName }}</option>
              <option value="operation">This operation only ({{ breakage.relationship }})</option>
            </select>
          </label>

          <template v-if="fixOf(breakage)?.kind === 'remap'">
            <label v-for="piece in breakage.missingPieces" :key="piece" class="repair__field">
              <span class="repair__field-label">{{ piece }} →</span>
              <select
                class="repair__select"
                data-testid="repair-remap"
                :value="remapValue(breakage, piece)"
                @change="onRemapChange(breakage, piece, $event)"
              >
                <option value="">Choose a part…</option>
                <option v-for="part in remapTargets(breakage)" :key="part" :value="part">{{ part }}</option>
              </select>
            </label>
          </template>
        </li>
      </ul>

      <p v-if="dialog.error" class="repair__error" role="alert" data-testid="repair-error">{{ dialog.error }}</p>

      <footer class="repair__footer">
        <button type="button" class="repair__btn" data-testid="repair-cancel" @click="cancel()">Cancel</button>
        <button
          type="button"
          class="repair__btn repair__btn--primary"
          data-testid="repair-apply"
          :disabled="!canApply"
          @click="apply()"
        >
          Apply
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.repair {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.repair__backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--surface-0) 60%, transparent);
}

.repair__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(560px, 100%);
  max-height: min(80vh, 720px);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md, 10px);
  background: var(--surface-1);
  color: var(--text-1);
  box-shadow: 0 12px 40px rgb(0 0 0 / 35%);
}

.repair__title {
  margin: 0;
  padding: 14px 16px 4px;
  font-size: 15px;
  font-weight: 650;
}

.repair__intro {
  margin: 0;
  padding: 0 16px 8px;
  font-size: 12px;
  color: var(--text-2);
}

/* The rows scroll inside the panel, never the page. */
.repair__rows {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
}

.repair__row {
  display: grid;
  gap: 6px;
  padding: 10px 0;
  border-top: 1px solid var(--border);
}

.repair__who {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
}

.repair__name {
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-1);
  font: inherit;
  font-weight: 600;
  cursor: default;
}

.repair__name:focus-visible,
.repair__select:focus-visible,
.repair__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.repair__relationship {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-2);
}

.repair__reason {
  margin: 0;
  font-size: 12px;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.repair__field {
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.repair__field-label {
  font-size: 12px;
  color: var(--text-3);
  overflow-wrap: anywhere;
}

/* 44px tap targets, and 16px text so iOS Safari does not zoom on focus. */
.repair__select {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 4px 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 16px;
}

.repair__error {
  margin: 8px 16px 0;
  font-size: 12px;
  color: var(--danger);
}

.repair__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}

.repair__btn {
  min-height: 44px;
  min-width: 96px;
  padding: 4px 16px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  touch-action: manipulation;
}

.repair__btn--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast, #fff);
}

.repair__btn:disabled {
  opacity: 0.45;
  cursor: default;
}

/* Phone: a full-height bottom sheet over the Inspector sheet, each Fix select at full
   width under its row's text, Apply/Cancel pinned to the bottom edge. */
.repair--sheet {
  align-items: stretch;
  padding: 0;
}

.repair--sheet .repair__panel {
  width: 100%;
  max-height: none;
  height: 100%;
  border-radius: 0;
  border-width: 0;
}

.repair--sheet .repair__field {
  grid-template-columns: minmax(0, 1fr);
  gap: 2px;
}

.repair--sheet .repair__footer {
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
}

.repair--sheet .repair__btn {
  flex: 1;
}
</style>
