import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { test, expect } from '@playwright/test'

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
function sceneBodies(page) {
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
