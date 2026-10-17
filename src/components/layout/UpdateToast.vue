<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The "new version" strip (`TODO/build-005`): *"A new version of WarpCad is available."* with
 * **Reload** and **Later**, and, once, *"WarpCad is ready to work offline."*
 *
 * - **Precondition**: the service worker installed a newer build (`stores/appUpdate.js`).
 * - **Trigger**: **Reload** (`pwa-update-reload`). It never fires by itself. If a drag, a field
 *   edit, an open pop-up or sketch, an autosave that has not landed, or a merge waiting on the
 *   open file is in progress (`canReloadNow`), Reload first asks "Reload anyway?" — the same
 *   words as the project's other replace questions.
 * - **Feedback**: the strip disappears; the page restarts on the new build and Help's version
 *   line changes.
 * - **Placement**: the last row of the app column, in flow below the main area, so it pushes the
 *   viewport up instead of covering the navigation chrome, the orientation cube, the gizmo or
 *   the chat sheet, at every width. Tap targets are 44px.
 *
 * What a reload loses is transient UI state only: the document is in the project file and the
 * autosave in IndexedDB.
 */
import { computed } from 'vue'

import { canReloadNow } from '../../core/appUpdate.js'
import { useAppUpdateStore } from '../../stores/appUpdate.js'
import { usePersistenceStore } from '../../stores/persistence.js'
import { usePlacementStore } from '../../stores/placement.js'
import { useSketchEditorStore } from '../../stores/sketchEditor.js'

const update = useAppUpdateStore()
const persistence = usePersistenceStore()
const placement = usePlacementStore()
const sketch = useSketchEditorStore()

const safe = computed(() =>
  canReloadNow({
    dragging: placement.isDragging,
    editing: persistence.uiBusy || sketch.active,
    unsaved: persistence.autosaveState === 'saving' || persistence.errorMessage !== '',
    mergeWaiting: persistence.diskWaiting,
  }),
)
</script>

<template>
  <div class="update-slot" role="status" aria-live="polite">
    <div v-if="update.needRefresh" class="update-strip" data-testid="pwa-update-toast">
      <p class="update-strip__text" data-testid="pwa-update-text">
        A new version of WarpCad is available.
        <span class="update-strip__version" data-testid="pwa-update-current">You are on {{ update.version }}+{{ update.commit }}.</span>
        <template v-if="update.confirming">
          <strong data-testid="pwa-update-confirm-text">
            You have work in progress. The project is saved, but an open pop-up, drag or unfinished edit will be lost. Reload anyway?
          </strong>
        </template>
      </p>
      <div class="update-strip__actions">
        <button
          v-if="!update.confirming"
          type="button"
          class="update-strip__button update-strip__button--primary"
          data-testid="pwa-update-reload"
          @click="update.reload(safe)"
        >
          Reload
        </button>
        <button
          v-else
          type="button"
          class="update-strip__button update-strip__button--primary"
          data-testid="pwa-update-reload-anyway"
          @click="update.confirmReload()"
        >
          Reload anyway
        </button>
        <button
          type="button"
          class="update-strip__button"
          data-testid="pwa-update-later"
          @click="update.later()"
        >
          Later
        </button>
      </div>
    </div>
    <div v-else-if="update.offlineReady" class="update-strip" data-testid="pwa-offline-ready">
      <p class="update-strip__text">WarpCad is ready to work offline.</p>
      <div class="update-strip__actions">
        <button
          type="button"
          class="update-strip__button"
          data-testid="pwa-offline-ready-dismiss"
          aria-label="Dismiss"
          @click="update.dismissOfflineReady()"
        >
          OK
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.update-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  padding: 4px 8px 4px 14px;
  padding-bottom: max(4px, env(safe-area-inset-bottom));
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-1));
  color: var(--text-1);
}

.update-strip__text {
  flex: 1 1 14em;
  min-width: 0;
  margin: 0;
  font-size: 13px;
}

.update-strip__version {
  color: var(--text-2);
}

.update-strip__actions {
  display: flex;
  gap: 6px;
}

.update-strip__button {
  min-width: var(--tap);
  min-height: var(--tap);
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-1);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  touch-action: manipulation;
}

.update-strip__button--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}

.update-strip__button:hover,
.update-strip__button:focus-visible {
  border-color: var(--accent);
}
</style>
