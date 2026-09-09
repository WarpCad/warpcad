/**
 * The Library panel's catalogue, derived from the kernel registry.
 *
 * CLAUDE.md is explicit that "read the registry, don't hardcode a list" is the
 * right instinct *and* that it produces a broken UI unless the registry itself
 * encodes what the UI needs to act on. So the rows come from the registry's own
 * `primitive.*` entries and their `ui` metadata (label + default params), and this
 * module adds only the two things that are genuinely about placement rather than
 * about the op: the drop position, and the per-type instance name.
 *
 * That is what makes drag-place **one** mechanism parameterised by an op string
 * rather than seven near-identical hand-copies — adding an eighth primitive to the
 * registry adds its Library row, its ghost preview and its drop behaviour with no
 * change here or in any component.
 *
 * Framework-free (CLAUDE.md's Project Structure): the geometry maths that decides
 * where a dropped body sits lives here, not in a component.
 *
 * @module core/library
 */

import { evaluateOp } from './kernel/index.js'
import { boundsOf } from './kernel/group.js'
import { registry } from './kernel/registry.js'

/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */
/** @typedef {import('./document.js').WarpDocument} WarpDocument */
/** @typedef {{ x: number, y: number }} PointMm A point on the working plane, in mm. */

/**
 * @typedef {object} LibraryRow
 * @property {string} op Registry key — the drag payload, and the whole parameter.
 * @property {string} label Human name, e.g. `"Cube"`.
 * @property {Record<string, any>} defaults Params a fresh instance is created with.
 * @property {0 | 1 | '2+'} operandCount Always `0` here: these create from nothing.
 */

/**
 * Ordered so the rows read the way `Initial design.md` §6's Base creation rows do
 * — the primitives a user reaches for most, first — rather than in whatever order
 * `Object.keys` happens to return.
 */
const ROW_ORDER = Object.freeze([
  'primitive.cuboid',
  'primitive.cylinder',
  'primitive.cone',
  'primitive.hexagon',
  'primitive.triangle',
  'primitive.tube',
  'primitive.sphere',
])

/**
 * @param {Readonly<Record<string, import('./kernel/registry.js').RegistryEntry>>} ops
 * @returns {LibraryRow[]}
 */
function buildRows(ops) {
  const keys = Object.keys(ops).filter((op) => op.startsWith('primitive.'))
  keys.sort((a, b) => {
    const rankA = ROW_ORDER.indexOf(a)
    const rankB = ROW_ORDER.indexOf(b)
    // An op the order list has never heard of sorts after the known ones rather
    // than silently vanishing — a new registry entry should show up in the panel.
    return (rankA === -1 ? ROW_ORDER.length : rankA) - (rankB === -1 ? ROW_ORDER.length : rankB)
  })
  return keys.map((op) => {
    const entry = ops[op]
    if (!entry.ui) {
      throw new Error(
        `${op}: a primitive.* registry entry needs \`ui\` metadata (label + defaults) ` +
          'before the Library panel can offer it as a row'
      )
    }
    return Object.freeze({
      op,
      label: entry.ui.label,
      defaults: entry.ui.defaults,
      operandCount: entry.operandCount,
    })
  })
}

/**
 * The "Primitives" section of the Library panel.
 *
 * @type {readonly LibraryRow[]}
 */
export const PRIMITIVE_LIBRARY = Object.freeze(buildRows(registry))

/**
 * Look a row up by op.
 *
 * @param {string} op
 * @returns {LibraryRow}
 */
export function libraryRow(op) {
  const row = PRIMITIVE_LIBRARY.find((candidate) => candidate.op === op)
  if (!row) throw new Error(`${op} is not a Library row — nothing can be dragged from it`)
  return row
}

/**
 * Millimetre centre that leaves a primitive resting **on** the working plane
 * rather than half-buried in it.
 *
 * Every primitive's `center` param is its bounding-box centre, so dropping at the
 * grid's Z=0 with `center.z = 0` would sink half the solid below the grid — which
 * reads as a rendering bug the first time anyone drops a cube. The offset is
 * measured from the built solid rather than derived per primitive, so it is
 * correct for all seven without a per-type branch (and for the eighth).
 *
 * @param {string} op
 * @param {Record<string, any>} params
 * @param {PointMm} pointMm Where on the plane the pointer released.
 * @returns {[number, number, number]}
 */
export function restingCenter(op, params, pointMm) {
  const probe = evaluateOp(op, { ...params, center: [0, 0, 0] })
  const [min] = boundsOf(probe)
  return [pointMm.x, pointMm.y, -min[2]]
}

/**
 * Params for an instance of a row dropped at a point.
 *
 * The drop position goes straight into the primitive's own `center` param: every
 * `primitive.*` entry already takes one, so a placed body is **one** record, not a
 * primitive plus a trailing `transform.translate`. (TODO/ui-010 asked for that
 * check before assuming a second record was needed — this is the answer.)
 *
 * The drag ghost and the committed record both come through here, so the preview
 * a user drags around is built from exactly the params the drop will commit.
 *
 * @param {string} op
 * @param {PointMm} pointMm
 * @param {Record<string, any>} [overrides]
 * @returns {Record<string, any>}
 */
export function paramsForDrop(op, pointMm, overrides = {}) {
  const params = { ...libraryRow(op).defaults, ...overrides }
  return { ...params, center: restingCenter(op, params, pointMm) }
}

/**
 * Build the op record one drop commits.
 *
 * @param {string} op Registry key from the dragged row.
 * @param {PointMm} pointMm Drop position on the working plane.
 * @param {WarpDocument} document Supplies the id and the per-type instance number.
 * @param {Record<string, any>} [overrides] Extra params, e.g. a non-default size.
 * @returns {OpRecord}
 */
export function recordForDrop(op, pointMm, document, overrides = {}) {
  const row = libraryRow(op)
  return {
    id: document.nextId(op.replace('primitive.', '')),
    op,
    name: document.nextName(row.label),
    params: paramsForDrop(op, pointMm, overrides),
  }
}

// --- snap-assisted placement (TODO/ui-013) ---------------------------------

/**
 * The snap tolerance radius, in **screen pixels**.
 *
 * A pixel radius rather than a millimetre one, converted at the boundary by
 * {@link snapToleranceMm}, because "close enough to snap" is a judgement a user
 * makes with their eyes: a fixed millimetre tolerance would cover half the
 * viewport when zoomed out and be unreachably tight when zoomed in, so the
 * assistance would change character with the zoom level rather than staying the
 * same gesture. `TODO/ui-013` calls for the tolerance to be "scaled by the
 * current `mmPerPixel` the way `ui-017`'s gizmo sizing already scales by zoom" —
 * this is that, with the unit named in the constant rather than implied.
 *
 * Tuned against the same reasoning as `GIZMO_ARM_FLOOR_PX`: comfortably larger
 * than a fingertip's own imprecision, small enough that two solids dropped
 * visibly apart stay apart.
 */
export const SNAP_TOLERANCE_PX = 48

/**
 * The tolerance radius in millimetres, at the viewport's current scale.
 *
 * @param {number} mmPerPixel The viewport's own scale — the number the grid
 *   readout quotes (`orbit.getMmPerPixel(heightPx)`).
 * @returns {number} Millimetres, or `0` when there is no usable scale — which
 *   disables snapping outright rather than inventing a tolerance. A drop the
 *   user did not ask to have moved is worse than no assistance.
 */
export function snapToleranceMm(mmPerPixel) {
  return mmPerPixel > 0 ? SNAP_TOLERANCE_PX * mmPerPixel : 0
}

/**
 * @typedef {object} BoxMm
 * @property {number[]} minMm `[x, y, z]` minimum corner, millimetres.
 * @property {number[]} maxMm Maximum corner.
 */

/**
 * @typedef {object} SnapAlignment
 * @property {string} id Stable name, used in tests and in the guide's markup.
 * @property {'center' | 'edge'} kind What the guide is drawn along — the
 *   reference's centre line, or one of its faces.
 * @property {string | null} orientation The `SNAP_SIDES` key in
 *   `src/core/kernel/group.js` this alignment is the arithmetic of, or `null`
 *   for the centre alignment (which is `calcCenterWith`, not `calcSnap`).
 */

/**
 * The five alignments a dragged ghost can snap to on one axis, in **preference
 * order** — earlier wins an exact tie.
 *
 * Centre first, deliberately: for two same-size solids the centre, min-flush and
 * max-flush alignments are numerically identical, and "their centre lines line
 * up" is the one a user means (it is also the alignment the bolt/nut case in
 * `TODO/ui-013`'s own example needs — a nut snapping onto a bolt's axis). The
 * touching-face pair comes last so a ghost is only pushed *against* a solid when
 * no flush alignment is nearer.
 *
 * Each entry names the `group.js` orientation whose arithmetic it is, and
 * `src/core/library.spec.js` asserts every one of them agrees with that
 * function's own output exactly — see {@link alignmentOffsetMm} for why the call
 * is not made directly.
 *
 * @type {readonly SnapAlignment[]}
 */
export const SNAP_ALIGNMENTS = Object.freeze([
  Object.freeze({ id: 'center', kind: /** @type {'center'} */ ('center'), orientation: null }),
  Object.freeze({ id: 'flush-min', kind: /** @type {'edge'} */ ('edge'), orientation: 'below-inside' }),
  Object.freeze({ id: 'flush-max', kind: /** @type {'edge'} */ ('edge'), orientation: 'above-inside' }),
  Object.freeze({ id: 'touch-max', kind: /** @type {'edge'} */ ('edge'), orientation: 'above-outside' }),
  Object.freeze({ id: 'touch-min', kind: /** @type {'edge'} */ ('edge'), orientation: 'below-outside' }),
])

/**
 * How far one alignment would move the ghost along one axis, in millimetres.
 *
 * This is `calcSnap`'s own `reference-side − moving-side` arithmetic
 * (`src/core/kernel/group.js`), reduced to scalars. `TODO/ui-013`'s Proposed fix
 * asks for `calcSnap` to be reused, and its *maths* is — but not by calling it:
 * `calcSnap` takes solids, measures a bounding box per call and allocates a
 * vector per call, while this runs on every `pointermove` of a drag against five
 * candidates per axis, which CLAUDE.md's Performance rule rules out. The two are
 * asserted equal in the spec instead, so the equivalence is checked rather than
 * asserted in prose.
 *
 * @param {number} alignmentIndex Index into {@link SNAP_ALIGNMENTS}.
 * @param {number} movingMinMm The ghost's extent on this axis.
 * @param {number} movingMaxMm
 * @param {number} referenceMinMm The existing body's extent on this axis.
 * @param {number} referenceMaxMm
 * @returns {number} Signed millimetres along the axis.
 */
export function alignmentOffsetMm(
  alignmentIndex,
  movingMinMm,
  movingMaxMm,
  referenceMinMm,
  referenceMaxMm
) {
  switch (alignmentIndex) {
    case 0:
      // calcCenterWith: centroid onto centroid. A bounding box's centroid is its
      // mid-point, which is what `centroidOf` measures too.
      return (referenceMinMm + referenceMaxMm) / 2 - (movingMinMm + movingMaxMm) / 2
    case 1:
      return referenceMinMm - movingMinMm
    case 2:
      return referenceMaxMm - movingMaxMm
    case 3:
      return referenceMaxMm - movingMinMm
    case 4:
      return referenceMinMm - movingMaxMm
    default:
      throw new Error(`alignmentOffsetMm: no alignment at index ${alignmentIndex}`)
  }
}

/**
 * Where on the axis an alignment's guide line is drawn — the coordinate of the
 * reference feature the ghost has just been aligned to, which is also where the
 * ghost's own corresponding feature now sits.
 *
 * @param {number} alignmentIndex Index into {@link SNAP_ALIGNMENTS}.
 * @param {number} referenceMinMm
 * @param {number} referenceMaxMm
 * @returns {number}
 */
export function alignmentCoordMm(alignmentIndex, referenceMinMm, referenceMaxMm) {
  if (alignmentIndex === 0) return (referenceMinMm + referenceMaxMm) / 2
  // The min face for the alignments measured off it, the max face for the rest.
  return alignmentIndex === 1 || alignmentIndex === 4 ? referenceMinMm : referenceMaxMm
}

/**
 * @typedef {object} SnapGuide
 * @property {0 | 1} axis The working-plane axis this guide aligns — `0` is a
 *   line of constant X running along Y, `1` a line of constant Y running along X.
 * @property {boolean} visible False when this axis did not snap.
 * @property {'center' | 'edge'} kind Which feature of the reference it lies on.
 * @property {number} x1Mm One end of the line, in document millimetres.
 * @property {number} y1Mm
 * @property {number} x2Mm The other end.
 * @property {number} y2Mm
 * @property {number} zMm Height the line is drawn at — the reference solid's own
 *   base, which is the working plane both it and the ghost rest on.
 */

/**
 * @typedef {object} SnapState
 * @property {boolean} snapped True when at least one axis was pulled into line.
 * @property {number} dxMm How far the drop point moves, in millimetres.
 * @property {number} dyMm
 * @property {SnapGuide[]} guides One per working-plane axis, always both
 *   present; `visible` says which are drawn.
 */

/**
 * Allocate a {@link BoxMm} once, so a per-`pointermove` caller mutates rather
 * than rebuilds — the same contract as `src/render/annotate.js`'s `create*`.
 *
 * @returns {BoxMm}
 */
export function createBoxMm() {
  return { minMm: [0, 0, 0], maxMm: [0, 0, 0] }
}

/**
 * Allocate the snap state once. See {@link updateSnap}.
 *
 * @returns {SnapState}
 */
export function createSnapState() {
  return {
    snapped: false,
    dxMm: 0,
    dyMm: 0,
    guides: [0, 1].map((axis) => ({
      axis: /** @type {0 | 1} */ (axis),
      visible: false,
      kind: /** @type {'center' | 'edge'} */ ('edge'),
      x1Mm: 0,
      y1Mm: 0,
      x2Mm: 0,
      y2Mm: 0,
      zMm: 0,
    })),
  }
}

/**
 * The box a ghost of `op` occupies when dropped at the working plane's origin.
 *
 * Measured off the built solid through the *same* {@link paramsForDrop} the drop
 * itself commits, so the box describes the shape that will actually land —
 * including resting on the plane rather than sunk half into it. Evaluating a
 * solid is far too expensive for the pointer path, which is why this is shaped
 * as "measure once per op, then translate": {@link boxAtPoint} moves it to
 * wherever the pointer is, with no evaluation at all.
 *
 * @param {string} op
 * @param {Record<string, any>} [overrides]
 * @returns {BoxMm}
 */
export function ghostBoxAtOrigin(op, overrides = {}) {
  const solid = evaluateOp(op, paramsForDrop(op, { x: 0, y: 0 }, overrides))
  const [minMm, maxMm] = boundsOf(solid)
  return { minMm, maxMm }
}

/**
 * The same box, translated to a point on the working plane.
 *
 * X and Y only: a drop is a working-plane gesture, so the resting height the
 * origin box was measured with is exactly the height the ghost keeps.
 *
 * @param {BoxMm} originBox From {@link ghostBoxAtOrigin}.
 * @param {PointMm} pointMm
 * @param {BoxMm} out Mutated in place.
 * @returns {BoxMm} `out`
 */
export function boxAtPoint(originBox, pointMm, out) {
  out.minMm[0] = originBox.minMm[0] + pointMm.x
  out.maxMm[0] = originBox.maxMm[0] + pointMm.x
  out.minMm[1] = originBox.minMm[1] + pointMm.y
  out.maxMm[1] = originBox.maxMm[1] + pointMm.y
  out.minMm[2] = originBox.minMm[2]
  out.maxMm[2] = originBox.maxMm[2]
  return out
}

/**
 * How far past the two solids a guide line is drawn at each end, as a multiple
 * of the snap tolerance.
 *
 * Not cosmetic, and found by driving the app rather than by reasoning about it:
 * when the ghost snaps *centred* on the reference the two boxes coincide, so a
 * guide spanning only their union is a stub the length of the solid itself —
 * geometrically correct, buried under the solid, and invisible in practice. A
 * guide has to run visibly *past* what it aligns to read as a guide at all,
 * which is what every drafting and design tool draws.
 *
 * A multiple of the tolerance rather than a fixed millimetre length, so the
 * overhang is the same length on screen at every zoom level — the same reasoning
 * as {@link SNAP_TOLERANCE_PX} itself. One tolerance's worth: the line extends
 * by exactly the distance that counts as "close enough".
 */
const GUIDE_OVERHANG_RATIO = 1

/**
 * The gap between two extents on one axis, in millimetres — `0` when they
 * overlap (or merely touch), otherwise how far apart they are.
 *
 * This is what makes the assistance a *radius* rather than an infinite ruler.
 * See {@link updateSnap} for why that distinction is the whole design of it.
 *
 * @param {number} aMinMm
 * @param {number} aMaxMm
 * @param {number} bMinMm
 * @param {number} bMaxMm
 * @returns {number} Zero or positive.
 */
export function gapMm(aMinMm, aMaxMm, bMinMm, bMaxMm) {
  if (aMinMm > bMaxMm) return aMinMm - bMaxMm
  if (bMinMm > aMaxMm) return bMinMm - aMaxMm
  return 0
}

/**
 * Reset a snap state to "nothing to snap to".
 *
 * Called on an empty scene and at the end of every gesture — a guide left
 * standing after the drag that produced it would be pointing at an alignment
 * nothing is being aligned to any more.
 *
 * @param {SnapState} out Mutated in place.
 * @returns {SnapState} `out`
 */
export function clearSnap(out) {
  out.snapped = false
  out.dxMm = 0
  out.dyMm = 0
  for (const guide of out.guides) guide.visible = false
  return out
}

/**
 * Pull a dragged ghost into line with the nearest existing body, and describe
 * the guides that say why (`TODO/ui-013`, `Initial design.md` §7a).
 *
 * Each working-plane axis is decided **independently**: the ghost can snap in X
 * while staying wherever the pointer put it in Y, which is what makes the
 * assistance feel like guides rather than a magnet. Per axis, the five
 * {@link SNAP_ALIGNMENTS} are scored by how far they would move the ghost and
 * the smallest wins, provided it is within `toleranceMm` — inclusive at the
 * boundary, so "exactly at tolerance" snaps.
 *
 * ## The proximity gate, and why it is not optional
 *
 * An axis only snaps when the ghost is *also* within tolerance of the reference
 * on the **other** axis ({@link gapMm}). Without that gate, two solids at
 * opposite corners of the grid still share a Y coordinate to within a
 * millimetre or two whenever the drag happened to travel along X, and the drop
 * would be silently shifted by an alignment to something 400 mm away that the
 * user never had in mind. §7a asks for a snap "within a tolerance **radius** on
 * approach", and a radius is what this makes it: the assistance appears when the
 * ghost is genuinely near the item, not merely somewhere on one of its axes.
 *
 * The trade is deliberate and worth naming: this does **not** offer the
 * long-range "line these two up across the whole canvas" guide a 2D design tool
 * shows. Aligning two solids that are nowhere near each other is a precise,
 * deliberate operation with an operand order and an undo entry — `ui-026`'s
 * `group.snap`/`group.align` — not something a drag should do behind the user's
 * back.
 *
 * Z is deliberately not snapped: a placement drag projects onto the working
 * plane and carries no height information at all, so a ghost always rests on the
 * plane and there is nothing for a Z alignment to be measured against. Stacking
 * one solid on another is a *reposition*, which is `ui-026`'s
 * `group.snap`/`group.align` operation, not this drag's business.
 *
 * Allocation-free: everything is written into `out`, because this runs on every
 * `pointermove` of a drag (CLAUDE.md's Performance rule).
 *
 * @param {BoxMm} movingBox The ghost's box at the raw pointer position.
 * @param {BoxMm} referenceBox The nearest existing body's world bounding box.
 * @param {number} toleranceMm From {@link snapToleranceMm}; `0` disables snapping.
 * @param {SnapState} out Mutated in place.
 * @returns {SnapState} `out`
 */
export function updateSnap(movingBox, referenceBox, toleranceMm, out) {
  clearSnap(out)
  if (!(toleranceMm > 0)) return out

  for (let axis = 0; axis < 2; axis += 1) {
    const guide = out.guides[axis]
    // The proximity gate, measured on the *other* working-plane axis and against
    // the ghost's raw position — see this function's own note on why.
    const other = axis === 0 ? 1 : 0
    if (
      gapMm(
        movingBox.minMm[other],
        movingBox.maxMm[other],
        referenceBox.minMm[other],
        referenceBox.maxMm[other]
      ) > toleranceMm
    ) {
      continue
    }
    let bestOffset = 0
    let bestIndex = -1
    for (let index = 0; index < SNAP_ALIGNMENTS.length; index += 1) {
      const offset = alignmentOffsetMm(
        index,
        movingBox.minMm[axis],
        movingBox.maxMm[axis],
        referenceBox.minMm[axis],
        referenceBox.maxMm[axis]
      )
      // Strictly less, so an exact tie keeps the earlier — higher-preference —
      // alignment rather than whichever happened to be checked last.
      if (bestIndex !== -1 && !(Math.abs(offset) < Math.abs(bestOffset))) continue
      bestOffset = offset
      bestIndex = index
    }
    if (bestIndex === -1 || Math.abs(bestOffset) > toleranceMm) continue

    out.snapped = true
    guide.visible = true
    guide.kind = SNAP_ALIGNMENTS[bestIndex].kind
    const coordMm = alignmentCoordMm(
      bestIndex,
      referenceBox.minMm[axis],
      referenceBox.maxMm[axis]
    )
    if (axis === 0) {
      out.dxMm = bestOffset
      guide.x1Mm = coordMm
      guide.x2Mm = coordMm
    } else {
      out.dyMm = bestOffset
      guide.y1Mm = coordMm
      guide.y2Mm = coordMm
    }
  }

  // Spans are written after both axes are decided, because a guide runs along
  // the *other* axis and has to reach the ghost's snapped position, not its raw
  // one — otherwise the line stops short of the thing it is aligning.
  const overhangMm = toleranceMm * GUIDE_OVERHANG_RATIO
  for (let axis = 0; axis < 2; axis += 1) {
    const guide = out.guides[axis]
    if (!guide.visible) continue
    const along = axis === 0 ? 1 : 0
    const shift = along === 0 ? out.dxMm : out.dyMm
    const spanMin =
      Math.min(referenceBox.minMm[along], movingBox.minMm[along] + shift) - overhangMm
    const spanMax =
      Math.max(referenceBox.maxMm[along], movingBox.maxMm[along] + shift) + overhangMm
    if (axis === 0) {
      guide.y1Mm = spanMin
      guide.y2Mm = spanMax
    } else {
      guide.x1Mm = spanMin
      guide.x2Mm = spanMax
    }
    guide.zMm = referenceBox.minMm[2]
  }

  return out
}
