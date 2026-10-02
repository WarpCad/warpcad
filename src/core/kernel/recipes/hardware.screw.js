// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `hardware.screw` composite recipe.
 *
 * A composite recipe builds no geometry; it expands `params` into an array of *other*
 * op records that the same fold every other op replays through evaluates. See
 * `hardware.bolt.js`'s module doc for the fuller explanation this file leans on, and
 * for the base-on-`z = 0` vs centred-primitive translate every prism here follows.
 *
 * ## What it reproduces
 *
 * `jscad-hardware@1.1.0`'s `Hardware.Screw.PanHead(type, length, fit, options)` and
 * `Hardware.Screw.FlatHead(...)` (`jscad-hardware.jscad:85-108`), which destructure
 * `[headDiameter, headLength, diameter, tap, countersink] = type` and hand off to
 * `PanHeadScrew`/`FlatHeadScrew` → `CreateScrew`:
 *
 * ```js
 * // PanHeadScrew                        // FlatHeadScrew
 * head   = Parts.Cylinder(hd, hl)        head   = Parts.Cone(hd, d, hl)
 * thread = Parts.Cylinder(d, length)     thread = Parts.Cylinder(d, length)
 * clear  = clearLength && Parts.Cylinder(hd, clearLength)   // both variants
 * // CreateScrew: head gray; thread silver, snapped 'outside-' onto the head;
 * //   headClearSpace red, hidden, snapped 'inside+' against the head.
 * ```
 *
 * ## Divergences from the TODO's premise (`TODO/core-027`)
 *
 * - **`FlatHead` has no countersink boolean cut.** The task expected one; the real
 *   source builds the head as `Parts.Cone(headDiameter, diameter, headLength)` — a
 *   tapered head solid, wide end on `z = 0` narrowing to the shank diameter where the
 *   thread starts. The `countersink` tuple slot is destructured and never read (and no
 *   real table entry has one). So this is a `primitive.cone` with `topDiameter`, no
 *   new kernel step. The recess a *host* part needs is what the hidden
 *   `headClearSpace` is for, subtracted with `{ id, pieces: 'headClearSpace' }`.
 * - **`fit` does not exist.** `Screw.*` accept a `fit` argument and never read it, so
 *   there is no `tap-*` clearance solid as on `hardware.bolt`, and no `fit` param here.
 * - **`hex` is not offered.** `HexHead` is commented out in V1's `Screw` object; only
 *   `PanHead` and `FlatHead` exist. `head` is a param because V1 picks the head with
 *   the *call* (`Screw.PanHead` vs `Screw.FlatHead`), not with the size table.
 * - **`orientation: 'down'` is not ported.** `CreateScrew` also supports it (head
 *   `outside+`, and `FlatHeadScrew` swaps the cone ends); nothing asked for it, and
 *   `transform.rotate` on a placed screw covers the use.
 *
 * ## BOM key convention (for `TODO/ui-038`; nothing reads it yet)
 *
 * The task recorded a `` `Pan Head Screw ${name}` `` key. It is not in
 * `jscad-hardware@1.1.0`: `Screw.PanHead`/`.FlatHead` take **no** `BOM` argument and
 * write nothing. Only `Hardware.Bolt(length, bolt, fit, BOM)` tracks a bill of
 * materials, under `` `${bolt.name} - ${util.cm(length).toFixed(2)}` `` — the spec name
 * plus the length in **centimetres**, two decimals. A V3 BOM for screws therefore has
 * no V1 key to inherit: `ui-038` should build one from `{ head, spec, length }`
 * (`hardware.screw` params), and may reuse the bolt's `name - length` shape if it wants
 * the two families to sort together. Deriving it from the params keeps it out of the
 * document, per "geometry is derived, never persisted".
 *
 * ## Colours
 *
 * Gray head, silver thread, red `headClearSpace`, each measured from V1's own output
 * in `hardware.screw.v1-reference.json`.
 *
 * @module core/kernel/recipes/hardware.screw
 */

import { v1ColorToRecord } from '../colors.js'

/** @typedef {import('../tables/screw-specs.js').ScrewSpec} ScrewSpec */
/** @typedef {import('../registry.js').OpRecord} OpRecord */

/**
 * The head styles V1's `Hardware.Screw` offered, in the order the Inspector lists them.
 *
 * @type {readonly string[]}
 */
export const SCREW_HEADS = Object.freeze(['PanHead', 'FlatHead'])

/**
 * Emit the two records that place one solid with its base at `baseZMm`: the centred V3
 * primitive, then the translate that lifts it.
 *
 * @param {object} args
 * @param {string} args.id
 * @param {string} args.op A `primitive.*` op name.
 * @param {Record<string, number>} args.params The primitive's own params.
 * @param {number} args.heightMm Same as `params.height`; repeated for the lift.
 * @param {number} args.baseZMm Where the bottom face lands, in millimetres.
 * @param {string} args.name
 * @param {boolean} [args.hidden]
 * @param {string} args.v1Color
 * @returns {OpRecord[]}
 */
function placed({ id, op, params, heightMm, baseZMm, name, hidden, v1Color }) {
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
 * Expand a `hardware.screw` document line into the op records that define it.
 *
 * Cylinder segment counts are not emitted; the design resolution decides
 * (`TODO/core-035`, see `hardware.bolt.js`).
 *
 * @param {object} params
 * @param {string} params.spec Key into `tables.screwSpecs`, e.g. `'m4'` or `'#8'`.
 * @param {number} params.length Thread length in millimetres; must be positive.
 * @param {string} [params.head] `'PanHead'` (default) or `'FlatHead'`. A plain string
 *   because it arrives from untrusted document JSON and is validated below.
 * @param {number} [params.clearLength] Length of the hidden `headClearSpace`, in
 *   millimetres. Omitted, there is no such part (V1's `options.clearLength`).
 * @param {{ screwSpecs: Readonly<Record<string, ScrewSpec>> }} tables Size tables.
 * @returns {OpRecord[]}
 */
export function screw(params, tables) {
  const { spec, length, head = 'PanHead', clearLength } = params

  const entry = tables.screwSpecs[spec]
  if (!entry) {
    throw new Error(
      `hardware.screw: unknown spec "${spec}", expected one of ` +
        Object.keys(tables.screwSpecs).join(' | ')
    )
  }
  if (!SCREW_HEADS.includes(head)) {
    throw new Error(
      `hardware.screw: unknown head "${head}", expected one of ${SCREW_HEADS.join(' | ')}`
    )
  }
  if (typeof length !== 'number' || !Number.isFinite(length) || length <= 0) {
    throw new Error(`hardware.screw: length must be a positive number of millimetres, got ${length}`)
  }
  if (
    clearLength !== undefined &&
    (typeof clearLength !== 'number' || !Number.isFinite(clearLength) || clearLength <= 0)
  ) {
    throw new Error(
      `hardware.screw: clearLength must be a positive number of millimetres, got ${clearLength}`
    )
  }

  const { headDiameterMm, headHeightMm, bodyDiameterMm } = entry

  /** @type {{ op: string, params: Record<string, number> }} */
  const headSolid =
    head === 'FlatHead'
      ? { op: 'primitive.cone', params: { diameter: headDiameterMm, topDiameter: bodyDiameterMm, height: headHeightMm } }
      : { op: 'primitive.cylinder', params: { diameter: headDiameterMm, height: headHeightMm } }

  return [
    ...placed({ id: 'head', ...headSolid, heightMm: headHeightMm, baseZMm: 0, name: 'head', v1Color: 'gray' }),
    ...placed({
      id: 'thread',
      op: 'primitive.cylinder',
      params: { diameter: bodyDiameterMm, height: length },
      heightMm: length,
      // thread.snap(head, 'z', 'outside-') resolves to exactly this.
      baseZMm: headHeightMm,
      name: 'thread',
      v1Color: 'silver',
    }),
    ...(clearLength === undefined
      ? []
      : placed({
          id: 'headClearSpace',
          op: 'primitive.cylinder',
          params: { diameter: headDiameterMm, height: clearLength },
          heightMm: clearLength,
          // headClearSpace.snap(head, 'z', 'inside+'): tops flush.
          baseZMm: headHeightMm - clearLength,
          name: 'headClearSpace',
          hidden: true,
          v1Color: 'red',
        })),
  ]
}
