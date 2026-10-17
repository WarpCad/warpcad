// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The head-and-thread builder `hardware.screw` and `hardware.bolt`'s pan, flat and wood
 * Types share (TODO/core-060).
 *
 * Extracted from `hardware.screw.js` without changing a byte of its output — the
 * `__fixtures__/fasteners.legacy-oracle.json` oracle, pinned before the move, holds it to
 * that. Like every composite helper it builds nothing: it emits op records, each a
 * centred V3 primitive followed by the `transform.translate` that lifts its base to
 * where `jscad-utils` put it (see `hardware.bolt.js`'s module doc for that centring
 * difference).
 *
 * The geometry is V1's `PanHeadScrew` / `FlatHeadScrew` → `CreateScrew`
 * (`jscad-hardware@1.1.0`, quoted in `hardware.screw.js`): a cylinder head, or a cone
 * head wide end on `z = 0` narrowing to `headTopDiameterMm`, then a thread cylinder
 * snapped `outside-` onto the head, so it runs up from the head's top.
 *
 * @module core/kernel/recipes/fastener-geometry
 */

import { v1ColorToRecord } from '../colors.js'

/** @typedef {import('../registry.js').OpRecord} OpRecord */

/**
 * A head style: V1's two `Screw` heads, by the names `hardware.screw` stores.
 *
 * @typedef {'PanHead' | 'FlatHead'} ScrewHead
 */

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
export function placed({ id, op, params, heightMm, baseZMm, name, hidden, v1Color }) {
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
 * `params` with an explicit segment count added when one was asked for — omitted, the
 * design resolution decides (`TODO/core-035`).
 *
 * @param {Record<string, number>} params
 * @param {number | undefined} segments
 * @returns {Record<string, number>}
 */
function withSegments(params, segments) {
  return segments === undefined ? params : { ...params, segments }
}

/**
 * The head solid for a style: a cylinder (`PanHead`), or a cone (`FlatHead`) from
 * `headDiameterMm` on `z = 0` to `headTopDiameterMm` at the head's top.
 *
 * @param {ScrewHead} head
 * @param {{ headDiameterMm: number, headTopDiameterMm: number, headHeightMm: number, segments?: number }} size
 * @returns {{ op: string, params: Record<string, number> }}
 */
export function headSolid(head, { headDiameterMm, headTopDiameterMm, headHeightMm, segments }) {
  return head === 'FlatHead'
    ? {
        op: 'primitive.cone',
        params: withSegments({ diameter: headDiameterMm, topDiameter: headTopDiameterMm, height: headHeightMm }, segments),
      }
    : { op: 'primitive.cylinder', params: withSegments({ diameter: headDiameterMm, height: headHeightMm }, segments) }
}

/**
 * A head and its thread, as `CreateScrew` lays them out: the head's base on `z = 0`, the
 * thread from the head's top up for `lengthMm`.
 *
 * @param {object} args
 * @param {ScrewHead} args.head
 * @param {number} args.headDiameterMm
 * @param {number} args.headTopDiameterMm The cone's narrow end; read only for `FlatHead`.
 * @param {number} args.headHeightMm
 * @param {number} args.threadDiameterMm
 * @param {number} args.lengthMm Thread length.
 * @param {string} [args.prefix] Prepended to both ids and names (`'tap-'` for a clearance
 *   solid). Default none.
 * @param {boolean} [args.hidden]
 * @param {string} [args.headColor] V1 colour name; default `'gray'`.
 * @param {string} [args.threadColor] V1 colour name; default `'silver'`.
 * @param {number} [args.segments] Explicit segment count; omitted, the resolution decides.
 * @returns {OpRecord[]}
 */
export function headAndThread({
  head,
  headDiameterMm,
  headTopDiameterMm,
  headHeightMm,
  threadDiameterMm,
  lengthMm,
  prefix = '',
  hidden,
  headColor = 'gray',
  threadColor = 'silver',
  segments,
}) {
  return [
    ...placed({
      id: `${prefix}head`,
      ...headSolid(head, { headDiameterMm, headTopDiameterMm, headHeightMm, segments }),
      heightMm: headHeightMm,
      baseZMm: 0,
      name: `${prefix}head`,
      hidden,
      v1Color: headColor,
    }),
    ...placed({
      id: `${prefix}thread`,
      op: 'primitive.cylinder',
      params: withSegments({ diameter: threadDiameterMm, height: lengthMm }, segments),
      heightMm: lengthMm,
      // thread.snap(head, 'z', 'outside-') resolves to exactly this.
      baseZMm: headHeightMm,
      name: `${prefix}thread`,
      hidden,
      v1Color: threadColor,
    }),
  ]
}
