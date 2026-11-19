// SPDX-License-Identifier: AGPL-3.0-or-later
/** Fallback when no frame is ever drawn. */
export const FIRST_FRAME_TIMEOUT_MS = 8000

/**
 * Runs `run` once the app has drawn its first viewport frame and the main thread is idle
 * (`TODO/perf-006`), so a download the app does not need to be usable (the Sentry SDK, 144 kB gzip)
 * stays off the cold path. "Drawn" is the same signal `bench/bundle-load.mjs` calls *frame*:
 * `[data-testid="viewport"]` carries `data-frames-rendered` of 1 or more. If no frame is ever
 * drawn (no WebGL, say), `run` still fires after {@link FIRST_FRAME_TIMEOUT_MS}.
 *
 * @param {() => void} run
 * @param {Document} [doc]
 * @returns {void}
 */
export function afterFirstFrame(run, doc = document) {
  let started = false
  /** @type {MutationObserver | undefined} */
  let observer
  const start = () => {
    if (started) return
    started = true
    observer?.disconnect()
    const idle = /** @type {any} */ (globalThis).requestIdleCallback
    if (typeof idle === 'function') idle(run, { timeout: 2000 })
    else setTimeout(run, 200)
  }
  const drawn = () => {
    const viewport = doc.querySelector('[data-testid="viewport"]')
    return Number(viewport?.getAttribute('data-frames-rendered') ?? 0) >= 1
  }
  if (drawn()) return start()
  observer = new MutationObserver(() => {
    if (drawn()) start()
  })
  observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-frames-rendered'] })
  setTimeout(start, FIRST_FRAME_TIMEOUT_MS)
}
