/**
 * The `raspberrypi.touchScreen2` composite recipe — the HyperPixel 4 rectangular
 * display, expanded **standalone**.
 *
 * ## What it reproduces, and the one thing it deliberately does not
 *
 * `jscad-raspberrypi@62a8e3b`'s `TouchScreen2(rpi)` (`src/touch-screen2.js:16-196`).
 *
 * As with its sibling `raspberrypi.touchDisplay7inch`, the `rpi` parameter is dropped
 * per `docs/decisions/composite-recipe-geometry.md`'s Family B requirement. V1's
 * `:179-181` — `align('piMountingPost1', rpi.parts.hole1, 'xy')` then
 * `snap('piMountingPost1', rpi.parts.mb, 'z', 'outside+')` — is an assembly step
 * between two independently placed bodies, and this project already ships it as
 * `ui-026`'s Snap/Align control, sub-part addressed as
 * `{ id, pieces: 'piMountingPost1' }`. This recipe emits the screen and stops; the
 * spec applies both transforms to its output and checks the result against real V1
 * bounds.
 *
 * The frame is V1's own: `lens` is a bare `Parts.RoundedCube` sitting with its minimum
 * corner on the origin, and nothing moves it before the dropped attachment step.
 *
 * ## `Group.rotate` again, and why this recipe disagrees with the 7-inch one
 *
 * `:97,103` call `clone()` **before** `rotate()`, so the documented in-place mutation
 * (`jscad-utils/src/group.js:246-272`) lands on a throwaway copy: mounting pads 3 and 4
 * are turned, pads 1 and 2 are not. `touch-display-7inch.js:69` does the opposite —
 * rotates the shared group first, so all four of *its* pads inherit the turn. Same
 * library method, opposite outcome, decided by one `clone()`. Both are measured against
 * a real V1 execution fixture rather than read off the sources.
 *
 * The pivot is the hole's centroid, which `align(pad, 'xy')` has already put at the
 * pad's centre. The hole therefore neither moves nor changes shape (a 32-segment
 * cylinder turned 90 degrees is exactly itself), so the turn is measurable only on the
 * pad's swapped extents — 5.6 x 12 becomes 12 x 5.6.
 *
 * `:151` is the same mutation trap in its other form: `piMountingPost.translate(...)`
 * moves the *original* group, and `:157,163,169` clone it afterwards, so every post's
 * offset is relative to the already-translated post 1 rather than to its birthplace.
 *
 * ## `noGoPower`: the one call the decision doc flagged rather than decomposed
 *
 * `:184-193` positions one hidden 10 x 3 x 1 clearance marker against **two different
 * bodies** — `rpi.parts.gpio` on x and y, this screen's own `backPlate` on z. With
 * `rpi` dropped there is no GPIO header to snap to, and recipe nesting is explicitly
 * deferred by that same decision doc.
 *
 * The resolution, and its exact cost, is in {@link NO_GO_POWER_MM}.
 *
 * ## Two deliberate narrowings from V1
 *
 * **`dimCheck` is dropped** — `:19,24-39,109-119,138-148,175` build a hidden
 * `Group('DimensionCheck')` of seven coloured 1 mm rulers, added hidden, referenced by
 * nothing. Development scaffolding, not geometry; the same call `core-014` and
 * `core-015` made.
 *
 * **V1's duplicate leaf entries are not reproduced.** `Group.add(group, name, hidden,
 * subparts)` stores the combined group under `name` *and* every leaf under
 * `subparts + key` (`jscad-utils/src/group.js:83-103`). Both of this screen's
 * assemblies have exactly one visible member — the pad, and the post — so V1's
 * `screenMountingPad1` and `screenMountingPad1pad` are the same solid, as are
 * `piMountingPost1` and `piMountingPost1post`. This port emits one part for each.
 * (`raspberrypi.touchDisplay7inch`'s `piMountingPad` is the case where the combined
 * entry is genuinely more than any member, and it emits a real union.)
 *
 * @module core/kernel/recipes/raspberrypi.touchScreen2
 */

import { boundsOf, centroidOf } from '../group.js'
import { MOUNTING_HOLES_MM, rpiParts } from '../tables/rpi-parts.js'
import {
  addVectors,
  centreOf,
  chain,
  createBuilder,
  cuboidPart,
  cylinderPart,
  move,
  roundedCubePart,
  turnAboutZ,
} from './rpi-recipe-kit.js'

/** @typedef {import('../registry.js').OpRecord} OpRecord */
/** @typedef {import('./rpi-recipe-kit.js').Part} Part */
/** @typedef {import('./rpi-recipe-kit.js').Builder} Builder */
/** @typedef {[number, number, number]} Vec3Mm */

/** `touch-screen2.js:21` — `Parts.RoundedCube(143.4, 91.46, 0.7, 5)`. */
const LENS_MM = Object.freeze({ xMm: 143.4, yMm: 91.46, thicknessMm: 0.7, cornerRadiusMm: 5 })

/**
 * `:41-43`. Spelled as V1's own arithmetic rather than as `6.7`, so the three numbers
 * it is derived from stay visible: overall height, lens thickness, post height.
 */
const OVERALL_Z_MM = 15.9
const PI_POST_HEIGHT_MM = 8.5
const BACK_PLATE_Z_MM = OVERALL_Z_MM - (LENS_MM.thicknessMm + PI_POST_HEIGHT_MM)

/** `:45,48` — the back plate and its offset from the lens corner it is snapped into. */
const BACK_PLATE_MM = Object.freeze(
  /** @type {Vec3Mm} */ ([122.74, 72.96, BACK_PLATE_Z_MM])
)
const BACK_PLATE_OFFSET_MM = Object.freeze(/** @type {Vec3Mm} */ ([12.8, 9.25, 0]))

/** `:51` and `:57` — the two plates hung off the back plate. */
const OVER_HANG_MM = Object.freeze(/** @type {Vec3Mm} */ ([2, 52, BACK_PLATE_Z_MM]))
const BACK_PLATE_COVER_MM = Object.freeze(/** @type {Vec3Mm} */ ([92.87, 32.6, 2]))
const BACK_PLATE_COVER_INSET_MM = -3.81

/** `:66,68,77` — the screen mounting pad and the hole through it. */
const SCREEN_PAD_MM = Object.freeze(/** @type {Vec3Mm} */ ([5.6, 12, 3]))
const PAD_HOLE_DIAMETER_MM = 2.75
const PAD_HOLE_HEIGHT_MM = 10

/** `:73` — where pad 1 sits, measured in from the corner it was snapped to. */
const SCREEN_PAD_ORIGIN_MM = Object.freeze(/** @type {Vec3Mm} */ ([19.85, 10.98, 0]))

/**
 * `:91,97,103` — each screen mounting pad's offset from pad 1, and whether V1 turns it.
 * Pads 3 and 4 only; see the module doc on `clone()` ordering.
 *
 * @type {readonly Vec3Mm[]}
 */
export const SCREEN_MOUNTING_PAD_OFFSETS_MM = Object.freeze([
  /** @type {Vec3Mm} */ ([0, 0, 0]),
  /** @type {Vec3Mm} */ ([0, 51, 0]),
  /** @type {Vec3Mm} */ ([103.7, 0, 0]),
  /** @type {Vec3Mm} */ ([103.7, 51, 0]),
])

/** Which of the four above `:97,103` additionally turn 90 degrees about their hole. */
const TURNED_SCREEN_PADS = Object.freeze([false, false, true, true])

/** `:123` — the Pi mounting post, and `:151` where post 1 lands. */
const PI_POST_DIAMETER_MM = 5
const PI_POST_ORIGIN_MM = Object.freeze(/** @type {Vec3Mm} */ ([33.91, 11.98, 0]))

/**
 * `:157,163,169` — each Pi mounting post's offset from post 1. V1 translates the
 * *original* group at `:151` and clones it afterwards, so these are offsets from the
 * already-placed post 1, not from its birthplace.
 *
 * @type {readonly Vec3Mm[]}
 */
export const PI_MOUNTING_POST_OFFSETS_MM = Object.freeze([
  /** @type {Vec3Mm} */ ([0, 0, 0]),
  /** @type {Vec3Mm} */ ([0, 49, 0]),
  /** @type {Vec3Mm} */ ([58, 0, 0]),
  /** @type {Vec3Mm} */ ([58, 49, 0]),
])

/**
 * `:184-193`'s hidden power-jumper clearance marker — the one call site
 * `docs/decisions/composite-recipe-geometry.md` flagged as mixing frames rather than
 * decomposing, and the reason this task owns it.
 *
 * V1 snaps the marker's minimum corner to the **board's** GPIO header — `inside-` on x
 * and `outside-` on y, which land it on the header's min-x / max-y corner — while
 * snapping it to **this screen's** own `backPlate` on z. With `rpi` dropped there is no
 * header to measure, and recipe nesting is deferred by that same decision.
 *
 * **The resolution.** The x/y offset is not actually unknown: the dropped attachment
 * step pins this screen to the board rigidly, putting `piMountingPost1`'s centre on
 * mounting hole 1. So the header's corner has a fixed position relative to
 * `piMountingPost1`, and it can be computed at expansion time from data this project
 * already has — `rpiParts.gpio`'s own size, the `midlineTo(32.5)` / `midlineTo(52.5)`
 * placement `raspberrypi.bplus.js:600` gives it, and `MOUNTING_HOLES_MM.positions[0]`.
 * No `rpi` operand, no nesting, and no hand-measured magic number.
 *
 * **What that narrows, stated plainly.** The offset is now *frozen* at what a stock
 * Raspberry Pi B+ attached at the stock datum produces. For that case — which is the
 * only case V1 itself ever produced — the divergence from V1 is zero, asserted to the
 * nanometre against a real V1 execution fixture in this recipe's spec. It becomes a
 * real divergence for a screen attached to a board whose GPIO header sits elsewhere, or
 * to nothing at all: V1's marker would follow the header, and this one will not. That
 * is a deliberate trade, not an oversight. A task that needs the marker tracking a real
 * header is revival condition #2 in `docs/decisions/composite-recipe-geometry.md` and
 * should reopen recipe nesting there rather than be re-solved here.
 *
 * The marker is hidden geometry with no visible consequence (`:191`'s `true`), whose
 * only stated purpose is downstream enclosure-design clearance, which is what makes the
 * trade cheap enough to take.
 */
export const NO_GO_POWER_MM = Object.freeze({
  sizeMm: Object.freeze(/** @type {Vec3Mm} */ ([10, 3, 1])),
  /** `raspberrypi.bplus.js:600` — `midlineTo('x', 32.5).midlineTo('y', 52.5)`. */
  gpioMidlineMm: Object.freeze(/** @type {[number, number]} */ ([32.5, 52.5])),
})

/**
 * Where the GPIO header's `inside-`/`outside-` corner sits relative to the board's
 * first mounting hole — i.e. relative to `piMountingPost1`'s centre once the screen is
 * attached. See {@link NO_GO_POWER_MM}.
 *
 * @returns {[number, number]}
 */
function gpioCornerFromMountingHole1Mm() {
  const size = rpiParts.gpio.params.size
  const [midlineXMm, midlineYMm] = NO_GO_POWER_MM.gpioMidlineMm
  const [hole1XMm, hole1YMm] = MOUNTING_HOLES_MM.positions[0]
  return [
    // `snap(gpio, 'x', 'inside-')`: the marker's min goes on the header's min.
    midlineXMm - size[0] / 2 - hole1XMm,
    // `snap(gpio, 'y', 'outside-')`: the marker's min goes on the header's max.
    midlineYMm + size[1] / 2 - hole1YMm,
  ]
}

/**
 * Expand a `raspberrypi.touchScreen2` document line into the op records that define it.
 *
 * Takes no parameters: V1's only argument was the `rpi` board, and dropping it is this
 * recipe's whole point (see the module doc).
 *
 * @param {Record<string, any>} [params] Ignored; this screen has no variants.
 * @returns {OpRecord[]} Op records in the same schema the document stores.
 */
export function touchScreen2(params = {}) {
  void params

  const builder = createBuilder()

  const lens = roundedCubePart(
    'lens',
    LENS_MM.xMm,
    LENS_MM.yMm,
    LENS_MM.thicknessMm,
    LENS_MM.cornerRadiusMm
  )
  builder.place(lens, 'lens')

  // `:45-48`. Note this plate is snapped `inside-` on *all three* axes and so shares
  // the lens's z minimum — the two interpenetrate, exactly as V1 leaves them.
  const backPlate = cuboidPart('backPlate', BACK_PLATE_MM)
  chain(backPlate).snap(lens, 'xyz', 'inside-').translate(BACK_PLATE_OFFSET_MM)
  builder.place(backPlate, 'backPlate')

  // `snap(..., 'x', 'outside-')` is SNAP_SIDES [1, 0]: the mover's minimum goes on the
  // reference's maximum, so `outside-` hangs this off the plate's +x face.
  const overHang = cuboidPart('overHang', OVER_HANG_MM)
  chain(overHang).snap(backPlate, 'x', 'outside-').align(backPlate, 'y')
  builder.place(overHang, 'overHang')

  const backPlateCover = cuboidPart('backPlateCover', BACK_PLATE_COVER_MM)
  chain(backPlateCover)
    .snap(backPlate, 'z', 'outside-')
    .snap(backPlate, 'x', 'inside+', BACK_PLATE_COVER_INSET_MM)
    .align(backPlate, 'y')
  builder.place(backPlateCover, 'backPlateCover')

  SCREEN_MOUNTING_PAD_OFFSETS_MM.forEach((cloneOffsetMm, index) => {
    const n = index + 1
    const pad = cuboidPart(`screenMountingPad${n}`, SCREEN_PAD_MM)
    chain(pad)
      // `:69-70` — V1's own `-5.6 / 2` and `-12 / 2`. Note the x reference is the
      // *lens* and the y reference the *backPlate*; that asymmetry is V1's, not a typo.
      .snap(lens, 'x', 'inside-', -SCREEN_PAD_MM[0] / 2)
      .snap(backPlate, 'y', 'inside-', -SCREEN_PAD_MM[1] / 2)
      .snap(backPlate, 'z', 'outside-')
      .translate(SCREEN_PAD_ORIGIN_MM)

    const hole = cylinderPart(`screenMountingPad${n}hole`, PAD_HOLE_DIAMETER_MM, PAD_HOLE_HEIGHT_MM)
    chain(hole).align(pad, 'xy').snap(pad, 'z', 'outside-')

    move([pad, hole], /** @type {Vec3Mm} */ ([...cloneOffsetMm]))
    // Pads 3 and 4 only — `clone()` runs before `rotate()`, so the mutation cannot
    // reach pads 1 and 2. The turn is about the hole, so only the pad changes.
    if (TURNED_SCREEN_PADS[index]) turnAboutZ(pad, centreOf(hole), 90)

    builder.place(pad, `screenMountingPad${n}`)
    builder.place(hole, `screenMountingPad${n}hole`, { hidden: true })
  })

  /** @type {Part | undefined} */
  let post1
  PI_MOUNTING_POST_OFFSETS_MM.forEach((cloneOffsetMm, index) => {
    const n = index + 1
    const post = cylinderPart(`piMountingPost${n}`, PI_POST_DIAMETER_MM, PI_POST_HEIGHT_MM)
    chain(post)
      .snap(backPlate, 'z', 'outside-')
      .snap(backPlate, 'y', 'inside-', -PI_POST_DIAMETER_MM / 2)
      .snap(lens, 'x', 'inside-', -PI_POST_DIAMETER_MM / 2)

    const postHole = cylinderPart(
      `piMountingPost${n}postHole`,
      PAD_HOLE_DIAMETER_MM,
      PAD_HOLE_HEIGHT_MM
    )
    chain(postHole).align(post, 'xy').snap(post, 'z', 'outside-')

    // `:151`'s translate lands on the original group, so every clone below inherits it.
    move([post, postHole], addVectors(PI_POST_ORIGIN_MM, cloneOffsetMm))

    builder.place(post, `piMountingPost${n}`)
    builder.place(postHole, `piMountingPost${n}postHole`, { hidden: true })
    if (index === 0) post1 = post
  })

  if (!post1) throw new Error('raspberrypi.touchScreen2: piMountingPost1 was never built')

  // The frame-mixing marker. z comes from this screen's own backPlate, exactly as V1
  // states it; x and y are resolved analytically — see NO_GO_POWER_MM for the
  // derivation and for precisely what it narrows.
  const noGoPower = cuboidPart('noGoPower', NO_GO_POWER_MM.sizeMm)
  chain(noGoPower).snap(backPlate, 'z', 'outside-')
  const [cornerXMm, cornerYMm] = gpioCornerFromMountingHole1Mm()
  const post1CentreMm = centroidOf(post1.geom)
  const [noGoMinMm] = boundsOf(noGoPower.geom)
  move(
    [noGoPower],
    /** @type {Vec3Mm} */ ([
      post1CentreMm[0] + cornerXMm - noGoMinMm[0],
      post1CentreMm[1] + cornerYMm - noGoMinMm[1],
      0,
    ])
  )
  // V1 adds this one hidden (`:191`'s `true`), unlike its 7-inch namesake.
  builder.place(noGoPower, 'noGoPower', { hidden: true })

  return builder.build()
}
