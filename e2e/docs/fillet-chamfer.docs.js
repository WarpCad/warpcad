// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import modeling from '@jscad/modeling'
import { chamferRim, filletRim } from '../../src/core/kernel/fillet.js'
import { openApp, loadScene, startMovie, endMovie, shot, settle, humanDrag } from './support.js'

/**
 * Docs media for `docs/fillet-chamfer.md` (`TODO/docs-013`): the Fillet popover, the
 * validation message, Fillet and Chamfer as movies, and the two results side by side.
 * Laptop, Chromium only.
 *
 * **Never a hexagon here.** `io-006` is an OPEN finding: a fillet on a hexagon exports
 * open edges. Every shot uses a plain cube so the pictures do not show (or hide) that bug;
 * a future maintainer should not "improve" a shot by swapping in the Hexagon primitive.
 *
 * Fillet and Chamfer run in the kernel worker. The app has no worker-idle attribute, so
 * every result frame waits for the document state it is about to show: the body's measured
 * `data-body-volume` (published by the worker, from the real evaluated geometry) must drop
 * below the pre-op volume, so a GIF never ends on the pre-fillet frame. The app exposes no
 * mesh vertex count and `src/` does not change for a docs task, so the "vertex count
 * changes" claim is checked against the same kernel call in Node (`filletRim` /
 * `chamferRim` on a 40 mm cube), next to the in-app volume drop. Not an acceptance check.
 */
test.describe('docs media: fillet and chamfer', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  /** CSS-pixel points read off a 1440x900 laptop screenshot. */
  const CUBE_FRONT = { x: 540, y: 504 } // one-cube.ndjson: the cube's front-left face
  const CUBE_1_FACE = { x: 461, y: 461 } // two-cubes.ndjson
  const CUBE_2_FACE = { x: 792, y: 576 }
  const EMPTY = { x: 1050, y: 800 }

  /** @param {import('@playwright/test').Page} page */
  const viewport = (page) => page.getByTestId('viewport')

  const glideTo = async (page, point) => {
    await page.mouse.move(point.x, point.y, { steps: 10 })
    await page.waitForTimeout(150)
  }

  /** A human-paced real click at a CSS-pixel point. */
  const clickAt = async (page, point) => {
    await glideTo(page, point)
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

  /** Type into a field the way a person does, with the pointer on it first. */
  const typeInto = async (page, testId, text) => {
    const el = page.getByTestId(testId)
    const b = await el.boundingBox()
    await glideTo(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
    await el.click()
    await el.fill('')
    await el.pressSequentially(text, { delay: 140 })
  }

  /** Every body's measured volume; waits until the worker has measured all of them. */
  const volumes = async (page) => {
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[data-testid="scene-bodies"] li')].every((n) => n.hasAttribute('data-body-volume')),
    )
    const list = await page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
      nodes.map((n) => [n.getAttribute('data-body-id'), Number(n.getAttribute('data-body-volume'))]),
    )
    return Object.fromEntries(list)
  }

  /** Wait (not a fixed timeout) until `id`'s volume is below `before`, i.e. the worker has re-measured it. */
  const waitForRimApplied = async (page, id, before) => {
    await expect.poll(async () => (await volumes(page))[id], { timeout: 15000 }).toBeLessThan(before - 1)
    await settle(page)
  }

  /** Distinct vertices of a kernel solid. */
  const vertexCount = (solid) => {
    const seen = new Set()
    for (const polygon of solid.polygons) for (const v of polygon.vertices) seen.add(v.map((n) => n.toFixed(4)).join(','))
    return seen.size
  }
  const cube = () => modeling.primitives.cuboid({ size: [40, 40, 40], center: [0, 0, 20] })

  const selectOne = async (page, point, id) => {
    await clickAt(page, point)
    await expect(viewport(page)).toHaveAttribute('data-selected-id', id)
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '1')
    await expect(page.getByTestId('operation-fillet')).toBeEnabled()
  }

  /** Open a rim popover on the selected body and fill it; leaves the commit button unpressed. */
  const fillPopover = async (page, op, radius) => {
    await press(page, op === 'fillet' ? 'operation-fillet' : 'operation-chamfer')
    const popover = page.getByTestId('fillet-chamfer-popover')
    await expect(popover).toBeVisible()
    await expect(popover).toHaveAttribute('data-op', op === 'fillet' ? 'modify.filletRim' : 'modify.chamferRim')
    await expect(page.getByTestId('fillet-chamfer-commit')).toBeDisabled() // no radius yet
    await page.waitForTimeout(500)
    await page.getByTestId('fillet-chamfer-face').selectOption('z+')
    await page.waitForTimeout(350)
    await typeInto(page, 'fillet-chamfer-radius', radius)
    await expect(page.getByTestId('fillet-chamfer-commit')).toBeEnabled()
    await page.waitForTimeout(400)
    return popover
  }

  test('fillet-popover still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'one-cube.ndjson', 1)
    await selectOne(page, CUBE_FRONT, 'cube-1')
    await press(page, 'operation-fillet')
    await page.getByTestId('fillet-chamfer-face').selectOption('z+')
    await page.getByTestId('fillet-chamfer-radius').fill('3')
    await expect(page.getByTestId('fillet-chamfer-commit')).toBeEnabled()
    await shot(page, 'fillet-popover.png', { locator: page.getByTestId('fillet-chamfer-popover') })
  })

  test('fillet-error still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'one-cube.ndjson', 1)
    await selectOne(page, CUBE_FRONT, 'cube-1')
    const before = await volumes(page)
    await press(page, 'operation-fillet')
    await page.getByTestId('fillet-chamfer-face').selectOption('z+')
    await page.getByTestId('fillet-chamfer-radius').fill('45') // past the cube's own 40 mm
    await page.getByTestId('fillet-chamfer-commit').click()
    const error = page.getByTestId('fillet-chamfer-error')
    await expect(error).toBeVisible()
    await expect(error).not.toHaveText('')
    // Nothing committed: popover open, body unchanged.
    await expect(page.getByTestId('fillet-chamfer-popover')).toBeVisible()
    expect((await volumes(page))['cube-1']).toBeCloseTo(before['cube-1'], 3)
    await shot(page, 'fillet-error.png', { locator: page.getByTestId('fillet-chamfer-popover') })
  })

  for (const [name, op, label, rim] of [
    ['fillet-operation', 'fillet', 'Fillet', filletRim],
    ['chamfer-operation', 'chamfer', 'Chamfer', chamferRim],
  ]) {
    test(name, { tag: '@movie' }, async ({ page }) => {
      await openApp(page)
      await loadScene(page, 'one-cube.ndjson', 1)
      const before = (await volumes(page))['cube-1']
      await startMovie(page, name)
      await selectOne(page, CUBE_FRONT, 'cube-1')
      await page.waitForTimeout(500)
      const popover = await fillPopover(page, op, '3')
      await press(page, 'fillet-chamfer-commit')
      await expect(popover).toHaveCount(0)
      await waitForRimApplied(page, 'cube-1', before)
      // Still one body, same id, still selected: a rim op supersedes, it does not add.
      await expect(viewport(page)).toHaveAttribute('data-body-count', '1')
      await expect(viewport(page)).toHaveAttribute('data-selected-id', 'cube-1')
      // The mesh really changed: the kernel's own rim op adds vertices to a cube's 8.
      expect(vertexCount(cube())).toBe(8)
      expect(vertexCount(rim({ radius: 3, orientation: 'z+' }, cube()))).toBeGreaterThan(8)
      await page.waitForTimeout(1500)
      await endMovie(page, name, { fps: 10, width: 640 })
      expect(label).toBeTruthy()
    })
  }

  test('fillet-vs-chamfer still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'two-cubes.ndjson', 2)
    const v0 = await volumes(page)
    // Cube 1 gets a Fillet, Cube 2 a Chamfer, each through the real popover.
    await selectOne(page, CUBE_1_FACE, 'cube-1')
    await fillPopover(page, 'fillet', '4')
    await press(page, 'fillet-chamfer-commit')
    await expect(page.getByTestId('fillet-chamfer-popover')).toHaveCount(0)
    await waitForRimApplied(page, 'cube-1', v0['cube-1'])
    await selectOne(page, CUBE_2_FACE, 'cube-2')
    await fillPopover(page, 'chamfer', '4')
    await press(page, 'fillet-chamfer-commit')
    await expect(page.getByTestId('fillet-chamfer-popover')).toHaveCount(0)
    await waitForRimApplied(page, 'cube-2', v0['cube-2'])
    // Clear the selection (no gizmo in the picture) and orbit to look down at the rims.
    await clickAt(page, EMPTY)
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '0')
    const az = await viewport(page).getAttribute('data-camera-azimuth')
    await humanDrag(page, { x: 800, y: 700 }, { x: 860, y: 790 }, { steps: 20, ms: 800 })
    expect(await viewport(page).getAttribute('data-camera-azimuth')).not.toBe(az)
    await shot(page, 'fillet-vs-chamfer.png', { locator: viewport(page) })
  })
})
