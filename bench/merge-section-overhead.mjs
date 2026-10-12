// SPDX-License-Identifier: AGPL-3.0-or-later
// TODO/data-011: how much of a saved project file is the `merge` section?
// Run: node bench/merge-section-overhead.mjs
import { piAndCube, snapCubeTo, piWith } from '../src/core/__fixtures__/piScenes.js'
import { createDocument } from '../src/core/document.js'
import { serializeProject } from '../src/core/project.js'

const local = { origin: 'local' }

/** @param {string} name @param {any} document */
function report(name, document) {
  const text = serializeProject(document)
  const lines = text.trimEnd().split('\n')
  const state = JSON.parse(lines.at(-1))
  const merge = state.merge === undefined ? '' : JSON.stringify(state.merge)
  const records = lines.slice(0, -1).join('\n').length
  console.log(
    `${name}: ${text.length} B total, ${lines.length - 1} records (${records} B), ` +
      `merge ${merge.length} B = ${((merge.length / text.length) * 100).toFixed(1)}% of the file, v${state.version}`
  )
}

// Scenario 3 (snap-placement of a kit assembly): a Pi, a cube snapped to it, one revision.
const three = snapCubeTo(piAndCube({ model: 4 }), 'avjack')
report('scenario 3 (snap-placement)', three)

// Scenario 12 (edit a step mid-history): a run of placements, then an edit in the middle.
const twelve = createDocument()
for (let i = 0; i < 8; i += 1) {
  twelve.append({ id: twelve.nextId('box'), op: 'primitive.cuboid', name: `Box ${i}`, params: { size: [10, 10, 10], center: [i * 15, 0, 5] } }, local)
}
const mid = twelve.records[3]
twelve.reviseRecords([{ id: mid.id, record: { ...mid, params: { ...mid.params, size: [14, 10, 10] } } }], local)
report('scenario 12 (mid-history edit)', twelve)

// Scenario 17 (airfoil and wing): ~a dozen steps with a few removals and an undo.
const seventeen = createDocument()
for (let i = 0; i < 12; i += 1) {
  seventeen.append({ id: seventeen.nextId('wing'), op: 'primitive.cuboid', name: `Rib ${i}`, params: { size: [2, 30, 1 + i * 0.2], center: [i * 3, 0, 0] } }, local)
}
seventeen.removeRecords([seventeen.records[4].id], local)
seventeen.undo()
report('scenario 17 (wing, 12 steps)', seventeen)

// The long case: 200 placements.
const long = createDocument()
for (let i = 0; i < 200; i += 1) {
  long.append({ id: long.nextId('box'), op: 'primitive.cuboid', name: `Box ${i}`, params: { size: [10, 10, 10], center: [i * 15, 0, 5] } }, local)
}
report('200 placements', long)
