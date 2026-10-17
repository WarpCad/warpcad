// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Build-time Google Analytics wiring (`TODO/build-007`, `docs/decisions/analytics.md`), kept out of
 * `vite.config.js` so it is unit-testable in plain Node. The measurement ID is public (it ends up
 * in every visitor's page) but still comes only from build configuration, never from source.
 *
 * @module scripts/analytics-build
 */

/** A GA4 web-stream measurement ID: `G-` and 4-20 capitals or digits. Anything else is ignored. */
const ID_PATTERN = /^G-[A-Z0-9]{4,20}$/

/**
 * The Google hosts a GA4 page view needs, per directive, found by reading the real `gtag.js`
 * (2026-10-17): it is a script from `www.googletagmanager.com`; hits go to
 * `https://{www|regionN}.google-analytics.com/g/collect` (the region label is chosen at run time,
 * hence one wildcard label) and `https://{regionN.}analytics.google.com/g/s/collect`; the image
 * beacon fallback uses the first. Ads hosts (`doubleclick.net`, `google.com`) are only for Google
 * signals and ad features, which the app turns off, so they are deliberately absent.
 */
export const GA_SOURCES = Object.freeze({
  script: Object.freeze(['https://www.googletagmanager.com']),
  connect: Object.freeze(['https://*.google-analytics.com', 'https://*.analytics.google.com']),
  img: Object.freeze(['https://*.google-analytics.com']),
})

/**
 * The measurement ID this build was given: `GA_MEASUREMENT_ID` (the Actions variable's name), else
 * `VITE_GA_MEASUREMENT_ID`.
 *
 * @param {Record<string, string | undefined>} env `process.env`
 * @returns {string} A well-formed GA4 ID, or `''` (unset, blank or malformed: analytics is off).
 */
export function measurementId(env) {
  const raw = env.GA_MEASUREMENT_ID || env.VITE_GA_MEASUREMENT_ID || ''
  const id = typeof raw === 'string' ? raw.trim() : ''
  return ID_PATTERN.test(id) ? id : ''
}

/**
 * Appends hosts to one directive of the policy string in `index.html`.
 *
 * @param {string} html
 * @param {string} directive e.g. `script-src`
 * @param {readonly string[]} hosts
 * @returns {string}
 */
function extend(html, directive, hosts) {
  // Anchored to the policy string (`content="…; <directive> …;`), not to the comment that names it.
  const match = new RegExp(`(?:content="|;\\s*)(${directive} [^;"]*)`).exec(html)
  if (match === null) throw new Error(`index.html has no ${directive} directive to extend`)
  return html.replace(match[1], `${match[1]} ${hosts.join(' ')}`)
}

/**
 * Adds the Google Analytics hosts to the production policy. Without an ID the page is returned
 * untouched, so a build that is not configured for analytics allows nothing extra.
 *
 * @param {string} html
 * @param {string} id From {@link measurementId}; `''` leaves the page untouched.
 * @returns {string}
 */
export function addAnalyticsSources(html, id) {
  if (id === '') return html
  let out = extend(html, 'script-src', GA_SOURCES.script)
  out = extend(out, 'connect-src', GA_SOURCES.connect)
  return extend(out, 'img-src', GA_SOURCES.img)
}
