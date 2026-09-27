import { describe, expect, it } from 'vitest'

import { createDocument } from './document.js'
import { recordForDrop } from './library.js'
import { describeBody, describeSelection, describeSubPart } from './inspector.js'
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
    // The Inspector must degrade to showing what the record carries rather than
    // throwing, which would take the whole panel down with it.
    //
    // This case has now moved twice, and for the same reason both times: it needs
    // an op that *genuinely* has no `ui` metadata, or it stops testing the
    // fallback at all. It used `hardware.bolt` until `ui-030` gave that metadata,
    // then `kit.board` until `ui-031` gave the whole kit/rpi catalogue theirs.
    // `profile.roundedRectangle` is now the only 0-operand op in the registry
    // with none — it is a 2D building block that no Library row offers — so it is
    // both the honest choice and, if it ever gains a row, the signal to move this
    // test again rather than let it quietly assert nothing.
    const document = createDocument()
    const record = {
      id: 'profile-1',
      op: 'profile.roundedRectangle',
      name: 'Profile 1',
      params: { size: [40, 30], roundRadius: 3 },
    }
    document.append(record, { origin: 'local' })
    const description = describeBody(document.bodies()[0])

    expect(description.opLabel).toBe('profile.roundedRectangle')
    expect(description.params.map((field) => field.key)).toEqual(['size', 'roundRadius'])
  })

  it('shows a hardware recipe under its own label and schema order (TODO/ui-030)', () => {
    const document = createDocument()
    document.append(
      {
        id: 'bolt-1',
        op: 'hardware.bolt',
        name: 'Bolt 1',
        params: { spec: 'm10 hex', length: 20, fit: 'close' },
      },
      { origin: 'local' }
    )
    const description = describeBody(document.bodies()[0])

    // The row's own label, not the registry key — the panel offers "Bolt".
    expect(description.opLabel).toBe('Bolt')
    // The registry schema's key order, which is the order the row's defaults
    // name them in, rather than whatever order the record happens to carry.
    expect(description.params.map((field) => field.key)).toEqual(['spec', 'length', 'fit'])
    const spec = present(description.params.find((field) => field.key === 'spec'))
    expect(spec.kind).toBe('text')
    expect(spec.value).toBe('m10 hex')
  })

  it('reports a recipe s own recipe colour for a single-visible-part composite, whole-body (TODO/render-003)', () => {
    // A washer has exactly one visible part (`washer`; `clearance` is hidden), so
    // "the whole body" and "that one part" are the same thing on screen — the
    // Inspector's whole-body swatch can show the recipe's own colour rather than
    // the generic theme default.
    const document = createDocument()
    document.append(
      { id: 'washer-1', op: 'hardware.washer', name: 'Washer 1', params: { spec: 'm6' } },
      { origin: 'local' },
    )
    const description = describeBody(document.bodies()[0])
    expect(description.recipeColor).toEqual({ color: 0x808080 })
  })

  it('reports no whole-body recipe colour for a multi-part composite: nothing to average (TODO/render-003)', () => {
    const document = createDocument()
    document.append(
      { id: 'bolt-1', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm10 hex', length: 20 } },
      { origin: 'local' },
    )
    const description = describeBody(document.bodies()[0])
    expect(description.recipeColor).toBeUndefined()
  })

  it('a bare primitive has no recipe colour at all (TODO/render-003)', () => {
    const { body } = placed('primitive.cuboid')
    expect(describeBody(body).recipeColor).toBeUndefined()
  })
})

describe('describeSubPart — a recipe s own colour for one named part (TODO/render-003)', () => {
  it('reports the drilled-into part s own recipe colour', () => {
    const document = createDocument()
    document.append(
      { id: 'bolt-1', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm10 hex', length: 20 } },
      { origin: 'local' },
    )
    const body = document.bodies()[0]
    expect(describeSubPart(body, 'head', document.records).recipeColor).toEqual({ color: 0x808080 })
    expect(describeSubPart(body, 'thread', document.records).recipeColor).toEqual({ color: 0xc0c0c0 })
    expect(describeSubPart(body, 'tap', document.records).recipeColor).toEqual({ color: 0xff0000 })
  })
})

describe('describeBody — parts (TODO/ui-049, superseding ui-047 hiddenParts)', () => {
  /** @param {{ name: string, hidden: boolean }[]} parts */
  const hiddenNames = (parts) => parts.filter((part) => part.hidden).map((part) => part.name)

  it('lists every part of a Raspberry Pi in group order — visible first, then hidden — each flagged', () => {
    const document = createDocument()
    document.append({ id: 'pi-1', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: {} }, { origin: 'local' })
    const description = describeBody(document.bodies()[0])
    expect(description.parts).toEqual([
      ...['mb', 'ethernet', 'usb1', 'usb2', 'microusb', 'hdmi', 'avjack', 'camera', 'display', 'gpio', 'activityled', 'powerled', 'microsd'].map(
        (name) => ({ name, hidden: false }),
      ),
      ...['usb1-body', 'usb1-flange', 'usb2-body', 'usb2-flange', 'avjack-block', 'avjack-barrel', 'hole1', 'hole2', 'hole3', 'hole4'].map(
        (name) => ({ name, hidden: true }),
      ),
    ])
    // The same 23 rows the Objects list's ▸ shows (ui-042), 10 of them hidden.
    expect(description.parts).toHaveLength(23)
    expect(hiddenNames(description.parts)).toHaveLength(10)
  })

  it('lists a bolt s visible head and thread, then its four hidden tap parts in group order', () => {
    const document = createDocument()
    document.append(
      { id: 'bolt-1', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm10 hex', length: 20 } },
      { origin: 'local' },
    )
    const description = describeBody(document.bodies()[0])
    expect(description.parts).toEqual([
      { name: 'head', hidden: false },
      { name: 'thread', hidden: false },
      { name: 'tap-head', hidden: true },
      { name: 'tap-thread', hidden: true },
      { name: 'tap-headClearSpace', hidden: true },
      { name: 'tap', hidden: true },
    ])
  })

  it('flags a washer s clearance as its one hidden part', () => {
    const document = createDocument()
    document.append(
      { id: 'washer-1', op: 'hardware.washer', name: 'Washer 1', params: { spec: 'm6', fit: 'loose' } },
      { origin: 'local' },
    )
    expect(hiddenNames(describeBody(document.bodies()[0]).parts)).toEqual(['clearance'])
  })

  it('is empty for a Cube — a bare solid has no parts, so the Inspector has no Parts section', () => {
    const { body } = placed('primitive.cuboid')
    expect(describeBody(body).parts).toEqual([])
  })

  it('a washer with no fit has parts but none hidden', () => {
    const document = createDocument()
    document.append(
      { id: 'washer-1', op: 'hardware.washer', name: 'Washer 1', params: { spec: 'm6' } },
      { origin: 'local' },
    )
    const parts = describeBody(document.bodies()[0]).parts
    expect(parts.length).toBeGreaterThan(0)
    expect(hiddenNames(parts)).toEqual([])
  })

  it('no longer reports the hidden-only list it supersedes', () => {
    const { body } = placed('primitive.cuboid')
    expect('hiddenParts' in describeBody(body)).toBe(false)
  })

  it('describeSubPart reports no parts — a part has no parts of its own', () => {
    const document = createDocument()
    document.append(
      { id: 'bolt-1', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm10 hex', length: 20 } },
      { origin: 'local' },
    )
    const body = document.bodies()[0]
    expect(describeSubPart(body, 'head', document.records).parts).toEqual([])
  })
})

describe('describeBody — visibleParts (TODO/ui-050)', () => {
  it('lists a Raspberry Pi B+’s visible parts in group order, and never the hidden clearance', () => {
    const document = createDocument()
    document.append(
      { id: 'pi-1', op: 'raspberrypi.bplus', name: 'Raspberry Pi B+', params: { model: 4 } },
      { origin: 'local' },
    )
    const description = describeBody(document.bodies()[0])

    // `mb` (the board) is real, visible, and in the Reference dropdown.
    expect(description.visibleParts).toContain('mb')
    expect(description.visibleParts).toContain('microsd')
    // A hidden clearance part is never offered — the whole reason a Reference
    // picker exists is to measure from a *visible* part's own bounds.
    expect(description.visibleParts).not.toContain('clearance-ethernet')
    // The exact mirror image of the hidden parts, and disjoint from them.
    for (const name of description.parts.filter((part) => part.hidden).map((part) => part.name)) {
      expect(description.visibleParts).not.toContain(name)
    }
  })

  it('is empty for a Cube — a bare solid has no parts to offer as a Reference', () => {
    const { body } = placed('primitive.cuboid')
    expect(describeBody(body).visibleParts).toEqual([])
  })

  it('describeSubPart never reports visibleParts — a part has no parts of its own', () => {
    const document = createDocument()
    document.append(
      { id: 'bolt-1', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm10 hex', length: 20 } },
      { origin: 'local' },
    )
    const body = document.bodies()[0]
    expect(describeSubPart(body, 'head', document.records).visibleParts).toEqual([])
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

describe('describeSelection — drilled into a group s sub-part (TODO/ui-016)', () => {
  /**
   * Two placed cuboids combined by the Operations toolbar's Group button — the
   * exact record shape `OperationsToolbar.vue`'s `run()` appends, including the
   * `consumes`/`params.names` pairing this task's case 1 recovery reads.
   *
   * @param {{ move?: boolean }} [options] Move the first cube before grouping,
   *   so its terminal record is a `transform.translate` and the recovery has to
   *   walk `supersedes` back to the creation record rather than reading the
   *   operand id it was handed.
   */
  function groupedPair({ move = false } = {}) {
    const document = createDocument()
    document.append(recordForDrop('primitive.cuboid', { x: 0, y: 0 }, document), { origin: 'local' })
    document.append(recordForDrop('primitive.cylinder', { x: 200, y: 0 }, document), {
      origin: 'local',
    })
    const [first, second] = document.bodies()
    if (move) {
      document.append(translateRecord(document, first.id, [0, 0, 25]), { origin: 'local' })
    }
    const rootIds = [first.id, second.id]
    const names = document.bodies().map((body) => body.name)
    const id = document.nextId('group')
    const operandIds = rootIds.map((rootId) => document.currentIdOf(rootId) ?? rootId)
    document.append(
      {
        id,
        op: 'group.assemble',
        name: document.nextName('Group'),
        target: operandIds[0],
        operands: operandIds.slice(1),
        consumes: operandIds,
        params: { names },
      },
      { origin: 'local' },
    )
    return { document, groupId: id, names }
  }

  it('case 1: recovers the grouped body s own op and params, not the group s', () => {
    const { document, groupId, names } = groupedPair()
    const selection = describeSelection(document.bodies(), [groupId], {
      subPart: { bodyId: groupId, partName: names[1] },
      records: document.records,
    })

    const body = present(selection.body)
    expect(selection.state).toBe('single')
    expect(body.name).toBe(names[1])
    expect(body.op).toBe('primitive.cylinder')
    expect(present(body.subPart).partName).toBe(names[1])
    // The cylinder's own schema, read-only — not the group's `names` param.
    const keys = body.params.map((field) => field.key)
    expect(keys).toContain('diameter')
    expect(keys).toContain('height')
    expect(keys).not.toContain('names')
  })

  it('case 1: still recovers the creation record after the part was moved before grouping', () => {
    const { document, groupId, names } = groupedPair({ move: true })
    const selection = describeSelection(document.bodies(), [groupId], {
      subPart: { bodyId: groupId, partName: names[0] },
      records: document.records,
    })

    const body = present(selection.body)
    expect(body.op).toBe('primitive.cuboid')
    expect(body.params.map((field) => field.key)).toContain('size')
  })

  it('measures the sub-part s own box, not the whole group s', () => {
    const { document, groupId, names } = groupedPair()
    const whole = present(describeSelection(document.bodies(), [groupId]).body)
    const part = present(
      describeSelection(document.bodies(), [groupId], {
        subPart: { bodyId: groupId, partName: names[0] },
        records: document.records,
      }).body,
    )
    // The two cubes are 200 mm apart along X, so the combined box is far wider
    // than either part alone.
    expect(whole.sizeMm[0]).toBeGreaterThan(part.sizeMm[0] + 100)
    expect(part.sizeMm[0]).toBeCloseTo(40, 6)
  })

  it('case 2: a composite group with no consumed record falls back to bounds and name only', () => {
    // Built by hand rather than through `recordForDrop`: the kit recipes are
    // registry ops with no Library row yet (M2), and this case is about a Group
    // whose parts came from a recipe's own internal expansion — there is no
    // consumed top-level record to recover an op or params from.
    const document = createDocument()
    document.append(
      {
        id: 'board-1',
        op: 'kit.board',
        name: 'Board 1',
        params: { width: 40, height: 30, cornerRadius: 3, thickness: 1.6 },
      },
      { origin: 'local' },
    )
    const body = document.bodies()[0]
    const geometry = /** @type {any} */ (body.geometry)
    expect(Array.isArray(geometry.names)).toBe(true)
    const partName = geometry.names[0]

    const selection = describeSelection(document.bodies(), [body.id], {
      subPart: { bodyId: body.id, partName },
      records: document.records,
    })
    const described = present(selection.body)
    expect(described.name).toBe(partName)
    // No consumed top-level record exists for a recipe's internal expansion, so
    // there is nothing honest to show but the measurement.
    expect(described.params).toEqual([])
    expect(described.op).toBe('')
    expect(present(described.subPart).partName).toBe(partName)
    expect(described.sizeMm.every((value) => value > 0)).toBe(true)
  })

  it('throws on a part name the group does not have, rather than describing nothing', () => {
    const { document, groupId } = groupedPair()
    expect(() =>
      describeSelection(document.bodies(), [groupId], {
        subPart: { bodyId: groupId, partName: 'no-such-part' },
        records: document.records,
      }),
    ).toThrow(/no-such-part/)
  })

  it('ignores a sub-part left pointing at a body that is no longer the selection', () => {
    const { document, groupId, names } = groupedPair()
    const selection = describeSelection(document.bodies(), [groupId], {
      subPart: { bodyId: 'some-other-body', partName: names[0] },
      records: document.records,
    })
    // Falls straight back to the whole-group contract rather than throwing or
    // describing a part of something the user is not looking at.
    expect(present(selection.body).id).toBe(groupId)
    expect(present(selection.body).subPart).toBeUndefined()
  })

  it('leaves the ordinary single-body path untouched when no sub-part is active', () => {
    // ACCEPTANCE scenario 2's Inspector-fields contract: adding the argument
    // must not change what an ordinary selection describes.
    const { document, body } = placed('primitive.cylinder')
    const without = describeSelection(document.bodies(), [body.id])
    const withEmpty = describeSelection(document.bodies(), [body.id], {
      subPart: null,
      records: document.records,
    })
    expect(withEmpty).toEqual(without)
    expect(present(without.body).subPart).toBeUndefined()
  })
})
