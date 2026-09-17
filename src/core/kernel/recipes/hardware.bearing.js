/**
 * The `hardware.bearing` composite recipe.
 *
 * A composite recipe builds no geometry; it expands `params` into an array of
 * *other* op records that the same fold every other op replays through evaluates
 * (`Initial design.md` §3, §4 — see `hardware.bolt.js`'s own module doc for the
 * fuller explanation this file leans on). Nothing here imports `@jscad/modeling`.
 *
 * ## What it reproduces
 *
 * Nothing — there is no V1 `Bearing` factory to port. `TODO/core-003`'s own spike
 * confirmed this directly against the vendored `jscad-hardware@1.1.0` source: its only
 * factories are `Bolt`, `Washer` and `Nut`; a case-insensitive search for "bearing"
 * across the package returns nothing (`docs/decisions/geometry-kernel.md`, Finding 2).
 * That spike's conclusion is what this recipe implements: *"Bearing is `composite`, not
 * `native`. Its geometry is an ordinary tube... It belongs beside Bolt/Nut/Washer as a
 * composite recipe once a spec table exists."* `tables/bearing-specs.js` is that table.
 *
 * ## Why this is the simplest of the four `hardware.*` recipes
 *
 * A bearing is structurally a `primitive.tube` with **no conditional second part**.
 * Unlike `washer` (an optional `clearance` cylinder `if (fit)`) or `nut` (a `fit`-driven
 * bore), there is no V1 `fit`/`Hardware.Clearances` concept to reproduce here — V1 has
 * no `Bearing` factory at all, so there is no `fit` parameter to port. `core-003`'s own
 * spike already showed mating needs no dedicated `clearance` part either: assembly
 * mating is bounding-box frame arithmetic, and `group.js`'s `snap`/`align` work
 * directly against the bearing's own tube bounds (*"verified against a 608 bearing
 * mated to a Ø8×40 shaft"*). So this recipe emits exactly one record, always.
 *
 * `primitive.tube` is centred on `params.center` (default the origin), the same
 * convention every other `primitive.*` row in the registry uses — same reasoning
 * `hardware.washer.js`'s own module doc gives for why no V1 base-at-zero placement
 * needs reproducing here either.
 *
 * @module core/kernel/recipes/hardware.bearing
 */

/** @typedef {import('../tables/bearing-specs.js').BearingSpec} BearingSpec */
/** @typedef {import('../registry.js').OpRecord} OpRecord */

const OP = 'hardware.bearing'

/**
 * Expand a `hardware.bearing` document line into the op record that defines it.
 *
 * @param {object} params
 * @param {string} params.spec Key into `tables.bearingSpecs`, e.g. `'608'` or `'6202'`.
 * @param {[number, number, number]} [params.center] Passed straight through to the
 *   underlying `primitive.tube`'s own `center` param; omitted entirely (letting the
 *   registry default apply) when not given.
 * @param {number} [params.segments] Passed straight through to the underlying
 *   `primitive.tube`'s own `segments` param; omitted entirely (letting
 *   `primitive.tube`'s own default apply) when not given.
 * @param {{ bearingSpecs: Readonly<Record<string, BearingSpec>> }} tables Size table.
 * @returns {OpRecord[]} Exactly one record, in the same schema the document stores.
 */
export function bearing(params, tables) {
  const { spec, center, segments } = params

  const entry = tables.bearingSpecs[spec]
  if (!entry) {
    throw new Error(
      `${OP}: unknown spec "${spec}", expected one of ` +
        Object.keys(tables.bearingSpecs).join(' | ')
    )
  }

  return [
    {
      id: 'bearing',
      op: 'primitive.tube',
      params: {
        diameter: entry.odMm,
        innerDiameter: entry.boreMm,
        height: entry.widthMm,
        ...(center !== undefined ? { center } : {}),
        ...(segments !== undefined ? { segments } : {}),
      },
      name: 'bearing',
    },
  ]
}
