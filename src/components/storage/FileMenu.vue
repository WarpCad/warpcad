<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The header bar's **File ▾** menu (`TODO/ui-033`) — the one control surface for saving,
 * opening and sharing a project. Its contract is
 * `docs/decisions/interaction-model-qa.md` sections 8-11 (confirmed by the user), which win
 * over the task file's older wording.
 *
 * ## What it is
 *
 * - **Trigger** `file-menu-button` in the header's document-bar cluster (Undo, Redo, History,
 *   **File ▾**, chip); document-level, so never gated on selection, and it does not touch the
 *   selection when opened (a header click must not clear it — Export's scope depends on that).
 * - **Popover**, teleported to `<body>` (the `ui-026`/`ui-028` pattern) with a click-catching
 *   backdrop, at the z-index tier the Q&A fixes (popover 31 — above the Inspector sheet 11 and
 *   the Library sheet 20; dialogs 40).
 * - **Two visibly separate groups**: this device (`Save`/`Save As…`/`Download copy`, `Open…`)
 *   and, below a divider, **Hosted storage** (`Connect repository…`, or once connected `Save
 *   to` / `Load from` / `Auto-push` / `Replace token…` / `Disconnect`).
 * - **The first line is the chip's text**, so a phone — where the chip is a 10px dot — can
 *   read the whole message from here (§8, Q16).
 * - **The status dot** on the button reports the hosted state with the menu closed.
 *
 * ## Labels are by capability, never by wish
 *
 * `persistence.fileCapabilities` decides: `Save` + `Save As…` where File System Access exists,
 * a single **`Download copy`** everywhere else — Firefox, Safari, every phone and tablet, where
 * it is the *primary* path. A control that only downloads is never called "Save".
 *
 * ## Shortcuts (additive; every one has an on-screen control)
 *
 * `Ctrl/Cmd+S` → the local Save / Download copy, **never a network write**; `Ctrl/Cmd+O` →
 * `Open…`; `Esc` → close the topmost thing this menu owns, and *only* then swallow the key, so
 * an Escape with nothing open still reaches the History strip's "leave preview".
 *
 * ## While History is previewing
 *
 * Save-family items stay **enabled** — they save the real document, not the preview (§14) —
 * and the menu says so, since "the viewport shows X, Save wrote Y" is the looks-live-but-isn't
 * defect this milestone is built against. `Open…` stays enabled too; the load ends the preview
 * (`stores/timeline.js`).
 *
 * ## `Export…` (`TODO/ui-034`)
 *
 * The last item of the "this device" group, after `Open…`: pressing it swaps this menu for the
 * export popover (`ExportPopover.vue`, `stores/exportDialog.js`). It is **dimmed with its reason
 * visible on the row** — `Nothing to export`, or `Return to the latest step to export` while
 * History previews — and uses `aria-disabled` rather than `disabled`, so it stays focusable
 * (a keyboard or screen-reader user can land on it and hear why), the reason is its accessible
 * description (`aria-describedby`), and on a phone — where a `title` tooltip never shows — the
 * reason is simply printed under the label. Pressing a dimmed item does nothing.
 *
 * ## `Merge file…` (`TODO/ui-062`)
 *
 * Directly under `Open…`: the same picker, but nothing is replaced, so there is no
 * replace-confirm — the picked copy's changes are merged in (`stores/merge.js`). Dimmed with its
 * reason printed under it, exactly like `Export…`: `Nothing to merge into`, `Return to the
 * latest step to merge`, or `Wait for the Assistant to finish` while an AI turn is landing.
 * What came in is reported by the merge toast or banner (`MergeToast.vue`, `MergeBanner.vue`).
 *
 * ## `Resolution: Normal` (`TODO/core-035`)
 *
 * The one row of its own **Design** group, after `Export…`'s group. Its label **is** the current design resolution, so the setting
 * can be read without opening anything; pressing it swaps this menu for
 * `ResolutionPopover.vue` (`stores/resolutionDialog.js`), exactly as `Export…` does for
 * its popover.
 *
 * ## `Project settings…` (`TODO/ai-003`)
 *
 * The Design group's second row: opens `ProjectSettingsDialog.vue`, where the project's
 * standing instructions for the AI assistant are edited. Always enabled — it changes no
 * geometry, so neither a History preview nor an empty scene gates it.
 *
 * ## An Open in progress (`TODO/core-032`)
 *
 * Open, `Load from owner/repo` and the start-up restore fold on the main thread, which can
 * block for a few hundred milliseconds on a phone. They are announced first: while
 * `persistence.loading` is set the button reads **busy** (`aria-busy`, its label names the
 * file) and shows `file-open-pending` — a spinner and `Opening…`/`Restoring…` in place of the
 * caret; the spinner is a CSS `transform` animation, so it keeps turning on the compositor
 * while the fold holds the main thread. `Open…` and `Load from` are disabled until it lands.
 *
 * ## The opened file changed on disk (`TODO/ai-009`)
 *
 * While `persistence.diskChanged` (the MCP server, or anything else, changed the file this
 * session opened or saved natively), the "This device" group gains **`Reload <name> from
 * disk…`** (`file-disk-reload`), which asks the disk-change question again after a Cancel — the
 * phone-sized way in, where the chip is a 10px dot. The dialog itself (`DiskChangeDialog.vue`) is
 * mounted here and deferred by the same `busy` rule as the hosted conflict, and it also waits
 * for a hosted conflict that is already showing.
 *
 * Every real action is a call into `stores/fileMenu.js` (when to ask), `stores/persistence.js`
 * (the local file) or `stores/hosted.js` (the repository): no persistence logic lives here.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useStatusSurface } from '../../composables/useStatusSurface.js'
import { useExportDialogStore } from '../../stores/exportDialog.js'
import { useFileMenuStore } from '../../stores/fileMenu.js'
import { useHostedStore } from '../../stores/hosted.js'
import { useMergeStore } from '../../stores/merge.js'
import { useOverlaysStore } from '../../stores/overlays.js'
import { usePersistenceStore } from '../../stores/persistence.js'
import { usePlacementStore } from '../../stores/placement.js'
import { useSketchEditorStore } from '../../stores/sketchEditor.js'
import { useTimelineStore } from '../../stores/timeline.js'
import { useTransformPreviewStore } from '../../stores/transformPreview.js'
import HostedDot from '../display/HostedDot.vue'
import ConflictDialog from './ConflictDialog.vue'
import DiskChangeDialog from './DiskChangeDialog.vue'
import ConnectDialog from './ConnectDialog.vue'
import ExportPopover from './ExportPopover.vue'
import ProjectSettingsDialog from './ProjectSettingsDialog.vue'
import ReplaceConfirmDialog from './ReplaceConfirmDialog.vue'
import ResolutionPopover from './ResolutionPopover.vue'
import { useResolutionDialogStore } from '../../stores/resolutionDialog.js'

const menu = useFileMenuStore()
const merge = useMergeStore()
const exportDialog = useExportDialogStore()
const resolutionDialog = useResolutionDialogStore()
const hosted = useHostedStore()
const persistence = usePersistenceStore()
const timeline = useTimelineStore()
const overlays = useOverlaysStore()
const placement = usePlacementStore()
const transformPreview = useTransformPreviewStore()
const sketchEditor = useSketchEditorStore()
const surface = useStatusSurface()

const capabilities = persistence.fileCapabilities

/** @type {import('vue').Ref<HTMLButtonElement | null>} */
const buttonRef = ref(null)
/** @type {import('vue').Ref<HTMLElement | null>} */
const menuRef = ref(null)
const anchor = ref({ top: 60, left: 8, width: 320 })

/**
 * Anchor the popover under the button, clamped inside the viewport. Measured when the menu
 * opens (and on resize while it is open), never per frame: this is layout, not a gesture.
 */
function measure() {
  const button = buttonRef.value
  if (button === null) return
  const box = button.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const width = Math.min(320, viewportWidth - 16)
  const left = Math.max(8, Math.min(box.right - width, viewportWidth - width - 8))
  anchor.value = { top: Math.round(box.bottom + 6), left: Math.round(left), width }
}

const popoverStyle = computed(() => ({
  top: `${anchor.value.top}px`,
  left: `${anchor.value.left}px`,
  width: `${anchor.value.width}px`,
  maxHeight: `calc(100dvh - ${anchor.value.top + 12}px)`,
}))

watch(
  () => menu.menuOpen,
  async (open) => {
    if (open) {
      measure()
      window.addEventListener('resize', measure)
      await nextTick()
      const first = /** @type {HTMLElement | null} */ (menuRef.value?.querySelector('button:not(:disabled)') ?? null)
      first?.focus()
    } else {
      window.removeEventListener('resize', measure)
    }
  },
)

/**
 * §11 rule 5: the conflict dialog is deferred while a drag is in progress or anything else is
 * open. This is the one place that can see all of those, so it tells the hosted store.
 */
const busy = computed(
  () =>
    menu.anyOpen ||
    overlays.anyOpen ||
    placement.isDragging ||
    transformPreview.bodyId !== '' ||
    sketchEditor.active,
)
watch(busy, (value) => hosted.setUiBusy(value), { immediate: true })
// One dialog at a time: the disk-change question also waits for a hosted conflict on screen.
watch(
  () => busy.value || hosted.conflictOpen,
  (value) => persistence.setUiBusy(value),
  { immediate: true },
)

function reloadFromDisk() {
  menu.closeMenu()
  persistence.showDiskPrompt()
}

/** `Opening…` / `Restoring…` — the short form of `persistence.loading` the button can fit. */
const pendingLabel = computed(() => (persistence.loading === '' ? '' : `${persistence.loading.split(' ')[0]}…`))

const buttonLabel = computed(() => {
  if (persistence.loading) return `File menu — ${persistence.loading}`
  if (!hosted.connected) return 'File menu'
  return `File menu — ${hosted.repoLabel}: ${hosted.statusText}`
})

/** @param {KeyboardEvent} event */
function onKeydown(event) {
  if (event.key === 'Escape') {
    if (menu.dismissTopmost()) event.preventDefault()
    return
  }
  if (!(event.ctrlKey || event.metaKey) || event.repeat) return
  // Ctrl/Cmd+Alt+N → New (`TODO/ui-054`). Plain Ctrl/Cmd+N is the browser's own "new window" and
  // cannot be intercepted reliably. Matched on `code`: Alt+N types `˜` on a Mac, so `key` lies.
  if (event.altKey) {
    if (event.code === 'KeyN' && !event.shiftKey) {
      event.preventDefault()
      if (menu.confirm === null && !menu.connectOpen && !hosted.conflictOpen) menu.requestNew()
    }
    return
  }
  const key = event.key.toLowerCase()
  if (key === 's' && !event.shiftKey) {
    // Works from inside a field too: the browser's own "Save Page" is never what was meant.
    event.preventDefault()
    menu.saveLocal()
  } else if (key === 'o' && !event.shiftKey) {
    event.preventDefault()
    // A dialog already asking the question is not asked twice.
    if (menu.confirm === null && !menu.connectOpen && !hosted.conflictOpen && !persistence.diskPromptOpen) menu.requestOpen()
  }
}

/**
 * Arrow-key roving over the menu's buttons — a small courtesy for keyboard users; the rows
 * themselves are ordinary buttons, so Tab and Enter already work.
 *
 * @param {KeyboardEvent} event
 */
function onMenuKeydown(event) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const items = Array.from(menuRef.value?.querySelectorAll('button:not(:disabled)') ?? [])
  if (items.length === 0) return
  event.preventDefault()
  const current = items.indexOf(/** @type {any} */ (document.activeElement))
  let next = current
  if (event.key === 'ArrowDown') next = (current + 1) % items.length
  else if (event.key === 'ArrowUp') next = (current - 1 + items.length) % items.length
  else if (event.key === 'Home') next = 0
  else next = items.length - 1
  const target = /** @type {HTMLElement} */ (items[next])
  target.focus()
}

function dismissMessages() {
  persistence.dismissError()
  hosted.dismissError()
}

function toggleAutoPush() {
  menu.closeMenu()
  void hosted.setAutoPush(!hosted.autoPushEnabled)
}

function saveToRemote() {
  menu.closeMenu()
  void hosted.saveToRemote()
}

function disconnect() {
  menu.closeMenu()
  void hosted.disconnect()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', measure)
})
</script>

<template>
  <div class="file-menu-root" data-testid="file-menu-root">
    <button
      ref="buttonRef"
      type="button"
      class="file-button"
      data-testid="file-menu-button"
      aria-haspopup="menu"
      :aria-expanded="menu.menuOpen"
      :aria-label="buttonLabel"
      :aria-busy="persistence.loading ? 'true' : undefined"
      :title="hosted.connected || persistence.loading ? buttonLabel : 'File menu'"
      @click="menu.toggleMenu()"
    >
      <span class="file-button__label">File</span>
      <span v-if="persistence.loading" class="file-button__pending" data-testid="file-open-pending">
        <span class="file-button__spinner" aria-hidden="true" />
        <span class="file-button__pending-text">{{ pendingLabel }}</span>
      </span>
      <span v-else class="file-button__caret" aria-hidden="true">▾</span>
      <HostedDot :state="hosted.dotState" />
    </button>

    <!-- Teleported to <body>, like the Operations popovers: this header cluster is a normal
         flex row, but a fixed-position popover inside any ancestor with a transform, filter or
         backdrop-filter resolves against that ancestor instead of the page. -->
    <Teleport to="body">
      <template v-if="menu.menuOpen">
        <div class="file-menu__backdrop" data-testid="file-menu-backdrop" @click="menu.closeMenu()" />
        <div
          ref="menuRef"
          class="file-menu"
          role="menu"
          aria-label="File"
          data-testid="file-menu"
          :style="popoverStyle"
          @keydown="onMenuKeydown"
        >
          <p
            class="file-menu__status"
            :data-tone="surface.tone.value"
            role="status"
            data-testid="file-menu-status"
          >
            {{ surface.text.value }}
          </p>
          <!-- A persistent error stays until the next success *or until dismissed*
               (`interaction-model-qa.md`, "The one status surface"). A refused Open… is a
               one-shot event, not an ongoing condition, and without this it would sit in
               the chip — and outrank a later hosted success — for the whole session. -->
          <button
            v-if="surface.tone.value === 'error'"
            type="button"
            role="menuitem"
            class="file-menu__item file-menu__item--dismiss"
            data-testid="file-menu-status-dismiss"
            @click="dismissMessages()"
          >
            Dismiss this message
          </button>
          <p v-if="timeline.previewing" class="file-menu__note" data-testid="file-menu-preview-note">
            You are previewing a past step. Save writes the current project, not the preview.
          </p>

          <div role="group" aria-label="This device">
            <button
              type="button"
              role="menuitem"
              class="file-menu__item"
              data-testid="file-new"
              :disabled="persistence.loading !== ''"
              @click="menu.requestNew()"
            >
              New
            </button>
            <button
              type="button"
              role="menuitem"
              class="file-menu__item"
              data-testid="file-save"
              @click="menu.saveLocal()"
            >
              {{ capabilities.saveLabel }}
            </button>
            <button
              v-if="capabilities.saveAsLabel"
              type="button"
              role="menuitem"
              class="file-menu__item"
              data-testid="file-save-as"
              @click="menu.saveLocal({ saveAs: true })"
            >
              {{ capabilities.saveAsLabel }}
            </button>
            <button
              type="button"
              role="menuitem"
              class="file-menu__item"
              data-testid="file-open"
              :disabled="persistence.loading !== ''"
              @click="menu.requestOpen()"
            >
              {{ capabilities.openLabel }}
            </button>
            <button
              type="button"
              role="menuitem"
              class="file-menu__item file-menu__item--stacked"
              data-testid="file-merge"
              :disabled="persistence.loading !== ''"
              :aria-disabled="merge.unavailableReason !== '' ? 'true' : undefined"
              :aria-describedby="merge.unavailableReason !== '' ? 'file-merge-reason' : undefined"
              :title="merge.unavailableReason !== '' ? merge.unavailableReason : 'Merge the changes from another copy of this project'"
              @click="menu.requestMerge()"
            >
              <span>Merge file…</span>
              <span
                v-if="merge.unavailableReason !== ''"
                id="file-merge-reason"
                class="file-menu__reason"
                data-testid="file-merge-reason"
              >
                {{ merge.unavailableReason }}
              </span>
            </button>
            <button
              v-if="persistence.diskChanged"
              type="button"
              role="menuitem"
              class="file-menu__item"
              data-testid="file-disk-reload"
              :disabled="persistence.loading !== ''"
              @click="reloadFromDisk()"
            >
              Reload {{ persistence.diskChangeName }} from disk…
            </button>
            <button
              type="button"
              role="menuitem"
              class="file-menu__item file-menu__item--stacked"
              data-testid="file-export"
              :aria-disabled="exportDialog.unavailableReason !== '' ? 'true' : undefined"
              :aria-describedby="exportDialog.unavailableReason !== '' ? 'file-export-reason' : undefined"
              :title="exportDialog.unavailableReason !== '' ? exportDialog.unavailableReason : undefined"
              @click="menu.requestExport()"
            >
              <span>Export…</span>
              <span
                v-if="exportDialog.unavailableReason !== ''"
                id="file-export-reason"
                class="file-menu__reason"
                data-testid="file-export-reason"
              >
                {{ exportDialog.unavailableReason }}
              </span>
            </button>
          </div>

          <!-- TODO/core-035: a property of the design itself, not of where it is stored, so it
               is its own group rather than a row of "This device" (whose last item stays
               Export…, ui-034's contract). -->
          <div class="file-menu__divider" role="separator">
            <span>Design</span>
          </div>
          <div role="group" aria-label="Design">
            <button
              type="button"
              role="menuitem"
              class="file-menu__item"
              data-testid="file-resolution"
              @click="menu.requestResolution()"
            >
              {{ resolutionDialog.menuLabel }}…
            </button>
            <button
              type="button"
              role="menuitem"
              class="file-menu__item"
              data-testid="project-settings"
              @click="menu.requestProjectSettings()"
            >
              Project settings…
            </button>
          </div>

          <div class="file-menu__divider" role="separator">
            <span>Hosted storage</span>
          </div>

          <div role="group" aria-label="Hosted storage">
            <button
              v-if="!hosted.connected"
              type="button"
              role="menuitem"
              class="file-menu__item"
              data-testid="hosted-connect"
              @click="menu.openConnect()"
            >
              Connect repository…
            </button>
            <template v-else>
              <button
                type="button"
                role="menuitem"
                class="file-menu__item"
                data-testid="hosted-save"
                @click="saveToRemote()"
              >
                Save to {{ hosted.repoLabel }}
              </button>
              <button
                type="button"
                role="menuitem"
                class="file-menu__item"
                data-testid="hosted-load"
                :disabled="persistence.loading !== ''"
                @click="menu.requestLoad()"
              >
                Load from {{ hosted.repoLabel }}
              </button>
              <button
                type="button"
                role="menuitemcheckbox"
                class="file-menu__item file-menu__item--check"
                data-testid="hosted-autopush"
                :aria-checked="hosted.autoPushEnabled"
                @click="toggleAutoPush()"
              >
                <span class="file-menu__check" aria-hidden="true">{{ hosted.autoPushEnabled ? '✓' : '' }}</span>
                <span>{{ hosted.autoPushLabel }}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                class="file-menu__item"
                data-testid="hosted-replace-token"
                @click="menu.openConnect()"
              >
                Replace token…
              </button>
              <button
                type="button"
                role="menuitem"
                class="file-menu__item file-menu__item--danger"
                data-testid="hosted-disconnect"
                @click="disconnect()"
              >
                Disconnect
              </button>
            </template>
          </div>
        </div>
      </template>
    </Teleport>

    <ExportPopover :anchor="buttonRef" />
    <ResolutionPopover :anchor="buttonRef" />
    <ProjectSettingsDialog />
    <ReplaceConfirmDialog />
    <ConnectDialog />
    <ConflictDialog />
    <DiskChangeDialog />
  </div>
</template>

<style scoped>
.file-menu-root {
  position: relative;
  display: flex;
}

.file-button {
  position: relative;
  min-width: var(--tap);
  height: var(--tap);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-2);
  font-family: inherit;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  touch-action: manipulation;
}

.file-button:hover,
.file-button[aria-expanded='true'] {
  border-color: var(--accent);
  color: var(--accent);
}

.file-button__caret {
  font-size: 11px;
}

/* TODO/core-032: an Open in progress. */
.file-button__pending {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--accent);
  font-size: 12px;
}

/* A transform animation runs on the compositor, so it keeps turning while the fold holds the
   main thread — which is exactly when it is showing. */
.file-button__spinner {
  width: 10px;
  height: 10px;
  box-sizing: border-box;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: file-button-spin 0.8s linear infinite;
}

@keyframes file-button-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .file-button__spinner {
    animation: none;
  }
}

/* The click-catcher: transparent, so the scene stays legible under the menu, and above the
   Library (20) and Inspector (11) sheets so nothing under it is reachable while it is open. */
.file-menu__backdrop {
  position: fixed;
  inset: 0;
  background: transparent;
  z-index: 30;
}

.file-menu {
  position: fixed;
  box-sizing: border-box;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: var(--shadow-overlay);
  z-index: 31;
}

.file-menu__status {
  margin: 0;
  padding: 8px 10px 6px;
  font-size: 12px;
  line-height: 1.35;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.file-menu__status[data-tone='error'] {
  color: var(--danger);
}

.file-menu__status[data-tone='warn'] {
  color: var(--warn);
}

.file-menu__note {
  margin: 0 4px 4px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--warn) 14%, var(--surface-1));
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-1);
}

.file-menu__item {
  width: 100%;
  min-height: var(--tap);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-1);
  font-family: inherit;
  font-size: 14px;
  text-align: left;
  overflow-wrap: anywhere;
  cursor: pointer;
  touch-action: manipulation;
}

.file-menu__item:hover:not(:disabled):not([aria-disabled='true']),
.file-menu__item:focus-visible {
  background: var(--surface-2);
  outline: none;
}

.file-menu__item:disabled {
  opacity: 0.45;
  cursor: default;
}

/* A dimmed-but-focusable item: only the label is dimmed. Its reason is the whole point of the
   row, so it stays at full contrast rather than being dimmed along with what it explains. */
.file-menu__item[aria-disabled='true'] {
  cursor: default;
}

.file-menu__item[aria-disabled='true'] > span:first-child {
  opacity: 0.5;
}

/* A label with a reason printed under it (Export…, when dimmed). Padding rather than a fixed
   height keeps the 44px minimum from the base rule while letting a wrapped reason grow. */
.file-menu__item--stacked {
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
  padding-top: 6px;
  padding-bottom: 6px;
}

.file-menu__reason {
  font-size: 12px;
  line-height: 1.3;
  color: var(--text-2);
}

.file-menu__item--danger {
  color: var(--danger);
}

.file-menu__item--dismiss {
  color: var(--text-2);
  font-size: 13px;
}

.file-menu__check {
  flex: none;
  width: 14px;
  color: var(--accent-secondary);
  font-weight: 700;
}

.file-menu__divider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 4px 2px;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}

.file-menu__divider::before,
.file-menu__divider::after {
  content: '';
  height: 1px;
  flex: 1;
  background: var(--border);
}

.file-menu__divider::before {
  flex: 0 0 8px;
}

@media (max-width: 640px) {
  .file-button {
    padding: 0 8px;
  }

  /* The header is tight at phone width: the spinner stays, the word moves to the label. */
  .file-button__pending-text {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
}
</style>
