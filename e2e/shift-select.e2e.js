// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * Shift-click and the Shift-held marquee add to the selection with **real mouse
 * input** (`TODO/ui-083`). Every other selection spec in this folder dispatches
 * synthetic `PointerEvent`s, which is why the suite stayed green while a human
 * could not reach Union or Subtract. This file uses `page.mouse` and
 * `page.keyboard` only, so a regression in the real pointer path fails here.
 *
 * Laptop (1440×900) only: Shift is a desktop modifier, so tablet and phone do not
 * apply. All three engines, because pointer routing and modifier state differ by
 * engine.
 */

/** Drop points and click points as fractions of the canvas, as in `boolean-operations`. */
const CUBE_A = { drop: { fx: 0.28, fy: 0.42 }, click: { fx: 0.28, fy: 0.38 } }
const CUBE_B = { drop: { fx: 0.72, fy: 0.3 }, click: { fx: 0.72, fy: 0.26 } }

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    !testInfo.project.name.endsWith('laptop'),
    'Shift is a desktop modifier — laptop only, see this file’s header and TODO/ui-083',
  )
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

/**
 * Canvas point for a fraction, in page coordinates.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} fx
 * @param {number} fy
 */
async function canvasPoint(page, fx, fy) {
  const box = await page.getByTestId('viewport-canvas').boundingBox()
  if (!box) throw new Error('no canvas box')
  return { x: box.x + box.width * fx, y: box.y + box.height * fy }
}

/**
 * Drag a Cuboid from the Library into the viewport with the real mouse.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ fx: number, fy: number }} drop
 */
async function dropCuboid(page, drop) {
  const rows = page.getByTestId('library-rows')
  if (!(await rows.isVisible())) await page.getByTestId('library-tab').click()
  const row = page.getByTestId('library-row-primitive.cuboid')
  const from = await row.boundingBox()
  if (!from) throw new Error('no cuboid row')
  const to = await canvasPoint(page, drop.fx, drop.fy)
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
}

/**
 * Put two overlapping cubes in the scene, with real drags.
 *
 * @param {import('@playwright/test').Page} page
 */
async function placeTwoCubes(page) {
  await dropCuboid(page, CUBE_A.drop)
  await dropCuboid(page, CUBE_B.drop)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
}

test('Shift-click with the real mouse adds a second body to the selection', async ({ page }) => {
  await placeTwoCubes(page)
  const viewport = page.getByTestId('viewport')

  const first = await canvasPoint(page, CUBE_A.click.fx, CUBE_A.click.fy)
  await page.mouse.click(first.x, first.y)
  await expect(viewport).toHaveAttribute('data-selected-count', '1')

  const second = await canvasPoint(page, CUBE_B.click.fx, CUBE_B.click.fy)
  await page.keyboard.down('Shift')
  await page.mouse.click(second.x, second.y)
  await page.keyboard.up('Shift')

  await expect(viewport).toHaveAttribute('data-selected-count', '2')
  await expect(page.getByTestId('operation-union')).toBeEnabled()
  await expect(page.getByTestId('operation-subtract')).toBeEnabled()
})

test('a second Shift-click on a selected body removes it again', async ({ page }) => {
  await placeTwoCubes(page)
  const viewport = page.getByTestId('viewport')

  const first = await canvasPoint(page, CUBE_A.click.fx, CUBE_A.click.fy)
  await page.mouse.click(first.x, first.y)
  const second = await canvasPoint(page, CUBE_B.click.fx, CUBE_B.click.fy)
  await page.keyboard.down('Shift')
  await page.mouse.click(second.x, second.y)
  await expect(viewport).toHaveAttribute('data-selected-count', '2')
  await page.mouse.click(second.x, second.y)
  await page.keyboard.up('Shift')

  await expect(viewport).toHaveAttribute('data-selected-count', '1')
})

// The documented additive marquee is Ctrl/Cmd+Shift from empty canvas (see
// docs/selection-and-inspector.md, "Dragging a selection box"). Shift alone is
// the pan override (ui-018), so it is not a marquee gesture. The corner is
// bottom-right: the Operations toolbar covers the top-left of the canvas at
// laptop width, and a press there lands on a toolbar button, not the canvas.
test('a Ctrl+Shift marquee from empty canvas adds both bodies to the selection', async ({ page }) => {
  await placeTwoCubes(page)
  const viewport = page.getByTestId('viewport')

  const from = await canvasPoint(page, 0.95, 0.95)
  const to = await canvasPoint(page, 0.05, 0.05)
  await page.keyboard.down('Control')
  await page.keyboard.down('Shift')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await page.keyboard.up('Control')

  await expect(viewport).toHaveAttribute('data-selected-count', '2')
})
