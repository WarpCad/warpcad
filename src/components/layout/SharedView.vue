<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The **Shared view** (`TODO/io-016`): what a person who tapped a WarpCad link sees — the model,
 * large, with the project's name over it, the viewport's own navigation pad and view cube, and
 * one button, **Make my own copy to edit**. A quiet **Save a copy of the file** beside it. There is
 * no toolbar, timeline, library, inspector, assistant, File menu, gizmo or selection, and nothing
 * to dismiss first: it is for someone who has never used CAD.
 *
 * - **Read-only through Watch** (`TODO/ai-017`): the shared project is a throwaway document shown
 *   with `timeline.watchFork` (`stores/share.js`), so picking is off — tapping a body does
 *   nothing — and nothing can be appended. The viewport is mounted in its `presentation` form.
 * - **Opening never writes**: autosave is suspended for as long as this view is up.
 * - **Make my own copy to edit** goes through the File menu's open flow, so the browser's own
 *   project gets the existing **Replace the project?** question (mounted here, since the File
 *   menu is not) — or **Merge their changes** when the link is the same project.
 * - **A link that cannot be read** is a plain full-screen message with **Start WarpCad**, never a
 *   stack trace and never a half-loaded project.
 * - **Small screens first**: at 390px the title sits above the model and the action is a
 *   full-width button in the thumb zone; from 641px the action sits beside the title.
 *
 * Name and note arrived in a link: untrusted text, rendered as text only.
 */
import ReplaceConfirmDialog from '../storage/ReplaceConfirmDialog.vue'
import Viewport from '../viewport/Viewport.vue'
import { useShareStore } from '../../stores/share.js'

defineEmits(['start'])

const share = useShareStore()
</script>

<template>
  <section class="shared" data-testid="shared-view" :data-state="share.phase" aria-label="Shared project">
    <div v-if="share.phase === 'incomplete'" class="shared__incomplete" data-testid="shared-incomplete" :data-reason="share.reason">
      <h1 class="shared__incomplete-title">This link looks incomplete</h1>
      <p class="shared__incomplete-text">
        Ask the person who sent it to send it again, or to send the file instead.
      </p>
      <button type="button" class="shared__button shared__button--primary" data-testid="shared-start" @click="$emit('start')">
        Start WarpCad
      </button>
    </div>

    <template v-else>
      <header class="shared__head">
        <p class="shared__kicker">Shared with you · WarpCad</p>
        <h1 class="shared__title" data-testid="shared-title">{{ share.phase === 'ready' ? share.name : 'Opening…' }}</h1>
        <p v-if="share.note" class="shared__note" data-testid="shared-note">{{ share.note }}</p>
        <p v-if="share.phase === 'ready'" class="shared__hint" data-testid="shared-hint">Drag to turn it · pinch or scroll to zoom</p>
      </header>

      <div class="shared__stage">
        <Viewport v-if="share.phase === 'ready'" presentation />
        <p v-else class="shared__opening" data-testid="shared-opening" role="status">Opening the shared project…</p>
      </div>

      <div class="shared__actions">
        <button
          type="button"
          class="shared__button shared__button--primary"
          data-testid="shared-copy"
          :disabled="share.phase !== 'ready'"
          @click="share.makeCopy()"
        >
          Make my own copy to edit
        </button>
        <button
          type="button"
          class="shared__button shared__button--quiet"
          data-testid="shared-save-file"
          :disabled="share.phase !== 'ready'"
          @click="share.saveFile()"
        >
          Save a copy of the file
        </button>
        <p v-if="share.status" class="shared__status" role="status" data-testid="shared-status">{{ share.status }}</p>
      </div>
    </template>

    <ReplaceConfirmDialog />
  </section>
</template>

<style scoped>
/* Phone first: one column — title, the model, then the action in the thumb zone. */
.shared {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr) auto;
  grid-template-areas:
    'head'
    'stage'
    'actions';
  background: var(--surface-0);
  color: var(--text-1);
}

.shared__head {
  grid-area: head;
  min-width: 0;
  padding: 10px 16px 8px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-1);
}

.shared__kicker {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}

.shared__title {
  margin: 2px 0 0;
  font-size: 20px;
  font-weight: 650;
  line-height: 1.25;
  color: var(--text-1);
  overflow-wrap: anywhere;
  /* A 10,000-character title must not push the model off the screen. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.shared__note {
  margin: 4px 0 0;
  font-size: 14px;
  line-height: 1.4;
  color: var(--text-2);
  overflow-wrap: anywhere;
  white-space: pre-line;
  max-height: 4.2em;
  overflow-y: auto;
}

.shared__hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-3);
}

.shared__stage {
  grid-area: stage;
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
}

.shared__stage > :deep(.viewport) {
  flex: 1 1 auto;
  min-height: 0;
}

.shared__opening {
  margin: auto;
  font-size: 14px;
  color: var(--text-2);
}

.shared__actions {
  grid-area: actions;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--border);
  background: var(--surface-1);
}

.shared__button {
  min-height: 48px;
  padding: 0 16px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: 15px;
  cursor: pointer;
  touch-action: manipulation;
}

.shared__button:disabled {
  opacity: 0.5;
  cursor: default;
}

.shared__button--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}

/* Quiet: a text link's weight, a full 44px target. */
.shared__button--quiet {
  min-height: var(--tap);
  border-color: transparent;
  background: transparent;
  color: var(--accent);
  font-size: 14px;
}

.shared__status {
  margin: 0;
  font-size: 12px;
  color: var(--text-2);
  text-align: center;
  overflow-wrap: anywhere;
}

.shared__incomplete {
  grid-row: 1 / -1;
  align-self: center;
  justify-self: center;
  box-sizing: border-box;
  width: min(440px, 100%);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px 16px;
  text-align: center;
}

.shared__incomplete-title {
  margin: 0;
  font-size: 20px;
  font-weight: 650;
}

.shared__incomplete-text {
  margin: 0;
  font-size: 15px;
  line-height: 1.45;
  color: var(--text-2);
}

/* Wider than a phone: the same screen, the action beside the title. */
@media (min-width: 641px) {
  .shared {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas:
      'head actions'
      'stage stage';
  }

  .shared__head {
    padding: 12px 24px;
  }

  .shared__actions {
    flex-direction: row;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    max-width: 520px;
    padding: 12px 24px;
    border-top: 0;
    border-bottom: 1px solid var(--border);
  }

  .shared__status {
    flex-basis: 100%;
    text-align: right;
  }
}
</style>
