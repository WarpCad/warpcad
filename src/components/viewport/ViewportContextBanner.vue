<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The banner over a 3D view whose WebGL context the browser released (`TODO/render-006`).
 *
 * - `lost`: *The 3D view was paused by the system. Restoring…*, no button. The browser usually
 *   hands the context back on its own within a moment.
 * - `stalled`: it did not come back within 3 s, or one attempt failed. **Restore view**
 *   (`viewport-restore`) asks the viewport to build a fresh renderer. It is never a page reload.
 * - `failed`: two attempts failed. **Save a copy** (`viewport-save-copy`, the File menu's own
 *   Save As / Download copy path) is offered beside it, so the work is never trapped.
 *
 * Sits in the upper part of the view, so an open phone bottom sheet never covers it, with full
 * tap-size buttons. It is pointer-transparent except for its buttons, so it never blocks a press
 * meant for the chrome around it.
 */
import { computed } from 'vue'
import { useFileMenuStore } from '../../stores/fileMenu.js'

const props = defineProps({
  state: { type: /** @type {import('vue').PropType<'lost' | 'stalled' | 'failed'>} */ (String), required: true },
  /** Failed Restore view attempts so far. */
  failures: { type: Number, default: 0 },
  /** A Shared view shows someone else's project: no Save a copy there. */
  presentation: { type: Boolean, default: false },
})

const emit = defineEmits(['restore'])
const fileMenu = useFileMenuStore()

const message = computed(() => {
  if (props.state === 'lost') return 'The 3D view was paused by the system. Restoring…'
  if (props.state === 'failed') {
    return props.presentation
      ? 'The 3D view could not be restored. Reload the page to see it again.'
      : 'The 3D view could not be restored. Your work is still here: save a copy, then restart the app.'
  }
  if (props.failures > 0) return 'Restoring the 3D view did not work. Try again.'
  return 'The 3D view was paused by the system and has not come back on its own.'
})

function saveCopy() {
  fileMenu.saveLocal({ saveAs: true })
}
</script>

<template>
  <div class="context-banner" data-testid="viewport-context-banner" :data-state="state">
    <p class="context-banner__line" :role="state === 'failed' ? 'alert' : 'status'">
      <span class="context-banner__text" data-testid="viewport-context-message">{{ message }}</span>
    </p>
    <div v-if="state !== 'lost'" class="context-banner__actions">
      <button type="button" class="context-banner__button context-banner__button--primary" data-testid="viewport-restore" @click="emit('restore')">
        Restore view
      </button>
      <button
        v-if="state === 'failed' && !presentation"
        type="button"
        class="context-banner__button"
        data-testid="viewport-save-copy"
        @click="saveCopy"
      >
        Save a copy
      </button>
    </div>
  </div>
</template>

<style scoped>
.context-banner {
  position: absolute;
  /* The upper part of the view: the phone's bottom sheets rise from below, and the toolbar row
     sits at the very top, so this band is clear of both at every reference size. */
  top: 28%;
  left: 50%;
  z-index: 13;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  width: max-content;
  max-width: min(420px, calc(100% - 32px));
  padding: 12px 14px;
  transform: translate(-50%, -50%);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface-glass);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-overlay);
  color: var(--text-1);
  font-size: 13px;
  line-height: 1.4;
  text-align: center;
  pointer-events: none;
}

.context-banner[data-state='failed'] {
  border-color: var(--warn);
}

.context-banner__line {
  margin: 0;
}

.context-banner__text {
  overflow-wrap: anywhere;
}

.context-banner__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.context-banner__button {
  min-width: var(--tap);
  min-height: var(--tap);
  padding: 0 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  pointer-events: auto;
}

.context-banner__button--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}

.context-banner__button:hover,
.context-banner__button:focus-visible {
  border-color: var(--border-strong);
}

.context-banner__button--primary:hover,
.context-banner__button--primary:focus-visible {
  border-color: var(--text-1);
}
</style>
