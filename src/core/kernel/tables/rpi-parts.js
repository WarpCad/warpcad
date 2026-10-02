// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Raspberry Pi part dimensions, ported from `jscad-raspberrypi@62a8e3b`'s
 * `src/rpi-parts.js` and `src/bplus-mounting.js`.
 *
 * ## Why this is a table and not a second recipe
 *
 * V1's `RPiParts.*` are *factories*: each one builds a CSG and colours it. But every
 * one of them is a single primitive at a fixed size — the dimensions are the whole
 * content, and the geometry call around them is boilerplate this kernel already has
 * an op for. `TODO/core-014` asks for them once, here, as plain data in the same
 * "primitive op + params" shape `bolt-specs.js` uses, precisely because
 * `TODO/core-015`-`018` (`hat.js`, `spacer.js`, `hyper-pixel-4-rectangular.js`) call
 * `Gpio`, `MountingHole` and `Mountingpad` too: those tasks should import *data* and
 * emit their own records, not import geometry from a sibling recipe.
 *
 * ## `frame`: where V1 put the solid before anything moved it
 *
 * Every placement chain in `bplus.js` is relative — a `.snap`, an `.align`, a
 * `.midlineTo`, a `.translate` — so the position a factory *starts* from is part of
 * its meaning, not an implementation detail. V1's factories do not agree on one:
 *
 * - `'corner'` — `Parts.Cube({x, y, z})` builds `CSG.cube({center: r, radius: r})`,
 *   i.e. the box's **minimum corner sits on the origin** and it extends positive.
 * - `'center'` — `Parts.CSG_cube`/`CSG_cylinder` with an explicit symmetric
 *   `center: [0, 0, 0]`: centred on the origin, which is also where every
 *   `primitive.*` op in this registry puts a solid.
 * - `'base'` — `Parts.Cylinder(diameter, height)` runs `start: [0, 0, 0]` to
 *   `end: [0, 0, height]`: **base on `z = 0`**, centred in x/y. The same
 *   base-at-zero-versus-centred divergence `hardware.bolt.js` documents for its
 *   prisms.
 *
 * `raspberrypi.bplus.js` reads this field to place its probe geometry where V1's
 * chain expects to find it, then bakes the resulting offset into one
 * `transform.translate` record. Nothing here builds geometry or imports
 * `@jscad/modeling`.
 *
 * ## Colours are not carried
 *
 * Every V1 factory ends in `.color(...)`. Colour is presentation, it is not part of
 * the document model (`Initial design.md` §3), and no op in this registry accepts it
 * — so it is dropped here rather than recorded as a param nothing reads.
 *
 * @module core/kernel/tables/rpi-parts
 */

/**
 * One V1 part factory, reduced to the op and params that reproduce its solid.
 *
 * @typedef {object} RpiPartSpec
 * @property {'primitive.cuboid' | 'primitive.cylinder'} op Registry op that builds it.
 * @property {Record<string, any>} params Params for that op, in millimetres.
 * @property {'corner' | 'center' | 'base'} frame Where V1's factory left the solid
 *   relative to the origin; see the module doc.
 * @property {readonly number[]} [rotationDeg] A turn V1's factory applied
 *   before any placement, in degrees — only the two cylinders that get laid on their
 *   side carry one.
 */

/**
 * The Raspberry Pi model B+ board itself — V1's `BPlusMotherboard`, which is
 * `Parts.Board(85, 56, corner, 1.32)`.
 *
 * Not an {@link RpiPartSpec} because it is not one primitive: a rounded rectangle
 * extruded to thickness, the same `profile.roundedRectangle` → `profile.extrudeLinear`
 * pair `kit.board` already emits. `1.32` is V1's own PCB thickness for this board, not
 * the `1.62` general-purpose default `kit.board` carries.
 */
export const BPLUS_BOARD = Object.freeze({
  widthMm: 85,
  heightMm: 56,
  thicknessMm: 1.32,
  /** V1 `BPlusMotherboard(corner = 2)`'s default; `BPlus` itself passes 3. */
  defaultCornerRadiusMm: 2,
  /** `BPlus`'s own call: `RPiParts.BPlusMotherboard(3)`. */
  bplusCornerRadiusMm: 3,
})

/**
 * The four mounting-hole datums from `bplus-mounting.js`'s `holes`, in millimetres
 * from the board's own minimum corner. These are the numbers a case, a hat or a
 * spacer has to agree with, which is why they are data rather than four literals
 * inside one recipe.
 *
 * `heightMm` is V1's forced `Object.assign(options, { height: 8 })` — a caller could
 * not override it there, and nothing does here either.
 */
export const MOUNTING_HOLES_MM = Object.freeze({
  diameterMm: 3.25,
  heightMm: 8,
  positions: Object.freeze([
    Object.freeze([3.5, 3.5]),
    Object.freeze([61.5, 3.5]),
    Object.freeze([3.5, 52.5]),
    Object.freeze([61.5, 52.5]),
  ]),
})

/**
 * Every single-solid `RPiParts` factory `bplus.js` uses, plus the sub-solids of the
 * three that V1 returns as two-part `Group`s (`UsbJack`, `AvJack`, `PSW`) — those
 * assemble in the recipe, because their internal `.align`/`.snap` chain is placement
 * logic, not a dimension.
 *
 * Deliberately absent: `MicroUsbPlug` and `UsbWifiAdapter`. Both are V1 accessory
 * assemblies that `BPlus` never calls and no `core-015`-`018` row needs; porting them
 * unread would be inventing coverage. `TODO/core-018` can add them here if an
 * accessory recipe turns out to want them.
 *
 * @type {Readonly<Record<string, RpiPartSpec>>}
 */
export const rpiParts = Object.freeze({
  /** `MountingHole(diameter = 2.8, height = 4)` — centred, so it straddles a board. */
  mountingHole: Object.freeze({
    op: 'primitive.cylinder',
    params: Object.freeze({ diameter: 2.8, height: 4 }),
    frame: 'center',
  }),

  /** `Mountingpad(radius = 6.2, height = 1.5)` — V1's param is named `radius` and
   * used as a diameter (`var r = (radius || 6.2) / 2`); the name is the bug, the
   * number is the intent, so it is spelled `diameter` here. */
  mountingPad: Object.freeze({
    op: 'primitive.cylinder',
    params: Object.freeze({ diameter: 6.2, height: 1.5 }),
    frame: 'center',
  }),

  /** `EthernetJack()` — the model 2/3 RJ45 body. Models 4 and 5 use their own
   * inline dimensions in `bplus.js`, not this factory. */
  ethernetJack: Object.freeze({
    op: 'primitive.cuboid',
    params: Object.freeze({ size: Object.freeze([21.24, 15.88, 13.475]) }),
    frame: 'center',
  }),

  /** `UsbJack()`'s `body`. V1 spells the height `17.0 - 1.5`. */
  usbJackBody: Object.freeze({
    op: 'primitive.cuboid',
    params: Object.freeze({ size: Object.freeze([16.4, 13.36, 17.0 - 1.5]) }),
    frame: 'corner',
  }),

  /** `UsbJack()`'s `flange` — the thin sheet-metal lip that sits proud of the body. */
  usbJackFlange: Object.freeze({
    op: 'primitive.cuboid',
    params: Object.freeze({ size: Object.freeze([0.75, 15.3, 17.68 - 1.5]) }),
    frame: 'corner',
  }),

  /** `MicroUsb()` — the model 2/3 power receptacle. */
  microUsb: Object.freeze({
    op: 'primitive.cuboid',
    params: Object.freeze({ size: Object.freeze([7.59, 5.7, 2.64]) }),
    frame: 'corner',
  }),

  /** `Hdmi()` — the full-size receptacle models 2/3 carry one of. */
  hdmi: Object.freeze({
    op: 'primitive.cuboid',
    params: Object.freeze({ size: Object.freeze([15, 11.57, 7.4]) }),
    frame: 'corner',
  }),

  /** `AvJack()`'s `block`. */
  avJackBlock: Object.freeze({
    op: 'primitive.cuboid',
    params: Object.freeze({ size: Object.freeze([6.9, 12.47, 5.6]) }),
    frame: 'corner',
  }),

  /** `AvJack()`'s barrel: `Parts.Cylinder(6, 2).rotateX(90)`. */
  avJackBarrel: Object.freeze({
    op: 'primitive.cylinder',
    params: Object.freeze({ diameter: 6, height: 2 }),
    frame: 'base',
    rotationDeg: Object.freeze([90, 0, 0]),
  }),

  /** `PSW()`'s `block` — the Pi 5 power switch body. */
  pswBlock: Object.freeze({
    op: 'primitive.cuboid',
    params: Object.freeze({ size: Object.freeze([2.8, 4.5, 3.7]) }),
    frame: 'corner',
  }),

  /** `PSW()`'s button: `Parts.Cylinder(2, 1).rotateY(90)`. */
  pswButton: Object.freeze({
    op: 'primitive.cylinder',
    params: Object.freeze({ diameter: 2, height: 1 }),
    frame: 'base',
    rotationDeg: Object.freeze([0, 90, 0]),
  }),

  /** `Ribbon()` — the camera/display FPC connector on models 2/3/4. */
  ribbon: Object.freeze({
    op: 'primitive.cuboid',
    params: Object.freeze({ size: Object.freeze([3, 22.4, 5.7]) }),
    frame: 'corner',
  }),

  /** `CamDisplay()` — the Pi 5's narrower combined camera/display connector. */
  camDisplay: Object.freeze({
    op: 'primitive.cuboid',
    params: Object.freeze({ size: Object.freeze([3, 16, 5]) }),
    frame: 'corner',
  }),

  /** `PCIe()` — the Pi 5 only. */
  pcie: Object.freeze({
    op: 'primitive.cuboid',
    params: Object.freeze({ size: Object.freeze([3, 12, 5]) }),
    frame: 'corner',
  }),

  /** `Gpio()` — the 40-pin header, identical on every model here. V1's optional
   * `mb` argument only positions it; the solid is the same either way, and
   * positioning is the caller's job in this port. */
  gpio: Object.freeze({
    op: 'primitive.cuboid',
    params: Object.freeze({ size: Object.freeze([50.64, 5, 8.72]) }),
    frame: 'corner',
  }),

  /** `BoardLed()` — the one factory V1 leaves uncoloured. */
  boardLed: Object.freeze({
    op: 'primitive.cuboid',
    params: Object.freeze({ size: Object.freeze([1, 2, 0.7]) }),
    frame: 'corner',
  }),
})
