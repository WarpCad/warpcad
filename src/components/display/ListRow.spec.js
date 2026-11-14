// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ListRow from './ListRow.vue'

/** `TODO/ui-117`: the list-row layout shell. */
describe('ListRow', () => {
  it('renders leading, default and trailing in that order', () => {
    const row = mount(ListRow, { slots: { leading: '<i class="lead" />', default: 'Cube 1', trailing: '<b class="trail" />' } })
    const kids = [...row.element.children].map((el) => el.className)
    expect(kids).toEqual(['lead', 'list-row__main', 'trail'])
    expect(row.find('.list-row__main').text()).toBe('Cube 1')
  })

  it('selected and hovered write their attributes, and write none when unset', () => {
    const plain = mount(ListRow)
    expect(plain.attributes('data-selected')).toBeUndefined()
    expect(plain.attributes('data-hovered')).toBeUndefined()
    const on = mount(ListRow, { props: { selected: true, hovered: true } })
    expect(on.attributes('data-selected')).toBe('true')
    expect(on.attributes('data-hovered')).toBe('true')
    expect(on.classes()).toContain('list-row--selected')
    const off = mount(ListRow, { props: { selected: false, hovered: false } })
    expect(off.attributes('data-selected')).toBe('false')
    expect(off.attributes('data-hovered')).toBe('false')
    expect(off.classes()).not.toContain('list-row--selected')
  })

  it('interactive and truncate are classes; tag picks the element', () => {
    const row = mount(ListRow, { props: { interactive: true, truncate: true, tag: 'li' } })
    expect(row.element.tagName).toBe('LI')
    expect(row.classes()).toContain('list-row--interactive')
    expect(row.find('.list-row__main').classes()).toContain('list-row__main--truncate')
  })

  it('listeners, data-testid and class fall through to the row', async () => {
    const row = mount(ListRow, { attrs: { 'data-testid': 'objects-line-a', class: 'row--view-hidden', onPointermove: () => {} } })
    expect(row.attributes('data-testid')).toBe('objects-line-a')
    expect(row.classes()).toContain('row--view-hidden')
  })
})
