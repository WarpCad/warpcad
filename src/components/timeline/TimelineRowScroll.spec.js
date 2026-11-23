// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — a hand-built row view; the component is typechecked.
import { createPinia, setActivePinia } from 'pinia'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

enableAutoUnmount(afterEach)

import { useDocumentStore } from '../../stores/document.js'
import { useTimelineStore } from '../../stores/timeline.js'
import TimelineRow from './TimelineRow.vue'

/**
 * `TODO/ui-164` — a row that mounts already selected (the merge banner's Show selects the row
 * and opens History in the same tick) is brought into view, as a row selected afterwards is
 * (`TODO/ui-155`). `nearest`, so a row already in view does not move.
 */

function aRow() {
  setActivePinia(createPinia())
  const documentStore = useDocumentStore()
  documentStore.raw.append(
    { id: 'c1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10], center: [0, 0, 5] } },
    { origin: 'local' },
  )
  documentStore.version += 1
  return useTimelineStore().rows[0]
}

describe('TimelineRow — scroll a selected row into view', () => {
  /** @type {import('vitest').Mock} */
  let scrollIntoView
  beforeEach(() => {
    scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
  })

  it('a row that mounts selected scrolls itself into view, once, with block nearest', async () => {
    mount(TimelineRow, { props: { row: aRow(), selected: true } })
    await Promise.resolve()
    await Promise.resolve()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
  })

  it('a row that mounts unselected does not scroll until it is selected', async () => {
    const wrapper = mount(TimelineRow, { props: { row: aRow(), selected: false } })
    await Promise.resolve()
    expect(scrollIntoView).not.toHaveBeenCalled()
    await wrapper.setProps({ selected: true })
    await Promise.resolve()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })
})
