// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `check_printability` (`TODO/ai-007`): the checks a person runs before sending a part to an
 * FDM printer, as a list of `{ severity, message, where }` the model can act on.
 *
 * - **Watertight / manifold** — open edges in the surface the export would write
 *   (`openEdgesOf(makeWatertight(...))`, `src/core/kernel/watertight.js`), with where they are.
 * - **Fits the build volume** — as placed, or else which way round it would fit (axis-aligned
 *   orientations only), or that it must be split.
 * - **Thinnest wall** — sampled rays (`wallThickness`, `src/core/kernel/measure.js`). Under the
 *   nozzle is an `error` (it will not print there); under the minimum wall is a `warning`.
 *
 * **Heuristic, and it says so.** Sampling can miss a feature narrower than the sample spacing,
 * fit ignores diagonal placement, and nothing here knows about overhangs or supports. The
 * result never claims a part prints — `heuristic` says what was and was not checked — and the
 * defaults it judged against are returned in `settings`, so "fits" is never a claim about an
 * unstated printer.
 *
 * @module ai/tools/printability
 */

import { toGeom3 } from '../../core/kernel/group.js'
import { analyseGeometry, wallThickness } from '../../core/kernel/measure.js'
import { makeWatertight, openEdgesOf } from '../../core/kernel/watertight.js'
import { IDS_SCHEMA } from './measure.js'
import { resolveBodies, round3 } from './read.js'
import { objectSchema, vectorSchema } from './schema.js'

/** @typedef {import('./index.js').Tool} Tool */
/** @typedef {[number, number, number]} Vec3 */

/**
 * The printing defaults the system prompt states (`src/ai/prompt.js`): a 220 × 220 × 250 mm
 * build volume, a 1.2 mm minimum wall (three perimeters of a 0.4 mm nozzle).
 */
export const PRINT_DEFAULTS = Object.freeze({
  buildVolumeMm: /** @type {Vec3} */ ([220, 220, 250]),
  minWallMm: 1.2,
  nozzleMm: 0.4,
})

/**
 * @typedef {object} Issue
 * @property {'error' | 'warning' | 'info'} severity
 * @property {string} bodyId
 * @property {string} message One sentence, with the numbers in it.
 * @property {Vec3 | null} where A point in world millimetres, when the problem has one.
 */

const AXES = ['X', 'Y', 'Z']

/** The six axis-aligned ways to stand a box, as-placed first. */
const ORIENTATIONS = /** @type {const} */ ([
  [0, 1, 2],
  [1, 0, 2],
  [0, 2, 1],
  [2, 0, 1],
  [1, 2, 0],
  [2, 1, 0],
])

/**
 * A length for a sentence: two decimals under 10 mm, one above, trailing zeros dropped.
 *
 * @param {number} mm
 * @returns {string}
 */
export function mmText(mm) {
  return String(Number(mm.toFixed(Math.abs(mm) < 10 ? 2 : 1)))
}

/** @param {readonly number[]} size @returns {string} */
const sizeText = (size) => `${size.map(mmText).join(' × ')} mm`

/** @param {readonly number[]} point @returns {string} */
const pointText = (point) => `(${point.map(mmText).join(', ')})`

/**
 * @param {Vec3} size
 * @param {Vec3} volume
 * @returns {{ asPlaced: boolean, sizeMm: Vec3 | null, orientation: string | null }}
 */
function fitOf(size, volume) {
  for (const [index, order] of ORIENTATIONS.entries()) {
    const turned = /** @type {Vec3} */ ([size[order[0]], size[order[1]], size[order[2]]])
    if (turned.every((value, axis) => value <= volume[axis] + 1e-9)) {
      /** @type {string} */
      let orientation = 'as placed'
      if (index > 0) {
        orientation =
          order[2] === 2 ? 'turned 90° on the bed' : `laid on its side, with its ${AXES[order[2]]} axis vertical`
      }
      return { asPlaced: index === 0, sizeMm: round3(turned), orientation }
    }
  }
  return { asPlaced: false, sizeMm: null, orientation: null }
}

/** @returns {Tool} */
export function createPrintabilityTool() {
  return {
    name: 'check_printability',
    description:
      'Heuristic FDM print checks for bodies by id: watertight/manifold (open edges, with where), whether it fits the build volume and which way round, ' +
      'the thinnest wall found by sampling, and walls thinner than the nozzle. Returns issues as { severity: error|warning|info, message, where: [x, y, z] mm }. ' +
      'Defaults: 220 × 220 × 250 mm build volume, 1.2 mm minimum wall, 0.4 mm nozzle. It never guarantees a part prints.',
    inputSchema: objectSchema(
      {
        ids: IDS_SCHEMA,
        buildVolumeMm: vectorSchema(3, 'The printer’s build volume [x, y, z], in millimetres.'),
        minWallMm: { type: 'number', description: 'The thinnest wall that is acceptable, in millimetres.' },
        nozzleMm: { type: 'number', description: 'Nozzle diameter, in millimetres; a wall thinner than this cannot print.' },
      },
      ['ids']
    ),
    transports: ['ai', 'mcp'],
    run: (ctx, input) => {
      const resolved = resolveBodies(ctx.document, input.ids)
      if (resolved.error !== undefined) return { error: resolved.error }
      const settings = {
        buildVolumeMm: /** @type {Vec3} */ ([...(input.buildVolumeMm ?? PRINT_DEFAULTS.buildVolumeMm)]),
        minWallMm: input.minWallMm ?? PRINT_DEFAULTS.minWallMm,
        nozzleMm: input.nozzleMm ?? PRINT_DEFAULTS.nozzleMm,
      }
      if (settings.buildVolumeMm.some((value) => !(value > 0)) || !(settings.minWallMm > 0) || !(settings.nozzleMm > 0)) {
        return { error: 'buildVolumeMm, minWallMm and nozzleMm must all be positive millimetres.' }
      }
      /** @type {Issue[]} */
      const issues = []
      let rays = 0
      const bodies = resolved.bodies.map((body) => {
        const analysis = analyseGeometry(body.geometry)
        const [min, max] = analysis.bounds
        const size = /** @type {Vec3} */ ([max[0] - min[0], max[1] - min[1], max[2] - min[2]])

        const open = openEdgesOf(makeWatertight(toGeom3(body.geometry)))
        if (open.openEdges > 0) {
          issues.push({
            severity: 'error',
            bodyId: body.id,
            message:
              `Not watertight: ${open.openEdges} edge${open.openEdges === 1 ? ' is' : 's are'} open or shared by more than two faces, ` +
              `first at ${pointText(open.where[0])}. A slicer may fill or drop it.`,
            where: round3(open.where[0]),
          })
        }

        const fits = fitOf(size, settings.buildVolumeMm)
        const volume = sizeText(settings.buildVolumeMm)
        if (fits.asPlaced) {
          issues.push({ severity: 'info', bodyId: body.id, message: `Fits the ${volume} build volume as placed, at ${sizeText(size)}.`, where: null })
        } else if (fits.sizeMm !== null) {
          issues.push({
            severity: 'warning',
            bodyId: body.id,
            message: `Too big for the ${volume} build volume as placed (${sizeText(size)}); it fits ${fits.orientation} (${sizeText(fits.sizeMm)}).`,
            where: null,
          })
        } else {
          issues.push({
            severity: 'error',
            bodyId: body.id,
            message: `Larger than the ${volume} build volume every way round (${sizeText(size)}): split it into parts that fit.`,
            where: null,
          })
        }

        const walls = wallThickness(body.geometry, { belowMm: settings.minWallMm })
        rays += walls.samples
        for (const spot of walls.thin) {
          const at = pointText(spot.atMm)
          const thickness = mmText(spot.thicknessMm)
          issues.push(
            spot.thicknessMm < settings.nozzleMm
              ? {
                  severity: 'error',
                  bodyId: body.id,
                  message: `Wall ${thickness} mm thick at ${at} — thinner than the ${mmText(settings.nozzleMm)} mm nozzle, so it will not print there.`,
                  where: round3(spot.atMm),
                }
              : {
                  severity: 'warning',
                  bodyId: body.id,
                  message: `Wall ${thickness} mm thick at ${at} — below the ${mmText(settings.minWallMm)} mm minimum wall.`,
                  where: round3(spot.atMm),
                }
          )
        }
        return {
          id: body.id,
          name: body.name,
          sizeMm: round3(size),
          watertight: open.openEdges === 0,
          openEdges: open.openEdges,
          thinnestWallMm: walls.minMm === null ? null : Number(walls.minMm.toFixed(4)),
          thinnestAtMm: walls.minAtMm === null ? null : round3(walls.minAtMm),
          fits,
        }
      })
      const order = { error: 0, warning: 1, info: 2 }
      issues.sort((a, b) => order[a.severity] - order[b.severity])
      return {
        heuristic:
          `Heuristic checks, not a guarantee: walls were sampled with ${rays} rays, so a feature narrower than the sample spacing can be missed; ` +
          'fit is checked on axis-aligned orientations only; overhangs and supports are not checked. Slice it before trusting it.',
        settings,
        bodies,
        issues,
        errors: issues.filter((issue) => issue.severity === 'error').length,
        warnings: issues.filter((issue) => issue.severity === 'warning').length,
      }
    },
  }
}
