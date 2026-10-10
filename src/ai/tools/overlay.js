// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `capture_view`'s overlay mode (`TODO/ai-008`): `{ view: 'top', overlay: 'reference' }` draws the
 * model semi-transparent over a reference image at its established scale, so the model can see
 * where what it built disagrees with the drawing — and report the residual ("the SD slot is
 * 1.5 mm off") instead of claiming a match.
 *
 * This is the framework-free half: which reference, where it lies in world millimetres, and the
 * decoded copy the renderer draws. `src/render/offscreenCapture.js` draws it (an orthographic top
 * view, the image under the model, the model at partial opacity).
 *
 * - **Top view only.** A drawing's plan view is compared from straight above; from an angle the
 *   overlay would only mislead.
 * - **Scaled only.** An image without a scale has no size to lay the model over; refused with the
 *   fix (`set_reference_scale`), never drawn at a guess.
 * - **Which reference.** `sliceId` when given; otherwise the most recent sketch slice with a
 *   scaled photo, else the most recent scaled attachment (placed centred on the origin, where a
 *   sketch's `referenceImage` would put it).
 *
 * @module ai/tools/overlay
 */

import { allReferences, referenceWorldBounds, resolveReference } from './image.js'

/** @typedef {import('./index.js').ToolContext} ToolContext */
/** @typedef {import('./image.js').Reference} Reference */

/** The overlay modes `capture_view` takes. */
export const OVERLAY_MODES = Object.freeze(['reference'])

/**
 * What the renderer needs to draw a reference image under the model.
 *
 * @typedef {object} CaptureOverlay
 * @property {string} sliceId
 * @property {string} assetId
 * @property {unknown} bitmap The decoded image (an `ImageBitmap` in the browser).
 * @property {readonly number[]} frame Sketch plane → world, column-major.
 * @property {number} zMm The slice's offset along the sketch's Z.
 * @property {Pick<import('../../sketch/calibration.js').ImagePlacement, 'offsetMm' | 'rotationDeg' | 'mmPerPx'>} placement
 * @property {{ widthPx: number, heightPx: number }} size The stored image's pixels.
 * @property {[[number, number, number], [number, number, number]]} boundsMm The image's world box.
 */

/**
 * @param {ToolContext} ctx
 * @param {{ view: string, overlay?: string, sliceId?: string }} input
 * @returns {{ overlay: CaptureOverlay | null, error?: undefined } | { error: string, overlay?: undefined }}
 */
export function resolveOverlay(ctx, input) {
  if (input.overlay === undefined) {
    return input.sliceId === undefined ? { overlay: null } : { error: 'sliceId only applies with overlay: "reference".' }
  }
  if (input.view !== 'top') return { error: 'overlay: "reference" is drawn from the top view only — call capture_view with view: "top".' }

  /** @type {Reference | undefined} */
  let reference
  if (input.sliceId !== undefined) {
    const resolved = resolveReference(ctx, input.sliceId)
    if (resolved.error !== undefined) return { error: resolved.error }
    reference = resolved.reference
  } else {
    const scaled = allReferences(ctx).filter((candidate) => candidate.placement !== null)
    reference = scaled.filter((candidate) => candidate.kind === 'slice').at(-1) ?? scaled.at(-1)
    if (!reference) {
      return { error: 'No reference image has a scale yet, so there is nothing to lay the model over. Call set_reference_scale on the attached image first.' }
    }
  }
  const placement = reference.placement
  if (!placement) {
    return { error: `${reference.sliceId} has no scale yet, so the model cannot be laid over it. Call set_reference_scale first.` }
  }
  if (reference.bitmap === null || reference.bitmap === undefined) {
    return { error: `The reference image ${reference.sliceId} could not be drawn: this browser has no decoded copy of it. Ask the user to attach it in this chat again.` }
  }
  return {
    overlay: {
      sliceId: reference.sliceId,
      assetId: reference.record.id,
      bitmap: reference.bitmap,
      frame: reference.frame,
      zMm: reference.zMm,
      placement: { offsetMm: placement.offsetMm, rotationDeg: placement.rotationDeg, mmPerPx: placement.mmPerPx },
      size: reference.size,
      boundsMm: referenceWorldBounds(reference),
    },
  }
}
