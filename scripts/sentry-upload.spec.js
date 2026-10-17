// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Guards for `TODO/build-009`: the Sentry build plugin (and the FSL-licensed `sentry@0.45.0` it pulls)
 * stays out of the toolchain, and the Pages workflow uploads the source maps with `curl` under the
 * same release name the app reports at runtime.
 */
const read = (/** @type {string} */ path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const workflow = read('.github/workflows/pages.yml')

describe('no Sentry build plugin', () => {
  it('package.json does not depend on @sentry/vite-plugin', () => {
    expect(read('package.json')).not.toContain('@sentry/vite-plugin')
  })

  it('the lockfile has neither the plugin, its bundler core, nor the FSL `sentry` package', () => {
    const lock = read('package-lock.json')
    expect(lock).not.toContain('@sentry/vite-plugin')
    expect(lock).not.toContain('@sentry/bundler-plugins')
    expect(lock).not.toMatch(/"node_modules\/sentry"/)
    expect(lock).not.toContain('FSL-1.1')
  })

  it('vite.config.js does not import it', () => {
    expect(read('vite.config.js')).not.toContain('sentryVitePlugin')
  })
})

describe('Pages workflow source-map upload', () => {
  it('uploads maps with curl to the releases files API, failing on an HTTP error', () => {
    expect(workflow).toMatch(/curl[\s\S]*--fail/)
    expect(workflow).toContain('/api/0/organizations/$SENTRY_ORG/releases')
    expect(workflow).toContain('$api/$SENTRY_RELEASE/files/')
    expect(workflow).toContain('Authorization: Bearer $SENTRY_AUTH_TOKEN')
  })

  it('is gated on the DSN, like the build', () => {
    expect(workflow).toMatch(/if: \$\{\{ vars\.SENTRY_DSN != '' \}\}/)
  })

  it('uses the same release name as the runtime SDK', () => {
    const release = /VITE_SENTRY_RELEASE: (.+)/.exec(workflow)?.[1]
    expect(release).toBeTruthy()
    expect(workflow).toContain(`SENTRY_RELEASE: ${release}`)
    expect(workflow).toContain('$api/$SENTRY_RELEASE/files/')
  })

  it('removes every .map from dist/ before the Pages artifact is uploaded', () => {
    const del = workflow.indexOf("find dist -name '*.map' -delete")
    const upload = workflow.indexOf('actions/upload-pages-artifact')
    expect(del).toBeGreaterThan(-1)
    expect(del).toBeLessThan(upload)
  })
})
