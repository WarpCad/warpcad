// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from '../src/core/document.js'
import { createToolRegistry } from '../src/ai/tools/index.js'
import { createTurn } from '../src/ai/tools/limits.js'
import { runWorkedExample } from './agent-example.mjs'

/**
 * `TODO/docs-029`: the worked example in `docs/agent-prompting.md` is not typed, it is run. These
 * specs feed its call sequence to the real tool registry, over the `webmcp` origin, in plain Node
 * (the kernel folds synchronously here, so there is no worker to mock), and fail the build when a
 * step stops working. `scripts/agent-docs.spec.js` then checks the page shows exactly these results.
 */

const example = runWorkedExample()
/** @param {string} tool */
const stepOf = (tool) => example.steps.filter((step) => step.tool === tool)

describe('the box-and-lid example runs against the registry', () => {
  it('every step succeeds', () => {
    expect(example.steps.length).toBeGreaterThanOrEqual(7)
    for (const step of example.steps) expect(step.result.error, `${step.tool}: ${JSON.stringify(step.result)}`).toBeUndefined()
  })

  it('states the request in the words a person would use, with the wall as a variable', () => {
    expect(example.request).toMatch(/60 × 40 × 20 mm box/)
    expect(example.request).toMatch(/wall/)
  })

  it('builds a box and a lid in one apply_records call, with the prompt recorded', () => {
    const [batch] = stepOf('apply_records')
    expect(batch.input.steps).toHaveLength(6)
    expect(batch.input.prompt).toBe(example.request)
    expect(batch.result.applied).toHaveLength(6)
    expect(batch.result.scene.count).toBe(2)
    const sizes = batch.result.scene.bodies.map((/** @type {any} */ body) => body.sizeMm)
    expect(sizes).toContainEqual([60, 40, 20])
  })

  it('set_variable moves the bound lid thickness in one revision', () => {
    const [set] = stepOf('set_variable')
    expect(set.result.changedParams).toBe(1)
    expect(set.result.breakages).toEqual([])
    const lid = set.result.scene.bodies.find((/** @type {any} */ body) => body.sizeMm[1] < 40)
    expect(lid.sizeMm[2]).toBeCloseTo(3, 6)
  })

  it('measure and check_printability see the box the page describes', () => {
    const [measure] = stepOf('measure')
    const box = measure.result.bodies.find((/** @type {any} */ body) => body.sizeMm[0] === 60)
    expect(box.volumeMm3).toBeCloseTo(60 * 40 * 20 - 56 * 36 * 18, 0)
    const [print] = stepOf('check_printability')
    expect(print.result.bodies[0].watertight).toBe(true)
  })

  it('the final describe_scene is the last scene of the run', () => {
    const [scene] = stepOf('describe_scene')
    expect(scene.result.count).toBe(2)
  })

  it('a refused call names the cause, says ok: false, and writes nothing', () => {
    expect(example.refusal.result.ok).toBe(false)
    expect(example.refusal.result.error).toMatch(/operand/i)
    expect(example.refusalWroteNothing).toBe(true)
  })

  it('none of the agent rows is on the person’s own undo stack', () => {
    expect(example.canUndo).toBe(false)
  })

  it('is deterministic, so a regenerated page does not churn', () => {
    expect(JSON.stringify(runWorkedExample())).toBe(JSON.stringify(example))
  })
})

describe('the page’s one-line fillet example', () => {
  it('rounds the top rim of the box with operate { op: "modify.filletRim", operands, params }', () => {
    const document = createDocument({ replica: 'abcdef' })
    const registry = createToolRegistry()
    const run = (/** @type {string} */ tool, /** @type {any} */ input) => registry.run({ document, origin: 'webmcp', live: true, turn: createTurn() }, tool, input)
    const made = run('create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [60, 40, 20] } })
    const id = made.applied[0].bodyId
    const result = run('operate', { op: 'modify.filletRim', operands: [{ id }], params: { radius: 2, orientation: 'z+' } })
    expect(result.error, JSON.stringify(result)).toBeUndefined()
    expect(result.scene.bodies[0].sizeMm).toEqual([60, 40, 20])
  })
})
