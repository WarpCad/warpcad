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
 * @module core/bom
 */

import { registry } from './kernel/registry.js'

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
function detailOf(op, params) {
  const spec = typeof params.spec === 'string' ? specLabel(params.spec) : ''
  const length = isNumber(params.length) ? `× ${params.length} mm` : ''
  switch (op) {
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
 * capitalised op tail (`hardware.screw` has no `ui` block yet).
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
 * Tally bodies into BOM rows, in first-placed order.
 *
 * @param {readonly { op: string, params?: Record<string, any> }[]} bodies
 * @returns {BomRow[]}
 */
export function tallyBom(bodies) {
  /** @type {Map<string, BomRow>} */
  const rows = new Map()
  for (const body of bodies) {
    if (!PART_NAMESPACES.includes(body.op.split('.')[0])) continue
    const detail = detailOf(body.op, body.params ?? {})
    const key = `${body.op}|${detail}`
    const row = rows.get(key)
    if (row) row.count += 1
    else rows.set(key, { key, op: body.op, label: labelOf(body.op), detail, count: 1 })
  }
  return [...rows.values()]
}
