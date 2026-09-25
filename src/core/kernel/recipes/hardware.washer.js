/**
 * The `hardware.washer` composite recipe.
 *
 * A composite recipe builds no geometry; it expands `params` into an array of
 * *other* op records that the same fold every other op replays through evaluates
 * (`Initial design.md` §3, §4 — see `hardware.bolt.js`'s own module doc for the
 * fuller explanation this file leans on). Nothing here imports `@jscad/modeling`.
 *
 * ## What it reproduces
 *
 * `jscad-hardware@1.1.0`'s `Hardware.Washer(washer, fit)`:
 *
 * ```js
 * // jscad-hardware.jscad:56-79
 * Washer: function Washer(washer, fit) {
 *   var w = util.group();
 *   w.add(Parts.Tube(washer.od, washer.id, washer.thickness).color('gray'), 'washer');
 *   if (fit) {
 *     w.add(
 *       Parts.Cylinder(washer.od + Hardware.Clearances[fit], washer.thickness).color('red'),
 *       'clearance'
 *     );
 *   }
 *   return w;
 * }
 * ```
 *
 * Two-part group: `washer` (a Tube: `od`/`id`/`thickness`) always present, and an
 * optional `clearance` (a solid cylinder of `od + Hardware.Clearances[fit]` diameter,
 * same `thickness`) emitted **only when `fit` is truthy** — the one real conditional
 * in this recipe.
 *
 * ## V1 → V3 differences this expansion makes explicit
 *
 * **`clearance` is marked `hidden: true` here; V1's was a normal, visible red part.**
 * This is a deliberate divergence, not a silent copy of V1's behaviour — mirroring the
 * precedent `hardware.bolt.js`'s own `tap-*` parts already set (`TODO/core-001`):
 * scenario 5 (hidden-part boolean) needs a fastener's *real hole size* to drive a
 * Subtract, not its rendered metal. A washer's `clearance` part is the same kind of
 * geometry, so it is hidden here too.
 *
 * **Both parts keep V1's colours**: `washer` is `gray` and the hidden `clearance` is
 * `red`, exactly the `.color(...)` calls quoted above (`TODO/core-026`). The original
 * port dropped them without saying so; nothing decided to. Hidden and colour are
 * independent, as they were in V1, where the clearance was both red and visible.
 * `hardware.washer.spec.js` diffs both against the colours V1's real `.color()`
 * measurably left on each part (`scripts/generate-v1-washer-fixture.cjs`).
 *
 * `washer` reuses the registry's existing, tested `primitive.tube` op directly
 * (outer/inner diameter, thickness) rather than reimplementing outer-minus-inner as a
 * raw boolean the way V1's own `Parts.Tube` helper did internally.
 *
 * `primitive.tube`/`primitive.cylinder` are both centred on `params.center` (default
 * the origin) — the same convention every other `primitive.*` row in the registry
 * uses, unlike V1's `Parts.Tube`/`Parts.Cylinder` which build with their base on
 * `z = 0`. There is no second part here that a washer needs to sit flush against the
 * way a bolt's thread sits on its head, so nothing depends on matching V1's
 * base-at-zero placement — this is why `hardware.washer.spec.js`'s V1 diff compares
 * size and volume, not raw bounding-box position, the same choice `hardware.nut.js`
 * already made for the same reason.
 *
 * @module core/kernel/recipes/hardware.washer
 */

import { v1ColorToRecord } from '../colors.js'

/** @typedef {import('../tables/washer-specs.js').WasherSpec} WasherSpec */
/** @typedef {import('../registry.js').OpRecord} OpRecord */

const OP = 'hardware.washer'

/**
 * Expand a `hardware.washer` document line into the op records that define it.
 *
 * @param {object} params
 * @param {string} params.spec Key into `tables.washerSpecs`, e.g. `'m6'` or `'1/4'`.
 * @param {string} [params.fit] Clearance class — `'tap'`, `'close'` or `'loose'`.
 *   Optional, unlike `hardware.nut`'s required `fit`: V1's `Hardware.Washer` only
 *   emits a `clearance` part `if (fit)` is truthy, so an absent `fit` here is a valid,
 *   meaningful input (a washer with no clearance cylinder), not a rejected one.
 * @param {[number, number, number]} [params.center] Passed straight through to the
 *   underlying primitives' own `center` param; omitted entirely (letting the registry
 *   default apply) when not given.
 * @param {{ washerSpecs: Readonly<Record<string, WasherSpec>>, FIT_CLEARANCE_MM:
 *   Readonly<Record<string, number>> }} tables Size and clearance tables.
 * @returns {OpRecord[]} One or two records, in the same schema the document stores.
 */
export function washer(params, tables) {
  const { spec, fit, center } = params

  const entry = tables.washerSpecs[spec]
  if (!entry) {
    throw new Error(
      `${OP}: unknown spec "${spec}", expected one of ` +
        Object.keys(tables.washerSpecs).join(' | ')
    )
  }

  const centerParams = center !== undefined ? { center } : {}

  /** @type {OpRecord[]} */
  const records = [
    {
      id: 'washer',
      op: 'primitive.tube',
      params: {
        diameter: entry.odMm,
        innerDiameter: entry.idMm,
        height: entry.thicknessMm,
        ...centerParams,
      },
      name: 'washer',
      ...v1ColorToRecord('gray'),
    },
  ]

  if (fit !== undefined) {
    const clearanceMm = tables.FIT_CLEARANCE_MM[fit]
    if (typeof clearanceMm !== 'number') {
      throw new Error(
        `${OP}: unknown fit "${fit}", expected one of ` +
          Object.keys(tables.FIT_CLEARANCE_MM).join(' | ')
      )
    }

    records.push({
      id: 'clearance',
      op: 'primitive.cylinder',
      params: {
        diameter: entry.odMm + clearanceMm,
        height: entry.thicknessMm,
        ...centerParams,
      },
      name: 'clearance',
      hidden: true,
      ...v1ColorToRecord('red'),
    })
  }

  return records
}
