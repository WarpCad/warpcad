// SPDX-License-Identifier: AGPL-3.0-or-later
/*
 * Dev-only table generator — NOT part of the app, NOT imported by src/.
 *
 * Reads `jscad-hardware@5.0.0`'s own source (`src/metric.js`, `src/imperial.js`),
 * pulls the tab/space-separated data strings out of it by name, and writes frozen
 * static JS to `src/core/kernel/tables/hardware-tables.generated.js`, so the app never
 * runs V1's `.split('\n').reduce(...)` string parser or depends on `@jwc/jscad-utils`
 * (TODO/core-052).
 *
 * Run with:  node scripts/generate-hardware-tables.mjs [path/to/jscad-hardware]
 * Default:   ~/src/jscad/jscad-hardware
 *
 * Deliberate deviations from V1's own parsing (each also printed when it fires):
 *
 *  - Imperial socket sizes `#0`..`#10` look up `ScrewTapSizes['#n']`. V1 looked up the
 *    bare `'n'`, always missed, and fell back to the *head* diameter for tap/close/loose.
 *  - Every fallback uses the bolt's own body diameter `E` (V1's imperial socket used `D`).
 *  - `m100 hex` is dropped: V1's row gives a 90 mm body for an m100.
 *
 * Shipped set: metric through m20 (where V1's tap table and washer table both end, so
 * every shipped metric row has real fit data), imperial through 1" (where V1's nut table
 * ends). Anything dropped for lack of data is listed on stderr.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const root = process.argv[2] ?? join(homedir(), 'src/jscad/jscad-hardware')
const metric = readFileSync(join(root, 'src/metric.js'), 'utf8')
const imperial = readFileSync(join(root, 'src/imperial.js'), 'utf8')

const MM_PER_INCH = 25.4
const round = (/** @type {number} */ n) => Number(n.toFixed(4))
const inch = (/** @type {number} */ n) => round(n * MM_PER_INCH)

/** The template literal assigned to `const|export const <name> =`. */
function block(/** @type {string} */ src, /** @type {string} */ name) {
  const m = src.match(new RegExp(`(?:export )?const ${name} = \`([^\`]*)\``))
  if (!m) throw new Error(`could not find ${name} in source`)
  return m[1].split('\n')
}

/** V1 `parseImperial`: `1-1/8`, `5/32`, `1`, `.438` → inches. */
function frac(/** @type {string} */ field) {
  const f = field.trim().replace(/"/g, '')
  let m = f.match(/^(\d+)-(\d+)\/(\d+)$/)
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3])
  m = f.match(/^(\d+)\/(\d+)$/)
  if (m) return Number(m[1]) / Number(m[2])
  return parseFloat(f)
}

const flagged = []
const dropped = []

// --- metric ---------------------------------------------------------------------
const metricTap = {}
for (const line of block(metric, 'ScrewTapSizes')) {
  const p = line.split(' ')
  metricTap[p[0]] = { tap: parseFloat(p[2]), close: parseFloat(p[6]), loose: parseFloat(p[8]) }
}
const METRIC_MAX = 20
const metricSize = (/** @type {string} */ k) => parseFloat(k.slice(1))

/** @type {Record<string, object>} */
const bolts = {}
/** @param {string} size @param {number} body */
function metricFit(size, body, key) {
  const t = metricTap[size]
  if (t) return t
  flagged.push(`${key}: no ScrewTapSizes row, fit diameters fall back to body diameter`)
  return { tap: body, close: body, loose: body }
}

for (const line of block(metric, 'MetricHexBoltDimensions')) {
  const p = line.split('\t')
  const key = `${p[0]} hex`
  if (p[0] === 'm100') { dropped.push(`${key}: V1 row has body diameter 90`); continue }
  if (metricSize(p[0]) > METRIC_MAX) { dropped.push(`${key}: above m${METRIC_MAX}`); continue }
  const body = parseFloat(p[1])
  bolts[key] = {
    type: 'HexHeadScrew', bodyDiameterMm: body, headDiameterMm: parseFloat(p[7]),
    headHeightMm: parseFloat(p[3]), fitDiameterMm: metricFit(p[0], body, key),
  }
}
for (const line of block(metric, 'SocketCapScrewDimensions')) {
  const p = line.split(' ')
  const key = `${p[0]} socket`
  if (metricSize(p[0]) > METRIC_MAX) { dropped.push(`${key}: above m${METRIC_MAX}`); continue }
  const body = parseFloat(p[1])
  bolts[key] = {
    type: 'PanHeadScrew', bodyDiameterMm: body, headDiameterMm: parseFloat(p[3]),
    headHeightMm: parseFloat(p[5]), fitDiameterMm: metricFit(p[0], body, key),
  }
}

// --- imperial -------------------------------------------------------------------
const impTap = {}
block(imperial, 'ScrewTapSizes').forEach((line, i) => {
  const p = line.split('\t')
  impTap[`${i < 10 ? '#' : ''}${p[0]}`] = {
    major: parseFloat(p[1]), tap: inch(parseFloat(p[5])), close: inch(parseFloat(p[9])), loose: inch(parseFloat(p[11])),
  }
})
const IMPERIAL_MAX_IN = 1
const nutKeys = new Set(block(imperial, 'ImperialNuts').map((l) => `${l.split('\t')[0]} hex`))
function impFit(/** @type {string} */ size, /** @type {number} */ bodyMm, /** @type {string} */ key) {
  const t = impTap[size]
  if (t) return { tap: t.tap, close: t.close, loose: t.loose }
  flagged.push(`${key}: no ScrewTapSizes row, fit diameters fall back to body diameter`)
  return { tap: bodyMm, close: bodyMm, loose: bodyMm }
}
for (const line of block(imperial, 'HexBoltDimensions')) {
  const p = line.split('\t')
  const key = `${p[0]} hex`
  if (frac(p[0]) > IMPERIAL_MAX_IN) { dropped.push(`${key}: above 1"`); continue }
  const body = inch(frac(p[0]))
  bolts[key] = {
    type: 'HexHeadScrew', bodyDiameterMm: body, headDiameterMm: inch(parseFloat(p[4])),
    headHeightMm: inch(frac(p[6])), fitDiameterMm: impFit(p[0], body, key),
  }
}
block(imperial, 'SocketCapScrewDimensions').forEach((line, i) => {
  const p = line.split('\t')
  const size = `${i < 9 ? '#' : ''}${p[0]}`
  const key = `${size} socket`
  const body = inch(parseFloat(p[1]))
  if (parseFloat(p[1]) > IMPERIAL_MAX_IN) { dropped.push(`${key}: above 1"`); return }
  if (!nutKeys.has(`${size} hex`)) { dropped.push(`${key}: V1 ImperialNuts has no ${size} row`); return }
  bolts[key] = {
    type: 'PanHeadScrew', bodyDiameterMm: body, headDiameterMm: inch(parseFloat(p[3])),
    headHeightMm: inch(parseFloat(p[5])), fitDiameterMm: impFit(size, body, key),
  }
})

// --- imperial nuts (boltdepot, via V1's own derivation) ----------------------------
/** @type {Record<string, object>} */
const nuts = {}
for (const line of block(imperial, 'ImperialNuts')) {
  const p = line.split('\t')
  const flats = frac(p[1] === '-' ? p[2] : p[1])
  const height = frac(p[3] === '-' ? p[6] : p[3])
  const flatsMm = inch(flats)
  nuts[`${p[0]} hex`] = {
    acrossFlatsMm: flatsMm,
    acrossCornersMm: round(flatsMm / (Math.sqrt(3) / 2)),
    heightMm: inch(height),
    // V1 stored cornerDiameter/2 here, a placeholder its own comment calls "not the
    // hole diameter". Nothing reads this field; the nominal major diameter is truthful.
    threadDiameterMm: inch(impTap[p[0]].major),
  }
}

// --- metric washers (V1 MetricWashers, M1..M20) -----------------------------------
/** @type {Record<string, object>} */
const washers = {}
for (const line of block(metric, 'MetricWashers')) {
  const [size, id, od, t] = line.replace(/mm/g, '').split('\t')
  washers[size.toLowerCase()] = { idMm: parseFloat(id), odMm: parseFloat(od), thicknessMm: parseFloat(t) }
}

const out = `// SPDX-License-Identifier: AGPL-3.0-or-later
// GENERATED by scripts/generate-hardware-tables.mjs from jscad-hardware@5.0.0 — do not edit.
// All values millimetres. See bolt-specs.js / nut-specs.js / washer-specs.js for how these
// are merged with the hand-pinned rows and ordered.

/** @type {Readonly<Record<string, import('./bolt-specs.js').BoltSpec>>} */
export const generatedBoltSpecs = ${JSON.stringify(bolts, null, 2)}

/** @type {Readonly<Record<string, import('./nut-specs.js').NutSpec>>} */
export const generatedImperialNutSpecs = ${JSON.stringify(nuts, null, 2)}

/** @type {Readonly<Record<string, import('./washer-specs.js').WasherSpec>>} */
export const generatedMetricWasherSpecs = ${JSON.stringify(washers, null, 2)}

/** Rows whose fit diameters fell back to the body diameter (none are shipped). */
/** @type {string[]} */
export const generatedFallbackRows = ${JSON.stringify(flagged)}
`
writeFileSync(join(import.meta.dirname, '../src/core/kernel/tables/hardware-tables.generated.js'), out)
console.error(`bolts: ${Object.keys(bolts).length}, imperial nuts: ${Object.keys(nuts).length}, metric washers: ${Object.keys(washers).length}`)
console.error('fallback rows shipped:', flagged.length ? flagged : 'none')
console.error('dropped:', dropped)
