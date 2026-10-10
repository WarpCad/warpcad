// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

/**
 * Print prep (`TODO/io-007`), driven against `/`, the running app: build volume and fit
 * verdict, **Split…** with a joint, and **Export… → Print pieces**.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`, Browser Support / Responsive Layout)
 *
 * All three reference viewports and all three engines: this touches the kernel (a boolean
 * split with a joint), the WebGL viewport (the cut-plane preview over the canvas) and the
 * download path (a zip handed to `<a download>`), each of which has diverged across engines
 * before in this project.
 *
 * ## What is seeded and what is clicked
 *
 * The long bar is seeded through the store (a drag cannot place a 300 mm part precisely),
 * and selected through the store; everything under test — Split, the sheet, the cut plane,
 * Apply, Export → Print pieces — is a real click or a real pointer drag.
 *
 * The downloaded zip is opened here by a reader that shares nothing with `src/core/zip.js`,
 * and each STL is parsed by hand and checked closed (every edge used by exactly two faces,
 * in opposite directions).
 */

/**
 * @param {import('@playwright/test').Page} page
 * @param {(api: any, arg: any) => any} fn
 * @param {any} [arg]
 */
function store(page, fn, arg) {
  return page.evaluate(
    async ({ source, arg }) => {
      const documentModule = await import('/src/stores/document.js')
      const selectionModule = await import('/src/stores/selection.js')
      const api = {
        documentStore: documentModule.useDocumentStore(),
        selection: selectionModule.useSelectionStore(),
      }
      return await new Function('api', 'arg', `return (${source})(api, arg)`)(api, arg)
    },
    { source: fn.toString(), arg }
  )
}

/** @param {import('@playwright/test').Page} page */
async function seedWing(page) {
  await store(page, (api) => {
    api.documentStore.append(
      { id: 'wing', op: 'primitive.cuboid', name: 'Wing', params: { size: [300, 40, 12], center: [0, 0, 6] } },
      { origin: 'local' }
    )
    api.documentStore.append(
      { id: 'cube', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10], center: [0, 60, 5] } },
      { origin: 'local' }
    )
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
}

/**
 * Open the Inspector if this viewport keeps it behind a tab.
 *
 * @param {import('@playwright/test').Page} page
 */
async function showInspector(page) {
  const sheet = page.getByTestId('inspector-sheet')
  if (await sheet.isVisible()) return
  const tab = page.getByTestId('inspector-tab')
  if (await tab.isVisible()) await tab.click()
  await expect(sheet).toBeVisible()
}

/**
 * A stored-only zip read by hand: local file headers, one after another.
 *
 * @param {Buffer} bytes
 * @returns {{ name: string, bytes: Buffer }[]}
 */
function unzip(bytes) {
  const entries = []
  let at = 0
  while (bytes.readUInt32LE(at) === 0x04034b50) {
    const method = bytes.readUInt16LE(at + 8)
    expect(method, 'stored, not deflated').toBe(0)
    const size = bytes.readUInt32LE(at + 18)
    const nameLength = bytes.readUInt16LE(at + 26)
    const extraLength = bytes.readUInt16LE(at + 28)
    const name = bytes.subarray(at + 30, at + 30 + nameLength).toString('utf8')
    const start = at + 30 + nameLength + extraLength
    entries.push({ name, bytes: bytes.subarray(start, start + size) })
    at = start + size
  }
  expect(bytes.readUInt32LE(at), 'central directory follows the files').toBe(0x02014b50)
  return entries
}

/**
 * Binary STL → triangle count, unmatched edges (0 = closed manifold), lowest Z.
 *
 * @param {Buffer} bytes
 */
function stlStats(bytes) {
  const count = bytes.readUInt32LE(80)
  expect(bytes.byteLength, 'binary STL length = 84 + 50 per triangle').toBe(84 + 50 * count)
  const key = (/** @type {number[]} */ v) => v.map((n) => Math.round(n * 1000)).join(',')
  /** @type {Map<string, { uses: number, net: number }>} */
  const edges = new Map()
  let minZ = Infinity
  for (let i = 0; i < count; i += 1) {
    const at = 84 + 50 * i + 12
    const corners = [0, 1, 2].map((c) => [0, 1, 2].map((k) => bytes.readFloatLE(at + 12 * c + 4 * k)))
    for (const corner of corners) minZ = Math.min(minZ, corner[2])
    for (let e = 0; e < 3; e += 1) {
      const a = key(corners[e])
      const b = key(corners[(e + 1) % 3])
      if (a === b) continue
      const forward = a < b
      const id = forward ? `${a}|${b}` : `${b}|${a}`
      const entry = edges.get(id) ?? { uses: 0, net: 0 }
      entry.uses += 1
      entry.net += forward ? 1 : -1
      edges.set(id, entry)
    }
  }
  let unmatched = 0
  for (const { uses, net } of edges.values()) if (uses !== 2 || net !== 0) unmatched += 1
  return { triangles: count, unmatched, minZ }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
})

test('Split is exactly-one: disabled with a reason at 0 and at 2 selected, enabled at 1', async ({ page }) => {
  await seedWing(page)
  const split = page.getByTestId('op-split')
  await expect(split).toBeVisible()
  await expect(split).toBeDisabled()
  await expect(split).toHaveAttribute('title', 'Select exactly 1 solid')

  await store(page, (api) => api.selection.selectMany(['wing', 'cube']))
  await expect(split).toBeDisabled()
  await expect(split).toHaveAttribute('title', 'Select exactly 1 solid')

  await store(page, (api) => api.selection.select('wing'))
  await expect(split).toBeEnabled()
  await expect(split).toHaveAttribute('title', /Split/)
})

test('the hand recipe: Split the wing with a tongue and groove, the fit badge turns green, Print pieces downloads two closed STLs', async ({
  page,
}) => {
  await seedWing(page)
  await store(page, (api) => api.selection.select('wing'))

  // Selection response: bounds and the fit verdict, red before the split.
  await showInspector(page)
  const badge = page.getByTestId('inspector-fit-badge')
  await expect(badge).toHaveAttribute('data-fit', 'too-large')
  await expect(badge).toContainText('too large by 50 mm')
  await expect(page.getByTestId('inspector-fit-bounds')).toContainText('300 × 40 × 12 mm')

  // Trigger: Split… opens the sheet, and the cut plane appears in the viewport.
  await page.getByTestId('op-split').click()
  const sheet = page.getByTestId('split-sheet')
  await expect(sheet).toBeVisible()
  const plane = page.getByTestId('cut-plane')
  await expect(plane).toBeVisible()
  await expect(page.getByTestId('split-axis')).toHaveValue('x')
  await expect(page.getByTestId('split-offset')).toHaveValue('150')
  await expect(plane).toHaveAttribute('data-cut-mm', '0.00')

  // The number and the plane are one value: typing moves the plane…
  await page.getByTestId('split-offset').fill('100')
  await expect(plane).toHaveAttribute('data-cut-mm', '-50.00')

  // …and dragging the plane's handle changes the number.
  const handle = page.getByTestId('cut-plane-handle')
  await expect(handle).toBeVisible()
  // Wait for the projection to settle: the plane's axis attributes must read the same across
  // several animation frames. Under load the camera and the viewport are still settling when
  // the sheet has just opened, and a drag sized from a stale scale lands a few mm off.
  await page.waitForFunction(
    () =>
      new Promise((resolve) => {
        const read = () => {
          const el = document.querySelector('[data-testid="cut-plane"]')
          return el ? `${el.getAttribute('data-axis-x')}|${el.getAttribute('data-axis-y')}` : ''
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
  await expect(handle).toBeVisible()
  // Read the scale and the handle's position and fire the drag in ONE synchronous page
  // call, so no frame can re-project the plane between measuring it and dragging it.
  await page.evaluate(() => {
    const plane = document.querySelector('[data-testid="cut-plane"]')
    const target = document.querySelector('[data-testid="cut-plane-handle"]')
    if (!plane || !target) throw new Error('no cut plane')
    const rect = target.getBoundingClientRect()
    const startX = rect.x + rect.width / 2
    const startY = rect.y + rect.height / 2
    // 20 mm along +X's own screen direction (`data-axis-x/y` are pixels per millimetre).
    const dx = Number(plane.getAttribute('data-axis-x')) * 20
    const dy = Number(plane.getAttribute('data-axis-y')) * 20
    if (!(Math.hypot(dx, dy) > 0)) throw new Error('cut plane has no scale')
    const fire = (el, type, x, y) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 11,
          pointerType: 'touch',
          isPrimary: true,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        })
      )
    fire(target, 'pointerdown', startX, startY)
    for (const t of [0.25, 0.5, 0.75, 1]) fire(target, 'pointermove', startX + dx * t, startY + dy * t)
    fire(target, 'pointerup', startX + dx, startY + dy)
  })
  await expect
    .poll(async () => Number(await page.getByTestId('split-offset').inputValue()))
    .toBeCloseTo(120, 0)

  // Back to the recipe's numbers: axis X, offset 150, tongue and groove.
  await page.getByTestId('split-offset').fill('150')
  await page.getByTestId('split-joint').selectOption('tongue')
  await expect(page.getByTestId('split-clearance')).toHaveValue('0.2')
  const pieces = page.getByTestId('split-piece-fit')
  await expect(pieces).toHaveCount(2)
  await expect(pieces.nth(0)).toHaveAttribute('data-fit', 'fits')
  await expect(pieces.nth(1)).toHaveAttribute('data-fit', 'fits')
  await page.getByTestId('split-apply').click()

  // Feedback: the sheet and plane go, two named parts, the badge turns green.
  await expect(sheet).toHaveCount(0)
  await expect(plane).toHaveCount(0)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', 'wing')
  await showInspector(page)
  await expect(page.getByTestId('inspector-parts')).toContainText('Wing A')
  await expect(page.getByTestId('inspector-parts')).toContainText('Wing B')
  await expect(badge).toHaveAttribute('data-fit', 'fits')
  await expect(badge).toContainText('fits')

  // Export… → Print pieces: a zip of wing-a.stl and wing-b.stl, listed with their sizes.
  await page.getByTestId('file-menu-button').click()
  await page.getByTestId('file-export').click()
  await expect(page.getByTestId('export-popover')).toBeVisible()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-print-pieces').click()])
  expect(download.suggestedFilename()).toBe('wing-print-pieces.zip')
  const entries = unzip(readFileSync(await download.path()))
  expect(entries.map((entry) => entry.name)).toEqual(['wing-a.stl', 'wing-b.stl'])
  for (const entry of entries) {
    const stats = stlStats(entry.bytes)
    expect(stats.triangles).toBeGreaterThan(0)
    expect(stats.unmatched, `${entry.name} is a closed manifold`).toBe(0)
    expect(stats.minZ, `${entry.name} lies on the bed`).toBeCloseTo(0, 2)
  }
  const listed = page.getByTestId('export-print-piece')
  await expect(listed).toHaveCount(2)
  await expect(listed.nth(0)).toHaveAttribute('data-filename', 'wing-a.stl')
  await expect(listed.nth(0)).toHaveAttribute('data-size-bytes', String(entries[0].bytes.byteLength))
  await expect(listed.nth(1)).toHaveAttribute('data-filename', 'wing-b.stl')
  await expect(listed.nth(0)).toContainText(/KB|bytes/)
})

test('a refusal stays in the sheet by name and nothing is written', async ({ page }) => {
  await seedWing(page)
  await store(page, (api) => api.selection.select('wing'))
  await page.getByTestId('op-split').click()
  await page.getByTestId('split-offset').fill('400')
  await expect(page.getByTestId('split-problem')).toContainText('outside the body')
  await expect(page.getByTestId('split-apply')).toBeDisabled()
  await page.getByTestId('split-offset').fill('150')
  await page.getByTestId('split-clearance').fill('0')
  await expect(page.getByTestId('split-warning')).toContainText(/[Zz]ero clearance/)
  await expect(page.getByTestId('split-apply')).toBeEnabled()
  await page.getByTestId('split-cancel').click()
  await expect(page.getByTestId('split-sheet')).toHaveCount(0)
  const records = await store(page, (api) => api.documentStore.raw.records.map((record) => record.op))
  expect(records).not.toContain('modify.splitWithJoint')
})

test('Project settings edits the build volume, and the fit verdict follows it', async ({ page }) => {
  await seedWing(page)
  await store(page, (api) => api.selection.select('cube'))
  await showInspector(page)
  await expect(page.getByTestId('inspector-fit-badge')).toHaveAttribute('data-fit', 'fits')

  await page.getByTestId('file-menu-button').click()
  await page.getByTestId('project-settings').click()
  await expect(page.getByTestId('project-settings-dialog')).toBeVisible()
  await expect(page.getByTestId('project-settings-build-width')).toHaveValue('220')
  await expect(page.getByTestId('project-settings-build-depth')).toHaveValue('220')
  await expect(page.getByTestId('project-settings-build-height')).toHaveValue('250')
  await page.getByTestId('project-settings-build-width').fill('8')
  await page.getByTestId('project-settings-build-depth').fill('8')
  await page.getByTestId('project-settings-build-height').fill('8')
  await page.getByTestId('project-settings-save').click()
  await expect(page.getByTestId('project-settings-dialog')).toHaveCount(0)

  await showInspector(page)
  await expect(page.getByTestId('inspector-fit-badge')).toHaveAttribute('data-fit', 'too-large')
  await expect(page.getByTestId('inspector-fit-badge')).toContainText('too large by 2 mm')
})

test('the cut-plane handle is the topmost thing at its own centre, and a cancelled touch keeps the offset', async ({ page }) => {
  await seedWing(page)
  // A real tap-style selection, then Split: at phone width the Inspector sheet opens on
  // selection and the Split sheet is a bottom sheet — either could bury the handle
  // (found by hand-driving a real touch; a synthetic event skips hit-testing entirely).
  await store(page, (api) => api.selection.select('wing'))
  await page.getByTestId('op-split').click()
  const handle = page.getByTestId('cut-plane-handle')
  await expect(handle).toBeVisible()
  const box = await handle.boundingBox()
  if (!box) throw new Error('no handle box')
  const topmost = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('data-testid') ?? null,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  )
  expect(topmost).toBe('cut-plane-handle')

  // A pointercancel carries no position; it must not move the plane to the corner.
  await page.evaluate(
    ({ x, y }) => {
      const target = document.querySelector('[data-testid="cut-plane-handle"]')
      if (!target) throw new Error('no handle')
      const fire = (type, cx, cy) =>
        target.dispatchEvent(
          new PointerEvent(type, { pointerId: 12, pointerType: 'touch', isPrimary: true, buttons: 1, clientX: cx, clientY: cy, bubbles: true, cancelable: true })
        )
      fire('pointerdown', x, y)
      fire('pointermove', x + 3, y + 2)
      fire('pointercancel', 0, 0)
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  )
  const offset = Number(await page.getByTestId('split-offset').inputValue())
  expect(offset).toBeGreaterThan(140)
  expect(offset).toBeLessThan(160)
})
