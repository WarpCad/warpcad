// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, startMovie, endMovie, shot, settle } from './support.js'

/**
 * Docs media for `docs/snap-align.md` (`TODO/docs-012`): the Snap popover as a still, then
 * Snap, Align and Snap-against-a-named-part as movies. Laptop, Chromium only.
 *
 * Every movie selects with real mouse clicks and ends by asserting its end state against
 * the kernel's own measurements: after Snap the two bodies share a face plane within 0.01 mm
 * and neither merged (still two bodies), after Align the lug's centre equals the plate's on
 * the chosen axis and nothing else moved, and the sub-part movie checks the screw's centre
 * against the Inspector's own reading of the hole it was snapped to. The wait for the
 * kernel's re-measure (a changed `data-body-bounds`) comes before every result frame. Not
 * an acceptance check: scenario 3 is driven by hand.
 */
test.describe('docs media: snap and align', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  /** Face-plane tolerance, mm: the kernel works in doubles, the attribute prints two decimals. */
  const TOL = 0.01

  /**
   * Canvas fractions from pixel positions in a 1440x900 laptop screenshot (the viewport
   * canvas is 950x847 at 210,53), so each point is readable against the picture.
   *
   * @param {number} x
   * @param {number} y
   */
  const at = (x, y) => ({ fx: (x - 210) / 950, fy: (y - 53) / 847 })

  // plate-and-lug.ndjson at the default camera.
  const LUG = at(930, 540)
  const PLATE = at(520, 470)
  // pi-and-screw.ndjson: the screw's shank.
  const SCREW = at(505, 530)

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

  /** A human-paced real click on the canvas; Shift held for an added selection. */
  const click = async (page, at, { shift = false } = {}) => {
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
    const b = await el.boundingBox()
    await glideTo(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
    await page.waitForTimeout(200)
    await el.click()
  }

  const openScene = async (page, fixture) => {
    await openApp(page)
    await loadScene(page, fixture, 2)
  }

  /** The Objects list, opened (it is already open when nothing is selected). */
  const openObjectList = async (page) => {
    const list = page.getByTestId('object-list')
    if (await list.isVisible()) return
    await page.getByTestId('inspector-objects-header').click()
    await expect(list).toBeVisible()
  }

  /** The scene's bodies once the kernel worker has measured every one (volume attribute lands last). */
  const bodies = async (page) => {
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[data-testid="scene-bodies"] li')].every((n) => n.hasAttribute('data-body-volume')),
    )
    const list = await page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
      nodes.map((n) => ({
        id: n.getAttribute('data-body-id'),
        op: n.getAttribute('data-body-op'),
        center: (n.getAttribute('data-body-center') ?? '').split(',').map(Number),
        bounds: (n.getAttribute('data-body-bounds') ?? '').split(',').map(Number),
      })),
    )
    return Object.fromEntries(list.map((b) => [b.id, b]))
  }

  /** Wait for a body's bounds to change from `before` (the kernel re-measure), then return the scene. */
  const afterMove = async (page, id, before) => {
    await expect
      .poll(async () => (await bodies(page))[id].bounds.join(','), { timeout: 10000 })
      .not.toBe(before[id].bounds.join(','))
    await settle(page)
    return bodies(page)
  }

  /** Click the lug (moving, first), Shift-click the plate (reference, second). */
  const selectLugThenPlate = async (page) => {
    await click(page, LUG)
    await expect(viewport(page)).toHaveAttribute('data-selected-id', 'lug-1')
    await click(page, PLATE, { shift: true })
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '2')
    await expect(page.getByTestId('operation-snap')).toBeEnabled()
    await expect(page.getByTestId('operation-align')).toBeEnabled()
  }

  test('snap-popover still', async ({ page }) => {
    await openScene(page, 'plate-and-lug.ndjson')
    await selectLugThenPlate(page)
    await press(page, 'operation-snap')
    await expect(page.getByTestId('snap-align-popover')).toBeVisible()
    await expect(page.getByTestId('snap-align-popover')).toHaveAttribute('data-op', 'group.snap')
    await expect(page.getByTestId('snap-align-operands')).toContainText('Lug 1')
    await expect(page.getByTestId('snap-align-operands')).toContainText('Plate 1')
    await page.getByTestId('snap-align-axis-x').check()
    await page.getByTestId('snap-align-orientation').selectOption('outside-')
    await shot(page, 'snap-popover.png', { locator: page.getByTestId('snap-align-popover') })
  })

  test('snap-operation', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'plate-and-lug.ndjson')
    const before = await bodies(page)
    await startMovie(page, 'snap-operation')
    await selectLugThenPlate(page)
    await page.waitForTimeout(400)
    await press(page, 'operation-snap')
    const popover = page.getByTestId('snap-align-popover')
    await expect(popover).toBeVisible()
    await page.waitForTimeout(500)
    await glideTo(page, await page.getByTestId('snap-align-axis-x').evaluate((el) => {
      const b = el.getBoundingClientRect()
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    }))
    await page.getByTestId('snap-align-axis-x').check()
    await page.waitForTimeout(300)
    await page.getByTestId('snap-align-orientation').selectOption('outside-')
    await page.waitForTimeout(500)
    await press(page, 'snap-align-commit')
    await expect(popover).toHaveCount(0)
    const after = await afterMove(page, 'lug-1', before)
    // Two bodies still: Snap moves one against the other and merges nothing.
    await expect(viewport(page)).toHaveAttribute('data-body-count', '2')
    expect(after['plate-1'].bounds).toEqual(before['plate-1'].bounds) // the reference never moved
    // The lug's low-X face now lies in the plate's high-X face plane.
    expect(Math.abs(after['lug-1'].bounds[0] - after['plate-1'].bounds[3])).toBeLessThan(TOL)
    // Only X was checked: Y and Z are where they were.
    expect(after['lug-1'].center[1]).toBeCloseTo(before['lug-1'].center[1], 2)
    expect(after['lug-1'].center[2]).toBeCloseTo(before['lug-1'].center[2], 2)
    await page.waitForTimeout(1200)
    await endMovie(page, 'snap-operation', { fps: 10, width: 640 })
  })

  test('align-operation', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'plate-and-lug.ndjson')
    const before = await bodies(page)
    await startMovie(page, 'align-operation')
    await selectLugThenPlate(page)
    await page.waitForTimeout(400)
    await press(page, 'operation-align')
    const popover = page.getByTestId('snap-align-popover')
    await expect(popover).toHaveAttribute('data-op', 'group.align')
    await page.waitForTimeout(500)
    await glideTo(page, await page.getByTestId('snap-align-axis-y').evaluate((el) => {
      const b = el.getBoundingClientRect()
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    }))
    await page.getByTestId('snap-align-axis-y').check()
    await page.waitForTimeout(500)
    await press(page, 'snap-align-commit')
    await expect(popover).toHaveCount(0)
    const after = await afterMove(page, 'lug-1', before)
    await expect(viewport(page)).toHaveAttribute('data-body-count', '2')
    expect(after['plate-1'].bounds).toEqual(before['plate-1'].bounds)
    // Centred on the plate along Y; X and Z (unchecked) did not move.
    expect(Math.abs(after['lug-1'].center[1] - after['plate-1'].center[1])).toBeLessThan(TOL)
    expect(after['lug-1'].center[0]).toBeCloseTo(before['lug-1'].center[0], 2)
    expect(after['lug-1'].center[2]).toBeCloseTo(before['lug-1'].center[2], 2)
    await page.waitForTimeout(1200)
    await endMovie(page, 'align-operation', { fps: 10, width: 640 })
  })

  test('snap-subpart-operand', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'pi-and-screw.ndjson')
    const before = await bodies(page)
    const num = async (testId) => Number((await page.getByTestId(testId).inputValue()).replace(/[^\d.+-]/g, ''))

    // Read the hole's own position from the Inspector first (setup, not recorded): a hole is
    // hidden inside the board, so the Objects list is the way to reach it.
    await openObjectList(page)
    await page.getByTestId('objects-expand-pi-1').click()
    const holeRow = page.getByTestId('objects-part-item-pi-1-hole1')
    await holeRow.scrollIntoViewIfNeeded()
    await page.getByTestId('objects-part-pi-1-hole1').click()
    await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('hole1')
    const hole = { x: await num('inspector-position-x'), y: await num('inspector-position-y') }
    await click(page, at(1000, 770))
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '0')
    // Close the Pi's parts again so the movie starts from the collapsed list.
    await page.getByTestId('objects-expand-pi-1').click()
    await expect(holeRow).toHaveCount(0)

    await startMovie(page, 'snap-subpart-operand')
    // The screw first: it is the one that moves.
    await click(page, SCREW)
    await expect(viewport(page)).toHaveAttribute('data-selected-id', 'screw-1')
    await page.waitForTimeout(300)
    // Open the Objects list, open the Pi's parts and tick the hole: the second operand.
    await press(page, 'inspector-objects-header')
    await expect(page.getByTestId('object-list')).toBeVisible()
    await press(page, 'objects-expand-pi-1')
    await holeRow.scrollIntoViewIfNeeded()
    await page.waitForTimeout(250)
    await press(page, 'objects-part-check-pi-1-hole1')
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '2')
    await page.waitForTimeout(250)
    await press(page, 'operation-align')
    const popover = page.getByTestId('snap-align-popover')
    await expect(popover).toHaveAttribute('data-op', 'group.align')
    // The popover names the part it will measure against.
    await expect(page.getByTestId('snap-align-operands')).toContainText('Screw 1')
    await expect(page.getByTestId('snap-align-operands')).toContainText('hole1')
    await page.waitForTimeout(350)
    await page.getByTestId('snap-align-axis-x').check()
    await page.getByTestId('snap-align-axis-y').check()
    await page.waitForTimeout(300)
    await press(page, 'snap-align-commit')
    await expect(popover).toHaveCount(0)
    const after = await afterMove(page, 'screw-1', before)
    await expect(viewport(page)).toHaveAttribute('data-body-count', '2')
    // The screw's axis is on the hole's axis (the Inspector's own reading of hole1), and it
    // did not move in Z. The Pi, the reference, stayed put.
    expect(Math.abs(after['screw-1'].center[0] - hole.x)).toBeLessThan(0.02)
    expect(Math.abs(after['screw-1'].center[1] - hole.y)).toBeLessThan(0.02)
    expect(after['screw-1'].center[2]).toBeCloseTo(before['screw-1'].center[2], 2)
    expect(after['pi-1'].bounds).toEqual(before['pi-1'].bounds)
    await page.waitForTimeout(900)
    await endMovie(page, 'snap-subpart-operand', { fps: 8, width: 640 })
  })
})
