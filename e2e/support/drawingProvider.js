// SPDX-License-Identifier: AGPL-3.0-or-later
import { join } from 'node:path'

/**
 * The scripted model for `TODO/ai-008`'s drawing-to-group turn, shared by `e2e/ai-drawing.e2e.js`
 * and `e2e/docs/ai-drawing.docs.js`. It plays what a model would do with
 * `e2e/fixtures/drawing-board-85x56.png` — a mechanical drawing of a FICTIONAL 85 × 56 board at
 * 10 px/mm, centred on the image — over the Messages API's streaming wire format. Never a live
 * model, never a real key.
 *
 * The API is routed on the **context**, not the page (`e2e/csp.e2e.js`: the production build's
 * service worker can issue the request itself, and a page route never sees it).
 */

export const FIXTURE = join(process.cwd(), 'e2e', 'fixtures', 'drawing-board-85x56.png')
export const PART_NAME = 'WC-85 board'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
}

/** @param {object} data */
const frame = (data) => `event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`

/**
 * One streamed reply in the Messages API's wire format.
 *
 * @param {{ text?: string, calls?: Array<{ name: string, input: object }> }} step
 * @param {number} turn
 */
function sse(step, turn) {
  let body = frame({ type: 'message_start', message: { model: 'claude-opus-5-5', usage: { input_tokens: 1500, output_tokens: 1 } } })
  let index = 0
  if (step.text) {
    body += frame({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } })
    body += frame({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: step.text } })
    body += frame({ type: 'content_block_stop', index })
    index += 1
  }
  for (const [k, call] of (step.calls ?? []).entries()) {
    body += frame({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: `toolu_draw_${turn}_${k}`, name: call.name, input: {} } })
    body += frame({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(call.input) } })
    body += frame({ type: 'content_block_stop', index })
    index += 1
  }
  body += frame({ type: 'message_delta', delta: { stop_reason: (step.calls ?? []).length > 0 ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 200 } })
  body += frame({ type: 'message_stop' })
  return body
}

/** The board as a model reading the drawing would build it: millimetres from locate_in_image. */
const SKETCH = {
  create: {
    op: 'primitive.sketch',
    positionMm: [0, 0, 0],
    params: {
      slices: [
        {
          id: 's1',
          zMm: 0,
          referenceImage: 'attachment-1',
          profiles: [
            { id: 'outline', kind: 'rect', role: 'solid', centerMm: [0, 0], widthMm: 85, heightMm: 56 },
            { id: 'h1', kind: 'circle', role: 'hole', centerMm: [-39, 24.5], radiusMm: 1.35 },
            { id: 'h2', kind: 'circle', role: 'hole', centerMm: [19, 24.5], radiusMm: 1.35 },
            { id: 'h3', kind: 'circle', role: 'hole', centerMm: [-39, -24.5], radiusMm: 1.35 },
            { id: 'h4', kind: 'circle', role: 'hole', centerMm: [19, -24.5], radiusMm: 1.35 },
          ],
        },
      ],
      extrusion: { method: 'linear', heightMm: 1.6 },
    },
  },
}
/** @param {[number, number]} xy @param {[number, number, number]} size */
const block = (xy, size) => ({ create: { op: 'primitive.cuboid', positionMm: [xy[0], xy[1], 1.6], params: { size } } })
export const SUB_PARTS = ['Board', 'USB-A 1', 'USB-A 2', 'Ethernet']

/**
 * The scripted model. A function of the request so the save can name the group the app issued.
 *
 * @param {number} index 0-based request number.
 * @param {string} body The request's JSON.
 */
function script(index, body) {
  switch (index) {
    case 0:
      return {
        text:
          'Dimensions read from the drawing (mm): board 85 × 56 (plan), thickness 1.6 (side view), holes 4× Ø2.7 at 3.5 from the edges, spacing 58 × 49, USB-A width 13, Ethernet width 16. ' +
          'The connector heights are not printed.',
        calls: [
          {
            name: 'set_reference_scale',
            input: {
              sliceId: 'attachment-1',
              fromPx: [175, 110],
              toPx: [1025, 110],
              distanceMm: 85,
              label: 'board length',
              checks: [{ label: 'board width', fromPx: [1085, 170], toPx: [1085, 730], distanceMm: 56 }],
            },
          },
        ],
      }
    case 1:
      return { calls: [{ name: 'locate_in_image', input: { sliceId: 'attachment-1', query: 'board outline', boxesPx: [[175, 170, 1025, 730]] } }] }
    case 2:
      return {
        calls: [
          {
            name: 'apply_records',
            input: {
              steps: [
                SKETCH,
                block([36, 19.5], [17, 13, 16]),
                block([36, 1.5], [17, 13, 16]),
                block([34, -18], [21, 16, 13.5]),
                { operate: { op: 'group.assemble', operands: [{ id: '@1' }, { id: '@2' }, { id: '@3' }, { id: '@4' }], params: { names: SUB_PARTS } } },
              ],
              rationale: 'Board with its holes from the drawing, connectors as named parts (heights assumed: 16 and 13.5 mm)',
            },
          },
        ],
      }
    case 3:
      return { calls: [{ name: 'capture_view', input: { view: 'top', overlay: 'reference' } }] }
    case 4: {
      const groups = body.match(/group-\d+/g) ?? []
      return { calls: [{ name: 'save_to_library', input: { id: groups.at(-1) ?? 'group-1', name: PART_NAME } }] }
    }
    case 5:
      return {
        text: 'Built the WC-85 board as a group: Board, USB-A 1, USB-A 2, Ethernet. Assumed (not printed): USB-A height 16 mm, Ethernet height 13.5 mm. The overlay matches to within about 0.5 mm. Tap Confirm to save it to My parts.',
      }
    default:
      return undefined
  }
}

/** @param {import('@playwright/test').Page} page */
export async function scriptedDrawingProvider(page) {
  const state = { requests: /** @type {string[]} */ ([]), headers: /** @type {Record<string, string>[]} */ ([]) }
  await page.context().route('https://api.anthropic.com/**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.url().endsWith('/count_tokens')) {
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: '{"input_tokens":8}' })
    }
    const body = request.postData() ?? ''
    state.requests.push(body)
    state.headers.push(request.headers())
    const step = script(state.requests.length - 1, body)
    if (step === undefined) return route.fulfill({ status: 500, headers: CORS, body: '{}' })
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sse(step, state.requests.length) })
  })
  return state
}

