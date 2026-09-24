import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import jscad from '@jscad/modeling'
import { test, expect } from '@playwright/test'

import { createDocument } from '../src/core/document.js'
import { combine, volumeOf } from '../src/core/kernel/group.js'

const { booleans } = jscad

/**
 * The Objects list (`TODO/ui-041`), driven against `/` — the running app.
 *
 * **Engines and viewports.** All three reference viewports, Chromium and WebKit (Firefox
 * fails at browser launch in this sandbox — `TROUBLESHOOTING.md` — and is not claimed).
 * The list itself is plain DOM, but this task also touched the render path (the x-ray
 * twin that makes a selected, enclosed body visible on the canvas — `three.js`'s
 * depth-function inversion is exactly the kind of thing engines disagree on), so the
 * canvas half is asserted on every engine rather than pinned to one.
 *
 * ## What is seeded, and why
 *
 * The enclosed fixture — a bolt standing entirely inside a 40 mm cube — is seeded through
 * the document store, exactly as `export-ui.e2e.js` and `ui-040`'s drive do. A drag-drop
 * *snaps* a placed body flush against its neighbour (`ui-013`), so no drag can put one
 * body inside another; overlapping is a hand step (Align + Snap). Seeding is confined to
 * building that scene. **Every action under test is a real click**: the toggle, the rows,
 * the checks, Subtract, the gizmo handle.
 *
 * ## What "reachable" means here, and how it is proved
 *
 * The task's whole claim is that a body no click can select becomes selectable. So the
 * spec first proves the premise (a grid of real canvas clicks over the shell selects the
 * shell and never the bolt), *then* selects the bolt from the list — otherwise a bolt that
 * happened to be pickable would pass this spec while proving nothing.
 *
 * Volume, not bounding box, decides the boolean (`ui-027`'s convention): a Subtract from a
 * fully enclosed operand leaves the shell's bounds unchanged by design, so bounds cannot
 * tell "cut a cavity" from "did nothing".
 */

/**
 * Real `PointerEvent`s on the canvas, the way every spec in this folder clicks a solid.
 *
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
      for (const type of ['pointerdown', 'pointerup']) {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 3,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            shiftKey: shift === true,
            clientX: box.left + box.width * fx,
            clientY: box.top + box.height * fy,
            bubbles: true,
            cancelable: true,
          }),
        )
      }
    },
    { fx, fy, shift: modifiers.shift },
  )
  await page.waitForTimeout(60)
}

/** @param {import('@playwright/test').Page} page */
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
      volumeMm3: Number(node.getAttribute('data-body-volume') ?? 'NaN'),
      bounds: node.getAttribute('data-body-bounds') ?? '',
      center: (node.getAttribute('data-body-center') ?? '').split(',').map(Number),
    })),
  )
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
async function bodyNamed(page, name) {
  const found = (await sceneBodies(page)).find((body) => body.name === name)
  if (!found) throw new Error(`no body named ${name} in the scene list`)
  return found
}

/**
 * The running app's own store modules, used only to build the scene and to read back.
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

/**
 * A 40 mm cube with a bolt standing **entirely** inside it (bolt bounds
 * -9.5,-8.23,8 .. 9.5,8.23,27.5 against the cube's -20,-20,0 .. 20,20,40), plus a sphere
 * well clear of both, so the list has an unrelated body to leave alone.
 *
 * @param {import('@playwright/test').Page} page
 */
async function seedEnclosed(page) {
  await storeApi(page).run((api) => {
    api.documentStore.append({
      id: 'shell',
      op: 'primitive.cuboid',
      name: 'Shell 1',
      params: { size: [40, 40, 40], center: [0, 0, 20] },
    })
    api.documentStore.append({
      id: 'bolt1',
      op: 'hardware.bolt',
      name: 'Bolt 1',
      params: { spec: 'm10 hex', length: 12 },
    })
    api.documentStore.append({
      id: 'bolt1t',
      op: 'transform.translate',
      name: 'Bolt 1',
      target: 'bolt1',
      consumes: ['bolt1'],
      params: { vector: [0, 0, 8] },
    })
    api.documentStore.append({
      id: 'ball',
      op: 'primitive.sphere',
      name: 'Sphere 1',
      params: { diameter: 20, center: [80, 0, 10] },
    })
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '3')
}

/** @param {import('@playwright/test').Page} page */
async function openObjects(page) {
  const panel = page.getByTestId('objects-panel')
  if (await panel.isVisible()) return
  await page.getByTestId('objects-toggle').click()
  await expect(panel).toBeVisible()
}

/** @param {import('@playwright/test').Page} page */
async function selectedIds(page) {
  return storeApi(page).run((api) => [...api.selection.ids])
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
      height: Math.round(box.height),
      width: Math.round(box.width),
      onScreen: box.left >= 0 && box.right <= window.innerWidth && box.top >= 0 && box.bottom <= window.innerHeight,
      topmostIsItem: top !== null && (el === top || el.contains(top) || top.contains(el)),
    }
  }, testId)
}

/**
 * Bounding rectangle of a test id, or `null` when it is not rendered.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 */
function rectOf(page, testId) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!el) return null
    const box = el.getBoundingClientRect()
    if (box.width === 0 && box.height === 0) return null
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom }
  }, testId)
}

/** @param {{ left: number, top: number, right: number, bottom: number }} a @param {typeof a} b */
function overlaps(a, b) {
  return a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
}

/**
 * Photograph the WebGL canvas alone (every overlay hidden) into page memory under `key`.
 *
 * Kept **in the page**, and only a count ever crosses back: shipping a 950x627 RGBA array
 * through the protocol takes seconds in WebKit and made a polling assertion time out on
 * the transfer rather than on the thing under test.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} key
 */
async function snapshotCanvas(page, key) {
  const handle = await page.addStyleTag({
    content: '[data-testid=viewport] > :not(canvas){visibility:hidden !important}',
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

/**
 * How many pixels differ visibly between two stored snapshots. This is the measurement
 * behind the enclosed-body feedback claim: before the x-ray twin, selecting an enclosed
 * bolt changed **0** canvas pixels.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} a
 * @param {string} b
 * @returns {Promise<number>}
 */
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

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'objects-panel-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
})

test('the Objects toggle is in the header cluster and the header still fits (Undo, Redo, Objects, History, File, chip)', async ({
  page,
}) => {
  // Reachability, per CLAUDE.md: mounted in the root view's header, not only registered.
  const toggle = page.getByTestId('objects-toggle')
  await expect(toggle).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')

  const ids = ['undo-button', 'redo-button', 'objects-toggle', 'timeline-toggle', 'file-menu-button', 'save-status']
  const rects = /** @type {Record<string, NonNullable<Awaited<ReturnType<typeof rectOf>>>>} */ ({})
  for (const id of ids) {
    const rect = await rectOf(page, id)
    expect(rect, `${id} must be rendered`).not.toBeNull()
    rects[id] = /** @type {any} */ (rect)
  }

  // No two header controls overlap, and none is pushed off-screen.
  for (const a of ids) {
    for (const b of ids) {
      if (a >= b) continue
      expect(overlaps(rects[a], rects[b]), `${a} overlaps ${b}`).toBe(false)
    }
    expect(rects[a].left, `${a} off the left edge`).toBeGreaterThanOrEqual(0)
    expect(rects[a].right, `${a} off the right edge`).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0)
  }
  // Tap-target size, every width.
  expect(rects['objects-toggle'].bottom - rects['objects-toggle'].top).toBeGreaterThanOrEqual(44)
  expect(rects['objects-toggle'].right - rects['objects-toggle'].left).toBeGreaterThanOrEqual(44)
  // The title is not squeezed off by the extra control.
  const title = await page.locator('.app__title').boundingBox()
  expect(title).not.toBeNull()
  expect(/** @type {any} */ (title).x + /** @type {any} */ (title).width).toBeLessThanOrEqual(rects['undo-button'].left)

  // Never any horizontal scroll of primary UI.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  // A trial click: the topmost element at the toggle's centre is the toggle.
  expect((await isReachable(page, 'objects-toggle')).topmostIsItem).toBe(true)
})

test('an empty document says so, and names the way out', async ({ page }) => {
  await openObjects(page)
  await expect(page.getByTestId('objects-empty')).toContainText('drag a shape in from the Library')
  await expect(page.getByTestId('objects-count')).toHaveText('0 objects')
})

test('a body fully inside another cannot be clicked — and the list selects it: Inspector, gizmo and canvas all show it', async ({
  page,
}) => {
  await seedEnclosed(page)
  const shell = await bodyNamed(page, 'Shell 1')
  const bolt = await bodyNamed(page, 'Bolt 1')
  await openObjects(page)
  await expect(page.getByTestId('objects-rows').getByTestId('objects-row-name')).toHaveText(['Shell 1', 'Bolt 1', 'Sphere 1'])

  // --- The premise, proved rather than assumed: no click reaches the bolt. -------------
  // The scene is framed on load, so the cube sits near the middle of the canvas. A grid of
  // real clicks across (and beyond) its silhouette selects the shell or nothing, never the
  // bolt — the same 121-point probe `ui-040`'s drive ran by hand.
  const seen = new Set()
  for (let row = 0; row < 11; row += 1) {
    for (let col = 0; col < 11; col += 1) {
      await clickViewportAt(page, 0.36 + col * 0.028, 0.14 + row * 0.05)
      const id = await page.getByTestId('viewport').getAttribute('data-selected-id')
      if (id) seen.add(id)
    }
  }
  expect(seen.has(shell.id), 'the probe must have found the shell, or it proved nothing').toBe(true)
  expect(seen.has(bolt.id), 'the bolt must be unpickable by any click').toBe(false)
  await storeApi(page).run((api) => api.selection.clear())
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')

  // --- Selecting it from the list, with the canvas measured either side. ---------------
  await snapshotCanvas(page, 'before')
  await page.getByTestId(`objects-row-${bolt.id}`).click()

  // Ordinary selection contract, identical to a clicked body:
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', bolt.id)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  // (1) The scene list's own marker — the base of the selection.
  await expect(page.getByTestId(`scene-body-${bolt.id}`)).toHaveAttribute('data-selection-role', 'base')
  // (2) The list row says so, in words and in ARIA.
  await expect(page.getByTestId(`objects-item-${bolt.id}`)).toHaveAttribute('data-selected', 'true')
  await expect(page.getByTestId(`objects-row-${bolt.id}`)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('objects-count')).toHaveText('3 objects · 1 selected')
  // (3) The Inspector. At phone width it declines to auto-open over the Objects sheet and
  // its collapsed tab carries the name instead — the established three-panel arbitration.
  await expect(page.getByTestId('inspector')).toContainText('Bolt 1')
  // (4) The gizmo — a DOM/SVG overlay, so the shell in front of the bolt cannot occlude it.
  await expect(page.getByTestId('transform-gizmo')).toBeVisible()
  await expect(page.locator('[data-testid^="gizmo-grab-arm-"]').first()).toBeAttached()

  // (5) THE TRAP the task file did not mention, measured: the canvas highlight is a
  // material swap, and an enclosed body is hidden at every pixel, so before the x-ray twin
  // this changed **0** pixels. Now the hidden bolt shows through the shell as a tint.
  await expect
    .poll(
      async () => {
        await snapshotCanvas(page, 'after')
        return changedPixels(page, 'before', 'after')
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(200)

  // Deselecting takes the tint away again: the canvas returns to what it was (bar
  // anti-aliasing), so it is a selection cue and not a permanent change.
  await storeApi(page).run((api) => api.selection.clear())
  await expect
    .poll(
      async () => {
        await snapshotCanvas(page, 'after')
        return changedPixels(page, 'before', 'after')
      },
      { timeout: 15_000 },
    )
    .toBeLessThan(40)
})

test('the enclosed body is drivable: a gizmo drag moves it, with the shell in front of it', async ({
  page,
}) => {
  await seedEnclosed(page)
  const bolt = await bodyNamed(page, 'Bolt 1')
  await openObjects(page)
  await page.getByTestId(`objects-row-${bolt.id}`).click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', bolt.id)

  // The gizmo's hit targets are SVG overlays above the canvas, so what is in front of the
  // bolt in 3D is irrelevant to them. Trial-click first: the topmost element at the handle
  // must be the handle, or the drag below could pass by grabbing the canvas.
  const handle = page.getByTestId('gizmo-grab-arm-x')
  await expect(handle).toBeAttached()
  const box = await handle.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('data-testid') ?? '', box)
  expect(top).toMatch(/^gizmo-/)

  const startX = (await bodyNamed(page, 'Bolt 1')).center[0]
  await page.mouse.move(box.x, box.y)
  await page.mouse.down()
  for (let step = 1; step <= 8; step += 1) await page.mouse.move(box.x + step * 6, box.y + step * 2)
  await page.mouse.up()
  await expect
    .poll(async () => Math.abs((await bodyNamed(page, 'Bolt 1')).center[0] - startX))
    .toBeGreaterThan(0.5)
  // Still one bolt, still the same body: a move, not a duplicate.
  expect((await sceneBodies(page)).filter((body) => body.name === 'Bolt 1')).toHaveLength(1)
})

test('two bodies selected purely from the list, then Subtract: a real cavity, measured by volume, nothing moved', async ({
  page,
}) => {
  await seedEnclosed(page)
  const shell = await bodyNamed(page, 'Shell 1')
  const bolt = await bodyNamed(page, 'Bolt 1')
  await openObjects(page)
  // A sentinel that only survives if nothing reloaded the page.
  await page.evaluate(() => {
    window.__notReloaded = true
  })

  // The base first: Subtract removes every LATER selection from the FIRST.
  await page.getByTestId(`objects-row-${shell.id}`).click()
  await expect(page.getByTestId('operations-count')).toContainText('1 selected')
  await expect(page.getByTestId('operation-subtract')).toBeDisabled()

  // A touch screen has no Shift key: the check is the additive route.
  await page.getByTestId(`objects-check-${bolt.id}`).click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await expect(page.getByTestId('operations-count')).toContainText('2 selected')
  await expect(page.getByTestId('operation-subtract')).toBeEnabled()
  // Order is visible in the list itself, and follows the click order.
  await expect(page.getByTestId(`objects-check-${shell.id}`)).toHaveText('1')
  await expect(page.getByTestId(`objects-check-${bolt.id}`)).toHaveText('2')
  await expect(page.getByTestId(`objects-item-${bolt.id}`)).toHaveAttribute('data-role', 'secondary')
  expect(await selectedIds(page)).toEqual([shell.id, bolt.id])

  await page.getByTestId('operation-subtract').click()

  // One body where there were two, and the sphere untouched.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  const after = await sceneBodies(page)
  const result = after.find((body) => body.name !== 'Sphere 1')
  expect(result, 'the subtract result').toBeDefined()
  // The cavity, by volume — the kernel's own numbers off the running app, not a bounding
  // box (which a fully enclosed cut leaves untouched by construction).
  expect(shell.volumeMm3).toBeCloseTo(64000, 1)
  expect(bolt.volumeMm3).toBeGreaterThan(1000)
  expect(/** @type {any} */ (result).volumeMm3).toBeCloseTo(shell.volumeMm3 - bolt.volumeMm3, 1)
  expect(/** @type {any} */ (result).volumeMm3).toBeLessThan(shell.volumeMm3 - 1000)
  // The shell did not move, and nothing was hidden: same bounds as before.
  expect(/** @type {any} */ (result).bounds).toBe(shell.bounds)
  const sphere = after.find((body) => body.name === 'Sphere 1')
  expect(sphere?.volumeMm3).toBeGreaterThan(4000)

  // The list followed the document live: the bolt's row is gone, the result has one.
  await expect(page.getByTestId('objects-count')).toContainText('2 objects')
  await expect(page.getByTestId(`objects-row-${bolt.id}`)).toHaveCount(0)
  expect(await page.evaluate(() => window.__notReloaded)).toBe(true)

  // Undo brings the bolt back, and its row with it.
  await page.getByTestId('undo-button').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '3')
  await expect(page.getByTestId(`objects-row-${bolt.id}`)).toBeVisible()
  const restored = await bodyNamed(page, 'Bolt 1')
  expect(restored.volumeMm3).toBeCloseTo(bolt.volumeMm3, 3)
})

test('list and viewport selections compose: a click, a check, and a Shift-click all edit one selection', async ({
  page,
}) => {
  await seedEnclosed(page)
  const shell = await bodyNamed(page, 'Shell 1')
  const bolt = await bodyNamed(page, 'Bolt 1')
  await openObjects(page)

  // The shell is on top, so a real viewport click can reach it: find a point that does.
  let hit = false
  for (let row = 0; row < 11 && !hit; row += 1) {
    for (let col = 0; col < 11 && !hit; col += 1) {
      await clickViewportAt(page, 0.36 + col * 0.028, 0.14 + row * 0.05)
      hit = (await page.getByTestId('viewport').getAttribute('data-selected-id')) === shell.id
    }
  }
  expect(hit, 'a viewport click should reach the enclosing shell').toBe(true)
  await expect(page.getByTestId(`objects-item-${shell.id}`)).toHaveAttribute('data-selected', 'true')

  // The list adds the enclosed bolt to the viewport's selection...
  await page.getByTestId(`objects-check-${bolt.id}`).click()
  expect(await selectedIds(page)).toEqual([shell.id, bolt.id])
  await expect(page.getByTestId('operations-count')).toContainText('2 selected')

  // ...and a plain row click replaces the lot.
  await page.getByTestId(`objects-row-${bolt.id}`).click()
  expect(await selectedIds(page)).toEqual([bolt.id])

  // Clicking empty canvas clears it, the list clearing with it.
  await clickViewportAt(page, 0.05, 0.05)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')
  await expect(page.getByTestId(`objects-item-${bolt.id}`)).toHaveAttribute('data-selected', 'false')
})

test('the Objects list and History share one slot: opening either closes the other, and neither selects the other\'s thing', async ({
  page,
}) => {
  await seedEnclosed(page)
  const bolt = await bodyNamed(page, 'Bolt 1')
  await openObjects(page)
  await page.getByTestId(`objects-row-${bolt.id}`).click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', bolt.id)

  // Opening History closes Objects (one slot — phone has room for exactly one sheet).
  await page.getByTestId('timeline-toggle').click()
  await expect(page.getByTestId('timeline-panel')).toBeVisible()
  await expect(page.getByTestId('objects-panel')).toHaveCount(0)
  await expect(page.getByTestId('objects-toggle')).toHaveAttribute('aria-pressed', 'false')
  // §13: a History row is a step, never a body. Selecting one does not select the bolt
  // (previewing a past step also clears the body selection, §14), and the bolt's body
  // selection did not select any row while it was made.
  await page.getByTestId('timeline-row-2').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-previewing', 'true')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')

  // Opening Objects closes History and ends any preview — back to the live scene.
  await page.getByTestId('objects-toggle').click()
  await expect(page.getByTestId('objects-panel')).toBeVisible()
  await expect(page.getByTestId('timeline-panel')).toHaveCount(0)
  await expect(page.getByTestId('timeline-toggle')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-previewing', 'false')

  // Distinguishable at a glance: different heading, and rows that name bodies, not steps.
  await expect(page.getByTestId('objects-panel')).toContainText('Objects')
  await expect(page.getByTestId('objects-panel')).toContainText('Selects bodies')
  await expect(page.locator('[data-testid^="timeline-row-"]')).toHaveCount(0)
})

test('History previewing a past state cannot leave the list live: Objects opens onto the live scene, selecting works', async ({
  page,
}) => {
  await seedEnclosed(page)
  await page.getByTestId('timeline-toggle').click()
  await page.getByTestId('timeline-row-1').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-previewing', 'true')

  // Objects and History are exclusive, so the read-only-in-preview state is unreachable
  // by the UI — and the safe thing has to happen instead of a stale, silently-live list.
  await page.getByTestId('objects-toggle').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-previewing', 'false')
  await expect(page.getByTestId('objects-disabled-reason')).toHaveCount(0)
  await expect(page.getByTestId('objects-rows').getByTestId('objects-row-name')).toHaveCount(3)
})

test('the list is not text entry: with focus on a check, Ctrl/Cmd+Z still undoes', async ({ page }) => {
  await seedEnclosed(page)
  const shell = await bodyNamed(page, 'Shell 1')
  await openObjects(page)
  await page.getByTestId(`objects-check-${shell.id}`).click()
  // Safari does not focus a button on click (a browser rule, not ours), so focus it the
  // way a keyboard user would arrive there.
  await page.getByTestId(`objects-check-${shell.id}`).focus()
  await expect(page.getByTestId(`objects-check-${shell.id}`)).toBeFocused()
  await page.keyboard.press('ControlOrMeta+z')
  // The seed's last record (the sphere) is undone.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
})

test('a rolled-back step leaves the list, and the list says why a body is missing', async ({ page }) => {
  await seedEnclosed(page)
  await page.getByTestId('timeline-toggle').click()
  await page.getByTestId('timeline-row-1').click()
  await page.getByTestId('timeline-rollback').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  await page.getByTestId('objects-toggle').click()
  await expect(page.getByTestId('objects-rows').getByTestId('objects-row-name')).toHaveText(['Shell 1'])
  await expect(page.getByTestId('objects-absent-note')).toContainText('3 suppressed or rolled-back steps')
})

test('layout: the panel clears the Inspector tab, the Library tab, the nav chrome and the Operations toolbar', async ({
  page,
}, testInfo) => {
  await seedEnclosed(page)
  const shell = await bodyNamed(page, 'Shell 1')
  const bolt = await bodyNamed(page, 'Bolt 1')
  await openObjects(page)
  await page.getByTestId(`objects-row-${shell.id}`).click()
  await page.getByTestId(`objects-check-${bolt.id}`).click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await page.waitForTimeout(250)

  // Every control the panel offers is on screen and the topmost thing at its centre — the
  // measurement a screenshot cannot make, and the class of bug (a tab silently swallowing a
  // tap on the last row) that a green suite has missed on every recent UI task.
  const rowIds = (await sceneBodies(page)).map((body) => body.id)
  for (const id of rowIds) {
    for (const testId of [`objects-row-${id}`, `objects-check-${id}`]) {
      const reach = await isReachable(page, testId)
      expect(reach.found, testId).toBe(true)
      expect(reach.onScreen, `${testId} on screen`).toBe(true)
      expect(reach.topmostIsItem, `${testId} is covered by something`).toBe(true)
      expect(reach.height, `${testId} tap-target height`).toBeGreaterThanOrEqual(44)
    }
  }
  expect((await isReachable(page, 'objects-close')).topmostIsItem).toBe(true)

  // No two of the overlay surfaces overlap.
  const surfaces = ['objects-panel', 'operations-toolbar', 'navigation-chrome', 'inspector-tab', 'library-tab']
  /** @type {Record<string, any>} */
  const rects = {}
  for (const id of surfaces) rects[id] = await rectOf(page, id)
  for (const a of surfaces) {
    for (const b of surfaces) {
      if (a >= b || !rects[a] || !rects[b]) continue
      // The Inspector / Library tabs are laid out *under* the sheet's offset on purpose; the
      // sheet itself is what must clear them.
      expect(overlaps(rects[a], rects[b]), `${a} overlaps ${b}`).toBe(false)
    }
  }
  // Operating the toolbar still works with the panel up: Subtract is genuinely clickable.
  expect((await isReachable(page, 'operation-subtract')).topmostIsItem).toBe(true)
  if (testInfo.project.name.endsWith('phone')) {
    // At phone width the panel is a sheet, so it must leave the viewport a usable window.
    const panel = rects['objects-panel']
    expect(panel.bottom - panel.top).toBeLessThan((page.viewportSize()?.height ?? 0) * 0.45)
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  // A snapshot per project, as CLAUDE.md asks of a layout spec — written to the git-ignored
  // `test-results/`, the same convention `export-ui.e2e.js` follows, and a picture for a
  // human to look at, not a baseline to diff against.
  await page.screenshot({ path: join(SNAPSHOT_DIR, `objects-panel-${testInfo.project.name}.png`) })
})

test('phone: the Library sheet, Objects and History never stack — opening one claims the slot from the others', async ({
  page,
}, testInfo) => {
  // Found by hand-driving at 390px: with a panel open, tapping the Library tab put its
  // sheet BEHIND the panel, so both were half-visible over each other. Phone-only — at
  // ≥641px the Library is a column and there is no sheet to stack.
  test.skip(!testInfo.project.name.endsWith('phone'), 'the shared sheet slot only exists at phone width')
  await seedEnclosed(page)
  const visible = (id) => page.getByTestId(id).isVisible().catch(() => false)

  await openObjects(page)
  await page.getByTestId('library-tab').click()
  await expect(page.getByTestId('library-rows')).toBeVisible()
  expect(await visible('objects-panel')).toBe(false)

  // ...and the other way round: Objects opening collapses the Library.
  await page.getByTestId('objects-toggle').click()
  await expect(page.getByTestId('objects-panel')).toBeVisible()
  expect(await visible('library-rows')).toBe(false)

  // Selecting from the list does not pop the Inspector over it (it declines while the slot
  // is claimed), but its collapsed tab carries the name; tapping that tab claims the slot.
  const shell = await bodyNamed(page, 'Shell 1')
  await page.getByTestId(`objects-row-${shell.id}`).click()
  await expect(page.getByTestId('inspector-tab')).toContainText('Shell 1')
  await page.getByTestId('inspector-tab').click()
  await expect(page.getByTestId('objects-panel')).toHaveCount(0)
  await expect(page.getByTestId('inspector-name')).toHaveText('Shell 1')

  // History and the Library: the same claim.
  await page.getByTestId('timeline-toggle').click()
  await expect(page.getByTestId('timeline-panel')).toBeVisible()
  await page.getByTestId('library-tab').click()
  await expect(page.getByTestId('library-rows')).toBeVisible()
  expect(await visible('timeline-panel')).toBe(false)
})


/* ------------------------------------------------------------------------------------ *
 * TODO/ui-042 — expandable part rows: a Raspberry Pi's `ethernet` jack, addressed from the
 * Objects list while the Pi is entirely inside a case.
 *
 * Engines/viewports: all three reference viewports, Chromium and WebKit (Firefox does not
 * launch in this sandbox — TROUBLESHOOTING.md). The Pi is seeded through the document store
 * for the same reason the bolt is above: a drag-drop snaps flush, so no drag can put one body
 * inside another. Every action under test is a real click.
 * ------------------------------------------------------------------------------------ */

/**
 * The expected numbers, computed **independently of the app**: the kernel's own geometry,
 * booleaned directly with `@jscad/modeling`, never through `boolean.subtract`'s registry
 * entry or the toolbar. A 100 x 70 x 40 case with a Raspberry Pi B+ wholly inside it.
 */
function enclosedPiKernel() {
  const doc = createDocument()
  doc.append(
    { id: 'shell', op: 'primitive.cuboid', name: 'Shell 1', params: { size: [100, 70, 40], center: [42, 27, 10] } },
    { origin: 'local' },
  )
  doc.append({ id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi B+', params: {} }, { origin: 'local' })
  const [shell, pi] = doc.bodies()
  const group = /** @type {any} */ (pi.geometry)
  const shellGeometry = /** @type {any} */ (shell.geometry)
  return {
    shellVolume: volumeOf(shellGeometry),
    piVolume: volumeOf(group),
    ethernetVolume: volumeOf(group.parts.ethernet),
    /** Case minus the ethernet jack alone. */
    shellMinusEthernet: volumeOf(booleans.subtract(shellGeometry, group.parts.ethernet)),
    /** Case minus the whole board. */
    shellMinusPi: volumeOf(booleans.subtract(shellGeometry, combine(group))),
    partCount: group.names.length + Object.keys(group.parts).filter((name) => !group.names.includes(name)).length,
    hiddenCount: Object.keys(group.parts).filter((name) => !group.names.includes(name)).length,
  }
}

/** @param {import('@playwright/test').Page} page */
async function seedEnclosedPi(page) {
  await storeApi(page).run((api) => {
    api.documentStore.append({
      id: 'shell',
      op: 'primitive.cuboid',
      name: 'Shell 1',
      params: { size: [100, 70, 40], center: [42, 27, 10] },
    })
    api.documentStore.append({ id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi B+', params: {} })
    api.documentStore.append({
      id: 'ball',
      op: 'primitive.sphere',
      name: 'Sphere 1',
      params: { diameter: 20, center: [200, 0, 10] },
    })
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '3')
}

/** @param {import('@playwright/test').Page} page */
function subPartOf(page) {
  return storeApi(page).run((api) => api.selection.subPart)
}

/**
 * Scroll a list item into view *within the sheet* and report whether the topmost element at
 * its centre is the item itself — the trial click.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 */
async function scrolledReachable(page, testId) {
  await page.getByTestId(testId).scrollIntoViewIfNeeded()
  return isReachable(page, testId)
}

test('an enclosed Raspberry Pi: expand it, address `ethernet`, add the case FIRST, Subtract — a jack-sized opening, measured against the kernel', async ({
  page,
}, testInfo) => {
  const kernel = enclosedPiKernel()
  await seedEnclosedPi(page)
  const wide = (page.viewportSize()?.width ?? 0) > 640
  await page.evaluate(() => {
    window.__notReloaded = true
  })

  // The premise, proved rather than assumed: a grid of real canvas clicks over the case
  // selects the case and never the board — the Pi cannot be clicked, from here.
  const picked = new Set()
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      await clickViewportAt(page, 0.3 + col * 0.05, 0.16 + row * 0.06)
      const id = await page.getByTestId('viewport').getAttribute('data-selected-id')
      if (id) picked.add(id)
    }
  }
  expect(picked.has('pi'), 'no click should ever reach the enclosed Pi').toBe(false)
  expect(picked.has('shell'), 'sanity: the case itself is clickable').toBe(true)
  await clickViewportAt(page, 0.02, 0.02)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')

  await openObjects(page)
  // Only the composite has a disclosure chevron.
  await expect(page.getByTestId('objects-expand-pi')).toBeVisible()
  await expect(page.getByTestId('objects-expand-shell')).toHaveCount(0)
  await expect(page.getByTestId('objects-expand-ball')).toHaveCount(0)
  await expect(page.getByTestId('objects-expand-pi')).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('objects-part-pi-ethernet')).toHaveCount(0)

  await page.getByTestId('objects-expand-pi').click()
  await expect(page.getByTestId('objects-expand-pi')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('objects-part-pi-ethernet')).toBeVisible()
  // Expanding is not selecting.
  expect(await selectedIds(page)).toEqual([])
  // Every part the kernel says the Pi has is listed — visible and hidden — once each.
  const partItems = await page.$$eval('[data-testid^="objects-part-item-pi-"]', (nodes) =>
    nodes.map((node) => ({ hidden: node.getAttribute('data-hidden') })),
  )
  expect(partItems).toHaveLength(kernel.partCount)
  expect(partItems.filter((item) => item.hidden === 'true')).toHaveLength(kernel.hiddenCount)
  // Hidden parts are labelled as hidden, visible ones are not.
  await expect(page.getByTestId('objects-part-hidden-pi-usb1-body')).toHaveText('hidden')
  await expect(page.getByTestId('objects-part-hidden-pi-ethernet')).toHaveCount(0)

  // Human order, part-first, because that is what the task file's own flow suggests: tap
  // `ethernet`, then add the case. It gives the WRONG boolean, and the list says so.
  await page.getByTestId('objects-part-pi-ethernet').click()
  expect(await selectedIds(page)).toEqual(['pi'])
  expect(await subPartOf(page)).toEqual({ bodyId: 'pi', partName: 'ethernet' })
  await expect(page.getByTestId('objects-part-item-pi-ethernet')).toHaveAttribute('data-selected', 'true')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  await expect(page.getByTestId('operation-subtract')).toBeDisabled() // one operand
  await page.getByTestId('objects-check-shell').click()
  expect(await selectedIds(page)).toEqual(['pi', 'shell'])
  await expect(page.getByTestId('objects-check-pi')).toHaveText('1') // the Pi is the BASE
  await expect(page.getByTestId('objects-check-shell')).toHaveText('2')
  await expect(page.getByTestId('operation-subtract')).toHaveAttribute(
    'title',
    /Raspberry Pi B\+ › ethernet then Shell 1/,
  )
  if (wide) {
    await expect(page.getByTestId('operation-operand-base')).toHaveText('Raspberry Pi B+ › ethernet')
    await expect(page.getByTestId('operation-operand-rest')).toHaveText('Shell 1')
  }

  // The natural order: the case's row (a plain tap replaces the selection and drops the
  // depth), then the jack's check. The case is the base; the jack is subtracted from it.
  await page.getByTestId('objects-row-shell').click()
  expect(await selectedIds(page)).toEqual(['shell'])
  expect(await subPartOf(page)).toBeNull()
  await page.getByTestId('objects-part-check-pi-ethernet').click()
  expect(await selectedIds(page)).toEqual(['shell', 'pi'])
  expect(await subPartOf(page)).toEqual({ bodyId: 'pi', partName: 'ethernet' })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await expect(page.getByTestId('objects-check-shell')).toHaveText('1')
  await expect(page.getByTestId('objects-check-pi')).toHaveText('2')
  await expect(page.getByTestId('objects-part-check-pi-ethernet')).toHaveText('2')
  await expect(page.getByTestId('objects-drilled-pi')).toHaveText('› ethernet')
  await expect(page.getByTestId('operations-count')).toContainText('2 selected')
  await expect(page.getByTestId('operation-subtract')).toBeEnabled()
  await expect(page.getByTestId('operation-subtract')).toHaveAttribute(
    'title',
    /Shell 1 then Raspberry Pi B\+ › ethernet/,
  )
  if (wide) {
    await expect(page.getByTestId('operation-operand-base')).toHaveText('Shell 1')
    await expect(page.getByTestId('operation-operand-rest')).toHaveText('Raspberry Pi B+ › ethernet')
  }
  // Collapsing the parts leaves the address on the parent row: it is never invisible.
  await page.getByTestId('objects-expand-pi').click()
  await expect(page.getByTestId('objects-part-pi-ethernet')).toHaveCount(0)
  await expect(page.getByTestId('objects-drilled-pi')).toHaveText('› ethernet')

  const before = await sceneBodies(page)
  const shellBefore = before.find((body) => body.name === 'Shell 1')
  const piBefore = before.find((body) => body.name === 'Raspberry Pi B+')
  // The app's own measurements agree with the kernel's before anything is cut.
  expect(shellBefore?.volumeMm3).toBeCloseTo(kernel.shellVolume, 2)
  expect(piBefore?.volumeMm3).toBeCloseTo(kernel.piVolume, 2)

  await page.getByTestId('operation-subtract').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  const after = await sceneBodies(page)
  const result = after.find((body) => body.name !== 'Sphere 1')
  expect(result, 'the subtract result').toBeDefined()
  const measured = /** @type {any} */ (result).volumeMm3
  // Cut with the ethernet jack ONLY: exactly the kernel's `shell - ethernet`...
  expect(measured).toBeCloseTo(kernel.shellMinusEthernet, 1)
  expect(kernel.shellVolume - measured).toBeCloseTo(kernel.ethernetVolume, 1)
  // ...and provably not the whole-board cut, which removes far more.
  expect(kernel.shellVolume - kernel.shellMinusPi).toBeGreaterThan(kernel.ethernetVolume * 1.5)
  expect(Math.abs(measured - kernel.shellMinusPi)).toBeGreaterThan(1000)
  // Nothing moved, nothing reloaded.
  expect(/** @type {any} */ (result).bounds).toBe(shellBefore?.bounds)
  expect(await page.evaluate(() => window.__notReloaded)).toBe(true)
  console.log(
    `[ui-042 ${testInfo.project.name}] shell ${kernel.shellVolume.toFixed(3)} - ethernet ${kernel.ethernetVolume.toFixed(3)} = ${measured.toFixed(3)} (kernel ${kernel.shellMinusEthernet.toFixed(3)}); whole-board cut would be ${kernel.shellMinusPi.toFixed(3)}`,
  )

  // Undo restores both, and the list's row for the Pi returns collapsed (it left the scene).
  await page.getByTestId('undo-button').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '3')
  await expect(page.getByTestId('objects-expand-pi')).toHaveAttribute('aria-expanded', 'false')
})

test('re-targeting and stepping back up: the list and the viewport agree about a pick depth', async ({ page }) => {
  await seedEnclosedPi(page)
  const wide = (page.viewportSize()?.width ?? 0) > 640
  await openObjects(page)
  await page.getByTestId('objects-expand-pi').click()

  await page.getByTestId('objects-part-pi-ethernet').click()
  expect(await subPartOf(page)).toEqual({ bodyId: 'pi', partName: 'ethernet' })
  if (wide) await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('ethernet')

  // A sibling: straight there, no step up first — as a second viewport click on a sibling.
  await page.getByTestId('objects-part-pi-hdmi').click()
  expect(await subPartOf(page)).toEqual({ bodyId: 'pi', partName: 'hdmi' })
  await expect(page.getByTestId('objects-part-item-pi-ethernet')).toHaveAttribute('data-selected', 'false')
  await expect(page.getByTestId('objects-part-item-pi-hdmi')).toHaveAttribute('data-selected', 'true')
  if (wide) await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('hdmi')

  // The same part again: stays drilled (a repeat viewport click does not step back up).
  await page.getByTestId('objects-part-pi-hdmi').click()
  expect(await subPartOf(page)).toEqual({ bodyId: 'pi', partName: 'hdmi' })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')

  // A hidden part is addressable too, and depth is never a second body.
  await page.getByTestId('objects-part-pi-usb1-body').scrollIntoViewIfNeeded()
  await page.getByTestId('objects-part-pi-usb1-body').click()
  expect(await subPartOf(page)).toEqual({ bodyId: 'pi', partName: 'usb1-body' })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')

  // The parent row steps back up to the whole body — the breadcrumb's "group" segment.
  await page.getByTestId('objects-row-pi').click()
  expect(await subPartOf(page)).toBeNull()
  expect(await selectedIds(page)).toEqual(['pi'])
  await expect(page.getByTestId('objects-drilled-pi')).toHaveCount(0)
  if (wide) await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveCount(0)

  // Empty canvas clears it all, the list included.
  await clickViewportAt(page, 0.02, 0.02)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')
  await expect(page.getByTestId('objects-part-item-pi-usb1-body')).toHaveAttribute('data-selected', 'false')
})

test('a second viewport click still drills (ui-016), and the collapsed list row names the part it reached', async ({
  page,
}) => {
  // Not enclosed: a Pi on its own, so real clicks can reach it — the viewport route this
  // task must leave intact, and the list following it.
  await storeApi(page).run((api) => {
    api.documentStore.append({ id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi B+', params: {} })
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await openObjects(page)

  let hit = false
  for (let row = 0; row < 12 && !hit; row += 1) {
    for (let col = 0; col < 12 && !hit; col += 1) {
      await clickViewportAt(page, 0.3 + col * 0.03, 0.2 + row * 0.04)
      hit = (await page.getByTestId('viewport').getAttribute('data-selected-id')) === 'pi'
      if (hit) {
        // Same point again: the second click drills into the part under it.
        await clickViewportAt(page, 0.3 + col * 0.03, 0.2 + row * 0.04)
      }
    }
  }
  expect(hit, 'a click should reach the Pi').toBe(true)
  const depth = await subPartOf(page)
  expect(depth?.bodyId).toBe('pi')
  expect(typeof depth?.partName).toBe('string')
  // The list follows the viewport: the parent row names the drilled part while collapsed...
  await expect(page.getByTestId('objects-drilled-pi')).toHaveText(`› ${depth?.partName}`)
  // ...and expanding it shows exactly that child row filled.
  await page.getByTestId('objects-expand-pi').click()
  await expect(page.getByTestId(`objects-part-item-pi-${depth?.partName}`)).toHaveAttribute('data-selected', 'true')
  await expect(page.locator('[data-testid^="objects-part-item-pi-"][data-selected="true"]')).toHaveCount(1)
})

test('phone-first layout with a fully expanded Pi: chevrons and child rows are 44px, reachable, and the sheet scrolls', async ({
  page,
}, testInfo) => {
  const kernel = enclosedPiKernel()
  await seedEnclosedPi(page)
  await openObjects(page)
  await page.getByTestId('objects-expand-pi').click()
  await page.getByTestId('objects-row-shell').click()
  await page.getByTestId('objects-part-check-pi-ethernet').click()
  await page.waitForTimeout(250)

  // The row list stays usable with every part showing: it is a scrolling region, and the
  // whole Pi (`partCount` child rows at 44px each) does not fit in the sheet — it scrolls.
  const scroll = await page.evaluate(() => {
    const list = document.querySelector('[data-testid="objects-rows"]')
    if (!list) return null
    return { client: list.clientHeight, scroll: list.scrollHeight }
  })
  expect(scroll).not.toBeNull()
  expect(/** @type {any} */ (scroll).scroll).toBeGreaterThan(/** @type {any} */ (scroll).client)

  // Every control on the first screenful, then the last row after scrolling, trial-clicked.
  for (const testId of [
    'objects-row-shell',
    'objects-check-shell',
    'objects-row-pi',
    'objects-check-pi',
    'objects-expand-pi',
    'objects-part-pi-ethernet',
    'objects-part-check-pi-ethernet',
    'objects-part-pi-hdmi',
    'objects-part-check-pi-hdmi',
    'objects-part-pi-hole4',
    'objects-part-check-pi-hole4',
    'objects-row-ball',
    'objects-check-ball',
  ]) {
    const reach = await scrolledReachable(page, testId)
    expect(reach.found, testId).toBe(true)
    expect(reach.onScreen, `${testId} on screen`).toBe(true)
    expect(reach.topmostIsItem, `${testId} is covered by something`).toBe(true)
    expect(reach.height, `${testId} tap-target height`).toBeGreaterThanOrEqual(44)
  }
  // The chevron is a 44 x 44 target.
  await page.getByTestId('objects-expand-pi').scrollIntoViewIfNeeded()
  const chevron = await rectOf(page, 'objects-expand-pi')
  expect(/** @type {any} */ (chevron).right - /** @type {any} */ (chevron).left).toBeGreaterThanOrEqual(44)
  expect(/** @type {any} */ (chevron).bottom - /** @type {any} */ (chevron).top).toBeGreaterThanOrEqual(44)

  // Nothing pushes the page sideways, and no child row is wider than the sheet.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  const rowsOverflowX = await page.evaluate(() => {
    const list = document.querySelector('[data-testid="objects-rows"]')
    return list ? list.scrollWidth - list.clientWidth : 0
  })
  expect(rowsOverflowX).toBeLessThanOrEqual(0)

  // The surfaces around the sheet are still clear of it.
  const surfaces = ['objects-panel', 'operations-toolbar', 'navigation-chrome', 'inspector-tab', 'library-tab']
  /** @type {Record<string, any>} */
  const rects = {}
  for (const id of surfaces) rects[id] = await rectOf(page, id)
  for (const a of surfaces) {
    for (const b of surfaces) {
      if (a >= b || !rects[a] || !rects[b]) continue
      expect(overlaps(rects[a], rects[b]), `${a} overlaps ${b}`).toBe(false)
    }
  }
  expect((await isReachable(page, 'operation-subtract')).topmostIsItem).toBe(true)

  // Reachable and selectable at the far end of the list: the last child row still selects.
  await page.getByTestId('objects-part-pi-hole4').scrollIntoViewIfNeeded()
  await page.getByTestId('objects-part-pi-hole4').click()
  expect(await subPartOf(page)).toEqual({ bodyId: 'pi', partName: 'hole4' })

  console.log(
    `[ui-042 ${testInfo.project.name}] Pi parts ${kernel.partCount} (${kernel.hiddenCount} hidden); sheet client ${/** @type {any} */ (scroll).client}px vs content ${/** @type {any} */ (scroll).scroll}px; chevron ${Math.round(/** @type {any} */ (chevron).right - /** @type {any} */ (chevron).left)}x${Math.round(/** @type {any} */ (chevron).bottom - /** @type {any} */ (chevron).top)}`,
  )
  await page.screenshot({ path: join(SNAPSHOT_DIR, `objects-parts-${testInfo.project.name}.png`) })
})
