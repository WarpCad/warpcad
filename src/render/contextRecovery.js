// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the 3D view does after the browser drops its WebGL context (`TODO/render-006`).
 *
 * A plain state machine, with no DOM, no three.js and no Vue, so it runs in Node under fake timers:
 *
 * - `ready`: drawing normally.
 * - `lost`: `webglcontextlost` fired. The frame loop is stopped and the banner reads
 *   *Restoring…* while the browser gets a chance to hand the context back.
 * - `stalled`: nothing came back within {@link RESTORE_WAIT_MS}, or one **Restore view** attempt
 *   failed. The banner offers **Restore view**.
 * - `failed`: {@link MAX_RESTORE_ATTEMPTS} attempts failed. The banner also offers
 *   **Save a copy**, so the user's work is never trapped behind a blank view.
 *
 * A restore never reloads the page, so the document, both undo stacks and the kernel worker are
 * untouched. This module only decides what the banner shows. The GPU side is
 * `rebuildGpuResources` and `Viewport#replaceRenderer` in `scene.js`.
 */

/** How long the browser gets to restore the context by itself before the user is offered a button. */
export const RESTORE_WAIT_MS = 3000

/** Failed **Restore view** attempts before the banner offers **Save a copy** as well. */
export const MAX_RESTORE_ATTEMPTS = 2

/** @typedef {'ready' | 'lost' | 'stalled' | 'failed'} ContextState */

/**
 * @typedef {object} ContextRecovery
 * @property {ContextState} state
 * @property {number} failures failed Restore view attempts since the context was last healthy
 * @property {() => void} lost `webglcontextlost` fired
 * @property {() => void} restored the context is drawing again (by the browser, or Restore view)
 * @property {() => void} attemptFailed a Restore view attempt did not produce a live context
 * @property {() => void} dispose cancel the pending wait
 */

/**
 * @param {object} [options]
 * @param {(state: ContextState, failures: number) => void} [options.onChange] called on every change
 * @param {number} [options.waitMs]
 * @param {(fn: () => void, ms: number) => unknown} [options.setTimer]
 * @param {(handle: unknown) => void} [options.clearTimer]
 * @returns {ContextRecovery}
 */
export function createContextRecovery(options = {}) {
  const waitMs = options.waitMs ?? RESTORE_WAIT_MS
  const setTimer = options.setTimer ?? ((fn, ms) => globalThis.setTimeout(fn, ms))
  const clearTimer = options.clearTimer ?? ((handle) => globalThis.clearTimeout(/** @type {any} */ (handle)))
  /** @type {ContextState} */
  let state = 'ready'
  let failures = 0
  /** @type {unknown} */
  let timer = null

  function cancelWait() {
    if (timer === null) return
    clearTimer(timer)
    timer = null
  }

  /** @param {ContextState} next */
  function set(next) {
    state = next
    options.onChange?.(state, failures)
  }

  return {
    get state() {
      return state
    },
    get failures() {
      return failures
    },

    lost() {
      // A fresh context lost again during an attempt is that attempt failing (`attemptFailed`),
      // not a new wait: the user already waited once and is looking at the button.
      if (state !== 'ready') return
      failures = 0
      set('lost')
      timer = setTimer(() => {
        timer = null
        if (state === 'lost') set('stalled')
      }, waitMs)
    },

    restored() {
      cancelWait()
      failures = 0
      if (state !== 'ready') set('ready')
    },

    attemptFailed() {
      cancelWait()
      failures += 1
      set(failures >= MAX_RESTORE_ATTEMPTS ? 'failed' : 'stalled')
    },

    dispose: cancelWait,
  }
}
