/**
 * The `hardware.nut` composite recipe.
 *
 * A composite recipe builds no geometry; it expands `params` into an array of
 * *other* op records that the same fold every other op replays through evaluates
 * (`Initial design.md` §3, §4 — see `hardware.bolt.js`'s own module doc for the
 * fuller explanation this file leans on). Nothing here imports `@jscad/modeling`.
 *
 * ## What it reproduces
 *
 * `jscad-hardware@1.1.0`'s `Hardware.Nut(nut, fit)`:
 *
 * ```js
 * // jscad-hardware.jscad:81-83
 * Nut: function Nut(nut, fit) {
 *   return Parts.Hexagon(nut[1] + Hardware.Clearances[fit], nut[2]);
 * }
 * ```
 *
 * Unlike `hardware.bolt`, V1's `Nut` returns one bare CSG, not a `Group` — no
 * head/thread/tap split, just a single hexagonal prism. So the expansion below is
 * one record, not `hardware.bolt.js`'s primitive-plus-translate pairs: nothing here
 * needs a second body to sit relative to, so there is no offset to bake into a
 * `transform.translate`.
 *
 * ## V1 → V3 differences this expansion makes explicit
 *
 * `Parts.Hexagon` builds its prism with its **base on `z = 0`**, the same
 * `jscad-utils` convention `hardware.bolt.js` documents. `primitive.hexagon` here
 * instead centres on `params.center` (default the origin), the same convention
 * every other `primitive.*` row in the registry uses — the one `src/core/
 * library.js`'s `paramsForDrop` already relies on for every base primitive a user
 * places. A standalone nut has no sibling part it needs to sit flush against the
 * way a bolt's thread sits on its head, so there is nothing here that depends on
 * matching V1's base-at-zero placement, and centring is what makes a placed nut
 * behave like every other draggable row rather than a one-off exception. This is
 * why the dimensional diff in `hardware.nut.spec.js` compares **size and volume**,
 * not raw bounding-box position, against the V1 reference fixture — V1 and V3
 * agree on how big the nut is and disagree, on purpose, about where its Z=0 sits.
 *
 * **No colour, on purpose** (checked for `TODO/core-026`): V1's `Hardware.Nut`, quoted
 * above, never calls `.color()`, and `scripts/generate-v1-nut-fixture.cjs`, which loads
 * V1's real `.color()`, measures the nut as uncoloured (`color: null`). With no call to
 * port, the record carries no `color` field, and `hardware.nut.spec.js` pins that.
 *
 * @module core/kernel/recipes/hardware.nut
 */

/** @typedef {import('../tables/nut-specs.js').NutSpec} NutSpec */
/** @typedef {import('../registry.js').OpRecord} OpRecord */

const OP = 'hardware.nut'

/**
 * Expand a `hardware.nut` document line into the op record that defines it.
 *
 * @param {object} params
 * @param {string} params.spec Key into `tables.nutSpecs`, e.g. `'m4'`.
 * @param {string} [params.fit] Clearance class — `'tap'`, `'close'` or `'loose'`.
 *   Required: unlike `hardware.bolt`'s `Hardware.Bolt`, V1's `Hardware.Nut` has no
 *   default fit (`fit = fit || 'loose'` appears only in `Bolt`), so this recipe
 *   doesn't invent one either — an omitted fit is rejected the same way an unknown
 *   one is, rather than silently defaulting.
 * @param {[number, number, number]} [params.center] Passed straight through to the
 *   underlying `primitive.hexagon`'s own `center` param; omitted entirely (letting
 *   the registry default apply) when not given.
 * @param {{ nutSpecs: Readonly<Record<string, NutSpec>>, FIT_CLEARANCE_MM:
 *   Readonly<Record<string, number>> }} tables Size and clearance tables.
 * @returns {OpRecord[]} A single-record expansion, in the same schema the
 *   document stores.
 */
export function nut(params, tables) {
  const { spec, fit, center } = params

  const entry = tables.nutSpecs[spec]
  if (!entry) {
    throw new Error(
      `${OP}: unknown spec "${spec}", expected one of ` + Object.keys(tables.nutSpecs).join(' | ')
    )
  }

  if (fit === undefined) {
    throw new Error(
      `${OP}: fit is required, expected one of ` +
        Object.keys(tables.FIT_CLEARANCE_MM).join(' | ')
    )
  }
  const clearanceMm = tables.FIT_CLEARANCE_MM[fit]
  if (typeof clearanceMm !== 'number') {
    throw new Error(
      `${OP}: unknown fit "${fit}", expected one of ` +
        Object.keys(tables.FIT_CLEARANCE_MM).join(' | ')
    )
  }

  return [
    {
      id: 'nut',
      op: 'primitive.hexagon',
      params: {
        diameter: entry.acrossCornersMm + clearanceMm,
        height: entry.heightMm,
        ...(center !== undefined ? { center } : {}),
      },
      name: 'nut',
    },
  ]
}
