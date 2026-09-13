/**
 * The `raspberrypi.cameraModule` composite recipe — one Raspberry Pi camera board, with
 * a single `model` param picking which of the five V1 camera factories to reproduce.
 *
 * ## What it reproduces
 *
 * `jscad-raspberrypi@62a8e3b`'s five camera factories: `CameraModuleV1`
 * (`src/camera-module-v1.js:28-116`), `CameraModuleV2` (`camera-module-v2.js:12-115`),
 * `CameraModuleV3` (`camera-module-v3.js:26-121`), `HQCameraModule`
 * (`hq_camera-module.js:41-115`) and `ArducamHQCameraModule`
 * (`arducam_hq_camera-module.js:40-100`).
 *
 * One factory with a `model` param, not one registry op per camera — the shape
 * `hardware.bolt` established and `raspberrypi.bplus` (TODO/core-014) followed.
 *
 * V1's sixth file, `src/camera-module.js`, is dead code: it reads `this.Parts` inside a
 * plain `export default function`, which can never resolve, and nothing imports it or
 * re-exports it from `index.js`. Not ported.
 *
 * ## The mechanism: probe, measure, bake
 *
 * Identical to `raspberrypi.bplus`, and deliberately so — see that file's own module
 * doc for why `group.snap` never appears as a record. Each part builds its real
 * `@jscad/modeling` solid as a throwaway **probe**, runs the same measurements V1's
 * `.snap`/`.align`/`.midlineTo` chain implies (`group.js`'s already-tested `calcSnap`/
 * `calcCenterWith`), discards the probe, and emits records carrying the computed
 * numbers. {@link chain} reads like V1's chain on purpose, so this file can be diffed
 * against the five sources line by line.
 *
 * The helper set here is a narrower cousin of `raspberrypi.bplus.js`'s rather than a
 * shared import: these variants need three things that recipe never did (a part derived
 * from another part's *record*, a cuboid stretch, and a rotated copy) and none of what
 * it needs for a fifty-part board (`rightSide`, the `rpi-parts` spec table, rotated
 * cylinders measured for sign). Extracting the common core is worth doing once
 * `core-016`-`018` show which parts of it are actually shared; doing it from a sample
 * of two would be guessing.
 *
 * ## V1's coordinate frame, which is *not* `raspberrypi.bplus`'s
 *
 * Every camera board is built with `Parts.Cube(...).Center()` or
 * `Parts.RoundedCube(...).Center()`. `Center()` is `align(unitCube(), axes || 'xy')`
 * (`jscad-utils/src/add-prototype.js:255`) — it centres on **x and y only, never z** —
 * so V1 leaves the board centred on the origin in plan with its underside on `z = 0`.
 * This port keeps that frame exactly, which is what makes the HQ variants' `rotateZ`
 * land where V1 puts it (see {@link addHqFamily}).
 *
 * The consequence worth stating out loud: a "hole at (2, 2)" in the classic variants is
 * **board-relative**, measured from the board's minimum corner, not an absolute
 * coordinate. V1 gets there by snapping the hole's minimum corner to the board's and
 * then applying `midlineTo` as the *relative* translate it really is — see
 * {@link chain}'s `midlineTo` for that quirk, which `raspberrypi.bplus` documents at
 * length.
 *
 * ## Three deliberate departures from V1
 *
 * **Keep-out volumes are hidden.** V1 is inconsistent: `camera-module-v3.js:107,116`
 * hides both `-nogo` parts, while v1/v2 and both HQ variants leave them visible, so a
 * default render of those four shows solid red blocks sitting over the model. A `-nogo`
 * is a clearance volume, structurally identical to `hardware.bolt`'s `tap-*`, so all of
 * them are `hidden: true` here.
 *
 * **Mounting holes are parts, not holes.** Same call `raspberrypi.bplus` made, for the
 * same reason: `group.js` has `addHole`, but no `OpRecord` field reaches it, so the
 * holes are hidden named parts and the board renders undrilled. A consumer that wants
 * them drilled emits its own `boolean.subtract` against `hole0`-`hole3`.
 *
 * **V1's aggregate subassemblies are not reproduced.** `g.add(Group(mounts), 'mounts',
 * true, 'mounts')` stores both a combined `mounts` part and four `mountsmount0`-style
 * subparts (`jscad-utils/src/group.js:83-100`). This port has no grouping construct
 * between a record and the document, so it emits the leaves flat as `mount0`-`mount3`
 * and skips the combined entries.
 *
 * @module core/kernel/recipes/raspberrypi.cameraModule
 */

import modeling from '@jscad/modeling'

import { axisApply, calcCenterWith, calcSnap, enlarge, sizeOf } from '../group.js'

// See group.js: default import, not named, so this runs under raw Node ESM too.
const { extrusions, primitives, transforms } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('../registry.js').OpRecord} OpRecord */
/** @typedef {[number, number, number]} Vec3Mm */

const OP = 'raspberrypi.cameraModule'

/**
 * The five cameras this port covers, keyed the way a document line names them.
 *
 * @type {readonly ('v1' | 'v2' | 'v3' | 'hq' | 'arducam-hq')[]}
 */
export const CAMERA_MODULE_MODELS = Object.freeze(
  /** @type {const} */ (['v1', 'v2', 'v3', 'hq', 'arducam-hq'])
)

/** @typedef {(typeof CAMERA_MODULE_MODELS)[number]} CameraModel */

/**
 * V1 has no default — it ships five separate factories with no shared entry point — so
 * this is a port decision rather than a carried-over constant. `v3` is the
 * current-generation standard Raspberry Pi camera, and picking one keeps this op usable
 * with no params at all, the way every other composite in the registry is.
 *
 * @type {CameraModel}
 */
export const DEFAULT_MODEL = 'v3'

/**
 * Segment count for every cylinder and rounded corner here. Matches `registry.js`'s
 * `DEFAULT_SEGMENTS` and `@jscad/csg`'s `defaultResolution2D`, which V1 passed
 * explicitly. Defined locally rather than imported from `registry.js`, which imports
 * *this* file.
 */
const SEGMENTS = 32

/**
 * `jscad-utils`' `util.NOZZEL_SIZE` (`src/util.js:26`) — the extrusion width V1 rounds
 * pin diameters down to, so a printed pin is a whole number of perimeters.
 */
const NOZZLE_SIZE_MM = 0.4

/**
 * `util.nearest.under` (`jscad-utils/src/util.js:37`). Spelled as the arithmetic rather
 * than as its result, because `Math.floor(1.5 / 0.4) * 0.4` is `1.2000000000000002`
 * and the literal `1.2` is not the same number.
 *
 * @param {number} desiredMm
 * @returns {number}
 */
function nearestUnder(desiredMm) {
  return Math.floor(desiredMm / NOZZLE_SIZE_MM) * NOZZLE_SIZE_MM
}

/**
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
 *   { kind: 'boolean', id: string, op: 'boolean.union' | 'boolean.subtract',
 *     target: string, operands: string[], name?: string, hidden?: boolean }} PlanItem
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
 * `naturalOffsetMm` is the V1→V3 impedance mismatch in one number: V1's factories
 * disagree about where a fresh solid sits (`Parts.Cube` puts its minimum corner on the
 * origin, `Parts.Cylinder` its base, `.Center()` centres xy and leaves z alone) while
 * every `primitive.*` op here is centred. That difference is not cosmetic, because
 * `midlineTo` and a bare `.translate` move a solid *relatively*.
 *
 * @param {string} id
 * @param {object} args
 * @param {OpRecord[]} args.baseRecords
 * @param {string} args.baseId
 * @param {Geom3} args.base Geometry the base records produce.
 * @param {Vec3Mm} args.naturalOffsetMm
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
 * V1's `Parts.Cube({x, y, z})`: a box with its minimum corner on the origin.
 *
 * @param {string} id
 * @param {readonly number[]} sizeMm
 * @returns {Part}
 */
function cuboidPart(id, sizeMm) {
  const size = /** @type {Vec3Mm} */ ([sizeMm[0], sizeMm[1], sizeMm[2]])
  return makePart(id, {
    baseRecords: [{ id: `${id}.solid`, op: 'primitive.cuboid', params: { size: [...size] } }],
    baseId: `${id}.solid`,
    base: primitives.cuboid({ size }),
    naturalOffsetMm: [size[0] / 2, size[1] / 2, size[2] / 2],
  })
}

/**
 * V1's `Parts.Cylinder(diameter, height)`: upright, its base on `z = 0`, centred on the
 * origin in plan.
 *
 * @param {string} id
 * @param {number} diameterMm
 * @param {number} heightMm
 * @returns {Part}
 */
function cylinderPart(id, diameterMm, heightMm) {
  return makePart(id, {
    baseRecords: [
      {
        id: `${id}.solid`,
        op: 'primitive.cylinder',
        params: { diameter: diameterMm, height: heightMm, segments: SEGMENTS },
      },
    ],
    baseId: `${id}.solid`,
    base: primitives.cylinder({
      radius: diameterMm / 2,
      height: heightMm,
      segments: SEGMENTS,
    }),
    naturalOffsetMm: [0, 0, heightMm / 2],
  })
}

/**
 * V1's `Parts.RoundedCube(x, y, thickness, cornerRadius)` — a rounded rectangle
 * extruded to thickness, the same `profile.roundedRectangle` → `profile.extrudeLinear`
 * pair `kit.board` emits. (A composite cannot invoke another composite's expansion, so
 * this reuses the pattern rather than the op.)
 *
 * @param {string} id
 * @param {number} widthMm
 * @param {number} heightMm
 * @param {number} thicknessMm
 * @param {number} cornerRadiusMm
 * @param {'corner' | 'centred'} frame `'corner'` is V1's bare `RoundedCube`;
 *   `'centred'` is the same thing with `.Center()` applied — xy only, never z.
 * @returns {Part}
 */
function roundedCubePart(id, widthMm, heightMm, thicknessMm, cornerRadiusMm, frame) {
  const profile = primitives.roundedRectangle({
    size: [widthMm, heightMm],
    roundRadius: cornerRadiusMm,
    segments: SEGMENTS,
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
          segments: SEGMENTS,
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
    naturalOffsetMm: frame === 'corner' ? [widthMm / 2, heightMm / 2, 0] : [0, 0, 0],
  })
}

/**
 * A part built *from another part's result* rather than from a primitive — V1's
 * `g.parts.ribbon.enlarge(...)` and `hole.rotateZ(90)`. The source part's own final
 * record is the target, so the new part starts life exactly where the source sits and
 * its offset accumulates from zero.
 *
 * @param {string} id
 * @param {object} args
 * @param {string} args.op
 * @param {Record<string, any>} args.params
 * @param {Part} args.source
 * @param {Geom3} args.base The same derivation applied to the source's probe.
 * @returns {Part}
 */
function derivedPart(id, { op, params, source, base }) {
  return makePart(id, {
    baseRecords: [{ id: `${id}.derived`, op, params, target: source.id }],
    baseId: `${id}.derived`,
    base,
    naturalOffsetMm: [0, 0, 0],
  })
}

/**
 * V1's `.enlarge(dx, dy, dz)`: grow each axis of the bounding box by that many
 * millimetres, keeping the centroid where it is.
 *
 * @param {string} id
 * @param {Part} source
 * @param {Vec3Mm} deltaMm
 * @returns {Part}
 */
function enlargedPart(id, source, deltaMm) {
  return derivedPart(id, {
    op: 'modify.enlarge',
    params: { deltaMm: [...deltaMm] },
    source,
    // `enlarge` is typed to pass a Group straight through; a Part's probe is always
    // bare geometry, so this narrowing is about the shared signature, not a claim.
    base: /** @type {Geom3} */ (enlarge(source.geom, deltaMm)),
  })
}

/**
 * Grow an axis-aligned cuboid along one axis, V1's `.stretch(axis, distance)`.
 *
 * `util.stretch` cuts the solid at its own centre plane, extrudes the cross-section by
 * `distance`, and translates the positive half out by the same amount
 * (`@jscad/csg`'s `stretchAtPlane`). For an axis-aligned box that is exactly a larger
 * box with its negative face left where it was — so this bakes the result as the larger
 * cuboid rather than adding a kernel op for a case that has none. It is *not* a
 * substitute for building the part at its final size: V1 places the part at its
 * pre-stretch size, and `midlineTo` reads that size.
 *
 * @param {Part} part Must be a bare `primitive.cuboid`; nothing else survives the shortcut.
 * @param {'x' | 'y' | 'z'} axis
 * @param {number} distanceMm
 * @returns {Part}
 */
function stretchCuboid(part, axis, distanceMm) {
  const record = part.baseRecords[0]
  if (part.baseRecords.length !== 1 || record.op !== 'primitive.cuboid' || !record.params) {
    throw new Error(
      `${OP}: stretch only applies to a bare cuboid, not ${part.id} (${record.op})`
    )
  }
  const index = { x: 0, y: 1, z: 2 }[axis]
  const size = /** @type {number[]} */ (record.params.size)
  size[index] += distanceMm
  part.offsetMm = addVectors(
    part.offsetMm,
    axisApply(axis, () => distanceMm / 2)
  )
  part.geom = transforms.translate(
    part.offsetMm,
    primitives.cuboid({ size: /** @type {Vec3Mm} */ ([size[0], size[1], size[2]]) })
  )
  return part
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
 * @param {Part | Part[]} target What moves.
 * @param {Part} [ruler] What gets measured; defaults to the first (or only) part.
 */
function chain(target, ruler) {
  const parts = Array.isArray(target) ? target : [target]
  const measured = ruler ?? parts[0]

  const api = {
    /**
     * @param {Part} reference
     * @param {string} axes
     * @param {string} orientation A key of `group.js`'s `SNAP_SIDES`.
     * @param {number} [deltaMm]
     */
    snap(reference, axes, orientation, deltaMm) {
      move(parts, calcSnap(measured.geom, reference.geom, axes, orientation, deltaMm))
      return api
    },

    /**
     * V1's `.align(to, axis)`. Worth noting because three call sites in these sources
     * pass a third argument (`camera-module-v1.js:84`'s `.align(lens, 'y', 'inside-')`)
     * that `add-prototype.js:186` simply does not accept — it is silently ignored there
     * and deliberately not reproduced here.
     *
     * @param {Part} reference
     * @param {string} axes
     */
    align(reference, axes) {
      move(parts, calcCenterWith(measured.geom, axes, reference.geom))
      return api
    },

    /**
     * V1's `util.calcmidlineTo`, quirk included: it returns `to - size / 2` as a
     * *relative* translation, without consulting where the solid currently is. In these
     * five sources every call site is preceded by a `snap(board, …, 'inside-')` on the
     * same axis, so the solid's minimum is the board's minimum and the result really is
     * "put the midline `to` millimetres in from the board's edge". Ported as the
     * relative translate it actually is, so a future call site that breaks that
     * precondition diverges from V1 the same way V1 diverges from itself.
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
 * @param {PlanItem[]} plan
 * @param {Part} part
 * @param {string | null} name `null` for a pure intermediate — a cutting tool, or the
 *   un-booleaned half of a part V1 only ever exposes through its boolean.
 * @param {{ hidden?: boolean }} [options]
 * @returns {Part}
 */
function place(plan, part, name, options = {}) {
  if (name !== null) part.name = name
  if (options.hidden) part.hidden = true
  plan.push({ kind: 'part', part })
  return part
}

/**
 * @param {PlanItem} item
 * @returns {OpRecord[]}
 */
function emit(item) {
  if (item.kind === 'boolean') {
    return [
      {
        id: item.id,
        op: item.op,
        params: {},
        target: item.target,
        operands: [...item.operands],
        ...(item.name ? { name: item.name } : {}),
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
 * The four mounting-hole centres every classic variant shares, measured from the
 * board's minimum corner. V1 spells v1's x positions as `12.5 + 2`
 * (`camera-module-v1.js:40-41`) and v2/v3's as a bare `14.5` — the same number.
 */
const CLASSIC_HOLE_CENTRES_MM = Object.freeze([
  [2, 2],
  [2, 23],
  [14.5, 2],
  [14.5, 23],
])

/**
 * The v1/v2/v3 family. One board, four holes with a mount and a pin each, a sensor with
 * a lens and a lens ribbon, a display ribbon down the `+x` edge, and two keep-outs.
 *
 * @param {PlanItem[]} plan
 * @param {CameraModel} model
 */
function addClassicFamily(plan, model) {
  // `t` is V1's own variable name and is *not* always the board thickness: v3 makes the
  // board 1.12 thick (`camera-module-v3.js:32`) while leaving `t` at 1.1, which is why
  // its pins float 0.01 mm clear of each face.
  const tMm = 1.1
  const spec = {
    v1: {
      boardMm: /** @type {Vec3Mm} */ ([24, 25, tMm]),
      cornerRadiusMm: /** @type {number | null} */ (null),
      holeDepthMm: tMm,
      mountHeightMm: 2,
      sensorMm: /** @type {Vec3Mm} */ ([8.5, 8.5, 2]),
      ribbonMm: /** @type {Vec3Mm} */ ([5.5, 17, 3]),
    },
    v2: {
      boardMm: /** @type {Vec3Mm} */ ([23.862, 25, tMm]),
      cornerRadiusMm: /** @type {number | null} */ (2),
      holeDepthMm: tMm,
      // V1: `height.sensor = 4 - t`.
      mountHeightMm: 4 - tMm,
      sensorMm: /** @type {Vec3Mm} */ ([8.5, 8.5, 4 - tMm]),
      ribbonMm: /** @type {Vec3Mm} */ ([5.5, 20.8, 3.55 - tMm]),
    },
    v3: {
      boardMm: /** @type {Vec3Mm} */ ([23.862, 25, 1.12]),
      cornerRadiusMm: /** @type {number | null} */ (2),
      holeDepthMm: 1.12,
      mountHeightMm: 4 - tMm,
      // V1's own comment: the drawing says 3.875, but the sticky pad under the sensor
      // takes the overall height to 5.7.
      sensorMm: /** @type {Vec3Mm} */ ([10.8, 10.8, 5.7]),
      ribbonMm: /** @type {Vec3Mm} */ ([5.71, 19.61, 2.75]),
    },
  }[/** @type {'v1' | 'v2' | 'v3'} */ (model)]

  const [boardWidthMm, boardHeightMm, boardThicknessMm] = spec.boardMm
  const board =
    spec.cornerRadiusMm === null
      ? makePart('board', {
          baseRecords: [
            { id: 'board.solid', op: 'primitive.cuboid', params: { size: [...spec.boardMm] } },
          ],
          baseId: 'board.solid',
          base: primitives.cuboid({ size: spec.boardMm }),
          // `.Center()` on xy only — z keeps its 0..t span.
          naturalOffsetMm: [0, 0, boardThicknessMm / 2],
        })
      : roundedCubePart(
          'board',
          boardWidthMm,
          boardHeightMm,
          boardThicknessMm,
          spec.cornerRadiusMm,
          'centred'
        )
  place(plan, board, 'board')

  /** @type {Part[]} */
  const holes = []
  CLASSIC_HOLE_CENTRES_MM.forEach(([xMm, yMm], index) => {
    const hole = cylinderPart(`hole${index}`, 2.2, spec.holeDepthMm)
    chain(hole).snap(board, 'xy', 'inside-').midlineTo('x', xMm).midlineTo('y', yMm)
    place(plan, hole, `hole${index}`, { hidden: true })
    holes.push(hole)

    const mount = cylinderPart(`mount${index}`, 4, spec.mountHeightMm)
    chain(mount).align(hole, 'xy').snap(board, 'z', 'outside-')
    place(plan, mount, `mount${index}`, { hidden: true })

    const pin = cylinderPart(`pin${index}`, nearestUnder(1.5), tMm)
    chain(pin).align(hole, 'xy').align(board, 'z')
    place(plan, pin, `pin${index}`, { hidden: true })
  })

  const sensor = cuboidPart('sensor', spec.sensorMm)
  chain(sensor)
    .snap(board, 'xy', 'inside-')
    .snap(board, 'z', 'outside-')
    .midlineTo('x', 14.5)
    .midlineTo('y', 12.5)
  place(plan, sensor, 'sensor')

  if (model === 'v1') {
    // A square block, not a barrel — the one variant whose lens is a cuboid.
    const lens = cuboidPart('lens', [8.5, 8.5, 5.9 - tMm - 2])
    chain(lens).align(sensor, 'xy').snap(sensor, 'z', 'outside-')
    place(plan, lens, 'lens')

    const lensribbon = cuboidPart('lensribbon', [7.56, 10, 2.65 - tMm])
    chain(lensribbon)
      .snap(board, 'z', 'outside-')
      .align(lens, 'y')
      .snap(lens, 'x', 'outside+', -1)
    place(plan, lensribbon, 'lensribbon')
  } else if (model === 'v2') {
    const lens = cylinderPart('lens', 7.3, 1.6)
    chain(lens).align(sensor, 'xy').snap(sensor, 'z', 'outside-')
    place(plan, lens, 'lens')

    const lensribbon = cuboidPart('lensribbon', [4, 9, 2.65 - tMm])
    chain(lensribbon)
      .snap(board, 'xy', 'inside-')
      .snap(board, 'z', 'outside-')
      .midlineTo('x', 4.7)
      .midlineTo('y', 13.8)
    stretchCuboid(lensribbon, 'x', 4)
    place(plan, lensribbon, 'lensribbon')
  } else {
    const lens = cylinderPart('lens', 8.1, 6.98 - 3.875)
    chain(lens).align(sensor, 'xy').snap(sensor, 'z', 'outside-')
    place(plan, lens, 'lens')

    const lensribbon = cuboidPart('lensribbon', [7.3, 8.9, 2.65 - tMm])
    chain(lensribbon)
      .snap(sensor, 'x', 'outside+')
      .align(sensor, 'y')
      .translate([0, -1.5, 0])
      .snap(board, 'z', 'outside-')
    place(plan, lensribbon, 'lensribbon')
  }

  const ribbon = cuboidPart('ribbon', spec.ribbonMm)
  chain(ribbon)
    .snap(board, 'x', 'inside+')
    .snap(board, 'y', 'inside-')
    .snap(board, 'z', 'outside+')
    .midlineTo('y', 12.5)
  place(plan, ribbon, 'ribbon')

  // The underside keep-out: a slab as wide as the board less the ribbon's own strip,
  // with a generously enlarged copy of each mounting hole cut out of it.
  const slab = roundedCubePart(
    'bottom-nogo.slab',
    boardWidthMm - 5.5,
    25,
    2.5 - tMm,
    2,
    'corner'
  )
  chain(slab).snap(board, 'xy', 'inside-').snap(board, 'z', 'outside+')
  place(plan, slab, null)

  const cuts = holes.map((hole, index) => {
    const cut = enlargedPart(`bottom-nogo.cut${index}`, hole, [3, 3, 5])
    // Unnamed: a cutting tool is not a part of the assembly, unlike the `-nogo`
    // volumes themselves, which are hidden but addressable.
    return place(plan, cut, null)
  })
  plan.push({
    kind: 'boolean',
    id: 'bottom-nogo',
    op: 'boolean.subtract',
    target: slab.id,
    operands: cuts.map((cut) => cut.id),
    name: 'bottom-nogo',
    hidden: true,
  })

  const ribbonNogo = enlargedPart('ribbon-nogo', ribbon, [2, -1, -1])
  chain(ribbonNogo).snap(ribbon, 'x', 'outside-')
  place(plan, ribbonNogo, 'ribbon-nogo', { hidden: true })
}

/**
 * The HQ family — the official HQ camera and Arducam's clone of it. Same 38 mm board,
 * same four rotated corner holes, same lens-mount ring; the Arducam drops the tripod
 * mount and uses a smaller, taller ring on a thicker board.
 *
 * @param {PlanItem[]} plan
 * @param {CameraModel} model
 * @param {boolean} flipTripodMount
 */
function addHqFamily(plan, model, flipTripodMount) {
  const spec =
    model === 'hq'
      ? {
          thicknessMm: 1.1,
          mountDiameterMm: 36,
          mountInsideDiameterMm: 30.75,
          mountHeightMm: 10.2,
          ribbonThicknessMm: 3.55 - 1.1,
          tripodMount: true,
        }
      : {
          thicknessMm: 1.6,
          mountDiameterMm: 30,
          mountInsideDiameterMm: 24.5,
          mountHeightMm: 13,
          ribbonThicknessMm: 4.25 - 1.6,
          tripodMount: false,
        }

  const board = roundedCubePart('board', 38, 38, spec.thicknessMm, 1.4, 'centred')
  place(plan, board, 'board')

  const hole1 = cylinderPart('hole1', 3.25, 10)
  chain(hole1).snap(board, 'xy', 'inside+', 1.25).translate([-4, -4, -5])
  place(plan, hole1, 'hole1', { hidden: true })

  // `hq_camera-module.js:57-59` turns the *same* hole by 90/180/-90 rather than
  // positioning four holes. `transforms.rotate` — and this project's `transform.rotate`
  // with its default `center` of the world origin — turns about the origin, which is
  // the board's own centre in V1's frame, so the copies land on the other three
  // corners. Emitted as three `transform.rotate` records against `hole1` so the
  // document says what V1 said; the spec measures where they actually land.
  ;[90, 180, -90].forEach((angleDeg, index) => {
    const turned = derivedPart(`hole${index + 2}`, {
      op: 'transform.rotate',
      params: { angles: [0, 0, angleDeg] },
      source: hole1,
      base: transforms.rotate([0, 0, degToRad(angleDeg)], hole1.geom),
    })
    place(plan, turned, `hole${index + 2}`, { hidden: true })
  })

  const sensor = cuboidPart('sensor', [8.5, 8.5, 1])
  chain(sensor).snap(board, 'z', 'outside-').align(board, 'xy')
  place(plan, sensor, 'sensor')

  // V1 keeps the un-subtracted cylinder as `mount-clearance` and adds the ring as
  // `mount`, so both names describe the same solid at two stages. Emitted the same way:
  // the clearance record *is* the subtraction's base.
  const mountClearance = cylinderPart('mount-clearance', spec.mountDiameterMm, spec.mountHeightMm)
  chain(mountClearance).snap(board, 'z', 'outside-').align(board, 'xy')
  place(plan, mountClearance, 'mount-clearance', { hidden: true })

  const mountInside = cylinderPart(
    'mount-inside',
    spec.mountInsideDiameterMm,
    spec.mountHeightMm
  )
  chain(mountInside).snap(board, 'z', 'outside-').align(board, 'xy')
  place(plan, mountInside, null)

  plan.push({
    kind: 'boolean',
    id: 'mount',
    op: 'boolean.subtract',
    target: mountClearance.id,
    operands: [mountInside.id],
    name: 'mount',
  })

  if (spec.tripodMount) {
    const baseSolid = cuboidPart('tripodMount-base.solid', [24.5, 10, 7.62])
    chain(baseSolid)
      .snap(mountClearance, 'z', 'inside+')
      .snap(board, 'y', 'inside-', -1)
      .align(mountClearance, 'x')
    place(plan, baseSolid, null)

    // The base is carved by the same bore the ring is, so the tripod block follows the
    // lens mount's curve. The carve does not move its bounding box — the block is wider
    // than the bore's chord at that y — so the post below can still snap against it.
    plan.push({
      kind: 'boolean',
      id: 'tripodMount-base',
      op: 'boolean.subtract',
      target: baseSolid.id,
      operands: [mountInside.id],
      name: 'tripodMount-base',
      hidden: true,
    })

    const post = cuboidPart('tripodMount-post', [14, 11.5, 11.5])
    chain(post)
      .snap(baseSolid, 'z', flipTripodMount ? 'inside-' : 'inside+')
      .snap(baseSolid, 'y', 'outside+')
      .align(mountClearance, 'x')
    place(plan, post, 'tripodMount-post', { hidden: true })

    plan.push({
      kind: 'boolean',
      id: 'tripodMount',
      op: 'boolean.union',
      target: 'tripodMount-base',
      operands: [post.id],
      name: 'tripodMount',
    })
  }

  const ribbon = cuboidPart('ribbon', [20.8, 5.5, spec.ribbonThicknessMm])
  chain(ribbon).snap(board, 'y', 'inside-').snap(board, 'z', 'outside+').align(board, 'x')
  place(plan, ribbon, 'ribbon')

  const ribbonNogo = enlargedPart('ribbon-nogo', ribbon, [2, 4, -1])
  chain(ribbonNogo).snap(ribbon, 'y', 'outside+')
  place(plan, ribbonNogo, 'ribbon-nogo', { hidden: true })
}

/**
 * Expand a `raspberrypi.cameraModule` document line into the op records that define it.
 *
 * @param {object} params
 * @param {CameraModel} [params.model] Which camera. Defaults to {@link DEFAULT_MODEL};
 *   an unrecognised value is rejected rather than coerced.
 * @param {boolean} [params.flipTripodMount] `hq` only — V1's own
 *   `HQCameraModule(flipTripodMount)` param (`hq_camera-module.js:89`), which moves the
 *   tripod post to the board side of the mount block. Ignored by every other model, the
 *   same way V1's other four factories take no arguments.
 * @returns {OpRecord[]} Op records in the same schema the document stores.
 */
export function cameraModule(params) {
  const { model = DEFAULT_MODEL, flipTripodMount = false } = params

  if (!CAMERA_MODULE_MODELS.includes(/** @type {CameraModel} */ (model))) {
    throw new Error(
      `${OP}: unknown model ${JSON.stringify(model)}, expected one of ` +
        CAMERA_MODULE_MODELS.join(' | ')
    )
  }
  if (typeof flipTripodMount !== 'boolean') {
    throw new Error(
      `${OP}: flipTripodMount must be a boolean, got ${JSON.stringify(flipTripodMount)}`
    )
  }

  /** @type {PlanItem[]} */
  const plan = []

  if (model === 'hq' || model === 'arducam-hq') addHqFamily(plan, model, flipTripodMount)
  else addClassicFamily(plan, model)

  return plan.flatMap(emit)
}
