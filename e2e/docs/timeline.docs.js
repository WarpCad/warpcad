// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, startMovie, endMovie, shot, settle } from './support.js'

/**
 * Docs media for `docs/timeline.md` (`TODO/docs-015`): the History panel, its toggle, a
 * boolean row naming both operands (`core-036`) and the status strips as stills; rewinding
 * by clicking rows and editing an earlier step (scenario 12's shape, `data-004`) as movies.
 * Laptop, Chromium only.
 *
 * Every movie asserts the History row count (the toggle's `data-step-count`, and the rows
 * actually rendered) and the viewport's body count at each beat, so a click that silently
 * did nothing fails instead of publishing a GIF of a still scene. Not an acceptance check:
 * scenario 12 is driven by hand.
 */
test.describe('docs media: timeline', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  // cube-and-cylinder at the default camera: the cube's lower-left face (clear of the cylinder's gizmo) and the cylinder's top cap.
  const CUBE_SIDE = { fx: 0.38, fy: 0.7 }
  const CYL_TOP = { fx: 0.499, fy: 0.252 }

  /** @param {import('@playwright/test').Page} page */
  const viewport = (page) => page.getByTestId('viewport')
  const rows = (/** @type {import('@playwright/test').Page} */ page) => page.locator('[data-testid^="timeline-row-"]')

  const canvasPoint = async (page, { fx, fy }) => {
    const b = await page.getByTestId('viewport-canvas').boundingBox()
    return { x: b.x + b.width * fx, y: b.y + b.height * fy }
  }

  const glideTo = async (page, point) => {
    await page.mouse.move(point.x, point.y, { steps: 14 })
    await page.waitForTimeout(200)
  }

  /** A human-paced real click on the canvas; Shift held for an added selection. */
  const clickCanvas = async (page, at, { shift = false } = {}) => {
    await glideTo(page, await canvasPoint(page, at))
    if (shift) await page.keyboard.down('Shift')
    await page.mouse.down()
    await page.waitForTimeout(80)
    await page.mouse.up()
    if (shift) await page.keyboard.up('Shift')
    await page.waitForTimeout(350)
  }

  /** Glide to a control and press it with the real mouse. */
  const press = async (page, testId) => {
    const el = page.getByTestId(testId)
    await el.scrollIntoViewIfNeeded()
    const b = await el.boundingBox()
    await glideTo(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
    await page.waitForTimeout(200)
    await el.click()
  }

  const openScene = async (page, fixture, bodies) => {
    await openApp(page)
    await loadScene(page, fixture, bodies)
  }

  /** Open History and wait for the expected number of rows. */
  const openHistory = async (page, count) => {
    await press(page, 'timeline-toggle')
    await expect(page.getByTestId('timeline-panel')).toBeVisible()
    await expect(rows(page)).toHaveCount(count)
    await expect(page.getByTestId('timeline-toggle')).toHaveAttribute('data-step-count', String(count))
  }

  /** The measured bodies once the kernel worker has reported every one's volume. */
  const bodies = async (page) => {
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[data-testid="scene-bodies"] li')].every((n) => n.hasAttribute('data-body-volume')),
    )
    return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
      nodes.map((n) => ({
        id: n.getAttribute('data-body-id'),
        op: n.getAttribute('data-body-op'),
        volume: Number(n.getAttribute('data-body-volume')),
        bounds: (n.getAttribute('data-body-bounds') ?? '').split(',').map(Number),
      })),
    )
  }

  const bodyCount = (page, n) => expect(viewport(page)).toHaveAttribute('data-body-count', String(n))

  test('timeline-panel still', async ({ page }) => {
    await openScene(page, 'history-five.ndjson', 2)
    await openHistory(page, 5)
    // The dock is ~220px tall and holds four rows; scroll the list to its end so the
    // boolean, mirror and colour steps are all in the picture.
    await page.getByTestId('timeline-rows').evaluate((el) => (el.scrollTop = el.scrollHeight))
    await expect(page.getByTestId('timeline-row-5')).toBeInViewport()
    await shot(page, 'timeline-panel.png', { locator: page.getByTestId('timeline-panel') })
  })

  test('timeline-toggle still', async ({ page }) => {
    await openScene(page, 'history-five.ndjson', 2)
    await expect(page.getByTestId('timeline-toggle')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('timeline-toggle')).toHaveAttribute('data-step-count', '5')
    await shot(page, 'timeline-toggle.png', { locator: page.getByTestId('timeline-toggle') })
  })

  test('timeline-boolean-row still', async ({ page }) => {
    await openScene(page, 'history-five.ndjson', 2)
    await openHistory(page, 5)
    const row = page.getByTestId('timeline-row-3')
    // core-036: the row names both operands, not just the first.
    await expect(row).toContainText('Subtract')
    await expect(row).toContainText('Cube 1')
    await expect(row).toContainText('Cylinder 1')
    await shot(page, 'timeline-boolean-row.png', { locator: row })
  })

  test('timeline-strips still', async ({ page }) => {
    await openScene(page, 'history-five.ndjson', 2)
    await openHistory(page, 5)
    // Roll back to step 2, then preview step 1: both strips stack under the top bar.
    await page.getByTestId('timeline-row-2').click()
    await page.getByTestId('timeline-rollback').click()
    await expect(page.getByTestId('timeline-rollback-text')).toContainText('Rolled back to step 2 of 5')
    await page.getByTestId('timeline-row-1').click()
    await expect(page.getByTestId('timeline-preview-strip')).toContainText('Previewing step 1 of 5')
    await expect(page.getByTestId('timeline-rollback-strip')).toBeVisible()
    await shot(page, 'timeline-strips.png', { locator: page.locator('.strips') })
  })

  test('timeline-rewind', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'history-five.ndjson', 2)
    await startMovie(page, 'timeline-rewind')
    await openHistory(page, 5)
    await page.waitForTimeout(600)
    // Row 1 (Cube 1 placed): the model as it was after that step alone.
    await press(page, 'timeline-row-1')
    await expect(page.getByTestId('timeline-preview-strip')).toContainText('Previewing step 1 of 5')
    await bodyCount(page, 1)
    await page.waitForTimeout(900)
    // Row 2: the cylinder joins.
    await press(page, 'timeline-row-2')
    await expect(page.getByTestId('timeline-preview-strip')).toContainText('Previewing step 2 of 5')
    await bodyCount(page, 2)
    await page.waitForTimeout(900)
    // Row 3: the Subtract has merged them into one drilled solid.
    await press(page, 'timeline-row-3')
    await bodyCount(page, 1)
    await page.waitForTimeout(900)
    // The last row is the live model: the preview strip goes and everything is back.
    await press(page, 'timeline-row-5')
    await expect(page.getByTestId('timeline-preview-strip')).toHaveCount(0)
    await bodyCount(page, 2)
    await expect(rows(page)).toHaveCount(5)
    await expect(page.getByTestId('timeline-toggle')).toHaveAttribute('data-step-count', '5')
    await page.waitForTimeout(1000)
    await endMovie(page, 'timeline-rewind', { fps: 10, width: 640 })
  })

  test('timeline-edit-step', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'cube-and-cylinder.ndjson', 2)
    // Build the example's three steps by hand: Cube 1, Cylinder 1, then Subtract.
    await clickCanvas(page, CUBE_SIDE)
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '1')
    await clickCanvas(page, CYL_TOP, { shift: true })
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '2')
    await startMovie(page, 'timeline-edit-step')
    await press(page, 'operation-subtract')
    await bodyCount(page, 1)
    const [before] = await bodies(page)
    // A 40 mm cube minus a d24 cylinder: 64000 - pi * 12^2 * 40.
    expect(before.volume).toBeCloseTo(64000 - Math.PI * 144 * 40, -3)
    await openHistory(page, 3)
    await page.waitForTimeout(600)
    // Click Cube 1: the model rewinds to just the cube.
    await press(page, 'timeline-row-1')
    await expect(page.getByTestId('timeline-preview-strip')).toContainText('Previewing step 1 of 3')
    await bodyCount(page, 1)
    await page.waitForTimeout(700)
    await press(page, 'timeline-edit')
    await expect(page.getByTestId('timeline-edit-form')).toBeVisible()
    for (const axis of [0, 1, 2]) {
      const field = page.getByTestId(`timeline-field-size-${axis}`)
      await field.click()
      await field.press('ControlOrMeta+a')
      await page.keyboard.type('30', { delay: 200 })
    }
    await page.waitForTimeout(500)
    await press(page, 'timeline-apply')
    // The cylinder and the Subtract replayed on the 30 mm cube.
    await expect(page.getByTestId('timeline-preview-strip')).toHaveCount(0)
    await expect(page.getByTestId('timeline-edit-form')).toHaveCount(0)
    await expect(rows(page)).toHaveCount(3)
    await bodyCount(page, 1)
    await expect.poll(async () => (await bodies(page))[0]?.volume).toBeCloseTo(27000 - Math.PI * 144 * 30, -3)
    const [after] = await bodies(page)
    expect(after.op).toBe('boolean.subtract')
    expect(after.volume).toBeLessThan(before.volume)
    await expect(page.getByTestId('timeline-row-1')).toContainText('Cube 1')
    await page.waitForTimeout(1400)
    await endMovie(page, 'timeline-edit-step', { fps: 10, width: 640 })
  })
})
