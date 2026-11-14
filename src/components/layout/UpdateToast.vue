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
import BaseButton from '../controls/BaseButton.vue'
import BaseBanner from '../display/BaseBanner.vue'

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
    <BaseBanner v-if="update.needRefresh" layout="dock" data-testid="pwa-update-toast" text-testid="pwa-update-text">
      A new version of WarpCad is available.
      <span class="update-strip__version" data-testid="pwa-update-current">You are on {{ update.buildLabel }}.</span>
      <template v-if="update.confirming">
        <strong data-testid="pwa-update-confirm-text">
          You have work in progress. The project is saved, but an open pop-up, drag or unfinished edit will be lost. Reload anyway?
        </strong>
      </template>
      <template #actions>
        <BaseButton
          v-if="!update.confirming"
          variant="primary"
          narrow
          data-testid="pwa-update-reload"
          @click="update.reload(safe)"
        >
          Reload
        </BaseButton>
        <BaseButton
          v-else
          variant="primary"
          narrow
          data-testid="pwa-update-reload-anyway"
          @click="update.confirmReload()"
        >
          Reload anyway
        </BaseButton>
        <BaseButton
          narrow
          data-testid="pwa-update-later"
          @click="update.later()"
        >
          Later
        </BaseButton>
      </template>
    </BaseBanner>
    <BaseBanner v-else-if="update.offlineReady" layout="dock" data-testid="pwa-offline-ready">
      WarpCad is ready to work offline.
      <template #actions>
        <BaseButton
          narrow
          data-testid="pwa-offline-ready-dismiss"
          aria-label="Dismiss"
          @click="update.dismissOfflineReady()"
        >
          OK
        </BaseButton>
      </template>
    </BaseBanner>
  </div>
</template>

<style scoped>
.update-strip__version {
  color: var(--text-2);
}
</style>
