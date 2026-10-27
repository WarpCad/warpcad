// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

/**
 * Split joints that make parts or need parts bought (`TODO/core-075`, stage 1), driven against
 * `/`, the running app: **Split…** → the grouped **Joint** list → **Dowels**, the key rows before
 * Apply, the key parts in the Inspector after it, **Export… → Print pieces** with the key STL
 * and `assembly.txt`, and a hand-placed **Dowel** of bought steel updating **You'll also need**.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`, Browser Support / Responsive Layout)
 *
 * All three reference viewports (the sheet is a bottom sheet at phone width, and the grouped
 * list is a native `<select>` there) and all three engines (the kernel worker runs the dowel
 * search, a tap on the cut face over the WebGL canvas places a marker, and a zip download).
 * A snapshot of the pieces list, keys and hardware line included, is taken at each.
 *
 * ## What is seeded and what is clicked
 *
 * The bodies are seeded through the store (a drag cannot place a 300 mm part precisely) and
 * selected through it; Split, the sheet's fields, the face tap, Apply and Export are real
 * clicks. The zip is read by a reader that shares nothing with `src/core/zip.js`.
 */

/**
 * @param {import('@playwright/test').Page} page
 * @param {(api: any, arg: any) => any} fn
 * @param {any} [arg]
 */
function store(page, fn, arg) {
  return page
    .evaluateHandle(async () => {
      const documentModule = await window.__e2eImport('/src/stores/document.js')
      const selectionModule = await window.__e2eImport('/src/stores/selection.js')
      return { documentStore: documentModule.useDocumentStore(), selection: selectionModule.useSelectionStore() }
    })
    .then(async (handle) => {
      try {
        return await handle.evaluate(fn, arg)
      } finally {
        await handle.dispose()
      }
    })
}

/** A 300 × 40 × 12 mm plank, its long side along X, selected. @param {import('@playwright/test').Page} page */
async function seedPlank(page) {
  await store(page, (api) => {
    api.documentStore.append(
      { id: 'plank', op: 'primitive.cuboid', name: 'Plank', params: { size: [300, 40, 12], center: [0, 0, 6] } },
      { origin: 'local' }
    )
    api.selection.select('plank')
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
}

/** @param {import('@playwright/test').Page} page */
async function showInspector(page) {
  const sheet = page.getByTestId('inspector-sheet')
  if (await sheet.isVisible()) return
  const tab = page.getByTestId('inspector-tab')
  if (await tab.isVisible()) await tab.click()
  await expect(sheet).toBeVisible()
}

/**
 * A stored-only zip read by hand.
 *
 * @param {Buffer} bytes
 * @returns {{ name: string, bytes: Buffer }[]}
 */
function unzip(bytes) {
  const entries = []
  let at = 0
  while (bytes.readUInt32LE(at) === 0x04034b50) {
    expect(bytes.readUInt16LE(at + 8), 'stored, not deflated').toBe(0)
    const size = bytes.readUInt32LE(at + 18)
    const nameLength = bytes.readUInt16LE(at + 26)
    const extraLength = bytes.readUInt16LE(at + 28)
    const name = bytes.subarray(at + 30, at + 30 + nameLength).toString('utf8')
    const start = at + 30 + nameLength + extraLength
    entries.push({ name, bytes: bytes.subarray(start, start + size) })
    at = start + size
  }
  return entries
}

/** Binary STL → triangle count and lowest Z. @param {Buffer} bytes */
function stlStats(bytes) {
  const count = bytes.readUInt32LE(80)
  expect(bytes.byteLength).toBe(84 + 50 * count)
  let minZ = Infinity
  for (let i = 0; i < count; i += 1) {
    for (let c = 0; c < 3; c += 1) minZ = Math.min(minZ, bytes.readFloatLE(84 + 50 * i + 12 + 12 * c + 8))
  }
  return { triangles: count, minZ }
}

/** @param {import('@playwright/test').Page} page @param {number} uMm @param {number} vMm */
async function faceToClient(page, uMm, vMm) {
  return page.evaluate(
    ({ uMm, vMm }) => {
      const svg = document.querySelector('[data-testid="cut-plane"]')
      if (!svg) throw new Error('no cut plane')
      const pair = (name) => svg.getAttribute(name).split(',').map(Number)
      const [uX, uY] = pair('data-face-u')
      const [vX, vY] = pair('data-face-v')
      const [cu, cv] = pair('data-face-centre')
      const [hx, hy] = pair('data-handle')
      const box = svg.getBoundingClientRect()
      return { x: box.left + hx + (uMm - cu) * uX + (vMm - cv) * vX, y: box.top + hy + (uMm - cu) * uY + (vMm - cv) * vY }
    },
    { uMm, vMm }
  )
}

/** Wait for the cut plane's projection to hold still. @param {import('@playwright/test').Page} page */
async function waitForStablePlane(page) {
  await page.waitForFunction(
    () =>
      new Promise((resolve) => {
        const read = () => {
          const el = document.querySelector('[data-testid="cut-plane"]')
          return el ? `${el.getAttribute('data-handle')}|${el.getAttribute('data-face-u')}|${el.getAttribute('data-face-v')}` : ''
        }
        let last = read()
        let stable = 0
        const tick = () => {
          const now = read()
          stable = now && now === last ? stable + 1 : 0
          last = now
          if (stable >= 5) resolve(true)
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    undefined,
    { timeout: 10000 }
  )
}

/** Wheel-zoom until the 40 mm face is 3.5-5.5 px/mm, as a person would. @param {import('@playwright/test').Page} page */
async function zoomToFace(page) {
  const readScale = () =>
    page.evaluate(() => Number(document.querySelector('[data-testid="cut-plane"]')?.getAttribute('data-face-u')?.split(',')[0]))
  const seen = []
  for (let i = 0; i < 40; i += 1) {
    const scale = await readScale()
    seen.push(Number(scale.toFixed(2)))
    if (scale >= 3.5 && scale <= 5.5) return
    await page.evaluate((deltaY) => {
      const canvas = document.querySelector('[data-testid="viewport"] canvas')
      const box = canvas.getBoundingClientRect()
      canvas.dispatchEvent(
        new WheelEvent('wheel', { deltaY, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2, bubbles: true, cancelable: true })
      )
    }, scale < 3.5 ? -60 : 60)
    await page.waitForTimeout(120)
  }
  throw new Error(`could not zoom the cut face to a tappable size: px/mm went ${seen.join(', ')}`)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
})

test('Dowels from the grouped Joint list: key rows before Apply, key parts after, and Print pieces writes the key file and assembly.txt', async ({
  page,
}) => {
  await seedPlank(page)
  await page.getByTestId('op-split').click()
  const sheet = page.getByTestId('split-sheet')
  await expect(sheet).toBeVisible()
  await page.getByTestId('split-offset').fill('150')

  // The Joint list is grouped, by hand, with the stage-1 entries under their headings.
  const joint = page.getByTestId('split-joint')
  await expect(joint.locator('optgroup')).toHaveCount(3)
  await expect(joint.locator('optgroup[label="Separate keys to print"] option')).toHaveText(['Dowels'])
  await expect(joint.locator('optgroup[label="Hardware you buy"] option')).toHaveText(['Steel or filament dowels'])
  await expect(joint.locator('optgroup[label="Printed into the pieces"] option')).toHaveText(['Pins and sockets', 'Tongue and groove'])

  await joint.selectOption('dowel')
  await expect(page.getByTestId('split-joint-use')).toContainText(/printed lying down/)
  await expect(page.getByTestId('split-dowel-size')).toHaveValue('')

  // Before Apply: the pieces, then the dowels the kernel's search would make, with their fit.
  const keyRow = page.getByTestId('split-key-fit')
  await expect(keyRow).toHaveCount(1)
  await expect(keyRow).toContainText(/Dowel × \d/)
  await expect(keyRow).toHaveAttribute('data-fit', 'fits')
  const count = Number(await keyRow.getAttribute('data-count'))
  expect(count).toBeGreaterThanOrEqual(1)
  await expect(page.getByTestId('split-hardware')).toHaveCount(0)
  await expect(page.locator('[data-testid="split-sheet"] ul[aria-label="Pieces"]')).toHaveScreenshot(
    'split-key-rows.png',
    { animations: 'disabled', maxDiffPixelRatio: 0.03 }
  )

  await expect(page.getByTestId('split-apply')).toBeEnabled()
  await page.getByTestId('split-apply').click()
  await expect(sheet).toHaveCount(0)

  // After Apply: Plank A, Plank B and a key part per dowel in the Inspector's parts list.
  await showInspector(page)
  const parts = page.getByTestId('inspector-parts')
  await expect(parts).toContainText('Plank A')
  await expect(parts).toContainText('Plank B')
  for (let n = 1; n <= count; n += 1) await expect(parts).toContainText(`Plank key ${n}`)
  const record = await store(page, (api) => api.documentStore.raw.records.at(-1))
  expect(record.params).toMatchObject({ joint: 'dowel', names: ['Plank A', 'Plank B'] })
  expect(record.params.jointOptions).toBeUndefined()

  // Export… → Print pieces: the two pieces, one dowel file with the count, and assembly.txt.
  await page.getByTestId('file-menu-button').click()
  await page.getByTestId('file-export').click()
  await expect(page.getByTestId('export-popover')).toBeVisible()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-print-pieces').click()])
  expect(download.suggestedFilename()).toBe('plank-print-pieces.zip')
  const entries = unzip(readFileSync(await download.path()))
  expect(entries.map((entry) => entry.name)).toEqual(['plank-a.stl', 'plank-b.stl', `plank-dowel-x${count}.stl`, 'assembly.txt'])
  const dowel = stlStats(entries[2].bytes)
  expect(dowel.triangles).toBeGreaterThan(0)
  expect(dowel.minZ, 'the dowel lies on the bed').toBeCloseTo(0, 2)
  const text = entries[3].bytes.toString('utf8')
  expect(text).toContain(`plank-dowel-x${count}.stl: print ${count} ×`)
  expect(text).toMatch(/Plank A and Plank B, along X/)
  const listed = page.getByTestId('export-print-piece')
  await expect(listed).toHaveCount(4)
  await expect(listed.nth(2)).toHaveAttribute('data-filename', `plank-dowel-x${count}.stl`)
  await expect(listed.nth(3)).toHaveAttribute('data-filename', 'assembly.txt')
})

test('a hand-placed Dowel of bought steel shows under You’ll also need, and lands in the Bill of materials', async ({ page }) => {
  await seedPlank(page)
  await page.getByTestId('gizmo-view-right').click()
  await page.getByTestId('op-split').click()
  await expect(page.getByTestId('split-sheet')).toBeVisible()
  await page.getByTestId('split-offset').fill('150')
  await page.getByTestId('split-manual-joints').check()
  await expect(page.getByTestId('split-connector-kind')).toBeVisible()
  await expect(page.getByTestId('connector-marker').first()).toBeVisible()
  await expect(page.getByTestId('split-manual-hint')).toHaveAttribute('data-face-view', 'usable')
  await zoomToFace(page)
  await waitForStablePlane(page)

  // Clear the search's seeded posts (select, ×).
  const markers = page.getByTestId('connector-marker')
  while ((await markers.count()) > 0) {
    const box = await markers.first().locator('.marker__hit').boundingBox()
    if (!box) throw new Error('marker has no box')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect(markers.first()).toHaveAttribute('data-selected', 'true')
    await page.getByTestId('connector-marker-remove').first().dispatchEvent('pointerdown', { button: 0 })
  }
  await expect(page.getByTestId('split-hardware')).toHaveCount(0)

  // The kind row has Dowel; picking it shows what the dowels are made of.
  await page.getByTestId('split-connector-kind-dowel').click()
  await expect(page.getByTestId('split-connector-kind-dowel')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('split-dowel-stock').selectOption('steel')

  const tap = await faceToClient(page, -8, 6)
  await page.mouse.click(tap.x, tap.y)
  await expect(markers).toHaveCount(1)
  await expect(markers.first()).toHaveAttribute('data-kind', 'dowel')
  await expect(markers.first()).toHaveAttribute('data-state', 'ok')
  await expect(page.getByTestId('split-hardware')).toHaveText(/You'll also need: 1 × steel dowel pin Ø\d+ × \d+ mm/)
  await expect(page.getByTestId('split-key-fit')).toHaveCount(0)

  await expect(page.getByTestId('split-apply')).toBeEnabled()
  await page.getByTestId('split-apply').click()
  await expect(page.getByTestId('split-sheet')).toHaveCount(0)
  const record = await store(page, (api) => api.documentStore.raw.records.at(-1))
  expect(record.params.placements).toEqual([expect.objectContaining({ kind: 'dowel', stock: 'steel' })])

  // The bought pin is on the shopping list.
  await showInspector(page)
  const row = page.getByTestId('bom-row').filter({ hasText: 'Steel dowel pin' })
  await expect(row).toHaveCount(1)
  await expect(row.getByTestId('bom-count')).toHaveText('× 1')
})
