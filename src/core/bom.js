// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The Bill of Materials tally (`TODO/ui-038`) — placed hardware, kit and Raspberry Pi
 * bodies grouped by what they *are*, counted.
 *
 * Pure derived state, never persisted ("geometry is derived, never persisted", and so is
 * everything read off it): it reads the plain-data body summaries the scene already
 * announces, so it cannot disagree with the picture and needs no document-model field.
 *
 * ## The key
 *
 * `jscad-hardware@1.1.0` tracks `Hardware.Bolt` under `${spec.name} - ${length}`, and gave
 * screws no key at all (see `recipes/hardware.screw.js`'s module doc), so every family's key
 * is derived here from its own identifying params instead. `fit` is deliberately left out:
 * it grows the hidden clearance solid, not the physical part, so a loose and a tight M4×12
 * bolt are one line on a shopping list.
 *
 * `hardware.bolt` is the one fastener op since `TODO/core-060` — a **Type** and a bare
 * **Size** — and its detail reads `M2.5 socket × 8 mm`, `M3 flat × 10 mm`,
 * `#8 wood flat × 25 mm`. It is computed from the params read in the new shape
 * (`normalizedParams`), so a saved `{ spec: 'm2.5 socket' }` and a new
 * `{ type: 'socket', spec: 'm2.5' }` of one length are one line. A replay-only
 * `hardware.screw` keeps its own line and label.
 *
 * ## Bought split hardware (`TODO/core-075`)
 *
 * A split with **Steel or filament dowels** needs things bought that are not bodies: the body
 * summary carries them as `hardware` (from the split group's part metadata, `hardwareOf`), and
 * each becomes a line — `Steel dowel pin Ø4 × 10 mm` or `1.75 mm filament Ø1.75 × 4.5 mm
 * lengths`. Printed dowels are not listed: they are printed parts, in the Print pieces zip.
 *
 * @module core/bom
 */

import { normalizedParams, registry } from './kernel/registry.js'

/**
 * The op namespaces a BOM lists. Primitives, text labels and booleans are shapes, not
 * parts someone buys or prints a second of.
 */
const PART_NAMESPACES = Object.freeze(['hardware', 'kit', 'raspberrypi'])

/**
 * @typedef {object} BomRow
 * @property {string} key Stable grouping key — op plus detail.
 * @property {string} op Registry key of the family, e.g. `hardware.bolt`.
 * @property {string} label Human family name, e.g. `Bolt`.
 * @property {string} detail What distinguishes this line within its family, e.g.
 *   `M4 × 12 mm`. Empty for a family with nothing to vary (a HAT).
 * @property {number} count
 */

/** @param {string} spec @returns {string} `m10 hex` → `M10 hex`. */
function specLabel(spec) {
  return spec.length > 0 ? spec[0].toUpperCase() + spec.slice(1) : spec
}

/**
 * How a fastener Type reads in a BOM detail, after the size. Socket and hex keep exactly
 * the suffix their legacy `spec` carried, so a saved bolt's line does not change.
 *
 * @type {Readonly<Record<string, string>>}
 */
const FASTENER_TYPE_WORDS = Object.freeze({
  socket: 'socket',
  hex: 'hex',
  pan: 'pan',
  flat: 'flat',
  woodPan: 'wood pan',
  woodFlat: 'wood flat',
})

/** @param {unknown} value @returns {value is number} */
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)

/**
 * The identifying detail for one body, by its params. A pure function of params, so two
 * bodies with equal detail are interchangeable parts.
 *
 * @param {string} op
 * @param {Record<string, any>} params
 * @returns {string}
 */
export function detailOf(op, params) {
  const spec = typeof params.spec === 'string' ? specLabel(params.spec) : ''
  const length = isNumber(params.length) ? `× ${params.length} mm` : ''
  switch (op) {
    case 'hardware.bolt': {
      const normal = normalizedParams(op, params)
      const size = typeof normal.spec === 'string' ? specLabel(normal.spec) : ''
      const type = typeof normal.type === 'string' && Object.hasOwn(FASTENER_TYPE_WORDS, normal.type) ? FASTENER_TYPE_WORDS[normal.type] : ''
      return [size, type, length].filter(Boolean).join(' ')
    }
    case 'hardware.screw':
      return [spec, params.head, length].filter(Boolean).join(' ')
    case 'kit.board':
    case 'kit.anchor':
      return isNumber(params.width) && isNumber(params.height) ? `${params.width} × ${params.height} mm` : ''
    case 'kit.phone':
      return isNumber(params.width) && isNumber(params.length)
        ? `${params.width} × ${params.length} mm`
        : ''
    case 'kit.boardFrame':
      return isNumber(params.outerWidth) && isNumber(params.outerHeight)
        ? `${params.outerWidth} × ${params.outerHeight} mm`
        : ''
    default:
      if (params.model !== undefined) return `Model ${params.model}`
      return [spec, length].filter(Boolean).join(' ')
  }
}

/**
 * Family name for an op: the registry's Library label where it has one, else the
 * capitalised op tail (`hardware.screw`, replay-only since `TODO/core-060`, has no `ui`
 * block, so it keeps reading **Screw**).
 *
 * @param {string} op
 * @returns {string}
 */
function labelOf(op) {
  const label = registry[op]?.ui?.label
  if (typeof label === 'string') return label
  const tail = op.slice(op.indexOf('.') + 1)
  return tail[0].toUpperCase() + tail.slice(1)
}

/**
 * What one body adds to the tally: itself, or — for a linked Repeat (`TODO/core-061`) — one
 * copy of its source per member actually built. A broken member, or one its own condition has
 * switched off, is not drawn and is not counted.
 *
 * @param {{ op: string, params?: Record<string, any>, repeat?: { sourceOp: string, sourceParams: Record<string, any>, members: readonly string[] } }} body
 * @returns {{ op: string, params: Record<string, any>, count: number }}
 */
function tallyOf(body) {
  if (body.repeat !== undefined) {
    return { op: body.repeat.sourceOp, params: body.repeat.sourceParams ?? {}, count: body.repeat.members.length }
  }
  return { op: body.op, params: body.params ?? {}, count: 1 }
}

/**
 * One bought item's BOM label and detail (`TODO/core-075`).
 *
 * @param {import('./kernel/group.js').HardwareItem} item
 * @returns {{ label: string, detail: string }}
 */
function hardwareLine(item) {
  if (item.stock === 'filament') return { label: '1.75 mm filament', detail: `Ø${item.diameterMm} × ${item.lengthMm} mm lengths` }
  return { label: 'Steel dowel pin', detail: `Ø${item.diameterMm} × ${item.lengthMm} mm` }
}

/**
 * Tally bodies into BOM rows, in first-placed order.
 *
 * @param {readonly { op: string, params?: Record<string, any>, repeat?: { sourceOp: string, sourceParams: Record<string, any>, members: readonly string[] }, hardware?: readonly import('./kernel/group.js').HardwareItem[] }[]} bodies
 *   `hardware`: what a split body needs bought (`TODO/core-075`).
 * @returns {BomRow[]}
 */
export function tallyBom(bodies) {
  /** @type {Map<string, BomRow>} */
  const rows = new Map()
  for (const body of bodies) {
    for (const item of body.hardware ?? []) {
      const { label, detail } = hardwareLine(item)
      const key = `stock.${item.item}|${item.stock}|${detail}`
      const row = rows.get(key)
      if (row) row.count += item.count
      else rows.set(key, { key, op: 'modify.splitWithJoint', label, detail, count: item.count })
    }
    const { op, params, count } = tallyOf(body)
    if (count === 0 || !PART_NAMESPACES.includes(op.split('.')[0])) continue
    const detail = detailOf(op, params)
    const key = `${op}|${detail}`
    const row = rows.get(key)
    if (row) row.count += count
    else rows.set(key, { key, op, label: labelOf(op), detail, count })
  }
  return [...rows.values()]
}
