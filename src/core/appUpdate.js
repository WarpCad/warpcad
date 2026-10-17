// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Keeping an installed or long-open WarpCad current (`TODO/build-005`). Framework-free: the
 * service-worker registration and the document are injected, so a fake clock tests all of it.
 *
 * A precached shell is only replaced when the browser fetches `sw.js` and finds it changed.
 * Browsers do that on navigation; a tab or installed app left open for days gets no navigation,
 * so {@link createUpdateScheduler} asks on a timer and when the tab becomes visible again.
 *
 * @module core/appUpdate
 */

/** How often an open tab asks whether a newer service worker exists: 30 minutes. */
export const DEFAULT_CHECK_INTERVAL_MS = 30 * 60 * 1000

/**
 * @typedef {object} ReloadState
 * @property {boolean} dragging a drag, gizmo drag or placement is in progress
 * @property {boolean} editing a field edit, pop-up, dialog or sketch is open
 * @property {boolean} unsaved the autosave has not landed (writing, or failed)
 * @property {boolean} mergeWaiting a change from the open file is waiting to merge
 */

/**
 * Whether reloading the page right now would lose nothing. When it would, the toast's Reload
 * still works, but asks first.
 *
 * @param {ReloadState} state
 * @returns {boolean}
 */
export function canReloadNow(state) {
  return !(state.dragging || state.editing || state.unsaved || state.mergeWaiting)
}

/**
 * @typedef {'unavailable' | 'failed' | 'found' | 'latest'} CheckResult
 */

/**
 * @typedef {object} RegistrationLike
 * @property {() => Promise<unknown>} update
 * @property {unknown} [installing]
 * @property {unknown} [waiting]
 */

/**
 * @typedef {object} DocumentLike
 * @property {string} visibilityState
 * @property {(type: string, listener: () => void) => void} addEventListener
 * @property {(type: string, listener: () => void) => void} removeEventListener
 */

/**
 * The "look for a new version" scheduler.
 *
 * @param {object} options
 * @param {() => RegistrationLike | null | undefined} options.getRegistration read each time: the
 *   registration arrives asynchronously, after the scheduler is started
 * @param {DocumentLike} [options.document]
 * @param {number} [options.intervalMs]
 * @returns {{ start: () => void, stop: () => void, checkNow: () => Promise<CheckResult> }}
 */
export function createUpdateScheduler({
  getRegistration,
  document: doc = globalThis.document,
  intervalMs = DEFAULT_CHECK_INTERVAL_MS,
}) {
  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null

  /** Ask the browser to re-fetch `sw.js`. Never rejects. @returns {Promise<CheckResult>} */
  async function checkNow() {
    const registration = getRegistration()
    if (!registration) return 'unavailable'
    try {
      await registration.update()
    } catch {
      return 'failed'
    }
    return registration.installing || registration.waiting ? 'found' : 'latest'
  }

  function onVisibility() {
    if (doc?.visibilityState === 'visible') void checkNow()
  }

  return {
    checkNow,
    start() {
      if (timer !== null) return
      timer = setInterval(() => void checkNow(), intervalMs)
      doc?.addEventListener('visibilitychange', onVisibility)
    },
    stop() {
      if (timer !== null) clearInterval(timer)
      timer = null
      doc?.removeEventListener('visibilitychange', onVisibility)
    },
  }
}
