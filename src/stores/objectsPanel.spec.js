import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useTimelineCommands } from '../composables/useTimelineCommands.js'
import { useDocumentStore } from './document.js'
import { useObjectsPanelStore } from './objectsPanel.js'
import { useSelectionStore } from './selection.js'
import { useSketchModeStore } from './sketchMode.js'
import { useTimelineStore } from './timeline.js'

/**
 * The Objects list's state (`TODO/ui-041`).
 *
 * The properties this file pins are the ones that make the list an honest *selection
 * route* and not a second, parallel one: it selects through the ordinary selection store
 * (so the count gate every operation reads is fed by it unchanged), it never touches the
 * History panel's row selection (`data-002` §13), and it can never select a body the
 * scene does not contain.
 */
describe('objects panel store (TODO/ui-041)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /** A 40 mm shell, a bolt standing entirely inside it, and an unrelated sphere. */
  function seedEnclosed() {
    const doc = useDocumentStore()
    doc.append({
      id: 'shell',
      op: 'primitive.cuboid',
      name: 'Shell 1',
      params: { size: [40, 40, 40], center: [0, 0, 20] },
    })
    doc.append({ id: 'bolt-1', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm10 hex', length: 12 } })
    doc.append({
      id: 'bolt-1t',
      op: 'transform.translate',
      name: 'Bolt 1',
      target: 'bolt-1',
      consumes: ['bolt-1'],
      params: { vector: [0, 0, 8] },
    })
    doc.append({ id: 'sphere', op: 'primitive.sphere', name: 'Sphere 1', params: { diameter: 20, center: [80, 0, 10] } })
    return doc
  }

  it('is closed by default, and toggles', () => {
    const objects = useObjectsPanelStore()
    expect(objects.open).toBe(false)
    objects.toggle()
    expect(objects.open).toBe(true)
    objects.toggle()
    expect(objects.open).toBe(false)
  })

  it('lists one row per body, named and sized, with nothing selected', () => {
    seedEnclosed()
    const objects = useObjectsPanelStore()
    expect(objects.rows.map((row) => row.name)).toEqual(['Shell 1', 'Bolt 1', 'Sphere 1'])
    expect(objects.rows[0].size).toBe('40 × 40 × 40 mm')
    expect(objects.rows.every((row) => !row.selected && row.order === 0 && row.role === 'none')).toBe(true)
  })

  it('updates live as bodies are added, undone and redone — nothing calls refresh', () => {
    const doc = seedEnclosed()
    const objects = useObjectsPanelStore()
    expect(objects.rows).toHaveLength(3)
    doc.append({ id: 'cone', op: 'primitive.cone', name: 'Cone 1', params: { diameter: 20, height: 30 } })
    expect(objects.rows).toHaveLength(4)
    doc.undo()
    expect(objects.rows).toHaveLength(3)
    doc.redo()
    expect(objects.rows.map((row) => row.name)).toContain('Cone 1')
  })

  it('selects the body a row names — a fully enclosed one, which no click can reach', () => {
    seedEnclosed()
    const objects = useObjectsPanelStore()
    const selection = useSelectionStore()
    expect(objects.choose('bolt-1t')).toBe(true)
    // The ordinary selection contract: the same store a raycast click writes.
    expect(selection.ids).toEqual(['bolt-1t'])
    expect(selection.onlyId).toBe('bolt-1t')
    expect(objects.rows.find((row) => row.id === 'bolt-1t')).toMatchObject({ selected: true, order: 1, role: 'base' })
  })

  it('reaches "2 selected" purely from the list, in click order — base first', () => {
    seedEnclosed()
    const objects = useObjectsPanelStore()
    const selection = useSelectionStore()
    objects.choose('shell')
    objects.choose('bolt-1t', true)
    // This is the count every operation's gate reads (`ui-014`).
    expect(selection.count).toBe(2)
    expect(selection.ids).toEqual(['shell', 'bolt-1t'])
    expect(objects.rows.map((row) => row.role)).toEqual(['base', 'secondary', 'none'])
    expect(objects.rows.map((row) => row.order)).toEqual([1, 2, 0])
  })

  it('an additive choose on a selected row takes it back out', () => {
    seedEnclosed()
    const objects = useObjectsPanelStore()
    const selection = useSelectionStore()
    objects.choose('shell')
    objects.choose('sphere', true)
    objects.choose('sphere', true)
    expect(selection.ids).toEqual(['shell'])
  })

  it('a plain choose replaces the selection, and drops a pick depth: a row names a body', () => {
    seedEnclosed()
    const objects = useObjectsPanelStore()
    const selection = useSelectionStore()
    selection.select('bolt-1t')
    selection.drillInto('tap')
    expect(selection.subPart).toEqual({ bodyId: 'bolt-1t', partName: 'tap' })
    objects.choose('bolt-1t')
    expect(selection.subPart).toBeNull()
    objects.choose('shell')
    expect(selection.ids).toEqual(['shell'])
  })

  it('an additive choose leaves a pick depth alone — ui-040 sub-part operands still compose', () => {
    seedEnclosed()
    const objects = useObjectsPanelStore()
    const selection = useSelectionStore()
    // ui-040's own dance: bolt drilled, shift it out, add the shell, add the bolt back.
    selection.select('bolt-1t')
    selection.drillInto('tap')
    objects.choose('bolt-1t', true)
    objects.choose('shell', true)
    objects.choose('bolt-1t', true)
    expect(selection.ids).toEqual(['shell', 'bolt-1t'])
    expect(selection.subPart).toEqual({ bodyId: 'bolt-1t', partName: 'tap' })
  })

  it('ignores an id the scene does not contain, rather than selecting a ghost', () => {
    seedEnclosed()
    const objects = useObjectsPanelStore()
    const selection = useSelectionStore()
    expect(objects.choose('nope')).toBe(false)
    expect(objects.choose('nope', true)).toBe(false)
    expect(selection.ids).toEqual([])
  })

  it('a History row selection and a body selection never trigger each other (§13)', () => {
    seedEnclosed()
    const objects = useObjectsPanelStore()
    const selection = useSelectionStore()
    const timeline = useTimelineStore()

    // Choosing a body does not select a row...
    objects.choose('shell')
    expect(timeline.selectedId).toBe('')

    // ...and selecting the *last* row (not a preview) does not select a body.
    selection.clear()
    timeline.selectRow('sphere')
    expect(selection.ids).toEqual([])
    expect(timeline.selectedId).toBe('sphere')
    // Choosing a body afterwards leaves the row selection alone.
    objects.choose('bolt-1t')
    expect(timeline.selectedId).toBe('sphere')
  })

  it('omits a body whose step is rolled back, and a body whose step is suppressed', () => {
    seedEnclosed()
    const objects = useObjectsPanelStore()
    const commands = useTimelineCommands()
    expect(objects.rows.map((row) => row.name)).toEqual(['Shell 1', 'Bolt 1', 'Sphere 1'])

    commands.setSuppressed('sphere', true)
    expect(objects.rows.map((row) => row.name)).toEqual(['Shell 1', 'Bolt 1'])
    expect(objects.choose('sphere')).toBe(false)
    commands.setSuppressed('sphere', false)
    expect(objects.rows).toHaveLength(3)

    // Roll back to just after the shell: the bolt's two steps and the sphere are inactive.
    commands.rollBackTo('shell')
    expect(objects.rows.map((row) => row.name)).toEqual(['Shell 1'])
    expect(objects.choose('bolt-1t')).toBe(false)
  })

  it('disables itself, with a printed reason, while History previews a past state', () => {
    seedEnclosed()
    const objects = useObjectsPanelStore()
    const selection = useSelectionStore()
    const timeline = useTimelineStore()
    expect(objects.disabledReason).toBe('')

    // Preview step 1 (just the shell). The list must show the *previewed* scene.
    timeline.selectRow('shell')
    expect(timeline.previewing).toBe(true)
    expect(objects.disabledReason).toMatch(/Previewing history/)
    expect(objects.rows.map((row) => row.name)).toEqual(['Shell 1'])

    // A body that exists only in the live document is not selectable from a preview...
    expect(objects.choose('sphere')).toBe(false)
    // ...and neither is one that is in it: the viewport is read-only.
    expect(objects.choose('shell')).toBe(false)
    expect(selection.ids).toEqual([])

    timeline.endPreview()
    expect(objects.disabledReason).toBe('')
    expect(objects.rows).toHaveLength(3)
  })

  it('disables itself in sketch mode: a solid is not selectable there, by any route', () => {
    seedEnclosed()
    const objects = useObjectsPanelStore()
    const selection = useSelectionStore()
    useSketchModeStore().active = true
    expect(objects.disabledReason).toMatch(/Sketch mode/)
    expect(objects.choose('shell')).toBe(false)
    expect(selection.ids).toEqual([])
    useSketchModeStore().active = false
    expect(objects.choose('shell')).toBe(true)
  })
})
