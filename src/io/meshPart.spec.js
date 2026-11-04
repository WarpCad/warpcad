// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * An imported model as a library part (`TODO/io-009`), and an imported **assembly** — several
 * meshes, each placed by a matrix, in one flat `group.assemble` (`TODO/io-024`). Built by hand
 * here, with no file reader: the part model is tested on its own.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { evaluateOp, isGroup } from '../core/kernel/index.js'
import { boundsOf } from '../core/kernel/group.js'
import { resetUserParts, setLibraryParts, validateUserPart } from '../core/userPart.js'
import { parsePartFile, serializePartFile } from '../core/userPartFile.js'
import { importMeshBytes, importParsedMesh } from './meshJob.js'
import { meshAssemblyDefinition, meshPartDefinition, meshPartInfo, meshPartSizeMm, withUnits } from './meshPart.js'
import { binaryStl, boxTriangles } from './__fixtures__/stl.js'

afterEach(() => resetUserParts())

/** @param {[number, number, number]} size @param {[number, number, number]} [origin] */
function box(size, origin = [0, 0, 0]) {
  const triangles = boxTriangles(size, origin)
  return { positions: new Float32Array(triangles.flat(2)), indices: Uint32Array.from({ length: triangles.length * 3 }, (_, i) => i) }
}

/** @param {number} dx @param {number} dy @param {number} dz */
const moved = (dx, dy, dz) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, dx, dy, dz, 1]

/**
 * A hand-built parse result shaped like a 3MF's: a board, and a resistor placed twice, one of
 * them with a quarter turn.
 */
function boardParse() {
  const board = box([50, 20, 1.6])
  const resistor = box([1.6, 0.8, 0.4])
  return {
    ok: /** @type {const} */ (true),
    format: '3mf',
    unitScale: 1,
    unitsStated: true,
    parts: [
      { name: 'Board', ...board, matrix: moved(100, 100, 0) },
      { name: '10K', ...resistor, matrix: moved(110, 105, 1.6) },
      { name: '10K', ...resistor, matrix: [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 130, 110, 1.6, 1] },
    ],
    duplicates: 6,
    skippedObjects: 0,
  }
}

async function boardImport() {
  const result = await importParsedMesh('board.3mf', boardParse())
  if (!result.ok) throw new Error(result.reason)
  return result
}

/** @param {Awaited<ReturnType<typeof boardImport>>} result */
function boardDefinition(result) {
  return meshAssemblyDefinition({ name: 'board', assets: result.assets, parts: result.parts, unitScale: result.unitScale })
}

describe('an imported assembly (TODO/io-024)', () => {
  it('stores each distinct mesh once and one import.mesh per part, under a flat group.assemble', async () => {
    const result = await boardImport()
    expect(result.assets).toHaveLength(2)
    expect(result.parts.map((part) => part.name)).toEqual(['Board', '10K 1', '10K 2'])
    expect(result.duplicates).toBe(6)
    const definition = boardDefinition(result)
    expect(definition.records.map((record) => record.op)).toEqual(['asset.mesh', 'asset.mesh', 'import.mesh', 'import.mesh', 'import.mesh', 'group.assemble'])
    const model = definition.records.at(-1)
    expect(model).toMatchObject({ id: 'model', operands: ['p1', 'p2', 'p3'], params: { names: ['Board', '10K 1', '10K 2'] } })
    for (const record of definition.records.filter((r) => r.op === 'import.mesh')) {
      expect(record.params).toMatchObject({ unitScale: 1, unitsConfirmed: true, unitsStated: true, recenter: false })
      expect(record.params.matrix).toHaveLength(16)
    }
  })

  it('validates and round-trips through a part file', async () => {
    const definition = boardDefinition(await boardImport())
    const verdict = validateUserPart(definition)
    expect(verdict.ok, verdict.ok ? '' : verdict.reason).toBe(true)
    const parsed = /** @type {any} */ (parsePartFile(serializePartFile([definition])))
    expect(parsed.problems).toEqual([])
    expect(parsed.parts[0]).toEqual(verdict.ok ? verdict.definition : null)
  })

  it('is centred in XY with its lowest point on Z = 0, and the parts keep their places relative to each other', async () => {
    const definition = boardDefinition(await boardImport())
    setLibraryParts([definition])
    const group = /** @type {any} */ (evaluateOp(definition.op, {}))
    expect(isGroup(group)).toBe(true)
    expect(group.names).toEqual(['Board', '10K 1', '10K 2'])
    const [min, max] = boundsOf(group)
    expect((min[0] + max[0]) / 2).toBeCloseTo(0, 6)
    expect((min[1] + max[1]) / 2).toBeCloseTo(0, 6)
    expect(min[2]).toBeCloseTo(0, 6)
    const [boardMin] = boundsOf(group.parts.Board)
    const [firstMin] = boundsOf(group.parts['10K 1'])
    const [secondMin, secondMax] = boundsOf(group.parts['10K 2'])
    // Relative to the board, as placed in the file: (+10, +5, +1.6).
    expect(firstMin[0] - boardMin[0]).toBeCloseTo(10, 5)
    expect(firstMin[1] - boardMin[1]).toBeCloseTo(5, 5)
    expect(firstMin[2] - boardMin[2]).toBeCloseTo(1.6, 5)
    // The quarter-turned one: 0.8 wide in X and 1.6 in Y now.
    expect(secondMax[0] - secondMin[0]).toBeCloseTo(0.8, 5)
    expect(secondMax[1] - secondMin[1]).toBeCloseTo(1.6, 5)
  })

  it('meshPartInfo and meshPartSizeMm report the whole model, not its first part', async () => {
    const result = await boardImport()
    const definition = boardDefinition(result)
    const info = meshPartInfo(definition)
    expect(info).toMatchObject({ partCount: 3, triangleCount: 36, unitsStated: true, unitsConfirmed: true, unitScale: 1, units: 'mm' })
    const size = meshPartSizeMm(definition)
    // Board x 100..150; the turned resistor spans x 129.2..130 — inside. y 100..120; z 0..2.0.
    expect(size[0]).toBeCloseTo(50, 5)
    expect(size[1]).toBeCloseTo(20, 5)
    expect(size[2]).toBeCloseTo(2, 5)
    expect(result.sizeMm[0]).toBeCloseTo(50, 5)
  })

  it('withUnits refuses a part whose file stated its units', async () => {
    const definition = boardDefinition(await boardImport())
    expect(() => withUnits(definition, 'inch')).toThrow(/states its units/)
  })

  it('one part is an ordinary mesh part: no group, no parts count, units stated', async () => {
    const one = { ...boardParse(), parts: [boardParse().parts[0]], duplicates: 0 }
    const result = await importParsedMesh('plate.3mf', one)
    if (!result.ok) throw new Error(result.reason)
    const definition = meshAssemblyDefinition({ name: 'plate', assets: result.assets, parts: result.parts, unitScale: 1 })
    expect(definition.records.map((record) => record.op)).toEqual(['asset.mesh', 'import.mesh'])
    expect(definition.result).toBe('model')
    expect(meshPartInfo(definition)).toMatchObject({ partCount: 1, unitsStated: true })
    setLibraryParts([definition])
    const [min, max] = boundsOf(/** @type {any} */ (evaluateOp(definition.op, {})))
    expect(min[2]).toBeCloseTo(0, 6)
    expect((min[0] + max[0]) / 2).toBeCloseTo(0, 6)
  })

  it('an STL part is unchanged: one part, units not stated, withUnits still works', async () => {
    const result = await importMeshBytes('bracket.stl', binaryStl(boxTriangles([40, 20, 10])))
    if (!result.ok || result.kind !== 'mesh') throw new Error(result.ok ? 'not one mesh' : result.reason)
    const definition = meshPartDefinition({ record: result.record, name: 'bracket', triangleCount: result.triangleCount })
    expect(meshPartInfo(definition)).toMatchObject({ partCount: 1, unitsStated: false, unitsConfirmed: false, units: 'mm' })
    expect(meshPartSizeMm(withUnits(definition, 'cm'))[0]).toBeCloseTo(400, 4)
  })

  it('refuses a model over the stored-size cap, naming it', async () => {
    const result = await importParsedMesh('big.3mf', boardParse(), { maxStoredBytes: 300 })
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.reason).toMatch(/too detailed to store/)
  })

  it('refuses instanced triangles over the cap, counted after duplicates collapse', async () => {
    const result = await importParsedMesh('many.3mf', boardParse(), { maxTriangles: 30 })
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.reason).toMatch(/Too many triangles: 36, limit 30/)
  })
})
