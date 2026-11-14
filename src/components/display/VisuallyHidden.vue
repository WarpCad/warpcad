<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * Text for assistive technology only (`TODO/ui-117`): off screen, still read. The rule is the
 * `.visually-hidden` utility in `src/styles/utilities.css`, which any element can carry; this
 * component is the same thing for a template that would rather name it. `as` picks the element
 * (`span` by default; `p` for a sentence). A label that is hidden only below a width uses
 * `.visually-hidden-phone` or `.visually-hidden-narrow` instead.
 */
defineProps({
  /** The element to render. */
  as: { type: String, default: 'span' },
})
</script>

<template>
  <component :is="as" class="visually-hidden"><slot /></component>
</template>
