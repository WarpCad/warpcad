<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Stays its own frame (ui-122): routes by hash, runs a Back stack and sits above BaseDialog at z 50/51, which BaseDialog cannot express. -->
<script setup>
/**
 * The in-app Help sheet (`TODO/ui-061`), mounted once in `AppView.vue`.
 *
 * - **Content**: the docs (`src/help/loader.js`), rendered to HTML at build time. On the web they
 *   are bundled, so Help opens offline and matches the running version. The native app reads them
 *   from app.warpcad.com (`TODO/ui-119`): offline it says Help needs a connection, and a line names
 *   both versions when they differ. Every page is sanitised (`src/help/sanitize.js`) before `v-html`.
 * - **Trigger**: a **?** (`HelpButton.vue`) in a tool pop-up's header, **Help** in the File menu,
 *   the header's **?**, or the `?` / F1 keys (`useHelpShortcut`). All of them call `help.open`.
 * - **Feedback**: the page opens scrolled to the tool's heading, which flashes. Contents lists
 *   every page; in-page links stay inside the sheet; **Back** retraces them; **Close**, Escape or a
 *   tap on the backdrop returns to exactly the pop-up that was open.
 * - **Layering**: teleported to `<body>` at z-index 50/51, above `BaseDialog` (40/41), the popover
 *   tier (30/31) and the sheets, so opening it from a pop-up neither closes that pop-up nor loses
 *   the selection under it. Escape is taken in the capture phase so a pop-up under the sheet
 *   does not also close.
 * - **Small screens**: top-anchored and full width at phone width (never bottom-anchored — the
 *   on-screen keyboard), pictures `max-width: 100%`, Contents folded behind a button.
 *
 * It reads and writes only `stores/help.js`: it cannot touch the selection or an active tool.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useFocusTrap } from '../../composables/useFocusTrap.js'
import { useOverlayStack } from '../../composables/useOverlayStack.js'
import { useTheme } from '../../composables/useTheme.js'
import { helpUrl, loadHelpIndex, loadHelpPage, resolveSlug } from '../../help/loader.js'
import { sanitizeHelpHtml } from '../../help/sanitize.js'
import { TOPICS } from '../../help/topics.js'
import { isNativeShell, openExternal, probeShell } from '../../native/shell.js'
import BaseButton from '../controls/BaseButton.vue'
import ExternalLink from '../controls/ExternalLink.vue'
import IconButton from '../controls/IconButton.vue'
import { useAppUpdateStore } from '../../stores/appUpdate.js'
import { useHelpStore } from '../../stores/help.js'
import { THEME_MODES, THEME_STYLES } from '../../stores/settings.js'

const help = useHelpStore()
const update = useAppUpdateStore()
const theme = useTheme()


/**
 * Where this app's source lives. AGPL-3.0 §13: a hosted copy must offer its users the
 * corresponding source, so every Help page ends with this link (`LICENSING.md`). A fork that
 * hosts a modified copy points this at its own repository.
 */
const SOURCE_URL = 'https://github.com/WarpCad/warpcad'
/** The licence notices of the bundled libraries, emitted by `scripts/vite-plugin-notices.mjs`. */
const NOTICES_URL = isNativeShell(probeShell())
  ? 'https://app.warpcad.com/THIRD-PARTY-NOTICES.txt' // the shell opens https pages only, so it points at the hosted copy
  : `${import.meta.env.BASE_URL}THIRD-PARTY-NOTICES.txt`

/** @type {import('vue').Ref<import('../../help/loader.js').HelpIndex | null>} */
const index = ref(null)
const html = ref('')
/** @type {import('vue').Ref<'loading' | 'ready' | 'error' | 'moved'>} */
const state = ref('loading')
/** @type {import('vue').Ref<HTMLElement | null>} */
const content = ref(null)
/** @type {import('vue').Ref<HTMLElement | null>} */
const closeButton = ref(null)

/** The visible words of the three theme segments. */
const THEME_LABELS = { system: 'System', dark: 'Dark', light: 'Light' }

/** The visible words of the style tiles (`src/styles/skins/`). */
const STYLE_LABELS = { kids: 'Kids', glass: 'Glass', deco: 'Art Deco', minimal: 'Minimal', blueprint: 'Blueprint', pixel: 'Pixel' }

/**
 * A picture's dark twin is a `<source class="help-pic-dark">`, keyed to the system scheme in the
 * built page. The reader's chosen theme can disagree with the system, so here the source is
 * switched on the resolved theme's scheme instead (`TODO/ui-113`): `all` under a dark theme, `not all`
 * under a light one.
 */
watch(
  [() => theme.scheme.value, html],
  () => {
    const dark = theme.scheme.value === 'dark'
    content.value?.querySelectorAll('source.help-pic-dark').forEach((el) => el.setAttribute('media', dark ? 'all' : 'not all'))
  },
  { flush: 'post', immediate: true },
)

/**
 * Inside the native shell Help comes from app.warpcad.com (`TODO/ui-119`), so a failed load means
 * no connection rather than an empty cache.
 */
const native = isNativeShell(probeShell())

/**
 * `TODO/ui-119`: the fetched Help can be newer or older than the app (the native app reads it from
 * the web). Names both versions when they differ; `''` when they match or the index names none.
 */
const skewLine = computed(() => {
  const helpVersion = index.value?.version
  if (!helpVersion || helpVersion === update.version) return ''
  return `This help is for WarpCad ${helpVersion}; this app is ${update.version}.`
})

/** Try again after a failed load: the index too, if it never arrived (the loader keeps no failure cached). */
function retry() {
  if (index.value === null) void loadIndex()
  void show()
}

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
  // A link to a page renamed or removed since it was written (`#/help/<slug>` is a public
  // contract, `TODO/testing-012`): say so and open Contents, not the network-error state.
  // If the index itself cannot load, fall through to the page fetch and its own error state.
  const known = await loadHelpIndex().then(
    (loaded) => loaded.pages.some((p) => p.slug === slug),
    () => true,
  )
  if (token !== loadToken) return
  if (!known) {
    html.value = ''
    state.value = 'moved'
    if (!help.contentsOpen) help.toggleContents()
    return
  }
  try {
    const fragment = await loadHelpPage(slug)
    if (token !== loadToken) return
    // The only `v-html` in the app: rebuilt from the allow-list first, on the web and in the native app alike.
    html.value = sanitizeHelpHtml(fragment, { imgBase: helpUrl('img/') })
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

// Escape closes help, and only help, when it is the top overlay (`TODO/ui-110`). It is modal
// (`aria-modal`), so it also traps Tab.
const helpEl = ref(null)
useOverlayStack(() => help.isOpen, () => help.close())
useFocusTrap(helpEl, () => help.isOpen)

/** @param {MouseEvent} event */
function onContentClick(event) {
  const link = event.target instanceof Element ? event.target.closest('a') : null
  if (!link) return
  const page = link.getAttribute('data-help-page')
  if (page === null) {
    // An external link opens in its own tab on the web. The shell has no tabs and must not navigate
    // away, so it hands an https page to the system browser (`TODO/build-029`).
    if (native && link.protocol === 'https:' && link.origin !== window.location.origin) {
      event.preventDefault()
      openExternal(link.href).catch(() => {})
    }
    return
  }
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

async function openFromHash() {
  const match = HASH_RE.exec(window.location.hash)
  if (!match) return
  const [, id] = match
  if (id in TOPICS) return help.open(id)
  // A retired slug opens the page that replaced it (`TODO/docs-028`); the watch below then
  // rewrites the hash to the new slug. An unknown slug falls through to the moved line.
  const index = await loadHelpIndex().catch(() => null)
  help.openPage(index ? (resolveSlug(index, id) ?? id) : id)
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
  clearTimeout(flashTimer)
})
</script>

<template>
  <Teleport to="body">
    <template v-if="help.isOpen">
      <div class="help__backdrop" data-testid="help-backdrop" @click="help.close()" />
      <div ref="helpEl" class="help" role="dialog" aria-modal="true" aria-label="Help" data-testid="help-sheet" :data-page="help.page">
        <header class="help__head">
          <BaseButton
            variant="quiet"
            narrow
            class="help__nav"
            data-testid="help-back"
            :disabled="!help.canGoBack"
            aria-label="Back"
            @click="help.back()"
          >
            ‹ Back
          </BaseButton>
          <h2 class="help__title" data-testid="help-current-page">{{ currentTitle }}</h2>
          <BaseButton
            variant="quiet"
            narrow
            class="help__nav help__contents-toggle"
            data-testid="help-contents-toggle"
            :aria-expanded="help.contentsOpen"
            @click="help.toggleContents()"
          >
            Contents
          </BaseButton>
          <IconButton
            ref="closeButton"
            label="Close help"
            variant="quiet"
            class="help__close"
            data-testid="help-close"
            @click="help.close()"
          >
            ×
          </IconButton>
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
            <p v-else-if="state === 'moved'" class="help__status" role="status" data-testid="help-moved">
              This page has moved or no longer exists. Pick another from Contents.
            </p>
            <div v-else-if="state === 'error' && native" class="help__status" role="alert" data-testid="help-error">
              Help needs a connection. Everything else in WarpCad works offline.
              <BaseButton data-testid="help-retry" @click="retry()">Retry</BaseButton>
            </div>
            <div v-else-if="state === 'error'" class="help__status" role="alert" data-testid="help-error">
              Could not load this page. If you are offline and have not opened Help before, it is not cached
              yet — reconnect once and it will be.
              <BaseButton data-testid="help-retry" @click="retry()">Try again</BaseButton>
            </div>
            <!-- Help HTML from our docs build, fetched (from app.warpcad.com in the native app) and sanitised (`src/help/sanitize.js`). -->
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
              <ExternalLink :href="SOURCE_URL" data-testid="help-source-link">Source code</ExternalLink>
              <ExternalLink :href="NOTICES_URL" data-testid="help-notices-link">Third-party notices</ExternalLink>
            </footer>
            <!-- The theme (`TODO/ui-113`): System follows the device, Dark and Light override it. -->
            <div v-if="state === 'ready'" class="help__theme" role="group" aria-labelledby="help-theme-label" data-testid="help-theme">
              <span id="help-theme-label" class="help__theme-label">Theme</span>
              <button
                v-for="choice in THEME_MODES"
                :key="choice"
                type="button"
                class="help__theme-btn"
                :aria-pressed="theme.preference.value === choice ? 'true' : 'false'"
                :data-testid="`help-theme-${choice}`"
                @click="theme.setPreference(choice)"
              >
                {{ THEME_LABELS[choice] }}
              </button>
            </div>
            <!-- The styles (`src/styles/skins/`): a whole look, fixed to light or dark. Picking one releases the
                 mode above; picking a mode releases the style. Each swatch is drawn by its style's own file. -->
            <div v-if="state === 'ready'" class="help__styles" role="group" aria-labelledby="help-style-label" data-testid="help-style">
              <span id="help-style-label" class="help__theme-label">Style</span>
              <div class="help__styles-grid">
                <button
                  v-for="style in THEME_STYLES"
                  :key="style"
                  type="button"
                  class="help__style-btn"
                  :aria-pressed="theme.preference.value === style ? 'true' : 'false'"
                  :data-testid="`help-theme-${style}`"
                  @click="theme.setPreference(style)"
                >
                  <span class="theme-swatch" :class="`theme-swatch--${style}`" aria-hidden="true">
                    <span class="theme-swatch__panel">Aa<span class="theme-swatch__accent" /></span>
                  </span>
                  <span class="help__style-name">{{ STYLE_LABELS[style] }}</span>
                </button>
              </div>
            </div>
            <!-- The running build, and a manual check for a newer one (TODO/build-005). -->
            <div v-if="state === 'ready'" class="help__version" data-testid="help-version-row">
              <span data-testid="help-version">{{ update.helpVersionLine }}</span>
              <BaseButton
                data-testid="pwa-check-update"
                :disabled="update.checking"
                @click="update.check()"
              >
                {{ update.checking ? 'Checking…' : 'Check for updates' }}
              </BaseButton>
              <span v-if="update.message" class="help__version-message" role="status" data-testid="pwa-check-message">{{ update.message }}</span>
            </div>
            <p v-if="state === 'ready' && skewLine" class="help__version-skew" data-testid="help-version-skew">{{ skewLine }}</p>
          </div>
        </div>
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
.help__version-skew {
  margin: 4px 0 0;
  color: var(--text-2);
  font-size: var(--text-size-md);
}

.help__theme {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 var(--space-4h);
  margin-top: 8px;
  color: var(--text-2);
  font-size: var(--text-size-md);
}

.help__theme-btn {
  flex: 1 1 0;
  min-width: var(--tap);
  min-height: var(--tap);
  max-width: 120px;
  padding: 0 var(--space-4h);
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text-2);
  font-family: inherit;
  font-size: var(--text-size-md);
  cursor: pointer;
  touch-action: manipulation;
}

.help__theme-btn:first-of-type {
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
}

.help__theme-btn:last-of-type {
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.help__theme-btn + .help__theme-btn {
  margin-left: -1px;
}

.help__theme-btn[aria-pressed='true'] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}

.help__theme-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.help__styles {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: 12px;
  color: var(--text-2);
  font-size: var(--text-size-md);
}

.help__styles-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
  max-width: 420px;
}

.help__style-btn {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-2);
  min-height: var(--tap);
  padding: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font-family: inherit;
  font-size: var(--text-size-sm);
  cursor: pointer;
  touch-action: manipulation;
}

.help__style-btn[aria-pressed='true'] {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
  color: var(--text-1);
}

.help__style-btn:focus-visible {
  outline: var(--focus-ring);
  outline-offset: 2px;
}

.help__style-name {
  text-align: center;
}

/* A thumbnail of the style: its ground, one of its panels, a word in its type and a dot of its accent.
   The `--swatch-*` values are set per style in `src/styles/skins/*.css`, so a tile looks like its style
   whichever theme is painted around it. */
.theme-swatch {
  display: grid;
  place-items: center;
  height: 46px;
  overflow: hidden;
  border-radius: var(--radius-xs);
  background: var(--swatch-ground);
}

.theme-swatch__panel {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border: var(--swatch-edge);
  border-radius: var(--swatch-radius);
  background: var(--swatch-panel);
  color: var(--swatch-ink);
  font-family: var(--swatch-font);
  font-size: var(--text-size-lg);
  line-height: 1.2;
  box-shadow: var(--swatch-shadow);
}

.theme-swatch__accent {
  width: 12px;
  height: 12px;
  border-radius: var(--swatch-radius);
  background: var(--swatch-accent);
}

.help__version {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-4h);
  margin-top: 8px;
  color: var(--text-2);
  font-size: var(--text-size-md);
}

.help__backdrop {
  position: fixed;
  inset: 0;
  background: var(--scrim);
  z-index: var(--z-help);
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
  z-index: var(--z-help-frame);
}

.help__head {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3) var(--space-2) var(--space-4h);
  border-bottom: 1px solid var(--border);
}

.help__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: var(--text-size-title);
  font-weight: var(--weight-bold);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Layout only: the header's text buttons keep their side padding and header type size (the Help
   screenshots are taken with it); the look is `BaseButton`'s. */
.help__nav {
  padding: 0 var(--space-4h);
  font-size: var(--text-size-md);
}

.help__close {
  font-size: var(--text-size-display);
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
  padding: var(--space-4);
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
  padding: var(--space-4) var(--space-4);
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-size: var(--text-size-md);
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
  padding: var(--space-2) var(--space-6) var(--space-7);
}

.help__status {
  color: var(--text-2);
  font-size: var(--text-size-lg);
}

.help__contents-toggle {
  display: none;
}

.help__footer {
  margin-top: 24px;
  padding-top: var(--space-4h);
  border-top: 1px solid var(--border);
  color: var(--text-2);
  font-size: var(--text-size-sm);
}

.help__footer a {
  color: var(--accent);
  /* A 44 px tap target; the two links wrap onto two lines at phone width. */
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  margin-right: 14px;
}

.help__footer abbr {
  text-decoration: none;
}

/* Prose. The fragment is plain HTML from the build, so it is styled from here. */
.help__content {
  font-size: var(--text-size-lg);
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.help__content :deep(h1) {
  font-size: var(--text-size-display);
  margin: 12px 0;
}

.help__content :deep(h2) {
  font-size: var(--text-size-xl);
  margin: 24px 0 8px;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  border-left: 3px solid transparent;
  scroll-margin-top: 8px;
}

.help__content :deep(h3),
.help__content :deep(h4) {
  font-size: var(--text-size-lg);
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
  padding-left: var(--space-7);
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
  font-size: var(--text-size-sm);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-xs);
  background: var(--surface-2);
}

.help__content :deep(pre) {
  padding: var(--space-4h);
  overflow-x: auto;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.help__content :deep(pre code) {
  padding: 0;
  background: transparent;
}

.help__content :deep(blockquote) {
  padding: var(--space-1) var(--space-5);
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
  font-size: var(--text-size-md);
}

.help__content :deep(th),
.help__content :deep(td) {
  padding: var(--space-3) var(--space-4);
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
    z-index: calc(var(--z-canvas-overlay) + 2);
    inset: 0 auto 0 0;
    width: min(300px, 86%);
    box-shadow: var(--shadow-overlay);
  }

  .help__contents[data-open='true'] {
    display: block;
  }

  .help__scroll {
    padding: var(--space-2) var(--space-5) var(--space-7);
  }
}
</style>
