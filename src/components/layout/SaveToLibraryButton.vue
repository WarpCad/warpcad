<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * **Save to library…** (`data-testid="library-save"`, `TODO/ui-055`) as the Inspector shows it.
 *
 * Enabled only with exactly one body selected (`library.saveGate`, the selection-*count* rule).
 * When it is disabled it says why in a visible line, not only in a tooltip: a phone has no
 * hover, and "Select exactly 1 — tap Combine into group…" is the instruction the person needs.
 */
import BaseButton from '../controls/BaseButton.vue'
import { useLibraryStore } from '../../stores/library.js'

const library = useLibraryStore()
</script>

<template>
  <div class="save-library">
    <BaseButton
      align="start"
      data-testid="library-save"
      :disabled="!library.saveGate.enabled"
      :title="library.saveGate.enabled ? 'Save this group to My parts, so it can be dragged into any project' : library.saveGate.reason"
      @click="library.openSave()"
    >
      Save to library…
    </BaseButton>
    <p v-if="!library.saveGate.enabled" class="save-library__reason" data-testid="library-save-reason">
      {{ library.saveGate.reason }}
    </p>
  </div>
</template>

<style scoped>
.save-library {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.save-library__reason {
  margin: 0;
  font-size: var(--text-size-sm);
  line-height: 1.4;
  color: var(--text-3);
}
</style>
