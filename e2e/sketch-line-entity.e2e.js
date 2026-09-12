import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Sketch mode and its one entity type (TODO/ui-020), driven against `/` — the
 * running app, not a Storybook iframe.
 *
 * Runs the full 3 viewport × 3 engine matrix from `playwright.config.js`:
 *
 * - **Viewports**, because the Sketch toolbar is a new mode-gated control and
 *   this is the first gesture in the app with no keyboard-or-modifier
 *   alternative — if it collided with something at phone width there would be
 *   no fallback path to the feature at all (section 7's Q16).
 * - **Engines**, because entering sketch mode changes camera state and the
 *   stroke overlay is a new render path projected from that camera every frame
 *   (CLAUDE.md Browser Support).
 *
 * The load-bearing cases here are the two the acceptance scenario turns on: a
 * drag actually commits **one** line where it was dragged, and exiting sketch
 * mode does not take it away again.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'sketch-snapshots')

/**
 * Drag inside the viewport, in viewport-relative fractions.
 *
 * Dispatches real `PointerEvent`s rather than using Playwright's mouse API, for
 * the same reason `primitive-placement.e2e.js` does: the same helper then drives
 * `pointerType: 'touch'` on engines whose touch emulation Playwright does not
 * implement (Firefox), and the drag lands at an exact fraction of the canvas
 * regardless of where the panels sit.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} options
 * @param {number} options.fromX
 * @param {number} options.fromY
 * @param {number} options.toX
 * @param {number} options.toY
 * @param {'mouse' | 'touch'} [options.pointerType]
 * @param {number} [options.steps] Intermediate moves — a real drag is not one jump.
 */
async function dragInViewport(page, { fromX, fromY, toX, toY, pointerType = 'mouse', steps = 4 }) {
  await page.evaluate(
    ({ fromX, fromY, toX, toY, pointerType, steps }) => {
      const canvas = document.querySelector('[data-testid="viewport-canvas"]')
      if (!canvas) throw new Error('no canvas')
      const box = canvas.getBoundingClientRect()
      const startX = box.left + box.width * fromX
      const startY = box.top + box.height * fromY
      const endX = box.left + box.width * toX
      const endY = box.top + box.height * toY

      const fire = (target, type, x, y) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 11,
            pointerType,
            isPrimary: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        )

      fire(canvas, 'pointerdown', startX, startY)
      for (let step = 1; step <= steps; step += 1) {
        const t = step / steps
        fire(canvas, 'pointermove', startX + (endX - startX) * t, startY + (endY - startY) * t)
      }
      fire(canvas, 'pointerup', endX, endY)
    },
    { fromX, fromY, toX, toY, pointerType, steps },
  )
  await page.waitForTimeout(120)
}

/**
 * Press and release at one point without moving — the degenerate gesture.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} fx
 * @param {number} fy
 */
async function tapViewport(page, fx, fy) {
  await page.evaluate(
    ({ fx, fy }) => {
      const canvas = document.querySelector('[data-testid="viewport-canvas"]')
      if (!canvas) throw new Error('no canvas')
      const box = canvas.getBoundingClientRect()
      const x = box.left + box.width * fx
      const y = box.top + box.height * fy
      for (const type of ['pointerdown', 'pointerup']) {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 12,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        )
      }
    },
    { fx, fy },
  )
  await page.waitForTimeout(80)
}

/**
 * Drag one endpoint handle by a pixel offset.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'start' | 'end'} which
 * @param {number} dx
 * @param {number} dy
 */
async function dragHandle(page, which, dx, dy) {
  await page.evaluate(
    ({ which, dx, dy }) => {
      const handle = document.querySelector(`[data-testid="sketch-handle-${which}"]`)
      if (!handle) throw new Error(`no ${which} handle`)
      const box = handle.getBoundingClientRect()
      const x = box.left + box.width / 2
      const y = box.top + box.height / 2
      const fire = (type, px, py) =>
        handle.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 13,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            clientX: px,
            clientY: py,
            bubbles: true,
            cancelable: true,
          }),
        )
      fire('pointerdown', x, y)
      for (const t of [0.5, 1]) fire('pointermove', x + dx * t, y + dy * t)
      fire('pointerup', x + dx, y + dy)
    },
    { which, dx, dy },
  )
  await page.waitForTimeout(120)
}

/** @param {import('@playwright/test').Page} page */
async function enterSketch(page) {
  await page.getByTestId('nav-sketch-toggle').click()
  await expect(page.getByTestId('sketch-toolbar')).toBeVisible()
  // The camera readout is written from the render callback, so it lands on the
  // next animation frame rather than synchronously with the click. Waiting for
  // the locked elevation here is both the settle point and the assertion that
  // entering sketch mode really did snap the camera.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-camera-elevation', '90.00')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('the Sketch toggle is reachable from the root view and locks the camera to the working plane', async ({
  page,
}, testInfo) => {
  const viewport = page.getByTestId('viewport')
  // The camera starts at the isometric home view, which is emphatically not a
  // straight-on view of the working plane — so "the view changed" below is a
  // real change, not a coincidence of the default.
  const elevationBefore = Number(await viewport.getAttribute('data-camera-elevation'))
  expect(Math.abs(elevationBefore - 90)).toBeGreaterThan(10)
  await expect(page.getByTestId('sketch-toolbar')).toHaveCount(0)

  await enterSketch(page)

  await expect(viewport).toHaveAttribute('data-sketch-mode', 'true')
  // Straight down at the Z=0 plane: the `top` preset, and the same plane the
  // pointer projects onto. (`enterSketch` already waited for this; asserting it
  // again here is what makes this test's own claim explicit rather than a
  // side effect of the helper.)
  await expect(viewport).toHaveAttribute('data-camera-elevation', '90.00')
  await expect(viewport).toHaveAttribute('data-camera-azimuth', '-90.00')
  await expect(page.getByTestId('sketch-tool-line')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('sketch-exit')).toBeVisible()

  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({
    path: join(SNAPSHOT_DIR, `sketch-mode-${testInfo.project.name}.png`),
  })
})

test('sketch mode suspends orbit and the controls that would break the camera lock', async ({
  page,
}) => {
  const viewport = page.getByTestId('viewport')
  await enterSketch(page)
  const azimuth = await viewport.getAttribute('data-camera-azimuth')
  const elevation = await viewport.getAttribute('data-camera-elevation')

  // The drag-mode row is gone for the duration — it selects between three
  // things none of which is happening — while the orientation gizmo stays on
  // screen as a readout with its snap buttons disabled.
  await expect(page.getByTestId('nav-mode-orbit')).toHaveCount(0)
  await expect(page.getByTestId('nav-mode-pan')).toHaveCount(0)
  await expect(page.getByTestId('orientation-gizmo')).toBeVisible()
  await expect(page.getByTestId('gizmo-view-front')).toBeDisabled()
  // …and the Operations toolbar with it: its buttons act on selected solids,
  // and sketch mode selects only sketch geometry.
  await expect(page.getByTestId('operations-toolbar')).toHaveCount(0)

  // A drag draws rather than orbiting: the camera must not have moved at all.
  await dragInViewport(page, { fromX: 0.35, fromY: 0.4, toX: 0.6, toY: 0.62 })
  await expect(viewport).toHaveAttribute('data-camera-azimuth', azimuth ?? '')
  await expect(viewport).toHaveAttribute('data-camera-elevation', elevation ?? '')

  // Zoom stays reachable — you still have to get around the plane you draw on.
  // Polled rather than read once: the readout is written from the render
  // callback, so it lands on the next frame, not synchronously with the click.
  const distance = Number(await viewport.getAttribute('data-camera-distance'))
  await page.getByTestId('nav-zoom-in').click()
  await expect
    .poll(async () => Number(await viewport.getAttribute('data-camera-distance')))
    .toBeLessThan(distance)
})

test('a drag commits one line entity, styled unlike a 3D body', async ({ page }, testInfo) => {
  const viewport = page.getByTestId('viewport')
  await enterSketch(page)
  await dragInViewport(page, { fromX: 0.35, fromY: 0.4, toX: 0.62, toY: 0.6 })

  await expect(viewport).toHaveAttribute('data-sketch-count', '1')
  // Exactly one, and it is not a body: a sketch line never reaches the kernel,
  // so it must not show up as placed geometry.
  await expect(viewport).toHaveAttribute('data-body-count', '0')
  const line = page.locator('[data-testid^="sketch-line-"]')
  await expect(line).toHaveCount(1)
  await expect(line).toBeVisible()

  // A style check, not a pixel snapshot: a thin bright single-colour stroke,
  // with no fill — deliberately unlike a shaded solid.
  const style = await line.evaluate((element) => {
    const computed = getComputedStyle(element)
    return { stroke: computed.stroke, fill: computed.fill, width: computed.strokeWidth }
  })
  expect(style.fill).toMatch(/none|rgba\(0, 0, 0, 0\)/)
  expect(style.stroke).not.toBe('none')
  expect(Number.parseFloat(style.width)).toBeGreaterThan(0)
  expect(Number.parseFloat(style.width)).toBeLessThan(6)

  // It has real length in millimetres, and it lands where it was dragged rather
  // than at the origin.
  expect(Number(await line.getAttribute('data-length-mm'))).toBeGreaterThan(1)

  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({
    path: join(SNAPSHOT_DIR, `sketch-line-${testInfo.project.name}.png`),
  })
})

test('a zero-length release commits nothing', async ({ page }) => {
  const viewport = page.getByTestId('viewport')
  await enterSketch(page)
  await tapViewport(page, 0.5, 0.5)

  await expect(viewport).toHaveAttribute('data-sketch-count', '0')
  await expect(page.locator('[data-testid^="sketch-line-"]')).toHaveCount(0)
  // And the app is still usable afterwards — the degenerate gesture must not
  // leave a half-started drag stuck on.
  await dragInViewport(page, { fromX: 0.3, fromY: 0.35, toX: 0.55, toY: 0.55 })
  await expect(viewport).toHaveAttribute('data-sketch-count', '1')
})

test('clicking the line shows its own Inspector fields, with no 3D gizmo', async ({ page }) => {
  const viewport = page.getByTestId('viewport')
  await enterSketch(page)
  await dragInViewport(page, { fromX: 0.3, fromY: 0.35, toX: 0.65, toY: 0.62 })

  // Committing a line deliberately leaves it unselected (see `endSketchDrag`),
  // so the selection below is unambiguously the click's doing.
  await expect(viewport).toHaveAttribute('data-selected-sketch-id', '')

  const line = page.locator('[data-testid^="sketch-line-"]').first()
  const box = await line.boundingBox()
  if (!box) throw new Error('the drawn line has no box')
  await tapViewportPoint(page, box.x + box.width / 2, box.y + box.height / 2)

  await expect(page.getByTestId('inspector')).toHaveAttribute('data-state', 'sketch')
  await expect(page.getByTestId('inspector-sketch')).toBeVisible()
  for (const field of [
    'inspector-sketch-start-x',
    'inspector-sketch-start-y',
    'inspector-sketch-end-x',
    'inspector-sketch-end-y',
    'inspector-sketch-length',
  ]) {
    await expect(page.getByTestId(field)).toBeVisible()
  }
  // The 2D affordance, and the explicit absence of the 3D one (section 7's Q14).
  await expect(page.getByTestId('sketch-handle-start')).toBeVisible()
  await expect(page.getByTestId('sketch-handle-end')).toBeVisible()
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(0)
  // A line is not a boolean operand: the body selection count stays at zero.
  await expect(viewport).toHaveAttribute('data-selected-count', '0')
})

test('dragging an endpoint handle updates the Inspector, and typing does the same thing', async ({
  page,
}) => {
  await enterSketch(page)
  await dragInViewport(page, { fromX: 0.3, fromY: 0.35, toX: 0.65, toY: 0.62 })
  const line = page.locator('[data-testid^="sketch-line-"]').first()
  const box = await line.boundingBox()
  if (!box) throw new Error('the drawn line has no box')
  await tapViewportPoint(page, box.x + box.width / 2, box.y + box.height / 2)

  const lengthField = page.getByTestId('inspector-sketch-length')
  const before = Number.parseFloat((await lengthField.inputValue()).replace(/[^\d.-]/g, ''))
  expect(before).toBeGreaterThan(0)

  await dragHandle(page, 'end', 60, 40)
  const after = Number.parseFloat((await lengthField.inputValue()).replace(/[^\d.-]/g, ''))
  expect(after).not.toBeCloseTo(before, 2)
  // One entity still, not a second one: the endpoint edit supersedes rather
  // than appending a new line.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-count', '1')

  // The other half of the sync contract: typing a coordinate is the same edit.
  const startX = page.getByTestId('inspector-sketch-start-x')
  await startX.click()
  await startX.fill('-40')
  await startX.press('Enter')
  await expect(startX).toHaveValue(/-40/)
  const typed = Number.parseFloat((await lengthField.inputValue()).replace(/[^\d.-]/g, ''))
  expect(typed).not.toBeCloseTo(after, 2)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-count', '1')
})

test('exiting returns free orbit and keeps the line', async ({ page }) => {
  const viewport = page.getByTestId('viewport')
  await enterSketch(page)
  await dragInViewport(page, { fromX: 0.3, fromY: 0.35, toX: 0.65, toY: 0.62 })
  await expect(viewport).toHaveAttribute('data-sketch-count', '1')

  await page.getByTestId('sketch-exit').click()

  await expect(page.getByTestId('sketch-toolbar')).toHaveCount(0)
  await expect(viewport).toHaveAttribute('data-sketch-mode', 'false')
  // Everything sketch mode borrowed comes straight back.
  await expect(page.getByTestId('nav-mode-orbit')).toBeVisible()
  await expect(page.getByTestId('nav-mode-orbit')).toBeEnabled()
  await expect(page.getByTestId('operations-toolbar')).toBeVisible()
  await expect(page.getByTestId('gizmo-view-front')).toBeEnabled()

  // The line survives exiting — it is document data, not mode decoration.
  await expect(viewport).toHaveAttribute('data-sketch-count', '1')
  await expect(page.locator('[data-testid^="sketch-line-"]')).toHaveCount(1)

  // And a drag orbits again rather than drawing.
  const azimuth = await viewport.getAttribute('data-camera-azimuth')
  await dragInViewport(page, { fromX: 0.4, fromY: 0.5, toX: 0.62, toY: 0.5 })
  await expect(viewport).not.toHaveAttribute('data-camera-azimuth', azimuth ?? '')
  await expect(viewport).toHaveAttribute('data-sketch-count', '1')
})

test('a touch drag draws with no modifier key, and the toolbar fits the viewport', async ({
  page,
}, testInfo) => {
  const viewport = page.getByTestId('viewport')
  await enterSketch(page)
  await dragInViewport(page, {
    fromX: 0.3,
    fromY: 0.4,
    toX: 0.6,
    toY: 0.62,
    pointerType: 'touch',
  })
  await expect(viewport).toHaveAttribute('data-sketch-count', '1')

  // The mode-gated toolbar must not push the page sideways or hang off the
  // edge at any reference viewport — this is the first control in the app with
  // no keyboard fallback if it becomes unreachable.
  const toolbar = await page.getByTestId('sketch-toolbar').boundingBox()
  const view = await viewport.boundingBox()
  if (!toolbar || !view) throw new Error('missing layout boxes')
  expect(toolbar.x).toBeGreaterThanOrEqual(view.x - 1)
  expect(toolbar.x + toolbar.width).toBeLessThanOrEqual(view.x + view.width + 1)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)

  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({
    path: join(SNAPSHOT_DIR, `sketch-touch-${testInfo.project.name}.png`),
  })
})

/**
 * Press and release at absolute client coordinates.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} x
 * @param {number} y
 */
async function tapViewportPoint(page, x, y) {
  await page.evaluate(
    ({ x, y }) => {
      const canvas = document.querySelector('[data-testid="viewport-canvas"]')
      if (!canvas) throw new Error('no canvas')
      for (const type of ['pointerdown', 'pointerup']) {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 14,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        )
      }
    },
    { x, y },
  )
  await page.waitForTimeout(80)
}

/**
 * The overlay must not become an invisible dead strip across the viewport.
 *
 * Uses Playwright's **real mouse**, not the synthetic `PointerEvent`s the
 * helpers above dispatch straight at the canvas: only a real press goes through
 * the browser's own hit-testing, which is the whole subject here. An earlier
 * draft of `SketchStrokes.vue` gave each line a transparent 18px-wide hit
 * target above the canvas; it swallowed every `pointerdown` that landed on a
 * drawn line, so a drag starting there neither drew nor orbited. Every
 * synthetic-event test in this file passed throughout — this is the acceptance
 * drive's finding, written down as a test.
 */
test('a drag that starts on top of a drawn line is not swallowed by the overlay', async ({
  page,
}) => {
  const viewport = page.getByTestId('viewport')
  const canvas = await page.getByTestId('viewport-canvas').boundingBox()
  if (!canvas) throw new Error('no canvas box')
  /** @param {number} fx @param {number} fy */
  const at = (fx, fy) => ({
    x: canvas.x + canvas.width * fx,
    y: canvas.y + canvas.height * fy,
  })

  await enterSketch(page)
  // Draw a line across the middle of the view with the real mouse.
  const from = at(0.3, 0.35)
  const to = at(0.7, 0.65)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await page.mouse.up()
  await expect(viewport).toHaveAttribute('data-sketch-count', '1')

  // Now start a second drag from a point *on* that line. It must draw.
  //
  // The point is chosen by asking the page what is actually on top there: at
  // phone width the nav chrome and the auto-opened Inspector sheet cover part
  // of the viewport, and a press landing on one of those would be a different
  // (and already-checked) story than the one this test is about.
  const midpoint = await pointOnLineOverCanvas(page, from, to)
  await page.mouse.move(midpoint.x, midpoint.y)
  await page.mouse.down()
  await page.mouse.move(midpoint.x + 90, midpoint.y - 70, { steps: 6 })
  await page.mouse.up()
  await expect(viewport).toHaveAttribute('data-sketch-count', '2')

  // And outside sketch mode, a press on a drawn line must reach the camera.
  //
  // A *quarter* of the way along the first line, not its midpoint: the second
  // line was drawn starting from that midpoint and is still selected, so its
  // own endpoint handle sits exactly there — and grabbing a handle is supposed
  // to edit the endpoint rather than orbit. Picking an unambiguous point is
  // what makes this assertion about the overlay's stroke rather than about its
  // handles.
  await page.getByTestId('sketch-exit').click()
  await expect(page.getByTestId('sketch-toolbar')).toHaveCount(0)
  const quarter = await pointOnLineOverCanvas(page, from, to, [0.2, 0.25, 0.3, 0.35])
  const azimuth = await viewport.getAttribute('data-camera-azimuth')
  await page.mouse.move(quarter.x, quarter.y)
  await page.mouse.down()
  await page.mouse.move(quarter.x + 110, quarter.y, { steps: 6 })
  await page.mouse.up()
  await expect(viewport).not.toHaveAttribute('data-camera-azimuth', azimuth ?? '')
  // …and drew nothing while doing it.
  await expect(viewport).toHaveAttribute('data-sketch-count', '2')
})

test('a real click on empty space clears a sketch selection', async ({ page }) => {
  // Also deliberately a real mouse click rather than a synthetic canvas event:
  // "empty space" is a claim about what is actually on top at that point.
  const viewport = page.getByTestId('viewport')
  const canvas = await page.getByTestId('viewport-canvas').boundingBox()
  if (!canvas) throw new Error('no canvas box')

  await enterSketch(page)
  const from = { x: canvas.x + canvas.width * 0.3, y: canvas.y + canvas.height * 0.4 }
  const to = { x: canvas.x + canvas.width * 0.6, y: canvas.y + canvas.height * 0.62 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await page.mouse.up()
  await expect(viewport).toHaveAttribute('data-sketch-count', '1')
  // Committing does not select — so select it deliberately, which is both what
  // the acceptance scenario describes and what this test needs something to
  // clear.
  const onLine = await pointOnLineOverCanvas(page, from, to)
  await page.mouse.click(onLine.x, onLine.y)
  await expect(viewport).not.toHaveAttribute('data-selected-sketch-id', '')

  // Upper-left of the canvas: clear of the Sketch toolbar (top centre), the
  // orientation gizmo (top right) and the nav chrome (bottom left).
  await page.mouse.click(canvas.x + canvas.width * 0.12, canvas.y + canvas.height * 0.12)
  await expect(viewport).toHaveAttribute('data-selected-sketch-id', '')
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-state', 'empty')
})


/**
 * A point along `from`→`to` where the **canvas** is the topmost element.
 *
 * The chrome overlays the viewport at every reference size, and more of it at
 * phone width — so "press on the line" has to mean a spot where pressing would
 * actually reach the canvas, or the test is measuring the wrong thing. Throws
 * with a readable message rather than silently drifting if no candidate works.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 * @param {number[]} [candidates] Fractions along the segment, in preference order.
 * @returns {Promise<{ x: number, y: number }>}
 */
async function pointOnLineOverCanvas(page, from, to, candidates = [0.5, 0.45, 0.55, 0.4, 0.6]) {
  for (const t of candidates) {
    const point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
    const onCanvas = await page.evaluate(
      ({ x, y }) => {
        const element = document.elementFromPoint(x, y)
        return element?.getAttribute('data-testid') === 'viewport-canvas'
      },
      point,
    )
    if (onCanvas) return point
  }
  throw new Error('no point along the drawn line has the canvas on top at this viewport')
}
