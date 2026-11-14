<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The one small uppercase section heading (`TODO/ui-117`): the Inspector's and the Library's panel
 * headings, the Inspector's Color, Parts, Transform and Parameters titles, and a History
 * condition's title. It was drawn at 12 px in four places and 11 px, with another letter-spacing,
 * in three more, two sizes for one role side by side in the Inspector; it is **12 px**
 * (`--text-size-sm`) everywhere now.
 *
 * - **`level`** the heading level (`2`, `3`, ...), the default `3`. The document outline stays the
 *   caller's decision.
 * - Layout (`margin`) stays the caller's: a class on this component lands on the heading. The
 *   default is the `0 0 6px` every one of them used.
 */
defineProps({
  /** The `<h1>`..`<h6>` level. */
  level: { type: Number, default: 3, validator: (/** @type {number} */ v) => Number.isInteger(v) && v >= 1 && v <= 6 },
})
</script>

<template>
  <component :is="`h${level}`" class="section-heading"><slot /></component>
</template>

<style scoped>
.section-heading {
  margin: 0 0 6px;
  font-size: var(--text-size-sm);
  font-weight: var(--weight-bold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}
</style>
