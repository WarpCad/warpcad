<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Inspector header's design-intent line (`TODO/ai-003`): why the selected body exists —
 * the intent of the latest step in its history that has one (`latestIntentOf`). One line,
 * ellipsised; a tap (or Enter/Space — it is a button) shows the whole text. Nothing renders
 * for a body with no intent, which is every body a person made by hand.
 *
 * Untrusted text (it can come from any opened file), so it is rendered with `{{ }}` text
 * interpolation only, never `v-html`.
 */
import { computed, ref, watch } from 'vue'

import { latestIntentOf } from '../../core/intent.js'
import { useDocumentStore } from '../../stores/document.js'

const props = defineProps({
  /** The selected body's id (its lineage root). */
  bodyId: { type: String, required: true },
})

const documentStore = useDocumentStore()
const expanded = ref(false)

const intent = computed(() => {
  void documentStore.version // `raw` is deliberately non-reactive
  return latestIntentOf(documentStore.raw, props.bodyId) ?? null
})

// A different body starts collapsed again.
watch(
  () => props.bodyId,
  () => {
    expanded.value = false
  },
)
</script>

<template>
  <button
    v-if="intent !== null"
    type="button"
    class="intent"
    :class="{ 'intent--collapsed': !expanded }"
    data-testid="inspector-intent"
    :aria-expanded="expanded ? 'true' : 'false'"
    :title="expanded ? 'Show less' : 'Why this exists — tap to read it all'"
    @click="expanded = !expanded"
  >
    <span class="intent__label">Why</span>
    <span class="intent__text">{{ intent }}</span>
  </button>
</template>

<style scoped>
.intent {
  /* The Inspector sheet is a scrolling flex column: without this the expanded text is
     squeezed to the 44px minimum and spills over the next section (found driving ai-003). */
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  width: 100%;
  min-height: var(--tap);
  margin: 0;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.45;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}

.intent__label {
  flex: 0 0 auto;
  color: var(--text-3);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.intent__text {
  flex: 1;
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.intent--collapsed {
  align-items: center;
}

.intent--collapsed .intent__text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.intent:hover .intent__text,
.intent:focus-visible .intent__text {
  color: var(--text-1);
}
</style>
