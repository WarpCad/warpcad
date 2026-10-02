// SPDX-License-Identifier: AGPL-3.0-or-later
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
 * **Mounting holes drill the board only** (`TODO/core-034`). V1's `g.holes` makes
 * `combine()` subtract them from the whole assembly; `group.js` has `addHole` but no
 * `OpRecord` field reaches it, so the first port left the board undrilled. Now `board`
 * is a `boolean.subtract` of an unnamed `board.plate` by the hole cylinders, and the
 * holes stay hidden named parts (`hole0`-`hole3`, `hole1`-`hole4` on the HQ family) for
 * snapping. Only the board is drilled, never the mounts and pins seated in the holes.
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

import { v1ColorToRecord } from '../colors.js'
import { axisApply, enlarge } from '../group.js'
import {
  addVectors,
  chain,
  createBuilder,
  cuboidPart,
  cylinderPart,
  degToRad,
  drillBoard,
  makePart,
  roundedCubePart,
} from './rpi-recipe-kit.js'

// See group.js: default import, not named, so this runs under raw Node ESM too.
const { primitives, transforms } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('../registry.js').OpRecord} OpRecord */
/** @typedef {import('./rpi-recipe-kit.js').Part} Part */
/** @typedef {import('./rpi-recipe-kit.js').Builder} Builder */
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
 * Every camera board's colour. All five V1 factories agree: `.color('green', 0.75)` on
 * the `board` part (`camera-module-v1.js:33`, `camera-module-v2.js:18`,
 * `camera-module-v3.js:32`, `hq_camera-module.js:47`, `arducam_hq_camera-module.js:46`;
 * TODO/core-026). Every other part's opaque colour is TODO/core-033.
 */
const CAMERA_BOARD_COLOR = Object.freeze(v1ColorToRecord('green', 0.75))

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
 * @param {Builder} builder
 * @param {CameraModel} model
 */
function addClassicFamily(builder, model) {
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
      ? makePart('board.plate', {
          baseRecords: [
            { id: 'board.plate.solid', op: 'primitive.cuboid', params: { size: [...spec.boardMm] } },
          ],
          baseId: 'board.plate.solid',
          base: primitives.cuboid({ size: spec.boardMm }),
          // `.Center()` on xy only — z keeps its 0..t span.
          naturalOffsetMm: [0, 0, boardThicknessMm / 2],
        })
      : roundedCubePart(
          'board.plate',
          boardWidthMm,
          boardHeightMm,
          boardThicknessMm,
          spec.cornerRadiusMm,
          'centred'
        )
  // The undrilled plate: unnamed, measured against; `board` is placed below once the
  // holes exist (TODO/core-034).
  builder.place(board, null)

  /** @type {Part[]} */
  const holes = []
  // Holes' colour is *not* uniform across the family (TODO/core-033): v3's `Hole()`
  // factory colours every hole `.color('red')` (`camera-module-v3.js:17`), while v1/v2's
  // plain `Hole()` colours only the first — `Hole(2, 2, ...).color('yellow')`
  // (`camera-module-v1.js:38`, `camera-module-v2.js:35`) — hole1-3 are built the same
  // way with no `.color()` call at all, so they stay uncoloured. Neither `mount*` nor
  // `pin*` gets a `.color()` call anywhere in any of the three files.
  CLASSIC_HOLE_CENTRES_MM.forEach(([xMm, yMm], index) => {
    const hole = cylinderPart(`hole${index}`, 2.2, spec.holeDepthMm)
    chain(hole).snap(board, 'xy', 'inside-').midlineTo('x', xMm).midlineTo('y', yMm)
    let holeColor = {}
    if (model === 'v3') holeColor = v1ColorToRecord('red')
    else if (index === 0) holeColor = v1ColorToRecord('yellow')
    builder.place(hole, `hole${index}`, { hidden: true, ...holeColor })
    holes.push(hole)

    const mount = cylinderPart(`mount${index}`, 4, spec.mountHeightMm)
    chain(mount).align(hole, 'xy').snap(board, 'z', 'outside-')
    builder.place(mount, `mount${index}`, { hidden: true })

    const pin = cylinderPart(`pin${index}`, nearestUnder(1.5), tMm)
    chain(pin).align(hole, 'xy').align(board, 'z')
    builder.place(pin, `pin${index}`, { hidden: true })
  })
  builder.place(drillBoard(builder, 'board', board, holes), 'board', CAMERA_BOARD_COLOR)

  const sensor = cuboidPart('sensor', spec.sensorMm)
  chain(sensor)
    .snap(board, 'xy', 'inside-')
    .snap(board, 'z', 'outside-')
    .midlineTo('x', 14.5)
    .midlineTo('y', 12.5)
  // V1 `.color('black')` on `sensor` in all three files (`camera-module-v1.js:69`,
  // `-v2.js:66`, `-v3.js:68`) — TODO/core-033.
  builder.place(sensor, 'sensor', v1ColorToRecord('black'))

  if (model === 'v1') {
    // A square block, not a barrel — the one variant whose lens is a cuboid.
    const lens = cuboidPart('lens', [8.5, 8.5, 5.9 - tMm - 2])
    chain(lens).align(sensor, 'xy').snap(sensor, 'z', 'outside-')
    // V1 `camera-module-v1.js:77` — `.color('gray')` (TODO/core-033).
    builder.place(lens, 'lens', v1ColorToRecord('gray'))

    const lensribbon = cuboidPart('lensribbon', [7.56, 10, 2.65 - tMm])
    chain(lensribbon)
      .snap(board, 'z', 'outside-')
      .align(lens, 'y')
      .snap(lens, 'x', 'outside+', -1)
    // V1 `camera-module-v1.js:86` — `.color('gray')` (TODO/core-033).
    builder.place(lensribbon, 'lensribbon', v1ColorToRecord('gray'))
  } else if (model === 'v2') {
    const lens = cylinderPart('lens', 7.3, 1.6)
    chain(lens).align(sensor, 'xy').snap(sensor, 'z', 'outside-')
    // V1 `camera-module-v2.js:74` — `.color('gray')` (TODO/core-033).
    builder.place(lens, 'lens', v1ColorToRecord('gray'))

    const lensribbon = cuboidPart('lensribbon', [4, 9, 2.65 - tMm])
    chain(lensribbon)
      .snap(board, 'xy', 'inside-')
      .snap(board, 'z', 'outside-')
      .midlineTo('x', 4.7)
      .midlineTo('y', 13.8)
    stretchCuboid(lensribbon, 'x', 4)
    // V1 `camera-module-v2.js:85` — `.color('gray')` (TODO/core-033).
    builder.place(lensribbon, 'lensribbon', v1ColorToRecord('gray'))
  } else {
    const lens = cylinderPart('lens', 8.1, 6.98 - 3.875)
    chain(lens).align(sensor, 'xy').snap(sensor, 'z', 'outside-')
    // V1 `camera-module-v3.js:76` — `.color('gray')` (TODO/core-033).
    builder.place(lens, 'lens', v1ColorToRecord('gray'))

    const lensribbon = cuboidPart('lensribbon', [7.3, 8.9, 2.65 - tMm])
    chain(lensribbon)
      .snap(sensor, 'x', 'outside+')
      .align(sensor, 'y')
      .translate([0, -1.5, 0])
      .snap(board, 'z', 'outside-')
    // V1 `camera-module-v3.js:86` — `.color('gold')`, unlike v1/v2's gray
    // (TODO/core-033).
    builder.place(lensribbon, 'lensribbon', v1ColorToRecord('gold'))
  }

  const ribbon = cuboidPart('ribbon', spec.ribbonMm)
  chain(ribbon)
    .snap(board, 'x', 'inside+')
    .snap(board, 'y', 'inside-')
    .snap(board, 'z', 'outside+')
    .midlineTo('y', 12.5)
  // V1 leaves `ribbon` uncoloured in v1/v2 (`camera-module-v1.js:90-97`,
  // `-v2.js:89-96`); only v3 colours it `.color('beige')` (`-v3.js:96`) —
  // TODO/core-033.
  builder.place(ribbon, 'ribbon', model === 'v3' ? v1ColorToRecord('beige') : {})

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
  builder.place(slab, null)

  const cuts = holes.map((hole, index) => {
    const cut = enlargedPart(`bottom-nogo.cut${index}`, hole, [3, 3, 5])
    // Unnamed: a cutting tool is not a part of the assembly, unlike the `-nogo`
    // volumes themselves, which are hidden but addressable.
    return builder.place(cut, null)
  })
  // V1 `.color('red')` on `bottom-nogo` in all three files (`camera-module-v1.js:104`,
  // `-v2.js:103`, `-v3.js:105`) — TODO/core-033. Already hidden (see module doc).
  builder.placeBoolean({
    id: 'bottom-nogo',
    op: 'boolean.subtract',
    target: slab.id,
    operands: cuts.map((cut) => cut.id),
    name: 'bottom-nogo',
    hidden: true,
    ...v1ColorToRecord('red'),
  })

  const ribbonNogo = enlargedPart('ribbon-nogo', ribbon, [2, -1, -1])
  chain(ribbonNogo).snap(ribbon, 'x', 'outside-')
  // V1 `.color('red')` on `ribbon-nogo` in all three files (`camera-module-v1.js:112`,
  // `-v2.js:111`, `-v3.js:114`) — TODO/core-033. Already hidden.
  builder.place(ribbonNogo, 'ribbon-nogo', { hidden: true, ...v1ColorToRecord('red') })
}

/**
 * The HQ family — the official HQ camera and Arducam's clone of it. Same 38 mm board,
 * same four rotated corner holes, same lens-mount ring; the Arducam drops the tripod
 * mount and uses a smaller, taller ring on a thicker board.
 *
 * @param {Builder} builder
 * @param {CameraModel} model
 * @param {boolean} flipTripodMount
 */
function addHqFamily(builder, model, flipTripodMount) {
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

  const board = roundedCubePart('board.plate', 38, 38, spec.thicknessMm, 1.4, 'centred')
  builder.place(board, null)

  const hole1 = cylinderPart('hole1', 3.25, 10)
  chain(hole1).snap(board, 'xy', 'inside+', 1.25).translate([-4, -4, -5])
  // V1 `.color('red')` on the shared `hole` in both files
  // (`hq_camera-module.js:55`, `arducam_hq_camera-module.js:54`) — TODO/core-033.
  builder.place(hole1, 'hole1', { hidden: true, ...v1ColorToRecord('red') })

  // `hq_camera-module.js:57-59` turns the *same* hole by 90/180/-90 rather than
  // positioning four holes. `transforms.rotate` — and this project's `transform.rotate`
  // with its default `center` of the world origin — turns about the origin, which is
  // the board's own centre in V1's frame, so the copies land on the other three
  // corners. Emitted as three `transform.rotate` records against `hole1` so the
  // document says what V1 said; the spec measures where they actually land.
  const hqHoles = [hole1]
  ;[90, 180, -90].forEach((angleDeg, index) => {
    const turned = derivedPart(`hole${index + 2}`, {
      op: 'transform.rotate',
      params: { angles: [0, 0, angleDeg] },
      source: hole1,
      base: transforms.rotate([0, 0, degToRad(angleDeg)], hole1.geom),
    })
    builder.place(turned, `hole${index + 2}`, { hidden: true, ...v1ColorToRecord('red') })
    hqHoles.push(turned)
  })
  builder.place(drillBoard(builder, 'board', board, hqHoles), 'board', CAMERA_BOARD_COLOR)

  const sensor = cuboidPart('sensor', [8.5, 8.5, 1])
  chain(sensor).snap(board, 'z', 'outside-').align(board, 'xy')
  // V1 `.color('white')` in both files (`hq_camera-module.js:65`,
  // `arducam_hq_camera-module.js:64`) — TODO/core-033.
  builder.place(sensor, 'sensor', v1ColorToRecord('white'))

  // V1 keeps the un-subtracted cylinder as `mount-clearance` and adds the ring as
  // `mount`, so both names describe the same solid at two stages. Emitted the same way:
  // the clearance record *is* the subtraction's base.
  //
  // Colour (TODO/core-033): V1's `mount` and `mountInside` cylinders are both
  // `.color('black')` (`:68-71,73-76` in both files), so the `mount` subtraction result
  // — cutting black material out of a black ring — stays black in both models. HQ then
  // adds the pre-subtraction `mount` cylinder unchanged as `mount-clearance`
  // (`hq_camera-module.js:79`), so it stays black too; Arducam explicitly recolours its
  // own copy `.color('red')` before adding it (`arducam_hq_camera-module.js:78`).
  const mountClearance = cylinderPart('mount-clearance', spec.mountDiameterMm, spec.mountHeightMm)
  chain(mountClearance).snap(board, 'z', 'outside-').align(board, 'xy')
  builder.place(mountClearance, 'mount-clearance', {
    hidden: true,
    ...v1ColorToRecord(model === 'arducam-hq' ? 'red' : 'black'),
  })

  const mountInside = cylinderPart(
    'mount-inside',
    spec.mountInsideDiameterMm,
    spec.mountHeightMm
  )
  chain(mountInside).snap(board, 'z', 'outside-').align(board, 'xy')
  builder.place(mountInside, null)

  builder.placeBoolean({
    id: 'mount',
    op: 'boolean.subtract',
    target: mountClearance.id,
    operands: [mountInside.id],
    name: 'mount',
    ...v1ColorToRecord('black'),
  })

  if (spec.tripodMount) {
    const baseSolid = cuboidPart('tripodMount-base.solid', [24.5, 10, 7.62])
    chain(baseSolid)
      .snap(mountClearance, 'z', 'inside+')
      .snap(board, 'y', 'inside-', -1)
      .align(mountClearance, 'x')
    builder.place(baseSolid, null)

    // The base is carved by the same bore the ring is, so the tripod block follows the
    // lens mount's curve. The carve does not move its bounding box — the block is wider
    // than the bore's chord at that y — so the post below can still snap against it.
    // V1 `.color('darkgray')` on the base *before* the subtract (`:85-86`) —
    // TODO/core-033. Cutting the (uncoloured) bore out of it leaves darkgray material,
    // so the result keeps it.
    builder.placeBoolean({
      id: 'tripodMount-base',
      op: 'boolean.subtract',
      target: baseSolid.id,
      operands: [mountInside.id],
      name: 'tripodMount-base',
      hidden: true,
      ...v1ColorToRecord('darkgray'),
    })

    const post = cuboidPart('tripodMount-post', [14, 11.5, 11.5])
    chain(post)
      .snap(baseSolid, 'z', flipTripodMount ? 'inside-' : 'inside+')
      .snap(baseSolid, 'y', 'outside+')
      .align(mountClearance, 'x')
    // V1 `hq_camera-module.js:92` — `.color('gray')` (TODO/core-033).
    builder.place(post, 'tripodMount-post', { hidden: true, ...v1ColorToRecord('gray') })

    // `tripodMount-base` is darkgray but `tripodMount-post` is gray: differently
    // coloured V1 solids feeding one union, so `tripodMount` is left uncoloured, same
    // rule as `avjack` in `raspberrypi.bplus.js` (TODO/core-033).
    builder.placeBoolean({
      id: 'tripodMount',
      op: 'boolean.union',
      target: 'tripodMount-base',
      operands: [post.id],
      name: 'tripodMount',
    })
  }

  const ribbon = cuboidPart('ribbon', [20.8, 5.5, spec.ribbonThicknessMm])
  chain(ribbon).snap(board, 'y', 'inside-').snap(board, 'z', 'outside+').align(board, 'x')
  // V1 leaves `ribbon` uncoloured in both files (`:96-102`, `:80-86`) — TODO/core-033.
  builder.place(ribbon, 'ribbon')

  const ribbonNogo = enlargedPart('ribbon-nogo', ribbon, [2, 4, -1])
  chain(ribbonNogo).snap(ribbon, 'y', 'outside+')
  // V1 `.color('red')` on `ribbon-nogo` in both files (`:108`, `:92`) — TODO/core-033.
  builder.place(ribbonNogo, 'ribbon-nogo', { hidden: true, ...v1ColorToRecord('red') })
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

  const builder = createBuilder()

  if (model === 'hq' || model === 'arducam-hq') addHqFamily(builder, model, flipTripodMount)
  else addClassicFamily(builder, model)

  return builder.build()
}
