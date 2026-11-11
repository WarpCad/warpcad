// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { test, expect } from '@playwright/test'

import { closeLibrary, isPhone, openLibrary, pointer, sleep, viewportPoint } from './support/humanInput.js'

/**
 * The 3D view comes back after the browser drops its WebGL context (`TODO/render-006`), driven
 * against `/`: two bodies placed by hand, one selected, the context forced away with
 * `WEBGL_lose_context`, then either handed back (the browser restores it) or never handed back
 * (the **Restore view** button after 3 s recreates the renderer on a fresh canvas).
 *
 * All three engines and all three viewports: this is a WebGL path end to end, and the banner is
 * an overlay whose button must stay pressable above the phone's bottom sheet (the hit test in
 * `pointer().press` fails the spec if anything covers it). A still of the banner is written per
 * project under `test-results/context-restore-snapshots/`.
 *
 * The pixel probes are the point: the DOM mirror of the scene (`scene-bodies`) survives a lost
 * context by construction, so only the canvas can show the bodies are drawn again. The probe also
 * re-runs two closed findings: "the scene is too dark to see anything" (a body's restored pixel
 * must match its lit pre-loss colour, not a black unlit one) and "dragging only rotated the grid"
 * (after a renderer recreate, a drag must still move the camera and change what is drawn).
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'context-restore-snapshots')

/** Two drop points, clear of the phone's Library sheet and toolbar (as in `group-merge.e2e.js`). */
const DROPS = (/** @type {import('@playwright/test').TestInfo} */ info) =>
  isPhone(info) ? [[0.3, 0.22], [0.7, 0.2]] : [[0.3, 0.45], [0.6, 0.38]]

/**
 * The mean colour of a 5×5 block of the canvas's drawing buffer around a page point, read back
 * through the context three.js draws with (`preserveDrawingBuffer` keeps it readable). A lost
 * context reads back as zeros.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ x: number, y: number }} point page coordinates
 * @returns {Promise<[number, number, number]>}
 */
function probe(page, point) {
  return page.evaluate(({ x, y }) => {
    const canvas = /** @type {HTMLCanvasElement} */ (document.querySelector('[data-testid="viewport-canvas"]'))
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl || gl.isContextLost()) return [0, 0, 0]
    const rect = canvas.getBoundingClientRect()
    const px = Math.round(((x - rect.left) * canvas.width) / rect.width)
    const py = Math.round(canvas.height - ((y - rect.top) * canvas.height) / rect.height)
    const pixels = new Uint8Array(5 * 5 * 4)
    gl.readPixels(px - 2, py - 2, 5, 5, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    const sum = [0, 0, 0]
    for (let i = 0; i < pixels.length; i += 4) {
      sum[0] += pixels[i]
      sum[1] += pixels[i + 1]
      sum[2] += pixels[i + 2]
    }
    return sum.map((channel) => channel / 25)
  }, point)
}

/** @param {readonly number[]} a @param {readonly number[]} b */
const colourDistance = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])
/** @param {readonly number[]} c */
const luminance = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

/** Force the canvas's context away, keeping the extension so the spec can hand it back. @param {import('@playwright/test').Page} page */
async function loseContext(page) {
  await page.evaluate(() => {
    const canvas = /** @type {HTMLCanvasElement} */ (document.querySelector('[data-testid="viewport-canvas"]'))
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    const extension = gl?.getExtension('WEBGL_lose_context')
    if (!extension) throw new Error('WEBGL_lose_context is not available')
    Object.assign(window, { __loseContext: extension })
    extension.loseContext()
  })
}

/**
 * `/`, then two cubes dragged in from the Library by hand; the second is selected by its commit.
 * Returns the two drop points and each one's pre-loss colour.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} info
 */
async function placeTwo(page, info) {
  await page.goto('/')
  const viewport = page.getByTestId('viewport')
  await expect(viewport).toHaveAttribute('data-webgl', 'ready')
  const input = await pointer(page, info)
  await openLibrary(page, input.press)
  const row = page.getByTestId('library-row-primitive.cuboid')
  const points = []
  for (const [fx, fy] of DROPS(info)) {
    const point = await viewportPoint(page, fx, fy)
    await input.dragRow(row, point.x, point.y)
    points.push(point)
  }
  await expect(viewport).toHaveAttribute('data-body-count', '2')
  await closeLibrary(page, input.press)
  await expect(viewport).toHaveAttribute('data-selected-count', '1')
  await page.mouse.move(0, 0)
  await sleep(300)
  // A probe a few pixels up from the drop point: the cube stands on it, so this is its face.
  const probes = points.map((p) => ({ x: p.x, y: p.y - 6 }))
  const before = []
  for (const p of probes) before.push(await probe(page, p))
  // The background, from the far top corner of the view: the bodies must read as something else.
  const box = await page.getByTestId('viewport-canvas').boundingBox()
  if (!box) throw new Error('no canvas')
  const ground = await probe(page, { x: box.x + box.width - 6, y: box.y + 6 })
  for (const colour of before) {
    expect(colourDistance(colour, ground), `body ${colour} vs background ${ground}`).toBeGreaterThan(40)
    // Lit, not a black silhouette (the "scene too dark" finding).
    expect(luminance(colour)).toBeGreaterThan(50)
  }
  return { input, probes, before }
}

/** What the restore must leave exactly as it was. @param {import('@playwright/test').Page} page */
async function standingState(page) {
  const viewport = page.getByTestId('viewport')
  const inspector = page.getByTestId('inspector')
  return {
    selectedId: await viewport.getAttribute('data-selected-id'),
    selectedCount: await viewport.getAttribute('data-selected-count'),
    camera: [
      await viewport.getAttribute('data-camera-azimuth'),
      await viewport.getAttribute('data-camera-elevation'),
      await viewport.getAttribute('data-camera-distance'),
      await viewport.getAttribute('data-camera-target'),
    ].join('|'),
    inspectorSelected: await inspector.getAttribute('data-selected-id'),
    inspectorState: await inspector.getAttribute('data-state'),
  }
}

/** Every probe draws its body again, in its lit pre-loss colour. */
async function expectBodiesDrawn(page, probes, before) {
  for (let i = 0; i < probes.length; i += 1) {
    await expect
      .poll(async () => colourDistance(await probe(page, probes[i]), before[i]), { message: `body ${i + 1} drawn again` })
      .toBeLessThan(30)
  }
}

/** @param {import('@playwright/test').Page} page @param {import('@playwright/test').TestInfo} info */
async function snapshot(page, info, name) {
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `${info.project.name}-${name}.png`) })
}

/** The banner and its button fit the view: no horizontal scroll, a full tap target. @param {import('@playwright/test').Page} page */
async function expectBannerFits(page) {
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
  expect(fits, 'no horizontal scroll with the banner up').toBe(true)
  const banner = await page.getByTestId('viewport-context-banner').boundingBox()
  const view = await page.getByTestId('viewport').boundingBox()
  if (!banner || !view) throw new Error('no banner or viewport box')
  expect(banner.x).toBeGreaterThanOrEqual(view.x)
  expect(banner.x + banner.width).toBeLessThanOrEqual(view.x + view.width + 0.5)
}

test('a context the browser hands back restores the scene, selection and undo with no reload', async ({ page }, info) => {
  const { input, probes, before } = await placeTwo(page, info)
  const viewport = page.getByTestId('viewport')
  const kept = await standingState(page)
  // A reload would reset this marker; the restore must not.
  await page.evaluate(() => {
    /** @type {any} */ (window).__noReload = true
  })

  await loseContext(page)
  const banner = page.getByTestId('viewport-context-banner')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('The 3D view was paused by the system. Restoring…')
  await expect(viewport).toHaveAttribute('data-webgl', 'lost')
  await expectBannerFits(page)
  await snapshot(page, info, 'restoring')

  await page.evaluate(() => /** @type {any} */ (window).__loseContext.restoreContext())
  await expect(banner).toHaveCount(0)
  await expect(viewport).toHaveAttribute('data-webgl', 'ready')
  await expectBodiesDrawn(page, probes, before)
  expect(await standingState(page)).toEqual(kept)
  expect(await page.evaluate(() => /** @type {any} */ (window).__noReload)).toBe(true)

  // Undo still has the last placement on its stack.
  await input.press(page.getByTestId('undo-button'))
  await expect(viewport).toHaveAttribute('data-body-count', '1')
})

test('a context that never comes back offers Restore view after 3 s, which brings the scene back', async ({ page }, info) => {
  const { input, probes, before } = await placeTwo(page, info)
  const viewport = page.getByTestId('viewport')
  const kept = await standingState(page)
  await page.evaluate(() => {
    /** @type {any} */ (window).__noReload = true
  })

  const lostAt = Date.now()
  await loseContext(page)
  const banner = page.getByTestId('viewport-context-banner')
  await expect(banner).toContainText('Restoring…')
  const restore = page.getByTestId('viewport-restore')
  await expect(restore).toHaveCount(0)
  await expect(restore).toBeVisible({ timeout: 8000 })
  expect(Date.now() - lostAt).toBeGreaterThanOrEqual(2500)
  const tap = await restore.boundingBox()
  expect(tap?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(tap?.width ?? 0).toBeGreaterThanOrEqual(44)
  await expectBannerFits(page)
  await snapshot(page, info, 'restore-view')

  // The hit test inside `press` fails here if the phone's sheet or any chrome covers the button.
  await input.press(restore)
  await expect(banner).toHaveCount(0)
  await expect(viewport).toHaveAttribute('data-webgl', 'ready')
  await expectBodiesDrawn(page, probes, before)
  expect(await standingState(page)).toEqual(kept)
  expect(await page.evaluate(() => /** @type {any} */ (window).__noReload)).toBe(true)

  // Navigation reattached to the recreated renderer: a drag on empty canvas orbits the camera and
  // the bodies are redrawn from the new angle (the "dragging only rotated the grid" finding).
  const azimuth = await viewport.getAttribute('data-camera-azimuth')
  const frames = Number(await viewport.getAttribute('data-frames-rendered'))
  const from = await viewportPoint(page, 0.5, isPhone(info) ? 0.4 : 0.7)
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.getAttribute('data-testid'), [from.x, from.y])
  expect(hit).toBe('viewport-canvas')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 12; i += 1) {
    await page.mouse.move(from.x + i * 8, from.y)
    await sleep(16)
  }
  await page.mouse.up()
  await expect(viewport).not.toHaveAttribute('data-camera-azimuth', String(azimuth))
  await expect.poll(async () => Number(await viewport.getAttribute('data-frames-rendered'))).toBeGreaterThan(frames)
  await expect.poll(async () => colourDistance(await probe(page, probes[0]), before[0])).toBeGreaterThan(0)

  await input.press(page.getByTestId('undo-button'))
  await expect(viewport).toHaveAttribute('data-body-count', '1')
})
