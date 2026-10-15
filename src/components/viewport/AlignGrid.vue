<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * An X / Y / Z grid of one-tap buttons (`TODO/ui-060`), extracted from the Inspector's old
 * Align to origin row (`TODO/ui-050`) so the Align popover can use the same markup twice:
 * the `min | ctr | max` grid, and the Snap row's `− | +` pair.
 *
 * It knows nothing about what a tap does. Each column is `{ key, label, title?, disabled? }`;
 * a button's testid is `align-<axis>-<key>`, and a tap emits `tap(axis, key)`. Buttons are at
 * least 44×44 px, and the columns are `minmax(0, 1fr)` so a label never pushes the grid past a
 * 390 px phone.
 *
 * @module components/viewport/AlignGrid
 */

/** World axes, in the fixed row order every testid uses. */
const AXES = /** @type {const} */ (['x', 'y', 'z'])

const props = defineProps({
  columns: {
    type: /** @type {import('vue').PropType<Array<{ key: string, label: string, title?: string, disabled?: boolean }>>} */ (Array),
    required: true,
  },
  /** What the grid is, for assistive tech ("Align to", "Snap"). */
  label: { type: String, required: true },
})

const emit = defineEmits({
  /**
   * @param {'x' | 'y' | 'z'} axis
   * @param {string} key
   */
  tap: (axis, key) => typeof axis === 'string' && typeof key === 'string',
})
</script>

<template>
  <div
    class="align-grid"
    role="group"
    :aria-label="props.label"
    :style="{ gridTemplateColumns: `auto repeat(${props.columns.length}, minmax(0, 1fr))` }"
  >
    <template v-for="axis in AXES" :key="axis">
      <span class="align-grid__axis">{{ axis.toUpperCase() }}</span>
      <button
        v-for="column in props.columns"
        :key="column.key"
        type="button"
        class="align-grid__button"
        :disabled="column.disabled"
        :title="column.title ? `${axis.toUpperCase()} ${column.title}` : undefined"
        :data-testid="`align-${axis}-${column.key}`"
        @click="emit('tap', axis, column.key)"
      >
        {{ column.label }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.align-grid {
  display: grid;
  gap: 4px;
  align-items: center;
}

.align-grid__axis {
  min-width: 1.25rem;
  color: var(--text-2);
  font-size: 0.8rem;
  text-align: center;
}

.align-grid__button {
  min-width: 44px;
  min-height: 44px;
  padding: 0 0.15rem;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-size: 0.72rem;
  cursor: pointer;
  touch-action: manipulation;
}

/* The "pressed" feedback a no-op tap gets (TODO/ui-060): nothing moves, nothing is appended. */
.align-grid__button:active:not(:disabled) {
  background: var(--surface-1);
  border-color: var(--accent);
}

.align-grid__button:focus-visible {
  outline: 2px solid var(--accent);
}

.align-grid__button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
