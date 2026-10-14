// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `TODO/ai-017`: the turns whose landed record lines were **recorded before** the landing moved
 * from `forkChange` + `landFork` to `mergeFrom` (`landedTurns.json`). `agent.spec.js` replays each
 * one through today's agent and compares, so "a turn with no user edits lands exactly as it did"
 * is checked against what the old code really wrote, not against a second reading of the new
 * code.
 *
 * Every document is built under a fixed replica so its own ids are stable from run to run.
 *
 * @module ai/__fixtures__/landingScenarios
 */

import { createDocument } from '../../core/document.js'
import { recordsForDrop } from '../../core/library.js'
import { bindParam, defineVariable } from '../../core/variables.js'

/** The live document's replica in every scenario. */
export const LIVE_REPLICA = 'qqqqqq'
/** The fork's replica in every scenario (the agent's `replica` seam). */
export const FORK_REPLICA = 'abcdef'

const CUBE = { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [20, 20, 20] } }
const SPHERE = { op: 'primitive.sphere', positionMm: [10, 0, 0], params: { diameter: 20 } }
const call = (/** @type {string} */ name, /** @type {any} */ input = {}) => ({ name, input })

const PI_MODEL = {
  name: 'piModel',
  kind: /** @type {const} */ ('enum'),
  value: 4,
  options: [
    { value: 4, label: 'Pi 4' },
    { value: 5, label: 'Pi 5' },
  ],
}

/**
 * `piScenes.js`'s Pi and cube, under {@link LIVE_REPLICA} so the ids `defineVariable` mints are
 * stable (the shared fixture uses a random replica).
 */
function piScene() {
  const document = createDocument({ replica: LIVE_REPLICA })
  const local = { origin: 'local' }
  document.append({ id: 'pi-1', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model: 4 } }, local)
  document.append({ id: 'pi-1-move', op: 'transform.translate', target: 'pi-1', supersedes: 'pi-1', params: { vector: [10, 5, 0], rotation: [0, 0, 0] } }, local)
  document.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [6, 6, 6], center: [120, 20, 3] } }, local)
  return document
}

/**
 * @typedef {object} LandingScenario
 * @property {string} name
 * @property {() => import('../../core/document.js').WarpDocument} build
 * @property {string} userMessage
 * @property {Array<{ text?: string, calls?: Array<{ name: string, input: any }> }>} steps
 */

/** @type {LandingScenario[]} */
export const LANDING_SCENARIOS = [
  {
    name: 'cube minus sphere on an empty project',
    build: () => createDocument({ replica: LIVE_REPLICA }),
    userMessage: 'A cube with a ball cut out',
    steps: [
      { text: 'Looking first.', calls: [call('describe_scene')] },
      { calls: [call('create', { ...CUBE, rationale: 'Base block' })] },
      { calls: [call('create', SPHERE)] },
      { calls: [call('operate', { op: 'boolean.subtract', operands: [{ id: 'cuboid-abcdef-1' }, { id: 'sphere-abcdef-2' }] })] },
      { text: 'Done.' },
    ],
  },
  {
    name: 'a sphere at the rollback marker',
    build: () => {
      const document = createDocument({ replica: LIVE_REPLICA })
      document.appendAll(recordsForDrop('primitive.cone', { x: -50, y: 0 }, document), { origin: 'local' })
      document.appendAll(recordsForDrop('primitive.cuboid', { x: 50, y: 0 }, document), { origin: 'local' })
      document.rollBackTo(/** @type {string} */ (document.entries[0].record.id), { origin: 'local' })
      return document
    },
    userMessage: 'ball',
    steps: [{ calls: [call('create', SPHERE)] }, { text: 'ok' }],
  },
  {
    name: 'define, bind and set piModel (rows added and revised)',
    build: piScene,
    userMessage: 'make the Pi model a variable',
    steps: [
      { calls: [call('define_variable', { ...PI_MODEL, rationale: 'One switch for the board' })] },
      { calls: [call('bind_param', { id: 'pi-1', path: 'model', name: 'piModel' })] },
      { calls: [call('set_variable', { name: 'piModel', value: 5 })] },
      { text: 'piModel now drives the Pi.' },
    ],
  },
  {
    name: 'delete_variable with keepValues (a row removed)',
    build: () => {
      const document = piScene()
      defineVariable(document, { ...PI_MODEL, value: 5 }, { origin: 'local' })
      bindParam(document, 'pi-1', 'model', 'piModel', { origin: 'local' })
      return document
    },
    userMessage: 'drop the variable, keep the Pi 5',
    steps: [{ calls: [call('delete_variable', { name: 'piModel', keepValues: true })] }, { text: 'Removed it.' }],
  },
]

/**
 * A provider that replays `steps`, one per request (no network, no key).
 *
 * @param {LandingScenario['steps']} steps
 * @returns {any} A `Pick<AiClient, 'stream'>`; loosely typed, like the specs' own fakes.
 */
export function replay(steps) {
  let index = 0
  return {
    /** @param {any} _request */
    async *stream(_request) {
      const step = steps[index]
      index += 1
      if (!step) throw new Error(`script exhausted at request ${index}`)
      /** @type {any[]} */
      const content = []
      if (step.text) {
        content.push({ type: 'text', text: step.text })
        yield { type: 'text', text: step.text }
      }
      for (const [k, c] of (step.calls ?? []).entries()) {
        const id = `toolu_${index}_${k + 1}`
        content.push({ type: 'tool_use', id, name: c.name, input: c.input })
        yield { type: 'tool_call', id, name: c.name, input: c.input }
      }
      yield { type: 'usage', usage: { input: 1, cacheRead: 0, cacheWrite: 0, output: 1 } }
      yield { type: 'done', stopReason: (step.calls ?? []).length > 0 ? 'tool_use' : 'end_turn', content, model: 'scripted' }
    },
  }
}
