// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { createDocument } from '../../core/document.js'
import { calcSnap, mirrorRotationDeg, volumeOf } from '../../core/kernel/group.js'
import { registry } from '../../core/kernel/registry.js'
import { recordsForDrop } from '../../core/library.js'
import { rotateRecord, translateRecord } from '../../core/transform.js'
import { fakeRegistry } from './__fixtures__/fakeRegistry.js'
import { makeContext } from './__fixtures__/context.js'
import { createToolRegistry } from './index.js'
import { NOT_OFFERED, OPERATIONS, operableOps } from './operate.js'
import { checkInput } from './schema.js'

const LOCAL = { origin: 'local' }

/**
 * @param {import('../../core/document.js').WarpDocument} document
 * @param {string} op
 * @param {{ x: number, y: number }} pointMm
 * @param {Record<string, any>} [overrides]
 * @returns {string}
 */
function place(document, op, pointMm, overrides = {}) {
  const records = recordsForDrop(op, pointMm, document, overrides)
  document.appendAll(records, LOCAL)
  return /** @type {string} */ (records[0].id)
}

/**
 * @param {number} count
 * @returns {{ document: import('../../core/document.js').WarpDocument, ids: string[] }}
 */
function cubes(count) {
  const document = createDocument({ replica: 'abcdef' })
  const ids = Array.from({ length: count }, (_, index) => place(document, 'primitive.cuboid', { x: index * 15, y: 0 }, { size: [20, 20, 20] }))
  return { document, ids }
}

describe('operableOps — operations are their own list', () => {
  it('offers only ops the registry has, each needing at least one operand', () => {
    const ops = operableOps(registry)
    expect(ops).toEqual(Object.keys(OPERATIONS).sort())
    for (const op of ops) expect(registry[op]?.operandCount, op).not.toBe(0)
  })

  it('accounts for every operation in the registry: offered, or not offered with a stated reason — never both, never neither', () => {
    for (const [op, entry] of Object.entries(registry)) {
      if (entry.operandCount === 0) continue
      const offered = op in OPERATIONS
      const declined = op in NOT_OFFERED
      expect(offered !== declined, `${op} must be in exactly one of OPERATIONS / NOT_OFFERED`).toBe(true)
      if (declined) expect(NOT_OFFERED[op].length, op).toBeGreaterThan(10)
    }
    for (const op of Object.keys(NOT_OFFERED)) expect(registry[op], op).toBeDefined()
  })

  it('offers only the mapped ops a fake registry has', () => {
    expect(operableOps(fakeRegistry)).toEqual(['boolean.subtract', 'transform.translate'])
  })
})

describe('operand-count refusals — the same acceptsOperandCount the toolbar uses', () => {
  const tools = createToolRegistry()

  /** @type {Array<[string, Record<string, any>, number[], number[]]>} */
  const classes = [
    // op, params, accepted counts, refused counts
    ['boolean.subtract', {}, [2, 3], [0, 1]],
    ['boolean.union', {}, [2, 3], [0, 1]],
    ['modify.enlarge', { deltaMm: [1, 1, 1] }, [1], [0, 2, 3]],
    ['transform.translate', { deltaMm: [0, 0, 5] }, [1], [0, 2, 3]],
  ]

  for (const [op, params, accepted, refused] of classes) {
    for (const count of refused) {
      it(`${op} refuses ${count} operand(s) by name and changes nothing`, () => {
        const { document, ids } = cubes(3)
        const before = JSON.stringify(document.entries)
        const result = /** @type {any} */ (
          tools.run(makeContext({ document }), 'operate', { op, operands: ids.slice(0, count).map((id) => ({ id })), params })
        )
        expect(result.error).toBeDefined()
        expect(result.reason).toMatch(new RegExp(`${op.replace('.', '\\.')} needs ${registry[op].operandCount === '2+' ? '2 or more' : 'exactly 1'} operand`))
        expect(JSON.stringify(document.entries)).toBe(before)
      })
    }
    for (const count of accepted) {
      it(`${op} accepts ${count} operand(s)`, () => {
        const { document, ids } = cubes(3)
        const result = /** @type {any} */ (
          tools.run(makeContext({ document }), 'operate', { op, operands: ids.slice(0, count).map((id) => ({ id })), params })
        )
        expect(result.error).toBeUndefined()
      })
    }
  }

  it('refuses a creation op — operate never creates (the zero-operand class)', () => {
    const { document } = cubes(1)
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'operate', { op: 'primitive.cuboid', operands: [] }))
    expect(result.reason).toMatch(/input\.op must be one of/)
  })
})

describe('operand ids — only ids the document issued, for bodies that are on screen', () => {
  const tools = createToolRegistry()

  it('refuses an unknown id', () => {
    const { document, ids } = cubes(1)
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'operate', { op: 'boolean.subtract', operands: [{ id: ids[0] }, { id: 'sphere-abcdef-42' }] }))
    expect(result.reason).toMatch(/sphere-abcdef-42/)
    expect(result.reason).toMatch(/no body/)
  })

  it('refuses a body whose row is suppressed', () => {
    const { document, ids } = cubes(2)
    document.setSuppressed(ids[1], true, LOCAL)
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'operate', { op: 'boolean.subtract', operands: [{ id: ids[0] }, { id: ids[1] }] }))
    expect(result.reason).toMatch(new RegExp(`${ids[1]}.*not a body on screen`))
  })

  it('refuses a body that only exists past the rollback marker', () => {
    const { document, ids } = cubes(3)
    document.rollBackTo(ids[1], LOCAL)
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'operate', { op: 'boolean.subtract', operands: [{ id: ids[0] }, { id: ids[2] }] }))
    expect(result.reason).toMatch(new RegExp(`${ids[2]}.*not a body on screen`))
  })

  it('refuses a body an earlier boolean consumed', () => {
    const { document, ids } = cubes(3)
    const ctx = makeContext({ document })
    tools.run(ctx, 'operate', { op: 'boolean.union', operands: [{ id: ids[0] }, { id: ids[1] }] })
    const result = /** @type {any} */ (tools.run(ctx, 'operate', { op: 'boolean.subtract', operands: [{ id: ids[2] }, { id: ids[0] }] }))
    expect(result.reason).toMatch(new RegExp(`${ids[0]}.*not a body on screen`))
  })

  it('refuses the same body named twice', () => {
    const { document, ids } = cubes(1)
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'operate', { op: 'boolean.union', operands: [{ id: ids[0] }, { id: ids[0] }] }))
    expect(result.reason).toMatch(/twice/)
  })

  it('refuses a part address on an op that cannot take one, by name', () => {
    const { document, ids } = cubes(1)
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'operate', { op: 'modify.enlarge', operands: [{ id: ids[0], pieces: 'head' }], params: { deltaMm: [1, 1, 1] } }))
    expect(result.reason).toMatch(/modify\.enlarge.*part/)
  })

  it('subtracts just a bolt’s tap when the operand names it, as the toolbar’s drilled-in selection does', () => {
    const document = createDocument({ replica: 'abcdef' })
    const plate = place(document, 'primitive.cuboid', { x: 0, y: 0 }, { size: [40, 40, 6] })
    const bolt = place(document, 'hardware.bolt', { x: 0, y: 0 })
    // A placed composite's current record is its drop translate, not the recipe record.
    const boltTerminal = /** @type {string} */ (document.currentIdOf(bolt))
    expect(boltTerminal).not.toBe(bolt)
    const result = /** @type {any} */ (
      tools.run(makeContext({ document }), 'operate', { op: 'boolean.subtract', operands: [{ id: plate }, { id: bolt, pieces: 'tap' }] })
    )
    expect(result.error).toBeUndefined()
    const record = document.entries.at(-1)?.record
    expect(record?.target).toBe(plate)
    expect(record?.operands).toEqual([{ id: boltTerminal, pieces: 'tap' }])
    expect(record?.consumes).toEqual([plate, boltTerminal])
  })

  it('subtracting a Pi’s hole1 leaves the Pi, so the next call can drill hole2 with it (TODO/core-064)', () => {
    const document = createDocument({ replica: 'abcdef' })
    const plate = place(document, 'primitive.cuboid', { x: 30, y: 30 }, { size: [100, 80, 2] })
    const pi = place(document, 'raspberrypi.bplus', { x: 0, y: 0 })
    const context = makeContext({ document })
    for (const hole of ['hole1', 'hole2']) {
      const base = /** @type {string} */ (document.currentIdOf(plate))
      const piTerminal = /** @type {string} */ (document.currentIdOf(pi))
      const result = /** @type {any} */ (
        tools.run(context, 'operate', { op: 'boolean.subtract', operands: [{ id: document.rootOf(base) ?? base }, { id: pi, pieces: hole }] })
      )
      expect(result.error, hole).toBeUndefined()
      const record = document.entries.at(-1)?.record
      expect(record?.operands).toEqual([{ id: piTerminal, pieces: hole }])
      expect(record?.consumes).toEqual([base])
      expect(document.bodies().map((body) => body.id)).toContain(pi)
    }
    expect(document.bodies()).toHaveLength(2)
  })
})

describe('the records operate writes are the ones the UI writes', () => {
  const tools = createToolRegistry()

  it('a boolean: named, first operand as target, consumes every operand — the Operations toolbar’s shape', () => {
    const { document, ids } = cubes(2)
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'operate', { op: 'boolean.subtract', operands: ids.map((id) => ({ id })) }))
    expect(document.entries.at(-1)?.record).toEqual({
      id: 'bool-abcdef-3',
      op: 'boolean.subtract',
      name: 'Subtract 1',
      target: ids[0],
      operands: [ids[1]],
      consumes: ids,
    })
    expect(result.applied[0].bodyId).toBe('bool-abcdef-3')
    expect(result.scene.count).toBe(1)
  })

  it('names operands by their current record, so a moved body is cut where it now is', () => {
    const { document, ids } = cubes(2)
    const move = translateRecord(document, ids[1], [0, 0, 5])
    document.append(move, LOCAL)
    tools.run(makeContext({ document }), 'operate', { op: 'boolean.union', operands: ids.map((id) => ({ id })) })
    const record = document.entries.at(-1)?.record
    expect(record?.operands).toEqual([move.id])
    expect(record?.consumes).toEqual([ids[0], move.id])
  })

  it('a move and a turn are transform.js’s own records', () => {
    const { document, ids } = cubes(1)
    const ctx = makeContext({ document })
    const expectedMove = translateRecord(createDocumentLike(document), ids[0], [1, 2, 3])
    tools.run(ctx, 'operate', { op: 'transform.translate', operands: [{ id: ids[0] }], params: { deltaMm: [1, 2, 3] } })
    expect(document.entries.at(-1)?.record).toEqual(expectedMove)
    const expectedTurn = rotateRecord(createDocumentLike(document), ids[0], [0, 0, 90])
    const result = /** @type {any} */ (tools.run(ctx, 'operate', { op: 'transform.rotate', operands: [{ id: ids[0] }], params: { deltaDeg: [0, 0, 90] } }))
    expect(document.entries.at(-1)?.record).toEqual(expectedTurn)
    // A move continues the body: same id afterwards.
    expect(result.applied[0].bodyId).toBe(ids[0])
  })

  it('a rim fillet supersedes its target, unnamed', () => {
    const { document, ids } = cubes(1)
    tools.run(makeContext({ document }), 'operate', { op: 'modify.filletRim', operands: [{ id: ids[0] }], params: { radius: 2, orientation: 'z+' } })
    expect(document.entries.at(-1)?.record).toEqual({
      id: 'fillet-abcdef-2',
      op: 'modify.filletRim',
      target: ids[0],
      supersedes: ids[0],
      params: { radius: 2, orientation: 'z+' },
    })
  })

  it('a group names its parts after the bodies it gathers', () => {
    const { document, ids } = cubes(2)
    tools.run(makeContext({ document }), 'operate', { op: 'group.assemble', operands: ids.map((id) => ({ id })) })
    expect(document.entries.at(-1)?.record).toMatchObject({
      op: 'group.assemble',
      name: 'Group 1',
      target: ids[0],
      operands: [ids[1]],
      consumes: ids,
      params: { names: ['Cube 1', 'Cube 2'] },
    })
  })

  it('a snap supersedes the moving body and keeps the reference', () => {
    const { document, ids } = cubes(2)
    const result = /** @type {any} */ (
      tools.run(makeContext({ document }), 'operate', { op: 'group.snap', operands: ids.map((id) => ({ id })), params: { axes: 'z', orientation: 'outside+' } })
    )
    expect(document.entries.at(-1)?.record).toEqual({
      id: 'snap-abcdef-3',
      op: 'group.snap',
      target: ids[0],
      operands: [ids[1]],
      supersedes: ids[0],
      params: { axes: 'z', deltaMm: 0, orientation: 'outside+' },
    })
    expect(result.scene.count).toBe(2)
  })

  it('a mirror is a new body, carrying the reflected rotation', () => {
    const { document, ids } = cubes(1)
    tools.run(makeContext({ document }), 'operate', { op: 'transform.mirror', operands: [{ id: ids[0] }], params: { axis: 'x', planeMm: 30 } })
    expect(document.entries.at(-1)?.record).toEqual({
      id: 'mirror-abcdef-2',
      op: 'transform.mirror',
      name: 'Mirror 1',
      target: ids[0],
      params: { axis: 'x', pointMm: [30, 0, 0], rotation: mirrorRotationDeg([0, 0, 0], 'x') },
    })
    expect(document.bodies()).toHaveLength(2)
  })

  it('a bisect without a tilt writes the plain two-field shape', () => {
    const { document, ids } = cubes(1)
    tools.run(makeContext({ document }), 'operate', { op: 'modify.bisect', operands: [{ id: ids[0] }], params: { axis: 'z', offsetMm: 5, angleDeg: 0 } })
    expect(document.entries.at(-1)?.record?.params).toEqual({ axis: 'z', offsetMm: 5 })
  })

  it('a kernel refusal comes back in the document’s own ReplayRejection words, with the step', () => {
    const { document, ids } = cubes(1)
    const result = /** @type {any} */ (
      tools.run(makeContext({ document }), 'operate', { op: 'modify.filletRim', operands: [{ id: ids[0] }], params: { radius: 50, orientation: 'z+' } })
    )
    expect(result.error).toMatch(/^Step 2 \(Fillet Cube 1\) can't be built: /)
    expect(result.step).toBe(2)
    expect(result.reason).toMatch(/^can't be built: /)
    expect(document.entries).toHaveLength(1)
  })

  it('works against a fake registry: a real subtract of two placed blocks', () => {
    const fakeTools = createToolRegistry({ registry: fakeRegistry })
    const document = createDocument({ registry: fakeRegistry, replica: 'abcdef' })
    const ctx = makeContext({ document })
    fakeTools.run(ctx, 'create', { op: 'fake.block', positionMm: [0, 0, 0], params: { sizeMm: 20 } })
    fakeTools.run(ctx, 'create', { op: 'fake.block', positionMm: [10, 0, 0], params: { sizeMm: 20 } })
    const result = /** @type {any} */ (fakeTools.run(ctx, 'operate', { op: 'boolean.subtract', operands: [{ id: 'block-abcdef-1' }, { id: 'block-abcdef-2' }] }))
    expect(result.error).toBeUndefined()
    expect(volumeOf(document.bodies()[0].geometry)).toBeCloseTo(20 * 20 * 20 / 2, 6)
  })
})

/**
 * A second document folded from the same entries, so a record builder can be run
 * against it without advancing the live document's id counter first.
 *
 * @param {import('../../core/document.js').WarpDocument} document
 * @returns {import('../../core/document.js').WarpDocument}
 */
function createDocumentLike(document) {
  // Same replica id, and `loadEntries` moves the clock past every counter in the log, so the
  // twin mints exactly the ids the live document will (`TODO/data-008`).
  const twin = createDocument({ replica: document.replicaId() })
  twin.loadEntries(document.entries.map((entry) => ({ record: entry.record, origin: entry.origin })))
  return twin
}

describe('group.snap orientation — the description names the side calcSnap actually uses (TODO/ai-022)', () => {
  const tools = createToolRegistry()
  const operate = /** @type {any} */ (tools.tools.find((candidate) => candidate.name === 'operate'))

  /** The `orientation` property's description, found wherever the operate schema nests it. */
  const orientationDescription = () => {
    /** @param {unknown} node @returns {string | undefined} */
    const search = (node) => {
      if (node === null || typeof node !== 'object') return undefined
      const schema = /** @type {any} */ (node)
      if (schema.properties?.orientation?.description) return schema.properties.orientation.description
      for (const value of Object.values(schema)) {
        /** @type {string | undefined} */
        const found = search(value)
        if (found !== undefined) return found
      }
      return undefined
    }
    return search(operate.inputSchema)
  }

  it('says outside+ puts the first body on the second’s − side, the side the kernel measures', () => {
    const description = orientationDescription()
    expect(description).toMatch(/"outside\+" puts the first body on the second[’']s − side/)
    expect(description).not.toMatch(/"outside\+" puts the first body on the second[’']s \+ side/)
  })

  it.each([
    ['outside+', 'below'],
    ['outside-', 'above'],
  ])('agrees with a measured %s snap: the first body ends up %s the second', (orientation, side) => {
    const { primitives, measurements, transforms } = modeling
    const small = primitives.cuboid({ size: [4, 4, 4] })
    const big = primitives.cuboid({ size: [10, 10, 10] })
    const vector = calcSnap(small, big, 'z', orientation)
    const moved = transforms.translate(vector, small)
    const [movedMin, movedMax] = measurements.measureBoundingBox(moved)
    const [bigMin, bigMax] = measurements.measureBoundingBox(big)
    const movedCentre = (movedMin[2] + movedMax[2]) / 2
    const bigCentre = (bigMin[2] + bigMax[2]) / 2
    if (side === 'below') {
      expect(movedMax[2]).toBeCloseTo(bigMin[2], 9)
      expect(movedCentre).toBeLessThan(bigCentre)
    } else {
      expect(movedMin[2]).toBeCloseTo(bigMax[2], 9)
      expect(movedCentre).toBeGreaterThan(bigCentre)
    }
  })
})

describe('modify.splitWithJoint — the AI can ask for every stage-1 joint (TODO/core-075)', () => {
  const spec = OPERATIONS['modify.splitWithJoint']

  it('accepts a dowel joint with its jointOptions, and hand placements including a dowel', () => {
    expect(checkInput(spec.params, { axis: 'x', offsetMm: 150, joint: 'dowel' })).toEqual([])
    expect(checkInput(spec.params, { axis: 'x', offsetMm: 150, joint: 'dowel', jointOptions: { stock: 'steel', sizeMm: 4 } })).toEqual([])
    expect(
      checkInput(spec.params, {
        axis: 'x',
        offsetMm: 150,
        placements: [{ kind: 'dowel', uMm: 0, vMm: 0, sizeMm: 4, stock: 'filament' }, { kind: 'wedge', uMm: 5, vMm: 0 }, { kind: 'pins' }],
      })
    ).toEqual([])
  })

  it('refuses an unknown joint or placement kind by name', () => {
    expect(checkInput(spec.params, { axis: 'x', offsetMm: 150, joint: 'butterfly' }).join(' ')).toMatch(/joint.*pins.*tongue.*dowel.*none/)
    expect(checkInput(spec.params, { axis: 'x', offsetMm: 150, placements: [{ kind: 'magnet' }] }).join(' ')).toMatch(
      /placements\[0\]\.kind.*pins.*tongue.*wedge.*screwBoss.*dowel/
    )
    expect(checkInput(spec.params, { axis: 'x', offsetMm: 150, jointOptions: { stock: 'gold' } }).join(' ')).toMatch(/stock.*printed.*steel.*filament/)
  })

  it('says in its description when to use each joint, and that placements reach wedges and screw bosses', () => {
    const words = JSON.stringify(spec.params) + spec.description
    expect(words).toMatch(/dowel/)
    expect(words).toMatch(/screwBoss/)
    expect(words).toMatch(/steel/)
  })

  it('builds a record that carries placements and jointOptions as given', () => {
    const document = createDocument({ replica: 'abcdef' })
    const id = place(document, 'primitive.cuboid', { x: 0, y: 0 }, { size: [300, 20, 20] })
    const operand = { id, ref: id, terminal: id }
    const record = spec.build(
      document,
      /** @type {any} */ ([operand]),
      { axis: 'x', offsetMm: 150, joint: 'dowel', jointOptions: { stock: 'steel' } },
      'modify.splitWithJoint'
    )
    expect(record.params).toMatchObject({ axis: 'x', offsetMm: 150, joint: 'dowel', jointOptions: { stock: 'steel' } })
    const placed = spec.build(
      document,
      /** @type {any} */ ([operand]),
      { axis: 'x', offsetMm: 150, placements: [{ kind: 'dowel' }] },
      'modify.splitWithJoint'
    )
    expect(placed.params?.placements).toEqual([{ kind: 'dowel' }])
    expect(placed.params?.joint).toBeUndefined()
  })
})
