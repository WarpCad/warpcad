// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, startMovie, endMovie, shot, settle } from './support.js'

/**
 * Docs media for `docs/getting-started.md` and the README hero (`TODO/docs-019`): the whole
 * first-five-minutes flow in one take (`tour`), and one still per step. Laptop, Chromium only.
 *
 * Steps: 1 place a Cube and a Cylinder (and type the Cylinder's diameter), 2 select the Cube
 * then the Cylinder, 3 Subtract, 4 nudge the result with the gizmo, 5 export an STL.
 *
 * Every step asserts its final state: the body count, a hole present (the result's volume is
 * the cube's minus the cylinder's overlap, found by comparing volumes because the app exposes
 * no vertex count), the gizmo drag moving the document's X position, and a real `download`
 * event carrying the `.stl` name. The tour mirrors the shape of acceptance scenarios 1, 4 and
 * 11 and is NOT a run of them; those are driven by hand.
 */
test.describe('docs media: getting started tour', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  const CUBE_VOLUME = 64000
  const HOLE_DIAMETER = 20 // mm, typed into the Inspector
  const HOLE_VOLUME = Math.PI * (HOLE_DIAMETER / 2) ** 2 * 40 // the cylinder crosses the 40 mm cube
  const DROP = { fx: 0.45, fy: 0.62 }

  /** @param {import('@playwright/test').Page} page */
  const viewport = (page) => page.getByTestId('viewport')

  const glideTo = async (page, point, dwell) => {
    await page.mouse.move(point.x, point.y, { steps: dwell ? 14 : 3 })
    if (dwell) await page.waitForTimeout(150)
  }

  const centreOf = async (locator) => {
    const b = await locator.boundingBox()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }

  /** Library row -> canvas fraction, with the real mouse and a jittered, eased path. */
  const dragFromLibrary = async (page, testId, at, dwell) => {
    const from = await centreOf(page.getByTestId(testId))
    const box = await page.getByTestId('viewport-canvas').boundingBox()
    const to = { x: box.x + box.width * at.fx, y: box.y + box.height * at.fy }
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    const steps = dwell ? 24 : 6
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
      await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e)
      if (dwell) await page.waitForTimeout(dwell / steps)
    }
    if (dwell) await page.waitForTimeout(150)
    await page.mouse.up()
  }

  const press = async (page, testId, dwell) => {
    const el = page.getByTestId(testId)
    await glideTo(page, await centreOf(el), dwell)
    if (dwell) await page.waitForTimeout(150)
    await el.click()
  }

  /** The gizmo hub in page coordinates (the selected body's centre). */
  const hubPoint = (page) =>
    page.evaluate(() => {
      const rect = document.querySelector('[data-testid="viewport"]').getBoundingClientRect()
      const [ox, oy] = document.querySelector('[data-testid="transform-gizmo"]').getAttribute('data-origin').split(',').map(Number)
      return { x: rect.left + ox, y: rect.top + oy }
    })

  /** A point along a gizmo arm, read from the overlay's own line. */
  const armPoint = (page, testId, fraction) =>
    page.evaluate(
      ({ testId, fraction }) => {
        const el = document.querySelector(`[data-testid="${testId}"]`)
        const rect = document.querySelector('[data-testid="viewport"]').getBoundingClientRect()
        const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((a) => Number(el.getAttribute(a)))
        return { x: rect.left + x1 + (x2 - x1) * fraction, y: rect.top + y1 + (y2 - y1) * fraction }
      },
      { testId, fraction },
    )

  const clickAt = async (page, point, dwell, { shift = false } = {}) => {
    await glideTo(page, point, dwell)
    if (shift) await page.keyboard.down('Shift')
    await page.mouse.down()
    await page.waitForTimeout(80)
    await page.mouse.up()
    if (shift) await page.keyboard.up('Shift')
    await page.waitForTimeout(dwell ? 350 : 100)
  }

  /** Bodies, once the kernel worker has measured every one (the volume attribute lands last). */
  const bodies = async (page) => {
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[data-testid="scene-bodies"] li')].every((n) => n.hasAttribute('data-body-volume')),
    )
    return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
      nodes.map((n) => ({
        id: n.getAttribute('data-body-id'),
        op: n.getAttribute('data-body-op'),
        bounds: (n.getAttribute('data-body-bounds') ?? '').split(',').map(Number),
        volume: Number(n.getAttribute('data-body-volume')),
      })),
    )
  }

  /**
   * Perform the tour up to and including step `upTo`. `dwell` > 0 is the movie's human pace
   * (ms for a drag); 0 is the quick path the stills use. Returns the facts later steps need.
   *
   * @param {import('@playwright/test').Page} page
   * @param {number} upTo
   * @param {number} dwell
   * @param {{ onDownload?: (d: import('@playwright/test').Download) => void }} [hooks]
   */
  const tour = async (page, upTo, dwell, hooks = {}) => {
    // Step 1: place a Cube, then a Cylinder, and make the cylinder 20 mm across.
    await dragFromLibrary(page, 'library-row-primitive.cuboid', DROP, dwell)
    await expect(viewport(page)).toHaveAttribute('data-body-count', '1')
    await dragFromLibrary(page, 'library-row-primitive.cylinder', DROP, dwell)
    await expect(viewport(page)).toHaveAttribute('data-body-count', '2')
    const diameter = page.getByTestId('inspector-param-diameter')
    await glideTo(page, await centreOf(diameter), dwell)
    await diameter.click()
    await diameter.fill('')
    await diameter.pressSequentially(String(HOLE_DIAMETER), { delay: dwell ? 70 : 0 })
    await diameter.press('Tab')
    await expect.poll(async () => (await bodies(page)).find((b) => b.id.startsWith('cylinder')).volume).toBeCloseTo(Math.PI * 100 * 50, -3)
    const hub = await hubPoint(page)
    if (upTo === 1) return {}

    // Step 2: click the Cube, then Shift-click the Cylinder: the base is the one picked first.
    await clickAt(page, { x: hub.x - 58, y: hub.y + 40 }, dwell)
    await expect(viewport(page)).toHaveAttribute('data-selected-id', /cuboid/)
    // The cylinder's cap peeks 10 mm above the cube, inside the cube gizmo's rings: aim at a
    // spot in the cap that no gizmo handle covers (the rings are drawn over it).
    const cap = await page.evaluate(({ x, y }) => {
      const free = (px, py) => !(document.elementFromPoint(px, py)?.getAttribute('data-testid') ?? '').startsWith('gizmo')
      let best = null
      for (let dy = -64; dy <= -48; dy += 2) {
        for (let dx = -26; dx <= 26; dx += 2) {
          if (!free(x + dx, y + dy)) continue
          const d = Math.hypot((dx + 2) / 1.6, dy + 58)
          if (!best || d < best.d) best = { x: x + dx, y: y + dy, d }
        }
      }
      return best
    }, hub)
    expect(cap, 'a spot on the cylinder cap clear of the gizmo').not.toBeNull()
    await clickAt(page, cap, dwell, { shift: true })
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '2')
    await expect(page.getByTestId('operations-toolbar')).toHaveAttribute('data-enabled', 'true')
    await expect(page.getByTestId('operation-operand-base')).toHaveText('Cube 1')
    await expect(page.getByTestId('operation-operand-rest')).toHaveText('Cylinder 1')
    if (upTo === 2) return {}

    // Step 3: Subtract. One body remains, with a hole through it.
    if (dwell) await page.waitForTimeout(500)
    await press(page, 'operation-subtract', dwell)
    await expect(viewport(page)).toHaveAttribute('data-body-count', '1')
    const [result] = await bodies(page)
    expect(result.op).toBe('boolean.subtract')
    expect(result.volume).toBeLessThan(CUBE_VOLUME - 1000)
    expect(result.volume).toBeCloseTo(CUBE_VOLUME - HOLE_VOLUME, -3)
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '1')
    if (upTo === 3) return {}

    // Step 4: nudge the result along X with the gizmo.
    const x = page.getByTestId('inspector-position-x')
    const startX = Number((await x.inputValue()).trim())
    await expect(page.getByTestId('gizmo-grab-arm-x')).toBeAttached()
    await settle(page)
    const from = await armPoint(page, 'gizmo-grab-arm-x', 0.7)
    const centre = await hubPoint(page)
    const len = Math.hypot(from.x - centre.x, from.y - centre.y) || 1
    const to = { x: from.x + ((from.x - centre.x) / len) * 90, y: from.y + ((from.y - centre.y) / len) * 90 }
    await glideTo(page, from, dwell)
    await page.mouse.down()
    const steps = dwell ? 30 : 8
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
      await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e)
      if (dwell) await page.waitForTimeout(30)
    }
    await page.mouse.up()
    await expect(viewport(page)).toHaveAttribute('data-transforming', 'false')
    const endX = Number((await x.inputValue()).trim())
    expect(Math.abs(endX - startX)).toBeGreaterThan(5)
    await expect(viewport(page)).toHaveAttribute('data-body-count', '1')
    if (upTo === 4) return {}

    // Step 5: File > Export, STL, Export. A real download carries the body's name.
    await press(page, 'file-menu-button', dwell)
    await expect(page.getByTestId('file-menu')).toBeVisible()
    if (dwell) await page.waitForTimeout(300)
    await press(page, 'file-export', dwell)
    await expect(page.getByTestId('export-popover')).toBeVisible()
    await expect(page.getByTestId('export-format-stl')).toBeChecked()
    await expect(page.getByTestId('export-summary')).toContainText('subtract-1.stl')
    if (dwell) await page.waitForTimeout(700)
    if (hooks.onDownload) {
      const downloadEvent = page.waitForEvent('download')
      await press(page, 'export-commit', dwell)
      const download = await downloadEvent
      expect(download.suggestedFilename()).toBe('subtract-1.stl')
      expect(download.suggestedFilename().endsWith('.stl')).toBe(true)
      await expect(page.getByTestId('export-popover')).toHaveCount(0)
      await expect(page.getByTestId('save-status')).toContainText('Exported subtract-1.stl')
      hooks.onDownload(download)
    }
    return {}
  }

  test('tour-step-1-place still', async ({ page }) => {
    await openApp(page)
    await tour(page, 1, 0)
    await shot(page, 'tour-step-1-place.png')
  })

  test('tour-step-2-select still', async ({ page }) => {
    await openApp(page)
    await tour(page, 2, 0)
    await shot(page, 'tour-step-2-select.png')
  })

  test('tour-step-3-subtract still', async ({ page }) => {
    await openApp(page)
    await tour(page, 3, 0)
    await shot(page, 'tour-step-3-subtract.png')
  })

  test('tour-step-4-nudge still', async ({ page }) => {
    await openApp(page)
    await tour(page, 4, 0)
    await shot(page, 'tour-step-4-nudge.png')
  })

  test('tour-step-5-export still', async ({ page }) => {
    await openApp(page)
    await tour(page, 4, 0)
    await press(page, 'file-menu-button', 0)
    await press(page, 'file-export', 0)
    await expect(page.getByTestId('export-popover')).toBeVisible()
    await expect(page.getByTestId('export-summary')).toContainText('Exports Subtract 1 as subtract-1.stl')
    await shot(page, 'tour-step-5-export.png')
  })

  test('tour', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await expect(viewport(page)).toHaveAttribute('data-body-count', '0')
    await startMovie(page, 'tour')
    let download = null
    await tour(page, 5, 650, { onDownload: (d) => (download = d) })
    await page.waitForTimeout(1200)
    await endMovie(page, 'tour', { fps: 10, width: 528, maxSeconds: 30 })
    expect(download).not.toBeNull()
    await settle(page)
  })
})
