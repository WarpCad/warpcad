/**
 * The `raspberrypi.bplus` composite recipe — one Raspberry Pi board, every connector,
 * with a single `model` param picking the revision.
 *
 * ## What it reproduces
 *
 * `jscad-raspberrypi@62a8e3b`'s `BPlus(model, options)` (`src/bplus.js:616-808`, plus
 * its `pi4`/`pi5` helpers at `:33-326` and `:335-550`), the part factories in
 * `src/rpi-parts.js`, `bplus-mounting.js`'s `holes`, and `boardutils.js`'s
 * `RightSide`. Dimensions live in `../tables/rpi-parts.js`; what is here is the
 * *placement*, which is the only part of V1 that is logic rather than data.
 *
 * One factory with a `model` param, not one registry op per revision — the shape
 * `hardware.bolt` already established, and what `Initial design.md` §6 asks for.
 *
 * ## The mechanism: probe, measure, bake — at fifty parts instead of two
 *
 * `Initial design.md` §4 is explicit that a recipe calls the group maths to compute a
 * number and bakes the *result* in as a plain `transform.translate`; `group.snap`
 * never appears as a record. `hardware.bolt.js` manages that with arithmetic alone
 * because its spec table gives every height involved. This recipe cannot: V1 positions
 * roughly fifty solids with about a hundred and twenty chained `.snap`/`.align`/
 * `.midlineTo` calls, all defined over *bounding boxes*, and a tessellated cylinder's
 * box is a property of its segment count rather than of its diameter.
 *
 * So this file does what `kit.anchor.js` already does for two parts, generalised:
 * build the real `@jscad/modeling` solid as a throwaway **probe**, run the same
 * sequence of measurements V1's chain implies (`group.js`'s already-tested
 * `calcSnap`/`calcCenterWith`), discard the probe, and emit records carrying the
 * computed numbers. {@link chain} is that generalisation — it reads like V1's chain
 * on purpose, so this file can be diffed against `bplus.js` line by line.
 *
 * Every part therefore emits the same little run of records: the centred
 * `primitive.*`, optionally a `transform.rotate`, then one `transform.translate`
 * holding the whole accumulated placement. A two-solid part (the USB jacks, the AV
 * jack, the Pi 5 power switch) emits both solids as hidden named parts and a
 * `boolean.union` over them, exactly as `hardware.bolt.js` does for its `tap`.
 *
 * ## Where V1's coordinate frame ends up
 *
 * V1's `Parts.Board` sits in the positive quadrant with its underside on `z = 0`, and
 * every datum in `bplus.js` — "midline to x 32.5", the mounting holes at `(3.5, 3.5)`
 * — is quoted against that corner. This port keeps that frame: the board's minimum
 * corner is the origin, so every number in the V1 source reads across unchanged and a
 * mounting hole really is at `(3.5, 3.5)`.
 *
 * That is deliberately *not* the centred-on-`params.center` convention `kit.board` and
 * `kit.anchor` follow, and the reason is that those recipes are single placeable
 * bodies while this one is an assembly whose internal datums are its whole point.
 * There is no `center` param here yet: no UI surface can place this op (see
 * `TODO/core-014`'s own Interaction model section — `src/core/library.js` builds its
 * rows from `primitive.*` alone), and `library.js`'s drop maths positions a dropped
 * body from its own bounding box regardless. A task that adds a Hardware/Kit Library
 * row can add one the way `kit.anchor` did.
 *
 * ## Two deliberate narrowings from V1
 *
 * **`dimCheck` is dropped.** `pi4` builds a hidden `Group('DimensionCheck')` of nine
 * coloured 1 mm rulers (`bplus.js:34,48-73,123-157,173-189`) used to eyeball V1's own
 * dimensions while that library was being written. It is added hidden, nothing
 * references it, it renders nothing by default, and there is no `pi5` or model-2/3
 * equivalent. It is development scaffolding, not geometry, so it is not ported.
 *
 * **Mounting holes are parts, not holes.** V1 also assigns `group.holes`, which makes
 * `combine()` subtract the four cylinders from the *whole* assembly. This fold's
 * record schema has no "add this as a hole" flag — `group.js` has `addHole`, but no
 * `OpRecord` field reaches it — so the holes here are hidden named parts only, exactly
 * as V1 *also* added them (`group.add(group.holes[0], 'hole1', true)`). The visible
 * difference is that this board renders undrilled. A consumer that wants them drilled
 * emits its own `boolean.subtract` against `hole1`-`hole4`, which is the same thing
 * V1's combine did and is arguably better behaved: V1's subtraction also carved the
 * micro-USB shell, which overlaps `hole1`.
 *
 * ## Rotation signs: measured, not assumed
 *
 * `TODO/core-014` flags `AvJack`'s `rotateX(90)` and `PSW`'s `rotateY(90)` as signs to
 * check rather than trust. They are checked in `raspberrypi.bplus.spec.js`, and the
 * answer is the same one `kit.anchor` found: both solids are cylinders, symmetric
 * about their own axis, and both are positioned by an `align`/`snap` *after* the turn,
 * so the sign cannot reach the result. More usefully, this file never hard-codes the
 * consequence of a rotation at all — {@link cylinderPart} measures the turned probe
 * and differences the centroids, so a wrong assumption would have to survive being
 * measured.
 *
 * @module core/kernel/recipes/raspberrypi.bplus
 */

import modeling from '@jscad/modeling'

import { axisApply, calcCenterWith, calcSnap, centroidOf, sizeOf } from '../group.js'
import { BPLUS_BOARD, MOUNTING_HOLES_MM, rpiParts } from '../tables/rpi-parts.js'

// See group.js: default import, not named, so this runs under raw Node ESM too.
const { booleans, extrusions, primitives, transforms } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('../registry.js').OpRecord} OpRecord */
/** @typedef {[number, number, number]} Vec3Mm */
/** @typedef {import('../tables/rpi-parts.js').RpiPartSpec} RpiPartSpec */

const OP = 'raspberrypi.bplus'

/** The models this port covers. V1 branched on `< 4`, `== 4` and `else`. */
export const BPLUS_MODELS = Object.freeze([2, 3, 4, 5])

/** V1 `BPlus(model = 2)`. */
export const DEFAULT_MODEL = 2

/** V1 `Object.assign({ clearance: 5 }, options)`. */
export const DEFAULT_CLEARANCE_MM = 5

/**
 * Segment count for every cylinder here. Matches `registry.js`'s `DEFAULT_SEGMENTS`
 * and `@jscad/csg`'s `defaultResolution2D`, which V1 passed explicitly — so a V1 and a
 * V3 mounting hole tessellate the same way. Emitted into each record rather than left
 * to a library default, so a future upstream change cannot silently move geometry.
 * Defined locally rather than imported from `registry.js`, which imports *this* file.
 */
const CYLINDER_SEGMENTS = 32

/**
 * Degrees to radians. Local for the same reason {@link CYLINDER_SEGMENTS} is: the
 * registry's own `degToRad` lives in the module that imports this one.
 *
 * @param {number} degrees
 * @returns {number}
 */
function degToRad(degrees) {
  return (degrees * Math.PI) / 180
}

/**
 * One solid on its way to a position: the records that build it un-placed, the
 * millimetre offset accumulated so far, and a probe sitting where that offset puts it.
 *
 * @typedef {object} Part
 * @property {string} id
 * @property {OpRecord[]} baseRecords Records that build the solid before placement.
 * @property {string} baseId Id of the last base record — the translate's target.
 * @property {Vec3Mm} offsetMm Accumulated placement, baked into one translate at emit.
 * @property {Geom3} geom Probe geometry, currently placed. Thrown away.
 * @property {string} [name] Part name in the resulting group.
 * @property {boolean} [hidden] Named but out of the group's default combine.
 */

/**
 * @typedef {{ kind: 'part', part: Part } |
 *   { kind: 'union', id: string, name: string, operands: string[], hidden?: boolean }}
 *   PlanItem
 */

/**
 * @param {...(readonly number[])} vectors
 * @returns {Vec3Mm}
 */
function addVectors(...vectors) {
  return /** @type {Vec3Mm} */ (
    vectors.reduce(
      (total, vector) => [total[0] + vector[0], total[1] + vector[1], total[2] + vector[2]],
      [0, 0, 0]
    )
  )
}

/**
 * Assemble a {@link Part} from the records that build it and the position V1's own
 * factory left it in.
 *
 * `naturalOffsetMm` is the whole V1→V3 impedance mismatch in one number. V1's
 * factories disagree about where a fresh solid sits — `Parts.Cube` puts its minimum
 * corner on the origin, `Parts.Cylinder` its base, `CSG_cube` its centre — while every
 * `primitive.*` op here is centred. That difference is not cosmetic, because a
 * `.midlineTo` or a bare `.translate` moves a solid *relatively*: run V1's chain from
 * the wrong starting point and every relative step lands somewhere else.
 *
 * @param {string} id
 * @param {object} args
 * @param {OpRecord[]} args.baseRecords
 * @param {string} args.baseId
 * @param {Geom3} args.base Geometry the base records produce.
 * @param {Vec3Mm} args.naturalOffsetMm Where V1's factory left this solid, relative to
 *   where the base records put it.
 * @returns {Part}
 */
function makePart(id, { baseRecords, baseId, base, naturalOffsetMm }) {
  return {
    id,
    baseRecords,
    baseId,
    offsetMm: naturalOffsetMm,
    geom: transforms.translate(naturalOffsetMm, base),
  }
}

/**
 * A box. V1's `Parts.Cube({x, y, z})` (`frame: 'corner'`) or `Parts.CSG_cube` with a
 * symmetric radius (`frame: 'center'`).
 *
 * @param {string} id
 * @param {readonly number[]} sizeMm
 * @param {'corner' | 'center'} frame
 * @returns {Part}
 */
function cuboidPart(id, sizeMm, frame) {
  const size = /** @type {Vec3Mm} */ ([sizeMm[0], sizeMm[1], sizeMm[2]])
  return makePart(id, {
    baseRecords: [{ id: `${id}.solid`, op: 'primitive.cuboid', params: { size: [...size] } }],
    baseId: `${id}.solid`,
    base: primitives.cuboid({ size }),
    naturalOffsetMm:
      frame === 'corner' ? [size[0] / 2, size[1] / 2, size[2] / 2] : [0, 0, 0],
  })
}

/**
 * A cylinder, optionally laid on its side the way V1's `AvJack`/`PSW` lay theirs.
 *
 * The rotated case is where "measured, not assumed" earns its keep: V1 turns a solid
 * whose base is on `z = 0` about the world origin, while the emitted records turn a
 * *centred* solid about the same origin — two different results. Rather than reason
 * about which way the difference points, both are built and their centroids
 * differenced, so the baked offset is whatever the geometry actually says.
 *
 * @param {string} id
 * @param {number} diameterMm
 * @param {number} heightMm
 * @param {'base' | 'center'} frame
 * @param {readonly number[]} [rotationDeg] V1's pre-placement turn, in degrees.
 * @returns {Part}
 */
function cylinderPart(id, diameterMm, heightMm, frame, rotationDeg) {
  const upright = primitives.cylinder({
    radius: diameterMm / 2,
    height: heightMm,
    segments: CYLINDER_SEGMENTS,
  })
  /** @type {Vec3Mm} */
  const uprightNaturalMm = frame === 'base' ? [0, 0, heightMm / 2] : [0, 0, 0]

  /** @type {OpRecord[]} */
  const baseRecords = [
    {
      id: `${id}.solid`,
      op: 'primitive.cylinder',
      params: { diameter: diameterMm, height: heightMm, segments: CYLINDER_SEGMENTS },
    },
  ]

  if (!rotationDeg) {
    return makePart(id, {
      baseRecords,
      baseId: `${id}.solid`,
      base: upright,
      naturalOffsetMm: uprightNaturalMm,
    })
  }

  /** @param {Geom3} geometry */
  const turn = (geometry) =>
    transforms.rotate(
      [degToRad(rotationDeg[0]), degToRad(rotationDeg[1]), degToRad(rotationDeg[2])],
      geometry
    )

  const base = turn(upright)
  const v1Natural = turn(transforms.translate(uprightNaturalMm, upright))
  const baseCentre = centroidOf(base)
  const naturalCentre = centroidOf(v1Natural)

  baseRecords.push({
    id: `${id}.turned`,
    op: 'transform.rotate',
    params: { angles: [rotationDeg[0], rotationDeg[1], rotationDeg[2]] },
    target: `${id}.solid`,
  })

  return makePart(id, {
    baseRecords,
    baseId: `${id}.turned`,
    base,
    naturalOffsetMm: [
      naturalCentre[0] - baseCentre[0],
      naturalCentre[1] - baseCentre[1],
      naturalCentre[2] - baseCentre[2],
    ],
  })
}

/**
 * One part from the {@link rpiParts} table, at its own dimensions.
 *
 * @param {string} id
 * @param {RpiPartSpec} spec
 * @returns {Part}
 */
function specPart(id, spec) {
  if (spec.op === 'primitive.cuboid') {
    return cuboidPart(id, spec.params.size, /** @type {'corner' | 'center'} */ (spec.frame))
  }
  return cylinderPart(
    id,
    spec.params.diameter,
    spec.params.height,
    /** @type {'base' | 'center'} */ (spec.frame),
    spec.rotationDeg
  )
}

/**
 * The motherboard: a rounded rectangle extruded to thickness, the same
 * `profile.roundedRectangle` → `profile.extrudeLinear` pair `kit.board` emits. V1's
 * `Board` leaves it in the positive quadrant with its underside on `z = 0`, which is
 * the frame every other datum in this file is quoted against.
 *
 * @param {string} id
 * @param {number} cornerRadiusMm
 * @returns {Part}
 */
function boardPart(id, cornerRadiusMm) {
  const { widthMm, heightMm, thicknessMm } = BPLUS_BOARD
  const profile = primitives.roundedRectangle({
    size: [widthMm, heightMm],
    roundRadius: cornerRadiusMm,
    segments: CYLINDER_SEGMENTS,
    center: [0, 0],
  })
  return makePart(id, {
    baseRecords: [
      {
        id: `${id}.profile`,
        op: 'profile.roundedRectangle',
        params: {
          size: [widthMm, heightMm],
          roundRadius: cornerRadiusMm,
          segments: CYLINDER_SEGMENTS,
        },
      },
      {
        id: `${id}.prism`,
        op: 'profile.extrudeLinear',
        params: { height: thicknessMm },
        target: `${id}.profile`,
      },
    ],
    baseId: `${id}.prism`,
    base: extrusions.extrudeLinear({ height: thicknessMm }, profile),
    naturalOffsetMm: [widthMm / 2, heightMm / 2, 0],
  })
}

/**
 * Geometry to measure a reference against. A list of parts is unioned, which is what
 * V1 did implicitly whenever a `Group` was handed to something that wanted a solid.
 *
 * @param {Part | Part[]} reference
 * @returns {Geom3}
 */
function geomOf(reference) {
  const parts = Array.isArray(reference) ? reference : [reference]
  return parts.length === 1 ? parts[0].geom : booleans.union(parts.map((part) => part.geom))
}

/**
 * @param {Part[]} parts
 * @param {Vec3Mm} vectorMm
 */
function move(parts, vectorMm) {
  for (const part of parts) {
    part.offsetMm = addVectors(part.offsetMm, vectorMm)
    part.geom = transforms.translate(vectorMm, part.geom)
  }
}

/**
 * V1's placement chain, one call at a time.
 *
 * `target` is what moves — one part, or several that travel together the way a V1
 * `Group` did. `ruler` is what gets measured, which for a group is the one named part
 * V1 passed as the first argument to `group.snap('body', ...)`.
 *
 * @param {Part | Part[]} target
 * @param {Part} [ruler] Defaults to the first (or only) part.
 */
function chain(target, ruler) {
  const parts = Array.isArray(target) ? target : [target]
  const measured = ruler ?? parts[0]

  const api = {
    /**
     * @param {Part | Part[]} reference
     * @param {string} axes
     * @param {string} orientation A key of `group.js`'s `SNAP_SIDES`.
     * @param {number} [deltaMm]
     */
    snap(reference, axes, orientation, deltaMm) {
      move(parts, calcSnap(measured.geom, geomOf(reference), axes, orientation, deltaMm))
      return api
    },

    /**
     * @param {Part | Part[]} reference
     * @param {string} axes
     */
    align(reference, axes) {
      move(parts, calcCenterWith(measured.geom, axes, geomOf(reference)))
      return api
    },

    /**
     * V1's `util.calcmidlineTo`, quirk included: it returns `to - size / 2` as a
     * *relative* translation, without consulting where the solid currently is. That
     * only means "put the midline at `to`" when the solid's minimum on that axis is
     * still zero — which, in `bplus.js`, it always is, because every factory starts on
     * the origin and every earlier link in the chain touches a different axis. Ported
     * as the relative translate it actually is rather than as the absolute placement
     * it is usually mistaken for, so a future call site that breaks that precondition
     * diverges from V1 the same way V1 diverges from itself.
     *
     * @param {string} axis
     * @param {number} toMm
     */
    midlineTo(axis, toMm) {
      const size = sizeOf(measured.geom)
      move(
        parts,
        axisApply(axis, (index) => toMm - size[index] / 2)
      )
      return api
    },

    /** @param {Vec3Mm} vectorMm */
    translate(vectorMm) {
      move(parts, vectorMm)
      return api
    },
  }

  return api
}

/**
 * `boardutils.js`'s `RightSide`: flush with the board's `+x` extreme, its `-y` edge and
 * its top face, then a fixed offset. The three snaps are measured against the
 * *unmoved* part and summed, exactly as V1 does — they touch disjoint axes, so the sum
 * is the composition.
 *
 * @param {Part} part
 * @param {Part} mb
 * @param {Vec3Mm} offsetMm
 * @returns {Part}
 */
function rightSide(part, mb, offsetMm) {
  move(
    [part],
    addVectors(
      calcSnap(part.geom, mb.geom, 'z', 'outside-'),
      calcSnap(part.geom, mb.geom, 'x', 'inside+'),
      calcSnap(part.geom, mb.geom, 'y', 'inside-'),
      offsetMm
    )
  )
  return part
}

/**
 * @param {PlanItem[]} plan
 * @param {Part} part
 * @param {string} name
 * @param {{ hidden?: boolean }} [options]
 * @returns {Part}
 */
function place(plan, part, name, options = {}) {
  part.name = name
  if (options.hidden) part.hidden = true
  plan.push({ kind: 'part', part })
  return part
}

/**
 * A part V1 built as a two-solid `Group`: both solids stay addressable as hidden
 * parts, and the visible part is their union — `hardware.bolt.js`'s `tap` shape.
 *
 * @param {PlanItem[]} plan
 * @param {string} name
 * @param {Part[]} parts
 */
function placeUnion(plan, name, parts) {
  for (const part of parts) place(plan, part, part.id, { hidden: true })
  plan.push({ kind: 'union', id: name, name, operands: parts.map((part) => part.id) })
}

/**
 * @param {PlanItem} item
 * @returns {OpRecord[]}
 */
function emit(item) {
  if (item.kind === 'union') {
    return [
      {
        id: item.id,
        op: 'boolean.union',
        params: {},
        operands: [...item.operands],
        name: item.name,
        ...(item.hidden ? { hidden: true } : {}),
      },
    ]
  }
  const { part } = item
  return [
    ...part.baseRecords,
    {
      id: part.id,
      op: 'transform.translate',
      params: { vector: [...part.offsetMm] },
      target: part.baseId,
      ...(part.name ? { name: part.name } : {}),
      ...(part.hidden ? { hidden: true } : {}),
    },
  ]
}

/**
 * V1's `RPiParts.AvJack()`: a block with a barrel snapped onto its `-y` face.
 *
 * @param {string} id
 * @returns {{ block: Part, barrel: Part, parts: Part[] }}
 */
function avJack(id) {
  const block = specPart(`${id}-block`, rpiParts.avJackBlock)
  const barrel = specPart(`${id}-barrel`, rpiParts.avJackBarrel)
  chain(barrel).align(block, 'xz').snap(block, 'y', 'outside+')
  return { block, barrel, parts: [block, barrel] }
}

/**
 * The model 2/3 USB jack: `RPiParts.UsbJack()`, positioned by the translation V1
 * assembles from four separate `calcSnap` calls before cloning.
 *
 * @param {PlanItem[]} plan
 * @param {string} id
 * @param {Part} mb
 * @param {number} yMidlineMm
 */
function addUsbJack(plan, id, mb, yMidlineMm) {
  const body = specPart(`${id}-body`, rpiParts.usbJackBody)
  const flange = specPart(`${id}-flange`, rpiParts.usbJackFlange)
  chain(flange).align(body, 'yz').snap(body, 'x', 'outside-')

  // bplus.js:636-641 — the flange is what sits flush against the board's right edge,
  // while the body supplies the y and z references.
  const translationMm = addVectors(
    calcSnap(flange.geom, mb.geom, 'x', 'inside+'),
    [2, 0, 0],
    calcSnap(body.geom, mb.geom, 'y', 'inside-'),
    calcSnap(body.geom, mb.geom, 'z', 'outside-')
  )

  chain([body, flange], body).translate(translationMm).midlineTo('y', yMidlineMm)
  placeUnion(plan, id, [body, flange])
}

/**
 * Models 2 and 3 — one shared board with a two-line LED fork (`bplus.js:627-745`).
 *
 * @param {PlanItem[]} plan
 * @param {object} context
 * @param {number} context.model
 * @param {Part} context.mb
 */
function addModelB(plan, { model, mb }) {
  const ethernet = rightSide(specPart('ethernet', rpiParts.ethernetJack), mb, [2, 0, 0])
  chain(ethernet).midlineTo('y', 10.25)
  place(plan, ethernet, 'ethernet')

  addUsbJack(plan, 'usb1', mb, 29)
  addUsbJack(plan, 'usb2', mb, 47)

  const microusb = specPart('microusb', rpiParts.microUsb)
  chain(microusb).snap(mb, 'z', 'outside-').midlineTo('x', 10.6).translate([0, -2, 0])
  place(plan, microusb, 'microusb')

  const hdmi = specPart('hdmi', rpiParts.hdmi)
  chain(hdmi).snap(mb, 'z', 'outside-').midlineTo('x', 32).translate([0, -2, 0])
  place(plan, hdmi, 'hdmi')

  const av = avJack('avjack')
  chain(av.parts, av.block).snap(mb, 'z', 'outside-').midlineTo('x', 53.5)
  placeUnion(plan, 'avjack', av.parts)

  const camera = specPart('camera', rpiParts.ribbon)
  chain(camera).snap(mb, 'z', 'outside-').midlineTo('x', 45)
  place(plan, camera, 'camera')

  const display = specPart('display', rpiParts.ribbon)
  chain(display).snap(mb, 'z', 'outside-').midlineTo('x', 3.5).midlineTo('y', 28)
  place(plan, display, 'display')

  const gpio = specPart('gpio', rpiParts.gpio)
  chain(gpio).snap(mb, 'z', 'outside-').midlineTo('x', 32.5).midlineTo('y', 52.5)
  place(plan, gpio, 'gpio')

  const activityled = specPart('activityled', rpiParts.boardLed)
  const powerled = specPart('powerled', rpiParts.boardLed)
  if (model === 3) {
    chain(activityled).snap(mb, 'z', 'outside-').midlineTo('x', 1.1).midlineTo('y', 7.9)
    chain(powerled).snap(mb, 'z', 'outside-').midlineTo('x', 1.1).midlineTo('y', 11.5)
  } else {
    chain(activityled).snap(mb, 'z', 'outside-').translate([1, 43.5, 0])
    chain(powerled).snap(mb, 'z', 'outside-').translate([1, 46, 0])
  }
  place(plan, activityled, 'activityled')
  place(plan, powerled, 'powerled')
}

/**
 * The Pi 4 USB jack (`bplus.js:94-171`): body, flange, and its own clearance slab.
 * `usb2` is V1's clone re-snapped to the board's `-y` edge and midlined to 27.
 *
 * @param {PlanItem[]} plan
 * @param {string} id
 * @param {object} context
 * @param {Part} context.mb
 * @param {number} context.clearanceMm
 * @param {number} [context.yMidlineMm] Re-placement for the second jack.
 */
function addPi4UsbJack(plan, id, { mb, clearanceMm, yMidlineMm }) {
  const flangeSizeMm = 1
  // V1: "top of flange to bottom of board - board thickness".
  const flangeTopMm = 17.6 - 1.55

  const body = cuboidPart(`${id}-body`, [17.58 - flangeSizeMm, 13.15, 16.95 - 1.55], 'corner')
  chain(body)
    .snap(mb, 'x', 'inside+', 3 - flangeSizeMm)
    .midlineTo('y', 9)
    .snap(mb, 'z', 'outside-')

  const flange = cuboidPart(`${id}-flange`, [flangeSizeMm, 15, flangeTopMm], 'corner')
  chain(flange).align(body, 'yz').snap(body, 'x', 'outside-')

  const clearance = cuboidPart(`clearance-${id}`, [clearanceMm, 15, flangeTopMm], 'corner')
  chain(clearance).align(flange, 'yz').snap(flange, 'x', 'outside-')

  if (yMidlineMm !== undefined) {
    chain([body, flange, clearance], body).snap(mb, 'y', 'inside-').midlineTo('y', yMidlineMm)
  }

  placeUnion(plan, id, [body, flange])
  // V1 carried this as a `clearance` subpart of the jack's own group; naming it
  // `clearance-<jack>` matches every other clearance volume in this recipe, and the
  // Pi 5 branch, where V1 itself spells them that way.
  place(plan, clearance, `clearance-${id}`, { hidden: true })
}

/**
 * Model 4 (`bplus.js:33-326`), less the `dimCheck` rulers — see the module doc.
 *
 * @param {PlanItem[]} plan
 * @param {object} context
 * @param {Part} context.mb
 * @param {number} context.clearanceMm
 */
function addPi4(plan, { mb, clearanceMm }) {
  const ethernet = rightSide(cuboidPart('ethernet', [21.38, 16.12, 13.83], 'corner'), mb, [3, 0, 0])
  chain(ethernet).midlineTo('y', 45.75)
  place(plan, ethernet, 'ethernet')

  const smallClearanceMm = 0.5
  const ethernetClearance = cuboidPart(
    'clearance-ethernet',
    [clearanceMm, 16.12 + smallClearanceMm, 13.83 + smallClearanceMm],
    'corner'
  )
  chain(ethernetClearance).align(ethernet, 'yz').snap(ethernet, 'x', 'outside-')
  place(plan, ethernetClearance, 'clearance-ethernet', { hidden: true })

  addPi4UsbJack(plan, 'usb1', { mb, clearanceMm })
  addPi4UsbJack(plan, 'usb2', { mb, clearanceMm, yMidlineMm: 27 })

  /**
   * The three front-edge connectors share a shape: a block overhanging the board's
   * `-y` edge by 1 mm, and a clearance slab in front of it.
   *
   * @param {string} name
   * @param {readonly number[]} sizeMm
   * @param {readonly number[]} clearanceSizeMm
   * @param {number} xMidlineMm
   */
  const frontConnector = (name, sizeMm, clearanceSizeMm, xMidlineMm) => {
    const part = cuboidPart(name, sizeMm, 'corner')
    chain(part)
      .snap(mb, 'y', 'inside-', -1)
      .snap(mb, 'z', 'outside-')
      .midlineTo('x', xMidlineMm)
    place(plan, part, name)

    const clearance = cuboidPart(
      `clearance-${name}`,
      [clearanceSizeMm[0], clearanceMm, clearanceSizeMm[1]],
      'corner'
    )
    chain(clearance).align(part, 'xz').snap(part, 'y', 'outside+')
    place(plan, clearance, `clearance-${name}`, { hidden: true })
  }

  frontConnector('usbc', [10, 7.5, 3.2], [10.5, 3.7], 3.5 + 7.7)
  frontConnector('hdmi1', [7, 7.5, 3], [7.5, 3.5], 3.5 + 7.7 + 14.8)
  frontConnector('hdmi2', [7, 7.5, 3], [7.5, 3.5], 3.5 + 7.7 + 14.8 + 13.5)

  const av = avJack('avjack')
  chain(av.parts, av.block)
    .snap(mb, 'z', 'outside-')
    .midlineTo('x', 3.5 + 7.7 + 14.8 + 13.5 + 7 + 7.5)
  placeUnion(plan, 'avjack', av.parts)

  const avClearance = cylinderPart('clearance-avjack', 6.5, clearanceMm + 1, 'base', [90, 0, 0])
  chain(avClearance).align(av.parts, 'xz').snap(av.parts, 'y', 'outside+', 1)
  place(plan, avClearance, 'clearance-avjack', { hidden: true })

  const camera = specPart('camera', rpiParts.ribbon)
  chain(camera).snap(mb, 'z', 'outside-').midlineTo('x', 3.5 + 7.7 + 14.8 + 13.5 + 7)
  place(plan, camera, 'camera')

  const display = specPart('display', rpiParts.ribbon)
  chain(display).snap(mb, 'z', 'outside-').midlineTo('x', 4).midlineTo('y', 24.5 + 3.5)
  place(plan, display, 'display')

  const gpio = specPart('gpio', rpiParts.gpio)
  chain(gpio)
    .snap(mb, 'z', 'outside-')
    .midlineTo('x', 29 + 3.5)
    .midlineTo('y', 56 - 3.5)
  place(plan, gpio, 'gpio')

  /**
   * @param {string} name
   * @param {number} yMidlineMm
   */
  const led = (name, yMidlineMm) => {
    const part = specPart(name, rpiParts.boardLed)
    chain(part).snap(mb, 'z', 'outside-').midlineTo('x', 1.1).midlineTo('y', yMidlineMm)
    place(plan, part, name)

    const clearance = cylinderPart(`clearance-${name}`, 2, clearanceMm, 'base', [0, 90, 0])
    chain(clearance).align(part, 'yz').snap(mb, 'x', 'outside+')
    place(plan, clearance, `clearance-${name}`, { hidden: true })
  }

  led('activityled', 8)
  led('powerled', 12)
}

/**
 * Model 5 (`bplus.js:335-550`).
 *
 * @param {PlanItem[]} plan
 * @param {object} context
 * @param {Part} context.mb
 * @param {number} context.clearanceMm
 */
function addPi5(plan, { mb, clearanceMm }) {
  const cpu = cuboidPart('cpu', [17, 17, 3], 'corner')
  chain(cpu)
    .translate([0, 15, 0])
    .midlineTo('x', 29 + 3.5)
    .snap(mb, 'z', 'outside-')
  place(plan, cpu, 'cpu')

  const cpuClearance = cuboidPart('clearance-cpu', [17, 17, clearanceMm], 'corner')
  chain(cpuClearance).align(cpu, 'xy').snap(cpu, 'z', 'outside-')
  place(plan, cpuClearance, 'clearance-cpu', { hidden: true })

  const ethernet = rightSide(cuboidPart('ethernet', [21.5, 16.5, 13.5], 'corner'), mb, [3, 0, 0])
  chain(ethernet).midlineTo('y', 10.2)
  place(plan, ethernet, 'ethernet')

  const ethernetClearance = cuboidPart('clearance-ethernet', [clearanceMm, 16.5, 13.5], 'corner')
  chain(ethernetClearance).align(ethernet, 'yz').snap(ethernet, 'x', 'outside-')
  place(plan, ethernetClearance, 'clearance-ethernet', { hidden: true })

  /**
   * @param {string} id
   * @param {number} yMidlineMm
   * @param {number} clearanceHeightMm V1 spells usb1's 16.5 and usb2's 16 — kept.
   */
  const usbJack = (id, yMidlineMm, clearanceHeightMm) => {
    const body = cuboidPart(`${id}-body`, [17, 13.1, 15], 'corner')
    chain(body).snap(ethernet, 'x', 'inside+', -1).snap(mb, 'z', 'outside-', 0.5)

    const flange = cuboidPart(`${id}-flange`, [1, 15, 16.5], 'corner')
    chain(flange).snap(body, 'x', 'outside-').align(body, 'yz')

    chain([body, flange], body).midlineTo('y', yMidlineMm)
    placeUnion(plan, id, [body, flange])

    const clearance = cuboidPart(`clearance-${id}`, [clearanceMm, 15, clearanceHeightMm], 'corner')
    chain(clearance).align([body, flange], 'yz').snap([body, flange], 'x', 'outside-')
    place(plan, clearance, `clearance-${id}`, { hidden: true })
  }

  usbJack('usb1', 29.1, 16.5)
  usbJack('usb2', 47, 16)

  /**
   * @param {string} name
   * @param {readonly number[]} sizeMm
   * @param {readonly number[]} clearanceSizeMm
   * @param {number} xMidlineMm
   */
  const frontConnector = (name, sizeMm, clearanceSizeMm, xMidlineMm) => {
    const part = cuboidPart(name, sizeMm, 'corner')
    chain(part)
      .snap(mb, 'y', 'inside-', -1)
      .snap(mb, 'z', 'outside-')
      .midlineTo('x', xMidlineMm)
    place(plan, part, name)

    const clearance = cuboidPart(
      `clearance-${name}`,
      [clearanceSizeMm[0], clearanceMm, clearanceSizeMm[1]],
      'corner'
    )
    chain(clearance).align(part, 'xz').snap(part, 'y', 'outside+')
    place(plan, clearance, `clearance-${name}`, { hidden: true })
  }

  frontConnector('usbc', [10, 7.5, 3.2], [10.5, 3.7], 11.2)
  frontConnector('hdmi1', [7, 7.5, 3], [7.5, 3.5], 25.8)
  frontConnector('hdmi2', [7, 7.5, 3], [7.5, 3.5], 39.2)

  const camera0 = specPart('camera0', rpiParts.camDisplay)
  chain(camera0).snap(mb, 'z', 'outside-').midlineTo('x', 55)
  place(plan, camera0, 'camera0')

  const camera1 = specPart('camera1', rpiParts.camDisplay)
  chain(camera1).snap(mb, 'z', 'outside-').midlineTo('x', 50)
  place(plan, camera1, 'camera1')

  // V1 names the PCIe connector `display`, which is what a Pi 5's FPC socket in this
  // position actually drives. Kept, so a downstream part can address it by the name
  // every other model uses.
  const display = specPart('display', rpiParts.pcie)
  chain(display).snap(mb, 'z', 'outside-').midlineTo('x', 3.5).midlineTo('y', 30)
  place(plan, display, 'display')

  const gpio = specPart('gpio', rpiParts.gpio)
  chain(gpio)
    .snap(mb, 'z', 'outside-')
    .midlineTo('x', 29 + 3.5)
    .midlineTo('y', 56 - 3.5)
  place(plan, gpio, 'gpio')

  const statusled = specPart('statusled', rpiParts.boardLed)
  chain(statusled).snap(mb, 'z', 'outside-').midlineTo('x', 1.1).midlineTo('y', 13.3)
  place(plan, statusled, 'statusled')

  const statusledClearance = cylinderPart('clearance-statusled', 2, clearanceMm, 'base', [0, 90, 0])
  chain(statusledClearance).align(statusled, 'yz').snap(mb, 'x', 'outside+')
  place(plan, statusledClearance, 'clearance-statusled', { hidden: true })

  const pswBlock = specPart('powerswitch-block', rpiParts.pswBlock)
  const pswButton = specPart('powerswitch-button', rpiParts.pswButton)
  chain(pswButton).align(pswBlock, 'yz').snap(pswBlock, 'x', 'outside+')
  const psw = [pswBlock, pswButton]
  chain(psw, pswBlock).snap(mb, 'z', 'outside-').snap(mb, 'x', 'inside-').midlineTo('y', 18.4)
  placeUnion(plan, 'powerswitch', psw)

  const pswClearance = cylinderPart('clearance-powerswitch', 3, clearanceMm, 'base', [0, 90, 0])
  chain(pswClearance).align(psw, 'yz').snap(psw, 'x', 'outside+')
  place(plan, pswClearance, 'clearance-powerswitch', { hidden: true })
}

/**
 * The two Pi 5 fan-mount holes and their clearance cylinders (`bplus.js:769-805`).
 *
 * @param {PlanItem[]} plan
 * @param {Part} mb
 */
function addFanHoles(plan, mb) {
  /**
   * @param {string} name
   * @param {number} xMm
   * @param {number} yMm
   */
  const fanHole = (name, xMm, yMm) => {
    const hole = cylinderPart(
      name,
      MOUNTING_HOLES_MM.diameterMm,
      BPLUS_BOARD.thicknessMm,
      /** @type {'center'} */ (rpiParts.mountingHole.frame)
    )
    chain(hole).snap(mb, 'xy', 'inside-').align(mb, 'z').midlineTo('x', xMm).midlineTo('y', yMm)
    place(plan, hole, name, { hidden: true })

    const clearance = cylinderPart(`clearance-${name.replace('hole', '')}`, 4.5, 4, 'base')
    chain(clearance).align(hole, 'xy').snap(mb, 'z', 'outside+')
    place(plan, clearance, `clearance-${name.replace('hole', '')}`, { hidden: true })
  }

  fanHole('fan1hole', 3.5, 6 + 3.5)
  fanHole('fan2hole', 3.5 + 58, 52.5 - 6)
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function requirePositiveMm(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${OP}: ${label} must be a positive number of millimetres, got ${String(value)}`)
  }
  return value
}

/**
 * Expand a `raspberrypi.bplus` document line into the op records that define it.
 *
 * @param {object} params
 * @param {number} [params.model] `2` (B+/A+/Pi 2), `3`, `4` or `5`. V1's default is 2.
 *   V1 additionally coerced `false`/`0` to 2 and `true` to 3 — an artefact of its own
 *   boolean-flag history, not a documented input, so an unrecognised model is rejected
 *   here instead, the same way `hardware.bolt` rejects an unknown spec.
 * @param {number} [params.clearance] Clearance depth in millimetres for the hidden
 *   `clearance-*` volumes models 4 and 5 carry. V1's default is 5.
 * @returns {OpRecord[]} Op records in the same schema the document stores.
 */
export function bplus(params) {
  const { model = DEFAULT_MODEL, clearance = DEFAULT_CLEARANCE_MM } = params

  if (!BPLUS_MODELS.includes(/** @type {number} */ (model))) {
    throw new Error(
      `${OP}: unknown model ${JSON.stringify(model)}, expected one of ` +
        BPLUS_MODELS.join(' | ')
    )
  }
  const clearanceMm = requirePositiveMm(clearance, 'clearance')

  /** @type {PlanItem[]} */
  const plan = []

  const mb = boardPart('mb', BPLUS_BOARD.bplusCornerRadiusMm)
  place(plan, mb, 'mb')

  if (model < 4) addModelB(plan, { model, mb })
  else if (model === 4) addPi4(plan, { mb, clearanceMm })
  else addPi5(plan, { mb, clearanceMm })

  const microsd = cuboidPart('microsd', [15.2, 12, 1.5], 'corner')
  chain(microsd).snap(mb, 'z', 'outside+').midlineTo('y', 28).translate([-2.5, 0, 0])
  place(plan, microsd, 'microsd')

  MOUNTING_HOLES_MM.positions.forEach(([xMm, yMm], index) => {
    const hole = cylinderPart(
      `hole${index + 1}`,
      MOUNTING_HOLES_MM.diameterMm,
      MOUNTING_HOLES_MM.heightMm,
      /** @type {'center'} */ (rpiParts.mountingHole.frame)
    )
    chain(hole).snap(mb, 'xy', 'inside-').align(mb, 'z').midlineTo('x', xMm).midlineTo('y', yMm)
    place(plan, hole, `hole${index + 1}`, { hidden: true })
  })

  if (model >= 5) addFanHoles(plan, mb)

  return plan.flatMap(emit)
}
