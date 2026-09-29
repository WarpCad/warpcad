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

import { v1ColorToRecord } from '../colors.js'
import { calcSnap } from '../group.js'
import { BPLUS_BOARD, MOUNTING_HOLES_MM, rpiParts } from '../tables/rpi-parts.js'
import {
  addVectors,
  chain,
  createBuilder,
  cuboidPart,
  cylinderPart,
  move,
  roundedCubePart,
} from './rpi-recipe-kit.js'

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('../registry.js').OpRecord} OpRecord */
/** @typedef {import('./rpi-recipe-kit.js').Part} Part */
/** @typedef {import('./rpi-recipe-kit.js').Builder} Builder */
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
 * Parts that are **the same connector under a different name** from one model to
 * another (`TODO/ui-052`) — what the repair dialog offers as a Remap suggestion when a
 * model change leaves something snapped to a part the new board does not have.
 *
 * Deliberately short, and every entry is a real rename of one physical role rather
 * than "the nearest similar-looking part":
 *
 * - `camera` ↔ `camera0` — the ribbon connector; the Pi 5 has two and names the
 *   primary one `camera0`.
 * - `microusb` ↔ `usbc` — the power input (Pi 2/3 micro-USB, Pi 4/5 USB-C).
 * - `hdmi` ↔ `hdmi1` — the primary display output (one full-size port on the Pi 2/3,
 *   two micro-HDMI on the Pi 4/5).
 *
 * `avjack` has **no** alias on purpose: the Pi 5 has no analogue AV jack at all, and
 * remapping a snap onto "the nearest jack" is exactly the silent wrong geometry the
 * repair dialog exists to prevent. An alias is only ever *suggested* when the target
 * name exists on the new model and the old one does not — see `src/core/dependents.js`.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const BPLUS_PART_ALIASES = Object.freeze({
  camera: 'camera0',
  camera0: 'camera',
  microusb: 'usbc',
  usbc: 'microusb',
  hdmi: 'hdmi1',
  hdmi1: 'hdmi',
})

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
  return roundedCubePart(id, widthMm, heightMm, thicknessMm, cornerRadiusMm)
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
  return cylinderPart(id, spec.params.diameter, spec.params.height, {
    frame: /** @type {'base' | 'center'} */ (spec.frame),
    rotationDeg: spec.rotationDeg,
  })
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
 * @param {Builder} builder
 * @param {string} id
 * @param {Part} mb
 * @param {number} yMidlineMm
 */
function addUsbJack(builder, id, mb, yMidlineMm) {
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
  // V1 `rpi-parts.js:66,72` — `UsbJack()`'s `body` and `flange` are both
  // `.color('lightgray')` (TODO/core-033).
  builder.placeUnion(id, [body, flange], v1ColorToRecord('lightgray'))
}

/**
 * Models 2 and 3 — one shared board with a two-line LED fork (`bplus.js:627-745`).
 *
 * @param {Builder} builder
 * @param {object} context
 * @param {number} context.model
 * @param {Part} context.mb
 */
function addModelB(builder, { model, mb }) {
  const ethernet = rightSide(specPart('ethernet', rpiParts.ethernetJack), mb, [2, 0, 0])
  chain(ethernet).midlineTo('y', 10.25)
  // V1 `rpi-parts.js:28` — `EthernetJack()` is `.color('orange')` (TODO/core-033).
  builder.place(ethernet, 'ethernet', v1ColorToRecord('orange'))

  addUsbJack(builder, 'usb1', mb, 29)
  addUsbJack(builder, 'usb2', mb, 47)

  const microusb = specPart('microusb', rpiParts.microUsb)
  chain(microusb).snap(mb, 'z', 'outside-').midlineTo('x', 10.6).translate([0, -2, 0])
  // V1 `rpi-parts.js:84` — `MicroUsb()` is `.color('lightgray')` (TODO/core-033).
  builder.place(microusb, 'microusb', v1ColorToRecord('lightgray'))

  const hdmi = specPart('hdmi', rpiParts.hdmi)
  chain(hdmi).snap(mb, 'z', 'outside-').midlineTo('x', 32).translate([0, -2, 0])
  // V1 `rpi-parts.js:92` — `Hdmi()` is `.color('lightgray')` (TODO/core-033).
  builder.place(hdmi, 'hdmi', v1ColorToRecord('lightgray'))

  const av = avJack('avjack')
  chain(av.parts, av.block).snap(mb, 'z', 'outside-').midlineTo('x', 53.5)
  // V1 `rpi-parts.js:100,105` — `AvJack()`'s `block` is `.color('lightgray')` but its
  // `cyl` (barrel) is `.color('black')`: differently coloured V1 solids feeding one V3
  // name, so `avjack` is left uncoloured per TODO/core-033's own rule rather than
  // picking one of the two arbitrarily.
  builder.placeUnion('avjack', av.parts)

  const camera = specPart('camera', rpiParts.ribbon)
  chain(camera).snap(mb, 'z', 'outside-').midlineTo('x', 45)
  // V1 `rpi-parts.js:128` — `Ribbon()` is `.color('gray')` (TODO/core-033).
  builder.place(camera, 'camera', v1ColorToRecord('gray'))

  const display = specPart('display', rpiParts.ribbon)
  chain(display).snap(mb, 'z', 'outside-').midlineTo('x', 3.5).midlineTo('y', 28)
  builder.place(display, 'display', v1ColorToRecord('gray'))

  const gpio = specPart('gpio', rpiParts.gpio)
  chain(gpio).snap(mb, 'z', 'outside-').midlineTo('x', 32.5).midlineTo('y', 52.5)
  // V1 `rpi-parts.js:153` — `Gpio()` is `.color('gray')` (TODO/core-033).
  builder.place(gpio, 'gpio', v1ColorToRecord('gray'))

  const activityled = specPart('activityled', rpiParts.boardLed)
  const powerled = specPart('powerled', rpiParts.boardLed)
  if (model === 3) {
    chain(activityled).snap(mb, 'z', 'outside-').midlineTo('x', 1.1).midlineTo('y', 7.9)
    chain(powerled).snap(mb, 'z', 'outside-').midlineTo('x', 1.1).midlineTo('y', 11.5)
  } else {
    chain(activityled).snap(mb, 'z', 'outside-').translate([1, 43.5, 0])
    chain(powerled).snap(mb, 'z', 'outside-').translate([1, 46, 0])
  }
  // V1 `bplus.js:719,735` — both branches colour `activityled` `.color('lightgreen')`
  // (TODO/core-033).
  builder.place(activityled, 'activityled', v1ColorToRecord('lightgreen'))
  // V1 `bplus.js:727,742` — both branches colour `powerled` `.color('red')`
  // (TODO/core-033).
  builder.place(powerled, 'powerled', v1ColorToRecord('red'))
}

/**
 * The Pi 4 USB jack (`bplus.js:94-171`): body, flange, and its own clearance slab.
 * `usb2` is V1's clone re-snapped to the board's `-y` edge and midlined to 27.
 *
 * @param {Builder} builder
 * @param {string} id
 * @param {object} context
 * @param {Part} context.mb
 * @param {number} context.clearanceMm
 * @param {number} [context.yMidlineMm] Re-placement for the second jack.
 */
function addPi4UsbJack(builder, id, { mb, clearanceMm, yMidlineMm }) {
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

  // V1 `bplus.js:101,109` — Pi 4's `usb.body`/`usb.flange` are both
  // `.color('lightgray')` (TODO/core-033).
  builder.placeUnion(id, [body, flange], v1ColorToRecord('lightgray'))
  // V1 carried this as a `clearance` subpart of the jack's own group; naming it
  // `clearance-<jack>` matches every other clearance volume in this recipe, and the
  // Pi 5 branch, where V1 itself spells them that way.
  // V1 `bplus.js:117` — `.color('red')` (TODO/core-033).
  builder.place(clearance, `clearance-${id}`, { hidden: true, ...v1ColorToRecord('red') })
}

/**
 * Model 4 (`bplus.js:33-326`), less the `dimCheck` rulers — see the module doc.
 *
 * @param {Builder} builder
 * @param {object} context
 * @param {Part} context.mb
 * @param {number} context.clearanceMm
 */
function addPi4(builder, { mb, clearanceMm }) {
  const ethernet = rightSide(cuboidPart('ethernet', [21.38, 16.12, 13.83], 'corner'), mb, [3, 0, 0])
  chain(ethernet).midlineTo('y', 45.75)
  // V1 `bplus.js:41` — `.color('lightgray')` (TODO/core-033).
  builder.place(ethernet, 'ethernet', v1ColorToRecord('lightgray'))

  const smallClearanceMm = 0.5
  const ethernetClearance = cuboidPart(
    'clearance-ethernet',
    [clearanceMm, 16.12 + smallClearanceMm, 13.83 + smallClearanceMm],
    'corner'
  )
  chain(ethernetClearance).align(ethernet, 'yz').snap(ethernet, 'x', 'outside-')
  // V1 `bplus.js:84` — `.color('red')` (TODO/core-033).
  builder.place(ethernetClearance, 'clearance-ethernet', { hidden: true, ...v1ColorToRecord('red') })

  addPi4UsbJack(builder, 'usb1', { mb, clearanceMm })
  addPi4UsbJack(builder, 'usb2', { mb, clearanceMm, yMidlineMm: 27 })

  /**
   * The three front-edge connectors share a shape: a block overhanging the board's
   * `-y` edge by 1 mm, and a clearance slab in front of it. V1 colours every one of
   * `usbc`/`hdmi1`/`hdmi2` `.color('lightgray')` and every one of their clearances
   * `.color('red')` (`bplus.js:196,214,232` and `:204,222,240`) — TODO/core-033.
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
    builder.place(part, name, v1ColorToRecord('lightgray'))

    const clearance = cuboidPart(
      `clearance-${name}`,
      [clearanceSizeMm[0], clearanceMm, clearanceSizeMm[1]],
      'corner'
    )
    chain(clearance).align(part, 'xz').snap(part, 'y', 'outside+')
    builder.place(clearance, `clearance-${name}`, { hidden: true, ...v1ColorToRecord('red') })
  }

  frontConnector('usbc', [10, 7.5, 3.2], [10.5, 3.7], 3.5 + 7.7)
  frontConnector('hdmi1', [7, 7.5, 3], [7.5, 3.5], 3.5 + 7.7 + 14.8)
  frontConnector('hdmi2', [7, 7.5, 3], [7.5, 3.5], 3.5 + 7.7 + 14.8 + 13.5)

  const av = avJack('avjack')
  chain(av.parts, av.block)
    .snap(mb, 'z', 'outside-')
    .midlineTo('x', 3.5 + 7.7 + 14.8 + 13.5 + 7 + 7.5)
  // Same differently-coloured-operands case as Model 2/3's `avjack` above: left
  // uncoloured (TODO/core-033).
  builder.placeUnion('avjack', av.parts)

  const avClearance = cylinderPart('clearance-avjack', 6.5, clearanceMm + 1, { frame: 'base', rotationDeg: [90, 0, 0] })
  chain(avClearance).align(av.parts, 'xz').snap(av.parts, 'y', 'outside+', 1)
  // V1 `bplus.js:259` — `.color('red')` (TODO/core-033).
  builder.place(avClearance, 'clearance-avjack', { hidden: true, ...v1ColorToRecord('red') })

  const camera = specPart('camera', rpiParts.ribbon)
  chain(camera).snap(mb, 'z', 'outside-').midlineTo('x', 3.5 + 7.7 + 14.8 + 13.5 + 7)
  builder.place(camera, 'camera', v1ColorToRecord('gray'))

  const display = specPart('display', rpiParts.ribbon)
  chain(display).snap(mb, 'z', 'outside-').midlineTo('x', 4).midlineTo('y', 24.5 + 3.5)
  builder.place(display, 'display', v1ColorToRecord('gray'))

  const gpio = specPart('gpio', rpiParts.gpio)
  chain(gpio)
    .snap(mb, 'z', 'outside-')
    .midlineTo('x', 29 + 3.5)
    .midlineTo('y', 56 - 3.5)
  builder.place(gpio, 'gpio', v1ColorToRecord('gray'))

  /**
   * V1 `bplus.js:292,301` — `activityled` is `.color('lightgreen')`, `powerled` is
   * `.color('red')` (TODO/core-033).
   *
   * @param {string} name
   * @param {number} yMidlineMm
   */
  const led = (name, yMidlineMm) => {
    const part = specPart(name, rpiParts.boardLed)
    chain(part).snap(mb, 'z', 'outside-').midlineTo('x', 1.1).midlineTo('y', yMidlineMm)
    builder.place(part, name, v1ColorToRecord(name === 'activityled' ? 'lightgreen' : 'red'))

    const clearance = cylinderPart(`clearance-${name}`, 2, clearanceMm, { frame: 'base', rotationDeg: [0, 90, 0] })
    chain(clearance).align(part, 'yz').snap(mb, 'x', 'outside+')
    // V1 `bplus.js:301,311` — `.color('red')` (TODO/core-033).
    builder.place(clearance, `clearance-${name}`, { hidden: true, ...v1ColorToRecord('red') })
  }

  led('activityled', 8)
  led('powerled', 12)
}

/**
 * Model 5 (`bplus.js:335-550`).
 *
 * @param {Builder} builder
 * @param {object} context
 * @param {Part} context.mb
 * @param {number} context.clearanceMm
 */
function addPi5(builder, { mb, clearanceMm }) {
  const cpu = cuboidPart('cpu', [17, 17, 3], 'corner')
  chain(cpu)
    .translate([0, 15, 0])
    .midlineTo('x', 29 + 3.5)
    .snap(mb, 'z', 'outside-')
  // V1 `bplus.js:342` — `.color('lightgray')` (TODO/core-033).
  builder.place(cpu, 'cpu', v1ColorToRecord('lightgray'))

  const cpuClearance = cuboidPart('clearance-cpu', [17, 17, clearanceMm], 'corner')
  chain(cpuClearance).align(cpu, 'xy').snap(cpu, 'z', 'outside-')
  // V1 `bplus.js:351` — `.color('red')` (TODO/core-033).
  builder.place(cpuClearance, 'clearance-cpu', { hidden: true, ...v1ColorToRecord('red') })

  const ethernet = rightSide(cuboidPart('ethernet', [21.5, 16.5, 13.5], 'corner'), mb, [3, 0, 0])
  chain(ethernet).midlineTo('y', 10.2)
  // V1 `bplus.js:361` — `.color('lightgray')` (TODO/core-033).
  builder.place(ethernet, 'ethernet', v1ColorToRecord('lightgray'))

  const ethernetClearance = cuboidPart('clearance-ethernet', [clearanceMm, 16.5, 13.5], 'corner')
  chain(ethernetClearance).align(ethernet, 'yz').snap(ethernet, 'x', 'outside-')
  // V1 `bplus.js:372` — `.color('red')` (TODO/core-033).
  builder.place(ethernetClearance, 'clearance-ethernet', { hidden: true, ...v1ColorToRecord('red') })

  /**
   * V1 `bplus.js:383,391` — `body`/`flange` are both `.color('lightgray')`; their
   * clearance (`:410,429`) is `.color('red')` — TODO/core-033.
   *
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
    builder.placeUnion(id, [body, flange], v1ColorToRecord('lightgray'))

    const clearance = cuboidPart(`clearance-${id}`, [clearanceMm, 15, clearanceHeightMm], 'corner')
    chain(clearance).align([body, flange], 'yz').snap([body, flange], 'x', 'outside-')
    builder.place(clearance, `clearance-${id}`, { hidden: true, ...v1ColorToRecord('red') })
  }

  usbJack('usb1', 29.1, 16.5)
  usbJack('usb2', 47, 16)

  /**
   * V1 `bplus.js:439,457,475` — `usbc`/`hdmi1`/`hdmi2` are all `.color('lightgray')`;
   * their clearances (`:447,465,483`) are all `.color('red')` — TODO/core-033.
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
    builder.place(part, name, v1ColorToRecord('lightgray'))

    const clearance = cuboidPart(
      `clearance-${name}`,
      [clearanceSizeMm[0], clearanceMm, clearanceSizeMm[1]],
      'corner'
    )
    chain(clearance).align(part, 'xz').snap(part, 'y', 'outside+')
    builder.place(clearance, `clearance-${name}`, { hidden: true, ...v1ColorToRecord('red') })
  }

  frontConnector('usbc', [10, 7.5, 3.2], [10.5, 3.7], 11.2)
  frontConnector('hdmi1', [7, 7.5, 3], [7.5, 3.5], 25.8)
  frontConnector('hdmi2', [7, 7.5, 3], [7.5, 3.5], 39.2)

  const camera0 = specPart('camera0', rpiParts.camDisplay)
  chain(camera0).snap(mb, 'z', 'outside-').midlineTo('x', 55)
  // V1 `rpi-parts.js:136` — `CamDisplay()` is `.color('gray')` (TODO/core-033).
  builder.place(camera0, 'camera0', v1ColorToRecord('gray'))

  const camera1 = specPart('camera1', rpiParts.camDisplay)
  chain(camera1).snap(mb, 'z', 'outside-').midlineTo('x', 50)
  builder.place(camera1, 'camera1', v1ColorToRecord('gray'))

  // V1 names the PCIe connector `display`, which is what a Pi 5's FPC socket in this
  // position actually drives. Kept, so a downstream part can address it by the name
  // every other model uses.
  const display = specPart('display', rpiParts.pcie)
  chain(display).snap(mb, 'z', 'outside-').midlineTo('x', 3.5).midlineTo('y', 30)
  // V1 `rpi-parts.js:144` — `PCIe()` is `.color('gray')` (TODO/core-033).
  builder.place(display, 'display', v1ColorToRecord('gray'))

  const gpio = specPart('gpio', rpiParts.gpio)
  chain(gpio)
    .snap(mb, 'z', 'outside-')
    .midlineTo('x', 29 + 3.5)
    .midlineTo('y', 56 - 3.5)
  builder.place(gpio, 'gpio', v1ColorToRecord('gray'))

  const statusled = specPart('statusled', rpiParts.boardLed)
  chain(statusled).snap(mb, 'z', 'outside-').midlineTo('x', 1.1).midlineTo('y', 13.3)
  // V1 `bplus.js:519` — `.color('lightgreen')` (TODO/core-033).
  builder.place(statusled, 'statusled', v1ColorToRecord('lightgreen'))

  const statusledClearance = cylinderPart('clearance-statusled', 2, clearanceMm, { frame: 'base', rotationDeg: [0, 90, 0] })
  chain(statusledClearance).align(statusled, 'yz').snap(mb, 'x', 'outside+')
  // V1 `bplus.js:528` — `.color('red')` (TODO/core-033).
  builder.place(statusledClearance, 'clearance-statusled', { hidden: true, ...v1ColorToRecord('red') })

  const pswBlock = specPart('powerswitch-block', rpiParts.pswBlock)
  const pswButton = specPart('powerswitch-button', rpiParts.pswButton)
  chain(pswButton).align(pswBlock, 'yz').snap(pswBlock, 'x', 'outside+')
  const psw = [pswBlock, pswButton]
  chain(psw, pswBlock).snap(mb, 'z', 'outside-').snap(mb, 'x', 'inside-').midlineTo('y', 18.4)
  // V1 `rpi-parts.js:114,119` — `PSW()`'s `block` is `.color('gray')` but its `cyl`
  // (button) is `.color('black')`: differently coloured V1 solids, so `powerswitch` is
  // left uncoloured, same rule as `avjack` above (TODO/core-033).
  builder.placeUnion('powerswitch', psw)

  const pswClearance = cylinderPart('clearance-powerswitch', 3, clearanceMm, { frame: 'base', rotationDeg: [0, 90, 0] })
  chain(pswClearance).align(psw, 'yz').snap(psw, 'x', 'outside+')
  // V1 `bplus.js:546` — `.color('red')` (TODO/core-033).
  builder.place(pswClearance, 'clearance-powerswitch', { hidden: true, ...v1ColorToRecord('red') })
}

/**
 * The two Pi 5 fan-mount holes and their clearance cylinders (`bplus.js:769-805`).
 *
 * @param {Builder} builder
 * @param {Part} mb
 */
function addFanHoles(builder, mb) {
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
      { frame: /** @type {'center'} */ (rpiParts.mountingHole.frame) }
    )
    chain(hole).snap(mb, 'xy', 'inside-').align(mb, 'z').midlineTo('x', xMm).midlineTo('y', yMm)
    // V1 `rpi-parts.js:28` — `MountingHole(...)` is `.color('orange')` (TODO/core-033).
    // Hidden either way, but ported for the record's own sake — see the module doc.
    builder.place(hole, name, { hidden: true, ...v1ColorToRecord('orange') })

    const clearance = cylinderPart(`clearance-${name.replace('hole', '')}`, 4.5, 4, { frame: 'base' })
    chain(clearance).align(hole, 'xy').snap(mb, 'z', 'outside+')
    // V1 `bplus.js:757` — `fanClearance` is `.color('red')` (TODO/core-033).
    builder.place(clearance, `clearance-${name.replace('hole', '')}`, { hidden: true, ...v1ColorToRecord('red') })
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

  const builder = createBuilder()

  const mb = boardPart('mb', BPLUS_BOARD.bplusCornerRadiusMm)
  // V1 `src/rpi-parts.js:12`: `Parts.Board(85, 56, corner, 1.32).color('green', 0.75)`
  // (TODO/core-026). The other parts' opaque colours are TODO/core-033.
  builder.place(mb, 'mb', v1ColorToRecord('green', 0.75))

  if (model < 4) addModelB(builder, { model, mb })
  else if (model === 4) addPi4(builder, { mb, clearanceMm })
  else addPi5(builder, { mb, clearanceMm })

  const microsd = cuboidPart('microsd', [15.2, 12, 1.5], 'corner')
  chain(microsd).snap(mb, 'z', 'outside+').midlineTo('y', 28).translate([-2.5, 0, 0])
  // V1 `bplus.js:791` — `.color('silver')` (TODO/core-033).
  builder.place(microsd, 'microsd', v1ColorToRecord('silver'))

  MOUNTING_HOLES_MM.positions.forEach(([xMm, yMm], index) => {
    const hole = cylinderPart(
      `hole${index + 1}`,
      MOUNTING_HOLES_MM.diameterMm,
      MOUNTING_HOLES_MM.heightMm,
      { frame: /** @type {'center'} */ (rpiParts.mountingHole.frame) }
    )
    chain(hole).snap(mb, 'xy', 'inside-').align(mb, 'z').midlineTo('x', xMm).midlineTo('y', yMm)
    // V1 `bplus-mounting.js:20` → `rpi-parts.js:28` — `MountingHole(...)` is
    // `.color('orange')` (TODO/core-033). Hidden either way — see the module doc.
    builder.place(hole, `hole${index + 1}`, { hidden: true, ...v1ColorToRecord('orange') })
  })

  if (model >= 5) addFanHoles(builder, mb)

  return builder.build()
}
