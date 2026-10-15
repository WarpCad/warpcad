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

/**
 * Place connectors (`TODO/ui-067`): the helpers and the specs below drive the cut-plane marker
 * layer. Positions are face millimetres (`y`, `z` for a cut across X); the page turns them into
 * client pixels with the overlay's own `data-face-*` map, and every pointer is a real
 * `page.mouse` event unless a spec says it fires a synthetic touch.
 */

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

/** @param {import('@playwright/test').Locator} marker */
async function markerFace(marker) {
  return { uMm: Number(await marker.getAttribute('data-u-mm')), vMm: Number(await marker.getAttribute('data-v-mm')) }
}

/**
 * Wait for the plane's projection to hold still across several frames, as the handle drag does.
 *
 * @param {import('@playwright/test').Page} page
 */
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

/**
 * Open Split on the wing, look square at the cut face, switch Place connectors on.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openPlacing(page) {
  await seedWing(page)
  await store(page, (api) => api.selection.select('wing'))
  // Look square at the cut face first: at tablet width the Split sheet sits over the gizmo.
  await page.getByTestId('gizmo-view-right').click()
  await page.getByTestId('op-split').click()
  await expect(page.getByTestId('split-sheet')).toBeVisible()
  await page.getByTestId('split-offset').fill('150')
  await page.getByTestId('split-manual-joints').check()
  await expect(page.getByTestId('split-connector-kind')).toBeVisible()
  await expect(page.getByTestId('split-joint')).toHaveCount(0)
  await expect(page.getByTestId('connector-marker').first()).toBeVisible()
  await expect(page.getByTestId('split-manual-hint')).toHaveAttribute('data-face-view', 'usable')
  await zoomToFace(page)
  await waitForStablePlane(page)
}

/**
 * Zoom with wheel events until the 40 mm face is about 4-5 px per millimetre: wide enough to
 * tap on (the offset handle is a 44 px target at the face's centre, and a face a hundred pixels
 * wide is mostly handle), narrow enough to stay clear of the Split sheet at tablet width. A
 * person does the same with the wheel or a pinch; the wheel event is fired on the canvas so
 * every engine takes it, touch-emulated or not.
 *
 * @param {import('@playwright/test').Page} page
 */
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

test('Place connectors: drag a seeded marker, switch its kind, Apply, and the pieces carry it where it was dragged', async ({
  page,
}) => {
  await openPlacing(page)
  const markers = page.getByTestId('connector-marker')
  const seeded = await markers.count()
  expect(seeded, 'the search’s own placements seed the markers').toBeGreaterThanOrEqual(1)
  await expect(markers.first()).toHaveAttribute('data-kind', 'pins')
  await expect(markers.first()).toHaveAttribute('data-state', 'ok')
  await expect(page.getByTestId('split-apply')).toBeEnabled()

  // Drag the first marker to (y = 4, z = 6) with the real mouse.
  const first = markers.first()
  const from = await centreOfMarker(first)
  const target = await faceToClient(page, 4, 6)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + target.x) / 2, (from.y + target.y) / 2, { steps: 5 })
  await page.mouse.move(target.x, target.y, { steps: 5 })
  await page.mouse.up()
  await expect(markers.first()).toHaveAttribute('data-dragging', 'false')
  await expect.poll(async () => (await markerFace(markers.first())).uMm).toBeCloseTo(4, 0)
  expect((await markerFace(markers.first())).vMm).toBeCloseTo(6, 0)
  const dragged = await markerFace(markers.first())

  // The dragged marker is selected; the picker switches its kind.
  await expect(markers.first()).toHaveAttribute('data-selected', 'true')
  await page.getByTestId('split-connector-kind-screwBoss').click()
  await expect(markers.first()).toHaveAttribute('data-kind', 'screwBoss')
  expect(await markerFace(markers.first())).toEqual(dragged)

  // A drag to a spot with no room goes red, then snaps back with the reason.
  const here = await centreOfMarker(markers.first())
  const bad = await faceToClient(page, 19.5, 6)
  await page.mouse.move(here.x, here.y)
  await page.mouse.down()
  await page.mouse.move(bad.x, bad.y, { steps: 8 })
  await expect(markers.first()).toHaveAttribute('data-state', 'bad')
  await page.mouse.up()
  await expect(markers.first()).toHaveAttribute('data-dragging', 'false')
  await expect(page.getByTestId('split-notice')).toContainText(/placement \d+ \(screwBoss at y = /)
  await expect(markers.first()).toHaveAttribute('data-state', 'ok')
  expect(await markerFace(markers.first())).toEqual(dragged)

  await expect(page.getByTestId('split-apply')).toBeEnabled()
  await page.getByTestId('split-apply').click()
  await expect(page.getByTestId('split-sheet')).toHaveCount(0)

  // Bounds check on the evaluated geometry: piece A (x <= 0) has a boss standing proud of the
  // cut face, centred where the marker was dragged, not where the search put the posts.
  const boss = await store(page, (api) => {
    const body = api.documentStore.raw.bodies().find((candidate) => candidate.id === 'wing')
    const a = body.geometry.parts['Wing A']
    let minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity, maxX = -Infinity
    for (const polygon of a.polygons) {
      for (const [x, y, z] of polygon.vertices) {
        maxX = Math.max(maxX, x)
        if (x > 0.2 && y > -8) {
          minY = Math.min(minY, y); maxY = Math.max(maxY, y); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z)
        }
      }
    }
    return { maxX, centreY: (minY + maxY) / 2, centreZ: (minZ + maxZ) / 2, spanY: maxY - minY }
  })
  expect(boss.maxX, 'a boss stands proud of piece A').toBeGreaterThan(1)
  expect(boss.centreY).toBeCloseTo(dragged.uMm, 0)
  expect(boss.centreZ).toBeCloseTo(dragged.vMm, 0)
  const record = await store(page, (api) => api.documentStore.raw.records.at(-1))
  expect(record.params.placements.some((placement) => placement.kind === 'screwBoss')).toBe(true)
  expect(record.params.joint).toBeUndefined()
})

/** @param {import('@playwright/test').Locator} marker */
async function centreOfMarker(marker) {
  const box = await marker.locator('.marker__hit').boundingBox()
  if (!box) throw new Error('marker has no box')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

test('Place connectors: a tap drops the picked kind, × removes it, and Apply needs at least one', async ({ page }) => {
  await openPlacing(page)
  const markers = page.getByTestId('connector-marker')
  // Remove every seeded marker with the × on each (select, then ×).
  while ((await markers.count()) > 0) {
    const box = await centreOfMarker(markers.first())
    await page.mouse.click(box.x, box.y)
    await expect(markers.first()).toHaveAttribute('data-selected', 'true')
    await page.getByTestId('connector-marker-remove').first().dispatchEvent('pointerdown', { button: 0 })
  }
  await expect(page.getByTestId('split-apply')).toBeDisabled()
  await expect(page.getByTestId('split-problem')).toContainText(/at least one/)

  // Pick Wedge, tap the face.
  await page.getByTestId('split-connector-kind-wedge').click()
  const tap = await faceToClient(page, -8, 6)
  await page.mouse.click(tap.x, tap.y)
  await expect(markers).toHaveCount(1)
  await expect(markers.first()).toHaveAttribute('data-kind', 'wedge')
  await expect(markers.first()).toHaveAttribute('data-state', 'ok')
  await expect(page.getByTestId('split-apply')).toBeEnabled()

  // A tap where nothing fits is turned back with the kernel's reason, not clipped.
  const rim = await faceToClient(page, 19.8, 6)
  await page.mouse.click(rim.x, rim.y)
  await expect(markers).toHaveCount(1)
  await expect(page.getByTestId('split-notice')).toContainText(/placement 2 \(wedge at y = 19\.\d/)

  // Turning it off returns to the automatic joint dropdown.
  await page.getByTestId('split-manual-joints').uncheck()
  await expect(markers).toHaveCount(0)
  await expect(page.getByTestId('split-joint')).toBeVisible()
  await expect(page.getByTestId('split-apply')).toBeEnabled()
})

test('Place connectors, closed io-007 findings: markers are not buried, and a cancelled touch does not move one', async ({
  page,
}) => {
  await openPlacing(page)
  const markers = page.getByTestId('connector-marker')
  const count = await markers.count()
  // (a) Topmost at each marker's own centre — the Inspector or Split sheet must not cover it.
  for (let i = 0; i < count; i += 1) {
    const box = await centreOfMarker(markers.nth(i))
    const top = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid="connector-marker"]')?.getAttribute('data-marker-id') ?? null,
      box
    )
    expect(top, `marker ${i} is the topmost thing at its centre`).toBe(await markers.nth(i).getAttribute('data-marker-id'))
  }
  // (b) A touch that the browser cancels mid-drag carries no position: the marker stays put,
  // and so does the plane's offset handle.
  const before = await markerFace(markers.first())
  const offset = await page.getByTestId('split-offset').inputValue()
  const box = await centreOfMarker(markers.first())
  await page.evaluate(
    ({ x, y }) => {
      const target = document.querySelector('[data-testid="connector-marker"] .marker__hit')
      if (!target) throw new Error('no marker')
      const fire = (type, cx, cy) =>
        target.dispatchEvent(
          new PointerEvent(type, { pointerId: 21, pointerType: 'touch', isPrimary: true, buttons: 1, clientX: cx, clientY: cy, bubbles: true, cancelable: true })
        )
      fire('pointerdown', x, y)
      fire('pointermove', x + 12, y + 9)
      fire('pointermove', x + 20, y + 14)
      fire('pointercancel', 0, 0)
    },
    box
  )
  await page.waitForTimeout(300)
  expect(await markerFace(markers.first())).toEqual(before)
  expect(await page.getByTestId('split-offset').inputValue()).toBe(offset)
  await expect(markers.first()).toHaveAttribute('data-state', 'ok')
})
