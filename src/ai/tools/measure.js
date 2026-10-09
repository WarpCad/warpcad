// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `measure` (`TODO/ai-007`): numbers the model can check its work against — bounds and size in
 * millimetres, volume, surface area and centre of mass — read off the kernel geometry through
 * `src/core/kernel/measure.js`, the same functions the UI's own measurements use.
 *
 * A group is one body and is measured as the union of its visible parts, so overlapping parts
 * count once (the same union `measureGeometry` runs). Several ids also get a `total`, measured
 * as their union for the same reason. Small JSON only: never a mesh.
 *
 * @module ai/tools/measure
 */

import { analyseGeometry, analyseTogether } from '../../core/kernel/measure.js'
import { resolveBodies, round, round3 } from './read.js'
import { objectSchema } from './schema.js'

/** @typedef {import('./index.js').Tool} Tool */
/** @typedef {import('../../core/kernel/measure.js').Analysis} Analysis */

/** The `ids` property every analysis tool takes. */
export const IDS_SCHEMA = { type: /** @type {'array'} */ ('array'), items: { type: /** @type {'string'} */ ('string') }, description: 'Body ids from describe_scene.' }

/**
 * @param {Analysis} analysis
 * @returns {{ boundsMm: number[][], sizeMm: number[], volumeMm3: number, surfaceAreaMm2: number, centerOfMassMm: number[] }}
 */
function numbers(analysis) {
  const [min, max] = analysis.bounds
  return {
    boundsMm: [round3(min), round3(max)],
    sizeMm: round3([max[0] - min[0], max[1] - min[1], max[2] - min[2]]),
    volumeMm3: round(analysis.volumeMm3),
    surfaceAreaMm2: round(analysis.surfaceAreaMm2),
    centerOfMassMm: round3(analysis.centerOfMassMm),
  }
}

/** @returns {Tool} */
export function createMeasureTool() {
  return {
    name: 'measure',
    description:
      'Measure bodies by id: world bounds and size (mm), volume (mm³), surface area (mm²) and centre of mass (mm). ' +
      'A group is measured as one solid. Several ids also get a total, with overlaps counted once. Use it to check a part against what was asked before you say it is finished.',
    inputSchema: objectSchema({ ids: IDS_SCHEMA }, ['ids']),
    transports: ['ai', 'mcp'],
    run: (ctx, input) => {
      const resolved = resolveBodies(ctx.document, input.ids)
      if (resolved.error !== undefined) return { error: resolved.error }
      const { bodies } = resolved
      const measured = bodies.map((body) => ({ id: body.id, name: body.name, ...numbers(analyseGeometry(body.geometry)) }))
      if (bodies.length === 1) return { bodies: measured }
      return { bodies: measured, total: numbers(analyseTogether(bodies.map((body) => body.geometry))) }
    },
  }
}
