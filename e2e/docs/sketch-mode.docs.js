// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { endMovie, humanDrag, openApp, shot, startMovie } from './support.js'

/**
 * Docs media for `docs/sketch-mode.md` (`TODO/docs-017`): the sketch editor's whole flow.
 * Four movies (place, draw a closed outline, a hole, extrude) and five stills (the toolbar,
 * a closed profile, the Extrude panel, the Slices panel, the finished solid). Laptop only.
 *
 * Canvas drawing goes through the sketch plane's own projection, like
 * `e2e/sketch-primitive.e2e.js`: the editor aims the camera straight down at the sketch
 * origin, so the origin is the canvas centre and millimetres per pixel follow from the
 * camera distance and the 45 degree field of view. Every gesture is a real mouse drag at a
 * human pace. Each movie ends on an assertion about the document, so a drag that drew
 * nothing fails instead of publishing a GIF of an empty plane. Not an acceptance check:
 * scenario 9 is driven by hand.
 */
test.describe('docs media: sketch mode', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  /** @param {import('@playwright/test').Page} page */
  const viewport = (page) => page.getByTestId('viewport')

  /**
   * Drag the Library's Sketch row into the view with the real mouse and wait for the editor.
   *
   * @param {import('@playwright/test').Page} page
   */
  async function dropSketch(page) {
    const row = await page.getByTestId('library-row-primitive.sketch').boundingBox()
    const view = await viewport(page).boundingBox()
    await humanDrag(
      page,
      { x: row.x + row.width / 2, y: row.y + row.height / 2 },
      { x: view.x + view.width / 2, y: view.y + view.height * 0.4 },
      { steps: 18, ms: 700 },
    )
    await expect(viewport(page)).toHaveAttribute('data-sketch-mode', 'true')
    await expect(page.getByTestId('sketch-toolbar')).toBeVisible()
  }

  /**
   * Where the sketch origin sits on screen (the canvas centre) and pixels per millimetre.
   *
   * @param {import('@playwright/test').Page} page
   */
  async function plane(page) {
    const view = await viewport(page).boundingBox()
    const distanceMm = Number(await viewport(page).getAttribute('data-camera-distance'))
    const pxPerMm = view.height / (2 * distanceMm * Math.tan((45 * Math.PI) / 360))
    const cx = view.x + view.width / 2
    const cy = view.y + view.height / 2
    /** Sketch-local millimetres to client pixels (screen y runs down, sketch y runs up). */
    const at = (xMm, yMm) => ({ x: cx + xMm * pxPerMm, y: cy - yMm * pxPerMm })
    return { at, pxPerMm, cx, cy }
  }

  /**
   * Draw a closed 60 x 40 mm outline with the Line tool, one drag per side, finishing on the
   * first corner. The third argument slows the drags down for a movie.
   *
   * @param {import('@playwright/test').Page} page
   * @param {{ steps?: number, ms?: number }} [pace]
   */
  async function drawClosedOutline(page, pace = { steps: 14, ms: 400 }) {
    const { at } = await plane(page)
    await page.getByTestId('sketch-tool-line').click()
    const corners = [at(-30, -20), at(30, -20), at(30, 20), at(-30, 20), at(-30, -20)]
    for (let i = 0; i < 4; i++) await humanDrag(page, corners[i], corners[i + 1], pace)
    await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '1')
    await expect(page.getByTestId('sketch-profile-p1')).toHaveAttribute('data-closed', 'true')
  }

  /**
   * Open the Extrude panel, make sure the method is Linear and type the height.
   *
   * @param {import('@playwright/test').Page} page
   * @param {string} heightMm
   * @param {boolean} slow type one key at a time, for a movie
   * @param {boolean} previewed wait for the see-through preview (there is none until an outline is closed)
   */
  async function typeHeight(page, heightMm, slow = false, previewed = true) {
    if ((await page.getByTestId('sketch-extrude-panel').count()) === 0) await page.getByTestId('sketch-extrude-toggle').click()
    await page.getByTestId('sketch-method-linear').click()
    const input = page.getByTestId('sketch-param-heightMm')
    await input.click()
    await input.fill('')
    if (slow) await input.pressSequentially(heightMm, { delay: 220 })
    else await input.fill(heightMm)
    await input.press('Enter')
    if (previewed) await expect(viewport(page)).toHaveAttribute('data-sketch-preview', 'ok')
  }

  /** @param {import('@playwright/test').Page} page */
  async function sceneBodies(page) {
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[data-testid="scene-bodies"] li')].every((node) => node.hasAttribute('data-body-volume')),
    )
    return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
      nodes.map((node) => ({
        id: node.getAttribute('data-body-id') ?? '',
        op: node.getAttribute('data-body-op') ?? '',
        bounds: (node.getAttribute('data-body-bounds') ?? '').split(',').map(Number),
        volume: Number(node.getAttribute('data-body-volume') ?? '0'),
      })),
    )
  }

  test('sketch-place', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await startMovie(page, 'sketch-place')
    await dropSketch(page)
    // Nothing is in the document yet, the camera looks straight down, and Done says why it is off.
    await expect(viewport(page)).toHaveAttribute('data-body-count', '0')
    await expect(viewport(page)).toHaveAttribute('data-camera-elevation', '90.00')
    await expect(page.getByTestId('sketch-done')).toBeDisabled()
    await page.waitForTimeout(1800)
    await endMovie(page, 'sketch-place')
  })

  test('toolbar still', async ({ page }) => {
    await openApp(page)
    await dropSketch(page)
    for (const tool of ['select', 'line', 'rect', 'circle', 'polygon']) {
      await expect(page.getByTestId(`sketch-tool-${tool}`)).toBeVisible()
    }
    await shot(page, 'sketch-toolbar.png', { locator: page.getByTestId('sketch-toolbar') })
  })

  test('sketch-draw-line', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await dropSketch(page)
    await startMovie(page, 'sketch-draw-line')
    const { at } = await plane(page)
    await page.getByTestId('sketch-tool-line').click()
    const corners = [at(-30, -20), at(30, -20), at(30, 20), at(-30, 20), at(-30, -20)]
    // First side by hand, so the live stroke can be asserted mid-drag: the preview follows the pointer.
    await page.mouse.move(corners[0].x, corners[0].y)
    await page.mouse.down()
    await page.mouse.move((corners[0].x + corners[1].x) / 2, corners[0].y, { steps: 10 })
    await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-drafting', 'true')
    await page.waitForTimeout(500)
    await page.mouse.move(corners[1].x, corners[1].y, { steps: 10 })
    await page.waitForTimeout(250)
    await page.mouse.up()
    for (let i = 1; i < 4; i++) await humanDrag(page, corners[i], corners[i + 1], { steps: 12, ms: 380 })
    await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '1')
    await expect(page.getByTestId('sketch-profile-p1')).toHaveAttribute('data-closed', 'true')
    await page.mouse.move(at(0, 0).x + 250, at(0, 0).y + 150, { steps: 8 })
    await page.waitForTimeout(1200)
    await endMovie(page, 'sketch-draw-line')
  })

  test('closed profile still', async ({ page }) => {
    await openApp(page)
    await dropSketch(page)
    await drawClosedOutline(page, { steps: 8, ms: 200 })
    await expect(page.getByTestId('sketch-status')).not.toContainText('Open outline')
    await shot(page, 'sketch-profile-closed.png', { locator: viewport(page) })
  })

  test('sketch-hole', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await dropSketch(page)
    await typeHeight(page, '10', false, false)
    await page.getByTestId('sketch-extrude-toggle').click()
    await startMovie(page, 'sketch-hole')
    const { at } = await plane(page)
    // An outer 80 x 50 mm rectangle, then a 15 mm radius circle from the same centre.
    await page.getByTestId('sketch-tool-rect').click()
    await humanDrag(page, at(-40, -25), at(40, 25), { steps: 14, ms: 450 })
    await page.getByTestId('sketch-tool-circle').click()
    await humanDrag(page, at(0, 0), at(15, 0), { steps: 12, ms: 400 })
    await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '2')
    // Select the inner circle by its rim and make it a Hole.
    await page.getByTestId('sketch-tool-select').click()
    await page.mouse.move(at(15, 0).x + 40, at(15, 0).y + 30, { steps: 6 })
    await page.mouse.click(at(15, 0).x, at(15, 0).y)
    await expect(page.getByTestId('sketch-selection-status')).toHaveText(/^Circle, Solid — (14|15|16)(\.\d+)? mm radius$/)
    await page.waitForTimeout(500)
    await page.getByTestId('sketch-role-toggle').click()
    await expect(page.getByTestId('sketch-selection-status')).toContainText('Hole')
    await expect(page.getByTestId('sketch-hole-badge')).toBeVisible()
    await expect(viewport(page)).toHaveAttribute('data-sketch-preview', 'ok')
    await page.waitForTimeout(1000)
    await page.getByTestId('sketch-done').click()
    await expect(viewport(page)).toHaveAttribute('data-sketch-mode', 'false')
    // Through-cavity check: the app exposes no vertex count, so compare the solid's measured
    // volume with the same block without the bore, and with the bore's full-depth volume
    // taken out. A blind pocket, or no hole at all, would miss that figure.
    const [body] = await sceneBodies(page)
    const [x0, y0, z0, x1, y1, z1] = body.bounds
    expect(z1 - z0).toBeCloseTo(10, 1)
    const block = (x1 - x0) * (y1 - y0) * (z1 - z0)
    const bore = Math.PI * 15 ** 2 * (z1 - z0)
    expect(body.volume).toBeLessThan(block - bore * 0.85)
    expect(Math.abs(body.volume - (block - bore)) / (block - bore)).toBeLessThan(0.08)
    await page.waitForTimeout(1200)
    await endMovie(page, 'sketch-hole')
  })

  test('sketch-extrude', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await dropSketch(page)
    await startMovie(page, 'sketch-extrude')
    await drawClosedOutline(page, { steps: 8, ms: 220 })
    await page.getByTestId('sketch-extrude-toggle').click()
    await expect(page.getByTestId('sketch-extrude-panel')).toBeVisible()
    await page.waitForTimeout(500)
    await typeHeight(page, '10', true)
    await page.waitForTimeout(1200)
    await page.getByTestId('sketch-done').click()
    await expect(viewport(page)).toHaveAttribute('data-sketch-mode', 'false')
    // The document gained one solid, 10 mm tall (the typed depth), resting on the plane.
    const bodies = await sceneBodies(page)
    expect(bodies).toHaveLength(1)
    expect(bodies[0].op).toBe('primitive.sketch')
    expect(bodies[0].bounds[2]).toBeCloseTo(0, 1)
    expect(bodies[0].bounds[5]).toBeCloseTo(10, 1)
    // Turn the view so the block reads as a solid.
    const view = await viewport(page).boundingBox()
    await humanDrag(
      page,
      { x: view.x + view.width * 0.7, y: view.y + view.height * 0.75 },
      { x: view.x + view.width * 0.6, y: view.y + view.height * 0.75 - 95 },
      { steps: 14, ms: 600 },
    )
    await page.waitForTimeout(800)
    await endMovie(page, 'sketch-extrude', { fps: 8, width: 600 })
  })

  test('extrude panel still', async ({ page }) => {
    await openApp(page)
    await dropSketch(page)
    await drawClosedOutline(page, { steps: 8, ms: 200 })
    await typeHeight(page, '10')
    await shot(page, 'sketch-extrude-panel.png', { locator: page.getByTestId('sketch-extrude-panel') })
  })

  test('slice panel still', async ({ page }) => {
    await openApp(page)
    await dropSketch(page)
    await drawClosedOutline(page, { steps: 8, ms: 200 })
    await page.getByTestId('sketch-slices-toggle').click()
    await page.getByTestId('sketch-slice-add').click()
    await expect(page.getByTestId('sketch-slice-row-1')).toHaveAttribute('data-active', 'true')
    await expect(page.getByTestId('sketch-slices-panel')).toBeVisible()
    await shot(page, 'sketch-slice-panel.png', { locator: page.getByTestId('sketch-slices-panel') })
  })

  test('result in 3d still', async ({ page }) => {
    await openApp(page)
    await dropSketch(page)
    await drawClosedOutline(page, { steps: 8, ms: 200 })
    await typeHeight(page, '10')
    await page.getByTestId('sketch-done').click()
    await expect(viewport(page)).toHaveAttribute('data-sketch-mode', 'false')
    const [body] = await sceneBodies(page)
    await expect(viewport(page)).toHaveAttribute('data-selected-id', body.id)
    const view = await viewport(page).boundingBox()
    await humanDrag(
      page,
      { x: view.x + view.width * 0.7, y: view.y + view.height * 0.75 },
      { x: view.x + view.width * 0.6, y: view.y + view.height * 0.75 - 95 },
      { steps: 10, ms: 300 },
    )
    await page.mouse.move(view.x + view.width * 0.7, view.y + view.height * 0.8)
    await page.mouse.wheel(0, -500)
    await expect(viewport(page)).toHaveAttribute('data-selected-id', body.id)
    await expect(page.getByTestId('inspector-sketch-method')).toHaveText('Linear')
    await shot(page, 'sketch-result-in-3d.png')
  })
})
