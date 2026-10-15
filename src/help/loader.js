// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Fetches the bundled help (`TODO/ui-061`): `help/index.json` and `help/<page>.html`, which
 * `scripts/vite-plugin-help.mjs` renders from `docs/` at build time (and serves on request under
 * `npm run dev`). Same origin and precached by the service worker, so it works offline.
 *
 * The fragment is trusted markup produced by our own build from our own docs; it is the only
 * thing in the app rendered with `v-html`, and the page's CSP forbids inline script anyway.
 *
 * The network is a boundary (CLAUDE.md "mock at the boundary"): tests replace it with
 * {@link setHelpFetch}.
 *
 * @module help/loader
 */

/**
 * @typedef {{ id: string, text: string }} IndexHeading
 * @typedef {{ slug: string, title: string, headings: IndexHeading[] }} IndexPage
 * @typedef {{ order: string[], pages: IndexPage[] }} HelpIndex
 */

/** @type {(url: string) => Promise<{ ok: boolean, status?: number, text: () => Promise<string> }>} */
let fetchImpl = (url) => globalThis.fetch(url)

/** @type {Map<string, Promise<string>>} */
const pageCache = new Map()
/** @type {Promise<HelpIndex> | null} */
let indexCache = null

/**
 * Replace the fetch boundary (tests); pass nothing to restore the real one.
 *
 * @param {typeof fetchImpl} [fn]
 */
export function setHelpFetch(fn) {
  fetchImpl = fn ?? ((url) => globalThis.fetch(url))
}

/** Forget everything loaded (tests, and a Retry after a failed load). */
export function resetHelpCache() {
  pageCache.clear()
  indexCache = null
}

/**
 * The URL of something under `help/`, honouring the app's base path.
 *
 * @param {string} path e.g. `index.json`, `booleans.html`, `img/screenshots/a.png`
 * @returns {string}
 */
export function helpUrl(path) {
  const base = import.meta.env?.BASE_URL ?? '/'
  return `${base.endsWith('/') ? base : `${base}/`}help/${path}`
}

/**
 * The table of contents: page titles in reading order and each page's `##` headings.
 *
 * @returns {Promise<HelpIndex>}
 */
export function loadHelpIndex() {
  if (indexCache === null) {
    const pending = fetchImpl(helpUrl('index.json')).then(async (response) => {
      if (!response.ok) throw new Error(`help index: HTTP ${response.status ?? '?'}`)
      return /** @type {HelpIndex} */ (JSON.parse(await response.text()))
    })
    pending.catch(() => {
      if (indexCache === pending) indexCache = null
    })
    indexCache = pending
  }
  return indexCache
}

/**
 * One page's HTML, with its pictures pointed at the bundled folder.
 *
 * @param {string} slug page slug (`booleans`)
 * @returns {Promise<string>}
 */
export function loadHelpPage(slug) {
  let pending = pageCache.get(slug)
  if (pending === undefined) {
    const request = fetchImpl(helpUrl(`${encodeURIComponent(slug)}.html`)).then(async (response) => {
      if (!response.ok) throw new Error(`help page ${slug}: HTTP ${response.status ?? '?'}`)
      const html = await response.text()
      return html.replace(/(<img[^>]*?\ssrc=")img\//g, `$1${helpUrl('img/')}`)
    })
    request.catch(() => {
      if (pageCache.get(slug) === request) pageCache.delete(slug)
    })
    pageCache.set(slug, request)
    pending = request
  }
  return pending
}
