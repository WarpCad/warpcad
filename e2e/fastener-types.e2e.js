// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'

/**
 * The one Bolt / screw Library row (`TODO/core-060`), driven against `/` — the running app.
 *
 * One row, two dropdowns beside it (**Type**, then a **Size** list that offers only the sizes
 * that Type has), a drag that commits the chosen fastener where it is dropped, an Inspector
 * that edits Type and Size in place, and a Bill of materials line per distinct fastener. A
 * file saved before the change (a `hardware.bolt` with a baked `spec`, a `hardware.screw`)
 * must still open, build and tally.
 *
 * **All three engines, all three viewports**: the drag-and-rebuild steps are kernel and
 * WebGL surfaces, and the row gains stacked dropdowns at 390 px (`CLAUDE.md` Responsive
 * Layout and Browser Support). A snapshot of the Hardware section is written per project.
 *
 * The legacy-file test seeds the legacy records through the app's own document store, the
 * way `composite-param-edit.e2e.js` seeds its Bolt; the records are the saved shape
 * byte for byte, which is what opening a file hands the document.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'fastener-types-snapshots')

/** @param {import('@playwright/test').Page} page */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (!(await rows.isVisible())) {
    await page.getByTestId('library-tab').click()
    await expect(rows).toBeVisible()
  }
  await page.getByTestId('library-rows-hardware').scrollIntoViewIfNeeded()
}

/** @param {import('@playwright/test').Page} page */
async function closeLibrary(page) {
  const tab = page.getByTestId('library-tab')
  if (!(await tab.isVisible())) return
  if (await page.getByTestId('library-rows').isVisible()) await tab.click()
  await expect(page.getByTestId('library-rows')).toBeHidden()
}

/**
 * Put the Library away and make sure the Inspector (which hosts the BOM) is showing.
 *
 * @param {import('@playwright/test').Page} page
 */
async function showInspector(page) {
  await closeLibrary(page)
  if (!(await page.getByTestId('inspector-sheet').isVisible())) {
    await page.getByTestId('inspector-tab').click()
  }
  await expect(page.getByTestId('inspector-sheet')).toBeVisible()
}

/**
 * Drag a Library row into the viewport with pointer events, mouse and touch alike.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ op: string, fx: number, fy: number }} drop
 */
async function dragRowIntoViewport(page, { op, fx, fy }) {
  await openLibrary(page)
  await page.evaluate(
    ({ op, fx, fy }) => {
      const row = document.querySelector(`[data-testid="library-row-${op}"]`)
      const view = document.querySelector('[data-testid="viewport"]')
      if (!row || !view) throw new Error(`missing row ${op} or viewport`)
      const from = row.getBoundingClientRect()
      const to = view.getBoundingClientRect()
      const startX = from.left + from.width / 2
      const startY = from.top + from.height / 2
      const endX = to.left + to.width * fx
      const endY = to.top + to.height * fy
      const fire = (/** @type {EventTarget} */ target, /** @type {string} */ type, /** @type {number} */ x, /** @type {number} */ y) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 41,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        )
      fire(row, 'pointerdown', startX, startY)
      for (const t of [0.25, 0.5, 0.75, 1]) {
        fire(window, 'pointermove', startX + (endX - startX) * t, startY + (endY - startY) * t)
      }
      fire(window, 'pointerup', endX, endY)
    },
    { op, fx, fy },
  )
  await page.waitForTimeout(300)
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ id: string, op: string, name: string, volume: number }[]>}
 */
function sceneBodies(page) {
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      op: node.getAttribute('data-body-op') ?? '',
      name: node.getAttribute('data-body-name') ?? '',
      volume: Number(node.getAttribute('data-body-volume') ?? 'NaN'),
    })),
  )
}

/** @param {import('@playwright/test').Page} page */
function bomRows(page) {
  return page.$$eval('[data-testid="bom-row"]', (nodes) =>
    nodes.map((node) => ({
      op: node.getAttribute('data-op') ?? '',
      text: (/** @type {HTMLElement} */ (node).innerText ?? '').replace(/\s+/g, ' ').trim(),
    })),
  )
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {{ run: (fn: (api: any, arg: any) => any, arg?: any) => Promise<any> }}
 */
function storeApi(page) {
  return {
    run: (fn, arg) =>
      page.evaluate(
        async ({ source, arg }) => {
          const documentModule = await import('/src/stores/document.js')
          const selectionModule = await import('/src/stores/selection.js')
          const api = {
            documentStore: documentModule.useDocumentStore(),
            selection: selectionModule.useSelectionStore(),
          }
          return await new Function('api', 'arg', `return (${source})(api, arg)`)(api, arg)
        },
        { source: fn.toString(), arg },
      ),
  }
}

/**
 * Each Type, the label its dropdown shows, the Size it opens on, and the BOM detail a
 * drop of it reads.
 */
const TYPES = [
  { type: 'socket', label: 'Socket cap', size: 'm3', bom: 'M3 socket × 20 mm' },
  { type: 'hex', label: 'Hex head', size: 'm10', bom: 'M10 hex × 20 mm' },
  { type: 'pan', label: 'Pan head', size: 'm4', bom: 'M4 pan × 20 mm' },
  { type: 'flat', label: 'Flat head', size: 'm3', bom: 'M3 flat × 20 mm' },
  { type: 'woodPan', label: 'Wood screw, pan head', size: '#8', bom: '#8 wood pan × 20 mm' },
  { type: 'woodFlat', label: 'Wood screw, flat head', size: '#8', bom: '#8 wood flat × 20 mm' },
]

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
})

test('one Bolt / screw row with Type and Size dropdowns; Size follows Type and falls back to the Type default', async ({
  page,
}, testInfo) => {
  await openLibrary(page)
  await expect(page.getByTestId('library-row-hardware.bolt')).toHaveAttribute('data-label', 'Bolt / screw')
  // No separate screw row: a screw is a Type of this one.
  await expect(page.getByTestId('library-row-hardware.screw')).toHaveCount(0)

  const type = page.getByTestId('library-choice-hardware.bolt')
  const size = page.getByTestId('library-choice-hardware.bolt-spec')
  await expect(type).toBeVisible()
  await expect(size).toBeVisible()
  // The row's defaults are today's bolt exactly.
  await expect(type).toHaveValue('hex')
  await expect(size).toHaveValue('m10')
  await expect(type.locator('option')).toHaveText(TYPES.map((entry) => entry.label))

  // Each Type offers its own sizes, and a Type change strands the old size onto the new default.
  const sizesOf = () => size.locator('option').evaluateAll((options) => options.map((o) => /** @type {HTMLOptionElement} */ (o).value))
  // A Size the new Type also offers is kept (M10 is a socket-cap size too); one it does not offer
  // falls back to the Type's own default.
  let previous = 'm10'
  for (const entry of TYPES) {
    await type.selectOption(entry.type)
    const offered = await sizesOf()
    const expected = offered.includes(previous) ? previous : entry.size
    await expect(size).toHaveValue(expected)
    expect(offered).toContain(entry.size)
    previous = expected
  }
  // And a Type switch that strands the Size lands on that Type's default.
  await type.selectOption('hex')
  await size.selectOption('m12')
  await type.selectOption('woodPan')
  await expect(size).toHaveValue('#8')
  await type.selectOption('pan')
  expect(await sizesOf()).toEqual(['m4'])
  await type.selectOption('woodFlat')
  const woodSizes = await sizesOf()
  expect(woodSizes[0]).toBe('#2')
  expect(woodSizes).toContain('#16')
  expect(woodSizes).not.toContain('m4')

  // At phone width the two dropdowns are each a full-height tap target.
  const box = await size.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(31)
  if (testInfo.project.name.endsWith('phone')) expect(box?.height ?? 0).toBeGreaterThanOrEqual(43)

  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.getByTestId('library-rows-hardware').screenshot({ path: join(SNAPSHOT_DIR, `hardware-${testInfo.project.name}.png`) })
})

test('dragging each Type in places it with that Type and Size, a tap part where the size has fit data, and a BOM line', async ({
  page,
}) => {
  let index = 0
  for (const entry of TYPES) {
    await openLibrary(page)
    await page.getByTestId('library-choice-hardware.bolt').selectOption(entry.type)
    await page.getByTestId('library-choice-hardware.bolt-spec').selectOption(entry.size)
    await dragRowIntoViewport(page, { op: 'hardware.bolt', fx: 0.12 + index * 0.13, fy: 0.3 })
    index += 1
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', String(index))
    const bodies = await sceneBodies(page)
    expect(bodies.at(-1)?.name).toBe(`Bolt / screw ${index}`)
    // The kernel worker reports the volume a moment after the body appears.
    await expect
      .poll(async () => (await sceneBodies(page)).at(-1)?.volume ?? Number.NaN, { timeout: 20000 })
      .toBeGreaterThan(0)

    await showInspector(page)
    await expect(page.getByTestId('inspector-param-type')).toHaveValue(entry.type)
    await expect(page.getByTestId('inspector-param-spec')).toHaveValue(entry.size)
    await expect(page.getByTestId('inspector-part-head')).toBeVisible()
    await expect(page.getByTestId('inspector-part-thread')).toBeVisible()
    // Every size these defaults land on has fit data, so the hidden tap clearance exists.
    await expect(page.getByTestId('inspector-part-tap')).toBeVisible()
  }
  const lines = (await bomRows(page)).map((row) => row.text)
  for (const entry of TYPES) {
    expect(lines.some((text) => text.includes(`Bolt / screw ${entry.bom}`))).toBe(true)
  }
})

test('changing Type in the Inspector from Socket cap to Wood screw, flat head rebuilds in place and offers the three wood fits', async ({
  page,
}) => {
  await openLibrary(page)
  await page.getByTestId('library-choice-hardware.bolt').selectOption('socket')
  await dragRowIntoViewport(page, { op: 'hardware.bolt', fx: 0.4, fy: 0.3 })
  await showInspector(page)
  const [before] = await sceneBodies(page)

  const type = page.getByTestId('inspector-param-type')
  const fit = page.getByTestId('inspector-param-fit')
  await expect(type).toHaveValue('socket')
  await expect(fit.locator('option')).toHaveText(['tap', 'close', 'loose'])

  await type.selectOption('woodFlat')
  await expect(page.getByTestId('repair-dialog')).toHaveCount(0)
  await expect(type).toHaveValue('woodFlat')
  // The Size the socket row had (M3) is not a wood gauge: it fell back to the Type default.
  await expect(page.getByTestId('inspector-param-spec')).toHaveValue('#8')
  await expect(fit.locator('option')).toHaveText(['clearance', 'hardwood', 'softwood'])
  await expect(fit).toHaveValue('softwood')

  // In place: the same body, rebuilt to a different solid.
  await expect.poll(async () => (await sceneBodies(page))[0].volume).not.toBe(before.volume)
  const after = await sceneBodies(page)
  expect(after).toHaveLength(1)
  expect(after[0].id).toBe(before.id)
  await expect(page.getByTestId('inspector-part-tap')).toBeVisible()
  await expect.poll(async () => (await bomRows(page)).map((row) => row.text)).toEqual([
    'Bolt / screw #8 wood flat × 20 mm × 1',
  ])
})

test('a file with a legacy hardware.bolt and a hardware.screw still builds and keeps its BOM lines', async ({ page }) => {
  await storeApi(page).run((api) => {
    api.documentStore.append({ id: 'bolt', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm2.5 socket', length: 8 } })
    api.documentStore.append({ id: 'screw', op: 'hardware.screw', name: 'Screw 1', params: { spec: 'm4', head: 'PanHead', length: 12 } })
    api.documentStore.append({ id: 'bolt2', op: 'hardware.bolt', name: 'Bolt 2', params: { type: 'socket', spec: 'm2.5', length: 8 } })
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '3')
  // Volumes arrive from the kernel worker a moment after the bodies do.
  await expect
    .poll(async () => (await sceneBodies(page)).every((body) => body.volume > 0), { timeout: 20000 })
    .toBe(true)
  const bodies = await sceneBodies(page)
  // The legacy and the new-shape M2.5 socket bolt are one physical part: identical solids.
  expect(bodies[0].volume).toBeCloseTo(bodies[2].volume, 6)

  await showInspector(page)
  await expect.poll(async () => (await bomRows(page)).map((row) => row.text).sort()).toEqual([
    'Bolt / screw M2.5 socket × 8 mm × 2',
    'Screw M4 PanHead × 12 mm × 1',
  ])
})
