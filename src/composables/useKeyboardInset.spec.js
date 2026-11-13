// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useKeyboardInset } from './useKeyboardInset.js'

/** @type {import('vue').EffectScope[]} */
const scopes = []
const realVisual = Object.getOwnPropertyDescriptor(window, 'visualViewport')

/**
 * @param {{ height: number, offsetTop: number } | undefined} visual
 * @returns {EventTarget & { height: number, offsetTop: number }}
 */
function setVisual(visual) {
  if (!visual) {
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true })
    return /** @type {any} */ (null)
  }
  const target = new EventTarget()
  Object.assign(target, visual)
  Object.defineProperty(window, 'visualViewport', { value: target, configurable: true })
  return /** @type {any} */ (target)
}

/**
 * @param {() => boolean} active
 */
function use(active) {
  const scope = effectScope()
  scopes.push(scope)
  return /** @type {{ keyboardInsetPx: import('vue').Ref<number> }} */ (scope.run(() => useKeyboardInset(active)))
}

afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  if (realVisual) Object.defineProperty(window, 'visualViewport', realVisual)
  else delete (/** @type {any} */ (window)).visualViewport
})

describe('useKeyboardInset', () => {
  it('is 0 without visualViewport', async () => {
    setVisual(undefined)
    const { keyboardInsetPx } = use(() => true)
    await nextTick()
    expect(keyboardInsetPx.value).toBe(0)
  })

  it('measures the part of the layout viewport the visual viewport no longer covers, in CSS px', async () => {
    window.innerHeight = 800
    setVisual({ height: 500, offsetTop: 0 })
    const { keyboardInsetPx } = use(() => true)
    await nextTick()
    expect(keyboardInsetPx.value).toBe(300)
  })

  it('subtracts the visual viewport offset and never goes negative', async () => {
    window.innerHeight = 800
    const visual = setVisual({ height: 500, offsetTop: 40 })
    const { keyboardInsetPx } = use(() => true)
    await nextTick()
    expect(keyboardInsetPx.value).toBe(260)
    visual.height = 900
    visual.offsetTop = 0
    visual.dispatchEvent(new Event('resize'))
    expect(keyboardInsetPx.value).toBe(0)
  })

  it('follows resize events, and is 0 and silent while inactive', async () => {
    window.innerHeight = 800
    const visual = setVisual({ height: 800, offsetTop: 0 })
    const active = ref(false)
    const { keyboardInsetPx } = use(() => active.value)
    await nextTick()
    visual.height = 400
    visual.dispatchEvent(new Event('resize'))
    expect(keyboardInsetPx.value).toBe(0)
    active.value = true
    await nextTick()
    expect(keyboardInsetPx.value).toBe(400)
    visual.height = 600
    visual.dispatchEvent(new Event('resize'))
    expect(keyboardInsetPx.value).toBe(200)
    active.value = false
    await nextTick()
    expect(keyboardInsetPx.value).toBe(0)
  })
})
