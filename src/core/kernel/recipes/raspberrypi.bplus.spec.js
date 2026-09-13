import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { boundsOf, calcSnap, isGroup, sizeOf } from '../group.js'
import { evaluateOp, expand } from '../index.js'
import { BPLUS_BOARD, MOUNTING_HOLES_MM, rpiParts } from '../tables/rpi-parts.js'
import { bplus, BPLUS_MODELS, DEFAULT_CLEARANCE_MM } from './raspberrypi.bplus.js'
import v1ReferenceJson from './__fixtures__/raspberrypi.bplus.v1-reference.json'

/**
 * The fixture, widened to the shape the diff below reads it through — the checked-in
 * JSON types as one giant literal otherwise, which cannot be indexed by a model
 * number or a part name computed at runtime.
 *
 * @type {{ models: Record<string, { names: string[], parts: Record<string, number[][]> }> }}
 */
const v1Reference = v1ReferenceJson

const { primitives, transforms, measurements } = modeling

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

/** @param {number} model */
const board = (model) => asGroup(evaluateOp('raspberrypi.bplus', { model }))

/**
 * Bounding-box midline of one part on one axis — the measurement V1's `midlineTo`
 * positions by, and the one every "this connector sits at x = 32.5" datum in
 * `bplus.js` is quoted against.
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

/** V1's board: `Parts.Board(85, 56, 3, 1.32)`, corner at the origin. */
const BOARD_TOP_Z_MM = 1.32

describe('the bplus recipe expands into op records, it does not build a mesh', () => {
  it('emits only plain primitive/profile/transform/boolean records', () => {
    // `Initial design.md` §4: a recipe calls the group maths to compute a number and
    // bakes the *result* in as a translate. A `group.snap` record in the expansion
    // would mean the placement never got resolved.
    for (const model of BPLUS_MODELS) {
      const records = bplus({ model })
      expect(records.length).toBeGreaterThan(20)
      for (const record of records) {
        expect(record.op).toMatch(/^(primitive|profile|transform|boolean)\./)
      }
    }
  })

  it('gives every record a unique id, so the fold can address each one', () => {
    const records = bplus({ model: 5 })
    const ids = records.map((record) => record.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is reachable through expand() as a registered composite op', () => {
    expect(expand('raspberrypi.bplus', { model: 4 }).length).toBeGreaterThan(20)
  })

  it('defaults to V1 BPlus’s own model 2 and 5 mm clearance', () => {
    expect(DEFAULT_CLEARANCE_MM).toBe(5)
    const group = asGroup(evaluateOp('raspberrypi.bplus', {}))
    expect(group.names).toContain('microusb')
    expect(group.names).not.toContain('usbc')
  })
})

describe('the motherboard and the parts every model carries', () => {
  it('builds an 85 × 56 × 1.32 board with its corner at the origin', () => {
    const group = board(2)
    expectSize(group.parts.mb, [BPLUS_BOARD.widthMm, BPLUS_BOARD.heightMm, BPLUS_BOARD.thicknessMm])
    const [min] = boundsOf(group.parts.mb)
    expect(min[0]).toBeCloseTo(0, 6)
    expect(min[1]).toBeCloseTo(0, 6)
    expect(min[2]).toBeCloseTo(0, 6)
  })

  it('puts the microSD slot under the board, not on top of it', () => {
    const group = board(2)
    expectSize(group.parts.microsd, [15.2, 12, 1.5])
    const [min, max] = boundsOf(group.parts.microsd)
    expect(max[2]).toBeCloseTo(0, 6) // `.snap(mb, 'z', 'outside+')` — under the board
    expect(midline(group.parts.microsd, 1)).toBeCloseTo(28, 6)
    expect(min[0]).toBeCloseTo(-2.5, 6) // `.translate([-2.5, 0, 0])`
  })

  it('places the four mounting holes on bplus-mounting’s own datums', () => {
    for (const model of BPLUS_MODELS) {
      const group = board(model)
      const holes = ['hole1', 'hole2', 'hole3', 'hole4']
      holes.forEach((name, index) => {
        const hole = group.parts[name]
        expect(hole, `${name} missing on model ${model}`).toBeDefined()
        const [x, y] = MOUNTING_HOLES_MM.positions[index]
        expect(midline(hole, 0)).toBeCloseTo(x, 6)
        expect(midline(hole, 1)).toBeCloseTo(y, 6)
        // `.align(mb, 'z')`: centred on the board's own mid-plane, not its face.
        expect(midline(hole, 2)).toBeCloseTo(BOARD_TOP_Z_MM / 2, 6)
        expectSize(hole, [3.25, 3.25, 8])
      })
    }
  })

  it('keeps the mounting holes hidden, exactly as V1 added them', () => {
    const group = board(2)
    for (const name of ['hole1', 'hole2', 'hole3', 'hole4']) {
      expect(group.parts[name]).toBeDefined()
      expect(group.names).not.toContain(name)
    }
  })

  it('sits the GPIO header on the board at V1’s x/y datums, on every model', () => {
    for (const model of BPLUS_MODELS) {
      const group = board(model)
      expectSize(group.parts.gpio, [50.64, 5, 8.72])
      expect(midline(group.parts.gpio, 0)).toBeCloseTo(32.5, 6)
      expect(midline(group.parts.gpio, 1)).toBeCloseTo(52.5, 6)
      expect(boundsOf(group.parts.gpio)[0][2]).toBeCloseTo(BOARD_TOP_Z_MM, 6)
    }
  })
})

describe('model 2 — the B+/A+/Pi 2 connector set', () => {
  it('carries the model 2/3 connectors and none of the later ones', () => {
    const group = board(2)
    for (const name of [
      'mb',
      'ethernet',
      'usb1',
      'usb2',
      'microusb',
      'hdmi',
      'avjack',
      'camera',
      'display',
      'gpio',
      'activityled',
      'powerled',
      'microsd',
    ]) {
      expect(group.names, `model 2 should carry ${name}`).toContain(name)
    }
    for (const name of ['usbc', 'hdmi1', 'hdmi2', 'cpu', 'powerswitch', 'statusled', 'camera0']) {
      expect(group.parts[name], `model 2 should not carry ${name}`).toBeUndefined()
    }
    expect(group.parts.fan1hole).toBeUndefined()
  })

  it('hangs the ethernet jack off the right edge of the board', () => {
    const group = board(2)
    expectSize(group.parts.ethernet, [21.24, 15.88, 13.475])
    const [min, max] = boundsOf(group.parts.ethernet)
    // RightSide: flush with the board's +x extreme, then V1's own [2, 0, 0] offset.
    expect(max[0]).toBeCloseTo(BPLUS_BOARD.widthMm + 2, 6)
    expect(min[2]).toBeCloseTo(BOARD_TOP_Z_MM, 6)
    expect(midline(group.parts.ethernet, 1)).toBeCloseTo(10.25, 6)
  })

  it('places both USB jacks on the V1 y datums, flange outboard', () => {
    const group = board(2)
    expectSize(group.parts['usb1-body'], [16.4, 13.36, 17 - 1.5])
    expectSize(group.parts['usb1-flange'], [0.75, 15.3, 17.68 - 1.5])
    expect(midline(group.parts['usb1-body'], 1)).toBeCloseTo(29, 6)
    expect(midline(group.parts['usb2-body'], 1)).toBeCloseTo(47, 6)
    // The flange is what V1 snapped `inside+` against the board, plus [2, 0, 0].
    expect(boundsOf(group.parts['usb1-flange'])[1][0]).toBeCloseTo(BPLUS_BOARD.widthMm + 2, 6)
    // The body rests on the board's top face.
    expect(boundsOf(group.parts['usb1-body'])[0][2]).toBeCloseTo(BOARD_TOP_Z_MM, 6)
    // The visible part is the union of the two, so its box spans both.
    const [unionMin, unionMax] = boundsOf(group.parts.usb1)
    expect(unionMin[0]).toBeCloseTo(boundsOf(group.parts['usb1-body'])[0][0], 6)
    expect(unionMax[0]).toBeCloseTo(boundsOf(group.parts['usb1-flange'])[1][0], 6)
  })

  it('places the micro-USB, HDMI and AV jack along the front edge', () => {
    const group = board(2)
    expectSize(group.parts.microusb, [7.59, 5.7, 2.64])
    expect(midline(group.parts.microusb, 0)).toBeCloseTo(10.6, 6)
    expect(boundsOf(group.parts.microusb)[0][1]).toBeCloseTo(-2, 6)

    expectSize(group.parts.hdmi, [15, 11.57, 7.4])
    expect(midline(group.parts.hdmi, 0)).toBeCloseTo(32, 6)
    expect(boundsOf(group.parts.hdmi)[0][1]).toBeCloseTo(-2, 6)

    expectSize(group.parts['avjack-block'], [6.9, 12.47, 5.6])
    expect(midline(group.parts['avjack-block'], 0)).toBeCloseTo(53.5, 6)
    expect(boundsOf(group.parts['avjack-block'])[0][2]).toBeCloseTo(BOARD_TOP_Z_MM, 6)
    // The barrel protrudes past the block's front face, which is what makes the
    // AV jack a two-solid part rather than one cube.
    expect(boundsOf(group.parts.avjack)[0][1]).toBeLessThan(
      boundsOf(group.parts['avjack-block'])[0][1]
    )
  })

  it('places the camera and display ribbons', () => {
    const group = board(2)
    expectSize(group.parts.camera, [3, 22.4, 5.7])
    expect(midline(group.parts.camera, 0)).toBeCloseTo(45, 6)
    expect(midline(group.parts.display, 0)).toBeCloseTo(3.5, 6)
    expect(midline(group.parts.display, 1)).toBeCloseTo(28, 6)
  })

  it('uses the model 2 LED placement — translated, not midlined', () => {
    const group = board(2)
    expectSize(group.parts.activityled, [1, 2, 0.7])
    const [activityMin] = boundsOf(group.parts.activityled)
    expect(activityMin[0]).toBeCloseTo(1, 6)
    expect(activityMin[1]).toBeCloseTo(43.5, 6)
    expect(boundsOf(group.parts.powerled)[0][1]).toBeCloseTo(46, 6)
  })
})

describe('model 3 — the same board with the Pi 3 LED positions', () => {
  it('keeps the model 2 connector set', () => {
    const group = board(3)
    for (const name of ['ethernet', 'usb1', 'usb2', 'microusb', 'hdmi', 'avjack']) {
      expect(group.names).toContain(name)
    }
    expect(group.parts.usbc).toBeUndefined()
  })

  it('midlines both LEDs at the Pi 3 datums instead', () => {
    const group = board(3)
    expect(midline(group.parts.activityled, 0)).toBeCloseTo(1.1, 6)
    expect(midline(group.parts.activityled, 1)).toBeCloseTo(7.9, 6)
    expect(midline(group.parts.powerled, 1)).toBeCloseTo(11.5, 6)
  })
})

describe('model 4 — dual HDMI, USB-C, and clearance volumes', () => {
  it('carries the Pi 4 connector set and drops the model 2/3 one', () => {
    const group = board(4)
    for (const name of ['usbc', 'hdmi1', 'hdmi2', 'ethernet', 'usb1', 'usb2', 'avjack']) {
      expect(group.names, `model 4 should carry ${name}`).toContain(name)
    }
    expect(group.parts.hdmi).toBeUndefined()
    expect(group.parts.microusb).toBeUndefined()
    expect(group.parts.cpu).toBeUndefined()
    expect(group.parts.fan1hole).toBeUndefined()
  })

  it('uses the Pi 4 ethernet body and its own y datum', () => {
    const group = board(4)
    expectSize(group.parts.ethernet, [21.38, 16.12, 13.83])
    expect(midline(group.parts.ethernet, 1)).toBeCloseTo(45.75, 6)
    // RightSide with V1's Pi 4 offset of [3, 0, 0].
    expect(boundsOf(group.parts.ethernet)[1][0]).toBeCloseTo(BPLUS_BOARD.widthMm + 3, 6)
  })

  it('stacks the two USB jacks at y = 9 and y = 27', () => {
    const group = board(4)
    expectSize(group.parts['usb1-body'], [17.58 - 1, 13.15, 16.95 - 1.55])
    expect(midline(group.parts['usb1-body'], 1)).toBeCloseTo(9, 6)
    expect(midline(group.parts['usb2-body'], 1)).toBeCloseTo(27, 6)
    expectSize(group.parts['usb1-flange'], [1, 15, 17.6 - 1.55])
  })

  it('spaces USB-C and both HDMI ports on V1’s cumulative x datums', () => {
    const group = board(4)
    expectSize(group.parts.usbc, [10, 7.5, 3.2])
    expect(midline(group.parts.usbc, 0)).toBeCloseTo(3.5 + 7.7, 6)
    expect(midline(group.parts.hdmi1, 0)).toBeCloseTo(3.5 + 7.7 + 14.8, 6)
    expect(midline(group.parts.hdmi2, 0)).toBeCloseTo(3.5 + 7.7 + 14.8 + 13.5, 6)
    expect(midline(group.parts['avjack-block'], 0)).toBeCloseTo(3.5 + 7.7 + 14.8 + 13.5 + 7 + 7.5, 6)
    // `.snap(mb, 'y', 'inside-', -1)` — the front edge overhangs the board by 1 mm.
    expect(boundsOf(group.parts.usbc)[0][1]).toBeCloseTo(-1, 6)
  })

  it('carries hidden clearance volumes sized by the clearance param', () => {
    const group = board(4)
    for (const name of ['clearance-ethernet', 'clearance-usbc', 'clearance-hdmi1']) {
      expect(group.parts[name], `${name} missing`).toBeDefined()
      expect(group.names, `${name} should be hidden`).not.toContain(name)
    }
    // The ethernet clearance is a slab `clearance` deep, outboard of the jack.
    expect(sizeOf(group.parts['clearance-ethernet'])[0]).toBeCloseTo(DEFAULT_CLEARANCE_MM, 6)
    expect(boundsOf(group.parts['clearance-ethernet'])[0][0]).toBeCloseTo(
      boundsOf(group.parts.ethernet)[1][0],
      6
    )
  })

  it('scales the clearance volumes when the clearance param changes', () => {
    const wide = asGroup(evaluateOp('raspberrypi.bplus', { model: 4, clearance: 9 }))
    expect(sizeOf(wide.parts['clearance-ethernet'])[0]).toBeCloseTo(9, 6)
    // The functional geometry must not move when only the clearance changes.
    const standard = board(4)
    expect(midline(wide.parts.ethernet, 1)).toBeCloseTo(midline(standard.parts.ethernet, 1), 6)
  })

  it('drops V1’s hidden dimCheck rulers', () => {
    const group = board(4)
    for (const name of Object.keys(group.parts)) {
      expect(name).not.toMatch(/dimcheck/i)
    }
  })
})

describe('model 5 — CPU, PCIe, power switch and fan holes', () => {
  it('carries the Pi 5 connector set', () => {
    const group = board(5)
    for (const name of [
      'cpu',
      'ethernet',
      'usb1',
      'usb2',
      'usbc',
      'hdmi1',
      'hdmi2',
      'camera0',
      'camera1',
      'display',
      'gpio',
      'statusled',
      'powerswitch',
    ]) {
      expect(group.names, `model 5 should carry ${name}`).toContain(name)
    }
    expect(group.parts.activityled).toBeUndefined()
    expect(group.parts.powerled).toBeUndefined()
    expect(group.parts.avjack).toBeUndefined()
  })

  it('adds the two fan mounting holes only on model 5', () => {
    const group = board(5)
    expect(group.parts.fan1hole).toBeDefined()
    expect(group.parts.fan2hole).toBeDefined()
    expect(group.names).not.toContain('fan1hole')
    expect(midline(group.parts.fan1hole, 0)).toBeCloseTo(3.5, 6)
    expect(midline(group.parts.fan1hole, 1)).toBeCloseTo(6 + 3.5, 6)
    expect(midline(group.parts.fan2hole, 0)).toBeCloseTo(3.5 + 58, 6)
    expect(midline(group.parts.fan2hole, 1)).toBeCloseTo(52.5 - 6, 6)
    // Fan holes are board-thickness deep, unlike the 8 mm mounting holes.
    expectSize(group.parts.fan1hole, [3.25, 3.25, BPLUS_BOARD.thicknessMm])
    for (const model of [2, 3, 4]) {
      expect(board(model).parts.fan1hole).toBeUndefined()
    }
  })

  it('sits the CPU pad on the board at V1’s offsets', () => {
    const group = board(5)
    expectSize(group.parts.cpu, [17, 17, 3])
    expect(midline(group.parts.cpu, 0)).toBeCloseTo(32.5, 6)
    expect(boundsOf(group.parts.cpu)[0][1]).toBeCloseTo(15, 6)
    expect(boundsOf(group.parts.cpu)[0][2]).toBeCloseTo(BOARD_TOP_Z_MM, 6)
  })

  it('uses the Pi 5 ethernet and USB positions', () => {
    const group = board(5)
    expectSize(group.parts.ethernet, [21.5, 16.5, 13.5])
    expect(midline(group.parts.ethernet, 1)).toBeCloseTo(10.2, 6)
    expectSize(group.parts['usb1-body'], [17, 13.1, 15])
    expect(midline(group.parts['usb1-body'], 1)).toBeCloseTo(29.1, 6)
    expect(midline(group.parts['usb2-body'], 1)).toBeCloseTo(47, 6)
    // `.snap(mb, 'z', 'outside-', 0.5)` — the Pi 5 USB body rides 0.5 mm proud.
    expect(boundsOf(group.parts['usb1-body'])[0][2]).toBeCloseTo(BOARD_TOP_Z_MM + 0.5, 6)
  })

  it('places the two camera connectors, the PCIe connector and the status LED', () => {
    const group = board(5)
    expectSize(group.parts.camera0, [3, 16, 5])
    expect(midline(group.parts.camera0, 0)).toBeCloseTo(55, 6)
    expect(midline(group.parts.camera1, 0)).toBeCloseTo(50, 6)
    expectSize(group.parts.display, [3, 12, 5])
    expect(midline(group.parts.display, 0)).toBeCloseTo(3.5, 6)
    expect(midline(group.parts.display, 1)).toBeCloseTo(30, 6)
    expect(midline(group.parts.statusled, 0)).toBeCloseTo(1.1, 6)
    expect(midline(group.parts.statusled, 1)).toBeCloseTo(13.3, 6)
  })

  it('puts the power switch on the left edge with its button outboard', () => {
    const group = board(5)
    expectSize(group.parts['powerswitch-block'], [2.8, 4.5, 3.7])
    expect(boundsOf(group.parts['powerswitch-block'])[0][0]).toBeCloseTo(0, 6)
    expect(midline(group.parts['powerswitch-block'], 1)).toBeCloseTo(18.4, 6)
    expect(boundsOf(group.parts['powerswitch-block'])[0][2]).toBeCloseTo(BOARD_TOP_Z_MM, 6)
    // The button sticks out past the board's -x edge.
    expect(boundsOf(group.parts.powerswitch)[0][0]).toBeCloseTo(-1, 6)
  })
})

describe('every part, diffed against the real V1 library’s own output', () => {
  // This is the check the rest of this file cannot be: the assertions above all
  // compare this recipe against numbers *this author* read out of `bplus.js`, which
  // proves the port matches one reading of V1 — not that it matches V1. The fixture
  // is the other thing: real bounding boxes dumped from `jscad-raspberrypi@62a8e3b`
  // executing under `@jwc/jscad-utils@6.0.0`, in a checkout of that repository.
  //
  // `TODO/core-014` scoped this as "no real V1 execution fixture is wired into this
  // project", on the reasonable assumption that V1 is not installed here — it is not,
  // and cannot be, because that library is not a dependency of this project and its
  // own deps (`@jscad/csg@0.7.0`) are the V1 kernel this port exists to replace. What
  // *is* possible, and is what happened, is running it once elsewhere and committing
  // the numbers. To regenerate: in a checkout of jscad-raspberrypi at 62a8e3b, add a
  // vitest file that calls `BPlus(model).parts[name].getBounds()` for models 2-5 and
  // writes the result as JSON (it must run under vitest, not bare node — jscad-utils
  // uses extensionless imports that need a bundler to resolve).
  //
  // `core-015`-`018` extend this same subsystem, which is exactly the case
  // `CLAUDE.md`'s Verification section says must stay a standing regression surface
  // rather than a one-time close.
  /** @type {Readonly<Record<string, string>>} */
  const RENAMED_IN_V3 = Object.freeze({
    usb1body: 'usb1-body',
    usb1flange: 'usb1-flange',
    usb2body: 'usb2-body',
    usb2flange: 'usb2-flange',
    usb1clearance: 'clearance-usb1',
    usb2clearance: 'clearance-usb2',
    avjackblock: 'avjack-block',
    avjackcylinder: 'avjack-barrel',
  })

  /** @param {string} v1Name */
  const v3NameOf = (v1Name) => RENAMED_IN_V3[v1Name] ?? v1Name

  it.each(BPLUS_MODELS)('reproduces every V1 part’s bounding box on model %i', (model) => {
    const reference = v1Reference.models[String(model)]
    const group = board(model)
    const names = Object.keys(reference.parts)
    expect(names.length).toBeGreaterThan(20)

    for (const v1Name of names) {
      const part = group.parts[v3NameOf(v1Name)]
      expect(part, `model ${model}: V1 part ${v1Name} has no V3 counterpart`).toBeDefined()
      const [min, max] = boundsOf(part)
      const [v1Min, v1Max] = reference.parts[v1Name]
      for (const axis of [0, 1, 2]) {
        // 9 decimal places: the two kernels tessellate independently, so agreeing to
        // a nanometre is agreement, not a shared rounding.
        expect(min[axis], `model ${model} ${v1Name} min[${axis}]`).toBeCloseTo(v1Min[axis], 9)
        expect(max[axis], `model ${model} ${v1Name} max[${axis}]`).toBeCloseTo(v1Max[axis], 9)
      }
    }
  })

  it.each(BPLUS_MODELS)('renders the same visible part set as V1 on model %i', (model) => {
    const reference = v1Reference.models[String(model)]
    const group = board(model)
    expect([...group.names].sort()).toEqual([...reference.names].map(v3NameOf).sort())
  })

  it('adds the power switch’s two solids that V1 kept only as a combined part', () => {
    // The one intentional difference the diff above would otherwise hide: V1's `PSW`
    // group is added without a subpart prefix, so only the combined `powerswitch`
    // survives into its parts. Keeping both solids addressable costs nothing and is
    // what every other two-solid part here does.
    const group = board(5)
    expect(group.parts['powerswitch-block']).toBeDefined()
    expect(group.parts['powerswitch-button']).toBeDefined()
    expect(v1Reference.models['5'].parts['powerswitch-block']).toBeUndefined()
  })
})

describe('rotation signs: measured against this project’s convention, not assumed', () => {
  // `TODO/core-014` asks for the AvJack/PSW rotation signs to be checked rather than
  // trusted, mirroring `kit.anchor`'s own flagged check. The answer is the same and
  // for the same reason: both parts are cylinders, symmetric about their own axis,
  // and both are positioned by an align/snap *after* the turn — so the sign cannot
  // reach the result.
  it('rotateX(±90) on the AV jack barrel gives the same box', () => {
    const barrel = primitives.cylinder({ radius: 3, height: 2, segments: 32 })
    const plus = measurements.measureBoundingBox(transforms.rotate([Math.PI / 2, 0, 0], barrel))
    const minus = measurements.measureBoundingBox(transforms.rotate([-Math.PI / 2, 0, 0], barrel))
    for (const axis of [0, 1, 2]) {
      expect(plus[0][axis]).toBeCloseTo(minus[0][axis], 9)
      expect(plus[1][axis]).toBeCloseTo(minus[1][axis], 9)
    }
  })

  it('lands the PSW button in the same place whichever way it is turned about Y', () => {
    const block = primitives.cuboid({ size: [2.8, 4.5, 3.7] })
    const button = primitives.cylinder({ radius: 1, height: 1, segments: 32 })
    /** @param {number} sign */
    const placed = (sign) => {
      const turned = transforms.rotate([0, (sign * Math.PI) / 2, 0], button)
      return measurements.measureBoundingBox(
        transforms.translate(calcSnap(turned, block, 'x', 'outside+'), turned)
      )
    }
    const plus = placed(1)
    const minus = placed(-1)
    for (const axis of [0, 1, 2]) {
      expect(plus[0][axis]).toBeCloseTo(minus[0][axis], 9)
      expect(plus[1][axis]).toBeCloseTo(minus[1][axis], 9)
    }
  })

  it('turns the AV jack barrel’s axis off Z, which is what the rotate is for', () => {
    const spec = rpiParts.avJackBarrel
    expect(spec.rotationDeg).toEqual([90, 0, 0])
    const turned = transforms.rotate(
      [Math.PI / 2, 0, 0],
      primitives.cylinder({
        radius: spec.params.diameter / 2,
        height: spec.params.height,
        segments: 32,
      })
    )
    const size = sizeOf(turned)
    expect(size[1]).toBeCloseTo(spec.params.height, 6) // length now runs along Y
    expect(size[0]).toBeCloseTo(spec.params.diameter, 6)
  })
})

describe('degenerate params are rejected at the recipe boundary', () => {
  it('rejects a model the port does not cover, by name', () => {
    expect(() => bplus({ model: 1 })).toThrow(/raspberrypi\.bplus: unknown model/)
    expect(() => bplus({ model: 6 })).toThrow(/raspberrypi\.bplus: unknown model/)
    // A document arrives as untrusted JSON, so the string form is a real input, not
    // a type error the compiler would have caught.
    expect(() => bplus({ model: /** @type {any} */ ('4') })).toThrow(
      /raspberrypi\.bplus: unknown model/
    )
    expect(() => bplus({ model: Number.NaN })).toThrow(/raspberrypi\.bplus: unknown model/)
  })

  it('names the models it does cover in the error', () => {
    expect(() => bplus({ model: 9 })).toThrow(/2 \| 3 \| 4 \| 5/)
    expect(BPLUS_MODELS).toEqual([2, 3, 4, 5])
  })

  it('rejects a zero or negative clearance', () => {
    expect(() => bplus({ model: 4, clearance: 0 })).toThrow(/raspberrypi\.bplus: clearance/)
    expect(() => bplus({ model: 4, clearance: -2 })).toThrow(/raspberrypi\.bplus: clearance/)
  })
})
