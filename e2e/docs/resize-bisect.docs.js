// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, startMovie, endMovie, shot, settle } from './support.js'

/**
 * Docs media for `docs/resize-bisect.md` (`TODO/docs-013`): Enlarge, Fit (with and without
 * keep-aspect), an Inspector resize that a snapped part follows, a straight Bisect, an angled Bisect,
 * and the Bisect popover as a still. Laptop, Chromium only.
 *
 * Every movie ends by asserting its post-state from the kernel's own measurements
 * (`data-body-bounds`, the dimension lines, the Inspector's Position): Enlarge/Fit change the
 * bounding box by exactly the typed delta (`toBeCloseTo(..., 1)`, the attribute prints two
 * decimals), and the Bisect movies check the kept half's size and centre. No fixed script
 * is trusted for what is selected: each step asserts `data-selected-id` / the breadcrumb.
 * Not an acceptance check; `core-021` / `core-022` are re-driven by hand.
 */
test.describe('docs media: resize and bisect', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  /** CSS-pixel points read off a 1440x900 laptop screenshot. */
  const CUBE_FRONT = { x: 540, y: 504 } // one-cube.ndjson: front-left face
  const CUBE_UPPER = { x: 540, y: 461 } // the upper half of that face (Z above the cut at 20)
  const PLATE = { x: 520, y: 470 }

  /** @param {import('@playwright/test').Page} page */
  const viewport = (page) => page.getByTestId('viewport')

  const glideTo = async (page, point) => {
    await page.mouse.move(point.x, point.y, { steps: 10 })
    await page.waitForTimeout(150)
  }
  const clickAt = async (page, point) => {
    await glideTo(page, point)
    await page.mouse.down()
    await page.waitForTimeout(80)
    await page.mouse.up()
    await page.waitForTimeout(350)
  }
  const press = async (page, testId) => {
    const el = page.getByTestId(testId)
    const b = await el.boundingBox()
    await glideTo(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
    await page.waitForTimeout(200)
    await el.click()
  }
  const typeInto = async (page, testId, text) => {
    const el = page.getByTestId(testId)
    const b = await el.boundingBox()
    await glideTo(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
    await el.click()
    await el.fill('')
    await el.pressSequentially(text, { delay: 60 })
  }

  /** Every body's `{ bounds: [minx,miny,minz,maxx,maxy,maxz], size, center }`, once measured. */
  const bodies = async (page) => {
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[data-testid="scene-bodies"] li')].every((n) => n.hasAttribute('data-body-volume')),
    )
    const list = await page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
      nodes.map((n) => ({
        id: n.getAttribute('data-body-id'),
        bounds: (n.getAttribute('data-body-bounds') ?? '').split(',').map(Number),
        center: (n.getAttribute('data-body-center') ?? '').split(',').map(Number),
      })),
    )
    return Object.fromEntries(
      list.map((b) => [b.id, { ...b, size: [b.bounds[3] - b.bounds[0], b.bounds[4] - b.bounds[1], b.bounds[5] - b.bounds[2]] }]),
    )
  }

  /** Wait for a body's bounds to differ from `before`, i.e. the worker has re-measured it. */
  const afterChange = async (page, id, before) => {
    await expect
      .poll(async () => (await bodies(page))[id].bounds.join(','), { timeout: 15000 })
      .not.toBe(before.bounds.join(','))
    await settle(page)
    return (await bodies(page))[id]
  }

  const selectOne = async (page, point, id) => {
    await clickAt(page, point)
    await expect(viewport(page)).toHaveAttribute('data-selected-id', id)
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '1')
    await expect(page.getByTestId('operation-enlarge')).toBeEnabled()
  }

  const openOne = async (page, fixture = 'one-cube.ndjson', count = 1) => {
    await openApp(page)
    await loadScene(page, fixture, count)
  }

  const num = async (page, testId) => Number((await page.getByTestId(testId).inputValue()).replace(/[^\d.+-]/g, ''))
  const dim = async (page, axis) => Number(await page.getByTestId(`dimension-${axis}`).getAttribute('data-length-mm'))

  /** Press a toolbar button and check which popover (and op) opened. */
  const openPopover = async (page, button, op) => {
    await press(page, button)
    const popover = page.getByTestId('resize-popover')
    await expect(popover).toBeVisible()
    await expect(popover).toHaveAttribute('data-op', op)
    await page.waitForTimeout(200)
    return popover
  }

  /** Fill the Bisect popover; Rotate-offset stays blank. */
  const fillBisect = async (page, { axis, offset, angle }) => {
    await page.getByTestId('resize-bisect-axis').selectOption(axis)
    await page.waitForTimeout(350)
    await typeInto(page, 'resize-bisect-offset', String(offset))
    if (angle !== undefined) {
      await page.waitForTimeout(250)
      await typeInto(page, 'resize-bisect-angle', String(angle))
    }
    await expect(page.getByTestId('resize-commit')).toBeEnabled()
    await page.waitForTimeout(250)
  }

  test('bisect-popover still', async ({ page }) => {
    await openOne(page)
    await selectOne(page, CUBE_FRONT, 'cube-1')
    await press(page, 'operation-bisect')
    await expect(page.getByTestId('resize-popover')).toHaveAttribute('data-op', 'modify.bisect')
    await page.getByTestId('resize-bisect-axis').selectOption('z')
    await page.getByTestId('resize-bisect-offset').fill('20')
    await page.getByTestId('resize-bisect-angle').fill('30')
    await expect(page.getByTestId('resize-bisect-rotate-axis')).toHaveValue('x')
    await expect(page.getByTestId('resize-bisect-rotate-offset')).toBeVisible()
    await shot(page, 'bisect-popover.png', { locator: page.getByTestId('resize-popover') })
  })

  test('resize-enlarge', { tag: '@movie' }, async ({ page }) => {
    await openOne(page)
    const before = (await bodies(page))['cube-1']
    await startMovie(page, 'resize-enlarge')
    await selectOne(page, CUBE_FRONT, 'cube-1')
    await page.waitForTimeout(400)
    const popover = await openPopover(page, 'operation-enlarge', 'modify.enlarge')
    await typeInto(page, 'resize-enlarge-dx', '10')
    await page.waitForTimeout(250)
    await typeInto(page, 'resize-enlarge-dy', '20')
    await page.waitForTimeout(250)
    await typeInto(page, 'resize-enlarge-dz', '-10')
    await page.waitForTimeout(250)
    await press(page, 'resize-commit')
    await expect(popover).toHaveCount(0)
    const after = await afterChange(page, 'cube-1', before)
    // Grew by exactly the typed deltas (the attribute prints two decimals), about its centre.
    expect(after.size[0] - before.size[0]).toBeCloseTo(10, 1)
    expect(after.size[1] - before.size[1]).toBeCloseTo(20, 1)
    expect(after.size[2] - before.size[2]).toBeCloseTo(-10, 1)
    for (const i of [0, 1, 2]) expect(after.center[i]).toBeCloseTo(before.center[i], 1)
    await expect(viewport(page)).toHaveAttribute('data-body-count', '1')
    await expect(viewport(page)).toHaveAttribute('data-selected-id', 'cube-1')
    await page.waitForTimeout(400)
    await endMovie(page, 'resize-enlarge', { fps: 10, width: 640 })
  })

  test('resize-fit', { tag: '@movie' }, async ({ page }) => {
    await openOne(page)
    const before = (await bodies(page))['cube-1']
    await startMovie(page, 'resize-fit')
    await selectOne(page, CUBE_FRONT, 'cube-1')
    // 1. Without keep-aspect: each axis goes to exactly the size typed, so only the X stretch shows.
    let popover = await openPopover(page, 'operation-fit', 'modify.fit')
    await expect(page.getByTestId('resize-fit-keep-aspect')).not.toBeChecked()
    await typeInto(page, 'resize-fit-x', '60')
    await press(page, 'resize-commit')
    await expect(popover).toHaveCount(0)
    const stretched = await afterChange(page, 'cube-1', before)
    expect(stretched.size[0]).toBeCloseTo(60, 1)
    expect(stretched.size[1]).toBeCloseTo(40, 1)
    expect(stretched.size[2]).toBeCloseTo(40, 1)
    // 2. With keep-aspect: ask for X = 30 and the other two axes take the same ratio
    // (the smallest, 30/60), so the 60 x 40 x 40 block keeps its proportions.
    popover = await openPopover(page, 'operation-fit', 'modify.fit')
    await typeInto(page, 'resize-fit-x', '30')
    await glideTo(page, await page.getByTestId('resize-fit-keep-aspect').evaluate((el) => {
      const b = el.getBoundingClientRect()
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    }))
    await page.getByTestId('resize-fit-keep-aspect').check()
    await press(page, 'resize-commit')
    await expect(popover).toHaveCount(0)
    const kept = await afterChange(page, 'cube-1', stretched)
    expect(kept.size[0]).toBeCloseTo(30, 1)
    expect(kept.size[1]).toBeCloseTo(20, 1)
    expect(kept.size[2]).toBeCloseTo(20, 1)
    await page.waitForTimeout(400)
    await endMovie(page, 'resize-fit', { fps: 10, width: 640 })
  })

  test('resize-snapped-dependents', { tag: '@movie' }, async ({ page }) => {
    await openOne(page, 'plate-and-snapped-lug.ndjson', 2)
    const before = await bodies(page)
    // The lug stands on the plate: its low face is the plate's high face.
    expect(before['lug-1'].bounds[2]).toBeCloseTo(before['plate-1'].bounds[5], 1)
    await startMovie(page, 'resize-snapped-dependents')
    await selectOne(page, PLATE, 'plate-1')
    await page.waitForTimeout(400)
    // Size Z in the Inspector's Parameters (a primitive's own creation record is swapped, so
    // the Snap in the log re-runs). Enlarge and Fit append a row instead and leave the lug.
    const field = page.getByTestId('inspector-param-size-z')
    await expect(field).toBeVisible()
    await expect(page.getByTestId('inspector-params')).toHaveAttribute('data-editable', 'true')
    await typeInto(page, 'inspector-param-size-z', '24')
    await page.keyboard.press('Enter')
    const plate = await afterChange(page, 'plate-1', before['plate-1'])
    expect(plate.size[2]).toBeCloseTo(24, 1)
    await expect
      .poll(async () => (await bodies(page))['lug-1'].bounds[2], { timeout: 15000 })
      .not.toBeCloseTo(before['lug-1'].bounds[2], 1)
    const after = await bodies(page)
    // The lug rode up with the plate's new top: 8 mm (centre fixed, 16 mm thicker), and
    // still stands on it; it did not move sideways.
    expect(after['lug-1'].bounds[2]).toBeCloseTo(after['plate-1'].bounds[5], 1)
    expect(after['lug-1'].bounds[2] - before['lug-1'].bounds[2]).toBeCloseTo(8, 1)
    expect(after['lug-1'].center[0]).toBeCloseTo(before['lug-1'].center[0], 1)
    expect(after['lug-1'].center[1]).toBeCloseTo(before['lug-1'].center[1], 1)
    await expect(viewport(page)).toHaveAttribute('data-body-count', '2')
    // Deselect so the last frame shows the lug on the plate, not under the selection tint.
    await clickAt(page, { x: 1050, y: 800 })
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '0')
    await page.waitForTimeout(400)
    await endMovie(page, 'resize-snapped-dependents', { fps: 10, width: 640 })
  })

  test('bisect-axis', { tag: '@movie' }, async ({ page }) => {
    await openOne(page)
    const before = (await bodies(page))['cube-1']
    await startMovie(page, 'bisect-axis')
    await selectOne(page, CUBE_FRONT, 'cube-1')
    await page.waitForTimeout(400)
    const popover = await openPopover(page, 'operation-bisect', 'modify.bisect')
    await expect(page.getByTestId('resize-commit')).toBeDisabled() // no offset yet
    await fillBisect(page, { axis: 'z', offset: 20 })
    await press(page, 'resize-commit')
    await expect(popover).toHaveCount(0)
    await expect(viewport(page)).toHaveAttribute('data-body-count', '1')
    await expect(viewport(page)).toHaveAttribute('data-selected-id', 'cube-1')
    await page.waitForTimeout(450)
    // Whole group first (nothing lost), then drill into the upper half.
    expect((await bodies(page))['cube-1'].size[2]).toBeCloseTo(before.size[2], 1)
    await clickAt(page, CUBE_UPPER)
    await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('positive')
    await page.waitForTimeout(400)
    // The kept half: 20 mm tall, sitting on the cut at Z = 20, centre at Z = 30.
    expect(await dim(page, 'z')).toBeCloseTo(20, 1)
    expect(await dim(page, 'x')).toBeCloseTo(40, 1)
    expect(await dim(page, 'y')).toBeCloseTo(40, 1)
    expect(await num(page, 'inspector-position-z')).toBeCloseTo(30, 1)
    await page.waitForTimeout(400)
    await endMovie(page, 'bisect-axis', { fps: 10, width: 640 })
  })

  test('bisect-angled', { tag: '@movie' }, async ({ page }) => {
    await openOne(page)
    await startMovie(page, 'bisect-angled')
    await selectOne(page, CUBE_FRONT, 'cube-1')
    await page.waitForTimeout(400)
    const popover = await openPopover(page, 'operation-bisect', 'modify.bisect')
    await fillBisect(page, { axis: 'z', offset: 20, angle: 30 })
    await expect(page.getByTestId('resize-bisect-rotate-axis')).toHaveValue('x')
    await press(page, 'resize-commit')
    await expect(popover).toHaveCount(0)
    await expect(viewport(page)).toHaveAttribute('data-selected-id', 'cube-1')
    await page.waitForTimeout(450)
    await clickAt(page, CUBE_UPPER)
    // `positive` is always the piece on the higher side of the cut plane.
    await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('positive')
    await page.waitForTimeout(400)
    // Tilted 30 degrees about X, hinged at mid-depth: the cut rises 20*tan(30) = 11.55 mm at
    // one Y face and drops as much at the other, so the upper half is 20 + 11.55 tall, its
    // lowest point 8.45 mm up, and its centre 40 - 31.55/2 = 24.23. A flat cut gives 20 / 30.
    const rise = 20 * Math.tan((30 * Math.PI) / 180)
    expect(await dim(page, 'z')).toBeCloseTo(20 + rise, 1)
    expect(await dim(page, 'x')).toBeCloseTo(40, 1)
    expect(await num(page, 'inspector-position-z')).toBeCloseTo(40 - (20 + rise) / 2, 1)
    await page.waitForTimeout(400)
    await endMovie(page, 'bisect-angled', { fps: 10, width: 640 })
  })
})
