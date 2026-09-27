import { describe, expect, it } from 'vitest'

import { buildNameIndex, describeRow } from './timelineLabel.js'

/**
 * The History panel's **rich** row label (`TODO/ui-032`).
 *
 * `src/core/document.js`'s own `labelFor` is deliberately shallow — it names an
 * *action* for the Undo tooltip (`Chamfer Cube 1`) and its module doc says so
 * outright: "`ui-032`'s timeline rows want the richer `Chamfer Top (+Z) 5 mm on
 * Cube 1`, which reads params and belongs with the panel that shows them, not
 * here." This module is that, kept pure and in `src/core/` per CLAUDE.md's
 * "geometry logic belongs in `src/core/`, not in components" — a component
 * doing param formatting for six op families is the same class of creep.
 *
 * The exact strings matter: `TODO/ACCEPTANCE.md` scenario 12's **Expect** reads
 * `Cube 1 — placed`, `Chamfer Top (+Z) 5 mm on Cube 1` and `Sphere 1 — placed`
 * off the rendered list, and `docs/decisions/interaction-model-qa.md` §13 adds
 * `Union Cube 1 + Cylinder 1`.
 */
describe('timeline row labels (TODO/ui-032)', () => {
  const cube = { id: 'cuboid-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [40, 40, 40] } }
  const cylinder = {
    id: 'cylinder-2',
    op: 'primitive.cylinder',
    name: 'Cylinder 1',
    params: { diameter: 40, height: 50 },
  }

  it('names a placement the way the scenario reads it off the screen', () => {
    const index = buildNameIndex([cube])
    expect(describeRow(cube, index)).toBe('Cube 1 — placed')
  })

  it('spells a chamfer out with its face and radius, not just its verb', () => {
    const chamfer = {
      id: 'chamfer-3',
      op: 'modify.chamferRim',
      supersedes: 'cuboid-1',
      params: { radius: 5, orientation: 'z+' },
    }
    const index = buildNameIndex([cube, chamfer])
    expect(describeRow(chamfer, index)).toBe('Chamfer Top (+Z) 5 mm on Cube 1')
  })

  it('uses the same shape for a fillet, and drops a trailing zero', () => {
    const fillet = {
      id: 'fillet-4',
      op: 'modify.filletRim',
      supersedes: 'cuboid-1',
      params: { radius: 3.0, orientation: 'x-' },
    }
    expect(describeRow(fillet, buildNameIndex([cube, fillet]))).toBe(
      'Fillet Left (−X) 3 mm on Cube 1'
    )
  })

  it('names both operands of a boolean, per §13', () => {
    const union = {
      id: 'union-3',
      op: 'boolean.union',
      consumes: ['cuboid-1', 'cylinder-2'],
      operands: ['cuboid-1', 'cylinder-2'],
      name: 'Union 1',
    }
    const index = buildNameIndex([cube, cylinder, union])
    expect(describeRow(union, index)).toBe('Union Cube 1 + Cylinder 1')
  })

  it('resolves a subject through a chain of supersessions back to the body name', () => {
    // A transform record carries no name of its own (`src/core/transform.js`
    // explains why), so a label that read the acting record would say
    // `move-4`. The walk back along `supersedes` is what makes it say `Cube 1`.
    const move = { id: 'move-3', op: 'transform.translate', supersedes: 'cuboid-1', target: 'cuboid-1', params: { vector: [5, 0, 0] } }
    const move2 = { id: 'move-4', op: 'transform.translate', supersedes: 'move-3', target: 'move-3', params: { vector: [1, 0, 0] } }
    const index = buildNameIndex([cube, move, move2])
    expect(describeRow(move2, index)).toBe('Move Cube 1')
  })

  it('reads a baked align-to-origin translate as "Align to origin", not "Move" (TODO/ui-050)', () => {
    // `src/core/transform.js`'s `alignToOriginRecord` builds the exact same
    // shape of record a drag or a typed Position would — deliberately, so
    // gizmo/field sync and Undo scoping are automatic — and sets
    // `params.alignedTo` as the one flag that lets this row read differently
    // from an ordinary move a user didn't make.
    const align = {
      id: 'move-9',
      op: 'transform.translate',
      supersedes: 'cuboid-1',
      target: 'cuboid-1',
      params: { vector: [0, 0, 13], rotation: [0, 0, 0], alignedTo: true },
    }
    const index = buildNameIndex([cube, align])
    expect(describeRow(align, index)).toBe('Align to origin on Cube 1')
  })

  it('an ordinary move with no alignedTo flag still reads "Move", not "Align to origin"', () => {
    const move = {
      id: 'move-9',
      op: 'transform.translate',
      supersedes: 'cuboid-1',
      target: 'cuboid-1',
      params: { vector: [0, 0, 13], rotation: [0, 0, 0] },
    }
    const index = buildNameIndex([cube, move])
    expect(describeRow(move, index)).toBe('Move Cube 1')
  })

  it('calls a creation record that supersedes another an edit, not a second placement', () => {
    // `ui-029`'s in-place param edit reuses the *creation* op over the lineage's
    // terminal. Labelling it `Cylinder 1 — placed` would put two "placed" rows
    // in the list for one body, which is exactly the confusion §13's row text
    // exists to prevent.
    const edited = {
      id: 'cylinder-5',
      op: 'primitive.cylinder',
      supersedes: 'cylinder-2',
      params: { diameter: 12, height: 50 },
    }
    const index = buildNameIndex([cylinder, edited])
    expect(describeRow(edited, index)).toBe('Cylinder 1 — edited')
  })

  it('names a sketch entity as drawn rather than placed', () => {
    const line = { id: 'line-1', op: 'sketch.line', name: 'Line 1', params: { start: [0, 0], end: [10, 0] } }
    expect(describeRow(line, buildNameIndex([line]))).toBe('Line 1 — drawn')
  })

  it('falls back to the bare verb rather than inventing a subject it cannot resolve', () => {
    const orphan = { id: 'x-9', op: 'transform.rotate', supersedes: 'gone', target: 'gone', params: { rotation: [0, 0, 90] } }
    expect(describeRow(orphan, buildNameIndex([orphan]))).toBe('Rotate')
  })

  it('never throws on a malformed record — a broken row must still be listable', () => {
    // The panel renders rows for suppressed, inactive and broken steps too. A
    // label that threw would take the whole list down with it, which is worse
    // than an ugly row.
    expect(describeRow(/** @type {any} */ ({}), new Map())).toBe('Unknown step')
    expect(describeRow(undefined, new Map())).toBe('Unknown step')
  })

  it('is cycle-guarded, so a malformed document gives a short answer and not a hang', () => {
    const a = { id: 'a', op: 'transform.translate', supersedes: 'b', params: {} }
    const b = { id: 'b', op: 'transform.translate', supersedes: 'a', params: {} }
    expect(describeRow(a, buildNameIndex([a, b]))).toBe('Move')
  })
})

describe('colour rows in History (TODO/ui-037)', () => {
  const cube = { id: 'cuboid-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [40, 40, 40] } }

  it('says which colour, and on what', () => {
    const recolor = { id: 'cuboid-1-color-1', op: 'style.recolor', target: 'cuboid-1', supersedes: 'cuboid-1', colorOverride: 0xff0000 }
    expect(describeRow(recolor, buildNameIndex([cube, recolor]))).toBe('Color #ff0000 on Cube 1')
  })

  it('names the part when the override targets one', () => {
    const recolor = {
      id: 'cuboid-1-color-1',
      op: 'style.recolor',
      target: 'cuboid-1',
      supersedes: 'cuboid-1',
      colorOverride: 0x0000ff,
      subPart: 'usbc',
    }
    expect(describeRow(recolor, buildNameIndex([cube, recolor]))).toBe('Color usbc #0000ff on Cube 1')
  })

  it('calls a cleared override a reset rather than printing a colour it does not have', () => {
    const reset = { id: 'cuboid-1-color-2', op: 'style.recolor', target: 'cuboid-1', supersedes: 'cuboid-1', colorOverride: null }
    expect(describeRow(reset, buildNameIndex([cube, reset]))).toBe('Reset color on Cube 1')
  })
})
