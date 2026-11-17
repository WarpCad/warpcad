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
 * Either side may name parts of a group (`aPieces`, `bPieces`, `TODO/FIND-ai-041` gap 4), so the
 * gap between a Base and a Pin inside one body is measured rather than taken on trust. The
 * parts are flattened by the same `combine` a boolean's `{ id, pieces }` operand is, so what is
 * measured is what a cut would use.
 *
 * @module ai/tools/clearance
 */

import { combine, isGroup } from '../../core/kernel/group.js'
import { minimumDistance, overlapVolume } from '../../core/kernel/measure.js'
import { mmText } from './printability.js'
import { findBody, round, round3 } from './read.js'
import { objectSchema } from './schema.js'

/** @typedef {import('./index.js').Tool} Tool */

/** Below this, mm³, two bodies are touching rather than overlapping (kernel noise on a shared face). */
const OVERLAP_EPSILON_MM3 = 1e-6

/**
 * One side of the check: a whole body, or the named parts of one.
 *
 * @param {import('../../core/document.js').WarpDocument} document
 * @param {string} id
 * @param {string | undefined} pieces Comma-separated part names, or absent for the whole body.
 * @returns {{ geometry: any, named: { id: string, name: string, pieces?: string }, error?: undefined } | { error: string }}
 */
function sideOf(document, id, pieces) {
  const found = findBody(document, id)
  if (found.reason !== undefined) return { error: found.reason }
  const { body } = found
  if (pieces === undefined) return { geometry: body.geometry, named: { id: body.id, name: body.name } }
  if (!isGroup(body.geometry)) return { error: `${body.name} (${body.id}) is a single solid and has no parts to name; leave its pieces out.` }
  const known = Object.keys(body.geometry.parts)
  const names = pieces.split(',').map((piece) => piece.trim())
  const unknown = names.find((name) => !known.includes(name))
  if (unknown !== undefined) return { error: `${body.name} has no part named "${unknown}"; its parts are ${known.join(', ')}.` }
  return { geometry: combine(body.geometry, names.join(',')), named: { id: body.id, name: body.name, pieces: names.join(',') } }
}

/** @returns {Tool} */
export function createClearanceTool() {
  return {
    name: 'check_clearance',
    description:
      'Clearance between two bodies by id: the smallest gap between their surfaces (mm) and the closest points, ' +
      'or, if they interpenetrate, the volume they share (mm³). Use it for parts that must fit together or slide. ' +
      'aPieces/bPieces narrow a side to named parts of a group, so a and b may be the same body when they name different parts.',
    inputSchema: objectSchema(
      {
        a: { type: 'string', description: 'A body id from describe_scene.' },
        aPieces: { type: 'string', description: 'Optional: comma-separated part names of a, from describe_body, to measure just those parts.' },
        b: { type: 'string', description: 'Another body id, or the same one with different pieces.' },
        bPieces: { type: 'string', description: 'Optional: comma-separated part names of b.' },
      },
      ['a', 'b']
    ),
    transports: ['ai', 'mcp'],
    run: (ctx, input) => {
      if (input.a === input.b && (input.aPieces === undefined || input.bPieces === undefined || input.aPieces === input.bPieces)) {
        return { error: 'check_clearance needs two different bodies, or two different parts of one body (aPieces, bPieces); a and b are the same.' }
      }
      const a = sideOf(ctx.document, input.a, input.aPieces)
      if (a.error !== undefined) return { error: a.error }
      const b = sideOf(ctx.document, input.b, input.bPieces)
      if (b.error !== undefined) return { error: b.error }
      const named = { a: a.named, b: b.named }

      const overlap = overlapVolume(a.geometry, b.geometry)
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
      const gap = minimumDistance(a.geometry, b.geometry)
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
