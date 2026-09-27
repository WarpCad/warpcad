import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useTimelineCommands } from '../composables/useTimelineCommands.js'
import { useDocumentStore } from './document.js'
import { useHoverHighlightStore } from './hoverHighlight.js'

/**
 * The hover highlight's state (`TODO/ui-049`) — UI only.
 *
 * One writer (the Inspector's object list), one reader (the viewport). What this file pins
 * is the part that is easy to get wrong in a store that is written at pointer rate: a
 * repeat write of the same target must not look like a change (the viewport repaints and
 * swaps an x-ray twin on every change), and a highlight must never outlive the body it
 * names — a stale tint on geometry the pointer is not over is a bug.
 */
describe('hover highlight store (TODO/ui-049)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function seed() {
    const doc = useDocumentStore()
    doc.append({ id: 'cube', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10], center: [0, 0, 5] } })
    doc.append({ id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: {} })
    return doc
  }

  it('starts with nothing hovered', () => {
    expect(useHoverHighlightStore().target).toBeNull()
  })

  it('sets a whole-body target and a single-part target, and clears', () => {
    seed()
    const hover = useHoverHighlightStore()
    expect(hover.setHover('cube')).toBe(true)
    expect(hover.target).toEqual({ bodyId: 'cube', partName: null })
    expect(hover.setHover('pi', 'ethernet')).toBe(true)
    expect(hover.target).toEqual({ bodyId: 'pi', partName: 'ethernet' })
    hover.clearHover()
    expect(hover.target).toBeNull()
  })

  it('a repeat write of the same target is a no-op — the same object, no change reported', () => {
    seed()
    const hover = useHoverHighlightStore()
    hover.setHover('pi', 'ethernet')
    const first = hover.target
    let changes = 0
    hover.$subscribe(() => {
      changes += 1
    }, { flush: 'sync' })
    expect(hover.setHover('pi', 'ethernet')).toBe(false)
    expect(hover.target).toBe(first)
    expect(changes).toBe(0)
    // The body and the part are different targets: a part row is not its body row.
    expect(hover.setHover('pi')).toBe(true)
    expect(changes).toBe(1)
  })

  it('a clear aimed at a target that is no longer hovered leaves the current one alone', () => {
    seed()
    const hover = useHoverHighlightStore()
    // Row A's leave can arrive after row B's enter (focus moves, then blur fires).
    hover.setHover('cube')
    hover.setHover('pi', 'ethernet')
    hover.clearHover({ bodyId: 'cube', partName: null })
    expect(hover.target).toEqual({ bodyId: 'pi', partName: 'ethernet' })
    hover.clearHover({ bodyId: 'pi', partName: 'ethernet' })
    expect(hover.target).toBeNull()
  })

  it('refuses a body the scene does not contain', () => {
    seed()
    const hover = useHoverHighlightStore()
    expect(hover.setHover('ghost')).toBe(false)
    expect(hover.target).toBeNull()
  })

  it('clears itself when the hovered body leaves the scene — undo', () => {
    const doc = seed()
    const hover = useHoverHighlightStore()
    hover.setHover('pi', 'ethernet')
    doc.undo() // the Pi's creation
    expect(hover.target).toBeNull()
  })

  it('clears itself when the hovered body leaves the scene — rollback', () => {
    seed()
    const hover = useHoverHighlightStore()
    hover.setHover('pi')
    useTimelineCommands().rollBackTo('cube')
    expect(hover.target).toBeNull()
  })

  it('an unrelated body leaving the scene does not clear it', () => {
    const doc = seed()
    doc.append({ id: 'ball', op: 'primitive.sphere', name: 'Sphere 1', params: { diameter: 10, center: [50, 0, 5] } })
    const hover = useHoverHighlightStore()
    hover.setHover('cube')
    doc.undo() // the sphere
    expect(hover.target).toEqual({ bodyId: 'cube', partName: null })
  })

  it('is view state only: hovering writes nothing to the document and adds no Undo step', () => {
    const doc = seed()
    const hover = useHoverHighlightStore()
    const version = doc.version
    const records = doc.raw.records.length
    hover.setHover('pi', 'ethernet')
    hover.clearHover()
    expect(doc.version).toBe(version)
    expect(doc.raw.records.length).toBe(records)
  })
})
