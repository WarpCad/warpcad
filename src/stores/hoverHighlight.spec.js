// SPDX-License-Identifier: AGPL-3.0-or-later
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

/**
 * `TODO/ui-092`, part 3: a Prompts view row lights every part its request made at once. A second,
 * independent value beside `target`, so the object list and the repair dialog — which call
 * `clearHover()` with no match — never wipe a row's expansion highlight, and the single-target API
 * they use is unchanged.
 */
describe('hover highlight store — many bodies at once (TODO/ui-092)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function seed() {
    const doc = useDocumentStore()
    doc.append({ id: 'cube', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10], center: [0, 0, 5] } })
    doc.append({ id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: {} })
    doc.append({ id: 'ball', op: 'primitive.sphere', name: 'Sphere 1', params: { diameter: 10, center: [50, 0, 5] } })
    return doc
  }

  it('starts with nothing, and hoveredBodyIds is empty', () => {
    const hover = useHoverHighlightStore()
    expect(hover.many).toBeNull()
    expect(hover.hoveredBodyIds).toEqual([])
  })

  it('sets several bodies as one frozen, sorted value; ids the scene does not hold are dropped', () => {
    seed()
    const hover = useHoverHighlightStore()
    expect(hover.setHoverMany(['pi', 'ghost', 'cube', 'cube'])).toBe(true)
    expect(hover.many).toEqual(['cube', 'pi'])
    expect(Object.isFrozen(hover.many)).toBe(true)
    expect(hover.hoveredBodyIds).toEqual(['cube', 'pi'])
    // The single-body target is a separate value, untouched.
    expect(hover.target).toBeNull()
  })

  it('a repeat write of the same set is refused — the same object, no change reported, in any order', () => {
    seed()
    const hover = useHoverHighlightStore()
    hover.setHoverMany(['cube', 'pi'])
    const first = hover.many
    let changes = 0
    hover.$subscribe(() => {
      changes += 1
    }, { flush: 'sync' })
    expect(hover.setHoverMany(['pi', 'cube'])).toBe(false)
    expect(hover.setHoverMany(['pi', 'cube', 'ghost'])).toBe(false)
    expect(hover.many).toBe(first)
    expect(changes).toBe(0)
    expect(hover.setHoverMany(['cube'])).toBe(true)
    expect(hover.many).not.toBe(first)
    expect(changes).toBe(1)
  })

  it('nothing in the scene to light: refused when nothing is lit, and clears a set that was', () => {
    seed()
    const hover = useHoverHighlightStore()
    expect(hover.setHoverMany(['ghost'])).toBe(false)
    expect(hover.setHoverMany([])).toBe(false)
    expect(hover.many).toBeNull()
    hover.setHoverMany(['cube'])
    expect(hover.setHoverMany([])).toBe(true)
    expect(hover.many).toBeNull()
  })

  it('clearHoverMany with a match clears only that set; with none, any set', () => {
    seed()
    const hover = useHoverHighlightStore()
    hover.setHoverMany(['cube', 'pi'])
    hover.clearHoverMany(['cube'])
    expect(hover.many).toEqual(['cube', 'pi'])
    hover.clearHoverMany(['pi', 'cube'])
    expect(hover.many).toBeNull()
    hover.setHoverMany(['ball'])
    hover.clearHoverMany()
    expect(hover.many).toBeNull()
  })

  it('target and many are independent: clearHover() leaves the set, clearHoverMany() leaves the target; hoveredBodyIds is their union', () => {
    seed()
    const hover = useHoverHighlightStore()
    hover.setHoverMany(['cube', 'pi'])
    hover.setHover('ball')
    expect(hover.target).toEqual({ bodyId: 'ball', partName: null })
    expect(hover.many).toEqual(['cube', 'pi'])
    expect(hover.hoveredBodyIds).toEqual(['ball', 'cube', 'pi'])
    hover.clearHover()
    expect(hover.many).toEqual(['cube', 'pi'])
    hover.setHover('pi', 'ethernet')
    expect(hover.hoveredBodyIds).toEqual(['cube', 'pi'])
    hover.clearHoverMany()
    expect(hover.target).toEqual({ bodyId: 'pi', partName: 'ethernet' })
    expect(hover.hoveredBodyIds).toEqual(['pi'])
  })

  it('a body that leaves the scene is pruned from the set — a fresh frozen value — and the set clears when none remain', () => {
    const doc = seed()
    const hover = useHoverHighlightStore()
    hover.setHoverMany(['cube', 'ball'])
    const first = hover.many
    doc.undo() // the sphere
    expect(hover.many).toEqual(['cube'])
    expect(hover.many).not.toBe(first)
    expect(Object.isFrozen(hover.many)).toBe(true)
    const pruned = hover.many
    doc.undo() // the Pi: not in the set, so the set is the same object
    expect(hover.many).toBe(pruned)
    doc.undo() // the cube
    expect(hover.many).toBeNull()
  })

  it('rollback prunes the set too', () => {
    seed()
    const hover = useHoverHighlightStore()
    hover.setHoverMany(['cube', 'pi', 'ball'])
    useTimelineCommands().rollBackTo('cube')
    expect(hover.many).toEqual(['cube'])
  })

  it('is view state only', () => {
    const doc = seed()
    const hover = useHoverHighlightStore()
    const version = doc.version
    const records = doc.raw.records.length
    hover.setHoverMany(['cube', 'pi'])
    hover.clearHoverMany()
    expect(doc.version).toBe(version)
    expect(doc.raw.records.length).toBe(records)
  })
})
