/**
 * The `hardware.bolt` composite recipe.
 *
 * A composite recipe builds no geometry. Its only job is to expand `params` into an
 * array of *other* op records — the same plain-JSON shape the document itself stores
 * (`Initial design.md` §3) — which the caller folds through the same `evaluate` every
 * other op replays through (§4). Nothing here imports `@jscad/modeling`, and nothing
 * here calls the registry: the output is data, diffable and reviewable the same way
 * any other document is (see `__fixtures__/hardware.bolt.m10-hex-20-loose.json`).
 *
 * ## What it reproduces
 *
 * `jscad-hardware@1.1.0`'s `Hardware.Bolt(length, spec, fit)`, which returns a
 * `jscad-utils` `Group` of three visible parts:
 *
 * - `head` — a hexagonal prism (`HexHeadScrew`) or cylinder (`PanHeadScrew`) sitting
 *   on `z = 0`, drawn on the spec's across-corners/head diameter.
 * - `thread` — a cylinder of the shank diameter, snapped `outside-` onto the head, so
 *   it runs *up* from the top of the head rather than down from `z = 0`.
 * - `tap` — the clearance solid: the same head and thread grown by
 *   `fitDiameter - bodyDiameter`, unioned. V1 adds this with `hidden = false`, so it
 *   is part of the default `combine()` — a fact worth stating out loud, because it
 *   means a bolt's rendered bounding box is the *clearance* envelope, not the metal.
 *
 * plus three hidden parts V1 carried as `tap-` prefixed subparts, including
 * `tap-headClearSpace` — the socket a driver needs above the head, positioned by
 * `inside+` against the clearance head.
 *
 * ## V1 → V3 differences this expansion makes explicit
 *
 * `jscad-utils`' `Parts.Cylinder`/`Parts.Hexagon` build prisms with their **base on
 * `z = 0`**; `@jscad/modeling`'s primitives are **centred on the origin**. That is a
 * second, separate centring change from the `cube` → `cuboid` one
 * `Initial design.md` §5 lists, and it applies to every prism in the catalogue. Each
 * primitive here is therefore followed by an explicit `transform.translate` that
 * lifts it to its V1 position, rather than the offset being buried inside a
 * primitive's implementation — the placement is visible in the expansion, which is
 * the whole point of dogfooding the document format.
 *
 * Likewise, `group.snap` never appears as a record. §4 is explicit that a recipe
 * calls the group math to compute a number and then bakes the *result* in as a plain
 * `transform.translate` vector. Here the offsets are analytic — the spec table
 * already gives every height involved, so no geometry has to be built to measure —
 * and `hardware.bolt.spec.js` asserts that the baked vector matches what
 * `group.calcSnap` computes from the real bounding boxes.
 *
 * @module core/kernel/recipes/hardware.bolt
 */

/** @typedef {import('../tables/bolt-specs.js').BoltSpec} BoltSpec */
/** @typedef {import('../registry.js').OpRecord} OpRecord */

/**
 * Segment count for cylindrical surfaces. Matches `@jscad/modeling`'s own cylinder
 * default, which happens to equal what `@jscad/csg` used (`defaultResolution2D`, 32)
 * — so a V1 and a V3 bolt of the same spec tessellate identically. Emitted into the
 * record explicitly rather than left to a library default, so a future default change
 * cannot silently move geometry.
 */
export const DEFAULT_CYLINDER_SEGMENTS = 32

/** V1's `Parts.Hardware[type]` branch, as an op name for the head solid. */
const HEAD_OP = Object.freeze({
  HexHeadScrew: 'primitive.hexagon',
  PanHeadScrew: 'primitive.cylinder',
})

/**
 * Emit the two records that place one prism with its base at `baseZMm`: the centred
 * V3 primitive, then the translate that lifts it.
 *
 * @param {object} args
 * @param {string} args.id Base id; the primitive gets `<id>.solid`.
 * @param {string} args.op A `primitive.*` op name.
 * @param {number} args.diameterMm
 * @param {number} args.heightMm
 * @param {number} args.baseZMm Where the bottom face lands, in millimetres.
 * @param {string} args.name Part name in the resulting group.
 * @param {boolean} [args.hidden] Keep it out of the group's default combine.
 * @param {number} args.segments Segment count, ignored by `primitive.hexagon`.
 * @returns {OpRecord[]}
 */
function prismRecords({ id, op, diameterMm, heightMm, baseZMm, name, hidden, segments }) {
  const params =
    op === 'primitive.hexagon'
      ? { diameter: diameterMm, height: heightMm }
      : { diameter: diameterMm, height: heightMm, segments }

  return [
    { id: `${id}.solid`, op, params },
    {
      id,
      op: 'transform.translate',
      params: { vector: [0, 0, baseZMm + heightMm / 2] },
      target: `${id}.solid`,
      name,
      ...(hidden ? { hidden: true } : {}),
    },
  ]
}

/**
 * Expand a `hardware.bolt` document line into the op records that define it.
 *
 * @param {object} params
 * @param {string} params.spec Key into `tables.boltSpecs`, e.g. `'m10 hex'`.
 * @param {number} params.length Thread length in millimetres; must be positive.
 * @param {string} [params.fit] Clearance class — `'tap'`, `'close'` or `'loose'`,
 *   default `'loose'` (V1's `Hardware.Bolt` default). Typed as a plain string because
 *   it arrives from untrusted document JSON and is validated below, not by the type.
 * @param {number} [params.segments] Cylinder segment count.
 * @param {{ boltSpecs: Readonly<Record<string, BoltSpec>> }} tables Size tables.
 * @returns {OpRecord[]} Op records in the same schema the document stores.
 */
export function bolt(params, tables) {
  const { spec, length, fit = 'loose', segments = DEFAULT_CYLINDER_SEGMENTS } = params

  const entry = tables.boltSpecs[spec]
  if (!entry) {
    throw new Error(
      `hardware.bolt: unknown spec "${spec}", expected one of ` +
        Object.keys(tables.boltSpecs).join(' | ')
    )
  }
  if (typeof length !== 'number' || !Number.isFinite(length) || length <= 0) {
    throw new Error(`hardware.bolt: length must be a positive number of millimetres, got ${length}`)
  }
  const fitDiameterMm = entry.fitDiameterMm[fit]
  if (typeof fitDiameterMm !== 'number') {
    throw new Error(
      `hardware.bolt: unknown fit "${fit}", expected one of ` +
        Object.keys(entry.fitDiameterMm).join(' | ')
    )
  }

  const headOp = HEAD_OP[entry.type]
  if (!headOp) throw new Error(`hardware.bolt: unknown head type "${entry.type}" for spec "${spec}"`)

  // V1: `var clearance = bolt[fit] - bolt.E` — grows the head in both diameter and
  // height, and replaces the shank diameter outright.
  const clearanceMm = fitDiameterMm - entry.bodyDiameterMm
  const tapHeadHeightMm = entry.headHeightMm + clearanceMm

  return [
    ...prismRecords({
      id: 'head',
      op: headOp,
      diameterMm: entry.headDiameterMm,
      heightMm: entry.headHeightMm,
      baseZMm: 0,
      name: 'head',
      segments,
    }),
    ...prismRecords({
      id: 'thread',
      op: 'primitive.cylinder',
      diameterMm: entry.bodyDiameterMm,
      heightMm: length,
      // group.snap(thread, head, 'z', 'outside-') resolves to exactly this.
      baseZMm: entry.headHeightMm,
      name: 'thread',
      segments,
    }),
    ...prismRecords({
      id: 'tap-head',
      op: headOp,
      diameterMm: entry.headDiameterMm + clearanceMm,
      heightMm: tapHeadHeightMm,
      baseZMm: 0,
      name: 'tap-head',
      hidden: true,
      segments,
    }),
    ...prismRecords({
      id: 'tap-thread',
      op: 'primitive.cylinder',
      diameterMm: fitDiameterMm,
      heightMm: length,
      baseZMm: tapHeadHeightMm,
      name: 'tap-thread',
      hidden: true,
      segments,
    }),
    ...prismRecords({
      id: 'tap-headClearSpace',
      op: headOp,
      diameterMm: entry.headDiameterMm + clearanceMm,
      // V1 passes `clearLength = length` into the tap screw, then snaps the result
      // 'inside+' against the clearance head: tops flush.
      heightMm: length,
      baseZMm: tapHeadHeightMm - length,
      name: 'tap-headClearSpace',
      hidden: true,
      segments,
    }),
    {
      id: 'tap',
      op: 'boolean.union',
      params: {},
      operands: ['tap-head', 'tap-thread'],
      name: 'tap',
    },
  ]
}
