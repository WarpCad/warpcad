/**
 * The `raspberrypi.touchDisplay7inch` composite recipe — the official Raspberry Pi
 * 7-inch touch display, expanded **standalone**.
 *
 * ## What it reproduces, and the one thing it deliberately does not
 *
 * `jscad-raspberrypi@62a8e3b`'s `TouchDisplay_7inch(rpi)`
 * (`src/touch-display-7inch.js:16-156`).
 *
 * `docs/decisions/composite-recipe-geometry.md`'s Family B table lists this factory as
 * taking a **required** external board parameter, and this recipe is where that
 * decision's requirement actually bites: **the `rpi` parameter is dropped.** Every
 * remaining reference to it inside V1's body is `debug()` output, except the last two
 * lines — `:152-154`'s `align('piMountingPad1', rpi.parts.hole1, 'xy')` and
 * `snap('piMountingPad1', rpi.parts.mb, 'z', 'outside+')`. Those are not geometry; they
 * are an *assembly step* between two independently placed bodies, and this project
 * already ships that step as a user-facing control: `ui-026`'s Snap/Align operation,
 * sub-part addressed as `{ id, pieces: 'piMountingPad1' }` exactly as `core-013`'s
 * `{ id, pieces }` shape supports.
 *
 * So this recipe emits the screen and stops. A caller who wants V1's assembled result
 * appends two records of their own once both bodies exist:
 *
 * ```js
 * { op: 'group.align', operands: [{ id: screenId, pieces: 'piMountingPad1' },
 *                                 { id: rpiId, pieces: 'hole1' }], params: { axes: 'xy' } }
 * { op: 'group.snap',  operands: [{ id: screenId, pieces: 'piMountingPad1' },
 *                                 { id: rpiId, pieces: 'mb' }],
 *   params: { axes: 'z', orientation: 'outside+' } }
 * ```
 *
 * That is checked, not asserted: `raspberrypi.touchDisplay7inch.spec.js` applies both
 * transforms to this recipe's own output and compares against real V1 bounds.
 *
 * ## The frame
 *
 * V1's `lens` is a bare `Parts.RoundedCube`, which sits with its minimum corner on the
 * origin, and nothing moves it before the dropped attachment step. This port keeps that
 * frame, so every number in the V1 source reads across unchanged. The attachment step
 * is a pure rigid translation, which is what makes "drop the board parameter" a change
 * of frame and nothing else — and what lets the spec compare lens-relative offsets
 * against a fixture captured in V1's board-attached frame.
 *
 * ## `Group.rotate` mutates, which the TODO's own Proposed fix missed
 *
 * `TODO/core-016` says only `screenMountingPad1` is turned. It is not:
 * `JsCadUtilsGroup.prototype.rotate` is documented "This mutates the group"
 * (`jscad-utils/src/group.js:246-272`), and `touch-display-7inch.js:69` turns the
 * shared `screenMountingPad` **before** `:75`, `:81` and `:87` clone it — so all four
 * clones inherit the turn, and an 8 x 12 pad measures 12 x 8 on every one. The
 * companion recipe `raspberrypi.touchScreen2` calls `clone()` *first* and therefore
 * turns only two of its four; same method, opposite outcome, which is why both are
 * measured against a real V1 execution fixture rather than read off the sources.
 *
 * The turn is about the *hole's* centroid, which `align(pad, 'xy')` has already put at
 * the pad's own centre. Two consequences worth stating because they change what can be
 * tested: the hole does not move at all (it is the pivot), and its bounding box does
 * not change either (a 32-segment cylinder turned 90 degrees is exactly itself). The
 * TODO's suggested check — measure the hole's bounding box — therefore cannot detect
 * the rotation. The pad's swapped extents can, and that is what the spec measures.
 *
 * Because a rotation about a pivot commutes with a translation applied to both —
 * `R_{P+t}(x + t) = R_P(x) + t` — each pad is emitted independently as
 * cuboid → translate → rotate-about-its-own-pivot, rather than as V1's
 * rotate-then-clone-then-translate. Same geometry, one record chain per pad, and no
 * shared mutable state to reason about.
 *
 * ## Two deliberate narrowings from V1
 *
 * **`dimCheck` is dropped**, the same call and the same reasoning as `core-014`'s and
 * `core-015`'s: `:19,52-66,134` build a hidden `Group('DimensionCheck')` of two
 * coloured 1 mm rulers, added hidden, referenced by nothing, rendering nothing.
 * Development scaffolding, not geometry.
 *
 * **V1's duplicate pad entry is not reproduced.** `Group.add(group, name, hidden,
 * subparts)` stores the combined group under `name` *and* every leaf under
 * `subparts + key` (`jscad-utils/src/group.js:83-103`), so V1's parts dictionary holds
 * both `screenMountingPad1` and `screenMountingPad1pad` for the same solid — the hole
 * is hidden, so `combine()` returns the pad alone. This port emits one part.
 * `piMountingPad1` is the case where the combined entry is genuinely different, since
 * its group has two visible members, so that one is emitted as a `boolean.union` over
 * two hidden leaves — `hardware.bolt.js`'s `tap` shape, and `raspberrypi.bplus.js`'s
 * {@link placeUnion}.
 *
 * @module core/kernel/recipes/raspberrypi.touchDisplay7inch
 */

import modeling from '@jscad/modeling'

import { calcCenterWith, calcSnap, centroidOf } from '../group.js'

// See group.js: default import, not named, so this runs under raw Node ESM too.
const { extrusions, primitives, transforms } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('../registry.js').OpRecord} OpRecord */
/** @typedef {[number, number, number]} Vec3Mm */

/**
 * Segment count for every cylinder and rounded corner here. Matches `registry.js`'s
 * `DEFAULT_SEGMENTS` and `@jscad/csg`'s `defaultResolution2D`, which V1 passed
 * explicitly. Defined locally rather than imported from `registry.js`, which imports
 * *this* file.
 */
const SEGMENTS = 32

/** `touch-display-7inch.js:21` — `Parts.RoundedCube(192.96, 110.76, 0.7, 8)`. */
const LENS_MM = Object.freeze({ xMm: 192.96, yMm: 110.76, thicknessMm: 0.7, cornerRadiusMm: 8 })

/** `:24,26` — `backPlateZ` and the plate it sizes. */
const BACK_PLATE_MM = Object.freeze(/** @type {Vec3Mm} */ ([166.2, 100.6, 5.96]))

/** `:30` — the plate's offset from the lens corner it is snapped into. */
const BACK_PLATE_OFFSET_MM = Object.freeze(/** @type {Vec3Mm} */ ([11.89, 3.53, 0]))

/** `:37,45` — the screen mounting pad and the hole through it. */
const SCREEN_PAD_MM = Object.freeze(/** @type {Vec3Mm} */ ([8, 12, 2.5]))
const PAD_HOLE_DIAMETER_MM = 3
const PAD_HOLE_HEIGHT_MM = 10

/** `:41` — where pad 1 sits, measured in from the backPlate's minimum corner. */
const SCREEN_PAD_ORIGIN_MM = Object.freeze(/** @type {Vec3Mm} */ ([20, 20, 0]))

/**
 * `:75,81,87` — each screen mounting pad's offset from pad 1. Exported because the
 * spec asserts the clone offsets against this list rather than restating them.
 *
 * @type {readonly Vec3Mm[]}
 */
export const SCREEN_MOUNTING_PAD_OFFSETS_MM = Object.freeze([
  /** @type {Vec3Mm} */ ([0, 0, 0]),
  /** @type {Vec3Mm} */ ([0, 65.65, 0]),
  /** @type {Vec3Mm} */ ([126.2, 0, 0]),
  /** @type {Vec3Mm} */ ([126.2, 65.65, 0]),
])

/** `:95,104` — the Pi mounting pad and the post standing on it. */
const PI_PAD_MM = Object.freeze(/** @type {Vec3Mm} */ ([8, 12, 2.5]))
const PI_POST_DIAMETER_MM = 6
const PI_POST_HEIGHT_MM = 13.25

/** `:99` — where Pi pad 1 sits, in from the backPlate's minimum corner. */
const PI_PAD_ORIGIN_MM = Object.freeze(/** @type {Vec3Mm} */ ([48.45, 30.8, 0]))

/**
 * `:114,121,128` — each Pi mounting pad's offset from pad 1.
 *
 * @type {readonly Vec3Mm[]}
 */
export const PI_MOUNTING_PAD_OFFSETS_MM = Object.freeze([
  /** @type {Vec3Mm} */ ([0, 0, 0]),
  /** @type {Vec3Mm} */ ([58, 0, 0]),
  /** @type {Vec3Mm} */ ([0, 49.0, 0]),
  /** @type {Vec3Mm} */ ([58, 49.0, 0]),
])

/**
 * `:139,144` — the hidden power-jumper clearance marker. Unlike its TouchScreen2
 * namesake this one is the ordinary case: every reference is to this screen's own
 * `backPlate`, so nothing about it needs the dropped `rpi`.
 */
const NO_GO_POWER_MM = Object.freeze({
  sizeMm: /** @type {Vec3Mm} */ ([15, 10, 1]),
  offsetMm: /** @type {Vec3Mm} */ ([48.45 + 3, 30.8 + 49.0, 0]),
})

/**
 * One solid on its way to a position: the records that build it un-placed, the
 * millimetre offset accumulated so far, a probe sitting where that offset puts it, and
 * optionally one turn applied after the placement.
 *
 * @typedef {object} Part
 * @property {string} id
 * @property {OpRecord[]} baseRecords Records that build the solid before placement.
 * @property {string} baseId Id of the last base record — the translate's target.
 * @property {Vec3Mm} offsetMm Accumulated placement, baked into one translate at emit.
 * @property {Geom3} geom Probe geometry, currently placed. Thrown away.
 * @property {{ angles: Vec3Mm, center: Vec3Mm }} [turn] A post-placement rotation.
 * @property {string} [name] Part name in the resulting group.
 * @property {boolean} [hidden] Named but out of the group's default combine.
 */

/**
 * @typedef {{ kind: 'part', part: Part } |
 *   { kind: 'union', id: string, name: string, operands: string[] }} PlanItem
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
 * @param {number} degrees
 * @returns {number}
 */
function degToRad(degrees) {
  return (degrees * Math.PI) / 180
}

/**
 * @param {string} id
 * @param {object} args
 * @param {OpRecord[]} args.baseRecords
 * @param {string} args.baseId
 * @param {Geom3} args.base Geometry the base records produce.
 * @param {Vec3Mm} args.naturalOffsetMm Where V1's own factory leaves a fresh solid,
 *   relative to this project's always-centred `primitive.*` ops.
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
 * V1's `Parts.Cube({x, y, z})`: a box with its minimum corner on the origin
 * (`jscad-utils/src/parts.js:81-90` — `CSG.cube({ center: size/2, radius: size/2 })`).
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
 * origin in plan (`jscad-utils/src/parts.js:135-147`).
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
    base: primitives.cylinder({ radius: diameterMm / 2, height: heightMm, segments: SEGMENTS }),
    naturalOffsetMm: [0, 0, heightMm / 2],
  })
}

/**
 * V1's `Parts.RoundedCube(x, y, thickness, cornerRadius)` — a rounded rectangle
 * extruded to thickness, minimum corner on the origin. The same
 * `profile.roundedRectangle` → `profile.extrudeLinear` pair `kit.board` emits; a
 * composite cannot invoke another composite's expansion, so this reuses the pattern
 * rather than the op.
 *
 * @param {string} id
 * @param {number} widthMm
 * @param {number} heightMm
 * @param {number} thicknessMm
 * @param {number} cornerRadiusMm
 * @returns {Part}
 */
function roundedCubePart(id, widthMm, heightMm, thicknessMm, cornerRadiusMm) {
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
        params: { size: [widthMm, heightMm], roundRadius: cornerRadiusMm, segments: SEGMENTS },
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
 * V1's `group.rotate(solid, axis, angle)`, narrowed to the one axis these sources use.
 * The pivot is `pivot`'s current bounding-box centre — `jscad-utils`' `util.centroid`
 * is the box centre, not the centre of mass, and `group.js`'s {@link centroidOf} is the
 * ported equal.
 *
 * Recorded as a `transform.rotate` with an explicit `center`, because that op's
 * `center` defaults to the **world origin** — the correction `core-015`'s retirement
 * note had to make to its own TODO spec, and the reason this one passes a centre
 * rather than relying on a default.
 *
 * @param {Part} part
 * @param {Part} pivot
 * @param {number} angleDeg
 * @returns {Part}
 */
function turnAbout(part, pivot, angleDeg) {
  const center = centroidOf(pivot.geom)
  part.turn = { angles: [0, 0, angleDeg], center }
  part.geom = transforms.translate(
    center,
    transforms.rotate(
      [0, 0, degToRad(angleDeg)],
      transforms.translate(/** @type {Vec3Mm} */ ([-center[0], -center[1], -center[2]]), part.geom)
    )
  )
  return part
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
     * @param {Part} reference
     * @param {string} axes
     */
    align(reference, axes) {
      move(parts, calcCenterWith(measured.geom, axes, reference.geom))
      return api
    },

    /** @param {readonly number[]} vectorMm */
    translate(vectorMm) {
      move(parts, /** @type {Vec3Mm} */ ([vectorMm[0], vectorMm[1], vectorMm[2]]))
      return api
    },
  }

  return api
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
 * A part V1 built as a multi-solid `Group` whose `combine()` is genuinely more than any
 * one member: every solid stays addressable as a hidden part, and the visible part is
 * their union. `hardware.bolt.js`'s `tap` shape, and `raspberrypi.bplus.js`'s.
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
      },
    ]
  }
  const { part } = item
  const label = {
    ...(part.name ? { name: part.name } : {}),
    ...(part.hidden ? { hidden: true } : {}),
  }
  // The turn, when there is one, is the part's last record and therefore the one that
  // carries its name — so the document's named part is the turned solid, not the
  // un-turned one underneath it.
  const translate = {
    id: part.turn ? `${part.id}.placed` : part.id,
    op: 'transform.translate',
    params: { vector: [...part.offsetMm] },
    target: part.baseId,
    ...(part.turn ? {} : label),
  }
  if (!part.turn) return [...part.baseRecords, translate]
  return [
    ...part.baseRecords,
    translate,
    {
      id: part.id,
      op: 'transform.rotate',
      params: { angles: [...part.turn.angles], center: [...part.turn.center] },
      target: translate.id,
      ...label,
    },
  ]
}

/**
 * Expand a `raspberrypi.touchDisplay7inch` document line into the op records that
 * define it.
 *
 * Takes no parameters: V1's only argument was the `rpi` board, and dropping it is this
 * recipe's whole point (see the module doc). The signature keeps the `params` argument
 * every recipe has so the registry can call it uniformly.
 *
 * @param {Record<string, any>} [params] Ignored; this screen has no variants.
 * @returns {OpRecord[]} Op records in the same schema the document stores.
 */
export function touchDisplay7inch(params = {}) {
  void params

  /** @type {PlanItem[]} */
  const plan = []

  const lens = roundedCubePart(
    'lens',
    LENS_MM.xMm,
    LENS_MM.yMm,
    LENS_MM.thicknessMm,
    LENS_MM.cornerRadiusMm
  )
  place(plan, lens, 'lens')

  const backPlate = cuboidPart('backPlate', BACK_PLATE_MM)
  chain(backPlate)
    .snap(lens, 'xy', 'inside-')
    .snap(lens, 'z', 'outside-')
    .translate(BACK_PLATE_OFFSET_MM)
  place(plan, backPlate, 'backPlate')

  SCREEN_MOUNTING_PAD_OFFSETS_MM.forEach((cloneOffsetMm, index) => {
    const n = index + 1
    const pad = cuboidPart(`screenMountingPad${n}`, SCREEN_PAD_MM)
    chain(pad)
      // V1's own `-8 / 2` and `-12 / 2` deltas (`:38-39`): the pad is snapped half its
      // own width *outside* the plate corner before being walked back in by `:41`.
      .snap(backPlate, 'x', 'inside-', -SCREEN_PAD_MM[0] / 2)
      .snap(backPlate, 'y', 'inside-', -SCREEN_PAD_MM[1] / 2)
      .snap(backPlate, 'z', 'outside-')
      .translate(SCREEN_PAD_ORIGIN_MM)

    const hole = cylinderPart(`screenMountingPad${n}hole`, PAD_HOLE_DIAMETER_MM, PAD_HOLE_HEIGHT_MM)
    chain(hole).align(pad, 'xy').snap(pad, 'z', 'outside-')

    move([pad, hole], /** @type {Vec3Mm} */ ([...cloneOffsetMm]))
    // All four, not just pad 1 — see the module doc on `Group.rotate` mutating. The
    // hole is the pivot, so it neither moves nor changes shape; only the pad does.
    turnAbout(pad, hole, 90)

    place(plan, pad, `screenMountingPad${n}`)
    place(plan, hole, `screenMountingPad${n}hole`, { hidden: true })
  })

  PI_MOUNTING_PAD_OFFSETS_MM.forEach((cloneOffsetMm, index) => {
    const n = index + 1
    const pad = cuboidPart(`piMountingPad${n}pad`, PI_PAD_MM)
    chain(pad)
      .snap(backPlate, 'x', 'inside-', -PI_PAD_MM[0] / 2)
      .snap(backPlate, 'y', 'inside-', -PI_PAD_MM[1] / 2)
      .snap(backPlate, 'z', 'outside-')
      .translate(PI_PAD_ORIGIN_MM)

    const post = cylinderPart(`piMountingPad${n}post`, PI_POST_DIAMETER_MM, PI_POST_HEIGHT_MM)
    chain(post).align(pad, 'xy').snap(pad, 'z', 'outside-')

    move([pad, post], /** @type {Vec3Mm} */ ([...cloneOffsetMm]))
    // The one assembly here whose combined solid is more than any single member, and
    // the one the dropped attachment step measures — so it is a real union, not a
    // renamed pad.
    placeUnion(plan, `piMountingPad${n}`, [pad, post])
  })

  const noGoPower = cuboidPart('noGoPower', NO_GO_POWER_MM.sizeMm)
  chain(noGoPower)
    .snap(backPlate, 'x', 'inside-')
    .snap(backPlate, 'y', 'inside-')
    .snap(backPlate, 'z', 'outside-')
    .translate(NO_GO_POWER_MM.offsetMm)
  // V1 adds this one visible (`:147`'s `false`), unlike its TouchScreen2 namesake.
  place(plan, noGoPower, 'noGoPower')

  return plan.flatMap(emit)
}
