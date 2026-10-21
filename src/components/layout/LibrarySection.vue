<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * One catalogue section of the labelled Library column (`TODO/ui-084`, extracted from
 * `LibraryPanel.vue`): its heading and its rows, each a {@link LibraryRow}. The sections and their
 * rows come from `src/core/library.js`; this file names no section and no recipe.
 */
import LibraryRow from './LibraryRow.vue'

defineProps({
  /** A section of `LIBRARY_SECTIONS`. */
  section: {
    type: /** @type {import('vue').PropType<import('../../core/library.js').LibrarySection>} */ (Object),
    required: true,
  },
})
</script>

<template>
  <h2 class="library__heading" :data-testid="`library-heading-${section.id}`">
    {{ section.title }}
  </h2>
  <!-- The primitives list keeps the bare `library-rows` id it has had since ui-010: a dozen
       existing specs open the panel by waiting on it, and renaming it would be churn with no
       reader-facing gain. Every other section is `library-rows-<id>`. -->
  <ul class="library__rows" :data-testid="section.id === 'primitive' ? 'library-rows' : `library-rows-${section.id}`">
    <LibraryRow v-for="row in section.rows" :key="row.op" :row="row" />
  </ul>
</template>

<style scoped>
.library__heading {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}

/* A section heading that is not the first one needs room above it, or the two
   lists read as one long list with a word in the middle. Both elements carry this
   component's scope, so the rule holds across one section's list and the next's heading. */
.library__rows + .library__heading {
  margin-top: 14px;
}

.library__rows {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
