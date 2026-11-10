// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { colouredThreeMf, featherShapedThreeMf } from '../src/io/__fixtures__/threeMf.js'
import { closeLibrary, isPhone, openLibrary, pointer, sceneBodies, viewportPoint } from './support/humanInput.js'
import { importModel, myPartsCount, openObjectList as openObjects } from './support/importModel.js'

/**
 * Import a 3MF into the project as one placed model whose objects are selectable sub-parts
 * (`TODO/io-024`), through **File → Import model…** (`TODO/ui-107`), driven against `/`.
 *
 * The fixture is generated (`src/io/__fixtures__/threeMf.js`) in the shape of the owner's FreeCAD
 * export of the Adafruit Feather: a plate and a box, the box placed twice (once with FreeCAD's
 * quarter turn), no names, the whole set written three times, deflated, a thumbnail per object.
 * The owner's own file is never committed; it is driven by hand in `TODO/ACCEPTANCE.md` scenario 31.
 *
 * The TODO's own example, end to end: **File → Import model…** through the real chooser; place it
 * in the view (hover and click, or drag the ghost on touch); the status line counts the six
 * duplicates skipped; the Inspector offers no Units control (3MF states its units); **My parts does
 * not change**. Drag a Cube in beside it; a
 * first click on the model selects the whole, a second narrows to the part under the pointer with
 * a breadcrumb and that part's own size. The Objects list expands to every part. Align the Cube to
 * one part's X centre (to 0.01 mm), Subtract the whole model from the Cube with no main-thread
 * long task and Undo it in one step (`TODO/core-079`), Subtract another part from the Cube (one body with a pocket;
 * a visible cutting part uses its model up, as `docs/booleans.md` says), reload (the cut stays, with
 * no library entry behind it), **File ▸ New** (My parts still empty). Refusals: a text file named
 * `x.3mf`, a STEP file dropped on the view, a file over the size cap.
 *
 * Input is real (see `support/humanInput.js`): trusted CDP touch at Chromium phone/tablet width, a
 * real mouse elsewhere. All three viewports and all three engines: the worker inflates the zip with
 * `DecompressionStream`, the thumbnail is a canvas, the part persists in IndexedDB, and the file
 * input differs per engine. Screenshots are attached at each viewport (the Objects list wraps
 * differently in a sheet), as `import-model.e2e.js` does.
 */

/** The model's parts and their own sizes, in millimetres (the fixture's, read in its own frame). */
const PART_SIZES = /** @type {Record<string, [number, number, number]>} */ ({
  'Part 1': [50.8, 22.86, 1.57],
  'Part 2': [16, 24, 2.95],
  'Part 3': [24, 16, 2.95],
})

/** @returns {Promise<{ name: string, mimeType: string, buffer: Buffer }>} */
async function featherFile() {
  return { name: 'feather.3mf', mimeType: 'model/3mf', buffer: Buffer.from(await featherShapedThreeMf()) }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

/** Open the Objects list, through the Inspector sheet where there is one. */
async function openObjectList(page, input) {
  await openObjects(page, input.press)
}

/** File → Import model…, then place the model at canvas fractions `at`; returns its body id. */
async function importAndPlace(page, input, file, at) {
  await importModel(page, input.press, file)
  await expect(page.getByTestId('placement-chip-label')).toHaveText(`Place ${file.name}`)
  const p = await viewportPoint(page, at[0], at[1])
  await input.placeArmed(p.x, p.y)
  await expect(page.getByTestId('placement-chip')).toHaveCount(0)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', /[1-9]/)
  const bodies = await sceneBodies(page)
  return bodies[bodies.length - 1].id
}

/** A click (or tap) on the 3D view at a fraction of the canvas. */
async function clickView(page, fx, fy) {
  const { x, y } = await viewportPoint(page, fx, fy)
  await page.mouse.move(x - 8, y - 4, { steps: 3 })
  await page.mouse.move(x, y, { steps: 2 })
  await page.mouse.down()
  await page.waitForTimeout(40)
  await page.mouse.up()
  await page.waitForTimeout(250)
}

/**
 * A point on the bare canvas, away from the model: the first candidate where nothing (a toolbar,
 * a sheet, the navigation pad) covers the canvas.
 *
 * @returns {Promise<[number, number]>}
 */
async function emptyGround(page) {
  const found = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="viewport-canvas"]')
    if (!canvas) return null
    const box = canvas.getBoundingClientRect()
    const candidates = [[0.95, 0.45], [0.05, 0.45], [0.95, 0.3], [0.05, 0.3], [0.9, 0.62], [0.1, 0.62], [0.5, 0.05]]
    for (const [fx, fy] of candidates) {
      if (document.elementFromPoint(box.left + box.width * fx, box.top + box.height * fy) === canvas) return [fx, fy]
    }
    return null
  })
  if (found === null) throw new Error('no bare canvas to click')
  return /** @type {[number, number]} */ (found)
}

/**
 * A body's (or one of its parts') world bounds, read from the document the app holds.
 *
 * @returns {Promise<{ min: number[], max: number[] }>}
 */
function boundsIn(page, bodyId, partName = null) {
  return page.evaluate(
    async ([id, part]) => {
      const { useDocumentStore } = await window.__e2eImport('/src/stores/document.js')
      const { boundsOf } = await window.__e2eImport('/src/core/kernel/group.js')
      const body = useDocumentStore().raw.bodies().find((candidate) => candidate.id === id)
      const [min, max] = boundsOf(part === null ? body.geometry : body.geometry.parts[part])
      return { min: [...min], max: [...max] }
    },
    [bodyId, partName],
  )
}

/**
 * Start watching the main thread for blocking (`TODO/core-079`). Where the engine reports Long
 * Tasks (Chromium), every `longtask` entry's duration; elsewhere (Firefox, WebKit have no
 * `longtask` entries) the longest gap between zero-delay timer ticks, which a blocking task
 * stretches by its own length.
 */
async function watchMainThread(page) {
  await page.evaluate(() => {
    const watch = { longestMs: 0, kind: 'longtask', stop: () => {} }
    if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) watch.longestMs = Math.max(watch.longestMs, entry.duration)
      })
      observer.observe({ type: 'longtask' })
      watch.stop = () => observer.disconnect()
    } else {
      watch.kind = 'timer gap'
      let last = performance.now()
      let running = true
      const tick = () => {
        const now = performance.now()
        watch.longestMs = Math.max(watch.longestMs, now - last)
        last = now
        if (running) setTimeout(tick, 0)
      }
      setTimeout(tick, 0)
      watch.stop = () => {
        running = false
      }
    }
    /** @type {any} */ (window).__mainThreadWatch = watch
  })
}

/** @returns {Promise<{ longestMs: number, kind: string }>} */
async function stopWatchingMainThread(page) {
  return page.evaluate(() => {
    const watch = /** @type {any} */ (window).__mainThreadWatch
    watch.stop()
    return { longestMs: watch.longestMs, kind: watch.kind }
  })
}

/** The three Size fields, as numbers. */
async function inspectorSize(page) {
  return Promise.all(['x', 'y', 'z'].map(async (axis) => Number(await page.getByTestId(`inspector-size-${axis}`).inputValue())))
}

test('import feather.3mf: 3 parts, drill to one, align a cube to it, cut with another, reload, File > New', async ({ page }, info) => {
  test.setTimeout(150_000)
  const input = await pointer(page, info)
  expect(await myPartsCount(page)).toBe(0)

  // Place the model, then a Cube on the same spot (it overlaps the model, for the cut below).
  const at = isPhone(info) ? [0.5, 0.3] : [0.45, 0.5]
  const featherId = await importAndPlace(page, input, await featherFile(), at)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  const op = (await sceneBodies(page)).find((body) => body.id === featherId).op
  expect(op).toBe('user.feather')
  await expect(page.getByTestId('model-import-notice')).toHaveText(
    'Imported feather.3mf, 3 parts, 36 triangles, 50.8 × 28.6 × 4.52 mm. 6 exact duplicates skipped.',
  )
  // Selected as the whole assembly (io-024's first click), and never in My parts.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', featherId)
  expect(await myPartsCount(page)).toBe(0)
  await info.attach(`import-3mf-placed-${info.project.name}`, { body: await page.screenshot(), contentType: 'image/png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  // The whole model lands centred on the drop point, lowest point on the ground, parts in place.
  const whole = await boundsIn(page, featherId)
  expect(whole.min[2]).toBeCloseTo(0, 6)
  expect(whole.max[0] - whole.min[0]).toBeCloseTo(50.8, 3)
  expect(whole.max[1] - whole.min[1]).toBeCloseTo(28.57, 3)
  const plate = await boundsIn(page, featherId, 'Part 1')
  const turned = await boundsIn(page, featherId, 'Part 3')
  // Relative to the plate, as in the file: the turned box starts 4.445 mm in and 4.57 mm below it.
  expect(turned.min[0] - plate.min[0]).toBeCloseTo(4.445, 3)
  expect(turned.min[1] - plate.min[1]).toBeCloseTo(-4.57, 3)
  expect(turned.min[2] - plate.min[2]).toBeCloseTo(1.57, 3)

  await openLibrary(page, input.press)
  const p = await viewportPoint(page, at[0], at[1])
  await input.dragRow(page.getByTestId('library-row-primitive.cuboid'), p.x, p.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await closeLibrary(page, input.press)
  const cubeId = (await sceneBodies(page)).find((body) => body.op === 'primitive.cuboid').id

  // Select through the Objects list, as at phone width: the whole model, then expand it — one row
  // per part, which is how a part too small to hit is reached.
  await openObjectList(page, input)
  await input.press(page.getByTestId(`objects-row-${featherId}`))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', featherId)
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveCount(0)
  expect((await inspectorSize(page))[0]).toBeCloseTo(50.8, 2)
  // 3MF states its units: the Inspector offers nothing to choose, and assumes nothing.
  await expect(page.getByTestId('inspector-mesh-note')).toContainText(/not parametric/i)
  await expect(page.getByTestId('inspector-mesh-units')).toHaveCount(0)
  await expect(page.getByTestId('inspector-mesh-assumed')).toHaveCount(0)
  await openObjectList(page, input)
  const expand = page.getByTestId(`objects-expand-${featherId}`)
  if ((await expand.getAttribute('aria-expanded')) !== 'true') await input.press(expand)
  await expect(page.locator(`[data-testid^="objects-part-item-${featherId}-"]`)).toHaveCount(3)
  await info.attach(`import-3mf-objects-${info.project.name}`, { body: await page.screenshot(), contentType: 'image/png' })

  // Narrow to one part from the list: the breadcrumb names it, and the Inspector shows its own size.
  await input.press(page.getByTestId(`objects-part-${featherId}-Part 2`))
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('Part 2')
  const partSize = await inspectorSize(page)
  PART_SIZES['Part 2'].forEach((size, axis) => expect(partSize[axis]).toBeCloseTo(size, 2))

  // Align: the Cube first, then the model's Part 2 ticked in the list. The Cube moves; the part is measured.
  await openObjectList(page, input)
  await input.press(page.getByTestId(`objects-row-${cubeId}`))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cubeId)
  await openObjectList(page, input)
  const expandAgain = page.getByTestId(`objects-expand-${featherId}`)
  if ((await expandAgain.getAttribute('aria-expanded')) !== 'true') await input.press(expandAgain)
  await input.press(page.getByTestId(`objects-part-check-${featherId}-Part 2`))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await input.press(page.getByTestId('operation-align'))
  await expect(page.getByTestId('align-popover')).toBeVisible()
  await expect(page.getByTestId('align-operand-target')).toHaveText(/›\s*Part 2$/)
  const partBefore = await boundsIn(page, featherId, 'Part 2')
  await input.press(page.getByTestId('align-x-center'))
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('align-popover')).toHaveCount(0)
  const cube = await boundsIn(page, cubeId)
  const partAfter = await boundsIn(page, featherId, 'Part 2')
  expect(partAfter.min[0]).toBeCloseTo(partBefore.min[0], 6)
  expect(Math.abs((cube.min[0] + cube.max[0]) / 2 - (partAfter.min[0] + partAfter.max[0]) / 2)).toBeLessThan(0.01)

  // Subtract with the WHOLE model (TODO/core-079): the Cube first, then the model's own row ticked.
  // The union of the model's parts and the cut run in the evaluation worker, so the main thread
  // never blocks for a long task (50 ms, the Long Tasks API's own threshold). Then one Undo puts
  // both bodies back, untouched, for the one-part cut below.
  await openObjectList(page, input)
  await input.press(page.getByTestId(`objects-row-${cubeId}`))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cubeId)
  await openObjectList(page, input)
  await input.press(page.getByTestId(`objects-check-${featherId}`))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveCount(0)
  await watchMainThread(page)
  await input.press(page.getByTestId('operation-subtract'))
  const wholeCut = page.locator('[data-testid="scene-bodies"] li[data-body-op="boolean.subtract"]')
  await expect(wholeCut).toHaveCount(1, { timeout: 30_000 })
  await expect(wholeCut).toHaveAttribute('data-body-volume', /.+/, { timeout: 30_000 })
  await expect(page.getByTestId('operation-pending')).toHaveCount(0)
  const blocked = await stopWatchingMainThread(page)
  expect(blocked.longestMs, `longest main-thread ${blocked.kind} during the whole-model cut`).toBeLessThan(50)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  const wholeVolume = Number(await wholeCut.getAttribute('data-body-volume'))
  expect(wholeVolume).toBeLessThan(64_000 - 100)
  expect(wholeVolume).toBeGreaterThan(64_000 - (50.8 * 22.86 * 1.57 + 2 * 16 * 24 * 2.95) - 1)
  // One step: a single Undo brings back the Cube and the whole model, and nothing else.
  await input.press(page.getByTestId('undo-button'))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  expect((await sceneBodies(page)).map((body) => body.id).sort()).toEqual([cubeId, featherId].sort())

  // Subtract with one part: the Cube is the base, the model's plate the cutter. One cut body. A
  // visible part used as a cutter uses its group up, as any cutting shape is (docs/booleans.md).
  await openObjectList(page, input)
  await input.press(page.getByTestId(`objects-row-${cubeId}`))
  await openObjectList(page, input)
  const expandThird = page.getByTestId(`objects-expand-${featherId}`)
  if ((await expandThird.getAttribute('aria-expanded')) !== 'true') await input.press(expandThird)
  await input.press(page.getByTestId(`objects-part-check-${featherId}-Part 1`))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await expect(page.getByTestId('operation-operand-rest')).toContainText('Part 1')
  await input.press(page.getByTestId('operation-subtract'))
  const cut = page.locator('[data-testid="scene-bodies"] li[data-body-op="boolean.subtract"]')
  await expect(cut).toHaveCount(1, { timeout: 30_000 })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(cut).toHaveAttribute('data-body-volume', /.+/, { timeout: 30_000 })
  // A 40 mm cube is 64,000 mm³; the plate cuts a pocket out of its bottom.
  const volume = Number(await cut.getAttribute('data-body-volume'))
  expect(volume).toBeLessThan(64_000 - 100)
  expect(volume).toBeGreaterThan(64_000 - 50.8 * 22.86 * 1.57 - 1)

  // Reload: the cut survives, built from the project's own copy of the model — no library entry.
  await page.reload()
  await expect(page.getByTestId('viewport')).toBeVisible()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  expect((await sceneBodies(page)).map((body) => body.op)).toEqual(['boolean.subtract'])
  expect(await myPartsCount(page)).toBe(0)

  // File ▸ New: the scene empties; My parts never had it.
  await input.press(page.getByTestId('file-menu-button'))
  await input.press(page.getByTestId('file-new'))
  const replace = page.getByTestId('file-open-confirm-replace')
  if (await replace.isVisible().catch(() => false)) await input.press(replace)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
  expect(await myPartsCount(page)).toBe(0)
})

test('a first click selects the whole model, a second narrows to the part under the pointer', async ({ page }, info) => {
  const input = await pointer(page, info)
  const at = isPhone(info) ? [0.5, 0.3] : [0.45, 0.5]
  const id = await importAndPlace(page, input, await featherFile(), at)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  // Clear the selection on empty ground, then click the model twice.
  await clickView(page, ...(await emptyGround(page)))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')
  await clickView(page, at[0], at[1])
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', id)
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveCount(0)
  await clickView(page, at[0], at[1])
  const crumb = page.getByTestId('inspector-breadcrumb-part')
  await expect(crumb).toHaveText(/^Part [123]$/)
  const name = /** @type {string} */ (await crumb.textContent())
  const size = await inspectorSize(page)
  PART_SIZES[name].forEach((expected, axis) => expect(size[axis]).toBeCloseTo(expected, 2))
  await info.attach(`import-3mf-drilled-${info.project.name}`, { body: await page.screenshot(), contentType: 'image/png' })
  // The breadcrumb's model segment steps back up to the whole (ui-016).
  await input.press(page.getByTestId('inspector-breadcrumb-group'))
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveCount(0)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', id)
})

test('refusals: a text file named x.3mf, a STEP file, a file over the cap — each in words, nothing added', async ({ page }, info) => {
  const input = await pointer(page, info)

  await importModel(page, input.press, { name: 'x.3mf', mimeType: 'model/3mf', buffer: Buffer.from('just some notes') })
  await expect(page.getByTestId('model-import-error')).toHaveText('Not a valid 3MF: it is not a zip package')
  await expect(page.getByTestId('placement-chip')).toHaveCount(0)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')

  const big = Buffer.alloc(25 * 1024 * 1024 + 1)
  big.set([0x50, 0x4b, 0x03, 0x04])
  await importModel(page, input.press, { name: 'huge.3mf', mimeType: 'model/3mf', buffer: big })
  await expect(page.getByTestId('model-import-error')).toHaveText('That file is larger than 25 MB')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')

  // A STEP file through the picker (its filter offers .stl and .3mf, but a person can pick anything).
  await importModel(page, input.press, { name: '2821 Adafruit ESP8266 Feather.step', mimeType: 'application/step', buffer: Buffer.from('ISO-10303-21;') })
  await expect(page.getByTestId('model-import-error')).toHaveText('STEP files are not read yet. Export 3MF or STL from your CAD program')

  // At laptop width, a broken .3mf dropped on the view is refused in the same status line.
  if (info.project.name.endsWith('-laptop')) {
    const transfer = await page.evaluateHandle(() => {
      const data = new DataTransfer()
      data.items.add(new File(['just some notes'], 'notes.3mf', { type: 'model/3mf' }))
      return data
    })
    const p = await viewportPoint(page, 0.5, 0.5)
    await page.getByTestId('viewport').dispatchEvent('dragover', { dataTransfer: transfer, clientX: p.x, clientY: p.y })
    await page.getByTestId('viewport').dispatchEvent('drop', { dataTransfer: transfer, clientX: p.x, clientY: p.y })
    await expect(page.getByTestId('model-import-error')).toHaveText('Not a valid 3MF: it is not a zip package')
  }
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
  expect(await myPartsCount(page)).toBe(0)
  await info.attach(`import-3mf-refused-${info.project.name}`, { body: await page.screenshot(), contentType: 'image/png' })
})

test('a 3MF with colours: each part draws in its file colour, the Inspector shows it, and Reset returns to it (TODO/io-027)', async ({ page }, info) => {
  test.setTimeout(120_000)
  const input = await pointer(page, info)
  const file = { name: 'coloured.3mf', mimeType: 'model/3mf', buffer: Buffer.from(await colouredThreeMf()) }
  const at = isPhone(info) ? [0.5, 0.3] : [0.45, 0.5]
  const id = await importAndPlace(page, input, file, at)

  await openObjectList(page, input)
  const expand = page.getByTestId(`objects-expand-${id}`)
  if ((await expand.getAttribute('aria-expanded')) !== 'true') await input.press(expand)

  // A coloured part: the Color row reads the file colour and Reset is idle.
  await input.press(page.getByTestId(`objects-part-${id}-Led`))
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('Led')
  await expect(page.getByTestId('inspector-color-value')).toHaveText('#f6f6f3')
  await expect(page.getByTestId('inspector-color-reset')).toBeDisabled()
  await info.attach(`import-3mf-coloured-${info.project.name}`, { body: await page.screenshot(), contentType: 'image/png' })

  // Recolour it: the user's choice wins; Reset returns to the file colour, not the palette.
  await page.getByTestId('inspector-color-input').fill('#ff0000')
  await expect(page.getByTestId('inspector-color-value')).toHaveText('#ff0000')
  await input.press(page.getByTestId('inspector-color-reset'))
  await expect(page.getByTestId('inspector-color-value')).toHaveText('#f6f6f3')

  // A part the file left uncoloured stays on the palette.
  await openObjectList(page, input)
  await input.press(page.getByTestId(`objects-part-${id}-Plain`))
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('Plain')
  await expect(page.getByTestId('inspector-color-value')).toHaveText('Default')
})
