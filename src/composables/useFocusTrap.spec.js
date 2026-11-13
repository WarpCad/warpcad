// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { focusableWithin, useFocusTrap } from './useFocusTrap.js'

/** @type {import('vue').EffectScope[]} */
const scopes = []

/**
 * Build a dialog with the given inner HTML, an opener button, and a trap over it.
 *
 * @param {string} inner
 * @returns {{ root: HTMLElement, opener: HTMLButtonElement, open: import('vue').Ref<boolean> }}
 */
function setup(inner) {
  document.body.innerHTML = `<button id="opener">opener</button><div id="dlg">${inner}</div>`
  const opener = /** @type {HTMLButtonElement} */ (document.getElementById('opener'))
  const root = /** @type {HTMLElement} */ (document.getElementById('dlg'))
  opener.focus()
  const open = ref(false)
  const scope = effectScope()
  scopes.push(scope)
  scope.run(() => useFocusTrap(ref(root), () => open.value))
  return { root, opener, open }
}

/** @param {boolean} shift */
function tab(shift) {
  const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true })
  document.activeElement?.dispatchEvent(event)
  return event
}

async function settle() {
  await nextTick()
  await nextTick()
}

beforeEach(() => {
  document.body.innerHTML = ''
})
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
})

describe('focusableWithin', () => {
  it('skips disabled, hidden, tabindex -1 and display:none elements', () => {
    const { root } = setup(`
      <button id="a">a</button>
      <button id="dis" disabled>x</button>
      <button id="hid" hidden>x</button>
      <input id="neg" tabindex="-1" />
      <div style="display:none"><button id="inside-none">x</button></div>
      <input id="hiddenInput" type="hidden" />
      <a href="#" id="link">l</a>
      <button id="z">z</button>`)
    expect(focusableWithin(root).map((el) => el.id)).toEqual(['a', 'link', 'z'])
  })
})

describe('useFocusTrap', () => {
  it('focuses the first focusable element on open', async () => {
    const { open } = setup('<button id="a">a</button><button id="b">b</button>')
    open.value = true
    await settle()
    expect(document.activeElement?.id).toBe('a')
  })

  it('prefers the element marked data-autofocus', async () => {
    const { open } = setup('<button id="a">a</button><input id="b" data-autofocus />')
    open.value = true
    await settle()
    expect(document.activeElement?.id).toBe('b')
  })

  it('leaves focus alone when the dialog already put it inside', async () => {
    const { root, open } = setup('<button id="a">a</button><button id="b">b</button>')
    open.value = true
    ;/** @type {HTMLElement} */ (root.querySelector('#b')).focus()
    await settle()
    expect(document.activeElement?.id).toBe('b')
  })

  it('wraps Tab from the last to the first, and Shift+Tab from the first to the last', async () => {
    const { root, open } = setup('<button id="a">a</button><button id="dis" disabled>x</button><button id="b">b</button>')
    open.value = true
    await settle()
    ;/** @type {HTMLElement} */ (root.querySelector('#b')).focus()
    expect(tab(false).defaultPrevented).toBe(true)
    expect(document.activeElement?.id).toBe('a')
    expect(tab(true).defaultPrevented).toBe(true)
    expect(document.activeElement?.id).toBe('b')
  })

  it('steps through the dialog itself, so engines that skip buttons still cycle', async () => {
    const { root, open } = setup('<button id="a">a</button><button id="m">m</button><button id="b">b</button>')
    open.value = true
    await settle()
    ;/** @type {HTMLElement} */ (root.querySelector('#a')).focus()
    expect(tab(false).defaultPrevented).toBe(true)
    expect(document.activeElement?.id).toBe('m')
    tab(false)
    expect(document.activeElement?.id).toBe('b')
    tab(true)
    expect(document.activeElement?.id).toBe('m')
  })

  it('pulls focus back in when it has escaped to the page behind', async () => {
    const { opener, open } = setup('<button id="a">a</button><button id="b">b</button>')
    open.value = true
    await settle()
    opener.focus()
    tab(false)
    expect(document.activeElement?.id).toBe('a')
    opener.focus()
    tab(true)
    expect(document.activeElement?.id).toBe('b')
  })

  it('holds focus on a dialog with nothing focusable instead of letting Tab leave', async () => {
    const { open } = setup('<p>nothing here</p>')
    open.value = true
    await settle()
    expect(tab(false).defaultPrevented).toBe(true)
  })

  it('restores focus to the opener on close', async () => {
    const { opener, open } = setup('<button id="a">a</button>')
    open.value = true
    await settle()
    expect(document.activeElement?.id).toBe('a')
    open.value = false
    await settle()
    expect(document.activeElement).toBe(opener)
  })

  it('restores to <body> when the opener is gone', async () => {
    const { opener, open } = setup('<button id="a">a</button>')
    open.value = true
    await settle()
    opener.remove()
    open.value = false
    await settle()
    expect(document.activeElement).toBe(document.body)
  })

  it('stops trapping after close', async () => {
    const { open } = setup('<button id="a">a</button><button id="b">b</button>')
    open.value = true
    await settle()
    open.value = false
    await settle()
    document.getElementById('opener')?.focus()
    expect(tab(false).defaultPrevented).toBe(false)
  })
})
