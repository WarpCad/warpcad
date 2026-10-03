// SPDX-License-Identifier: AGPL-3.0-or-later
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

const BIG_SOLID = /^Circle, Solid — (19|20|21)(\.\d+)? mm radius$/

/**
 * Two circles to pick between: r20 at the origin, r12 centred 45 mm above it (stacked, not
 * side by side: the tablet reference's viewport column is only 390 px wide). Returns a point
 * on each stroke in client pixels.
 *
 * @param {import('@playwright/test').Page} page
 */
async function drawTwoCircles(page) {
  await drawCircle(page, 20)
  await drawCircle(page, 12, 0, 45)
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '2')
  const { cx, cy, pxPerMm } = await sketchScreen(page)
  return {
    big: { x: cx + 20 * pxPerMm, y: cy },
    small: { x: cx, y: cy - 57 * pxPerMm },
    empty: { x: cx + 40 * pxPerMm, y: cy + 30 * pxPerMm },
    pxPerMm,
    cx,
    cy,
  }
}

test('Select tool: a real click on an outline picks it, shows it and names it; a click on empty canvas clears (TODO/sketch-005)', async ({ page }, info) => {
  await openNewSketch(page)
  const pts = await drawTwoCircles(page)
  const bar = page.getByTestId('sketch-toolbar')
  // Select is the first tool in the group, an arrow, at least 44 px square.
  const tools = bar.getByRole('group', { name: 'Sketch tools' }).locator('button')
  await expect(tools.first()).toHaveAttribute('data-testid', 'sketch-tool-select')
  const box = await page.getByTestId('sketch-tool-select').boundingBox()
  expect(Math.min(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(43.5)
  await expect(page.getByTestId('sketch-delete')).toBeDisabled()

  await page.getByTestId('sketch-tool-select').click()
  await expect(bar).toHaveAttribute('data-tool', 'select')

  await page.mouse.click(pts.big.x, pts.big.y)
  await expect(page.getByTestId('sketch-profile-p1')).toHaveAttribute('data-selected', 'true')
  // The radius was dragged by hand, so it carries ±1 px of pointer quantisation.
  await expect(page.getByTestId('sketch-selection-status')).toHaveText(BIG_SOLID)
  await expect(page.getByTestId('sketch-delete')).toBeEnabled()
  // Selecting never opens the Inspector sheet by itself (ui-020 #3).
  if (isPhone(info)) await expect(page.getByTestId('inspector')).toHaveAttribute('data-open', 'false')

  await page.mouse.click(pts.small.x, pts.small.y)
  await expect(page.getByTestId('sketch-profile-p2')).toHaveAttribute('data-selected', 'true')
  await expect(page.getByTestId('sketch-profile-p1')).toHaveAttribute('data-selected', 'false')
  await expect(page.getByTestId('sketch-selection-status')).toHaveText(/^Circle, Solid — (11|12|13)(\.\d+)? mm radius$/)

  await page.mouse.click(pts.empty.x, pts.empty.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-selected', '')
  await expect(page.getByTestId('sketch-selection-status')).toHaveCount(0)
  await expect(page.getByTestId('sketch-delete')).toBeDisabled()
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.mouse.click(pts.big.x, pts.big.y)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `${info.project.name}-select.png`) })
})

test('Select tool never draws: a press-and-drag that starts on a stroke adds no outline (TODO/sketch-005)', async ({ page }) => {
  await openNewSketch(page)
  const pts = await drawTwoCircles(page)
  await page.getByTestId('sketch-tool-select').click()
  // The very drag that, with the Circle tool armed, drew a stray third circle in the hand repro.
  await mouseDrag(page, pts.big.x, pts.big.y, pts.big.x + 6, pts.big.y + 6)
  await mouseDrag(page, pts.big.x, pts.big.y, pts.big.x + 15 * pts.pxPerMm, pts.big.y - 10 * pts.pxPerMm)
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '2')
  await expect(page.getByTestId('sketch-draft')).toBeHidden()
  // The press itself picked what it landed on.
  await expect(page.getByTestId('sketch-profile-p1')).toHaveAttribute('data-selected', 'true')
  // And the camera did not move under the drag: orbit stays suspended in the editor.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-camera-elevation', '90.00')
})

test('a draw tool still picks on a tap and still draws on a drag that starts on a stroke (TODO/sketch-005)', async ({ page }) => {
  await openNewSketch(page)
  const pts = await drawTwoCircles(page)
  await page.getByTestId('sketch-tool-rect').click()
  await page.mouse.click(pts.small.x, pts.small.y)
  await expect(page.getByTestId('sketch-profile-p2')).toHaveAttribute('data-selected', 'true')
  await expect(page.getByTestId('sketch-selection-status')).toContainText('Circle, Solid')
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '2')
  await mouseDrag(page, pts.big.x, pts.big.y, pts.big.x + 15 * pts.pxPerMm, pts.big.y - 10 * pts.pxPerMm)
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '3')
})

test('an open Line chain is pickable by its stroke, and deletable (TODO/sketch-005)', async ({ page }) => {
  await openNewSketch(page)
  await page.getByTestId('sketch-tool-line').click()
  const { cx, cy, pxPerMm } = await sketchScreen(page)
  await mouseDrag(page, cx, cy, cx + 40 * pxPerMm, cy)
  await mouseDrag(page, cx + 40 * pxPerMm, cy, cx + 40 * pxPerMm, cy - 30 * pxPerMm)
  await page.getByTestId('sketch-tool-select').click()
  await page.mouse.click(cx + 20 * pxPerMm, cy + 2)
  await expect(page.getByTestId('sketch-selection-status')).toContainText('Open outline, Solid — 3 points')
  await page.getByTestId('sketch-delete').click()
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '0')
})

test('Hole then Delete: the toolbar Delete removes only the selected outline, and the keys do the same (TODO/sketch-005)', async ({ page }) => {
  await openNewSketch(page)
  const pts = await drawTwoCircles(page)
  await page.getByTestId('sketch-tool-select').click()
  await page.mouse.click(pts.big.x, pts.big.y)
  await page.getByTestId('sketch-role-toggle').click()
  await expect(page.getByTestId('sketch-selection-status')).toHaveText(/^Circle, Hole — (19|20|21)(\.\d+)? mm radius$/)
  await expect(page.getByTestId('sketch-hole-badge')).toBeVisible()
  await page.getByTestId('sketch-delete').click()
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '1')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-selected', '')
  await expect(page.getByTestId('sketch-delete')).toBeDisabled()

  // The keyboard path, on a pointer that has a keyboard: Delete, and Backspace.
  await page.mouse.click(pts.small.x, pts.small.y)
  await expect(page.getByTestId('sketch-delete')).toBeEnabled()
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '0')
  await drawCircle(page, 10)
  await page.getByTestId('sketch-tool-select').click()
  await page.mouse.click(pts.cx + 10 * pts.pxPerMm, pts.cy)
  await page.keyboard.press('Backspace')
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '0')
})

test('Delete in the editor never touches the body underneath (TODO/sketch-005)', async ({ page }, info) => {
  await dropRow(page, 'primitive.cuboid', 0.3, 0.4)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await openNewSketch(page, 0.7, 0.4)
  await drawCircle(page, 15)
  await page.getByTestId('sketch-tool-select').click()
  const { cx, cy, pxPerMm } = await sketchScreen(page)
  await page.mouse.click(cx + 15 * pxPerMm, cy)
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '0')
  // Pressing it again with nothing selected is a no-op, not a body delete.
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  void info
})

test('Edit sketch → Select, Delete → Cancel restores the body; → Done is exactly one undo step (TODO/sketch-005)', async ({ page }, info) => {
  await openNewSketch(page)
  await drawTube(page)
  await page.getByTestId('sketch-done').click()
  const [before] = await sceneBodies(page)
  const undoTitle = await page.getByTestId('undo-button').getAttribute('title')

  const reopen = async () => {
    if (isPhone(info) && (await page.getByTestId('inspector-edit-sketch').isHidden())) await page.getByTestId('inspector-tab').click()
    await page.getByTestId('inspector-edit-sketch').click()
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-mode', 'true')
  }
  const deleteTheHole = async () => {
    await page.getByTestId('sketch-tool-select').click()
    const { cx, cy, pxPerMm } = await sketchScreen(page)
    // The bore's rim at +X, 15 mm out — nearer than the 20 mm outer rim by more than the tolerance.
    await page.mouse.click(cx + 15 * pxPerMm, cy)
    await expect(page.getByTestId('sketch-selection-status')).toContainText('Hole')
    await page.getByTestId('sketch-delete').click()
    await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '1')
  }

  await reopen()
  await deleteTheHole()
  await page.getByTestId('sketch-cancel').click()
  const [cancelled] = await sceneBodies(page)
  expect(cancelled.volume).toBeCloseTo(before.volume, 3)
  await expect(page.getByTestId('undo-button')).toHaveAttribute('title', undoTitle ?? '')

  await reopen()
  await deleteTheHole()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-preview', 'ok')
  await page.getByTestId('sketch-done').click()
  // No bore any more: a solid disc, so the volume grew.
  await expect.poll(async () => (await sceneBodies(page))[0].volume).toBeGreaterThan(before.volume * 1.5)
  await page.getByTestId('undo-button').click()
  await expect.poll(async () => (await sceneBodies(page))[0].volume).toBeCloseTo(before.volume, 3)
})

test('desktop only: the outline under the mouse highlights before it is clicked (TODO/sketch-005)', async ({ page }, info) => {
  test.skip(info.project.name.endsWith('-phone') || info.project.name.endsWith('-tablet'), 'hover is a mouse affordance; the laptop project drives it')
  await openNewSketch(page)
  const pts = await drawTwoCircles(page)
  await page.getByTestId('sketch-tool-select').click()
  await page.mouse.move(pts.small.x - 40, pts.small.y - 40)
  await page.mouse.move(pts.small.x, pts.small.y + 2, { steps: 5 })
  await expect(page.getByTestId('sketch-profile-p2')).toHaveAttribute('data-hover', 'true')
  await expect(page.getByTestId('sketch-profile-p1')).toHaveAttribute('data-hover', 'false')
  // Hover is not selection.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-selected', '')
  await page.mouse.move(pts.empty.x, pts.empty.y, { steps: 5 })
  await expect(page.getByTestId('sketch-profile-p2')).toHaveAttribute('data-hover', 'false')
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

test('touch only: Select tool picks with a finger, and the toolbar Delete removes it — no keyboard (TODO/sketch-005)', async ({ page, browserName }, info) => {
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
  await touchDrag(Array.from({ length: 10 }, (_, i) => /** @type {[number, number]} */ ([cx - 60 * pxPerMm, cy + (12 * pxPerMm * i) / 9])))
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '2')

  await page.getByTestId('sketch-tool-select').tap()
  // A finger's press travels a pixel or three: land it on the first circle's rim.
  await page.touchscreen.tap(cx + 20 * pxPerMm + 2, cy + 3)
  await expect(page.getByTestId('sketch-profile-p1')).toHaveAttribute('data-selected', 'true')
  await expect(page.getByTestId('sketch-selection-status')).toHaveText(BIG_SOLID)
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-open', 'false')
  // A finger drag that starts on the rim, under Select, draws nothing.
  await touchDrag([[cx + 20 * pxPerMm, cy], [cx + 20 * pxPerMm + 10, cy + 8], [cx + 20 * pxPerMm + 40, cy + 30]])
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '2')
  await page.getByTestId('sketch-delete').tap()
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '1')
  await expect(page.getByTestId('sketch-delete')).toBeDisabled()
  // The Delete button is a full-size tap target and clear of the gizmo, the whole time.
  const del = await page.getByTestId('sketch-delete').boundingBox()
  expect(Math.min(del?.width ?? 0, del?.height ?? 0)).toBeGreaterThanOrEqual(43.5)
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

// --- vertex editing (TODO/sketch-002) ----------------------------------------------------

/**
 * Open the Inspector sheet if it is a closed bottom sheet (phone), run `body`, and close it
 * again so it never sits over the drawing plane for the next gesture.
 *
 * @param {import('@playwright/test').Page} page
 * @param {() => Promise<void>} body
 */
async function inInspector(page, body) {
  const inspector = page.getByTestId('inspector')
  const opened = (await inspector.getAttribute('data-open')) === 'false' && (await page.getByTestId('inspector-sketch-profile').isHidden())
  if (opened) await page.getByTestId('inspector-tab').click()
  await body()
  if (opened) await page.getByTestId('inspector-tab').click()
}

/**
 * An 80 × 50 mm rectangle about the origin, picked with Select and converted to an outline.
 * Big enough that every edge holds a midpoint dot (≥ 88 px) at the phone's ~2 px/mm.
 *
 * @param {import('@playwright/test').Page} page
 */
async function convertedRectangle(page) {
  await page.getByTestId('sketch-tool-rect').click()
  const { cx, cy, pxPerMm } = await sketchScreen(page)
  await mouseDrag(page, cx - 40 * pxPerMm, cy + 25 * pxPerMm, cx + 40 * pxPerMm, cy - 25 * pxPerMm)
  await page.getByTestId('sketch-tool-select').click()
  await page.mouse.click(cx + 10 * pxPerMm, cy + 25 * pxPerMm)
  await expect(page.getByTestId('sketch-selection-status')).toContainText('Rectangle, Solid')
  // No handles on a rectangle: it has no free points until it is converted.
  await expect(page.getByTestId('sketch-vertex-handles')).toHaveCount(0)
  await inInspector(page, async () => {
    await page.getByTestId('inspector-sketch-convert').click()
  })
  await expect(page.getByTestId('sketch-selection-status')).toHaveText('Closed outline, Solid — 4 points')
  await expect(page.getByTestId('sketch-vertex-handles')).toHaveAttribute('data-vertex-count', '4')
  await expect(page.getByTestId('sketch-vertex-handles')).toHaveAttribute('data-midpoint-count', '4')
  return { cx, cy, pxPerMm }
}

/** @param {import('@playwright/test').Page} page @param {string} testId */
async function centreOf(page, testId) {
  const box = await page.getByTestId(testId).boundingBox()
  if (!box) throw new Error(`no ${testId}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** A point handle's position in sketch millimetres, read off the dot. @param {import('@playwright/test').Page} page @param {number} index */
async function vertexMm(page, index) {
  const handle = page.getByTestId(`sketch-vertex-${index}`)
  return [Number(await handle.getAttribute('data-x-mm')), Number(await handle.getAttribute('data-y-mm'))]
}

/**
 * A wobbly human drag with the real mouse — not a straight line, and not starting on the
 * exact centre of what it grabs.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ x: number, y: number }} from @param {{ x: number, y: number }} to
 */
async function wobblyDrag(page, from, to) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 12; i += 1) {
    const t = i / 12
    const wobble = i < 12 ? Math.sin(i * 1.7) * 4 : 0
    await page.mouse.move(from.x + (to.x - from.x) * t + wobble, from.y + (to.y - from.y) * t - wobble)
  }
  await page.mouse.up()
}

test('vertex editing: Convert to outline, drag a corner, drag a midpoint to add a point — real mouse (TODO/sketch-002)', async ({ page }, info) => {
  await openNewSketch(page)
  const { pxPerMm } = await convertedRectangle(page)
  // toPointsMm's order: bottom-left, bottom-right, top-right, top-left.
  expect((await vertexMm(page, 2))[0]).toBeCloseTo(40, 0)

  // Move: grab the top-right dot 12 px off its centre (inside its 44 px target) and drag up 10 mm.
  const corner = await centreOf(page, 'sketch-vertex-2')
  await wobblyDrag(page, { x: corner.x - 12, y: corner.y + 8 }, { x: corner.x - 12, y: corner.y + 8 - 10 * pxPerMm })
  const moved = await vertexMm(page, 2)
  expect(Math.abs(moved[0] - 40)).toBeLessThan(1.5)
  expect(Math.abs(moved[1] - 35)).toBeLessThan(1.5)
  await expect(page.getByTestId('sketch-vertex-2')).toHaveAttribute('data-selected', 'true')
  await expect(page.getByTestId('sketch-selection-status')).toHaveText('Closed outline, Solid — 4 points · point 3 selected')
  // Still one outline: the press grabbed the point, it did not start a drawing.
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '1')

  // Add: drag the top edge's midpoint dot up. A new point appears there and follows.
  const mid = await centreOf(page, 'sketch-midpoint-2')
  await wobblyDrag(page, mid, { x: mid.x, y: mid.y - 15 * pxPerMm })
  await expect(page.getByTestId('sketch-vertex-handles')).toHaveAttribute('data-vertex-count', '5')
  await expect(page.getByTestId('sketch-selection-status')).toHaveText('Closed outline, Solid — 5 points · point 4 selected')
  const peak = await vertexMm(page, 3)
  expect(Math.abs(peak[0])).toBeLessThan(2)
  expect(Math.abs(peak[1] - 45)).toBeLessThan(2)

  // The Extrude preview follows the edit, and the Inspector shows the point's X/Y.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-preview', 'ok')
  await expect(page.getByTestId('inspector-sketch-vertex-y')).toHaveValue(/^4[3-7](\.\d+)?$/)
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `${info.project.name}-vertex-edit.png`) })
})

test('Delete vertex: a tapped point goes, down to 3 points, then it is refused with the reason (TODO/sketch-002)', async ({ page }, info) => {
  await openNewSketch(page)
  await convertedRectangle(page)
  // Add a fifth point so there is a 5 → 4 → 3 run.
  const mid = await centreOf(page, 'sketch-midpoint-0')
  await wobblyDrag(page, mid, { x: mid.x, y: mid.y + 30 })
  await expect(page.getByTestId('sketch-vertex-handles')).toHaveAttribute('data-vertex-count', '5')

  // Tap a point: it is picked; the toolbar Delete now deletes the point, and says so.
  const tapPoint = async (/** @type {number} */ index) => {
    const centre = await centreOf(page, `sketch-vertex-${index}`)
    await page.mouse.click(centre.x + 6, centre.y - 5)
    await expect(page.getByTestId(`sketch-vertex-${index}`)).toHaveAttribute('data-selected', 'true')
  }
  await tapPoint(0)
  await expect(page.getByTestId('sketch-delete')).toHaveAttribute('aria-label', 'Delete vertex')
  if (isPhone(info)) {
    // Touch has no Delete key, and the Inspector stays closed: the toolbar is the route.
    await page.getByTestId('sketch-delete').click()
  } else {
    await inInspector(page, async () => {
      await expect(page.getByTestId('inspector-sketch-vertex-x')).toBeVisible()
      await page.getByTestId('inspector-sketch-delete-vertex').click()
    })
  }
  await expect(page.getByTestId('sketch-vertex-handles')).toHaveAttribute('data-vertex-count', '4')
  // The outline is still there and still picked; only the point went.
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '1')
  await expect(page.getByTestId('sketch-selection-status')).toHaveText('Closed outline, Solid — 4 points')

  await tapPoint(1)
  if (isPhone(info)) await page.getByTestId('sketch-delete').click()
  else await page.keyboard.press('Delete')
  await expect(page.getByTestId('sketch-vertex-handles')).toHaveAttribute('data-vertex-count', '3')

  await tapPoint(0)
  await expect(page.getByTestId('sketch-delete')).toBeDisabled()
  await expect(page.getByTestId('sketch-delete')).toHaveAttribute('title', 'An outline needs at least 3 points')
  await inInspector(page, async () => {
    await expect(page.getByTestId('inspector-sketch-delete-vertex')).toBeDisabled()
    await expect(page.getByTestId('inspector-sketch-delete-vertex-reason')).toHaveText('An outline needs at least 3 points')
  })
  if (!isPhone(info)) {
    // The keys are refused too — and never fall through to deleting the whole outline.
    await page.keyboard.press('Backspace')
    await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '1')
    await expect(page.getByTestId('sketch-vertex-handles')).toHaveAttribute('data-vertex-count', '3')
  }
})

test('a press on a picked outline’s edge BETWEEN its dots still draws (ui-020 finding #1, with handles showing)', async ({ page }) => {
  await openNewSketch(page)
  const { cx, cy, pxPerMm } = await convertedRectangle(page)
  const corner = await centreOf(page, 'sketch-vertex-0')
  await page.getByTestId('sketch-tool-rect').click()
  // The dots are a Select-tool affordance: with a drawing tool armed they go, so even a press
  // right on a corner draws (the acceptance drive found dense dots covering a whole stroke).
  await expect(page.getByTestId('sketch-vertex-handles')).toHaveCount(0)
  await expect(page.getByTestId('sketch-selection-status')).toHaveText('Closed outline, Solid — 4 points')
  await mouseDrag(page, corner.x, corner.y, corner.x - 12 * pxPerMm, corner.y + 10 * pxPerMm)
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '2')
  // Tap inside the stray rectangle (a draw tool's tap picks), delete it, re-pick the outline.
  await page.mouse.click(corner.x - 6 * pxPerMm, corner.y + 5 * pxPerMm)
  await expect(page.getByTestId('sketch-selection-status')).toContainText('Rectangle, Solid')
  await page.getByTestId('sketch-delete').click()
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '1')
  await page.mouse.click(cx + 10 * pxPerMm, cy - 25 * pxPerMm)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-selected', 'p1')
  // A quarter of the way along the bottom edge: 20 mm from the corner and from the midpoint
  // dot — clear of both 44 px targets at every viewport.
  const x = cx - 20 * pxPerMm
  const y = cy + 25 * pxPerMm
  await mouseDrag(page, x, y, x + 15 * pxPerMm, y + 12 * pxPerMm)
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '2')
  // The converted outline's points did not move.
  await expect(page.getByTestId('sketch-profile-p1')).toBeVisible()
  // And a press between dots under Select draws nothing (sketch-005), and moves no point. The
  // other quarter of the bottom edge: the first spot is now also the new rectangle's corner.
  await page.getByTestId('sketch-tool-select').click()
  await page.mouse.click(cx + 10 * pxPerMm, cy - 25 * pxPerMm)
  const before = await vertexMm(page, 0)
  const x2 = cx + 20 * pxPerMm
  await mouseDrag(page, x2, y, x2 + 15 * pxPerMm, y + 12 * pxPerMm)
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '2')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-selected', 'p1')
  expect(await vertexMm(page, 0)).toEqual(before)
})

test('Simplify thins a converted circle, and Cancel throws every point edit away (TODO/sketch-002)', async ({ page }) => {
  await openNewSketch(page)
  await drawCircle(page, 40)
  await page.getByTestId('sketch-tool-select').click()
  const { cx, cy, pxPerMm } = await sketchScreen(page)
  await page.mouse.click(cx + 40 * pxPerMm, cy)
  await inInspector(page, async () => {
    await page.getByTestId('inspector-sketch-convert').click()
    await expect(page.getByTestId('sketch-vertex-handles')).toHaveAttribute('data-vertex-count', '32')
    const tolerance = page.getByTestId('inspector-sketch-simplify-tolerance')
    await tolerance.fill('2')
    await page.getByTestId('inspector-sketch-simplify').click()
    await expect(page.getByTestId('sketch-selection-status')).toHaveText(/^Closed outline, Solid — ([6-9]|1[0-6]) points$/)
    await tolerance.fill('500')
    await page.getByTestId('inspector-sketch-simplify').click()
    await expect(page.getByTestId('inspector-sketch-simplify-error')).toContainText('fewer than 3 points')
  })
  await page.getByTestId('sketch-cancel').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
})

test('desktop only: the point under the mouse highlights before it is pressed (TODO/sketch-002)', async ({ page }, info) => {
  test.skip(info.project.name.endsWith('-phone') || info.project.name.endsWith('-tablet'), 'hover is a mouse affordance; the laptop project drives it')
  await openNewSketch(page)
  await convertedRectangle(page)
  const corner = await centreOf(page, 'sketch-vertex-1')
  await page.mouse.move(corner.x - 80, corner.y - 60)
  await page.mouse.move(corner.x + 9, corner.y - 7, { steps: 6 })
  await expect(page.getByTestId('sketch-vertex-1')).toHaveAttribute('data-hover', 'true')
  await expect(page.getByTestId('sketch-vertex-0')).toHaveAttribute('data-hover', 'false')
  await expect(page.getByTestId('sketch-vertex-1')).toHaveAttribute('data-selected', 'false')
})

test('touch only: a finger drags a point and a midpoint dot, no modifier (TODO/sketch-002)', async ({ page, browserName }, info) => {
  test.skip(!isPhone(info), 'the touch pass runs at the phone reference')
  test.skip(browserName !== 'chromium', 'a trusted touch *drag* needs CDP Input.dispatchTouchEvent, which only Chromium exposes')
  await openNewSketch(page)
  const { pxPerMm } = await convertedRectangle(page)
  const cdp = await page.context().newCDPSession(page)
  /** @param {{ x: number, y: number }} from @param {{ x: number, y: number }} to */
  const fingerDrag = async (from, to) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] })
    for (let i = 1; i <= 10; i += 1) {
      const t = i / 10
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * t + (i % 2) * 2, y: from.y + (to.y - from.y) * t }] })
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  const corner = await centreOf(page, 'sketch-vertex-3')
  // A fingertip lands off-centre: 15 px away, still inside the 44 px target.
  await fingerDrag({ x: corner.x + 10, y: corner.y + 11 }, { x: corner.x + 10, y: corner.y + 11 - 10 * pxPerMm })
  const moved = await vertexMm(page, 3)
  expect(Math.abs(moved[1] - 35)).toBeLessThan(2)
  const mid = await centreOf(page, 'sketch-midpoint-0')
  await fingerDrag(mid, { x: mid.x, y: mid.y + 10 * pxPerMm })
  await expect(page.getByTestId('sketch-vertex-handles')).toHaveAttribute('data-vertex-count', '5')
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '1')
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-open', 'false')
})

// --- the continuous Line tool (TODO/sketch-006) -----------------------------------------

/**
 * Click the sketch-local mm points with the real mouse, hover first so the rubber band is
 * driven the way a person would: move there, then press.
 *
 * @param {import('@playwright/test').Page} page
 * @param {[number, number][]} pointsMm
 */
async function clickPoints(page, pointsMm) {
  const { cx, cy, pxPerMm } = await sketchScreen(page)
  for (const [x, y] of pointsMm) {
    await page.mouse.move(cx + x * pxPerMm, cy - y * pxPerMm, { steps: 4 })
    await page.mouse.down()
    await page.mouse.up()
  }
}

/** @param {import('@playwright/test').Page} page */
async function armLine(page) {
  await page.getByTestId('sketch-tool-line').click()
}

test('Line is continuous: click three points and click the first again — a closed triangle that extrudes via Done (TODO/sketch-006)', async ({ page }, info) => {
  await openNewSketch(page)
  await armLine(page)
  await expect(page.getByTestId('sketch-chain-hint')).toBeHidden()
  await clickPoints(page, [[-30, -20], [30, -20], [0, 25]])
  // The next segment is already live from the last vertex: the hint, Finish and Undo show.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-chain-points', '3')
  await expect(page.getByTestId('sketch-chain-hint')).toContainText('Click to add a point')
  await expect(page.getByTestId('sketch-line-finish')).toBeVisible()
  await expect(page.getByTestId('sketch-line-undo')).toBeVisible()
  // The rubber band follows the pointer while it hovers (mouse only; touch has no hover).
  if (!isPhone(info) && !info.project.name.endsWith('-tablet')) {
    const { cx, cy, pxPerMm } = await sketchScreen(page)
    await page.mouse.move(cx + 40 * pxPerMm, cy + 10 * pxPerMm, { steps: 4 })
    await expect(page.getByTestId('sketch-draft')).toBeVisible()
    await expect(page.getByTestId('sketch-chain-length')).toContainText('mm')
    // Near the first vertex it pulses: that click will close the outline.
    await page.mouse.move(cx - 30 * pxPerMm + 3, cy + 20 * pxPerMm - 2, { steps: 4 })
    await expect(page.getByTestId('sketch-chain-first')).toHaveAttribute('data-close-near', 'true')
  }
  await expect(page.getByTestId('sketch-done')).toBeDisabled()
  await clickPoints(page, [[-30, -20]])
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-chain-points', '0')
  await expect(page.getByTestId('sketch-line-finish')).toBeHidden()
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '1')
  await expect(page.locator('[data-testid^="sketch-profile-"][data-closed="true"]')).toHaveCount(1)
  // A finished chain is not auto-selected (ui-020 finding #3).
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-selected', '')
  await extrude(page, 'linear', { heightMm: '10' })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-preview', 'ok')
  await page.getByTestId('sketch-done').click()
  const bodies = await sceneBodies(page)
  expect(bodies).toHaveLength(1)
  // The triangle is 60 x 45 mm: 1350 mm2 x 10 mm.
  expect(bodies[0].volume).toBeGreaterThan(1350 * 10 * 0.95)
  expect(bodies[0].volume).toBeLessThan(1350 * 10 * 1.05)
})

test('Line: the Finish button leaves an open chain, which is flagged as not part of the solid (TODO/sketch-006)', async ({ page }) => {
  await openNewSketch(page)
  await armLine(page)
  await clickPoints(page, [[-20, 0], [20, 0], [20, 25]])
  await page.getByTestId('sketch-line-finish').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-chain-points', '0')
  await expect(page.getByTestId('sketch-line-finish')).toBeHidden()
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '1')
  await expect(page.locator('[data-testid^="sketch-profile-"][data-closed="false"]')).toHaveCount(1)
  // Amber, like every open outline: not part of the solid, so Done stays off.
  await expect(page.locator('[data-testid^="sketch-profile-"]').first()).toHaveClass(/sketch__path--open/)
  await expect(page.getByTestId('sketch-done')).toBeDisabled()
  // The next click starts a new chain, not an extension of the finished one.
  await clickPoints(page, [[-20, -20], [20, -20]])
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '2')
})

test('Line: Backspace removes the last point, and the only segment discards the chain (TODO/sketch-006)', async ({ page }) => {
  await openNewSketch(page)
  await armLine(page)
  await clickPoints(page, [[-20, 0], [20, 0], [20, 25]])
  await page.keyboard.press('Backspace')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-chain-points', '2')
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '1')
  await page.getByTestId('sketch-line-undo').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-chain-points', '0')
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '0')
})

test('Line: Esc finishes the chain, and Esc again straight after cancels it (TODO/sketch-006)', async ({ page }) => {
  await openNewSketch(page)
  await armLine(page)
  await clickPoints(page, [[-20, 0], [20, 0], [20, 25]])
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-chain-points', '0')
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '1')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '0')
  // Enter finishes too.
  await clickPoints(page, [[-20, 0], [20, 0]])
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-chain-points', '0')
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '1')
})

test('Line: a double-click on the last point finishes, and switching tool ends the chain (TODO/sketch-006)', async ({ page }) => {
  await openNewSketch(page)
  await armLine(page)
  const { cx, cy, pxPerMm } = await sketchScreen(page)
  await clickPoints(page, [[-20, 0], [20, 0]])
  await page.mouse.dblclick(cx + 20 * pxPerMm, cy - 25 * pxPerMm)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-chain-points', '0')
  await expect(page.locator('[data-testid^="sketch-profile-"]')).toHaveCount(1)
  await expect(page.locator('[data-testid^="sketch-profile-"]').first()).toHaveAttribute('data-closed', 'false')
  await clickPoints(page, [[-20, -20], [20, -20]])
  await page.getByTestId('sketch-tool-rect').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-chain-points', '0')
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '2')
})

test('Line: one drag still draws one segment and starts the chain (TODO/sketch-006)', async ({ page }) => {
  await openNewSketch(page)
  await armLine(page)
  const { cx, cy, pxPerMm } = await sketchScreen(page)
  await mouseDrag(page, cx - 30 * pxPerMm, cy, cx + 30 * pxPerMm, cy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-chain-points', '2')
  await mouseDrag(page, cx + 30 * pxPerMm, cy, cx + 30 * pxPerMm, cy - 40 * pxPerMm)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-chain-points', '3')
  // A press on the live chain's own stroke still draws, not selects (ui-020 finding #1).
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-selected', '')
})

test('touch only: tap-tap-tap-tap draws a triangle with no hover and no keyboard; Finish is a 44 px button (TODO/sketch-006)', async ({ page, browserName }, info) => {
  test.skip(!isPhone(info), 'the touch pass runs at the phone reference')
  test.skip(browserName !== 'chromium', 'a trusted touch needs CDP Input.dispatchTouchEvent, which only Chromium exposes')
  const cdp = await page.context().newCDPSession(page)
  /** @param {number} x @param {number} y */
  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  await openNewSketch(page)
  await page.getByTestId('sketch-tool-line').tap()
  const { cx, cy, pxPerMm } = await sketchScreen(page)
  await tap(cx - 30 * pxPerMm, cy + 20 * pxPerMm)
  await tap(cx + 30 * pxPerMm, cy + 20 * pxPerMm)
  await tap(cx, cy - 25 * pxPerMm)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-chain-points', '3')
  const finish = await page.getByTestId('sketch-line-finish').boundingBox()
  const undo = await page.getByTestId('sketch-line-undo').boundingBox()
  expect(finish && finish.height).toBeGreaterThanOrEqual(44)
  expect(finish && finish.width).toBeGreaterThanOrEqual(44)
  expect(undo && undo.height).toBeGreaterThanOrEqual(44)
  // The toolbar still clears the orientation gizmo (ui-043).
  const toolbar = await page.getByTestId('sketch-toolbar').boundingBox()
  const gizmo = await page.getByTestId('orientation-gizmo').boundingBox()
  if (toolbar && gizmo) {
    const overlap = toolbar.x < gizmo.x + gizmo.width && toolbar.x + toolbar.width > gizmo.x && toolbar.y < gizmo.y + gizmo.height && toolbar.y + toolbar.height > gizmo.y
    expect(overlap).toBe(false)
  }
  await tap(cx - 30 * pxPerMm, cy + 20 * pxPerMm)
  await expect(page.locator('[data-testid^="sketch-profile-"][data-closed="true"]')).toHaveCount(1)
  // Open chain + Finish with a finger (a human's pause: a tap right after a close is the
  // tail of a double-tap and is swallowed).
  await page.waitForTimeout(600)
  await tap(cx - 30 * pxPerMm, cy - 40 * pxPerMm)
  await tap(cx + 30 * pxPerMm, cy - 40 * pxPerMm)
  await page.getByTestId('sketch-line-finish').tap()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-chain-points', '0')
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '2')
})
