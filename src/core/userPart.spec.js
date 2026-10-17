// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { createDocument } from './document.js'
import { piBoltRepeated } from './__fixtures__/piScenes.js'
import { boundsOf, evaluate, evaluateOp, isGroup, policyFor } from './kernel/index.js'
import { hiddenNamesOf, volumeOf } from './kernel/group.js'
import { lookupEntry } from './kernel/registry.js'
import { recordsForDrop } from './library.js'
import {
  ALLOWED_OP_PREFIXES,
  USER_PART_LIMITS,
  capturePart,
  effectiveUserPart,
  expandUserPart,
  isUserPartOp,
  resetUserParts,
  sameGeometry,
  setLibraryParts,
  setProjectParts,
  slugify,
  userPartStatus,
  validateUserPart,
  validateUserPartSet,
} from './userPart.js'

/**
 * `TODO/core-037` — user-defined library parts: a group saved as plain-JSON op records the
 * registry can rebuild. Kernel is real (it is plain Node and fast); nothing here needs a
 * worker, a GPU or IndexedDB.
 *
 * Tolerance used for "same bounds / volume" after a capture → expand → fold round trip:
 * **1e-9 mm and 1e-9 relative volume**. The bare expansion is asserted *byte-identical*
 * (deep equality of the kernel values) — the tolerance only applies once a placement
 * translate has been applied on top of it, which re-runs the kernel's own arithmetic.
 */

const { geom3 } = modeling.geometries

const LOCAL = { origin: 'local' }

afterEach(() => {
  resetUserParts()
})

/** A small valid definition: a cube with an exposed width, translated. */
function cubePart(overrides = {}) {
  return {
    op: 'user.test-cube',
    name: 'Test cube',
    version: 1,
    result: 'r2',
    records: [
      { id: 'r1', op: 'primitive.cuboid', params: { size: [10, 20, 30], center: [0, 0, 15] } },
      { id: 'r2', op: 'transform.translate', target: 'r1', params: { vector: [5, 0, 0] } },
    ],
    params: [
      { name: 'width', unit: 'mm', default: 10, min: 2, max: 50, binds: [{ record: 'r1', path: 'size.0' }] },
    ],
    ...overrides,
  }
}

/** A document holding a placed bolt, a cube/cylinder group, and a subtract. */
function sceneDocument() {
  const doc = createDocument()
  doc.appendAll(recordsForDrop('hardware.bolt', { x: 30, y: 10 }, doc), LOCAL)
  doc.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10], center: [0, 0, 5] } }, LOCAL)
  doc.append({ id: 'cyl-1', op: 'primitive.cylinder', name: 'Cylinder 1', params: { height: 20, diameter: 6, center: [8, 0, 10] } }, LOCAL)
  doc.append(
    {
      id: 'group-1',
      op: 'group.assemble',
      name: 'Group 1',
      target: 'cube-1',
      operands: ['cyl-1'],
      consumes: ['cube-1', 'cyl-1'],
      params: { names: ['Cube 1', 'Cylinder 1'] },
    },
    LOCAL
  )
  doc.append(
    { id: 'group-1-move', op: 'transform.translate', target: 'group-1', supersedes: 'group-1', params: { vector: [-40, 0, 0], rotation: [0, 0, 0] } },
    LOCAL
  )
  // A boolean whose operands are *other bodies* — capture has to pull them in.
  doc.append({ id: 'plate-1', op: 'primitive.cuboid', name: 'Plate 1', params: { size: [40, 40, 4], center: [0, 60, 2] } }, LOCAL)
  doc.append({ id: 'hole-1', op: 'primitive.cylinder', name: 'Hole 1', params: { height: 10, diameter: 5, center: [0, 60, 2] } }, LOCAL)
  doc.append(
    { id: 'bool-1', op: 'boolean.subtract', name: 'Subtract 1', target: 'plate-1', operands: ['hole-1'], consumes: ['plate-1', 'hole-1'] },
    LOCAL
  )
  return doc
}

/** @param {import('./document.js').WarpDocument} doc @param {string} rootId */
function bodyOf(doc, rootId) {
  const body = doc.bodies().find((candidate) => candidate.id === rootId)
  if (!body) throw new Error(`no body ${rootId}`)
  return body
}

/**
 * A kernel value as plain data, transforms applied — so a value that has been measured (which
 * bakes a solid's pending transform into its polygons in place) and a fresh one compare by what
 * they are. Exact: no tolerance anywhere in it.
 *
 * @param {any} value
 * @returns {any}
 */
function canonical(value) {
  const solid = (/** @type {any} */ geometry) =>
    geom3.toPolygons(geometry).map((polygon) => polygon.vertices.map((vertex) => [vertex[0], vertex[1], vertex[2]]))
  if (!isGroup(value)) return { solid: solid(value) }
  return {
    names: [...value.names],
    parts: Object.keys(value.parts).map((name) => [name, solid(value.parts[name])]),
    holes: value.holes.map(solid),
    colors: JSON.parse(JSON.stringify(value.colors)),
  }
}

/**
 * Fold a definition's records exactly as its registry entry would, without registering it.
 *
 * @param {any} definition
 * @param {string} resolution
 */
function foldDefinition(definition, resolution = 'legacy') {
  const { byId } = evaluate(expandUserPart(definition, {}), { policy: policyFor(resolution) })
  return byId.get(definition.result)
}

describe('isUserPartOp / slugify', () => {
  it('recognises only the user namespace', () => {
    expect(isUserPartOp('user.pi-case')).toBe(true)
    expect(isUserPartOp('hardware.bolt')).toBe(false)
    expect(isUserPartOp('user.')).toBe(false)
  })

  it('turns a display name into a bounded, safe slug', () => {
    expect(slugify('Pi 4 Case — v2!')).toBe('pi-4-case-v2')
    expect(slugify('x'.repeat(200)).length).toBeLessThanOrEqual(USER_PART_LIMITS.maxSlugLength)
    expect(slugify('***')).toBe('part')
  })
})

describe('validateUserPart', () => {
  it('accepts a well-formed definition and returns a normalised, frozen copy', () => {
    const verdict = validateUserPart(cubePart())
    expect(verdict.ok).toBe(true)
    if (!verdict.ok) return
    expect(verdict.definition.op).toBe('user.test-cube')
    expect(Object.isFrozen(verdict.definition)).toBe(true)
  })

  /** @type {[string, any, RegExp][]} */
  const bad = [
    ['not an object', 'user.x', /not a part definition/],
    ['an array', [], /not a part definition/],
    ['an op outside the user namespace', cubePart({ op: 'hardware.bolt' }), /user\.<slug>/],
    ['a name that is too long', cubePart({ name: 'n'.repeat(USER_PART_LIMITS.maxNameLength + 1) }), /name is longer than/],
    ['a version that is not a positive integer', cubePart({ version: 1.5 }), /version/],
    [
      'too many records',
      cubePart({
        records: Array.from({ length: USER_PART_LIMITS.maxRecords + 1 }, (_, i) => ({ id: `r${i + 1}`, op: 'primitive.cuboid', params: {} })),
        params: [],
        result: 'r1',
      }),
      /more than \d+ records/,
    ],
    ['a disallowed op (library.define)', cubePart({ records: [{ id: 'r1', op: 'library.define', params: {} }], result: 'r1', params: [] }), /not allowed in a part/],
    ['a disallowed op (body.delete)', cubePart({ records: [{ id: 'r1', op: 'body.delete', params: {} }], result: 'r1', params: [] }), /not allowed in a part/],
    ['a disallowed op (asset.image)', cubePart({ records: [{ id: 'r1', op: 'asset.image', params: {} }], result: 'r1', params: [] }), /not allowed in a part/],
    [
      'an unknown op (a newer build)',
      cubePart({ records: [{ id: 'r1', op: 'primitive.teleporter', params: {} }], result: 'r1', params: [] }),
      /unknown op "primitive\.teleporter"/,
    ],
    [
      'a reference to an id outside the part',
      cubePart({ records: [{ id: 'r1', op: 'transform.translate', target: 'cube-7', params: { vector: [0, 0, 0] } }], result: 'r1', params: [] }),
      /refers to "cube-7", which is not an earlier record of this part/,
    ],
    [
      'document lineage fields',
      cubePart({ records: [{ id: 'r1', op: 'primitive.cuboid', supersedes: 'x', params: {} }], result: 'r1', params: [] }),
      /unexpected field "supersedes"/,
    ],
    [
      'a condition (it reads document context)',
      cubePart({ records: [{ id: 'r1', op: 'primitive.cuboid', when: { ref: 'x', param: 'model', in: [4] }, params: {} }], result: 'r1', params: [] }),
      /unexpected field "when"/,
    ],
    ['a missing result record', cubePart({ result: 'r9' }), /result "r9" is not a record of this part/],
    [
      'a parameter bound to a record that does not exist',
      cubePart({ params: [{ name: 'width', unit: 'mm', default: 10, min: 2, max: 50, binds: [{ record: 'r9', path: 'size.0' }] }] }),
      /parameter "width" binds record "r9"/,
    ],
    [
      'a parameter bound to a path that does not exist',
      cubePart({ params: [{ name: 'width', unit: 'mm', default: 10, min: 2, max: 50, binds: [{ record: 'r1', path: 'size.7' }] }] }),
      /parameter "width" binds "size\.7" on "r1", which is not a number there/,
    ],
    [
      'a parameter with no binding at all',
      cubePart({ params: [{ name: 'width', unit: 'mm', default: 10, min: 2, max: 50, binds: [] }] }),
      /parameter "width" binds nothing/,
    ],
    [
      'a prototype-polluting path',
      cubePart({ params: [{ name: 'width', unit: 'mm', default: 10, min: 2, max: 50, binds: [{ record: 'r1', path: '__proto__.polluted' }] }] }),
      /path segment "__proto__"/,
    ],
    [
      'a range with min above max',
      cubePart({ params: [{ name: 'width', unit: 'mm', default: 10, min: 50, max: 2, binds: [{ record: 'r1', path: 'size.0' }] }] }),
      /min .* max/,
    ],
    [
      'a default outside its range',
      cubePart({ params: [{ name: 'width', unit: 'mm', default: 99, min: 2, max: 50, binds: [{ record: 'r1', path: 'size.0' }] }] }),
      /default 99 is outside/,
    ],
    [
      'a range beyond the absolute cap',
      cubePart({ params: [{ name: 'width', unit: 'mm', default: 10, min: 2, max: 1e12, binds: [{ record: 'r1', path: 'size.0' }] }] }),
      /beyond/,
    ],
  ]

  it.each(bad)('refuses %s by name, without throwing', (_label, raw, reason) => {
    const verdict = validateUserPart(raw)
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.reason).toMatch(reason)
  })
})

describe('validateUserPartSet — nesting', () => {
  /** @param {string} op @param {string[]} children */
  function nesting(op, children) {
    return {
      op,
      name: op,
      version: 1,
      result: children.length > 0 ? `r${children.length}` : 'r1',
      records:
        children.length > 0
          ? children.map((child, index) => ({ id: `r${index + 1}`, op: child, params: {} }))
          : [{ id: 'r1', op: 'primitive.cuboid', params: { size: [1, 1, 1] } }],
      params: [],
    }
  }

  it('accepts a part that nests another part it carries', () => {
    const { definitions, problems } = validateUserPartSet([nesting('user.outer', ['user.inner']), nesting('user.inner', [])])
    expect(problems).toEqual([])
    expect(definitions.map((d) => d.op).sort()).toEqual(['user.inner', 'user.outer'])
  })

  it('refuses a part that contains itself', () => {
    const { problems } = validateUserPartSet([nesting('user.loop', ['user.loop'])])
    expect(problems).toEqual([expect.objectContaining({ op: 'user.loop', reason: expect.stringMatching(/contains itself/) })])
  })

  it('refuses a cycle between parts, naming every part in it', () => {
    const { definitions, problems } = validateUserPartSet([nesting('user.a', ['user.b']), nesting('user.b', ['user.a'])])
    expect(definitions).toEqual([])
    expect(problems.map((p) => p.op).sort()).toEqual(['user.a', 'user.b'])
    expect(problems[0].reason).toMatch(/cycle/)
  })

  it('refuses a nest deeper than the cap', () => {
    const depth = USER_PART_LIMITS.maxNestingDepth + 2
    const parts = Array.from({ length: depth }, (_, index) =>
      nesting(`user.level-${index}`, index + 1 < depth ? [`user.level-${index + 1}`] : [])
    )
    const { problems } = validateUserPartSet(parts)
    expect(problems.some((p) => p.op === 'user.level-0' && /nested more than/.test(p.reason))).toBe(true)
  })

  it('refuses an exponential fan-out quickly, rather than hanging', () => {
    const fan = Array.from({ length: 200 }, () => 'user.mid')
    const mid = { ...nesting('user.mid', []), records: Array.from({ length: 200 }, (_, i) => ({ id: `r${i + 1}`, op: 'user.leaf', params: {} })), result: 'r1' }
    const started = Date.now()
    const { problems } = validateUserPartSet([nesting('user.top', fan), mid, nesting('user.leaf', [])])
    expect(Date.now() - started).toBeLessThan(1000)
    expect(problems.some((p) => p.op === 'user.top' && /expands to more than/.test(p.reason))).toBe(true)
  })

  it('refuses a nested part the set does not carry (not rebuildable from the file alone)', () => {
    const { problems } = validateUserPartSet([nesting('user.outer', ['user.missing'])])
    expect(problems).toEqual([expect.objectContaining({ op: 'user.outer', reason: expect.stringMatching(/user\.missing/) })])
  })

  it('refuses a duplicate op, keeping the first', () => {
    const { definitions, problems } = validateUserPartSet([cubePart(), cubePart({ version: 2 })])
    expect(definitions).toHaveLength(1)
    expect(definitions[0].version).toBe(1)
    expect(problems[0].reason).toMatch(/more than once/)
  })
})

describe('expandUserPart — parameter substitution', () => {
  const definition = /** @type {any} */ (validateUserPart(cubePart())).definition

  it.each([
    ['default', {}, 10],
    ['min', { width: 2 }, 2],
    ['max', { width: 50 }, 50],
  ])('substitutes the %s value into every binding', (_label, params, width) => {
    const records = expandUserPart(definition, params)
    expect(records[0].params?.size[0]).toBe(width)
    // The definition itself is never mutated.
    expect(definition.records[0].params.size[0]).toBe(10)
  })

  it.each([
    ['below min', { width: 1 }, /width 1 is outside 2–50/],
    ['above max', { width: 51 }, /width 51 is outside 2–50/],
    ['not a number', { width: '10' }, /width must be a number/],
    ['an unknown parameter', { depth: 3 }, /no parameter "depth"/],
  ])('refuses a value %s by name', (_label, params, reason) => {
    expect(() => expandUserPart(definition, params)).toThrow(reason)
  })
})

describe('registered parts fold through the composite path', () => {
  it('two instances of one part with different parameters build different solids', () => {
    setLibraryParts([cubePart()])
    const doc = createDocument()
    doc.appendAll(recordsForDrop('user.test-cube', { x: 0, y: 0 }, doc), LOCAL)
    doc.appendAll(recordsForDrop('user.test-cube', { x: 100, y: 0 }, doc, { width: 40 }), LOCAL)
    const [first, second] = doc.bodies()
    const width = (/** @type {any} */ body) => {
      const [min, max] = boundsOf(body.geometry)
      return max[0] - min[0]
    }
    expect(width(first)).toBeCloseTo(10, 9)
    expect(width(second)).toBeCloseTo(40, 9)
    expect(first.name).toBe('Test cube 1')
    expect(second.name).toBe('Test cube 2')
  })

  it("the project's version beats the library's, and the library reports a newer one", () => {
    setLibraryParts([cubePart({ version: 2, records: [{ id: 'r1', op: 'primitive.cuboid', params: { size: [99, 20, 30] } }, { id: 'r2', op: 'transform.translate', target: 'r1', params: { vector: [0, 0, 0] } }] })])
    setProjectParts([cubePart({ version: 1 })])
    expect(effectiveUserPart('user.test-cube')?.version).toBe(1)
    expect(userPartStatus('user.test-cube')).toEqual({ projectVersion: 1, libraryVersion: 2, newerVersionAvailable: true })
    const [min, max] = boundsOf(evaluateOp('user.test-cube', {}))
    expect(max[0] - min[0]).toBeCloseTo(10, 9)
  })

  it('a project part that failed to load blocks the library copy instead of silently substituting it', () => {
    setLibraryParts([cubePart({ version: 2 })])
    setProjectParts([], { 'user.test-cube': 'too many records' })
    expect(() => evaluateOp('user.test-cube', {})).toThrow(/Test cube|user\.test-cube.*too many records/)
  })

  it('an unregistered user op is unknown, exactly like any other op', () => {
    expect(lookupEntry('user.nothing')).toBeUndefined()
    expect(() => evaluateOp('user.nothing', {})).toThrow(/unknown op "user\.nothing"/)
  })
})

describe('capturePart — a repeat is never saved (TODO/ui-076)', () => {
  it('refuses a repeat body in core\'s own words, and keeps pattern. off the allowed list', () => {
    const doc = piBoltRepeated()
    const repeat = doc.bodies().find((body) => body.recordId === 'rep-1')
    if (!repeat) throw new Error('no repeat body')
    expect(() => capturePart(doc, repeat.id, { name: 'Rep' })).toThrow(/repeat can't be saved/i)
    expect(ALLOWED_OP_PREFIXES.some((prefix) => 'pattern.repeat'.startsWith(prefix))).toBe(false)
  })
})

describe('capturePart — a body\'s lineage as a self-contained part', () => {
  it('replays a placed composite to byte-identical geometry, sub-part names and hidden parts included', () => {
    const doc = sceneDocument()
    const bolt = doc.bodies().find((body) => body.op === 'hardware.bolt')
    if (!bolt) throw new Error('no bolt')
    const definition = capturePart(doc, bolt.id, { name: 'My bolt' })

    const replayed = foldDefinition(definition, doc.resolution())
    expect(canonical(replayed)).toEqual(canonical(bolt.geometry))
    if (!isGroup(replayed) || !isGroup(bolt.geometry)) throw new Error('expected groups')
    expect(replayed.names).toEqual(['head', 'thread'])
    expect(hiddenNamesOf(replayed)).toEqual(hiddenNamesOf(bolt.geometry))
  })

  it('pulls in operand bodies, rewrites every id to its own, and drops document-only fields', () => {
    const doc = sceneDocument()
    const definition = capturePart(doc, 'group-1', { name: 'Kit' })
    expect(definition.op).toBe('user.kit')
    expect(definition.version).toBe(1)
    expect(definition.records.map((record) => record.op)).toEqual([
      'primitive.cuboid',
      'primitive.cylinder',
      'group.assemble',
      'transform.translate',
    ])
    const json = JSON.stringify(definition.records)
    for (const documentId of ['cube-1', 'cyl-1', 'group-1', 'group-1-move']) expect(json).not.toContain(`"${documentId}"`)
    for (const field of ['name', 'supersedes', 'consumes']) {
      expect(definition.records.some((record) => Object.hasOwn(record, field))).toBe(false)
    }
    // The group's own part names survive — they are params of group.assemble, not record names.
    const replayed = foldDefinition(definition)
    expect(canonical(replayed)).toEqual(canonical(bodyOf(doc, 'group-1').geometry))
    if (!isGroup(replayed)) throw new Error('expected a group')
    expect(replayed.names).toEqual(['Cube 1', 'Cylinder 1'])
  })

  it('captures a boolean of two other bodies', () => {
    const doc = sceneDocument()
    const definition = capturePart(doc, 'bool-1', { name: 'Drilled plate' })
    expect(definition.records).toHaveLength(3)
    expect(canonical(foldDefinition(definition))).toEqual(canonical(bodyOf(doc, 'bool-1').geometry))
  })

  it('capture → register → place → fold keeps bounds (to 1e-9 mm), volume and part names', () => {
    const doc = sceneDocument()
    const bolt = /** @type {any} */ (doc.bodies().find((body) => body.op === 'hardware.bolt'))
    const definition = capturePart(doc, bolt.id, { name: 'My bolt' })
    setLibraryParts([definition])

    const fresh = createDocument()
    fresh.appendAll(recordsForDrop(definition.op, { x: 0, y: 0 }, fresh), LOCAL)
    const [placed] = fresh.bodies()
    const [origMin, origMax] = boundsOf(bolt.geometry)
    const [min, max] = boundsOf(placed.geometry)
    for (let axis = 0; axis < 3; axis += 1) {
      expect(max[axis] - min[axis]).toBeCloseTo(origMax[axis] - origMin[axis], 9)
    }
    expect(min[2]).toBeCloseTo(0, 9)
    const relative = Math.abs(volumeOf(placed.geometry) - volumeOf(bolt.geometry)) / volumeOf(bolt.geometry)
    expect(relative).toBeLessThan(1e-9)
    expect(/** @type {any} */ (placed.geometry).names).toEqual(['head', 'thread'])
  })

  it('exposes a parameter with its current value as the default, and the default replays identically', () => {
    const doc = sceneDocument()
    const definition = capturePart(doc, 'group-1', {
      name: 'Kit',
      exposeParams: [{ name: 'cubeSide', unit: 'mm', min: 2, max: 40, binds: [{ record: 'cube-1', path: 'size.0' }] }],
    })
    expect(definition.params).toEqual([
      { name: 'cubeSide', unit: 'mm', default: 10, min: 2, max: 40, binds: [{ record: 'r1', path: 'size.0' }] },
    ])
    expect(canonical(foldDefinition(definition))).toEqual(canonical(bodyOf(doc, 'group-1').geometry))
    setLibraryParts([definition])
    const wide = evaluateOp(definition.op, { cubeSide: 30 })
    const [min, max] = boundsOf(wide)
    expect(max[0] - min[0]).toBeGreaterThan(30 - 1e-9)
  })

  it('refuses an unknown body, and a body whose history it cannot reproduce faithfully', () => {
    const doc = sceneDocument()
    expect(() => capturePart(doc, 'nope', { name: 'X' })).toThrow(/no body "nope"/)

    const conditional = createDocument()
    conditional.appendAll(recordsForDrop('raspberrypi.bplus', { x: 0, y: 0 }, conditional, { model: 4 }), LOCAL)
    const pi = conditional.bodies()[0]
    conditional.append(
      {
        id: 'nudge',
        op: 'transform.translate',
        target: pi.recordId,
        supersedes: pi.recordId,
        when: { ref: pi.id, param: 'model', in: [5] },
        params: { vector: [10, 0, 0], rotation: [0, 0, 0] },
      },
      LOCAL
    )
    expect(() => capturePart(conditional, pi.id, { name: 'Pi' })).toThrow(/condition/)
  })

  it('a captured part validates, so what capture writes is what a file can carry', () => {
    const doc = sceneDocument()
    const definition = capturePart(doc, 'group-1', { name: 'Kit' })
    expect(validateUserPart(JSON.parse(JSON.stringify(definition))).ok).toBe(true)
  })
})

describe('capturePart — user colour overrides (TODO/core-054)', () => {
  /** A group recoloured by hand: whole body, plus one named part at partial opacity. */
  function recolouredDocument() {
    const doc = sceneDocument()
    doc.setColorOverride('group-1', { color: 0xcc3322 }, LOCAL)
    doc.setColorOverride('group-1', { color: 0x2255cc, colorAlpha: 0.5, subPart: 'Cylinder 1' }, LOCAL)
    return doc
  }

  it('carries the overrides as style.recolor records, re-keyed to the part\'s own ids', () => {
    const doc = recolouredDocument()
    const definition = capturePart(doc, 'group-1', { name: 'Standoff' })
    const recolors = definition.records.filter((record) => record.op === 'style.recolor')
    expect(recolors).toHaveLength(2)
    expect(recolors[0]).toMatchObject({ colorOverride: 0xcc3322 })
    expect(recolors[1]).toMatchObject({ colorOverride: 0x2255cc, colorAlpha: 0.5, subPart: 'Cylinder 1' })
    const json = JSON.stringify(definition.records)
    expect(json).not.toContain('group-1')
    // Geometry is untouched by a colour: the replay still equals the body exactly.
    expect(canonical(foldDefinition(definition))).toEqual(canonical(bodyOf(doc, 'group-1').geometry))
    expect(validateUserPart(JSON.parse(JSON.stringify(definition))).ok).toBe(true)
  })

  it('a placed copy reports the same colour overrides as the body it was saved from', () => {
    const doc = recolouredDocument()
    const original = bodyOf(doc, 'group-1')
    expect(original.colorOverrides).toHaveLength(2)
    const definition = capturePart(doc, 'group-1', { name: 'Standoff' })
    setLibraryParts([definition])

    const fresh = createDocument()
    fresh.appendAll(recordsForDrop(definition.op, { x: 0, y: 0 }, fresh), LOCAL)
    const [placed] = fresh.bodies()
    expect(placed.colorOverrides).toEqual(original.colorOverrides)

    // The user's own later pick on the copy still wins; Reset clears the whole-body key, as on any body.
    fresh.setColorOverride(placed.id, { color: 0x00ff00 }, LOCAL)
    expect(fresh.bodies()[0].colorOverrides?.find((entry) => entry.subPart === undefined)?.color).toBe(0x00ff00)
    fresh.clearColorOverride(placed.id, {}, LOCAL)
    expect(fresh.bodies()[0].colorOverrides).toEqual(original.colorOverrides?.filter((entry) => entry.subPart !== undefined))
  })

  it('a reset before saving leaves a part with no override at all', () => {
    const doc = sceneDocument()
    doc.setColorOverride('group-1', { color: 0xcc3322 }, LOCAL)
    doc.clearColorOverride('group-1', {}, LOCAL)
    const definition = capturePart(doc, 'group-1', { name: 'Plain' })
    setLibraryParts([definition])
    const fresh = createDocument()
    fresh.appendAll(recordsForDrop(definition.op, { x: 0, y: 0 }, fresh), LOCAL)
    expect(bodyOf(doc, 'group-1').colorOverrides).toBeUndefined()
    expect(fresh.bodies()[0].colorOverrides).toBeUndefined()
  })

  it('a part saved from a recoloured placed part keeps the colour (nesting)', () => {
    // No pre-translate on the group here; the translate-ending case has its own test below
    // (TODO/core-055).
    const doc = createDocument()
    doc.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10], center: [0, 0, 5] } }, LOCAL)
    doc.append({ id: 'cyl-1', op: 'primitive.cylinder', name: 'Cylinder 1', params: { height: 20, diameter: 6, center: [8, 0, 10] } }, LOCAL)
    doc.append(
      { id: 'group-1', op: 'group.assemble', name: 'Group 1', target: 'cube-1', operands: ['cyl-1'], consumes: ['cube-1', 'cyl-1'], params: { names: ['Cube 1', 'Cylinder 1'] } },
      LOCAL
    )
    doc.setColorOverride('group-1', { color: 0xcc3322 }, LOCAL)
    doc.setColorOverride('group-1', { color: 0x2255cc, subPart: 'Cylinder 1' }, LOCAL)
    const standoff = capturePart(doc, 'group-1', { name: 'Standoff' })
    setLibraryParts([standoff])

    const second = createDocument()
    second.appendAll(recordsForDrop('user.standoff', { x: 0, y: 0 }, second), LOCAL)
    const placed = second.bodies()[0]
    expect(placed.colorOverrides).toEqual(bodyOf(doc, 'group-1').colorOverrides)
    const again = capturePart(second, placed.id, { name: 'Standoff copy' })
    setLibraryParts([standoff, again])

    const third = createDocument()
    third.appendAll(recordsForDrop('user.standoff-copy', { x: 0, y: 0 }, third), LOCAL)
    expect(third.bodies()[0].colorOverrides).toEqual(placed.colorOverrides)
  })

  it('re-captures a placed part whose own definition ends in a translate (TODO/core-055)', () => {
    const doc = sceneDocument()
    const bracket = capturePart(doc, 'group-1', { name: 'Bracket' })
    expect(bracket.records[bracket.records.length - 1].op).toBe('transform.translate')
    setLibraryParts([bracket])

    const second = createDocument()
    second.appendAll(recordsForDrop('user.bracket', { x: 12, y: 7 }, second), LOCAL)
    const placed = second.bodies()[0]
    const again = capturePart(second, placed.id, { name: 'Bracket copy' })
    setLibraryParts([bracket, again])

    // The copy expands to the same body the placed part is: structure exact, coordinates to
    // the capture tolerance (a baked translate and a composed one land ~1e-15 mm apart).
    expect(sameGeometry(foldDefinition(again), placed.geometry, 1e-9)).toBe(true)
    const third = createDocument()
    third.appendAll(recordsForDrop('user.bracket-copy', { x: 12, y: 7 }, third), LOCAL)
    expect(sameGeometry(third.bodies()[0].geometry, placed.geometry, 1e-9)).toBe(true)
    // ...and the tolerance is not a loophole: a real 0.001 mm shift is still a different body.
    const nudged = JSON.parse(JSON.stringify(again))
    nudged.records[nudged.records.length - 1].params.vector[0] += 0.001
    expect(sameGeometry(foldDefinition(nudged), placed.geometry, 1e-9)).toBe(false)
  })

  it('refuses a malformed colour on a style.recolor record, and a colour field on any other op', () => {
    const doc = recolouredDocument()
    const good = JSON.parse(JSON.stringify(capturePart(doc, 'group-1', { name: 'Standoff' })))
    const bad = JSON.parse(JSON.stringify(good))
    bad.records.find((/** @type {any} */ record) => record.op === 'style.recolor').colorOverride = 'red'
    expect(validateUserPart(bad).ok).toBe(false)
    const stray = JSON.parse(JSON.stringify(good))
    stray.records[0].colorOverride = 0xff0000
    expect(validateUserPart(stray).ok).toBe(false)
  })
})
