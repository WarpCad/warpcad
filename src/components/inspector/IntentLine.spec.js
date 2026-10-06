// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck
import { createPinia, setActivePinia } from 'pinia'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

enableAutoUnmount(afterEach)

import { useDocumentStore } from '../../stores/document.js'
import IntentLine from './IntentLine.vue'

/**
 * `TODO/ai-003` — the Inspector's header line: a selected body's latest design intent, one
 * line, ellipsised, the full text on tap. Text only, never markup.
 */

function setup(records) {
  setActivePinia(createPinia())
  const documentStore = useDocumentStore()
  for (const [record, transaction] of records) documentStore.raw.append(record, transaction)
  documentStore.version += 1
  return documentStore
}

const cube = { id: 'c1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10], center: [0, 0, 5] } }
const move = { id: 'c1-m', op: 'transform.translate', supersedes: 'c1', target: 'c1', params: { vector: [5, 0, 0], rotation: [0, 0, 0] } }

describe('IntentLine', () => {
  it('shows the body’s latest intent in one collapsed line; a tap expands it', async () => {
    setup([
      [cube, { origin: 'ai', intent: 'Make a plate' }],
      [move, { origin: 'ai', intent: 'Clear the tube' }],
    ])
    const wrapper = mount(IntentLine, { props: { bodyId: 'c1' } })
    const line = wrapper.get('[data-testid="inspector-intent"]')
    expect(line.text()).toContain('Clear the tube')
    expect(line.attributes('aria-expanded')).toBe('false')
    expect(line.classes()).toContain('intent--collapsed')
    await line.trigger('click')
    expect(line.attributes('aria-expanded')).toBe('true')
    expect(line.classes()).not.toContain('intent--collapsed')
  })

  it('falls back to an earlier step’s intent when the latest has none', () => {
    setup([
      [cube, { origin: 'ai', intent: 'Make a plate' }],
      [move, { origin: 'local' }],
    ])
    const wrapper = mount(IntentLine, { props: { bodyId: 'c1' } })
    expect(wrapper.get('[data-testid="inspector-intent"]').text()).toContain('Make a plate')
  })

  it('renders nothing for a body with no intent', () => {
    setup([[cube, { origin: 'local' }]])
    const wrapper = mount(IntentLine, { props: { bodyId: 'c1' } })
    expect(wrapper.find('[data-testid="inspector-intent"]').exists()).toBe(false)
  })

  it('is inert text', () => {
    setup([[cube, { origin: 'ai', intent: '<img src=x><b>x</b>' }]])
    const wrapper = mount(IntentLine, { props: { bodyId: 'c1' } })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.get('[data-testid="inspector-intent"]').text()).toContain('<img src=x><b>x</b>')
  })
})
