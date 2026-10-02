// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * Recolouring a placed body from the Inspector (`TODO/ui-037`), driven against
 * `/` — the running app, not a Storybook iframe. This is `TODO/ACCEPTANCE.md`
 * scenario 13's trigger.
 *
 * **All three reference viewports, all three engines — no `test.skip` pin.** The
 * change is in the rendered material path (per-colour `MeshStandardMaterial`s,
 * `src/render/mesh.js`), which is exactly the WebGL surface CLAUDE.md's Browser
 * Support section says defaults to every engine.
 *
 * Two kinds of evidence, on purpose. `data-body-color` on the scene list says what
 * the *document* holds; a pixel sampled off the canvas says what the *renderer*
 * drew. A body whose record is red but whose mesh still wears the shared palette
 * material would pass the first and fail the second — which is the whole
 * architectural change this task makes, so it has to be looked at, not inferred.
 */

/** @param {import('@playwright/test').Page} page */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (await rows.isVisible()) return
  await page.getByTestId('library-tab').click()
  await expect(rows).toBeVisible()
}

/** @param {import('@playwright/test').Page} page */
async function closeLibrary(page) {
  const tab = page.getByTestId('library-tab')
  if (!(await tab.isVisible())) return
  if (await page.getByTestId('library-rows').isVisible()) await tab.click()
  await expect(page.getByTestId('library-rows')).toBeHidden()
}

/**
 * Drag a Library row into the viewport with real `PointerEvent`s.
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
 * Click the canvas at a fraction of its size.
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
  await page.waitForTimeout(90)
}

/**
 * The mean colour of a small patch of the rendered canvas, around a fraction of
 * its size — what the renderer actually drew there.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} fx
 * @param {number} fy
 * @returns {Promise<{ r: number, g: number, b: number }>}
 */
async function sampleCanvas(page, fx, fy) {
  // Two frames, so whatever the last mutation scheduled has actually been drawn.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  return page.evaluate(
    ({ fx, fy }) => {
      const source = /** @type {HTMLCanvasElement} */ (document.querySelector('[data-testid="viewport-canvas"]'))
      const off = document.createElement('canvas')
      off.width = source.width
      off.height = source.height
      const ctx = off.getContext('2d')
      if (!ctx) throw new Error('no 2d context')
      ctx.drawImage(source, 0, 0)
      const radius = 3
      const cx = Math.round(source.width * fx)
      const cy = Math.round(source.height * fy)
      const { data } = ctx.getImageData(cx - radius, cy - radius, radius * 2 + 1, radius * 2 + 1)
      let r = 0
      let g = 0
      let b = 0
      const n = data.length / 4
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]
        g += data[i + 1]
        b += data[i + 2]
      }
      return { r: r / n, g: g / n, b: b / n }
    },
    { fx, fy },
  )
}

/**
 * The scene list's view of each body, colour included.
 *
 * @param {import('@playwright/test').Page} page
 */
function sceneBodies(page) {
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      op: node.getAttribute('data-body-op') ?? '',
      color: node.getAttribute('data-body-color') ?? '',
    })),
  )
}

/**
 * Make the Inspector's contents reachable: a no-op where it is a persistent
 * column, and a tap on its tab if the phone sheet is not already open.
 *
 * @param {import('@playwright/test').Page} page
 */
async function showInspector(page) {
  await closeLibrary(page)
  const inspector = page.getByTestId('inspector')
  if ((await inspector.getAttribute('data-open')) !== 'true' && (await page.getByTestId('inspector-tab').isVisible())) {
    await page.getByTestId('inspector-tab').click()
  }
  await expect(page.getByTestId('inspector-color')).toBeVisible()
}

// Apart from each other, and high enough to land on the grid rather than on a
// phone-width sheet (ACCEPTANCE.md scenario 1's own measured note on drop points).
const CUBE = { fx: 0.3, fy: 0.4 }
const CYLINDER = { fx: 0.7, fy: 0.4 }
// Where each body's own pixels are: a little above its drop point, since a
// dropped body stands up from the grid.
const CUBE_PIXEL = { fx: CUBE.fx, fy: CUBE.fy - 0.02 }
const CYLINDER_PIXEL = { fx: CYLINDER.fx, fy: CYLINDER.fy - 0.02 }
const EMPTY = { fx: 0.04, fy: 0.06 }

/** @param {{ r: number, g: number, b: number }} c */
const isRed = (c) => c.r > 90 && c.r > c.g * 1.8 && c.r > c.b * 1.8

/**
 * Red *while selected*: the body keeps its own colour with a warm selection tint
 * on top, so green stays well under red. The amber selection material a body
 * without an override wears is `r > b` too, but its green is ~0.77 of its red —
 * that is what this tells apart (measured by sabotaging the render path: the
 * un-recoloured selected cube failed exactly this check).
 *
 * @param {{ r: number, g: number, b: number }} c
 */
const isSelectedRed = (c) => c.r > 90 && c.g < c.r * 0.55 && c.b < c.r * 0.55

/**
 * Scenario 13's step 1: a Cube and a Cylinder, apart. Returns their ids and leaves
 * nothing selected.
 *
 * @param {import('@playwright/test').Page} page
 */
async function placeCubeAndCylinder(page) {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE })
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cylinder', ...CYLINDER })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  const bodies = await sceneBodies(page)
  const cube = bodies.find((body) => body.op === 'primitive.cuboid')
  const cylinder = bodies.find((body) => body.op === 'primitive.cylinder')
  if (!cube || !cylinder) throw new Error('both bodies should be in the scene')
  await clickViewportAt(page, EMPTY.fx, EMPTY.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')
  return { cube, cylinder }
}

/**
 * Select the cube by clicking the solid itself.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} cubeId
 */
async function selectCube(page, cubeId) {
  await clickViewportAt(page, CUBE.fx, CUBE.fy - 0.03)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cubeId)
  await showInspector(page)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
})

test('recolouring the cube changes its mesh, not the cylinder, and survives deselect, reselect and a third body', async ({
  page,
}) => {
  const { cube, cylinder } = await placeCubeAndCylinder(page)
  const cubeBefore = await sampleCanvas(page, CUBE_PIXEL.fx, CUBE_PIXEL.fy)
  const cylinderBefore = await sampleCanvas(page, CYLINDER_PIXEL.fx, CYLINDER_PIXEL.fy)
  expect(isRed(cubeBefore), `the default body colour is not red: ${JSON.stringify(cubeBefore)}`).toBe(false)

  await selectCube(page, cube.id)
  await expect(page.getByTestId('inspector-color-value')).toHaveText('Default')
  await expect(page.getByTestId('inspector-color-reset')).toBeDisabled()

  await page.getByTestId('inspector-color-input').fill('#ff0000')

  // The document holds it, on the cube alone…
  await expect(page.locator(`[data-body-id="${cube.id}"]`)).toHaveAttribute('data-body-color', '#ff0000')
  await expect(page.locator(`[data-body-id="${cylinder.id}"]`)).toHaveAttribute('data-body-color', '')
  await expect(page.getByTestId('inspector-color-value')).toHaveText('#ff0000')
  await expect(page.getByTestId('undo-button')).toHaveAttribute('aria-label', /^Undo: Recolor Cube/)

  // …and the renderer drew it: even selected, the cube reads red rather than the
  // amber selection colour, so the pick is visible while the Inspector is open.
  const cubeSelected = await sampleCanvas(page, CUBE_PIXEL.fx, CUBE_PIXEL.fy)
  expect(isSelectedRed(cubeSelected), `selected red cube: ${JSON.stringify(cubeSelected)}`).toBe(true)

  // Scenario 13 step 3: deselect, the cylinder is unchanged.
  await clickViewportAt(page, EMPTY.fx, EMPTY.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')
  const cubeAfter = await sampleCanvas(page, CUBE_PIXEL.fx, CUBE_PIXEL.fy)
  const cylinderAfter = await sampleCanvas(page, CYLINDER_PIXEL.fx, CYLINDER_PIXEL.fy)
  expect(isRed(cubeAfter), `recoloured cube: ${JSON.stringify(cubeAfter)}`).toBe(true)
  for (const channel of /** @type {const} */ (['r', 'g', 'b'])) {
    expect(Math.abs(cylinderAfter[channel] - cylinderBefore[channel]), `cylinder ${channel}`).toBeLessThan(12)
  }

  // Step 4: reselect the cube, the colour persisted.
  await selectCube(page, cube.id)
  await expect(page.getByTestId('inspector-color-value')).toHaveText('#ff0000')
  await expect(page.getByTestId('inspector-color-input')).toHaveValue('#ff0000')

  // Expect's last clause: an unrelated third body placed afterwards changes nothing.
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.sphere', fx: 0.5, fy: 0.3 })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '3')
  await expect(page.locator(`[data-body-id="${cube.id}"]`)).toHaveAttribute('data-body-color', '#ff0000')
  await expect(page.locator(`[data-body-id="${cylinder.id}"]`)).toHaveAttribute('data-body-color', '')
})

test('the picker previews live without writing history, and one pick is one Undo step', async ({ page }) => {
  const { cube } = await placeCubeAndCylinder(page)
  await selectCube(page, cube.id)
  const undoBefore = await page.getByTestId('undo-button').getAttribute('aria-label')

  // A native picker's `input` stream while it is open: several colours, no `change`.
  for (const hex of ['#220000', '#660000', '#aa0000', '#ff0000']) {
    await page.getByTestId('inspector-color-input').evaluate((input, value) => {
      const el = /** @type {HTMLInputElement} */ (input)
      el.value = value
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, hex)
  }
  // The mesh follows it…
  const previewed = await sampleCanvas(page, CUBE_PIXEL.fx, CUBE_PIXEL.fy)
  expect(isSelectedRed(previewed), `previewed cube: ${JSON.stringify(previewed)}`).toBe(true)
  // …the document does not.
  await expect(page.locator(`[data-body-id="${cube.id}"]`)).toHaveAttribute('data-body-color', '')
  await expect(page.getByTestId('undo-button')).toHaveAttribute('aria-label', undoBefore ?? '')

  // `change`: one record for the whole gesture.
  await page.getByTestId('inspector-color-input').evaluate((input) => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect(page.locator(`[data-body-id="${cube.id}"]`)).toHaveAttribute('data-body-color', '#ff0000')
  await expect(page.getByTestId('undo-button')).toHaveAttribute('aria-label', /^Undo: Recolor Cube/)

  // One Undo takes the whole pick back — not one of four intermediate colours.
  await page.getByTestId('undo-button').click()
  await expect(page.locator(`[data-body-id="${cube.id}"]`)).toHaveAttribute('data-body-color', '')
  await expect(page.getByTestId('undo-button')).toHaveAttribute('aria-label', undoBefore ?? '')
})

test('Reset puts the default colour back, is disabled when there is nothing to reset, and is undoable', async ({
  page,
}) => {
  const { cube } = await placeCubeAndCylinder(page)
  await selectCube(page, cube.id)
  await page.getByTestId('inspector-color-input').fill('#00ff00')
  await expect(page.locator(`[data-body-id="${cube.id}"]`)).toHaveAttribute('data-body-color', '#00ff00')

  const reset = page.getByTestId('inspector-color-reset')
  await expect(reset).toBeEnabled()
  await reset.click()
  await expect(page.locator(`[data-body-id="${cube.id}"]`)).toHaveAttribute('data-body-color', '')
  await expect(page.getByTestId('inspector-color-value')).toHaveText('Default')
  await expect(reset).toBeDisabled()
  await expect(page.getByTestId('undo-button')).toHaveAttribute('aria-label', /^Undo: Reset color of Cube/)

  await page.getByTestId('undo-button').click()
  await expect(page.locator(`[data-body-id="${cube.id}"]`)).toHaveAttribute('data-body-color', '#00ff00')
})

test('the swatch and Reset are full-size tap targets at every width', async ({ page }) => {
  const { cube } = await placeCubeAndCylinder(page)
  await selectCube(page, cube.id)
  for (const testId of ['inspector-color-input', 'inspector-color-reset']) {
    const box = await page.getByTestId(testId).boundingBox()
    expect(box, testId).not.toBeNull()
    expect(box?.height ?? 0, `${testId} height`).toBeGreaterThanOrEqual(44)
    expect(box?.width ?? 0, `${testId} width`).toBeGreaterThanOrEqual(44)
  }
  // Nothing about the new row pushes the page sideways at phone width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
