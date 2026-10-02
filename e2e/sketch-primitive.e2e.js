import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The Sketch primitive (TODO/sketch-001), driven against `/` — the running app.
 *
 * Every draw, drag, tap and drop here is **real input** through `page.mouse` (and, for
 * the touch pass, a trusted touch sequence), never a `PointerEvent` dispatched at the
 * canvas: ui-020's finding #1 — an invisible hit-stroke over the canvas that swallowed
 * every press — was invisible to synthetic events, because dispatching at the canvas
 * bypasses whatever really sits on top of it (TROUBLESHOOTING.md, 2026-09-24).
 *
 * Runs at all three reference viewports (the toolbar wraps and the panels become a bottom
 * sheet on a narrow viewport, which is not "same as desktop") with a snapshot at each, and
 * on every configured engine: it touches the canvas, the camera, the kernel and persistence.
 *
 * Geometry is deterministic because the editor aims the camera straight down at the
 * sketch's origin: the origin projects to the viewport's centre, and millimetres per pixel
 * follow from the camera distance and the 45° field of view.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'sketch-snapshots')
const FOV_DEG = 45

/** @param {import('@playwright/test').TestInfo} info */
const isPhone = (info) => info.project.name.endsWith('-phone')

/** @param {import('@playwright/test').Page} page */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (await rows.isVisible()) return
  await page.getByTestId('library-tab').click()
  await expect(rows).toBeVisible()
}

/**
 * Drag a Library row into the viewport with the real mouse and release at a fraction of it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} op
 * @param {number} fx
 * @param {number} fy
 */
async function dropRow(page, op, fx, fy) {
  await openLibrary(page)
  const row = await page.getByTestId(`library-row-${op}`).boundingBox()
  const view = await page.getByTestId('viewport').boundingBox()
  if (!row || !view) throw new Error(`no row ${op} or viewport`)
  await page.mouse.move(row.x + row.width / 2, row.y + row.height / 2)
  await page.mouse.down()
  await page.mouse.move(view.x + view.width * fx, view.y + view.height * fy - 30, { steps: 8 })
  await page.mouse.move(view.x + view.width * fx, view.y + view.height * fy, { steps: 4 })
  await page.mouse.up()
}

/**
 * The viewport centre in client pixels — where the sketch origin sits while the editor is
 * open — and millimetres per CSS pixel.
 *
 * @param {import('@playwright/test').Page} page
 */
async function sketchScreen(page) {
  const view = page.getByTestId('viewport')
  const box = await view.boundingBox()
  if (!box) throw new Error('no viewport')
  const distanceMm = Number(await view.getAttribute('data-camera-distance'))
  const mmPerPx = (2 * distanceMm * Math.tan((FOV_DEG * Math.PI) / 360)) / box.height
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2, pxPerMm: 1 / mmPerPx }
}

/**
 * A real mouse drag between two client points.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2
 */
async function mouseDrag(page, x1, y1, x2, y2) {
  await page.mouse.move(x1, y1)
  await page.mouse.down()
  await page.mouse.move(x2, y2, { steps: 10 })
  await page.mouse.up()
}

/**
 * Draw a circle of `radiusMm` about the sketch origin (offset by `dx`/`dy` mm).
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} radiusMm
 */
async function drawCircle(page, radiusMm, dxMm = 0, dyMm = 0) {
  await page.getByTestId('sketch-tool-circle').click()
  const { cx, cy, pxPerMm } = await sketchScreen(page)
  const x = cx + dxMm * pxPerMm
  const y = cy - dyMm * pxPerMm
  await mouseDrag(page, x, y, x + radiusMm * pxPerMm, y)
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

/**
 * Open a Sketch by dragging the Library row in, and wait for the editor.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openNewSketch(page, fx = 0.5, fy = 0.4) {
  await dropRow(page, 'primitive.sketch', fx, fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-mode', 'true')
  await expect(page.getByTestId('sketch-toolbar')).toBeVisible()
}

/**
 * Set the Extrude method and one numeric field.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} method
 * @param {Record<string, string>} [fields]
 */
async function extrude(page, method, fields = {}) {
  if ((await page.getByTestId('sketch-extrude-panel').count()) === 0) await page.getByTestId('sketch-extrude-toggle').click()
  await page.getByTestId(`sketch-method-${method}`).click()
  for (const [key, value] of Object.entries(fields)) {
    const input = page.getByTestId(`sketch-param-${key}`)
    await input.fill(value)
    await input.press('Enter')
  }
}

/**
 * The tube from the docs' Example 1: r20 solid, r15 hole, Linear 30 mm.
 *
 * @param {import('@playwright/test').Page} page
 */
async function drawTube(page) {
  await drawCircle(page, 20)
  await drawCircle(page, 15)
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '2')
  // Tap inside the smaller circle — the smallest closed outline under a tap wins.
  const { cx, cy, pxPerMm } = await sketchScreen(page)
  await page.mouse.click(cx + 3 * pxPerMm, cy + 2 * pxPerMm)
  await page.getByTestId('sketch-role-toggle').click()
  const hole = page.locator('[data-testid^="sketch-profile-"][data-role="hole"]')
  await expect(hole).toHaveCount(1)
  await extrude(page, 'linear', { heightMm: '30' })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-preview', 'ok')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
})

test('the nav chrome has no Sketch toggle — a sketch is a Library primitive (TODO/sketch-001)', async ({ page }) => {
  await expect(page.getByTestId('nav-sketch-toggle')).toHaveCount(0)
  await openLibrary(page)
  await expect(page.getByTestId('library-row-primitive.sketch')).toBeVisible()
  await openNewSketch(page)
  await expect(page.getByTestId('nav-sketch-toggle')).toHaveCount(0)
})

test('tube: drag Sketch in, two circles, inner Hole, Linear 30 mm, Done — one body with a bore', async ({ page }, info) => {
  await openNewSketch(page)
  // The editor looks straight down at the sketch plane, and nothing is in the document yet.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-camera-elevation', '90.00')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
  await expect(page.getByTestId('sketch-done')).toBeDisabled()
  await expect(page.getByTestId('sketch-status')).toContainText('closed solid outline')
  // Neither a Library drop nor Edit sketch auto-opens the phone Inspector sheet over the plane.
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-open', 'false')

  await drawTube(page)
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `${info.project.name}-editor.png`) })
  await page.getByTestId('sketch-done').click()

  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-mode', 'false')
  const bodies = await sceneBodies(page)
  expect(bodies).toHaveLength(1)
  expect(bodies[0].op).toBe('primitive.sketch')
  // 30 mm tall, resting on the plane, and a bore: π(20² − 15²)·30 within circle segmentation.
  expect(bodies[0].bounds[2]).toBeCloseTo(0, 1)
  expect(bodies[0].bounds[5]).toBeCloseTo(30, 1)
  // The radii were dragged by hand, so they carry ±1 px of pointer quantisation — at a
  // phone's ~2 px/mm that is several percent of R² − r². Exact volumes are the registry
  // spec's job; this asserts the bore is really there (a solid disc would be 2.3× this).
  const expected = Math.PI * (20 ** 2 - 15 ** 2) * 30
  expect(Math.abs(bodies[0].volume - expected) / expected).toBeLessThan(0.1)
  // It is the selection, and the Inspector shows its method and Edit sketch.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', bodies[0].id)
  if (isPhone(info) && (await page.getByTestId('inspector-sketch-body').isHidden())) await page.getByTestId('inspector-tab').click()
  await expect(page.getByTestId('inspector-sketch-method')).toHaveText('Linear')
  await expect(page.getByTestId('inspector-edit-sketch')).toBeEnabled()
  await page.screenshot({ path: join(SNAPSHOT_DIR, `${info.project.name}-tube.png`) })
})

test('a sketch body counts as a boolean operand: Subtract it from a cube, and the result is one body', async ({ page }, info) => {
  await dropRow(page, 'primitive.cuboid', 0.5, 0.4)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  const [cube] = await sceneBodies(page)
  await openNewSketch(page, 0.5, 0.4)
  await drawTube(page)
  await page.getByTestId('sketch-done').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  const sketchId = /** @type {string} */ (await page.getByTestId('viewport').getAttribute('data-selected-id'))

  // Cube first (the base), then the sketch, from the Inspector's Objects list.
  if (isPhone(info) && (await page.getByTestId('inspector').getAttribute('data-open')) !== 'true') {
    await page.getByTestId('inspector-tab').click()
  }
  const header = page.getByTestId('inspector-objects-header')
  const expandObjects = async () => {
    if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click()
  }
  await expandObjects()
  await page.getByTestId(`objects-row-${cube.id}`).click()
  // One selected again: the section folds back to its 1-selected default, so reopen it.
  await expandObjects()
  await page.getByTestId(`objects-check-${sketchId}`).click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await expect(page.getByTestId('operation-subtract')).toBeEnabled()
  await page.getByTestId('operation-subtract').click()

  const after = await sceneBodies(page)
  expect(after).toHaveLength(1)
  expect(after[0].op).toBe('boolean.subtract')
  expect(after[0].volume).toBeLessThan(cube.volume)
})

test('Edit sketch → Cancel leaves the document unchanged; Edit → height → Done is exactly one undo step', async ({ page }, info) => {
  await openNewSketch(page)
  await drawTube(page)
  await page.getByTestId('sketch-done').click()
  const [before] = await sceneBodies(page)
  const undoTitle = await page.getByTestId('undo-button').getAttribute('title')

  if (isPhone(info) && (await page.getByTestId('inspector-edit-sketch').isHidden())) await page.getByTestId('inspector-tab').click()
  await page.getByTestId('inspector-edit-sketch').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-mode', 'true')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-body', before.id)
  // Undo is off while the editor is open: the draft is not in the document yet.
  await expect(page.getByTestId('undo-button')).toBeDisabled()
  await extrude(page, 'linear', { heightMm: '45' })
  await page.getByTestId('sketch-cancel').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-mode', 'false')
  const [cancelled] = await sceneBodies(page)
  expect(cancelled.bounds).toEqual(before.bounds)
  expect(cancelled.volume).toBeCloseTo(before.volume, 3)
  await expect(page.getByTestId('undo-button')).toHaveAttribute('title', undoTitle ?? '')

  if (isPhone(info) && (await page.getByTestId('inspector-edit-sketch').isHidden())) await page.getByTestId('inspector-tab').click()
  await page.getByTestId('inspector-edit-sketch').click()
  await extrude(page, 'linear', { heightMm: '45' })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-preview', 'ok')
  await page.getByTestId('sketch-done').click()
  await expect.poll(async () => (await sceneBodies(page))[0].bounds[5]).toBeCloseTo(45, 1)
  // Same body, same id — an in-place edit, not a new one.
  expect((await sceneBodies(page))[0].id).toBe(before.id)

  await page.getByTestId('undo-button').click()
  await expect.poll(async () => (await sceneBodies(page))[0].bounds[5]).toBeCloseTo(30, 1)
  await page.getByTestId('redo-button').click()
  await expect.poll(async () => (await sceneBodies(page))[0].bounds[5]).toBeCloseTo(45, 1)
})

test('Cancel on a brand-new sketch leaves no body at all', async ({ page }) => {
  await openNewSketch(page)
  await drawCircle(page, 20)
  await page.getByTestId('sketch-cancel').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-mode', 'false')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
  await expect(page.getByTestId('undo-button')).toBeDisabled()
})

test('a three-slice Loft skins one solid through all the ribs', async ({ page }) => {
  await openNewSketch(page)
  await drawCircle(page, 30)
  await page.getByTestId('sketch-slices-toggle').click()
  for (const [index, zMm, radiusMm] of [
    [1, '100', 20],
    [2, '200', 10],
  ]) {
    await page.getByTestId('sketch-slice-add').click()
    await expect(page.getByTestId(`sketch-slice-row-${index}`)).toHaveAttribute('data-active', 'true')
    const z = page.getByTestId(`sketch-slice-z-${index}`)
    await z.fill(String(zMm))
    await z.press('Enter')
    await drawCircle(page, Number(radiusMm))
  }
  // Inactive slices draw ghosted while you work on one.
  await expect(page.locator('[data-testid^="sketch-ghost-"]')).toHaveCount(2)
  // Linear now refuses — it uses one slice — and says why.
  await expect(page.getByTestId('sketch-done')).toBeDisabled()
  await expect(page.getByTestId('sketch-status')).toContainText('remove the others or pick Loft')
  await page.getByTestId('sketch-slices-toggle').click()
  await extrude(page, 'loft')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-preview', 'ok')
  await page.getByTestId('sketch-done').click()

  const bodies = await sceneBodies(page)
  expect(bodies).toHaveLength(1)
  expect(bodies[0].bounds[2]).toBeCloseTo(0, 1)
  expect(bodies[0].bounds[5]).toBeCloseTo(200, 1)
  // Wider at the bottom rib than a cylinder of the top one, narrower than one of the base.
  expect(bodies[0].volume).toBeGreaterThan(Math.PI * 10 ** 2 * 200)
  expect(bodies[0].volume).toBeLessThan(Math.PI * 30 ** 2 * 200)
})

test('a press on a drawn outline still draws — the overlay never swallows the gesture (ui-020 finding #1)', async ({ page }) => {
  await openNewSketch(page)
  await drawCircle(page, 20)
  await page.getByTestId('sketch-tool-rect').click()
  const { cx, cy, pxPerMm } = await sketchScreen(page)
  // Press exactly on the circle's stroke at +X, drag out a rectangle.
  const onStrokeX = cx + 20 * pxPerMm
  await mouseDrag(page, onStrokeX, cy, onStrokeX + 15 * pxPerMm, cy - 10 * pxPerMm)
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '2')
})

test('the Sketch toolbar never meets the orientation gizmo, at any width (ui-020 finding #2)', async ({ page }) => {
  await openNewSketch(page)
  const bar = await page.getByTestId('sketch-toolbar').boundingBox()
  const gizmo = await page.getByTestId('orientation-gizmo').boundingBox()
  if (!bar || !gizmo) throw new Error('missing toolbar or gizmo')
  expect(bar.x + bar.width <= gizmo.x || gizmo.x + gizmo.width <= bar.x || bar.y + bar.height <= gizmo.y).toBe(true)
  // Done and Cancel are always on screen, with a panel open too (ui-046).
  await page.getByTestId('sketch-extrude-toggle').click()
  await expect(page.getByTestId('sketch-done')).toBeInViewport()
  await expect(page.getByTestId('sketch-cancel')).toBeInViewport()
})

test('the drawing area stays reachable: the resting editor keeps ≥ 69% of the canvas, and an open sheet never covers the sketch origin (ui-020 finding #3)', async ({ page }) => {
  await openNewSketch(page)
  /** The 10×10 hit grid ui-020 measured with, optionally narrowed to the middle band. */
  const reachable = (/** @type {{ x0: number, x1: number, y0: number, y1: number }} */ band) =>
    page.evaluate((b) => {
      const canvas = document.querySelector('[data-testid="viewport-canvas"]')
      if (!canvas) throw new Error('no canvas')
      const box = canvas.getBoundingClientRect()
      let hits = 0
      let total = 0
      for (let i = 0; i < 10; i += 1) {
        for (let j = 0; j < 10; j += 1) {
          const fx = (i + 0.5) / 10
          const fy = (j + 0.5) / 10
          if (fx < b.x0 || fx > b.x1 || fy < b.y0 || fy > b.y1) continue
          total += 1
          if (document.elementFromPoint(box.left + box.width * fx, box.top + box.height * fy) === canvas) hits += 1
        }
      }
      return hits / total
    }, band)
  expect(await reachable({ x0: 0, x1: 1, y0: 0, y1: 1 })).toBeGreaterThanOrEqual(0.69)
  for (const panel of ['sketch-extrude-toggle', 'sketch-slices-toggle']) {
    await page.getByTestId(panel).click()
    // The band around the view centre — where the sketch origin and its outlines are.
    expect(await reachable({ x0: 0.2, x1: 0.8, y0: 0.3, y1: 0.6 }), panel).toBe(1)
  }
})

test('touch only: a finger draws a circle and taps it, at the phone viewport', async ({ page, browserName }, info) => {
  test.skip(!isPhone(info), 'the touch pass runs at the phone reference')
  test.skip(browserName !== 'chromium', 'a trusted touch *drag* needs CDP Input.dispatchTouchEvent, which only Chromium exposes')
  const cdp = await page.context().newCDPSession(page)
  /** @param {[number, number][]} points */
  const touchDrag = async (points) => {
    const [first, ...rest] = points
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: first[0], y: first[1] }] })
    for (const [x, y] of rest) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  await openLibrary(page)
  const row = await page.getByTestId('library-row-primitive.sketch').boundingBox()
  const view = await page.getByTestId('viewport').boundingBox()
  if (!row || !view) throw new Error('no row or viewport')
  const to = [view.x + view.width / 2, view.y + view.height * 0.35]
  const from = [row.x + row.width / 2, row.y + row.height / 2]
  await touchDrag(Array.from({ length: 12 }, (_, i) => /** @type {[number, number]} */ ([from[0] + ((to[0] - from[0]) * i) / 11, from[1] + ((to[1] - from[1]) * i) / 11])))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-mode', 'true')
  await page.getByTestId('sketch-tool-circle').tap()
  const { cx, cy, pxPerMm } = await sketchScreen(page)
  await touchDrag(Array.from({ length: 10 }, (_, i) => /** @type {[number, number]} */ ([cx + (20 * pxPerMm * i) / 9, cy])))
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '1')
  await page.touchscreen.tap(cx + 2, cy + 2)
  await expect(page.getByTestId('viewport')).not.toHaveAttribute('data-sketch-selected', '')
  await page.getByTestId('sketch-role-toggle').tap()
  await expect(page.locator('[data-testid^="sketch-profile-"][data-role="hole"]')).toHaveCount(1)
})

test('an old project holding ui-020 sketch.line records opens, skipping each one with a warning (no migration)', async ({ page }) => {
  // The `<input type=file>` path on every engine — desktop Chromium would otherwise offer
  // the native picker, which nothing headless can drive (save-load-ui.e2e.js's FORCE_FALLBACK).
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
  })
  await page.reload()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  await page.getByTestId('file-menu-button').click()
  const chooserEvent = page.waitForEvent('filechooser')
  await page.getByTestId('file-open').click()
  const chooser = await chooserEvent
  await chooser.setFiles({
    name: 'old-sketch.ndjson',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      '{"id":"cube-1","op":"primitive.cuboid","name":"Cube 1","params":{"size":[40,40,40],"center":[0,0,20]}}\n' +
        '{"id":"sketch-1","op":"sketch.line","name":"Line 1","params":{"start":[0,0],"end":[30,40]}}\n' +
        '{"id":"sketch-2","op":"sketch.line","supersedes":"sketch-1","params":{"start":[0,0],"end":[60,80]}}\n',
    ),
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('save-status')).toContainText('skipped 2 steps (sketch-1, sketch-2)')
  await expect(page.getByTestId('save-status')).toContainText('redraw them in a Sketch primitive')
})
