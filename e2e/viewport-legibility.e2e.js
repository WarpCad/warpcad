// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * TODO/ui-130: what a selected part's overlay looks like at the sizes where it is hardest to read.
 * Dimension labels stay inside the viewport while the camera orbits, and at phone width the ring's
 * wall and core strokes are wide enough to read as two strokes. TODO/ui-147: no label's digits sit on a
 * gizmo ring or arm. Drives the real app at `/` with the real mouse.
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

/**
 * Every visible dimension label's on-screen box, tested against every drawn ring polygon and arm shaft.
 * Read from the DOM, not from the placer, so it fails if the drawn picture disagrees with the maths.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ labels: number, crossings: string[] }>}
 */
async function labelsOnGizmo(page) {
  return page.evaluate(() => {
    /** @type {string[]} */
    const crossings = []
    let labels = 0
    /** @param {Element} el */
    const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none'
    /** @param {Element} el */
    const originOf = (el) => {
      const svg = /** @type {SVGElement} */ (el).ownerSVGElement
      const rect = (svg ?? /** @type {Element} */ (el)).getBoundingClientRect()
      return { x: rect.left, y: rect.top }
    }
    /** @type {{ name: string, x1: number, y1: number, x2: number, y2: number }[]} */
    const segments = []
    for (const ring of document.querySelectorAll('[data-testid^="gizmo-ring-"]')) {
      if (!shown(ring)) continue
      const o = originOf(ring)
      const pts = (ring.getAttribute('points') ?? '')
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(',').map(Number))
      for (let i = 0; i < pts.length; i += 1) {
        const a = pts[i]
        const b = pts[(i + 1) % pts.length]
        segments.push({ name: ring.getAttribute('data-testid') ?? 'ring', x1: o.x + a[0], y1: o.y + a[1], x2: o.x + b[0], y2: o.y + b[1] })
      }
    }
    for (const arm of document.querySelectorAll('[data-testid^="gizmo-arm-"]')) {
      if (!shown(arm)) continue
      const o = originOf(arm)
      const n = (name) => Number(arm.getAttribute(name))
      segments.push({ name: arm.getAttribute('data-testid') ?? 'arm', x1: o.x + n('x1'), y1: o.y + n('y1'), x2: o.x + n('x2'), y2: o.y + n('y2') })
    }
    for (const label of document.querySelectorAll('[data-testid^="dimension-label-"]')) {
      if (!shown(label)) continue
      labels += 1
      const box = label.getBoundingClientRect()
      for (const seg of segments) {
        const steps = Math.max(1, Math.ceil(Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1)))
        for (let i = 0; i <= steps; i += 1) {
          const x = seg.x1 + ((seg.x2 - seg.x1) * i) / steps
          const y = seg.y1 + ((seg.y2 - seg.y1) * i) / steps
          if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) {
            crossings.push(`${label.getAttribute('data-testid')} on ${seg.name}`)
            break
          }
        }
      }
    }
    return { labels, crossings }
  })
}

test('no dimension label sits on a gizmo ring or arm while a tipped part is orbited (TODO/ui-147)', async ({ page }) => {
  const view = page.getByTestId('viewport')
  const box = await view.boundingBox()
  if (!box) throw new Error('no viewport')
  // Tip it 60 degrees about X, the finding's own case, through the Inspector's own field.
  const field = page.getByTestId('inspector-rotation-x')
  const tab = page.getByTestId('inspector-tab')
  // At phone and tablet width the Inspector is a sheet over the viewport; open it, type, and close it again.
  const opened = !(await field.isVisible()) && (await tab.isVisible())
  if (opened) await tab.click()
  await field.click()
  await field.fill('60')
  await field.press('Enter')
  await page.waitForTimeout(200)
  if (opened) {
    await tab.click()
    await expect(field).toBeHidden()
  }

  const start = { x: box.x + 24, y: box.y + box.height - 120 }
  let seen = 0
  /** @type {string[]} */
  const crossed = []
  for (const [dx, dy] of [[0, 0], [70, 0], [70, 30], [60, -40], [90, 10], [50, 50], [80, -20], [-120, 20]]) {
    if (dx !== 0 || dy !== 0) {
      await page.mouse.move(start.x, start.y)
      await page.mouse.down()
      await page.mouse.move(start.x + dx, start.y + dy, { steps: 8 })
      await page.mouse.up()
    }
    const read = await labelsOnGizmo(page)
    seen += read.labels
    crossed.push(...read.crossings)
  }
  expect(seen).toBeGreaterThan(0)
  expect(crossed, 'labels whose digits a ring or arm runs through').toEqual([])
})
