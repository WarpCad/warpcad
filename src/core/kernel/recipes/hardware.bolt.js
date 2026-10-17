// SPDX-License-Identifier: AGPL-3.0-or-later
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
 *   `fitDiameter - bodyDiameter`, unioned. **V1 adds this with `hidden = false`,
 *   putting it in the default `combine()`; V3 marks it `hidden: true` instead**
 *   (TODO/render-004, user decision 2026-09-26) — the same deliberate divergence
 *   `hardware.washer.js`'s module doc records for its own `clearance` part, and for
 *   the same reason: once `render-003` made recipe colours actually render, an
 *   unhidden `tap` — opaque red, and by construction larger than and fully enclosing
 *   both `head` and `thread` — made every freshly-dropped bolt look like a plain red
 *   cylinder instead of a gray-headed, silver-threaded bolt. `tap` stays addressable
 *   by name for a boolean subtract (ACCEPTANCE.md scenario 5) exactly as it always
 *   was; only its default visibility changed. This *does* change a bolt's default
 *   `combine()` bounding box from the clearance envelope to the metal envelope —
 *   see `hardware.bolt.spec.js`'s V1-diff describe block and this recipe's own
 *   retirement note in `TODO/done/render-004-*.md` for the affected numbers.
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
 * ## Colours (TODO/core-026)
 *
 * Every named part keeps the colour V1 gave it, which the first port dropped: V1's
 * `Parts.Hardware.Screw` builds `head: head.color('gray')` and
 * `thread: ....color('silver')` (`jscad-utils@3.2.0` `dist/index.js:1934-1937`), and
 * `Hardware.Bolt` recolours the whole clearance screw with
 * `.map(part => part.color('red'))` before adding it as `tap`/`tap-*`
 * (`jscad-hardware.jscad:33-46`). So `head` is gray, `thread` silver, and `tap` and all
 * three `tap-*` parts red — measured from V1's own output in
 * `hardware.bolt.v1-reference.json`, not just read.
 *
 * ## One fastener op: `type` (TODO/core-060)
 *
 * `hardware.bolt` is the project's single fastener function — the Library's **Bolt /
 * screw** row. Its params are `{ type, spec, length, fit? }`, `spec` being the bare
 * size (`'m2.5'`, `'#8'`, `'1/4'`) and `type` one of {@link FASTENER_TYPES}:
 *
 * - `socket`, `hex` — the bolts above, **through exactly the same code path**: the size
 *   and type are rejoined into the `boltSpecs` key (`'m10'` + `'hex'` → `'m10 hex'`), so
 *   a new-shape hex bolt and a saved `m10 hex` expand to the same bytes.
 * - `pan`, `flat`, `woodPan`, `woodFlat` — screws, built by `fastener-geometry.js`, the
 *   head-and-thread builder `hardware.screw` also uses: a cylinder head for pan, a cone
 *   head (the countersunk shape) for flat. A size with fit data adds the same hidden
 *   `tap-head` / `tap-thread` / `tap-headClearSpace` / `tap` parts a bolt has, so part
 *   names survive a Type change. For `flat`, `tap-head` is the head cone grown by the
 *   clearance — the countersink a user subtracts.
 * - A wood screw's fits are holes from a published pilot-hole chart
 *   (`tables/wood-screw-holes.js`): `clearance`, `hardwood`, `softwood` (the default).
 *   Its `tap-thread` is the chosen hole itself — a pilot is narrower than the thread —
 *   and its `tap-head` is grown by the `clearance` hole's clearance whatever the fit.
 * - A size with no fit data builds `head` and `thread` only, and refuses a `fit`.
 *
 * **Legacy shapes are read, never rewritten.** A record with no `type` is the pre-core-060
 * shape (`{ spec: 'm10 hex' }`) and takes the original path untouched, wording of its
 * refusals included. {@link normalizeBoltParams} is the one function every consumer —
 * this recipe, the param schema, the BOM, the edit path, the Inspector — uses to read it
 * in the new shape; only an edit writes that shape back (`paramEdit.js`).
 *
 * @module core/kernel/recipes/hardware.bolt
 */

import { v1ColorToRecord } from '../colors.js'
import { FASTENER_TYPES } from '../tables/fastener-specs.js'
import { headAndThread, placed } from './fastener-geometry.js'

/** @typedef {import('../tables/bolt-specs.js').BoltSpec} BoltSpec */
/** @typedef {import('../registry.js').OpRecord} OpRecord */

/*
 * Cylinder segment counts are **not** emitted unless the caller asks for one
 * (`TODO/core-035`). A baked count would be read by the fold as an explicit choice and
 * escape the design resolution — and the tap clearance is exactly the round hole whose
 * fit that setting exists for. Left out, `primitive.cylinder` takes its count from the
 * resolution policy; under `legacy` that is still 32, `@jscad/csg`'s
 * `defaultResolution2D`, so a V1 and a V3 bolt of the same spec still tessellate
 * identically and every existing bolt is byte-identical.
 */

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
 * @param {string} args.v1Color V1's `.color(...)` name for the part.
 * @param {number} [args.segments] Explicit segment count, ignored by `primitive.hexagon`;
 *   omitted, the design resolution decides.
 * @returns {OpRecord[]}
 */
function prismRecords({ id, op, diameterMm, heightMm, baseZMm, name, hidden, v1Color, segments }) {
  const params =
    op === 'primitive.hexagon' || segments === undefined
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
      ...v1ColorToRecord(v1Color),
    },
  ]
}

/**
 * Read a `hardware.bolt`'s params in the new `{ type, spec }` shape.
 *
 * A `spec` that carries a head suffix — `'m10 hex'`, `'1/4 socket'` — is split on its last
 * space, and the suffix becomes `type`. New sizes never contain a space, so a suffix is
 * unambiguous and wins over any `type` already present (an edit that sets a legacy spec
 * on a new-shape record). Anything else — a new-shape record, a bound (`{ $var }`) spec,
 * an unrecognised suffix — comes back as the **same object**, untouched.
 *
 * Pure: never mutates `params`.
 *
 * @param {Record<string, any>} params
 * @returns {Record<string, any>}
 */
export function normalizeBoltParams(params) {
  const spec = params?.spec
  if (typeof spec !== 'string') return params
  const space = spec.lastIndexOf(' ')
  if (space === -1) return params
  const suffix = spec.slice(space + 1)
  if (suffix !== 'socket' && suffix !== 'hex') return params
  const { spec: _spec, type: _type, ...rest } = params
  return { type: suffix, spec: spec.slice(0, space), ...rest }
}

/**
 * The fit a fastener of `type` takes when its record names none: `'loose'` for machine
 * screws and bolts (V1 `Hardware.Bolt`'s own default), `'softwood'` for wood screws — the
 * pilot closest to a printed-plastic boss, this app's common case.
 *
 * @param {string} type
 * @returns {string}
 */
export function defaultFitFor(type) {
  return type === 'woodPan' || type === 'woodFlat' ? 'softwood' : 'loose'
}

/**
 * The head style a screw Type draws: a cone for the flat (countersunk) heads, a cylinder
 * otherwise.
 *
 * @param {string} type
 * @returns {import('./fastener-geometry.js').ScrewHead}
 */
function screwHeadOf(type) {
  return type === 'flat' || type === 'woodFlat' ? 'FlatHead' : 'PanHead'
}

/**
 * @typedef {object} BoltTables
 * @property {Readonly<Record<string, BoltSpec>>} boltSpecs The legacy-keyed bolt table.
 * @property {Readonly<Record<string, Readonly<Record<string, import('../tables/fastener-specs.js').FastenerSpec>>>>} [fastenerSpecs]
 *   Sizes per Type; needed only for the screw Types.
 */

/**
 * Expand a `hardware.bolt` document line into the op records that define it.
 *
 * @param {object} params
 * @param {string} [params.type] One of {@link FASTENER_TYPES}. Absent: the legacy shape,
 *   where `spec` is a `boltSpecs` key like `'m10 hex'`.
 * @param {string} params.spec The size (`'m3'`, `'#8'`), or a legacy `boltSpecs` key.
 * @param {number} params.length Thread length in millimetres; must be positive.
 * @param {string} [params.fit] Fit class; see {@link defaultFitFor} for the default.
 * @param {number} [params.segments] Cylinder segment count. Omitted: the design
 *   resolution decides (`TODO/core-035`).
 * @param {BoltTables} tables Size tables.
 * @returns {OpRecord[]} Op records in the same schema the document stores.
 */
export function bolt(params, tables) {
  // The pre-core-060 shape takes the original path, untouched — refusals included.
  if (params.type === undefined) return machineBolt(params, tables)

  const normal = normalizeBoltParams(params)
  const { type, spec } = normal
  if (!FASTENER_TYPES.includes(/** @type {any} */ (type))) {
    throw new Error(`hardware.bolt: unknown type "${type}", expected one of ${FASTENER_TYPES.join(' | ')}`)
  }
  if (type === 'socket' || type === 'hex') {
    const sizes = Object.keys(tables.boltSpecs)
      .filter((key) => key.endsWith(` ${type}`))
      .map((key) => key.slice(0, -type.length - 1))
    if (!sizes.includes(spec)) throw unknownSize(type, spec, sizes)
    return machineBolt(/** @type {{ spec: string, length: number }} */ ({ ...normal, spec: `${spec} ${type}` }), tables)
  }
  return screwBolt(/** @type {{ type: string, spec: string, length: number }} */ (normal), tables)
}

/**
 * @param {string} type
 * @param {unknown} spec
 * @param {readonly string[]} sizes
 * @returns {Error}
 */
function unknownSize(type, spec, sizes) {
  return new Error(`hardware.bolt: unknown ${type} size "${spec}", expected one of ${sizes.join(' | ')}`)
}

/**
 * @param {unknown} length
 * @returns {void}
 */
function requireLength(length) {
  if (typeof length !== 'number' || !Number.isFinite(length) || length <= 0) {
    throw new Error(`hardware.bolt: length must be a positive number of millimetres, got ${length}`)
  }
}

/**
 * A pan, flat or wood screw: head and thread from the shared builder, plus the hidden
 * clearance parts when the size has fit data.
 *
 * @param {{ type: string, spec: string, length: number, fit?: string, segments?: number }} params
 * @param {BoltTables} tables
 * @returns {OpRecord[]}
 */
function screwBolt({ type, spec, length, fit, segments }, tables) {
  const rows = tables.fastenerSpecs?.[type] ?? {}
  if (typeof spec !== 'string' || !Object.hasOwn(rows, spec)) throw unknownSize(type, spec, Object.keys(rows))
  requireLength(length)

  const entry = rows[spec]
  const head = screwHeadOf(type)
  const { headDiameterMm, headHeightMm, bodyDiameterMm } = entry
  const metal = headAndThread({
    head,
    headDiameterMm,
    headTopDiameterMm: bodyDiameterMm,
    headHeightMm,
    threadDiameterMm: bodyDiameterMm,
    lengthMm: length,
    segments,
  })

  const fits = entry.fitDiameterMm
  if (fits === undefined) {
    if (fit !== undefined) {
      throw new Error(`hardware.bolt: ${type} ${spec} has no fit data, so it takes no fit — got "${fit}"`)
    }
    return metal
  }
  const chosen = fit ?? defaultFitFor(type)
  const holeMm = Object.hasOwn(fits, chosen) ? fits[chosen] : undefined
  if (typeof holeMm !== 'number') {
    throw new Error(`hardware.bolt: unknown fit "${chosen}", expected one of ${Object.keys(fits).join(' | ')}`)
  }

  // A bolt grows its head by the fit's own clearance (V1 `bolt[fit] - bolt.E`). A wood
  // screw's head always passes through the piece being fastened down, so it grows by the
  // `clearance` hole's clearance whichever pilot the thread gets.
  const growthMm = (type === 'woodPan' || type === 'woodFlat' ? fits.clearance : holeMm) - bodyDiameterMm
  const tapHeadHeightMm = headHeightMm + growthMm

  return [
    ...metal,
    ...headAndThread({
      head,
      headDiameterMm: headDiameterMm + growthMm,
      headTopDiameterMm: bodyDiameterMm + growthMm,
      headHeightMm: tapHeadHeightMm,
      // The hole itself, not a growth of the thread: a pilot is narrower than the thread.
      threadDiameterMm: holeMm,
      lengthMm: length,
      prefix: 'tap-',
      hidden: true,
      headColor: 'red',
      threadColor: 'red',
      segments,
    }),
    ...placed({
      id: 'tap-headClearSpace',
      op: 'primitive.cylinder',
      params:
        segments === undefined
          ? { diameter: headDiameterMm + growthMm, height: length }
          : { diameter: headDiameterMm + growthMm, height: length, segments },
      heightMm: length,
      // Tops flush with the clearance head, as on a bolt.
      baseZMm: tapHeadHeightMm - length,
      name: 'tap-headClearSpace',
      hidden: true,
      v1Color: 'red',
    }),
    {
      id: 'tap',
      op: 'boolean.union',
      params: {},
      operands: ['tap-head', 'tap-thread'],
      name: 'tap',
      hidden: true,
      ...v1ColorToRecord('red'),
    },
  ]
}

/**
 * The socket/hex bolt — the original `hardware.bolt` expansion, byte for byte.
 *
 * @param {object} params
 * @param {string} params.spec Key into `tables.boltSpecs`, e.g. `'m10 hex'`.
 * @param {number} params.length Thread length in millimetres; must be positive.
 * @param {string} [params.fit] Clearance class — `'tap'`, `'close'` or `'loose'`,
 *   default `'loose'` (V1's `Hardware.Bolt` default). Typed as a plain string because
 *   it arrives from untrusted document JSON and is validated below, not by the type.
 * @param {number} [params.segments] Cylinder segment count. Omitted: the design
 *   resolution decides (`TODO/core-035`).
 * @param {{ boltSpecs: Readonly<Record<string, BoltSpec>> }} tables Size tables.
 * @returns {OpRecord[]} Op records in the same schema the document stores.
 */
function machineBolt(params, tables) {
  const { spec, length, fit = 'loose', segments } = params

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
      v1Color: 'gray',
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
      v1Color: 'silver',
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
      v1Color: 'red',
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
      v1Color: 'red',
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
      v1Color: 'red',
      segments,
    }),
    {
      id: 'tap',
      op: 'boolean.union',
      params: {},
      operands: ['tap-head', 'tap-thread'],
      name: 'tap',
      hidden: true,
      ...v1ColorToRecord('red'),
    },
  ]
}
