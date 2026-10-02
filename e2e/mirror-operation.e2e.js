// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * The Operations toolbar's Mirror button (`TODO/ui-039`), driven against `/`.
 *
 * All three reference viewports and every enabled engine, no `test.skip` pin: it
 * rebuilds kernel geometry (a reflection) and re-renders a second body, the same bar
 * `ui-027`/`ui-028` set.
 *
 * Mirror is the toolbar's first exactly-1 control that **adds** a body instead of
 * editing one, so what this spec pins down that no sibling spec does is: the body
 * count goes 1 -> 2, the original's centre is **byte-identical** afterwards, the copy
 * sits at the reflected position, and the *copy* is what ends up selected.
 *
 * The plane is typed (X = 100 mm) rather than left at the world plane, so the expected
 * position is computed from whatever centre the drop landed on: `2 * 100 - x`.
 */

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
 * Drag a Library row into the viewport and release inside it — real
 * `PointerEvent`s, matching every other spec in this folder.
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
  await page.waitForTimeout(150)
}

// The Library's default cube (established by this folder's other specs).
const CUBE = { drop: { fx: 0.5, fy: 0.4 } }

/**
 * Every body in the scene list, with its measured centre.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ id: string, name: string, center: number[] }[]>}
 */
function sceneBodies(page) {
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      name: node.getAttribute('data-body-name') ?? '',
      center: (node.getAttribute('data-body-center') ?? '').split(',').map(Number),
    })),
  )
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function placeAndSelectCube(page) {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE.drop })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  return (await sceneBodies(page))[0]
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('Mirror is exactly-1-gated: disabled at 0 and at 2 selected, enabled at exactly 1', async ({ page }) => {
  const mirror = page.getByTestId('operation-mirror')
  await expect(mirror).toBeVisible()
  await expect(mirror).toBeDisabled()
  await expect(mirror).toHaveAttribute('title', 'Select exactly 1 solid')

  await placeAndSelectCube(page)
  await expect(mirror).toBeEnabled()

  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.78, fy: 0.28 })
  await closeLibrary(page)
  await clickViewportAt(page, 0.5, 0.36)
  await clickViewportAt(page, 0.78, 0.24, { shift: true })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await expect(mirror).toBeDisabled()
})

test('Mirror adds a reflected copy: two bodies, original untouched, copy selected', async ({ page }) => {
  const original = await placeAndSelectCube(page)

  await page.getByTestId('operation-mirror').click()
  const popover = page.getByTestId('mirror-popover')
  await expect(popover).toBeVisible()
  await expect(page.getByTestId('mirror-plane')).toHaveValue('0')

  await page.getByTestId('mirror-axis').selectOption('x')
  await page.getByTestId('mirror-plane').fill('100')
  await page.getByTestId('mirror-commit').click()
  await expect(popover).toHaveCount(0)

  const viewport = page.getByTestId('viewport')
  await expect(viewport).toHaveAttribute('data-body-count', '2')
  await expect(viewport).toHaveAttribute('data-selected-count', '1')

  const bodies = await sceneBodies(page)
  const before = bodies.find((body) => body.id === original.id)
  const copy = bodies.find((body) => body.id !== original.id)
  expect(before?.center).toEqual(original.center)
  expect(copy).toBeDefined()
  expect(copy.center[0]).toBeCloseTo(200 - original.center[0], 1)
  expect(copy.center[1]).toBeCloseTo(original.center[1], 1)
  expect(copy.center[2]).toBeCloseTo(original.center[2], 1)
  // The copy is the selection, the original is not.
  await expect(viewport).toHaveAttribute('data-selected-id', copy.id)
})

test('Mirror is one undo step: undo removes only the copy', async ({ page }) => {
  const original = await placeAndSelectCube(page)
  await page.getByTestId('operation-mirror').click()
  await page.getByTestId('mirror-plane').fill('100')
  await page.getByTestId('mirror-commit').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')

  await page.getByTestId('undo-button').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  const [only] = await sceneBodies(page)
  expect(only.id).toBe(original.id)
  expect(only.center).toEqual(original.center)
})
