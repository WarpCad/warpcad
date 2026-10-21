// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { binaryStl, boxTriangles, asciiBytes, gridTriangles } from '../src/io/__fixtures__/stl.js'
import { closeLibrary, isPhone, openLibrary, pointer, sceneBodies, viewportPoint } from './support/humanInput.js'
import { withRowSettings } from './support/libraryRow.js'

/**
 * Import a model file into My parts, place it, cut it (`TODO/io-009`), driven against `/`.
 *
 * The TODO's own example, end to end: open the Library, tap **Import model file…**, choose a
 * generated `bracket.stl` through the real file chooser, read its size under the row, drag the
 * row into the viewport, see it selected with its dimensions and a "not parametric" note, add
 * a cube and Subtract it from the mesh, reload (the part and the instance come back), start
 * **File ▸ New** (the part stays in My parts). Refusals: a text file named `x.stl` and an
 * over-cap triangle count each show their reason inline and leave the Library unchanged.
 *
 * Input is real, not synthetic (see `support/humanInput.js`): trusted CDP touch at Chromium
 * phone/tablet width, a real mouse elsewhere, with a hit test at every press.
 *
 * All three engines and all three viewports: the worker, IndexedDB persistence, the canvas
 * thumbnail and a file input whose behaviour differs per engine are all in play.
 */

const BRACKET = { name: 'bracket.stl', mimeType: 'model/stl', buffer: Buffer.from(binaryStl(boxTriangles([40, 20, 10]))) }
const DROPS = (info) => (isPhone(info) ? { a: [0.5, 0.22], b: [0.5, 0.22] } : { a: [0.45, 0.5], b: [0.45, 0.5] })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

/** Choose a file through the button's real file chooser. */
async function chooseModel(page, input, file) {
  const chooser = page.waitForEvent('filechooser')
  // In the icons tier Import model… is in the rail's ⋯ menu (TODO/ui-084).
  const more = page.getByTestId('library-rail-more')
  if (await more.isVisible().catch(() => false)) await input.press(more)
  await input.press(page.getByTestId('library-import-model'))
  await (await chooser).setFiles(file)
}

async function ensureUserOpen(page, input) {
  const toggle = page.getByTestId('library-section-toggle-user')
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await input.press(toggle)
}

test('import bracket.stl, check its size, drag it in, cut a cube out of it, reload, File > New', async ({ page }, info) => {
  const input = await pointer(page, info)
  await openLibrary(page, input.press)
  await ensureUserOpen(page, input)
  await chooseModel(page, input, BRACKET)

  const row = page.getByTestId('library-row-user.bracket')
  await expect(row).toBeVisible()
  // In the icons tier the mesh line and the thumbnail are in the row's pop-out (TODO/ui-084).
  await withRowSettings(page, 'user.bracket', async () => {
    await expect(page.getByTestId('library-mesh-tag')).toHaveText('Mesh')
    await expect(page.getByTestId('library-mesh-size')).toHaveText('40 × 20 × 10 mm')
    await expect(page.getByTestId('library-mesh-assumed')).toHaveText('Units assumed: mm')
    await expect(page.getByTestId('library-mesh-units-user.bracket')).toHaveValue('mm')
    await expect(page.getByTestId('library-toast')).toHaveText('Imported bracket.stl — 12 triangles, 40 × 20 × 10 mm')
    await expect(page.getByTestId('library-import-progress')).toHaveCount(0)
    // A thumbnail was drawn from the mesh, not a swatch.
    await expect(page.getByTestId('library-thumb-user.bracket')).toBeVisible()
    expect(await page.getByTestId('library-thumb-user.bracket').evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth)).toBeGreaterThan(0)
  })
  await info.attach(`library-import-row-${info.project.name}`, { body: await page.screenshot(), contentType: 'image/png' })
  // The panel did not grow sideways (the hidden file input regression of ui-055).
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)

  // Place the mesh, then a cube on the same spot; scenario 1's rule holds (nothing replaced).
  const drops = DROPS(info)
  let p = await viewportPoint(page, ...drops.a)
  await input.dragRow(row, p.x, p.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await openLibrary(page, input.press)
  p = await viewportPoint(page, ...drops.b)
  await input.dragRow(page.getByTestId('library-row-primitive.cuboid'), p.x, p.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  const bodies = await sceneBodies(page)
  expect(bodies.map((b) => b.op).sort()).toEqual(['primitive.cuboid', 'user.bracket'])
  await closeLibrary(page, input.press)

  // Select the mesh alone: its dimensions are the file's, read-only, and the Inspector says
  // a mesh is not parametric.
  const list = page.getByTestId('object-list')
  if (!(await list.isVisible().catch(() => false))) await input.press(page.getByTestId('inspector-objects-header'))
  await input.press(page.getByTestId(`objects-row-${bodies.find((b) => b.op === 'user.bracket').id}`))
  await expect(page.getByTestId('inspector-name')).toHaveText('bracket 1')
  await expect(page.getByTestId('inspector-size-x')).toHaveValue('40')
  await expect(page.getByTestId('inspector-size-y')).toHaveValue('20')
  await expect(page.getByTestId('inspector-size-z')).toHaveValue('10')
  await expect(page.getByTestId('inspector-mesh-note')).toContainText(/not parametric/i)

  // Subtract the cube from it: the mesh is picked first, so it is the base. (The list may fold
  // with the selection count; open it again as a person would.)
  if (!(await list.isVisible().catch(() => false))) await input.press(page.getByTestId('inspector-objects-header'))
  await input.press(page.getByTestId(`objects-check-${bodies.find((b) => b.op === 'primitive.cuboid').id}`))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await input.press(page.getByTestId('operation-subtract'))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  expect((await sceneBodies(page)).map((b) => b.op)).toEqual(['boolean.subtract'])

  // Reload: the part and its placed (cut) instance survive.
  await page.reload()
  await expect(page.getByTestId('viewport')).toBeVisible()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('library-user-count')).toHaveText('1')

  // File > New: the scene empties, the part stays in My parts.
  await input.press(page.getByTestId('file-menu-button'))
  await input.press(page.getByTestId('file-new'))
  const replace = page.getByTestId('file-open-confirm-replace')
  if (await replace.isVisible().catch(() => false)) await input.press(replace)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
  await expect(page.getByTestId('library-user-count')).toHaveText('1')
  await openLibrary(page, input.press)
  await ensureUserOpen(page, input)
  await expect(page.getByTestId('library-row-user.bracket')).toBeVisible()
  await withRowSettings(page, 'user.bracket', () => expect(page.getByTestId('library-mesh-size')).toHaveText('40 × 20 × 10 mm'))
})

test('Units: STL has none, so the row says so and re-reads the size when switched to inch', async ({ page }, info) => {
  const input = await pointer(page, info)
  await openLibrary(page, input.press)
  await ensureUserOpen(page, input)
  // 1 × 0.5 × 0.25 file units: read as mm it is a speck; the file was drawn in inches.
  const tiny = { name: 'tiny.stl', mimeType: 'model/stl', buffer: Buffer.from(binaryStl(boxTriangles([1, 0.5, 0.25]))) }
  await chooseModel(page, input, tiny)
  await withRowSettings(page, 'user.tiny', async () => {
    await expect(page.getByTestId('library-mesh-size')).toHaveText('1 × 0.5 × 0.25 mm')
    await page.getByTestId('library-mesh-units-user.tiny').selectOption('inch')
    await expect(page.getByTestId('library-mesh-size')).toHaveText('25.4 × 12.7 × 6.35 mm')
    await expect(page.getByTestId('library-mesh-assumed')).toHaveCount(0)
  })
  await page.reload()
  await expect(page.getByTestId('viewport')).toBeVisible()
  await openLibrary(page, input.press)
  await ensureUserOpen(page, input)
  await withRowSettings(page, 'user.tiny', () => expect(page.getByTestId('library-mesh-size')).toHaveText('25.4 × 12.7 × 6.35 mm'))
})

test('a text file named x.stl, and a file over the triangle cap, are refused in words and change nothing', async ({ page }, info) => {
  const input = await pointer(page, info)
  await openLibrary(page, input.press)
  await ensureUserOpen(page, input)
  await expect(page.getByTestId('library-user-count')).toHaveText('0')

  await chooseModel(page, input, { name: 'x.stl', mimeType: 'model/stl', buffer: Buffer.from(asciiBytes('this is not a model, just text')) })
  await expect(page.getByTestId('library-import-error')).toBeVisible()
  await expect(page.getByTestId('library-import-error')).not.toHaveText('')
  await expect(page.getByTestId('library-user-count')).toHaveText('0')

  // 354 × 354 × 2 = 250,632 triangles: over the 250 k cap, small enough to be read.
  const big = { name: 'scan.stl', mimeType: 'model/stl', buffer: Buffer.from(binaryStl(gridTriangles(354))) }
  await chooseModel(page, input, big)
  await expect(page.getByTestId('library-import-error')).toContainText(/triangles/i)
  await expect(page.getByTestId('library-user-count')).toHaveText('0')

  // A header that lies about its count (0xFFFFFFFF) is refused without trying to allocate it.
  const lying = Buffer.from(binaryStl(boxTriangles([1, 1, 1]), { count: 0xffffffff }))
  await chooseModel(page, input, { name: 'liar.stl', mimeType: 'model/stl', buffer: lying })
  await expect(page.getByTestId('library-import-error')).toBeVisible()
  await expect(page.getByTestId('library-user-count')).toHaveText('0')

  // And a good file afterwards still works: the refusal left no state behind.
  await chooseModel(page, input, BRACKET)
  await expect(page.getByTestId('library-row-user.bracket')).toBeVisible()
  await expect(page.getByTestId('library-import-error')).toHaveCount(0)
  await expect(page.getByTestId('library-user-count')).toHaveText('1')
})

test('at laptop width a model file dropped on the Library panel is imported too', async ({ page }, info) => {
  test.skip(!info.project.name.endsWith('-laptop'), 'touch has no file drag; the button is the path')
  const data = Array.from(BRACKET.buffer)
  const handle = await page.evaluateHandle((bytes) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([new Uint8Array(bytes)], 'dropped.stl', { type: 'model/stl' }))
    return transfer
  }, data)
  const sheet = page.locator('#library-sheet')
  await sheet.dispatchEvent('dragover', { dataTransfer: handle })
  await expect(sheet).toHaveAttribute('data-file-over', 'true')
  await sheet.dispatchEvent('drop', { dataTransfer: handle })
  await expect(page.getByTestId('library-row-user.dropped')).toBeVisible()
  await expect(page.getByTestId('library-mesh-size')).toHaveText('40 × 20 × 10 mm')
})
