<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * An X / Y / Z grid of one-tap buttons (`TODO/ui-060`), extracted from the Inspector's old
 * Align to origin row (`TODO/ui-050`) and used by the Align popover for its seven positions
 * per axis (`TODO/ui-086`).
 *
 * It knows nothing about what a tap does. Each column is `{ key, label, header?, disabled? }`;
 * a button's testid is `align-<axis>-<key>`, and a tap emits `tap(axis, key)`. Buttons are at
 * least 44×44 px, and the columns are `minmax(0, 1fr)` so the grid never pushes past a 390 px
 * phone.
 *
 * - **`describe(axis, key)`** gives a button's `aria-label` and desktop `title`, so no button
 *   is ever a glyph alone. `preview(axis, key | null)` is emitted on hover and focus so the
 *   caller can show the same sentence somewhere readable.
 * - **`header`** on any column adds a thin direction rule (`−` … `+`) and a column-header row
 *   as the grid's *first rows*, in the same CSS grid as the buttons so each word sits over its
 *   column and cannot drift. Both are `aria-hidden`.
 * - **`segmented`** removes the gaps and shares the borders, one strip per axis.
 * - The default slot (`#default="{ column }"`) replaces a button's text, for an icon.
 *
 * @module components/viewport/AlignGrid
 */

/** World axes, in the fixed row order every testid uses. */
const AXES = /** @type {const} */ (['x', 'y', 'z'])

const props = defineProps({
  columns: {
    type: /** @type {import('vue').PropType<Array<{ key: string, label?: string, header?: string, title?: string, disabled?: boolean }>>} */ (Array),
    required: true,
  },
  /** What the grid is, for assistive tech ("Align to", "Snap"). */
  label: { type: String, required: true },
  /** Gap-free strips with shared borders. */
  segmented: { type: Boolean, default: false },
  describe: {
    type: /** @type {import('vue').PropType<((axis: 'x' | 'y' | 'z', key: string) => string) | undefined>} */ (Function),
    default: undefined,
  },
})

const emit = defineEmits({
  /**
   * @param {'x' | 'y' | 'z'} axis
   * @param {string} key
   */
  tap: (axis, key) => typeof axis === 'string' && typeof key === 'string',
  /**
   * @param {'x' | 'y' | 'z' | null} axis
   * @param {string | null} key
   */
  preview: (axis, key) => axis === null || (typeof axis === 'string' && typeof key === 'string'),
})

const hasHeader = () => props.columns.some((column) => column.header)
</script>

<template>
  <div
    class="align-grid"
    :class="{ 'align-grid--segmented': props.segmented }"
    role="group"
    :aria-label="props.label"
    :style="{ gridTemplateColumns: `auto repeat(${props.columns.length}, minmax(0, 1fr))` }"
  >
    <template v-if="hasHeader()">
      <span class="align-grid__rule" aria-hidden="true" data-testid="align-rule" :style="{ gridColumn: `2 / span ${props.columns.length}` }">
        <span>−</span><span class="align-grid__rule-line" /><span>+</span>
      </span>
      <span aria-hidden="true" data-testid="align-header" class="align-grid__header-row">
        <span />
        <span v-for="column in props.columns" :key="column.key" class="align-grid__header">{{ column.header }}</span>
      </span>
    </template>
    <template v-for="axis in AXES" :key="axis">
      <span class="align-grid__axis">{{ axis.toUpperCase() }}</span>
      <button
        v-for="(column, index) in props.columns"
        :key="column.key"
        type="button"
        class="align-grid__button"
        :class="{ 'align-grid__button--first': index === 0, 'align-grid__button--last': index === props.columns.length - 1 }"
        :disabled="column.disabled"
        :title="props.describe ? props.describe(axis, column.key) : column.title ? `${axis.toUpperCase()} ${column.title}` : undefined"
        :aria-label="props.describe ? props.describe(axis, column.key) : undefined"
        :data-testid="`align-${axis}-${column.key}`"
        @click="emit('tap', axis, column.key)"
        @mouseenter="emit('preview', axis, column.key)"
        @focus="emit('preview', axis, column.key)"
        @mouseleave="emit('preview', null, null)"
        @blur="emit('preview', null, null)"
      >
        <slot :column="column" :axis="axis">{{ column.label }}</slot>
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

.align-grid--segmented {
  column-gap: 0;
}

.align-grid__axis {
  min-width: 1.25rem;
  color: var(--text-2);
  font-size: 0.8rem;
  text-align: center;
}

.align-grid--segmented .align-grid__axis {
  min-width: 16px;
  margin-right: 4px;
}

/* The header is its own grid row built on the same template, so each word sits over its column. */
.align-grid__header-row {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
}

.align-grid__header {
  color: var(--text-2);
  font-size: 10px;
  line-height: 1;
  text-align: center;
}

.align-grid__rule {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-2);
  font-size: 10px;
  line-height: 1;
}

.align-grid__rule-line {
  flex: 1;
  height: 1px;
  background: var(--border-strong, var(--border));
}

.align-grid__button {
  display: flex;
  align-items: center;
  justify-content: center;
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

/* One strip: shared borders, only the ends rounded. */
.align-grid--segmented .align-grid__button {
  border-radius: 0;
  margin-left: -1px;
}

.align-grid--segmented .align-grid__button--first {
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  margin-left: 0;
}

.align-grid--segmented .align-grid__button--last {
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

/* The "pressed" feedback a no-op tap gets (TODO/ui-060): nothing moves, nothing is appended. */
.align-grid__button:active:not(:disabled) {
  background: var(--surface-1);
  border-color: var(--accent);
}

.align-grid__button:focus-visible {
  outline: 2px solid var(--accent);
  position: relative;
}

.align-grid__button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
