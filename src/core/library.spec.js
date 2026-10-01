import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import {
  HARDWARE_LIBRARY,
  KIT_LIBRARY,
  LIBRARY_SECTIONS,
  PRIMITIVE_LIBRARY,
  RASPBERRYPI_LIBRARY,
  SNAP_ALIGNMENTS,
  SNAP_TOLERANCE_PX,
  alignmentCoordMm,
  alignmentOffsetMm,
  boxAtPoint,
  clearSnap,
  createBoxMm,
  createSnapState,
  gapMm,
  ghostBoxAtOrigin,
  ghostOffsetMm,
  paramsForDrop,
  recordForDrop,
  recordsForDrop,
  snapToleranceMm,
  updateSnap,
  variantKey,
} from './library.js'
import { BPLUS_MODELS } from './kernel/recipes/raspberrypi.bplus.js'
import { CAMERA_MODULE_MODELS } from './kernel/recipes/raspberrypi.cameraModule.js'
import { boundsOf, calcCenterWith, calcSnap, volumeOf } from './kernel/group.js'
import { evaluate, evaluateOp } from './kernel/index.js'
import { createDocument } from './document.js'

const { measurements } = modeling

/**
 * A 40 mm cube's box, resting on the working plane and centred at `(xMm, yMm)`.
 *
 * @param {number} xMm
 * @param {number} yMm
 * @returns {{ minMm: number[], maxMm: number[] }}
 */
function cubeBox(xMm, yMm) {
  return { minMm: [xMm - 20, yMm - 20, 0], maxMm: [xMm + 20, yMm + 20, 40] }
}

describe('PRIMITIVE_LIBRARY — the Library panel rows, derived from the registry', () => {
  it('lists every primitive.* op the registry carries, and nothing else', () => {
    // The single mechanism CLAUDE.md's creation-vs-operation rule asks for: the
    // rows are the registry's creation entries, not a hand-copied list that can
    // drift from it.
    expect(PRIMITIVE_LIBRARY.map((row) => row.op)).toEqual([
      'primitive.cuboid',
      'primitive.cylinder',
      'primitive.cone',
      'primitive.hexagon',
      'primitive.triangle',
      'primitive.tube',
      'primitive.sphere',
    ])
    expect(PRIMITIVE_LIBRARY).toHaveLength(7)
  })

  it('gives every row a human label and buildable defaults', () => {
    for (const row of PRIMITIVE_LIBRARY) {
      expect(row.label, row.op).toMatch(/\S/)
      expect(row.defaults, row.op).toBeTypeOf('object')
      expect(row.operandCount, row.op).toBe(0)
    }
    expect(PRIMITIVE_LIBRARY.map((row) => row.label)).toEqual([
      'Cube',
      'Cylinder',
      'Cone',
      'Hexagon',
      'Triangle',
      'Tube',
      'Sphere',
    ])
  })
})

describe('HARDWARE_LIBRARY — the catalogue rows a composite recipe earns (TODO/ui-030)', () => {
  it('lists the four hardware.* recipes, in catalogue order, and nothing else', () => {
    expect(HARDWARE_LIBRARY.map((row) => row.op)).toEqual([
      'hardware.bolt',
      'hardware.nut',
      'hardware.washer',
      'hardware.bearing',
    ])
    expect(HARDWARE_LIBRARY.map((row) => row.label)).toEqual(['Bolt', 'Nut', 'Washer', 'Bearing'])
  })

  it('carries the same row contract as a primitive row, plus the kind the drop branches on', () => {
    for (const row of HARDWARE_LIBRARY) {
      expect(row.defaults, row.op).toBeTypeOf('object')
      // Creation rows, exactly like the primitives: geometry from nothing, so
      // they belong in the same "create" half of CLAUDE.md's creation-vs-
      // operation split and never in an operand-gated list.
      expect(row.operandCount, row.op).toBe(0)
      expect(row.kind, row.op).toBe('composite')
      // Every default actually builds — a row whose defaults throw is a row
      // that looks fine in the panel and fails on the first drag.
      expect(() => evaluateOp(row.op, row.defaults), row.op).not.toThrow()
    }
    expect(PRIMITIVE_LIBRARY.every((row) => row.kind === 'native')).toBe(true)
  })

  it('gives the hardware rows their own named section rather than one undifferentiated list', () => {
    // Narrowed by `TODO/ui-031`, which added two more sections and so made the
    // original "there are exactly two" wording false. What this test was *about*
    // is unchanged and still checked: Hardware is its own titled section, holding
    // its own rows, never mixed into the Primitives list.
    expect(LIBRARY_SECTIONS.map((section) => section.id).slice(0, 2)).toEqual([
      'primitive',
      'hardware',
    ])
    expect(LIBRARY_SECTIONS.map((section) => section.title).slice(0, 2)).toEqual([
      'Primitives',
      'Hardware',
    ])
    expect(LIBRARY_SECTIONS[0].rows).toBe(PRIMITIVE_LIBRARY)
    expect(LIBRARY_SECTIONS[1].rows).toBe(HARDWARE_LIBRARY)
    // The primitives section is untouched by this: seven rows, same order.
    expect(PRIMITIVE_LIBRARY).toHaveLength(7)
  })
})

describe('KIT_LIBRARY / RASPBERRYPI_LIBRARY — the rest of the catalogue (TODO/ui-031)', () => {
  it('lists the three kit.* recipes, in catalogue order', () => {
    expect(KIT_LIBRARY.map((row) => row.op)).toEqual(['kit.board', 'kit.boardFrame', 'kit.anchor'])
    expect(KIT_LIBRARY.map((row) => row.label)).toEqual(['Board', 'Board Frame', 'Anchor'])
  })

  it('lists all twelve raspberrypi.* recipes, board first', () => {
    expect(RASPBERRYPI_LIBRARY.map((row) => row.op)).toEqual([
      'raspberrypi.bplus',
      'raspberrypi.cameraModule',
      'raspberrypi.hat',
      'raspberrypi.hatStandoff',
      'raspberrypi.spacer',
      'raspberrypi.activeCoolingFan',
      'raspberrypi.touchDisplay7inch',
      'raspberrypi.touchScreen2',
      'raspberrypi.hyperPixel4Rectangular',
      'raspberrypi.miniPiTFT',
      'raspberrypi.piTFT22',
      'raspberrypi.piTFT24',
    ])
    expect(RASPBERRYPI_LIBRARY).toHaveLength(12)
  })

  it('groups the catalogue into five named sections rather than one long list', () => {
    expect(LIBRARY_SECTIONS.map((section) => section.id)).toEqual([
      'primitive',
      'hardware',
      'kit',
      'raspberrypi',
      'text',
    ])
    expect(LIBRARY_SECTIONS.map((section) => section.title)).toEqual([
      'Primitives',
      'Hardware',
      'Kit Parts',
      'Raspberry Pi',
      'Text',
    ])
    expect(LIBRARY_SECTIONS[2].rows).toBe(KIT_LIBRARY)
    expect(LIBRARY_SECTIONS[3].rows).toBe(RASPBERRYPI_LIBRARY)
    // The two sections that already existed are untouched by this.
    expect(PRIMITIVE_LIBRARY).toHaveLength(7)
    expect(HARDWARE_LIBRARY).toHaveLength(4)
  })

  it('gives every new row defaults that actually build', () => {
    // A row whose defaults throw looks fine in the panel and fails on the first
    // drag. `kit.board`/`kit.boardFrame` are the real risk here: both *require*
    // params the recipe has no default for (`cornerRadius`, the four frame
    // sizes), so a `defaults: {}` copied from the rpi rows would ship a row that
    // throws the moment it is picked up.
    for (const row of [...KIT_LIBRARY, ...RASPBERRYPI_LIBRARY]) {
      expect(row.operandCount, row.op).toBe(0)
      expect(row.kind, row.op).toBe('composite')
      expect(row.label, row.op).toMatch(/\S/)
      expect(() => evaluateOp(row.op, row.defaults), row.op).not.toThrow()
    }
  })

  it('offers a model choice on exactly the two model-parameterised rows, and nowhere else', () => {
    // `core-014a`'s "one factory, not one draggable per revision" decision, as a
    // UI contract: one row, a choice on it — not four Pi rows and five camera
    // rows. Every other row in the whole catalogue has nothing to choose.
    const withChoice = [...PRIMITIVE_LIBRARY, ...HARDWARE_LIBRARY, ...KIT_LIBRARY, ...RASPBERRYPI_LIBRARY]
      .filter((row) => row.choice)
      .map((row) => row.op)
    expect(withChoice).toEqual(['raspberrypi.bplus', 'raspberrypi.cameraModule'])
  })

  it('offers exactly the models the recipe itself accepts, and defaults to one of them', () => {
    // Derived from the recipes' own exported lists rather than hand-copied, so a
    // sixth camera added to the recipe cannot silently miss the panel.
    const byOp = Object.fromEntries(RASPBERRYPI_LIBRARY.map((row) => [row.op, row]))
    const pi = byOp['raspberrypi.bplus']
    const camera = byOp['raspberrypi.cameraModule']

    expect(pi.choice?.param).toBe('model')
    expect(pi.choice?.options.map((option) => option.value)).toEqual([...BPLUS_MODELS])
    expect(camera.choice?.options.map((option) => option.value)).toEqual([...CAMERA_MODULE_MODELS])

    // The row's default must be one of its own options, or the `<select>` opens
    // showing a value it cannot represent.
    for (const row of [pi, camera]) {
      const values = row.choice?.options.map((option) => option.value) ?? []
      expect(values, row.op).toContain(row.defaults[row.choice?.param ?? ''])
      for (const option of row.choice?.options ?? []) {
        expect(option.label, `${row.op} ${String(option.value)}`).toMatch(/\S/)
      }
    }
    // The most common current-generation parts, not V1's own historical defaults
    // (`bplus` defaults to model 2 in the recipe — a 2014 board).
    expect(pi.defaults.model).toBe(4)
    expect(camera.defaults.model).toBe('v3')
  })

  it('builds every option of every choice row, not only the default', () => {
    for (const row of RASPBERRYPI_LIBRARY.filter((candidate) => candidate.choice)) {
      const param = /** @type {string} */ (row.choice?.param)
      for (const option of row.choice?.options ?? []) {
        expect(
          () => evaluateOp(row.op, { ...row.defaults, [param]: option.value }),
          `${row.op} ${String(option.value)}`
        ).not.toThrow()
      }
    }
  })

  it('commits the chosen model rather than the row default, and lands it at the drop point', () => {
    const document = createDocument()
    const [created, moved] = recordsForDrop(
      'raspberrypi.bplus',
      { x: -40, y: 25 },
      document,
      { model: 5 }
    )
    expect(created.op).toBe('raspberrypi.bplus')
    expect(created.params?.model).toBe(5)
    expect(created.name).toBe('Raspberry Pi 1')
    expect(moved.op).toBe('transform.translate')
    expect(moved.supersedes).toBe(created.id)

    for (const record of [created, moved]) document.append(record, { origin: 'local' })
    const bodies = document.bodies()
    expect(bodies).toHaveLength(1)
    const [min, max] = boundsOf(bodies[0].geometry)
    expect((min[0] + max[0]) / 2).toBeCloseTo(-40, 6)
    expect((min[1] + max[1]) / 2).toBeCloseTo(25, 6)
    expect(min[2]).toBeCloseTo(0, 6)
  })

  it('measures the ghost for the chosen model, not for the default one', () => {
    // The preview and the commit come from one measurement (`ui-010`), and a
    // variant is exactly the case where that could silently drift: a Pi 5 ghost
    // drawn from a Pi 2's box would promise a shape the drop does not deliver.
    const pi2 = ghostBoxAtOrigin('raspberrypi.bplus', { model: 2 })
    const pi5 = ghostBoxAtOrigin('raspberrypi.bplus', { model: 5 })
    expect(pi5.maxMm[2]).not.toBeCloseTo(pi2.maxMm[2], 3)

    const v3 = ghostBoxAtOrigin('raspberrypi.cameraModule', { model: 'v3' })
    const hq = ghostBoxAtOrigin('raspberrypi.cameraModule', { model: 'hq' })
    expect(hq.maxMm[0] - hq.minMm[0]).toBeGreaterThan(v3.maxMm[0] - v3.minMm[0] + 10)
  })

  it('keys a variant apart from its op, stably, whatever order the overrides come in', () => {
    // The viewport caches built ghost geometry per op; a variant changes that
    // geometry, so it has to change the cache key too or the second model dragged
    // shows the first one's mesh.
    expect(variantKey('raspberrypi.bplus')).toBe('raspberrypi.bplus')
    expect(variantKey('raspberrypi.bplus', {})).toBe('raspberrypi.bplus')
    expect(variantKey('raspberrypi.bplus', { model: 5 })).not.toBe(
      variantKey('raspberrypi.bplus', { model: 4 })
    )
    expect(variantKey('raspberrypi.bplus', { model: 5 })).not.toBe('raspberrypi.bplus')
    expect(variantKey('x', { a: 1, b: 2 })).toBe(variantKey('x', { b: 2, a: 1 }))
  })

  it('lands every kit and Raspberry Pi row at the drop point, resting on the grid, as one body', () => {
    // The same claim `ui-030` makes for the four fasteners, across thirteen more
    // recipes — several of which build well below z = 0 in their own frame
    // (a HAT's GPIO header hangs 8.72 mm under its board), so "rests on the grid"
    // is a real measurement here and not a restatement of the recipe's origin.
    for (const row of [...KIT_LIBRARY, ...RASPBERRYPI_LIBRARY]) {
      const document = createDocument()
      const records = recordsForDrop(row.op, { x: 33.5, y: -77.25 }, document)
      expect(records, row.op).toHaveLength(2)
      for (const record of records) document.append(record, { origin: 'local' })
      const bodies = document.bodies()
      expect(bodies, row.op).toHaveLength(1)
      expect(bodies[0].name, row.op).toBe(`${row.label} 1`)
      const [min, max] = boundsOf(bodies[0].geometry)
      expect((min[0] + max[0]) / 2, `${row.op} X`).toBeCloseTo(33.5, 6)
      expect((min[1] + max[1]) / 2, `${row.op} Y`).toBeCloseTo(-77.25, 6)
      expect(min[2], `${row.op} does not rest on Z=0`).toBeCloseTo(0, 6)
      expect(max[2], `${row.op} has no height`).toBeGreaterThan(0)
    }
  })

  it('does not absorb the body placed before it (TODO/done/core-020, across the new kinds)', () => {
    // `CLAUDE.md`'s standing-regression-surface rule: every one of these is a new
    // composite kind reaching the expansion path that finding was fixed in, so the
    // finding's own repro is re-run against them rather than assumed discharged by
    // the fasteners having passed it.
    for (const op of [
      'kit.board',
      'kit.anchor',
      'raspberrypi.bplus',
      'raspberrypi.cameraModule',
      'raspberrypi.hat',
      'raspberrypi.spacer',
    ]) {
      const document = createDocument()
      document.append(recordForDrop('primitive.cuboid', { x: 0, y: 0 }, document), {
        origin: 'local',
      })
      const [created] = recordsForDrop(op, { x: 200, y: 0 }, document)
      document.append(created, { origin: 'local' })
      const asBuilt = /** @type {any} */ (document.bodies()[1].geometry)
      // Its own parts, and never "Cube 1" among them — the exact assertion
      // core-020 turned on.
      expect(asBuilt.names ?? [], op).not.toContain('Cube 1')
      // And its own size: the bug stretched a composite's bounds back to whatever
      // was placed before it.
      const [min, max] = boundsOf(asBuilt)
      expect(max[0] - min[0], `${op} spans back to the cube`).toBeLessThan(200)
      expect(document.bodies().map((body) => body.name)[0], op).toBe('Cube 1')
    }
  })
})

describe('recordsForDrop — placing a composite, which has no position param (TODO/ui-030)', () => {
  it('commits a primitive as exactly one record, position folded into its own params', () => {
    const document = createDocument()
    const records = recordsForDrop('primitive.cuboid', { x: 12, y: -8 }, document)
    expect(records).toHaveLength(1)
    expect(records[0].op).toBe('primitive.cuboid')
    expect(records[0].params?.center).toEqual([12, -8, 20])
  })

  it('commits a composite as its own record plus a trailing translate that supersedes it', () => {
    const document = createDocument()
    const records = recordsForDrop('hardware.bolt', { x: 30, y: -45 }, document)
    expect(records).toHaveLength(2)
    const [created, moved] = records
    expect(created.op).toBe('hardware.bolt')
    expect(created.name).toBe('Bolt 1')
    // The recipe would silently ignore a `center`, so folding the drop point in
    // there — the primitive path's shortcut — would place every bolt at the
    // recipe's own fixed origin however far the user dragged.
    expect(created.params?.center).toBeUndefined()
    expect(moved.op).toBe('transform.translate')
    expect(moved.target).toBe(created.id)
    // Supersession, not a second body: one drag is one thing on screen.
    expect(moved.supersedes).toBe(created.id)
    expect(moved.name).toBeUndefined()
    expect(moved.params?.vector).toEqual([30, -45, 0])
  })

  it('lands every hardware row at the drop point, resting on the grid, as one body', () => {
    // The specific regression Option 2 of TODO/ui-030 exists to prevent: a part
    // committed at the recipe's internal origin rather than where it was dropped.
    for (const row of HARDWARE_LIBRARY) {
      const document = createDocument()
      const records = recordsForDrop(row.op, { x: -62.5, y: 18.25 }, document)
      let scene = null
      for (const record of records) ({ scene } = document.append(record, { origin: 'local' }))
      const bodies = document.bodies()
      expect(bodies, row.op).toHaveLength(1)
      expect(bodies[0].name, row.op).toBe(`${row.label} 1`)
      expect(bodies[0].op, row.op).toBe(row.op)
      const [min, max] = boundsOf(bodies[0].geometry)
      expect((min[0] + max[0]) / 2, `${row.op} X`).toBeCloseTo(-62.5, 6)
      expect((min[1] + max[1]) / 2, `${row.op} Y`).toBeCloseTo(18.25, 6)
      expect(min[2], `${row.op} does not rest on Z=0`).toBeCloseTo(0, 6)
      expect(max[2], `${row.op} has no height`).toBeGreaterThan(0)
      expect(scene).not.toBeNull()
    }
  })

  it('does not absorb the body placed before it (TODO/done/core-020, through the drop path)', () => {
    // core-020's own reproduction — a plate, then a bolt — driven through the
    // records a *drag-drop* commits rather than through a hand-built
    // `document.append` call, which is what this task makes possible for the
    // first time. Both records are checked, because the composite's own group is
    // built by the first one and the second is a new way to reach the same fold.
    const document = createDocument()
    document.append(recordForDrop('primitive.cuboid', { x: 0, y: 0 }, document), { origin: 'local' })
    const [created, moved] = recordsForDrop('hardware.bolt', { x: 60, y: 0 }, document)

    document.append(created, { origin: 'local' })
    const asBuilt = /** @type {any} */ (document.bodies()[1].geometry)
    // Its own visible parts, and not "Cube 1" among them — the exact
    // assertion core-020 turned on. `tap` is hidden by default as of
    // TODO/render-004 (2026-09-26), so it no longer counts as "visible".
    expect(asBuilt.names).toEqual(['head', 'thread'])
    const [boltMin, boltMax] = boundsOf(asBuilt)
    expect(boltMax[0] - boltMin[0]).toBeLessThan(25)

    document.append(moved, { origin: 'local' })
    const bodies = document.bodies()
    expect(bodies.map((body) => body.name)).toEqual(['Cube 1', 'Bolt 1'])
    // The cube is still its own size and still 60 mm away, not swallowed.
    const [cubeMin, cubeMax] = boundsOf(bodies[0].geometry)
    expect(cubeMax[0] - cubeMin[0]).toBeCloseTo(40, 6)
    const [movedMin, movedMax] = boundsOf(bodies[1].geometry)
    expect((movedMin[0] + movedMax[0]) / 2).toBeCloseTo(60, 6)
    expect(movedMax[0] - movedMin[0]).toBeCloseTo(boltMax[0] - boltMin[0], 6)
  })

  it('still does not absorb an earlier body when a boolean addresses its sub-part', () => {
    // `TODO/done/core-020`'s regression surface, re-entered deliberately
    // (CLAUDE.md's standing-regression-surface rule): `TODO/core-024` puts new code
    // in the exact fold that finding was filed against — the incremental
    // `document.append` path — and adds a *second* way for a composite's parts to
    // reach an op. The symptom to rule out is the same one: the bolt's group
    // quietly containing "Cube 1", so cutting with it erases the cube and returns
    // an empty solid.
    const document = createDocument()
    document.append(recordForDrop('primitive.cuboid', { x: 0, y: 0 }, document), { origin: 'local' })
    for (const record of recordsForDrop('hardware.bolt', { x: 0, y: 0 }, document)) {
      document.append(record, { origin: 'local' })
    }

    const [cube, bolt] = document.bodies()
    const placed = /** @type {any} */ (bolt.geometry)
    // Only the bolt's own parts, after the drop translate as well as before it.
    // `tap` is addressable below via `pieces: 'tap'` even though it is hidden by
    // default (TODO/render-004), the same as it was when visible.
    expect(placed.names).toEqual(['head', 'thread'])
    expect(Object.keys(placed.parts)).not.toContain('Cube 1')

    // And the severe consequence that finding turned on, now through a *sub-part*
    // operand rather than a whole one: the result is the cube minus a bolt-sized
    // hole, never the EMPTY solid the bug produced.
    const { group } = evaluate([
      { id: 'shell', op: 'primitive.cuboid', params: { size: [40, 40, 40], center: [0, 0, 20] } },
      { id: 'bolt', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 20, fit: 'loose' } },
      { id: 'drop', op: 'transform.translate', params: { vector: [0, 0, 0] }, target: 'bolt' },
      {
        id: 'cut',
        op: 'boolean.subtract',
        target: 'shell',
        operands: [{ id: 'drop', pieces: 'tap' }],
        name: 'r',
      },
    ])
    const shellVolume = 40 * 40 * 40
    const cutVolume = volumeOf(group.parts.r)
    expect(cutVolume).toBeGreaterThan(0)
    expect(cutVolume).toBeLessThan(shellVolume)
    expect(boundsOf(group.parts.r)).toEqual([
      [-20, -20, 0],
      [20, 20, 40],
    ])
    // The cube placed first is untouched by any of it.
    const [cubeMin, cubeMax] = boundsOf(cube.geometry)
    expect(cubeMax[0] - cubeMin[0]).toBeCloseTo(40, 6)
  })

  it('keeps the placed composite’s named parts through its own drop translate', () => {
    // This expectation used to read the other way, and said so: the fold flattened
    // every operand, so the trailing translate a composite drop commits collapsed
    // the group and a *placed* part had no addressable sub-parts. `TODO/core-024`
    // is the task that came to want them — `ACCEPTANCE.md` scenario 5 addresses a
    // bolt's `tap` on the body the user actually dropped — and the decision it
    // made is that a transform preserves what it is handed. A bolt you moved is
    // still a bolt.
    const document = createDocument()
    for (const record of recordsForDrop('hardware.bolt', { x: 0, y: 0 }, document)) {
      document.append(record, { origin: 'local' })
    }
    const placed = /** @type {any} */ (document.bodies()[0].geometry)
    // `tap` is hidden by default (TODO/render-004) but still a named part.
    expect(placed.names).toEqual(['head', 'thread'])
    expect(Object.keys(placed.parts)).toContain('tap')
    expect(Object.keys(placed.parts)).toContain('tap-thread')
  })

  it('numbers hardware instances per type, like the primitive rows', () => {
    const document = createDocument()
    const names = []
    for (const op of ['hardware.bolt', 'hardware.nut', 'hardware.bolt']) {
      const records = recordsForDrop(op, { x: 0, y: 0 }, document)
      for (const record of records) document.append(record, { origin: 'local' })
      names.push(String(records[0].name))
    }
    expect(names).toEqual(['Bolt 1', 'Nut 1', 'Bolt 2'])
  })

  it('refuses the single-record shortcut for a composite rather than misplacing it', () => {
    const document = createDocument()
    expect(() => recordForDrop('hardware.bolt', { x: 5, y: 5 }, document)).toThrow(
      /recordsForDrop/
    )
  })

  it('leaves a composite drop out of the params entirely', () => {
    const params = paramsForDrop('hardware.washer', { x: 99, y: 99 })
    expect(params.center).toBeUndefined()
    expect(params.spec).toBe('m6')
  })

  it('measures a composite ghost as the shape that will actually land', () => {
    // The ghost the user drags and the solid the drop commits come from one
    // measurement, so the preview cannot promise a position the commit ignores.
    const box = ghostBoxAtOrigin('hardware.nut')
    expect(box.minMm[2]).toBeCloseTo(0, 6)
    expect((box.minMm[0] + box.maxMm[0]) / 2).toBeCloseTo(0, 6)
    const offset = ghostOffsetMm('hardware.nut')
    // A centred hexagon has to be lifted by half its height to rest on the grid.
    expect(offset[2]).toBeCloseTo(box.maxMm[2] / 2, 6)
    expect(ghostOffsetMm('primitive.cuboid')).toEqual([0, 0, 0])
  })
})

describe('recordForDrop — one generic drop, parameterised by which op the row names', () => {
  it('builds a record for any of the seven rows without a per-primitive branch', () => {
    const document = createDocument()
    for (const row of PRIMITIVE_LIBRARY) {
      const record = recordForDrop(row.op, { x: 0, y: 0 }, document)
      expect(record.op).toBe(row.op)
      expect(record.id).toMatch(/\S/)
      expect(record.name).toBe(`${row.label} 1`)
      expect(() => document.append(record, { origin: 'local' })).not.toThrow()
    }
    expect(document.bodies()).toHaveLength(7)
  })

  it('places the drop point in X/Y — not a fixed-origin spawn', () => {
    const document = createDocument()
    const record = recordForDrop('primitive.cuboid', { x: 42.5, y: -17.25 }, document)
    const { scene } = document.append(record, { origin: 'local' })
    const bounds = measurements.measureBoundingBox(
        /** @type {any} */ (scene.byId.get(String(record.id)))
      )
    expect((bounds[0][0] + bounds[1][0]) / 2).toBeCloseTo(42.5, 6)
    expect((bounds[0][1] + bounds[1][1]) / 2).toBeCloseTo(-17.25, 6)
  })

  it('rests every primitive on the working plane rather than half-burying it', () => {
    // The drop point is on the Z=0 grid; a solid centred there would sit half
    // underground, which reads as a bug the first time anyone drops a cube.
    const document = createDocument()
    for (const row of PRIMITIVE_LIBRARY) {
      const record = recordForDrop(row.op, { x: 10, y: 20 }, document)
      const { scene } = document.append(record, { origin: 'local' })
      const bounds = measurements.measureBoundingBox(
        /** @type {any} */ (scene.byId.get(String(record.id)))
      )
      expect(bounds[0][2], `${row.op} does not rest on Z=0`).toBeCloseTo(0, 6)
      expect(bounds[1][2], `${row.op} has no height`).toBeGreaterThan(0)
    }
  })

  it('numbers each type independently, so names never collide', () => {
    const document = createDocument()
    const names = []
    for (const op of ['primitive.cuboid', 'primitive.sphere', 'primitive.cuboid']) {
      const record = recordForDrop(op, { x: 0, y: 0 }, document)
      document.append(record, { origin: 'local' })
      names.push(String(record.name))
    }
    expect(names).toEqual(['Cube 1', 'Sphere 1', 'Cube 2'])
  })

  it('rejects an op that is not a library row', () => {
    const document = createDocument()
    expect(() => recordForDrop('boolean.union', { x: 0, y: 0 }, document)).toThrow(/boolean\.union/)
    expect(() => recordForDrop('primitive.dodecahedron', { x: 0, y: 0 }, document)).toThrow()
  })
})

describe('snapToleranceMm — "close enough" reads the same at every zoom level', () => {
  it('converts the screen-space tolerance radius into millimetres', () => {
    // TODO/ui-013: the constant is a *pixel* radius, converted at the boundary,
    // so zooming in makes the tolerance smaller in millimetres and identical on
    // screen — rather than a fixed millimetre radius that covers half the
    // viewport when zoomed out and a hair's width when zoomed in.
    expect(snapToleranceMm(0.5)).toBeCloseTo(SNAP_TOLERANCE_PX * 0.5, 9)
    expect(snapToleranceMm(2)).toBeCloseTo(SNAP_TOLERANCE_PX * 2, 9)
  })

  it('refuses to snap at all when there is no scale to convert with', () => {
    // Before the viewport has been measured there is no honest tolerance, and
    // guessing one would snap a drop the user never asked to have moved.
    expect(snapToleranceMm(0)).toBe(0)
    expect(snapToleranceMm(-1)).toBe(0)
    expect(snapToleranceMm(Number.NaN)).toBe(0)
  })
})

describe('alignmentOffsetMm — the same arithmetic group.js already snaps with', () => {
  it('agrees exactly with calcSnap/calcCenterWith for every alignment', () => {
    // TODO/ui-013's Proposed fix asks for `calcSnap`'s maths to be reused. It is
    // reused as *arithmetic* rather than as a call, because `calcSnap` measures
    // a solid's bounding box and allocates a vector per call, and this runs on
    // every `pointermove` against five candidate alignments per axis
    // (CLAUDE.md's Performance rule). The equivalence is pinned here rather than
    // claimed in a comment: each alignment is checked against the very
    // `SNAP_SIDES` orientation it names.
    const reference = evaluateOp('primitive.cuboid', { size: [40, 40, 40], center: [0, 0, 20] })
    const moving = evaluateOp('primitive.cylinder', { diameter: 24, height: 50, center: [37, 11, 25] })
    const movingBox = { minMm: [37 - 12, 11 - 12, 0], maxMm: [37 + 12, 11 + 12, 50] }
    const referenceBox = cubeBox(0, 0)

    for (const [index, alignment] of SNAP_ALIGNMENTS.entries()) {
      for (const axis of [0, 1]) {
        const offset = alignmentOffsetMm(
          index,
          movingBox.minMm[axis],
          movingBox.maxMm[axis],
          referenceBox.minMm[axis],
          referenceBox.maxMm[axis],
        )
        const expected = alignment.orientation
          ? calcSnap(moving, reference, 'xyz', alignment.orientation)[axis]
          : calcCenterWith(moving, 'xyz', reference)[axis]
        expect(offset, `${alignment.id} on axis ${axis}`).toBeCloseTo(expected, 9)
      }
    }
  })

  it('names the reference feature each alignment lands the ghost on', () => {
    const { minMm, maxMm } = cubeBox(0, 0)
    const coords = SNAP_ALIGNMENTS.map((_, index) => alignmentCoordMm(index, minMm[0], maxMm[0]))
    // Centre alignment sits on the reference's centre line; every other
    // alignment sits on one of its two faces. That is what the dashed guide is
    // drawn along.
    expect(coords).toEqual([0, -20, 20, 20, -20])
  })
})

describe('ghostBoxAtOrigin / boxAtPoint — the ghost measured once, moved per pointermove', () => {
  it('measures the resting box a drop at the origin would produce', () => {
    const box = ghostBoxAtOrigin('primitive.cuboid')
    expect(box.minMm[0]).toBeCloseTo(-20, 6)
    expect(box.maxMm[0]).toBeCloseTo(20, 6)
    // Resting on the plane, exactly as `restingCenter` places it.
    expect(box.minMm[2]).toBeCloseTo(0, 6)
    expect(box.maxMm[2]).toBeCloseTo(40, 6)
  })

  it('translates in the working plane only, leaving the resting height alone', () => {
    const out = createBoxMm()
    boxAtPoint(ghostBoxAtOrigin('primitive.cuboid'), { x: 100, y: -30 }, out)
    expect(out.minMm).toEqual([80, -50, 0])
    expect(out.maxMm).toEqual([120, -10, 40])
  })
})

describe('updateSnap — the ghost is pulled onto the nearest item, within tolerance', () => {
  it('snaps both axes onto the reference and reports a guide for each', () => {
    const state = createSnapState()
    updateSnap(cubeBox(15, 0), cubeBox(0, 0), 20, state)
    expect(state.snapped).toBe(true)
    // X: centre alignment wins on a tie with the two flush-face candidates
    // (same-size boxes make all three identical), and centre is first in
    // preference order — so this is deterministic, not arbitrary.
    expect(state.dxMm).toBeCloseTo(-15, 9)
    expect(state.dyMm).toBeCloseTo(0, 9)
    expect(state.guides.map((guide) => guide.visible)).toEqual([true, true])
    expect(state.guides.map((guide) => guide.kind)).toEqual(['center', 'center'])
  })

  it('draws each guide along the reference feature, spanning out to the ghost', () => {
    const state = createSnapState()
    // Beside the reference and a little above it: X centre-aligns (−15 mm away),
    // Y lands on the reference's near face (−5 mm away, a touching alignment).
    updateSnap(cubeBox(15, 45), cubeBox(0, 0), 20, state)
    expect(state.snapped).toBe(true)
    expect(state.dxMm).toBeCloseTo(-15, 9)
    expect(state.dyMm).toBeCloseTo(-5, 9)
    const [guideX, guideY] = state.guides
    expect(guideX.visible).toBe(true)
    expect(guideY.visible).toBe(true)
    expect([guideX.kind, guideY.kind]).toEqual(['center', 'edge'])

    // A line of constant X on the reference's centre line, running from the
    // reference's own far edge out past the ghost's — the union of the two
    // boxes on that axis (−20 … 60), plus one tolerance of overhang at each end
    // so the line reads as a guide rather than as an edge of the solid.
    expect(guideX.x1Mm).toBeCloseTo(0, 9)
    expect(guideX.x2Mm).toBeCloseTo(0, 9)
    expect(Math.min(guideX.y1Mm, guideX.y2Mm)).toBeCloseTo(-40, 9)
    expect(Math.max(guideX.y1Mm, guideX.y2Mm)).toBeCloseTo(80, 9)
    // And a line of constant Y along the reference's own max face.
    expect(guideY.y1Mm).toBeCloseTo(20, 9)
    expect(guideY.y2Mm).toBeCloseTo(20, 9)
    expect(Math.min(guideY.x1Mm, guideY.x2Mm)).toBeCloseTo(-40, 9)
    expect(Math.max(guideY.x1Mm, guideY.x2Mm)).toBeCloseTo(40, 9)
    // On the working plane the two solids rest on, not floating at mid-height.
    expect(guideX.zMm).toBeCloseTo(0, 9)
  })

  it('will not snap to an item the ghost is nowhere near, however well aligned', () => {
    // The proximity gate. Perfectly centred on the reference's X, but 180 mm up
    // the Y axis from it: §7a asks for a snap within a tolerance *radius* "on
    // approach", and without this a drop at the far corner of the grid gets
    // silently shifted into line with something the user was not aiming at.
    const state = createSnapState()
    updateSnap(cubeBox(0, 200), cubeBox(0, 0), 20, state)
    expect(state.snapped).toBe(false)
    expect(state.dxMm).toBe(0)
    expect(state.guides.map((guide) => guide.visible)).toEqual([false, false])
  })

  it('measures the gap as zero for extents that overlap or merely touch', () => {
    expect(gapMm(0, 10, 5, 20)).toBe(0)
    expect(gapMm(0, 10, 10, 20)).toBe(0)
    expect(gapMm(0, 10, -100, 100)).toBe(0)
    expect(gapMm(0, 10, 14, 20)).toBeCloseTo(4, 9)
    expect(gapMm(30, 40, 0, 10)).toBeCloseTo(20, 9)
  })

  it('leaves a far-away ghost exactly where the pointer put it', () => {
    const state = createSnapState()
    updateSnap(cubeBox(75, 75), cubeBox(0, 0), 10, state)
    expect(state.snapped).toBe(false)
    expect(state.dxMm).toBe(0)
    expect(state.dyMm).toBe(0)
    expect(state.guides.map((guide) => guide.visible)).toEqual([false, false])
  })

  it('snaps exactly at the tolerance boundary, and not a hair past it', () => {
    // At (75, 75) the closest alignment on either axis is the touching-face
    // one, 35 mm away: 20 (reference max) − 55 (ghost min).
    const atBoundary = createSnapState()
    updateSnap(cubeBox(75, 75), cubeBox(0, 0), 35, atBoundary)
    expect(atBoundary.snapped).toBe(true)
    expect(atBoundary.dxMm).toBeCloseTo(-35, 9)
    expect(atBoundary.guides[0].kind).toBe('edge')

    const justOutside = createSnapState()
    updateSnap(cubeBox(75, 75), cubeBox(0, 0), 34.999, justOutside)
    expect(justOutside.snapped).toBe(false)
  })

  it('never snaps when the tolerance is zero — no scale, no assistance', () => {
    const state = createSnapState()
    updateSnap(cubeBox(0.001, 0), cubeBox(0, 0), 0, state)
    expect(state.snapped).toBe(false)
    expect(state.dxMm).toBe(0)
  })

  it('clears back to an un-snapped state, so a stale guide can never linger', () => {
    const state = createSnapState()
    updateSnap(cubeBox(15, 0), cubeBox(0, 0), 20, state)
    expect(state.snapped).toBe(true)
    clearSnap(state)
    expect(state.snapped).toBe(false)
    expect(state.dxMm).toBe(0)
    expect(state.dyMm).toBe(0)
    expect(state.guides.map((guide) => guide.visible)).toEqual([false, false])
  })

  it('allocates nothing per call: the same arrays are mutated in place', () => {
    // CLAUDE.md's Performance rule — this runs on every `pointermove` of a drag.
    const state = createSnapState()
    const guides = state.guides
    const firstGuide = state.guides[0]
    updateSnap(cubeBox(15, 0), cubeBox(0, 0), 20, state)
    updateSnap(cubeBox(400, 400), cubeBox(0, 0), 20, state)
    expect(state.guides).toBe(guides)
    expect(state.guides[0]).toBe(firstGuide)
  })
})

describe('the guide overhang — found by driving the app, not by reading the maths', () => {
  it('extends a centred guide past the solids, so it is not a stub under them', () => {
    // When the ghost centres on the reference the two boxes coincide, and a
    // guide spanning only their union is exactly as long as the solid it is
    // drawn on top of — correct, and invisible. This is the regression test for
    // that: the line has to run visibly past both.
    const state = createSnapState()
    updateSnap(cubeBox(0, 0), cubeBox(0, 0), 20, state)
    expect(state.snapped).toBe(true)
    const [guideX] = state.guides
    const spanMm = Math.abs(guideX.y2Mm - guideX.y1Mm)
    const solidMm = 40
    expect(spanMm).toBeGreaterThan(solidMm)
    // One tolerance past each end: 40 mm of solid plus 2 × 20 mm.
    expect(spanMm).toBeCloseTo(80, 9)
  })

  it('scales the overhang with the tolerance, so it looks the same at any zoom', () => {
    const near = createSnapState()
    const far = createSnapState()
    updateSnap(cubeBox(0, 0), cubeBox(0, 0), 10, near)
    updateSnap(cubeBox(0, 0), cubeBox(0, 0), 40, far)
    expect(Math.abs(near.guides[0].y2Mm - near.guides[0].y1Mm)).toBeCloseTo(60, 9)
    expect(Math.abs(far.guides[0].y2Mm - far.guides[0].y1Mm)).toBeCloseTo(120, 9)
  })
})
