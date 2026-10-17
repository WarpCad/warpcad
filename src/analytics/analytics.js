// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The one place Google Analytics 4 is touched (`TODO/build-007`, `docs/decisions/analytics.md`).
 *
 * Page views only. The measurement ID is baked in by `vite.config.js` from build configuration
 * (`__GA_MEASUREMENT_ID__`, `''` unless the build was given one); with none, nothing here runs and
 * the page makes no request. It is also inert in a development build, on localhost or any non-https
 * page (preview servers), in an automated browser, and when the visitor sends Do Not Track or Global
 * Privacy Control.
 *
 * The privacy rules live here, not at a call site: what is sent is the origin and path only. The
 * URL hash (`#/gist/<id>`, `#/help/…`), the query, document content, project names and the AI key
 * are never given to `gtag`.
 *
 * @module analytics/analytics
 */

/** Where Google serves `gtag.js`; the build allows exactly this host in `script-src`. */
export const GTAG_SRC = 'https://www.googletagmanager.com/gtag/js'

const ID_PATTERN = /^G-[A-Z0-9]{4,20}$/

/**
 * @param {string} hostname
 * @returns {boolean} Whether the host is this machine, not a visitor.
 */
function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost')
}

/**
 * Starts page-view measurement. Sends one `page_view` and nothing else.
 *
 * @param {object} [options]
 * @param {string} [options.id] A GA4 measurement ID; defaults to the build-time define.
 * @param {boolean} [options.prod] Whether this is a production build; injected in tests.
 * @param {any} [options.win] `window`; injected in tests.
 * @param {any} [options.doc] `document`; injected in tests.
 * @returns {boolean} Whether measurement was started (or scheduled for the load event).
 */
export function initAnalytics({
  id = typeof __GA_MEASUREMENT_ID__ === 'string' ? __GA_MEASUREMENT_ID__ : '',
  prod = import.meta.env.PROD,
  win = globalThis.window,
  doc = globalThis.document,
} = {}) {
  const measurementId = typeof id === 'string' ? id.trim() : ''
  if (!ID_PATTERN.test(measurementId) || !prod || !win || !doc) return false
  const { protocol, hostname, origin, pathname } = win.location
  if (protocol !== 'https:' || isLocalHost(hostname)) return false
  const nav = win.navigator ?? {}
  if (nav.webdriver === true || nav.doNotTrack === '1' || nav.globalPrivacyControl === true) return false

  // Origin and path only. Taken once, here, so a later hash change cannot leak into the hit.
  const page = { page_location: `${origin}${pathname}`, page_path: pathname }

  const start = () => {
    try {
      win.dataLayer = win.dataLayer || []
      // gtag.js reads `Arguments` objects off the data layer; an array would be ignored.
      win.gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params
        win.dataLayer.push(arguments)
      }
      win.gtag('js', new Date())
      win.gtag('config', measurementId, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        ...page,
      })
      win.gtag('event', 'page_view', page)
      const script = doc.createElement('script')
      script.async = true
      script.src = `${GTAG_SRC}?id=${encodeURIComponent(measurementId)}`
      doc.head.append(script)
    } catch {
      // Analytics must never be the reason the app fails to boot.
    }
  }
  // After load, so the tag never competes with first paint (`TODO/build-002`).
  if (doc.readyState === 'complete') start()
  else win.addEventListener('load', start, { once: true })
  return true
}
