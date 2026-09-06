import { describe, expect, it } from 'vitest'

import { createDocument } from './document.js'
import { recordForDrop } from './library.js'
import { describeBody, describeSelection } from './inspector.js'
import { rotateRecord, translateRecord } from './transform.js'
import { formatDeg, formatMm } from './units.js'

/**
 * What the Inspector panel shows for a selection (TODO/ui-011).
 *
 * The point of this module living in `src/core/` rather than inside
 * `Inspector.vue` is CLAUDE.md's registry-driven rule: the panel must not carry
 * one hardcoded form per primitive type. It reads the selected record's `op`,
 * looks the op's own `ui.defaults` schema up in the kernel registry, and turns
 * that into field descriptors — so registering an eighth primitive gives it a
 * correct Inspector with no change to any component, exactly the way
 * `src/core/library.js` already does for the Library panel's rows.
 */

/**
 * Assert a value is really there, and hand it back narrowed.
 *
 * `npm run typecheck` is a CI gate here (CLAUDE.md's Conventions), and an
 * optional field read straight off a descriptor is legitimately possibly-
 * undefined — this turns that into a real assertion rather than a silenced one.
 *
 * @template T
 * @param {T | undefined | null} value
 * @returns {T}
 */
function present(value) {
  expect(value !== undefined && value !== null).toBe(true)
  return /** @type {T} */ (value)
}

/**
 * Place one primitive and hand back the document body it produced — the same
 * path `Viewport.vue`'s drop commits through, so the description under test is
 * built from a genuinely-placed body rather than a hand-written literal.
 *
 * @param {string} op
 * @param {{ x: number, y: number }} [pointMm]
 * @param {Record<string, any>} [overrides]
 */
function placed(op, pointMm = { x: 0, y: 0 }, overrides = {}) {
  const document = createDocument()
  const record = recordForDrop(op, pointMm, document, overrides)
  document.append(record, { origin: 'local' })
  return { document, body: document.bodies()[0] }
}

describe('formatMm / formatDeg', () => {
  it('drops meaningless trailing decimals', () => {
    expect(formatMm(40)).toBe('40 mm')
    expect(formatMm(12.5)).toBe('12.5 mm')
    expect(formatMm(12.499999999)).toBe('12.5 mm')
    expect(formatMm(0)).toBe('0 mm')
  })

  it('never renders a floating-point artefact as a real dimension', () => {
    // 0.1 + 0.2 is the canonical case; a raw toString would put "0.30000000000000004 mm"
    // on screen next to a solid.
    expect(formatMm(0.1 + 0.2)).toBe('0.3 mm')
  })

  it('degrees carry their own unit', () => {
    expect(formatDeg(0)).toBe('0°')
    expect(formatDeg(-90)).toBe('-90°')
  })
})

describe('describeBody', () => {
  it('reads a cuboid s schema from the registry, not from a hardcoded form', () => {
    const { body } = placed('primitive.cuboid')
    const description = describeBody(body)

    expect(description.opLabel).toBe('Cube')
    expect(description.name).toBe('Cube 1')
    expect(description.params.map((field) => field.key)).toEqual(['size'])

    const [size] = description.params
    expect(size.kind).toBe('vector')
    expect(size.label).toBe('Size')
    const components = present(size.components)
    expect(components.map((component) => component.label)).toEqual(['X', 'Y', 'Z'])
    expect(components.map((component) => component.value)).toEqual([40, 40, 40])
  })

  it('renders a cylinder s own two scalar params, in the schema s order', () => {
    const { body } = placed('primitive.cylinder')
    const description = describeBody(body)

    expect(description.opLabel).toBe('Cylinder')
    expect(description.params.map((field) => field.key)).toEqual(['diameter', 'height'])
    expect(description.params.map((field) => field.kind)).toEqual(['number', 'number'])
    expect(description.params.map((field) => field.value)).toEqual([40, 50])
    expect(description.params.map((field) => field.label)).toEqual(['Diameter', 'Height'])
  })

  it('gives every one of the seven primitives a non-empty field list', () => {
    // The generic-mechanism claim, checked rather than asserted: no primitive
    // may fall through to an empty Inspector.
    for (const op of [
      'primitive.cuboid',
      'primitive.cylinder',
      'primitive.cone',
      'primitive.hexagon',
      'primitive.triangle',
      'primitive.tube',
      'primitive.sphere',
    ]) {
      const { body } = placed(op)
      const description = describeBody(body)
      expect(description.params.length).toBeGreaterThan(0)
      for (const field of description.params) {
        expect(field.label).not.toBe('')
        if (field.kind === 'number') expect(Number.isFinite(field.value)).toBe(true)
        else for (const component of present(field.components)) expect(Number.isFinite(component.value)).toBe(true)
      }
    }
  })

  it('splits a multi-word param name into a readable label', () => {
    const { body } = placed('primitive.tube')
    const description = describeBody(body)
    const labels = description.params.map((field) => field.label)

    expect(labels).toContain('Inner diameter')
    expect(labels).not.toContain('innerDiameter')
  })

  it('labels a triangle s side lengths A/B/C rather than as axes', () => {
    // `sides` is a 3-vector like `size`, but its components are edge lengths,
    // not X/Y/Z extents — labelling them as axes would be a lie on screen.
    const { body } = placed('primitive.triangle')
    const description = describeBody(body)
    const sides = present(description.params.find((field) => field.key === 'sides'))

    expect(present(sides.components).map((component) => component.label)).toEqual(['A', 'B', 'C'])
  })

  it('never shows center or segments as an editable parameter', () => {
    // `center` is the body s position and belongs to the Transform section;
    // `segments` is a tessellation detail, not a dimension of the part.
    const { body } = placed('primitive.sphere', { x: 10, y: 20 })
    const description = describeBody(body)
    const keys = description.params.map((field) => field.key)

    expect(keys).not.toContain('center')
    expect(keys).not.toContain('segments')
  })

  it('surfaces an optional param the record actually carries even though the defaults omit it', () => {
    // A cone with a `topDiameter` is a frustum. The registry s defaults do not
    // mention it, so a schema read from defaults alone would silently hide a
    // value that is genuinely shaping the solid.
    const { body } = placed('primitive.cone', { x: 0, y: 0 }, { topDiameter: 12 })
    const description = describeBody(body)
    const top = present(description.params.find((field) => field.key === 'topDiameter'))

    expect(top.value).toBe(12)
    expect(top.label).toBe('Top diameter')
  })

  it('reports position from the evaluated solid, not from the raw param', () => {
    // A cylinder dropped at (30, -12) rests *on* the grid, so its centre sits
    // half its height up — the number the Transform section has to show is the
    // real one, measured off the geometry.
    const { body } = placed('primitive.cylinder', { x: 30, y: -12 })
    const description = describeBody(body)

    expect(description.positionMm[0]).toBeCloseTo(30, 6)
    expect(description.positionMm[1]).toBeCloseTo(-12, 6)
    expect(description.positionMm[2]).toBeCloseTo(25, 6)
  })

  it('reports the solid s millimetre size and bounding box', () => {
    const { body } = placed('primitive.cuboid', { x: 0, y: 0 })
    const description = describeBody(body)

    expect(description.sizeMm[0]).toBeCloseTo(40, 6)
    expect(description.sizeMm[1]).toBeCloseTo(40, 6)
    expect(description.sizeMm[2]).toBeCloseTo(40, 6)
    expect(description.boundsMm[0][2]).toBeCloseTo(0, 6)
    expect(description.boundsMm[1][2]).toBeCloseTo(40, 6)
  })

  it('reports a rotation of zero until something can actually rotate a body', () => {
    // Honest rather than absent: the Transform section shows real current
    // values, and nothing in the registry can rotate a body yet, so every
    // placed body genuinely is unrotated. `ui-012` writes here.
    const { body } = placed('primitive.cuboid')
    expect(describeBody(body).rotationDeg).toEqual([0, 0, 0])
  })

  it('measures an unrotated body s local box as exactly its world box', () => {
    // The local frame only diverges once something turns the body. Until then
    // the two measurements must agree exactly, or every existing dimension-line
    // expectation quietly shifts.
    const { body } = placed('primitive.cylinder', { x: 30, y: -12 })
    const description = describeBody(body)

    expect(description.localSizeMm[0]).toBeCloseTo(description.sizeMm[0], 9)
    expect(description.localSizeMm[1]).toBeCloseTo(description.sizeMm[1], 9)
    expect(description.localSizeMm[2]).toBeCloseTo(description.sizeMm[2], 9)
    expect(description.localBoundsMm[0][2]).toBeCloseTo(description.boundsMm[0][2], 9)
    expect(description.localBoundsMm[1][2]).toBeCloseTo(description.boundsMm[1][2], 9)
  })

  it('inverts a known transform.rotate record back to the part s own size', () => {
    // The finding's own example: a ⌀40 × 50 cylinder tilted 30° about X. Its
    // world AABB grows on Y and Z and stops carrying a readable diameter or
    // length; its local box must still read 40 / 40 / 50.
    const { document, body } = placed('primitive.cylinder')
    document.append(rotateRecord(document, body.id, [30, 0, 0]), { origin: 'local' })
    const description = describeBody(document.bodies()[0])

    expect(description.rotationDeg).toEqual([30, 0, 0])
    expect(description.localSizeMm[0]).toBeCloseTo(40, 5)
    expect(description.localSizeMm[1]).toBeCloseTo(40, 5)
    expect(description.localSizeMm[2]).toBeCloseTo(50, 5)

    // ...and the world box really is the larger shadow, so the two measurements
    // are genuinely different things rather than the same number twice.
    expect(description.sizeMm[1]).toBeGreaterThan(50)
    expect(description.sizeMm[2]).toBeGreaterThan(55)
  })

  it('inverts a rotation about every axis, in the kernel s own z-y-x order', () => {
    // A 20 × 40 × 60 block, so a wrong axis order cannot hide behind equal
    // extents. Applied X, then Y, then Z — the order in which the carried
    // `rotationDeg` sum is exactly the composed Tait-Bryan rotation.
    const { document, body } = placed('primitive.cuboid', { x: 0, y: 0 }, { size: [20, 40, 60] })
    /** @type {[number, number, number][]} */
    const turns = [
      [30, 0, 0],
      [0, 40, 0],
      [0, 0, 50],
    ]
    for (const angles of turns) {
      document.append(rotateRecord(document, body.id, angles), { origin: 'local' })
    }
    const description = describeBody(document.bodies()[0])

    expect(description.rotationDeg).toEqual([30, 40, 50])
    expect(description.localSizeMm[0]).toBeCloseTo(20, 5)
    expect(description.localSizeMm[1]).toBeCloseTo(40, 5)
    expect(description.localSizeMm[2]).toBeCloseTo(60, 5)
  })

  it('measures an out-of-order Y-then-X history as the part s own size (TODO/core-004)', () => {
    // This test used to pin the *limit* of the measurement: `rotationDeg` was a
    // carried sum of deltas while the geometry was their composition, so the
    // un-turn by `R(rotationDeg)` was the true inverse only for a single-axis
    // history or one applied X-then-Y-then-Z. Turning about Y and *then* X made
    // the un-turn miss, and this ⌀40 × 50 cylinder measured 46.82 / 51.05 / 59.42
    // — three numbers, not one of them a dimension of the part.
    //
    // `core-004` composes instead of adding, so the carried rotation is now the
    // orientation the solid is genuinely in and the inverse is the true inverse.
    // The sharpest available proof this finding is fixed.
    const { document, body } = placed('primitive.cylinder')
    document.append(rotateRecord(document, body.id, [0, 45, 0]), { origin: 'local' })
    document.append(rotateRecord(document, body.id, [45, 0, 0]), { origin: 'local' })
    const description = describeBody(document.bodies()[0])

    expect(description.localSizeMm[0]).toBeCloseTo(40, 5)
    expect(description.localSizeMm[1]).toBeCloseTo(40, 5)
    expect(description.localSizeMm[2]).toBeCloseTo(50, 5)

    // The carried triple is no longer the sum it used to be — asserted out loud,
    // because "the sizes are right" would also be true if nothing had changed and
    // the cylinder had happened to land somewhere forgiving.
    expect(description.rotationDeg).not.toEqual([45, 45, 0])
    // ...and the world box really is the larger shadow, so these are still two
    // genuinely different measurements rather than the same number twice.
    expect(description.sizeMm[2]).toBeGreaterThan(50)
  })

  it('measures an out-of-order Z-then-X history as the part s own size (TODO/core-004)', () => {
    // The reproduction the finding was actually filed from, and the one a user
    // reaches by dragging the Z rotate ring and then the X rotate ring. Its old
    // failure was milder only by luck — 90° turns map axes onto axes, so an
    // inverse wrong by a whole quarter-turn still landed on an axis-aligned box
    // and reported 50 / 40 / 40: the right three numbers attributed to the wrong
    // local axes. Nothing but the axis *order* was wrong, which is exactly the
    // kind of failure a size-only assertion sails past, so the axes are checked
    // individually here rather than as a set.
    const { document, body } = placed('primitive.cylinder')
    document.append(rotateRecord(document, body.id, [0, 0, 90]), { origin: 'local' })
    document.append(rotateRecord(document, body.id, [90, 0, 0]), { origin: 'local' })
    const description = describeBody(document.bodies()[0])

    expect(description.localSizeMm[0]).toBeCloseTo(40, 5)
    expect(description.localSizeMm[1]).toBeCloseTo(40, 5)
    expect(description.localSizeMm[2]).toBeCloseTo(50, 5)
    expect(description.rotationDeg).not.toEqual([90, 0, 90])
  })

  it('measures a mixed out-of-order history on an unequal block, where no axis can hide', () => {
    // A cylinder is symmetric about its own axis, so two of its three numbers are
    // equal and a swap between them is invisible. A 20 × 40 × 60 block has three
    // distinct extents, so the local box has to come back with each one on the
    // right axis or this fails.
    const { document, body } = placed('primitive.cuboid', { x: 0, y: 0 }, { size: [20, 40, 60] })
    /** @type {[number, number, number][]} */
    const turns = [
      [0, 0, 35],
      [20, 0, 0],
      [0, -50, 0],
      [15, 0, 0],
    ]
    for (const angles of turns) {
      document.append(rotateRecord(document, body.id, angles), { origin: 'local' })
    }
    const description = describeBody(document.bodies()[0])

    expect(description.localSizeMm[0]).toBeCloseTo(20, 5)
    expect(description.localSizeMm[1]).toBeCloseTo(40, 5)
    expect(description.localSizeMm[2]).toBeCloseTo(60, 5)
  })

  it('reports the same local size wherever the rotated body is moved to', () => {
    // Translation must not skew the un-rotation: the inverse turns about the
    // body's own centre, not the world origin. Moving a tilted part 300 mm out
    // and 120 mm up must not change a single one of its three numbers.
    const { document, body } = placed('primitive.cylinder')
    document.append(rotateRecord(document, body.id, [30, 0, 0]), { origin: 'local' })
    const before = describeBody(document.bodies()[0]).localSizeMm

    document.append(translateRecord(document, body.id, [300, -220, 120]), { origin: 'local' })
    const after = describeBody(document.bodies()[0])

    expect(after.positionMm[0]).toBeCloseTo(300, 5)
    expect(after.localSizeMm[0]).toBeCloseTo(before[0], 9)
    expect(after.localSizeMm[1]).toBeCloseTo(before[1], 9)
    expect(after.localSizeMm[2]).toBeCloseTo(before[2], 9)
  })

  it('anchors the local box so its corners map back onto the real solid', () => {
    // `localBoundsMm` is expressed in a frame anchored at `positionMm`, which is
    // the *world AABB* centre — not necessarily the local box's own centre, as a
    // cone shows. Rotating the local corners back about that same pivot must
    // land inside the world box, or the drawn oriented box floats off the solid.
    const { document, body } = placed('primitive.cone')
    document.append(rotateRecord(document, body.id, [90, 0, 0]), { origin: 'local' })
    const description = describeBody(document.bodies()[0])
    const [localMin, localMax] = description.localBoundsMm
    const [worldMin, worldMax] = description.boundsMm
    const pivot = description.positionMm
    const rad = (Math.PI / 180) * description.rotationDeg[0]

    for (const lx of [localMin[0], localMax[0]]) {
      for (const ly of [localMin[1], localMax[1]]) {
        for (const lz of [localMin[2], localMax[2]]) {
          // Rx only, since the rotation here is about X alone.
          const vy = ly - pivot[1]
          const vz = lz - pivot[2]
          const world = [
            lx,
            pivot[1] + Math.cos(rad) * vy - Math.sin(rad) * vz,
            pivot[2] + Math.sin(rad) * vy + Math.cos(rad) * vz,
          ]
          for (let axis = 0; axis < 3; axis += 1) {
            expect(world[axis]).toBeGreaterThanOrEqual(worldMin[axis] - 1e-6)
            expect(world[axis]).toBeLessThanOrEqual(worldMax[axis] + 1e-6)
          }
        }
      }
    }
  })

  it('falls back to the raw params for an op with no ui schema', () => {
    // `hardware.bolt` is a composite with no `ui` metadata until ui-013 adds it.
    // The Inspector must degrade to showing what the record carries rather than
    // throwing, which would take the whole panel down with it.
    const document = createDocument()
    const record = {
      id: 'bolt-1',
      op: 'hardware.bolt',
      name: 'Bolt 1',
      params: { spec: 'm10 hex', length: 20, fit: 'close' },
    }
    document.append(record, { origin: 'local' })
    const description = describeBody(document.bodies()[0])

    expect(description.opLabel).toBe('hardware.bolt')
    expect(description.params.map((field) => field.key)).toEqual(['spec', 'length', 'fit'])
    const spec = present(description.params.find((field) => field.key === 'spec'))
    expect(spec.kind).toBe('text')
    expect(spec.value).toBe('m10 hex')
  })
})

describe('describeSelection', () => {
  it('is empty when nothing is selected', () => {
    const { document } = placed('primitive.cuboid')
    const selection = describeSelection(document.bodies(), [])

    expect(selection.state).toBe('empty')
    expect(selection.count).toBe(0)
    expect(selection.body).toBeNull()
  })

  it('describes the one body at a selection of exactly one', () => {
    const { document, body } = placed('primitive.cuboid')
    const selection = describeSelection(document.bodies(), [body.id])

    expect(selection.state).toBe('single')
    expect(selection.count).toBe(1)
    expect(present(selection.body).id).toBe(body.id)
  })

  it('shows no per-item fields at two or more, and does not carry a stale body', () => {
    // interaction-model-qa control 3, Q15: 2+ individually-selected items show
    // no per-item fields — there is no single object to describe — and the
    // previous single selection s fields must not linger.
    const document = createDocument()
    for (const op of ['primitive.cuboid', 'primitive.sphere']) {
      document.append(recordForDrop(op, { x: 0, y: 0 }, document), { origin: 'local' })
    }
    const bodies = document.bodies()
    const selection = describeSelection(bodies, [bodies[0].id, bodies[1].id])

    expect(selection.state).toBe('multi')
    expect(selection.count).toBe(2)
    expect(selection.body).toBeNull()
  })

  it('treats a selected id the document no longer has as nothing selected', () => {
    // A stale id must not crash the panel or describe a body that is gone.
    const { document } = placed('primitive.cuboid')
    const selection = describeSelection(document.bodies(), ['deleted-7'])

    expect(selection.state).toBe('empty')
    expect(selection.body).toBeNull()
  })
})
