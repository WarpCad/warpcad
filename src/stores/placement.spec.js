// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — drives a hand-written fake drop target; the store is typed and checked by `npm run typecheck`.
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePlacementStore } from './placement.js'

/**
 * `src/stores/placement.js`: the Library's drag (`TODO/ui-010`) and, since `TODO/ui-107`, the
 * **armed placement session** File → Import model… starts. An armed session begins with no
 * pointer, follows hover, and a click or tap over the view commits it through the session's own
 * `place` callback; Cancel or Esc ends it with nothing added. The drop target is faked: what a
 * commit means belongs to the viewport, and is covered at `/` by `e2e/import-model.e2e.js`.
 */

function fakeTarget({ inside = true } = {}) {
  return {
    inside,
    previews: [],
    cleared: 0,
    commits: [],
    contains() {
      return this.inside
    },
    preview(op, x, y) {
      this.previews.push([op, x, y])
    },
    clearPreview() {
      this.cleared += 1
    },
    commit(op, x, y, overrides, place) {
      this.commits.push([op, x, y])
      return place ? place({ x, y }) : 'dragged-1'
    },
  }
}

beforeEach(() => setActivePinia(createPinia()))

describe('the armed session (TODO/ui-107)', () => {
  it('arm → hover → commit places through the session and ends it', () => {
    const placement = usePlacementStore()
    const target = fakeTarget()
    placement.registerTarget(target)
    const place = vi.fn(() => 'body-1')

    placement.arm('user.bracket', 'bracket.stl', { place })
    expect(placement.armed).toBe(true)
    expect(placement.isPlacing).toBe(true)
    // An armed session is not a drag: the Library's drag icon and its tier hold stay out of it.
    expect(placement.isDragging).toBe(false)
    expect(target.previews).toEqual([])

    placement.hover(100, 120)
    placement.hover(104, 118)
    expect(target.previews.at(-1)).toEqual(['user.bracket', 104, 118])
    expect(placement.pointer).toMatchObject({ x: 104, y: 118, overTarget: true })

    expect(placement.commitArmed(110, 121)).toBe('body-1')
    expect(place).toHaveBeenCalledWith({ x: 110, y: 121 })
    expect(placement.armed).toBe(false)
    expect(placement.op).toBe('')
    expect(target.cleared).toBeGreaterThan(0)
  })

  it('arm → cancel adds nothing and tells the session it was cancelled', () => {
    const placement = usePlacementStore()
    const target = fakeTarget()
    placement.registerTarget(target)
    const place = vi.fn(() => 'body-1')
    const onEnd = vi.fn()

    placement.arm('user.bracket', 'bracket.stl', { place, onEnd })
    placement.hover(100, 120)
    placement.cancel()
    expect(place).not.toHaveBeenCalled()
    expect(target.commits).toEqual([])
    expect(placement.armed).toBe(false)
    expect(placement.isPlacing).toBe(false)
    expect(onEnd).toHaveBeenCalledWith({ placed: null })
  })

  it('a click outside the view does not commit, and the session stays armed', () => {
    const placement = usePlacementStore()
    const target = fakeTarget({ inside: false })
    placement.registerTarget(target)
    const place = vi.fn(() => 'body-1')
    placement.arm('user.bracket', 'bracket.stl', { place })
    expect(placement.commitArmed(5, 5)).toBeNull()
    expect(place).not.toHaveBeenCalled()
    expect(placement.armed).toBe(true)
  })

  it('a commit the target refuses (no point on the plane) keeps the session armed', () => {
    const placement = usePlacementStore()
    const target = fakeTarget()
    placement.registerTarget(target)
    placement.arm('user.bracket', 'bracket.stl', { place: () => null })
    expect(placement.commitArmed(5, 5)).toBeNull()
    expect(placement.armed).toBe(true)
  })

  it('a Library drag still works as before, and hover/commitArmed ignore it', () => {
    const placement = usePlacementStore()
    const target = fakeTarget()
    placement.registerTarget(target)
    placement.begin('primitive.cuboid', 'Cube', 10, 10)
    expect(placement.isDragging).toBe(true)
    expect(placement.armed).toBe(false)
    expect(placement.commitArmed(10, 10)).toBeNull()
    expect(placement.drop(12, 12)).toBe('dragged-1')
    expect(placement.isPlacing).toBe(false)
  })

  it('placeAt commits a one-shot placement at a point (a file dropped on the view)', () => {
    const placement = usePlacementStore()
    const target = fakeTarget()
    placement.registerTarget(target)
    expect(placement.placeAt('user.bracket', 40, 50, () => 'body-9')).toBe('body-9')
    expect(target.commits).toEqual([['user.bracket', 40, 50]])
    expect(placement.isPlacing).toBe(false)
  })

  it('hover allocates nothing per move: the pointer object is the same one throughout', () => {
    const placement = usePlacementStore()
    placement.registerTarget(fakeTarget())
    placement.arm('user.bracket', 'bracket.stl', { place: () => 'b' })
    const pointer = placement.pointer
    for (let i = 0; i < 5; i += 1) placement.hover(i, i)
    expect(placement.pointer).toBe(pointer)
  })
})
