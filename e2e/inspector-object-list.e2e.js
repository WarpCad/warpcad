// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import jscad from '@jscad/modeling'
import { test, expect } from '@playwright/test'

import { createDocument } from '../src/core/document.js'
import { combine, volumeOf } from '../src/core/kernel/group.js'
import { DEFAULT_RESOLUTION } from '../src/core/kernel/tessellation.js'

const { booleans } = jscad

/**
 * The Inspector's object list (`TODO/ui-049`), driven against `/` — the running app.
 *
 * `ui-049` retired the separate Objects panel and its header toggle and moved the list into
 * the Inspector: the whole content with nothing selected, a collapsible **Objects** section
 * at 1 selected (collapsed) and 2+ (expanded), and a root **Objects** crumb on the
 * breadcrumb. This file is `e2e/objects-panel.e2e.js` (`ui-041`/`ui-042`) migrated onto that
 * route — every case about what the rows reach and select is kept, re-driven through the
 * Inspector — plus `ui-049`'s own hover-to-highlight cases.
 *
 * **Engines and viewports.** All three reference viewports (a panel/overlay/layout change,
 * with a snapshot at each) and all three engines (a WebGL material, x-ray and picking path).
 * Firefox fails at browser launch in this sandbox — `TROUBLESHOOTING.md` — and is not
 * claimed.
 *
 * ## What is seeded, and why
 *
 * The enclosed fixtures — a bolt or a cube standing entirely inside a larger cube, a Pi
 * inside a case — are seeded through the document store, exactly as `export-ui.e2e.js` and
 * `ui-040`'s drive do. A drag-drop *snaps* a placed body flush against its neighbour
 * (`ui-013`), so no drag can put one body inside another. Seeding is confined to building
 * the scene. **Every action under test is a real click, hover or tap**: the Inspector tab,
 * the section header, the rows, the checks, the crumb, Subtract, the gizmo handle.
 *
 * ## How a hover is measured
 *
 * By canvas pixels, because the whole point of the hover is what the user sees: a snapshot
 * with the pointer parked on the header, another with it over the row, and the count of
 * pixels that changed between them. Overlays are made transparent (never hidden) for the
 * photograph, so the row under the pointer keeps its hover and its focus — `visibility:
 * hidden` would end the hover the photograph is trying to capture.
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

/**
 * Put the Inspector's object list on screen, whatever state the Inspector is in — the route
 * a user takes, never a store call:
 *
 * - at phone width, the Inspector is a bottom sheet; if it is down, tap its tab (it reads
 *   `Objects (n)` with nothing selected);
 * - at 1 selected the list is a collapsed **Objects** section; tap its header.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openObjectList(page) {
  const list = page.getByTestId('object-list')
  if (await list.isVisible()) return
  const inspector = page.getByTestId('inspector')
  if ((await inspector.getAttribute('data-open')) !== 'true' && (await page.getByTestId('inspector-tab').isVisible())) {
    await page.getByTestId('inspector-tab').click()
    await expect(inspector).toHaveAttribute('data-open', 'true')
  }
  if (!(await list.isVisible())) {
    const header = page.getByTestId('inspector-objects-header')
    await expect(header).toHaveAttribute('aria-expanded', 'false')
    await header.click()
  }
  await expect(list).toBeVisible()
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
 * Photograph the WebGL canvas alone into page memory under `key`.
 *
 * Every element that is not the canvas or one of its ancestors is made **transparent**
 * for the shot and restored after — the Inspector sheet sits over the canvas at phone
 * width, and the row under the pointer must stay hit-testable so its hover survives. Kept
 * in the page, and only a count ever crosses back: shipping a full RGBA array through the
 * protocol takes seconds in WebKit.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} key
 */
async function snapshotCanvas(page, key) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="viewport-canvas"]')
    /** @type {[HTMLElement, string][]} */
    const faded = []
    let node = canvas
    while (node && node.parentElement && node !== document.body) {
      for (const sibling of node.parentElement.children) {
        if (sibling === node) continue
        const el = /** @type {HTMLElement} */ (sibling)
        faded.push([el, el.style.getPropertyValue('opacity')])
        el.style.setProperty('opacity', '0', 'important')
      }
      node = node.parentElement
    }
    window.__faded = faded
  })
  try {
    const box = await page.getByTestId('viewport-canvas').boundingBox()
    const png = await page.screenshot({ clip: /** @type {any} */ (box) })
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
    await page.evaluate(() => {
      for (const [el, opacity] of window.__faded ?? []) {
        if (opacity) el.style.setProperty('opacity', opacity)
        else el.style.removeProperty('opacity')
      }
      window.__faded = []
    })
  }
}

/**
 * How many pixels differ visibly between two stored snapshots.
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

/**
 * Park the mouse somewhere that hovers nothing the list cares about — the app title.
 *
 * @param {import('@playwright/test').Page} page
 */
async function parkPointer(page) {
  await page.mouse.move(4, 4)
}

/**
 * Hover a list row with a real mouse, then photograph the canvas until it differs from
 * `before` by more than `min` pixels (the repaint is a rAF away). Returns the count.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 * @param {string} key
 * @param {string} before
 */
async function hoverAndMeasure(page, testId, key, before) {
  await page.getByTestId(testId).scrollIntoViewIfNeeded()
  await page.getByTestId(testId).hover()
  let changed = 0
  await expect
    .poll(
      async () => {
        await snapshotCanvas(page, key)
        changed = await changedPixels(page, before, key)
        return changed
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(40)
  return changed
}

/**
 * Leave the row and wait for the canvas to come back to `before` (bar anti-aliasing).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} before
 */
async function leaveAndExpectRevert(page, before) {
  await parkPointer(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover', '')
  await expect
    .poll(
      async () => {
        await snapshotCanvas(page, 'reverted')
        return changedPixels(page, before, 'reverted')
      },
      { timeout: 15_000 },
    )
    .toBeLessThan(40)
}

/**
 * A 40 mm cube with a 10 mm cube dead centre inside it — the smallest "fully enclosed"
 * scene, for the hover x-ray.
 *
 * @param {import('@playwright/test').Page} page
 */
async function seedNestedCubes(page) {
  await storeApi(page).run((api) => {
    api.documentStore.append({ id: 'outer', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [40, 40, 40], center: [0, 0, 20] } })
    api.documentStore.append({ id: 'inner', op: 'primitive.cuboid', name: 'Cube 2', params: { size: [10, 10, 10], center: [0, 0, 20] } })
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
}

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'inspector-object-list-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
})

/* ------------------------------------------------------------------------------------ *
 * The list is in the Inspector now, and the Objects panel is gone (ui-049).
 * ------------------------------------------------------------------------------------ */

test('with nothing selected the Inspector lists every body; the Objects toggle and panel exist nowhere', async ({ page }) => {
  await seedEnclosed(page)
  await expect(page.locator('[data-testid="objects-toggle"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="objects-panel"]')).toHaveCount(0)
  // Phone: the Inspector is a sheet whose tab now names the list, and opening it with
  // nothing selected is the new route (it used to be hidden in that state).
  if ((page.viewportSize()?.width ?? 0) <= 640) {
    await expect(page.getByTestId('inspector-tab')).toHaveText('Objects (3)')
  }
  await openObjectList(page)
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-state', 'empty')
  await expect(page.getByTestId('object-list').getByTestId('objects-row-name')).toHaveText(['Shell 1', 'Bolt 1', 'Sphere 1'])
  await expect(page.getByTestId('objects-count')).toHaveText('3 objects')
  await expect(page.getByTestId('inspector')).not.toContainText('(nothing selected)')
})

test('every row shows its name, however long its size — in the narrow Inspector column too (found hand-driving)', async ({ page }) => {
  // A Group's `228.16 × 250.25 × 18.55 mm` once squeezed its row's name to zero width in the
  // 220/280px Inspector column: a check, a size, and no name.
  await storeApi(page).run((api) => {
    api.documentStore.append({ id: 'wide', op: 'primitive.cuboid', name: 'Group 1', params: { size: [228.16, 250.25, 18.55], center: [0, 0, 9.275] } })
    api.documentStore.append({ id: 'bolt', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm10 hex', length: 12 } })
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await openObjectList(page)
  for (const id of ['wide', 'bolt']) {
    const name = page.getByTestId(`objects-row-${id}`).getByTestId('objects-row-name')
    await expect(name).toBeVisible()
    const fits = await name.evaluate((el) => ({ width: el.getBoundingClientRect().width, clipped: el.scrollWidth > el.clientWidth + 1 }))
    expect(fits.width, `${id} name width`).toBeGreaterThan(40)
    expect(fits.clipped, `${id} name is not cut off`).toBe(false)
  }
})

test('the header no longer carries an Objects toggle, and still fits (Undo, Redo, History, File, chip)', async ({ page }) => {
  const ids = ['undo-button', 'redo-button', 'timeline-toggle', 'file-menu-button', 'save-status']
  const rects = /** @type {Record<string, NonNullable<Awaited<ReturnType<typeof rectOf>>>>} */ ({})
  for (const id of ids) {
    const rect = await rectOf(page, id)
    expect(rect, `${id} must be rendered`).not.toBeNull()
    rects[id] = /** @type {any} */ (rect)
  }
  for (const a of ids) {
    for (const b of ids) {
      if (a >= b) continue
      expect(overlaps(rects[a], rects[b]), `${a} overlaps ${b}`).toBe(false)
    }
    expect(rects[a].left, `${a} off the left edge`).toBeGreaterThanOrEqual(0)
    expect(rects[a].right, `${a} off the right edge`).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0)
  }
  const title = await page.locator('.app__title').boundingBox()
  expect(title).not.toBeNull()
  expect(/** @type {any} */ (title).x + /** @type {any} */ (title).width).toBeLessThanOrEqual(rects['undo-button'].left)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  // The 44px + gap the toggle took is given back: the cluster is narrower than the six-control one.
  const cluster = /** @type {any} */ (await rectOf(page, 'document-bar'))
  console.log(`[ui-049 header] document bar ${Math.round(cluster.right - cluster.left)}px wide at ${page.viewportSize()?.width}px`)
})

test('an empty document says so, and names the way out', async ({ page }) => {
  if ((page.viewportSize()?.width ?? 0) <= 640) {
    // Phone: nothing to list, so no tab to spend 44px of viewport on — the Library tab,
    // which is where the way out is, stays the only sheet on screen.
    await expect(page.getByTestId('inspector-tab')).toBeHidden()
    await expect(page.getByTestId('library-tab')).toBeVisible()
    return
  }
  await expect(page.getByTestId('objects-empty')).toContainText('drag a shape in from the Library')
  await expect(page.getByTestId('objects-count')).toHaveText('0 objects')
})

test('phone: with nothing selected, tapping the Inspector tab opens the sheet on the list', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith('phone'), 'the Inspector is a sheet only at phone width')
  await seedEnclosed(page)
  const tab = page.getByTestId('inspector-tab')
  await expect(tab).toBeVisible()
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-open', 'false')
  await tab.click()
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-open', 'true')
  await expect(page.getByTestId('object-list')).toBeVisible()
  expect((await isReachable(page, 'objects-row-shell')).topmostIsItem).toBe(true)
  // Selecting from inside the open sheet keeps it open — no second auto-open, no close.
  await page.getByTestId('objects-row-shell').click()
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-open', 'true')
  await expect(page.getByTestId('inspector-name')).toHaveText('Shell 1')
  // Swipe-down's meaning is unchanged: it clears the selection and collapses.
  const grip = /** @type {any} */ (await page.getByTestId('inspector-tab').boundingBox())
  await page.getByTestId('inspector-tab').dispatchEvent('pointerdown', { pointerId: 9, clientX: grip.x + 20, clientY: grip.y + 10 })
  await page.getByTestId('inspector-tab').dispatchEvent('pointerup', { pointerId: 9, clientX: grip.x + 20, clientY: grip.y + 80 })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-open', 'false')
  await expect(tab).toHaveText('Objects (3)')
})

test('tapping a row selects it (breadcrumb, gizmo); the breadcrumb\'s Objects crumb reopens the list, selection intact', async ({
  page,
}) => {
  await seedEnclosed(page)
  const bolt = await bodyNamed(page, 'Bolt 1')
  await openObjectList(page)
  await page.getByTestId(`objects-row-${bolt.id}`).click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', bolt.id)
  await expect(page.getByTestId('inspector-name')).toHaveText('Bolt 1')
  await expect(page.getByTestId('transform-gizmo')).toBeVisible()
  // One body named: its detail is the focus, the list folds to its header.
  await expect(page.getByTestId('inspector-objects-header')).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('object-list')).toHaveCount(0)
  await expect(page.getByTestId('inspector-breadcrumb-root')).toHaveText('Objects')

  await page.getByTestId('inspector-breadcrumb-root').click()
  await expect(page.getByTestId('object-list')).toBeVisible()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', bolt.id)
  await expect(page.getByTestId(`objects-item-${bolt.id}`)).toHaveAttribute('data-selected', 'true')
  await expect(page.getByTestId('transform-gizmo')).toBeVisible()
})

test('at 1 selected, ticking a second row\'s check gives "2 selected" and enables Union and Subtract', async ({ page }) => {
  await seedEnclosed(page)
  const shell = await bodyNamed(page, 'Shell 1')
  const sphere = await bodyNamed(page, 'Sphere 1')
  await openObjectList(page)
  await page.getByTestId(`objects-row-${shell.id}`).click()
  await expect(page.getByTestId('operations-count')).toContainText('1 selected')
  await expect(page.getByTestId('operation-union')).toBeDisabled()
  await openObjectList(page)
  await page.getByTestId(`objects-check-${sphere.id}`).click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await expect(page.getByTestId('operations-count')).toContainText('2 selected')
  await expect(page.getByTestId('operation-union')).toBeEnabled()
  await expect(page.getByTestId('operation-subtract')).toBeEnabled()
  await expect(page.getByTestId('inspector-multi')).toContainText('2 selected')
  // At 2+ the list is open by default: the order is right there.
  await expect(page.getByTestId(`objects-check-${shell.id}`)).toHaveText('1')
  await expect(page.getByTestId(`objects-check-${sphere.id}`)).toHaveText('2')
})

test('the first check does not make the list vanish: two operands from checks alone, no keyboard, no raycast', async ({
  page,
}) => {
  await seedEnclosed(page)
  const shell = await bodyNamed(page, 'Shell 1')
  const bolt = await bodyNamed(page, 'Bolt 1')
  await openObjectList(page)
  await page.getByTestId(`objects-check-${shell.id}`).click()
  await expect(page.getByTestId('inspector-name')).toHaveText('Shell 1')
  // Still there, still where it was: the next tap is the second operand.
  await expect(page.getByTestId('object-list')).toBeVisible()
  expect((await isReachable(page, `objects-check-${bolt.id}`)).topmostIsItem).toBe(true)
  await page.getByTestId(`objects-check-${bolt.id}`).click()
  expect(await selectedIds(page)).toEqual([shell.id, bolt.id])
  await expect(page.getByTestId('operation-subtract')).toBeEnabled()
})

/* ------------------------------------------------------------------------------------ *
 * Hover-to-highlight (ui-049).
 * ------------------------------------------------------------------------------------ */

test('hovering a body row lights that body on the canvas; leaving reverts it', async ({ page }) => {
  await seedEnclosed(page)
  const sphere = await bodyNamed(page, 'Sphere 1')
  await openObjectList(page)
  await parkPointer(page)
  await snapshotCanvas(page, 'before')

  const changed = await hoverAndMeasure(page, `objects-line-${sphere.id}`, 'hover-sphere', 'before')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover', sphere.id)
  // View state only: nothing selected, nothing written.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')
  console.log(`[ui-049 hover body] ${changed} px changed`)

  await leaveAndExpectRevert(page, 'before')
})

test('hovering the Pi\'s `ethernet` part row lights the jack only, not the whole board', async ({ page }, testInfo) => {
  await storeApi(page).run((api) => {
    api.documentStore.append({ id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: {} })
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await openObjectList(page)
  await page.getByTestId('objects-expand-pi').click()
  await parkPointer(page)
  await snapshotCanvas(page, 'before')

  const whole = await hoverAndMeasure(page, 'objects-line-pi', 'hover-pi', 'before')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover', 'pi')
  await leaveAndExpectRevert(page, 'before')

  const jack = await hoverAndMeasure(page, 'objects-part-item-pi-ethernet', 'hover-ethernet', 'before')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover', 'pi/ethernet')
  // The jack is a small part of the board: a part hover is not a group hover.
  expect(jack).toBeLessThan(whole * 0.6)
  console.log(`[ui-049 ${testInfo.project.name}] hover whole Pi ${whole} px, ethernet only ${jack} px`)
  await leaveAndExpectRevert(page, 'before')
})

test('hovering a Bolt\'s hidden `tap` row with Show hidden parts off shows the clearance, and leaving removes it', async ({
  page,
}) => {
  await storeApi(page).run((api) => {
    api.documentStore.append({ id: 'bolt', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm10 hex', length: 20 } })
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await openObjectList(page)
  await page.getByTestId('objects-expand-bolt').click()
  await expect(page.getByTestId('objects-part-hidden-bolt-tap')).toHaveText('hidden')
  await parkPointer(page)
  await snapshotCanvas(page, 'before')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover-transient', '')

  const changed = await hoverAndMeasure(page, 'objects-part-item-bolt-tap', 'hover-tap', 'before')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover-transient', 'tap')
  console.log(`[ui-049 hover hidden tap] ${changed} px changed`)

  await leaveAndExpectRevert(page, 'before')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover-transient', '')
})

test('hovering a cube fully inside a larger cube visibly changes the canvas — the hover x-ray twin', async ({ page }) => {
  await seedNestedCubes(page)
  await openObjectList(page)
  await parkPointer(page)
  await snapshotCanvas(page, 'before')
  const changed = await hoverAndMeasure(page, 'objects-line-inner', 'hover-inner', 'before')
  expect(Number(await page.getByTestId('viewport').getAttribute('data-hover-twins'))).toBeGreaterThan(0)
  console.log(`[ui-049 hover enclosed] ${changed} px changed`)
  await leaveAndExpectRevert(page, 'before')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover-twins', '0')
})

test('ui-041 regression: an enclosed body selected from the list keeps its selection x-ray twin alongside a hover twin', async ({
  page,
}) => {
  await seedNestedCubes(page)
  await openObjectList(page)
  await page.getByTestId('objects-check-inner').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', 'inner')
  await expect(page.getByTestId('viewport')).not.toHaveAttribute('data-xray-twins', '0')
  await parkPointer(page)
  await snapshotCanvas(page, 'selected')

  await hoverAndMeasure(page, 'objects-line-inner', 'selected-hovered', 'selected')
  // Both twins at once: the selection's and the hover's.
  await expect(page.getByTestId('viewport')).not.toHaveAttribute('data-xray-twins', '0')
  await expect(page.getByTestId('viewport')).not.toHaveAttribute('data-hover-twins', '0')
  // Leaving takes only the hover away: back to the selected picture, still selected.
  await leaveAndExpectRevert(page, 'selected')
  await expect(page.getByTestId('viewport')).not.toHaveAttribute('data-xray-twins', '0')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', 'inner')
})

test('touch invents no hover: a real tap that reflows the Inspector leaves nothing lit (found hand-driving at 390px WebKit)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.startsWith('firefox') || testInfo.project.name.endsWith('laptop'), 'needs a touchscreen')
  await storeApi(page).run((api) => {
    api.documentStore.append({ id: 'shell', op: 'primitive.cuboid', name: 'Shell 1', params: { size: [40, 40, 40], center: [0, 0, 20] } })
    api.documentStore.append({ id: 'bolt', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm10 hex', length: 12 } })
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await openObjectList(page)
  /** @param {string} testId */
  const tap = async (testId) => {
    await page.getByTestId(testId).scrollIntoViewIfNeeded()
    const box = /** @type {any} */ (await page.getByTestId(testId).boundingBox())
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  }
  await tap('objects-row-shell')
  await openObjectList(page)
  await tap('objects-expand-bolt')
  // 1 selected -> 2 selected: the Inspector drops the shell's detail and reflows the list
  // under the finger's phantom mouse.
  await tap('objects-part-check-bolt-tap')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await page.waitForTimeout(300)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover', '')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover-transient', '')
})

test('a hover never outlives its body: undo removes the body and the highlight with it', async ({ page }) => {
  await seedEnclosed(page)
  const sphere = await bodyNamed(page, 'Sphere 1')
  await openObjectList(page)
  await page.getByTestId(`objects-line-${sphere.id}`).hover()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover', sphere.id)
  // Undo from the keyboard, the pointer still resting where the row was.
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover', '')
})

/* ------------------------------------------------------------------------------------ *
 * ui-041's cases, re-driven through the Inspector route.
 * ------------------------------------------------------------------------------------ */

test('a body fully inside another cannot be clicked — and the list selects it: Inspector, gizmo and canvas all show it', async ({
  page,
}) => {
  await seedEnclosed(page)
  const shell = await bodyNamed(page, 'Shell 1')
  const bolt = await bodyNamed(page, 'Bolt 1')

  // --- The premise, proved rather than assumed: no click reaches the bolt. -------------
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

  await openObjectList(page)
  await parkPointer(page)
  await snapshotCanvas(page, 'before')
  await page.getByTestId(`objects-row-${bolt.id}`).click()
  await parkPointer(page)

  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', bolt.id)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  await expect(page.getByTestId(`scene-body-${bolt.id}`)).toHaveAttribute('data-selection-role', 'base')
  await expect(page.getByTestId('inspector-name')).toHaveText('Bolt 1')
  await expect(page.getByTestId('transform-gizmo')).toBeVisible()
  await expect(page.locator('[data-testid^="gizmo-grab-arm-"]').first()).toBeAttached()
  // The row says so too, once the section is opened again.
  await openObjectList(page)
  await expect(page.getByTestId(`objects-item-${bolt.id}`)).toHaveAttribute('data-selected', 'true')
  await expect(page.getByTestId(`objects-row-${bolt.id}`)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('objects-count')).toHaveText('3 objects · 1 selected')
  await parkPointer(page)

  // The enclosed bolt shows through the shell as a tint (the selection x-ray twin).
  await expect
    .poll(
      async () => {
        await snapshotCanvas(page, 'after')
        return changedPixels(page, 'before', 'after')
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(200)

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

test('the enclosed body is drivable: a gizmo drag moves it, with the shell in front of it', async ({ page }) => {
  await seedEnclosed(page)
  const bolt = await bodyNamed(page, 'Bolt 1')
  await openObjectList(page)
  await page.getByTestId(`objects-row-${bolt.id}`).click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', bolt.id)
  // Phone: the Inspector sheet stays up over the lower canvas after a list selection, as
  // it does after any selection (`ui-011`). Fold it with its tab — which keeps the
  // selection — to reach the gizmo, the way a user would.
  if ((await page.getByTestId('inspector-tab').isVisible()) && (await page.getByTestId('inspector').getAttribute('data-open')) === 'true') {
    await page.getByTestId('inspector-tab').click()
    await expect(page.getByTestId('inspector')).toHaveAttribute('data-open', 'false')
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', bolt.id)
  }

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
  await expect.poll(async () => Math.abs((await bodyNamed(page, 'Bolt 1')).center[0] - startX)).toBeGreaterThan(0.5)
  expect((await sceneBodies(page)).filter((body) => body.name === 'Bolt 1')).toHaveLength(1)
})

test('two bodies selected purely from the list, then Subtract: a real cavity, measured by volume, nothing moved', async ({
  page,
}) => {
  await seedEnclosed(page)
  const shell = await bodyNamed(page, 'Shell 1')
  const bolt = await bodyNamed(page, 'Bolt 1')
  await openObjectList(page)
  await page.evaluate(() => {
    window.__notReloaded = true
  })

  // The base first: Subtract removes every LATER selection from the FIRST.
  await page.getByTestId(`objects-row-${shell.id}`).click()
  await expect(page.getByTestId('operations-count')).toContainText('1 selected')
  await expect(page.getByTestId('operation-subtract')).toBeDisabled()

  // A touch screen has no Shift key: the check is the additive route (one header tap away).
  await openObjectList(page)
  await page.getByTestId(`objects-check-${bolt.id}`).click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await expect(page.getByTestId('operations-count')).toContainText('2 selected')
  await expect(page.getByTestId('operation-subtract')).toBeEnabled()
  await expect(page.getByTestId(`objects-check-${shell.id}`)).toHaveText('1')
  await expect(page.getByTestId(`objects-check-${bolt.id}`)).toHaveText('2')
  await expect(page.getByTestId(`objects-item-${bolt.id}`)).toHaveAttribute('data-role', 'secondary')
  expect(await selectedIds(page)).toEqual([shell.id, bolt.id])

  await page.getByTestId('operation-subtract').click()

  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  const after = await sceneBodies(page)
  const result = after.find((body) => body.name !== 'Sphere 1')
  expect(result, 'the subtract result').toBeDefined()
  expect(shell.volumeMm3).toBeCloseTo(64000, 1)
  expect(bolt.volumeMm3).toBeGreaterThan(1000)
  expect(/** @type {any} */ (result).volumeMm3).toBeCloseTo(shell.volumeMm3 - bolt.volumeMm3, 1)
  expect(/** @type {any} */ (result).volumeMm3).toBeLessThan(shell.volumeMm3 - 1000)
  expect(/** @type {any} */ (result).bounds).toBe(shell.bounds)
  const sphere = after.find((body) => body.name === 'Sphere 1')
  expect(sphere?.volumeMm3).toBeGreaterThan(4000)

  await openObjectList(page)
  await expect(page.getByTestId('objects-count')).toContainText('2 objects')
  await expect(page.getByTestId(`objects-row-${bolt.id}`)).toHaveCount(0)
  expect(await page.evaluate(() => window.__notReloaded)).toBe(true)

  await page.getByTestId('undo-button').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '3')
  await openObjectList(page)
  await expect(page.getByTestId(`objects-row-${bolt.id}`)).toBeVisible()
  const restored = await bodyNamed(page, 'Bolt 1')
  expect(restored.volumeMm3).toBeCloseTo(bolt.volumeMm3, 3)
})

test('list and viewport selections compose: a click, a check, and a plain row tap all edit one selection', async ({ page }) => {
  await seedEnclosed(page)
  const shell = await bodyNamed(page, 'Shell 1')
  const bolt = await bodyNamed(page, 'Bolt 1')

  let hit = false
  for (let row = 0; row < 11 && !hit; row += 1) {
    for (let col = 0; col < 11 && !hit; col += 1) {
      await clickViewportAt(page, 0.36 + col * 0.028, 0.14 + row * 0.05)
      hit = (await page.getByTestId('viewport').getAttribute('data-selected-id')) === shell.id
    }
  }
  expect(hit, 'a viewport click should reach the enclosing shell').toBe(true)
  await openObjectList(page)
  await expect(page.getByTestId(`objects-item-${shell.id}`)).toHaveAttribute('data-selected', 'true')

  await page.getByTestId(`objects-check-${bolt.id}`).click()
  expect(await selectedIds(page)).toEqual([shell.id, bolt.id])
  await expect(page.getByTestId('operations-count')).toContainText('2 selected')

  await page.getByTestId(`objects-row-${bolt.id}`).click()
  expect(await selectedIds(page)).toEqual([bolt.id])

  await clickViewportAt(page, 0.05, 0.05)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')
  await openObjectList(page)
  await expect(page.getByTestId(`objects-item-${bolt.id}`)).toHaveAttribute('data-selected', 'false')
})

test('History previewing a past state leaves the list read-only and says why; it names the previewed scene', async ({ page }) => {
  await seedEnclosed(page)
  await page.getByTestId('timeline-toggle').click()
  await page.getByTestId('timeline-row-1').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-previewing', 'true')
  // The list is not a panel competing for History's slot any more, so it is simply there —
  // and it must not be silently live over a past state.
  if ((page.viewportSize()?.width ?? 0) > 640) {
    await expect(page.getByTestId('objects-disabled-reason')).toContainText('Previewing history')
    await expect(page.getByTestId('object-list').getByTestId('objects-row-name')).toHaveText(['Shell 1'])
    await expect(page.getByTestId('objects-row-shell')).toBeDisabled()
  }
  // Closing History ends the preview: the list is live again, all three bodies back.
  await page.getByTestId('timeline-toggle').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-previewing', 'false')
  await openObjectList(page)
  await expect(page.getByTestId('objects-disabled-reason')).toHaveCount(0)
  await expect(page.getByTestId('object-list').getByTestId('objects-row-name')).toHaveCount(3)
})

test('the list is not text entry: with focus on a check, Ctrl/Cmd+Z still undoes', async ({ page }) => {
  await seedEnclosed(page)
  const shell = await bodyNamed(page, 'Shell 1')
  await openObjectList(page)
  await page.getByTestId(`objects-check-${shell.id}`).click()
  await page.getByTestId(`objects-check-${shell.id}`).focus()
  await expect(page.getByTestId(`objects-check-${shell.id}`)).toBeFocused()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
})

test('a rolled-back step leaves the list, and the list says why a body is missing', async ({ page }) => {
  await seedEnclosed(page)
  await page.getByTestId('timeline-toggle').click()
  await page.getByTestId('timeline-row-1').click()
  await page.getByTestId('timeline-rollback').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await page.getByTestId('timeline-toggle').click()
  await openObjectList(page)
  await expect(page.getByTestId('object-list').getByTestId('objects-row-name')).toHaveText(['Shell 1'])
  await expect(page.getByTestId('objects-absent-note')).toContainText('3 suppressed or rolled-back steps')
})

test('layout: the list in the Inspector clears the Library tab, the nav chrome and the Operations toolbar', async ({
  page,
}, testInfo) => {
  await seedEnclosed(page)
  const shell = await bodyNamed(page, 'Shell 1')
  const bolt = await bodyNamed(page, 'Bolt 1')
  await openObjectList(page)
  await page.getByTestId(`objects-check-${shell.id}`).click()
  await page.getByTestId(`objects-check-${bolt.id}`).click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await page.waitForTimeout(250)

  const rowIds = (await sceneBodies(page)).map((body) => body.id)
  for (const id of rowIds) {
    for (const testId of [`objects-row-${id}`, `objects-check-${id}`]) {
      // Centred in the sheet's own scroller, not `scrollIntoViewIfNeeded`: that one is
      // satisfied by a row that is merely inside the scroller's box, which can be a row sitting
      // under the sheet's sticky Delete row. The question here is whether a person can scroll
      // the row clear of everything, so put it in the middle.
      await page.getByTestId(testId).evaluate((el) => el.scrollIntoView({ block: 'center' }))
      const reach = await isReachable(page, testId)
      expect(reach.found, testId).toBe(true)
      expect(reach.onScreen, `${testId} on screen`).toBe(true)
      expect(reach.topmostIsItem, `${testId} is covered by something`).toBe(true)
      expect(reach.height, `${testId} tap-target height`).toBeGreaterThanOrEqual(44)
    }
  }
  await page.getByTestId('inspector-objects-header').evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const header = await isReachable(page, 'inspector-objects-header')
  expect(header.topmostIsItem).toBe(true)
  expect(header.height).toBeGreaterThanOrEqual(44)

  const surfaces = ['inspector', 'operations-toolbar', 'navigation-chrome', 'library-tab']
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
  if (testInfo.project.name.endsWith('phone')) {
    const sheet = rects['inspector']
    expect(sheet.bottom - sheet.top).toBeLessThan((page.viewportSize()?.height ?? 0) * 0.5)
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `inspector-object-list-${testInfo.project.name}.png`) })
})

test('phone: the Library sheet, the Inspector sheet and History never stack — opening one claims the slot', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.endsWith('phone'), 'the shared sheet slot only exists at phone width')
  await seedEnclosed(page)
  const visible = (id) => page.getByTestId(id).isVisible().catch(() => false)

  await openObjectList(page)
  await page.getByTestId('library-tab').click()
  await expect(page.getByTestId('library-rows')).toBeVisible()
  expect(await visible('object-list')).toBe(false)

  // ...and back: the Inspector's tab claims the slot, collapsing the Library.
  await page.getByTestId('inspector-tab').click()
  await expect(page.getByTestId('object-list')).toBeVisible()
  expect(await visible('library-rows')).toBe(false)

  // History claims it too: the Inspector declines to auto-open over it on a selection.
  await page.getByTestId('timeline-toggle').click()
  await expect(page.getByTestId('timeline-panel')).toBeVisible()
  await page.getByTestId('library-tab').click()
  await expect(page.getByTestId('library-rows')).toBeVisible()
  expect(await visible('timeline-panel')).toBe(false)
})

/* ------------------------------------------------------------------------------------ *
 * TODO/ui-042 — part rows: a Raspberry Pi's `ethernet` jack, addressed from the list while
 * the Pi is entirely inside a case. Re-driven through the Inspector (ui-049).
 * ------------------------------------------------------------------------------------ */

/**
 * The expected numbers, computed **independently of the app**: the kernel's own geometry,
 * booleaned directly with `@jscad/modeling`, never through `boolean.subtract`'s registry
 * entry or the toolbar. A 100 x 70 x 40 case with a Raspberry Pi B+ wholly inside it.
 */
function enclosedPiKernel() {
  // At the resolution the app's own new document folds at (TODO/core-035) — the app is not
  // the oracle, but the oracle has to be asked about the same shape.
  const doc = createDocument({ resolution: DEFAULT_RESOLUTION })
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
 * Every selected body's own address (`TODO/ui-063`) — `subPart` is only the single-body view.
 *
 * @param {import('@playwright/test').Page} page
 */
function addressesOf(page) {
  return storeApi(page).run((api) => ({ ...api.selection.addresses }))
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

  await openObjectList(page)
  await expect(page.getByTestId('objects-expand-pi')).toBeVisible()
  await expect(page.getByTestId('objects-expand-shell')).toHaveCount(0)
  await expect(page.getByTestId('objects-expand-ball')).toHaveCount(0)
  await expect(page.getByTestId('objects-expand-pi')).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('objects-part-pi-ethernet')).toHaveCount(0)

  await page.getByTestId('objects-expand-pi').click()
  await expect(page.getByTestId('objects-expand-pi')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('objects-part-pi-ethernet')).toBeVisible()
  expect(await selectedIds(page)).toEqual([])
  const partItems = await page.$$eval('[data-testid^="objects-part-item-pi-"]', (nodes) =>
    nodes.map((node) => ({ hidden: node.getAttribute('data-hidden') })),
  )
  expect(partItems).toHaveLength(kernel.partCount)
  expect(partItems.filter((item) => item.hidden === 'true')).toHaveLength(kernel.hiddenCount)
  await expect(page.getByTestId('objects-part-hidden-pi-usb1-body')).toHaveText('hidden')
  await expect(page.getByTestId('objects-part-hidden-pi-ethernet')).toHaveCount(0)

  // Part first: the WRONG boolean, and the app says so. A plain tap names one part, so the
  // Inspector shows it (`Raspberry Pi B+ ▸ ethernet`) and the list folds away; the root
  // crumb brings it back.
  await page.getByTestId('objects-part-pi-ethernet').click()
  expect(await selectedIds(page)).toEqual(['pi'])
  expect(await subPartOf(page)).toEqual({ bodyId: 'pi', partName: 'ethernet' })
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('ethernet')
  await expect(page.getByTestId('operation-subtract')).toBeDisabled()
  await page.getByTestId('inspector-breadcrumb-root').click()
  await expect(page.getByTestId('objects-part-item-pi-ethernet')).toHaveAttribute('data-selected', 'true')
  await page.getByTestId('objects-check-shell').click()
  expect(await selectedIds(page)).toEqual(['pi', 'shell'])
  await expect(page.getByTestId('objects-check-pi')).toHaveText('1')
  await expect(page.getByTestId('objects-check-shell')).toHaveText('2')
  await expect(page.getByTestId('operation-subtract')).toHaveAttribute('title', /Raspberry Pi B\+ › ethernet then Shell 1/)
  if (wide) {
    await expect(page.getByTestId('operation-operand-base')).toHaveText('Raspberry Pi B+ › ethernet')
    await expect(page.getByTestId('operation-operand-rest')).toHaveText('Shell 1')
  }

  // The natural order: the case's row, then the jack's check.
  await page.getByTestId('objects-row-shell').click()
  expect(await selectedIds(page)).toEqual(['shell'])
  expect(await subPartOf(page)).toBeNull()
  await openObjectList(page)
  await page.getByTestId('objects-part-check-pi-ethernet').click()
  expect(await selectedIds(page)).toEqual(['shell', 'pi'])
  expect(await addressesOf(page)).toEqual({ pi: 'ethernet' })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await expect(page.getByTestId('objects-check-shell')).toHaveText('1')
  await expect(page.getByTestId('objects-check-pi')).toHaveText('2')
  await expect(page.getByTestId('objects-part-check-pi-ethernet')).toHaveText('2')
  await expect(page.getByTestId('objects-drilled-pi')).toHaveText('› ethernet')
  await expect(page.getByTestId('operations-count')).toContainText('2 selected')
  await expect(page.getByTestId('operation-subtract')).toBeEnabled()
  await expect(page.getByTestId('operation-subtract')).toHaveAttribute('title', /Shell 1 then Raspberry Pi B\+ › ethernet/)
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
  expect(shellBefore?.volumeMm3).toBeCloseTo(kernel.shellVolume, 2)
  expect(piBefore?.volumeMm3).toBeCloseTo(kernel.piVolume, 2)

  await page.getByTestId('operation-subtract').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  const after = await sceneBodies(page)
  const result = after.find((body) => body.name !== 'Sphere 1')
  expect(result, 'the subtract result').toBeDefined()
  const measured = /** @type {any} */ (result).volumeMm3
  expect(measured).toBeCloseTo(kernel.shellMinusEthernet, 1)
  expect(kernel.shellVolume - measured).toBeCloseTo(kernel.ethernetVolume, 1)
  expect(kernel.shellVolume - kernel.shellMinusPi).toBeGreaterThan(kernel.ethernetVolume * 1.5)
  expect(Math.abs(measured - kernel.shellMinusPi)).toBeGreaterThan(1000)
  expect(/** @type {any} */ (result).bounds).toBe(shellBefore?.bounds)
  expect(await page.evaluate(() => window.__notReloaded)).toBe(true)
  console.log(
    `[ui-049 ${testInfo.project.name}] shell ${kernel.shellVolume.toFixed(3)} - ethernet ${kernel.ethernetVolume.toFixed(3)} = ${measured.toFixed(3)} (kernel ${kernel.shellMinusEthernet.toFixed(3)}); whole-board cut would be ${kernel.shellMinusPi.toFixed(3)}`,
  )

  await page.getByTestId('undo-button').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '3')
  await openObjectList(page)
  await expect(page.getByTestId('objects-expand-pi')).toHaveAttribute('aria-expanded', 'false')
})

test('re-targeting and stepping back up: the list and the viewport agree about a pick depth', async ({ page }) => {
  await seedEnclosedPi(page)
  await openObjectList(page)
  await page.getByTestId('objects-expand-pi').click()

  await page.getByTestId('objects-part-pi-ethernet').click()
  expect(await subPartOf(page)).toEqual({ bodyId: 'pi', partName: 'ethernet' })
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('ethernet')

  await openObjectList(page)
  await page.getByTestId('objects-part-pi-hdmi').click()
  expect(await subPartOf(page)).toEqual({ bodyId: 'pi', partName: 'hdmi' })
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('hdmi')
  await openObjectList(page)
  await expect(page.getByTestId('objects-part-item-pi-ethernet')).toHaveAttribute('data-selected', 'false')
  await expect(page.getByTestId('objects-part-item-pi-hdmi')).toHaveAttribute('data-selected', 'true')

  await page.getByTestId('objects-part-pi-hdmi').click()
  expect(await subPartOf(page)).toEqual({ bodyId: 'pi', partName: 'hdmi' })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')

  await openObjectList(page)
  await page.getByTestId('objects-part-pi-usb1-body').scrollIntoViewIfNeeded()
  await page.getByTestId('objects-part-pi-usb1-body').click()
  expect(await subPartOf(page)).toEqual({ bodyId: 'pi', partName: 'usb1-body' })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')

  // The parent row steps back up to the whole body — as the breadcrumb's group segment does.
  await openObjectList(page)
  await page.getByTestId('objects-row-pi').click()
  expect(await subPartOf(page)).toBeNull()
  expect(await selectedIds(page)).toEqual(['pi'])
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveCount(0)
  await openObjectList(page)
  await expect(page.getByTestId('objects-drilled-pi')).toHaveCount(0)

  await clickViewportAt(page, 0.02, 0.02)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')
  await openObjectList(page)
  await expect(page.getByTestId('objects-part-item-pi-usb1-body')).toHaveAttribute('data-selected', 'false')
})

test('a second viewport click still drills (ui-016), and the collapsed list row names the part it reached', async ({ page }) => {
  await storeApi(page).run((api) => {
    api.documentStore.append({ id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi B+', params: {} })
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  let hit = false
  for (let row = 0; row < 12 && !hit; row += 1) {
    for (let col = 0; col < 12 && !hit; col += 1) {
      await clickViewportAt(page, 0.3 + col * 0.03, 0.2 + row * 0.04)
      hit = (await page.getByTestId('viewport').getAttribute('data-selected-id')) === 'pi'
      if (hit) await clickViewportAt(page, 0.3 + col * 0.03, 0.2 + row * 0.04)
    }
  }
  expect(hit, 'a click should reach the Pi').toBe(true)
  const depth = await subPartOf(page)
  expect(depth?.bodyId).toBe('pi')
  expect(typeof depth?.partName).toBe('string')
  await openObjectList(page)
  await expect(page.getByTestId('objects-drilled-pi')).toHaveText(`› ${depth?.partName}`)
  await page.getByTestId('objects-expand-pi').click()
  await expect(page.getByTestId(`objects-part-item-pi-${depth?.partName}`)).toHaveAttribute('data-selected', 'true')
  await expect(page.locator('[data-testid^="objects-part-item-pi-"][data-selected="true"]')).toHaveCount(1)
})

test('phone-first layout with a fully expanded Pi: chevrons and child rows are 44px, reachable, and the sheet scrolls — not the page', async ({
  page,
}, testInfo) => {
  const kernel = enclosedPiKernel()
  await seedEnclosedPi(page)
  await openObjectList(page)
  await page.getByTestId('objects-expand-pi').click()
  await page.getByTestId('objects-check-shell').click()
  await page.getByTestId('objects-part-check-pi-ethernet').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await page.waitForTimeout(250)

  // The list lives in the Inspector's own scrolling region: at phone width that is the sheet.
  const scroll = await page.evaluate(() => {
    const sheet = document.querySelector('[data-testid="inspector-sheet"]')
    if (!sheet) return null
    return { client: sheet.clientHeight, scroll: sheet.scrollHeight }
  })
  expect(scroll).not.toBeNull()
  if (testInfo.project.name.endsWith('phone')) {
    expect(/** @type {any} */ (scroll).scroll).toBeGreaterThan(/** @type {any} */ (scroll).client)
  }
  // The page itself never scrolls: all of that height is inside the sheet/column.
  const pageScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
  expect(pageScroll).toBeLessThanOrEqual(0)

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
  await page.getByTestId('objects-expand-pi').scrollIntoViewIfNeeded()
  const chevron = await rectOf(page, 'objects-expand-pi')
  expect(/** @type {any} */ (chevron).right - /** @type {any} */ (chevron).left).toBeGreaterThanOrEqual(44)
  expect(/** @type {any} */ (chevron).bottom - /** @type {any} */ (chevron).top).toBeGreaterThanOrEqual(44)

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  const sheetOverflowX = await page.evaluate(() => {
    const sheet = document.querySelector('[data-testid="inspector-sheet"]')
    return sheet ? sheet.scrollWidth - sheet.clientWidth : 0
  })
  expect(sheetOverflowX).toBeLessThanOrEqual(0)

  const surfaces = ['inspector', 'operations-toolbar', 'navigation-chrome', 'library-tab']
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

  await page.getByTestId('objects-part-pi-hole4').scrollIntoViewIfNeeded()
  await page.getByTestId('objects-part-pi-hole4').click()
  expect(await subPartOf(page)).toEqual({ bodyId: 'pi', partName: 'hole4' })

  console.log(
    `[ui-049 ${testInfo.project.name}] Pi parts ${kernel.partCount} (${kernel.hiddenCount} hidden); sheet client ${/** @type {any} */ (scroll).client}px vs content ${/** @type {any} */ (scroll).scroll}px; chevron ${Math.round(/** @type {any} */ (chevron).right - /** @type {any} */ (chevron).left)}x${Math.round(/** @type {any} */ (chevron).bottom - /** @type {any} */ (chevron).top)}`,
  )
  await page.screenshot({ path: join(SNAPSHOT_DIR, `inspector-object-list-parts-${testInfo.project.name}.png`) })
})
