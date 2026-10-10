// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Print prep (`TODO/io-007`): the pieces a body prints as, whether they fit the printer, which
 * way up each goes, and **Export… → Print pieces** — a zip of one STL per piece.
 *
 * ## A piece is a top-level part
 *
 * A body whose geometry is a group of named parts (`hasNamedParts` — what Split returns, and
 * what every composite is) prints as one piece per visible part; any other body is one piece.
 * That is the same rule the Inspector's parts list and the viewport's per-part meshes already
 * follow, so the files in the zip are exactly the things a person can click on.
 *
 * ## Orientation: lay it on its largest flat face
 *
 * {@link layFlat} finds the largest flat face the piece can actually rest on — coplanar
 * polygons summed, and only a plane every vertex lies on or behind counts, so a big face down
 * inside a recess never wins — turns that face down onto z = 0 and centres the piece on the
 * origin of its own file. A slicer would let a person do this by hand; doing it here means
 * the file opens ready to slice.
 *
 * **Supports: a heuristic, and it says so.** After laying flat, a piece "may need supports"
 * when any face off the bed points downward more steeply than 45° from vertical — the common
 * FDM rule. It does not know about bridging, layer height or material, so it is a hint for
 * the file list, never a verdict.
 *
 * ## Refusals
 *
 * Every piece goes through the same repair the STL export uses (`makeWatertight`, `io-004`)
 * and is then checked for open edges; a piece still open is refused by name with an
 * `ExportError` (`not-watertight`) rather than exported for a slicer to fill or drop. Nothing
 * to export, or a piece with no triangles, is refused the way `export.js` refuses it.
 *
 * Framework-free, synchronous: this is what the export worker runs (`exportJob.js`'s
 * `runPrintPiecesJob`), and what the client falls back to when there is no worker.
 *
 * @module core/printPrep
 */

import modeling from '@jscad/modeling'

import { fitVerdict } from './buildVolume.js'
import { ExportError, exportBodies, slugifyName } from './export.js'
import { boundsOf, hasNamedParts, toGeom3 } from './kernel/group.js'
import { makeWatertight, openEdgesOf } from './kernel/watertight.js'
import { createZip } from './zip.js'

const { geometries, maths, transforms } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./export.js').ExportBody} ExportBody */
/** @typedef {import('./buildVolume.js').BuildVolume} BuildVolume */
/** @typedef {import('./buildVolume.js').FitVerdict} FitVerdict */
/** @typedef {[number, number, number]} Vec3Mm */

/** Downward faces steeper than this from vertical "may need supports" — the usual FDM rule. */
export const OVERHANG_LIMIT_DEG = 45

/** What every print-pieces result says about its own support hint. */
export const SUPPORTS_HEURISTIC =
  'Support hints are a heuristic: a face pointing down more than 45° from vertical, off the bed, is flagged. Bridging, layer height and material are not considered — slice it before trusting it.'

/**
 * @typedef {object} PrintPiece
 * @property {string} name The part's name, or the body's for a one-piece body.
 * @property {Geom3} solid
 */

/**
 * The pieces a body prints as: one per visible top-level part, or the body itself.
 *
 * @param {ExportBody} body
 * @returns {PrintPiece[]}
 */
export function printPiecesOf(body) {
  const geometry = body.geometry
  if (hasNamedParts(geometry)) {
    return geometry.names
      .filter((name) => geometry.parts[name].polygons.length > 0)
      .map((name) => ({ name, solid: geometry.parts[name] }))
  }
  return [{ name: body.name, solid: toGeom3(geometry) }]
}

/**
 * @param {Geom3} solid
 * @returns {Vec3Mm}
 */
function sizeOfSolid(solid) {
  const [min, max] = boundsOf(solid)
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
}

/** @type {Record<FitVerdict['verdict'], number>} */
const SEVERITY = { fits: 0, 'fits-rotated': 1, 'too-large': 2 }

/**
 * @typedef {object} BodyFit
 * @property {FitVerdict['verdict']} verdict The worst piece's.
 * @property {string} label What the Inspector's badge says.
 * @property {number} overByMm The worst piece's, `0` unless too large.
 * @property {Vec3Mm} sizeMm The whole body's bounding box size.
 * @property {({ name: string, sizeMm: Vec3Mm } & FitVerdict)[]} pieces
 */

/**
 * The fit verdict for a body, judged **per print piece** — a split wing fits when each of its
 * pieces does, even though the assembled wing is longer than the bed.
 *
 * @param {ExportBody} body
 * @param {BuildVolume} volume
 * @returns {BodyFit}
 */
export function bodyFit(body, volume) {
  const [min, max] = boundsOf(body.geometry)
  const pieces = printPiecesOf(body).map((piece) => {
    const sizeMm = sizeOfSolid(piece.solid)
    return { name: piece.name, sizeMm, ...fitVerdict(sizeMm, volume) }
  })
  const worst = pieces.reduce(
    (a, b) => (SEVERITY[b.verdict] > SEVERITY[a.verdict] || (b.verdict === a.verdict && b.overByMm > a.overByMm) ? b : a),
    pieces[0]
  )
  const sizeMm = /** @type {Vec3Mm} */ ([max[0] - min[0], max[1] - min[1], max[2] - min[2]])
  if (!worst) return { verdict: 'fits', label: 'fits', overByMm: 0, sizeMm, pieces }
  const label =
    pieces.length > 1 && worst.verdict !== 'fits' ? `${worst.name} ${worst.label}` : worst.verdict === 'fits' ? 'fits' : worst.label
  return { verdict: worst.verdict, label, overByMm: worst.overByMm, sizeMm, pieces }
}

/**
 * Lay a solid on its largest flat face (or leave it as placed), bottom on z = 0, centred on
 * the origin in X and Y.
 *
 * @param {Geom3} solid
 * @param {{ bedFace?: 'largest' | 'as-placed' }} [options]
 * @returns {{ solid: Geom3, mayNeedSupports: boolean, bedFaceAreaMm2: number }}
 */
export function layFlat(solid, options = {}) {
  const polygons = geometries.geom3.toPolygons(solid)
  /** @type {Map<string, { normal: Vec3Mm, w: number, area: number }>} */
  const planes = new Map()
  for (const polygon of polygons) {
    const plane = geometries.poly3.plane(polygon)
    const area = geometries.poly3.measureArea(polygon)
    if (!(area > 1e-9)) continue
    const key = `${plane[0].toFixed(4)},${plane[1].toFixed(4)},${plane[2].toFixed(4)},${plane[3].toFixed(3)}`
    const entry = planes.get(key)
    if (entry) entry.area += area
    else planes.set(key, { normal: [plane[0], plane[1], plane[2]], w: plane[3], area })
  }

  /** @type {Vec3Mm} */
  let down = [0, 0, -1]
  let bedFaceAreaMm2 = 0
  if (options.bedFace !== 'as-placed') {
    const candidates = [...planes.values()].sort((a, b) => b.area - a.area)
    for (const candidate of candidates) {
      const [nx, ny, nz] = candidate.normal
      const supporting = polygons.every((polygon) =>
        polygon.vertices.every((vertex) => vertex[0] * nx + vertex[1] * ny + vertex[2] * nz <= candidate.w + 1e-4)
      )
      if (supporting) {
        down = candidate.normal
        bedFaceAreaMm2 = candidate.area
        break
      }
    }
  }

  let turned = solid
  if (Math.abs(down[2] + 1) > 1e-9) {
    // `fromVectorRotation` ships in `@jscad/modeling`'s mat4 index but is missing from its
    // `index.d.ts`, hence the cast.
    const mat4 = /** @type {any} */ (maths.mat4)
    const matrix = mat4.fromVectorRotation(mat4.create(), down, [0, 0, -1])
    turned = transforms.transform(matrix, solid)
  }
  const [min, max] = boundsOf(turned)
  const placed = transforms.translate([-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2, -min[2]], turned)

  const limit = -Math.cos((OVERHANG_LIMIT_DEG * Math.PI) / 180)
  let mayNeedSupports = false
  for (const polygon of geometries.geom3.toPolygons(placed)) {
    const plane = geometries.poly3.plane(polygon)
    if (!(plane[2] < limit - 1e-6)) continue
    if (polygon.vertices.some((vertex) => vertex[2] > 0.01)) {
      mayNeedSupports = true
      break
    }
  }
  return { solid: placed, mayNeedSupports, bedFaceAreaMm2 }
}

/**
 * @typedef {object} PrintPieceFile
 * @property {string} filename e.g. `wing-a.stl`.
 * @property {string} pieceName
 * @property {number} sizeBytes
 * @property {number} triangleCount
 * @property {boolean} mayNeedSupports See {@link SUPPORTS_HEURISTIC}.
 */

/**
 * @typedef {object} PrintPiecesResult
 * @property {Uint8Array} bytes The zip.
 * @property {string} filename `wing-print-pieces.zip`, or `warpcad-print-pieces.zip` for several bodies.
 * @property {string} mimeType
 * @property {PrintPieceFile[]} files In zip order.
 * @property {string} heuristic {@link SUPPORTS_HEURISTIC}.
 */

/**
 * Export every piece of `bodies` as its own STL, laid flat, in one zip.
 *
 * @param {readonly ExportBody[]} bodies Already scoped (`resolveExportScope`).
 * @returns {PrintPiecesResult}
 * @throws {ExportError} `nothing-to-export`, `empty-geometry` or `not-watertight`, naming the piece.
 */
export function exportPrintPieces(bodies) {
  if (bodies.length === 0) {
    throw new ExportError('nothing-to-export', 'Nothing to export — the scene has no bodies')
  }
  /** @type {(PrintPieceFile & { bytes: Uint8Array })[]} */
  const files = []
  const used = new Set()
  for (const body of bodies) {
    for (const piece of printPiecesOf(body)) {
      if (!piece.solid.polygons.some((polygon) => polygon.vertices.length >= 3)) {
        throw new ExportError('empty-geometry', `Cannot export "${piece.name}": it has no triangles, so the file would be empty`, piece.name)
      }
      const repaired = makeWatertight(piece.solid)
      const open = openEdgesOf(repaired).openEdges
      if (open > 0) {
        throw new ExportError(
          'not-watertight',
          `Cannot export "${piece.name}": it is not watertight (${open} open edge${open === 1 ? '' : 's'}), so a slicer may fill or drop part of it — repair it first`,
          piece.name
        )
      }
      const laid = layFlat(repaired)
      const result = exportBodies([{ id: body.id, name: piece.name, geometry: laid.solid }], 'stl')
      const stem = slugifyName(piece.name)
      let filename = `${stem}.stl`
      for (let n = 2; used.has(filename); n += 1) filename = `${stem}-${n}.stl`
      used.add(filename)
      files.push({
        filename,
        pieceName: piece.name,
        bytes: result.bytes,
        sizeBytes: result.bytes.byteLength,
        triangleCount: result.triangleCount,
        mayNeedSupports: laid.mayNeedSupports,
      })
    }
  }
  const bytes = createZip(files.map((file) => ({ name: file.filename, bytes: file.bytes })))
  return {
    bytes,
    filename: bodies.length === 1 ? `${slugifyName(bodies[0].name)}-print-pieces.zip` : 'warpcad-print-pieces.zip',
    mimeType: 'application/zip',
    files: files.map(({ bytes: _bytes, ...file }) => file),
    heuristic: SUPPORTS_HEURISTIC,
  }
}
