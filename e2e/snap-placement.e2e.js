import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Snap-assisted drag placement (TODO/ui-013), driven against `/` — the running
 * app, not a Storybook iframe.
 *
 * Runs the full 3 viewport × 3 engine matrix from `playwright.config.js`, and
 * this spec's Testing section says so explicitly rather than defaulting:
 *
 * - **Viewports**, because this is a pointer-drag interaction that has to work
 *   under a finger on a 390px-wide canvas as well as under a mouse on a 1440px
 *   one, and because the guide lines have to stay legible against the narrower
 *   canvas (CLAUDE.md Responsive Layout; `ui-013`'s own small-screen note).
 * - **Engines**, because the whole path is WebGL/canvas/pointer: the ghost mesh,
 *   the working-plane projection, the SVG guide overlay and the committed solid
 *   (CLAUDE.md Browser Support).
 *
 * The load-bearing claims here are the two `ACCEPTANCE.md` scenarios this task
 * re-drives: **scenario 3** (guides appear mid-drag and the ghost snaps before
 * release) and **scenario 1** (a snap-assisted drop must not disturb the body it
 * snapped against — the second attempt shipped a build where a second body
 * replaced the first, underneath a green suite).
 *
 * ## Why the drag is broken into press / move / release here
 *
 * `e2e/primitive-placement.e2e.js` drives a whole drag in one call, which is all
 * `ui-010` needed. This task's feedback is *mid-drag*: the guides and the snapped
 * ghost only exist between the press and the release, so the gesture has to be
 * left open and asserted against while it is still in flight.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'snap-snapshots')

/** How close, in millimetres, two centres count as aligned on an axis. */
const ALIGNED_MM = 0.05

/**
 * Open the Library if this viewport keeps it behind a tab (phone width).
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
 * Dispatch one real `PointerEvent`, the way `primitive-placement.e2e.js` does —
 * rather than Playwright's mouse API — so the same helper drives
 * `pointerType: 'touch'` on engines whose touch emulation Playwright does not
 * implement (Firefox).
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} options
 * @param {'row' | 'window'} options.on Where the event is dispatched.
 * @param {string} options.type
 * @param {string} [options.op] Required when `on` is `'row'`.
 * @param {number} [options.fx] Viewport fraction, when addressing the viewport.
 * @param {number} [options.fy]
 * @param {'mouse' | 'touch'} [options.pointerType]
 */
function fire(page, { on, type, op, fx = 0, fy = 0, pointerType = 'mouse' }) {
  return page.evaluate(
    ({ on, type, op, fx, fy, pointerType }) => {
      const view = document.querySelector('[data-testid="viewport"]')
      if (!view) throw new Error('no viewport')
      const box = view.getBoundingClientRect()
      let target = window
      let x = box.left + box.width * fx
      let y = box.top + box.height * fy
      if (on === 'row') {
        const row = document.querySelector(`[data-testid="library-row-${op}"]`)
        if (!row) throw new Error(`missing row ${op}`)
        const from = row.getBoundingClientRect()
        target = /** @type {any} */ (row)
        x = from.left + from.width / 2
        y = from.top + from.height / 2
      }
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
    },
    { on, type, op, fx, fy, pointerType },
  )
}

/**
 * Press a Library row and drag the ghost to a point in the viewport, leaving the
 * gesture open.
 *
 * Several intermediate moves, the way a real drag arrives — one teleporting jump
 * would never exercise the panel-to-viewport crossing the ghost hangs on.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ op: string, fx: number, fy: number, pointerType?: 'mouse' | 'touch' }} options
 */
async function startDrag(page, { op, fx, fy, pointerType = 'mouse' }) {
  await fire(page, { on: 'row', type: 'pointerdown', op, pointerType })
  for (const t of [0.4, 0.7, 1]) {
    await fire(page, {
      on: 'window',
      type: 'pointermove',
      fx: fx * t + 0.5 * (1 - t),
      fy: fy * t + 0.5 * (1 - t),
      pointerType,
    })
  }
  await page.waitForTimeout(60)
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ fx: number, fy: number, pointerType?: 'mouse' | 'touch' }} options
 */
async function moveDrag(page, { fx, fy, pointerType = 'mouse' }) {
  await fire(page, { on: 'window', type: 'pointermove', fx, fy, pointerType })
  await page.waitForTimeout(60)
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ fx: number, fy: number, pointerType?: 'mouse' | 'touch' }} options
 */
async function endDrag(page, { fx, fy, pointerType = 'mouse' }) {
  await fire(page, { on: 'window', type: 'pointerup', fx, fy, pointerType })
  await page.waitForTimeout(120)
}

/**
 * Press, drag and release in one go — the `ui-010` gesture, used where this spec
 * only needs a body on the grid to snap against.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ op: string, fx: number, fy: number, pointerType?: 'mouse' | 'touch' }} options
 */
async function dragRowIntoViewport(page, options) {
  await startDrag(page, options)
  await endDrag(page, options)
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ id: string, op: string, center: number[] }[]>}
 */
function sceneBodies(page) {
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      op: node.getAttribute('data-body-op') ?? '',
      center: (node.getAttribute('data-body-center') ?? '').split(',').map(Number),
    })),
  )
}

/**
 * How many of X and Y two bodies' centres agree on.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} 0, 1 or 2
 */
function alignedAxes(a, b) {
  return [0, 1].filter((axis) => Math.abs(a[axis] - b[axis]) < ALIGNED_MM).length
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('the guide overlay is mounted in the real app, and idle before any drag', async ({ page }) => {
  // Reachability, per CLAUDE.md: an overlay that is not in the app's real render
  // tree is not shipped, whatever its own component tests say.
  await expect(page.getByTestId('snap-guides')).toBeAttached()
  await expect(page.getByTestId('snap-guides')).toHaveAttribute('data-guide-count', '0')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-snapped', 'false')
})

test('an empty scene has nothing to snap to, and says so', async ({ page }) => {
  // `ui-013`'s stated precondition: with zero existing items the drag behaves
  // exactly as `ui-010` already built it — no guides, no snap, and above all no
  // invented "nearest" item.
  await openLibrary(page)
  const viewport = page.getByTestId('viewport')
  await startDrag(page, { op: 'primitive.cuboid', fx: 0.45, fy: 0.32 })

  await expect(viewport).toHaveAttribute('data-ghost', 'visible')
  await expect(viewport).toHaveAttribute('data-snapped', 'false')
  await expect(page.getByTestId('snap-guides')).toHaveAttribute('data-guide-count', '0')

  await endDrag(page, { fx: 0.45, fy: 0.32 })
  await expect(viewport).toHaveAttribute('data-body-count', '1')
})

test('dragging a second item near the first grows guides on it and snaps the ghost', async ({
  page,
}, testInfo) => {
  // ACCEPTANCE.md scenario 3, as an automated regression: guides mid-drag, a
  // snapped ghost before release, and a drop that lands aligned rather than at
  // the raw pointer position.
  await openLibrary(page)
  const viewport = page.getByTestId('viewport')
  const guides = page.getByTestId('snap-guides')

  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.44, fy: 0.32 })
  const [cube] = await sceneBodies(page)

  await startDrag(page, { op: 'primitive.cylinder', fx: 0.46, fy: 0.33 })

  // Step 3 of the scenario: the feedback exists *before* release.
  await expect(viewport).toHaveAttribute('data-snapped', 'true')
  expect(Number(await guides.getAttribute('data-guide-count'))).toBeGreaterThanOrEqual(1)
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `snapping-${testInfo.project.name}.png`) })

  await endDrag(page, { fx: 0.46, fy: 0.33 })

  const bodies = await sceneBodies(page)
  expect(bodies).toHaveLength(2)
  // Step 5: the **snapped** position committed, not the raw pointer position.
  // The two rows were released at different screen points, so agreeing to within
  // a twentieth of a millimetre on an axis is the snap, not a coincidence.
  expect(alignedAxes(bodies[1].center, cube.center)).toBeGreaterThanOrEqual(1)
  // And the guides are gone once the gesture is over — a line left standing
  // would be pointing at an alignment nothing is being aligned to any more.
  await expect(guides).toHaveAttribute('data-guide-count', '0')
  await expect(viewport).toHaveAttribute('data-snapped', 'false')
})

test('a drop far from everything is left exactly where the pointer put it', async ({ page }) => {
  await openLibrary(page)
  const viewport = page.getByTestId('viewport')
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.22, fy: 0.42 })
  const [cube] = await sceneBodies(page)

  await startDrag(page, { op: 'primitive.sphere', fx: 0.82, fy: 0.14 })
  await expect(viewport).toHaveAttribute('data-snapped', 'false')
  await expect(page.getByTestId('snap-guides')).toHaveAttribute('data-guide-count', '0')
  await endDrag(page, { fx: 0.82, fy: 0.14 })

  const bodies = await sceneBodies(page)
  expect(bodies).toHaveLength(2)
  // Nothing aligned — which is also what makes the aligned assertion in the
  // test above mean something rather than being an artefact of the helper.
  expect(alignedAxes(bodies[1].center, cube.center)).toBe(0)
})

test('a snap-assisted drop leaves the body it snapped against visible and unmoved', async ({
  page,
}) => {
  // ACCEPTANCE.md scenario 1, re-checked against the new drop-commit path: the
  // snap changes where the *new* body lands and must touch nothing else.
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.44, fy: 0.32 })
  const afterFirst = await sceneBodies(page)
  expect(afterFirst).toHaveLength(1)

  await startDrag(page, { op: 'primitive.cylinder', fx: 0.46, fy: 0.33 })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-snapped', 'true')
  await endDrag(page, { fx: 0.46, fy: 0.33 })

  const afterSecond = await sceneBodies(page)
  expect(afterSecond).toHaveLength(2)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  // Same id, same millimetre centre — unmoved, not merely still listed.
  expect(afterSecond[0].id).toBe(afterFirst[0].id)
  expect(afterSecond[0].center).toEqual(afterFirst[0].center)
  expect(afterSecond.map((body) => body.op)).toEqual(['primitive.cuboid', 'primitive.cylinder'])
})

test('the guide follows the pointer: it appears on approach and lets go on retreat', async ({
  page,
}) => {
  // The point of a *tolerance radius* rather than an always-on magnet: a user
  // has to be able to place something deliberately close to another item without
  // it, and a fixed script that only ever samples one pointer position would
  // never notice the guide had become permanent.
  await openLibrary(page)
  const viewport = page.getByTestId('viewport')
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.44, fy: 0.32 })

  await startDrag(page, { op: 'primitive.hexagon', fx: 0.85, fy: 0.12 })
  await expect(viewport).toHaveAttribute('data-snapped', 'false')

  await moveDrag(page, { fx: 0.45, fy: 0.32 })
  await expect(viewport).toHaveAttribute('data-snapped', 'true')

  await moveDrag(page, { fx: 0.85, fy: 0.12 })
  await expect(viewport).toHaveAttribute('data-snapped', 'false')
  await expect(page.getByTestId('snap-guides')).toHaveAttribute('data-guide-count', '0')

  // Cancelling mid-gesture clears the feedback and places nothing.
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 11, bubbles: true }))
  })
  await expect(viewport).toHaveAttribute('data-placing', 'false')
  await expect(viewport).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('snap-guides')).toHaveAttribute('data-guide-count', '0')
})

test('the guide lines are drawn on the canvas, not off it', async ({ page }, testInfo) => {
  // The phone case from `ui-013`'s small-screen note: a guide that renders at
  // negative coordinates, or hundreds of pixels past the canvas edge, is not
  // legible however correct its maths. Checked at every viewport, since the
  // narrow one is the one at risk.
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.44, fy: 0.34 })
  await startDrag(page, { op: 'primitive.cylinder', fx: 0.46, fy: 0.35 })

  const box = await page.getByTestId('viewport').boundingBox()
  const segments = await page.$$eval('[data-testid^="snap-guide-"]', (nodes) =>
    nodes.map((node) => ({
      x1: Number(node.getAttribute('x1')),
      y1: Number(node.getAttribute('y1')),
      x2: Number(node.getAttribute('x2')),
      y2: Number(node.getAttribute('y2')),
    })),
  )
  expect(segments.length).toBeGreaterThanOrEqual(1)
  for (const segment of segments) {
    for (const value of Object.values(segment)) expect(Number.isFinite(value)).toBe(true)
    // At least one end of every guide has to be on screen, or the line is
    // invisible in practice whatever its endpoints say.
    const onScreen = [
      [segment.x1, segment.y1],
      [segment.x2, segment.y2],
    ].some(
      ([x, y]) =>
        x >= 0 && y >= 0 && x <= (box?.width ?? 0) && y <= (box?.height ?? 0),
    )
    expect(onScreen).toBe(true)
  }

  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `guides-${testInfo.project.name}.png`) })
  await endDrag(page, { fx: 0.46, fy: 0.35 })
})

test('a touch drag snaps too, with no keyboard or mouse anywhere in the gesture', async ({
  page,
  hasTouch,
}, testInfo) => {
  test.skip(!hasTouch, 'no touch emulation in this project')
  await openLibrary(page)
  const viewport = page.getByTestId('viewport')

  await dragRowIntoViewport(page, {
    op: 'primitive.cuboid',
    fx: 0.44,
    fy: 0.3,
    pointerType: 'touch',
  })
  const [cube] = await sceneBodies(page)

  await startDrag(page, {
    op: 'primitive.cylinder',
    fx: 0.46,
    fy: 0.31,
    pointerType: 'touch',
  })
  await expect(viewport).toHaveAttribute('data-snapped', 'true')
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `touch-snapping-${testInfo.project.name}.png`) })

  await endDrag(page, { fx: 0.46, fy: 0.31, pointerType: 'touch' })
  const bodies = await sceneBodies(page)
  expect(bodies).toHaveLength(2)
  expect(alignedAxes(bodies[1].center, cube.center)).toBeGreaterThanOrEqual(1)
})
