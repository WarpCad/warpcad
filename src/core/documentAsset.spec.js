// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `asset.image` record in the document (`TODO/sketch-003`): a data record holding a
 * reference photo's bytes, which a sketch slice names by id. It never reaches the kernel,
 * it is never a body, it commits in the same undo step as the sketch that uses it, and a
 * hostile one loaded from a file is dropped with a warning rather than refusing the file.
 */
import { describe, expect, it } from 'vitest'

import { createDocument } from './document.js'
import { parseProject, serializeProject } from './project.js'
import { applyAction, emptyScene } from './replay.js'
import { describeRow } from './timelineLabel.js'
import { registry as realRegistry } from './kernel/registry.js'
import { pngBytes, validAssetRecord } from '../sketch/__fixtures__/images.js'
import { base64FromBytes } from '../sketch/imageAsset.js'

/** @type {any} */
const fakeRegistry = Object.freeze({
  'fake.box': Object.freeze({
    kind: 'native',
    operandCount: 0,
    build: (/** @type {any} */ { params }) => ({ tag: 'box', size: params.size ?? 1 }),
  }),
  'fake.move': Object.freeze({
    kind: 'native',
    operandCount: 1,
    build: () => ({ tag: 'moved' }),
  }),
})

const ASSET = validAssetRecord()

/** A sketch whose one slice names the asset. Real registry. */
function sketchRecord(id = 'sketch-1', assetId = ASSET.id) {
  return {
    id,
    op: 'primitive.sketch',
    name: 'Sketch 1',
    params: {
      center: [0, 0, 0],
      slices: [
        {
          id: 's1',
          zMm: 0,
          profiles: [{ id: 'p1', kind: 'circle', role: 'solid', centerMm: [0, 0], radiusMm: 10 }],
          image: { assetId, offsetMm: [0, 0], rotationDeg: 0, opacity: 0.5, mmPerPx: 0.1 },
        },
      ],
      extrusion: { method: 'linear', heightMm: 5, twistDeg: 0, twistSteps: 1 },
    },
  }
}

describe('asset.image never reaches the kernel', () => {
  it('appends without a registry entry, and a registry entry by that name is never called', () => {
    let calls = 0
    const counting = Object.freeze({
      ...fakeRegistry,
      'asset.image': Object.freeze({
        kind: 'native',
        operandCount: 0,
        build: () => {
          calls += 1
          return { tag: 'should-not-happen' }
        },
      }),
    })
    for (const registry of [fakeRegistry, counting]) {
      const document = createDocument({ registry })
      document.append({ id: 'a', op: 'fake.box', name: 'Box 1' }, { origin: 'local' })
      document.append(ASSET, { origin: 'local' })
      document.undo()
      document.redo()
      expect(document.scene.byId.has(ASSET.id)).toBe(false)
      expect(document.bodies().map((body) => body.id)).toEqual(['a'])
    }
    expect(calls).toBe(0)
  })

  it('replay.applyAction folds a valid asset as a no-op and reports a hostile one', () => {
    const scene = emptyScene()
    const kept = applyAction(scene, /** @type {any} */ (ASSET), fakeRegistry)
    expect(kept.errors).toEqual([])
    expect(kept.byId.size).toBe(0)
    const hostile = applyAction(scene, /** @type {any} */ ({ ...ASSET, params: { ...ASSET.params, mime: 'image/svg+xml' } }), fakeRegistry)
    expect(hostile.errors).toHaveLength(1)
    expect(hostile.errors[0]).toMatchObject({ id: ASSET.id, op: 'asset.image' })
    expect(hostile.errors[0].message).toMatch(/svg/)
  })
})

describe('assets()', () => {
  it('lists asset records by id, and they are not bodies', () => {
    const document = createDocument({ registry: fakeRegistry })
    document.append(ASSET, { origin: 'local' })
    expect([...document.assets().keys()]).toEqual([ASSET.id])
    expect(document.assets().get(ASSET.id)).toBe(ASSET)
    expect(document.bodies()).toEqual([])
  })

  it('refuses a hostile asset on a local append, loudly, and appends nothing', () => {
    const document = createDocument({ registry: fakeRegistry })
    expect(() => document.append(/** @type {any} */ ({ ...ASSET, url: 'https://tracker.example/p.png' }), { origin: 'local' })).toThrow(/unexpected field "url"/)
    expect(document.records).toEqual([])
  })

  it('refuses anything that tries to supersede or operate on an asset', () => {
    const document = createDocument({ registry: fakeRegistry })
    document.append(ASSET, { origin: 'local' })
    expect(() => document.append({ id: 'm', op: 'fake.move', supersedes: ASSET.id, target: ASSET.id }, { origin: 'local' })).toThrow()
    expect(() => document.append({ ...validAssetRecord('img-aaaaaaaaaaaaaaaaaaaaaaaa'), supersedes: ASSET.id }, { origin: 'local' })).toThrow()
  })
})

describe('a sketch and its photo commit as one undo step', () => {
  it('appendAll([asset, sketch]) is one step; undo removes both, redo restores both', () => {
    const document = createDocument({ registry: realRegistry })
    document.appendAll([ASSET, sketchRecord()], { origin: 'local', label: 'Place Sketch 1' })
    expect(document.bodies().map((body) => body.id)).toEqual(['sketch-1'])
    expect(document.assets().has(ASSET.id)).toBe(true)
    expect(document.pendingUndo()?.label).toBe('Place Sketch 1')
    document.undo()
    expect(document.records).toEqual([])
    expect(document.assets().size).toBe(0)
    document.redo()
    expect(document.records.map((record) => record.id)).toEqual([ASSET.id, 'sketch-1'])
  })

  it('reviseRecords can append the new photo in the same step as the edit (Edit sketch → Add image → Done)', () => {
    const document = createDocument({ registry: realRegistry })
    const plain = sketchRecord()
    delete (/** @type {any} */ (plain.params.slices[0])).image
    document.append(plain, { origin: 'local' })
    const edited = sketchRecord()
    document.reviseRecords([{ id: 'sketch-1', record: edited }], { origin: 'local', label: 'Edit Sketch 1' }, { append: [ASSET] })
    expect(document.records.map((record) => record.id)).toEqual(['sketch-1', ASSET.id])
    expect(document.recordOf('sketch-1')?.params?.slices[0].image.assetId).toBe(ASSET.id)
    expect(document.pendingUndo()?.label).toBe('Edit Sketch 1')

    document.undo()
    expect(document.records.map((record) => record.id)).toEqual(['sketch-1'])
    expect(document.recordOf('sketch-1')?.params?.slices[0].image).toBeUndefined()
    expect(document.assets().size).toBe(0)
    expect(document.canUndo()).toBe(true) // the original append is still there to undo
    document.undo()
    expect(document.records).toEqual([])

    document.redo()
    document.redo()
    expect(document.records.map((record) => record.id)).toEqual(['sketch-1', ASSET.id])
    expect(document.assets().has(ASSET.id)).toBe(true)
  })

  it('a revise that only appends (nothing else changed) is still a step', () => {
    const document = createDocument({ registry: realRegistry })
    document.append(sketchRecord(), { origin: 'local' })
    document.reviseRecords([{ id: 'sketch-1', record: sketchRecord() }], { origin: 'local' }, { append: [ASSET] })
    expect(document.assets().has(ASSET.id)).toBe(true)
    document.undo()
    expect(document.assets().has(ASSET.id)).toBe(false)
  })
})

describe('a slice referencing a missing asset still builds', () => {
  it('the photo is never geometry', () => {
    const document = createDocument({ registry: realRegistry })
    document.append(sketchRecord('sketch-1', 'img-ffffffffffffffffffffffff'), { origin: 'local' })
    expect(document.bodies()).toHaveLength(1)
    expect(document.assets().size).toBe(0)
  })

  it('the same geometry with and without an image', () => {
    const withImage = createDocument({ registry: realRegistry })
    withImage.append(sketchRecord(), { origin: 'local' })
    const plain = sketchRecord()
    delete (/** @type {any} */ (plain.params.slices[0])).image
    const without = createDocument({ registry: realRegistry })
    without.append(plain, { origin: 'local' })
    expect(JSON.stringify(withImage.bodies()[0].geometry)).toBe(JSON.stringify(without.bodies()[0].geometry))
  })
})

describe('loading a project with hostile images: dropped and reported, never refused', () => {
  const svg = base64FromBytes(new TextEncoder().encode('<svg><script>alert(1)</script></svg>'))
  const hostile = [
    { id: 'img-111111111111111111111111', op: 'asset.image', params: { mime: 'image/svg+xml', widthPx: 10, heightPx: 10, dataBase64: svg } },
    { id: 'img-222222222222222222222222', op: 'asset.image', params: { mime: 'image/png', widthPx: 1, heightPx: 1, url: 'https://tracker.example/p.png' } },
    { id: 'img-333333333333333333333333', op: 'asset.image', params: { mime: 'image/jpeg', widthPx: 4, heightPx: 4, dataBase64: base64FromBytes(pngBytes(4, 4)) } },
    { id: 'img-444444444444444444444444', op: 'asset.image', params: { mime: 'image/png', widthPx: 50000, heightPx: 50000, dataBase64: base64FromBytes(pngBytes(50000, 50000)) } },
  ]

  it('one warning per bad asset, naming it and why; the sketches still load', () => {
    const lines = [
      ...hostile.flatMap((asset, index) => [asset, sketchRecord(`sketch-${index + 1}`, asset.id)]),
      validAssetRecord('img-555555555555555555555555'),
    ]
    const text = lines.map((line) => JSON.stringify(line)).join('\n') + '\n'
    const { entries, warnings } = parseProject(text)
    expect(warnings.map((warning) => warning.id)).toEqual(hostile.map((asset) => asset.id))
    expect(warnings.every((warning) => warning.op === 'asset.image')).toBe(true)
    expect(warnings[0].message).toMatch(/^reference image removed — it couldn't be verified as a safe image \(.*svg/)
    expect(warnings[1].message).toMatch(/url/)
    expect(warnings[2].message).toMatch(/PNG image, declared as image\/jpeg/)
    expect(warnings[3].message).toMatch(/50000 × 50000/)
    expect(entries.map((entry) => entry.record.id)).toEqual(['sketch-1', 'sketch-2', 'sketch-3', 'sketch-4', 'img-555555555555555555555555'])

    const document = createDocument({ registry: realRegistry })
    document.loadEntries(entries, null, 'legacy')
    expect(document.bodies()).toHaveLength(4)
    expect([...document.assets().keys()]).toEqual(['img-555555555555555555555555'])
  })

  it('a state line naming a dropped asset is adjusted, not refused', () => {
    const lines = [
      { id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10] } },
      hostile[0],
      { id: 'cube-2', op: 'primitive.cuboid', name: 'Cube 2', params: { size: [10, 10, 10] } },
      { warpcad: 'project-state', version: 1, suppressed: [hostile[0].id], rollbackAt: 2 },
    ]
    const { entries, rollbackAt, warnings } = parseProject(lines.map((line) => JSON.stringify(line)).join('\n'))
    expect(warnings).toHaveLength(1)
    expect(entries.map((entry) => entry.record.id)).toEqual(['cube-1', 'cube-2'])
    expect(rollbackAt).toBe(1)
  })

  it('a good asset round-trips byte-identical through save and load', () => {
    const document = createDocument({ registry: realRegistry })
    document.appendAll([ASSET, sketchRecord()], { origin: 'local' })
    const text = serializeProject(document)
    const { entries, warnings } = parseProject(text)
    expect(warnings).toEqual([])
    expect(entries[0].record).toEqual(ASSET)
  })
})

describe('the History row', () => {
  it('names the photo by its size, not as a placed body', () => {
    expect(describeRow(/** @type {any} */ (ASSET), new Map())).toBe('Reference image 640 × 480 px')
  })
})

describe('the History row cannot Edit a photo', () => {
  it('stepParamEditability refuses an asset.image row', async () => {
    const { stepParamEditability } = await import('./paramEdit.js')
    expect(stepParamEditability(/** @type {any} */ (ASSET))).toEqual({ editable: false, blockedBy: 'asset.image' })
  })
})
