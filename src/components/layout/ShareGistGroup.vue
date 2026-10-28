<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Share sheet's **Short link with GitHub** group (`TODO/io-017`, Stage 2), under the long-link
 * controls. It binds to `useGistPublish()` and the gist store; every call to GitHub is the answer
 * to a tap here — nothing is uploaded on its own.
 *
 * - **Not connected**: **Connect GitHub for short links** (`share-gist-connect`), which opens
 *   `GistConnectDialog.vue` over the sheet.
 * - **Connected, not published from this account**: **Make it public** (`share-gist-public`,
 *   unticked; GitHub cannot change it later) and **Publish to a gist** (`share-gist-publish`),
 *   full width in the thumb zone. The short link goes on the clipboard: the write is started
 *   *inside the tap* with the link to follow (a `ClipboardItem` holding a promise), because Safari
 *   refuses a clipboard write that comes after two network calls. Where that is not possible and
 *   the copy is refused, the link is shown selected and **Copy gist link** copies it in a new tap.
 * - **Published**: the status (`share-gist-status`, *Published · 14:05*), **Copy gist link**
 *   (`share-gist-copy`), **Update gist** (`share-gist-update`), **Open on GitHub**
 *   (`share-gist-page`) and **Stop sharing** (`share-gist-stop`), which asks first: the link stops
 *   working and cached copies may remain.
 * - **The disclosure** (`share-gist-disclosure`) is always visible: a secret gist is not private.
 * - **While GitHub is being talked to** every action is disabled and the reason is on screen
 *   (`share-gist-busy`). Failures are `gistMessages.js`'s fixed sentences (`share-gist-error`).
 * - **`tooBig`**: the long link cannot carry this project, so the gist's button is the sheet's
 *   primary action — the way to share it.
 *
 * Feedback that outlives the sheet is a toast, emitted to `ShareSheet.vue` (`toast`).
 */
import { computed, nextTick, ref } from 'vue'

import { useGistPublish } from '../../composables/useGistPublish.js'
import { useFileMenuStore } from '../../stores/fileMenu.js'
import { useGistStore } from '../../stores/gist.js'

const props = defineProps({
  /** The long link is over its ceiling: the gist is the way to share this project. */
  tooBig: { type: Boolean, default: false },
  /** The Share sheet's Name: the gist's title, file name and README heading (`TODO/io-020`). */
  name: { type: String, default: '' },
})
const emit = defineEmits(['toast'])

const SECRET_DISCLOSURE =
  'A secret gist is not private: anyone with the link can read it, including this project\'s notes and instructions. Publishing sends the whole project to GitHub.'
const PUBLIC_DISCLOSURE =
  'Anyone can find this. A public gist is listed on GitHub for anyone to read, including this project\'s notes and instructions. Publishing sends the whole project to GitHub.'

const gist = useGistStore()
const menu = useFileMenuStore()
const publisher = useGistPublish()

/** **Make it public**, before the first publish only. */
const makePublic = ref(false)
/**
 * **Include prompts in the README** (`TODO/io-022`), on by default. Unticked, the README leaves the
 * prompts out; the project file keeps them either way.
 */
const includePrompts = ref(true)
const confirmingStop = ref(false)
/** The last action's fixed-wording failure, for this opening of the sheet. */
const errorText = ref('')
/** The short link, shown selected when the clipboard refused it. */
const manualLink = ref('')
const manualField = ref(/** @type {HTMLInputElement | null} */ (null))

const field = computed(() => publisher.gistField.value)
const published = computed(() => publisher.published.value)
const busy = computed(() => publisher.busy.value)
const isPublic = computed(() => (published.value ? field.value?.public === true : makePublic.value))
const disclosure = computed(() => (isPublic.value ? PUBLIC_DISCLOSURE : SECRET_DISCLOSURE))
const promptNote = computed(() => {
  const count = publisher.promptCount.value
  const noun = count === 1 ? 'prompt' : 'prompts'
  return includePrompts.value
    ? `${count} ${noun} will be in the README. The project file has them either way.`
    : 'Left out of the README. The project file still has them.'
})

const busyText = computed(() => {
  if (gist.publishState === 'publishing') return 'Publishing to GitHub…'
  if (gist.publishState === 'updating') return 'Updating the gist…'
  if (gist.publishState === 'stopping') return 'Stopping sharing…'
  return ''
})

/** Local `HH:MM`, 24 h — the save chip's format. @param {number} epochMs */
function clock(epochMs) {
  const date = new Date(epochMs)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const statusText = computed(() => {
  const kind = field.value?.public === true ? 'public' : 'secret'
  return gist.lastPublishedAt === null ? `Published · ${kind}` : `Published · ${kind} · ${clock(gist.lastPublishedAt)}`
})

/** The project carries a gist this account did not publish (a file someone sent). */
const otherOwner = computed(() => field.value !== null && gist.connected && !published.value)
/** The project is published, but no account is connected here to manage it. */
const unconnectedOwner = computed(() => field.value !== null && !gist.connected)

function openConnect() {
  menu.openGistConnect()
}

/**
 * Start a clipboard write *now*, inside the tap, for text that arrives later. Resolves whether it
 * landed. `null` from `text` means there is nothing to copy (the publish failed).
 *
 * @param {Promise<string | null>} text
 * @returns {Promise<boolean>}
 */
function copyWhenReady(text) {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
  try {
    if (typeof ClipboardItem === 'function' && typeof clipboard?.write === 'function') {
      const blob = text.then((value) => {
        if (value === null) throw new Error('nothing to copy')
        return new Blob([value], { type: 'text/plain' })
      })
      return clipboard.write([new ClipboardItem({ 'text/plain': blob })]).then(
        () => true,
        () => false,
      )
    }
  } catch {
    /* fall through to the plain write */
  }
  return text.then(async (value) => {
    if (value === null || typeof clipboard?.writeText !== 'function') return false
    try {
      await clipboard.writeText(value)
      return true
    } catch {
      return false
    }
  })
}

/** @param {string} link */
async function showManual(link) {
  manualLink.value = link
  await nextTick()
  manualField.value?.select()
}

async function publish() {
  if (!publisher.canPublish.value) return
  errorText.value = ''
  manualLink.value = ''
  /** @type {(value: string | null) => void} */
  let deliver = () => {}
  const copied = copyWhenReady(new Promise((resolve) => (deliver = resolve)))
  const result = await publisher.publish({ public: makePublic.value, name: props.name, prompts: includePrompts.value })
  deliver(result.ok ? result.link : null)
  if (!result.ok) {
    void copied.catch(() => {})
    errorText.value = result.message
    return
  }
  const landed = await copied
  if (result.warning === 'project-changed') {
    emit('toast', 'Published, but another project is open now, so it is not marked as published here')
    return
  }
  const readme = result.warning === 'readme' ? '. Its GitHub page is finished on the next update' : ''
  if (landed) {
    emit('toast', `Published. Link copied${readme}`)
  } else {
    emit('toast', `Published${readme}`)
    await showManual(result.link)
  }
}

async function update() {
  if (!publisher.canUpdate.value) return
  errorText.value = ''
  const result = await publisher.update({ name: props.name, prompts: includePrompts.value })
  if (!result.ok) {
    errorText.value = result.message
    return
  }
  emit('toast', result.warning === 'project-changed' ? 'Gist updated, but another project is open now' : 'Gist updated')
}

async function copyLink() {
  const link = publisher.link()
  if (link === null) return
  errorText.value = ''
  manualLink.value = ''
  if (await copyWhenReady(Promise.resolve(link))) emit('toast', 'Gist link copied')
  else await showManual(link)
}

async function stop() {
  confirmingStop.value = false
  errorText.value = ''
  manualLink.value = ''
  const result = await publisher.stop()
  if (!result.ok) {
    errorText.value = result.message
    return
  }
  makePublic.value = false
  emit('toast', result.alreadyGone ? 'Stopped sharing. The gist was already gone from GitHub' : 'Stopped sharing. The link no longer works')
}
</script>

<template>
  <section class="share-gist" data-testid="share-gist-group" :data-state="published ? 'published' : gist.connected ? 'connected' : 'off'" aria-labelledby="share-gist-heading">
    <h3 id="share-gist-heading" class="share-gist__heading">Short link with GitHub</h3>

    <template v-if="!gist.connected">
      <p v-if="unconnectedOwner" class="share-gist__note" data-testid="share-gist-unconnected">
        This project is published as a gist. Connect GitHub to update it or stop sharing it.
      </p>
      <p v-else class="share-gist__note">
        Publish the project to a GitHub gist for a short link that works at any size.
      </p>
      <button
        type="button"
        class="share-gist__button"
        :class="{ 'share-gist__button--primary': props.tooBig }"
        data-testid="share-gist-connect"
        @click="openConnect()"
      >
        Connect GitHub for short links
      </button>
    </template>

    <template v-else-if="!published">
      <p v-if="otherOwner" class="share-gist__note" data-testid="share-gist-other-owner">
        This project was published from another GitHub account. Publishing makes a new gist of your own.
      </p>
      <label class="share-gist__check">
        <input v-model="makePublic" type="checkbox" data-testid="share-gist-public" :disabled="busy" />
        <span>Make it public</span>
      </label>
      <button
        type="button"
        class="share-gist__button share-gist__button--wide"
        :class="{ 'share-gist__button--primary': props.tooBig }"
        data-testid="share-gist-publish"
        :disabled="!publisher.canPublish.value"
        @click="publish()"
      >
        {{ gist.publishState === 'publishing' ? 'Publishing…' : 'Publish to a gist' }}
      </button>
    </template>

    <template v-else>
      <p class="share-gist__status" data-testid="share-gist-status">{{ statusText }}</p>
      <button
        type="button"
        class="share-gist__button share-gist__button--wide"
        :class="{ 'share-gist__button--primary': props.tooBig }"
        data-testid="share-gist-copy"
        :disabled="busy"
        @click="copyLink()"
      >
        Copy gist link
      </button>
      <div class="share-gist__row">
        <button type="button" class="share-gist__button" data-testid="share-gist-update" :disabled="!publisher.canUpdate.value" @click="update()">
          {{ gist.publishState === 'updating' ? 'Updating…' : 'Update gist' }}
        </button>
        <a
          class="share-gist__button share-gist__button--link"
          :href="publisher.pageUrl.value ?? undefined"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="share-gist-page"
        >Open on GitHub</a>
      </div>

      <div v-if="confirmingStop" class="share-gist__confirm" role="alertdialog" aria-labelledby="share-gist-stop-question" data-testid="share-gist-stop-confirm">
        <p id="share-gist-stop-question" class="share-gist__confirm-text">
          Stop sharing? The gist is deleted and the link stops working. Copies people already opened or saved,
          and GitHub's caches for a few minutes, may remain.
        </p>
        <div class="share-gist__row">
          <button type="button" class="share-gist__button" data-testid="share-gist-stop-cancel" @click="confirmingStop = false">
            Keep sharing
          </button>
          <button type="button" class="share-gist__button share-gist__button--danger" data-testid="share-gist-stop-yes" :disabled="busy" @click="stop()">
            Stop sharing
          </button>
        </div>
      </div>
      <button
        v-else
        type="button"
        class="share-gist__text-button share-gist__text-button--danger"
        data-testid="share-gist-stop"
        :disabled="busy"
        @click="confirmingStop = true"
      >
        Stop sharing
      </button>
    </template>

    <template v-if="gist.connected && publisher.promptCount.value > 0">
      <label class="share-gist__check">
        <input v-model="includePrompts" type="checkbox" data-testid="share-gist-prompts" :disabled="busy" />
        <span>Include prompts in the README</span>
      </label>
      <p class="share-gist__note" data-testid="share-gist-prompts-note">{{ promptNote }}</p>
    </template>

    <p v-if="busyText" class="share-gist__busy" role="status" data-testid="share-gist-busy">{{ busyText }}</p>
    <p v-if="errorText" class="share-gist__error" role="alert" data-testid="share-gist-error">{{ errorText }}</p>
    <input
      v-if="manualLink"
      ref="manualField"
      class="share-gist__manual"
      type="text"
      readonly
      aria-label="The gist link"
      data-testid="share-gist-link-text"
      :value="manualLink"
    />

    <p class="share-gist__disclosure" data-testid="share-gist-disclosure">{{ disclosure }}</p>

    <button
      v-if="gist.connected"
      type="button"
      class="share-gist__text-button"
      data-testid="share-gist-manage"
      @click="openConnect()"
    >
      GitHub account: {{ gist.login }}
    </button>
  </section>
</template>

<style scoped>
.share-gist {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.share-gist__heading {
  margin: 0;
  font-size: 13px;
  font-weight: 650;
  color: var(--text-1);
}

.share-gist__note,
.share-gist__status,
.share-gist__busy,
.share-gist__error,
.share-gist__disclosure,
.share-gist__confirm-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.share-gist__status {
  align-self: flex-start;
  padding: 3px 10px;
  border: 1px solid var(--accent-secondary);
  border-radius: 999px;
  color: var(--text-1);
  font-size: 12px;
}

.share-gist__busy {
  color: var(--text-1);
}

.share-gist__error {
  color: var(--danger);
}

.share-gist__disclosure {
  font-size: 12px;
}

.share-gist__check {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: var(--tap);
  font-size: 14px;
  color: var(--text-1);
  cursor: pointer;
}

.share-gist__check input {
  width: 20px;
  height: 20px;
  margin: 0;
  accent-color: var(--accent);
}

.share-gist__row {
  display: flex;
  gap: 8px;
}

.share-gist__button {
  box-sizing: border-box;
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: 15px;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
  touch-action: manipulation;
}

.share-gist__button--wide {
  width: 100%;
  flex: none;
}

.share-gist__button:disabled {
  opacity: 0.5;
  cursor: default;
}

.share-gist__button--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}

.share-gist__button--danger {
  border-color: var(--danger);
  color: var(--danger);
}

/* Secondary: a text link's weight, a full 44px target. */
.share-gist__text-button {
  align-self: flex-start;
  min-height: var(--tap);
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-family: inherit;
  font-size: 14px;
  text-decoration: underline;
  text-underline-offset: 3px;
  overflow-wrap: anywhere;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}

.share-gist__text-button--danger {
  color: var(--danger);
}

.share-gist__text-button:disabled {
  opacity: 0.5;
  cursor: default;
}

.share-gist__confirm {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--danger);
  border-radius: var(--radius-md);
  background: var(--surface-0);
}

.share-gist__confirm-text {
  color: var(--text-1);
}

.share-gist__manual {
  box-sizing: border-box;
  width: 100%;
  min-height: var(--tap);
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-family: var(--font-mono);
  /* 16px: iOS Safari zooms the page on focus of anything smaller. */
  font-size: 16px;
}
</style>
