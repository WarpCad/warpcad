<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The header's **Share** button and the **Share sheet** it opens (`TODO/io-016`): send the whole
 * project as a link (`src/core/shareLink.js`) in two taps.
 *
 * - **Trigger** `share-open`, in the header's document bar to the left of **File ▾** (and **File ▾ →
 *   Share…**, `share.requestSheet()`, the route on the dev host's phone header, which the dev-only
 *   Live MCP entry fills). Selection does not matter: the whole project is shared. With nothing in
 *   the scene it is dimmed (`aria-disabled`), with the reason beside it at laptop width; below
 *   1100px, where the header has no room for words, it is an icon and a tap opens the sheet with
 *   only the reason in it.
 * - **The sheet**: a bottom sheet at phone width (44px targets, a 16px field so iOS does not zoom),
 *   a popover under the button from 641px. In it:
 *   - the **name** being shared (`share-name`), editable — the recipient's title. It defaults to
 *     the project's name and falls back to `Untitled`, never to an empty string; a typed name is
 *     kept for the next opening until another project is loaded;
 *   - **Send…** (`share-send`), only where the browser has `navigator.share` (iOS Safari, Android
 *     Chrome, the native app): the OS share sheet with a written message and the link. Cancelling
 *     it is not an error and shows nothing;
 *   - **Copy link** (`share-copy`), always: the same message and link on the clipboard, then a
 *     *Link copied, 2.3 KB* toast. If the clipboard refuses, the text is shown selected instead;
 *   - **Send the file** (`share-file`), a secondary link: what **Download copy** does, by name;
 *   - the disclosure line, always visible.
 * - **Over the ceiling** ({@link SHARE_LINK_MAX_CHARS}) the sheet says the project is too big to
 *   send as a link and points at the gist group (its button becomes the primary action) and
 *   **Send the file** — never a silent failure, never a link that a mail client will cut short.
 *
 * The link's host is `SHARE_HOST`, never `location.origin` (`docs/decisions/share-link.md`).
 *
 * ## Short link with GitHub (`TODO/io-017`)
 *
 * Under the long-link controls, `ShareGistGroup.vue`: connect a gist token, publish, update, copy
 * the short link, stop sharing. Over the ceiling the sheet points at it as the way to share. A
 * **Published** chip beside the button (`share-gist-chip`) says the open project is published from
 * this account, with the last publish time this session; below 1100px, where the header has no
 * room for words, it is a dot on the button with the same words for assistive tech. The gist
 * store's `start()` (a stored-credential read, no network) runs when this mounts.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'

import BaseSheet from './BaseSheet.vue'
import DescriptionHint from './DescriptionHint.vue'
import ShareGistGroup from './ShareGistGroup.vue'
import { useGistPublish } from '../../composables/useGistPublish.js'
import { parseNdjson } from '../../core/ndjson.js'
import { serializeProject } from '../../core/project.js'
import { shareFileName } from '../../core/shareCopy.js'
import { DEFAULT_SHARE_NAME, encodeShareLink } from '../../core/shareLink.js'
import { saveBytes } from '../../storage/download.js'
import { useDocumentStore } from '../../stores/document.js'
import { useFileMenuStore } from '../../stores/fileMenu.js'
import { useGistStore } from '../../stores/gist.js'
import { useOverlaysStore } from '../../stores/overlays.js'
import { usePersistenceStore } from '../../stores/persistence.js'
import { useShareStore } from '../../stores/share.js'
import { useToastsStore } from '../../stores/toasts.js'
import BaseButton from '../controls/BaseButton.vue'

/**
 * The longest link the sheet will offer, in URL characters (`docs/decisions/share-link.md`,
 * "The ceiling" — the filing's estimate until it is measured on a real iPhone and in Gmail).
 */
const SHARE_LINK_MAX_CHARS = 6000
/** What the sheet calls an empty scene. */
const EMPTY_REASON = 'Nothing to share yet'

const documentStore = useDocumentStore()
const persistence = usePersistenceStore()
const overlays = useOverlaysStore()
const share = useShareStore()
const menu = useFileMenuStore()
const gist = useGistStore()
const gistPublish = useGistPublish()
const toasts = useToastsStore()

/** The header chip's words: *Published*, and the time when this session published. */
const chipText = computed(() => {
  if (gist.lastPublishedAt === null) return 'Published'
  const date = new Date(gist.lastPublishedAt)
  return `Published · ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
})

const open = ref(false)
/** The title being shared (`share-name`). */
const name = ref(DEFAULT_SHARE_NAME)
/** The link for the current name, or `''` while it is being built. */
const link = ref('')
/** Inline result of Send… / Copy link that is not a success (the clipboard refused, …). */
const problem = ref('')
/** Shown selected when the clipboard refused, so the text can still be copied by hand. */
const manualText = ref('')
/** Which link build is current; a newer name supersedes an older build. */
let build = 0
/** The name typed here, kept for the next opening while the same project stays loaded. */
let typedName = ''
/** The `loadRevision` {@link typedName} was typed under; a new project forgets it. */
let typedFor = -1

const buttonRef = ref(/** @type {HTMLButtonElement | null} */ (null))
const nameInput = ref(/** @type {HTMLInputElement | null} */ (null))
const manualField = ref(/** @type {HTMLTextAreaElement | null} */ (null))
/** The popover's position under the button from 641px (the phone sheet ignores it). */
const anchor = ref({ top: 56, right: 8 })

/** At least one body: the sheet's precondition. */
const empty = computed(() => documentStore.bodies.length === 0)
const tooBig = computed(() => link.value.length > SHARE_LINK_MAX_CHARS)
const shareName = computed(() => (name.value.trim() === '' ? DEFAULT_SHARE_NAME : name.value))
const message = computed(() => `Here's a model I made in WarpCad: ${shareName.value}`)
/** What Send… hands over and Copy link copies: the message, then the link on its own line. */
const shareText = computed(() => `${message.value}\n${link.value}`)
/** The link's size as the toast and the sheet word it ("2.3 KB"). */
const sizeText = computed(() => `${(link.value.length / 1000).toFixed(1)} KB`)

/** Whether this browser can hand a link to the OS share sheet. */
const canSend = computed(() => {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false
  if (typeof navigator.canShare !== 'function') return true
  try {
    return navigator.canShare({ url: 'https://app.warpcad.com/' })
  } catch {
    return false
  }
})

/** The project as records, at the moment the sheet opens. */
function projectRecords() {
  return parseNdjson(serializeProject(toRaw(documentStore.raw))).records
}

/** @type {object[]} */
let records = []

async function rebuildLink() {
  const token = ++build
  link.value = ''
  const url = await encodeShareLink(records, { name: shareName.value })
  if (token === build) link.value = url
}

function placePopover() {
  const rect = buttonRef.value?.getBoundingClientRect()
  if (!rect) return
  anchor.value = { top: Math.round(rect.bottom + 6), right: Math.max(8, Math.round(window.innerWidth - rect.right)) }
}

async function openSheet() {
  problem.value = ''
  manualText.value = ''
  placePopover()
  open.value = true
  if (empty.value) return
  const fallback = persistence.projectName.trim() === '' ? DEFAULT_SHARE_NAME : persistence.projectName
  name.value = typedFor === documentStore.loadRevision && typedName.trim() !== '' ? typedName : fallback
  records = projectRecords()
  void rebuildLink()
  await nextTick()
  nameInput.value?.focus()
}

function closeSheet() {
  open.value = false
  build += 1
}

function toggleSheet() {
  if (open.value) closeSheet()
  else void openSheet()
}

/** The field never ends up empty: a cleared name reads `Untitled` again on blur. */
function onNameBlur() {
  if (name.value.trim() === '') name.value = DEFAULT_SHARE_NAME
}

watch(name, (next) => {
  if (!open.value || empty.value) return
  typedName = next
  typedFor = documentStore.loadRevision
  void rebuildLink()
})

/** @param {string} text */
function showToast(text) {
  toasts.show({ key: 'share', testid: 'share-toast', text })
}

/** **Send…** — must run inside the tap: `navigator.share` needs the user's activation. */
async function send() {
  if (!link.value || tooBig.value) return
  problem.value = ''
  try {
    await navigator.share({ title: shareName.value, text: message.value, url: link.value })
    closeSheet()
  } catch (error) {
    // The person closed the OS sheet: not an error, and nothing to say.
    if (error instanceof Error && error.name === 'AbortError') return
    problem.value = "Couldn't open this device's share sheet. Use Copy link instead."
  }
}

/** **Copy link** — the message and the link, then the size toast. */
async function copy() {
  if (!link.value || tooBig.value) return
  problem.value = ''
  manualText.value = ''
  const text = shareText.value
  const size = sizeText.value
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard) throw new Error('no clipboard')
    await navigator.clipboard.writeText(text)
  } catch {
    problem.value = "Couldn't copy automatically. Select the text below and copy it."
    manualText.value = text
    await nextTick()
    manualField.value?.select()
    return
  }
  closeSheet()
  showToast(`Link copied, ${size}`)
}

/**
 * **Send the file** — the project file, downloaded, as File ▾ → Download copy does; in the native
 * app written to `Documents/Exports/` instead (`TODO/io-014`).
 */
async function sendFile() {
  const result = await saveBytes(serializeProject(toRaw(documentStore.raw)), shareFileName(shareName.value), 'application/x-ndjson')
  if (!result.ok) {
    problem.value = `Couldn't save the file: ${result.error}`
    return
  }
  closeSheet()
  const words = result.native ? `Saved to ${result.place}` : `Download started: ${result.name}`
  persistence.announce(words)
  showToast(words)
}

// File ▾ → Share… asks for the sheet through the store.
watch(
  () => share.sheetRequests,
  () => {
    if (!open.value) void openSheet()
  },
)

// The gist token dialog opens over the sheet; its Escape is the File menu's, not the sheet's, so
// the sheet leaves the overlay stack (`:stack` on the BaseSheet) while that dialog is open.
// `TODO/io-017`: which GitHub account is connected, for the gist group and the chip (no network).
onMounted(() => void gist.start().catch(() => {}))
watch(open, (isOpen) => overlays.setOpen('share-sheet', isOpen))
onBeforeUnmount(() => {
  overlays.setOpen('share-sheet', false)
})
</script>

<template>
  <div class="share-root">
    <button
      ref="buttonRef"
      type="button"
      class="share-button"
      data-testid="share-open"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-disabled="empty ? 'true' : undefined"
      :aria-describedby="empty ? 'share-open-reason' : undefined"
      :title="empty ? EMPTY_REASON : 'Share this project as a link'"
      @click="toggleSheet()"
    >
      <svg class="share-button__icon" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 2.5v10M6 6l4-3.5L14 6M4.5 10v6.5h11V10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="share-button__label">Share</span>
    </button>
    <span v-if="empty" id="share-open-reason" class="share-reason" data-testid="share-reason">{{ EMPTY_REASON }}</span>
    <span
      v-else-if="gistPublish.published.value"
      class="share-chip"
      data-testid="share-gist-chip"
      :title="`${chipText} as a GitHub gist`"
    >
      <span class="share-chip__dot" aria-hidden="true" />
      <span class="share-chip__label">{{ chipText }}</span>
    </span>

    <BaseSheet
      :open="open"
      modal
      scrim="clear"
      card
      width="360px"
      :top="`${anchor.top}px`"
      :right="`${anchor.right}px`"
      :stack="!menu.gistConnectOpen"
      class="share-sheet"
      testid="share-sheet"
      backdrop-testid="share-backdrop"
      title="Share"
      help-topic="share"
      @backdrop="closeSheet()"
      @escape="closeSheet()"
    >
      <p v-if="empty" class="share-sheet__empty" data-testid="share-empty">
        {{ EMPTY_REASON }}. Place a shape first, then tap Share.
      </p>

      <template v-else>
        <label class="share-sheet__field">
          Name
          <input
            ref="nameInput"
            v-model="name"
            class="share-sheet__input"
            type="text"
            autocomplete="off"
            autocapitalize="sentences"
            maxlength="200"
            data-testid="share-name"
            @blur="onNameBlur()"
          />
        </label>

        <p v-if="tooBig" class="share-sheet__too-big" role="alert" data-testid="share-too-big">
          This project is too big to send as a link ({{ sizeText }}). Publish it as a gist below for a short
          link, or send the file.
        </p>
        <div v-else class="share-sheet__actions">
          <BaseButton
            v-if="canSend"
            variant="primary"
            size="large"
            fill
            data-testid="share-send"
            :disabled="!link"
            @click="send()"
          >
            Send…
          </BaseButton>
          <BaseButton
            :variant="canSend ? 'default' : 'primary'"
            size="large"
            fill
            data-testid="share-copy"
            :disabled="!link"
            @click="copy()"
          >
            Copy link
          </BaseButton>
        </div>

        <!-- TODO/ui-091: what the recipient will see first; Edit… / Add… open Project settings. -->
        <DescriptionHint @edit="closeSheet()" />

        <p v-if="problem" class="share-sheet__problem" role="alert" data-testid="share-problem">{{ problem }}</p>
        <textarea
          v-if="manualText"
          ref="manualField"
          class="share-sheet__manual"
          readonly
          rows="3"
          data-testid="share-link-text"
          :value="manualText"
        />

        <BaseButton
          variant="link"
          class="share-sheet__file"
          data-testid="share-file"
          @click="sendFile()"
        >
          Send the file
        </BaseButton>

        <p class="share-sheet__disclosure" data-testid="share-disclosure">
          Anyone with this link can open and copy this project, including its notes. It can't be taken back.
        </p>

        <ShareGistGroup :too-big="tooBig" :name="shareName" @toast="showToast" />
      </template>
    </BaseSheet>
  </div>
</template>

<style scoped>
.share-root {
  display: flex;
  align-items: center;
  gap: 6px;
}

.share-button {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: var(--tap);
  height: var(--tap);
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

.share-button:hover:not([aria-disabled='true']),
.share-button[aria-expanded='true'] {
  border-color: var(--accent);
  color: var(--accent);
}

.share-button[aria-disabled='true'] {
  opacity: 0.5;
  cursor: default;
}

.share-button__icon {
  width: 16px;
  height: 16px;
}

.share-reason {
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
}

/* `TODO/io-017`: published as a gist from this account. */
.share-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border: 1px solid var(--accent-secondary);
  border-radius: 999px;
  font-size: 12px;
  color: var(--text-2);
  white-space: nowrap;
}

.share-chip__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent-secondary);
}

/* The frame is `BaseSheet`; its spacing stays this sheet's own (10px rhythm, 16px sides) so the
   layout, and the pictures of it, did not move. */
body :global(.sheet.share-sheet) {
  gap: 10px;
  padding-inline: 16px;
}

body :global(.sheet.share-sheet .sheet__title) {
  font-size: 15px;
  font-weight: 650;
}

.share-sheet__empty {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  color: var(--text-2);
}

.share-sheet__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-2);
}

.share-sheet__input {
  box-sizing: border-box;
  min-height: var(--tap);
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-family: inherit;
  /* 16px: iOS Safari zooms the page on focus of anything smaller. */
  font-size: 16px;
}

.share-sheet__actions {
  display: flex;
  gap: 8px;
}

.share-sheet__file {
  align-self: flex-start;
}

.share-sheet__too-big,
.share-sheet__problem {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--warn);
  overflow-wrap: anywhere;
}

.share-sheet__problem {
  color: var(--danger);
}

.share-sheet__manual {
  box-sizing: border-box;
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-family: var(--font-mono);
  font-size: 12px;
  resize: none;
}

.share-sheet__disclosure {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-2);
}

@media (max-width: 1099px) {
  /* Below laptop width the header has no room for words (measured at the 820px tablet: the label
     and the reason pushed the Assistant button 141px off the row). The icon is the 44px target; a
     tap on the dimmed button opens the sheet with the reason. Both stay in the accessibility tree. */
  .share-button {
    padding: 0;
  }

  /* The chip becomes its dot, tucked against the button's corner; the words stay for assistive tech. */
  .share-root {
    position: relative;
  }

  .share-chip {
    position: absolute;
    top: 3px;
    right: 3px;
    padding: 0;
    border: 0;
    pointer-events: none;
  }

  .share-button__label,
  .share-chip__label,
  .share-reason {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
}
</style>
