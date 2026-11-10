// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { binaryStl, boxTriangles, asciiBytes, gridTriangles } from '../src/io/__fixtures__/stl.js'
import { closeLibrary, isPhone, openLibrary, pointer, sceneBodies, viewportPoint } from './support/humanInput.js'
import { importModel, myPartsCount, openObjectList } from './support/importModel.js'
import { withRowSettings } from './support/libraryRow.js'

/**
 * **File → Import model…** brings a model file into the open project, placed in the 3D view —
 * never into My parts (`TODO/ui-107`, re-running `TODO/io-009`'s reproduction through the File
 * menu), driven against `/`.
 *
 * The TODO's own example: open **File**, choose **Import model…**, pick a generated
 * `bracket.stl` through the real file chooser. *Reading bracket.stl…* shows; the ghost waits at
 * the centre of the view with the chip *Place bracket.stl · Cancel*; move the pointer over the
 * grid and click (on touch, drag the ghost with one finger and lift). The bracket is selected, in
 * Objects, the Inspector shows its size and that a mesh is not parametric, History has *Import
 * bracket.stl*, and **My parts' count does not change**. One Undo removes it. Then: a Cube cut out
 * of it survives a reload with no library entry behind it (scenario 10); Units in the Inspector
 * re-reads an STL drawn in inches, as one undoable step; Cancel and Esc end a session with nothing
 * added; refusals show their reason in the status line and change nothing; a file dropped on the
 * view (laptop) lands at the drop point; and **Save to library…** gives it a My parts row with
 * the same size.
 *
 * Input is real (`support/humanInput.js`): trusted CDP touch at Chromium phone/tablet width, a
 * touchscreen tap on WebKit's touch projects, a real wobbling mouse elsewhere, with a hit test at
 * every press. All three engines and all three viewports: the worker, the WebGL ghost, touch
 * placement, the chip's position over the phone's tabs, and persistence are all in play. A
 * screenshot is attached at each viewport.
 */

const BRACKET = { name: 'bracket.stl', mimeType: 'model/stl', buffer: Buffer.from(binaryStl(boxTriangles([40, 20, 10]))) }
/** Where to place, as fractions of the canvas: clear of the phone's sheets and the toolbar. */
const PLACE = (info) => (isPhone(info) ? [0.45, 0.34] : [0.4, 0.5])

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
})

/** Import a file and place it at `at` (canvas fractions); returns the new body's id. */
async function importAndPlace(page, input, file, at) {
  await importModel(page, input.press, file)
  await expect(page.getByTestId('placement-chip')).toBeVisible()
  const p = await viewportPoint(page, at[0], at[1])
  await input.placeArmed(p.x, p.y)
  await expect(page.getByTestId('placement-chip')).toHaveCount(0)
  const bodies = await sceneBodies(page)
  return bodies[bodies.length - 1].id
}

test('File > Import model… places bracket.stl in the project: selected, sized, in Objects; My parts unchanged; one Undo removes it', async ({ page }, info) => {
  const input = await pointer(page, info)
  const partsBefore = await myPartsCount(page)

  await importModel(page, input.press, BRACKET)
  // The session: the chip, and the ghost waiting at the centre of the view before any hover.
  await expect(page.getByTestId('placement-chip-label')).toHaveText('Place bracket.stl')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-placement-armed', 'true')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-ghost', 'visible')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
  // The chip sits clear of the phone's tabs and on screen.
  const chip = await page.getByTestId('placement-chip').boundingBox()
  const viewportBox = await page.getByTestId('viewport').boundingBox()
  expect(chip && viewportBox && chip.y + chip.height <= viewportBox.y + viewportBox.height).toBe(true)
  await info.attach(`import-model-armed-${info.project.name}`, { body: await page.screenshot(), contentType: 'image/png' })

  const at = PLACE(info)
  const p = await viewportPoint(page, at[0], at[1])
  await input.placeArmed(p.x, p.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('placement-chip')).toHaveCount(0)
  const [body] = await sceneBodies(page)
  expect(body.op).toMatch(/^user\.bracket/)
  expect(body.name).toBe('bracket 1')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', body.id)
  await expect(page.getByTestId('model-import-notice')).toHaveText('Imported bracket.stl — 12 triangles, 40 × 20 × 10 mm')
  await expect(page.getByTestId('undo-button')).toHaveAttribute('title', 'Undo: Import bracket.stl')

  // In Objects and selected there; the Inspector shows its size and the mesh note.
  await openObjectList(page, input.press)
  await expect(page.getByTestId(`objects-row-${body.id}`)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('inspector-name')).toHaveText('bracket 1')
  await expect(page.getByTestId('inspector-size-x')).toHaveValue('40')
  await expect(page.getByTestId('inspector-size-y')).toHaveValue('20')
  await expect(page.getByTestId('inspector-size-z')).toHaveValue('10')
  await expect(page.getByTestId('inspector-mesh-note')).toContainText(/not parametric/i)
  await expect(page.getByTestId('inspector-mesh-units')).toHaveValue('mm')
  await expect(page.getByTestId('inspector-mesh-assumed')).toHaveText('Units assumed: mm')
  await info.attach(`import-model-placed-${info.project.name}`, { body: await page.screenshot(), contentType: 'image/png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)

  // Never the library.
  expect(await myPartsCount(page)).toBe(partsBefore)
  await openLibrary(page, input.press)
  await expect(page.locator('[data-testid^="library-row-user."]')).toHaveCount(0)
  await closeLibrary(page, input.press)

  // One Undo removes it.
  await input.press(page.getByTestId('undo-button'))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
})

test('a second import placed across the selected first one moves only the ghost: the first body is not turned or moved', async ({ page }, info) => {
  // Found by the ui-107 acceptance drive (tablet, trusted touch): with the first model still
  // selected, the second session's drag landed on the gizmo, which is stacked above the session
  // layer, and turned the first model by 6° instead of placing the second.
  const input = await pointer(page, info)
  const firstId = await importAndPlace(page, input, BRACKET, PLACE(info))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', firstId)
  const before = await page.getByTestId(`scene-body-${firstId}`).getAttribute('data-body-bounds')
  // Aim the placement at the first body's X grab arm (the gizmo's own hit target for that arrow),
  // 40% of the way out from the hub: on the arm at every viewport, clear of the phone's tabs.
  // Read while the gizmo shows.
  const onArm = await page.getByTestId('gizmo-grab-arm-x').evaluate((line) => {
    const arm = /** @type {SVGLineElement} */ (line)
    const local = arm.getPointAtLength(arm.getTotalLength() * 0.4)
    const screen = new DOMPoint(local.x, local.y).matrixTransform(arm.getScreenCTM() ?? new DOMMatrix())
    return { x: screen.x, y: screen.y }
  })

  await importModel(page, input.press, { ...BRACKET, name: 'second.stl' })
  await expect(page.getByTestId('placement-chip-label')).toHaveText('Place second.stl')
  // The ghost waits where it can be seen and reached: at phone width the selection has the
  // Inspector sheet open, and the ghost must start above it, on the grid (also found by the drive).
  const layer = page.getByTestId('placement-session-layer')
  const startAt = { x: Number(await layer.getAttribute('data-start-x')), y: Number(await layer.getAttribute('data-start-y')) }
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('data-testid'), startAt)).toBe('placement-session-layer')
  await input.placeArmed(onArm.x, onArm.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await expect(page.getByTestId('placement-chip')).toHaveCount(0)
  expect(await page.getByTestId(`scene-body-${firstId}`).getAttribute('data-body-bounds')).toBe(before)
})

test('cut a cube out of the imported bracket; reload keeps it with no library entry; File > New leaves My parts empty', async ({ page }, info) => {
  test.setTimeout(120_000)
  const input = await pointer(page, info)
  const at = PLACE(info)
  const bracketId = await importAndPlace(page, input, BRACKET, at)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  // A Cube on the same spot (scenario 1: nothing replaced), then Subtract it from the mesh.
  await openLibrary(page, input.press)
  const p = await viewportPoint(page, at[0], at[1])
  await input.dragRow(page.getByTestId('library-row-primitive.cuboid'), p.x, p.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await closeLibrary(page, input.press)
  const cubeId = (await sceneBodies(page)).find((b) => b.op === 'primitive.cuboid').id
  await openObjectList(page, input.press)
  await input.press(page.getByTestId(`objects-row-${bracketId}`))
  await openObjectList(page, input.press)
  await input.press(page.getByTestId(`objects-check-${cubeId}`))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await input.press(page.getByTestId('operation-subtract'))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  expect((await sceneBodies(page)).map((b) => b.op)).toEqual(['boolean.subtract'])

  // Reload: the cut bracket comes back, built from the project's own copy of the part.
  await page.reload()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  expect((await sceneBodies(page)).map((b) => b.op)).toEqual(['boolean.subtract'])
  expect(await myPartsCount(page)).toBe(0)

  // File > New: the scene empties, and nothing was ever in My parts.
  await input.press(page.getByTestId('file-menu-button'))
  await input.press(page.getByTestId('file-new'))
  const replace = page.getByTestId('file-open-confirm-replace')
  if (await replace.isVisible().catch(() => false)) await input.press(replace)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
  expect(await myPartsCount(page)).toBe(0)
})

test('Units in the Inspector: an STL drawn in inches is re-read as one undoable step, and it survives a reload', async ({ page }, info) => {
  const input = await pointer(page, info)
  // 1 × 0.5 × 0.25 file units: read as mm it is a speck; the file was drawn in inches.
  const tiny = { name: 'tiny.stl', mimeType: 'model/stl', buffer: Buffer.from(binaryStl(boxTriangles([1, 0.5, 0.25]))) }
  const id = await importAndPlace(page, input, tiny, PLACE(info))
  await openObjectList(page, input.press)
  await input.press(page.getByTestId(`objects-row-${id}`))
  await expect(page.getByTestId('inspector-size-x')).toHaveValue('1')
  await page.getByTestId('inspector-mesh-units').selectOption('inch')
  await expect(page.getByTestId('inspector-size-x')).toHaveValue('25.4')
  await expect(page.getByTestId('inspector-mesh-assumed')).toHaveCount(0)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', id)
  await input.press(page.getByTestId('undo-button'))
  await expect(page.getByTestId('inspector-size-x')).toHaveValue('1')
  await input.press(page.getByTestId('redo-button'))
  await expect(page.getByTestId('inspector-size-x')).toHaveValue('25.4')

  await page.reload()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await openObjectList(page, input.press)
  await input.press(page.getByTestId(`objects-row-${id}`))
  await expect(page.getByTestId('inspector-size-x')).toHaveValue('25.4')
  await expect(page.getByTestId('inspector-mesh-units')).toHaveValue('inch')
})

test('Cancel on the chip, and Esc, end a session with nothing added', async ({ page }, info) => {
  const input = await pointer(page, info)
  await importModel(page, input.press, BRACKET)
  await expect(page.getByTestId('placement-chip')).toBeVisible()
  await input.press(page.getByTestId('placement-chip-cancel'))
  await expect(page.getByTestId('placement-chip')).toHaveCount(0)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-ghost', 'hidden')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
  await expect(page.getByTestId('undo-button')).toBeDisabled()

  await importModel(page, input.press, BRACKET)
  await expect(page.getByTestId('placement-chip')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('placement-chip')).toHaveCount(0)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')

  // A cancelled import leaves nothing behind: the next one keeps the plain name.
  await importAndPlace(page, input, BRACKET, PLACE(info))
  expect((await sceneBodies(page))[0].name).toBe('bracket 1')
})

test('a text file named x.stl, and a file over the triangle cap, are refused in words and change nothing', async ({ page }, info) => {
  const input = await pointer(page, info)
  await importModel(page, input.press, { name: 'x.stl', mimeType: 'model/stl', buffer: Buffer.from(asciiBytes('this is not a model, just text')) })
  await expect(page.getByTestId('model-import-error')).toBeVisible()
  await expect(page.getByTestId('model-import-error')).not.toHaveText('')
  await expect(page.getByTestId('placement-chip')).toHaveCount(0)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
  await info.attach(`import-model-refused-${info.project.name}`, { body: await page.screenshot(), contentType: 'image/png' })

  // 354 × 354 × 2 = 250,632 triangles: over the 250 k cap, small enough to be read.
  const big = { name: 'scan.stl', mimeType: 'model/stl', buffer: Buffer.from(binaryStl(gridTriangles(354))) }
  await importModel(page, input.press, big)
  await expect(page.getByTestId('model-import-error')).toContainText(/triangles/i)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')

  // A header that lies about its count (0xFFFFFFFF) is refused without trying to allocate it.
  const lying = Buffer.from(binaryStl(boxTriangles([1, 1, 1]), { count: 0xffffffff }))
  await importModel(page, input.press, { name: 'liar.stl', mimeType: 'model/stl', buffer: lying })
  await expect(page.getByTestId('model-import-error')).toBeVisible()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
  await expect(page.getByTestId('undo-button')).toBeDisabled()

  // A good file afterwards still works: the refusal left no state behind.
  await importAndPlace(page, input, BRACKET, PLACE(info))
  await expect(page.getByTestId('model-import-error')).toHaveCount(0)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  expect(await myPartsCount(page)).toBe(0)
})

test('at laptop width a model file dropped on the 3D view lands at the drop point, with no session', async ({ page }, info) => {
  test.skip(!info.project.name.endsWith('-laptop'), 'touch has no file drag; File > Import model… is the path')
  /** Drop `name` on the canvas at canvas fractions (fx, fy). */
  const dropAt = async (name, fx, fy) => {
    const p = await viewportPoint(page, fx, fy)
    const transfer = await page.evaluateHandle(
      ([bytes, fileName]) => {
        const data = new DataTransfer()
        data.items.add(new File([new Uint8Array(bytes)], fileName, { type: 'model/stl' }))
        return data
      },
      [Array.from(BRACKET.buffer), name],
    )
    const viewport = page.getByTestId('viewport')
    await viewport.dispatchEvent('dragover', { dataTransfer: transfer, clientX: p.x, clientY: p.y })
    await viewport.dispatchEvent('drop', { dataTransfer: transfer, clientX: p.x, clientY: p.y })
  }
  await dropAt('left.stl', 0.3, 0.5)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('placement-chip')).toHaveCount(0)
  await dropAt('right.stl', 0.7, 0.5)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  const centres = await page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => Number((node.getAttribute('data-body-center') ?? '0').split(',')[0])),
  )
  expect(centres[1]).toBeGreaterThan(centres[0])
  const last = (await sceneBodies(page))[1]
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', last.id)
  expect(await myPartsCount(page)).toBe(0)
})

test('Save to library… on the imported model gives it one My parts row, with the same size', async ({ page }, info) => {
  const input = await pointer(page, info)
  const id = await importAndPlace(page, input, BRACKET, PLACE(info))
  expect(await myPartsCount(page)).toBe(0)
  await openObjectList(page, input.press)
  await input.press(page.getByTestId(`objects-row-${id}`))
  await input.press(page.getByTestId('library-save'))
  await expect(page.getByTestId('save-library-sheet')).toBeVisible()
  // The part's own name, not the placed instance's.
  await expect(page.getByTestId('save-library-name')).toHaveValue('bracket')
  await input.press(page.getByTestId('save-library-submit'))
  await expect(page.getByTestId('library-toast')).toHaveText('Saved bracket')
  expect(await myPartsCount(page)).toBe(1)
  await openLibrary(page, input.press)
  const toggle = page.getByTestId('library-section-toggle-user')
  if ((await toggle.isVisible().catch(() => false)) && (await toggle.getAttribute('aria-expanded')) !== 'true') await input.press(toggle)
  await withRowSettings(page, 'user.bracket', () => expect(page.getByTestId('library-mesh-size')).toHaveText('40 × 20 × 10 mm'))
  await info.attach(`import-model-saved-${info.project.name}`, { body: await page.screenshot(), contentType: 'image/png' })
})
