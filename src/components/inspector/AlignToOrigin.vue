<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Inspector Transform section's **Align to origin** row (`TODO/ui-050`).
 *
 * Extracted from `Inspector.vue` per CLAUDE.md's "views must be thin — extract
 * any panel over ~30 template lines" (`Inspector.vue` is already ~1,500 lines),
 * and self-contained the same way `Inspector.vue` itself is: it calls
 * `useSelectedBody`/`useTransformCommands` directly rather than taking `body`
 * as a prop, because there is no other extracted Inspector sub-component in
 * this codebase to hand it down from — `Inspector.vue` is the one place that
 * pattern already lives.
 *
 * ## Absent, not disabled
 *
 * CLAUDE.md's creation-vs-operation rule, applied to this control: it commits
 * against exactly one already-selected body, so it must not exist at all
 * outside that precondition, the same "absent, not disabled" precedent
 * `Inspector.vue`'s Hidden-parts section already sets. `showRow` below is the
 * one gate every branch of the template sits behind — 0 selected, 2+ selected,
 * and sub-part depth (`TODO/ui-016` freezes Transform there; there is no
 * record a `transform.*` op could target that means "just this part") all
 * resolve to the same "nothing rendered", never a greyed-out row.
 *
 * ## One tap, one committed record
 *
 * Every button here — an axis/mode tap, or the "Center on origin, sit on
 * grid" shortcut — calls `useTransformCommands().alignToOrigin` exactly once.
 * `src/core/transform.js`'s `alignToOriginRecord` bakes whichever axes were
 * requested into a single `transform.translate` delta (or returns `null` for
 * a no-op), so the shortcut is one History step, not three, and a no-op tap
 * appends nothing rather than filling Undo with invisible steps.
 *
 * ## Reference, remembered per body for the session
 *
 * `src/stores/alignReference.js` is the UI-only `Map<bodyId, partName|null>`
 * this row reads and writes; `Inspector.vue` itself is what hands off the
 * "last drilled part" when the user steps back up from a part
 * (`Inspector.vue`'s own `watch` on `selection.subPart`, next to the
 * breadcrumb), because that hand-off has to happen while this component is
 * unmounted (sub-part depth is exactly where `showRow` is false).
 *
 * A stored reference that no longer names a live visible part — an undo
 * removed it, a param edit changed the part set — is treated as absent
 * (`referenceValue` below) and the stale entry is dropped from the store, so
 * the dropdown never keeps offering a name that means nothing any more.
 * `alignToOriginRecord` carries its own, independent fallback for the same
 * case, so a tap can never throw even if this component's own guard were
 * somehow bypassed.
 *
 * @module components/inspector/AlignToOrigin
 */
import { computed, watch } from 'vue'

import { useSelectedBody } from '../../composables/useSelectedBody.js'
import { useTransformCommands } from '../../composables/useTransformCommands.js'
import { useAlignReferenceStore } from '../../stores/alignReference.js'

/** World axes, in the fixed order every row/testid below uses. */
const AXES = /** @type {const} */ (['x', 'y', 'z'])

/** Modes, in the fixed left-to-right button order the phone-width grid needs. */
const MODES = /** @type {const} */ (['min', 'center', 'max'])

/** Icon-plus-short-label per mode — short enough to fit a 44px-tall button at 390px width. */
const MODE_LABEL = Object.freeze({ min: '⊢ min', center: '◇ ctr', max: '⊣ max' })

const described = useSelectedBody()
const transformCommands = useTransformCommands()
const alignReference = useAlignReferenceStore()

const body = computed(() => described.value.body)

/**
 * The one gate every branch of the template sits behind — see this module's
 * own doc comment on why "absent, not disabled" applies at 0, 2+, and
 * sub-part depth alike.
 */
const showRow = computed(() => Boolean(body.value) && !body.value?.subPart)

/** Visible part names, in group order — `[]` for a bare solid. */
const visibleParts = computed(() => body.value?.visibleParts ?? [])

/** Whether there is more than "Whole object" to choose from. */
const hasParts = computed(() => visibleParts.value.length > 0)

/**
 * The Reference `<select>`'s bound value: a stored part name, or `''` for
 * "Whole object" — including a stored name the body's *current* visible parts
 * no longer contain, which reads the same as never having picked one.
 */
const referenceValue = computed(() => {
  const id = body.value?.id
  if (!id) return ''
  const stored = alignReference.get(id)
  if (stored && !visibleParts.value.includes(stored)) return ''
  return stored ?? ''
})

// Drop a stale stored reference — see the module doc's note on why this is a
// belt-and-suspenders guard alongside `alignToOriginRecord`'s own fallback.
watch(
  () => [body.value?.id, visibleParts.value],
  () => {
    const id = body.value?.id
    if (!id) return
    const stored = alignReference.get(id)
    if (stored && !visibleParts.value.includes(stored)) alignReference.clear(id)
  },
  { immediate: true },
)

/** @param {Event} event */
function onReferenceChange(event) {
  const id = body.value?.id
  if (!id) return
  const value = /** @type {HTMLSelectElement} */ (event.target).value
  alignReference.set(id, value === '' ? null : value)
}

/**
 * @param {Partial<import('../../core/transform.js').AlignSpec>} axes
 * @returns {import('../../core/transform.js').AlignSpec}
 */
function specFor(axes) {
  const partName = referenceValue.value
  return partName ? { ...axes, partName } : { ...axes }
}

/**
 * @param {'x' | 'y' | 'z'} axis
 * @param {'min' | 'center' | 'max'} mode
 */
function onTap(axis, mode) {
  const id = body.value?.id
  if (!id) return
  transformCommands.alignToOrigin(id, specFor({ [axis]: mode }))
}

/** The "Center on origin, sit on grid" shortcut — one record, not three. */
function onShortcut() {
  const id = body.value?.id
  if (!id) return
  transformCommands.alignToOrigin(id, specFor({ x: 'center', y: 'center', z: 'min' }))
}
</script>

<template>
  <div v-if="showRow" class="align-origin" data-testid="align-origin-row">
    <h4 class="align-origin__title">Align to origin</h4>

    <!-- Phone-first: the shortcut most people will use, full width, above the grid. -->
    <button
      type="button"
      class="align-origin__shortcut"
      data-testid="align-origin-drop"
      @click="onShortcut"
    >
      Center on origin, sit on grid
    </button>

    <label v-if="hasParts" class="align-origin__reference">
      <span class="align-origin__reference-label">Reference</span>
      <select
        class="align-origin__select"
        data-testid="align-origin-reference"
        :value="referenceValue"
        @change="onReferenceChange"
      >
        <option value="">Whole object</option>
        <option v-for="name in visibleParts" :key="name" :value="name">{{ name }}</option>
      </select>
    </label>

    <div class="align-origin__grid">
      <template v-for="axis in AXES" :key="axis">
        <span class="align-origin__axis-label">{{ axis.toUpperCase() }}</span>
        <button
          v-for="mode in MODES"
          :key="mode"
          type="button"
          class="align-origin__mode"
          :data-testid="`align-origin-${axis}-${mode}`"
          @click="onTap(axis, mode)"
        >
          {{ MODE_LABEL[mode] }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.align-origin {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
}

.align-origin__title {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-2);
}

.align-origin__shortcut {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-weight: 600;
  cursor: pointer;
}

.align-origin__shortcut:focus-visible,
.align-origin__mode:focus-visible,
.align-origin__select:focus-visible {
  outline: 2px solid var(--accent);
}

.align-origin__reference {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.align-origin__reference-label {
  flex: 0 0 auto;
  color: var(--text-2);
  font-size: 0.85rem;
}

.align-origin__select {
  flex: 1 1 auto;
  min-height: 44px;
  min-width: 0;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
}

/* The 3x3 grid (mode columns x axis rows) plus a label column — sized to fit
   390px without horizontal scroll (TODO/ui-050's phone-width requirement).
   `minmax(0, 1fr)` rather than a bare `1fr` is load-bearing: a button's own
   text content would otherwise force the column wider than the viewport. */
.align-origin__grid {
  display: grid;
  grid-template-columns: auto repeat(3, minmax(0, 1fr));
  gap: 0.35rem;
  align-items: center;
}

.align-origin__axis-label {
  flex: 0 0 auto;
  min-width: 1.25rem;
  color: var(--text-2);
  font-size: 0.8rem;
  text-align: center;
}

.align-origin__mode {
  min-width: 44px;
  min-height: 44px;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-size: 0.72rem;
  padding: 0 0.15rem;
  cursor: pointer;
}
</style>
