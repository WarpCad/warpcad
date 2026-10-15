// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, startMovie, endMovie, humanDrag, shot, settle, MAX_DIFF_PIXEL_RATIO } from './support.js'

/**
 * Docs media for `docs/selection-and-inspector.md` (`TODO/docs-010`): selecting, the
 * transform gizmo with the Inspector following it, parameter edits, colour, align,
 * hidden parts, the object list and delete. Laptop only.
 *
 * Every movie asserts its end state (a position value, a body count, a colour), so a drag
 * that silently did nothing fails instead of publishing a GIF of a still scene. Gizmo
 * drags start from the handle's real on-screen position, read from the overlay the app
 * itself draws, and use a real mouse. Not an acceptance check: scenario 2 is driven by hand.
 *
 * Deferred: `inspector-rename` (`ui-056` is still open), the dependent-repair dialog still
 * (needs a snapped-assembly fixture), and the dependents banner on delete.
 */
test.describe('docs media: selection, inspector, gizmo', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  /** Where the cube sits on the canvas in `one-cube` / `two-solids` at the default camera. */
  const CUBE_AT = { fx: 0.45, fy: 0.5 }

  /** @param {import('@playwright/test').Page} page */
  const viewport = (page) => page.getByTestId('viewport')

  /** A point on the canvas at fractions of its box. @param {import('@playwright/test').Page} page */
  const canvasPoint = async (page, fx, fy) => {
    const b = await page.getByTestId('viewport-canvas').boundingBox()
    return { x: b.x + b.width * fx, y: b.y + b.height * fy }
  }

  /** A human-paced mouse move (no button) so the pointer glides to its target. */
  const glideTo = async (page, point) => {
    await page.mouse.move(point.x, point.y, { steps: 18 })
    await page.waitForTimeout(250)
  }

  /** Click the canvas at a fraction with the real mouse, glide first. */
  const clickCanvas = async (page, fx, fy) => {
    const p = await canvasPoint(page, fx, fy)
    await glideTo(page, p)
    await page.mouse.down()
    await page.waitForTimeout(80)
    await page.mouse.up()
  }

  /** Open a fixture, ready for a still or a movie. */
  const openScene = async (page, fixture, bodies) => {
    await openApp(page)
    await loadScene(page, fixture, bodies)
  }

  /** Select the cube by a real click and wait for the Inspector to fill. */
  const selectCube = async (page) => {
    await clickCanvas(page, CUBE_AT.fx, CUBE_AT.fy)
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '1')
    await expect(page.getByTestId('inspector-name')).toBeVisible()
    await expect(page.getByTestId('transform-gizmo')).toBeAttached()
  }

  /** A transform field's number, unit suffix stripped. */
  const num = async (page, testId) => Number((await page.getByTestId(testId).inputValue()).replace(/[°\s]/g, ''))

  /**
   * Screen position of a point along a gizmo arm, read from the overlay's own line
   * (`x1,y1 -> x2,y2`, in viewport-relative CSS pixels).
   */
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

  /** The gizmo hub in page coordinates. */
  const hubPoint = async (page) =>
    page.evaluate(() => {
      const rect = document.querySelector('[data-testid="viewport"]').getBoundingClientRect()
      const [ox, oy] = document.querySelector('[data-testid="transform-gizmo"]').getAttribute('data-origin').split(',').map(Number)
      return { x: rect.left + ox, y: rect.top + oy }
    })

  /**
   * A point on a rotate ring's grab polygon that really is the top element under the
   * pointer (the arms cross the rings, so a fixed vertex can land on an arm instead).
   */
  const ringPoint = async (page, axis) => {
    const found = await page.evaluate((axis) => {
      const id = `gizmo-grab-ring-${axis}`
      const el = document.querySelector(`[data-testid="${id}"]`)
      const rect = document.querySelector('[data-testid="viewport"]').getBoundingClientRect()
      const pairs = el.getAttribute('points').trim().split(/\s+/).map((p) => p.split(',').map(Number))
      for (let i = 0; i < pairs.length; i++) {
        const [px, py] = pairs[(i + Math.floor(pairs.length / 4)) % pairs.length]
        const x = rect.left + px
        const y = rect.top + py
        if (document.elementFromPoint(x, y)?.getAttribute('data-testid') === id) return { x, y }
      }
      return null
    }, axis)
    expect(found, `a free point on the ${axis} ring`).not.toBeNull()
    return found
  }

  /**
   * Press at `from`, drag to `to` in eased steps, running `probe` once part-way with the
   * button still down, then release. The held-pointer version of `humanDrag`.
   */
  const dragWithProbe = async (page, from, to, probe) => {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    const steps = 30
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
      await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e)
      await page.waitForTimeout(40)
      if (i === 18 && probe) await probe()
    }
    await page.waitForTimeout(250)
    await page.mouse.up()
    await page.waitForTimeout(200)
  }

  /** A still taken while the pointer is held (`shot()` parks the mouse first). */
  const heldShot = async (page, name, clip) => {
    await page.waitForTimeout(400)
    await expect(page).toHaveScreenshot(name, {
      animations: 'disabled',
      caret: 'hide',
      clip,
      mask: [page.getByTestId('save-status')],
      maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
    })
  }

  /** The Objects list, opened. @param {import('@playwright/test').Page} page */
  const openObjectList = async (page) => {
    const list = page.getByTestId('object-list')
    if (await list.isVisible()) return
    const header = page.getByTestId('inspector-objects-header')
    await header.click()
    await expect(list).toBeVisible()
  }

  test('select-body still', async ({ page }) => {
    await openScene(page, 'one-cube.ndjson', 1)
    await selectCube(page)
    await expect(page.getByTestId('dimension-lines')).toBeAttached()
    await shot(page, 'select-body.png')
  })

  test('select-click', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'two-solids.ndjson', 2)
    await startMovie(page, 'select-click')
    // Empty space first: nothing selected, the Inspector has nothing to show.
    await clickCanvas(page, 0.2, 0.85)
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '0')
    await page.waitForTimeout(700)
    await selectCube(page)
    await page.waitForTimeout(900)
    await expect(page.getByTestId('inspector-name')).toContainText('Cube 1')
    await endMovie(page, 'select-click', { fps: 12, width: 640 })
  })

  test('select-marquee', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'two-solids.ndjson', 2)
    // The nav chrome's Select mode is the touch-reachable route to a selection box.
    const toggle = page.getByTestId('nav-expand-toggle')
    if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
    await startMovie(page, 'select-marquee')
    await glideTo(page, await page.getByTestId('nav-mode-select').evaluate((el) => {
      const b = el.getBoundingClientRect()
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    }))
    await page.getByTestId('nav-mode-select').click()
    await expect(page.getByTestId('navigation-chrome')).toHaveAttribute('data-drag-mode', 'select')
    await humanDrag(page, await canvasPoint(page, 0.12, 0.2), await canvasPoint(page, 0.9, 0.85), { steps: 24, ms: 1000 })
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '2')
    await expect(page.getByTestId('inspector-multi')).toHaveText('2 selected')
    await page.waitForTimeout(900)
    await endMovie(page, 'select-marquee', { fps: 12, width: 640 })
  })

  test('gizmo-translate', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'one-cube.ndjson', 1)
    await selectCube(page)
    const startX = await num(page, 'inspector-position-x')
    await startMovie(page, 'gizmo-translate')
    const hub = await hubPoint(page)
    const from = await armPoint(page, 'gizmo-grab-arm-x', 0.7)
    // Drag outward along the arm, away from the hub.
    const len = Math.hypot(from.x - hub.x, from.y - hub.y) || 1
    const to = { x: from.x + ((from.x - hub.x) / len) * 90, y: from.y + ((from.y - hub.y) / len) * 90 }
    await glideTo(page, from)
    let during = null
    await dragWithProbe(page, from, to, async () => {
      during = await num(page, 'inspector-position-x')
    })
    // The field moved with the drag, not only at release, and the document agrees.
    expect(Math.abs(during - startX)).toBeGreaterThan(0.5)
    await expect(viewport(page)).toHaveAttribute('data-transforming', 'false')
    const endX = await num(page, 'inspector-position-x')
    expect(Math.abs(endX - startX)).toBeGreaterThan(5)
    await expect(viewport(page)).toHaveAttribute('data-body-count', '1')
    await page.waitForTimeout(700)
    await endMovie(page, 'gizmo-translate', { fps: 12, width: 640 })
  })

  test('gizmo-rotate', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'one-cube.ndjson', 1)
    await selectCube(page)
    // Direction arrows are drawn on the visible rings (`ui-022`).
    await expect(page.locator('[data-testid^="gizmo-rotate-arrow-"]').first()).toBeAttached()
    await startMovie(page, 'gizmo-rotate')
    const hub = await hubPoint(page)
    const from = await ringPoint(page, 'x')
    // Tangent to the ring at that point.
    const dx = from.x - hub.x
    const dy = from.y - hub.y
    const len = Math.hypot(dx, dy) || 1
    const to = { x: from.x + (-dy / len) * 110, y: from.y + (dx / len) * 110 }
    await glideTo(page, from)
    let during = null
    await dragWithProbe(page, from, to, async () => {
      during = await num(page, 'inspector-rotation-x')
    })
    expect(Math.abs(during)).toBeGreaterThan(1)
    await expect(viewport(page)).toHaveAttribute('data-transforming', 'false')
    expect(Math.abs(await num(page, 'inspector-rotation-x'))).toBeGreaterThan(5)
    await expect(viewport(page)).toHaveAttribute('data-body-count', '1')
    await page.waitForTimeout(700)
    await endMovie(page, 'gizmo-rotate', { fps: 12, width: 640 })
  })

  /**
   * Press the X ring and sweep it round, holding Shift for the second half so the readout
   * visibly jumps in 5-degree steps (`ui-064`). `probe` runs once mid-sweep, button down.
   */
  const dialDrag = async (page, probe) => {
    const hub = await hubPoint(page)
    const from = await ringPoint(page, 'x')
    const r = Math.hypot(from.x - hub.x, from.y - hub.y) || 1
    const a0 = Math.atan2(from.y - hub.y, from.x - hub.x)
    await glideTo(page, from)
    await page.mouse.down()
    const steps = 36
    for (let i = 1; i <= steps; i++) {
      if (i === 20) await page.keyboard.down('Shift')
      const a = a0 + (i / steps) * (Math.PI / 2)
      await page.mouse.move(hub.x + Math.cos(a) * r, hub.y + Math.sin(a) * r)
      await page.waitForTimeout(45)
      if (i === 14 && probe) await probe()
    }
    await page.waitForTimeout(500)
    await page.mouse.up()
    await page.keyboard.up('Shift')
    await page.waitForTimeout(250)
  }

  test('gizmo-rotate-dial still', async ({ page }) => {
    await openScene(page, 'one-cube.ndjson', 1)
    await selectCube(page)
    const hub = await hubPoint(page)
    const box = await viewport(page).boundingBox()
    const clip = {
      // Wide and tall enough to take in the readout pill, which sits above the ring.
      x: Math.max(box.x, hub.x - 300),
      y: Math.max(box.y, hub.y - 280),
      width: 600,
      height: 520,
    }
    await dialDrag(page, async () => {
      await expect(page.getByTestId('gizmo-dial-readout')).toBeVisible()
      await heldShot(page, 'gizmo-rotate-dial.png', clip)
    })
    await expect(viewport(page)).toHaveAttribute('data-body-count', '1')
  })

  test('gizmo-rotate-dial', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'one-cube.ndjson', 1)
    await selectCube(page)
    await startMovie(page, 'gizmo-rotate-dial')
    await dialDrag(page, null)
    await expect(viewport(page)).toHaveAttribute('data-transforming', 'false')
    expect(Math.abs(await num(page, 'inspector-rotation-x'))).toBeGreaterThan(30)
    await expect(viewport(page)).toHaveAttribute('data-body-count', '1')
    await page.waitForTimeout(700)
    await endMovie(page, 'gizmo-rotate-dial', { fps: 12, width: 640 })
  })

  test('gizmo-handles still', async ({ page }) => {
    await openScene(page, 'one-cube.ndjson', 1)
    await selectCube(page)
    await settle(page)
    const hub = await hubPoint(page)
    const box = await viewport(page).boundingBox()
    const clip = {
      x: Math.max(box.x, hub.x - 170),
      y: Math.max(box.y, hub.y - 150),
      width: 340,
      height: 300,
    }
    await heldShot(page, 'gizmo-handles.png', clip)
  })

  test('inspector-numeric-edit', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'one-cube.ndjson', 1)
    await selectCube(page)
    await startMovie(page, 'inspector-numeric-edit')
    const field = page.getByTestId('inspector-position-x')
    const b = await field.boundingBox()
    await glideTo(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
    await field.click()
    await field.press('ControlOrMeta+a')
    await page.keyboard.type('25', { delay: 220 })
    await page.waitForTimeout(400)
    await page.keyboard.press('Enter')
    await expect.poll(() => num(page, 'inspector-position-x')).toBeCloseTo(25, 1)
    await expect(page.locator('[data-testid="scene-bodies"] li').first()).toHaveAttribute('data-body-center', /^25(\.0+)?,/)
    await page.waitForTimeout(900)
    await endMovie(page, 'inspector-numeric-edit', { fps: 12, width: 640 })
  })

  test('inspector-param-edit', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'two-solids.ndjson', 2)
    // The cylinder sits right of the cube; select it through its row so the click is certain.
    await openObjectList(page)
    await page.getByTestId('objects-row-cyl-1').click()
    await expect(page.getByTestId('inspector-name')).toBeVisible()
    const field = page.getByTestId('inspector-param-diameter')
    await expect(field).toHaveValue('30')
    await startMovie(page, 'inspector-param-edit')
    const b = await field.boundingBox()
    await glideTo(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
    await field.click()
    await field.press('ControlOrMeta+a')
    await page.keyboard.type('20', { delay: 220 })
    await page.waitForTimeout(300)
    await page.keyboard.press('Enter')
    await expect(field).toHaveValue('20')
    await expect(page.getByTestId('undo-button')).toHaveAttribute('aria-label', /^Undo:/)
    await page.waitForTimeout(900)
    // One edit is one undo step: a single click on Undo restores the original size.
    const undo = page.getByTestId('undo-button')
    const ub = await undo.boundingBox()
    await glideTo(page, { x: ub.x + ub.width / 2, y: ub.y + ub.height / 2 })
    await undo.click()
    await expect(field).toHaveValue('30')
    await page.waitForTimeout(900)
    await endMovie(page, 'inspector-param-edit', { fps: 12, width: 640 })
  })

  test('inspector-composite-param-edit still', async ({ page }) => {
    await openScene(page, 'bolt.ndjson', 1)
    await openObjectList(page)
    await page.getByTestId('objects-row-bolt-1').click()
    await expect(page.getByTestId('inspector-param-spec')).toBeVisible()
    await shot(page, 'inspector-composite-param-edit.png', { locator: page.getByTestId('inspector') })
  })

  test('inspector-colour', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'one-cube.ndjson', 1)
    await selectCube(page)
    await startMovie(page, 'inspector-colour')
    const input = page.getByTestId('inspector-color-input')
    const b = await input.boundingBox()
    await glideTo(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
    await page.waitForTimeout(400)
    // A native colour picker cannot be driven headless; setting the input is what its change event does.
    await input.fill('#ff0000')
    await expect(page.locator('[data-testid="scene-bodies"] li').first()).toHaveAttribute('data-body-color', '#ff0000')
    await expect(page.getByTestId('inspector-color-value')).toHaveText('#ff0000')
    await page.waitForTimeout(1200)
    await endMovie(page, 'inspector-colour', { fps: 12, width: 640 })
  })

  test('inspector-object-list still', async ({ page }) => {
    await openScene(page, 'pi-and-cube.ndjson', 2)
    await openObjectList(page)
    await page.getByTestId('objects-expand-pi-1').click()
    await expect(page.getByTestId('object-list')).toContainText('ethernet')
    await shot(page, 'inspector-object-list.png', { locator: page.getByTestId('inspector') })
  })

  test('inspector-hidden-parts still', async ({ page }) => {
    await openScene(page, 'bolt.ndjson', 1)
    await openObjectList(page)
    await page.getByTestId('objects-row-bolt-1').click()
    await expect(page.getByTestId('inspector-parts')).toBeVisible()
    await page.getByTestId('inspector-hidden-parts-toggle').check()
    await expect(page.getByTestId('inspector-hidden-parts-toggle')).toBeChecked()
    await shot(page, 'inspector-hidden-parts.png')
  })

  test('align-to-origin', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'offset-cube.ndjson', 1)
    await openObjectList(page)
    await page.getByTestId('objects-row-cube-1').click()
    await expect(page.getByTestId('align-origin-row')).toBeVisible()
    expect(await num(page, 'inspector-position-x')).toBeCloseTo(60, 1)
    await startMovie(page, 'align-to-origin')
    const btn = page.getByTestId('align-origin-drop')
    await btn.scrollIntoViewIfNeeded()
    const b = await btn.boundingBox()
    await glideTo(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
    await page.waitForTimeout(400)
    await btn.click()
    await expect.poll(() => num(page, 'inspector-position-x')).toBeCloseTo(0, 1)
    expect(await num(page, 'inspector-position-y')).toBeCloseTo(0, 1)
    await page.waitForTimeout(1200)
    await endMovie(page, 'align-to-origin', { fps: 12, width: 640 })
  })

  test('delete-body', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'two-solids.ndjson', 2)
    await selectCube(page)
    await startMovie(page, 'delete-body')
    const btn = page.getByTestId('inspector-delete')
    await btn.scrollIntoViewIfNeeded()
    const b = await btn.boundingBox()
    await glideTo(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
    await page.waitForTimeout(500)
    await btn.click()
    await expect(viewport(page)).toHaveAttribute('data-body-count', '1')
    await page.waitForTimeout(1200)
    await endMovie(page, 'delete-body', { fps: 12, width: 640 })
  })
})
