<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The one list-row shell (`TODO/ui-117`): a label with a leading control and trailing actions (the
 * check, the eye, a chevron, a bind button). A layout shell, not a full component: what goes in each
 * slot is the caller's.
 *
 * - **Slots**: `leading` (a check or swatch), the default slot (the label or the row's main button;
 *   it takes the remaining width and may shrink to nothing), `trailing` (the actions, at their own width).
 * - **`selected`** fills the row with the selection tint and sets `data-selected`; **`hovered`** draws
 *   the hover marker, an inset edge in `--hover-highlight` (an inset shadow, so a hovered row never
 *   shifts its neighbours: `ui-049`) and sets `data-hovered`; **`interactive`** is a row whose whole area
 *   acts (a pointer cursor and touch handling). Leave `selected` and `hovered` unset for a row that
 *   has neither: no attribute is written.
 * - **`truncate`** keeps a plain text label to one line with an ellipsis. **`tag`** is the element
 *   (`div`, or `li` inside a list).
 * - Pointer and focus listeners, `data-testid`, `aria-*` and `class` fall through to the row.
 */
defineProps({
  selected: { type: Boolean, default: undefined },
  hovered: { type: Boolean, default: undefined },
  interactive: { type: Boolean, default: false },
  truncate: { type: Boolean, default: false },
  /** The element to render. */
  tag: { type: String, default: 'div' },
})
</script>

<template>
  <component
    :is="tag"
    class="list-row"
    :class="{ 'list-row--selected': selected, 'list-row--interactive': interactive }"
    :data-selected="selected === undefined ? undefined : selected ? 'true' : 'false'"
    :data-hovered="hovered === undefined ? undefined : hovered ? 'true' : 'false'"
  >
    <slot name="leading" />
    <div class="list-row__main" :class="{ 'list-row__main--truncate': truncate }"><slot /></div>
    <slot name="trailing" />
  </component>
</template>

<style scoped>
.list-row {
  display: flex;
  align-items: stretch;
  min-height: var(--tap);
}

/* A selected row is a full-row fill. */
.list-row--selected {
  background: color-mix(in srgb, var(--accent) 18%, var(--surface-1));
}

/* The hover marker (`TODO/ui-049`): the colour the matching geometry lights up in. */
.list-row[data-hovered='true'] {
  box-shadow: inset 3px 0 0 var(--hover-highlight);
}

.list-row--interactive {
  cursor: pointer;
  touch-action: manipulation;
}

/* The label takes what the leading and trailing parts leave, and may shrink to nothing. */
.list-row__main {
  display: flex;
  flex: 1 1 auto;
  align-items: stretch;
  min-width: 0;
}

.list-row__main--truncate {
  display: block;
  align-self: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
