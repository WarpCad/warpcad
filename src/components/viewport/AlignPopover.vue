<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The one **Align** popover (`TODO/ui-060`): Snap, Align and the Inspector's old Align to
 * origin row (`TODO/ui-050`), behind one **Target** dropdown. `OperationsToolbar.vue` owns
 * the button, the open/close toggle, the backdrop and Escape; this owns everything inside.
 *
 * ## One popover, two engines
 *
 * The two targets move a body in different kinds of record, on purpose:
 *
 * - **World origin** is a *baked* `transform.translate` (`alignToOriginRecord`, through
 *   `useTransformCommands().alignToOrigin`). A one-shot placement; a no-op tap appends
 *   nothing.
 * - **Second selected** is a *parametric* `group.align` (center) or `group.snap` (the other six), written in exactly the shape the old Snap/Align popover wrote, so old projects load
 *   unchanged and the body keeps following its target (`data-007`). Such a tap always
 *   appends, even when nothing moves yet: the record *is* the link.
 *
 * ## Seven positions per axis, − to +
 *
 * One row per axis, outside −, inside −, half −, center, half +, inside +, outside + (`ui-086`),
 * each naming where the body ends up along that axis. `group.js`'s `SNAP_SIDES` sign names the
 * moving body's face that touches, which reads backwards on a button: `outside+` puts the body on
 * the target's **−** side. {@link POSITIONS} maps each button to its key, so the crossing lives in
 * one table (the `above-*`/`below-*` aliases stay unexposed). The words live outside the buttons —
 * a shared column header and the caption — and each button carries only an icon.
 *
 * ## What is measured on the moving body
 *
 * A moving body addressed at a part (`selection.partOf`, `ui-016`/`ui-063`) is measured by
 * that part, and the top line's `›` says so; **Measure from** is hidden then so the two can
 * never disagree. Otherwise **Measure from** (remembered per body in `alignReference.js`)
 * applies to both targets: a `partName` for World origin, a `{ id, pieces }` operand for
 * Second selected.
 *
 * A tap never changes the selection, and the popover stays open, so X, Y and Z can be
 * chained. Undo is the escape hatch.
 *
 * @module components/viewport/AlignPopover
 */
import { computed, onBeforeUnmount, ref, watch, watchEffect } from 'vue'

import HelpButton from '../controls/HelpButton.vue'
import AlignGrid from './AlignGrid.vue'
import AlignPositionIcon from './AlignPositionIcon.vue'

import { useSelectedOperands } from '../../composables/useSelectedBody.js'
import { useTransformCommands } from '../../composables/useTransformCommands.js'
import { useAlignReferenceStore } from '../../stores/alignReference.js'
import { useDocumentStore } from '../../stores/document.js'
import { useSelectionStore } from '../../stores/selection.js'

/** @typedef {'x' | 'y' | 'z'} Axis */

/**
 * The seven buttons, − to +. `orientation` is the `SNAP_SIDES` key a Second-selected tap
 * commits (`null` is `group.align`); `origin` is the `alignToOrigin` spec a World-origin tap
 * commits. **The outside and half rows are crossed on purpose**: the key's sign names the
 * moving body's touching face, so `outside+` puts the body on the target's **−** side and
 * `center+` over its **−** half (`ui-060`, `ai-022`). Against the origin (a point) the seven
 * collapse to three results; every button still does what its label says.
 *
 * @type {ReadonlyArray<{ key: string, header: string, name: string, detail: string, orientation: string | null, origin: 'min' | 'center' | 'max' }>}
 */
const POSITIONS = Object.freeze([
  { key: 'outside-minus', header: 'out', name: 'outside −', detail: 'your + face sits on the target’s − face, so you end up beyond its − side', orientation: 'outside+', origin: 'max' },
  { key: 'inside-minus', header: 'in', name: 'inside −', detail: 'your − face lines up with the target’s − face, inside it', orientation: 'inside-', origin: 'min' },
  { key: 'half-minus', header: 'half', name: 'half −', detail: 'your + face sits on the target’s centre, so you cover its − half', orientation: 'center+', origin: 'max' },
  { key: 'center', header: 'ctr', name: 'center', detail: 'your centre sits on the target’s centre', orientation: null, origin: 'center' },
  { key: 'half-plus', header: 'half', name: 'half +', detail: 'your − face sits on the target’s centre, so you cover its + half', orientation: 'center-', origin: 'min' },
  { key: 'inside-plus', header: 'in', name: 'inside +', detail: 'your + face lines up with the target’s + face, inside it', orientation: 'inside+', origin: 'max' },
  { key: 'outside-plus', header: 'out', name: 'outside +', detail: 'your − face sits on the target’s + face, so you end up beyond its + side', orientation: 'outside-', origin: 'min' },
])

const IDLE_CAPTION = 'Tap where the moving body should end up along each axis.'

const documentStore = useDocumentStore()
const selection = useSelectionStore()
const alignReference = useAlignReferenceStore()
const transformCommands = useTransformCommands()
const operands = useSelectedOperands()

/** The body that moves: always the first picked. */
const moving = computed(() => operands.value[0] ?? null)

/** The second-picked body, when there are exactly two; `null` otherwise. */
const second = computed(() => (selection.count === 2 ? (operands.value[1] ?? null) : null))

/** The Target dropdown's own value. Defaults to the second body when there is one. */
const targetChoice = ref(/** @type {'second' | 'origin'} */ (selection.count === 2 ? 'second' : 'origin'))

/** What a tap aligns to. With one body there is only World origin. */
const target = computed(() => (second.value ? targetChoice.value : 'origin'))

// Only the first-picked body is involved on World origin, so the scene drops the second's
// role colour while that is chosen (`Viewport.vue` reads this).
watchEffect(() => {
  alignReference.originOnly = Boolean(second.value) && target.value === 'origin'
})
onBeforeUnmount(() => {
  alignReference.originOnly = false
})

/** The moving body's visible parts, in group order — `[]` for a bare solid. */
const visibleParts = computed(() => {
  const rootId = moving.value?.rootId
  return documentStore.bodies.find((body) => body.id === rootId)?.partNames ?? []
})

/** Measure from is offered for a composite that is not already addressed at a part. */
const showMeasureFrom = computed(() => Boolean(moving.value) && !moving.value?.isSubPart && visibleParts.value.length > 0)

/** The Measure from select's value: a remembered live part, or `''` for Whole object. */
const measureFrom = computed(() => {
  const rootId = moving.value?.rootId
  if (!rootId) return ''
  const stored = alignReference.get(rootId)
  return stored && visibleParts.value.includes(stored) ? stored : ''
})

// A remembered part the body no longer has (an undo, a model change) is forgotten, so the
// dropdown never offers a name that means nothing any more (`ui-050`).
watch(
  () => [moving.value?.rootId, visibleParts.value],
  () => {
    const rootId = moving.value?.rootId
    if (!rootId) return
    const stored = alignReference.get(rootId)
    if (stored && !visibleParts.value.includes(stored)) alignReference.clear(rootId)
  },
  { immediate: true },
)

/** The part that is measured on the moving body, or `null` for the whole body. */
const measuredPart = computed(() => moving.value?.partName ?? (measureFrom.value || null))

/** @param {Event} event */
function onMeasureFromChange(event) {
  const rootId = moving.value?.rootId
  if (!rootId) return
  const value = /** @type {HTMLSelectElement} */ (event.target).value
  alignReference.set(rootId, value === '' ? null : value)
}

/** Millimetres added to the next Second-selected tap. */
const offsetMm = ref(/** @type {number | ''} */ (0))

/** The last tap's kernel rejection, or `null`. */
const opError = ref(/** @type {string | null} */ (null))

/** @param {() => void} commit */
function attempt(commit) {
  try {
    commit()
    opError.value = null
  } catch (error) {
    opError.value = error instanceof Error ? error.message : String(error)
  }
}

/** @param {Partial<Record<Axis, 'min' | 'center' | 'max'>>} axes */
function alignToOrigin(axes) {
  const rootId = moving.value?.rootId
  if (!rootId) return
  const partName = measuredPart.value
  attempt(() => transformCommands.alignToOrigin(rootId, partName ? { ...axes, partName } : { ...axes }))
}

/**
 * Append one `group.snap` / `group.align` against the second body, in the record shape the
 * old Snap/Align popover wrote (`ui-026`, `ui-035`, `ui-063`).
 *
 * @param {'group.snap' | 'group.align'} op
 * @param {Record<string, unknown>} params
 */
function alignToSecond(op, params) {
  const movingOperand = moving.value
  const targetOperand = second.value
  if (!movingOperand || !targetOperand) return
  const part = measuredPart.value
  /** @type {import('../../core/kernel/registry.js').OpRecord} */
  const record = {
    id: documentStore.raw.nextId(op === 'group.snap' ? 'snap' : 'align'),
    op,
    // `target` before `operands` is the fold's input order: the moving body is `inputs[0]`.
    target: part === null ? movingOperand.terminalId : { id: movingOperand.terminalId, pieces: part },
    operands: [targetOperand.ref],
    // A bare record id even when `target` is addressed: it names the record this one
    // continues, not an operand (`OperationsToolbar.vue`'s module doc, §2).
    supersedes: movingOperand.terminalId,
    params,
  }
  attempt(() => documentStore.append(record, { origin: 'local' }))
}

/** The offset as a number; a cleared field is 0. */
function offset() {
  const value = Number(offsetMm.value)
  return Number.isFinite(value) ? value : 0
}

/**
 * One tap on one of the seven positions: a baked align-to-origin, or a parametric
 * `group.align` / `group.snap` against the second body.
 *
 * @param {Axis} axis
 * @param {string} key a {@link POSITIONS} key
 */
function onPositionTap(axis, key) {
  const position = POSITIONS.find((candidate) => candidate.key === key)
  if (!position) return
  tapped.value = sentence(axis, key)
  if (target.value === 'origin') {
    alignToOrigin({ [axis]: position.origin })
  } else if (position.orientation === null) {
    alignToSecond('group.align', { axes: axis, deltaMm: offset() })
  } else {
    alignToSecond('group.snap', { axes: axis, orientation: position.orientation, deltaMm: offset() })
  }
}

/**
 * The full sentence for a button — its `aria-label`, `title` and caption.
 *
 * @param {Axis} axis
 * @param {string} key
 * @returns {string}
 */
function sentence(axis, key) {
  const position = POSITIONS.find((candidate) => candidate.key === key)
  return position ? `${axis.toUpperCase()} ${position.name}: ${position.detail}` : ''
}

/** The button last tapped, so touch (no hover) still reads what just happened. */
const tapped = ref('')
/** The button hovered or focused, which wins over the last tap while it is. */
const previewed = ref('')
const caption = computed(() => previewed.value || tapped.value || IDLE_CAPTION)

/**
 * @param {Axis | null} axis
 * @param {string | null} key
 */
function onPreview(axis, key) {
  previewed.value = axis && key ? sentence(axis, key) : ''
}

/** "Center on origin, sit on grid": one record, not three. */
function onDrop() {
  if (target.value !== 'origin') return
  alignToOrigin({ x: 'center', y: 'center', z: 'min' })
}

/** The seven columns the grid draws, one per position. */
const positionColumns = POSITIONS.map(({ key, header }) => ({ key, header }))

</script>

<template>
  <div class="align-popover" data-testid="align-popover" :data-target="target">
    <p class="align-popover__operands" data-testid="align-operands" :data-subpart="operands.some((operand) => operand.isSubPart) ? 'true' : 'false'">Aligning <strong data-testid="align-operand-moving">{{ moving?.label }}</strong> to <strong data-testid="align-operand-target">{{ target === 'origin' ? 'World origin' : second?.label }}</strong></p>

    <label v-if="second" class="align-popover__field">
      Target
      <select v-model="targetChoice" data-testid="align-target">
        <option value="second">Second selected ({{ second.label }})</option>
        <option value="origin">World origin</option>
      </select>
    </label>

    <label v-if="showMeasureFrom" class="align-popover__field">
      Measure from
      <select data-testid="align-reference" :value="measureFrom" @change="onMeasureFromChange">
        <option value="">Whole object</option>
        <option v-for="name in visibleParts" :key="name" :value="name">{{ name }}</option>
      </select>
    </label>

    <!-- Phone-first: the one-step common case, full width, above the grid. -->
    <button
      type="button"
      class="align-popover__drop"
      data-testid="align-drop"
      :disabled="target !== 'origin'"
      :title="
        target === 'origin'
          ? 'Centre on the origin in X and Y and sit the low face on Z = 0, in one step'
          : 'Switch Target to World origin to use this'
      "
      @click="onDrop"
    >
      Center on origin, sit on grid
    </button>

    <AlignGrid
      :columns="positionColumns"
      label="Align"
      segmented
      :describe="sentence"
      @tap="onPositionTap"
      @preview="onPreview"
    >
      <template #default="{ column }">
        <AlignPositionIcon :position="POSITIONS.findIndex((position) => position.key === column.key)" :point-target="target === 'origin'" />
      </template>
    </AlignGrid>

    <p class="align-popover__caption" data-testid="align-caption" aria-live="polite">{{ caption }}</p>

    <label v-if="target === 'second'" class="align-popover__field">
      Offset (mm)
      <input type="number" v-model.number="offsetMm" data-testid="align-offset" />
    </label>

    <p v-if="opError" class="align-popover__error" data-testid="align-error">{{ opError }}</p>

    <HelpButton topic="align" class="align-popover__help" />
  </div>
</template>

<style scoped>
/* The frame (fixed position, width, scroll, glass) is `.ops__popover`, passed in by
   `OperationsToolbar.vue`; only the inside is styled here. */

/* The ? sits in the top-right corner (`TODO/ui-061`), out of flow; the top line keeps clear. */
.align-popover__help {
  position: absolute;
  top: 0;
  right: 0;
}

.align-popover__operands {
  margin: 0;
  padding-right: 34px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.align-popover__operands strong {
  color: var(--text-1);
  font-weight: 650;
}

.align-popover__field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 11px;
  color: var(--text-2);
}

.align-popover__field select,
.align-popover__field input {
  min-height: 44px;
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-1);
  font-size: 13px;
}

.align-popover__caption {
  margin: 0;
  min-height: 2.8em;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-2);
}

.align-popover__drop {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
}

.align-popover__drop:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.align-popover__drop:focus-visible,
.align-popover__field select:focus-visible,
.align-popover__field input:focus-visible {
  outline: 2px solid var(--accent);
}

/* Same neutral treatment as the toolbar's other popover errors: no danger token exists. */
.align-popover__error {
  margin: 0;
  padding: 6px 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-1);
  font-size: 11px;
  line-height: 1.4;
}
</style>
