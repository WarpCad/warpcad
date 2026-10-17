// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Build-time Sentry wiring (`TODO/build-004`, `docs/decisions/error-reporting.md`), kept out of
 * `vite.config.js` so it is unit-testable in plain Node. Nothing here reads a secret into a
 * file or into the client bundle: the auth token is only tested for presence.
 *
 * @module scripts/sentry-build
 */

/**
 * The exact https origin Sentry's SDK will post to, from a DSN
 * (`https://<key>@o<n>.ingest.<region>.sentry.io/<project>`). Used for the production
 * `connect-src`, so the policy names one host instead of a region wildcard.
 *
 * @param {string | null | undefined} dsn
 * @returns {string | null} `https://<host>`, or null for empty, malformed, non-https or wildcard input.
 */
export function connectHostFromDsn(dsn) {
  if (typeof dsn !== 'string' || dsn.trim() === '') return null
  let url
  try {
    url = new URL(dsn.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (url.hostname === '' || /[*\s]/.test(url.hostname) || !url.hostname.includes('.')) return null
  return `https://${url.hostname}`
}

/**
 * Appends one host to the `connect-src` directive of the policy in `index.html`.
 *
 * @param {string} html
 * @param {string | null} host From {@link connectHostFromDsn}; null leaves the page untouched.
 * @returns {string}
 */
export function addConnectSrc(html, host) {
  if (host === null) return html
  // Anchored to the policy string (`content="…; connect-src …;`), not to the comment that names it.
  const match = /(?:content="|;\s*)(connect-src [^;"]*)/.exec(html)
  if (match === null) throw new Error('index.html has no connect-src directive to extend')
  return html.replace(match[1], `${match[1]} ${host}`)
}

/**
 * Source-map option for `vite build`. Without `SENTRY_AUTH_TOKEN` the build is exactly what it was
 * before Sentry: no maps. With it, maps are generated but not referenced from the bundle; the
 * Pages workflow uploads them with `curl` and deletes them (`TODO/build-009`: no Sentry build
 * plugin, so no FSL-licensed `sentry` package in the toolchain).
 *
 * @param {Record<string, string | undefined>} env `process.env`
 * @returns {{ sourcemap: false | 'hidden' }}
 */
export function sentryBuildOptions(env) {
  const authToken = env.SENTRY_AUTH_TOKEN
  if (typeof authToken !== 'string' || authToken === '') return { sourcemap: false }
  return { sourcemap: 'hidden' }
}
