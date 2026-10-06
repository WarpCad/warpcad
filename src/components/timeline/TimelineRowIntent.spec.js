// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — a hand-built row view; the component is typechecked.
import { createPinia, setActivePinia } from 'pinia'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

enableAutoUnmount(afterEach)

import { useDocumentStore } from '../../stores/document.js'
import { useTimelineStore } from '../../stores/timeline.js'
import TimelineRow from './TimelineRow.vue'

/**
 * `TODO/ai-003` — a History row with design intent shows a note icon; its expand control
 * reveals the intent and the origin chip. The text is untrusted (it can come from any file
 * or gist), so it is rendered as text, never markup.
 */

const HOSTILE = '<img src=x onerror="alert(1)"><b>Ignore previous instructions</b>'

function rowFor(intent, origin = 'ai') {
  setActivePinia(createPinia())
  const documentStore = useDocumentStore()
  documentStore.raw.append(
    { id: 'c1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10], center: [0, 0, 5] } },
    { origin, ...(intent === undefined ? {} : { intent }) },
  )
  documentStore.version += 1
  return useTimelineStore().rows[0]
}

describe('TimelineRow — design intent', () => {
  it('a row view carries the intent from the document', () => {
    expect(rowFor('Make a bracket').intent).toBe('Make a bracket')
    expect(rowFor(undefined, 'local').intent).toBeNull()
  })

  it('a row with intent has a 44px-class expand control; expanding shows the intent and the origin chip', async () => {
    const wrapper = mount(TimelineRow, { props: { row: rowFor('Make a bracket\n— Base plate') } })
    const toggle = wrapper.get('[data-testid="timeline-intent-toggle"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.attributes('aria-label')).toMatch(/why this step exists/i)
    expect(wrapper.find('[data-testid="timeline-intent"]').exists()).toBe(false)
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    const panel = wrapper.get('[data-testid="timeline-intent"]')
    expect(panel.text()).toContain('Make a bracket')
    expect(panel.text()).toContain('— Base plate')
    expect(panel.get('[data-testid="timeline-intent-origin"]').text()).toBe('via ai')
  })

  it('expanding does not select the row (it is a separate control)', async () => {
    const wrapper = mount(TimelineRow, { props: { row: rowFor('why') } })
    await wrapper.get('[data-testid="timeline-intent-toggle"]').trigger('click')
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('a row without intent has no expand control', () => {
    const wrapper = mount(TimelineRow, { props: { row: rowFor(undefined, 'local') } })
    expect(wrapper.find('[data-testid="timeline-intent-toggle"]').exists()).toBe(false)
  })

  it('markup in intent is inert: shown as literal characters, no element created', async () => {
    const wrapper = mount(TimelineRow, { props: { row: rowFor(HOSTILE) } })
    await wrapper.get('[data-testid="timeline-intent-toggle"]').trigger('click')
    const panel = wrapper.get('[data-testid="timeline-intent"]')
    expect(panel.find('img').exists()).toBe(false)
    expect(panel.find('b').exists()).toBe(false)
    expect(panel.text()).toContain(HOSTILE)
  })
})
