// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useOutsideClick } from './useOutsideClick.js'

/** @type {import('vue').EffectScope[]} */
const scopes = []

/**
 * @param {Element} target
 * @returns {Event}
 */
function press(target) {
  const event = new Event('pointerdown', { bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

/**
 * @param {import('vue').Ref<boolean>} open
 * @param {(event: Event) => void} close
 * @param {{ ignore?: Array<Element | null | (() => Element | null)> }} [options]
 */
function mount(open, close, options) {
  document.body.innerHTML = '<button id="opener">o</button><div id="pop"><button id="in">in</button></div><p id="out">out</p>'
  const root = ref(document.getElementById('pop'))
  const scope = effectScope()
  scopes.push(scope)
  scope.run(() => useOutsideClick(root, () => open.value, close, options))
}

beforeEach(() => {
  document.body.innerHTML = ''
})
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
})

describe('useOutsideClick', () => {
  it('closes on a press outside, not inside, and never prevents it', async () => {
    const open = ref(true)
    const close = vi.fn()
    mount(open, close)
    await nextTick()
    const inside = press(/** @type {Element} */ (document.getElementById('in')))
    expect(close).not.toHaveBeenCalled()
    expect(inside.defaultPrevented).toBe(false)
    const outside = press(/** @type {Element} */ (document.getElementById('out')))
    expect(close).toHaveBeenCalledTimes(1)
    expect(outside.defaultPrevented).toBe(false)
  })

  it('ignores the opener (and any other ignored element), by element or getter', async () => {
    const open = ref(true)
    const close = vi.fn()
    mount(open, close, {
      ignore: [() => document.getElementById('opener'), document.getElementById('out')],
    })
    await nextTick()
    press(/** @type {Element} */ (document.getElementById('opener')))
    expect(close).not.toHaveBeenCalled()
  })

  it('attaches a listener only while open', async () => {
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')
    const open = ref(false)
    const close = vi.fn()
    mount(open, close)
    await nextTick()
    press(/** @type {Element} */ (document.getElementById('out')))
    expect(close).not.toHaveBeenCalled()
    expect(add.mock.calls.filter((call) => call[0] === 'pointerdown')).toHaveLength(0)
    open.value = true
    await nextTick()
    const added = add.mock.calls.filter((call) => call[0] === 'pointerdown')
    expect(added).toHaveLength(1)
    expect(added[0][2]).toBe(true)
    open.value = false
    await nextTick()
    expect(remove.mock.calls.filter((call) => call[0] === 'pointerdown')).toHaveLength(1)
    press(/** @type {Element} */ (document.getElementById('out')))
    expect(close).not.toHaveBeenCalled()
    add.mockRestore()
    remove.mockRestore()
  })

  it('removes the listener when its scope stops', async () => {
    const open = ref(true)
    const close = vi.fn()
    mount(open, close)
    await nextTick()
    scopes.splice(0).forEach((scope) => scope.stop())
    press(/** @type {Element} */ (document.getElementById('out')))
    expect(close).not.toHaveBeenCalled()
  })
})
