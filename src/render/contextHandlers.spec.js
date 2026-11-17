// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'

import { createContextHandlers } from './contextHandlers.js'

/** A canvas that records its listeners. */
function fakeCanvas() {
  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map()
  return {
    listeners,
    addEventListener: vi.fn((name, fn) => {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name)?.add(fn)
    }),
    removeEventListener: vi.fn((name, fn) => listeners.get(name)?.delete(fn)),
  }
}

/** @param {{ lostAfterReplace?: boolean, lostBefore?: boolean, rebuildResult?: unknown, mounted?: boolean }} [opts] */
function setup({ lostAfterReplace = false, lostBefore = false, rebuildResult = {}, mounted = true } = {}) {
  let canvas = fakeCanvas()
  let lost = lostBefore
  const viewport = {
    renderer: 'renderer',
    graph: { scene: 'scene' },
    isContextLost: vi.fn(() => lost),
    replaceRenderer: vi.fn(() => {
      lost = lostAfterReplace
    }),
  }
  const recovery = { lost: vi.fn(), restored: vi.fn(), attemptFailed: vi.fn() }
  const gpu = {
    rebuild: vi.fn(() => rebuildResult),
    setCapture: vi.fn(),
    createCapture: vi.fn(() => 'capture'),
  }
  const cancelFrame = vi.fn()
  const measure = vi.fn()
  const remountCanvas = vi.fn(async () => {
    canvas = fakeCanvas()
  })
  const handlers = createContextHandlers({
    viewport: () => (mounted ? viewport : null),
    canvas: () => /** @type {any} */ (canvas),
    recovery,
    cancelFrame,
    measure,
    remountCanvas,
    gpu,
  })
  return { handlers, viewport, recovery, gpu, cancelFrame, measure, remountCanvas, canvas: () => canvas }
}

describe('createContextHandlers', () => {
  it('on loss: prevents default, drops capture, stops the frame, tells recovery', () => {
    const { handlers, gpu, cancelFrame, recovery } = setup()
    const event = /** @type {any} */ ({ preventDefault: vi.fn() })
    handlers.onLost(event)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(gpu.setCapture).toHaveBeenCalledWith(null)
    expect(cancelFrame).toHaveBeenCalledTimes(1)
    expect(recovery.lost).toHaveBeenCalledTimes(1)
  })

  it('on restore: rebuilds the GPU resources, then resumes drawing', () => {
    const { handlers, gpu, recovery, measure } = setup()
    handlers.onRestored()
    expect(gpu.rebuild).toHaveBeenCalledWith('renderer', 'scene')
    expect(recovery.restored).toHaveBeenCalledTimes(1)
    expect(gpu.setCapture).toHaveBeenCalledWith('capture')
    expect(measure).toHaveBeenCalledTimes(1)
  })

  it('on restore: does nothing if the rebuild reports no change, or before mount', () => {
    const none = setup({ rebuildResult: null })
    none.handlers.onRestored()
    expect(none.recovery.restored).not.toHaveBeenCalled()
    const unmounted = setup({ mounted: false })
    unmounted.handlers.onRestored()
    expect(unmounted.gpu.rebuild).not.toHaveBeenCalled()
  })

  it('attach and detach register and remove both listeners', () => {
    const { handlers, canvas } = setup()
    const c = canvas()
    handlers.attach(/** @type {any} */ (c))
    expect(c.listeners.get('webglcontextlost')?.size).toBe(1)
    expect(c.listeners.get('webglcontextrestored')?.size).toBe(1)
    handlers.detach(/** @type {any} */ (c))
    expect(c.listeners.get('webglcontextlost')?.size).toBe(0)
    expect(c.listeners.get('webglcontextrestored')?.size).toBe(0)
    expect(() => handlers.attach(null)).not.toThrow()
  })

  it('Restore view on a live context reuses the canvas and resumes drawing', async () => {
    const { handlers, viewport, remountCanvas, recovery, canvas } = setup()
    const original = canvas()
    await handlers.restoreView()
    expect(remountCanvas).not.toHaveBeenCalled()
    expect(viewport.replaceRenderer).toHaveBeenCalledWith(original)
    expect(original.listeners.get('webglcontextlost')?.size).toBe(1)
    expect(recovery.restored).toHaveBeenCalledTimes(1)
    expect(recovery.attemptFailed).not.toHaveBeenCalled()
  })

  it('Restore view on a still-lost canvas mounts a fresh one first', async () => {
    const { handlers, viewport, remountCanvas, recovery, canvas } = setup({ lostBefore: true })
    const original = canvas()
    await handlers.restoreView()
    expect(remountCanvas).toHaveBeenCalledTimes(1)
    expect(canvas()).not.toBe(original)
    expect(viewport.replaceRenderer).toHaveBeenCalledWith(canvas())
    expect(recovery.restored).toHaveBeenCalledTimes(1)
  })

  it('Restore view reports a failed attempt when the context is still lost', async () => {
    const { handlers, recovery } = setup({ lostAfterReplace: true })
    await handlers.restoreView()
    expect(recovery.attemptFailed).toHaveBeenCalledTimes(1)
    expect(recovery.restored).not.toHaveBeenCalled()
  })

  it('Restore view reports a failed attempt when the renderer throws, and re-attaches', async () => {
    const { handlers, viewport, recovery, canvas } = setup()
    viewport.replaceRenderer.mockImplementation(() => {
      throw new Error('boom')
    })
    await handlers.restoreView()
    expect(recovery.attemptFailed).toHaveBeenCalledTimes(1)
    expect(canvas().listeners.get('webglcontextlost')?.size).toBe(1)
  })

  it('ignores a second Restore view while one is running', async () => {
    const { handlers, viewport } = setup({ lostBefore: true })
    const first = handlers.restoreView()
    await handlers.restoreView()
    await first
    expect(viewport.replaceRenderer).toHaveBeenCalledTimes(1)
  })

  it('Restore view does nothing before mount', async () => {
    const { handlers, recovery } = setup({ mounted: false })
    await handlers.restoreView()
    expect(recovery.attemptFailed).not.toHaveBeenCalled()
  })
})
