// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * File ▾ → Export… (`TODO/ui-034`), driven against `/` — the control surface for `io-003`'s
 * STL / OBJ / glTF serialization, per `docs/decisions/interaction-model-qa.md` §12 (confirmed
 * by the user, and it wins over the task file's older "Operations-toolbar button" text).
 *
 * ## Engines and viewports, stated (`CLAUDE.md`, Browser Support / Responsive Layout)
 *
 * - **All three reference viewports, chromium + webkit.** Export adds a menu item to the
 *   390px-budgeted File popover and a popover of its own (radios at 44px), so layout is
 *   *measured* (rects, trial clicks), not eyeballed — the previous tasks' green suites all
 *   missed a phone-width overlap once. The download path (`Blob` URL + `<a download>`) and
 *   the kernel/three.js geometry are engine-sensitive, so both engines run. Firefox cannot
 *   launch in this sandbox (`TROUBLESHOOTING.md`, 2026-09-17) — the claim is chromium + webkit.
 *
 * ## What the downloaded bytes are checked against
 *
 * Every downloaded file is parsed here by code that shares nothing with the serializers
 * (`@jscad/stl-serializer`, `@jscad/obj-serializer`, three.js's `GLTFExporter`): a
 * hand-written STL/OBJ/GLB reader, whose signed volume is compared with the kernel's own
 * volume as the app reports it (`data-body-volume`) and whose edges are checked closed
 * (every undirected edge used by exactly two faces, in opposite directions). **No real
 * slicer or glTF viewer opens anything in this spec** — `TODO/VERIFY.md` says so, and it is
 * the one thing this spec cannot replace.
 *
 * ## Reachability is this spec's job; "does it work" is not
 *
 * `TODO/ACCEPTANCE.md` scenario 11, driven by hand with wandering, differently-ordered
 * actions, is the other half.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'export-ui-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

/** Two drop points that reliably hit the grid at every viewport (a drop below ~fy 0.45 at 390 misses). */
const CUBE_A = { drop: { fx: 0.28, fy: 0.42 }, click: { fx: 0.28, fy: 0.38 } }
const CUBE_B = { drop: { fx: 0.72, fy: 0.3 }, click: { fx: 0.72, fy: 0.26 } }

// ---------------------------------------------------------------------------------------
// Driving helpers — the same real-PointerEvent helpers the other specs use
// ---------------------------------------------------------------------------------------

/** @param {import('@playwright/test').Page} page */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (await rows.isVisible()) return
  await page.getByTestId('library-tab').click()
  await expect(rows).toBeVisible()
}

/** @param {import('@playwright/test').Page} page */
async function closeLibrary(page) {
  const tab = page.getByTestId('library-tab')
  if (!(await tab.isVisible())) return
  if (await page.getByTestId('library-rows').isVisible()) await tab.click()
  await expect(page.getByTestId('library-rows')).toBeHidden()
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ op: string, fx: number, fy: number }} options
 */
async function dragRowIntoViewport(page, { op, fx, fy }) {
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
      const fire = (target, type, x, y) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 7,
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
  await page.waitForTimeout(120)
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {number} fx
 * @param {number} fy
 * @param {{ shift?: boolean }} [modifiers]
 */
async function clickViewportAt(page, fx, fy, modifiers = {}) {
  await page.evaluate(
    ({ fx, fy, shift }) => {
      const canvas = document.querySelector('[data-testid="viewport-canvas"]')
      if (!canvas) throw new Error('no canvas')
      const box = canvas.getBoundingClientRect()
      const x = box.left + box.width * fx
      const y = box.top + box.height * fy
      for (const type of ['pointerdown', 'pointerup']) {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 3,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            shiftKey: shift === true,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        )
      }
    },
    { fx, fy, shift: modifiers.shift === true },
  )
  await page.waitForTimeout(90)
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ id: string, name: string, volume: number, bounds: number[] }[]>}
 */
async function sceneBodies(page) {
  // A composite's volume is a kernel union, measured in the evaluation worker since
  // `TODO/core-029`: `data-body-volume` is absent until it lands, so wait for it.
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-testid="scene-bodies"] li')].every((node) => node.hasAttribute('data-body-volume')),
  )
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      name: node.getAttribute('data-body-name') ?? '',
      volume: Number(node.getAttribute('data-body-volume') ?? 'NaN'),
      bounds: (node.getAttribute('data-body-bounds') ?? '').split(',').map(Number),
    })),
  )
}

/** Two cubes placed by real drags, the Library put away. */
async function placeTwoCubes(page) {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_A.drop })
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_B.drop })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
}

/** Select both cubes (click, Shift-click) and press Union — the scenario's own step 2. */
async function unionTheCubes(page) {
  await clickViewportAt(page, CUBE_A.click.fx, CUBE_A.click.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  await clickViewportAt(page, CUBE_B.click.fx, CUBE_B.click.fy, { shift: true })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await page.getByTestId('operation-union').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
}

/**
 * The running app's own store modules, used only to *seed* geometry a drag cannot place
 * precisely (an overlap, an empty subtract) and to *read back* — never for the action
 * under test, which is always a click.
 *
 * @param {import('@playwright/test').Page} page
 */
function storeApi(page) {
  return {
    /** @param {(api: any, arg: any) => any} fn @param {any} [arg] */
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

/** @param {import('@playwright/test').Page} page */
async function openFileMenu(page) {
  await page.getByTestId('file-menu-button').click()
  await expect(page.getByTestId('file-menu')).toBeVisible()
}

/** @param {import('@playwright/test').Page} page */
async function openExportPopover(page) {
  await openFileMenu(page)
  await page.getByTestId('file-export').click()
  await expect(page.getByTestId('export-popover')).toBeVisible()
  await expect(page.getByTestId('file-menu')).toHaveCount(0)
}

/**
 * Press Export and take the download the browser starts.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ name: string, bytes: Buffer }>}
 */
async function pressExport(page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-commit').click()])
  const path = await download.path()
  return { name: download.suggestedFilename(), bytes: readFileSync(path) }
}

/** Trial-click: does the topmost element at the item's centre belong to the item? */
async function isReachable(page, testId) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!el) return { found: false }
    const box = el.getBoundingClientRect()
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    const top = document.elementFromPoint(x, y)
    return {
      found: true,
      height: box.height,
      width: box.width,
      onScreen: box.left >= 0 && box.right <= window.innerWidth && box.top >= 0 && box.bottom <= window.innerHeight,
      topmostIsItem: top !== null && (el === top || el.contains(top) || top.contains(el)),
    }
  }, testId)
}

// ---------------------------------------------------------------------------------------
// Independent parsers (share nothing with the serializers under test)
// ---------------------------------------------------------------------------------------

/** @typedef {number[]} Tri  nine numbers: ax ay az bx by bz cx cy cz */

/** @param {Buffer} bytes @returns {Tri[]} */
function parseBinaryStl(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint32(80, true)
  expect(bytes.byteLength, 'binary STL length = 84 + 50 per triangle').toBe(84 + 50 * count)
  /** @type {Tri[]} */
  const tris = []
  for (let i = 0; i < count; i += 1) {
    const offset = 84 + 50 * i + 12
    const tri = []
    for (let k = 0; k < 9; k += 1) tri.push(view.getFloat32(offset + 4 * k, true))
    tris.push(tri)
  }
  return tris
}

/** @param {Buffer} bytes @returns {Tri[]} */
function parseObj(bytes) {
  const vertices = []
  const tris = []
  for (const line of bytes.toString('utf8').split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts[0] === 'v') vertices.push(parts.slice(1, 4).map(Number))
    else if (parts[0] === 'f') {
      const idx = parts.slice(1).map((token) => Number(token.split('/')[0]) - 1)
      for (let k = 1; k + 1 < idx.length; k += 1) {
        tris.push([...vertices[idx[0]], ...vertices[idx[k]], ...vertices[idx[k + 1]]])
      }
    }
  }
  return tris
}

/**
 * Signed volume (mm³, absolute) and how many undirected edges are NOT used by exactly two
 * faces in opposite directions — 0 means a closed, consistently wound manifold.
 *
 * @param {Tri[]} tris
 */
function meshStats(tris) {
  const key = (x, y, z) => `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`
  let volume = 0
  /** @type {Map<string, { uses: number, net: number }>} */
  const edges = new Map()
  for (const t of tris) {
    volume +=
      (t[0] * (t[4] * t[8] - t[5] * t[7]) - t[1] * (t[3] * t[8] - t[5] * t[6]) + t[2] * (t[3] * t[7] - t[4] * t[6])) / 6
    const ids = [key(t[0], t[1], t[2]), key(t[3], t[4], t[5]), key(t[6], t[7], t[8])]
    for (let i = 0; i < 3; i += 1) {
      const a = ids[i]
      const b = ids[(i + 1) % 3]
      if (a === b) continue
      const forward = a < b
      const edge = forward ? `${a}|${b}` : `${b}|${a}`
      const entry = edges.get(edge) ?? { uses: 0, net: 0 }
      entry.uses += 1
      entry.net += forward ? 1 : -1
      edges.set(edge, entry)
    }
  }
  let unmatched = 0
  for (const { uses, net } of edges.values()) if (uses !== 2 || net !== 0) unmatched += 1
  return { volume: Math.abs(volume), unmatchedEdges: unmatched, edgeCount: edges.size, triangles: tris.length }
}

/**
 * A `.glb` container read by hand: header, JSON chunk, BIN chunk, and — for the mesh data —
 * the position accessor read out of the BIN chunk.
 *
 * @param {Buffer} bytes
 */
function parseGlb(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  expect(view.getUint32(0, true), 'magic "glTF"').toBe(0x46546c67)
  expect(view.getUint32(4, true), 'glTF version 2').toBe(2)
  expect(view.getUint32(8, true), 'header length = file length').toBe(bytes.byteLength)
  const jsonLength = view.getUint32(12, true)
  expect(view.getUint32(16, true), 'first chunk is JSON').toBe(0x4e4f534a)
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'))
  const binHeader = 20 + jsonLength
  expect(view.getUint32(binHeader + 4, true), 'second chunk is BIN').toBe(0x004e4942)
  const bin = bytes.subarray(binHeader + 8)

  /** @param {number} accessorIndex @returns {number[][]} */
  const readVec3 = (accessorIndex) => {
    const accessor = json.accessors[accessorIndex]
    const bufferView = json.bufferViews[accessor.bufferView]
    const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
    const stride = bufferView.byteStride ?? 12
    const out = []
    for (let i = 0; i < accessor.count; i += 1) {
      const at = bin.byteOffset + start + i * stride
      const dv = new DataView(bin.buffer, at, 12)
      out.push([dv.getFloat32(0, true), dv.getFloat32(4, true), dv.getFloat32(8, true)])
    }
    return out
  }
  return { json, readVec3 }
}

/**
 * A glTF node's local 4x4 (column-major), from `matrix` or, failing that, its TRS —
 * three.js's exporter writes `matrix` unless asked for TRS, and a reader must take either.
 *
 * @param {any} node
 * @returns {number[]}
 */
function nodeMatrix(node) {
  if (node.matrix) return node.matrix
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]
  // prettier-ignore
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ]
}

/** @param {number[]} a @param {number[]} b column-major a·b */
function multiply(a, b) {
  const out = new Array(16).fill(0)
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let k = 0; k < 4; k += 1) out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k]
    }
  }
  return out
}

/**
 * Every mesh node's POSITION data pushed through the whole node chain above it — what a viewer
 * puts on screen, in metres.
 *
 * @param {{ json: any, readVec3: (i: number) => number[][] }} glb
 * @returns {{ node: any, world: number[][] }[]}
 */
function worldMeshes(glb) {
  const { json, readVec3 } = glb
  const found = []
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  /** @param {number} index @param {number[]} parent */
  const walk = (index, parent) => {
    const node = json.nodes[index]
    const matrix = multiply(parent, nodeMatrix(node))
    if (node.mesh !== undefined) {
      const world = json.meshes[node.mesh].primitives.flatMap((/** @type {any} */ primitive) =>
        readVec3(primitive.attributes.POSITION).map(([x, y, z]) => [
          matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
          matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
          matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
        ]),
      )
      found.push({ node, world })
    }
    for (const child of node.children ?? []) walk(child, matrix)
  }
  for (const root of json.scenes[json.scene ?? 0].nodes) walk(root, identity)
  return found
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

// ---------------------------------------------------------------------------------------

test('Export… is in File ▾, last in the "This device" group, and dimmed with its reason on an empty scene', async ({
  page,
}, testInfo) => {
  // Reachability: the header's File menu is the trigger, not the Operations toolbar.
  await expect(page.getByTestId('operations-toolbar').getByText(/export/i)).toHaveCount(0)

  await openFileMenu(page)
  const item = page.getByTestId('file-export')
  await expect(item).toBeVisible()
  await expect(item).toContainText('Export…')
  await expect(item).toHaveAttribute('aria-disabled', 'true')
  await expect(item).toBeDisabled() // Playwright reads aria-disabled
  await expect(item).toHaveAttribute('title', 'Nothing to export')
  await expect(page.getByTestId('file-export-reason')).toHaveText('Nothing to export')
  // (d) the reason is the item's accessible description, not just a hover tooltip a phone never shows.
  await expect(item).toHaveAccessibleDescription('Nothing to export')

  // Order inside the group: Save/Download, Open…, Export…
  const order = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="group"][aria-label="This device"] button')).map((b) =>
      b.getAttribute('data-testid'),
    ),
  )
  expect(order.at(-1)).toBe('file-export')
  expect(order.at(-2)).toBe('file-open')

  // Pressing the dimmed item does nothing: the menu stays and no popover appears.
  await item.click({ force: true })
  await expect(page.getByTestId('file-menu')).toBeVisible()
  await expect(page.getByTestId('export-popover')).toHaveCount(0)

  await page.screenshot({ path: join(SNAPSHOT_DIR, `empty-menu-${testInfo.project.name}.png`) })
})

test('scenario 11: place two solids, union them, select the result, File ▾ → Export…, STL — the file downloads and parses', async ({
  page,
}, testInfo) => {
  await placeTwoCubes(page)
  await unionTheCubes(page)
  const [union] = await sceneBodies(page)
  expect(union.name).toBe('Union 1')

  await openFileMenu(page)
  await expect(page.getByTestId('file-export')).not.toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByTestId('file-export-reason')).toHaveCount(0)
  await page.getByTestId('file-export').click()

  const popover = page.getByTestId('export-popover')
  await expect(popover).toBeVisible()
  // Pressing File ▾ did not clear the selection: Scope defaults to it, and says so.
  await expect(page.getByTestId('export-scope-selection')).toBeChecked()
  await expect(page.getByTestId('export-scope-selection-label')).toHaveText('Selection — Union 1')
  await expect(page.getByTestId('export-scope-scene-label')).toHaveText('Whole scene — 1 body')
  await expect(page.getByTestId('export-format-stl')).toBeChecked()
  await expect(page.getByTestId('export-summary')).toHaveText('Exports Union 1 as union-1.stl')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  await page.screenshot({ path: join(SNAPSHOT_DIR, `popover-${testInfo.project.name}.png`) })

  const { name, bytes } = await pressExport(page)
  expect(name).toBe('union-1.stl')
  const stats = meshStats(parseBinaryStl(bytes))
  expect(stats.triangles).toBeGreaterThan(0)
  expect(stats.unmatchedEdges, 'a slicer needs a closed surface').toBe(0)
  expect(Math.abs(stats.volume - union.volume) / union.volume).toBeLessThan(1e-4)

  // Feedback: the popover closed, the chip names the file, the selection survived.
  await expect(popover).toHaveCount(0)
  await expect(page.getByTestId('save-status')).toContainText('Exported union-1.stl')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
})

test('an overlapping cube and cylinder unioned in the kernel export as one closed solid of the kernel volume', async ({
  page,
}) => {
  await storeApi(page).run(async (api) => {
    api.documentStore.append({ id: 'cube', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [20, 20, 20], center: [0, 0, 10] } })
    api.documentStore.append({ id: 'cyl', op: 'primitive.cylinder', name: 'Cylinder 1', params: { diameter: 12, height: 40, center: [10, 0, 0] } })
    api.selection.selectMany(['cube', 'cyl'])
  })
  await expect(page.getByTestId('operation-union')).toBeEnabled()
  await page.getByTestId('operation-union').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  const [union] = await sceneBodies(page)

  await openExportPopover(page)
  const { name, bytes } = await pressExport(page)
  expect(name).toBe('union-1.stl')
  const stats = meshStats(parseBinaryStl(bytes))
  expect(stats.unmatchedEdges).toBe(0)
  expect(Math.abs(stats.volume - union.volume) / union.volume).toBeLessThan(1e-4)
})

test('nothing selected: Scope defaults to the whole scene (Selection radio disabled), OBJ is remembered across a reload', async ({
  page,
}) => {
  await placeTwoCubes(page)
  await page.getByTestId('viewport-canvas').click({ position: { x: 4, y: 4 } }) // clear the selection
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')
  const bodies = await sceneBodies(page)

  await openExportPopover(page)
  await expect(page.getByTestId('export-scope-scene')).toBeChecked()
  await expect(page.getByTestId('export-scope-selection')).toBeDisabled()
  await expect(page.getByTestId('export-scope-scene-label')).toHaveText('Whole scene — 2 bodies, in one file')
  await expect(page.getByTestId('export-summary')).toHaveText('Exports 2 bodies together as warpcad-scene.stl')

  await page.getByTestId('export-format-obj').check()
  await expect(page.getByTestId('export-summary')).toHaveText('Exports 2 bodies together as warpcad-scene.obj')
  const { name, bytes } = await pressExport(page)
  expect(name).toBe('warpcad-scene.obj')
  const stats = meshStats(parseObj(bytes))
  expect(stats.unmatchedEdges).toBe(0)
  const expected = bodies.reduce((sum, body) => sum + body.volume, 0)
  expect(Math.abs(stats.volume - expected) / expected).toBeLessThan(1e-4)
  await expect(page.getByTestId('save-status')).toContainText('Exported warpcad-scene.obj')

  // Remembered per viewer: after a reload the popover opens on OBJ.
  await page.reload()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2', { timeout: 15000 })
  await openExportPopover(page)
  await expect(page.getByTestId('export-format-obj')).toBeChecked()
})

test('glTF: a single .glb whose root node carries the mm→m, Z-up→Y-up conversion and whose data is closed geometry', async ({
  page,
}) => {
  // An off-origin UNION, not a plain cuboid: a cuboid's render mesh is closed either way,
  // so it could never have failed the watertightness assertion at the bottom of this test
  // and the title's "closed geometry" claim was riding on a shape that proved nothing.
  // This is the shape `io-004`/`io-005` were both filed against — a Ø40 × 50 cylinder and a
  // 40 mm cube, placed where scenario 11 step 2 places them — whose render mesh measured
  // 44 of 262 edges open before `io-005`. Seeded through the store and unioned by pressing
  // the real button: a drag cannot place an overlap this precisely, and at 390 × 844 a drop
  // below ~fy 0.45 misses the grid entirely (the same reason the neighbouring tests seed).
  await storeApi(page).run(async (api) => {
    api.documentStore.append({ id: 'cyl', op: 'primitive.cylinder', name: 'Cylinder 1', params: { diameter: 40, height: 50, center: [-100.89, 66.93, 25] } })
    api.documentStore.append({ id: 'cube', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [40, 40, 40], center: [-95, 75, 20] } })
    api.selection.selectMany(['cyl', 'cube'])
  })
  await expect(page.getByTestId('operation-union')).toBeEnabled()
  await page.getByTestId('operation-union').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  const [union] = await sceneBodies(page)

  await openExportPopover(page)
  await page.getByTestId('export-format-glb').check()
  await expect(page.getByTestId('export-summary')).toHaveText('Exports Union 1 as union-1.glb')

  const { name, bytes } = await pressExport(page)
  expect(name).toBe('union-1.glb')
  const glb = parseGlb(bytes)
  const { json, readVec3 } = glb

  const root = json.nodes.find((node) => node.name === 'warpcad-export')
  expect(root, 'a single root node named warpcad-export carries the conversion').toBeDefined()
  expect(json.meshes).toHaveLength(1)
  expect(json.scenes[0].nodes, 'the scene has one root').toHaveLength(1)

  // The root's matrix is scale 0.001 (each basis column has length 0.001) composed with a
  // -90° turn about X: document +X stays X, document +Z (up) becomes glTF +Y, document +Y
  // becomes glTF -Z.
  const m = nodeMatrix(root)
  const col = (i) => Math.hypot(m[i * 4], m[i * 4 + 1], m[i * 4 + 2])
  for (const i of [0, 1, 2]) expect(col(i), 'mm → m').toBeCloseTo(0.001, 9)
  expect([m[0], m[1], m[2]].map((v) => Math.round(v * 1e9))).toEqual([1e6, 0, 0]) // +X → +X
  expect([m[4], m[5], m[6]].map((v) => Math.round(v * 1e9))).toEqual([0, 0, -1e6]) // +Y → -Z
  expect([m[8], m[9], m[10]].map((v) => Math.round(v * 1e9))).toEqual([0, 1e6, 0]) // +Z → +Y

  const [{ world }] = worldMeshes(glb)
  const range = (axis) => [Math.min(...world.map((p) => p[axis])), Math.max(...world.map((p) => p[axis]))]
  // The viewport's own reading of this body's millimetre bounds, pushed through the same
  // conversion the root node declares: X stays X, document Z becomes glTF Y (up), document
  // Y becomes glTF -Z. Read from the app rather than hardcoded, so this still describes the
  // solid the user is looking at if the tessellation ever shifts.
  // `data-body-bounds` is printed to 2 decimals (0.01 mm), so 4 places of a metre.
  const [minX, minY, minZ, maxX, maxY, maxZ] = union.bounds
  for (const [axis, low, high] of /** @type {[number, number, number][]} */ ([
    [0, minX / 1000, maxX / 1000],
    [1, minZ / 1000, maxZ / 1000],
    [2, -maxY / 1000, -minY / 1000],
  ])) {
    const [low0, high0] = range(axis)
    expect(low0).toBeCloseTo(low, 4)
    expect(high0).toBeCloseTo(high, 4)
  }
  // Y is up now, and this solid sits on the ground: it starts at 0 rather than below it.
  expect(range(1)[0]).toBeCloseTo(0, 4)

  // The vertex data itself is still millimetres (the node converts), and is closed geometry
  // whose volume is the kernel's.
  const positions = readVec3(json.meshes[0].primitives[0].attributes.POSITION)
  const tris = []
  for (let i = 0; i + 2 < positions.length; i += 3) tris.push([...positions[i], ...positions[i + 1], ...positions[i + 2]])
  const stats = meshStats(tris)
  // `io-005`: the .glb is held to the same bar as the STL and OBJ above, not a weaker one.
  // This was 44 of 262 before the repair landed, on this exact shape.
  expect(stats.unmatchedEdges, 'the .glb mesh is closed, like the STL and OBJ of the same body').toBe(0)
  expect(Math.abs(stats.volume - union.volume) / union.volume).toBeLessThan(1e-4)
})

test('while History previews a past state Export… is dimmed with the way out; it is live again after leaving', async ({
  page,
}) => {
  await placeTwoCubes(page)
  await page.getByTestId('timeline-toggle').click()
  await expect(page.getByTestId('timeline-panel')).toBeVisible()
  await page.getByTestId('timeline-row-1').click()
  await expect(page.getByTestId('timeline-preview-strip')).toBeVisible()

  await openFileMenu(page)
  await expect(page.getByTestId('file-export')).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByTestId('file-export-reason')).toHaveText('Return to the latest step to export')
  await expect(page.getByTestId('file-export')).toHaveAccessibleDescription('Return to the latest step to export')
  await page.getByTestId('file-export').click({ force: true })
  await expect(page.getByTestId('export-popover')).toHaveCount(0)

  // Leave the preview (Esc closes the menu first, then the strip's own button).
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('file-menu')).toHaveCount(0)
  await page.getByTestId('timeline-back-to-latest').click()
  await expect(page.getByTestId('timeline-preview-strip')).toHaveCount(0)
  await openFileMenu(page)
  await expect(page.getByTestId('file-export')).not.toHaveAttribute('aria-disabled', 'true')
})

test('rolled back: Export… stays enabled, says how much is left out, and the file holds the ACTIVE state', async ({
  page,
}) => {
  await placeTwoCubes(page)
  await page.getByTestId('timeline-toggle').click()
  await page.getByTestId('timeline-row-1').click()
  await page.getByTestId('timeline-rollback').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('timeline-rollback-strip')).toBeVisible()
  // Rolling back clears the selection (§18), so the default scope is the whole (active) scene.
  const [only] = await sceneBodies(page)

  await openExportPopover(page)
  await expect(page.getByTestId('export-rollback-note')).toHaveText('(rolled back — 1 later step not included)')
  await expect(page.getByTestId('export-scope-scene-label')).toHaveText('Whole scene — 1 body')
  const { name, bytes } = await pressExport(page)
  expect(name).toBe(`${only.name.toLowerCase().replace(/\s+/g, '-')}.stl`)
  const stats = meshStats(parseBinaryStl(bytes))
  expect(Math.abs(stats.volume - only.volume) / only.volume).toBeLessThan(1e-4)
})

test('a refusal is shown by name in the popover, which stays open — never a silent empty download', async ({
  page,
}) => {
  // Two identical cubes, one subtracted from the other: an empty result, which the kernel
  // reports as a body with no triangles. (Real UI: select both, press Subtract.)
  await storeApi(page).run(async (api) => {
    const cube = (id, name) => ({ id, op: 'primitive.cuboid', name, params: { size: [10, 10, 10], center: [0, 0, 5] } })
    api.documentStore.append(cube('a', 'Cube 1'))
    api.documentStore.append(cube('b', 'Cube 2'))
    api.selection.selectMany(['a', 'b'])
  })
  await page.getByTestId('operation-subtract').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  await openExportPopover(page)
  let downloaded = false
  page.on('download', () => {
    downloaded = true
  })
  await page.getByTestId('export-commit').click()
  const alert = page.getByTestId('export-error')
  await expect(alert).toBeVisible()
  await expect(alert).toHaveAttribute('role', 'alert')
  await expect(alert).toContainText('"Subtract 1"')
  await expect(alert).toContainText('no triangles')
  await expect(page.getByTestId('export-popover')).toBeVisible()
  await page.waitForTimeout(300)
  expect(downloaded).toBe(false)
})

test('the document changing under the open popover: the line follows it and the file is what the line said', async ({
  page,
}) => {
  await placeTwoCubes(page)
  await unionTheCubes(page)
  await openExportPopover(page)
  await expect(page.getByTestId('export-summary')).toHaveText('Exports Union 1 as union-1.stl')

  // Ctrl+Z reaches the app while the popover is open (the backdrop stops the mouse, not the
  // keyboard). Focus is on Export, a button: the History shortcut stands down for text-entry
  // fields (a radio counts as one there), which is why focus is moved off the radio first.
  await page.getByTestId('export-commit').focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  // Undo puts the two cubes back in the selection, so the DEFAULT scope follows to them — and the
  // line says so before anyone presses anything.
  await expect(page.getByTestId('export-summary')).toHaveText('Exports 2 bodies together as warpcad-scene.stl')
  const bodies = await sceneBodies(page)
  const { name, bytes } = await pressExport(page)
  expect(name).toBe('warpcad-scene.stl')
  const stats = meshStats(parseBinaryStl(bytes))
  const expected = bodies.reduce((sum, body) => sum + body.volume, 0)
  expect(Math.abs(stats.volume - expected) / expected).toBeLessThan(1e-4)
})

test('an explicit Selection choice whose selection vanishes is blocked, not widened to the whole scene', async ({
  page,
}) => {
  await placeTwoCubes(page)
  await unionTheCubes(page)
  await openExportPopover(page)
  // An EXPLICIT choice (a real change event): scene first, then back to the selection.
  await page.getByTestId('export-scope-scene').check()
  await page.getByTestId('export-scope-selection').check()
  // Something else clears the selection while the popover is open (a programmatic edit).
  await storeApi(page).run(async (api) => api.selection.clear())
  await expect(page.getByTestId('export-blocked')).toHaveText('The selection changed — choose what to export')
  await expect(page.getByTestId('export-commit')).toBeDisabled()
  await page.getByTestId('export-scope-scene').check()
  await expect(page.getByTestId('export-blocked')).toHaveCount(0)
  const { name } = await pressExport(page)
  expect(name).toBe('union-1.stl') // one body in the scene, so the scene file is that body's name
})

test('a drilled-in sub-part selection exports its WHOLE parent body, and the popover says so', async ({ page }) => {
  const part = await storeApi(page).run(async (api) => {
    api.documentStore.append({ id: 'bolt', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm10 hex', length: 30 } })
    const names = api.documentStore.raw.bodies()[0].geometry.names
    api.selection.select('bolt')
    api.selection.drillInto(names[0])
    return names[0]
  })
  const [bolt] = await sceneBodies(page)
  await openExportPopover(page)
  await expect(page.getByTestId('export-scope-selection-label')).toHaveText('Selection — Bolt 1')
  await expect(page.getByTestId('export-whole-body-note')).toContainText(`whole body "Bolt 1"`)
  await expect(page.getByTestId('export-whole-body-note')).toContainText(`"${part}"`)
  const { name, bytes } = await pressExport(page)
  expect(name).toBe('bolt-1.stl')
  const stats = meshStats(parseBinaryStl(bytes))
  // The whole combined bolt, not the one part: the kernel's volume for the body.
  expect(Math.abs(stats.volume - bolt.volume) / bolt.volume).toBeLessThan(2e-3)
  // This assertion is what `TODO/io-004` was filed to make possible. Until it landed, the
  // combined bolt's STL had 20 open edge pairs at the hex head's rim — T-junctions, with the
  // volume right and nothing missing — and this spec could only assert the volume. A Group
  // body goes through the same repair as any other now, so a downloaded bolt is closed.
  expect(stats.unmatchedEdges, 'a Group body is watertight too (io-004)').toBe(0)
})

test('a cylinder and a cube placed away from the origin and unioned export closed, not merely the right volume', async ({
  page,
}) => {
  // io-004's first reproduction, driven through the real UI: the same shape ACCEPTANCE
  // scenario 11 step 2 builds by hand. Placed off-origin on purpose — at the origin the
  // serializer's own T-junction repair happens to succeed, which is exactly why io-003
  // measured 0 and believed it general.
  await storeApi(page).run(async (api) => {
    api.documentStore.append({
      id: 'cyl',
      op: 'primitive.cylinder',
      name: 'Cylinder 1',
      params: { diameter: 40, height: 50, center: [-100.89, 66.93, 25] },
    })
    api.documentStore.append({
      id: 'cube',
      op: 'primitive.cuboid',
      name: 'Cube 1',
      params: { size: [40, 40, 40], center: [-95, 75, 20] },
    })
    api.selection.selectMany(['cyl', 'cube'])
  })
  await expect(page.getByTestId('operation-union')).toBeEnabled()
  await page.getByTestId('operation-union').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  const [union] = await sceneBodies(page)

  await openExportPopover(page)
  const stl = await pressExport(page)
  expect(stl.name).toBe('union-1.stl')
  const stlStats = meshStats(parseBinaryStl(stl.bytes))
  expect(stlStats.unmatchedEdges, 'STL of an off-origin union is closed (io-004)').toBe(0)
  expect(Math.abs(stlStats.volume - union.volume) / union.volume).toBeLessThan(1e-4)

  // The same solid feeds OBJ, so it carries the same repair.
  await openExportPopover(page)
  await page.getByTestId('export-format-obj').check()
  const obj = await pressExport(page)
  expect(obj.name).toBe('union-1.obj')
  const objStats = meshStats(parseObj(obj.bytes))
  expect(objStats.unmatchedEdges, 'OBJ of an off-origin union is closed (io-004)').toBe(0)
  expect(Math.abs(objStats.volume - union.volume) / union.volume).toBeLessThan(1e-4)
})

test('Esc and the backdrop close the popover without exporting; Cancel too', async ({ page }) => {
  await placeTwoCubes(page)
  let downloaded = false
  page.on('download', () => {
    downloaded = true
  })
  await openExportPopover(page)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('export-popover')).toHaveCount(0)

  await openExportPopover(page)
  await page.getByTestId('export-backdrop').click({ position: { x: 4, y: 500 } })
  await expect(page.getByTestId('export-popover')).toHaveCount(0)

  await openExportPopover(page)
  await page.getByTestId('export-cancel').click()
  await expect(page.getByTestId('export-popover')).toHaveCount(0)
  await page.waitForTimeout(200)
  expect(downloaded).toBe(false)
  // The scene is untouched by all three.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
})

test('layout, measured: the menu row and the popover fit, are tappable at 44px, and the header keeps its order', async ({
  page,
}, testInfo) => {
  await placeTwoCubes(page)
  await unionTheCubes(page)

  // Header order (ui-033's contract, untouched): Undo, Redo, History, File, chip.
  const order = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="document-bar"] > *, [data-testid="document-bar"] button'))
      .map((el) => el.getAttribute('data-testid'))
      .filter((id) => ['undo-button', 'redo-button', 'timeline-toggle', 'file-menu-button', 'save-status'].includes(id ?? '')),
  )
  expect(order).toEqual(['undo-button', 'redo-button', 'timeline-toggle', 'file-menu-button', 'save-status'])

  await openFileMenu(page)
  for (const id of ['file-save', 'file-open', 'file-export', 'hosted-connect']) {
    const reach = await isReachable(page, id)
    expect(reach.found, id).toBe(true)
    expect(reach.onScreen, `${id} on screen`).toBe(true)
    expect(reach.topmostIsItem, `${id} trial click lands on it`).toBe(true)
    expect(reach.height, `${id} tap height`).toBeGreaterThanOrEqual(44)
  }
  const menuBox = await page.getByTestId('file-menu').boundingBox()
  const viewport = page.viewportSize()
  expect(menuBox.x).toBeGreaterThanOrEqual(0)
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewport.width)
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(viewport.height)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `menu-${testInfo.project.name}.png`) })

  await page.getByTestId('file-export').click()
  await expect(page.getByTestId('export-popover')).toBeVisible()
  const box = await page.getByTestId('export-popover').boundingBox()
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
  expect(box.width).toBeLessThanOrEqual(Math.min(320, viewport.width - 16) + 0.5)
  // No horizontal scroll inside it or on the page.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(
    await page.getByTestId('export-popover').evaluate((el) => el.scrollWidth <= el.clientWidth),
    'popover has no horizontal scroll',
  ).toBe(true)

  for (const id of [
    'export-scope-selection-label',
    'export-scope-scene-label',
    'export-format-stl-label',
    'export-format-obj-label',
    'export-format-glb-label',
    'export-commit',
    'export-cancel',
  ]) {
    const reach = await isReachable(page, id)
    expect(reach.found, id).toBe(true)
    expect(reach.onScreen, `${id} on screen`).toBe(true)
    expect(reach.topmostIsItem, `${id} trial click lands on it`).toBe(true)
    expect(reach.height, `${id} tap height`).toBeGreaterThanOrEqual(44)
  }
  await page.screenshot({ path: join(SNAPSHOT_DIR, `popover-measured-${testInfo.project.name}.png`) })
})

// ---------------------------------------------------------------------------------------
// The export worker and the slow-export pending state (`TODO/perf-001`)
// ---------------------------------------------------------------------------------------

/**
 * Both engines, all three viewports, for a specific reason: this is a **module worker**
 * (`new Worker(new URL(…), { type: 'module' })`), which is bundled differently by Vite
 * and implemented differently by Chromium and WebKit — exactly the "works in Chrome is
 * not evidence" surface `CLAUDE.md`'s Browser Support section is about. Firefox cannot
 * launch in this sandbox (`TROUBLESHOOTING.md`, 2026-09-17), so the claim is
 * chromium + webkit.
 *
 * The pending state is watched with a `MutationObserver` installed *before* the press,
 * rather than polled afterwards: it is by nature brief, and a poll that missed it would
 * report the opposite of the truth.
 *
 * @param {import('@playwright/test').Page} page
 */
async function watchPendingState(page) {
  await page.evaluate(() => {
    window.__pendingSeen = 0
    window.__pendingText = ''
    window.__pendingRects = []
    const look = () => {
      const el = document.querySelector('[data-testid="export-pending"]')
      if (!el) return
      window.__pendingSeen += 1
      window.__pendingText = el.textContent.trim()
      const box = el.getBoundingClientRect()
      window.__pendingRects.push({ x: box.x, y: box.y, width: box.width, height: box.height })
    }
    new MutationObserver(look).observe(document.body, { childList: true, subtree: true })
    look()
  })
}

/** @param {import('@playwright/test').Page} page */
const pendingReport = (page) =>
  page.evaluate(() => ({
    seen: window.__pendingSeen,
    text: window.__pendingText,
    rects: window.__pendingRects,
  }))

/**
 * A scene big enough that the export genuinely takes longer than the 100 ms threshold
 * on every engine here: 12 `raspberrypi.bplus` boards and 12 bolts, all Group bodies,
 * so the worker pays for 24 `combine()` calls as well as 24 repairs. Seeded, not
 * dragged — no drag can place 24 library parts, and the action under test is the
 * Export press, not the placement.
 *
 * @param {import('@playwright/test').Page} page
 */
async function seedBigScene(page) {
  await storeApi(page).run(async (api) => {
    for (let index = 0; index < 12; index += 1) {
      const at = [(index % 4) * 150, Math.floor(index / 4) * 150, 0]
      api.documentStore.append({ id: `pi${index}`, op: 'raspberrypi.bplus', name: `Board ${index + 1}`, params: {} })
      // `consumes` so the move absorbs the body it moved, leaving 24 bodies and not 48.
      // They have to be APART: 24 coincident solids would share every edge 24 ways, and
      // the closed-manifold check below would read that as 1,545 open edges.
      api.documentStore.append({
        id: `pit${index}`,
        op: 'transform.translate',
        name: `Board ${index + 1}`,
        target: `pi${index}`,
        consumes: [`pi${index}`],
        params: { vector: at },
      })
      api.documentStore.append({
        id: `bolt${index}`,
        op: 'hardware.bolt',
        name: `Bolt ${index + 1}`,
        params: { spec: 'm10 hex', length: 30 },
      })
      api.documentStore.append({
        id: `boltt${index}`,
        op: 'transform.translate',
        name: `Bolt ${index + 1}`,
        target: `bolt${index}`,
        consumes: [`bolt${index}`],
        params: { vector: [at[0] + 70, at[1], 0] },
      })
    }
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '24', { timeout: 60_000 })
}

test('the export really runs in a worker, and the file it writes is still closed', async ({ page }) => {
  // The point of the worker is that the main thread is free; the point of THIS test is
  // that the bytes did not change on the way there and back (`io-004`, `io-005`).
  await page.goto('/')
  await placeTwoCubes(page)
  await unionTheCubes(page)
  const [union] = await sceneBodies(page)

  await openExportPopover(page)
  const { name, bytes } = await pressExport(page)

  const usedWorker = await page.evaluate(async () => {
    const { workerAvailable } = await import('/src/core/exportClient.js')
    return workerAvailable()
  })
  expect(usedWorker, 'the worker answered — this is not silently the fallback path').toBe(true)

  expect(name).toBe('union-1.stl')
  const stats = meshStats(parseBinaryStl(bytes))
  expect(stats.unmatchedEdges, '0 open edges, through the worker').toBe(0)
  expect(Math.abs(stats.volume - union.volume) / union.volume).toBeLessThan(1e-4)
})

test('the pending state tracks how long the export ACTUALLY took, not how big the scene looks', async ({ page }) => {
  // The contract is a biconditional — the state appears if and only if the export ran
  // longer than the 100 ms threshold — so that is what is asserted, against the measured
  // duration of this very run rather than against an assumption about how fast this
  // machine is. Asserting a flat "a one-body export never shows it" looked right and was
  // wrong: under the full 8-way parallel matrix a one-body export really does cross
  // 100 ms sometimes, and the state appearing then is the feature working, not failing.
  //
  // The crisp threshold evidence lives where time can be controlled instead of measured:
  // `src/stores/exportDialog.spec.js` and `src/components/storage/ExportPopover.spec.js`
  // drive it with fake timers, and `bench/results/2026-09-21-perf-001.md` measured 0/5
  // appearances on a one-body scene against 5/5 on a 24-body one, unloaded.
  await page.goto('/')
  await placeTwoCubes(page)
  await unionTheCubes(page)
  await openExportPopover(page)
  await watchPendingState(page)

  const started = Date.now()
  const { name } = await pressExport(page)
  const elapsed = Date.now() - started
  expect(name).toBe('union-1.stl')

  const report = await pendingReport(page)
  if (elapsed < 80) {
    expect(report.seen, `export took ${elapsed} ms, comfortably under the threshold — no pending state`).toBe(0)
  } else if (elapsed > 200) {
    expect(report.seen, `export took ${elapsed} ms, well over the threshold — the pending state is owed`).toBeGreaterThan(0)
  }
  // Between 80 and 200 ms the answer depends on where inside the press the clock actually
  // started, so nothing is asserted rather than something flaky. Either way the state must
  // be GONE by the time the download lands.
  await expect(page.getByTestId('export-pending')).toHaveCount(0)
})

test('a slow export says so, names the file, and stays clear of everything else', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await page.goto('/')
  await seedBigScene(page)

  await openExportPopover(page)
  await expect(page.getByTestId('export-scope-scene')).toBeChecked()
  await watchPendingState(page)

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120_000 }),
    page.getByTestId('export-commit').click(),
  ])

  const report = await pendingReport(page)
  expect(report.seen, 'the pending state appeared while the file was being written').toBeGreaterThan(0)
  expect(report.text).toBe('Writing warpcad-scene.stl…')
  // It painted at a real size, inside the viewport, at every reference width.
  const viewport = page.viewportSize()
  for (const rect of report.rects) {
    expect(rect.width, 'pending line has width').toBeGreaterThan(0)
    expect(rect.height, 'pending line has height').toBeGreaterThan(0)
    expect(rect.x).toBeGreaterThanOrEqual(0)
    expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width + 0.5)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  // And the file that arrived is the real thing, not a placeholder.
  expect(download.suggestedFilename()).toBe('warpcad-scene.stl')
  const bytes = readFileSync(await download.path())
  expect(bytes.byteLength).toBeGreaterThan(100_000)
  expect(meshStats(parseBinaryStl(bytes)).unmatchedEdges, '0 open edges on a 24-body scene').toBe(0)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `pending-after-${testInfo.project.name}.png`) })
})

test('the pending state does not block a refusal: it still appears by name and nothing downloads', async ({ page }) => {
  // `ui-034`'s contract, re-run against the worker path: a refusal must cross the
  // boundary and land in the popover by name, with the popover still open.
  await page.goto('/')
  await storeApi(page).run(async (api) => {
    api.documentStore.append({ id: 'cube', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10] } })
    api.documentStore.append({
      id: 'big',
      op: 'primitive.cuboid',
      name: 'Big',
      params: { size: [40, 40, 40] },
    })
    // Subtracting a solid that swallows the cube leaves a body with no triangles.
    api.documentStore.append({ id: 'ghost', op: 'boolean.subtract', name: 'Ghost', target: 'cube', operands: ['big'], consumes: ['cube', 'big'] })
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  await openExportPopover(page)
  await watchPendingState(page)

  let downloaded = false
  page.on('download', () => {
    downloaded = true
  })
  await page.getByTestId('export-commit').click()

  const error = page.getByTestId('export-error')
  await expect(error).toBeVisible()
  await expect(error).toContainText('Ghost')
  await expect(page.getByTestId('export-popover')).toBeVisible()
  await expect(page.getByTestId('export-pending')).toHaveCount(0)
  expect(downloaded, 'no file for a refused export').toBe(false)
})
