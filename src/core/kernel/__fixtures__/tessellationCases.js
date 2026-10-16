// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Test-only helper for `TODO/core-035`'s byte-identity oracle.
 *
 * Every placeable op the Library offers (each `choice` option included), every composite
 * the Library does not offer (`kit.*`), and the curve-bearing native ops a recipe or the
 * Operations toolbar emits — each built once, hashed polygon by polygon. The hashes in
 * `tessellation-legacy-golden.json` were captured from the code **before** `core-035`
 * existed, so "the `legacy` policy folds byte-identically to today" is checked against
 * the real old output, not against a second opinion of what it should have been.
 *
 * Framework-free and plain JS (a small non-cryptographic hash — an oracle against accidental
 * change, not against an adversary); never imported by the app.
 *
 * @module core/kernel/__fixtures__/tessellationCases
 */

import modeling from '@jscad/modeling'

import { isGroup } from '../group.js'
import { registry } from '../registry.js'

const { geometries } = modeling

/**
 * @typedef {object} TessellationCase
 * @property {string} key Stable name, the golden file's key.
 * @property {import('../registry.js').OpRecord[]} records Folded in order; the last one's
 *   value is what gets hashed.
 */

/** @returns {TessellationCase[]} */
export function tessellationCases() {
  /** @type {TessellationCase[]} */
  const cases = []
  for (const [op, entry] of Object.entries(registry)) {
    const ui = entry.ui
    if (!ui) continue
    const options = ui.choice ? ui.choice.options : [null]
    for (const option of options) {
      const params =
        option === null || !ui.choice ? { ...ui.defaults } : { ...ui.defaults, [ui.choice.param]: option.value }
      const suffix = option === null ? '' : `:${String(option.value)}`
      cases.push({ key: `${op}${suffix}`, records: [{ id: 'it', op, params }] })
    }
  }
  cases.push(
    { key: 'kit.board:explicit', records: [{ id: 'it', op: 'kit.board', params: { width: 85, height: 56, cornerRadius: 3, thickness: 1.6 } }] },
    {
      key: 'kit.boardFrame:explicit',
      records: [
        {
          id: 'it',
          op: 'kit.boardFrame',
          params: { outerWidth: 90, outerHeight: 60, innerWidth: 80, innerHeight: 50, cornerRadius: 3, thickness: 2 },
        },
      ],
    },
    {
      // core-057: the record exactly as the pre-model Library wrote it — eight numerics, no
      // `model`/`case`. Its golden digest is the one `kit.phone` held before the Library row
      // gained a model (hand-carried, not regenerated).
      key: 'kit.phone:legacy',
      records: [
        {
          id: 'it',
          op: 'kit.phone',
          params: {
            width: 77,
            length: 157,
            thickness: 9,
            cornerRadius: 12,
            plateauWidth: 74,
            plateauLength: 46,
            plateauHeight: 4,
            plateauCornerRadius: 10,
          },
        },
      ],
    },
    // core-058: the six per-screen ops lost their Library rows to `raspberrypi.screen`, so the
    // loop above no longer reaches them — but saved projects still replay them, so they keep
    // their cases under their old keys. `raspberrypi.screen:<model>` carries the same digest
    // as each (hand-carried, not regenerated): the dispatcher must not move a vertex.
    ...[
      'touchDisplay7inch',
      'touchScreen2',
      'miniPiTFT',
      'piTFT22',
      'piTFT24',
      'hyperPixel4Rectangular',
    ].map((model) => ({ key: `raspberrypi.${model}`, records: [{ id: 'it', op: `raspberrypi.${model}`, params: {} }] })),
    { key: 'kit.anchor:explicit', records: [{ id: 'it', op: 'kit.anchor', params: { width: 10, height: 10 } }] },
    { key: 'profile.roundedRectangle', records: [{ id: 'it', op: 'profile.roundedRectangle', params: { size: [30, 20], roundRadius: 4 } }] },
    { key: 'primitive.cylinder:d6', records: [{ id: 'it', op: 'primitive.cylinder', params: { diameter: 6, height: 10 } }] },
    { key: 'primitive.cylinder:d50', records: [{ id: 'it', op: 'primitive.cylinder', params: { diameter: 50, height: 10 } }] },
    {
      key: 'modify.filletRim:cube',
      records: [
        { id: 'cube', op: 'primitive.cuboid', params: { size: [40, 40, 40] } },
        { id: 'it', op: 'modify.filletRim', params: { radius: 5, orientation: 'z+' }, target: 'cube' },
      ],
    },
    {
      key: 'boolean.subtract:cube-bore',
      records: [
        { id: 'cube', op: 'primitive.cuboid', params: { size: [20, 20, 20] } },
        { id: 'bore', op: 'primitive.cylinder', params: { diameter: 6, height: 30 } },
        { id: 'it', op: 'boolean.subtract', params: {}, target: 'cube', operands: ['bore'] },
      ],
    }
  )
  return cases
}

/**
 * cyrb53: a fast 53-bit string hash with good avalanche. Two runs over identical polygon
 * JSON agree; any changed coordinate changes it.
 *
 * @param {string} text
 * @param {number} seed
 * @returns {string}
 */
function cyrb53(text, seed) {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

/**
 * A stable digest of a fold value: every polygon's every vertex, in order, for a solid;
 * for a Group, each named part's digest in part order (hidden parts included).
 *
 * @param {any} value
 * @returns {string}
 */
export function digestOf(value) {
  /** @type {string[]} */
  const chunks = []
  const hash = { update: (/** @type {string} */ text) => chunks.push(text) }
  /** @param {any} geometry */
  const feed = (geometry) => {
    const polygons = geometries.geom3.isA(geometry)
      ? geometries.geom3.toPolygons(geometry).map((polygon) => polygon.vertices.map((v) => Array.from(v)))
      : geometries.geom2.toSides(geometry).map((side) => side.map((v) => Array.from(v)))
    hash.update(JSON.stringify(polygons))
  }
  if (isGroup(value)) {
    for (const name of Object.keys(value.parts)) {
      hash.update(name)
      feed(value.parts[name])
    }
    for (const hole of value.holes) feed(hole)
  } else {
    feed(value)
  }
  const text = chunks.join('\u0000')
  return `${text.length}:${cyrb53(text, 1)}${cyrb53(text, 2)}`
}
