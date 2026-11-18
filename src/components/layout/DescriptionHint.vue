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

import BaseButton from '../controls/BaseButton.vue'
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
    <BaseButton variant="link" data-testid="description-hint-edit" @click="edit()">
      {{ firstLine ? 'Edit…' : 'Add…' }}
    </BaseButton>
  </div>
</template>

<style scoped>
.hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-4);
  min-width: 0;
}

.hint__text {
  flex: 1 1 200px;
  min-width: 0;
  margin: 0;
  font-size: var(--text-size-md);
  line-height: 1.4;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.hint__line {
  color: var(--text-1);
}

</style>
