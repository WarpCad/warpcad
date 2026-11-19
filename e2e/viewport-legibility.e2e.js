// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * TODO/ui-130: what a selected part's overlay looks like at the sizes where it is hardest to read.
 * Dimension labels stay inside the viewport while the camera orbits, and at phone width the ring's
 * wall and core strokes are wide enough to read as two strokes. Drives the real app at `/` with the
 * real mouse.
 */

/** @param {import('@playwright/test').Page} page */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (await rows.isVisible()) return
  await page.getByTestId('library-tab').click()
  await expect(rows).toBeVisible()
}

/** @param {import('@playwright/test').Page} page */
async function placeCube(page) {
  await openLibrary(page)
  const row = page.getByTestId('library-row-primitive.cuboid')
  await row.scrollIntoViewIfNeeded()
  const from = await row.boundingBox()
  const to = await page.getByTestId('viewport').boundingBox()
  if (!from || !to) throw new Error('no library row or viewport')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width * 0.5, to.y + to.height * 0.4 - 30, { steps: 8 })
  await page.mouse.move(to.x + to.width * 0.5, to.y + to.height * 0.4, { steps: 4 })
  await page.mouse.up()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  await placeCube(page)
})

test('every dimension label stays inside the viewport while the camera orbits', async ({ page }) => {
  const view = page.getByTestId('viewport')
  const box = await view.boundingBox()
  if (!box) throw new Error('no viewport')
  // Orbit with empty-canvas drags from the lower-left corner, away from the gizmo and the part.
  const start = { x: box.x + 24, y: box.y + box.height - 120 }
  let checked = 0
  for (const [dx, dy] of [[70, 0], [70, 30], [60, -40], [90, 10], [50, 50], [80, -20]]) {
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + dx, start.y + dy, { steps: 8 })
    await page.mouse.up()
    for (const axis of ['x', 'y', 'z']) {
      const label = page.getByTestId(`dimension-label-${axis}`)
      if (!(await label.isVisible())) continue
      const at = await label.boundingBox()
      if (!at) continue
      checked += 1
      expect(at.x, `${axis} label left edge`).toBeGreaterThanOrEqual(box.x - 1)
      expect(at.x + at.width, `${axis} label right edge`).toBeLessThanOrEqual(box.x + box.width + 1)
      expect(at.y, `${axis} label top edge`).toBeGreaterThanOrEqual(box.y - 1)
      expect(at.y + at.height, `${axis} label bottom edge`).toBeLessThanOrEqual(box.y + box.height + 1)
    }
  }
  expect(checked).toBeGreaterThan(0)
})

test('at phone width the gizmo ring is a wide wall with a distinct core', async ({ page }, info) => {
  test.skip(!info.project.name.endsWith('-phone'), 'the wider cue is a phone-width rule')
  // The cube existing does not mean its gizmo is drawn yet; under a loaded full run the read came first.
  await page.locator('.tgizmo__ring').first().waitFor({ state: 'attached' })
  const strokes = await page.evaluate(() => {
    const ring = document.querySelector('.tgizmo__ring')
    const core = document.querySelector('.tgizmo__ring-core')
    return {
      ring: ring ? parseFloat(getComputedStyle(ring).strokeWidth) : 0,
      core: core ? parseFloat(getComputedStyle(core).strokeWidth) : 0,
    }
  })
  expect(strokes.ring).toBeGreaterThanOrEqual(5)
  expect(strokes.core).toBeGreaterThanOrEqual(1.5)
  expect(strokes.ring / strokes.core).toBeGreaterThan(3)
})
