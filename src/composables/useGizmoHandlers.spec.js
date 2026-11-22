// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'

const begin = vi.fn()
const move = vi.fn()
const end = vi.fn()
/** @type {any} */
let captured
vi.mock('../render/gizmoDrag.js', () => ({
  createGizmoDrag: (/** @type {any} */ deps) => {
    captured = deps
    return { begin, move, end }
  },
}))

const { useGizmoHandlers } = await import('./useGizmoHandlers.js')

/** @param {{ body?: any, toolbar?: any }} [options] */
function setup({ body = { id: 'b1' }, toolbar = null } = {}) {
  begin.mockClear()
  move.mockClear()
  end.mockClear()
  const transformCommands = { translateBy: vi.fn(), rotateBy: vi.fn() }
  const syncBodies = vi.fn()
  const pickAt = vi.fn()
  const root = { querySelector: vi.fn(() => toolbar) }
  const handlers = useGizmoHandlers({
    root: () => /** @type {any} */ (root),
    viewportRect: { left: 10, top: 20, width: 800, height: 600 },
    selected: () => ({ body }),
    transformCommands,
    syncBodies,
    pickAt,
    drag: /** @type {any} */ ({ marker: 'drag-deps' }),
  })
  return { handlers, transformCommands, syncBodies, pickAt }
}

describe('useGizmoHandlers', () => {
  it('passes the drag deps through and adds the viewport rect and a keep-out getter', () => {
    const { handlers } = setup()
    expect(captured.marker).toBe('drag-deps')
    expect(captured.viewportRect.left).toBe(10)
    expect(captured.keepOut()).toBeNull()
    expect(handlers.gizmoDrag.begin).toBe(begin)
  })

  it('begins a drag on the one selected body', () => {
    const { handlers } = setup()
    handlers.onGizmoHandleDown(/** @type {any} */ ({ handle: 'x' }))
    expect(begin).toHaveBeenCalledWith({ handle: 'x' }, { id: 'b1' })
  })

  it.each([
    ['nothing selected', null],
    ['a part', { id: 'b', subPart: 'p' }],
    ['a repeat body', { id: 'b', moveRefusal: 'repeat' }],
  ])('does not begin a drag for %s', (_name, body) => {
    const { handlers } = setup({ body })
    handlers.onGizmoHandleDown(/** @type {any} */ ({}))
    expect(begin).not.toHaveBeenCalled()
  })

  it('measures the operations toolbar relative to the viewport when a drag begins', () => {
    const toolbar = { getBoundingClientRect: () => ({ left: 110, right: 210, top: 70, bottom: 90, width: 100, height: 20 }) }
    const { handlers } = setup({ toolbar })
    handlers.onGizmoHandleDown(/** @type {any} */ ({}))
    expect(handlers.toolbarKeepOut).toEqual({ active: true, left: 100, right: 200, top: 50, bottom: 70 })
    expect(captured.keepOut()).toBe(handlers.toolbarKeepOut)
  })

  it('a zero-size toolbar is not a keep-out', () => {
    const toolbar = { getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }) }
    const { handlers } = setup({ toolbar })
    handlers.onGizmoHandleDown(/** @type {any} */ ({}))
    expect(captured.keepOut()).toBeNull()
  })

  it('forwards moves', () => {
    const { handlers } = setup()
    handlers.onGizmoHandleMove({ clientX: 1, clientY: 2 })
    expect(move).toHaveBeenCalledWith({ clientX: 1, clientY: 2 })
  })

  it('commits a translate or a rotate once, then re-syncs the bodies', () => {
    const t = setup()
    end.mockReturnValueOnce({ kind: 'translate', bodyId: 'b1', translate: [1, 0, 0] })
    t.handlers.onGizmoHandleUp({ cancelled: false })
    expect(t.transformCommands.translateBy).toHaveBeenCalledWith('b1', [1, 0, 0])
    expect(t.syncBodies).toHaveBeenCalledTimes(1)
    const r = setup()
    end.mockReturnValueOnce({ kind: 'rotate', bodyId: 'b1', rotate: { angle: 5 } })
    r.handlers.onGizmoHandleUp({ cancelled: false })
    expect(r.transformCommands.rotateBy).toHaveBeenCalledWith('b1', { angle: 5 })
  })

  it('commits nothing when the drag ended without a result', () => {
    const { handlers, transformCommands, syncBodies } = setup()
    end.mockReturnValueOnce(null)
    handlers.onGizmoHandleUp({ cancelled: true })
    expect(transformCommands.translateBy).not.toHaveBeenCalled()
    expect(syncBodies).not.toHaveBeenCalled()
  })

  it('a click on a handle picks what is underneath, not additively', () => {
    const { handlers, pickAt } = setup()
    handlers.onGizmoHandleClick({ clientX: 5, clientY: 6 })
    expect(pickAt).toHaveBeenCalledWith(5, 6, false)
  })
})
