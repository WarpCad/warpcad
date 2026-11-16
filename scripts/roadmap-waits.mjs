// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Fails when a `⏳ Waits on N` cell in TODO/ROADMAP.md names a row number that is not a
// row of the Next up table. Finished rows are deleted from that table, so their numbers
// vanish while other rows' cells keep pointing at them.
//
//   node scripts/roadmap-waits.mjs        (also: npm run roadmap:check)

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Expand "14", "14, 15" and "14–19" into row numbers.
 * @param {string} text the part of a cell after "Waits on"
 * @returns {number[]}
 */
export function parseRowRefs(text) {
  /** @type {number[]} */
  const out = []
  for (const part of text.split(',')) {
    const m = part.trim().match(/^(\d+)(?:\s*[–-]\s*(\d+))?/)
    if (!m) continue
    const lo = Number(m[1])
    const hi = m[2] ? Number(m[2]) : lo
    for (let n = lo; n <= hi; n++) out.push(n)
  }
  return out
}

/**
 * Find stale `Waits on` references in the roadmap text.
 * @param {string} md contents of TODO/ROADMAP.md
 * @returns {string[]} one message per stale reference
 */
export function staleWaits(md) {
  const start = md.indexOf('## Next up')
  const end = md.indexOf('\n## ', start + 1)
  const next = md.slice(start, end === -1 ? undefined : end)
  const rows = new Set(
    [...next.matchAll(/^\|\s*(\d+)\s*\|/gm)].map((m) => Number(m[1])),
  )
  /** @type {string[]} */
  const problems = []
  for (const line of md.split('\n')) {
    const m = line.match(/Waits on ([^|)]*)/)
    if (!m || !line.startsWith('|')) continue
    // Prose such as "`⏳ Waits on N` means ..." is not a table cell.
    for (const n of parseRowRefs(m[1])) {
      if (!rows.has(n)) problems.push(`row ${n} is not in Next up: ${line.slice(0, 80)}`)
    }
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = staleWaits(readFileSync('TODO/ROADMAP.md', 'utf8'))
  for (const p of problems) console.error(p)
  if (problems.length) process.exit(1)
  console.log('roadmap Waits-on cells all point at live rows')
}
