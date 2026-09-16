/**
 * The `raspberrypi.spacer` composite recipe — the 3D-printable support that holds a
 * HAT off a Raspberry Pi B+, reproducing `jscad-raspberrypi@62a8e3b`'s
 * `Spacer(options, mb)` (`src/spacer.js:51-112`).
 *
 * ## The board parameter, and why V1 itself shows how to drop it
 *
 * `spacer.js:52` is `mb = mb || BPlus().parts.mb`: handed no board, V1 builds a
 * throwaway one and measures against that. That line is
 * `docs/decisions/composite-recipe-geometry.md`'s strongest cited evidence for the
 * origin-probe pattern, because it is `core-012`'s `kit.anchor` pattern appearing in
 * the source being ported *from*, years earlier.
 *
 * So this port drops the parameter and always probes. The probe is the one part
 * actually needed — the motherboard PCB, built from `BPLUS_BOARD`'s own dimensions —
 * not an expansion of `core-014`'s `raspberrypi.bplus`: recipe nesting is explicitly
 * deferred by that decision's rejection table, and the other ~120 parts of a B+ are
 * measured by nothing here. The probe is measured, then discarded; only numbers reach
 * the document.
 *
 * ## What is reused rather than re-derived
 *
 * - **The pad positions** are `MOUNTING_HOLES_MM.positions` from `core-014`'s
 *   `tables/rpi-parts.js` — `bplus-mounting.js:56-59` walks each pad to the same four
 *   midlines the holes use.
 * - **The gusset** is emitted as a single `kit.boardFrame` record, `core-012`'s
 *   already-shipped op, not a re-port of `Parts.BoardFrame`. Its guards are what
 *   reject a gusset whose inside is not smaller than its outside.
 * - **The header clearance** is `modify.enlarge` over `rpiParts.gpio`'s size.
 *
 * ## The one piece of real trigonometry, and the trap underneath it
 *
 * `:79` solves a right triangle between the pad1 and pad4 centroids and rotates a
 * brace to lie along that diagonal (`:82-85`), then mirrors it for the other corner
 * (`:87`). The formula is exact and closed-form, so it is ported directly rather than
 * approximated — {@link solveDiagonal} is `jscad-utils/src/triangle.js`'s own `solve`.
 *
 * The trap is the brace's corner radius. `:82` asks for `Parts.Board(tri.C + 5.5,
 * 6.2, 3.1, thickness)` — a radius of exactly half the 6.2 width — and
 * `CAG.roundedRectangle` **silently clamps it to 3.0** rather than rejecting it. Both
 * `@jscad/modeling` and this registry's `assertCornerRadiusFits` do reject it, so a
 * literal port throws; and a port that merely nudged the number would get the
 * geometry wrong. The clamp is reproduced in the kit's {@link clampCornerRadius}, and
 * with it the brace matches V1's volume to twelve significant figures.
 *
 * ## Mirroring, without a mirror op
 *
 * `:87`'s `.mirroredY()` has no counterpart in this registry, and does not need one.
 * A rounded rectangle mirrored about `y = 0` is the same rectangle turned by the
 * negated angle, so the second brace is built from the base rectangle reflected into
 * `y ∈ [-6.2, 0]`, turned by `-b`, and translated by the first brace's own placement
 * with its y component negated. That is exact — `M(R_b(g) + T) = R_-b(M(g)) + M(T)`
 * — not an approximation, and the fixture diff holds it to that claim.
 *
 * ## One visible part, four addressable posts
 *
 * V1 returns a bare CSG, so there is one visible part, `spacer`. The four posts are
 * additionally emitted as **hidden** parts: the attachment step this port defers to
 * the user (`ui-026`'s Snap/Align) addresses sub-parts by name on both sides, and
 * without them the spacer's own side would have nothing to name. Same call
 * `core-016`/`core-017` made for their mounting pads.
 *
 * @module core/kernel/recipes/raspberrypi.spacer
 */

import { BPLUS_BOARD, MOUNTING_HOLES_MM, rpiParts } from '../tables/rpi-parts.js'
import { boardFrame } from './kit.boardFrame.js'
import {
  boardFramePart,
  booleanPart,
  centreOf,
  chain,
  clampCornerRadius,
  clonePart,
  createBuilder,
  cuboidPart,
  cylinderPart,
  modifyPart,
  roundedCubePart,
  turnAboutZ,
} from './rpi-recipe-kit.js'

/** @typedef {import('../registry.js').OpRecord} OpRecord */
/** @typedef {[number, number, number]} Vec3Mm */

const OP = 'raspberrypi.spacer'

/**
 * `triangle.js:8` — V1's own conversion, spelled out so the formula ports verbatim.
 *
 * @param {number} deg
 * @returns {number}
 */
const toRadians = (deg) => (deg / 180) * Math.PI

/**
 * `jscad-utils/src/triangle.js:29-42`'s `solve`, which is not vendored in this project
 * and so is ported here rather than imported.
 *
 * Solves the right triangle spanning two points: `A` and `B` are the leg lengths, `b`
 * the angle opposite `B`, `C` the hypotenuse, `a` the complement of `b`, and `c` the
 * right angle itself. Angles are in degrees, V1's convention throughout.
 *
 * Note V1 computes the hypotenuse as `B / sin(b)` rather than by Pythagoras. The two
 * agree analytically; the division is kept because it is what the source does, and
 * because it is what the fixture was generated from.
 *
 * @param {{ x: number, y: number }} p1
 * @param {{ x: number, y: number }} p2
 * @returns {{ A: number, B: number, C: number, a: number, b: number, c: number }}
 */
export function solveDiagonal(p1, p2) {
  const A = Math.abs(p2.x - p1.x)
  const B = Math.abs(p2.y - p1.y)
  const bRad = Math.atan2(B, A)
  const b = bRad * (180 / Math.PI)
  return { c: 90, A, B, b, C: B / Math.sin(bRad), a: 90 - b }
}

/**
 * Every constant `spacer.js` states that is not already in a shared table.
 */
export const SPACER_MM = Object.freeze({
  /** `:54-64` — `Object.assign` defaults. `hollow` has no default there and is read
   * as falsy (`:76`), which is spelled out as `false` here. */
  defaultHeightMm: 11,
  defaultThicknessMm: 1,
  defaultSnap: 'outside-',
  defaultOffsetMm: 2,
  defaultGussetOutsideMm: Object.freeze(/** @type {[number, number]} */ ([45, 45])),
  defaultGussetInsideMm: Object.freeze(/** @type {[number, number]} */ ([40, 40])),

  /** `:92-99` — `Parts.BoardFrame(..., 3, thickness)`. */
  gussetCornerRadiusMm: 3,

  /** `:82` — the brace's cross-section. */
  braceWidthMm: 6.2,

  /** `:82` — `tri.C + 5.5`: the brace overhangs the diagonal by 5.5mm in total. */
  braceOverhangMm: 5.5,

  /**
   * `:82` asks for 3.1 and gets 3.0. See this module's header — `CAG.roundedRectangle`
   * clamps a corner radius to `min(halfWidth, halfHeight) - 0.1` without complaining,
   * and 3.1 is exactly half of the 6.2 width.
   */
  braceCornerRadiusMm: clampCornerRadius(3.1, 6.2, 6.2),

  /** `:80-81` — the brace's nudge off the pad centres, before the corner snap. */
  braceNudgeMm: 3.5,

  /** `:87` — the y distance the mirrored brace is walked back up. V1 writes the
   * literal `56`, which is the B+ board's own y dimension. */
  mirrorSpanMm: BPLUS_BOARD.heightMm,

  /** `rpi-parts.js:158-159`'s `Gpio(mb)` midlines — the same pair
   * `raspberrypi.hat.js` records, because it is the same function. */
  gpioMidlineMm: Object.freeze(/** @type {[number, number]} */ ([32.5, 52.5])),

  /** `:109` — `gpio.enlarge([1, 1, 20])`. */
  gpioClearanceMm: Object.freeze(/** @type {[number, number, number]} */ ([1, 1, 20])),
})

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function requirePositive(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${OP}: ${label} must be a positive number of millimetres, got ${value}`)
  }
  return value
}

/**
 * Expand a `raspberrypi.spacer` document line into the op records that define it.
 *
 * @param {object} [params]
 * @param {number} [params.height] Post height in millimetres.
 * @param {number} [params.thickness] Gusset and brace thickness.
 * @param {string} [params.snap] Which side of the probed board the posts sit on; V1's
 *   own option, passed through to `group.js`'s snap arithmetic unchanged.
 * @param {boolean} [params.gpio] Subtract the GPIO header's clearance. Default true.
 * @param {number} [params.offset] How far below the post tops the gusset sits.
 * @param {readonly number[]} [params.gussetOutside] Outer x/y of the gusset frame.
 * @param {readonly number[]} [params.gussetInside] Inner x/y; must be smaller.
 * @param {boolean} [params.postOnly] Return only the four posts.
 * @param {boolean} [params.hollow] Omit the diagonal cross-brace.
 * @returns {OpRecord[]} Op records in the same schema the document stores.
 */
export function spacer(params = {}) {
  const {
    height = SPACER_MM.defaultHeightMm,
    thickness = SPACER_MM.defaultThicknessMm,
    snap = SPACER_MM.defaultSnap,
    gpio = true,
    offset = SPACER_MM.defaultOffsetMm,
    gussetOutside = SPACER_MM.defaultGussetOutsideMm,
    gussetInside = SPACER_MM.defaultGussetInsideMm,
    postOnly = false,
    hollow = false,
  } = params

  requirePositive(height, 'height')
  requirePositive(thickness, 'thickness')

  const builder = createBuilder()

  // --- the probe -----------------------------------------------------------
  // `:52` — `BPlus().parts.mb`, which is `Parts.Board(85, 56, 3, 1.32)`. Built,
  // measured, and never finalised, so no record for it reaches the document.
  const mbProbe = roundedCubePart(
    'spacer.probe',
    BPLUS_BOARD.widthMm,
    BPLUS_BOARD.heightMm,
    BPLUS_BOARD.thicknessMm,
    BPLUS_BOARD.bplusCornerRadiusMm
  )

  // --- the four posts (`bplus-mounting.js:51-62`) --------------------------
  // One prototype is snapped onto the board, then each post is a copy of *that*
  // prototype walked to its own midline — never a copy of its predecessor, because
  // `midlineTo` is a relative translate (see the kit's `chain`).
  const prototype = cylinderPart('spacer.pad', rpiParts.mountingPad.params.diameter, height, {
    frame: 'center',
  })
  chain(prototype).snap(mbProbe, 'z', snap).snap(mbProbe, 'xy', 'inside-')

  const pads = MOUNTING_HOLES_MM.positions.map(([xMm, yMm], index) => {
    const pad = clonePart(`spacer.pad${index + 1}`, prototype)
    chain(pad).midlineTo('x', xMm).midlineTo('y', yMm)
    return pad
  })

  const posts = booleanPart(builder, 'spacer.posts', 'union', pads)
  pads.forEach((pad, index) => builder.place(pad, `pad${index + 1}`, { hidden: true }))

  // `:74` — an early return, before the gusset is built at all.
  if (postOnly) {
    builder.place(posts, 'spacer')
    return builder.build()
  }

  // --- the diagonal cross-brace (`:76-90`) ---------------------------------
  let brace = null
  if (!hollow) {
    const p1 = centreOf(pads[0])
    const p4 = centreOf(pads[3])
    const tri = solveDiagonal({ x: p1[0], y: p1[1] }, { x: p4[0], y: p4[1] })
    const nudge = SPACER_MM.braceNudgeMm
    const dyMm = Math.sin(toRadians(tri.a)) * nudge - nudge
    const dxMm = nudge - Math.cos(toRadians(tri.b + 45)) * nudge
    const lengthMm = tri.C + SPACER_MM.braceOverhangMm

    // `:82-85` — build at the origin, turn about the origin, then translate. The turn
    // has to come before the translate in the *records* too, which is why the kit
    // grew a post-turn offset for this task.
    const bar1 = roundedCubePart(
      'spacer.brace1',
      lengthMm,
      SPACER_MM.braceWidthMm,
      thickness,
      SPACER_MM.braceCornerRadiusMm
    )
    turnAboutZ(bar1, [0, 0, 0], tri.b)
    chain(bar1)
      .translate([dxMm, dyMm, 0])
      .snap(pads[0], 'z', 'inside+')

    // `:87` — `x.mirroredY().translate([0, 56, 0])`, without a mirror op. See the
    // module header: reflecting the base rectangle into negative y and turning by the
    // negated angle gives the same solid, and the placement mirrors with it.
    const placement = /** @type {Vec3Mm} */ (bar1.postOffsetMm ?? [0, 0, 0])
    const bar2 = roundedCubePart(
      'spacer.brace2',
      lengthMm,
      SPACER_MM.braceWidthMm,
      thickness,
      SPACER_MM.braceCornerRadiusMm
    )
    chain(bar2).translate([0, -SPACER_MM.braceWidthMm, 0])
    turnAboutZ(bar2, [0, 0, 0], -tri.b)
    chain(bar2).translate([
      placement[0],
      -placement[1] + SPACER_MM.mirrorSpanMm,
      placement[2],
    ])

    brace = booleanPart(builder, 'spacer.brace', 'union', [bar1, bar2])
    chain(brace).snap(pads[0], 'xy', 'inside-')
  }

  // --- the gusset frame (`:92-101`) ----------------------------------------
  // `kit.boardFrame`'s own guards, run here so a bad gusset fails while the record is
  // being written rather than while the probe geometry is being built. Reused, not
  // reinvented: this is literally that recipe's function, its records discarded.
  boardFrame({
    outerWidth: gussetOutside[0],
    outerHeight: gussetOutside[1],
    innerWidth: gussetInside[0],
    innerHeight: gussetInside[1],
    cornerRadius: SPACER_MM.gussetCornerRadiusMm,
    thickness,
  })

  const gusset = boardFramePart(
    'spacer.gusset',
    gussetOutside[0],
    gussetOutside[1],
    gussetInside[0],
    gussetInside[1],
    SPACER_MM.gussetCornerRadiusMm,
    thickness
  )
  chain(gusset).align(posts, 'xy').snap(pads[0], 'z', 'inside+')

  // `:107` — `gusset.unionIf(cross, !hollow).translate([0, 0, -offset])`. `unionIf` is
  // V1 sugar for "union only if the flag is set", which at record-expansion time is
  // just a branch over which records get emitted.
  const web = brace ? booleanPart(builder, 'spacer.web', 'union', [gusset, brace]) : gusset
  chain(web).translate([0, 0, -offset])

  let assembly = booleanPart(builder, 'spacer.assembly', 'union', [posts, web])

  // `:109` — `subtractIf(gpio.enlarge([1, 1, 20]), options.gpio)`, same branch shape.
  if (gpio) {
    const header = cuboidPart('spacer.gpio', rpiParts.gpio.params.size)
    chain(header)
      .snap(mbProbe, 'xy', 'inside-')
      .snap(mbProbe, 'z', 'outside-')
      .midlineTo('x', SPACER_MM.gpioMidlineMm[0])
      .midlineTo('y', SPACER_MM.gpioMidlineMm[1])
    const clearance = modifyPart(
      builder,
      'spacer.gpioClearance',
      'modify.enlarge',
      { deltaMm: [...SPACER_MM.gpioClearanceMm] },
      header
    )
    assembly = booleanPart(builder, 'spacer.cut', 'subtract', [assembly, clearance])
  }

  builder.place(assembly, 'spacer')
  return builder.build()
}
