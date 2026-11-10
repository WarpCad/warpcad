// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The 3MF reader (`TODO/io-024`): a zip, a start part named by `_rels/.rels`, and a model
 * document read by a small linear scanner — then flattened into one placed mesh per part, with
 * exact duplicates collapsed. Every case here is a generated fixture shaped like the owner's
 * FreeCAD export (`../__fixtures__/threeMf.js`) or a hostile variant of it; the owner's file
 * itself is never committed.
 */
import { describe, expect, it } from 'vitest'

import { importMeshBytes, importMeshFile } from '../meshJob.js'
import { meshAssemblyDefinition } from '../meshPart.js'
import { validateUserPart } from '../../core/userPart.js'
import { THREE_MF_LIMITS, parseThreeMf, sniffThreeMf } from './threeMf.js'
import { acceptAttribute, formatForName, parseMeshFile } from './index.js'
import {
  CORE_NS,
  FIXTURE_SIZES,
  boxMeshXml,
  buildZip,
  colouredThreeMf,
  featherShapedModel,
  featherShapedThreeMf,
  modelXml,
  packageThreeMf,
  relsXml,
} from '../__fixtures__/threeMf.js'

const BOX = boxMeshXml([2, 3, 4])
const IDENTITY = '1 0 0 0 1 0 0 0 1 0 0 0'

/** @param {string} objects @param {string} build @param {Parameters<typeof modelXml>[0]['unit']} [unit] */
const pack = (objects, build, unit) => packageThreeMf(modelXml({ objects, build, unit }))

/** @param {Uint8Array} bytes */
async function parsed(bytes) {
  const result = await parseThreeMf(bytes)
  if (!result.ok) throw new Error(result.reason)
  return /** @type {any} */ (result)
}

/** @param {Uint8Array} bytes @param {Partial<typeof THREE_MF_LIMITS>} [overrides] */
async function refusal(bytes, overrides) {
  const result = await parseThreeMf(bytes, undefined, overrides)
  expect(result.ok).toBe(false)
  return result.ok ? '' : result.reason
}

/** @param {any} part */
function placedBounds(part) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  const m = part.matrix
  for (let i = 0; i < part.positions.length; i += 3) {
    const [x, y, z] = [part.positions[i], part.positions[i + 1], part.positions[i + 2]]
    const p = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]
    for (let a = 0; a < 3; a += 1) {
      min[a] = Math.min(min[a], p[a])
      max[a] = Math.max(max[a], p[a])
    }
  }
  return { min, max }
}

describe('the FreeCAD shape', () => {
  it('three coincident sets of three unnamed objects give three parts and six duplicates skipped', async () => {
    const result = await parsed(await featherShapedThreeMf())
    expect(result.format).toBe('3mf')
    expect(result.unitScale).toBe(1)
    expect(result.parts).toHaveLength(3)
    expect(result.duplicates).toBe(6)
    expect(result.parts.map((/** @type {any} */ part) => part.name)).toEqual([null, null, null])
    // The box placed twice shares one mesh, so it is stored once.
    expect(result.parts[1].positions).toBe(result.parts[2].positions)
    expect(result.parts[0].positions).not.toBe(result.parts[1].positions)
  })

  it('reads the quarter turn with its 2.22045e-16 terms', async () => {
    const { parts } = await parsed(await featherShapedThreeMf())
    const { min, max } = placedBounds(parts[2])
    // Box 16 × 24 × 2.95: x' = y + 4.445, y' = -x + 11.43, z' = z + 1.57.
    expect(min[0]).toBeCloseTo(4.445, 5)
    expect(max[0]).toBeCloseTo(28.445, 5)
    expect(min[1]).toBeCloseTo(-4.57, 5)
    expect(max[1]).toBeCloseTo(11.43, 5)
    expect(min[2]).toBeCloseTo(1.57, 5)
  })

  it('imports as an assembly whose parts are Part 1 … Part 3, with the whole model on the ground', async () => {
    const result = await importMeshBytes('feather.3mf', await featherShapedThreeMf())
    if (!result.ok || result.kind !== 'assembly') throw new Error(result.ok ? 'not an assembly' : result.reason)
    expect(result.parts.map((part) => part.name)).toEqual(['Part 1', 'Part 2', 'Part 3'])
    expect(result.assets).toHaveLength(2)
    expect(result.duplicates).toBe(6)
    expect(result.triangleCount).toBe(36)
    expect(result.unitsStated).toBe(true)
    // x 0..50.8 (the plate), y -4.57..24, z 0..4.52.
    expect(result.sizeMm[0]).toBeCloseTo(50.8, 4)
    expect(result.sizeMm[1]).toBeCloseTo(28.57, 4)
    expect(result.sizeMm[2]).toBeCloseTo(4.52, 4)
    const definition = meshAssemblyDefinition({ name: result.name, assets: result.assets, parts: result.parts, unitScale: result.unitScale })
    const verdict = validateUserPart(definition)
    expect(verdict.ok, verdict.ok ? '' : verdict.reason).toBe(true)
    // The plate keeps its own size: 50.8 × 22.86 × 1.57 in the file's frame.
    expect(FIXTURE_SIZES.plate).toEqual([50.8, 22.86, 1.57])
  })

  it('never inflates a thumbnail (the fixture’s are corrupt and would fail if read)', async () => {
    expect((await parseThreeMf(await featherShapedThreeMf())).ok).toBe(true)
  })

  it('is offered by extension and by sniffing', async () => {
    expect(formatForName('feather.3MF')?.id).toBe('3mf')
    expect(acceptAttribute()).toBe('.stl,.3mf')
    expect(sniffThreeMf(await featherShapedThreeMf())).toBe(true)
    const sniffed = await parseMeshFile('feather', await featherShapedThreeMf())
    expect(sniffed.ok && 'parts' in sniffed).toBe(true)
  })

  it('reads a stored (not deflated) package too', async () => {
    const result = await parsed(await packageThreeMf(featherShapedModel(), { method: 0 }))
    expect(result.parts).toHaveLength(3)
  })
})

describe('units', () => {
  it('reads every 3MF unit as millimetres per file unit, and millimetres when absent', async () => {
    const expected = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 }
    for (const [unit, scale] of Object.entries(expected)) {
      expect((await parsed(await pack(`<object id="1">${BOX}</object>`, '<item objectid="1"/>', unit))).unitScale).toBe(scale)
    }
    expect((await parsed(await pack(`<object id="1">${BOX}</object>`, '<item objectid="1"/>', null))).unitScale).toBe(1)
    expect(await refusal(await pack(`<object id="1">${BOX}</object>`, '<item objectid="1"/>', 'furlong'))).toMatch(/unit "furlong"/)
  })

  it('a translation in inches lands in millimetres', async () => {
    const result = await importMeshBytes(
      'two.3mf',
      await pack(`<object id="1">${BOX}</object>`, `<item objectid="1"/><item objectid="1" transform="1 0 0 0 1 0 0 0 1 10 0 0"/>`, 'inch')
    )
    if (!result.ok || result.kind !== 'assembly') throw new Error('expected an assembly')
    expect(result.parts[1].matrix[12] - result.parts[0].matrix[12]).toBeCloseTo(254, 6)
    expect(result.sizeMm[0]).toBeCloseTo(12 * 25.4, 4)
  })
})

describe('names and parts', () => {
  it('uses object names, numbering repeats', async () => {
    const objects = `<object id="1" name="Board">${BOX}</object><object id="2" name="10K">${BOX}</object>`
    const build = `<item objectid="1"/><item objectid="2" transform="${IDENTITY.replace(/0 0 0$/, '5 0 0')}"/><item objectid="2" transform="1 0 0 0 1 0 0 0 1 9 0 0"/>`
    const result = await importMeshBytes('board.3mf', await pack(objects, build))
    if (!result.ok || result.kind !== 'assembly') throw new Error('expected an assembly')
    expect(result.parts.map((part) => part.name)).toEqual(['Board', '10K 1', '10K 2'])
  })

  it('flattens components, multiplying transforms, and names a part by its nearest named ancestor', async () => {
    const objects =
      `<object id="1">${BOX}</object>` +
      `<object id="2" name="Pair"><components><component objectid="1"/><component objectid="1" transform="1 0 0 0 1 0 0 0 1 10 0 0"/></components></object>` +
      `<object id="3" name="Board"><components><component objectid="2" transform="0 1 0 -1 0 0 0 0 1 0 0 0"/></components></object>`
    const result = await parsed(await pack(objects, '<item objectid="3" transform="1 0 0 0 1 0 0 0 1 100 0 0"/>'))
    expect(result.parts).toHaveLength(2)
    expect(result.parts.map((/** @type {any} */ part) => part.name)).toEqual(['Pair', 'Pair'])
    // The second box: +10 in x, then the quarter turn (x' = -y, y' = x), then +100 in x.
    const { min, max } = placedBounds(result.parts[1])
    expect(min[0]).toBeCloseTo(97, 6)
    expect(max[0]).toBeCloseTo(100, 6)
    expect(min[1]).toBeCloseTo(10, 6)
    expect(max[1]).toBeCloseTo(12, 6)
  })

  it('one object is one mesh: the ordinary mesh part, no group', async () => {
    const result = await importMeshBytes('plate.3mf', await pack(`<object id="1">${BOX}</object>`, '<item objectid="1"/>'))
    if (!result.ok || result.kind !== 'assembly') throw new Error('expected an assembly result')
    expect(result.parts).toHaveLength(1)
    const definition = meshAssemblyDefinition({ name: 'plate', assets: result.assets, parts: result.parts })
    expect(definition.records.map((record) => record.op)).toEqual(['asset.mesh', 'import.mesh'])
  })

  it('skips support objects and says how many, and refuses a build of only supports', async () => {
    const objects = `<object id="1">${BOX}</object><object id="2" type="support">${BOX}</object>`
    const result = await parsed(await pack(objects, '<item objectid="1"/><item objectid="2"/>'))
    expect(result.parts).toHaveLength(1)
    expect(result.skippedObjects).toBe(1)
    expect(await refusal(await pack(objects, '<item objectid="2"/>'))).toMatch(/nothing to import/)
  })

  it('makes hostile names safe: __proto__, constructor, empty, 10 KB, control characters, a slash', async () => {
    const names = ['__proto__', 'constructor', '', 'x'.repeat(10_000), 'evil\u0000\u0007name\u0085', 'MCP73831T-2ACI/OT', 'R1,R2']
    const objects = names.map((name, index) => `<object id="${index + 1}" name="${name}">${boxMeshXml([1 + index, 1, 1])}</object>`).join('')
    const build = names.map((_, index) => `<item objectid="${index + 1}" transform="1 0 0 0 1 0 0 0 1 ${index * 10} 0 0"/>`).join('')
    const result = await importMeshBytes('hostile.3mf', await pack(objects, build))
    if (!result.ok || result.kind !== 'assembly') throw new Error(result.ok ? 'expected an assembly' : result.reason)
    const got = result.parts.map((part) => part.name)
    expect(got[0]).toBe('Part 1')
    expect(got[1]).toBe('Part 2')
    expect(got[2]).toBe('Part 3')
    expect(got[3]).toBe('x'.repeat(80))
    expect(got[4]).toBe('evilname')
    expect(got[5]).toBe('MCP73831T-2ACI/OT')
    expect(got[6]).toBe('R1 R2')
    const verdict = validateUserPart(meshAssemblyDefinition({ name: 'hostile', assets: result.assets, parts: result.parts }))
    expect(verdict.ok, verdict.ok ? '' : verdict.reason).toBe(true)
  })

  it('decodes the predefined entities and numeric references in a name', async () => {
    const result = await parsed(await pack(`<object id="1" name="A &amp; B &lt;&#x41;&#66;&gt; &quot;q&quot; &apos;">${BOX}</object>`, '<item objectid="1"/>'))
    expect(result.parts[0].name).toBe(`A & B <AB> "q" '`)
  })
})

describe('the scanner', () => {
  it('handles attributes in any order, either quote, <a/> and <a></a>, a prefix, comments and scientific notation', async () => {
    const model =
      `<?xml version="1.0"?><!-- a comment --><ns:model xmlns:ns="${CORE_NS}" unit='millimeter'>` +
      '<ns:resources><ns:object type="model" id=\'1\'><ns:mesh><ns:vertices>' +
      '<ns:vertex z="0" y="0" x="0"></ns:vertex><ns:vertex x="1e1" y="0" z="0"/><ns:vertex y="2.0E+1" x="0" z="0"/>' +
      '<ns:vertex x="0" y="0" z="3e-0"/>' +
      '</ns:vertices><!-- between --><ns:triangles><ns:triangle v3="2" v2="1" v1="0"/><ns:triangle v1="0" v2="3" v3="1"/>' +
      '<ns:triangle v1="0" v2="2" v3="3"/><ns:triangle v1="1" v2="3" v3="2"/></ns:triangles></ns:mesh></ns:object></ns:resources>' +
      '<ns:build><ns:item objectid="1"></ns:item></ns:build></ns:model>'
    const result = await parsed(await packageThreeMf(model))
    expect(Array.from(result.parts[0].positions)).toEqual([0, 0, 0, 10, 0, 0, 0, 20, 0, 0, 0, 3])
    expect(Array.from(result.parts[0].indices)).toEqual([0, 1, 2, 0, 3, 1, 0, 2, 3, 1, 3, 2])
  })

  it('refuses <!DOCTYPE and <!ENTITY outright', async () => {
    const doctype = `<?xml version="1.0"?><!DOCTYPE model [<!ENTITY a "aaaa">]>${modelXml({ objects: `<object id="1">${BOX}</object>`, build: '<item objectid="1"/>' }).replace(/^<\?xml[^>]*>\n/, '')}`
    expect(await refusal(await packageThreeMf(doctype))).toMatch(/DOCTYPE/)
    const entity = modelXml({ objects: `<!ENTITY b "bbbb"><object id="1">${BOX}</object>`, build: '<item objectid="1"/>' })
    expect(await refusal(await packageThreeMf(entity))).toMatch(/ENTITY/)
  })

  it('refuses a UTF-16 file in words', async () => {
    const utf16 = new Uint8Array([0xff, 0xfe, ...new TextEncoder().encode('<model/>')])
    expect(await refusal(await buildZip([{ name: '_rels/.rels', data: relsXml() }, { name: '3D/3dmodel.model', data: utf16 }]))).toMatch(/UTF-16/)
  })

  it('refuses malformed XML: an unclosed tag, a mismatched close', async () => {
    expect(await refusal(await packageThreeMf(`<model xmlns="${CORE_NS}"><resources><object id="1"></resources></model>`))).toMatch(/XML/)
    expect(await refusal(await packageThreeMf(`<model xmlns="${CORE_NS}"><resources`))).toMatch(/XML/)
  })
})

describe('degenerate and hostile packages', () => {
  it('an empty file and a text file named x.3mf are refused', async () => {
    expect(await refusal(new Uint8Array(0))).toMatch(/^Not a valid 3MF/)
    expect(await refusal(new TextEncoder().encode('just some notes'))).toBe('Not a valid 3MF: it is not a zip package')
    const file = new File([new TextEncoder().encode('just some notes')], 'x.3mf')
    expect(await importMeshFile(file)).toEqual({ ok: false, reason: 'Not a valid 3MF: it is not a zip package' })
    expect(await importMeshFile(new File([], 'empty.3mf'))).toEqual({ ok: false, reason: 'Not a valid 3MF: the file is empty' })
  })

  it('a zip with no 3MF relationship', async () => {
    expect(await refusal(await buildZip([{ name: 'notes.txt', data: 'hello' }]))).toMatch(/_rels/)
    const rels = relsXml('/3D/3dmodel.model', 'http://example.com/not-a-model')
    expect(await refusal(await packageThreeMf(featherShapedModel(), { rels }))).toMatch(/no 3D model/)
  })

  it('a relationship naming a missing entry, or ../x, is refused (looked up as a key, never a path)', async () => {
    expect(await refusal(await packageThreeMf(featherShapedModel(), { rels: relsXml('/3D/other.model') }))).toMatch(/3D\/other\.model.*not in the package/)
    expect(await refusal(await packageThreeMf(featherShapedModel(), { rels: relsXml('../x'), modelPath: '../x' }))).toMatch(/\.\.\/x/)
  })

  it('a reference to an object that does not exist', async () => {
    expect(await refusal(await pack(`<object id="1">${BOX}</object>`, '<item objectid="7"/>'))).toMatch(/object 7/)
    const objects = `<object id="1"><components><component objectid="9"/></components></object>`
    expect(await refusal(await pack(objects, '<item objectid="1"/>'))).toMatch(/object 9/)
  })

  it('a component cycle', async () => {
    const objects =
      `<object id="1"><components><component objectid="2"/></components></object>` +
      `<object id="2"><components><component objectid="1"/></components></object>`
    expect(await refusal(await pack(objects, '<item objectid="1"/>'))).toMatch(/cycle/)
  })

  it('ten levels of ten references stops fast, without expanding 10^10 instances', async () => {
    let objects = `<object id="1">${BOX}</object>`
    for (let level = 2; level <= 11; level += 1) {
      const children = Array.from({ length: 10 }, (_, i) => `<component objectid="${level - 1}" transform="1 0 0 0 1 0 0 0 1 ${i * 3} 0 0"/>`).join('')
      objects += `<object id="${level}"><components>${children}</components></object>`
    }
    const started = performance.now()
    const result = await parseThreeMf(await pack(objects, '<item objectid="11"/>'))
    expect(performance.now() - started).toBeLessThan(500)
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.reason).toMatch(/nested more than 8 deep/)
  })

  it('eight levels of ten (10^8 instances) is stopped by counting while expanding', async () => {
    let objects = `<object id="1">${BOX}</object>`
    for (let level = 2; level <= 8; level += 1) {
      // A different power of ten per level, so every leaf lands somewhere different.
      const children = Array.from({ length: 10 }, (_, i) => `<component objectid="${level - 1}" transform="1 0 0 0 1 0 0 0 1 ${i * 10 ** (level - 2)} 0 0"/>`).join('')
      objects += `<object id="${level}"><components>${children}</components></object>`
    }
    const started = performance.now()
    const result = /** @type {any} */ (await parseThreeMf(await pack(objects, '<item objectid="8"/>')))
    expect(performance.now() - started).toBeLessThan(500)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(new RegExp(`more than ${THREE_MF_LIMITS.maxParts} parts`))
    expect(result.counted).toBe(THREE_MF_LIMITS.maxParts + 1)
  })

  it('a duplicate bomb (one leaf at one place, 10^7 times) is stopped by the visit count', async () => {
    let objects = `<object id="1">${BOX}</object>`
    for (let level = 2; level <= 8; level += 1) {
      objects += `<object id="${level}"><components>${`<component objectid="${level - 1}"/>`.repeat(10)}</components></object>`
    }
    const result = /** @type {any} */ (await parseThreeMf(await pack(objects, '<item objectid="8"/>')))
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/more than .* placements/)
  })

  it('an out-of-range vertex index, NaN and huge coordinates', async () => {
    const outOfRange = '<mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="3"/></triangles></mesh>'
    expect(await refusal(await pack(`<object id="1">${outOfRange}</object>`, '<item objectid="1"/>'))).toMatch(/vertex 3/)
    const nan = BOX.replace('x="0"', 'x="NaN"')
    expect(await refusal(await pack(`<object id="1">${nan}</object>`, '<item objectid="1"/>'))).toMatch(/number/)
    const huge = BOX.replace('x="0"', 'x="1e300"')
    expect(await refusal(await pack(`<object id="1">${huge}</object>`, '<item objectid="1"/>'))).toMatch(/beyond/)
    const hex = BOX.replace('x="0"', 'x="0x10"')
    expect(await refusal(await pack(`<object id="1">${hex}</object>`, '<item objectid="1"/>'))).toMatch(/number/)
  })

  it('a non-finite or wrong-length transform', async () => {
    expect(await refusal(await pack(`<object id="1">${BOX}</object>`, '<item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0"/>'))).toMatch(/transform/)
    expect(await refusal(await pack(`<object id="1">${BOX}</object>`, '<item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 Infinity"/>'))).toMatch(/transform/)
  })

  it('an empty build', async () => {
    expect(await refusal(await pack(`<object id="1">${BOX}</object>`, ''))).toMatch(/nothing to import/)
  })

  it('a p:path reference (production extension) is refused in words, never imported in part', async () => {
    const model = modelXml({
      objects: `<object id="1"><components><component p:path="/3D/Objects/object_1.model" objectid="1"/></components></object>`,
      build: '<item objectid="1"/>',
      attributes: ' xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"',
    })
    expect(await refusal(await packageThreeMf(model))).toMatch(/separate model files/)
  })

  it('an unknown required extension is refused; a known one (materials) is read', async () => {
    const unknown = modelXml({ objects: `<object id="1">${BOX}</object>`, build: '<item objectid="1"/>', attributes: ' xmlns:b="http://schemas.microsoft.com/3dmanufacturing/beamlattice/2017/02" requiredextensions="b"' })
    expect(await refusal(await packageThreeMf(unknown))).toMatch(/beamlattice/)
    const materials = modelXml({ objects: `<object id="1" pid="1" pindex="0">${BOX}</object>`, build: '<item objectid="1"/>', attributes: ' xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02" requiredextensions="m"' })
    expect((await parseThreeMf(await packageThreeMf(materials))).ok).toBe(true)
  })

  it('refuses inflated XML over the cap without reading it all', async () => {
    const bytes = await featherShapedThreeMf()
    expect(await refusal(bytes, { maxXmlBytes: 1000 })).toMatch(/larger than/)
  })
})

describe('colours (TODO/io-027)', () => {
  /** @param {any} result @param {string} name */
  const named = (result, name) => result.parts.find((/** @type {any} */ part) => part.name === name)

  it('reads an object colour from basematerials, a colorgroup (with alpha), and uniform triangle colours', async () => {
    const result = await parsed(await colouredThreeMf())
    expect(named(result, 'Board').color).toBe(0x447766)
    expect(named(result, 'Board').colorAlpha).toBeUndefined()
    expect(named(result, 'Pad').color).toBe(0xe8ad23)
    expect(named(result, 'Pad').colorAlpha).toBeCloseTo(128 / 255, 6)
    expect(named(result, 'Led').color).toBe(0xf6f6f3)
  })

  it('gives no colour for mixed triangles, a bad hex, an out-of-range pindex, or nothing at all', async () => {
    const result = await parsed(await colouredThreeMf())
    for (const name of ['Mixed', 'Bad', 'Far', 'Plain']) {
      expect(named(result, name), name).toBeDefined()
      expect('color' in named(result, name), name).toBe(false)
      expect('colorAlpha' in named(result, name), name).toBe(false)
    }
  })

  it('never refuses a file over a bad colour, and a file with no colours is unchanged', async () => {
    const plain = await parsed(await pack(`<object id="1" name="a">${BOX}</object>`, `<item objectid="1" transform="${IDENTITY}"/>`))
    expect(Object.keys(plain.parts[0]).sort()).toEqual(['indices', 'matrix', 'name', 'positions'])
    const bad = modelXml({
      objects: `<basematerials id="1"><base displaycolor="#12345"/><base displaycolor="#GGGGGG"/><base displaycolor="#1234567"/><base/></basematerials><object id="2" pid="1" pindex="2">${BOX}</object>`,
      build: '<item objectid="2"/>',
    })
    const result = await parsed(await packageThreeMf(bad))
    expect(result.parts).toHaveLength(1)
    expect('color' in result.parts[0]).toBe(false)
  })

  it('treats a fully transparent colour (alpha 00) as no colour, since a kernel colour needs alpha above 0', async () => {
    const model = modelXml({
      objects: `<basematerials id="1"><base displaycolor="#FF000000"/></basematerials><object id="2" pid="1" pindex="0">${BOX}</object>`,
      build: '<item objectid="2"/>',
    })
    expect('color' in (await parsed(await packageThreeMf(model))).parts[0]).toBe(false)
  })

  it('an exact duplicate placement keeps the first colour; one mesh in two places keeps one colour each', async () => {
    const model = modelXml({
      objects:
        '<basematerials id="1"><base displaycolor="#FF0000"/><base displaycolor="#0000FF"/></basematerials>' +
        `<object id="2" name="red" pid="1" pindex="0">${BOX}</object><object id="3" name="blue" pid="1" pindex="1">${BOX}</object>`,
      build:
        `<item objectid="2" transform="${IDENTITY}"/><item objectid="3" transform="${IDENTITY}"/>` +
        `<item objectid="3" transform="1 0 0 0 1 0 0 0 1 20 0 0"/>`,
    })
    const result = await parsed(await packageThreeMf(model))
    expect(result.duplicates).toBe(1)
    expect(result.parts.map((/** @type {any} */ part) => part.color)).toEqual([0xff0000, 0x0000ff])
  })

  it('carries a colour through the import into group.assemble params.colors, and validates', async () => {
    const result = await importMeshBytes('coloured.3mf', await colouredThreeMf())
    if (!result.ok || result.kind !== 'assembly') throw new Error('expected an assembly')
    expect(result.parts.find((part) => part.name === 'Board')?.color).toBe(0x447766)
    const definition = meshAssemblyDefinition({ name: 'coloured', assets: result.assets, parts: result.parts, unitScale: result.unitScale })
    const group = /** @type {any} */ (definition.records.at(-1))
    expect(group.params.colors).toHaveLength(result.parts.length)
    expect(group.params.colors[0]).toEqual({ color: 0x447766 })
    expect(group.params.colors[1].colorAlpha).toBeCloseTo(128 / 255, 6)
    expect(group.params.colors.filter((/** @type {any} */ entry) => entry === null)).toHaveLength(4)
    expect(validateUserPart(definition).ok).toBe(true)
  })
})
