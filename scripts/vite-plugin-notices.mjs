// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Emits `THIRD-PARTY-NOTICES.txt` at the root of the build (`TODO/build-011`) and serves the same
// text from the dev server, so the Help footer link works under `vite dev`, `vite build` and at
// either base path. The text comes from `third-party-notices.mjs`.

import { collectProductionPackages, packagesMissingLicenseText, renderNotices } from './third-party-notices.mjs'

/** File name, at the app's base path. */
export const NOTICES_FILE = 'THIRD-PARTY-NOTICES.txt'

/** @returns {import('vite').Plugin} */
export function warpcadNotices() {
  /** @type {string | null} */
  let cached = null
  const text = () => {
    if (cached === null) cached = renderNotices(collectProductionPackages('.'))
    return cached
  }

  return {
    name: 'warpcad-notices',

    generateBundle() {
      const missing = packagesMissingLicenseText(collectProductionPackages('.'))
      if (missing.length > 0) this.warn(`No licence file ships with: ${missing.join(', ')} (the SPDX id is listed instead)`)
      this.emitFile({ type: 'asset', fileName: NOTICES_FILE, source: text() })
    },

    configureServer(server) {
      const path = `${server.config.base.replace(/\/$/, '')}/${NOTICES_FILE}`
      server.middlewares.use((req, res, next) => {
        if ((req.url ?? '').split('?')[0] !== path) return next()
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(text())
      })
    },
  }
}
