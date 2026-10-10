<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * **Save to library…** (`data-testid="library-save"`, `TODO/ui-055`) as the Inspector shows it.
 *
 * Enabled only with exactly one body selected (`library.saveGate`, the selection-*count* rule).
 * When it is disabled it says why in a visible line, not only in a tooltip: a phone has no
 * hover, and "Select exactly 1 — tap Combine into group…" is the instruction the person needs.
 */
import { useLibraryStore } from '../../stores/library.js'

const library = useLibraryStore()
</script>

<template>
  <div class="save-library">
    <button
      type="button"
      class="save-library__button"
      data-testid="library-save"
      :disabled="!library.saveGate.enabled"
      :title="library.saveGate.enabled ? 'Save this group to My parts, so it can be dragged into any project' : library.saveGate.reason"
      @click="library.openSave()"
    >
      Save to library…
    </button>
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

.save-library__button {
  min-height: var(--tap, 44px);
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.save-library__button:hover:not(:disabled) {
  border-color: var(--accent);
}

.save-library__button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.save-library__reason {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-3);
}
</style>
