// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The image tools (`TODO/ai-008`): the model's hands for measuring a drawing or a photo —
 * `get_reference_image`, `set_reference_scale` and `locate_in_image`.
 *
 * ## What a reference is
 *
 * A **reference** is an image the model can measure. It is named by a `sliceId`:
 *
 * - `attachment-N` — an image the user attached in this chat. It has already been through
 *   `sketch-003`'s sanitiser (`src/ai/reference.js`): what is held here is the re-encoded
 *   `asset.image` record, the copy the model was sent, and (in the browser) a decoded bitmap for
 *   the overlay. It is not in the project until a sketch is created with it
 *   (`create`, a slice's `referenceImage`), and then only as the sanitised record.
 * - `<sketch id>:<slice number>` — a slice in the project that carries a reference photo
 *   (`slices[n].image`, `src/sketch/calibration.js`), e.g. `sketch-1:1`.
 *
 * ## Coordinates
 *
 * Pixels are the pixels of the image **as the model was sent it** (`sent.widthPx` ×
 * `sent.heightPx`, at most 1,568 px on the long edge), because those are the only pixels the model
 * has seen; they are converted to the stored image's pixels here, and from those to millimetres by
 * `src/sketch/calibration.js` — the one place image space meets sketch space. Millimetres are on
 * the sketch plane: an attachment is placed with its centre on the sketch origin, which is exactly
 * where `create` puts it on a slice, so a box located now can be drawn at the same numbers.
 *
 * ## Scale first, in code
 *
 * Nothing turns pixels into millimetres until a scale has been set from a known length
 * (`set_reference_scale`). `locate_in_image`, the overlay and a sketch's `referenceImage` all
 * refuse an unscaled image by name, so a model cannot build on a guessed scale even if it tried.
 * A project photo at its provisional 1 px = 0.1 mm (never calibrated with Set scale) counts as
 * unscaled. Changing a project photo's scale is the sketch editor's **Set scale**, a user action;
 * the tool scales attachments only.
 *
 * Browser only (`transports: ['ai']`): the MCP server has no chat to attach to.
 *
 * @module ai/tools/image
 */

import { frameApply, frameAtOrigin, sketchFrameOf } from '../../core/kernel/sketchFrame.js'
import { DEFAULT_OPACITY, calibrationProblem, imagePxToSketchMm, mmPerPxFrom, placementOf } from '../../sketch/calibration.js'
import { round } from './read.js'
import { objectSchema } from './schema.js'

/** @typedef {import('./index.js').Tool} Tool */
/** @typedef {import('./index.js').ToolContext} ToolContext */
/** @typedef {import('../../sketch/imageAsset.js').ImageAssetRecord} ImageAssetRecord */
/** @typedef {import('../../sketch/calibration.js').ImagePlacement} ImagePlacement */
/** @typedef {import('../../sketch/calibration.js').Calibration} Calibration */
/** @typedef {[number, number]} Vec2 */

/** The sketch op a reference photo lives on. */
const SKETCH_OP = 'primitive.sketch'

/** At most this many boxes per `locate_in_image` call, and cross-checks per `set_reference_scale`. */
export const MAX_BOXES = 32
export const MAX_CHECKS = 16

/**
 * A cross-check agrees with the scale when it is within this many millimetres, or this share of
 * its printed value, whichever is larger — a drawing's own line weight and a model's click.
 */
const CHECK_TOLERANCE_MM = 0.5
const CHECK_TOLERANCE_SHARE = 0.02

/**
 * The image as the model was sent it.
 *
 * @typedef {object} SentImage
 * @property {string} mediaType
 * @property {string} data Base64.
 * @property {number} widthPx
 * @property {number} heightPx
 */

/**
 * An image attached in this chat, already sanitised.
 *
 * @typedef {object} ToolAttachment
 * @property {string} id `attachment-N`.
 * @property {string} name The file's name, for the listing.
 * @property {ImageAssetRecord} record The re-encoded record (`sketch-003`'s `importImage`).
 * @property {SentImage} sent
 * @property {unknown} [bitmap] The decoded image, for the overlay (browser only; opaque here).
 */

/**
 * A scale set on an attachment.
 *
 * @typedef {object} ReferenceScale
 * @property {number} mmPerPx
 * @property {Calibration} calibration In stored-image pixels, as `sketch-003` keeps it.
 * @property {string} [label] What was measured ("board length").
 */

/**
 * Everything the image tools may read, handed in by the browser transport — session-scoped, so a
 * scale set in one turn holds in the next (the model may ask a question in between).
 *
 * @typedef {object} ToolReferences
 * @property {ToolAttachment[]} attachments In attach order.
 * @property {Map<string, ReferenceScale>} scales By attachment id.
 * @property {Map<string, { sent: SentImage | null, bitmap?: unknown }>} assets By asset id: the
 *   prepared copies of every image this browser has (attachments, and project photos the agent
 *   decoded before the turn).
 */

/**
 * @returns {ToolReferences}
 */
export function createReferences() {
  return { attachments: [], scales: new Map(), assets: new Map() }
}

/**
 * Register a sanitised attachment; returns its id.
 *
 * @param {ToolReferences} references
 * @param {{ name: string, record: ImageAssetRecord, sent: SentImage, bitmap?: unknown }} attachment
 * @returns {string}
 */
export function addAttachment(references, attachment) {
  const id = `attachment-${references.attachments.length + 1}`
  references.attachments.push({ id, ...attachment })
  references.assets.set(attachment.record.id, { sent: attachment.sent, ...(attachment.bitmap === undefined ? {} : { bitmap: attachment.bitmap }) })
  return id
}

// --- pure conversions ------------------------------------------------------------------

/**
 * A point in the image as sent, in the stored image's pixels.
 *
 * @param {readonly number[]} px
 * @param {{ widthPx: number, heightPx: number }} sent
 * @param {{ widthPx: number, heightPx: number }} size
 * @returns {Vec2}
 */
export function sentPxToImagePx(px, sent, size) {
  return [(px[0] * size.widthPx) / sent.widthPx, (px[1] * size.heightPx) / sent.heightPx]
}

/**
 * A stored-image pixel on the sketch plane, in millimetres.
 *
 * @param {Pick<ImagePlacement, 'offsetMm' | 'rotationDeg' | 'mmPerPx'>} placement
 * @param {{ widthPx: number, heightPx: number }} size
 * @param {readonly number[]} px
 * @returns {Vec2}
 */
export function imagePxToMm(placement, size, px) {
  const out = imagePxToSketchMm(placement, size, px)
  return [out[0], out[1]]
}

// --- resolving a sliceId ---------------------------------------------------------------

/**
 * @typedef {object} Reference
 * @property {string} sliceId
 * @property {'attachment' | 'slice'} kind
 * @property {string} name
 * @property {ImageAssetRecord} record
 * @property {{ widthPx: number, heightPx: number }} size The stored image's pixels.
 * @property {SentImage | null} sent `null` for a project photo this browser has not prepared.
 * @property {{ widthPx: number, heightPx: number }} view The pixel frame the tools speak: `sent`, or the stored size.
 * @property {ImagePlacement | null} placement Where it lies on the sketch plane **when scaled**; `null` until then.
 * @property {string} [label] What its scale was measured from.
 * @property {readonly number[]} frame Sketch plane → world, column-major.
 * @property {number} zMm The slice's offset along the sketch's Z.
 * @property {unknown} bitmap The decoded copy, or `null`.
 */

/**
 * The latest record of a sketch body that is in play.
 *
 * @param {ToolContext['document']} document
 * @param {string} id
 * @returns {import('../../core/kernel/registry.js').OpRecord | undefined}
 */
function sketchRecordOf(document, id) {
  const record = document.recordOf(id)
  return record?.op === SKETCH_OP ? record : undefined
}

/**
 * @param {ToolContext['document']} document
 * @param {string} sketchId
 * @param {readonly number[] | undefined} center
 * @returns {readonly number[]}
 */
function frameOf(document, sketchId, center) {
  try {
    return sketchFrameOf(document.lineageOf(sketchId))
  } catch {
    return frameAtOrigin(Array.isArray(center) ? center : [0, 0, 0])
  }
}

/**
 * @param {ToolContext} ctx
 * @param {ToolAttachment} attachment
 * @returns {Reference}
 */
function attachmentReference(ctx, attachment) {
  const size = { widthPx: attachment.record.params.widthPx, heightPx: attachment.record.params.heightPx }
  const scale = ctx.references?.scales.get(attachment.id)
  return {
    sliceId: attachment.id,
    kind: 'attachment',
    name: attachment.name,
    record: attachment.record,
    size,
    sent: attachment.sent,
    view: { widthPx: attachment.sent.widthPx, heightPx: attachment.sent.heightPx },
    placement: scale
      ? { assetId: attachment.record.id, offsetMm: [0, 0], rotationDeg: 0, opacity: DEFAULT_OPACITY, mmPerPx: scale.mmPerPx, calibration: scale.calibration }
      : null,
    ...(scale?.label ? { label: scale.label } : {}),
    frame: frameAtOrigin([0, 0, 0]),
    zMm: 0,
    bitmap: attachment.bitmap ?? null,
  }
}

/**
 * Every slice in the project that carries a usable reference photo, in log order.
 *
 * @param {ToolContext} ctx
 * @returns {Reference[]}
 */
function sliceReferences(ctx) {
  const { document } = ctx
  const assets = document.assets()
  /** @type {Map<string, Reference>} */
  const found = new Map()
  for (const record of document.records) {
    if (record.op !== SKETCH_OP || record.id === undefined) continue
    const slices = /** @type {any} */ (record.params)?.slices
    if (!Array.isArray(slices)) continue
    slices.forEach((/** @type {any} */ slice, /** @type {number} */ index) => {
      const placement = placementOf(slice?.image)
      if (!placement) return
      const asset = /** @type {ImageAssetRecord | undefined} */ (assets.get(placement.assetId))
      if (!asset) return
      const sliceId = `${record.id}:${index + 1}`
      const size = { widthPx: asset.params.widthPx, heightPx: asset.params.heightPx }
      const prepared = ctx.references?.assets.get(asset.id)
      const sent = prepared?.sent ?? null
      found.set(sliceId, {
        sliceId,
        kind: 'slice',
        name: `${record.name ?? record.id}, slice ${index + 1}`,
        record: asset,
        size,
        sent,
        view: sent ? { widthPx: sent.widthPx, heightPx: sent.heightPx } : size,
        // A photo nobody calibrated is at the provisional 0.1 mm/px: that is not a measurement.
        placement: placement.calibration ? placement : null,
        frame: frameOf(document, /** @type {string} */ (record.id), /** @type {any} */ (record.params)?.center),
        zMm: typeof slice.zMm === 'number' ? slice.zMm : 0,
        bitmap: prepared?.bitmap ?? null,
      })
    })
  }
  return [...found.values()]
}

/**
 * Every reference there is: attachments first, then project slices.
 *
 * @param {ToolContext} ctx
 * @returns {Reference[]}
 */
export function allReferences(ctx) {
  return [...(ctx.references?.attachments ?? []).map((attachment) => attachmentReference(ctx, attachment)), ...sliceReferences(ctx)]
}

/**
 * @param {ToolContext} ctx
 * @param {string} sliceId
 * @returns {{ reference: Reference, error?: undefined } | { error: string, reference?: undefined }}
 */
export function resolveReference(ctx, sliceId) {
  const all = allReferences(ctx)
  const reference = all.find((candidate) => candidate.sliceId === sliceId)
  if (reference) return { reference }
  const known = all.map((candidate) => candidate.sliceId)
  if (/^attachment-\d+$/.test(sliceId) || /:\d+$/.test(sliceId)) {
    const [sketchId] = sliceId.split(':')
    if (!/^attachment-/.test(sliceId) && !sketchRecordOf(ctx.document, sketchId)) {
      return { error: `There is no sketch "${sketchId}". ${known.length > 0 ? `The images there are: ${known.join(', ')}.` : 'No image has been attached or placed on a sketch.'}` }
    }
  }
  return {
    error:
      `There is no image "${sliceId}". ` +
      (known.length > 0 ? `The images there are: ${known.join(', ')}.` : 'No image has been attached in this chat or placed on a sketch; ask the user to attach one.'),
  }
}

/**
 * The scale a reference carries, for a result.
 *
 * @param {Reference} reference
 * @returns {{ mmPerPx: number, label?: string } | null}
 */
function scaleOf(reference) {
  if (!reference.placement) return null
  // In the pixels the model speaks, not the stored ones.
  const mmPerViewPx = (reference.placement.mmPerPx * reference.size.widthPx) / reference.view.widthPx
  return { mmPerPx: round(mmPerViewPx), ...(reference.label ? { label: reference.label } : {}) }
}

/**
 * Why a point is unusable in this reference, or `''`.
 *
 * @param {readonly number[]} px
 * @param {{ widthPx: number, heightPx: number }} view
 * @param {string} what
 */
function outsideProblem(px, view, what) {
  if (!px.every(Number.isFinite)) return `${what} must be finite pixel coordinates`
  if (px[0] < 0 || px[1] < 0 || px[0] > view.widthPx || px[1] > view.heightPx) {
    return `${what} [${px.join(', ')}] is outside the image, which is ${view.widthPx} × ${view.heightPx} px as you were sent it`
  }
  return ''
}

/**
 * The sentence for an image with no scale yet.
 *
 * @param {Reference} reference
 */
function unscaledError(reference) {
  return reference.kind === 'attachment'
    ? `The scale of ${reference.sliceId} is not known yet, so its pixels cannot be turned into millimetres. Read a printed dimension (or a ruler in a photo) and call set_reference_scale first — never guess a scale.`
    : `The photo on ${reference.sliceId} has never been scaled (Set scale in the sketch editor), so its pixels cannot be turned into millimetres. Ask the user to set its scale, or to attach the image in this chat so you can scale it.`
}

// --- the tools ---------------------------------------------------------------------------

const SLICE_ID = {
  type: /** @type {'string'} */ ('string'),
  description: 'Which image: "attachment-1" for an image attached in this chat, or "<sketch id>:<slice number>" (e.g. "sketch-1:1") for a sketch slice’s reference photo.',
}

/** @param {string} description */
const point = (description) => ({ type: /** @type {'array'} */ ('array'), items: { type: /** @type {'number'} */ ('number') }, minItems: 2, maxItems: 2, description })

/** @returns {Tool} */
function createGetReferenceImageTool() {
  return {
    name: 'get_reference_image',
    description:
      'Look at a reference image (an attached drawing or photo, or a sketch slice’s reference photo). Without sliceId, list the images there are, ' +
      'each with its pixel size and scale. With sliceId, also return the picture. Pixel coordinates in every image tool are in the image as you are sent it.',
    inputSchema: objectSchema({ sliceId: SLICE_ID }),
    transports: ['ai'],
    run: (ctx, input) => {
      if (input.sliceId === undefined) {
        return {
          references: allReferences(ctx).map((reference) => ({
            sliceId: reference.sliceId,
            name: reference.name,
            widthPx: reference.view.widthPx,
            heightPx: reference.view.heightPx,
            scale: scaleOf(reference),
          })),
        }
      }
      const resolved = resolveReference(ctx, input.sliceId)
      if (resolved.error !== undefined) return { error: resolved.error }
      const { reference } = resolved
      if (!reference.sent) {
        return { error: `${reference.sliceId} is in the project but this browser has not prepared a copy to send. Ask the user to attach the image in this chat.` }
      }
      return {
        sliceId: reference.sliceId,
        name: reference.name,
        widthPx: reference.view.widthPx,
        heightPx: reference.view.heightPx,
        scale: scaleOf(reference),
        image: { mediaType: reference.sent.mediaType, data: reference.sent.data },
      }
    },
  }
}

/** @returns {Tool} */
function createSetReferenceScaleTool() {
  return {
    name: 'set_reference_scale',
    description:
      'Set an attached image’s scale from one known length: the two ends of a printed dimension (or a ruler in a photo) in image pixels, and its length in millimetres. ' +
      'Do this before anything else is measured or built from the image. checks cross-checks other printed dimensions against the scale and reports any that disagree.',
    inputSchema: objectSchema(
      {
        sliceId: SLICE_ID,
        fromPx: point('One end of the known length, [x, y] in image pixels (origin top-left, +y down).'),
        toPx: point('The other end, [x, y] in image pixels.'),
        distanceMm: { type: 'number', description: 'The printed length between the two points, in millimetres.' },
        label: { type: 'string', description: 'What was measured, e.g. "board length" — shown to the user.' },
        checks: {
          type: 'array',
          maxItems: MAX_CHECKS,
          description: 'Other printed dimensions to cross-check against the scale.',
          items: objectSchema(
            {
              label: { type: 'string', description: 'What it is, e.g. "board width".' },
              fromPx: point('One end, in image pixels.'),
              toPx: point('The other end, in image pixels.'),
              distanceMm: { type: 'number', description: 'Its printed length, in millimetres.' },
            },
            ['label', 'fromPx', 'toPx', 'distanceMm']
          ),
        },
      },
      ['sliceId', 'fromPx', 'toPx', 'distanceMm']
    ),
    transports: ['ai'],
    run: (ctx, input) => {
      const resolved = resolveReference(ctx, input.sliceId)
      if (resolved.error !== undefined) return { error: resolved.error }
      const { reference } = resolved
      if (reference.kind !== 'attachment' || !ctx.references) {
        return {
          error: `${reference.sliceId} is a photo already in the project; its scale is set by the user with Set scale in the sketch editor. Ask them to set it there, or to attach the image in this chat so you can scale that.`,
        }
      }
      for (const [what, px] of [['fromPx', input.fromPx], ['toPx', input.toPx]]) {
        const problem = outsideProblem(px, reference.view, what)
        if (problem) return { error: problem }
      }
      const aPx = sentPxToImagePx(input.fromPx, reference.view, reference.size)
      const bPx = sentPxToImagePx(input.toPx, reference.view, reference.size)
      const problem = calibrationProblem(aPx, bPx, input.distanceMm, 'mm')
      if (problem) return { error: `${problem}.` }
      const mmPerPx = mmPerPxFrom(aPx, bPx, input.distanceMm, 'mm')

      /** @type {Array<Record<string, any>>} */
      const checks = []
      for (const [index, check] of (input.checks ?? []).entries()) {
        for (const [what, px] of [['fromPx', check.fromPx], ['toPx', check.toPx]]) {
          const outside = outsideProblem(px, reference.view, `checks[${index}].${what}`)
          if (outside) return { error: outside }
        }
        const a = sentPxToImagePx(check.fromPx, reference.view, reference.size)
        const b = sentPxToImagePx(check.toPx, reference.view, reference.size)
        const measuredMm = Math.hypot(b[0] - a[0], b[1] - a[1]) * mmPerPx
        const offByMm = measuredMm - check.distanceMm
        const tolerance = Math.max(CHECK_TOLERANCE_MM, Math.abs(check.distanceMm) * CHECK_TOLERANCE_SHARE)
        checks.push({ label: check.label, printedMm: check.distanceMm, measuredMm: round(measuredMm), offByMm: round(offByMm), consistent: Math.abs(offByMm) <= tolerance })
      }

      const label = typeof input.label === 'string' && input.label.trim() !== '' ? input.label.trim().slice(0, 80) : undefined
      ctx.references.scales.set(reference.sliceId, {
        mmPerPx,
        calibration: { aPx, bPx, length: input.distanceMm, unit: 'mm' },
        ...(label ? { label } : {}),
      })
      const disagree = checks.filter((check) => !check.consistent)
      return {
        sliceId: reference.sliceId,
        mmPerPx: round((mmPerPx * reference.size.widthPx) / reference.view.widthPx),
        imageSizeMm: [round(reference.size.widthPx * mmPerPx), round(reference.size.heightPx * mmPerPx)],
        ...(label ? { label } : {}),
        ...(checks.length > 0 ? { checks } : {}),
        ...(disagree.length > 0
          ? {
              warning: disagree
                .map((check) => `${check.label} is printed ${check.printedMm} mm but measures ${Number(check.measuredMm.toFixed(2))} mm at this scale`)
                .join('; '),
            }
          : {}),
        note: 'Millimetres from the image tools are on the sketch plane with the image centred on the sketch origin — where a sketch slice’s referenceImage puts it.',
      }
    },
  }
}

/** @returns {Tool} */
function createLocateInImageTool() {
  return {
    name: 'locate_in_image',
    description:
      'Turn boxes you have found on a scaled image into millimetres. Give the boxes in image pixels as [left, top, right, bottom]; each comes back in pixels and ' +
      'as min, max, centre and size in millimetres on the sketch plane. Refused until the image has a scale (set_reference_scale).',
    inputSchema: objectSchema(
      {
        sliceId: SLICE_ID,
        query: { type: 'string', description: 'What the boxes are, e.g. "mounting holes" or "USB-A connector".' },
        boxesPx: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_BOXES,
          description: 'Each box as [left, top, right, bottom] in image pixels.',
          items: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4 },
        },
      },
      ['sliceId', 'query', 'boxesPx']
    ),
    transports: ['ai'],
    run: (ctx, input) => {
      const resolved = resolveReference(ctx, input.sliceId)
      if (resolved.error !== undefined) return { error: resolved.error }
      const { reference } = resolved
      const placement = reference.placement
      if (!placement) return { error: unscaledError(reference) }
      /** @type {Array<Record<string, any>>} */
      const boxes = []
      for (const [index, box] of input.boxesPx.entries()) {
        const [left, top, right, bottom] = /** @type {number[]} */ (box)
        for (const corner of [[left, top], [right, bottom]]) {
          const problem = outsideProblem(corner, reference.view, `boxesPx[${index}]`)
          if (problem) return { error: problem }
        }
        const corners = [[left, top], [right, top], [right, bottom], [left, bottom]].map((px) =>
          imagePxToMm(placement, reference.size, sentPxToImagePx(px, reference.view, reference.size))
        )
        const xs = corners.map((c) => c[0])
        const ys = corners.map((c) => c[1])
        const minMm = [Math.min(...xs), Math.min(...ys)]
        const maxMm = [Math.max(...xs), Math.max(...ys)]
        boxes.push({
          px: [left, top, right, bottom],
          minMm: minMm.map(round),
          maxMm: maxMm.map(round),
          centerMm: [round((minMm[0] + maxMm[0]) / 2), round((minMm[1] + maxMm[1]) / 2)],
          sizeMm: [round(maxMm[0] - minMm[0]), round(maxMm[1] - minMm[1])],
        })
      }
      return { sliceId: reference.sliceId, query: input.query, scale: scaleOf(reference), boxes }
    },
  }
}

/**
 * The three image tools.
 *
 * @returns {Tool[]}
 */
export function createImageTools() {
  return [createGetReferenceImageTool(), createSetReferenceScaleTool(), createLocateInImageTool()]
}

/**
 * Where a scaled reference lies in world millimetres: the box around its four corners.
 *
 * @param {Reference} reference Must be scaled.
 * @returns {[[number, number, number], [number, number, number]]}
 */
export function referenceWorldBounds(reference) {
  const placement = /** @type {ImagePlacement} */ (reference.placement)
  const { widthPx, heightPx } = reference.size
  const world = [
    [0, 0],
    [widthPx, 0],
    [widthPx, heightPx],
    [0, heightPx],
  ].map((px) => {
    const mm = imagePxToMm(placement, reference.size, px)
    return frameApply(reference.frame, [mm[0], mm[1], reference.zMm])
  })
  /** @type {[number, number, number]} */
  const min = [Infinity, Infinity, Infinity]
  /** @type {[number, number, number]} */
  const max = [-Infinity, -Infinity, -Infinity]
  for (const corner of world) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], corner[axis])
      max[axis] = Math.max(max[axis], corner[axis])
    }
  }
  return [min, max]
}

/**
 * A sketch create's slices with each `referenceImage` replaced by the attachment's calibrated
 * placement, and the asset records that must be appended before the sketch. Throws — naming
 * the fix — for an attachment that is unknown or has no scale yet.
 *
 * @param {import('../../core/document.js').WarpDocument} document
 * @param {Record<string, any>} params
 * @param {ToolReferences | undefined} references
 * @returns {{ params: Record<string, any>, assets: ImageAssetRecord[] }}
 */
export function placeReferenceImages(document, params, references) {
  if (!Array.isArray(params.slices) || !params.slices.some((/** @type {any} */ slice) => slice && 'referenceImage' in slice)) {
    return { params, assets: [] }
  }
  /** @type {ImageAssetRecord[]} */
  const assets = []
  const present = document.assets()
  const slices = params.slices.map((/** @type {any} */ slice, /** @type {number} */ index) => {
    if (!slice || !('referenceImage' in slice)) return slice
    const { referenceImage, ...rest } = slice
    if (!references) {
      throw new Error(`slices[${index}].referenceImage names an image attached in the browser chat, and there is none here — attach the drawing in the Assistant`)
    }
    const attachment = references.attachments.find((candidate) => candidate.id === referenceImage)
    if (!attachment) {
      const ids = references.attachments.map((candidate) => candidate.id)
      throw new Error(`slices[${index}].referenceImage "${referenceImage}" is not an attached image${ids.length > 0 ? ` (attached: ${ids.join(', ')})` : ' — nothing has been attached'}`)
    }
    const scale = references.scales.get(attachment.id)
    if (!scale) {
      throw new Error(`Set the scale of ${attachment.id} with set_reference_scale before putting it on a sketch — a drawing is never placed at a guessed scale`)
    }
    if (!present.has(attachment.record.id) && !assets.some((asset) => asset.id === attachment.record.id)) assets.push(attachment.record)
    /** @type {ImagePlacement} */
    const placement = {
      assetId: attachment.record.id,
      offsetMm: [0, 0],
      rotationDeg: 0,
      opacity: DEFAULT_OPACITY,
      mmPerPx: scale.mmPerPx,
      calibration: JSON.parse(JSON.stringify(scale.calibration)),
    }
    return { ...rest, image: placement }
  })
  return { params: { ...params, slices }, assets }
}
