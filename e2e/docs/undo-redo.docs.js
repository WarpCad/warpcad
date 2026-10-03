// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, startMovie, endMovie, humanDrag, shot } from './support.js'

/**
 * Docs media for `docs/undo-redo.md` (`TODO/docs-015`): the Undo/Redo buttons' enabled and
 * disabled states as a still, then Place -> Move -> Undo x2 -> Redo x1 (the buttons and a
 * Ctrl/Cmd+Z keypress) and "a parameter edit is one undo step" (`ui-044`) as movies. Laptop,
 * Chromium only.
 *
 * Every beat asserts the History step count (the toggle's `data-step-count`, which is the
 * row count with the panel closed), the body count and the Undo/Redo tooltips. Not an
 * acceptance check: `data-003`/`ui-044` repros are driven by hand.
 */
test.describe('docs media: undo and redo', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  const CUBE_SIDE = { fx: 0.38, fy: 0.7 }
  const CYL_TOP = { fx: 0.499, fy: 0.252 }

  /** @param {import('@playwright/test').Page} page */
  const viewport = (page) => page.getByTestId('viewport')

  const canvasPoint = async (page, { fx, fy }) => {
    const b = await page.getByTestId('viewport-canvas').boundingBox()
    return { x: b.x + b.width * fx, y: b.y + b.height * fy }
  }

  const glideTo = async (page, point) => {
    await page.mouse.move(point.x, point.y, { steps: 14 })
    await page.waitForTimeout(200)
  }

  const clickCanvas = async (page, at, { shift = false } = {}) => {
    await glideTo(page, await canvasPoint(page, at))
    if (shift) await page.keyboard.down('Shift')
    await page.mouse.down()
    await page.waitForTimeout(80)
    await page.mouse.up()
    if (shift) await page.keyboard.up('Shift')
    await page.waitForTimeout(350)
  }

  const press = async (page, testId) => {
    const el = page.getByTestId(testId)
    const b = await el.boundingBox()
    await glideTo(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
    await page.waitForTimeout(200)
    await el.click()
  }

  const steps = (page, n) => expect(page.getByTestId('timeline-toggle')).toHaveAttribute('data-step-count', String(n))
  const bodyCount = (page, n) => expect(viewport(page)).toHaveAttribute('data-body-count', String(n))
  const num = async (page, testId) => Number((await page.getByTestId(testId).inputValue()).replace(/[°\s]/g, ''))

  const armPoint = async (page, testId, fraction) => {
    await expect(page.getByTestId(testId)).toBeAttached()
    return page.evaluate(
      ({ testId, fraction }) => {
        const el = document.querySelector(`[data-testid="${testId}"]`)
        const rect = document.querySelector('[data-testid="viewport"]').getBoundingClientRect()
        const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((a) => Number(el.getAttribute(a)))
        return { x: rect.left + x1 + (x2 - x1) * fraction, y: rect.top + y1 + (y2 - y1) * fraction }
      },
      { testId, fraction },
    )
  }

  const hubPoint = async (page) =>
    page.evaluate(() => {
      const rect = document.querySelector('[data-testid="viewport"]').getBoundingClientRect()
      const [ox, oy] = document.querySelector('[data-testid="transform-gizmo"]').getAttribute('data-origin').split(',').map(Number)
      return { x: rect.left + ox, y: rect.top + oy }
    })

  test('undo-redo-buttons still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'cube-and-cylinder.ndjson', 2)
    // A freshly loaded model has nothing to undo: both buttons start grey.
    await expect(page.getByTestId('undo-button')).toBeDisabled()
    await expect(page.getByTestId('redo-button')).toBeDisabled()
    await clickCanvas(page, CUBE_SIDE)
    await clickCanvas(page, CYL_TOP, { shift: true })
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '2')
    await page.getByTestId('operation-subtract').click()
    await bodyCount(page, 1)
    // One change made: Undo is live and names it, Redo has nothing to put back.
    await expect(page.getByTestId('undo-button')).toBeEnabled()
    await expect(page.getByTestId('undo-button')).toHaveAttribute('aria-label', /^Undo: /)
    await expect(page.getByTestId('redo-button')).toBeDisabled()
    await shot(page, 'undo-redo-buttons.png', { locator: page.getByTestId('history-controls') })
  })

  test('undo-redo-roundtrip', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await bodyCount(page, 0)
    await steps(page, 0)
    await startMovie(page, 'undo-redo-roundtrip')

    // Place: drag a cube out of the Library.
    const row = await page.getByTestId('library-row-primitive.cuboid').boundingBox()
    const view = await viewport(page).boundingBox()
    await humanDrag(
      page,
      { x: row.x + row.width / 2, y: row.y + row.height / 2 },
      { x: view.x + view.width * 0.5, y: view.y + view.height * 0.5 },
      { steps: 18, ms: 600 },
    )
    await bodyCount(page, 1)
    await steps(page, 1)
    await expect(page.getByTestId('undo-button')).toHaveAttribute('aria-label', /^Undo: Place /)
    const placedX = await num(page, 'inspector-position-x')
    await page.waitForTimeout(500)

    // Move: drag the red arrow outward.
    const hub = await hubPoint(page)
    const from = await armPoint(page, 'gizmo-grab-arm-x', 0.7)
    const len = Math.hypot(from.x - hub.x, from.y - hub.y) || 1
    const to = { x: from.x + ((from.x - hub.x) / len) * 90, y: from.y + ((from.y - hub.y) / len) * 90 }
    await glideTo(page, from)
    await humanDrag(page, from, to, { steps: 18, ms: 600 })
    await expect(viewport(page)).toHaveAttribute('data-transforming', 'false')
    await steps(page, 2)
    await expect(page.getByTestId('undo-button')).toHaveAttribute('aria-label', /^Undo: Move /)
    const movedX = await num(page, 'inspector-position-x')
    expect(Math.abs(movedX - placedX)).toBeGreaterThan(5)
    await page.waitForTimeout(450)

    // Undo #1, with the button: the cube slides back.
    await press(page, 'undo-button')
    await steps(page, 1)
    await expect.poll(() => num(page, 'inspector-position-x')).toBeCloseTo(placedX, 1)
    await bodyCount(page, 1)
    await expect(page.getByTestId('redo-button')).toBeEnabled()
    await expect(page.getByTestId('redo-button')).toHaveAttribute('aria-label', /^Redo: Move /)
    await page.waitForTimeout(500)

    // Undo #2, with the keyboard: the cube itself goes.
    await page.mouse.move(view.x + view.width * 0.8, view.y + view.height * 0.8, { steps: 8 })
    await page.keyboard.press('ControlOrMeta+z')
    await steps(page, 0)
    await bodyCount(page, 0)
    await expect(page.getByTestId('undo-button')).toBeDisabled()
    await page.waitForTimeout(500)

    // Redo once, with the button: the placement returns, the move stays undone.
    await press(page, 'redo-button')
    await steps(page, 1)
    await bodyCount(page, 1)
    await expect(page.getByTestId('redo-button')).toBeEnabled()
    await expect(page.getByTestId('redo-button')).toHaveAttribute('aria-label', /^Redo: Move /)
    await page.waitForTimeout(800)
    await endMovie(page, 'undo-redo-roundtrip', { fps: 8, width: 600 })
  })

  test('undo-param-edit', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'one-cylinder.ndjson', 1)
    await steps(page, 1)
    await clickCanvas(page, { fx: 0.45, fy: 0.5 })
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '1')
    const field = page.getByTestId('inspector-param-diameter')
    await expect(field).toHaveValue('60')
    await startMovie(page, 'undo-param-edit')
    const b = await field.boundingBox()
    await glideTo(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
    await field.click()
    await field.press('ControlOrMeta+a')
    await page.keyboard.type('40', { delay: 220 })
    await page.waitForTimeout(300)
    await page.keyboard.press('Enter')
    await expect(field).toHaveValue('40')
    await bodyCount(page, 1)
    // The edit rewrites the cylinder's own step in place (no new row), however many keystrokes it took.
    await steps(page, 1)
    await expect(page.getByTestId('undo-button')).toHaveAttribute('aria-label', /^Undo: /)
    await page.waitForTimeout(900)
    // One press of Undo puts the whole thing back — and leaves nothing more to undo.
    await press(page, 'undo-button')
    await expect(field).toHaveValue('60')
    await steps(page, 1)
    await bodyCount(page, 1)
    await expect(page.getByTestId('undo-button')).toBeDisabled()
    await expect(page.getByTestId('redo-button')).toBeEnabled()
    await page.waitForTimeout(1200)
    await endMovie(page, 'undo-param-edit', { fps: 12, width: 640 })
  })
})
