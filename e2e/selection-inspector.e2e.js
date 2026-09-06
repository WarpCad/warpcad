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
