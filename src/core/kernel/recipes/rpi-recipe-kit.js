// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The probe-and-bake kit every `raspberrypi.*` composite recipe shares.
 *
 * ## Where this came from
 *
 * `core-014` invented the probe-and-bake expansion pattern, `core-015` and `core-016`
 * each grew their own ~200-line copy of it, and `core-017` built this module as a
 * fourth so its own five recipes would not need a fifth. `core-025` finished the job:
 * `raspberrypi.bplus.js`, `raspberrypi.cameraModule.js`,
 * `raspberrypi.touchDisplay7inch.js` and `raspberrypi.touchScreen2.js` now import
 * everything here instead of carrying private copies, and their expansions were checked
 * to emit byte-identical records before and after. Where the copies had differed only
 * in *signature* (a `frame` argument on {@link cuboidPart}, a `rotationDeg` option on
 * {@link cylinderPart}, a `frame` argument on {@link roundedCubePart}, an array
 * reference in {@link chain}), this module took the union of them as optional arguments
 * whose defaults reproduce the older behaviour exactly.
 *
 * ## The pattern, in one paragraph
 *
 * V1 positions parts by chaining `.snap()`/`.align()`/`.midlineTo()` against solids it
 * has already built. This port cannot emit those calls — the document's op vocabulary
 * has `transform.translate`, not "snap" — so each recipe builds the real geometry once
 * *at expansion time*, measures it with `group.js`'s already-tested arithmetic, and
 * bakes the resulting translation into a record. The probe geometry is discarded; only
 * numbers survive into the document. {@link chain} deliberately reads like V1's own
 * chain so a recipe can be diffed against its source line by line.
 *
 * ## Deriving one part from others
 *
 * Unlike the first three recipe sets, `core-017` needed booleans and `modify.*` ops
 * *inside* an expansion, over parts the same expansion just placed. {@link booleanPart} and
 * {@link modifyPart} do that: they finalise their operands (freezing those operands'
 * placement and emitting their records), then add one more record on top. An operand
 * that is *also* named as a part of its own — V1 does this constantly, e.g. a button's
 * base and push are both members of the union and parts in their own right — is
 * emitted exactly once, and {@link build} attaches the label to the record that
 * already exists rather than duplicating it.
 *
 * @module core/kernel/recipes/rpi-recipe-kit
 */

import modeling from '@jscad/modeling'

import { chamferRim, filletRim } from '../fillet.js'
import { axisApply, boundsOf, calcCenterWith, calcSnap, centroidOf, enlarge, sizeOf } from '../group.js'

// See group.js: default import, not named, so this runs under raw Node ESM too.
const { booleans, extrusions, primitives, transforms } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('../registry.js').OpRecord} OpRecord */
/** @typedef {[number, number, number]} Vec3Mm */

/**
 * `@jscad/csg`'s `defaultResolution2D`, which every V1 call site here inherited — now used
 * **only for probe geometry** (`TODO/core-035`). A probe is built here to measure a
 * placement offset (bounding boxes, centroids), and a multiple of 4 keeps a vertex on
 * each axis, so what it measures is the nominal shape at any resolution. The records this
 * kit emits carry no segment count, so the design resolution decides how the real parts
 * are faceted — under `legacy`, still this same 32, byte-identical to before.
 */
export const SEGMENTS = 32

/**
 * V1's `util.inch`. Spelled out so a source line quoting inches ports as inches.
 *
 * @param {number} inches
 * @returns {number}
 */
export const inchToMm = (inches) => inches * 25.4

/**
 * Degrees to radians. Local to the recipes because the registry's own copy lives in the
 * module that imports them.
 *
 * @param {number} degrees
 * @returns {number}
 */
export function degToRad(degrees) {
  return (degrees * Math.PI) / 180
}

/**
 * One part under construction: the records that build it in its own natural frame, the
 * translation baked on top, and the probe geometry the recipe measures.
 *
 * @typedef {object} Part
 * @property {string} id
 * @property {OpRecord[]} baseRecords Build `baseId` at the natural origin.
 * @property {string} baseId
 * @property {Vec3Mm} offsetMm Accumulated placement.
 * @property {Geom3} geom Probe geometry, already placed. Discarded after expansion.
 * @property {{ angles: Vec3Mm, center: Vec3Mm }} [turn] Optional post-placement turn.
 * @property {Vec3Mm} [postOffsetMm] Placement accumulated *after* {@link turnAboutZ},
 *   emitted as a second translate on top of the rotation. See {@link move}.
 * @property {string} [name] Set by {@link place}.
 * @property {boolean} [hidden]
 * @property {number} [color] Set by {@link place}: V1's `.color(...)` as `0xRRGGBB`
 *   (TODO/core-026).
 * @property {number} [colorAlpha] Set by {@link place}, only when not opaque.
 * @property {boolean} [bound] `baseRecords` already end in the record that defines `id`, so
 *   {@link Builder.finalize} emits no translate on top — see {@link drillBoard}.
 * @property {boolean} [finalized] Internal: {@link Builder} has emitted its records.
 * @property {OpRecord} [finalRecord] Internal: the record a label attaches to.
 */

/**
 * @param {...(readonly number[])} vectors
 * @returns {Vec3Mm}
 */
export function addVectors(...vectors) {
  return /** @type {Vec3Mm} */ (
    vectors.reduce(
      (total, vector) => [total[0] + vector[0], total[1] + vector[1], total[2] + vector[2]],
      [0, 0, 0]
    )
  )
}

/**
 * @param {string} id
 * @param {object} args
 * @param {OpRecord[]} args.baseRecords
 * @param {string} args.baseId
 * @param {Geom3} args.base
 * @param {Vec3Mm} args.naturalOffsetMm
 * @returns {Part}
 */
export function makePart(id, { baseRecords, baseId, base, naturalOffsetMm }) {
  return {
    id,
    baseRecords,
    baseId,
    offsetMm: naturalOffsetMm,
    geom: transforms.translate(naturalOffsetMm, base),
  }
}

/**
 * V1's `Parts.Cube({x, y, z})`: minimum corner on the origin. `frame: 'center'` is V1's
 * `Parts.CSG_cube` with a symmetric radius instead, which is already centred on all
 * three axes — the frame `raspberrypi.bplus.js`'s spec table needs for some parts.
 *
 * @param {string} id
 * @param {readonly number[]} sizeMm
 * @param {'corner' | 'center'} [frame]
 * @returns {Part}
 */
export function cuboidPart(id, sizeMm, frame = 'corner') {
  const size = /** @type {Vec3Mm} */ ([sizeMm[0], sizeMm[1], sizeMm[2]])
  return makePart(id, {
    baseRecords: [{ id: `${id}.solid`, op: 'primitive.cuboid', params: { size: [...size] } }],
    baseId: `${id}.solid`,
    base: primitives.cuboid({ size }),
    naturalOffsetMm: frame === 'corner' ? [size[0] / 2, size[1] / 2, size[2] / 2] : [0, 0, 0],
  })
}

/**
 * V1's `Parts.Cube({...}).Center()`: centred on x and y, base still on `z = 0`
 * (`jscad-utils/src/add-prototype.js:255` aligns on `'xy'` only).
 *
 * @param {string} id
 * @param {readonly number[]} sizeMm
 * @returns {Part}
 */
export function centeredCuboidPart(id, sizeMm) {
  const part = cuboidPart(id, sizeMm)
  part.offsetMm = [0, 0, sizeMm[2] / 2]
  part.geom = transforms.translate(part.offsetMm, primitives.cuboid({
    size: /** @type {Vec3Mm} */ ([sizeMm[0], sizeMm[1], sizeMm[2]]),
  }))
  return part
}

/**
 * V1's `Parts.Cylinder(diameter, height)`: upright, base on `z = 0`, centred in plan.
 * `frame: 'center'` is V1's `Parts.CSG_cylinder({ start: [0,0,-h/2], end: [0,0,h/2] })`
 * shape, which `MountingHole` and `Mountingpad` both use so the solid straddles a board.
 *
 * `rotationDeg` is V1's pre-placement turn (`AvJack`'s `rotateX(90)`, `PSW`'s
 * `rotateY(90)`), which lays the cylinder on its side. That case is where "measured, not
 * assumed" earns its keep: V1 turns a solid whose base is on `z = 0` about the world
 * origin, while the emitted records turn a *centred* solid about the same origin — two
 * different results. Rather than reason about which way the difference points, both are
 * built and their centroids differenced, so the baked offset is whatever the geometry
 * actually says.
 *
 * @param {string} id
 * @param {number} diameterMm
 * @param {number} heightMm
 * @param {{ frame?: 'base' | 'center', rotationDeg?: readonly number[] }} [options]
 * @returns {Part}
 */
export function cylinderPart(id, diameterMm, heightMm, options = {}) {
  const { rotationDeg } = options
  const upright = primitives.cylinder({ radius: diameterMm / 2, height: heightMm, segments: SEGMENTS })
  /** @type {Vec3Mm} */
  const uprightNaturalMm = [0, 0, options.frame === 'center' ? 0 : heightMm / 2]

  /** @type {OpRecord[]} */
  const baseRecords = [
    {
      id: `${id}.solid`,
      op: 'primitive.cylinder',
      params: { diameter: diameterMm, height: heightMm },
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
 * V1's `Parts.Tube(outsideDiameter, insideDiameter, height)`
 * (`jscad-utils/src/parts.js:371`). Both arguments are **diameters**, which is exactly
 * `primitive.tube`'s `diameter`/`innerDiameter` — checked against the source rather
 * than assumed, per `TODO/core-017`'s own caution about radius-versus-diameter.
 *
 * @param {string} id
 * @param {number} outerDiameterMm
 * @param {number} innerDiameterMm
 * @param {number} heightMm
 * @returns {Part}
 */
export function tubePart(id, outerDiameterMm, innerDiameterMm, heightMm) {
  return makePart(id, {
    baseRecords: [
      {
        id: `${id}.solid`,
        op: 'primitive.tube',
        params: {
          diameter: outerDiameterMm,
          innerDiameter: innerDiameterMm,
          height: heightMm,
        },
      },
    ],
    baseId: `${id}.solid`,
    base: booleans.subtract(
      primitives.cylinder({ radius: outerDiameterMm / 2, height: heightMm, segments: SEGMENTS }),
      primitives.cylinder({ radius: innerDiameterMm / 2, height: heightMm, segments: SEGMENTS })
    ),
    naturalOffsetMm: [0, 0, heightMm / 2],
  })
}

/**
 * V1's own silent clamp on a rounded rectangle's corner radius.
 *
 * `CAG.roundedRectangle` (`@jscad/csg/src/api/primitives2d.js`) does **not** reject a
 * radius that is too large for the rectangle — it quietly shrinks it:
 *
 * ```js
 * let maxroundradius = Math.min(radius.x, radius.y)   // half-extents, not sides
 * maxroundradius -= 0.1
 * roundradius = Math.min(roundradius, maxroundradius)
 * roundradius = Math.max(0, roundradius)
 * ```
 *
 * That 0.1 is a bare constant in upstream, not a tolerance derived from anything, and
 * it is load-bearing for at least one real call site: `spacer.js:82` asks for a 3.1
 * radius on a 6.2-wide brace and actually gets 3.0. Reproducing the clamp is the
 * difference between matching V1's geometry and throwing, because both
 * `@jscad/modeling` and this registry's own `assertCornerRadiusFits` reject a radius
 * that is not strictly smaller than half the shortest side.
 *
 * @param {number} cornerRadiusMm As the V1 source spells it.
 * @param {number} widthMm
 * @param {number} heightMm
 * @returns {number} The radius V1 would really have used.
 */
export function clampCornerRadius(cornerRadiusMm, widthMm, heightMm) {
  return Math.max(0, Math.min(cornerRadiusMm, Math.min(widthMm, heightMm) / 2 - 0.1))
}

/**
 * V1's `Parts.RoundedCube(x, y, thickness, cornerRadius)` and `Parts.Board(width,
 * height, cornerRadius, thickness)` — the same solid, with the last two arguments
 * swapped. Minimum corner on the origin.
 *
 * The corner radius passes through {@link clampCornerRadius} first, because both V1
 * factories build the profile with `CAG.roundedRectangle` and inherit its clamp. Every
 * call site that predates `TODO/core-018` asks for a radius well inside the limit, so
 * this changes nothing for them.
 *
 * @param {string} id
 * @param {number} widthMm
 * @param {number} heightMm
 * @param {number} thicknessMm
 * @param {number} cornerRadiusMm
 * @param {'corner' | 'centred'} [frame] `'corner'` is V1's bare `RoundedCube`;
 *   `'centred'` is the same thing with `.Center()` applied — xy only, never z.
 * @returns {Part}
 */
export function roundedCubePart(id, widthMm, heightMm, thicknessMm, cornerRadiusMm, frame = 'corner') {
  const roundRadius = clampCornerRadius(cornerRadiusMm, widthMm, heightMm)
  const profile = primitives.roundedRectangle({
    size: [widthMm, heightMm],
    roundRadius,
    segments: SEGMENTS,
    center: [0, 0],
  })
  return makePart(id, {
    baseRecords: [
      {
        id: `${id}.profile`,
        op: 'profile.roundedRectangle',
        params: { size: [widthMm, heightMm], roundRadius },
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
 * V1's `Parts.BoardFrame(outerX, outerY, innerX, innerY, cornerRadius, thickness)` —
 * a hollow rounded rectangle — emitted as **one `kit.boardFrame` record**, not as a
 * re-port of its five.
 *
 * That op shipped in `TODO/core-012` and already makes exactly this shape, including
 * V1's 2D-subtract-before-extrude ordering and its guards; `TODO/core-018` asks for it
 * to be reused as a record rather than duplicated. A composite record nested inside a
 * composite expansion needs nothing special from the fold — `evaluate` recurses, the
 * inner fold's ids stay in the inner fold, and the `Group` it returns collapses to a
 * solid the moment the next record consumes it.
 *
 * The probe geometry is still built here, because a record cannot be measured. It is
 * the same construction `kit.boardFrame` emits, so what is duplicated is a
 * measurement, not a definition: if the two ever disagree the spec's fixture diff
 * fails rather than silently shifting the frame.
 *
 * `kit.boardFrame` centres its result on the origin (`kit.board.js`'s
 * `centringVector`), so this part's natural offset is zero, unlike every corner-framed
 * primitive above it.
 *
 * @param {string} id
 * @param {number} outerWidthMm
 * @param {number} outerHeightMm
 * @param {number} innerWidthMm
 * @param {number} innerHeightMm
 * @param {number} cornerRadiusMm
 * @param {number} thicknessMm
 * @returns {Part}
 */
export function boardFramePart(
  id,
  outerWidthMm,
  outerHeightMm,
  innerWidthMm,
  innerHeightMm,
  cornerRadiusMm,
  thicknessMm
) {
  const roundRadius = clampCornerRadius(cornerRadiusMm, innerWidthMm, innerHeightMm)
  const outline = booleans.subtract(
    primitives.roundedRectangle({
      size: [outerWidthMm, outerHeightMm],
      roundRadius,
      segments: SEGMENTS,
      center: [0, 0],
    }),
    primitives.roundedRectangle({
      size: [innerWidthMm, innerHeightMm],
      roundRadius,
      segments: SEGMENTS,
      center: [0, 0],
    })
  )
  return makePart(id, {
    baseRecords: [
      {
        id: `${id}.frame`,
        op: 'kit.boardFrame',
        params: {
          outerWidth: outerWidthMm,
          outerHeight: outerHeightMm,
          innerWidth: innerWidthMm,
          innerHeight: innerHeightMm,
          cornerRadius: roundRadius,
          thickness: thicknessMm,
        },
      },
    ],
    baseId: `${id}.frame`,
    // `kit.boardFrame` centres its own result on the origin (`kit.board.js`'s
    // `centringVector`), unlike every corner-framed primitive in this kit. So the
    // probe has to be centred *here*, and the natural offset left at zero: baking a
    // `-thickness / 2` into the offset instead would centre the probe correctly and
    // then emit a record that centres the frame a second time, dropping it half a
    // thickness below where it was measured.
    base: transforms.translate(
      [0, 0, -thicknessMm / 2],
      extrusions.extrudeLinear({ height: thicknessMm }, /** @type {any} */ (outline))
    ),
    naturalOffsetMm: [0, 0, 0],
  })
}

/**
 * Translate one or more parts together, keeping probe geometry and baked offset in step.
 *
 * @param {Part[]} parts
 * @param {Vec3Mm} vectorMm
 * @returns {void}
 */
export function move(parts, vectorMm) {
  for (const part of parts) {
    // A translate applied *after* a turn cannot be folded into `offsetMm`: the
    // records put the translate before the rotation, and rotating a translated solid
    // is not the same as translating a rotated one unless the vector happens to lie
    // on the rotation axis. So a post-turn move accumulates separately and
    // {@link createBuilder}'s `finalize` emits it as its own trailing translate.
    // This is exactly V1's own call order in `spacer.js:82-85` —
    // `Board(...).rotateZ(b).translate([dx, dy, 0]).snap(...)`.
    if (part.turn) {
      part.postOffsetMm = addVectors(part.postOffsetMm ?? [0, 0, 0], vectorMm)
    } else {
      part.offsetMm = addVectors(part.offsetMm, vectorMm)
    }
    part.geom = transforms.translate(vectorMm, part.geom)
  }
}

/**
 * A copy of `part` at its current placement, under a new id — V1's `.clone()`, or the
 * implicit copy every `foo.translate(...)` of a reused local makes.
 *
 * @param {string} id
 * @param {Part} part
 * @returns {Part}
 */
export function clonePart(id, part) {
  return {
    id,
    baseRecords: part.baseRecords.map((record) => ({
      ...record,
      id: (record.id ?? '').replace(part.id, id),
      ...(record.target && typeof record.target === 'string' && record.target.startsWith(part.id)
        ? { target: record.target.replace(part.id, id) }
        : {}),
    })),
    baseId: part.baseId.replace(part.id, id),
    offsetMm: [...part.offsetMm],
    geom: part.geom,
    ...(part.turn
      ? {
          turn: {
            angles: /** @type {Vec3Mm} */ ([...part.turn.angles]),
            center: /** @type {Vec3Mm} */ ([...part.turn.center]),
          },
        }
      : {}),
    ...(part.postOffsetMm
      ? { postOffsetMm: /** @type {Vec3Mm} */ ([...part.postOffsetMm]) }
      : {}),
  }
}

/**
 * V1's placement chain, one call at a time. `target` may be several parts moving
 * together; `ruler` is the one whose bounding box drives the measurement, defaulting
 * to the first.
 *
 * @param {Part | Part[]} target
 * @param {Part} [ruler]
 */
export function chain(target, ruler) {
  const parts = Array.isArray(target) ? target : [target]
  const measured = ruler ?? parts[0]

  const api = {
    /**
     * @param {Part | Part[] | Geom3} reference
     * @param {string} axes
     * @param {string} orientation A key of `group.js`'s `SNAP_SIDES`.
     * @param {number} [deltaMm]
     */
    snap(reference, axes, orientation, deltaMm) {
      move(parts, calcSnap(measured.geom, geomOf(reference), axes, orientation, deltaMm))
      return api
    },

    /**
     * @param {Part | Part[] | Geom3} reference
     * @param {string} axes
     */
    align(reference, axes) {
      move(parts, calcCenterWith(measured.geom, axes, geomOf(reference)))
      return api
    },

    /**
     * V1's `util.calcmidlineTo`, quirk included: it returns `to - size / 2` as a
     * *relative* translation and never consults where the solid currently is
     * (`jscad-utils/src/util.js:874`). Ported as the relative translate it really is,
     * so a call site that does not first snap the solid's minimum onto its reference's
     * minimum diverges from V1 exactly the way V1 diverges from itself.
     *
     * @param {string} axes
     * @param {number} toMm
     */
    midlineTo(axes, toMm) {
      const size = sizeOf(measured.geom)
      move(
        parts,
        axisApply(axes, (index) => toMm - size[index] / 2)
      )
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
 * Geometry to measure a reference against. A list of parts is unioned, which is what V1
 * did implicitly whenever a `Group` was handed to something that wanted a solid.
 *
 * @param {Part | Part[] | Geom3} value
 * @returns {Geom3}
 */
function geomOf(value) {
  if (Array.isArray(value)) {
    return value.length === 1 ? value[0].geom : booleans.union(value.map((part) => part.geom))
  }
  return /** @type {Part} */ (value).geom ?? /** @type {Geom3} */ (value)
}

/**
 * Turn a part about a pivot point, recorded as a `transform.rotate` with an
 * **explicit** `center` — that op's `center` defaults to the world origin
 * (`core-015`'s retirement note), which is almost never what a V1 `group.rotate` means.
 *
 * @param {Part} part
 * @param {Vec3Mm} centerMm
 * @param {number} angleDeg Degrees about z.
 * @returns {Part}
 */
export function turnAboutZ(part, centerMm, angleDeg) {
  part.turn = { angles: [0, 0, angleDeg], center: centerMm }
  part.geom = transforms.translate(
    centerMm,
    transforms.rotateZ(
      (angleDeg * Math.PI) / 180,
      transforms.translate(
        /** @type {Vec3Mm} */ ([-centerMm[0], -centerMm[1], -centerMm[2]]),
        part.geom
      )
    )
  )
  return part
}

/**
 * Bounding-box centre of a part. The pivot every `group.rotate(name, ...)` uses.
 *
 * @param {Part} part
 * @returns {Vec3Mm}
 */
export function centreOf(part) {
  return centroidOf(part.geom)
}

/**
 * Bounding box of a part, in millimetres.
 *
 * @param {Part} part
 * @returns {[Vec3Mm, Vec3Mm]}
 */
export function boundsOfPart(part) {
  return boundsOf(part.geom)
}

/**
 * One boolean record a recipe places over ids it has already placed, carrying its own
 * label — the shape `raspberrypi.cameraModule.js`'s keep-out volumes need, where the
 * operands are unnamed cutting tools and only the result is a part.
 *
 * @typedef {object} PlacedBoolean
 * @property {string} id
 * @property {'boolean.union' | 'boolean.subtract' | 'boolean.intersect'} op
 * @property {string} target
 * @property {readonly string[]} operands
 * @property {string} name
 * @property {boolean} [hidden]
 * @property {number} [color] Only valid when every operand shares one V1 colour — see
 *   `placeBoolean`'s own note (TODO/core-033).
 * @property {number} [colorAlpha]
 */

/**
 * How a part is labelled when placed. `color`/`colorAlpha` are the record fields
 * `../colors.js`'s `v1ColorToRecord` returns, so a recipe writes
 * `builder.place(mb, 'mb', v1ColorToRecord('green', 0.75))` (TODO/core-026).
 *
 * @typedef {object} PlaceOptions
 * @property {boolean} [hidden]
 * @property {number} [color]
 * @property {number} [colorAlpha]
 */

/**
 * The expansion under construction: an ordered record list plus the parts named in it.
 *
 * @typedef {object} Builder
 * @property {(part: Part) => string} finalize
 * @property {(part: Part, name: string | null, options?: PlaceOptions) => Part} place
 *   `name: null` places a pure intermediate — a cutting tool, or the un-booleaned half
 *   of a part V1 only ever exposes through its boolean — that is built but not labelled.
 * @property {(name: string, parts: readonly Part[], options?: PlaceOptions) => void} placeUnion
 *   `options.color`/`colorAlpha` colour the *union result*, for the case (`TODO/core-033`)
 *   where V1 coloured every member of the union the same way — never call this with a
 *   colour when the V1 members disagreed; leave the union uncoloured instead.
 * @property {(item: PlacedBoolean) => void} placeBoolean
 * @property {() => OpRecord[]} build
 */

/**
 * @returns {Builder}
 */
export function createBuilder() {
  /** @type {OpRecord[]} */
  const records = []
  /**
   * Parts and hand-built records, in the order the recipe placed them.
   *
   * @type {({ kind: 'part', part: Part } | { kind: 'record', record: OpRecord })[]}
   */
  const placed = []

  /**
   * Emit a part's records, once. Called on demand when a part becomes an operand, and
   * again for every placed part at {@link build} time — the second call is a no-op for
   * anything already consumed, which is what keeps a union's own members from being
   * built twice when they are also parts in their own right.
   *
   * @param {Part} part
   * @returns {string} The id the part's final value is bound to.
   */
  function finalize(part) {
    if (part.finalized) return part.id
    part.finalized = true
    records.push(...part.baseRecords)
    if (part.bound) {
      part.finalRecord = part.baseRecords[part.baseRecords.length - 1]
      return part.id
    }
    const translateId = part.turn ? `${part.id}.placed` : part.id
    /** @type {OpRecord} */
    const translate = {
      id: translateId,
      op: 'transform.translate',
      params: { vector: [...part.offsetMm] },
      target: part.baseId,
    }
    records.push(translate)
    part.finalRecord = translate
    if (part.turn) {
      const moved = part.postOffsetMm && part.postOffsetMm.some((value) => value !== 0)
      /** @type {OpRecord} */
      const rotate = {
        id: moved ? `${part.id}.turned` : part.id,
        op: 'transform.rotate',
        params: { angles: [...part.turn.angles], center: [...part.turn.center] },
        target: translateId,
      }
      records.push(rotate)
      part.finalRecord = rotate
      if (moved) {
        /** @type {OpRecord} */
        const after = {
          id: part.id,
          op: 'transform.translate',
          params: { vector: [.../** @type {Vec3Mm} */ (part.postOffsetMm)] },
          target: `${part.id}.turned`,
        }
        records.push(after)
        part.finalRecord = after
      }
    }
    return part.id
  }

  /**
   * @param {Part} part
   * @param {string | null} name
   * @param {PlaceOptions} [options]
   * @returns {Part}
   */
  function place(part, name, options = {}) {
    if (name !== null) part.name = name
    if (options.hidden) part.hidden = true
    if (options.color !== undefined) part.color = options.color
    if (options.colorAlpha !== undefined) part.colorAlpha = options.colorAlpha
    placed.push({ kind: 'part', part })
    return part
  }

  return {
    finalize,

    place,

    /**
     * A part V1 built as a multi-solid `Group` whose `combine()` is genuinely more than
     * any one member: every solid stays addressable as a hidden part, and the visible
     * part is their union — `hardware.bolt.js`'s `tap` shape.
     *
     * @param {string} name
     * @param {readonly Part[]} parts
     * @param {PlaceOptions} [options]
     */
    placeUnion(name, parts, options = {}) {
      for (const part of parts) place(part, part.id, { hidden: true })
      placed.push({
        kind: 'record',
        record: {
          id: name,
          op: 'boolean.union',
          params: {},
          operands: parts.map((part) => part.id),
          name,
          ...(options.color !== undefined ? { color: options.color } : {}),
          ...(options.colorAlpha !== undefined ? { colorAlpha: options.colorAlpha } : {}),
        },
      })
    },

    /** @param {PlacedBoolean} item */
    placeBoolean(item) {
      placed.push({
        kind: 'record',
        record: {
          id: item.id,
          op: item.op,
          params: {},
          target: item.target,
          operands: [...item.operands],
          ...(item.name ? { name: item.name } : {}),
          ...(item.hidden ? { hidden: true } : {}),
          ...(item.color !== undefined ? { color: item.color } : {}),
          ...(item.colorAlpha !== undefined ? { colorAlpha: item.colorAlpha } : {}),
        },
      })
    },

    build() {
      for (const item of placed) {
        if (item.kind === 'record') {
          records.push(item.record)
          continue
        }
        const { part } = item
        finalize(part)
        const record = /** @type {OpRecord} */ (part.finalRecord)
        if (part.name) record.name = part.name
        if (part.hidden) record.hidden = true
        if (part.color !== undefined) record.color = part.color
        if (part.colorAlpha !== undefined) record.colorAlpha = part.colorAlpha
      }
      return records
    },
  }
}

/**
 * One part derived from several already-placed ones by a boolean.
 *
 * @param {Builder} builder
 * @param {string} id
 * @param {'union' | 'subtract' | 'intersect'} kind
 * @param {readonly Part[]} operands First is the base, for `subtract`/`intersect`.
 * @returns {Part}
 */
export function booleanPart(builder, id, kind, operands) {
  if (operands.length < 2) {
    throw new Error(`booleanPart(${id}): boolean.${kind} needs at least two operands`)
  }
  const ids = operands.map((operand) => builder.finalize(operand))
  const geom = booleans[kind](...operands.map((operand) => operand.geom))
  return {
    id,
    baseRecords: [
      {
        id: `${id}.solid`,
        op: `boolean.${kind}`,
        params: {},
        target: ids[0],
        operands: ids.slice(1),
      },
    ],
    baseId: `${id}.solid`,
    // The operands were already placed, so the result is too.
    offsetMm: [0, 0, 0],
    geom,
  }
}

/**
 * A board drilled by its mounting holes (`TODO/core-034`): V1 assigns `group.holes` and
 * its `combine()` subtracts them from the assembly, which this fold's schema has no flag
 * for — so the recipe subtracts them from **the board only**, here, and leaves the holes
 * as the hidden named parts they already were (snap targets, Subtract operands).
 *
 * `plate` is the undrilled board: place it unnamed, measure against it (subtraction does
 * not move its bounding box, so every V1 datum still reads the same), and pass it here.
 * The returned part is a real `boolean.subtract` record under `id`, so the caller
 * `place`s it with the name and colour V1 gave the board. Holes must already be placed
 * at their final positions.
 *
 * @param {Builder} builder
 * @param {string} id
 * @param {Part} plate
 * @param {readonly Part[]} holes
 * @returns {Part}
 */
export function drillBoard(builder, id, plate, holes) {
  const target = builder.finalize(plate)
  const operands = holes.map((hole) => builder.finalize(hole))
  return {
    id,
    baseRecords: [{ id, op: 'boolean.subtract', params: {}, target, operands }],
    baseId: id,
    offsetMm: [0, 0, 0],
    geom: booleans.subtract(plate.geom, ...holes.map((hole) => hole.geom)),
    bound: true,
  }
}

/**
 * The `modify.*` ops this kit can apply to a placed part, and how to probe each.
 *
 * @type {Readonly<Record<string, (params: Record<string, any>, geom: Geom3) => Geom3>>}
 */
const MODIFIERS = Object.freeze({
  'modify.filletRim': (params, geom) =>
    filletRim({ radius: params.radius, orientation: params.orientation, segments: SEGMENTS }, geom),
  'modify.chamferRim': (params, geom) =>
    chamferRim({ radius: params.radius, orientation: params.orientation }, geom),
  // `enlarge` is typed `Geom3 | Group -> Geom3 | Group`; a part's probe geometry is
  // always a solid, so the solid branch is the only one reachable here.
  'modify.enlarge': (params, geom) => /** @type {Geom3} */ (enlarge(geom, params.deltaMm)),
})

/**
 * One part derived from a single already-placed one by a `modify.*` op.
 *
 * @param {Builder} builder
 * @param {string} id
 * @param {'modify.filletRim' | 'modify.chamferRim' | 'modify.enlarge'} op
 * @param {Record<string, any>} params
 * @param {Part} operand
 * @returns {Part}
 */
export function modifyPart(builder, id, op, params, operand) {
  const targetId = builder.finalize(operand)
  return {
    id,
    baseRecords: [{ id: `${id}.solid`, op, params: { ...params }, target: targetId }],
    baseId: `${id}.solid`,
    offsetMm: [0, 0, 0],
    geom: MODIFIERS[op](params, operand.geom),
  }
}

/**
 * The half-space box `group.js`'s `bisect` would build for one straight cut, as an
 * ordinary part this expansion can subtract.
 *
 * `modify.bisect` itself cannot be chained inside a composite: it returns a two-part
 * `Group` (`negative`, `positive`), and the fold refuses a `{ id, pieces }` operand on
 * any op that is not `group.snap`/`group.align` — a restriction of the *op*, identical
 * inside and outside a composite, not of composite nesting. Referencing the group by
 * bare id instead is worse than an error: `toGeom3` combines both halves and silently
 * hands back the original uncut solid. See `raspberrypi.miniPiTFT.js`'s module doc.
 *
 * So a cut is expressed the way `bisect` itself expresses it (`group.js:808-851`): one
 * axis-aligned box covering the whole half-space past the cut plane, subtracted. For a
 * straight cut that is not an approximation of `bisect` — it is the same boolean.
 *
 * @param {string} id
 * @param {Part} solid Part being cut; measured for the cut plane, never modified.
 * @param {'x' | 'y' | 'z'} axis
 * @param {number} offsetMm Positive measures in from the minimum face, negative back
 *   from the maximum face — V1's `util.getDelta` convention, which `bisect` keeps.
 * @param {'negative' | 'positive'} keep Which of `bisect`'s two halves the call site
 *   wants, spelled with V1's own part names. The box returned is the *other* half.
 * @returns {Part} The box to subtract, already placed.
 */
export function halfSpaceCutter(id, solid, axis, offsetMm, keep) {
  const index = { x: 0, y: 1, z: 2 }[axis]
  if (index === undefined) throw new Error(`halfSpaceCutter(${id}): unknown axis ${axis}`)
  if (keep !== 'negative' && keep !== 'positive') {
    throw new Error(`halfSpaceCutter(${id}): keep must be 'negative' or 'positive', got ${keep}`)
  }
  const [min, max] = boundsOf(solid.geom)
  const size = sizeOf(solid.geom)
  const cutMm = offsetMm < 0 || Object.is(offsetMm, -0) ? max[index] + offsetMm : min[index] + offsetMm

  // Generous on every axis: the box must clear the solid sideways and reach well past
  // it along the cut axis, so the subtraction is decided by the cut plane alone.
  const reach = Math.max(4 * Math.max(...size), 10)
  /** @type {Vec3Mm} */
  const boxSize = [0, 0, 0]
  /** @type {Vec3Mm} */
  const boxCentre = [0, 0, 0]
  for (let i = 0; i < 3; i += 1) {
    if (i === index) {
      boxSize[i] = reach
      // Keeping the negative half means removing everything above the plane, and
      // vice versa — the box's near face sits on the plane either way.
      boxCentre[i] = keep === 'negative' ? cutMm + reach / 2 : cutMm - reach / 2
    } else {
      boxSize[i] = size[i] + 2 * reach
      boxCentre[i] = (min[i] + max[i]) / 2
    }
  }
  // `cuboidPart` lands its minimum corner on the origin, so this is the move from
  // there to the box's own minimum corner.
  const cutter = cuboidPart(id, boxSize)
  move(
    [cutter],
    /** @type {Vec3Mm} */ ([
      boxCentre[0] - boxSize[0] / 2,
      boxCentre[1] - boxSize[1] / 2,
      boxCentre[2] - boxSize[2] / 2,
    ])
  )
  return cutter
}
