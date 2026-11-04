// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The 3MF reader (`TODO/io-024`): a model file whose objects become the parts of one
 * placeable library part.
 *
 * ## What it reads
 *
 * A 3MF is a zip (`../../core/zip.js` reads it through its central directory). `_rels/.rels`
 * names the **start part** by relationship type; its target is normalised (the leading slash
 * dropped) and looked up as a **key** in the zip's entry list, never as a path, and a target with
 * a `..` segment is refused. Only that entry is inflated — never the thumbnails — and only up to
 * {@link THREE_MF_LIMITS}`.maxXmlBytes`.
 *
 * The model document is read by a small scanner, because `DOMParser` exists neither in a worker
 * nor in plain Node, and this runs in `../mesh.worker.js`. The scanner is linear: `indexOf` and
 * character loops, no backtracking regular expression. It takes attributes in any order, either
 * quote, `<a/>` and `<a></a>`, a namespace prefix, comments and scientific notation. It
 * **refuses `<!DOCTYPE` and `<!ENTITY` outright**, decodes only the five predefined entities and
 * numeric references, and refuses a UTF-16 file in words.
 *
 * ## What a part is
 *
 * One part per placed mesh after flattening: a build item that points at a `components` object is
 * expanded down its tree, multiplying transforms. **Exact duplicates collapse** — the same mesh
 * content at the same final transform is kept once and counted (FreeCAD wrote the Feather three
 * times over). A part's name is its mesh object's `name`, else its nearest named ancestor's, else
 * `null` (the importer numbers those `Part n`). Only `type="model"` objects are imported; supports
 * and the rest are skipped and counted.
 *
 * ## Hostile input
 *
 * Every cap is in {@link THREE_MF_LIMITS}. Nested components are a bomb (ten levels of ten is
 * 10^10 instances from a few hundred bytes), so a cycle is refused before expanding, depth is
 * capped, and placements are **counted while expanding**, stopping with a refusal the moment
 * they pass a cap. A reference to an object that does not exist, a vertex index out of range, a
 * coordinate that is not a finite number or is beyond `MESH_LIMITS.maxAbsCoordinate`, a
 * `p:path` reference into a separate model file, and an extension listed in
 * `requiredextensions` that is not understood are all refusals: never a partial import. The
 * meshes then go through the same weld and validator as an STL (`../meshJob.js`).
 *
 * Framework-free: bytes in, plain arrays out.
 *
 * @module io/meshFormats/threeMf
 */

import { listZipEntries, readZipEntry } from '../../core/zip.js'
import { MESH_LIMITS, formatCount } from '../meshAsset.js'
import { IDENTITY_MATRIX, matrixFromThreeMf, multiplyMatrices } from '../meshMatrix.js'

/** The hostile-input caps, in one place (the `MESH_LIMITS` pattern). */
export const THREE_MF_LIMITS = Object.freeze({
  /** Entries the package may list. */
  maxEntries: 10_000,
  /** `_rels/.rels`, unpacked. */
  maxRelsBytes: 1024 * 1024,
  /**
   * The model document, unpacked. The Feather runs about 70 bytes per triangle, so the 250 k
   * triangle cap needs about 18 MB; three coincident copies of that, 54 MB.
   */
  maxXmlBytes: 64 * 1024 * 1024,
  /** Levels of `components` inside `components`. */
  maxDepth: 8,
  /** Parts kept after duplicates collapse: `USER_PART_LIMITS.maxRecords`, one record each. */
  maxParts: 500,
  /** Every object visited while expanding, duplicates included. */
  maxPlacements: 5000,
  /** Objects the document may define. */
  maxObjects: 100_000,
  /** Vertices and triangles parsed across every object, before duplicates collapse. */
  maxParsedVertices: 1_500_000,
  maxParsedTriangles: 1_500_000,
})

/** @typedef {typeof THREE_MF_LIMITS} ThreeMfLimits */

/** The relationship type that names the start part. */
const MODEL_RELATIONSHIP = 'http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel'

/**
 * Extensions a file may require that this reader understands: what it ignores of them is never
 * geometry. Materials and colours are not geometry; the production extension's only geometry is
 * `p:path`, which is refused where it appears.
 */
const UNDERSTOOD_EXTENSIONS = new Set([
  'http://schemas.microsoft.com/3dmanufacturing/material/2015/02',
  'http://schemas.microsoft.com/3dmanufacturing/production/2015/06',
])

/** Millimetres per unit, for every unit the core spec names. */
const UNIT_SCALES = Object.freeze({ micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 })

/**
 * @typedef {object} ThreeMfPart
 * @property {string | null} name
 * @property {Float32Array} positions File units. Parts with the same mesh share one array.
 * @property {Uint32Array} indices
 * @property {number[]} matrix 16 numbers, `mat4` order, translation in file units.
 */

/**
 * @typedef {{ ok: true, format: '3mf', unitScale: number, parts: ThreeMfPart[], duplicates: number,
 *   skippedObjects: number, triangleCount: number }
 *   | { ok: false, reason: string, counted?: number }} ThreeMfResult
 */

/**
 * Whether the bytes look like a 3MF: a zip, by its first local header.
 *
 * @param {Uint8Array} bytes
 * @returns {boolean}
 */
export function sniffThreeMf(bytes) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

/** A refusal raised inside the reader, carried out to {@link parseThreeMf}. */
class Refusal extends Error {
  /**
   * @param {string} reason
   * @param {number} [counted]
   */
  constructor(reason, counted) {
    super(reason)
    this.counted = counted
  }
}

// --- the scanner ---------------------------------------------------------------------------

/** @typedef {Record<string, string>} Attributes A null-prototype map, qualified name → value. */

/**
 * @typedef {object} ScanHandlers
 * @property {(name: string, attributes: Attributes) => void} open `name` is the local name.
 * @property {(name: string) => void} close
 */

/** @param {number} code */
function isSpace(code) {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d
}

/** @param {string} qualified @returns {string} */
function localName(qualified) {
  const colon = qualified.indexOf(':')
  return colon === -1 ? qualified : qualified.slice(colon + 1)
}

const PREDEFINED = /** @type {Record<string, string>} */ ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" })

/**
 * Decode the five predefined entities and numeric references. Anything else is left as written:
 * with no DOCTYPE there is nothing else it could mean.
 *
 * @param {string} value
 * @returns {string}
 */
function decodeEntities(value) {
  if (value.indexOf('&') === -1) return value
  let out = ''
  let at = 0
  for (;;) {
    const amp = value.indexOf('&', at)
    if (amp === -1) return out + value.slice(at)
    out += value.slice(at, amp)
    const semi = value.indexOf(';', amp)
    if (semi === -1 || semi - amp > 12) {
      out += '&'
      at = amp + 1
      continue
    }
    const body = value.slice(amp + 1, semi)
    let decoded = null
    if (body.charCodeAt(0) === 0x23 /* # */) {
      const hex = body.charCodeAt(1) === 0x78 || body.charCodeAt(1) === 0x58
      const digits = hex ? body.slice(2) : body.slice(1)
      const valid = digits.length > 0 && [...digits].every((c) => (hex ? /[0-9a-fA-F]/ : /[0-9]/).test(c))
      const code = valid ? Number.parseInt(digits, hex ? 16 : 10) : NaN
      if (code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)) decoded = String.fromCodePoint(code)
    } else if (Object.hasOwn(PREDEFINED, body)) {
      decoded = PREDEFINED[body]
    }
    if (decoded === null) {
      out += '&'
      at = amp + 1
    } else {
      out += decoded
      at = semi + 1
    }
  }
}

/**
 * Scan an XML document, calling `handlers` for each element. Linear in the text's length.
 *
 * @param {string} text
 * @param {ScanHandlers} handlers
 * @returns {void}
 * @throws {Refusal}
 */
export function scanXml(text, handlers) {
  const malformed = (/** @type {string} */ what, /** @type {number} */ at) => new Refusal(`the model's XML is malformed (${what} at character ${at})`)
  /** @type {string[]} */
  const open = []
  let at = 0
  const length = text.length
  for (;;) {
    const lt = text.indexOf('<', at)
    if (lt === -1) break
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4)
      if (end === -1) throw malformed('an unclosed comment', lt)
      at = end + 3
      continue
    }
    if (text.startsWith('<?', lt)) {
      const end = text.indexOf('?>', lt + 2)
      if (end === -1) throw malformed('an unclosed declaration', lt)
      at = end + 2
      continue
    }
    if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt + 9)
      if (end === -1) throw malformed('an unclosed CDATA section', lt)
      at = end + 3
      continue
    }
    if (text.charCodeAt(lt + 1) === 0x21 /* ! */) {
      const word = text.slice(lt + 2, lt + 9).toUpperCase()
      if (word.startsWith('DOCTYPE')) throw new Refusal('it contains a <!DOCTYPE>, which is never read')
      if (word.startsWith('ENTITY')) throw new Refusal('it contains an <!ENTITY>, which is never read')
      throw malformed('a declaration', lt)
    }
    if (text.charCodeAt(lt + 1) === 0x2f /* / */) {
      const end = text.indexOf('>', lt + 2)
      if (end === -1) throw malformed('an unclosed end tag', lt)
      const name = text.slice(lt + 2, end).trim()
      if (open.length === 0 || open[open.length - 1] !== name) throw malformed(`</${name.slice(0, 40)}> with nothing open to close`, lt)
      open.pop()
      handlers.close(localName(name))
      at = end + 1
      continue
    }
    // A start tag: its name, then attributes.
    let i = lt + 1
    while (i < length) {
      const code = text.charCodeAt(i)
      if (isSpace(code) || code === 0x3e /* > */ || code === 0x2f /* / */) break
      i += 1
    }
    const name = text.slice(lt + 1, i)
    if (name === '') throw malformed('an empty tag name', lt)
    /** @type {Attributes} */
    const attributes = Object.create(null)
    let selfClosing = false
    for (;;) {
      while (i < length && isSpace(text.charCodeAt(i))) i += 1
      if (i >= length) throw malformed(`an unclosed <${name.slice(0, 40)}>`, lt)
      const code = text.charCodeAt(i)
      if (code === 0x3e) {
        i += 1
        break
      }
      if (code === 0x2f) {
        if (text.charCodeAt(i + 1) !== 0x3e) throw malformed('a stray "/"', i)
        selfClosing = true
        i += 2
        break
      }
      const nameStart = i
      while (i < length) {
        const c = text.charCodeAt(i)
        if (isSpace(c) || c === 0x3d /* = */ || c === 0x3e || c === 0x2f) break
        i += 1
      }
      const attribute = text.slice(nameStart, i)
      while (i < length && isSpace(text.charCodeAt(i))) i += 1
      if (attribute === '' || text.charCodeAt(i) !== 0x3d) throw malformed('an attribute without a value', nameStart)
      i += 1
      while (i < length && isSpace(text.charCodeAt(i))) i += 1
      const quote = text[i]
      if (quote !== '"' && quote !== "'") throw malformed('an unquoted attribute', i)
      const close = text.indexOf(quote, i + 1)
      if (close === -1) throw malformed('an unclosed attribute', i)
      if (!(attribute in attributes)) attributes[attribute] = decodeEntities(text.slice(i + 1, close))
      i = close + 1
    }
    handlers.open(localName(name), attributes)
    if (selfClosing) handlers.close(localName(name))
    else open.push(name)
    at = i
  }
  if (open.length > 0) throw malformed(`an unclosed <${open[open.length - 1].slice(0, 40)}>`, length)
}

// --- numbers -------------------------------------------------------------------------------

/** @param {number} code */
function isDigit(code) {
  return code >= 0x30 && code <= 0x39
}

/**
 * A 3MF number (`ST_Number`): sign, digits, a point, an exponent. Never hex, `Infinity` or `NaN`.
 * A character loop, so a hostile megabyte of digits costs one pass.
 *
 * @param {string | undefined} raw
 * @returns {number} `NaN` when it is not one.
 */
function parseNumber(raw) {
  if (raw === undefined) return NaN
  const text = raw.trim()
  let i = 0
  const n = text.length
  if (text[i] === '+' || text[i] === '-') i += 1
  let digits = 0
  while (i < n && isDigit(text.charCodeAt(i))) {
    i += 1
    digits += 1
  }
  if (text[i] === '.') {
    i += 1
    while (i < n && isDigit(text.charCodeAt(i))) {
      i += 1
      digits += 1
    }
  }
  if (digits === 0) return NaN
  if (text[i] === 'e' || text[i] === 'E') {
    i += 1
    if (text[i] === '+' || text[i] === '-') i += 1
    let exponent = 0
    while (i < n && isDigit(text.charCodeAt(i))) {
      i += 1
      exponent += 1
    }
    if (exponent === 0) return NaN
  }
  return i === n ? Number(text) : NaN
}

/**
 * A non-negative whole number (a vertex index or an object id).
 *
 * @param {string | undefined} raw
 * @returns {number} `-1` when it is not one.
 */
function parseIndex(raw) {
  if (raw === undefined) return -1
  const text = raw.trim()
  if (text.length === 0 || text.length > 10) return -1
  for (let i = 0; i < text.length; i += 1) if (!isDigit(text.charCodeAt(i))) return -1
  const value = Number(text)
  return value <= 0xffffffff ? value : -1
}

/**
 * A `transform` attribute's twelve numbers as a matrix, or the identity when absent.
 *
 * @param {string | undefined} raw
 * @param {string} where
 * @returns {number[]}
 */
function parseTransform(raw, where) {
  if (raw === undefined) return [...IDENTITY_MATRIX]
  const words = raw.trim().split(/\s+/)
  const numbers = words.map(parseNumber)
  if (numbers.length !== 12 || numbers.some((value) => !Number.isFinite(value))) {
    throw new Refusal(`${where} has a transform that is not twelve finite numbers`)
  }
  return matrixFromThreeMf(numbers)
}

// --- the model -------------------------------------------------------------------------------

/**
 * @typedef {object} ModelObject
 * @property {string} id
 * @property {string} type
 * @property {string | null} name
 * @property {'mesh' | 'components' | null} kind
 * @property {Float32Array} positions
 * @property {Uint32Array} indices
 * @property {{ objectId: string, matrix: number[] }[]} components
 */

/**
 * Read the model document into objects and build items.
 *
 * @param {string} text
 * @param {ThreeMfLimits} limits
 * @param {import('../meshAsset.js').MeshLimits} meshLimits
 */
function readModel(text, limits, meshLimits) {
  /** @type {Map<string, ModelObject>} */
  const objects = new Map()
  /** @type {{ objectId: string, matrix: number[] }[]} */
  const items = []
  /** @type {Record<string, string>} */
  const namespaces = Object.create(null)
  let unit = 'millimeter'
  let required = ''
  let sawModel = false
  /** @type {ModelObject | null} */
  let current = null
  /** @type {number[]} */
  let vertices = []
  /** @type {number[]} */
  let triangles = []
  let parsedVertices = 0
  let parsedTriangles = 0
  const maxCoordinate = meshLimits.maxAbsCoordinate

  /** @param {Attributes} attributes @param {string} where */
  const refusePath = (attributes, where) => {
    for (const key of Object.keys(attributes)) {
      if (key.includes(':') && localName(key) === 'path') {
        throw new Refusal(`${where} points into separate model files (the production extension's p:path), which are not read yet`)
      }
    }
  }

  scanXml(text, {
    open(name, attributes) {
      switch (name) {
        case 'model': {
          sawModel = true
          if (attributes.unit !== undefined) unit = attributes.unit.trim()
          required = attributes.requiredextensions ?? ''
          for (const [key, value] of Object.entries(attributes)) {
            if (key.startsWith('xmlns:')) namespaces[key.slice(6)] = value
          }
          return
        }
        case 'object': {
          if (current !== null) throw new Refusal('an object is defined inside another object')
          const id = attributes.id?.trim() ?? ''
          if (parseIndex(id) < 1) throw new Refusal(`an object has the id "${id.slice(0, 20)}", not a positive whole number`)
          if (objects.has(id)) throw new Refusal(`object ${id} is defined twice`)
          if (objects.size >= limits.maxObjects) throw new Refusal(`it defines more than ${formatCount(limits.maxObjects)} objects`)
          current = {
            id,
            type: (attributes.type ?? 'model').trim(),
            name: attributes.name ?? null,
            kind: null,
            positions: new Float32Array(0),
            indices: new Uint32Array(0),
            components: [],
          }
          vertices = []
          triangles = []
          return
        }
        case 'mesh':
        case 'components': {
          if (current === null) return
          if (current.kind !== null) throw new Refusal(`object ${current.id} has both a mesh and components`)
          current.kind = name
          return
        }
        case 'vertex': {
          if (current?.kind !== 'mesh') return
          parsedVertices += 1
          if (parsedVertices > limits.maxParsedVertices) throw new Refusal(`it has more than ${formatCount(limits.maxParsedVertices)} vertices`)
          const x = parseNumber(attributes.x)
          const y = parseNumber(attributes.y)
          const z = parseNumber(attributes.z)
          for (const value of [x, y, z]) {
            if (!Number.isFinite(value)) throw new Refusal(`object ${current.id} has a coordinate that is not a number`)
            if (value > maxCoordinate || value < -maxCoordinate) {
              throw new Refusal(`object ${current.id} has a coordinate beyond ±${formatCount(maxCoordinate)}`)
            }
          }
          vertices.push(x, y, z)
          return
        }
        case 'triangle': {
          if (current?.kind !== 'mesh') return
          parsedTriangles += 1
          if (parsedTriangles > limits.maxParsedTriangles) throw new Refusal(`it has more than ${formatCount(limits.maxParsedTriangles)} triangles`)
          const a = parseIndex(attributes.v1)
          const b = parseIndex(attributes.v2)
          const c = parseIndex(attributes.v3)
          if (a < 0 || b < 0 || c < 0) throw new Refusal(`object ${current.id} has a triangle whose vertex is not a whole number`)
          triangles.push(a, b, c)
          return
        }
        case 'beamlattice':
          throw new Refusal('it uses beam lattices, which are not read')
        case 'component': {
          if (current?.kind !== 'components') return
          refusePath(attributes, `object ${current.id}`)
          const objectId = attributes.objectid?.trim() ?? ''
          current.components.push({ objectId, matrix: parseTransform(attributes.transform, `a component of object ${current.id}`) })
          return
        }
        case 'item': {
          refusePath(attributes, 'the build')
          const objectId = attributes.objectid?.trim() ?? ''
          items.push({ objectId, matrix: parseTransform(attributes.transform, `the build item for object ${objectId.slice(0, 20)}`) })
          return
        }
        default:
      }
    },
    close(name) {
      if (name !== 'object' || current === null) return
      if (current.kind === 'mesh') {
        const vertexCount = vertices.length / 3
        for (let index = 0; index < triangles.length; index += 1) {
          if (triangles[index] >= vertexCount) {
            throw new Refusal(
              `object ${current.id}: triangle ${Math.floor(index / 3) + 1} names vertex ${triangles[index]}, past the last (${vertexCount - 1})`
            )
          }
        }
        current.positions = Float32Array.from(vertices)
        current.indices = Uint32Array.from(triangles)
      }
      objects.set(current.id, current)
      current = null
      vertices = []
      triangles = []
    },
  })
  if (!sawModel) throw new Refusal('it has no <model>')

  if (!Object.hasOwn(UNIT_SCALES, unit)) throw new Refusal(`its unit "${unit.slice(0, 20)}" is not one 3MF defines`)
  for (const prefix of required.trim().split(/\s+/).filter((word) => word !== '')) {
    const namespace = namespaces[prefix]
    if (namespace === undefined) throw new Refusal(`it requires an extension "${prefix.slice(0, 20)}" it never names`)
    if (!UNDERSTOOD_EXTENSIONS.has(namespace)) throw new Refusal(`it requires the 3MF extension ${namespace.slice(0, 120)}, which is not read`)
  }
  return { objects, items, unitScale: UNIT_SCALES[/** @type {keyof typeof UNIT_SCALES} */ (unit)] }
}

/**
 * Refuse a component reference to a missing object, and a cycle, before expanding anything.
 * Iterative colour-marking DFS: linear in the graph's size.
 *
 * @param {Map<string, ModelObject>} objects
 */
function checkGraph(objects) {
  /** @type {Map<string, 0 | 1 | 2>} */
  const colour = new Map()
  for (const start of objects.keys()) {
    if (colour.get(start) === 2) continue
    /** @type {{ id: string, index: number }[]} */
    const stack = [{ id: start, index: 0 }]
    colour.set(start, 1)
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]
      const object = /** @type {ModelObject} */ (objects.get(frame.id))
      if (frame.index >= object.components.length) {
        colour.set(frame.id, 2)
        stack.pop()
        continue
      }
      const child = object.components[frame.index].objectId
      frame.index += 1
      if (!objects.has(child)) throw new Refusal(`object ${object.id} refers to object ${child.slice(0, 20)}, which does not exist`)
      const state = colour.get(child) ?? 0
      if (state === 1) throw new Refusal(`its components form a cycle (object ${child.slice(0, 20)} contains itself)`)
      if (state === 0) {
        colour.set(child, 1)
        stack.push({ id: child, index: 0 })
      }
    }
  }
}

/**
 * A content key for a mesh: equal meshes always share one, and the arrays are compared in full
 * before two keys are treated as one mesh.
 *
 * @param {ModelObject} object
 * @returns {string}
 */
function contentHash(object) {
  let hash = 0x811c9dc5
  const words = [new Uint32Array(object.positions.buffer, object.positions.byteOffset, object.positions.length), object.indices]
  for (const array of words) {
    for (let index = 0; index < array.length; index += 1) {
      hash ^= array[index]
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
  }
  return `${object.positions.length}:${object.indices.length}:${hash}`
}

/** @param {ArrayLike<number>} a @param {ArrayLike<number>} b */
function sameArray(a, b) {
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false
  return true
}

/**
 * Flatten the build into placed meshes, collapsing exact duplicates, counting as it goes.
 *
 * @param {Map<string, ModelObject>} objects
 * @param {{ objectId: string, matrix: number[] }[]} items
 * @param {ThreeMfLimits} limits
 */
function flatten(objects, items, limits) {
  /** @type {Map<string, ModelObject[]>} content hash → distinct meshes with it */
  const byHash = new Map()
  /** @type {Map<ModelObject, { mesh: ModelObject, id: number }>} each mesh object → its content's canonical mesh */
  const canonical = new Map()
  let nextMeshId = 0
  const canonicalOf = (/** @type {ModelObject} */ object) => {
    const known = canonical.get(object)
    if (known !== undefined) return known
    const hash = contentHash(object)
    const bucket = byHash.get(hash) ?? []
    let found = bucket.find((other) => sameArray(other.positions, object.positions) && sameArray(other.indices, object.indices))
    if (found === undefined) {
      found = object
      bucket.push(object)
      byHash.set(hash, bucket)
    }
    const entry = canonical.get(found) ?? { mesh: found, id: (nextMeshId += 1) }
    canonical.set(found, entry)
    canonical.set(object, entry)
    return entry
  }

  /** @type {ThreeMfPart[]} */
  const parts = []
  /** @type {Set<string>} */
  const seen = new Set()
  let duplicates = 0
  let skippedObjects = 0
  let placements = 0
  let triangleCount = 0

  for (const item of items) {
    const root = objects.get(item.objectId)
    if (root === undefined) throw new Refusal(`the build names object ${item.objectId.slice(0, 20)}, which does not exist`)
    if (root.type !== 'model') {
      skippedObjects += 1
      continue
    }
    /** @type {{ object: ModelObject, matrix: number[], depth: number, name: string | null }[]} */
    const stack = [{ object: root, matrix: item.matrix, depth: 0, name: root.name }]
    while (stack.length > 0) {
      const { object, matrix, depth, name } = /** @type {typeof stack[number]} */ (stack.pop())
      placements += 1
      if (placements > limits.maxPlacements) {
        throw new Refusal(`it has more than ${formatCount(limits.maxPlacements)} placements of its objects`, placements)
      }
      if (object.kind === 'components') {
        if (depth >= limits.maxDepth) throw new Refusal(`its components are nested more than ${limits.maxDepth} deep`)
        // Pushed in reverse, so they come off the stack in the file's order.
        for (let index = object.components.length - 1; index >= 0; index -= 1) {
          const component = object.components[index]
          const child = /** @type {ModelObject} */ (objects.get(component.objectId))
          stack.push({ object: child, matrix: multiplyMatrices(matrix, component.matrix), depth: depth + 1, name: child.name ?? name })
        }
        continue
      }
      if (object.type !== 'model') {
        skippedObjects += 1
        continue
      }
      if (object.kind !== 'mesh') throw new Refusal(`object ${object.id} has neither a mesh nor components`)
      const { mesh, id } = canonicalOf(object)
      const key = `${id}|${matrix.join(' ')}`
      if (seen.has(key)) {
        duplicates += 1
        continue
      }
      seen.add(key)
      if (parts.length >= limits.maxParts) {
        throw new Refusal(`it has more than ${formatCount(limits.maxParts)} parts`, parts.length + 1)
      }
      parts.push({ name, positions: mesh.positions, indices: mesh.indices, matrix })
      triangleCount += mesh.indices.length / 3
    }
  }
  return { parts, duplicates, skippedObjects, triangleCount }
}

/**
 * Decode the model document's bytes as UTF-8, refusing UTF-16 in words.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function decodeText(bytes) {
  if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) {
    throw new Refusal('it is UTF-16 text, which is not read; save it as UTF-8')
  }
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
  } catch {
    throw new Refusal('its model is not UTF-8 text')
  }
}

/**
 * The start part's entry name, from `_rels/.rels`.
 *
 * @param {string} rels
 * @returns {string}
 */
function startPartOf(rels) {
  /** @type {string | null} */
  let target = null
  scanXml(rels, {
    open(name, attributes) {
      if (name === 'Relationship' && target === null && attributes.Type?.trim() === MODEL_RELATIONSHIP) {
        target = attributes.Target ?? ''
      }
    },
    close() {},
  })
  if (target === null) throw new Refusal('it names no 3D model in _rels/.rels')
  const normalised = String(target).trim().replace(/^\/+/, '')
  if (normalised === '' || normalised.includes('\\') || normalised.split('/').some((segment) => segment === '..' || segment === '.' || segment === '')) {
    throw new Refusal(`its start part "${String(target).slice(0, 80)}" is outside the package`)
  }
  return normalised
}

/**
 * Read a 3MF. Never rejects: a refusal is `{ ok: false, reason }`, starting "Not a valid 3MF:".
 *
 * @param {Uint8Array} bytes
 * @param {import('../meshAsset.js').MeshLimits} [meshLimits]
 * @param {Partial<ThreeMfLimits>} [overrides]
 * @returns {Promise<ThreeMfResult>}
 */
export async function parseThreeMf(bytes, meshLimits = MESH_LIMITS, overrides = {}) {
  const limits = { ...THREE_MF_LIMITS, ...overrides }
  try {
    if (!sniffThreeMf(bytes)) throw new Refusal('it is not a zip package')
    const listed = listZipEntries(bytes, { maxEntries: limits.maxEntries })
    if (!listed.ok) throw new Refusal(listed.reason)
    const relsEntry = listed.entries.get('_rels/.rels')
    if (relsEntry === undefined) throw new Refusal('it has no _rels/.rels, so nothing names its model')
    const rels = await readZipEntry(bytes, relsEntry, limits.maxRelsBytes)
    if (!rels.ok) throw new Refusal(rels.reason)
    const start = startPartOf(decodeText(rels.bytes))
    let entry = listed.entries.get(start)
    if (entry === undefined) {
      try {
        entry = listed.entries.get(decodeURIComponent(start))
      } catch {
        entry = undefined
      }
    }
    if (entry === undefined) throw new Refusal(`its start part "${start.slice(0, 80)}" is not in the package`)
    const model = await readZipEntry(bytes, entry, limits.maxXmlBytes)
    if (!model.ok) throw new Refusal(model.reason)
    const { objects, items, unitScale } = readModel(decodeText(model.bytes), limits, meshLimits)
    checkGraph(objects)
    const { parts, duplicates, skippedObjects, triangleCount } = flatten(objects, items, limits)
    if (parts.length === 0) {
      throw new Refusal(skippedObjects > 0 ? 'its build holds only supports and other non-model objects, so there is nothing to import' : 'its build has nothing to import')
    }
    return { ok: true, format: '3mf', unitScale, parts, duplicates, skippedObjects, triangleCount }
  } catch (error) {
    if (error instanceof Refusal) {
      return error.counted === undefined
        ? { ok: false, reason: `Not a valid 3MF: ${error.message}` }
        : { ok: false, reason: `Not a valid 3MF: ${error.message}`, counted: error.counted }
    }
    return { ok: false, reason: `Not a valid 3MF: it could not be read (${error instanceof Error ? error.message : 'unknown error'})` }
  }
}
