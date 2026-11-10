// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, startMovie, endMovie, shot, settle, humanDrag } from './support.js'
import { featherShapedThreeMf } from '../../src/io/__fixtures__/threeMf.js'

/**
 * Docs media for `docs/import.md`'s **Importing a model with its parts: 3MF** (`TODO/io-024`,
 * through File → Import model… since `TODO/ui-107`): the Objects list expanded under an imported
 * 3MF model, one part selected, as a still; and import, place, drill into one part and Align a
 * Cube against it, as a movie. The
 * fixture is generated (`src/io/__fixtures__/threeMf.js`), shaped like a FreeCAD export of the
 * Adafruit Feather: a plate and a box placed twice, unnamed, so the parts are `Part 1` … `Part 3`.
 * No third-party model is used. Laptop, Chromium.
 *
 * Every movie ends by asserting its end state (the popover naming a part, then the Cube moved), so
 * a click that silently did nothing fails instead of publishing a GIF of nothing.
 */
test.describe('docs media: import a 3MF with its parts', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  const featherFile = async () => ({ name: 'feather.3mf', mimeType: 'model/3mf', buffer: Buffer.from(await featherShapedThreeMf()) })

  /** Glide to a control with the real mouse and press it. */
  const glideAndClick = async (page, testid) => {
    const el = page.getByTestId(testid)
    const b = await el.boundingBox()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
    await page.waitForTimeout(250)
    await el.click()
  }

  /**
   * File → Import model…, choose the fixture, then move the ghost to `at` and click to place it.
   *
   * @param {import('@playwright/test').Page} page
   * @param {{ x: number, y: number }} at
   */
  const importFeather = async (page, at) => {
    await glideAndClick(page, 'file-menu-button')
    await expect(page.getByTestId('file-menu')).toBeVisible()
    const chooser = page.waitForEvent('filechooser')
    await glideAndClick(page, 'file-import-model')
    await (await chooser).setFiles(await featherFile())
    await expect(page.getByTestId('placement-chip')).toBeVisible()
    await page.mouse.move(at.x - 120, at.y - 60, { steps: 6 })
    await page.mouse.move(at.x, at.y, { steps: 24 })
    await page.waitForTimeout(400)
    await page.mouse.down()
    await page.waitForTimeout(60)
    await page.mouse.up()
    await expect(page.getByTestId('placement-chip')).toHaveCount(0)
  }

  /** The canvas point at a fraction of its box. */
  const canvasAt = async (page, fx, fy) => {
    const c = await page.getByTestId('viewport-canvas').boundingBox()
    return { x: c.x + c.width * fx, y: c.y + c.height * fy }
  }

  /** A point on bare canvas: the first candidate nothing (a toolbar, a panel) covers. */
  const emptyGround = async (page) => {
    const found = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="viewport-canvas"]')
      const box = canvas.getBoundingClientRect()
      for (const [fx, fy] of [[0.12, 0.3], [0.95, 0.3], [0.12, 0.45], [0.95, 0.45], [0.5, 0.05]]) {
        const x = box.left + box.width * fx
        const y = box.top + box.height * fy
        if (document.elementFromPoint(x, y) === canvas) return { x, y }
      }
      return null
    })
    if (found === null) throw new Error('no bare canvas to click')
    return found
  }

  /** A visible click with the real mouse, optionally holding Shift. */
  const clickAt = async (page, point, { shift = false } = {}) => {
    await page.mouse.move(point.x, point.y, { steps: 14 })
    await page.waitForTimeout(200)
    if (shift) await page.keyboard.down('Shift')
    await page.mouse.down()
    await page.waitForTimeout(60)
    await page.mouse.up()
    if (shift) await page.keyboard.up('Shift')
    await page.waitForTimeout(500)
  }

  /** Drag a Library row to a canvas point at human speed. */
  const dragRowTo = async (page, testid, to) => {
    const row = page.getByTestId(testid)
    await row.scrollIntoViewIfNeeded()
    const rb = await row.boundingBox()
    await humanDrag(page, { x: rb.x + rb.width / 2, y: rb.y + rb.height / 2 }, to)
  }

  test('import-3mf-parts still', async ({ page }) => {
    await openApp(page)
    await importFeather(page, await canvasAt(page, 0.45, 0.55))
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    const id = /** @type {string} */ (await page.locator('[data-testid="scene-bodies"] li').first().getAttribute('data-body-id'))
    const list = page.getByTestId('object-list')
    if (!(await list.isVisible())) await page.getByTestId('inspector-objects-header').click()
    const expand = page.getByTestId(`objects-expand-${id}`)
    if ((await expand.getAttribute('aria-expanded')) !== 'true') await expand.click()
    await expect(page.locator(`[data-testid^="objects-part-item-${id}-"]`)).toHaveCount(3)
    await page.getByTestId(`objects-part-${id}-Part 2`).click()
    await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('Part 2')
    // The list folds with the selection; open it again, as a person reading it would.
    if (!(await list.isVisible())) await page.getByTestId('inspector-objects-header').click()
    if ((await expand.getAttribute('aria-expanded')) !== 'true') await expand.click()
    await expect(page.locator(`[data-testid^="objects-part-item-${id}-"]`)).toHaveCount(3)
    await settle(page)
    await shot(page, 'import-3mf-parts.png', { locator: page.getByTestId('inspector') })
  })

  test('import-3mf-align', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    // The Cube is already in the scene, to the right: the movie is about the 3MF.
    await dragRowTo(page, 'library-row-primitive.cuboid', await canvasAt(page, 0.78, 0.6))
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    const cubeId = /** @type {string} */ (await page.locator('[data-testid="scene-bodies"] li').first().getAttribute('data-body-id'))
    await settle(page)
    await startMovie(page, 'import-3mf-align')
    const drop = await canvasAt(page, 0.38, 0.55)
    await importFeather(page, drop)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
    const featherId = (await page.locator('[data-testid="scene-bodies"] li').evaluateAll((items) =>
      items.map((item) => ({ id: item.getAttribute('data-body-id'), op: item.getAttribute('data-body-op') })),
    )).find((body) => body.op === 'user.feather').id
    // Clear the selection on empty ground, then click the model twice: whole, then one part.
    await clickAt(page, await emptyGround(page))
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')
    await clickAt(page, drop)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', featherId)
    await page.waitForTimeout(700)
    await clickAt(page, drop)
    await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText(/^Part \d$/)
    await page.waitForTimeout(900)
    // Shift-click the Cube, then Align: the top line names the part that is measured.
    await clickAt(page, await canvasAt(page, 0.78, 0.6), { shift: true })
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
    const align = page.getByTestId('operation-align')
    const ab = await align.boundingBox()
    await page.mouse.move(ab.x + ab.width / 2, ab.y + ab.height / 2, { steps: 12 })
    await align.click()
    await expect(page.getByTestId('align-operand-moving')).toHaveText(/›\s*Part \d$/)
    await page.waitForTimeout(1500)
    const before = await page.locator(`[data-testid="scene-bodies"] li[data-body-id="${featherId}"]`).getAttribute('data-body-center')
    const xCenter = page.getByTestId('align-x-center')
    const xb = await xCenter.boundingBox()
    await page.mouse.move(xb.x + xb.width / 2, xb.y + xb.height / 2, { steps: 10 })
    await xCenter.click()
    await expect(page.locator(`[data-testid="scene-bodies"] li[data-body-id="${featherId}"]`)).not.toHaveAttribute('data-body-center', String(before))
    expect(cubeId).not.toBe(featherId)
    await page.waitForTimeout(1200)
    await endMovie(page, 'import-3mf-align', { fps: 10, width: 640 })
  })
})
