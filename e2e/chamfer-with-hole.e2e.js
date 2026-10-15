// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `TODO/core-051`: the user's own project, `examples/chamfer error.ndjson` (a 215 x 127 mm
 * sketch with a rectangular hole, extruded 10 mm, then `modify.chamferRim` radius 5 on
 * `z+`), opened through File > Open. Before the fix the chamfer *added* material (the
 * loft's slices were twisted); now it must remove the two rims' worth.
 *
 * Engines: all three (WebGL render plus the kernel worker). Viewport: laptop only, since
 * the result is a rendered shape, not layout.
 */

const PROJECT = join(process.cwd(), 'examples', 'chamfer error.ndjson')

test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only: this checks geometry, not layout')

test("the user's plate with a hole opens with a correctly bevelled rim", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
  })
  await page.goto('/')
  const viewport = page.getByTestId('viewport')
  await expect(viewport).toHaveAttribute('data-webgl', 'ready')

  await page.getByTestId('file-menu-button').click()
  const chooserEvent = page.waitForEvent('filechooser')
  await page.getByTestId('file-open').click()
  const chooser = await chooserEvent
  await chooser.setFiles({ name: 'chamfer error.ndjson', mimeType: 'text/plain', buffer: readFileSync(PROJECT) })
  await expect(viewport).toHaveAttribute('data-body-count', '1')

  const body = page.getByTestId('scene-body-sketch-1')
  await expect(body).toHaveAttribute('data-body-volume', /./, { timeout: 20000 })

  const width = 215.1488869761107
  const depth = 127.53646128422534
  const holeWidth = 120.42308506104439
  const holeDepth = 65.81988403812446
  const height = 10
  const plate = (width * depth - holeWidth * holeDepth) * height
  const removed = (5 * 5 / 2) * (2 * (width + depth) + 2 * (holeWidth + holeDepth))
  const volume = Number(await body.getAttribute('data-body-volume'))
  // Before the fix this came out ABOVE the plate's own volume.
  expect(volume).toBeLessThan(plate)
  expect(volume).toBeGreaterThan(plate - removed * 1.1)
  expect(volume).toBeLessThan(plate - removed * 0.9)

  // The chamfer leaves the bounding box alone: still the sketch's own footprint and height.
  const bounds = (await body.getAttribute('data-body-bounds')).split(',').map(Number)
  expect(bounds[3] - bounds[0]).toBeCloseTo(width, 1)
  expect(bounds[4] - bounds[1]).toBeCloseTo(depth, 1)
  expect(bounds[5] - bounds[2]).toBeCloseTo(height, 1)

  // Select it: the Inspector names the body and the op that produced it.
  const canvas = await page.getByTestId('viewport-canvas').boundingBox()
  await page.mouse.click(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.62)
  await expect(viewport).toHaveAttribute('data-selected-count', '1')
  await expect(page.getByTestId('inspector-name')).toHaveText('Sketch 1')
  await expect(page.getByTestId('inspector-op')).toHaveAttribute('data-op', 'primitive.sketch')
  await page.mouse.click(canvas.x + canvas.width * 0.97, canvas.y + canvas.height * 0.97)
  await expect(viewport).toHaveAttribute('data-selected-count', '0')

  await page.mouse.move(0, 0)
  await page.waitForTimeout(500)
  await expect(viewport).toHaveScreenshot('chamfer-with-hole.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.03,
  })
})
