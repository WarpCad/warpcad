// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'

import { test, expect } from '@playwright/test'

import { closeLibrary, isPhone, openLibrary, pointer, sceneBodies, viewportPoint } from './support/humanInput.js'

/**
 * The Inspector's **Hidden by default** checkbox (`TODO/ui-093`), driven against `/` with a real
 * mouse and, at phone and tablet, trusted touch: build a two-Cube Group, mark `Cube 2` hidden by
 * default, and check what that changes (the 3D view, the chip, Size, History, Undo and Redo,
 * reload, Export), then the opposite on a Bolt's `tap` and the last-part refusal.
 *
 * Whether a part is drawn is judged from the WebGL canvas's own pixels (`window.__canvasSnaps`, as
 * `inspector-hidden-parts.e2e.js` does), not from the DOM. All three viewports and all three
 * engines: it toggles real meshes, changes the Inspector's layout and writes to persistence.
 */

// Desktop Chromium offers the native File System Access picker, which nothing headless can drive.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
  })
})

/** @typedef {(locator: import('@playwright/test').Locator) => Promise<void>} Press */

/** @param {import('@playwright/test').Page} page @param {Press} press */
async function openInspector(page, press) {
  const tab = page.getByTestId('inspector-tab')
  if ((await page.getByTestId('inspector').getAttribute('data-open')) !== 'true' && (await tab.isVisible())) {
    await press(tab)
    await expect(page.getByTestId('inspector')).toHaveAttribute('data-open', 'true')
  }
}

/** @param {import('@playwright/test').Page} page @param {Press} press */
async function openObjects(page, press) {
  const list = page.getByTestId('object-list')
  if (await list.isVisible().catch(() => false)) return
  await openInspector(page, press)
  if (!(await list.isVisible().catch(() => false))) await press(page.getByTestId('inspector-objects-header'))
  await expect(list).toBeVisible()
}

/** @param {import('@playwright/test').Page} page @param {string} name */
async function idOf(page, name) {
  const body = (await sceneBodies(page)).find((candidate) => candidate.name === name)
  if (!body) throw new Error(`no body named ${name}`)
  return body.id
}

/**
 * The body's millimetre bounds as the viewport reports them.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @returns {Promise<number[]>}
 */
async function boundsOf(page, name) {
  const text = await page.locator(`[data-testid="scene-bodies"] li[data-body-name="${name}"]`).getAttribute('data-body-bounds')
  return String(text).split(',').map(Number)
}

/** The extent along each axis. @param {number[]} b */
const extent = (b) => [b[3] - b[0], b[4] - b[1], b[5] - b[2]]

/** Photograph the WebGL canvas alone into page memory (see `inspector-hidden-parts.e2e.js`). */
async function snapshotCanvas(page, key) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const handle = await page.addStyleTag({
    content: '[data-testid=viewport] > :not(canvas),[data-testid=inspector]{visibility:hidden !important}',
  })
  try {
    const png = await page.getByTestId('viewport-canvas').screenshot()
    await page.evaluate(
      async ({ b64, key }) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
        const surface = new OffscreenCanvas(bitmap.width, bitmap.height)
        const context = surface.getContext('2d')
        context.drawImage(bitmap, 0, 0)
        window.__canvasSnaps = window.__canvasSnaps ?? {}
        window.__canvasSnaps[key] = context.getImageData(0, 0, bitmap.width, bitmap.height)
      },
      { b64: png.toString('base64'), key },
    )
  } finally {
    await handle.evaluate((node) => node.remove())
  }
}

/** How many pixels differ visibly between two stored snapshots. */
function changedPixels(page, a, b) {
  return page.evaluate(
    ({ a, b }) => {
      const first = window.__canvasSnaps[a]
      const second = window.__canvasSnaps[b]
      if (first.width !== second.width || first.height !== second.height) return -1
      let changed = 0
      for (let index = 0; index < first.data.length; index += 4) {
        const delta =
          Math.abs(first.data[index] - second.data[index]) +
          Math.abs(first.data[index + 1] - second.data[index + 1]) +
          Math.abs(first.data[index + 2] - second.data[index + 2])
        if (delta > 24) changed += 1
      }
      return changed
    },
    { a, b },
  )
}

/**
 * Poll a fresh canvas against a stored one until the difference is on the right side of a count.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} against stored snapshot to compare with
 * @param {'same' | 'different'} want
 */
async function expectCanvas(page, against, want) {
  let n = 0
  await expect
    .poll(
      async () => {
        n += 1
        await snapshotCanvas(page, `now-${n}`)
        return changedPixels(page, against, `now-${n}`)
      },
      { message: `canvas is ${want} from ${against}`, timeout: 20_000 },
    )
    [want === 'same' ? 'toBeLessThan' : 'toBeGreaterThan'](want === 'same' ? 40 : 50)
}

/** Two drop points, clear of the phone's Library sheet and toolbar. */
const DROPS = (/** @type {import('@playwright/test').TestInfo} */ info) =>
  isPhone(info) ? [[0.3, 0.22], [0.7, 0.2]] : [[0.3, 0.45], [0.65, 0.4]]

/**
 * Drag two Cubes in, select both from the Objects list and press Group. Leaves `Group 1` selected.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} info
 * @param {Press} press
 * @param {(row: import('@playwright/test').Locator, x: number, y: number) => Promise<void>} dragRow
 */
async function buildCubeGroup(page, info, press, dragRow) {
  await openLibrary(page, press)
  const row = page.getByTestId('library-row-primitive.cuboid')
  for (const [fx, fy] of DROPS(info)) {
    const point = await viewportPoint(page, fx, fy)
    await dragRow(row, point.x, point.y)
  }
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await closeLibrary(page, press)
  await openObjects(page, press)
  await press(page.locator('[data-testid^="objects-check-"]').first())
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await press(page.getByTestId('operation-group'))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  await openInspector(page, press)
  await expect(page.getByTestId('inspector-parts')).toBeVisible()
}

/**
 * Undo and Redo restore the selection the step was made in, so the Inspector may be drilled into
 * the part. Step back up to the group, as a person would, so the Parts list is on screen.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Press} press
 */
async function toGroup(page, press) {
  await openInspector(page, press)
  if (await page.getByTestId('inspector-breadcrumb-part').isVisible().catch(() => false)) {
    await press(page.getByTestId('inspector-breadcrumb-group'))
  }
  await expect(page.getByTestId('inspector-parts')).toBeVisible()
}

/** @param {import('@playwright/test').Page} page */
async function openHistory(page, press) {
  if (!(await page.getByTestId('timeline-panel').isVisible().catch(() => false))) await press(page.getByTestId('timeline-toggle'))
  await expect(page.getByTestId('timeline-panel')).toBeVisible()
}

/** @param {import('@playwright/test').Page} page */
async function closeHistory(page, press) {
  if (await page.getByTestId('timeline-panel').isVisible().catch(() => false)) await press(page.getByTestId('timeline-close'))
  await expect(page.getByTestId('timeline-panel')).toHaveCount(0)
}

/** Binary STL vertex bounds, parsed independently of the serializer. @param {Buffer} bytes */
function stlBounds(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint32(80, true)
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (let tri = 0; tri < count; tri += 1) {
    const base = 84 + tri * 50 + 12
    for (let vertex = 0; vertex < 3; vertex += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = view.getFloat32(base + vertex * 12 + axis * 4, true)
        lo[axis] = Math.min(lo[axis], value)
        hi[axis] = Math.max(hi[axis], value)
      }
    }
  }
  return { triangles: count, extent: hi.map((value, axis) => value - lo[axis]) }
}

test('hide a Group part by default: gone from the view, Size, History, Undo and Redo, reload, Show all, Export', async ({ page }, info) => {
  test.setTimeout(180_000)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  const { press, dragRow } = await pointer(page, info)
  await buildCubeGroup(page, info, press, dragRow)

  // The two Cubes, both drawn. Parts lists both, neither marked hidden.
  const before = extent(await boundsOf(page, 'Group 1'))
  expect(before[0] + before[1] + before[2], 'two cubes apart are wider than one').toBeGreaterThan(40 * 3 + 1)
  await expect(page.getByTestId('inspector-part-hidden-Cube 2')).toHaveCount(0)
  await snapshotCanvas(page, 'both')

  // Drill into Cube 2: the control is there, unticked, and says what it does.
  await press(page.getByTestId('inspector-part-Cube 2'))
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('Cube 2')
  const box = page.getByTestId('inspector-default-hidden')
  await expect(box).toBeVisible()
  await expect(box).not.toBeChecked()
  await expect(box).toBeEnabled()
  await expect(page.getByTestId('inspector-default-hidden-note')).toContainText('Left out of this shape')
  const sheet = await page.getByTestId('inspector').evaluate((node) => ({ scroll: node.scrollWidth, client: node.clientWidth }))
  expect(sheet.scroll, 'the Inspector does not scroll sideways').toBeLessThanOrEqual(sheet.client)
  expect((await box.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(20)
  expect((await page.getByTestId('inspector-default-hidden-section').boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await expect(page.getByTestId('inspector-default-hidden-section')).toHaveScreenshot('inspector-default-hidden.png', {
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixelRatio: 0.05,
  })

  // Tick it: Cube 2 leaves the 3D view, keeps its row with the chip, and the selection stays put.
  await press(page.getByTestId('inspector-default-hidden'))
  await expect(box).toBeChecked()
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('Cube 2')
  await expectCanvas(page, 'both', 'different')
  const hiddenExtent = extent(await boundsOf(page, 'Group 1'))
  for (const value of hiddenExtent) expect(value).toBeCloseTo(40, 1)

  // Step back to the group: Size reads Cube 1 alone, and the row carries the chip.
  await press(page.getByTestId('inspector-breadcrumb-group'))
  for (const axis of ['x', 'y', 'z']) {
    await expect.poll(async () => Number(await page.getByTestId(`inspector-size-${axis}`).inputValue())).toBeCloseTo(40, 1)
  }
  await expect(page.getByTestId('inspector-part-hidden-Cube 2')).toHaveText('hidden')
  await expect(page.getByTestId('inspector-part-hidden-Cube 1')).toHaveCount(0)
  // Visible part first, hidden part below it.
  const order = await page.getByTestId('inspector-parts').locator('[data-testid^="inspector-part-item-"]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-testid')),
  )
  expect(order).toEqual(['inspector-part-item-Cube 1', 'inspector-part-item-Cube 2'])

  // Nothing was hidden with the eye, so Show all has nothing to offer.
  await openObjects(page, press)
  await expect(page.getByTestId('objects-show-all')).toHaveCount(0)

  // History gained one row naming the part and the body.
  await openHistory(page, press)
  await expect(page.getByTestId('timeline-rows')).toContainText('Hide Cube 2 by default on Group 1')
  await closeHistory(page, press)

  // Show hidden parts draws Cube 2 as a translucent overlay again.
  await openInspector(page, press)
  await snapshotCanvas(page, 'hidden')
  await press(page.getByTestId('inspector-hidden-parts-toggle-row'))
  await expect(page.getByTestId('inspector-hidden-parts-toggle')).toBeChecked()
  await expectCanvas(page, 'hidden', 'different')
  await press(page.getByTestId('inspector-hidden-parts-toggle-row'))
  await expect(page.getByTestId('inspector-hidden-parts-toggle')).not.toBeChecked()
  await expectCanvas(page, 'hidden', 'same')

  // One Undo puts everything back, and Redo hides it again.
  const undo = page.getByTestId('undo-button')
  await expect(undo).toHaveAttribute('title', /Undo: Hide Cube 2 by default/)
  await press(undo)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await toGroup(page, press)
  await expect(page.getByTestId('inspector-part-hidden-Cube 2')).toHaveCount(0)
  await expectCanvas(page, 'both', 'same')
  expect(extent(await boundsOf(page, 'Group 1'))).toEqual(before)
  await press(page.getByTestId('redo-button'))
  await toGroup(page, press)
  await expect(page.getByTestId('inspector-part-hidden-Cube 2')).toHaveText('hidden')
  await expectCanvas(page, 'hidden', 'same')

  // Export of the whole scene leaves Cube 2 out: one cube's extent, not two.
  await page.getByTestId('file-menu-button').click()
  await page.getByTestId('file-export').click()
  await expect(page.getByTestId('export-popover')).toBeVisible()
  await page.getByTestId('export-scope-scene').check()
  await page.getByTestId('export-format-stl').check()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-commit').click()])
  const stl = stlBounds(readFileSync(await download.path()))
  expect(stl.triangles).toBeGreaterThan(0)
  for (const value of stl.extent) expect(value).toBeCloseTo(40, 1)

  // Reload: it is still hidden, and still the same size.
  await page.waitForTimeout(800)
  await page.reload()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  for (const value of extent(await boundsOf(page, 'Group 1'))) expect(value).toBeCloseTo(40, 1)
  await openObjects(page, press)
  await press(page.getByTestId(`objects-row-${await idOf(page, 'Group 1')}`))
  await openInspector(page, press)
  await expect(page.getByTestId('inspector-part-hidden-Cube 2')).toHaveText('hidden')
  await expect(page.getByTestId('objects-show-all')).toHaveCount(0)
})

test('the last shown part cannot be hidden, and unticking brings the part back', async ({ page }, info) => {
  test.setTimeout(150_000)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  const { press, dragRow } = await pointer(page, info)
  await buildCubeGroup(page, info, press, dragRow)
  const before = extent(await boundsOf(page, 'Group 1'))
  await snapshotCanvas(page, 'both')

  await press(page.getByTestId('inspector-part-Cube 2'))
  await press(page.getByTestId('inspector-default-hidden'))
  await expect(page.getByTestId('inspector-default-hidden')).toBeChecked()
  await expectCanvas(page, 'both', 'different')

  // Cube 1 is now the only shown part: the box is disabled and says why.
  await press(page.getByTestId('inspector-breadcrumb-group'))
  await press(page.getByTestId('inspector-part-Cube 1'))
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('Cube 1')
  await expect(page.getByTestId('inspector-default-hidden')).toBeDisabled()
  await expect(page.getByTestId('inspector-default-hidden-reason')).toHaveText('Last shown part: it needs one shown part.')
  await expect(page.getByTestId('inspector-default-hidden-note')).toHaveCount(0)

  // Back on the hidden part, untick: an ordinary part again, drawn straight away.
  await press(page.getByTestId('inspector-breadcrumb-group'))
  await press(page.getByTestId('inspector-part-Cube 2'))
  await expect(page.getByTestId('inspector-default-hidden')).toBeChecked()
  await press(page.getByTestId('inspector-default-hidden'))
  await expect(page.getByTestId('inspector-default-hidden')).not.toBeChecked()
  await press(page.getByTestId('inspector-breadcrumb-group'))
  await expectCanvas(page, 'both', 'same')
  expect(extent(await boundsOf(page, 'Group 1'))).toEqual(before)
  await expect(page.getByTestId('inspector-part-hidden-Cube 2')).toHaveCount(0)

  // Control is absent, not disabled, for a whole-body selection.
  await expect(page.getByTestId('inspector-default-hidden')).toHaveCount(0)
})

test('a Bolt’s tap can be shown by default, and hidden again', async ({ page }, info) => {
  test.setTimeout(150_000)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  const { press, dragRow } = await pointer(page, info)
  await openLibrary(page, press)
  await page.getByTestId('library-rows-hardware').scrollIntoViewIfNeeded()
  const point = await viewportPoint(page, 0.45, isPhone(info) ? 0.22 : 0.4)
  await dragRow(page.getByTestId('library-row-hardware.bolt'), point.x, point.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await closeLibrary(page, press)
  await openInspector(page, press)
  const bolt = (await sceneBodies(page))[0]
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', bolt.id)
  await expect(page.getByTestId('inspector-part-hidden-tap')).toHaveText('hidden')
  const asPlaced = extent(await boundsOf(page, bolt.name))

  await press(page.getByTestId('inspector-part-tap'))
  const box = page.getByTestId('inspector-default-hidden')
  await expect(box).toBeChecked()
  await press(page.getByTestId('inspector-default-hidden'))
  await expect(box).not.toBeChecked()
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('tap')

  // The clearance now counts: the bolt grew by the tap's allowance, and the chip is gone.
  await press(page.getByTestId('inspector-breadcrumb-group'))
  await expect(page.getByTestId('inspector-part-hidden-tap')).toHaveCount(0)
  const shown = extent(await boundsOf(page, bolt.name))
  expect(shown[0]).toBeGreaterThan(asPlaced[0] + 0.3)
  expect(shown[2]).toBeGreaterThan(asPlaced[2] + 0.3)

  // And hiding it again restores the first measurement exactly.
  await press(page.getByTestId('inspector-part-tap'))
  await press(page.getByTestId('inspector-default-hidden'))
  await expect(page.getByTestId('inspector-default-hidden')).toBeChecked()
  await press(page.getByTestId('inspector-breadcrumb-group'))
  await expect(page.getByTestId('inspector-part-hidden-tap')).toHaveText('hidden')
  const again = extent(await boundsOf(page, bolt.name))
  again.forEach((value, axis) => expect(value).toBeCloseTo(asPlaced[axis], 2))
})
