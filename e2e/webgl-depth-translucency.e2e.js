// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { withRowSettings } from './support/libraryRow.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { snapViaGizmo } from './support/snapViaGizmo.js'

/**
 * `TODO/testing-015`: depth-buffer fighting, coplanar cutter holes and overlapping translucent
 * surfaces, asserted on pixels of the running app at `/` on every engine and viewport.
 *
 * These checks sat in `TODO/VERIFY.md` as hand-looks (`ui-016` row 1, `core-034` rows 1-2,
 * `render-003` rows 1-2). The headless renderer here is a software rasteriser, so it cannot say how
 * a real iPhone or iPad GPU looks (that stays a manual row), but it does show the two things a
 * z-fight or a bad blend order produce in any rasteriser:
 *
 * - **Flicker**: two captures of an unchanged scene, a few frames apart, differ in the pixels
 *   where two surfaces tie for depth (the winner flips with float rounding and draw order).
 * - **Speckle**: isolated pixels whose colour disagrees with a perfectly flat neighbourhood, the
 *   "salt" a depth tie leaves on a surface. Antialiased silhouettes and grid lines never qualify,
 *   because their neighbourhoods are not flat.
 *
 * Each scene is captured at a fixed view twice (frame A, frame B) and once after the camera is
 * orbited one navigation step (frame C), at two views near the surface in question.
 *
 * Tolerances live in `TOLERANCE` below. Nothing is skipped on any engine. A tolerance is only
 * raised with a measured reason written next to it.
 *
 * Captures hide the DOM overlays (the canvas screenshot's `style` option) and each scene clears
 * the selection first: Firefox redraws the selection's move handles with a few pixels of
 * run-to-run difference, which is a different question from the one asked here (see the
 * hand-off notes on `TODO/testing-015`).
 *
 * Not covered, and still manual: how a real iPhone or iPad GPU looks, and "double-darkening" of
 * two translucent layers, which no pixel-stability measure can tell from a correct blend.
 */

/**
 * Per-engine tolerances.
 *
 * - `flickerFraction`: the largest share of canvas pixels allowed to differ between frame A and
 *   frame B (same camera, same scene). A static scene should be bit-identical, so the default is 0.
 * - `speckleFraction`: the largest share of canvas pixels allowed to be isolated speckles in any
 *   capture.
 *
 * @type {Record<string, { flickerFraction: number, speckleFraction: number }>}
 */
const TOLERANCE = {
  // Measured over repeated runs on all nine projects (2026-11-13): flicker 0 everywhere. Speckle
  // peaks at 1.4e-4 on chromium (111 pixels of the 920x847 laptop canvas, camera modules tilted), only
  // ever in the oblique frames, on the translucent boards. The dots sit on the faint grid lines
  // seen through the board (visible as dotted lines in the saved frames): the
  // software rasteriser (SwiftShader) breaks a one-pixel line at an oblique angle into isolated
  // pale pixels. That is aliasing of the grid beneath, not a depth tie between two surfaces (a tie
  // paints contiguous patches along the shared face). The ceiling allows twice the worst
  // measurement; a real z-fight is hundreds to thousands of pixels (1e-3 and up) and still fails.
  chromium: { flickerFraction: 0, speckleFraction: 3e-4 },
  // Firefox's worst measurement was 6.5e-6, WebKit's 2.4e-6. They keep a ceiling of 5e-5, set
  // above the measurements for run-to-run noise, not at chromium's allowance.
  firefox: { flickerFraction: 0, speckleFraction: 5e-5 },
  webkit: { flickerFraction: 0, speckleFraction: 5e-5 },
}

/** Channel difference (0-255) above which two captures of one pixel count as different. */
const FLICKER_DELTA = 8
/** Channel difference from the neighbourhood mean above which a pixel is a speckle candidate. */
const SPECKLE_DELTA = 40
/** Largest channel spread across the 8 neighbours for the neighbourhood to count as flat. */
const FLAT_SPREAD = 6
/** Share of the canvas that must be solid part colour, or no part is on screen (measured minimum over 9 projects: 0.046). */
const MIN_BODY_FRACTION = 0.01

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} sectionId
 */
async function openLibrary(page, sectionId) {
  const rows = page.getByTestId('library-rows')
  if (!(await rows.isVisible())) {
    await page.getByTestId('library-tab').click()
    await expect(rows).toBeVisible()
  }
  await page.getByTestId(`library-rows-${sectionId}`).scrollIntoViewIfNeeded()
}

/**
 * Put the Library sheet away where this viewport has one, so it does not cover the canvas.
 *
 * @param {import('@playwright/test').Page} page
 */
async function closeLibrary(page) {
  const tab = page.getByTestId('library-tab')
  if (!(await tab.isVisible())) return
  if (await page.getByTestId('library-rows').isVisible()) await tab.click()
  await expect(page.getByTestId('library-rows')).toBeHidden()
}

/**
 * Unfold the navigation chrome where a phone-width sheet folded it away.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openNavChrome(page) {
  const toggle = page.getByTestId('nav-expand-toggle')
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false') {
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  }
}

/**
 * Drag a Library row into the viewport and release at a fraction of it (real pointer events, so
 * one helper serves mouse and touch projects).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} op
 * @param {number} fx
 * @param {number} fy
 */
async function dropRow(page, op, fx, fy) {
  await page.evaluate(
    ({ op, fx, fy }) => {
      const row = document.querySelector(`[data-testid="library-row-${op}"]`)
      const view = document.querySelector('[data-testid="viewport"]')
      if (!row || !view) throw new Error(`missing row ${op} or viewport`)
      const from = row.getBoundingClientRect()
      const to = view.getBoundingClientRect()
      const sx = from.left + from.width / 2
      const sy = from.top + from.height / 2
      const ex = to.left + to.width * fx
      const ey = to.top + to.height * fy
      /** @param {EventTarget} target @param {string} type @param {number} x @param {number} y */
      const fire = (target, type, x, y) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 15, pointerType: 'mouse', isPrimary: true, button: 0,
            buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, bubbles: true, cancelable: true,
          }),
        )
      fire(row, 'pointerdown', sx, sy)
      for (const t of [0.25, 0.5, 0.75, 1]) fire(window, 'pointermove', sx + (ex - sx) * t, sy + (ey - sy) * t)
      fire(window, 'pointerup', ex, ey)
    },
    { op, fx, fy },
  )
}

/**
 * A drop point `offsetPx` pixels left (negative) or right of the viewport's middle, as the
 * fraction `dropRow` takes. Parts are placed by pixel offset, not by a fixed fraction, because the
 * camera's scale follows the viewport's height: a fraction of a laptop's width is several times
 * the same fraction of a phone's, which pushed the laptop's parts out of frame once zoomed in.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} offsetPx
 * @returns {Promise<number>}
 */
async function dropX(page, offsetPx) {
  const box = await page.getByTestId('viewport').boundingBox()
  if (!box) throw new Error('viewport has no box')
  return 0.5 + offsetPx / box.width
}

/**
 * Drop a part and wait for the kernel to report its volume (the solid is built and on screen).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} sectionId
 * @param {string} op
 * @param {number} fx
 * @param {number} fy
 * @param {() => Promise<void>} [beforeDrop] Runs with the Library open, e.g. to pick a variant.
 * @returns {Promise<{ min: number[], max: number[] }>} The new body's bounds, in mm.
 */
async function placePart(page, sectionId, op, fx, fy, beforeDrop) {
  await openLibrary(page, sectionId)
  if (beforeDrop) await beforeDrop()
  const before = await page.locator(`[data-testid="scene-bodies"] li[data-body-op="${op}"]`).count()
  await dropRow(page, op, fx, fy)
  const body = page.locator(`[data-testid="scene-bodies"] li[data-body-op="${op}"]`).nth(before)
  await expect(body).toHaveAttribute('data-body-volume', /.+/, { timeout: 30_000 })
  const raw = (await body.getAttribute('data-body-bounds')) ?? ''
  const n = raw.split(',').map(Number)
  return { min: n.slice(0, 3), max: n.slice(3, 6) }
}

/**
 * Wait until the camera readout stops changing (a snap or zoom may animate) and two animation
 * frames have run, so the next capture shows the settled scene.
 *
 * @param {import('@playwright/test').Page} page
 */
async function settleCamera(page) {
  const view = page.getByTestId('viewport')
  const read = () =>
    view.evaluate((el) =>
      ['azimuth', 'elevation', 'distance', 'target'].map((k) => el.getAttribute(`data-camera-${k}`)).join('|'),
    )
  let last = ''
  await expect
    .poll(async () => {
      const now = await read()
      const stable = now === last
      last = now
      return stable
    }, { intervals: [120, 120, 120, 250], timeout: 10_000 })
    .toBe(true)
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

/**
 * Capture the canvas as a PNG, base64, without the DOM overlays on top of it.
 *
 * @param {import('@playwright/test').Page} page
 */
async function captureCanvas(page) {
  // Hide the DOM overlays (gizmo, nav chrome, chips, rulers) for the capture only: this spec
  // judges what WebGL drew, and an overlay's own text or animation is not a depth artefact.
  const png = await page.getByTestId('viewport-canvas').screenshot({
    style: '[data-testid="viewport"] > :not([data-testid="viewport-canvas"]) { visibility: hidden !important }',
  })
  return png.toString('base64')
}

/**
 * Decode captures in the page and measure them. Done in the page because `<img>` decoding is the
 * one PNG decoder every engine already has.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ a: string, b: string, c: string }} frames base64 PNGs: frame A, frame B (same camera), frame C (nudged).
 */
async function measure(page, frames) {
  return page.evaluate(
    async ({ frames, FLICKER_DELTA, SPECKLE_DELTA, FLAT_SPREAD }) => {
      /** @param {string} b64 */
      async function decode(b64) {
        const img = new Image()
        img.src = `data:image/png;base64,${b64}`
        await img.decode()
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
        ctx.drawImage(img, 0, 0)
        return { w: canvas.width, h: canvas.height, d: ctx.getImageData(0, 0, canvas.width, canvas.height).data }
      }
      /** @param {{ w: number, h: number, d: Uint8ClampedArray }} f */
      function analyse(f) {
        const { w, h, d } = f
        // A pixel belongs to a part when it is warm, green or neutral grey; the grid, the axes' thin
        // lines and the background are blue-tinted. `solid` also needs the whole 3x3 to qualify,
        // which drops one-pixel lines and antialiasing fringes.
        const partPixel = (/** @type {number} */ x, /** @type {number} */ y) => {
          const i = (y * w + x) * 4
          const r = d[i], g = d[i + 1], b = d[i + 2]
          return r - b > 8 || g - b > 8 || Math.abs(r - b) <= 8
        }
        const solid = (/** @type {number} */ x, /** @type {number} */ y) => {
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!partPixel(x + dx, y + dy)) return false
          return true
        }
        let body = 0
        let speckle = 0
        /** @type {number[][]} */
        const spots = []
        const at = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ c) => d[(y * w + x) * 4 + c]
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const i = (y * w + x) * 4
            if (solid(x, y)) body++
            let flat = true
            let off = 0
            for (let c = 0; c < 3 && flat; c++) {
              let lo = 255
              let hi = 0
              let sum = 0
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  if (!dx && !dy) continue
                  const v = at(x + dx, y + dy, c)
                  if (v < lo) lo = v
                  if (v > hi) hi = v
                  sum += v
                }
              }
              if (hi - lo > FLAT_SPREAD) flat = false
              else off = Math.max(off, Math.abs(d[i + c] - sum / 8))
            }
            if (flat && off > SPECKLE_DELTA) {
              speckle++
              if (spots.length < 3) spots.push([x, y])
            }
          }
        }
        return { pixels: w * h, body, speckle, spots }
      }
      const [a, b, c] = await Promise.all([decode(frames.a), decode(frames.b), decode(frames.c)])
      let flicker = 0
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1
      for (let i = 0; i < a.d.length; i += 4) {
        if (
          Math.max(Math.abs(a.d[i] - b.d[i]), Math.abs(a.d[i + 1] - b.d[i + 1]), Math.abs(a.d[i + 2] - b.d[i + 2])) >
          FLICKER_DELTA
        ) {
          flicker++
          const px = (i / 4) % a.w, py = Math.floor(i / 4 / a.w)
          x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py)
        }
      }
      return { size: [a.w, a.h], sameSize: a.w === b.w && a.h === b.h, flicker, flickerBox: [x0, y0, x1, y1], a: analyse(a), c: analyse(c) }
    },
    { frames, FLICKER_DELTA, SPECKLE_DELTA, FLAT_SPREAD },
  )
}

/**
 * Clear the selection a drop leaves behind, so the capture shows the parts and not the selection
 * outline and move handles drawn over them.
 *
 * @param {import('@playwright/test').Page} page
 */
async function deselect(page) {
  const view = page.getByTestId('viewport')
  await page.keyboard.press('Escape')
  if (await view.getAttribute('data-selected-id')) {
    await page.getByTestId('viewport-canvas').click({ position: { x: 3, y: 3 } })
  }
  await expect(view).not.toHaveAttribute('data-selected-id', /.+/)
}

/**
 * Read the camera's orbit target, in mm.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number[]>}
 */
async function cameraTarget(page) {
  const raw = (await page.getByTestId('viewport').getAttribute('data-camera-target')) ?? '0,0,0'
  return raw.split(',').map(Number)
}

/**
 * Pan the camera, in a top view, until its orbit target sits over the middle of `bounds`, so the
 * parts a scene placed off-centre fill the frame when the camera zooms in. The pan buttons move
 * the target by a screen-sized step, so this probes one press each way to learn what a press does
 * to the target, solves for the presses needed, and presses. Best effort: a part the camera still
 * misses fails the part-visible assertion in `checkView`, which is what guards it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ min: number[], max: number[] }} bounds Union of the placed bodies, in mm.
 */
async function centreOn(page, bounds) {
  await deselect(page)
  await snapViaGizmo(page, 'top')
  await settleCamera(page)
  await openNavChrome(page)
  await page.getByTestId('nav-mode-pan').click()
  const want = [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2]
  const t0 = await cameraTarget(page)
  await page.getByTestId('nav-step-right').click()
  await settleCamera(page)
  const t1 = await cameraTarget(page)
  await page.getByTestId('nav-step-up').click()
  await settleCamera(page)
  const t2 = await cameraTarget(page)
  const r = [t1[0] - t0[0], t1[1] - t0[1]]
  const u = [t2[0] - t1[0], t2[1] - t1[1]]
  const need = [want[0] - t2[0], want[1] - t2[1]]
  const det = r[0] * u[1] - r[1] * u[0]
  if (Math.abs(det) > 1e-9) {
    const nr = Math.round((need[0] * u[1] - need[1] * u[0]) / det)
    const nu = Math.round((r[0] * need[1] - r[1] * need[0]) / det)
    for (let i = 0; i < Math.abs(nr); i++) {
      await page.getByTestId(nr > 0 ? 'nav-step-right' : 'nav-step-left').click()
      await settleCamera(page)
    }
    for (let i = 0; i < Math.abs(nu); i++) {
      await page.getByTestId(nu > 0 ? 'nav-step-up' : 'nav-step-down').click()
      await settleCamera(page)
    }
  }
  await page.getByTestId('nav-mode-orbit').click()
  await settleCamera(page)
}

/**
 * Union of body bounds.
 *
 * @param {Array<{ min: number[], max: number[] }>} list
 * @returns {{ min: number[], max: number[] }}
 */
function unionBounds(list) {
  return {
    min: [0, 1, 2].map((k) => Math.min(...list.map((b) => b.min[k]))),
    max: [0, 1, 2].map((k) => Math.max(...list.map((b) => b.max[k]))),
  }
}

/**
 * Snap to the top view, tilt it `tilt` orbit steps (15 degrees each), zoom in `zooms` steps, then capture A, B (a few frames later) and C
 * (after one orbit step), and assert the tolerances.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} testInfo
 * @param {string} label
 * @param {{ tilt: number, zooms: number }} options
 */
async function checkView(page, testInfo, label, { tilt, zooms }) {
  // Every view starts from the top one and tilts with orbit presses, which keep the orbit target
  // `centreOn` set (a gizmo snap to an oblique view recentres on the origin and loses the parts).
  await snapViaGizmo(page, 'top')
  await settleCamera(page)
  await openNavChrome(page)
  for (let i = 0; i < tilt; i++) {
    await page.getByTestId('nav-step-down').click()
    await settleCamera(page)
  }
  for (let i = 0; i < zooms; i++) await page.getByTestId('nav-zoom-in').click()
  await settleCamera(page)

  const elevation = Number(await page.getByTestId('viewport').getAttribute('data-camera-elevation'))
  const target = await cameraTarget(page)
  const a = await captureCanvas(page)
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const b = await captureCanvas(page)

  await openNavChrome(page)
  await page.getByTestId('nav-step-right').click()
  await settleCamera(page)
  const c = await captureCanvas(page)

  const m = await measure(page, { a, b, c })
  const evidence = join(process.cwd(), 'test-results', 'webgl-depth-translucency')
  mkdirSync(evidence, { recursive: true })
  const stem = `${testInfo.project.name}-${label.replace(/\W+/g, '-')}`
  writeFileSync(join(evidence, `${stem}-A.png`), Buffer.from(a, 'base64'))
  writeFileSync(join(evidence, `${stem}-C.png`), Buffer.from(c, 'base64'))
  if (m.flicker > 0) writeFileSync(join(evidence, `${stem}-B.png`), Buffer.from(b, 'base64'))
  const tol = TOLERANCE[testInfo.project.name.split('-')[0]]
  const summary = {
    label,
    project: testInfo.project.name,
    canvas: m.size.join('x'),
    elevation,
    target: target.map((v) => Math.round(v)),
    flickerFraction: m.flicker / m.a.pixels,
    flickerBox: m.flickerBox,
    speckleA: m.a.speckle / m.a.pixels,
    speckleC: m.c.speckle / m.c.pixels,
    bodyA: m.a.body / m.a.pixels,
    bodyC: m.c.body / m.c.pixels,
    speckleSpotsA: m.a.spots,
    speckleSpotsC: m.c.spots,
  }
  testInfo.annotations.push({ type: 'depth-metrics', description: JSON.stringify(summary) })
  console.log(`[depth-metrics] ${JSON.stringify(summary)}`)

  expect(m.sameSize, `${label}: the canvas kept its size between frames`).toBe(true)
  // The part is really on screen in both orientations, so the other checks are not vacuous.
  expect(summary.bodyA, `${label}: part visible at the fixed camera`).toBeGreaterThan(MIN_BODY_FRACTION)
  expect(summary.bodyC, `${label}: part visible at the nudged camera`).toBeGreaterThan(MIN_BODY_FRACTION)
  expect(summary.flickerFraction, `${label}: frames A and B of a still scene match`).toBeLessThanOrEqual(tol.flickerFraction)
  expect(summary.speckleA, `${label}: no isolated speckle at the fixed camera`).toBeLessThanOrEqual(tol.speckleFraction)
  expect(summary.speckleC, `${label}: no isolated speckle at the nudged camera`).toBeLessThanOrEqual(tol.speckleFraction)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('Bolt and Anchor: no seam or flicker where their parts meet (ui-016 row 1)', async ({ page }, testInfo) => {
  const bolt = await placePart(page, 'hardware', 'hardware.bolt', await dropX(page, -60), 0.3)
  const anchor = await placePart(page, 'kit', 'kit.anchor', await dropX(page, 60), 0.3)
  await closeLibrary(page)
  await centreOn(page, unionBounds([bolt, anchor]))
  await checkView(page, testInfo, 'bolt+anchor tilted', { tilt: 3, zooms: 4 })
  await checkView(page, testInfo, 'bolt+anchor low', { tilt: 5, zooms: 2 })
})

test('Raspberry Pi 5 from above: mounting and fan holes read cleanly (core-034 row 1, render-003 row 1)', async ({ page }, testInfo) => {
  const pi = await placePart(page, 'raspberrypi', 'raspberrypi.bplus', await dropX(page, 0), 0.3, () =>
    withRowSettings(page, 'raspberrypi.bplus', () => page.getByTestId('library-choice-raspberrypi.bplus').selectOption('5')),
  )
  await closeLibrary(page)
  await centreOn(page, pi)
  await checkView(page, testInfo, 'pi5 top', { tilt: 0, zooms: 2 })
  // An oblique view, where the translucent board lies over the opaque parts on top of it.
  await checkView(page, testInfo, 'pi5 tilted', { tilt: 3, zooms: 2 })
})

test('camera module v1 and v2: coplanar cutter holes show no speckle (core-034 row 2)', async ({ page }, testInfo) => {
  const placed = []
  for (const [model, offsetPx] of [['v1', -45], ['v2', 45]]) {
    placed.push(await placePart(page, 'raspberrypi', 'raspberrypi.cameraModule', await dropX(page, offsetPx), 0.3, () =>
      withRowSettings(page, 'raspberrypi.cameraModule', () =>
        page.getByTestId('library-choice-raspberrypi.cameraModule').selectOption(model),
      ),
    ))
  }
  await closeLibrary(page)
  await centreOn(page, unionBounds(placed))
  await checkView(page, testInfo, 'camera v1+v2 top', { tilt: 0, zooms: 5 })
  await checkView(page, testInfo, 'camera v1+v2 tilted', { tilt: 3, zooms: 5 })
})

test('two Pis with overlapping translucent boards: no flicker or z-fighting (render-003 row 2)', async ({ page }, testInfo) => {
  const first = await placePart(page, 'raspberrypi', 'raspberrypi.bplus', await dropX(page, -30), 0.3)
  const second = await placePart(page, 'raspberrypi', 'raspberrypi.bplus', await dropX(page, 30), 0.32)
  // The spec only means something if the two boards really overlap in plan.
  const overlapsX = Math.min(first.max[0], second.max[0]) - Math.max(first.min[0], second.min[0])
  const overlapsY = Math.min(first.max[1], second.max[1]) - Math.max(first.min[1], second.min[1])
  expect(overlapsX, 'the two Pis overlap along X').toBeGreaterThan(0)
  expect(overlapsY, 'the two Pis overlap along Y').toBeGreaterThan(0)
  await closeLibrary(page)
  await centreOn(page, unionBounds([first, second]))
  await checkView(page, testInfo, 'two pis top', { tilt: 0, zooms: 1 })
  await checkView(page, testInfo, 'two pis tilted', { tilt: 3, zooms: 1 })
})
