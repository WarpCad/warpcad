import { describe, expect, it } from 'vitest'

import { boundsOf, isGroup, sizeOf, volumeOf } from '../group.js'
import { evaluateOp } from '../index.js'
import {
  cameraModule,
  CAMERA_MODULE_MODELS,
  DEFAULT_MODEL,
} from './raspberrypi.cameraModule.js'
import v1ReferenceJson from './__fixtures__/raspberrypi.cameraModule.v1-reference.json'

/**
 * The fixture, widened to the shape the diff below reads it through — the checked-in
 * JSON types as one giant literal otherwise, which cannot be indexed by a model name
 * computed at runtime.
 *
 * @type {{ models: Record<string, { names: string[], parts: Record<string, number[][]> }> }}
 */
const v1Reference = v1ReferenceJson

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('../group.js').Group} Group */

/**
 * @param {Geom3 | Group | undefined} value
 * @returns {Group}
 */
function asGroup(value) {
  if (!isGroup(value)) throw new Error('expected a Group, got bare geometry')
  return value
}

/**
 * @param {string} model
 * @param {boolean} [flipTripodMount]
 * @returns {Group}
 */
const camera = (model, flipTripodMount) =>
  asGroup(evaluateOp('raspberrypi.cameraModule', { model, flipTripodMount }))

/**
 * Bounding-box centre of one part on one axis — the measurement V1's `midlineTo`
 * positions by, and the datum every "the hole sits at (2, 2)" number in the camera
 * sources is quoted against.
 *
 * @param {Geom3} part
 * @param {0 | 1 | 2} axis
 * @returns {number}
 */
function midline(part, axis) {
  const [min, max] = boundsOf(part)
  return (min[axis] + max[axis]) / 2
}

/**
 * @param {Geom3} part
 * @param {readonly [number, number, number]} expected
 */
function expectSize(part, expected) {
  const actual = sizeOf(part)
  expect(actual[0]).toBeCloseTo(expected[0], 6)
  expect(actual[1]).toBeCloseTo(expected[1], 6)
  expect(actual[2]).toBeCloseTo(expected[2], 6)
}

/**
 * Where a part sits measured from the board's minimum corner — the frame every
 * V1 `.snap(board, 'xy', 'inside-').midlineTo('x', n)` chain actually quotes its
 * numbers in, even though the board itself is centred on the origin.
 *
 * @param {Group} group
 * @param {string} partName
 * @returns {[number, number]}
 */
function boardRelativeCentre(group, partName) {
  const [boardMin] = boundsOf(group.parts.board)
  return [
    midline(group.parts[partName], 0) - boardMin[0],
    midline(group.parts[partName], 1) - boardMin[1],
  ]
}

/** The four mounting-hole centres every classic variant shares, board-relative. */
const CLASSIC_HOLE_CENTRES_MM = [
  [2, 2],
  [2, 23],
  [14.5, 2],
  [14.5, 23],
]

const CLASSIC_MODELS = ['v1', 'v2', 'v3']
const HQ_MODELS = ['hq', 'arducam-hq']

describe('the cameraModule recipe expands into op records, it does not build a mesh', () => {
  it('emits only plain primitive/profile/transform/boolean/modify records', () => {
    for (const model of CAMERA_MODULE_MODELS) {
      const records = cameraModule({ model })
      expect(records.length).toBeGreaterThan(10)
      for (const record of records) {
        expect(record.op).toMatch(/^(primitive|profile|transform|boolean|modify)\./)
      }
    }
  })

  it('gives every record a unique id, so the fold can address each one', () => {
    for (const model of CAMERA_MODULE_MODELS) {
      const ids = cameraModule({ model }).map((record) => record.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('never references an id before the record that defines it', () => {
    for (const model of CAMERA_MODULE_MODELS) {
      /** @type {Set<string>} */
      const defined = new Set()
      for (const record of cameraModule({ model })) {
        const refs = /** @type {string[]} */ (
          [record.target, ...(record.operands ?? [])].filter((ref) => ref !== undefined)
        )
        for (const ref of refs) {
          expect(defined, `${model}: ${record.id} references ${String(ref)}`).toContain(ref)
        }
        expect(record.id, `${model}: a record was emitted with no id`).toBeTypeOf('string')
        defined.add(/** @type {string} */ (record.id))
      }
    }
  })

  it('rejects an unknown model by name rather than quietly building a v3', () => {
    // @ts-expect-error — the degenerate case is exactly an unlisted string arriving.
    expect(() => cameraModule({ model: 'v4' })).toThrow(/unknown model "v4"/)
    // @ts-expect-error
    expect(() => cameraModule({ model: 'v4' })).toThrow(/raspberrypi\.cameraModule/)
    // @ts-expect-error
    expect(() => cameraModule({ model: 2 })).toThrow(/unknown model/)
  })

  it('defaults to a real model, so the op is usable with no params at all', () => {
    expect(CAMERA_MODULE_MODELS).toContain(DEFAULT_MODEL)
    expect(cameraModule({}).length).toBe(cameraModule({ model: DEFAULT_MODEL }).length)
  })
})

describe('the board, per variant', () => {
  /** @type {[string, [number, number, number]][]} */
  const boards = [
    // camera-module-v1.js:33 — a plain Cube, the one variant with no rounding.
    ['v1', [24, 25, 1.1]],
    // camera-module-v2.js:18 — RoundedCube(23.862, 25, t, 2).
    ['v2', [23.862, 25, 1.1]],
    // camera-module-v3.js:32 — the board is 1.12 thick while `t` stays 1.1.
    ['v3', [23.862, 25, 1.12]],
    // hq_camera-module.js:47 / arducam_hq_camera-module.js:46 — 38 mm square.
    ['hq', [38, 38, 1.1]],
    ['arducam-hq', [38, 38, 1.6]],
  ]

  it.each(boards)('%s matches the source constants', (model, size) => {
    expectSize(camera(model).parts.board, size)
  })

  it.each(boards)('%s sits centred on xy with its underside on z = 0', (model, size) => {
    // `Parts.Cube(...).Center()` aligns on *xy only* (add-prototype.js:255 —
    // `align(unitCube(), axes || 'xy')`), so z is untouched and the board's
    // underside stays on the origin plane. Getting this wrong shifts every part.
    const [min, max] = boundsOf(camera(model).parts.board)
    expect(min[0]).toBeCloseTo(-size[0] / 2, 9)
    expect(max[0]).toBeCloseTo(size[0] / 2, 9)
    expect(min[1]).toBeCloseTo(-size[1] / 2, 9)
    expect(min[2]).toBeCloseTo(0, 9)
    expect(max[2]).toBeCloseTo(size[2], 9)
  })
})

describe('the classic variants’ four mounting holes', () => {
  it.each(CLASSIC_MODELS)('%s puts every hole centre on its stated pair', (model) => {
    const group = camera(model)
    CLASSIC_HOLE_CENTRES_MM.forEach(([x, y], index) => {
      const [actualX, actualY] = boardRelativeCentre(group, `hole${index}`)
      expect(actualX, `${model} hole${index} x`).toBeCloseTo(x, 9)
      expect(actualY, `${model} hole${index} y`).toBeCloseTo(y, 9)
    })
  })

  it.each(CLASSIC_MODELS)('%s holes are 2.2 mm across and as deep as the board', (model) => {
    const group = camera(model)
    const boardThicknessMm = sizeOf(group.parts.board)[2]
    for (let index = 0; index < 4; index += 1) {
      expectSize(group.parts[`hole${index}`], [2.2, 2.2, boardThicknessMm])
    }
  })

  it.each(CLASSIC_MODELS)('%s puts a mount and a pin concentric with every hole', (model) => {
    const group = camera(model)
    for (let index = 0; index < 4; index += 1) {
      for (const family of ['mount', 'pin']) {
        expect(midline(group.parts[`${family}${index}`], 0)).toBeCloseTo(
          midline(group.parts[`hole${index}`], 0),
          9
        )
        expect(midline(group.parts[`${family}${index}`], 1)).toBeCloseTo(
          midline(group.parts[`hole${index}`], 1),
          9
        )
      }
      // The mount stands on the board's top face; the pin is centred in the board.
      expect(boundsOf(group.parts[`mount${index}`])[0][2]).toBeCloseTo(
        boundsOf(group.parts.board)[1][2],
        9
      )
    }
  })
})

describe('the HQ variants’ four holes are rotated copies, measured not trusted', () => {
  it.each(HQ_MODELS)('%s puts the four holes 90° apart around the board centre', (model) => {
    const group = camera(model)
    // `hq_camera-module.js:57-59` builds hole1 and turns it by 90/180/-90. The turn
    // is about the *world* origin, which is the board's own centre here — a rotation
    // about each hole's own centre would leave all four stacked in one corner, and
    // that is exactly what this measures rather than assuming.
    const centres = [1, 2, 3, 4].map((n) => [
      midline(group.parts[`hole${n}`], 0),
      midline(group.parts[`hole${n}`], 1),
    ])
    const radii = centres.map(([x, y]) => Math.hypot(x, y))
    for (const radius of radii) expect(radius).toBeCloseTo(radii[0], 9)
    expect(radii[0]).toBeGreaterThan(15)

    const angles = centres.map(([x, y]) => (Math.atan2(y, x) * 180) / Math.PI)
    for (let n = 1; n < 4; n += 1) {
      const step = ((angles[n] - angles[n - 1] + 540) % 360) - 180
      expect(step, `${model} hole${n + 1} is not 90° from hole${n}`).toBeCloseTo(90, 6)
    }
    // Four distinct corners, not four copies of one.
    expect(new Set(centres.map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`)).size).toBe(4)
  })

  it.each(HQ_MODELS)('%s keeps every hole the same size through the rotation', (model) => {
    const group = camera(model)
    for (let n = 1; n <= 4; n += 1) expectSize(group.parts[`hole${n}`], [3.25, 3.25, 10])
  })
})

describe('the lens mount ring is a subtraction that does not shrink its own box', () => {
  /** @type {[string, number, number, number][]} */
  const rings = [
    // hq_camera-module.js:68-77 — Cylinder(36, 10.2) minus Cylinder(30.75, 10.2).
    ['hq', 36, 30.75, 10.2],
    // arducam_hq_camera-module.js:67-76 — Cylinder(30, 13) minus Cylinder(24.5, 13).
    ['arducam-hq', 30, 24.5, 13],
  ]

  it.each(rings)('%s mount keeps the ring’s outer diameter', (model, outer, inner, height) => {
    const group = camera(model)
    expectSize(group.parts.mount, [outer, outer, height])
    // `mount-clearance` is V1's un-subtracted cylinder: same box, more volume.
    expectSize(group.parts['mount-clearance'], [outer, outer, height])
    expect(volumeOf(group.parts.mount)).toBeLessThan(volumeOf(group.parts['mount-clearance']))
    // The bore really is the inner diameter, not merely "smaller".
    const ringArea = volumeOf(group.parts.mount) / height
    const expectedArea = (Math.PI / 4) * (outer ** 2 - inner ** 2)
    expect(ringArea / expectedArea).toBeCloseTo(1, 1)
  })

  it('hq unions the tripod mount base and post into one visible part', () => {
    const group = camera('hq')
    const [baseMin] = boundsOf(group.parts['tripodMount-base'])
    const [postMin, postMax] = boundsOf(group.parts['tripodMount-post'])
    const [unionMin, unionMax] = boundsOf(group.parts.tripodMount)
    expect(unionMin[1]).toBeCloseTo(postMin[1], 9)
    expect(unionMax[1]).toBeCloseTo(boundsOf(group.parts['tripodMount-base'])[1][1], 9)
    expect(unionMin[2]).toBeCloseTo(Math.min(baseMin[2], postMin[2]), 9)
    expect(unionMax[2]).toBeCloseTo(
      Math.max(boundsOf(group.parts['tripodMount-base'])[1][2], postMax[2]),
      9
    )
  })

  it('hq flips the tripod post to the other face when asked', () => {
    // `hq_camera-module.js:89` — the one V1 param this port carries besides `model`.
    const upright = boundsOf(camera('hq', false).parts.tripodMount)
    const flipped = boundsOf(camera('hq', true).parts.tripodMount)
    expect(flipped[0][2]).toBeGreaterThan(upright[0][2])
    expect(flipped[1][2]).toBeGreaterThan(upright[1][2])
  })

  it('arducam-hq has no tripod mount at all', () => {
    const group = camera('arducam-hq')
    expect(group.parts.tripodMount).toBeUndefined()
    expect(group.names).not.toContain('tripodMount')
  })
})

describe('the -nogo keep-out volumes', () => {
  /** @type {[string, [number, number, number]][]} */
  const ribbonNogos = [
    // v1/v2/v3: ribbon.enlarge(2, -1, -1), snapped past the ribbon's +x face.
    ['v1', [2, -1, -1]],
    ['v2', [2, -1, -1]],
    ['v3', [2, -1, -1]],
    // hq/arducam: ribbon.enlarge(2, 4, -1), snapped past the ribbon's +y face.
    ['hq', [2, 4, -1]],
    ['arducam-hq', [2, 4, -1]],
  ]

  it.each(ribbonNogos)('%s ribbon-nogo is the ribbon grown by its stated delta', (model, delta) => {
    const group = camera(model)
    const ribbon = sizeOf(group.parts.ribbon)
    expectSize(group.parts['ribbon-nogo'], [
      ribbon[0] + delta[0],
      ribbon[1] + delta[1],
      ribbon[2] + delta[2],
    ])
  })

  it.each(['v1', 'v2', 'v3'])('%s ribbon-nogo sits clear of the ribbon’s +x face', (model) => {
    const group = camera(model)
    expect(boundsOf(group.parts['ribbon-nogo'])[0][0]).toBeCloseTo(
      boundsOf(group.parts.ribbon)[1][0],
      9
    )
  })

  it.each(HQ_MODELS)('%s ribbon-nogo sits clear of the ribbon’s -y face', (model) => {
    const group = camera(model)
    expect(boundsOf(group.parts['ribbon-nogo'])[1][1]).toBeCloseTo(
      boundsOf(group.parts.ribbon)[0][1],
      9
    )
  })

  it.each(CLASSIC_MODELS)('%s bottom-nogo really has the enlarged holes cut out', (model) => {
    const group = camera(model)
    const [min, max] = boundsOf(group.parts['bottom-nogo'])
    const size = sizeOf(group.parts['bottom-nogo'])
    // 5.5 mm narrower than the board — the ribbon's own strip is left out.
    expect(size[0]).toBeCloseTo(sizeOf(group.parts.board)[0] - 5.5, 9)
    expect(size[1]).toBeCloseTo(25, 9)
    expect(size[2]).toBeCloseTo(1.4, 9)
    // It hangs off the board's underside.
    expect(max[2]).toBeCloseTo(boundsOf(group.parts.board)[0][2], 9)
    expect(min[0]).toBeCloseTo(boundsOf(group.parts.board)[0][0], 9)
    // A plain slab of the same box would be 5.5 * 18.x * 1.4 mm³; the cut-outs make
    // it strictly smaller without moving the box.
    expect(volumeOf(group.parts['bottom-nogo'])).toBeLessThan(size[0] * size[1] * size[2])
  })

  it.each(CAMERA_MODULE_MODELS)('%s keeps every -nogo volume out of the visible set', (model) => {
    // V1 is inconsistent here — v3 hides both (`camera-module-v3.js:107,116`) while
    // v1/v2/hq/arducam leave them visible. A keep-out volume is not renderable
    // geometry, so this port hides them all, matching `hardware.bolt`'s `tap-*`.
    for (const name of camera(model).names) expect(name).not.toMatch(/-nogo$/)
  })
})

describe('per-variant details worth naming', () => {
  it('v2 stretches the lens ribbon along x after placing it', () => {
    // `camera-module-v2.js:84` — Cube({x: 4, ...}).stretch('x', 4). `stretchAtPlane`
    // cuts at the centre plane and pushes the +x half out, so the -x face stays put
    // and the part ends up 8 mm wide. Placement happened at 4 mm wide, so the two
    // cannot be folded into one 8 mm cuboid up front.
    const group = camera('v2')
    expectSize(group.parts.lensribbon, [8, 9, 2.65 - 1.1])
    const [boardMin] = boundsOf(group.parts.board)
    expect(boundsOf(group.parts.lensribbon)[0][0] - boardMin[0]).toBeCloseTo(4.7 - 2, 9)
  })

  it('v1 uses a cuboid lens while v2 and v3 use a barrel', () => {
    const v1 = sizeOf(camera('v1').parts.lens)
    expect(v1[0]).toBeCloseTo(8.5, 9)
    expect(v1[1]).toBeCloseTo(8.5, 9)
    expectSize(camera('v2').parts.lens, [7.3, 7.3, 1.6])
    expectSize(camera('v3').parts.lens, [8.1, 8.1, 6.98 - 3.875])
  })

  it('v3’s pins are 1.1 mm long inside a 1.12 mm board, so they float', () => {
    // `camera-module-v3.js:50` uses `height.board` (t = 1.1) while the board itself
    // is 1.12 thick — a real 0.01 mm gap at each face, not a rounding artefact.
    const group = camera('v3')
    expect(sizeOf(group.parts.pin0)[2]).toBeCloseTo(1.1, 9)
    expect(boundsOf(group.parts.pin0)[0][2]).toBeCloseTo(0.01, 9)
  })

  it('every classic variant sits its sensor at the same board-relative midline', () => {
    for (const model of CLASSIC_MODELS) {
      const [x, y] = boardRelativeCentre(camera(model), 'sensor')
      expect(x, `${model} sensor x`).toBeCloseTo(14.5, 9)
      expect(y, `${model} sensor y`).toBeCloseTo(12.5, 9)
    }
  })
})

describe('every part, diffed against the real V1 library’s own output', () => {
  // This is the check the rest of this file cannot be: the assertions above compare
  // this recipe against numbers *this author* read out of the five camera sources,
  // which proves the port matches one reading of V1 — not that it matches V1. The
  // fixture is the other thing: real bounding boxes dumped from
  // `jscad-raspberrypi@62a8e3b` executing under `@jwc/jscad-utils@6.0.0`.
  //
  // `TODO/core-015` scoped this as "no V1 execution fixture", the same call
  // `TODO/core-014` made and then reversed. It is reversed here for a reason
  // specific to this task: five of the mechanisms these variants lean on —
  // `Center()` aligning on xy but not z, `stretch` growing only the +axis face,
  // `rotateZ` turning about the world origin rather than the part, `enlarge`
  // preserving the centroid, and `align(to, axis, 'inside-')` silently ignoring its
  // third argument — are behaviours read out of V1's *implementation*, not stated in
  // its sources. A hand-written assertion for any of them restates the reading it is
  // supposed to check.
  //
  // To regenerate: in a checkout of jscad-raspberrypi at 62a8e3b, add a vitest file
  // that calls each camera factory and writes `parts[name].getBounds()` as JSON (it
  // must run under vitest, not bare node — jscad-utils uses extensionless imports
  // that need a bundler to resolve).
  //
  // `core-016`-`018` extend this same subsystem, which is exactly the case
  // `CLAUDE.md`'s Verification section says must stay a standing regression surface.

  /**
   * V1's aggregate subassembly entries. `Group.add(group, name, hidden, subparts)`
   * stores the *combined* group under `name` and each subpart under
   * `subparts + key` (`jscad-utils/src/group.js:83-100`), which is where
   * `holeshole0` and `mountsmount0` come from. This port has no grouping construct
   * between a record and the document, so it emits the leaves flat and skips the
   * three combined entries.
   *
   * @param {string} v1Name
   * @returns {string | null}
   */
  const portNameOf = (v1Name) => {
    if (v1Name === 'hole' || v1Name === 'mounts' || v1Name === 'pins') return null
    const subpart = /^(?:holes|mounts|pins)(hole|mount|pin)(\d)$/.exec(v1Name)
    return subpart ? `${subpart[1]}${subpart[2]}` : v1Name
  }

  /** @type {[string, string, boolean][]} Fixture key, model param, flipTripodMount. */
  const cases = [
    ['v1', 'v1', false],
    ['v2', 'v2', false],
    ['v3', 'v3', false],
    ['hq', 'hq', false],
    ['hq-flipped', 'hq', true],
    ['arducam-hq', 'arducam-hq', false],
  ]

  it.each(cases)('reproduces every V1 part’s bounding box on %s', (key, model, flip) => {
    const reference = v1Reference.models[key]
    const group = camera(model, flip)
    let checked = 0

    for (const v1Name of Object.keys(reference.parts)) {
      const portName = portNameOf(v1Name)
      if (portName === null) continue
      const part = group.parts[portName]
      expect(part, `${key}: V1 part ${v1Name} has no counterpart named ${portName}`).toBeDefined()
      const [min, max] = boundsOf(part)
      const [v1Min, v1Max] = reference.parts[v1Name]
      for (const axis of [0, 1, 2]) {
        // 9 decimal places: the two kernels tessellate independently, so agreeing to
        // a nanometre is agreement, not a shared rounding.
        expect(min[axis], `${key} ${v1Name} min[${axis}]`).toBeCloseTo(v1Min[axis], 9)
        expect(max[axis], `${key} ${v1Name} max[${axis}]`).toBeCloseTo(v1Max[axis], 9)
      }
      checked += 1
    }
    expect(checked).toBeGreaterThanOrEqual(10)
  })

  it.each(cases)('renders V1’s visible part set on %s, less the keep-outs', (key, model, flip) => {
    // Two documented departures, both of them deliberate: the `hole` aggregate is not
    // a part in this port (the leaves are, hidden — `raspberrypi.bplus` made the same
    // call, since the record schema has no "this is a hole" flag), and every `-nogo`
    // keep-out is hidden rather than rendered.
    const expected = v1Reference.models[key].names
      .filter((name) => name !== 'hole' && !name.endsWith('-nogo'))
      .sort()
    expect([...camera(model, flip).names].sort()).toEqual(expected)
  })
})
