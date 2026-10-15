// SPDX-License-Identifier: AGPL-3.0-or-later
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_TOPIC, TOPICS } from '../help/topics.js'
import { useHelpStore } from './help.js'
import { useSelectionStore } from './selection.js'

beforeEach(() => setActivePinia(createPinia()))

describe('help store (TODO/ui-061)', () => {
  it('starts closed', () => {
    const help = useHelpStore()
    expect(help.isOpen).toBe(false)
    expect(help.canGoBack).toBe(false)
  })

  it('open(topic) resolves the topic to its page and heading', () => {
    const help = useHelpStore()
    help.open('align')
    expect(help.isOpen).toBe(true)
    expect(help.topic).toBe('align')
    expect(help.page).toBe(TOPICS.align.page)
    expect(help.anchor).toBe(TOPICS.align.anchor)
  })

  it('an unknown topic opens Getting started, never nothing', () => {
    const help = useHelpStore()
    help.open('not-a-tool')
    expect(help.isOpen).toBe(true)
    expect(help.page).toBe(TOPICS[DEFAULT_TOPIC].page)
  })

  it('openPage follows an in-sheet link and Back returns along the trail', () => {
    const help = useHelpStore()
    help.open('align')
    help.openPage('booleans', 'a-worked-example')
    expect(help.page).toBe('booleans')
    expect(help.canGoBack).toBe(true)
    help.back()
    expect(help.page).toBe(TOPICS.align.page)
    expect(help.anchor).toBe(TOPICS.align.anchor)
    expect(help.canGoBack).toBe(false)
  })

  it('a same-page anchor does not pile up Back entries for the same place', () => {
    const help = useHelpStore()
    help.open('align')
    help.openPage(TOPICS.align.page, TOPICS.align.anchor)
    expect(help.canGoBack).toBe(false)
  })

  it('close() shuts the sheet and forgets the trail and the Contents list', () => {
    const help = useHelpStore()
    help.open('align')
    help.openPage('booleans')
    help.toggleContents()
    help.close()
    expect(help.isOpen).toBe(false)
    expect(help.canGoBack).toBe(false)
    expect(help.contentsOpen).toBe(false)
  })

  it('toggle() opens at Getting started and closes again', () => {
    const help = useHelpStore()
    help.toggle()
    expect(help.isOpen).toBe(true)
    expect(help.page).toBe('getting-started')
    help.toggle()
    expect(help.isOpen).toBe(false)
  })

  it('opening and closing leaves the selection alone', () => {
    const selection = useSelectionStore()
    selection.select?.('a')
    const before = JSON.stringify(selection.$state)
    const help = useHelpStore()
    help.open('snap')
    help.close()
    expect(JSON.stringify(selection.$state)).toBe(before)
  })

  it('every navigation bumps the highlight nonce so the heading flashes again', () => {
    const help = useHelpStore()
    help.open('align')
    const first = help.nonce
    help.open('align')
    expect(help.nonce).toBeGreaterThan(first)
  })
})
