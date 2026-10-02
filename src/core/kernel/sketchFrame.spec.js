// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from '../document.js'
import { rotateRecord, translateRecord } from '../transform.js'
import { frameApply, frameInverseApply, sketchFrameOf } from './sketchFrame.js'

const local = { origin: 'local' }

function sketchDocument(center = [10, 20, 0]) {
  const document = createDocument()
  document.append(
    {
      id: 'sketch-1',
      op: 'primitive.sketch',
      name: 'Sketch 1',
      params: {
        center,
        slices: [{ id: 's1', zMm: 0, profiles: [{ id: 'p', kind: 'rect', role: 'solid', centerMm: [0, 0], widthMm: 10, heightMm: 10 }] }],
        extrusion: { method: 'linear', heightMm: 4, twistDeg: 0, twistSteps: 1 },
      },
    },
    local
  )
  return document
}

/** @param {number[]} a @param {number[]} b */
function expectClose(a, b) {
  for (let index = 0; index < 3; index += 1) expect(a[index]).toBeCloseTo(b[index], 9)
}

describe('sketchFrameOf — where a sketch body’s local plane is now', () => {
  it('is a plain translation to centre for an unmoved body', () => {
    const document = sketchDocument()
    const frame = sketchFrameOf(document.lineageOf('sketch-1'))
    expectClose(frameApply(frame, [0, 0, 0]), [10, 20, 0])
    expectClose(frameApply(frame, [5, 0, 0]), [15, 20, 0])
  })

  it('follows a later move', () => {
    const document = sketchDocument()
    document.append(translateRecord(document, 'sketch-1', [100, 0, 7]), local)
    const frame = sketchFrameOf(document.lineageOf('sketch-1'))
    expectClose(frameApply(frame, [0, 0, 0]), [110, 20, 7])
  })

  it('follows a turn about the body’s own centre, so the plane tilts with the solid', () => {
    const document = sketchDocument([0, 0, 0])
    document.append(rotateRecord(document, 'sketch-1', [90, 0, 0]), local)
    const frame = sketchFrameOf(document.lineageOf('sketch-1'))
    // The body was a 10×10×4 slab centred on (0,0,2); turning 90° about X maps local +Y
    // to world +Z, about that centre.
    const origin = frameApply(frame, [0, 0, 0])
    const alongY = frameApply(frame, [0, 1, 0])
    expect(alongY[2] - origin[2]).toBeCloseTo(1, 9)
    expect(alongY[1] - origin[1]).toBeCloseTo(0, 9)
    // The pivot is the body's centre (0, 0, 2): the sketch origin (0, 0, 0) sits 2 mm
    // below it, so after the turn it is 2 mm along world +Y from the pivot.
    expectClose(origin, [0, 2, 2])
  })

  it('inverts exactly, so a pointer on the plane maps back to sketch millimetres', () => {
    const document = sketchDocument([3, -4, 1])
    document.append(rotateRecord(document, 'sketch-1', [30, 15, 60]), local)
    document.append(translateRecord(document, 'sketch-1', [-8, 2, 5]), local)
    const frame = sketchFrameOf(document.lineageOf('sketch-1'))
    const world = frameApply(frame, [12.5, -7.25, 0])
    expectClose(frameInverseApply(frame, world), [12.5, -7.25, 0])
  })

  it('ignores records that do not move the body', () => {
    const document = sketchDocument()
    const before = sketchFrameOf(document.lineageOf('sketch-1'))
    const lineage = [...document.lineageOf('sketch-1'), { id: 'r', op: 'style.recolor', target: 'sketch-1', supersedes: 'sketch-1', colorOverride: 0xff0000 }]
    expect(sketchFrameOf(/** @type {any} */ (lineage))).toEqual(before)
  })
})
