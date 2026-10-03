// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, startMovie, endMovie, shot, settle } from './support.js'

/**
 * Docs media for `docs/mirror.md` (`TODO/docs-012`): the Mirror popover as a still, the
 * operation as a movie, and the finished pair orbited to show the symmetry. Laptop,
 * Chromium only.
 *
 * The movie ends by asserting its end state against the kernel's own measurements: three
 * bodies, the original untouched, and the copy's centre X the negation of the original's
 * (Y and Z unchanged), with the kernel's re-measure awaited before the result frame. Not an
 * acceptance check: scenario 16 is driven by hand.
 */
test.describe('docs media: mirror', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  /**
   * Canvas fractions from pixel positions in a 1440x900 laptop screenshot (the viewport
   * canvas is 950x847 at 210,53), so each point is readable against the picture.
   *
   * @param {number} x
   * @param {number} y
   */
  const at = (x, y) => ({ fx: (x - 210) / 950, fy: (y - 53) / 847 })

  // plate-and-lug.ndjson at the default camera: the lug's front-left face, and empty floor.
  const LUG = at(930, 540)
  const EMPTY = at(1000, 770)

  /** @param {import('@playwright/test').Page} page */
  const viewport = (page) => page.getByTestId('viewport')

  const canvasPoint = async (page, { fx, fy }) => {
    const b = await page.getByTestId('viewport-canvas').boundingBox()
    return { x: b.x + b.width * fx, y: b.y + b.height * fy }
  }

  const glideTo = async (page, point) => {
    await page.mouse.move(point.x, point.y, { steps: 10 })
    await page.waitForTimeout(150)
  }

  /** A human-paced real click on the canvas. */
  const click = async (page, at) => {
    await glideTo(page, await canvasPoint(page, at))
    await page.mouse.down()
    await page.waitForTimeout(80)
    await page.mouse.up()
    await page.waitForTimeout(350)
  }

  /** Glide to a control and press it with the real mouse. */
  const press = async (page, testId) => {
    const el = page.getByTestId(testId)
    const b = await el.boundingBox()
    await glideTo(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
    await page.waitForTimeout(200)
    await el.click()
  }

  const openScene = async (page) => {
    await openApp(page)
    await loadScene(page, 'plate-and-lug.ndjson', 2)
  }

  /** The scene's bodies once the kernel worker has measured every one (volume attribute lands last). */
  const bodies = async (page) => {
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[data-testid="scene-bodies"] li')].every((n) => n.hasAttribute('data-body-volume')),
    )
    return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
      nodes.map((n) => ({
        id: n.getAttribute('data-body-id'),
        op: n.getAttribute('data-body-op'),
        center: (n.getAttribute('data-body-center') ?? '').split(',').map(Number),
        bounds: (n.getAttribute('data-body-bounds') ?? '').split(',').map(Number),
      })),
    )
  }

  /** Select the lug, open Mirror, pick the X plane at 0. */
  const openMirrorOnLug = async (page) => {
    await click(page, LUG)
    await expect(viewport(page)).toHaveAttribute('data-selected-id', 'lug-1')
    await expect(page.getByTestId('operation-mirror')).toBeEnabled()
    await press(page, 'operation-mirror')
    await expect(page.getByTestId('mirror-popover')).toBeVisible()
  }

  test('mirror-popover still', async ({ page }) => {
    await openScene(page)
    await openMirrorOnLug(page)
    await page.getByTestId('mirror-axis').selectOption('x')
    await expect(page.getByTestId('mirror-plane')).toHaveValue('0')
    await shot(page, 'mirror-popover.png', { locator: page.getByTestId('mirror-popover') })
  })

  test('mirror-operation', { tag: '@movie' }, async ({ page }) => {
    await openScene(page)
    const [plateBefore, lugBefore] = await bodies(page)
    await startMovie(page, 'mirror-operation')
    await openMirrorOnLug(page)
    await page.waitForTimeout(500)
    // Show the choice being made: another plane first, then back to X.
    await page.getByTestId('mirror-axis').selectOption('y')
    await page.waitForTimeout(500)
    await page.getByTestId('mirror-axis').selectOption('x')
    await page.waitForTimeout(500)
    await press(page, 'mirror-commit')
    await expect(page.getByTestId('mirror-popover')).toHaveCount(0)
    await expect(viewport(page)).toHaveAttribute('data-body-count', '3')
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '1')
    const after = await bodies(page)
    const copy = after.find((b) => b.id !== plateBefore.id && b.id !== lugBefore.id)
    expect(copy, 'a new body, the reflected copy').toBeDefined()
    await expect(viewport(page)).toHaveAttribute('data-selected-id', copy.id)
    // The copy sits at the negated X; Y and Z are unchanged.
    expect(copy.center[0]).toBeCloseTo(-lugBefore.center[0], 2)
    expect(copy.center[1]).toBeCloseTo(lugBefore.center[1], 2)
    expect(copy.center[2]).toBeCloseTo(lugBefore.center[2], 2)
    // Nothing else moved.
    expect(after.find((b) => b.id === lugBefore.id).bounds).toEqual(lugBefore.bounds)
    expect(after.find((b) => b.id === plateBefore.id).bounds).toEqual(plateBefore.bounds)
    await settle(page)
    await page.waitForTimeout(1200)
    await endMovie(page, 'mirror-operation', { fps: 10, width: 640 })
  })

  test('mirror-result still', async ({ page }) => {
    await openScene(page)
    await openMirrorOnLug(page)
    await press(page, 'mirror-commit')
    await expect(viewport(page)).toHaveAttribute('data-body-count', '3')
    const [plate, lug, copy] = await bodies(page)
    expect(copy.center[0]).toBeCloseTo(-lug.center[0], 2)
    // Orbit to look down onto the pair and back off a little, so both sides sit clear of the toolbar.
    for (let i = 0; i < 3; i++) await page.getByTestId('nav-step-up').click()
    for (let i = 0; i < 3; i++) await page.getByTestId('nav-zoom-out').click()
    await click(page, EMPTY)
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '0')
    expect(plate.id).toBe('plate-1')
    await shot(page, 'mirror-result.png')
  })
})
