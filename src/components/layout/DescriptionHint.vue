<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The sender's one-line hint (`TODO/ui-091`), shown in the Share sheet and in **Save as gist…**:
 * what people who open the link will see first — the first line of the project's description
 * (`TODO/io-023`) — with **Edit…**, or, when there is none, an invitation with **Add…**. Both open
 * File ▾ → Project settings…, where the description is edited.
 *
 * The first line is the sender's own text, rendered through `{{ }}` as text.
 */
import { computed } from 'vue'

import { descriptionFirstLine } from '../../core/description.js'
import { useDocumentStore } from '../../stores/document.js'
import { useProjectSettingsStore } from '../../stores/projectSettings.js'

const emit = defineEmits(['edit'])

const documentStore = useDocumentStore()
const settings = useProjectSettingsStore()

const firstLine = computed(() => descriptionFirstLine(documentStore.description))

function edit() {
  emit('edit')
  settings.open()
}
</script>

<template>
  <div class="hint" data-testid="description-hint">
    <p v-if="firstLine" class="hint__text" data-testid="description-hint-text">
      People who open this will see: <em class="hint__line" data-testid="description-hint-line">{{ firstLine }}</em>
    </p>
    <p v-else class="hint__text" data-testid="description-hint-text">Add a description for the people you are sending this to</p>
    <button type="button" class="hint__button" data-testid="description-hint-edit" @click="edit()">
      {{ firstLine ? 'Edit…' : 'Add…' }}
    </button>
  </div>
</template>

<style scoped>
.hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  min-width: 0;
}

.hint__text {
  flex: 1 1 200px;
  min-width: 0;
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.hint__line {
  color: var(--text-1);
}

.hint__button {
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--accent);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  touch-action: manipulation;
}
</style>
