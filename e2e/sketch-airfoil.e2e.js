// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { naca4 } from '../src/sketch/curves.js'

/**
 * Curve helpers and a lofted wing (TODO/sketch-008), driven against `/` — the running app.
 *
 * The docs' recipe by hand: Curve ▾ → Airfoil 2412 at 120 mm, dragged to the origin; a second
 * slice at Z 200 with a 70 mm airfoil, Offset X 30 and Twist −2; Loft; Done. Every placement is
 * a **real drag** — `page.mouse`, or a trusted CDP touch sequence on the phone — never a
 * dispatched PointerEvent (TROUBLESHOOTING.md, 2026-09-24: synthetic events bypass whatever
 * really sits on top of the canvas).
 *
 * Three viewports with a snapshot at each, and every engine: it touches the canvas, the
 * kernel worker and the export path.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'sketch-airfoil-snapshots')
const FOV_DEG = 45

/** @param {import('@playwright/test').TestInfo} info */
const isPhone = (info) => info.project.name.endsWith('-phone')

/** @param {number[][]} ring */
function areaMm2(ring) {
  let twice = 0
  ring.forEach((a, index) => {
    const b = ring[(index + 1) % ring.length]
    twice += a[0] * b[1] - b[0] * a[1]
  })
  return Math.abs(twice / 2)
}

/** @param {import('@playwright/test').Page} page */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (await rows.isVisible()) return
  await page.getByTestId('library-tab').click()
  await expect(rows).toBeVisible()
}

/** @param {import('@playwright/test').Page} page */
async function openNewSketch(page) {
  await openLibrary(page)
  const row = await page.getByTestId('library-row-primitive.sketch').boundingBox()
  const view = await page.getByTestId('viewport').boundingBox()
  if (!row || !view) throw new Error('no Sketch row or viewport')
  await page.mouse.move(row.x + row.width / 2, row.y + row.height / 2)
  await page.mouse.down()
  await page.mouse.move(view.x + view.width * 0.5, view.y + view.height * 0.4 - 30, { steps: 8 })
  await page.mouse.move(view.x + view.width * 0.5, view.y + view.height * 0.4, { steps: 4 })
  await page.mouse.up()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-mode', 'true')
  await expect(page.getByTestId('sketch-toolbar')).toBeVisible()
}

/**
 * The sketch origin in client pixels (the editor aims straight down at it, so it is the
 * viewport's centre) and pixels per millimetre.
 *
 * @param {import('@playwright/test').Page} page
 */
async function sketchScreen(page) {
  const view = page.getByTestId('viewport')
  const box = await view.boundingBox()
  if (!box) throw new Error('no viewport')
  const distanceMm = Number(await view.getAttribute('data-camera-distance'))
  const mmPerPx = (2 * distanceMm * Math.tan((FOV_DEG * Math.PI) / 360)) / box.height
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2, pxPerMm: 1 / mmPerPx }
}

/**
 * Curve ▾ → Airfoil, fill the sheet, Place.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} code @param {string} chordMm
 */
async function armAirfoil(page, code, chordMm) {
  await page.getByTestId('sketch-tool-curve').click()
  await expect(page.getByTestId('sketch-curve-sheet')).toBeVisible()
  await page.getByTestId('sketch-curve-kind-naca4').click()
  await page.getByTestId('sketch-curve-code').fill(code)
  await page.getByTestId('sketch-curve-chord').fill(chordMm)
  await page.getByTestId('sketch-curve-place').click()
  // Place arms the drag and gets the sheet out of the way.
  await expect(page.getByTestId('sketch-curve-sheet')).toHaveCount(0)
  await expect(page.getByTestId('sketch-curve-hint')).toBeVisible()
}

/**
 * Drag the armed airfoil from a little way off and release with its leading edge on the origin.
 *
 * @param {import('@playwright/test').Page} page
 */
async function dragToOrigin(page) {
  const { cx, cy } = await sketchScreen(page)
  await page.mouse.move(cx - 60, cy + 50)
  await page.mouse.down()
  await page.mouse.move(cx - 20, cy + 15, { steps: 6 })
  await page.mouse.move(cx, cy, { steps: 6 })
  await page.mouse.up()
}

/** @param {import('@playwright/test').Page} page */
async function sceneBodies(page) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-testid="scene-bodies"] li')].every((node) => node.hasAttribute('data-body-volume')),
  )
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      op: node.getAttribute('data-body-op') ?? '',
      bounds: (node.getAttribute('data-body-bounds') ?? '').split(',').map(Number),
      volume: Number(node.getAttribute('data-body-volume') ?? '0'),
    })),
  )
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {number} index
 * @param {string} key  `z`, `offset-x`, `offset-y` or `twist`
 * @param {string} value
 */
async function setSliceField(page, index, key, value) {
  const input = page.getByTestId(`sketch-slice-${key}-${index}`)
  await input.fill(value)
  await input.press('Enter')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
})

test('the wing recipe: two airfoils, Offset and Twist on the tip, Loft, Done — one tapered, washed-out wing that exports', async ({
  page,
}, info) => {
  await openNewSketch(page)

  // Root: NACA 2412, 120 mm chord, dragged to the origin.
  await armAirfoil(page, '2412', '120')
  await dragToOrigin(page)
  await expect(page.getByTestId('sketch-selection-status')).toContainText('Airfoil NACA 2412 · 120 mm chord')
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '1')
  // It is a curve, so its points are not dragged one by one: no point handles under Select.
  await expect(page.getByTestId('sketch-toolbar')).toHaveAttribute('data-tool', 'select')

  // Tip: a second slice at Z 200 with a 70 mm airfoil, swept 30 mm back and twisted −2°.
  await page.getByTestId('sketch-slices-toggle').click()
  await page.getByTestId('sketch-slice-add').click()
  await expect(page.getByTestId('sketch-slice-row-1')).toHaveAttribute('data-active', 'true')
  await setSliceField(page, 1, 'z', '200')
  await setSliceField(page, 1, 'offset-x', '30')
  await setSliceField(page, 1, 'twist', '-2')
  await expect(page.getByTestId('sketch-slice-offset-x-1')).toHaveValue('30')
  await expect(page.getByTestId('sketch-slice-twist-1')).toHaveValue('-2')
  await armAirfoil(page, '2412', '70')
  await dragToOrigin(page)
  await expect(page.getByTestId('sketch-selection-status')).toContainText('Airfoil NACA 2412 · 70 mm chord')

  // Loft, and the worker-built preview agrees before Done is pressed.
  await page.getByTestId('sketch-extrude-toggle').click()
  await page.getByTestId('sketch-method-loft').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-preview', 'ok')
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `${info.project.name}-editor.png`) })
  await page.getByTestId('sketch-done').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-mode', 'false')

  const bodies = await sceneBodies(page)
  expect(bodies).toHaveLength(1)
  expect(bodies[0].op).toBe('primitive.sketch')
  const [minX, , minZ, maxX, , maxZ] = bodies[0].bounds
  expect(minZ).toBeCloseTo(0, 1)
  expect(maxZ).toBeCloseTo(200, 1)
  // The root's chord sets the X extent (a hand drag lands within a couple of mm of the origin).
  expect(maxX - minX).toBeGreaterThan(117)
  expect(maxX - minX).toBeLessThan(123)
  // Similar sections: the frustum h/3·(A1 + A2 + √(A1·A2)); sweep and 2° of twist don't change it.
  const a1 = areaMm2(naca4('2412', 120))
  const a2 = areaMm2(naca4('2412', 70))
  const frustum = (200 / 3) * (a1 + a2 + Math.sqrt(a1 * a2))
  expect(Math.abs(bodies[0].volume - frustum) / frustum).toBeLessThan(0.02)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `${info.project.name}-wing.png`) })

  // Export it: File ▾ → Export…, STL — a real, non-empty file.
  await page.getByTestId('file-menu-button').click()
  await page.getByTestId('file-export').click()
  await expect(page.getByTestId('export-popover')).toBeVisible()
  await page.getByTestId('export-format-stl').check()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-commit').click()])
  expect(download.suggestedFilename()).toMatch(/\.stl$/)
  const bytes = readFileSync(await download.path())
  const triangles = bytes.readUInt32LE(80)
  expect(triangles).toBeGreaterThan(100)
  expect(bytes.byteLength).toBe(84 + 50 * triangles)
})

test('a bad airfoil is refused in the sheet, naming the field — nothing is armed', async ({ page }) => {
  await openNewSketch(page)
  await page.getByTestId('sketch-tool-curve').click()
  await page.getByTestId('sketch-curve-chord').fill('0')
  await page.getByTestId('sketch-curve-place').click()
  await expect(page.getByTestId('sketch-curve-error')).toContainText('chordMm')
  await expect(page.getByTestId('sketch-curve-error')).toHaveAttribute('data-field', 'chordMm')
  await expect(page.getByTestId('sketch-curve-chord')).toHaveAttribute('aria-invalid', 'true')
  await page.getByTestId('sketch-curve-chord').fill('120')
  await page.getByTestId('sketch-curve-code').fill('abcd')
  await page.getByTestId('sketch-curve-place').click()
  await expect(page.getByTestId('sketch-curve-error')).toHaveAttribute('data-field', 'code')
  await expect(page.getByTestId('sketch-toolbar')).not.toHaveAttribute('data-tool', 'curve')
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '0')
})

test('Edit curve: the Inspector’s numbers regenerate the outline in place', async ({ page }) => {
  await openNewSketch(page)
  await armAirfoil(page, '2412', '120')
  await dragToOrigin(page)
  await expect(page.getByTestId('sketch-selection-status')).toContainText('120 mm chord')
  // On a narrow viewport the Inspector is a sheet that stays closed until its tab is tapped.
  const inspector = page.getByTestId('inspector')
  if ((await inspector.getAttribute('data-open')) === 'false' && (await page.getByTestId('inspector-sketch-profile').isHidden())) {
    await page.getByTestId('inspector-tab').click()
  }
  // A curve has no point handles until Convert to outline.
  await expect(page.getByTestId('sketch-vertex-handles')).toHaveCount(0)
  const chord = page.getByTestId('inspector-sketch-curve-chordMm')
  await expect(chord).toHaveValue('120')
  await chord.fill('100')
  await chord.press('Enter')
  await expect(page.getByTestId('sketch-selection-status')).toContainText('Airfoil NACA 2412 · 100 mm chord')
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '1')
})

test('touch only: a finger drags an airfoil into place at the phone viewport', async ({ page, browserName }, info) => {
  test.skip(!isPhone(info), 'the touch pass runs at the phone reference')
  test.skip(browserName !== 'chromium', 'a trusted touch *drag* needs CDP Input.dispatchTouchEvent, which only Chromium exposes')
  const cdp = await page.context().newCDPSession(page)
  await openNewSketch(page)
  await armAirfoil(page, '0012', '80')
  const { cx, cy } = await sketchScreen(page)
  const from = [cx - 50, cy + 40]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from[0], y: from[1] }] })
  for (let i = 1; i <= 12; i += 1) {
    const t = i / 12
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from[0] + (cx - from[0]) * t, y: from[1] + (cy - from[1]) * t }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.getByTestId('sketch-selection-status')).toContainText('Airfoil NACA 0012 · 80 mm chord')
  await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '1')
  // The Curve ▾ control is a real tap target in the phone toolbar.
  const box = await page.getByTestId('sketch-tool-curve').boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(32)
})
