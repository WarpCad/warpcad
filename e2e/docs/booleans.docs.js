// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, startMovie, endMovie, shot, settle } from './support.js'

/**
 * Docs media for `docs/booleans.md` (`TODO/docs-011`): the Operations toolbar's
 * selection-count gate as stills, then Union, Subtract (both operand orders), Intersect,
 * a sub-part operand and the bolt-hole recipe as movies. Laptop, Chromium only.
 *
 * Every movie selects with real mouse clicks on projected body positions, so the GIF shows
 * the selection highlights, and ends by asserting its end state (body count, operation, the
 * boolean's History row naming BOTH operands — the `core-036` regression, and the order movie
 * asserts the two results differ via the bodies' bounds) so a click that silently did nothing
 * fails instead of publishing a GIF of a still scene. Not an acceptance check:
 * scenarios 4 and 5 are driven by hand.
 */
test.describe('docs media: booleans', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  // Canvas fractions of what each fixture looks like at the default camera.
  const CUBE_SIDE = { fx: 0.38, fy: 0.7 } // cube-and-cylinder: the cube's lower left face, clear of the cylinder's gizmo
  const CYL_TOP = { fx: 0.499, fy: 0.252 } // cube-and-cylinder: the cylinder's top cap
  const SPHERE_CUBE = { fx: 0.31, fy: 0.533 } // cube-and-sphere: the cube's visible left face
  const SPHERE_AT = { fx: 0.537, fy: 0.405 }
  const PLATE_AT = { fx: 0.386, fy: 0.55 } // plate-and-cylinder: the plate's top
  const PLATE_CYL = { fx: 0.602, fy: 0.524 }
  const BOLT_CUBE = { fx: 0.355, fy: 0.533 } // cube-and-bolt: the cube's left face
  const BOLT_SHAFT = { fx: 0.63, fy: 0.5 } // the bolt's shaft, beside the cube

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

  /** Click the first body, Shift-click the second, assert the count and base/rest roles. */
  const selectPair = async (page, first, second) => {
    await click(page, first)
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '1')
    await click(page, second, { shift: true })
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '2')
    await expect(page.getByTestId('operations-toolbar')).toHaveAttribute('data-enabled', 'true')
    await expect(page.locator('[data-selection-role="base"]')).toHaveCount(1)
    await expect(page.locator('[data-selection-role="secondary"]')).toHaveCount(1)
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
        bounds: (n.getAttribute('data-body-bounds') ?? '').split(',').map(Number),
        volume: Number(n.getAttribute('data-body-volume')),
      })),
    )
  }

  /** Wait for a boolean's result: one body, of this op, with its volume measured. */
  const expectResult = async (page, op) => {
    await expect(viewport(page)).toHaveAttribute('data-body-count', '1')
    const list = await bodies(page)
    expect(list).toHaveLength(1)
    expect(list[0].op).toBe(`boolean.${op}`)
    expect(list[0].volume).toBeGreaterThan(0)
    await settle(page)
    return list[0]
  }

  /** Open History and assert the last row names both operands (core-036). */
  const showHistoryRow = async (page, op, names) => {
    await press(page, 'timeline-toggle')
    const rows = page.locator('[data-testid^="timeline-row-"]')
    await expect(rows).toHaveCount(3)
    const text = await rows.last().innerText()
    expect(text.toLowerCase()).toContain(op)
    for (const name of names) expect(text).toContain(name)
    await page.waitForTimeout(1000)
  }

  test('operations-toolbar-disabled still', async ({ page }) => {
    await openScene(page, 'cube-and-cylinder.ndjson')
    await expect(page.getByTestId('operations-count')).toContainText('0 selected')
    await shot(page, 'operations-toolbar-disabled.png', { locator: page.getByTestId('operations-toolbar') })
  })

  test('operations-toolbar-one still', async ({ page }) => {
    await openScene(page, 'cube-and-cylinder.ndjson')
    await click(page, CUBE_SIDE)
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '1')
    await expect(page.getByTestId('operations-toolbar')).toHaveAttribute('data-enabled', 'false')
    await expect(page.getByTestId('operations-count')).toContainText('1 selected')
    await shot(page, 'operations-toolbar-one.png', { locator: page.getByTestId('operations-toolbar') })
  })

  test('operations-toolbar-enabled still', async ({ page }) => {
    await openScene(page, 'cube-and-cylinder.ndjson')
    await selectPair(page, CUBE_SIDE, CYL_TOP)
    await expect(page.getByTestId('operations-count')).toContainText('2 selected')
    await expect(page.getByTestId('operation-operand-base')).toHaveText('Cube 1')
    await expect(page.getByTestId('operation-operand-rest')).toHaveText('Cylinder 1')
    await shot(page, 'operations-toolbar-enabled.png', { locator: page.getByTestId('operations-toolbar') })
  })

  test('boolean-union', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'cube-and-cylinder.ndjson')
    await startMovie(page, 'boolean-union')
    await selectPair(page, CUBE_SIDE, CYL_TOP)
    await page.waitForTimeout(400)
    await press(page, 'operation-union')
    const result = await expectResult(page, 'union')
    // The merged solid spans the cylinder's full height, above and below the cube.
    expect(result.bounds[5] - result.bounds[2]).toBeGreaterThan(55)
    await showHistoryRow(page, 'union', ['Cube 1', 'Cylinder 1'])
    await endMovie(page, 'boolean-union', { fps: 10, width: 640 })
  })

  test('boolean-subtract', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'cube-and-cylinder.ndjson')
    await startMovie(page, 'boolean-subtract')
    await selectPair(page, CUBE_SIDE, CYL_TOP)
    await page.waitForTimeout(400)
    await press(page, 'operation-subtract')
    const result = await expectResult(page, 'subtract')
    // The cube with a round hole through it: 40 mm cube minus a d24 cylinder 40 mm tall.
    expect(result.volume).toBeCloseTo(64000 - Math.PI * 12 * 12 * 40, -3)
    expect(result.bounds[5] - result.bounds[2]).toBeCloseTo(40, 0)
    await showHistoryRow(page, 'subtract', ['Cube 1', 'Cylinder 1'])
    await endMovie(page, 'boolean-subtract', { fps: 10, width: 640 })
  })

  test('boolean-subtract-order', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'cube-and-cylinder.ndjson')
    await startMovie(page, 'boolean-subtract-order')
    await selectPair(page, CUBE_SIDE, CYL_TOP)
    await press(page, 'operation-subtract')
    const cubeMinusCylinder = await expectResult(page, 'subtract')
    await page.waitForTimeout(500)
    await press(page, 'undo-button')
    await expect(viewport(page)).toHaveAttribute('data-body-count', '2')
    await click(page, { fx: 0.9, fy: 0.6 }) // empty space: clear the selection
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '0')
    // The same two solids, picked the other way round.
    await selectPair(page, CYL_TOP, CUBE_SIDE)
    await expect(page.getByTestId('operation-operand-base')).toHaveText('Cylinder 1')
    await press(page, 'operation-subtract')
    const cylinderMinusCube = await expectResult(page, 'subtract')
    // Order drove the result: these are two different solids, not one recorded twice.
    expect(cylinderMinusCube.bounds).not.toEqual(cubeMinusCylinder.bounds)
    expect(Math.abs(cylinderMinusCube.volume - cubeMinusCylinder.volume)).toBeGreaterThan(1000)
    await page.waitForTimeout(500)
    await endMovie(page, 'boolean-subtract-order', { fps: 10, width: 640 })
  })

  test('boolean-intersect', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'cube-and-sphere.ndjson')
    await startMovie(page, 'boolean-intersect')
    await selectPair(page, SPHERE_CUBE, SPHERE_AT)
    await page.waitForTimeout(400)
    await press(page, 'operation-intersect')
    const result = await expectResult(page, 'intersect')
    // The common volume is smaller than either operand (cube 64000, sphere ~65450).
    expect(result.volume).toBeLessThan(60000)
    await page.waitForTimeout(1000)
    await endMovie(page, 'boolean-intersect', { fps: 10, width: 640 })
  })

  test('boolean-result still', async ({ page }) => {
    await openScene(page, 'cube-and-cylinder.ndjson')
    await selectPair(page, CUBE_SIDE, CYL_TOP)
    await page.getByTestId('operation-subtract').click()
    await expectResult(page, 'subtract')
    // Look down onto the cut: a few presses of the orbit-up arrow, then clear the selection.
    for (let i = 0; i < 2; i++) await page.getByTestId('nav-step-up').click()
    await click(page, { fx: 0.9, fy: 0.6 })
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '0')
    await shot(page, 'boolean-result.png')
  })

  test('boolean-subpart-operand', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'cube-and-bolt.ndjson')
    await startMovie(page, 'boolean-subpart-operand')
    // Click the bolt twice: the whole bolt, then its shaft (the `thread` part).
    await click(page, BOLT_SHAFT)
    await expect(viewport(page)).toHaveAttribute('data-selected-id', 'bolt-1')
    await click(page, BOLT_SHAFT)
    await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('thread')
    // Subtract needs the cube first: toggle the bolt out, add the cube, add the bolt back.
    await click(page, BOLT_SHAFT, { shift: true })
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '0')
    await click(page, BOLT_CUBE, { shift: true })
    await click(page, BOLT_SHAFT, { shift: true })
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '2')
    // The toolbar names the part it is about to use.
    await expect(page.getByTestId('operation-operands')).toHaveAttribute('data-subpart', 'true')
    await expect(page.getByTestId('operation-operand-rest')).toContainText('thread')
    await page.waitForTimeout(500)
    await press(page, 'operation-subtract')
    const result = await expectResult(page, 'subtract')
    // Only the shaft was cut out: a groove, far less than the whole bolt's head-and-shaft envelope.
    expect(result.volume).toBeLessThan(64000)
    expect(result.volume).toBeGreaterThan(64000 - 3000)
    await page.waitForTimeout(1000)
    await endMovie(page, 'boolean-subpart-operand', { fps: 10, width: 640 })
  })

  test('boolean-bolt-hole', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'plate-and-cylinder.ndjson')
    await startMovie(page, 'boolean-bolt-hole')
    await selectPair(page, PLATE_AT, PLATE_CYL)
    await expect(page.getByTestId('operation-operand-base')).toHaveText('Plate 1')
    await page.waitForTimeout(400)
    await press(page, 'operation-subtract')
    const result = await expectResult(page, 'subtract')
    // The plate minus a d10 hole through its 8 mm thickness.
    expect(result.volume).toBeCloseTo(80 * 50 * 8 - Math.PI * 5 * 5 * 8, -2)
    await page.waitForTimeout(1000)
    await endMovie(page, 'boolean-bolt-hole', { fps: 10, width: 640 })
  })
})
