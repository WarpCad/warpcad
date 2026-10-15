// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `asset.mesh` record and the imported-mesh part in the document model (`TODO/io-009`).
 *
 * Inside a `user.<slug>` part, `[asset.mesh, import.mesh]` folds through the kernel like any
 * other part. At the top level of a log an `asset.mesh` is a data record exactly as a
 * reference photo is: validated loudly on a local append, never folded, never a body, and a
 * hostile one in a loaded file is dropped with a `LoadWarning` while the file still opens.
 * A hostile mesh inside a part definition takes that part down with a named warning — the
 * existing part-load degrade — rather than the file.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { createDocument } from './document.js'
import { MESH_REMOVED, parseProject, serializeProject } from './project.js'
import { applyAction, emptyScene } from './replay.js'
import { describeRow } from './timelineLabel.js'
import { stepParamEditability } from './paramEdit.js'
import { boundsOf } from './kernel/group.js'
import { recordsForDrop } from './library.js'
import { USER_PART_LIMITS, effectiveUserPart, resetUserParts, setLibraryParts, validateUserPart } from './userPart.js'
import { importMeshBytes } from '../io/meshJob.js'
import { meshPartDefinition } from '../io/meshPart.js'
import { MESH_LIMITS } from '../io/meshAsset.js'
import { serializePartFile, parsePartFile, MAX_PART_FILE_CHARS } from './userPartFile.js'
import { base64FromBytes, bytesFromBase64 } from '../sketch/imageAsset.js'
import { binaryStl, cubeTriangles, gridTriangles } from '../io/__fixtures__/stl.js'

const LOCAL = { origin: 'local' }

/** @type {any} */
const fakeRegistry = Object.freeze({
  'fake.box': Object.freeze({ kind: 'native', operandCount: 0, build: () => ({ tag: 'box' }) }),
})

/** @param {Parameters<typeof cubeTriangles>} args */
async function meshRecord(...args) {
  const result = await importMeshBytes('bracket.stl', binaryStl(cubeTriangles(...args)))
  if (!result.ok) throw new Error(result.reason)
  return result.record
}

/** @param {any} record A copy whose first coordinate is NaN. */
function poisoned(record) {
  const bytes = bytesFromBase64(record.params.dataBase64)
  new DataView(bytes.buffer).setFloat32(0, Number.NaN, true)
  return { ...record, params: { ...record.params, dataBase64: base64FromBytes(bytes) } }
}

afterEach(() => {
  resetUserParts()
})

describe('asset.mesh at the top level of a document', () => {
  it('is listed by meshAssets(), not by assets() (photos only), and is never a body', async () => {
    const asset = await meshRecord(10)
    const document = createDocument({ registry: fakeRegistry })
    document.append({ id: 'a', op: 'fake.box', name: 'Box 1' }, LOCAL)
    document.append(asset, LOCAL)
    expect([...document.meshAssets().keys()]).toEqual([asset.id])
    expect(document.assets().size).toBe(0)
    expect(document.bodies().map((body) => body.id)).toEqual(['a'])
    expect(document.scene.byId.has(asset.id)).toBe(false)
  })

  it('a bad one is refused loudly on a local append, and nothing is appended', async () => {
    const document = createDocument({ registry: fakeRegistry })
    const bad = poisoned(await meshRecord(10))
    expect(() => document.append(bad, LOCAL)).toThrow(/asset\.mesh .* refused — .*finite/)
    expect(document.records).toEqual([])
  })

  it('replay.applyAction folds a valid one as a no-op and reports a hostile one', async () => {
    const asset = await meshRecord(10)
    const scene = emptyScene()
    expect(applyAction(scene, /** @type {any} */ (asset), fakeRegistry).errors).toEqual([])
    const hostile = applyAction(scene, /** @type {any} */ (poisoned(asset)), fakeRegistry)
    expect(hostile.errors).toHaveLength(1)
    expect(hostile.errors[0]).toMatchObject({ id: asset.id, op: 'asset.mesh' })
  })

  it('a hostile one in a loaded file is dropped with a LoadWarning, and the file opens', async () => {
    const asset = await meshRecord(10)
    const text = [
      JSON.stringify({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10] } }),
      JSON.stringify(poisoned(asset)),
    ].join('\n') + '\n'
    const parsed = parseProject(text)
    expect(parsed.entries.map((entry) => entry.record.id)).toEqual(['cube-1'])
    expect(parsed.warnings).toEqual([{ id: asset.id, op: 'asset.mesh', message: expect.stringContaining(MESH_REMOVED) }])
    expect(parsed.warnings[0].message).toMatch(/finite/)
  })

  it('a valid one survives a save and reopen', async () => {
    const asset = await meshRecord(10)
    const document = createDocument({ registry: fakeRegistry })
    document.append(asset, LOCAL)
    const parsed = parseProject(serializeProject(document))
    expect(parsed.warnings).toEqual([])
    expect(parsed.entries.map((entry) => entry.record)).toEqual([asset])
  })
})

async function bracketPart() {
  return meshPartDefinition({ record: await meshRecord(10, [100, 100, 100]), name: 'Bracket', triangleCount: 12 })
}

describe('an imported mesh as a user part', () => {
  it('places like any part: it folds into a body that sits on the ground at the drop point', async () => {
    setLibraryParts([await bracketPart()])
    expect(effectiveUserPart('user.bracket')).toBeDefined()
    const document = createDocument()
    document.appendAll(recordsForDrop('user.bracket', { x: 30, y: -20 }, document), LOCAL)
    const [body] = document.bodies()
    expect(body.name).toBe('Bracket 1')
    const [min, max] = boundsOf(body.geometry)
    expect((min[0] + max[0]) / 2).toBeCloseTo(30, 6)
    expect((min[1] + max[1]) / 2).toBeCloseTo(-20, 6)
    expect(min[2]).toBeCloseTo(0, 6)
    expect(max[2]).toBeCloseTo(10, 6)
  })

  it('a placed mesh part survives save and reopen with its definition carried in the file', async () => {
    setLibraryParts([await bracketPart()])
    const document = createDocument()
    document.appendAll(recordsForDrop('user.bracket', { x: 0, y: 0 }, document), LOCAL)
    const text = serializeProject(document)
    resetUserParts()
    const parsed = parseProject(text)
    expect(parsed.warnings).toEqual([])
    expect(parsed.userParts.map((/** @type {any} */ part) => part.op)).toEqual(['user.bracket'])
  })

  it('a hostile mesh inside a part definition drops that part with a named warning; the file opens', async () => {
    const part = await bracketPart()
    setLibraryParts([part])
    const document = createDocument()
    document.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10] } }, LOCAL)
    document.appendAll(recordsForDrop('user.bracket', { x: 0, y: 0 }, document), LOCAL)
    const text = serializeProject(document)
    const lines = text.trim().split('\n')
    const state = JSON.parse(lines[lines.length - 1])
    state.parts[0].records[0] = poisoned(state.parts[0].records[0])
    lines[lines.length - 1] = JSON.stringify(state)
    resetUserParts()
    const parsed = parseProject(`${lines.join('\n')}\n`)
    expect(parsed.userParts).toEqual([])
    expect(parsed.warnings).toEqual([expect.objectContaining({ op: 'user.bracket', message: expect.stringMatching(/finite/) })])
    expect(parsed.entries.some((entry) => entry.record.id === 'cube-1')).toBe(true)
  })

  it('round-trips through a part file', async () => {
    const part = await bracketPart()
    const text = serializePartFile([/** @type {any} */ (part)])
    const read = parsePartFile(text)
    expect(read.problems).toEqual([])
    expect(read.parts.map((definition) => definition.op)).toEqual(['user.bracket'])
  })
})

describe('the part caps, sized for a mesh', () => {
  it('a mesh part over the 1,000,000-character definition cap is still a valid part — its mesh is capped by MESH_LIMITS instead', async () => {
    const result = await importMeshBytes('plate.stl', binaryStl(gridTriangles(200)))
    if (!result.ok) throw new Error(result.reason)
    const definition = meshPartDefinition({ record: result.record, name: 'Plate', triangleCount: result.triangleCount })
    expect(JSON.stringify(definition).length).toBeGreaterThan(USER_PART_LIMITS.maxDefinitionBytes)
    const verdict = validateUserPart(definition)
    expect(verdict.ok ? '' : verdict.reason).toBe('')
  })

  it('a mesh at the stored-size cap still fits in a part definition, and a part that size in a part file', () => {
    const base64 = Math.ceil(MESH_LIMITS.maxStoredBytes / 3) * 4
    expect(base64 + 10_000).toBeLessThan(USER_PART_LIMITS.maxMeshDefinitionBytes)
    // The file's own wrapper, pretty-printing and one thumbnail on top.
    expect(USER_PART_LIMITS.maxMeshDefinitionBytes + 64_000 + 10_000).toBeLessThan(MAX_PART_FILE_CHARS)
  })

  it('refuses a mesh part whose whole definition is over the mesh-part cap', async () => {
    const part = await bracketPart()
    const padding = 'x'.repeat(USER_PART_LIMITS.maxMeshDefinitionBytes)
    const verdict = validateUserPart({ ...part, records: [part.records[0], { ...part.records[1], params: { ...part.records[1].params, name: padding } }] })
    expect(verdict.ok).toBe(false)
    expect(verdict.ok ? '' : verdict.reason).toMatch(/larger than/)
  })

  it('refuses more than one mesh in a part', async () => {
    const part = await bracketPart()
    const second = await meshRecord(11)
    const verdict = validateUserPart({ ...part, records: [second, ...part.records] })
    expect(verdict.ok).toBe(false)
    expect(verdict.ok ? '' : verdict.reason).toMatch(/more than 1 mesh/)
  })

  it('refuses an import.mesh whose target is not an asset.mesh of the part', async () => {
    const part = await bracketPart()
    const records = [{ id: 'box', op: 'primitive.cuboid', params: { size: [1, 1, 1] } }, { ...part.records[1], target: 'box' }]
    const verdict = validateUserPart({ ...part, records, result: part.records[1].id })
    expect(verdict.ok).toBe(false)
    expect(verdict.ok ? '' : verdict.reason).toMatch(/import\.mesh .*asset\.mesh/)
  })

  it('refuses an asset.mesh that carries an operand', async () => {
    const part = await bracketPart()
    const records = [{ id: 'box', op: 'primitive.cuboid', params: { size: [1, 1, 1] } }, { ...part.records[0], target: 'box' }, part.records[1]]
    const verdict = validateUserPart({ ...part, records })
    expect(verdict.ok).toBe(false)
    expect(verdict.ok ? '' : verdict.reason).toMatch(/unexpected field "target"/)
  })
})

describe('History and step edits', () => {
  it('names the import by file name and triangle count, and the data row by its size', async () => {
    const asset = await meshRecord(10)
    expect(describeRow({ id: 'model', op: 'import.mesh', target: asset.id, params: { name: 'bracket', triangleCount: 12408, unitScale: 1 } }, new Map())).toBe(
      'Imported mesh bracket (12,408 triangles)'
    )
    expect(describeRow({ id: 'model', op: 'import.mesh', target: asset.id, params: {} }, new Map())).toBe('Imported mesh')
    expect(describeRow(asset, new Map())).toBe('Mesh data (12 triangles)')
  })

  it('neither row is editable as raw numbers', async () => {
    const asset = await meshRecord(10)
    expect(stepParamEditability(asset)).toEqual({ editable: false, blockedBy: 'asset.mesh' })
    expect(stepParamEditability({ id: 'model', op: 'import.mesh', target: asset.id, params: { unitScale: 1, recenter: true } })).toEqual({
      editable: false,
      blockedBy: 'import.mesh',
    })
  })
})
