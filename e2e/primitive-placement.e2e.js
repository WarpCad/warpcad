// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Drag-place a primitive (TODO/ui-010), driven against `/` — the running app,
 * not a Storybook iframe.
 *
 * Runs the full 3 viewport × 3 engine matrix from `playwright.config.js`:
 *
 * - **Viewports**, because the Library panel is genuinely different at phone
 *   width — a bottom sheet behind a tab, not the persistent column tablet and
 *   laptop get (CLAUDE.md Responsive Layout; `interaction-model-qa.md` control 1
 *   Q16). "Same as desktop" would be a false claim here, so each viewport also
 *   captures a snapshot.
 * - **Engines**, because this is a WebGL/canvas path end to end: the ghost mesh,
 *   the working-plane projection, and the committed solid all go through the GPU
 *   (CLAUDE.md Browser Support).
 *
 * The load-bearing test in this file is "a second primitive leaves the first
 * alone": ACCEPTANCE.md scenario 1 exists because the second attempt shipped a
 * build where placing a second body silently replaced the first, underneath a
 * green suite.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'placement-snapshots')

/**
 * Open the Library if this viewport keeps it behind a tab.
 *
 * At phone width the sheet is closed by default and opening it is a real
 * precondition step — there is no way to drag a row that isn't rendered. Driving
 * that step here rather than forcing the panel open is the point: it is the
 * behaviour a phone user actually gets.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (await rows.isVisible()) return
  await page.getByTestId('library-tab').click()
  await expect(rows).toBeVisible()
}

/**
 * Drag a Library row into the viewport and release at a point inside it.
 *
 * Dispatches real `PointerEvent`s rather than using Playwright's mouse API so the
 * same helper drives `pointerType: 'touch'` on engines whose touch emulation
 * Playwright does not implement (Firefox), and so the drop lands at an exact
 * fraction of the canvas regardless of where the panel sits.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} options
 * @param {string} options.op Registry key, e.g. `primitive.cuboid`.
 * @param {number} options.fx Horizontal drop point, as a fraction of the viewport.
 * @param {number} options.fy Vertical drop point, as a fraction of the viewport.
 * @param {'mouse' | 'touch'} [options.pointerType]
 * @param {boolean} [options.releaseOutside] Release back over the panel instead.
 */
async function dragRowIntoViewport(page, { op, fx, fy, pointerType = 'mouse', releaseOutside = false }) {
  await page.evaluate(
    ({ op, fx, fy, pointerType, releaseOutside }) => {
      const row = document.querySelector(`[data-testid="library-row-${op}"]`)
      const view = document.querySelector('[data-testid="viewport"]')
      if (!row || !view) throw new Error(`missing row ${op} or viewport`)
      const from = row.getBoundingClientRect()
      const to = view.getBoundingClientRect()
      const startX = from.left + from.width / 2
      const startY = from.top + from.height / 2
      const endX = to.left + to.width * fx
      const endY = to.top + to.height * fy

      /**
       * @param {EventTarget} target
       * @param {string} type
       * @param {number} x
       * @param {number} y
       */
      const fire = (target, type, x, y) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 7,
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

      fire(row, 'pointerdown', startX, startY)
      // Several steps, the way a real drag arrives — one teleporting jump would
      // never exercise the panel-to-viewport crossing the ghost preview hangs on.
      for (const t of [0.25, 0.5, 0.75, 1]) {
        fire(window, 'pointermove', startX + (endX - startX) * t, startY + (endY - startY) * t)
      }
      if (releaseOutside) {
        fire(window, 'pointermove', startX, startY)
        fire(window, 'pointerup', startX, startY)
      } else {
        fire(window, 'pointerup', endX, endY)
      }
    },
    { op, fx, fy, pointerType, releaseOutside },
  )
  await page.waitForTimeout(120)
}

/**
 * Click at a fraction of the viewport, as a press that does not move.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} fx
 * @param {number} fy
 */
async function clickViewportAt(page, fx, fy) {
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
            pointerId: 3,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
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
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ id: string, op: string, name: string, center: string, selected: string }[]>}
 */
function sceneBodies(page) {
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      op: node.getAttribute('data-body-op') ?? '',
      name: node.getAttribute('data-body-name') ?? '',
      center: node.getAttribute('data-body-center') ?? '',
      selected: node.getAttribute('data-selected') ?? '',
    })),
  )
}

/**
 * How much of the canvas is *not* the flat background — a crude but honest
 * "something is drawn here" measure that a correct scene graph behind a blank
 * canvas cannot fake.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>} distinct colour buckets sampled across the canvas
 */
function canvasColorSpread(page) {
  return page.evaluate(() => {
    const canvas = /** @type {HTMLCanvasElement} */ (
      document.querySelector('[data-testid="viewport-canvas"]')
    )
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!context) return -1
    const width = canvas.width
    const height = canvas.height
    const pixels = new Uint8Array(width * height * 4)
    context.readPixels(0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, pixels)
    const buckets = new Set()
    for (let index = 0; index < pixels.length; index += 4 * 37) {
      buckets.add(
        `${pixels[index] >> 4},${pixels[index + 1] >> 4},${pixels[index + 2] >> 4}`,
      )
    }
    return buckets.size
  })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('the root view mounts the Library panel with all eight primitive rows', async ({ page }) => {
  // Reachability, per CLAUDE.md: a control that isn't in the app's real render
  // tree isn't shipped, whatever its own component tests say.
  await expect(page.getByTestId('library-panel')).toBeAttached()
  await openLibrary(page)
  const labels = await page.$$eval('[data-testid="library-rows"] [data-op]', (nodes) =>
    nodes.map((node) => node.getAttribute('data-label')),
  )
  // Sketch (TODO/sketch-001) is a primitive you draw rather than size, after Tube.
  expect(labels).toEqual(['Cube', 'Cylinder', 'Cone', 'Hexagon', 'Triangle', 'Tube', 'Sketch', 'Sphere'])
})

test('dragging a row into the viewport places and renders a primitive', { tag: '@smoke' }, async ({ page }, testInfo) => {
  await openLibrary(page)
  const viewport = page.getByTestId('viewport')
  await expect(viewport).toHaveAttribute('data-body-count', '0')
  const before = await canvasColorSpread(page)

  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.42, fy: 0.34 })

  await expect(viewport).toHaveAttribute('data-body-count', '1')
  const bodies = await sceneBodies(page)
  expect(bodies).toHaveLength(1)
  expect(bodies[0].op).toBe('primitive.cuboid')
  expect(bodies[0].name).toBe('Cube 1')

  // It renders: more distinct colour than the bare grid had a moment ago. A
  // record in the log that never reached the GPU would pass every other
  // assertion in this file.
  if (before >= 0) expect(await canvasColorSpread(page)).toBeGreaterThan(before)

  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({
    path: join(SNAPSHOT_DIR, `placed-${testInfo.project.name}.png`),
  })
})

test('a second, different primitive leaves the first visible and unmoved', { tag: '@smoke' }, async ({ page }) => {
  // ACCEPTANCE.md scenario 1, as an automated regression. The second attempt
  // shipped exactly this bug — a new body replacing the previous one — with a
  // green suite and a clean reachability audit.
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.3, fy: 0.36 })
  const afterFirst = await sceneBodies(page)
  expect(afterFirst).toHaveLength(1)

  await dragRowIntoViewport(page, { op: 'primitive.sphere', fx: 0.7, fy: 0.26 })

  const afterSecond = await sceneBodies(page)
  expect(afterSecond).toHaveLength(2)
  expect(afterSecond.map((body) => body.op)).toEqual(['primitive.cuboid', 'primitive.sphere'])
  expect(afterSecond.map((body) => body.name)).toEqual(['Cube 1', 'Sphere 1'])
  // Unmoved, not merely still listed: same id, same millimetre centre.
  expect(afterSecond[0].id).toBe(afterFirst[0].id)
  expect(afterSecond[0].center).toBe(afterFirst[0].center)
  // ...and dropped somewhere else, so the two are genuinely independent bodies.
  expect(afterSecond[1].center).not.toBe(afterFirst[0].center)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
})

test('a dropped primitive becomes the selection, and only it', async ({ page }) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.3, fy: 0.36 })
  const [cube] = await sceneBodies(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cube.id)

  await dragRowIntoViewport(page, { op: 'primitive.cylinder', fx: 0.7, fy: 0.26 })
  const bodies = await sceneBodies(page)
  // The newest body is selected and the older one is not — a selection that
  // accumulated silently would break every count-gated tool later.
  expect(bodies.map((body) => body.selected)).toEqual(['false', 'true'])
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', bodies[1].id)
})

test('every one of the sized rows places its own kind of solid', async ({ page }) => {
  // The generic-mechanism claim, checked rather than asserted in prose: one drag
  // implementation parameterised by the row's op, exercised across every row that
  // places a solid on release. The Sketch row opens its editor instead (its own spec,
  // e2e/sketch-primitive.e2e.js), and says so with `data-editor`.
  await openLibrary(page)
  const ops = await page.$$eval('[data-testid="library-rows"] [data-op]:not([data-editor="sketch"])', (nodes) =>
    nodes.map((node) => node.getAttribute('data-op') ?? ''),
  )
  expect(ops).toHaveLength(7)
  let column = 0
  for (const op of ops) {
    column += 1
    await dragRowIntoViewport(page, { op, fx: 0.16 + column * 0.09, fy: 0.3 })
  }
  const bodies = await sceneBodies(page)
  expect(bodies.map((body) => body.op)).toEqual(ops)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', String(ops.length))
})

test('the ghost preview appears over the viewport and not over the panel', async ({ page }) => {
  await openLibrary(page)
  const viewport = page.getByTestId('viewport')

  await page.evaluate(() => {
    const row = document.querySelector('[data-testid="library-row-primitive.cuboid"]')
    const box = row.getBoundingClientRect()
    row.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 9,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  await expect(viewport).toHaveAttribute('data-placing', 'true')
  await expect(viewport).toHaveAttribute('data-ghost', 'hidden')

  await page.evaluate(() => {
    const view = document.querySelector('[data-testid="viewport"]')
    const box = view.getBoundingClientRect()
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 9,
        pointerType: 'mouse',
        isPrimary: true,
        clientX: box.left + box.width / 2,
        // Upper third: at phone width the Library sheet covers the lower half of
        // the viewport, and a point under it is not "over the 3D view".
        clientY: box.top + box.height * 0.3,
        bubbles: true,
      }),
    )
  })
  await expect(viewport).toHaveAttribute('data-ghost', 'visible')
  // Still a preview, not a commitment.
  await expect(viewport).toHaveAttribute('data-body-count', '0')

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 9, bubbles: true }))
  })
  await expect(viewport).toHaveAttribute('data-placing', 'false')
  await expect(viewport).toHaveAttribute('data-ghost', 'hidden')
  await expect(viewport).toHaveAttribute('data-body-count', '0')
})

test('releasing outside the viewport places nothing', async ({ page }) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, {
    op: 'primitive.cuboid',
    fx: 0.5,
    fy: 0.3,
    releaseOutside: true,
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-ghost', 'hidden')
})

test('a touch drag places a primitive too, and the phone sheet stays open through it', async ({
  page,
  hasTouch,
}, testInfo) => {
  test.skip(!hasTouch, 'no touch emulation in this project')
  await openLibrary(page)
  const panel = page.getByTestId('library-panel')
  const wasOpen = await panel.getAttribute('data-open')

  await dragRowIntoViewport(page, {
    op: 'primitive.cylinder',
    fx: 0.5,
    fy: 0.3,
    pointerType: 'touch',
  })

  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  // The sheet must not close underneath the finger that is dragging out of it.
  await expect(panel).toHaveAttribute('data-open', String(wasOpen))

  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({
    path: join(SNAPSHOT_DIR, `touch-placed-${testInfo.project.name}.png`),
  })
})

test('clicking a body selects only it, and empty space clears the selection', async ({ page }) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.5, fy: 0.34 })
  const viewport = page.getByTestId('viewport')
  const [cube] = await sceneBodies(page)

  // A far corner of the grid has nothing on it.
  await clickViewportAt(page, 0.05, 0.07)
  await expect(viewport).toHaveAttribute('data-selected-id', '')

  // Slightly above the drop point: the drop point is the solid's base, and the
  // solid is drawn upward from it on screen.
  await clickViewportAt(page, 0.5, 0.3)
  await expect(viewport).toHaveAttribute('data-selected-id', cube.id)
})

test('a drag inside the viewport still orbits rather than selecting', async ({ page }) => {
  // The click-to-select press must not steal the camera drag render-001 built.
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.5, fy: 0.3 })
  const viewport = page.getByTestId('viewport')
  const azimuthBefore = Number(await viewport.getAttribute('data-camera-azimuth'))

  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="viewport-canvas"]')
    const box = canvas.getBoundingClientRect()
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    const fire = (type, cx, cy) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 5,
          pointerType: 'mouse',
          isPrimary: true,
          button: 0,
          clientX: cx,
          clientY: cy,
          bubbles: true,
          cancelable: true,
        }),
      )
    fire('pointerdown', x, y)
    fire('pointermove', x + 40, y)
    fire('pointermove', x + 80, y)
    fire('pointerup', x + 80, y)
  })

  await expect
    .poll(async () => Number(await viewport.getAttribute('data-camera-azimuth')))
    .not.toBe(azimuthBefore)
  // The drag orbited; it did not clear or change the selection.
  const bodies = await sceneBodies(page)
  await expect(viewport).toHaveAttribute('data-selected-id', bodies[0].id)
})

test('the page never scrolls sideways with the Library panel mounted', async ({ page }) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.5, fy: 0.3 })
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }))
  expect(overflow.x).toBeLessThanOrEqual(1)
  expect(overflow.y).toBeLessThanOrEqual(1)
})
