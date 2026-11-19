// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Fails when a `⏳ Waits on N` cell in TODO/ROADMAP.md names a row number that is not a
// row of the Next up table. Finished rows are deleted from that table, so their numbers
// vanish while other rows' cells keep pointing at them.
//
// It also checks the hand-kept counts and lists that a closing task has to keep in step
// (`staleCounts`): the "N queued" and "N ready" figures in the summary rows, and that Next up
// and the Findings table name the same ready ids. These drifted because nothing checked them.
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

/**
 * Cut one section out of the roadmap.
 * @param {string} md
 * @param {string} startHeading Exact heading line that opens the section.
 * @returns {string}
 */
function section(md, startHeading) {
  const start = md.indexOf(startHeading)
  if (start === -1) return ''
  const m = md.slice(start + startHeading.length).search(/\n#{2,3} /)
  return m === -1 ? md.slice(start) : md.slice(start, start + startHeading.length + m)
}

/**
 * Find summary counts and id lists that no longer match the tables they summarise.
 * @param {string} md contents of TODO/ROADMAP.md
 * @returns {string[]} one message per mismatch
 */
export function staleCounts(md) {
  /** @type {string[]} */
  const problems = []
  const next = section(md, '## Next up — recommended TODOs')
  const findings = section(md, '### Findings (open rows)')
  /** @type {string[]} */
  const readyIds = []
  for (const line of next.split('\n')) {
    const row = line.match(/^\|\s*\d+\s*\|\s*▶ Ready[^|]*\|[^|]*\|\s*\[`([a-z]+-\d+[a-z]?)`\]/)
    if (row) readyIds.push(row[1])
  }
  const findingIds = [...findings.matchAll(/^\| `([a-z]+-\d+[a-z]?)` \|/gm)].map((m) => m[1])
  for (const id of readyIds) {
    if (!findingIds.includes(id)) problems.push(`${id} is ready in Next up but has no row in the Findings table`)
  }
  for (const id of findingIds) {
    if (!readyIds.includes(id)) problems.push(`${id} is in the Findings table but is not a ready row in Next up`)
  }
  for (const line of md.split('\n')) {
    if (!line.startsWith('| [Findings](#findings-open-rows) |')) continue
    for (const m of line.matchAll(/(\d+) (queued|ready for)/g)) {
      if (Number(m[1]) !== readyIds.length) {
        problems.push(`summary says ${m[1]} ${m[2]}, Next up has ${readyIds.length} ready rows: ${line.slice(0, 70)}`)
      }
    }
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const md = readFileSync('TODO/ROADMAP.md', 'utf8')
  const problems = [...staleWaits(md), ...staleCounts(md)]
  for (const p of problems) console.error(p)
  if (problems.length) process.exit(1)
  console.log('roadmap Waits-on cells, counts and Findings ids all agree')
}
