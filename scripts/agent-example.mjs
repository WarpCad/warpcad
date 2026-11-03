// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — a Node build script, not part of the app's typechecked `src/` (a spec imports it).
//
// The worked example in `docs/agent-prompting.md` (`TODO/docs-029`): a box with an open top and a
// lid with a round cutout, built the way a browser agent would, over the `webmcp` origin. The calls
// run against the real tool registry, and each result is shaped as WebMCP hands it to the agent,
// in plain Node (the kernel folds synchronously there, so there
// is no worker to mock), and what the page shows is what each call returned. A step that stops
// working fails `scripts/agent-example.spec.js`; a page that no longer matches fails
// `scripts/agent-docs.spec.js`.

import { createDocument } from '../src/core/document.js'
import { createToolRegistry } from '../src/ai/tools/index.js'
import { createTurn } from '../src/ai/tools/limits.js'
import { toToolResult } from '../src/ai/webmcp/toolShape.js'

/** The request, as a person would write it. */
export const REQUEST =
  'A 60 × 40 × 20 mm box with a 2 mm wall, an open top, and a lid that sits in the opening with a ' +
  '10 mm circular cutout. Make the wall thickness a variable named wall; the lid is as thick as the wall.'

/**
 * @typedef {object} ExampleStep
 * @property {string} title What this step is for, in a sentence.
 * @property {string} tool
 * @property {Record<string, any>} input
 * @property {Record<string, any>} result What the registry returned.
 */

/**
 * Run the example.
 *
 * @returns {{ request: string, steps: ExampleStep[], refusal: ExampleStep, refusalWroteNothing: boolean, canUndo: boolean }}
 */
export function runWorkedExample() {
  // A fixed replica id makes every id in the results the same on every run.
  const document = createDocument({ replica: 'abcdef' })
  const registry = createToolRegistry()
  // `live` because a WebMCP call runs in the open tab.
  const context = { document, origin: 'webmcp', live: true }
  /** @type {ExampleStep[]} */
  const steps = []
  /**
   * @param {string} title
   * @param {string} tool
   * @param {Record<string, any>} input
   */
  const call = (title, tool, input) => {
    // The tab endpoint builds a fresh per-call turn, and WebMCP shapes the result (`ok`, paging).
    const result = toToolResult(tool, registry.run({ ...context, turn: createTurn() }, tool, input))
    steps.push({ title, tool, input, result })
    return result
  }

  call('Define the variable first. It is a number in millimetres.', 'define_variable', {
    name: 'wall',
    kind: 'number',
    value: 2,
    unit: 'mm',
  })

  const built = call(
    'Build the box and the lid in one call. A later step names an earlier step’s body as @1, @2, and so on.',
    'apply_records',
    {
      prompt: REQUEST,
      rationale: 'Box with an open top, and a lid with a 10 mm cutout',
      steps: [
        { create: { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [60, 40, 20] } } },
        { create: { op: 'primitive.cuboid', positionMm: [0, 0, 2], params: { size: [56, 36, 20] } } },
        { operate: { op: 'boolean.subtract', operands: [{ id: '@1' }, { id: '@2' }] } },
        { create: { op: 'primitive.cuboid', positionMm: [0, 50, 0], params: { size: [55.6, 35.6, 2] } } },
        { create: { op: 'primitive.cylinder', positionMm: [0, 50, -2], params: { diameter: 10, height: 6 } } },
        { operate: { op: 'boolean.subtract', operands: [{ id: '@4' }, { id: '@5' }] } },
      ],
    },
  )
  const [, , box, lidPlate, , lid] = built.applied.map((/** @type {any} */ step) => step.bodyId)

  call('Bind the lid plate’s thickness to the variable. The plate was used up by the cut, and is still bindable.', 'bind_param', {
    id: lidPlate,
    path: 'size.2',
    name: 'wall',
  })
  call('Change the variable. Everything bound to it follows, in one revision.', 'set_variable', { name: 'wall', value: 3 })
  call('Look at the scene.', 'describe_scene', {})
  call('Measure both bodies.', 'measure', { ids: [box, lid] })
  call('Check the box for printing.', 'check_printability', { ids: [box] })

  // A refused call: one operand where a subtract needs two. It names the cause and writes nothing.
  const before = JSON.stringify(registry.run({ ...context, turn: createTurn() }, 'describe_scene', {}))
  const refused = {
    title: 'A call that cannot work is refused by name, and writes nothing. Here a subtract is given one operand.',
    tool: 'operate',
    input: { op: 'boolean.subtract', operands: [{ id: box }] },
  }
  const refusal = { ...refused, result: toToolResult('operate', registry.run({ ...context, turn: createTurn() }, 'operate', refused.input)) }
  const unchanged = before === JSON.stringify(registry.run({ ...context, turn: createTurn() }, 'describe_scene', {}))

  return { request: REQUEST, steps, refusal, refusalWroteNothing: unchanged, canUndo: document.canUndo() }
}
