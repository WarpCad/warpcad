import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Selection → inspector + dimension lines + gizmo (TODO/ui-011), driven against
 * `/` — the running app, not a Storybook iframe.
 *
 * Runs the full 3 viewport × 3 engine matrix from `playwright.config.js`:
 *
 * - **Viewports**, because the Inspector is genuinely a different control at
 *   phone width: an auto-opening bottom sheet rather than a persistent column
 *   (`docs/decisions/interaction-model-qa.md` control 3 Q16). "Same as desktop"
 *   would be a false claim, so each viewport also captures a snapshot.
 * - **Engines**, because the gizmo and the dimension lines are re-projected from
 *   the same camera the WebGL frame is drawn with, and the click that selects is
 *   a real GPU raycast against real geometry (CLAUDE.md Browser Support).
 *
 * The load-bearing tests here are the *retarget* and *clear* ones. A gizmo left
 * attached to the previous body, or three dimension lines still quoting the
 * previous body's millimetres, is exactly the class of stale-display bug that
 * looks right in a screenshot of the moment it was written and wrong forever
 * after — and it is the failure control 3's Q15 calls out by name.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'selection-snapshots')

/**
 * Open the Library if this viewport keeps it behind a tab.
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
 * Drag a Library row into the viewport and release inside it.
 *
 * Real `PointerEvent`s rather than Playwright's mouse API, for the same reason
 * `primitive-placement.e2e.js` does it: one helper drives every engine including
 * the ones with no touch emulation, and the drop lands at an exact fraction of
 * the viewport regardless of where the panels sit.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ op: string, fx: number, fy: number }} options
 */
async function dragRowIntoViewport(page, { op, fx, fy }) {
  await page.evaluate(
    ({ op, fx, fy }) => {
      const row = document.querySelector(`[data-testid="library-row-${op}"]`)
      const view = document.querySelector('[data-testid="viewport"]')
      if (!row || !view) throw new Error(`missing row ${op} or viewport`)
      const from = row.getBoundingClientRect()
      const to = view.getBoundingClientRect()
      const startX = from.left + from.width / 2
      const startY = from.top + from.height / 2
      const endX = to.left + to.width * fx
      const endY = to.top + to.height * fy

      const fire = (target, type, x, y) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 7,
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

      fire(row, 'pointerdown', startX, startY)
      for (const t of [0.25, 0.5, 0.75, 1]) {
        fire(window, 'pointermove', startX + (endX - startX) * t, startY + (endY - startY) * t)
      }
      fire(window, 'pointerup', endX, endY)
    },
    { op, fx, fy },
  )
  await page.waitForTimeout(120)
}

/**
 * Click at a fraction of the viewport, as a press that does not move.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} fx
 * @param {number} fy
 * @param {{ shift?: boolean }} [modifiers]
 */
async function clickViewportAt(page, fx, fy, modifiers = {}) {
  await page.evaluate(
    ({ fx, fy, shift }) => {
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
            shiftKey: shift === true,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        )
      }
    },
    { fx, fy, shift: modifiers.shift === true },
  )
  await page.waitForTimeout(90)
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ id: string, op: string, name: string, center: string }[]>}
 */
function sceneBodies(page) {
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      op: node.getAttribute('data-body-op') ?? '',
      name: node.getAttribute('data-body-name') ?? '',
      center: node.getAttribute('data-body-center') ?? '',
    })),
  )
}

/**
 * The three dimension lines' measured lengths, in millimetres.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Record<string, number>>}
 */
async function dimensionLengths(page) {
  const entries = await page.$$eval('[data-testid^="dimension-"][data-length-mm]', (nodes) =>
    nodes.map((node) => [
      node.getAttribute('data-testid') ?? '',
      Number(node.getAttribute('data-length-mm')),
    ]),
  )
  return Object.fromEntries(entries)
}

/**
 * Read a readonly Inspector field's displayed value as a number.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 * @returns {Promise<number>}
 */
async function fieldValue(page, testId) {
  return Number(await page.getByTestId(testId).inputValue())
}

/**
 * Put the Library sheet away, if this viewport has one.
 *
 * At phone width there is a single bottom-sheet slot: the Inspector declines to
 * auto-open over a Library sheet the user deliberately opened, so that placing
 * several shapes in a row (ACCEPTANCE.md scenario 1) is not interrupted by a
 * panel swap on every drop. A phone user who wants to look at what they placed
 * closes the Library — which is what this does.
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
 * Reveal the Inspector's contents. At laptop/tablet width it is a persistent
 * column and there is nothing to do; at phone width the sheet is *supposed* to
 * open by itself once the Library is out of the way, so this asserts that rather
 * than tapping it open — see the dedicated auto-open test below for the same
 * claim stated directly.
 *
 * @param {import('@playwright/test').Page} page
 */
async function expectInspectorContentVisible(page) {
  await closeLibrary(page)
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-open', 'true')
  await expect(page.getByTestId('inspector-params')).toBeVisible()
}

/**
 * True where the Inspector is a bottom sheet rather than a persistent column.
 *
 * Keyed off the layout breakpoint itself rather than off whether the sheet's tab
 * happens to be on screen: with nothing selected the phone sheet is hidden
 * outright — a bar of dead chrome over the 3D view is worse than no panel — so a
 * visibility probe would report every phone project as a laptop.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {boolean}
 */
function isSheetWidth(page) {
  const size = page.viewportSize()
  return size !== null && size.width <= 640
}

/**
 * Page coordinates of a test id's centre, for a trusted `page.touchscreen.tap`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 * @returns {Promise<[number, number]>}
 */
async function centreOf(page, testId) {
  const box = await page.getByTestId(testId).boundingBox()
  if (!box) throw new Error(`no box for ${testId}`)
  return [box.x + box.width / 2, box.y + box.height / 2]
}

/**
 * Switch the viewport's drag mode to `'select'` (`TODO/ui-024`'s marquee
 * toggle) via the nav chrome — the touch-reachable path to marquee, and the
 * one this file's own marquee tests drive so the same mechanism is exercised
 * at every reference viewport, phone included, without relying on a
 * mouse-only Ctrl/Cmd modifier a touch project can't express.
 *
 * @param {import('@playwright/test').Page} page
 */
async function enableMarqueeMode(page) {
  await openNavChrome(page)
  await page.getByTestId('nav-mode-select').click()
  await expect(page.getByTestId('navigation-chrome')).toHaveAttribute('data-drag-mode', 'select')
}

/**
 * Drag a marquee rectangle across the canvas between two fractional corners.
 * Real `PointerEvent`s, matching this file's other drag helpers, so the same
 * gesture drives every engine including the ones with no touch emulation.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ fromFx: number, fromFy: number, toFx: number, toFy: number, additive?: boolean }} options
 *   `additive` holds Shift for the whole drag — the desktop-only additive
 *   modifier this task's own decision records (see
 *   `docs/decisions/interaction-model-qa.md`'s marquee addendum).
 */
async function dragMarquee(page, { fromFx, fromFy, toFx, toFy, additive = false }) {
  await page.evaluate(
    ({ fromFx, fromFy, toFx, toFy, additive }) => {
      const canvas = document.querySelector('[data-testid="viewport-canvas"]')
      if (!canvas) throw new Error('no canvas')
      const box = canvas.getBoundingClientRect()
      const x1 = box.left + box.width * fromFx
      const y1 = box.top + box.height * fromFy
      const x2 = box.left + box.width * toFx
      const y2 = box.top + box.height * toFy
      const fire = (type, x, y) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 13,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            shiftKey: additive === true,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        )
      fire('pointerdown', x1, y1)
      for (const t of [0.33, 0.66, 1]) {
        fire('pointermove', x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)
      }
      fire('pointerup', x2, y2)
    },
    { fromFx, fromFy, toFx, toFy, additive },
  )
  await page.waitForTimeout(90)
}

/**
 * Unfold the navigation chrome if it is folded behind its phone-only toggle — it
 * collapses while a bottom sheet raises it at ≤640px (`TODO/ui-046`). A no-op
 * everywhere else.
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

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('the root view mounts the Inspector, and it starts empty', async ({ page }) => {
  // Reachability, per CLAUDE.md: a panel that is not in the app's real render
  // tree is not shipped, whatever its own tests say.
  const inspector = page.getByTestId('inspector')
  await expect(inspector).toBeAttached()
  await expect(inspector).toHaveAttribute('data-state', 'empty')
  await expect(page.getByTestId('inspector-empty')).toHaveText('(nothing selected)')

  // Nothing selected means nothing annotated: no gizmo at all, and no dimension
  // lines quoting numbers about a body the user has not picked.
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(0)
  await expect(page.getByTestId('dimension-lines')).toHaveAttribute('data-axis-count', '0')
})

test('selecting a body shows a gizmo, three dimension lines, and its own parameters', async ({
  page,
}, testInfo) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cylinder', fx: 0.45, fy: 0.4 })
  const [cylinder] = await sceneBodies(page)

  // Deselect, then select by clicking the solid itself — the trigger control 3
  // actually specifies, rather than relying on the drop's own selection.
  await clickViewportAt(page, 0.04, 0.06)
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-state', 'empty')
  await clickViewportAt(page, 0.45, 0.36)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cylinder.id)

  // (a) A gizmo, attached at the body's origin.
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(1)
  await expect(page.getByTestId('gizmo-hub')).toBeAttached()
  // At least two of the three arms are always on screen: an axis pointing
  // straight at the camera legitimately has no screen direction, but two cannot.
  const arms = await page.locator('[data-testid^="gizmo-arm-"]').count()
  expect(arms).toBeGreaterThanOrEqual(2)
  // All three rotate rings are drawn, edge-on ones included.
  await expect(page.locator('[data-testid^="gizmo-ring-"]')).toHaveCount(3)

  // (b) Three dimension lines — always all three, never a collapsed number —
  // measuring the Cylinder's real 40 mm diameter and 50 mm height.
  await expect(page.getByTestId('dimension-lines')).toHaveAttribute('data-axis-count', '3')
  const lengths = await dimensionLengths(page)
  expect(lengths['dimension-x']).toBeCloseTo(40, 2)
  expect(lengths['dimension-y']).toBeCloseTo(40, 2)
  expect(lengths['dimension-z']).toBeCloseTo(50, 2)
  await expect(page.getByTestId('dimension-label-z')).toHaveText('50 mm')

  // (c) The Inspector: this op's own schema, plus the standing Transform section.
  await expectInspectorContentVisible(page)
  await expect(page.getByTestId('inspector-name')).toHaveText(cylinder.name)
  await expect(page.getByTestId('inspector-op')).toHaveAttribute('data-op', 'primitive.cylinder')
  expect(await fieldValue(page, 'inspector-param-diameter')).toBeCloseTo(40, 3)
  expect(await fieldValue(page, 'inspector-param-height')).toBeCloseTo(50, 3)

  await expect(page.getByTestId('inspector-transform')).toBeVisible()
  const [centreX, centreY, centreZ] = cylinder.center.split(',').map(Number)
  expect(await fieldValue(page, 'inspector-position-x')).toBeCloseTo(centreX, 1)
  expect(await fieldValue(page, 'inspector-position-y')).toBeCloseTo(centreY, 1)
  expect(await fieldValue(page, 'inspector-position-z')).toBeCloseTo(centreZ, 1)
  for (const axis of ['x', 'y', 'z']) {
    await expect(page.getByTestId(`inspector-rotation-${axis}`)).toHaveValue('0°')
  }

  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `selected-${testInfo.project.name}.png`) })
})

test('a Cube and a Cylinder each show their own schema, not one shared form', async ({ page }) => {
  // The registry-driven claim, checked rather than asserted in prose: the panel
  // has no per-primitive form, so a Cube must show `size` and a Cylinder must
  // show `diameter`/`height` from the same code path.
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.3, fy: 0.38 })
  await expect(page.getByTestId('inspector-param-size-x')).toBeAttached()
  expect(await fieldValue(page, 'inspector-param-size-z')).toBeCloseTo(40, 3)
  await expect(page.getByTestId('inspector-param-diameter')).toHaveCount(0)

  await dragRowIntoViewport(page, { op: 'primitive.tube', fx: 0.7, fy: 0.28 })
  await expect(page.getByTestId('inspector-param-size-x')).toHaveCount(0)
  expect(await fieldValue(page, 'inspector-param-innerDiameter')).toBeCloseTo(26, 3)
  expect(await fieldValue(page, 'inspector-param-height')).toBeCloseTo(50, 3)
})

test('selecting a second body retargets everything, with nothing stale left over', async ({
  page,
}) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.28, fy: 0.42 })
  await dragRowIntoViewport(page, { op: 'primitive.cylinder', fx: 0.72, fy: 0.3 })
  const [cube, cylinder] = await sceneBodies(page)

  await clickViewportAt(page, 0.28, 0.38)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cube.id)
  const cubeLengths = await dimensionLengths(page)
  const cubeGizmoOrigin = await page.getByTestId('transform-gizmo').getAttribute('data-origin')
  expect(cubeLengths['dimension-z']).toBeCloseTo(40, 2)

  await clickViewportAt(page, 0.72, 0.26)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cylinder.id)

  // Exactly one gizmo, and it has moved to the new body — never two at once.
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(1)
  expect(await page.getByTestId('transform-gizmo').getAttribute('data-origin')).not.toBe(
    cubeGizmoOrigin,
  )
  // The numbers are the *new* body's: a cylinder is 50 mm tall, the cube 40.
  await expect
    .poll(async () => (await dimensionLengths(page))['dimension-z'])
    .toBeCloseTo(50, 2)
  await expect(page.getByTestId('dimension-lines')).toHaveAttribute('data-axis-count', '3')
  // And so are the fields: the cube's `size` row is gone, not merely hidden.
  await expect(page.getByTestId('inspector-name')).toHaveText(cylinder.name)
  await expect(page.getByTestId('inspector-param-size-x')).toHaveCount(0)
  await expect(page.getByTestId('inspector-param-diameter')).toBeAttached()
})

test('clicking empty space clears the selection and everything attached to it', async ({ page }) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.sphere', fx: 0.5, fy: 0.36 })
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(1)

  await clickViewportAt(page, 0.04, 0.06)

  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', '')
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(0)
  await expect(page.getByTestId('dimension-lines')).toHaveAttribute('data-axis-count', '0')
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-state', 'empty')
  await expect(page.getByTestId('inspector-params')).toHaveCount(0)
})

test('two selected bodies show a count and no per-item fields, without crashing', async ({
  page,
}) => {
  // interaction-model-qa control 3, Q15. The failure this guards is subtle: the
  // panel must not keep showing the *first* body's fields once a second joins
  // the selection, because those fields would describe something the user is no
  // longer working on alone.
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.28, fy: 0.42 })
  await dragRowIntoViewport(page, { op: 'primitive.cylinder', fx: 0.72, fy: 0.3 })

  await clickViewportAt(page, 0.28, 0.38)
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-state', 'single')
  await expect(page.getByTestId('inspector-param-size-x')).toBeAttached()

  await clickViewportAt(page, 0.72, 0.26, { shift: true })

  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-state', 'multi')
  await expect(page.getByTestId('inspector-multi')).toHaveText('2 selected')
  // No stale fields, and no gizmo or dimension lines pointing at one of the two.
  await expect(page.getByTestId('inspector-params')).toHaveCount(0)
  await expect(page.getByTestId('inspector-param-size-x')).toHaveCount(0)
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(0)
  await expect(page.getByTestId('dimension-lines')).toHaveAttribute('data-axis-count', '0')

  // Shift-clicking the same body again drops it back to a single selection —
  // the panel has to come *back*, not stay stuck in the multi state.
  await clickViewportAt(page, 0.72, 0.26, { shift: true })
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-state', 'single')
})

test('the gizmo and dimension lines follow the camera rather than sticking to the screen', async ({
  page,
}) => {
  // The trap `render-001` names: two views of one camera drifting apart. An
  // overlay that only updated on *selection* would slide off its own solid the
  // moment the user orbited, and every assertion above would still pass.
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.45, fy: 0.38 })
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(1)
  const before = await page.getByTestId('transform-gizmo').getAttribute('data-origin')

  await page.getByTestId('gizmo-view-front').click()

  await expect.poll(async () => page.getByTestId('transform-gizmo').getAttribute('data-origin'))
    .not.toBe(before)
  // Still measuring the same solid, from a new angle: a 40 mm cube stays 40 mm.
  const lengths = await dimensionLengths(page)
  expect(lengths['dimension-x']).toBeCloseTo(40, 2)
  expect(lengths['dimension-z']).toBeCloseTo(40, 2)
})

test('the overlays never swallow the click that selects', async ({ page }) => {
  // The gizmo and the dimension lines are drawn directly over the body they
  // annotate. If either took pointer events, selecting would work exactly once
  // and then never again — a bug that only appears on the *second* click.
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.5, fy: 0.38 })
  const [cube] = await sceneBodies(page)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await clickViewportAt(page, 0.04, 0.06)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', '')
    await clickViewportAt(page, 0.5, 0.34)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cube.id)
  }
})

test('a real (trusted) touch tap still selects a body after a trusted tap on empty space (TODO/ui-045)', async ({
  page,
  hasTouch,
}) => {
  // Every other test in this file — including "the overlays never swallow the
  // click that selects" right above, which drives the exact same
  // empty-then-body sequence — uses `clickViewportAt`'s *synthetic*
  // mouse-type `PointerEvent`s, dispatched directly on the canvas *node*,
  // even on the touch-capable phone/tablet projects. That direct dispatch is
  // exactly why no existing spec ever catches this class of regression: it
  // invokes the canvas's own listeners regardless of what a real tap at that
  // screen point would actually hit first. A trusted tap
  // (`page.touchscreen.tap`) goes through the browser's real hit-testing, so
  // it can land on whatever overlay chrome is genuinely on top at that pixel
  // — the transform gizmo, the navigation pad once it insets above an open
  // sheet, or the Inspector sheet itself — none of which a synthetic
  // canvas-node dispatch can ever be blocked by. `TODO/ui-045`'s own
  // diagnosis session confirmed this by elimination: raycasting, the camera,
  // and `pickAt` all behave identically for a trusted vs. a synthetic tap at
  // the same coordinates once nothing else is in the way (verified directly
  // via temporary instrumentation); every reproduction that failed did so
  // because the tap's real target was `nav-step-right` or an open sheet, not
  // the canvas — and once that stray tap happened to press a *camera* button,
  // the *next* tap (aimed at a body's old screen position) missed because the
  // camera had silently moved. This test drives the sequence with points
  // proven clear of every overlay band at this viewport, so it exercises the
  // one thing `TODO/ui-045` actually asks for — a real trusted-touch repeat
  // of ACCEPTANCE.md scenario 1 step 4 — without also depending on this
  // file's bodies happening to dodge whatever chrome is on screen.
  test.skip(!hasTouch, 'no touch emulation in this project')

  await openLibrary(page)
  // Both bodies land on the right two-thirds of the canvas, between 20% and
  // 45% down: clear of the top-left Operations toolbar, the top-right
  // orientation gizmo, the left-anchored navigation chrome even once it
  // insets above an open sheet, and the bottom-anchored Inspector/Library
  // sheets. `closeLibrary` below keeps the canvas's rect from moving between
  // the drop and the first tap.
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.85, fy: 0.25 })
  await dragRowIntoViewport(page, { op: 'primitive.cylinder', fx: 0.6, fy: 0.4 })
  await closeLibrary(page)
  const [cube, cylinder] = await sceneBodies(page)

  const box = await page.getByTestId('viewport-canvas').boundingBox()
  if (!box) throw new Error('no canvas box')
  const point = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy })
  const empty = point(0.5, 0.06)
  const cubePoint = point(0.85, 0.25)
  const cylinderPoint = point(0.6, 0.4)

  // A trusted tap on empty canvas space clears the selection.
  await page.touchscreen.tap(empty.x, empty.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', '')

  // The tap `TODO/ui-045` describes failing: a trusted touch tap directly on
  // a body, right after a trusted tap on empty space.
  await page.touchscreen.tap(cubePoint.x, cubePoint.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cube.id)

  // And selecting the other body, still by trusted touch.
  await page.touchscreen.tap(cylinderPoint.x, cylinderPoint.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cylinder.id)

  // Repeat once more with an empty tap between each — the exact scenario-1
  // step-4 wording ("click empty viewport space to clear selection, then
  // click the cube, then click the cylinder") — plus a body-to-body retarget
  // with *no* empty tap in between, which is the case that would have caught
  // a residual selection-state bug the first pass papered over.
  await page.touchscreen.tap(empty.x, empty.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', '')
  await page.touchscreen.tap(cubePoint.x, cubePoint.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cube.id)
  await page.touchscreen.tap(cylinderPoint.x, cylinderPoint.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cylinder.id)
  await page.touchscreen.tap(cubePoint.x, cubePoint.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cube.id)

  // The camera never drifted along the way — the tell-tale sign of a stray
  // tap having pressed a navigation button instead of reaching the canvas.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-camera-azimuth', '-45.00')
})

test('a body under the raised navigation chrome stays selectable by a real touch tap, and the chrome expands on demand (TODO/ui-046)', async ({
  page,
  hasTouch,
}) => {
  // `TODO/ui-046`'s exact repro: a Cube at (0.28, 0.42) — the lower-left
  // quadrant several tests above already use — and a Cylinder elsewhere, which
  // the drop auto-selects, which opens the Inspector sheet, which raises the
  // navigation chrome to sit just above it. Before the fix the raised chrome
  // covered roughly x 8-202, y 207-407 at 390×844, and a trusted tap aimed at
  // the Cube landed on `nav-step-right` and silently orbited the camera. Only
  // a trusted tap can catch this: `clickViewportAt` dispatches on the canvas
  // node and never goes through the browser's hit-testing at all.
  test.skip(!hasTouch || !isSheetWidth(page), 'the chrome only rises above a sheet at phone width')

  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.28, fy: 0.42 })
  await dragRowIntoViewport(page, { op: 'primitive.cylinder', fx: 0.75, fy: 0.3 })
  await expectInspectorContentVisible(page)
  const [cube, cylinder] = await sceneBodies(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cylinder.id)

  // Raised over an open sheet, the chrome is one small toggle in the corner —
  // not a D-pad sitting on top of the canvas.
  const toggle = page.getByTestId('nav-expand-toggle')
  await expect(toggle).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('nav-step-right')).toBeHidden()
  const chrome = await page.getByTestId('navigation-chrome').boundingBox()
  if (!chrome) throw new Error('no chrome box')
  expect(chrome.width, 'collapsed chrome width').toBeLessThanOrEqual(60)
  expect(chrome.height, 'collapsed chrome height').toBeLessThanOrEqual(60)

  const box = await page.getByTestId('viewport-canvas').boundingBox()
  if (!box) throw new Error('no canvas box')
  const cubePoint = { x: box.x + box.width * 0.28, y: box.y + box.height * 0.42 }

  // The tap `TODO/ui-046` describes being swallowed.
  await page.touchscreen.tap(cubePoint.x, cubePoint.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cube.id)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-camera-azimuth', '-45.00')

  // The full cluster is one tap away, and every button in it still works.
  await page.touchscreen.tap(...(await centreOf(page, 'nav-expand-toggle')))
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('nav-step-right')).toBeVisible()
  await page.touchscreen.tap(...(await centreOf(page, 'nav-step-right')))
  await expect(page.getByTestId('viewport')).not.toHaveAttribute('data-camera-azimuth', '-45.00')

  // And collapses again on a second tap of the same toggle.
  await page.touchscreen.tap(...(await centreOf(page, 'nav-expand-toggle')))
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('nav-step-right')).toBeHidden()
})

test('the navigation chrome is fully expanded, with no collapse toggle, whenever no sheet raises it (TODO/ui-046)', async ({
  page,
}) => {
  // Nothing selected, no sheet up: the chrome sits at the bottom edge where it
  // never covers much canvas, so collapsing it there would only cost a tap.
  // This also holds at every width where the Inspector is a column rather
  // than a sheet — the collapse is phone-and-raised only.
  await expect(page.getByTestId('nav-step-right')).toBeVisible()
  await expect(page.getByTestId('nav-expand-toggle')).toBeHidden()

  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.5, fy: 0.38 })
  await expectInspectorContentVisible(page)
  if (!isSheetWidth(page)) {
    await expect(page.getByTestId('nav-step-right')).toBeVisible()
    await expect(page.getByTestId('nav-expand-toggle')).toBeHidden()
  }
})

test('at phone width one bottom sheet at a time, and selection opens the Inspector', async ({
  page,
}, testInfo) => {
  test.skip(!isSheetWidth(page), 'this viewport keeps the Inspector as a persistent column')

  await openLibrary(page)
  // The sheet is not even present with nothing selected — a bar of dead chrome
  // over the 3D view would be worse than no panel at all.
  await expect(page.getByTestId('inspector-params')).toHaveCount(0)

  await dragRowIntoViewport(page, { op: 'primitive.cylinder', fx: 0.5, fy: 0.3 })

  // There is one bottom-sheet slot, and the drop must not steal it: the Library
  // the user deliberately opened stays open, so the next shape is one drag away
  // rather than one drag plus a re-open. ui-011's acceptance drive found the two
  // sheets stacking here into unreadable mush.
  await expect(page.getByTestId('library-rows')).toBeVisible()
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-open', 'false')

  // Put the Library away, then use the trigger control 3 actually specifies —
  // a tap on the mesh. No second tap on the panel: the sheet comes up by itself
  // (control 3, Q16), because selection's feedback must not behave differently
  // by form factor.
  await closeLibrary(page)
  await clickViewportAt(page, 0.04, 0.06)
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-open', 'false')
  await clickViewportAt(page, 0.5, 0.26)
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-open', 'true')
  await expect(page.getByTestId('inspector-params')).toBeVisible()
  expect(await fieldValue(page, 'inspector-param-diameter')).toBeCloseTo(40, 3)

  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `sheet-open-${testInfo.project.name}.png`) })

  // Swiping the sheet down dismisses it *and* deselects — same gesture, same
  // meaning as tapping empty viewport space.
  await page.evaluate(() => {
    const tab = document.querySelector('[data-testid="inspector-tab"]')
    const box = tab.getBoundingClientRect()
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    const fire = (type, cy) =>
      tab.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 11,
          pointerType: 'touch',
          isPrimary: true,
          button: 0,
          clientX: x,
          clientY: cy,
          bubbles: true,
          cancelable: true,
        }),
      )
    fire('pointerdown', y)
    fire('pointerup', y + 90)
  })

  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', '')
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-state', 'empty')
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(0)
})

test('at tablet and laptop width the Inspector is a persistent column', async ({ page }) => {
  test.skip(isSheetWidth(page), 'this viewport keeps the Inspector as a bottom sheet')

  // Always there, with nothing selected — the empty state is the panel telling
  // the user what to do, not an absence.
  await expect(page.getByTestId('inspector-empty')).toBeVisible()
  const viewportBox = await page.getByTestId('viewport').boundingBox()
  const inspectorBox = await page.getByTestId('inspector').boundingBox()
  // Beside the viewport, not on top of it: at these widths the 3D view keeps
  // its own space rather than being overlaid.
  expect(inspectorBox.x).toBeGreaterThanOrEqual(viewportBox.x + viewportBox.width - 1)
})

test('the page never scrolls sideways with the Inspector mounted', async ({ page }) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.tube', fx: 0.5, fy: 0.34 })
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(1)

  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }))
  expect(overflow.x).toBeLessThanOrEqual(1)
  expect(overflow.y).toBeLessThanOrEqual(1)
})

test('dragging a selection box (marquee) multi-selects the bodies it encloses (TODO/ui-024)', async ({
  page,
}) => {
  await openLibrary(page)
  // The cube/cylinder positions are the same pair `viewport-scaffold.e2e.js`'s
  // own Shift-click regression and this file's other multi-select tests
  // already drop and click successfully at every reference viewport and
  // engine — proven screen positions, not a fresh guess. The sphere sits in
  // the opposite corner (near the top, well clear of the pair's own row) so
  // it stays outside the marquee below regardless of how the isometric
  // camera's projection skews a screen fraction at a given aspect ratio — the
  // failure a same-row placement hit on the portrait tablet project during
  // this task's own drive. All three stay near the top half of the canvas so
  // the drop lands on the visible viewport rather than under the open
  // Library sheet at phone width, where the sheet overlays the bottom.
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.28, fy: 0.42 })
  await dragRowIntoViewport(page, { op: 'primitive.cylinder', fx: 0.72, fy: 0.3 })
  await dragRowIntoViewport(page, { op: 'primitive.sphere', fx: 0.95, fy: 0.05 })
  const [cube, cylinder, sphere] = await sceneBodies(page)
  await closeLibrary(page)

  await enableMarqueeMode(page)
  // A snug rectangle around the cube/cylinder pair's own proven positions —
  // comfortably short of the sphere's corner in both directions.
  await dragMarquee(page, { fromFx: 0.15, fromFy: 0.18, toFx: 0.8, toFy: 0.5 })

  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await expect(page.getByTestId('inspector-multi')).toHaveText('2 selected')
  await expect(page.getByTestId(`scene-body-${cube.id}`)).toHaveAttribute('data-selected', 'true')
  await expect(page.getByTestId(`scene-body-${cylinder.id}`)).toHaveAttribute(
    'data-selected',
    'true',
  )
  // The marquee started on empty space and never reached the third body — it
  // must not be swept in just because the drag happened in its direction.
  await expect(page.getByTestId(`scene-body-${sphere.id}`)).toHaveAttribute(
    'data-selected',
    'false',
  )

  // Dragging a marquee that encloses nothing clears the selection outright,
  // same as clicking empty space — control 3's own regression this task must
  // not break for its new empty-space drag handling (see re-drive note in
  // TODO/ui-024).
  await dragMarquee(page, { fromFx: 0.02, fromFy: 0.02, toFx: 0.12, toFy: 0.12 })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')
})

test('holding Shift makes a marquee add to the selection instead of replacing it (TODO/ui-024 additive mode)', async ({
  page,
}) => {
  // The desktop-only additive-marquee decision this task's own Interaction
  // model section required recording rather than leaving implicit — see
  // `docs/decisions/interaction-model-qa.md`'s marquee addendum.
  await openLibrary(page)
  // Both drops stay in the viewport's upper portion for the same reason as
  // the test above — the phone-width Library sheet covers the lower part of
  // the viewport while it is open.
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.15, fy: 0.25 })
  await dragRowIntoViewport(page, { op: 'primitive.cylinder', fx: 0.8, fy: 0.4 })
  const [cube, cylinder] = await sceneBodies(page)
  await closeLibrary(page)

  await enableMarqueeMode(page)
  await dragMarquee(page, { fromFx: 0.05, fromFy: 0.05, toFx: 0.35, toFy: 0.4 })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  await expect(page.getByTestId(`scene-body-${cube.id}`)).toHaveAttribute('data-selected', 'true')

  await dragMarquee(page, {
    fromFx: 0.65,
    fromFy: 0.05,
    toFx: 0.95,
    toFy: 0.55,
    additive: true,
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await expect(page.getByTestId(`scene-body-${cube.id}`)).toHaveAttribute('data-selected', 'true')
  await expect(page.getByTestId(`scene-body-${cylinder.id}`)).toHaveAttribute(
    'data-selected',
    'true',
  )
})
