// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, startMovie, endMovie, humanDrag, shot, settle, MAX_DIFF_PIXEL_RATIO } from './support.js'

/**
 * Docs media for `docs/primitive-placement.md` (`TODO/docs-009`): the Library panel, a
 * drag-to-place movie, every primitive the Library offers, the mid-drag ghost, snap guides
 * and the text label. Laptop only — the phone Library sheet is `TODO/docs-018`.
 *
 * Every movie ends on a `data-body-count` assertion, so a drag that placed nothing fails
 * instead of publishing a GIF of an empty grid. Not an acceptance check: scenario 1 is still
 * driven by hand.
 */
test.describe('docs media: primitive placement', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  /** @param {import('@playwright/test').Page} page @param {string} op @returns {Promise<{ x: number, y: number }>} */
  const rowCentre = async (page, op) => {
    // Rows further down (Text, Hardware...) start below the panel's fold.
    await page.getByTestId(`library-row-${op}`).scrollIntoViewIfNeeded()
    const b = await page.getByTestId(`library-row-${op}`).boundingBox()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }

  /** A viewport point at fractions of its box. @param {import('@playwright/test').Page} page */
  const viewPoint = async (page, fx, fy) => {
    const b = await page.getByTestId('viewport').boundingBox()
    return { x: b.x + b.width * fx, y: b.y + b.height * fy }
  }

  /** Drag a row out and release at the fractions; a real mouse, human-paced. */
  const place = async (page, op, fx, fy, opts) =>
    humanDrag(page, await rowCentre(page, op), await viewPoint(page, fx, fy), opts)

  /**
   * A still taken while the pointer is held. `shot()` parks the mouse first, which would
   * cancel or move the ghost, so this waits on the ghost attribute and captures directly.
   */
  const heldShot = async (page, name) => {
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-ghost', 'visible')
    await page.waitForTimeout(400)
    await expect(page).toHaveScreenshot(name, {
      animations: 'disabled',
      caret: 'hide',
      mask: [page.getByTestId('save-status')],
      maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
    })
  }

  /** Press a row and drag to a point, leaving the button down. */
  const holdAt = async (page, op, fx, fy) => {
    const from = await rowCentre(page, op)
    const to = await viewPoint(page, fx, fy)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 12 })
    await page.waitForTimeout(150)
  }

  test('library panel', async ({ page }) => {
    await openApp(page)
    await shot(page, 'library-panel.png', { locator: page.getByTestId('library-panel') })
  })

  test('primitive-drag-two', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    const viewport = page.getByTestId('viewport')
    await startMovie(page, 'primitive-drag-two')
    await place(page, 'primitive.cuboid', 0.35, 0.55)
    await expect(viewport).toHaveAttribute('data-body-count', '1')
    await expect(viewport).toHaveAttribute('data-placing', 'false')
    await place(page, 'primitive.cylinder', 0.68, 0.5)
    await expect(viewport).toHaveAttribute('data-body-count', '2')
    await expect(viewport).toHaveAttribute('data-placing', 'false')
    await endMovie(page, 'primitive-drag-two', { fps: 12, width: 640 })
  })

  test('primitive gallery and ghost preview', async ({ page }) => {
    await openApp(page)
    const viewport = page.getByTestId('viewport')
    // Enumerate from the DOM so a new primitive appears here without editing this list.
    // Rows with a data-editor open an editor (Sketch) rather than place a solid.
    const ops = await page.$$eval('[data-testid="library-rows"] [data-op]', (nodes) =>
      nodes.filter((n) => !n.getAttribute('data-editor')).map((n) => n.getAttribute('data-op')),
    )
    expect(ops.length).toBeGreaterThanOrEqual(7)
    for (const [i, op] of ops.entries()) {
      await place(page, op, 0.16 + (0.7 * i) / (ops.length - 1), 0.55, { steps: 10, ms: 300 })
      await expect(viewport).toHaveAttribute('data-body-count', String(i + 1))
    }
    await page.mouse.click(...Object.values(await viewPoint(page, 0.5, 0.9)))
    await shot(page, 'primitive-gallery.png', { locator: viewport })

    // Mid-drag: ghost over the viewport, document unchanged.
    await holdAt(page, 'primitive.sphere', 0.5, 0.3)
    await expect(viewport).toHaveAttribute('data-body-count', String(ops.length))
    await heldShot(page, 'primitive-ghost-preview.png')
    await page.mouse.up()
    await expect(viewport).toHaveAttribute('data-body-count', String(ops.length + 1))
  })

  test('placement snap guides', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    const viewport = page.getByTestId('viewport')
    const guides = page.getByTestId('snap-guides')
    await place(page, 'primitive.cuboid', 0.5, 0.55, { steps: 10, ms: 300 })
    await expect(viewport).toHaveAttribute('data-body-count', '1')

    await startMovie(page, 'placement-snap-guides')
    const from = await rowCentre(page, 'primitive.cylinder')
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    // Far away first, then creep toward the cube until a guide lights up.
    let near = null
    for (let i = 0; i <= 24; i++) {
      const fx = 0.85 - i * 0.0125
      const p = await viewPoint(page, fx, 0.55)
      await page.mouse.move(p.x, p.y, { steps: 3 })
      await page.waitForTimeout(80)
      if (Number(await guides.getAttribute('data-guide-count')) >= 1) {
        near = fx
        break
      }
    }
    expect(near, 'a guide should light up on approach').not.toBeNull()
    await page.waitForTimeout(900)
    await page.mouse.up()
    await expect(viewport).toHaveAttribute('data-body-count', '2')
    await endMovie(page, 'placement-snap-guides', { fps: 12, width: 640 })
  })

  test('placement snap guides still', async ({ page }) => {
    await openApp(page)
    const viewport = page.getByTestId('viewport')
    const guides = page.getByTestId('snap-guides')
    await place(page, 'primitive.cuboid', 0.5, 0.55, { steps: 10, ms: 300 })
    await expect(viewport).toHaveAttribute('data-body-count', '1')
    await holdAt(page, 'primitive.cylinder', 0.85, 0.55)
    for (let i = 0; i <= 24 && Number(await guides.getAttribute('data-guide-count')) < 1; i++) {
      const p = await viewPoint(page, 0.85 - i * 0.0125, 0.55)
      await page.mouse.move(p.x, p.y, { steps: 3 })
      await page.waitForTimeout(80)
    }
    expect(Number(await guides.getAttribute('data-guide-count'))).toBeGreaterThanOrEqual(1)
    await heldShot(page, 'placement-snap-guides-still.png')
    await page.mouse.up()
  })

  test('text label placed', async ({ page }) => {
    await openApp(page)
    const viewport = page.getByTestId('viewport')
    await place(page, 'text.label', 0.5, 0.55, { steps: 10, ms: 300 })
    await expect(viewport).toHaveAttribute('data-body-count', '1')
    await expect(page.getByTestId('inspector-param-text')).toBeVisible()
    await shot(page, 'text-label-placed.png')
  })

  test('sketch row', async ({ page }) => {
    await openApp(page)
    const row = page.locator('[data-testid="library-rows"] [data-editor]:not([data-editor=""])').first()
    await expect(row).toBeVisible()
    await settle(page)
    await shot(page, 'primitive-sketch-row.png', { locator: row })
  })
})
