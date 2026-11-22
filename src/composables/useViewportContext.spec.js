// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'

import { useViewportContext } from './useViewportContext.js'

function setup() {
  const canvas = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
  const ctx = useViewportContext({
    viewport: () => null,
    canvas: () => /** @type {any} */ (canvas),
    cancelFrame: vi.fn(),
    measure: vi.fn(),
  })
  return { ctx, canvas }
}

describe('useViewportContext', () => {
  it('starts ready with no failures and canvas key 0', () => {
    const { ctx } = setup()
    expect(ctx.contextState.value).toBe('ready')
    expect(ctx.contextFailures.value).toBe(0)
    expect(ctx.canvasKey.value).toBe(0)
    expect(ctx.contextRecovery.state).toBe('ready')
  })

  it('mirrors the recovery state into the refs the banner reads', () => {
    const { ctx } = setup()
    ctx.contextRecovery.lost()
    expect(ctx.contextState.value).not.toBe('ready')
    expect(ctx.contextRecovery.state).toBe(ctx.contextState.value)
    ctx.contextRecovery.restored()
    expect(ctx.contextState.value).toBe('ready')
  })

  it('exposes the listener and restore handlers', () => {
    const { ctx } = setup()
    expect(typeof ctx.attachContextListeners).toBe('function')
    expect(typeof ctx.detachContextListeners).toBe('function')
    expect(typeof ctx.onRestoreView).toBe('function')
  })
})
