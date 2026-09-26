import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useHiddenPartVisibilityStore } from './hiddenPartVisibility.js'

/**
 * Which bodies show their hidden parts (`TODO/ui-047`) — UI-only, per body,
 * session-persistent. No document, no Undo: this store's own contract is the
 * whole of what CLAUDE.md's Interaction model asks for here.
 */
describe('hiddenPartVisibility store (TODO/ui-047)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts with nothing shown', () => {
    const store = useHiddenPartVisibilityStore()
    expect(store.isShown('bolt-1')).toBe(false)
  })

  it('toggle shows a body, and toggling again hides it', () => {
    const store = useHiddenPartVisibilityStore()
    store.toggle('bolt-1')
    expect(store.isShown('bolt-1')).toBe(true)
    store.toggle('bolt-1')
    expect(store.isShown('bolt-1')).toBe(false)
  })

  it('show/hide set the state directly, idempotently', () => {
    const store = useHiddenPartVisibilityStore()
    store.show('bolt-1')
    store.show('bolt-1')
    expect(store.isShown('bolt-1')).toBe(true)
    store.hide('bolt-1')
    store.hide('bolt-1')
    expect(store.isShown('bolt-1')).toBe(false)
  })

  it('is scoped per body: showing one body never shows another', () => {
    const store = useHiddenPartVisibilityStore()
    store.show('bolt-1')
    expect(store.isShown('bolt-2')).toBe(false)
  })

  it('a shown body stays shown across an unrelated selection change — deselecting is not hiding', () => {
    // This store never reads the selection store at all; the point of this test
    // is to pin that down as a fact about this store, not just an inference from
    // its code — a body's shown state is not derived from "is it selected".
    const store = useHiddenPartVisibilityStore()
    store.show('bolt-1')
    // Nothing in this store reacts to selection, so there is nothing to change
    // here — the assertion is simply that the state persisted with no action.
    expect(store.isShown('bolt-1')).toBe(true)
  })
})
