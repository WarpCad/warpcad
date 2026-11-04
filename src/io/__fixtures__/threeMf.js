// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Generated 3MF and zip fixtures for specs (`TODO/io-024`): built byte by byte, so a spec knows
 * exactly what it hands the reader. No third-party model is used anywhere — in particular, never
 * the owner's own FreeCAD export, which this fixture only imitates in shape.
 *
 * {@link featherShapedThreeMf} is that shape: a box and a plate, the box placed twice (once with
 * FreeCAD's quarter turn, `2.22045e-16` terms and all), no object names, every placement in a
 * build item, the whole set written **three times**, a leading-slash start part, a thumbnail per
 * object, and every entry deflated.
 *
 * Runs in Node (vitest, Playwright's runner) and in browsers: `CompressionStream` only.
 */

import { crc32 } from '../../core/zip.js'

/**
 * @typedef {object} ZipFile
 * @property {string} name
 * @property {Uint8Array | string} data
 * @property {0 | 8 | number} [method] 0 stored, 8 deflated (default 8).
 * @property {boolean} [dataDescriptor] Sizes and CRC zero in the local header, after the data.
 * @property {boolean} [encrypted] Set flag bit 0.
 * @property {number} [crc] A CRC to write instead of the true one.
 * @property {Uint8Array} [raw] Compressed bytes to write as-is instead of compressing `data`.
 * @property {number} [uncompressedSize] A size to declare instead of the true one.
 */

/**
 * @param {Uint8Array | string} data
 * @returns {Uint8Array}
 */
function bytesOf(data) {
  return typeof data === 'string' ? new TextEncoder().encode(data) : data
}

/**
 * `deflate-raw` of `bytes`.
 *
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array>}
 */
export async function deflateRaw(bytes) {
  const stream = new Blob([/** @type {BlobPart} */ (bytes)]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * Build a zip. Each file may be stored or deflated, use a data descriptor, claim encryption or
 * carry a wrong CRC; `zip64` adds a zip64 end-of-central-directory locator.
 *
 * @param {readonly ZipFile[]} files
 * @param {{ zip64?: boolean, comment?: string }} [options]
 * @returns {Promise<Uint8Array>}
 */
export async function buildZip(files, options = {}) {
  const encoder = new TextEncoder()
  /** @type {Uint8Array[]} */
  const chunks = []
  /** @type {Uint8Array[]} */
  const central = []
  let offset = 0
  for (const file of files) {
    const data = bytesOf(file.data)
    const method = file.method ?? 8
    const stored = file.raw ?? (method === 8 ? await deflateRaw(data) : data)
    const crc = file.crc ?? crc32(data)
    const size = file.uncompressedSize ?? data.length
    const name = encoder.encode(file.name)
    const flags = 0x0800 | (file.dataDescriptor ? 0x0008 : 0) | (file.encrypted ? 0x0001 : 0)
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, flags, true)
    lv.setUint16(8, method, true)
    lv.setUint32(14, file.dataDescriptor ? 0 : crc, true)
    lv.setUint32(18, file.dataDescriptor ? 0 : stored.length, true)
    lv.setUint32(22, file.dataDescriptor ? 0 : size, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    chunks.push(local, stored)
    let length = local.length + stored.length
    if (file.dataDescriptor) {
      const descriptor = new Uint8Array(16)
      const dv = new DataView(descriptor.buffer)
      dv.setUint32(0, 0x08074b50, true)
      dv.setUint32(4, crc, true)
      dv.setUint32(8, stored.length, true)
      dv.setUint32(12, size, true)
      chunks.push(descriptor)
      length += 16
    }
    const header = new Uint8Array(46 + name.length)
    const cv = new DataView(header.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, flags, true)
    cv.setUint16(10, method, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, stored.length, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    header.set(name, 46)
    central.push(header)
    offset += length
  }
  const centralStart = offset
  const centralSize = central.reduce((sum, header) => sum + header.length, 0)
  chunks.push(...central)
  offset += centralSize
  if (options.zip64) {
    const locator = new Uint8Array(20)
    new DataView(locator.buffer).setUint32(0, 0x07064b50, true)
    chunks.push(locator)
  }
  const comment = encoder.encode(options.comment ?? '')
  const end = new Uint8Array(22 + comment.length)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, centralStart, true)
  ev.setUint16(20, comment.length, true)
  end.set(comment, 22)
  chunks.push(end)
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

/** The 3MF core namespace. */
export const CORE_NS = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'
/** The OPC relationship type naming the start part. */
export const MODEL_REL = 'http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel'

/**
 * `_rels/.rels` naming `target` as the start part, as FreeCAD writes it.
 *
 * @param {string} [target]
 * @param {string} [type]
 * @returns {string}
 */
export function relsXml(target = '/3D/3dmodel.model', type = MODEL_REL) {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Target="${target}" Id="rel0" Type="${type}"/>` +
    '<Relationship Target="/Metadata/thumbnail.png" Id="rel1" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"/>' +
    '</Relationships>'
  )
}

/** `[Content_Types].xml`. */
export const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'

/**
 * A mesh object's `<mesh>` for an axis-aligned box from the origin, wound outward.
 *
 * @param {[number, number, number]} size
 * @returns {string}
 */
export function boxMeshXml([x, y, z]) {
  const v = [
    [0, 0, 0], [x, 0, 0], [x, y, 0], [0, y, 0],
    [0, 0, z], [x, 0, z], [x, y, z], [0, y, z],
  ]
  const t = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
    [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7],
  ]
  return (
    '<mesh><vertices>' +
    v.map(([a, b, c]) => `<vertex x="${a}" y="${b}" z="${c}"/>`).join('') +
    '</vertices><triangles>' +
    t.map(([a, b, c]) => `<triangle v1="${a}" v2="${b}" v3="${c}"/>`).join('') +
    '</triangles></mesh>'
  )
}

/**
 * A 3MF model document.
 *
 * @param {{ objects: string, build: string, unit?: string | null, attributes?: string }} parts
 * @returns {string}
 */
export function modelXml({ objects, build, unit = 'millimeter', attributes = '' }) {
  const unitAttribute = unit === null ? '' : ` unit="${unit}"`
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<model${unitAttribute} xml:lang="en-US" xmlns="${CORE_NS}"${attributes}>` +
    `<resources>${objects}</resources><build>${build}</build></model>`
  )
}

/**
 * A 3MF package around a model document.
 *
 * @param {string} model
 * @param {{ rels?: string, modelPath?: string, extra?: ZipFile[], method?: number }} [options]
 * @returns {Promise<Uint8Array>}
 */
export function packageThreeMf(model, options = {}) {
  const method = options.method ?? 8
  return buildZip([
    { name: '[Content_Types].xml', data: CONTENT_TYPES, method },
    { name: '_rels/.rels', data: options.rels ?? relsXml(), method },
    { name: options.modelPath ?? '3D/3dmodel.model', data: model, method },
    ...(options.extra ?? []),
  ])
}

/** FreeCAD's quarter turn, verbatim from the owner's file's shape. */
export const QUARTER_TURN = '2.22045e-16 -1 0 1 2.22045e-16 0 0 0 1 4.445 11.43 1.57'

/** The plate's and box's sizes in the Feather-shaped fixture, millimetres. */
export const FIXTURE_SIZES = Object.freeze({ plate: [50.8, 22.86, 1.57], box: [16, 24, 2.95] })

/**
 * The model document shaped like FreeCAD's Feather export: three coincident sets of
 * `[plate, box, box turned]`, nine unnamed objects, nine build items.
 *
 * @returns {string}
 */
export function featherShapedModel() {
  let objects = ''
  let build = ''
  for (let set = 0; set < 3; set += 1) {
    const base = set * 3
    objects += `<object id="${base + 1}" type="model">${boxMeshXml(/** @type {any} */ (FIXTURE_SIZES.plate))}</object>`
    objects += `<object id="${base + 2}" type="model">${boxMeshXml(/** @type {any} */ (FIXTURE_SIZES.box))}</object>`
    objects += `<object id="${base + 3}" type="model">${boxMeshXml(/** @type {any} */ (FIXTURE_SIZES.box))}</object>`
    build += `<item objectid="${base + 1}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`
    build += `<item objectid="${base + 2}" transform="1 0 0 0 1 0 0 0 1 30 0 1.57"/>`
    build += `<item objectid="${base + 3}" transform="${QUARTER_TURN}"/>`
  }
  return modelXml({ objects, build })
}

/**
 * The whole Feather-shaped package, deflated, with a (corrupt, never-read) thumbnail per object.
 *
 * @returns {Promise<Uint8Array>}
 */
export function featherShapedThreeMf() {
  const thumbnails = Array.from({ length: 9 }, (_, index) => ({
    name: `Metadata/thumbnail${index + 1}.png`,
    // Not deflate data at all, and a wrong CRC: inflating it would fail loudly.
    raw: new Uint8Array([0xff, 0xff, 0xff, 0xff]),
    data: new Uint8Array(64),
    crc: 1,
  }))
  return packageThreeMf(featherShapedModel(), { extra: thumbnails })
}
