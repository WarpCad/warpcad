// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from './document.js'
import { boundsOf } from './kernel/group.js'
import { parseProject, serializeProject } from './project.js'
import { partBoundsOf } from './__fixtures__/piScenes.js'

/**
 * Saved projects from before the one Align tool still open unchanged (`TODO/ui-060`,
 * Open question c).
 *
 * `ui-060` replaced the Snap and Align buttons with one popover, but the records that
 * popover writes are the same `group.snap` / `group.align` lines the old one wrote — only
 * the *button* that writes them changed. These are lines in exactly the old shape
 * (`params: { axes, orientation, deltaMm }`, a whole-body and a `{ id, pieces }` target),
 * replayed through the real loader, with the geometry they must produce pinned by hand from
 * `group.js`'s `SNAP_SIDES`. Millimetres, Z-up.
 */

const LEGACY_PROJECT = [
  { id: 'a', op: 'primitive.cuboid', name: 'Cube A', params: { size: [10, 10, 10], center: [0, 0, 5] } },
  { id: 'b', op: 'primitive.cuboid', name: 'Cube B', params: { size: [20, 20, 20], center: [100, 50, 10] } },
  // The old Snap popover: X ticked, Orientation "Outside −", Offset 2.
  { id: 'snap-1', op: 'group.snap', target: 'a', operands: ['b'], supersedes: 'a', params: { axes: 'x', deltaMm: 2, orientation: 'outside-' } },
  // The old Align popover: Y and Z ticked, Offset 0.
  { id: 'align-1', op: 'group.align', target: 'snap-1', operands: ['b'], supersedes: 'snap-1', params: { axes: 'yz', deltaMm: 0 } },
  { id: 'pi-1', op: 'raspberrypi.bplus', name: 'Raspberry Pi B+', params: { model: 4 } },
  // The old Snap popover with the Pi drilled into `mb`: Z, "Inside −".
  { id: 'snap-2', op: 'group.snap', target: { id: 'pi-1', pieces: 'mb' }, operands: ['b'], supersedes: 'pi-1', params: { axes: 'z', orientation: 'inside-', deltaMm: 0 } },
]
  .map((record) => JSON.stringify(record))
  .join('\n')

/**
 * @param {import('./document.js').WarpDocument} document
 * @param {string} bodyId
 */
function bodyBounds(document, bodyId) {
  const body = document.bodies().find((candidate) => candidate.id === bodyId)
  if (!body) throw new Error(`no body "${bodyId}"`)
  return boundsOf(body.geometry)
}

/** @param {string} text */
function load(text) {
  const parsed = parseProject(text)
  const document = createDocument()
  document.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution)
  return document
}

describe('pre-ui-060 group.snap / group.align records replay unchanged (TODO/ui-060)', () => {
  it('a whole-body Snap then Align lands exactly where the old buttons put it', () => {
    const document = load(LEGACY_PROJECT)
    const [min, max] = bodyBounds(document, 'a')
    // outside- on X: A's − face on B's + face (x = 110), plus the 2 mm offset.
    expect(min[0]).toBeCloseTo(112, 9)
    expect(max[0]).toBeCloseTo(122, 9)
    // Centred on B in Y and Z.
    expect((min[1] + max[1]) / 2).toBeCloseTo(50, 9)
    expect((min[2] + max[2]) / 2).toBeCloseTo(10, 9)
    // B never moved.
    expect(bodyBounds(document, 'b')).toEqual([[90, 40, 0], [110, 60, 20]])
  })

  it('a part-addressed Snap still measures the part and moves the whole body', () => {
    const document = load(LEGACY_PROJECT)
    // inside- on Z against B (floor at z = 0): the board's underside on 0, so the
    // microSD under it puts the whole Pi's floor at −1.5.
    expect(partBoundsOf(document, 'pi-1', 'mb')[0][2]).toBeCloseTo(0, 9)
    expect(bodyBounds(document, 'pi-1')[0][2]).toBeCloseTo(-1.5, 9)
  })

  it('round-trips through save and reload to the same geometry, records untouched', () => {
    const first = load(LEGACY_PROJECT)
    const second = load(serializeProject(first))
    for (const id of ['a', 'b', 'pi-1']) {
      const [minA, maxA] = bodyBounds(first, id)
      const [minB, maxB] = bodyBounds(second, id)
      for (let axis = 0; axis < 3; axis += 1) {
        expect(minB[axis]).toBeCloseTo(minA[axis], 9)
        expect(maxB[axis]).toBeCloseTo(maxA[axis], 9)
      }
    }
    expect(second.recordOf('snap-2')).toEqual(first.recordOf('snap-2'))
  })
})
