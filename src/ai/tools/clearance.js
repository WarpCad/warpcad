// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `check_clearance` (`TODO/ai-007`): do two bodies clear each other, and by how much — a Pi
 * board inside its enclosure, a wing spar that must slide into its socket.
 *
 * Overlap is an exact kernel intersection (`overlapVolume`); a gap is the closest approach of
 * the two surfaces (`minimumDistance`, vertex-to-surface both ways — exact whenever the
 * closest point touches a vertex, which covers faces, corners and faceted curves; see
 * `src/core/kernel/measure.js`).
 *
 * @module ai/tools/clearance
 */

import { minimumDistance, overlapVolume } from '../../core/kernel/measure.js'
import { mmText } from './printability.js'
import { findBody, round, round3 } from './read.js'
import { objectSchema } from './schema.js'

/** @typedef {import('./index.js').Tool} Tool */

/** Below this, mm³, two bodies are touching rather than overlapping (kernel noise on a shared face). */
const OVERLAP_EPSILON_MM3 = 1e-6

/** @returns {Tool} */
export function createClearanceTool() {
  return {
    name: 'check_clearance',
    description:
      'Clearance between two bodies by id: the smallest gap between their surfaces (mm) and the closest points, ' +
      'or, if they interpenetrate, the volume they share (mm³). Use it for parts that must fit together or slide.',
    inputSchema: objectSchema(
      {
        a: { type: 'string', description: 'A body id from describe_scene.' },
        b: { type: 'string', description: 'Another body id.' },
      },
      ['a', 'b']
    ),
    transports: ['ai', 'mcp'],
    run: (ctx, input) => {
      if (input.a === input.b) return { error: 'check_clearance needs two different bodies; a and b are the same id.' }
      const a = findBody(ctx.document, input.a)
      if (a.reason !== undefined) return { error: a.reason }
      const b = findBody(ctx.document, input.b)
      if (b.reason !== undefined) return { error: b.reason }
      const named = { a: { id: a.body.id, name: a.body.name }, b: { id: b.body.id, name: b.body.name } }

      const overlap = overlapVolume(a.body.geometry, b.body.geometry)
      if (overlap > OVERLAP_EPSILON_MM3) {
        return {
          ...named,
          interpenetrating: true,
          overlapVolumeMm3: round(overlap),
          gapMm: 0,
          closestMm: null,
          message: `They overlap by ${mmText(overlap)} mm³ — the bodies interpenetrate.`,
        }
      }
      const gap = minimumDistance(a.body.geometry, b.body.geometry)
      if (gap.distanceMm === null) return { error: 'One of the bodies has no surface to measure from.' }
      const gapMm = round(gap.distanceMm)
      return {
        ...named,
        interpenetrating: false,
        overlapVolumeMm3: 0,
        gapMm,
        closestMm: { onA: round3(gap.onAMm), onB: round3(gap.onBMm) },
        message: gapMm === 0 ? 'They touch: no gap and no overlap.' : `${mmText(gapMm)} mm apart at the closest point.`,
      }
    },
  }
}
