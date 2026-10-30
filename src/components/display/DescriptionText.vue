<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The project's description (`TODO/io-023`) rendered in its Markdown subset: paragraphs, bullet
 * lists, **bold**, *italic* and `code` (`src/core/description.js`'s `parseDescription`). Read-only.
 *
 * Secure by construction: every element here is one this template names, and every piece of text
 * reaches the DOM through `{{ }}` interpolation (text content). There is no `v-html`, no attribute
 * built from the text, no link and no image — a `<script>` or `[x](javascript:…)` in the
 * description is characters on screen.
 */
import { computed } from 'vue'

import { parseDescription } from '../../core/description.js'

const props = defineProps({
  /** The description as stored; cleaned again by the parse. */
  text: { type: String, default: '' },
  /** For the root element. */
  testid: { type: String, default: 'description-text' },
})

const blocks = computed(() => parseDescription(props.text))
</script>

<template>
  <div v-if="blocks.length > 0" class="description" :data-testid="testid">
    <template v-for="(block, blockIndex) in blocks" :key="blockIndex">
      <p v-if="block.type === 'paragraph'" class="description__paragraph">
        <template v-for="(inline, index) in block.inlines" :key="index">
          <strong v-if="inline.type === 'strong'">{{ inline.text }}</strong>
          <em v-else-if="inline.type === 'em'">{{ inline.text }}</em>
          <code v-else-if="inline.type === 'code'" class="description__code">{{ inline.text }}</code>
          <template v-else>{{ inline.text }}</template>
        </template>
      </p>
      <ul v-else class="description__list">
        <li v-for="(item, itemIndex) in block.items" :key="itemIndex">
          <template v-for="(inline, index) in item" :key="index">
            <strong v-if="inline.type === 'strong'">{{ inline.text }}</strong>
            <em v-else-if="inline.type === 'em'">{{ inline.text }}</em>
            <code v-else-if="inline.type === 'code'" class="description__code">{{ inline.text }}</code>
            <template v-else>{{ inline.text }}</template>
          </template>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.description {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-1);
  overflow-wrap: anywhere;
}

.description__paragraph,
.description__list {
  margin: 0;
}

.description__list {
  padding-left: 20px;
}

.description__code {
  padding: 0 4px;
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.92em;
}
</style>
