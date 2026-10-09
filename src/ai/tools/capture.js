// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `capture_view` (`TODO/ai-007`): the model looks at its own work.
 *
 * This is the framework-free half. It resolves which bodies to draw — from `ctx.document`,
 * which in the browser is the **turn's fork**, so the picture shows what the model just built
 * and not the live document it has not landed on yet — picks the framing box and the pixel
 * size, and hands a {@link CaptureRequest} to `ctx.capture`, the boundary the browser transport
 * passes in. The three.js half is `src/render/offscreenCapture.js`: it renders the real
 * viewport scene into an offscreen target with its own camera, so the user's camera, selection
 * and screen are untouched.
 *
 * - **Browser only.** The MCP server runs in Node with no GPU, so the tool is not in its list
 *   (`transports: ['ai']`). In the browser, the agent also leaves it out of a turn's list when
 *   no capture was handed over (WebGL failed to start), so the model is never offered a tool
 *   that fails every time.
 * - **Synchronous**, like every tool: WebGL `readPixels` and canvas PNG encoding are both
 *   synchronous calls.
 * - **Small JSON plus one image.** The result carries `image: { mediaType, data }`; the agent
 *   (`src/ai/agent.js`) moves it out of the JSON into an image block in the `tool_result`, and
 *   the chat shows it as the row's thumbnail. The image is rendered at its final size
 *   (`captureSize`, at most `MAX_IMAGE_EDGE`), so it is already downscaled (`ai-004`).
 *
 * @module ai/tools/capture
 */

import { boundsOf } from '../../core/kernel/group.js'
import { captureSize } from '../image.js'
import { bodySummary, findBody, round3 } from './read.js'
import { objectSchema } from './schema.js'

/** @typedef {import('./index.js').Tool} Tool */
/** @typedef {[number, number, number]} Vec3 */

/** The named views, in the order the viewport's orientation gizmo offers them. */
export const CAPTURE_VIEW_NAMES = Object.freeze(['iso', 'top', 'front', 'right', 'back', 'bottom', 'left'])

/** Below this share of non-background pixels, the result warns that the picture is close to empty. */
const NEARLY_EMPTY = 0.002

/**
 * @typedef {object} CaptureBody
 * @property {string} id
 * @property {import('../../core/document.js').Body['geometry']} geometry Kernel geometry, as
 *   the document reports it; the renderer builds its own meshes from it.
 * @property {string | null} color `#rrggbb` whole-body colour, or `null` for the default.
 */

/**
 * @typedef {object} CaptureRequest
 * @property {string} view One of {@link CAPTURE_VIEW_NAMES}.
 * @property {CaptureBody[]} bodies What to draw.
 * @property {string[]} highlightIds Drawn in the selection colour.
 * @property {{ axis: 'x' | 'y' | 'z', offsetMm: number } | null} section Cut away everything
 *   on the + side of the plane `axis = offsetMm`.
 * @property {[Vec3, Vec3] | null} boundsMm The box to frame; `null` for an empty scene.
 * @property {number} widthPx
 * @property {number} heightPx
 */

/**
 * @typedef {object} CaptureResult
 * @property {'image/png'} mediaType
 * @property {string} data Base64, no `data:` prefix.
 * @property {number} widthPx
 * @property {number} heightPx
 * @property {number} contentFraction Share of pixels that differ from the background.
 */

/**
 * The capture boundary the browser transport hands a tool context (`ToolContext.capture`).
 *
 * @typedef {object} ToolCapture
 * @property {(request: CaptureRequest) => CaptureResult} capture Throws when the context is
 *   lost; the tool turns that into an error result.
 */

/**
 * @param {readonly [Vec3, Vec3][]} boxes
 * @returns {[Vec3, Vec3] | null}
 */
function unionBox(boxes) {
  if (boxes.length === 0) return null
  /** @type {Vec3} */
  const min = [Infinity, Infinity, Infinity]
  /** @type {Vec3} */
  const max = [-Infinity, -Infinity, -Infinity]
  for (const [lo, hi] of boxes) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], lo[axis])
      max[axis] = Math.max(max[axis], hi[axis])
    }
  }
  return [min, max]
}

const ID_LIST = { type: /** @type {'array'} */ ('array'), items: { type: /** @type {'string'} */ ('string') } }

/** @returns {Tool} */
export function createCaptureTool() {
  return {
    name: 'capture_view',
    description:
      'Render the scene as you have built it so far, from a named view, and look at the PNG. Does not move the user’s camera. ' +
      'ids limits it to some bodies (framed to fit); highlight draws bodies in the selection colour; section cuts the scene at a plane ' +
      '(everything on the + side of axis = offsetMm is removed) to see inside a hollow part. width is in pixels (default 768).',
    inputSchema: objectSchema(
      {
        view: { type: 'string', enum: CAPTURE_VIEW_NAMES, description: 'Which way to look: iso is the 3/4 Home view.' },
        ids: { ...ID_LIST, description: 'Only these bodies; default every body on screen.' },
        highlight: { ...ID_LIST, description: 'Bodies to draw in the selection colour.' },
        section: objectSchema(
          {
            axis: { type: 'string', enum: ['x', 'y', 'z'], description: 'The axis the cut plane is perpendicular to.' },
            offsetMm: { type: 'number', description: 'Where the plane crosses that axis, in millimetres.' },
          },
          ['axis', 'offsetMm'],
          'A section cut.'
        ),
        width: { type: 'integer', description: 'Image width in pixels, 128 to 1568; height is 3/4 of it.' },
      },
      ['view']
    ),
    transports: ['ai'],
    run: (ctx, input) => {
      if (!ctx.capture) return { error: 'capture_view needs the browser viewport, and it is not available here. Use measure and describe_body instead.' }
      for (const id of [...(input.ids ?? []), ...(input.highlight ?? [])]) {
        const found = findBody(ctx.document, id)
        if (found.reason !== undefined) return { error: found.reason }
      }
      const wanted = input.ids && input.ids.length > 0 ? new Set(input.ids) : null
      const bodies = ctx.document.bodies().filter((body) => wanted === null || wanted.has(body.id))
      const { widthPx, heightPx } = captureSize(input.width)
      const section = input.section ? { axis: input.section.axis, offsetMm: input.section.offsetMm } : null
      /** @type {CaptureRequest} */
      const request = {
        view: input.view,
        bodies: bodies.map((body) => ({ id: body.id, geometry: body.geometry, color: bodySummary(body).color })),
        highlightIds: [...new Set(input.highlight ?? [])],
        section,
        boundsMm: unionBox(bodies.map((body) => /** @type {[Vec3, Vec3]} */ (boundsOf(body.geometry)))),
        widthPx,
        heightPx,
      }
      /** @type {CaptureResult} */
      let image
      try {
        image = ctx.capture.capture(request)
      } catch {
        return { error: 'The viewport could not render the capture (its WebGL context may have been lost).' }
      }
      const framed = request.boundsMm
      return {
        view: input.view,
        widthPx: image.widthPx,
        heightPx: image.heightPx,
        bodies: bodies.map((body) => body.id),
        ...(request.highlightIds.length > 0 ? { highlighted: request.highlightIds } : {}),
        ...(section ? { section } : {}),
        ...(framed ? { framedMm: [round3(framed[0]), round3(framed[1])] } : {}),
        contentFraction: Math.round(image.contentFraction * 1000) / 1000,
        ...(bodies.length === 0 ? { note: 'There are no bodies to draw; the picture shows the empty grid.' } : {}),
        ...(image.contentFraction < NEARLY_EMPTY
          ? { warning: 'The image is almost blank: nothing differs from the background. Do not read anything from it; check the ids and the view.' }
          : {}),
        image: { mediaType: image.mediaType, data: image.data },
      }
    },
  }
}
