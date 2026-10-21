// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { test, expect } from '@playwright/test'

/**
 * Project variables (`TODO/ui-059`) — create a variable from a field, bind it, change it in
 * one place, and watch the design follow — driven against `/`, the running app.
 *
 * **The Pi example, with no model access.** Every step of the main test is something a
 * person does with a pointer: drag a Raspberry Pi and a cube out of the Library, bind the
 * Pi's Model with **New variable from this value…**, give the cube a variable condition,
 * change the variable in the Variables section, Undo once. The only thing read through the
 * page's own modules is a *read-back* (the log's order, the persisted record shape).
 *
 * **Engines and viewports.** Everything here touches the canvas, the worker result and (for
 * the last test) the IndexedDB round-trip, so it is meant for all three engines at all three
 * viewports with a snapshot at each (`test-results/variables-snapshots/`). Firefox cannot
 * launch in this sandbox (`TROUBLESHOOTING.md`, 2026-09-17) — the honest claim is chromium
 * and webkit. The phone project is the one that matters most: there the Variables section is
 * a tab of the Inspector's single bottom sheet and the bind popover is a sheet of its own.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'variables-snapshots')

test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

/** @param {import('@playwright/test').TestInfo} info */
const isPhone = (info) => info.project.name.endsWith('phone')

/** @param {import('@playwright/test').Page} page @param {string} sectionId */
async function openLibrary(page, sectionId = '') {
  const rows = page.getByTestId('library-rows')
  if (!(await rows.isVisible())) {
    await page.getByTestId('library-tab').click()
    await expect(rows).toBeVisible()
  }
  if (sectionId) await page.getByTestId(`library-rows-${sectionId}`).scrollIntoViewIfNeeded()
}

/** @param {import('@playwright/test').Page} page */
async function closeLibrary(page) {
  const tab = page.getByTestId('library-tab')
  if (!(await tab.isVisible())) return
  if (await page.getByTestId('library-rows').isVisible()) await tab.click()
  await expect(page.getByTestId('library-rows')).toBeHidden()
}

/**
 * Drag a Library row into the viewport with real `PointerEvent`s.
 *
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
      const fire = (/** @type {EventTarget} */ target, /** @type {string} */ type, /** @type {number} */ x, /** @type {number} */ y) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 31,
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
      for (const t of [0.25, 0.5, 0.75, 1]) fire(window, 'pointermove', startX + (endX - startX) * t, startY + (endY - startY) * t)
      fire(window, 'pointerup', endX, endY)
    },
    { op, fx, fy },
  )
  await page.waitForTimeout(400)
}

/** @param {import('@playwright/test').Page} page @param {number} count */
async function expectBodyCount(page, count) {
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', String(count))
}

/**
 * Select a body from the object list — the no-raycast route every device has.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
async function selectByName(page, name) {
  const inspector = page.getByTestId('inspector')
  if ((await inspector.getAttribute('data-open')) !== 'true' && (await page.getByTestId('inspector-tab').isVisible())) {
    await page.getByTestId('inspector-tab').click()
    await expect(inspector).toHaveAttribute('data-open', 'true')
  }
  await showInspectorView(page)
  const list = page.getByTestId('object-list')
  if (!(await list.isVisible())) await page.getByTestId('inspector-objects-header').click()
  await list.getByText(name, { exact: true }).first().click()
  await expect(page.getByTestId('inspector-name')).toHaveText(name)
}

/** At phone width the sheet has two views; put the Inspector one up. */
async function showInspectorView(/** @type {import('@playwright/test').Page} */ page) {
  const tab = page.getByTestId('inspector-view-inspector')
  if (await tab.isVisible()) await tab.click()
}

/**
 * Put the Variables section on screen: the sheet's tab and its Variables view at phone
 * width, simply there in the column otherwise.
 *
 * @param {import('@playwright/test').Page} page
 */
async function showVariables(page) {
  const inspector = page.getByTestId('inspector')
  if ((await inspector.getAttribute('data-open')) !== 'true' && (await page.getByTestId('inspector-tab').isVisible())) {
    await page.getByTestId('inspector-tab').click()
    await expect(inspector).toHaveAttribute('data-open', 'true')
  }
  const tab = page.getByTestId('inspector-view-variables')
  if (await tab.isVisible()) await tab.click()
  await expect(page.getByTestId('inspector-variables')).toBeVisible()
}

/**
 * Snapshot the rendered canvas (everything over it faded out) into the page, keyed — only a
 * pixel count crosses back (`composite-param-edit.e2e.js`'s technique).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} key
 */
async function snapshotCanvas(page, key) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="viewport-canvas"]')
    /** @type {Array<[HTMLElement, string]>} */
    const faded = []
    /** @type {any} */
    let node = canvas
    while (node && node.parentElement && node !== document.body) {
      for (const child of node.parentElement.children) {
        if (child === node) continue
        const sibling = /** @type {HTMLElement} */ (child)
        faded.push([sibling, sibling.style.getPropertyValue('opacity')])
        sibling.style.setProperty('opacity', '0', 'important')
      }
      node = node.parentElement
    }
    // @ts-ignore
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
        const context = /** @type {OffscreenCanvasRenderingContext2D} */ (surface.getContext('2d'))
        context.drawImage(bitmap, 0, 0)
        // @ts-ignore
        window.__canvasSnaps = window.__canvasSnaps ?? {}
        // @ts-ignore
        window.__canvasSnaps[key] = context.getImageData(0, 0, bitmap.width, bitmap.height)
      },
      { b64: png.toString('base64'), key },
    )
  } finally {
    await page.evaluate(() => {
      // @ts-ignore
      for (const [el, opacity] of window.__faded ?? []) {
        if (opacity) el.style.setProperty('opacity', opacity)
        else el.style.removeProperty('opacity')
      }
      // @ts-ignore
      window.__faded = []
    })
  }
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} a
 * @param {string} b
 * @returns {Promise<number>} How many pixels differ visibly.
 */
function changedPixels(page, a, b) {
  return page.evaluate(
    ({ a, b }) => {
      // @ts-ignore
      const first = window.__canvasSnaps[a]
      // @ts-ignore
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

/** @param {import('@playwright/test').Page} page */
async function clearSelection(page) {
  await page.evaluate(async () => {
    const { useSelectionStore } = await window.__e2eImport('/src/stores/selection.js')
    useSelectionStore().clear()
  })
}

/** @param {import('@playwright/test').Page} page */
async function noHorizontalScroll(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

/**
 * Drag a Pi onto the grid and bind its Model with **New variable from this value…**.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
async function placePiAndBindModel(page, name = 'piModel') {
  await openLibrary(page, 'raspberrypi')
  await dragRowIntoViewport(page, { op: 'raspberrypi.bplus', fx: 0.3, fy: 0.25 })
  await closeLibrary(page)
  await expectBodyCount(page, 1)
  await showInspectorView(page)
  await expect(page.getByTestId('inspector-param-model')).toBeVisible()
  await page.getByTestId('param-bind-model').click()
  await expect(page.getByTestId('param-bind-popover')).toBeVisible()
  await page.getByTestId('param-bind-new').click()
  await page.getByTestId('param-bind-new-name').fill(name)
  await page.getByTestId('param-bind-new-create').click()
  await expect(page.getByTestId('param-chip-model')).toHaveAttribute('data-variable', name)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('Pi example: bind Model from its own value, give the cube a variable condition, flip 4 to 5 in one place, Undo once', async ({
  page,
}, testInfo) => {
  // 1-2. Place a Pi and bind its Model: the field becomes a chip, the value unchanged.
  await placePiAndBindModel(page)
  const chip = page.getByTestId('param-chip-model')
  await expect(chip.getByTestId('param-chip-value')).toHaveText('Pi 4')
  await expect(page.getByTestId('inspector-param-model')).toHaveCount(0)
  // The popover closed with the action, and the History gained the define-and-bind step.
  await expect(page.getByTestId('param-bind-popover')).toHaveCount(0)
  await noHorizontalScroll(page)
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `bound-chip-${testInfo.project.name}.png`) })

  // 3. A cube beside it, and a variable condition on it: it only exists on a Pi 4.
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.72, fy: 0.25 })
  await closeLibrary(page)
  await expectBodyCount(page, 2)
  await showInspectorView(page)
  await expect(page.getByTestId('inspector-name')).toHaveText('Cube 1')
  await page.getByTestId('inspector-condition-add').click()
  await expect(page.getByTestId('inspector-condition-source')).toHaveValue('var:piModel')
  await page.getByTestId('inspector-condition-option-4').check()
  await page.getByTestId('inspector-condition-save').click()
  await expect(page.getByTestId('inspector-condition-text')).toContainText('Only when piModel is Pi 4')

  // 4. Change the variable — nothing needs to be selected.
  await clearSelection(page)
  await snapshotCanvas(page, 'pi4')
  await showVariables(page)
  const row = page.getByTestId('variable-row-piModel')
  await expect(row).toBeVisible()
  await expect(page.getByTestId('variable-used-piModel')).toHaveText('used by 2')
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `variables-pi4-${testInfo.project.name}.png`) })
  await page.getByTestId('variable-value-piModel').selectOption('5')

  await expect(page.getByTestId('variable-announcement')).toHaveText('piModel 4 → 5 — 2 parameters on 2 parts changed')
  await expect(page.getByTestId('repair-dialog')).toHaveCount(0)
  // The cube is a Pi-4-only part: it goes, and the board on screen is a different board.
  await expectBodyCount(page, 1)
  await expect(row).toHaveAttribute('data-value', '5')
  await snapshotCanvas(page, 'pi5')
  expect(await changedPixels(page, 'pi4', 'pi5')).toBeGreaterThan(200)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `variables-pi5-${testInfo.project.name}.png`) })

  // The Inspector's chip follows too: select the Pi and read the field.
  await selectByName(page, 'Raspberry Pi 1')
  await expect(page.getByTestId('param-chip-model').getByTestId('param-chip-value')).toHaveText('Pi 5')
  // Typing into the chipped field is impossible: there is no editor to type into.
  await expect(page.getByTestId('inspector-param-model')).toHaveCount(0)

  // 5. One Undo returns everything to the Pi 4.
  await page.getByTestId('undo-button').click()
  await expectBodyCount(page, 2)
  // Undo puts the selection back as it was before the change: nothing was selected.
  await clearSelection(page)
  await snapshotCanvas(page, 'pi4-again')
  expect(await changedPixels(page, 'pi4', 'pi4-again')).toBeLessThan(120)
  await selectByName(page, 'Raspberry Pi 1')
  await expect(page.getByTestId('param-chip-model').getByTestId('param-chip-value')).toHaveText('Pi 4')
  await showVariables(page)
  await expect(page.getByTestId('variable-row-piModel')).toHaveAttribute('data-value', '4')

  // The History names it: a Define row, and the bind (here folded into the same step).
  await page.getByTestId('timeline-toggle').click()
  await expect(page.getByTestId('timeline-rows')).toContainText('Define piModel')
  await page.getByTestId('timeline-close').click()

  // The definition is after its consumer in the log — and the design still builds.
  const order = await page.evaluate(async () => {
    const { useDocumentStore } = await window.__e2eImport('/src/stores/document.js')
    return useDocumentStore().raw.entries.map((entry) => entry.record.op)
  })
  expect(order.indexOf('var.define')).toBeGreaterThan(order.indexOf('raspberrypi.bplus'))
  await noHorizontalScroll(page)
})

test('delete a variable that is in use: the dialog lists its consumers; keep values leaves the literals; rename carries the bindings', async ({
  page,
}, testInfo) => {
  await placePiAndBindModel(page, 'board')
  await showVariables(page)

  // Rename: the chip follows.
  await page.getByTestId('variable-menu-board').click()
  await page.getByTestId('variable-rename-board').click()
  await page.getByTestId('variable-rename-input-board').fill('piBoard')
  await page.getByTestId('variable-rename-save-board').click()
  await expect(page.getByTestId('variable-row-piBoard')).toBeVisible()
  await showInspectorView(page)
  await expect(page.getByTestId('param-chip-model')).toHaveAttribute('data-variable', 'piBoard')

  // Delete: not a plain destructive delete.
  await showVariables(page)
  await page.getByTestId('variable-menu-piBoard').click()
  await page.getByTestId('variable-delete-piBoard').click()
  const dialog = page.getByTestId('variable-usage-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('variable-usage-consumer')).toHaveCount(1)
  await expect(dialog.getByTestId('variable-usage-consumer')).toContainText('Raspberry Pi 1')
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `usage-dialog-${testInfo.project.name}.png`) })
  await noHorizontalScroll(page)
  await page.getByTestId('variable-usage-cancel').click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('variable-row-piBoard')).toBeVisible()

  await page.getByTestId('variable-menu-piBoard').click()
  await page.getByTestId('variable-delete-piBoard').click()
  await page.getByTestId('variable-usage-keep').click()
  await expect(page.getByTestId('variable-row-piBoard')).toHaveCount(0)
  // The literal is back in the field, as an ordinary dropdown.
  await showInspectorView(page)
  await expect(page.getByTestId('inspector-param-model')).toHaveValue('4')
  await expect(page.getByTestId('param-chip-model')).toHaveCount(0)

  // One Undo puts the variable and the binding back together.
  await page.getByTestId('undo-button').click()
  await expect(page.getByTestId('param-chip-model')).toHaveAttribute('data-variable', 'piBoard')
})

test('a bound field and its variable survive a reload (the IndexedDB round-trip)', async ({ page }) => {
  await placePiAndBindModel(page)
  await showVariables(page)
  await page.getByTestId('variable-value-piModel').selectOption('5')
  await expect(page.getByTestId('variable-row-piModel')).toHaveAttribute('data-value', '5')
  await expect(page.getByTestId('save-status-text')).toHaveText(/^Saved · \d\d:\d\d$/)

  await page.reload()
  await expect(page.getByTestId('app-root')).toBeVisible()
  await expectBodyCount(page, 1)
  await showVariables(page)
  await expect(page.getByTestId('variable-row-piModel')).toHaveAttribute('data-value', '5')
  await expect(page.getByTestId('variable-used-piModel')).toHaveText('used by 1')
  await selectByName(page, 'Raspberry Pi 1')
  await expect(page.getByTestId('param-chip-model').getByTestId('param-chip-value')).toHaveText('Pi 5')
})

test('a loaded file whose binding names an undefined variable opens with that step broken and named, never a guess', async ({
  page,
}) => {
  const file = [
    JSON.stringify({ id: 'pi-1', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model: { $var: 'ghost' } } }),
    JSON.stringify({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10], center: [60, 0, 5] } }),
  ].join('\n')
  // The native picker cannot be driven headless: force the `<input type=file>` fallback.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
  })
  await page.reload()
  await expect(page.getByTestId('viewport')).toBeVisible()
  await page.getByTestId('file-menu-button').click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByTestId('file-open').click()
  await (await chooser).setFiles({ name: 'ghost.ndjson', mimeType: 'text/plain', buffer: Buffer.from(file) })

  // The cube is fine; the Pi is not built, and says why instead of showing a literal.
  await expect(page.getByTestId('timeline-toggle')).toBeVisible()
  await page.getByTestId('timeline-toggle').click()
  await expect(page.getByTestId('chip-broken').first()).toBeVisible()
  await expect(page.getByTestId('chip-broken').first()).toHaveAttribute('title', /ghost/)
  await expectBodyCount(page, 1)
})
