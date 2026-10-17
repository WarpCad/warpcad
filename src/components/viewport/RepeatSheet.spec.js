// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — DOM test doubles.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DOMWrapper, enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import OperationsToolbar from './OperationsToolbar.vue'
import RepeatSheet from './RepeatSheet.vue'
import { piBoltOnHole1 } from '../../core/__fixtures__/piScenes.js'
import { REPEAT_OP } from '../../core/repeat.js'
import { useDocumentStore } from '../../stores/document.js'
import { useRepeatStore } from '../../stores/repeat.js'
import { useSelectionStore } from '../../stores/selection.js'

// Both teleport to <body>; unmount after each test so nothing leaks into the next query.
enableAutoUnmount(afterEach)

/**
 * The **⟳ Repeat** button and the Repeat panel (`TODO/ui-069`), mounted together the way the
 * viewport mounts them. The session's rules are `stores/repeat.spec.js`'s; this checks the
 * controls reach them: the gate and its tooltip, the panel's lines and checkboxes, Apply's
 * label and enabled state, Escape's order, and the phone bar.
 */

const LOCAL = { origin: 'local' }

/** The user's scene up to the Pi seated on the posts — `piBoltOnHole1` without the bolt. */
function seatedPiEntries() {
  return piBoltOnHole1()
    .entries.filter((entry) => !String(entry.record.id).startsWith('bolt-'))
    .map((entry) => ({ ...entry }))
}

/** The bolt's steps, as the user makes them after pressing Repeat. */
function boltSteps() {
  return piBoltOnHole1()
    .entries.filter((entry) => String(entry.record.id).startsWith('bolt-'))
    .map((entry) => entry.record)
}

describe('⟳ Repeat and the Repeat panel (TODO/ui-069)', () => {
  let pinia
  let documentStore
  let selection
  let repeat

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    documentStore = useDocumentStore()
    selection = useSelectionStore()
    repeat = useRepeatStore()
    documentStore.load(seatedPiEntries())
  })

  const mountBoth = () => {
    const toolbar = mount(OperationsToolbar, { global: { plugins: [pinia] } })
    const sheet = mount(RepeatSheet, { global: { plugins: [pinia] } })
    return { toolbar, sheet }
  }
  const body = () => new DOMWrapper(document.body)
  const panel = () => body().find('[data-testid="repeat-sheet"]')

  it('is disabled, saying why, until one part is drilled into', async () => {
    const { toolbar } = mountBoth()
    const button = toolbar.get('[data-testid="op-repeat"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('title')).toBe('Drill into a part first, such as a hole')

    selection.select('pi-1')
    await nextTick()
    expect(button.attributes('disabled')).toBeDefined()

    selection.drillInto('hole1')
    await nextTick()
    expect(button.attributes('disabled')).toBeUndefined()
    expect(button.attributes('aria-expanded')).toBe('false')
  })

  it('opens the panel with the headline, the targets ticked and the seed locked', async () => {
    const { toolbar } = mountBoth()
    selection.select('pi-1')
    selection.drillInto('hole1')
    await nextTick()
    await toolbar.get('[data-testid="op-repeat"]').trigger('click')
    await nextTick()

    expect(toolbar.get('[data-testid="op-repeat"]').attributes('aria-expanded')).toBe('true')
    expect(panel().exists()).toBe(true)
    expect(body().get('[data-testid="repeat-headline"]').text()).toBe('Repeat on Raspberry Pi 1 › hole1 and 3 more')
    for (const name of ['hole1', 'hole2', 'hole3', 'hole4']) {
      expect(body().get(`[data-testid="repeat-target-${name}"]`).element.checked, name).toBe(true)
    }
    expect(body().get('[data-testid="repeat-target-hole1"]').attributes('disabled')).toBeDefined()
    expect(body().get('[data-testid="repeat-target-mb"]').element.checked).toBe(false)
    expect(body().get('[data-testid="repeat-status"]').text()).toMatch(/^Now make one part on hole1/)
    expect(body().get('[data-testid="repeat-apply"]').attributes('disabled')).toBeDefined()
    expect(body().get('[data-testid="repeat-apply"]').text()).toBe('Apply to 3 more')
  })

  it('lists the steps as they land, ↻ on the one aimed at the seed, then Apply commits one repeat', async () => {
    mountBoth()
    selection.select('pi-1')
    selection.drillInto('hole1')
    repeat.arm()
    for (const record of boltSteps()) documentStore.append(record, LOCAL)
    await nextTick()

    expect(body().get('[data-testid="repeat-status"]').text()).toBe('Recording Bolt 1: 3 steps')
    const steps = body().findAll('[data-testid="repeat-step"]')
    expect(steps.map((step) => step.attributes('data-mentions-seed'))).toEqual(['false', 'true', 'false'])
    expect(steps[1].text()).toMatch(/^↻/)

    // Untick hole3: the label follows.
    await body().get('[data-testid="repeat-target-hole3"]').trigger('change')
    expect(body().get('[data-testid="repeat-apply"]').text()).toBe('Apply to 2 more')
    await body().get('[data-testid="repeat-target-hole3"]').trigger('change')

    const apply = body().get('[data-testid="repeat-apply"]')
    expect(apply.attributes('disabled')).toBeUndefined()
    await apply.trigger('click')
    await nextTick()
    expect(documentStore.raw.entries.at(-1).record.op).toBe(REPEAT_OP)
    expect(panel().exists()).toBe(false)
  })

  it('shows the core’s reason live while no step mentions the seed', async () => {
    mountBoth()
    selection.select('pi-1')
    selection.drillInto('hole1')
    repeat.arm()
    const [drop, turn] = boltSteps()
    documentStore.append(drop, LOCAL)
    documentStore.append(turn, LOCAL)
    await nextTick()
    expect(body().get('[data-testid="repeat-reason"]').text()).toBe(
      "Nothing in Bolt 1's steps refers to hole1, so every repeat would land on Bolt 1",
    )
  })

  it('Cancel and Escape end the session; Escape closes an open Align popover first', async () => {
    const { toolbar } = mountBoth()
    selection.select('pi-1')
    selection.drillInto('hole1')
    repeat.arm()
    await nextTick()
    await body().get('[data-testid="repeat-cancel"]').trigger('click')
    expect(repeat.armed).toBe(false)

    repeat.arm()
    await nextTick()
    // Align is 1-or-2 gated: the drilled Pi is one body. Open it, then Escape twice.
    await toolbar.get('[data-testid="operation-align"]').trigger('click')
    await nextTick()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(toolbar.get('[data-testid="operation-align"]').attributes('aria-expanded')).toBe('false')
    expect(repeat.armed).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(repeat.armed).toBe(false)
  })

  it('pressing ⟳ Repeat again closes the session, keeping what was made', async () => {
    const { toolbar } = mountBoth()
    selection.select('pi-1')
    selection.drillInto('hole1')
    await nextTick()
    await toolbar.get('[data-testid="op-repeat"]').trigger('click')
    documentStore.append(boltSteps()[0], LOCAL)
    selection.select('bolt-1')
    await nextTick()
    // Armed, the button stays pressable even though the selection no longer meets the gate.
    const button = toolbar.get('[data-testid="op-repeat"]')
    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    expect(repeat.armed).toBe(false)
    expect(documentStore.bodies.some((each) => each.id === 'bolt-1')).toBe(true)
  })

  it('shrinks to its bar on a press in the 3D view, and the bar’s Apply works', async () => {
    mountBoth()
    const canvas = document.createElement('canvas')
    canvas.setAttribute('data-testid', 'viewport-canvas')
    document.body.appendChild(canvas)
    try {
      selection.select('pi-1')
      selection.drillInto('hole1')
      repeat.arm()
      for (const record of boltSteps()) documentStore.append(record, LOCAL)
      await nextTick()
      canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      await nextTick()
      expect(panel().attributes('data-minimized')).toBe('true')
      expect(body().get('[data-testid="repeat-expand"]').text()).toBe('Repeating on 4 · Bolt 1: 3 steps')
      await body().get('[data-testid="repeat-bar-apply"]').trigger('click')
      expect(documentStore.raw.entries.at(-1).record.op).toBe(REPEAT_OP)
    } finally {
      canvas.remove()
    }
  })
})
