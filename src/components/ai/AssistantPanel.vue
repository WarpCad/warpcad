<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Assistant's **minimal connected state** (`TODO/ai-004`): what the header button opens
 * when a key is stored. The chat itself is `ai-006`; until then this shows the two things that
 * task promised — the connection dot and the model name — and a way back to the key sheet.
 *
 * Reuses `ModalShell`, so at phone width it is the same top-anchored, full-width, scrolling
 * frame as the key sheet. `ai-006` replaces the body, not the frame's contract.
 */
import { computed } from 'vue'

import { useEscapeToClose } from '../../composables/useEscapeToClose.js'
import { useAssistantStore } from '../../stores/assistant.js'
import ConnectionDot from '../display/ConnectionDot.vue'
import ModalShell from '../storage/ModalShell.vue'

const assistant = useAssistantStore()
const open = computed(() => assistant.view === 'chat')

useEscapeToClose(() => open.value, () => assistant.close())
</script>

<template>
  <ModalShell :open="open" testid="assistant-panel" title="Assistant" @backdrop="assistant.close()">
    <p class="panel__connection" data-testid="assistant-connection" :data-status="assistant.status">
      <ConnectionDot :state="assistant.dotState" testid="assistant-panel-dot" />
      <span data-testid="assistant-connection-text">{{ assistant.statusText }}</span>
    </p>
    <p class="panel__model">
      Model: <strong data-testid="assistant-model-name">{{ assistant.modelName }}</strong>
    </p>
    <p v-if="assistant.storageNote" class="panel__warn" role="status" data-testid="assistant-storage-note">
      {{ assistant.storageNote }}
    </p>
    <div class="panel__actions">
      <button type="button" class="panel__button" data-testid="assistant-keys" @click="assistant.openKeySheet()">
        Key and model…
      </button>
      <button
        type="button"
        class="panel__button panel__button--primary"
        data-testid="assistant-close"
        @click="assistant.close()"
      >
        Close
      </button>
    </div>
  </ModalShell>
</template>

<style scoped>
.panel__connection {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  line-height: 1.4;
  color: var(--text-1);
  overflow-wrap: anywhere;
}

.panel__connection[data-status='failed'] {
  color: var(--danger);
}

.panel__model {
  margin: 0;
  font-size: 13px;
  color: var(--text-2);
}

.panel__warn {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--warn);
}

.panel__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.panel__button {
  min-width: 96px;
  min-height: var(--tap);
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  touch-action: manipulation;
}

.panel__button--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}
</style>
