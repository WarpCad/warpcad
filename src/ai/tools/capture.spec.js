// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from '../../core/document.js'
import { makeContext } from './__fixtures__/context.js'
import { createToolRegistry } from './index.js'

/**
 * `TODO/ai-007` — `capture_view`. The tool is the framework-free half: it validates the
 * request, hands the **turn's** bodies (the fork the model is building on, not the live
 * document) to the capture boundary the browser transport passes in, and returns a small
 * JSON result plus the PNG for the provider layer to attach. The three.js half is
 * `src/render/offscreenCapture.js`, covered by `e2e/ai-capture.e2e.js`; here the boundary is a
 * fake (`CLAUDE.md`: mock at the boundary — no GPU in a unit test).
 */

const tools = createToolRegistry()

function fakeCapture() {
  /** @type {any[]} */
  const requests = []
  return {
    requests,
    /** @param {any} request */
    capture(request) {
      requests.push(request)
      return {
        mediaType: /** @type {'image/png'} */ ('image/png'),
        data: 'iVBORw0KGgo=',
        widthPx: request.widthPx,
        heightPx: request.heightPx,
        contentFraction: 0.31,
      }
    },
  }
}

/** @param {import('../../core/document.js').WarpDocument} document @param {any} input */
function create(document, input) {
  const result = /** @type {any} */ (tools.run(makeContext({ document }), 'create', input))
  expect(result.error).toBeUndefined()
  return /** @type {string} */ (result.applied[0].bodyId)
}

describe('capture_view', () => {
  it('renders every body on screen from the named view, and returns the PNG beside small JSON', () => {
    const document = createDocument()
    const a = create(document, { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [10, 10, 10] } })
    const b = create(document, { op: 'primitive.sphere', positionMm: [30, 0, 0], params: { diameter: 10 } })
    const capture = fakeCapture()
    const result = /** @type {any} */ (tools.run({ ...makeContext({ document }), capture }, 'capture_view', { view: 'top' }))
    expect(result.error).toBeUndefined()
    const [request] = capture.requests
    expect(request.view).toBe('top')
    expect(request.bodies.map((/** @type {any} */ body) => body.id)).toEqual([a, b])
    expect(request.bodies[0].geometry).toBe(document.bodies()[0].geometry)
    expect(request.highlightIds).toEqual([])
    expect(request.section).toBeNull()
    expect(request.widthPx).toBe(768)
    expect(request.heightPx).toBe(576)
    expect(result).toMatchObject({ view: 'top', widthPx: 768, heightPx: 576, bodies: [a, b], contentFraction: 0.31 })
    expect(result.image).toEqual({ mediaType: 'image/png', data: 'iVBORw0KGgo=' })
    // Everything but the image is small: the JSON the model reads is a few hundred bytes.
    const { image, ...rest } = result
    expect(JSON.stringify(rest).length).toBeLessThan(600)
  })

  it('takes ids, a highlight, a section and a width (clamped to the image ceiling)', () => {
    const document = createDocument()
    const a = create(document, { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [10, 10, 10] } })
    create(document, { op: 'primitive.cuboid', positionMm: [40, 0, 0], params: { size: [10, 10, 10] } })
    const capture = fakeCapture()
    tools.run({ ...makeContext({ document }), capture }, 'capture_view', {
      view: 'front',
      ids: [a],
      highlight: [a],
      section: { axis: 'y', offsetMm: 0 },
      width: 4000,
    })
    const [request] = capture.requests
    expect(request.bodies.map((/** @type {any} */ body) => body.id)).toEqual([a])
    expect(request.highlightIds).toEqual([a])
    expect(request.section).toEqual({ axis: 'y', offsetMm: 0 })
    expect(request.widthPx).toBe(1568)
  })

  it('refuses an id that is not on screen, and a view it does not know, before rendering anything', () => {
    const document = createDocument()
    const capture = fakeCapture()
    const ctx = { ...makeContext({ document }), capture }
    expect(tools.run(ctx, 'capture_view', { view: 'iso', ids: ['cuboid-9'] }).error).toMatch(/cuboid-9/)
    expect(tools.run(ctx, 'capture_view', { view: 'sideways' }).error).toBe('invalid input')
    expect(capture.requests).toEqual([])
  })

  it('says so when the image came out nearly empty, rather than letting the model trust it', () => {
    const document = createDocument()
    create(document, { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [10, 10, 10] } })
    const capture = {
      capture: (/** @type {any} */ request) => ({ mediaType: /** @type {'image/png'} */ ('image/png'), data: 'x', widthPx: request.widthPx, heightPx: request.heightPx, contentFraction: 0 }),
    }
    const result = /** @type {any} */ (tools.run({ ...makeContext({ document }), capture }, 'capture_view', { view: 'iso' }))
    expect(result.warning).toMatch(/empty|blank/i)
  })

  it('in a browser with no working viewport it fails with a reason, not a crash', () => {
    const result = tools.run(makeContext({ document: createDocument() }), 'capture_view', { view: 'iso' })
    expect(result.error).toMatch(/viewport/)
  })
})
