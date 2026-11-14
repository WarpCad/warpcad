<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Open sheet (`TODO/io-014`): in the native app, File ▾ → **Open…** lists the projects in
 * WarpCad's own Documents folder, newest first, with **Browse…** for a project anywhere else.
 *
 * - **Precondition**: running in the native app (`persistence.fileCapabilities.mode === 'native-app'`).
 *   A project with content was confirmed first (`file-open-confirm`), so the sheet replaces nothing
 *   until a file is chosen.
 * - **Trigger**: File ▾ → Open… (or Ctrl/Cmd+O).
 * - **Feedback**: a row opens that project (`Opened bracket.ndjson · 3 steps` on the chip), and a
 *   later Save writes back to it. **Browse…** opens the system document picker; a file picked
 *   there is a copy, and the chip says so.
 *
 * A bottom sheet at phone width, rows at tap height, no sideways scroll: a long name wraps.
 */
import { ref, watch } from 'vue'

import { useFileMenuStore } from '../../stores/fileMenu.js'
import { usePersistenceStore } from '../../stores/persistence.js'
import BaseDialog from '../layout/BaseDialog.vue'

const menu = useFileMenuStore()
const persistence = usePersistenceStore()

const projects = ref(/** @type {Array<{ name: string, lastModified: number }>} */ ([]))
const listing = ref(false)

watch(
  () => menu.openSheetOpen,
  async (open) => {
    if (!open) return
    listing.value = true
    try {
      projects.value = await persistence.listProjectFiles()
    } finally {
      listing.value = false
    }
  },
  { immediate: true },
)

/**
 * `12 Nov 2026, 14:05`, in the reader's locale.
 *
 * @param {number} epochMs
 */
function modified(epochMs) {
  return new Date(epochMs).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
</script>

<template>
  <BaseDialog :open="menu.openSheetOpen" sheet testid="file-open-sheet" title="Open" help-topic="native-files" @backdrop="menu.closeOpenSheet()">
    <p v-if="listing" class="open-sheet__note" role="status">Reading WarpCad's folder…</p>
    <p v-else-if="projects.length === 0" class="open-sheet__note" data-testid="file-open-empty">No projects in WarpCad's folder yet.</p>
    <ul v-else class="open-sheet__list" aria-label="Projects in WarpCad's folder">
      <li v-for="project in projects" :key="project.name">
        <button type="button" class="open-sheet__row" data-testid="file-open-row" :data-name="project.name" @click="menu.openFromSheet(project.name)">
          <span class="open-sheet__name">{{ project.name }}</span>
          <span class="open-sheet__date">{{ modified(project.lastModified) }}</span>
        </button>
      </li>
    </ul>
    <div class="open-sheet__actions">
      <button type="button" class="open-sheet__button" data-testid="file-open-cancel" @click="menu.closeOpenSheet()">Cancel</button>
      <button type="button" class="open-sheet__button open-sheet__button--primary" data-testid="file-open-browse" @click="menu.browseFromSheet()">
        Browse…
      </button>
    </div>
  </BaseDialog>
</template>

<style scoped>
.open-sheet__note {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-2);
}

.open-sheet__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 0 10px;
  padding: 0;
  list-style: none;
}

.open-sheet__row {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 2px;
  width: 100%;
  min-height: max(44px, var(--tap));
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}

.open-sheet__row:hover,
.open-sheet__row:focus-visible {
  border-color: var(--accent);
}

.open-sheet__name {
  max-width: 100%;
  font-size: 15px;
  overflow-wrap: anywhere;
}

.open-sheet__date {
  font-size: 12px;
  color: var(--text-2);
}

.open-sheet__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.open-sheet__button {
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

.open-sheet__button--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}
</style>
