// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { overlayStackDepth, resetOverlayStack, useOverlayStack } from './useOverlayStack.js'
import { useEscapeToClose } from './useEscapeToClose.js'

/** @param {Element | Document | Window} [target] */
function pressEscape(target = document.body) {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

/** @type {import('vue').EffectScope[]} */
const scopes = []
/**
 * @param {() => void} fn
 */
function inScope(fn) {
  const scope = effectScope()
  scopes.push(scope)
  scope.run(fn)
  return scope
}

afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  resetOverlayStack()
})

describe('useOverlayStack', () => {
  it('closes only the top overlay with two open, then the next on a second Escape', async () => {
    const a = ref(true)
    const b = ref(true)
    const closeA = vi.fn(() => (a.value = false))
    const closeB = vi.fn(() => (b.value = false))
    inScope(() => {
      useOverlayStack(() => a.value, closeA)
      useOverlayStack(() => b.value, closeB)
    })
    await nextTick()
    pressEscape()
    expect(closeB).toHaveBeenCalledTimes(1)
    expect(closeA).not.toHaveBeenCalled()
    await nextTick()
    pressEscape()
    expect(closeA).toHaveBeenCalledTimes(1)
  })

  it('orders by when each opened, not by registration order, with three overlays', async () => {
    const a = ref(false)
    const b = ref(false)
    const c = ref(false)
    const closes = { a: vi.fn(() => (a.value = false)), b: vi.fn(() => (b.value = false)), c: vi.fn(() => (c.value = false)) }
    inScope(() => {
      useOverlayStack(() => a.value, closes.a)
      useOverlayStack(() => b.value, closes.b)
      useOverlayStack(() => c.value, closes.c)
    })
    c.value = true
    await nextTick()
    a.value = true
    await nextTick()
    b.value = true
    await nextTick()
    expect(overlayStackDepth()).toBe(3)
    pressEscape()
    pressEscape()
    pressEscape()
    expect(closes.b.mock.invocationCallOrder[0]).toBeLessThan(closes.a.mock.invocationCallOrder[0])
    expect(closes.a.mock.invocationCallOrder[0]).toBeLessThan(closes.c.mock.invocationCallOrder[0])
  })

  it('swallows the key only while something is open', async () => {
    const open = ref(false)
    inScope(() => useOverlayStack(() => open.value, () => (open.value = false)))
    await nextTick()
    expect(pressEscape().defaultPrevented).toBe(false)
    open.value = true
    await nextTick()
    expect(pressEscape().defaultPrevented).toBe(true)
    await nextTick()
    expect(pressEscape().defaultPrevented).toBe(false)
  })

  it('does not reach a later window listener when it closes something', async () => {
    const open = ref(true)
    const later = vi.fn()
    window.addEventListener('keydown', later)
    inScope(() => useOverlayStack(() => open.value, () => (open.value = false)))
    await nextTick()
    pressEscape()
    expect(later).not.toHaveBeenCalled()
    window.removeEventListener('keydown', later)
  })

  it('removes an overlay when its scope stops, and the listener when the stack empties', async () => {
    const open = ref(true)
    const close = vi.fn()
    const scope = inScope(() => useOverlayStack(() => open.value, close))
    await nextTick()
    expect(overlayStackDepth()).toBe(1)
    scope.stop()
    expect(overlayStackDepth()).toBe(0)
    pressEscape()
    expect(close).not.toHaveBeenCalled()
  })

  it('ignores keys other than Escape and repeats of a held Escape key only once handled', async () => {
    const open = ref(true)
    const close = vi.fn()
    inScope(() => useOverlayStack(() => open.value, close))
    await nextTick()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(close).not.toHaveBeenCalled()
  })
})

describe('useEscapeToClose (thin wrapper)', () => {
  it('still closes on Escape while open and goes through the same stack', async () => {
    const open = ref(true)
    const close = vi.fn(() => (open.value = false))
    inScope(() => useEscapeToClose(() => open.value, close))
    await nextTick()
    expect(overlayStackDepth()).toBe(1)
    pressEscape()
    expect(close).toHaveBeenCalledTimes(1)
  })
})
