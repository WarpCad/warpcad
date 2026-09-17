import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import {
  HARDWARE_LIBRARY,
  LIBRARY_SECTIONS,
  PRIMITIVE_LIBRARY,
  SNAP_ALIGNMENTS,
  SNAP_TOLERANCE_PX,
  alignmentCoordMm,
  alignmentOffsetMm,
  boxAtPoint,
  clearSnap,
  createBoxMm,
  createSnapState,
  gapMm,
  ghostBoxAtOrigin,
  ghostOffsetMm,
  paramsForDrop,
  recordForDrop,
  recordsForDrop,
  snapToleranceMm,
  updateSnap,
} from './library.js'
import { boundsOf, calcCenterWith, calcSnap } from './kernel/group.js'
import { evaluateOp } from './kernel/index.js'
import { createDocument } from './document.js'

const { measurements } = modeling

/**
 * A 40 mm cube's box, resting on the working plane and centred at `(xMm, yMm)`.
 *
 * @param {number} xMm
 * @param {number} yMm
 * @returns {{ minMm: number[], maxMm: number[] }}
 */
function cubeBox(xMm, yMm) {
  return { minMm: [xMm - 20, yMm - 20, 0], maxMm: [xMm + 20, yMm + 20, 40] }
}

describe('PRIMITIVE_LIBRARY — the Library panel rows, derived from the registry', () => {
  it('lists every primitive.* op the registry carries, and nothing else', () => {
    // The single mechanism CLAUDE.md's creation-vs-operation rule asks for: the
    // rows are the registry's creation entries, not a hand-copied list that can
    // drift from it.
    expect(PRIMITIVE_LIBRARY.map((row) => row.op)).toEqual([
      'primitive.cuboid',
      'primitive.cylinder',
      'primitive.cone',
      'primitive.hexagon',
      'primitive.triangle',
      'primitive.tube',
      'primitive.sphere',
    ])
    expect(PRIMITIVE_LIBRARY).toHaveLength(7)
  })

  it('gives every row a human label and buildable defaults', () => {
    for (const row of PRIMITIVE_LIBRARY) {
      expect(row.label, row.op).toMatch(/\S/)
      expect(row.defaults, row.op).toBeTypeOf('object')
      expect(row.operandCount, row.op).toBe(0)
    }
    expect(PRIMITIVE_LIBRARY.map((row) => row.label)).toEqual([
      'Cube',
      'Cylinder',
      'Cone',
      'Hexagon',
      'Triangle',
      'Tube',
      'Sphere',
    ])
  })
})

describe('HARDWARE_LIBRARY — the catalogue rows a composite recipe earns (TODO/ui-030)', () => {
  it('lists the four hardware.* recipes, in catalogue order, and nothing else', () => {
    expect(HARDWARE_LIBRARY.map((row) => row.op)).toEqual([
      'hardware.bolt',
      'hardware.nut',
      'hardware.washer',
      'hardware.bearing',
    ])
    expect(HARDWARE_LIBRARY.map((row) => row.label)).toEqual(['Bolt', 'Nut', 'Washer', 'Bearing'])
  })

  it('carries the same row contract as a primitive row, plus the kind the drop branches on', () => {
    for (const row of HARDWARE_LIBRARY) {
      expect(row.defaults, row.op).toBeTypeOf('object')
      // Creation rows, exactly like the primitives: geometry from nothing, so
      // they belong in the same "create" half of CLAUDE.md's creation-vs-
      // operation split and never in an operand-gated list.
      expect(row.operandCount, row.op).toBe(0)
      expect(row.kind, row.op).toBe('composite')
      // Every default actually builds — a row whose defaults throw is a row
      // that looks fine in the panel and fails on the first drag.
      expect(() => evaluateOp(row.op, row.defaults), row.op).not.toThrow()
    }
    expect(PRIMITIVE_LIBRARY.every((row) => row.kind === 'native')).toBe(true)
  })

  it('groups the rows into two named sections rather than one undifferentiated list', () => {
    expect(LIBRARY_SECTIONS.map((section) => section.id)).toEqual(['primitive', 'hardware'])
    expect(LIBRARY_SECTIONS.map((section) => section.title)).toEqual(['Primitives', 'Hardware'])
    expect(LIBRARY_SECTIONS[0].rows).toBe(PRIMITIVE_LIBRARY)
    expect(LIBRARY_SECTIONS[1].rows).toBe(HARDWARE_LIBRARY)
    // The primitives section is untouched by this: seven rows, same order.
    expect(PRIMITIVE_LIBRARY).toHaveLength(7)
  })
})

describe('recordsForDrop — placing a composite, which has no position param (TODO/ui-030)', () => {
  it('commits a primitive as exactly one record, position folded into its own params', () => {
    const document = createDocument()
    const records = recordsForDrop('primitive.cuboid', { x: 12, y: -8 }, document)
    expect(records).toHaveLength(1)
    expect(records[0].op).toBe('primitive.cuboid')
    expect(records[0].params?.center).toEqual([12, -8, 20])
  })

  it('commits a composite as its own record plus a trailing translate that supersedes it', () => {
    const document = createDocument()
    const records = recordsForDrop('hardware.bolt', { x: 30, y: -45 }, document)
    expect(records).toHaveLength(2)
    const [created, moved] = records
    expect(created.op).toBe('hardware.bolt')
    expect(created.name).toBe('Bolt 1')
    // The recipe would silently ignore a `center`, so folding the drop point in
    // there — the primitive path's shortcut — would place every bolt at the
    // recipe's own fixed origin however far the user dragged.
    expect(created.params?.center).toBeUndefined()
    expect(moved.op).toBe('transform.translate')
    expect(moved.target).toBe(created.id)
    // Supersession, not a second body: one drag is one thing on screen.
    expect(moved.supersedes).toBe(created.id)
    expect(moved.name).toBeUndefined()
    expect(moved.params?.vector).toEqual([30, -45, 0])
  })

  it('lands every hardware row at the drop point, resting on the grid, as one body', () => {
    // The specific regression Option 2 of TODO/ui-030 exists to prevent: a part
    // committed at the recipe's internal origin rather than where it was dropped.
    for (const row of HARDWARE_LIBRARY) {
      const document = createDocument()
      const records = recordsForDrop(row.op, { x: -62.5, y: 18.25 }, document)
      let scene = null
      for (const record of records) ({ scene } = document.append(record, { origin: 'local' }))
      const bodies = document.bodies()
      expect(bodies, row.op).toHaveLength(1)
      expect(bodies[0].name, row.op).toBe(`${row.label} 1`)
      expect(bodies[0].op, row.op).toBe(row.op)
      const [min, max] = boundsOf(bodies[0].geometry)
      expect((min[0] + max[0]) / 2, `${row.op} X`).toBeCloseTo(-62.5, 6)
      expect((min[1] + max[1]) / 2, `${row.op} Y`).toBeCloseTo(18.25, 6)
      expect(min[2], `${row.op} does not rest on Z=0`).toBeCloseTo(0, 6)
      expect(max[2], `${row.op} has no height`).toBeGreaterThan(0)
      expect(scene).not.toBeNull()
    }
  })

  it('does not absorb the body placed before it (TODO/done/core-020, through the drop path)', () => {
    // core-020's own reproduction — a plate, then a bolt — driven through the
    // records a *drag-drop* commits rather than through a hand-built
    // `document.append` call, which is what this task makes possible for the
    // first time. Both records are checked, because the composite's own group is
    // built by the first one and the second is a new way to reach the same fold.
    const document = createDocument()
    document.append(recordForDrop('primitive.cuboid', { x: 0, y: 0 }, document), { origin: 'local' })
    const [created, moved] = recordsForDrop('hardware.bolt', { x: 60, y: 0 }, document)

    document.append(created, { origin: 'local' })
    const asBuilt = /** @type {any} */ (document.bodies()[1].geometry)
    // Its own three visible parts, and not "Cube 1" among them — the exact
    // assertion core-020 turned on.
    expect(asBuilt.names).toEqual(['head', 'thread', 'tap'])
    const [boltMin, boltMax] = boundsOf(asBuilt)
    expect(boltMax[0] - boltMin[0]).toBeLessThan(25)

    document.append(moved, { origin: 'local' })
    const bodies = document.bodies()
    expect(bodies.map((body) => body.name)).toEqual(['Cube 1', 'Bolt 1'])
    // The cube is still its own size and still 60 mm away, not swallowed.
    const [cubeMin, cubeMax] = boundsOf(bodies[0].geometry)
    expect(cubeMax[0] - cubeMin[0]).toBeCloseTo(40, 6)
    const [movedMin, movedMax] = boundsOf(bodies[1].geometry)
    expect((movedMin[0] + movedMax[0]) / 2).toBeCloseTo(60, 6)
    expect(movedMax[0] - movedMin[0]).toBeCloseTo(boltMax[0] - boltMin[0], 6)
  })

  it('flattens the placed composite into one solid — stated, because it is a real consequence', () => {
    // Not a defect of this task and not a choice it makes: `src/core/kernel/
    // index.js`'s fold hands every native op a flat `Geom3` ("a boolean or a
    // transform has no use for a composite's part breakdown"), so the trailing
    // translate collapses the group exactly as the gizmo's own `transform.
    // translate` already collapses any group a user drags. Nothing a user *sees*
    // changes — the render path draws `combine()` of the visible parts, which is
    // this same solid — but a placed part has no addressable sub-parts, which is
    // what `TODO/ui-035` (sub-part snap/align operands) and `ACCEPTANCE.md`
    // scenario 5 (the bolt's `tap`) will both need. Pinned here so the next task
    // to want it finds a failing expectation rather than a surprise.
    const document = createDocument()
    for (const record of recordsForDrop('hardware.bolt', { x: 0, y: 0 }, document)) {
      document.append(record, { origin: 'local' })
    }
    const placed = /** @type {any} */ (document.bodies()[0].geometry)
    expect(placed.names).toBeUndefined()
    expect(placed.polygons).toBeTypeOf('object')
  })

  it('numbers hardware instances per type, like the primitive rows', () => {
    const document = createDocument()
    const names = []
    for (const op of ['hardware.bolt', 'hardware.nut', 'hardware.bolt']) {
      const records = recordsForDrop(op, { x: 0, y: 0 }, document)
      for (const record of records) document.append(record, { origin: 'local' })
      names.push(String(records[0].name))
    }
    expect(names).toEqual(['Bolt 1', 'Nut 1', 'Bolt 2'])
  })

  it('refuses the single-record shortcut for a composite rather than misplacing it', () => {
    const document = createDocument()
    expect(() => recordForDrop('hardware.bolt', { x: 5, y: 5 }, document)).toThrow(
      /recordsForDrop/
    )
  })

  it('leaves a composite drop out of the params entirely', () => {
    const params = paramsForDrop('hardware.washer', { x: 99, y: 99 })
    expect(params.center).toBeUndefined()
    expect(params.spec).toBe('m6')
  })

  it('measures a composite ghost as the shape that will actually land', () => {
    // The ghost the user drags and the solid the drop commits come from one
    // measurement, so the preview cannot promise a position the commit ignores.
    const box = ghostBoxAtOrigin('hardware.nut')
    expect(box.minMm[2]).toBeCloseTo(0, 6)
    expect((box.minMm[0] + box.maxMm[0]) / 2).toBeCloseTo(0, 6)
    const offset = ghostOffsetMm('hardware.nut')
    // A centred hexagon has to be lifted by half its height to rest on the grid.
    expect(offset[2]).toBeCloseTo(box.maxMm[2] / 2, 6)
    expect(ghostOffsetMm('primitive.cuboid')).toEqual([0, 0, 0])
  })
})

describe('recordForDrop — one generic drop, parameterised by which op the row names', () => {
  it('builds a record for any of the seven rows without a per-primitive branch', () => {
    const document = createDocument()
    for (const row of PRIMITIVE_LIBRARY) {
      const record = recordForDrop(row.op, { x: 0, y: 0 }, document)
      expect(record.op).toBe(row.op)
      expect(record.id).toMatch(/\S/)
      expect(record.name).toBe(`${row.label} 1`)
      expect(() => document.append(record, { origin: 'local' })).not.toThrow()
    }
    expect(document.bodies()).toHaveLength(7)
  })

  it('places the drop point in X/Y — not a fixed-origin spawn', () => {
    const document = createDocument()
    const record = recordForDrop('primitive.cuboid', { x: 42.5, y: -17.25 }, document)
    const { scene } = document.append(record, { origin: 'local' })
    const bounds = measurements.measureBoundingBox(
        /** @type {any} */ (scene.byId.get(String(record.id)))
      )
    expect((bounds[0][0] + bounds[1][0]) / 2).toBeCloseTo(42.5, 6)
    expect((bounds[0][1] + bounds[1][1]) / 2).toBeCloseTo(-17.25, 6)
  })

  it('rests every primitive on the working plane rather than half-burying it', () => {
    // The drop point is on the Z=0 grid; a solid centred there would sit half
    // underground, which reads as a bug the first time anyone drops a cube.
    const document = createDocument()
    for (const row of PRIMITIVE_LIBRARY) {
      const record = recordForDrop(row.op, { x: 10, y: 20 }, document)
      const { scene } = document.append(record, { origin: 'local' })
      const bounds = measurements.measureBoundingBox(
        /** @type {any} */ (scene.byId.get(String(record.id)))
      )
      expect(bounds[0][2], `${row.op} does not rest on Z=0`).toBeCloseTo(0, 6)
      expect(bounds[1][2], `${row.op} has no height`).toBeGreaterThan(0)
    }
  })

  it('numbers each type independently, so names never collide', () => {
    const document = createDocument()
    const names = []
    for (const op of ['primitive.cuboid', 'primitive.sphere', 'primitive.cuboid']) {
      const record = recordForDrop(op, { x: 0, y: 0 }, document)
      document.append(record, { origin: 'local' })
      names.push(String(record.name))
    }
    expect(names).toEqual(['Cube 1', 'Sphere 1', 'Cube 2'])
  })

  it('rejects an op that is not a library row', () => {
    const document = createDocument()
    expect(() => recordForDrop('boolean.union', { x: 0, y: 0 }, document)).toThrow(/boolean\.union/)
    expect(() => recordForDrop('primitive.dodecahedron', { x: 0, y: 0 }, document)).toThrow()
  })
})

describe('snapToleranceMm — "close enough" reads the same at every zoom level', () => {
  it('converts the screen-space tolerance radius into millimetres', () => {
    // TODO/ui-013: the constant is a *pixel* radius, converted at the boundary,
    // so zooming in makes the tolerance smaller in millimetres and identical on
    // screen — rather than a fixed millimetre radius that covers half the
    // viewport when zoomed out and a hair's width when zoomed in.
    expect(snapToleranceMm(0.5)).toBeCloseTo(SNAP_TOLERANCE_PX * 0.5, 9)
    expect(snapToleranceMm(2)).toBeCloseTo(SNAP_TOLERANCE_PX * 2, 9)
  })

  it('refuses to snap at all when there is no scale to convert with', () => {
    // Before the viewport has been measured there is no honest tolerance, and
    // guessing one would snap a drop the user never asked to have moved.
    expect(snapToleranceMm(0)).toBe(0)
    expect(snapToleranceMm(-1)).toBe(0)
    expect(snapToleranceMm(Number.NaN)).toBe(0)
  })
})

describe('alignmentOffsetMm — the same arithmetic group.js already snaps with', () => {
  it('agrees exactly with calcSnap/calcCenterWith for every alignment', () => {
    // TODO/ui-013's Proposed fix asks for `calcSnap`'s maths to be reused. It is
    // reused as *arithmetic* rather than as a call, because `calcSnap` measures
    // a solid's bounding box and allocates a vector per call, and this runs on
    // every `pointermove` against five candidate alignments per axis
    // (CLAUDE.md's Performance rule). The equivalence is pinned here rather than
    // claimed in a comment: each alignment is checked against the very
    // `SNAP_SIDES` orientation it names.
    const reference = evaluateOp('primitive.cuboid', { size: [40, 40, 40], center: [0, 0, 20] })
    const moving = evaluateOp('primitive.cylinder', { diameter: 24, height: 50, center: [37, 11, 25] })
    const movingBox = { minMm: [37 - 12, 11 - 12, 0], maxMm: [37 + 12, 11 + 12, 50] }
    const referenceBox = cubeBox(0, 0)

    for (const [index, alignment] of SNAP_ALIGNMENTS.entries()) {
      for (const axis of [0, 1]) {
        const offset = alignmentOffsetMm(
          index,
          movingBox.minMm[axis],
          movingBox.maxMm[axis],
          referenceBox.minMm[axis],
          referenceBox.maxMm[axis],
        )
        const expected = alignment.orientation
          ? calcSnap(moving, reference, 'xyz', alignment.orientation)[axis]
          : calcCenterWith(moving, 'xyz', reference)[axis]
        expect(offset, `${alignment.id} on axis ${axis}`).toBeCloseTo(expected, 9)
      }
    }
  })

  it('names the reference feature each alignment lands the ghost on', () => {
    const { minMm, maxMm } = cubeBox(0, 0)
    const coords = SNAP_ALIGNMENTS.map((_, index) => alignmentCoordMm(index, minMm[0], maxMm[0]))
    // Centre alignment sits on the reference's centre line; every other
    // alignment sits on one of its two faces. That is what the dashed guide is
    // drawn along.
    expect(coords).toEqual([0, -20, 20, 20, -20])
  })
})

describe('ghostBoxAtOrigin / boxAtPoint — the ghost measured once, moved per pointermove', () => {
  it('measures the resting box a drop at the origin would produce', () => {
    const box = ghostBoxAtOrigin('primitive.cuboid')
    expect(box.minMm[0]).toBeCloseTo(-20, 6)
    expect(box.maxMm[0]).toBeCloseTo(20, 6)
    // Resting on the plane, exactly as `restingCenter` places it.
    expect(box.minMm[2]).toBeCloseTo(0, 6)
    expect(box.maxMm[2]).toBeCloseTo(40, 6)
  })

  it('translates in the working plane only, leaving the resting height alone', () => {
    const out = createBoxMm()
    boxAtPoint(ghostBoxAtOrigin('primitive.cuboid'), { x: 100, y: -30 }, out)
    expect(out.minMm).toEqual([80, -50, 0])
    expect(out.maxMm).toEqual([120, -10, 40])
  })
})

describe('updateSnap — the ghost is pulled onto the nearest item, within tolerance', () => {
  it('snaps both axes onto the reference and reports a guide for each', () => {
    const state = createSnapState()
    updateSnap(cubeBox(15, 0), cubeBox(0, 0), 20, state)
    expect(state.snapped).toBe(true)
    // X: centre alignment wins on a tie with the two flush-face candidates
    // (same-size boxes make all three identical), and centre is first in
    // preference order — so this is deterministic, not arbitrary.
    expect(state.dxMm).toBeCloseTo(-15, 9)
    expect(state.dyMm).toBeCloseTo(0, 9)
    expect(state.guides.map((guide) => guide.visible)).toEqual([true, true])
    expect(state.guides.map((guide) => guide.kind)).toEqual(['center', 'center'])
  })

  it('draws each guide along the reference feature, spanning out to the ghost', () => {
    const state = createSnapState()
    // Beside the reference and a little above it: X centre-aligns (−15 mm away),
    // Y lands on the reference's near face (−5 mm away, a touching alignment).
    updateSnap(cubeBox(15, 45), cubeBox(0, 0), 20, state)
    expect(state.snapped).toBe(true)
    expect(state.dxMm).toBeCloseTo(-15, 9)
    expect(state.dyMm).toBeCloseTo(-5, 9)
    const [guideX, guideY] = state.guides
    expect(guideX.visible).toBe(true)
    expect(guideY.visible).toBe(true)
    expect([guideX.kind, guideY.kind]).toEqual(['center', 'edge'])

    // A line of constant X on the reference's centre line, running from the
    // reference's own far edge out past the ghost's — the union of the two
    // boxes on that axis (−20 … 60), plus one tolerance of overhang at each end
    // so the line reads as a guide rather than as an edge of the solid.
    expect(guideX.x1Mm).toBeCloseTo(0, 9)
    expect(guideX.x2Mm).toBeCloseTo(0, 9)
    expect(Math.min(guideX.y1Mm, guideX.y2Mm)).toBeCloseTo(-40, 9)
    expect(Math.max(guideX.y1Mm, guideX.y2Mm)).toBeCloseTo(80, 9)
    // And a line of constant Y along the reference's own max face.
    expect(guideY.y1Mm).toBeCloseTo(20, 9)
    expect(guideY.y2Mm).toBeCloseTo(20, 9)
    expect(Math.min(guideY.x1Mm, guideY.x2Mm)).toBeCloseTo(-40, 9)
    expect(Math.max(guideY.x1Mm, guideY.x2Mm)).toBeCloseTo(40, 9)
    // On the working plane the two solids rest on, not floating at mid-height.
    expect(guideX.zMm).toBeCloseTo(0, 9)
  })

  it('will not snap to an item the ghost is nowhere near, however well aligned', () => {
    // The proximity gate. Perfectly centred on the reference's X, but 180 mm up
    // the Y axis from it: §7a asks for a snap within a tolerance *radius* "on
    // approach", and without this a drop at the far corner of the grid gets
    // silently shifted into line with something the user was not aiming at.
    const state = createSnapState()
    updateSnap(cubeBox(0, 200), cubeBox(0, 0), 20, state)
    expect(state.snapped).toBe(false)
    expect(state.dxMm).toBe(0)
    expect(state.guides.map((guide) => guide.visible)).toEqual([false, false])
  })

  it('measures the gap as zero for extents that overlap or merely touch', () => {
    expect(gapMm(0, 10, 5, 20)).toBe(0)
    expect(gapMm(0, 10, 10, 20)).toBe(0)
    expect(gapMm(0, 10, -100, 100)).toBe(0)
    expect(gapMm(0, 10, 14, 20)).toBeCloseTo(4, 9)
    expect(gapMm(30, 40, 0, 10)).toBeCloseTo(20, 9)
  })

  it('leaves a far-away ghost exactly where the pointer put it', () => {
    const state = createSnapState()
    updateSnap(cubeBox(75, 75), cubeBox(0, 0), 10, state)
    expect(state.snapped).toBe(false)
    expect(state.dxMm).toBe(0)
    expect(state.dyMm).toBe(0)
    expect(state.guides.map((guide) => guide.visible)).toEqual([false, false])
  })

  it('snaps exactly at the tolerance boundary, and not a hair past it', () => {
    // At (75, 75) the closest alignment on either axis is the touching-face
    // one, 35 mm away: 20 (reference max) − 55 (ghost min).
    const atBoundary = createSnapState()
    updateSnap(cubeBox(75, 75), cubeBox(0, 0), 35, atBoundary)
    expect(atBoundary.snapped).toBe(true)
    expect(atBoundary.dxMm).toBeCloseTo(-35, 9)
    expect(atBoundary.guides[0].kind).toBe('edge')

    const justOutside = createSnapState()
    updateSnap(cubeBox(75, 75), cubeBox(0, 0), 34.999, justOutside)
    expect(justOutside.snapped).toBe(false)
  })

  it('never snaps when the tolerance is zero — no scale, no assistance', () => {
    const state = createSnapState()
    updateSnap(cubeBox(0.001, 0), cubeBox(0, 0), 0, state)
    expect(state.snapped).toBe(false)
    expect(state.dxMm).toBe(0)
  })

  it('clears back to an un-snapped state, so a stale guide can never linger', () => {
    const state = createSnapState()
    updateSnap(cubeBox(15, 0), cubeBox(0, 0), 20, state)
    expect(state.snapped).toBe(true)
    clearSnap(state)
    expect(state.snapped).toBe(false)
    expect(state.dxMm).toBe(0)
    expect(state.dyMm).toBe(0)
    expect(state.guides.map((guide) => guide.visible)).toEqual([false, false])
  })

  it('allocates nothing per call: the same arrays are mutated in place', () => {
    // CLAUDE.md's Performance rule — this runs on every `pointermove` of a drag.
    const state = createSnapState()
    const guides = state.guides
    const firstGuide = state.guides[0]
    updateSnap(cubeBox(15, 0), cubeBox(0, 0), 20, state)
    updateSnap(cubeBox(400, 400), cubeBox(0, 0), 20, state)
    expect(state.guides).toBe(guides)
    expect(state.guides[0]).toBe(firstGuide)
  })
})

describe('the guide overhang — found by driving the app, not by reading the maths', () => {
  it('extends a centred guide past the solids, so it is not a stub under them', () => {
    // When the ghost centres on the reference the two boxes coincide, and a
    // guide spanning only their union is exactly as long as the solid it is
    // drawn on top of — correct, and invisible. This is the regression test for
    // that: the line has to run visibly past both.
    const state = createSnapState()
    updateSnap(cubeBox(0, 0), cubeBox(0, 0), 20, state)
    expect(state.snapped).toBe(true)
    const [guideX] = state.guides
    const spanMm = Math.abs(guideX.y2Mm - guideX.y1Mm)
    const solidMm = 40
    expect(spanMm).toBeGreaterThan(solidMm)
    // One tolerance past each end: 40 mm of solid plus 2 × 20 mm.
    expect(spanMm).toBeCloseTo(80, 9)
  })

  it('scales the overhang with the tolerance, so it looks the same at any zoom', () => {
    const near = createSnapState()
    const far = createSnapState()
    updateSnap(cubeBox(0, 0), cubeBox(0, 0), 10, near)
    updateSnap(cubeBox(0, 0), cubeBox(0, 0), 40, far)
    expect(Math.abs(near.guides[0].y2Mm - near.guides[0].y1Mm)).toBeCloseTo(60, 9)
    expect(Math.abs(far.guides[0].y2Mm - far.guides[0].y1Mm)).toBeCloseTo(120, 9)
  })
})
