import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useDocumentStore } from './document.js'
import { useSelectionStore } from './selection.js'
import { useTimelineStore } from './timeline.js'

/**
 * The History panel's **UI-only** state (`TODO/ui-032`).
 *
 * CLAUDE.md puts panel layout and "which point in history is being previewed"
 * squarely in `src/stores/` and the document itself emphatically outside it. The
 * line this file pins down is that **preview is not rollback**:
 * `docs/decisions/interaction-model-qa.md` §18 makes the rollback marker
 * *document* state (autosaved, undoable, persisted) and §14 makes preview
 * *UI* state ("never autosaved, never in the undo stack, never a document
 * record"). A preview that leaked into the log would be the exact
 * looks-live-but-isn't failure class `SECOND-ATTEMPT.md` documents.
 */
describe('timeline store (TODO/ui-032)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /** Place a cube, chamfer it, place a sphere — scenario 12's own first three steps. */
  function seedScenario12() {
    const doc = useDocumentStore()
    doc.append(
      { id: 'cuboid-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [40, 40, 40] } },
      { origin: 'local' }
    )
    doc.append(
      {
        id: 'chamfer-2',
        op: 'modify.chamferRim',
        target: 'cuboid-1',
        supersedes: 'cuboid-1',
        params: { radius: 5, orientation: 'z+' },
      },
      { origin: 'local' }
    )
    doc.append(
      {
        id: 'sphere-3',
        op: 'primitive.sphere',
        name: 'Sphere 1',
        params: { diameter: 30, center: [120, 0, 15] },
      },
      { origin: 'local' }
    )
    return doc
  }

  it('starts closed, with nothing selected and nothing previewing', () => {
    const timeline = useTimelineStore()
    expect(timeline.open).toBe(false)
    expect(timeline.previewing).toBe(false)
    expect(timeline.selectedId).toBe('')
  })

  it('toggles open and closed — §13: default closed on every device, every load', () => {
    const timeline = useTimelineStore()
    timeline.toggle()
    expect(timeline.open).toBe(true)
    timeline.toggle()
    expect(timeline.open).toBe(false)
  })

  it('lists one row per record, in order, with the panel label the scenario reads', () => {
    seedScenario12()
    const timeline = useTimelineStore()
    expect(timeline.rows.map((row) => row.text)).toEqual([
      'Cube 1 — placed',
      'Chamfer Top (+Z) 5 mm on Cube 1',
      'Sphere 1 — placed',
    ])
    expect(timeline.rows.map((row) => row.step)).toEqual([1, 2, 3])
    expect(timeline.stepCount).toBe(3)
  })

  it('re-reads the list when the document changes, without anyone calling refresh', () => {
    const doc = seedScenario12()
    const timeline = useTimelineStore()
    expect(timeline.rows).toHaveLength(3)
    doc.append(
      { id: 'cone-4', op: 'primitive.cone', name: 'Cone 1', params: { diameter: 20, height: 30 } },
      { origin: 'local' }
    )
    expect(timeline.rows).toHaveLength(4)
  })

  it('previews an earlier row: the sphere is simply not in the previewed document', () => {
    seedScenario12()
    const timeline = useTimelineStore()
    timeline.selectRow('chamfer-2')

    expect(timeline.previewing).toBe(true)
    expect(timeline.previewStep).toBe(2)
    expect(timeline.previewText).toBe('Previewing step 2 of 3 — read-only')

    const preview = timeline.previewDocument()
    expect(preview).not.toBeNull()
    // The chamfered cube and nothing else — scenario 12's step 5 Expect.
    expect(preview?.bodies().map((body) => body.name)).toEqual(['Cube 1'])
  })

  it('folds the preview on the live document\'s fold cache: nothing it already built is built again (TODO/core-031)', () => {
    const doc = seedScenario12()
    const timeline = useTimelineStore()
    timeline.selectRow('chamfer-2')

    const preview = timeline.previewDocument()
    const live = doc.raw.bodies().find((body) => body.recordId === 'chamfer-2')
    // The very object the live fold built — a cache hit, not an equal rebuild.
    expect(preview?.bodies()[0].geometry).toBe(live?.geometry)
  })

  it('does not preview the last row — it *is* the current document (§14)', () => {
    seedScenario12()
    const timeline = useTimelineStore()
    timeline.selectRow('sphere-3')
    expect(timeline.selectedId).toBe('sphere-3')
    expect(timeline.previewing).toBe(false)
    expect(timeline.previewDocument()).toBeNull()
  })

  it('clears the body selection on entering preview, and does not restore it on exit', () => {
    seedScenario12()
    const selection = useSelectionStore()
    const timeline = useTimelineStore()
    selection.select('cuboid-1')

    timeline.selectRow('cuboid-1')
    expect(selection.ids).toEqual([])

    timeline.endPreview()
    // §14: "it is not restored on exit."
    expect(selection.ids).toEqual([])
    expect(timeline.previewing).toBe(false)
  })

  it('ends the preview when the panel closes, but keeps the row selected (§13)', () => {
    seedScenario12()
    const timeline = useTimelineStore()
    timeline.setOpen(true)
    timeline.selectRow('cuboid-1')
    expect(timeline.previewing).toBe(true)

    timeline.setOpen(false)
    expect(timeline.previewing).toBe(false)
    expect(timeline.selectedId).toBe('cuboid-1')
  })

  it('leaves no trace of a preview in the document — no record, no undo step', () => {
    const doc = seedScenario12()
    const timeline = useTimelineStore()
    const before = doc.raw.entries.length
    const undoable = doc.canUndo

    timeline.selectRow('cuboid-1')
    timeline.previewDocument()
    timeline.endPreview()

    expect(doc.raw.entries.length).toBe(before)
    expect(doc.canUndo).toBe(undoable)
    expect(doc.raw.rollbackAt()).toBeNull()
  })

  it('reports the rollback strip’s two lines, pluralised, once a marker is set', () => {
    const doc = seedScenario12()
    const timeline = useTimelineStore()
    doc.raw.rollBackTo('chamfer-2', { origin: 'local' })
    doc.refresh()

    expect(timeline.rolledBack).toBe(true)
    expect(timeline.rollbackText).toBe('Rolled back to step 2 of 3')
    expect(timeline.rollbackDetail).toBe('New steps insert here · 1 later step inactive')
    expect(timeline.rows.map((row) => row.active)).toEqual([true, true, false])
  })

  it('pluralises the inactive-tail count', () => {
    const doc = seedScenario12()
    const timeline = useTimelineStore()
    doc.raw.rollBackTo('cuboid-1', { origin: 'local' })
    doc.refresh()
    expect(timeline.rollbackDetail).toBe('New steps insert here · 2 later steps inactive')
  })

  it('selects an inactive row without previewing it (§18)', () => {
    const doc = seedScenario12()
    const timeline = useTimelineStore()
    doc.raw.rollBackTo('cuboid-1', { origin: 'local' })
    doc.refresh()

    timeline.selectRow('sphere-3')
    expect(timeline.selectedId).toBe('sphere-3')
    expect(timeline.previewing).toBe(false)
  })

  it('previews an active row while rolled back, and stops at the previewed step', () => {
    const doc = seedScenario12()
    const timeline = useTimelineStore()
    doc.raw.rollBackTo('chamfer-2', { origin: 'local' })
    doc.refresh()

    // Step 1 is active and earlier than the marker, so it previews.
    timeline.selectRow('cuboid-1')
    expect(timeline.previewing).toBe(true)
    const preview = timeline.previewDocument()
    expect(preview?.bodies().map((body) => body.name)).toEqual(['Cube 1'])
    // The unchamfered cube: previewing step 1 stops before the chamfer.
    expect(preview?.entries.length).toBe(1)
  })

  it('drops a stale preview when the previewed row is no longer there', () => {
    const doc = seedScenario12()
    const timeline = useTimelineStore()
    timeline.selectRow('chamfer-2')
    expect(timeline.previewing).toBe(true)

    doc.undo() // takes the sphere out
    doc.undo() // takes the chamfer out — the previewed row itself
    expect(timeline.previewing).toBe(false)
    expect(timeline.previewDocument()).toBeNull()
  })
  it('loading a whole project ends the preview even when the same row ids come back (TODO/ui-033)', () => {
    // Open… of the file you just saved reloads the SAME ids. A preview that survived would
    // leave the viewport frozen, read-only, on a past state of a document that no longer
    // exists (§10: "any preview/rollback strip is cleared").
    const doc = seedScenario12()
    const timeline = useTimelineStore()
    timeline.selectRow('chamfer-2')
    expect(timeline.previewing).toBe(true)

    const entries = doc.raw.entries.map((entry) => ({ record: entry.record, origin: entry.origin }))
    doc.load(entries, null)

    expect(timeline.previewing).toBe(false)
    expect(timeline.selectedId).toBe('')
    expect(timeline.previewDocument()).toBeNull()
  })
})
