// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Vite plugin for the in-app help (`TODO/ui-061`). At build time it renders `docs/*.md` to
// `help/<page>.html` fragments plus `help/index.json`, and copies the pictures the pages use to
// `help/img/…`, all same-origin and so reachable by the service worker. A dead image, page or
// anchor link fails the build, in the spirit of `e2e/docs-media.spec.js`.
//
// Under `vite dev` the same files are rendered on request, so the Help sheet works in
// development and in the e2e specs without a build.
//
// **Not bundled, on purpose:** `docs/decisions/` and `docs/montage/` (see `EXCLUDED_DIRS` in
// `help-build.mjs`) — developer material, not end-user documentation.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

import { buildHelp, helpIndex } from './help-build.mjs'

const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
})

/**
 * The service worker's globs for the help folder: the text and the still pictures are
 * precached (they are what makes Help work offline, immediately after install); the GIFs — about
 * 60 MB between them, four fifths of everything — are runtime-cached the first time they are
 * seen (see `helpRuntimeCaching`). Spread into `workbox.globPatterns`.
 */
export const HELP_PRECACHE_GLOBS = Object.freeze(['help/**/*.{json,png,jpg,jpeg}'])

/**
 * Workbox `runtimeCaching` entry for the help GIFs. A function, not a frozen constant: Workbox's
 * option validation writes defaults (`method`) onto the object it is given.
 */
export function helpRuntimeCaching() {
  return {
    urlPattern: /\/help\/img\/.*\.gif$/,
    handler: /** @type {const} */ ('CacheFirst'),
    options: { cacheName: 'help-media', expiration: { maxEntries: 100 } },
  }
}

/**
 * @param {{ docsDir?: string }} [options]
 * @returns {import('vite').Plugin}
 */
export function warpcadHelp({ docsDir = 'docs' } = {}) {
  const root = resolve(docsDir)

  /** @type {{ stamp: number, build: import('./help-build.mjs').HelpBuild } | null} */
  let cache = null

  /** Newest mtime across the pages and pictures, so a dev edit shows on the next request. */
  function stampOf() {
    let newest = 0
    /** @param {string} dir */
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        const s = statSync(full)
        if (s.isDirectory()) {
          if (name !== 'decisions' && name !== 'montage') walk(full)
        } else newest = Math.max(newest, s.mtimeMs)
      }
    }
    walk(root)
    return newest
  }

  function current() {
    const stamp = stampOf()
    if (cache === null || cache.stamp !== stamp) cache = { stamp, build: buildHelp({ docsDir: root }) }
    return cache.build
  }

  /**
   * @param {string} name path under `help/`
   * @returns {{ body: string | Buffer, type: string } | null}
   */
  function lookup(name) {
    const help = current()
    if (name === 'index.json') return { body: JSON.stringify(helpIndex(help)), type: CONTENT_TYPES['.json'] }
    const page = /^([\w-]+)\.html$/.exec(name)
    if (page && page[1] in help.pages) return { body: help.pages[page[1]].html, type: CONTENT_TYPES['.html'] }
    const asset = help.assets.find((a) => a.to === name)
    if (asset && existsSync(asset.from)) {
      const type = CONTENT_TYPES[/** @type {keyof typeof CONTENT_TYPES} */ (extname(asset.from).toLowerCase())]
      return { body: readFileSync(asset.from), type: type ?? 'application/octet-stream' }
    }
    return null
  }

  return {
    name: 'warpcad-help',

    buildStart() {
      const help = current()
      for (const warning of help.warnings) this.warn(warning)
      if (help.errors.length > 0) this.error(`The in-app help has dead links:\n  ${help.errors.join('\n  ')}`)
    },

    generateBundle() {
      const help = current()
      for (const page of Object.values(help.pages)) {
        this.emitFile({ type: 'asset', fileName: `help/${page.slug}.html`, source: page.html })
      }
      this.emitFile({ type: 'asset', fileName: 'help/index.json', source: JSON.stringify(helpIndex(help)) })
      for (const asset of help.assets) {
        this.emitFile({ type: 'asset', fileName: `help/${asset.to}`, source: readFileSync(asset.from) })
      }
    },

    configureServer(server) {
      const base = server.config.base.replace(/\/$/, '')
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        const prefix = `${base}/help/`
        if (!url.startsWith(prefix)) return next()
        let name = url.slice(prefix.length)
        try {
          name = decodeURIComponent(name)
        } catch {
          return next()
        }
        const found = lookup(name)
        if (found === null) return next()
        res.setHeader('Content-Type', found.type)
        res.end(found.body)
      })
    },
  }
}
