/**
 * The `raspberrypi.piTFT24` composite recipe — Adafruit's PiTFT 2.4" display HAT,
 * expanded **standalone**.
 *
 * Reproduces `jscad-raspberrypi@62a8e3b`'s `PiTFT24(options, piMotherBoard)`
 * (`src/pi-tft24.js:48-314`) — the largest recipe in `TODO/core-017`, and the only one
 * with real options.
 *
 * ## Dropping the board parameter
 *
 * Same shape as its 2.2" sibling: `:61` forwards `piMotherBoard` into
 * `Hat(piMotherBoard, options)` and never touches it directly, so dropping it means
 * calling the standalone Hat in `./raspberrypi.hat.js` — exactly what V1 does when the
 * argument is omitted. Attaching the finished screen to a Pi is the user's own
 * `ui-026` Snap/Align step. See that module's header on `TODO/core-018`'s ordering.
 *
 * ## The spacer and gusset assembly: probe-and-bake, at its most literal
 *
 * `:236-309` is the one place in this catalogue where V1 itself measures geometry it
 * has just built and feeds the number back in as a dimension:
 *
 * ```js
 * const spacerBarX = util.calcSnap(spacerGroup.parts.spacer1, spacerGroup.parts.spacer2,
 *                                  'x', 'inside+')[0]
 * const spacerXConnectorRod = Parts.Cube({ x: spacerBarX, y: 1, z: 1 })
 * ```
 *
 * The bar's length is the distance between two *already-placed* spacers' far faces.
 * This port does the same thing rather than re-deriving it from `HAT_MM`'s hole
 * table: the four spacers are built and placed for real, `calcSnap` measures the gap
 * between them, and the bar is emitted with that measurement baked in. Deriving it a
 * second time from the hole positions would give the same number today and could
 * drift silently the moment the spacer diameter or a hole moves.
 *
 * ## `buttonWire` is never reassigned, and that is load-bearing
 *
 * `:153` builds `buttonWire` and snaps it in x and z but **not** y. `:175` adds
 * `buttonWire.snap(connector, 'y', 'inside-')` to the group — a new solid — while the
 * local `buttonWire` still refers to the un-snapped one. `:195` and `:212` then build
 * the clearance from that *local*, so the clearance is positioned from the wire's
 * pre-snap y and not from the wire the group actually contains. The visible
 * consequence is a clearance volume reaching to y = 1.45 rather than 0.95 in the
 * default case — 0.5mm, in the one direction a case wall would care about.
 *
 * This is reproduced, not corrected: the port keeps a `buttonWire.proto` part and a
 * placed clone, exactly mirroring V1's two solids. It was found by the V1 execution
 * fixture, not by reading, and it is the third of the four behaviours that justified
 * building one (see `raspberrypi.miniPiTFT.spec.js`).
 *
 * ## Narrowings, stated rather than silent
 *
 * **`group.holes`** (`:67`) cannot be expressed — no `OpRecord` field reaches
 * `group.js`'s `addHole` — so the Hat's four mounting holes are hidden `hathole1`-`4`
 * parts and the board renders undrilled, as `raspberrypi.bplus` already decided
 * (`TODO/core-014`, deviation 2). They have to be addressable here anyway: the
 * spacers are positioned by aligning onto them.
 *
 * **V1's duplicate leaf entries are collapsed.** `:64-66` stores the Hat's combined
 * solid under `hat` with an `hat` subpart prefix and then adds the same board and
 * header again under `mb` and `gpio`, so `hatmb`/`hatgpio` are exact aliases. One part
 * each, under the visible name — `core-016`'s precedent. `hathole1`-`4` have no alias
 * and are kept as V1 spells them.
 *
 * **Colours are dropped**, as everywhere else in this catalogue.
 *
 * @module core/kernel/recipes/raspberrypi.piTFT24
 */

import modeling from '@jscad/modeling'

import { calcSnap } from '../group.js'
import { addHat, HAT_BOARD_COLOR, HAT_MM } from './raspberrypi.hat.js'
import {
  booleanPart,
  chain,
  clonePart,
  createBuilder,
  cuboidPart,
  cylinderPart,
  modifyPart,
} from './rpi-recipe-kit.js'

// See group.js: default import, not named, so this runs under raw Node ESM too.
const { booleans } = modeling

/** @typedef {import('../registry.js').OpRecord} OpRecord */
/** @typedef {import('./rpi-recipe-kit.js').Part} Part */

/** `:50-58` — V1's own option defaults. */
export const PITFT24_DEFAULTS = Object.freeze({
  buttonCapHeight: 4,
  capBaseHeight: 1,
  buttonWireYOffset: 5,
  clearance: 0.9,
  hatHeight: HAT_MM.defaultHatHeightMm,
})

/** `:71` and `:81` — the LCD module and the bezel over it. */
const LCD_MM = Object.freeze(/** @type {[number, number, number]} */ ([50, 40, 3.72]))
const LCD_OFFSET_MM = Object.freeze(/** @type {[number, number, number]} */ ([7, 0, 0]))
const LCD_MIDLINE_Y_MM = 28.32
const BEVEL_MM = Object.freeze(/** @type {[number, number, number]} */ ([60, 42, 5.3 - 1.62]))
const BEVEL_OFFSET_MM = Object.freeze(/** @type {[number, number, number]} */ ([4.5, 7, 0]))

/** `:91-102` — one button: a beige base block with a small white pip on top. */
const BUTTON_BASE_MM = Object.freeze(/** @type {[number, number, number]} */ ([6.1, 3.5, 3.55]))
const BUTTON_PIP_MM = Object.freeze(/** @type {[number, number, number]} */ ([3, 1.5, 0.5]))
const BUTTON_MIDLINE_Y_MM = 2.5

/**
 * `:104-108` — each button's x midline: 12.39 plus multiples of 10.
 *
 * @type {readonly number[]}
 */
export const PITFT24_BUTTON_MIDLINES_MM = Object.freeze([12.39, 22.39, 32.39, 42.39, 52.39])

/** `:113-122` — the printable cap over each button. */
const CAP_BASE_XY_MM = Object.freeze(/** @type {[number, number]} */ ([6.6, 4]))
const CAP_TOP_XY_MM = Object.freeze(/** @type {[number, number]} */ ([6.1, 3.5]))
const CAP_FILLET_MM = 1

/** `:227` — a hidden keep-out over the GPIO header's own side of the board. */
const GPIO2_MM = Object.freeze(/** @type {[number, number, number]} */ ([15, 33, 7]))

/** `:153` — the sprue joining the caps, square in section. */
const WIRE_LENGTH_MM = 40

/** `:236-237` — the spacer and the M2.5 bolt bored out of it. */
const SPACER_DIAMETER_MM = 6
const SPACER_BOLT_DIAMETER_MM = 2.75

/** `:287,299` — the connector bars' section; only their length is measured. */
const BAR_SECTION_MM = 1

/**
 * Expand a `raspberrypi.piTFT24` document line into the op records that define it.
 *
 * @param {Record<string, any>} [params] V1's own options: `buttonCapHeight`,
 *   `capBaseHeight`, `buttonWireYOffset`, `clearance`, `hatHeight`.
 * @returns {OpRecord[]} Op records in the same schema the document stores.
 */
export function piTFT24(params = {}) {
  const options = { ...PITFT24_DEFAULTS, ...params }
  const builder = createBuilder()

  const { mb, gpio, holes } = addHat(builder)
  builder.place(mb, 'mb', HAT_BOARD_COLOR)
  builder.place(gpio, 'gpio')
  holes.forEach((hole, index) => builder.place(hole, `hathole${index + 1}`, { hidden: true }))
  // `:64` — the Hat's own combined solid, kept as a hidden part. V1's `combine()`
  // would also drill the holes out of it; see the module doc on `group.holes`.
  builder.place(booleanPart(builder, 'hat', 'union', [mb, gpio]), 'hat', { hidden: true })

  // `:72-79` and `:83-89`. V1 sums four independently-computed translate vectors and
  // applies them once; chaining is equivalent here because the vectors act on
  // disjoint axes and `midlineTo` reads only the solid's size.
  const lcd = cuboidPart('lcd', LCD_MM)
  chain(lcd)
    .snap(mb, 'xy', 'inside-')
    .snap(mb, 'z', 'outside-')
    .translate(LCD_OFFSET_MM)
    .midlineTo('y', LCD_MIDLINE_Y_MM)
  builder.place(lcd, 'lcd')

  const bevel = cuboidPart('lcdbevel', BEVEL_MM)
  chain(bevel).snap(mb, 'xy', 'inside-').snap(mb, 'z', 'outside-').translate(BEVEL_OFFSET_MM)
  builder.place(bevel, 'lcdbevel')

  // `:91-110`. Each button is a fresh copy of the same prototype walked to its own
  // midline — V1 maps over the unmoved `button`, so offsets never compound.
  const buttons = PITFT24_BUTTON_MIDLINES_MM.map((midlineXMm, index) => {
    const n = index + 1
    const base = cuboidPart(`button${n}.base`, BUTTON_BASE_MM)
    chain(base)
      .snap(mb, 'z', 'outside-')
      .snap(mb, 'xy', 'inside-')
      .midlineTo('y', BUTTON_MIDLINE_Y_MM)
    const pip = cuboidPart(`button${n}.pip`, BUTTON_PIP_MM)
    chain(pip).snap(base, 'z', 'outside-').align(base, 'xy')
    const button = booleanPart(builder, `button${n}`, 'union', [base, pip])
    chain(button).midlineTo('x', midlineXMm)
    // `:110` adds the five under one visible `buttons` entry with `button` as the
    // subpart prefix, so the leaves themselves stay out of `names`.
    builder.place(button, `button${n}`, { hidden: true })
    return button
  })
  builder.place(booleanPart(builder, 'buttons', 'union', buttons), 'buttons')

  // `:113-130`. `buttonCapTop` is filleted on its top rim — `modify.filletRim`'s own
  // signature — before the two halves are unioned and the union placed on a button.
  const capTopZMm = options.buttonCapHeight - options.capBaseHeight
  const caps = buttons.map((button, index) => {
    const n = index + 1
    const capBase = cuboidPart(`buttonCap${n}.base`, [...CAP_BASE_XY_MM, options.capBaseHeight])
    const capTopRaw = cuboidPart(`buttonCap${n}.topRaw`, [...CAP_TOP_XY_MM, capTopZMm])
    chain(capTopRaw).snap(capBase, 'z', 'outside-').align(capBase, 'xy')
    const capTop = modifyPart(builder, `buttonCap${n}.top`, 'modify.filletRim', {
      radius: CAP_FILLET_MM,
      orientation: 'z+',
    }, capTopRaw)
    const cap = booleanPart(builder, `buttonCap${n}`, 'union', [capBase, capTop])
    chain(cap).snap(button, 'z', 'outside-').align(button, 'xy')
    return cap
  })
  builder.place(booleanPart(builder, 'buttonCaps', 'union', caps), 'buttonCaps', { hidden: true })

  // `:132-149`. Two enlarged blocks per cap, built from the *unmoved* prototypes and
  // aligned onto each cap in turn.
  const capClearances = caps.flatMap((cap, index) => {
    const n = index + 1
    const lower = cuboidPart(`buttonCapClearance${n}.lower`, [
      ...CAP_BASE_XY_MM,
      options.capBaseHeight,
    ])
    chain(lower).align(cap, 'xy').snap(cap, 'z', 'inside-')
    const upper = cuboidPart(`buttonCapClearance${n}.upper`, [...CAP_TOP_XY_MM, capTopZMm])
    chain(upper).align(cap, 'xy').snap(cap, 'z', 'inside-')
    /** @type {[number, number, number]} */
    const deltaMm = [options.clearance, options.clearance, 1]
    return [
      modifyPart(builder, `buttonCapClearance${n}.lowerGrown`, 'modify.enlarge', { deltaMm: [...deltaMm] }, lower),
      modifyPart(builder, `buttonCapClearance${n}.upperGrown`, 'modify.enlarge', { deltaMm: [...deltaMm] }, upper),
    ]
  })
  builder.place(
    booleanPart(builder, 'buttonCapClearance', 'union', capClearances),
    'buttonCapClearance',
    { hidden: true }
  )

  addButtonWire(builder, options, { mb, caps })

  const gpio2 = cuboidPart('gpio2', GPIO2_MM)
  chain(gpio2).snap(mb, 'x', 'inside-').snap(mb, 'z', 'outside+').align(mb, 'y')
  builder.place(gpio2, 'gpio2', { hidden: true })

  addSpacers(builder, options, { mb, holes })

  return builder.build()
}

/**
 * `:151-224` — the sprue, its stand-off connectors, and the clearance around both.
 *
 * @param {import('./rpi-recipe-kit.js').Builder} builder
 * @param {Record<string, any>} options
 * @param {{ mb: Part, caps: Part[] }} context
 * @returns {void}
 */
function addButtonWire(builder, options, { mb, caps }) {
  const thicknessMm = options.capBaseHeight
  /** @type {[number, number, number]} */
  const clearanceDeltaMm = [options.clearance, options.clearance, options.buttonCapHeight]

  // The prototype: snapped in x and z only, never in y. Everything below that reads
  // `buttonWire` in V1 reads *this*, not the solid added to the group — see the
  // module doc.
  const proto = cuboidPart('buttonWire.proto', [WIRE_LENGTH_MM, thicknessMm, thicknessMm])
  chain(proto).snap(caps[0], 'x', 'center-').snap(caps[0], 'z', 'inside-')
  const protoGrown = modifyPart(
    builder,
    'buttonWire.protoGrown',
    'modify.enlarge',
    { deltaMm: [...clearanceDeltaMm] },
    proto
  )

  if (options.buttonWireYOffset > 0) {
    // `:166-172`'s `LeftSide(o, mb)` sums `calcSnap(o, mb, 'z', 'outside-')` and
    // `calcSnap(o, mb, 'xy', 'inside+')`, both computed on the unmoved solid. The two
    // act on disjoint axes, so chaining them is the same translation.
    const connector = cuboidPart('buttonWire.connector', [
      thicknessMm,
      options.buttonWireYOffset,
      thicknessMm,
    ])
    chain(connector)
      .snap(mb, 'z', 'outside-')
      .snap(mb, 'xy', 'inside+')
      .snap(caps[0], 'z', 'inside-')
      .snap(caps[0], 'y', 'outside+')

    const wire = clonePart('buttonWire', proto)
    chain(wire).snap(connector, 'y', 'inside-')
    builder.place(wire, 'buttonWire', { hidden: true })

    const connectors = caps.map((cap, index) => {
      const copy = clonePart(`buttonWire.connector${index + 1}`, connector)
      chain(copy).align(cap, 'x')
      return copy
    })
    builder.place(
      booleanPart(builder, 'buttonWireConnector', 'union', connectors),
      'buttonWireConnector',
      { hidden: true }
    )

    const grown = connectors.map((copy, index) =>
      modifyPart(
        builder,
        `buttonWire.connectorGrown${index + 1}`,
        'modify.enlarge',
        { deltaMm: [...clearanceDeltaMm] },
        copy
      )
    )
    const clearance = booleanPart(builder, 'buttonWireClearance', 'union', [...grown, protoGrown])
    chain(clearance).snap(proto, 'z', 'inside+')
    builder.place(clearance, 'buttonWireClearance', { hidden: true })
    return
  }

  // `:204-224` — no stand-off and no connector; the sprue sits against the caps and
  // a *negative* offset pushes it further into them.
  const wire = clonePart('buttonWire', proto)
  chain(wire)
    .snap(caps[0], 'y', 'inside-')
    .translate([0, -options.buttonWireYOffset, 0])
  builder.place(wire, 'buttonWire', { hidden: true })

  // `:212-220` — one enlarged copy of the prototype, no union: there are no
  // connectors in this branch for it to be joined to.
  const clearance = clonePart('buttonWireClearance', protoGrown)
  chain(clearance).align(wire, 'xy').snap(proto, 'z', 'inside+')
  builder.place(clearance, 'buttonWireClearance', { hidden: true })
}

/**
 * `:236-310` — four bored spacers on the Hat's mounting holes, joined by four bars
 * whose length is measured off the spacers rather than recomputed.
 *
 * @param {import('./rpi-recipe-kit.js').Builder} builder
 * @param {Record<string, any>} options
 * @param {{ mb: Part, holes: Part[] }} context
 * @returns {void}
 */
function addSpacers(builder, options, { mb, holes }) {
  const heightMm = options.hatHeight || HAT_MM.defaultHatHeightMm

  const spacers = holes.map((hole, index) => {
    const n = index + 1
    const body = cylinderPart(`spacersspacer${n}.body`, SPACER_DIAMETER_MM, heightMm)
    const bolt = cylinderPart(`spacersspacer${n}.bolt`, SPACER_BOLT_DIAMETER_MM, heightMm)
    const spacer = booleanPart(builder, `spacersspacer${n}`, 'subtract', [body, bolt])
    chain(spacer).align(hole, 'xy').snap(mb, 'z', 'outside+')
    return spacer
  })

  // Probe and bake, exactly as V1 does it: the bar's length is the gap between two
  // real, already-placed spacers, not a second derivation from the hole table.
  const barXMm = calcSnap(spacers[0].geom, spacers[1].geom, 'x', 'inside+')[0]
  const barYMm = calcSnap(spacers[0].geom, spacers[2].geom, 'y', 'inside+')[1]

  const xRod = cuboidPart('spacersspacerBar1', [barXMm, BAR_SECTION_MM, BAR_SECTION_MM])
  chain(xRod)
    .align(booleans.union(spacers[0].geom, spacers[1].geom), 'x')
    .snap(spacers[0], 'y', 'inside-')
    .snap(spacers[0], 'z', 'inside+')
  const xRod2 = clonePart('spacersspacerBar2', xRod)
  chain(xRod2).snap(spacers[2], 'y', 'inside+')

  const yRod = cuboidPart('spacersspacerBar3', [BAR_SECTION_MM, barYMm, BAR_SECTION_MM])
  chain(yRod)
    .align(booleans.union(spacers[0].geom, spacers[2].geom), 'y')
    .snap(spacers[0], 'x', 'inside-')
    .snap(spacers[0], 'z', 'inside+')
  const yRod2 = clonePart('spacersspacerBar4', yRod)
  chain(yRod2).snap(spacers[3], 'x', 'inside+')

  const bars = [xRod, xRod2, yRod, yRod2]
  spacers.forEach((spacer, index) =>
    builder.place(spacer, `spacersspacer${index + 1}`, { hidden: true })
  )
  bars.forEach((bar, index) =>
    builder.place(bar, `spacersspacerBar${index + 1}`, { hidden: true })
  )
  builder.place(booleanPart(builder, 'spacers', 'union', [...spacers, ...bars]), 'spacers', {
    hidden: true,
  })
}
