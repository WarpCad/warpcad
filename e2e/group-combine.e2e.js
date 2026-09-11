import { test, expect } from '@playwright/test'

/**
 * The Operations toolbar's fourth button, Group (`TODO/ui-015`), driven against `/`
 * — the running app, not a Storybook iframe.
 *
 * A separate file from `e2e/boolean-operations.e2e.js` on purpose, per this task's
 * own Testing section: Group's claim is that **nothing is discarded** — every
 * operand's own geometry survives inside the result — which is a different
 * assertion from a boolean's volume-based one, and sharing one spec file would blur
 * the two claims together.
 *
 * **Chromium only, laptop plus one phone-width check.** Same reasoning
 * `ui-014`'s own spec gave for engine coverage: this is DOM/state logic (toolbar
 * wiring, the per-operand name lookup), not a new WebGL/WASM/canvas/touch/
 * persistence surface — `render-001`'s matrix already covers that nine ways for the
 * viewport itself. The toolbar's phone-width layout is unchanged (a fourth button in
 * an already-wrapping row, `ui-014`'s own responsive work), so this does not need
 * the full three-viewport snapshot matrix that task's own toolbar-placement work
 * needed the first time — just a confirmation the row still wraps without
 * horizontal scroll at phone width.
 */

test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'DOM/state logic, no new WebGL/canvas/touch surface — see this file’s header and TODO/ui-015',
)

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
 * Put the Library sheet away, if this viewport has one.
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
 * Drag a Library row into the viewport and release inside it — real `PointerEvent`s,
 * matching every other spec in this folder.
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

// Same proven drop-and-click positions `boolean-operations.e2e.js` already uses:
// far enough apart that dropping the second cube does not snap onto the first
// (this spec's whole claim is that both cubes' own geometry survives, which a
// snap-into-coincidence would make impossible to tell apart from a union).
const CUBE_A = { drop: { fx: 0.28, fy: 0.42 }, click: { fx: 0.28, fy: 0.38 } }
const CUBE_B = { drop: { fx: 0.72, fy: 0.3 }, click: { fx: 0.72, fy: 0.26 } }
// Same fy range as CUBE_A/CUBE_B rather than lower on the screen: at phone width
// the Library sheet and bottom nav chrome claim the lower band of the viewport,
// and a drop that lands there is swallowed by that chrome instead of the canvas.
const CUBE_C = { drop: { fx: 0.5, fy: 0.36 }, click: { fx: 0.5, fy: 0.32 } }

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('the Group button starts disabled alongside the three booleans, and enables at 2 selected', async ({
  page,
}) => {
  const toolbar = page.getByTestId('operations-toolbar')
  await expect(toolbar).toBeVisible()

  const group = page.getByTestId('operation-group')
  await expect(group).toBeVisible()
  await expect(group).toBeDisabled()
  for (const name of ['union', 'subtract', 'intersect']) {
    await expect(page.getByTestId(`operation-${name}`)).toBeDisabled()
  }

  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_A.drop })
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_B.drop })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')

  await clickViewportAt(page, CUBE_A.click.fx, CUBE_A.click.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  await expect(group).toBeDisabled()

  await clickViewportAt(page, CUBE_B.click.fx, CUBE_B.click.fy, { shift: true })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await expect(page.getByTestId('operations-count')).toContainText('2 selected')
  await expect(group).toBeEnabled()
})

test('Group turns two solids into one selectable body without discarding either one — bounding box spans both', async ({
  page,
}) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_A.drop })
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_B.drop })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')

  const before = await sceneBodies(page)
  const [cubeA, cubeB] = before

  await clickViewportAt(page, CUBE_A.click.fx, CUBE_A.click.fy)
  await clickViewportAt(page, CUBE_B.click.fx, CUBE_B.click.fy, { shift: true })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')

  await page.getByTestId('operation-group').click()

  const viewport = page.getByTestId('viewport')
  // Exactly one body remains — the two operands stop being independently
  // selectable, same as a boolean's `consumes` (not three: the two originals
  // left behind alongside the result; not zero).
  await expect(viewport).toHaveAttribute('data-body-count', '1')
  await expect(viewport).toHaveAttribute('data-selected-count', '1')

  const [result] = await sceneBodies(page)
  await expect(viewport).toHaveAttribute('data-selected-id', result.id)
  expect(result.op).toBe('group.assemble')

  // The ordinary selection → inspector → gizmo contract picks up the result with
  // no special case (`ui-011`/`ui-012`), sized to the *combined* bounding box.
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(1)

  const lengths = await page.$$eval('[data-testid^="dimension-"][data-length-mm]', (nodes) =>
    nodes.map((node) => Number(node.getAttribute('data-length-mm'))),
  )
  expect(lengths).toHaveLength(3)
  // Two 40 mm cubes placed 44%-of-viewport apart along X are nowhere near
  // touching, so the combined bounding box is materially wider than either cube
  // alone (40 mm) — proving neither cube's geometry was discarded or shrunk the
  // way a boolean's would be. The X extent in particular has to be much larger
  // than a single cube's 40 mm, since the two are separated along that axis.
  expect(Math.max(...lengths)).toBeGreaterThan(80)

  // Exactly one selected means the precondition is no longer met, so the
  // toolbar (all four buttons) dims again rather than inviting a second press
  // that cannot work.
  await expect(page.getByTestId('operations-toolbar')).toHaveAttribute('data-enabled', 'false')
  for (const name of ['union', 'subtract', 'intersect', 'group']) {
    await expect(page.getByTestId(`operation-${name}`)).toBeDisabled()
  }

  // The two original bodies are gone as independent entries — only the new
  // Group result is in the scene list.
  expect(before.map((body) => body.id)).not.toContain(result.id)
  const idsAfter = (await sceneBodies(page)).map((body) => body.id)
  expect(idsAfter).not.toContain(cubeA.id)
  expect(idsAfter).not.toContain(cubeB.id)
})

test('Group accepts three or more selected solids at once, same "2+" gate as the booleans', async ({
  page,
}) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_A.drop })
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_B.drop })
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_C.drop })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '3')

  // Marquee-select all three at once (`ui-024`), order-independent per this
  // task's own Interaction model — Group has no base/subtrahend asymmetry.
  await page.getByTestId('nav-mode-select').click()
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="viewport-canvas"]')
    const box = canvas.getBoundingClientRect()
    const fire = (type, fx, fy) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 21,
          pointerType: 'mouse',
          isPrimary: true,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          clientX: box.left + box.width * fx,
          clientY: box.top + box.height * fy,
          bubbles: true,
          cancelable: true,
        }),
      )
    fire('pointerdown', 0.05, 0.05)
    for (const t of [0.33, 0.66, 1]) fire('pointermove', 0.05 + 0.9 * t, 0.05 + 0.9 * t)
    fire('pointerup', 0.95, 0.95)
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '3')
  await expect(page.getByTestId('operations-count')).toContainText('3 selected')

  const group = page.getByTestId('operation-group')
  await expect(group).toBeEnabled()
  await group.click()

  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  const [result] = await sceneBodies(page)
  expect(result.op).toBe('group.assemble')
})

test('the toolbar row still wraps to fit four buttons without horizontal scroll at phone width', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-phone', 'one phone-width confirmation is enough — see this file’s header')

  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_A.drop })
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_B.drop })
  await closeLibrary(page)

  await clickViewportAt(page, CUBE_A.click.fx, CUBE_A.click.fy)
  await clickViewportAt(page, CUBE_B.click.fx, CUBE_B.click.fy, { shift: true })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')

  for (const name of ['union', 'subtract', 'intersect', 'group']) {
    await expect(page.getByTestId(`operation-${name}`)).toBeVisible()
  }

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)

  const toolbar = await page.getByTestId('operations-toolbar').boundingBox()
  const viewport = await page.getByTestId('viewport').boundingBox()
  expect(toolbar).not.toBeNull()
  expect(toolbar.x + toolbar.width).toBeLessThanOrEqual(viewport.x + viewport.width + 1)
})
