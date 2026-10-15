<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The in-app Help sheet (`TODO/ui-061`), mounted once in `AppView.vue`.
 *
 * - **Content**: the bundled docs (`src/help/loader.js`), rendered to HTML at build time, so
 *   it opens offline and always matches the running version of the app.
 * - **Trigger**: a **?** (`HelpButton.vue`) in a tool pop-up's header, **Help** in the File menu,
 *   the header's **?**, or the `?` / F1 keys (`useHelpShortcut`). All of them call `help.open`.
 * - **Feedback**: the page opens scrolled to the tool's heading, which flashes. Contents lists
 *   every page; in-page links stay inside the sheet; **Back** retraces them; **Close**, Escape or a
 *   tap on the backdrop returns to exactly the pop-up that was open.
 * - **Layering**: teleported to `<body>` at z-index 50/51, above `ModalShell` (40/41), the popover
 *   tier (30/31) and the sheets, so opening it from a pop-up neither closes that pop-up nor loses
 *   the selection under it. Escape is taken in the capture phase so a pop-up under the sheet
 *   does not also close.
 * - **Small screens**: top-anchored and full width at phone width (never bottom-anchored — the
 *   on-screen keyboard), pictures `max-width: 100%`, Contents folded behind a button.
 *
 * It reads and writes only `stores/help.js`: it cannot touch the selection or an active tool.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { loadHelpIndex, loadHelpPage } from '../../help/loader.js'
import { TOPICS } from '../../help/topics.js'
import { useHelpStore } from '../../stores/help.js'

const help = useHelpStore()

/**
 * Where this app's source lives. AGPL-3.0 §13: a hosted copy must offer its users the
 * corresponding source, so every Help page ends with this link (`LICENSING.md`). A fork that
 * hosts a modified copy points this at its own repository.
 */
const SOURCE_URL = 'https://github.com/WarpCad/warpcad'

/** @type {import('vue').Ref<import('../../help/loader.js').HelpIndex | null>} */
const index = ref(null)
const html = ref('')
/** @type {import('vue').Ref<'loading' | 'ready' | 'error'>} */
const state = ref('loading')
/** @type {import('vue').Ref<HTMLElement | null>} */
const content = ref(null)
/** @type {import('vue').Ref<HTMLElement | null>} */
const closeButton = ref(null)

const currentTitle = computed(() => {
  const entry = index.value?.pages.find((p) => p.slug === help.page)
  return entry?.title ?? help.page
})

/** @type {HTMLElement | null} */
let returnFocus = null
/** @type {ReturnType<typeof setTimeout> | undefined} */
let flashTimer
let loadToken = 0

async function loadIndex() {
  try {
    index.value = await loadHelpIndex()
  } catch {
    index.value = null
  }
}

/** Load the current page, then scroll to and flash its heading. */
async function show() {
  const token = ++loadToken
  state.value = 'loading'
  const slug = help.page
  try {
    const fragment = await loadHelpPage(slug)
    if (token !== loadToken) return
    html.value = fragment
    state.value = 'ready'
  } catch {
    if (token !== loadToken) return
    html.value = ''
    state.value = 'error'
    return
  }
  await nextTick()
  if (token !== loadToken) return
  const root = content.value
  if (!root) return
  root.querySelectorAll('.help-target').forEach((el) => el.classList.remove('help-target'))
  const target = help.anchor ? root.querySelector(`[id="${CSS.escape(help.anchor)}"]`) : null
  if (target) {
    target.classList.add('help-target')
    target.scrollIntoView({ block: 'start' })
    clearTimeout(flashTimer)
    flashTimer = setTimeout(() => target.classList.remove('help-target--flash'), 1800)
    target.classList.add('help-target--flash')
  } else {
    root.scrollTop = 0
  }
}

watch(
  () => help.isOpen,
  async (open) => {
    if (open) {
      returnFocus = /** @type {HTMLElement | null} */ (document.activeElement)
      void loadIndex()
      await nextTick()
      closeButton.value?.focus({ preventScroll: true })
    } else {
      loadToken++
      const target = returnFocus
      returnFocus = null
      if (target && target.isConnected) target.focus({ preventScroll: true })
    }
  },
  { immediate: true },
)

watch(
  () => [help.isOpen, help.page, help.nonce],
  () => {
    if (help.isOpen && help.page !== '') void show()
  },
  { flush: 'post' },
)

/**
 * Escape closes help, and only help. Registered during `setup`, not `onMounted`: every other
 * window-level Escape handler (the Operations toolbar's, the Save and Split sheets', a user-part
 * dialog's) registers in a mount hook, which runs after every `setup`, and same-phase listeners
 * run in registration order — so this one is guaranteed to see the key first and swallow it.
 *
 * @param {KeyboardEvent} event
 */
function onKeydown(event) {
  if (event.key !== 'Escape' || !help.isOpen) return
  event.preventDefault()
  event.stopImmediatePropagation()
  help.close()
}
if (typeof window !== 'undefined') window.addEventListener('keydown', onKeydown, true)

/** @param {MouseEvent} event */
function onContentClick(event) {
  const link = /** @type {HTMLElement | null} */ (event.target instanceof Element ? event.target.closest('a') : null)
  if (!link) return
  const page = link.getAttribute('data-help-page')
  if (page === null) return // an external link opens in its own tab
  event.preventDefault()
  help.openPage(page, link.getAttribute('data-help-anchor') ?? undefined)
}

/** @param {string} slug */
function openFromContents(slug) {
  help.openPage(slug)
}

// The hash mirror (`TODO/ui-061` item 7): `#/help/<topic or page>` while the sheet is open, so a
// help view can be shared. It never touches a hash it does not own (`#/gist/<id>` keeps priority).
const HASH_RE = /^#\/help\/([\w-]+)$/

function ownsHash() {
  return window.location.hash === '' || window.location.hash.startsWith('#/help/')
}

function openFromHash() {
  const match = HASH_RE.exec(window.location.hash)
  if (!match) return
  const [, id] = match
  if (id in TOPICS) help.open(id)
  else help.openPage(id)
}

watch(
  () => [help.isOpen, help.topic, help.page],
  () => {
    if (typeof window === 'undefined' || !ownsHash()) return
    if (help.isOpen) {
      const wanted = `#/help/${help.topic !== '' ? help.topic : help.page}`
      if (window.location.hash !== wanted) window.history.replaceState(null, '', wanted)
    } else if (window.location.hash.startsWith('#/help/')) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    }
  },
)

onMounted(() => {
  window.addEventListener('hashchange', openFromHash)
  openFromHash()
})
onBeforeUnmount(() => {
  window.removeEventListener('hashchange', openFromHash)
  window.removeEventListener('keydown', onKeydown, true)
  clearTimeout(flashTimer)
})
</script>

<template>
  <Teleport to="body">
    <template v-if="help.isOpen">
      <div class="help__backdrop" data-testid="help-backdrop" @click="help.close()" />
      <div class="help" role="dialog" aria-modal="true" aria-label="Help" data-testid="help-sheet" :data-page="help.page">
        <header class="help__head">
          <button
            type="button"
            class="help__btn"
            data-testid="help-back"
            :disabled="!help.canGoBack"
            aria-label="Back"
            @click="help.back()"
          >
            ‹ Back
          </button>
          <h2 class="help__title" data-testid="help-current-page">{{ currentTitle }}</h2>
          <button
            type="button"
            class="help__btn help__contents-toggle"
            data-testid="help-contents-toggle"
            :aria-expanded="help.contentsOpen"
            @click="help.toggleContents()"
          >
            Contents
          </button>
          <button
            ref="closeButton"
            type="button"
            class="help__btn help__close"
            data-testid="help-close"
            aria-label="Close help"
            @click="help.close()"
          >
            ×
          </button>
        </header>
        <div class="help__body">
          <nav
            class="help__contents"
            :data-open="help.contentsOpen ? 'true' : 'false'"
            aria-label="Help contents"
            data-testid="help-contents"
          >
            <ul v-if="index">
              <li v-for="entry in index.pages" :key="entry.slug">
                <a
                  :href="`#/help/${entry.slug}`"
                  :data-help-page="entry.slug"
                  :data-testid="`help-contents-${entry.slug}`"
                  :aria-current="entry.slug === help.page ? 'page' : undefined"
                  @click.prevent="openFromContents(entry.slug)"
                  >{{ entry.title }}</a
                >
              </li>
            </ul>
          </nav>
          <div class="help__scroll" ref="content" data-testid="help-scroll">
            <p v-if="state === 'loading'" class="help__status" role="status" data-testid="help-loading">Loading…</p>
            <div v-else-if="state === 'error'" class="help__status" role="alert" data-testid="help-error">
              Could not load this page. If you are offline and have not opened Help before, it is not cached
              yet — reconnect once and it will be.
              <button type="button" class="help__btn" data-testid="help-retry" @click="show()">Try again</button>
            </div>
            <!-- Build-time HTML from this repository's own docs (see `src/help/loader.js`). -->
            <article
              v-show="state === 'ready'"
              class="help__content"
              data-testid="help-content"
              @click="onContentClick"
              v-html="html"
            />
            <footer v-if="state === 'ready'" class="help__footer" data-testid="help-source">
              WarpCad is free software under the
              <abbr title="GNU Affero General Public License, version 3 or later">AGPL-3.0</abbr>.
              <a :href="SOURCE_URL" target="_blank" rel="noopener" data-testid="help-source-link">Source code</a>
            </footer>
          </div>
        </div>
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
.help__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 50;
}

.help {
  position: fixed;
  top: 56px;
  left: 50%;
  transform: translateX(-50%);
  box-sizing: border-box;
  width: min(880px, calc(100vw - 16px));
  height: calc(100dvh - 72px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  color: var(--text-1);
  box-shadow: var(--shadow-overlay);
  z-index: 51;
}

.help__head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px 4px 10px;
  border-bottom: 1px solid var(--border);
}

.help__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.help__btn {
  min-width: var(--tap);
  min-height: var(--tap);
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  touch-action: manipulation;
}

.help__btn:hover:not(:disabled),
.help__btn:focus-visible {
  color: var(--accent);
  border-color: var(--border-strong);
}

.help__btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.help__close {
  font-size: 22px;
  line-height: 1;
}

.help__body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
}

.help__contents {
  flex: none;
  width: 230px;
  overflow-y: auto;
  padding: 8px;
  border-right: 1px solid var(--border);
  background: var(--surface-0);
}

.help__contents ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.help__contents a {
  display: block;
  padding: 8px 8px;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.3;
  text-decoration: none;
}

.help__contents a:hover,
.help__contents a[aria-current='page'] {
  background: var(--surface-2);
  color: var(--text-1);
}

.help__scroll {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 4px 16px 24px;
}

.help__status {
  color: var(--text-2);
  font-size: 14px;
}

.help__contents-toggle {
  display: none;
}

.help__footer {
  margin-top: 24px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  color: var(--text-2);
  font-size: 12.5px;
}

.help__footer a {
  color: var(--accent);
}

.help__footer abbr {
  text-decoration: none;
}

/* Prose. The fragment is plain HTML from the build, so it is styled from here. */
.help__content {
  font-size: 14px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.help__content :deep(h1) {
  font-size: 20px;
  margin: 12px 0;
}

.help__content :deep(h2) {
  font-size: 16px;
  margin: 24px 0 8px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  border-left: 3px solid transparent;
  scroll-margin-top: 8px;
}

.help__content :deep(h3),
.help__content :deep(h4) {
  font-size: 14px;
  margin: 16px 0 6px;
}

.help__content :deep(p),
.help__content :deep(ul),
.help__content :deep(ol),
.help__content :deep(blockquote),
.help__content :deep(pre) {
  margin: 0 0 10px;
}

.help__content :deep(ul),
.help__content :deep(ol) {
  padding-left: 22px;
}

.help__content :deep(a) {
  color: var(--accent);
}

.help__content :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 8px 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.help__content :deep(code) {
  font-family: var(--font-mono);
  font-size: 12.5px;
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--surface-2);
}

.help__content :deep(pre) {
  padding: 10px;
  overflow-x: auto;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.help__content :deep(pre code) {
  padding: 0;
  background: transparent;
}

.help__content :deep(blockquote) {
  padding: 2px 12px;
  border-left: 3px solid var(--border-strong);
  color: var(--text-2);
}

.help__content :deep(.help-table) {
  max-width: 100%;
  overflow-x: auto;
  margin: 0 0 10px;
}

.help__content :deep(table) {
  border-collapse: collapse;
  font-size: 13px;
}

.help__content :deep(th),
.help__content :deep(td) {
  padding: 5px 8px;
  border: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}

/* The heading the tool's ? pointed at: marked while the sheet is open, brighter at first. */
.help__content :deep(.help-target) {
  border-left-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.help__content :deep(.help-target--flash) {
  animation: help-flash 1.8s ease-out;
}

@keyframes help-flash {
  0% {
    background: color-mix(in srgb, var(--accent) 55%, transparent);
  }
}

@media (prefers-reduced-motion: reduce) {
  .help__content :deep(.help-target--flash) {
    animation: none;
  }
}

/* Phone first: top-anchored and full width (not bottom-anchored: the keyboard), with Contents
   folded behind a button. */
@media (max-width: 640px) {
  .help {
    top: 8px;
    left: 8px;
    right: 8px;
    transform: none;
    width: auto;
    height: calc(100dvh - 16px);
  }

  .help__contents-toggle {
    display: inline-block;
  }

  .help__contents {
    display: none;
    position: absolute;
    z-index: 2;
    inset: 0 auto 0 0;
    width: min(300px, 86%);
    box-shadow: var(--shadow-overlay);
  }

  .help__contents[data-open='true'] {
    display: block;
  }

  .help__scroll {
    padding: 4px 12px 24px;
  }
}
</style>
