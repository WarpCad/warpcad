// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FIRST_FRAME_TIMEOUT_MS, afterFirstFrame } from './firstFrame.js'

/**
 * A minimal document: one viewport element whose frame counter the test sets.
 *
 * @param {number} frames
 */
function fakeDoc(frames) {
  /** @type {any} */
  let callback
  const viewport = { value: frames, getAttribute: () => String(viewport.value) }
  return {
    viewport,
    fire: () => callback?.(),
    doc: /** @type {any} */ ({ querySelector: () => viewport, documentElement: {} }),
    install() {
      /** @type {any} */ (globalThis).MutationObserver = class {
        constructor(/** @type {any} */ cb) { callback = cb }
        observe() {}
        disconnect() {}
      }
    },
  }
}

afterEach(() => {
  vi.useRealTimers()
  ;/** @type {any} */ (globalThis).requestIdleCallback = undefined
})

describe('afterFirstFrame', () => {
  it('waits for a drawn frame, then runs once on idle', () => {
    vi.useFakeTimers()
    const idle = vi.fn((/** @type {() => void} */ fn) => fn())
    ;/** @type {any} */ (globalThis).requestIdleCallback = idle
    const d = fakeDoc(0)
    d.install()
    const run = vi.fn()
    afterFirstFrame(run, d.doc)
    d.fire()
    expect(run).not.toHaveBeenCalled()
    d.viewport.value = 1
    d.fire()
    d.fire()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('runs after the timeout when no frame is ever drawn', () => {
    vi.useFakeTimers()
    const d = fakeDoc(0)
    d.install()
    const run = vi.fn()
    afterFirstFrame(run, d.doc)
    vi.advanceTimersByTime(FIRST_FRAME_TIMEOUT_MS + 500)
    expect(run).toHaveBeenCalledTimes(1)
  })
})
