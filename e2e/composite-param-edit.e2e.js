import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { test, expect } from '@playwright/test'

/**
 * Editing a composite part's parameters after placement — a Raspberry Pi's **Model**, a
 * bolt's spec, fit and length — and repairing what a variant change breaks
 * (`TODO/ui-052`), driven against `/`, the running app.
 *
 * **Setup through the stores, the claim through the UI.** Each test seeds its starting
 * scene (a Pi, a cube, a case) through the app's own document store, the way
 * `inspector-object-list.e2e.js` does, because the drag-to-place path is already covered
 * nine ways elsewhere and is not what this task changed. Everything this task *did*
 * change is driven the way a user drives it: the snap onto the AV jack through the object
 * list's part checks and the Snap popover, the model change through the Inspector's
 * native `<select>`, every fix through the repair dialog's own controls, and Undo through
 * the header's Undo button.
 *
 * **All three engines, all three viewports.** The kernel result, the rendered canvas and
 * WebKit's native `<select>` on touch are all engine-sensitive, and the repair dialog is a
 * bottom sheet at phone width — a layout change — so it gets a snapshot at each viewport
 * (`test-results/composite-param-edit-snapshots/`).
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'composite-param-edit-snapshots')

/**
 * The running app's own store modules — setup and read-back only.
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
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ id: string, name: string, center: [number, number, number], volume: string }[]>}
 */
async function sceneBodies(page) {
  const rows = await page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      name: node.getAttribute('data-body-name') ?? '',
      center: node.getAttribute('data-body-center') ?? '',
      volume: node.getAttribute('data-body-volume') ?? '',
    })),
  )
  return rows.map((row) => ({ ...row, center: /** @type {[number, number, number]} */ (row.center.split(',').map(Number)) }))
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
async function centerOf(page, name) {
  const found = (await sceneBodies(page)).find((body) => body.name === name)
  if (!found) throw new Error(`no body named ${name} in the scene`)
  return found.center
}

/** @param {import('@playwright/test').Page} page @param {number} count */
async function expectBodyCount(page, count) {
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', String(count))
}

/**
 * A Pi 4 (moved off the origin, as a drop leaves it) and a small cube clear of it.
 *
 * @param {import('@playwright/test').Page} page
 */
async function seedPiAndCube(page) {
  await storeApi(page).run((api) => {
    api.documentStore.append({ id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model: 4 } })
    // The move a Library drop leaves on the Pi, so its terminal record is not the one the
    // model edit replaces — the case where the viewport kept drawing the old board.
    api.documentStore.append({
      id: 'pi-move',
      op: 'transform.translate',
      name: 'Raspberry Pi 1',
      target: 'pi',
      supersedes: 'pi',
      params: { vector: [-20, 10, 0], rotation: [0, 0, 0] },
    })
    api.documentStore.append({
      id: 'cube',
      op: 'primitive.cuboid',
      name: 'Cube 1',
      params: { size: [12, 12, 12], center: [110, -70, 6] },
    })
  })
  await expectBodyCount(page, 2)
}

/**
 * Put the Inspector's object list on screen — tab first at phone width, then the
 * collapsed Objects section if a body is selected (`ui-049`).
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

/**
 * Select one body by its object-list row — a plain tap, the whole selection.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 */
async function selectFromList(page, id) {
  await openObjectList(page)
  await page.getByTestId(`objects-row-${id}`).click()
  await expect(page.getByTestId('inspector-name')).toBeVisible()
}

/**
 * Snap the cube onto one named part of the Pi, the no-raycast way a user can on every
 * device: the cube's check, the Pi's ▸, that part's check (so the cube moves and the part
 * is the reference), then Snap on X, Y and Z.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} part
 */
async function snapCubeTo(page, part) {
  await storeApi(page).run((api) => api.selection.clear())
  await openObjectList(page)
  await page.getByTestId('objects-check-cube').click()
  await page.getByTestId('objects-expand-pi').click()
  await page.getByTestId(`objects-part-check-pi-${part}`).click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  const before = await centerOf(page, 'Cube 1')
  await page.getByTestId('operation-snap').click()
  await expect(page.getByTestId('snap-align-popover')).toBeVisible()
  // All three axes: a Z-only snap onto `ethernet` sits under the jack's bottom face,
  // which is the board top on every model — nothing would visibly follow.
  for (const axis of ['x', 'y', 'z']) await page.getByTestId(`snap-align-axis-${axis}`).check()
  await page.getByTestId('snap-align-commit').click()
  await expect(page.getByTestId('snap-align-popover')).toHaveCount(0)
  await expect.poll(async () => (await centerOf(page, 'Cube 1'))[2]).not.toBeCloseTo(before[2], 1)
}

/**
 * Select the whole Pi and choose a model in its Inspector dropdown.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} model
 */
async function chooseModel(page, model) {
  await selectFromList(page, 'pi')
  const select = page.getByTestId('inspector-param-model')
  await expect(select).toBeEnabled()
  await select.selectOption(model)
}

/** @param {import('@playwright/test').Page} page */
async function openHistory(page) {
  if (await page.getByTestId('timeline-panel').isVisible()) return
  await page.getByTestId('timeline-toggle').click()
  await expect(page.getByTestId('timeline-panel')).toBeVisible()
}

/** @param {import('@playwright/test').Page} page */
async function closeHistory(page) {
  if (!(await page.getByTestId('timeline-panel').isVisible())) return
  await page.getByTestId('timeline-close').click()
  await expect(page.getByTestId('timeline-panel')).toHaveCount(0)
}

/** @param {import('@playwright/test').Page} page */
async function undo(page) {
  await page.getByTestId('undo-button').click()
}

/**
 * Snapshot the rendered canvas (everything over it faded out) into the page, keyed —
 * `inspector-object-list.e2e.js`'s technique: only a pixel count crosses back.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} key
 */
async function snapshotCanvas(page, key) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="viewport-canvas"]')
    const faded = []
    let node = canvas
    while (node && node.parentElement && node !== document.body) {
      for (const sibling of node.parentElement.children) {
        if (sibling === node) continue
        faded.push([sibling, sibling.style.getPropertyValue('opacity')])
        sibling.style.setProperty('opacity', '0', 'important')
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
 * @param {import('@playwright/test').Page} page
 * @param {string} a
 * @param {string} b
 * @returns {Promise<number>} How many pixels differ visibly.
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

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('a Pi 4 with nothing attached becomes a Pi 5 in place: no dialog, same body, still selected', async ({ page }) => {
  await seedPiAndCube(page)
  await selectFromList(page, 'pi')
  const model = page.getByTestId('inspector-param-model')
  await expect(model).toHaveJSProperty('tagName', 'SELECT')
  await expect(model).toHaveValue('4')
  // The same labelled options the Library's pre-drag picker offers.
  await expect(model.locator('option')).toHaveText(['Pi 2', 'Pi 3', 'Pi 4', 'Pi 5'].map((label) => new RegExp(label)))
  const before = (await sceneBodies(page)).find((body) => body.id === 'pi')
  // Snapshots with nothing selected, so only the drawn geometry can differ — the gizmo
  // and dimension lines follow the new bounds whether or not the mesh is redrawn.
  await storeApi(page).run((api) => api.selection.clear())
  await snapshotCanvas(page, 'pi4')
  await selectFromList(page, 'pi')

  await model.selectOption('5')

  await expect(page.getByTestId('repair-dialog')).toHaveCount(0)
  await expect(model).toHaveValue('5')
  // Rebuilt in place: same body, still the selection (so the gizmo stays attached), and
  // a different board — the Pi 5's measured volume is not the Pi 4's.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', 'pi')
  await expect.poll(async () => (await sceneBodies(page)).find((body) => body.id === 'pi')?.volume).not.toBe(before?.volume)
  await expectBodyCount(page, 2)
  // And the board on screen is redrawn, not only re-measured: the Pi's terminal record
  // keeps its id through a replace-path edit, and a mesh cache keyed on that id alone
  // kept drawing the Pi 4 (found hand-driving this task).
  await storeApi(page).run((api) => api.selection.clear())
  await snapshotCanvas(page, 'pi5')
  expect(await changedPixels(page, 'pi4', 'pi5')).toBeGreaterThan(200)
  await selectFromList(page, 'pi')

  // One Undo step puts the Pi 4 back.
  await undo(page)
  await expect(page.getByTestId('inspector-param-model')).toHaveValue('4')
})

test('a Bolt: spec and fit are dropdowns, fit lists the chosen spec’s own fits, and length is editable', async ({ page }) => {
  await storeApi(page).run((api) => {
    api.documentStore.append({ id: 'bolt', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm10 hex', length: 12, fit: 'close' } })
  })
  await expectBodyCount(page, 1)
  await selectFromList(page, 'bolt')
  const spec = page.getByTestId('inspector-param-spec')
  const fit = page.getByTestId('inspector-param-fit')
  await expect(spec).toHaveJSProperty('tagName', 'SELECT')
  await expect(fit).toHaveJSProperty('tagName', 'SELECT')
  await expect(spec).toHaveValue('m10 hex')
  const specVolume = (await sceneBodies(page))[0].volume

  await spec.selectOption('1/4 socket')
  await expect(page.getByTestId('repair-dialog')).toHaveCount(0)
  await expect(spec).toHaveValue('1/4 socket')
  // Read off `boltSpecs['1/4 socket'].fitDiameterMm` — its own row, not a shared list.
  const fits = await page.evaluate(async () => {
    const { boltSpecs } = await import('/src/core/kernel/tables/bolt-specs.js')
    return Object.keys(boltSpecs['1/4 socket'].fitDiameterMm)
  })
  await expect(fit.locator('option')).toHaveText(fits)
  await expect.poll(async () => (await sceneBodies(page))[0].volume).not.toBe(specVolume)

  const length = page.getByTestId('inspector-param-length')
  await expect(length).not.toHaveAttribute('readonly', '')
  const lengthVolume = (await sceneBodies(page))[0].volume
  await length.fill('20')
  await length.press('Enter')
  await expect(length).toHaveValue(/^20/)
  await expect.poll(async () => (await sceneBodies(page))[0].volume).not.toBe(lengthVolume)
})

test('Pi 4 + cube snapped to its AV jack → Pi 5: the dialog lists the cube; Cancel changes nothing; Detach keeps it put; one Undo restores both', async ({
  page,
}, testInfo) => {
  await seedPiAndCube(page)
  await snapCubeTo(page, 'avjack')
  const snapped = await centerOf(page, 'Cube 1')

  await chooseModel(page, '5')
  const dialog = page.getByTestId('repair-dialog')
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId('repair-title')).toHaveText('This change affects 1 item')
  const row = page.getByTestId('repair-row')
  await expect(row).toHaveCount(1)
  await expect(row.getByTestId('repair-row-name')).toHaveText('Cube 1')
  await expect(row.getByTestId('repair-row-relationship')).toHaveText('Snap → avjack')
  await expect(row.getByTestId('repair-row-reason')).toContainText('Pi 5 has no part named')
  // Held, not committed: the select shows the new value, pending.
  await expect(page.getByTestId('inspector-param-model')).toHaveAttribute('data-pending', 'true')
  // Only when… is offered but never the default.
  const fix = row.getByTestId('repair-fix')
  await expect(fix.locator('option')).toHaveText([/Only when Raspberry Pi 1's Model is Pi 4/, /Remap/, /Detach/, /Leave broken/])
  await expect(fix).toHaveValue('leave')

  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `${testInfo.project.name}.png`) })
  if (testInfo.project.name.endsWith('phone')) {
    // A bottom sheet at phone width, full width, with Apply/Cancel at least 44px tall.
    await expect(dialog).toHaveAttribute('data-layout', 'sheet')
    const box = await dialog.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(388)
    for (const id of ['repair-apply', 'repair-cancel']) {
      expect((await page.getByTestId(id).boundingBox())?.height).toBeGreaterThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  } else {
    await expect(dialog).toHaveAttribute('data-layout', 'modal')
  }

  // Cancel: the select reverts, and nothing changed.
  await page.getByTestId('repair-cancel').click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('inspector-param-model')).toHaveValue('4')
  expect(await centerOf(page, 'Cube 1')).toEqual(snapped)

  // Again, with Detach.
  await page.getByTestId('inspector-param-model').selectOption('5')
  await expect(dialog).toBeVisible()
  await page.getByTestId('repair-row').getByTestId('repair-fix').selectOption('detach')
  await page.getByTestId('repair-apply').click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('inspector-param-model')).toHaveValue('5')
  const detached = await centerOf(page, 'Cube 1')
  for (let axis = 0; axis < 3; axis += 1) expect(detached[axis]).toBeCloseTo(snapped[axis], 1)

  // One Undo: back to a Pi 4, with the snap row back in History.
  await undo(page)
  await selectFromList(page, 'pi')
  await expect(page.getByTestId('inspector-param-model')).toHaveValue('4')
  await openHistory(page)
  await expect(page.getByTestId('timeline-rows')).toContainText('Snap')
  await expect(page.getByTestId('chip-broken')).toHaveCount(0)
})

test('Leave broken flags the Pi, the cube and the History row; Resolve… reopens the dialog and a Remap clears it', async ({ page }) => {
  await seedPiAndCube(page)
  await snapCubeTo(page, 'avjack')
  await chooseModel(page, '5')
  await expect(page.getByTestId('repair-dialog')).toBeVisible()
  await page.getByTestId('repair-apply').click() // Leave broken is the default
  await expect(page.getByTestId('repair-dialog')).toHaveCount(0)

  // The Pi's banner.
  await expect(page.getByTestId('dependents-banner')).toContainText("1 item refers to parts this Pi 5 doesn't have")
  // The cube still renders (its last good pose) and carries its own banner.
  await expectBodyCount(page, 2)
  await selectFromList(page, 'cube')
  await expect(page.getByTestId('references-banner')).toContainText('Snapped to Raspberry Pi 1 ▸ avjack, which no longer exists')
  // Still *drawn* where it now is, not only measured there: a click on the gizmo hub's
  // spot (the cube's centre on screen) with nothing selected picks the cube, which only
  // happens if its mesh is there. The snap row keeps its id, and a mesh cache keyed on
  // the id alone kept drawing the cube at its snapped pose (found hand-driving).
  // The gizmo is positioned per frame, so wait for it to settle before reading its spot.
  const hubBox = () => page.getByTestId('gizmo-hub').boundingBox()
  let hub = await hubBox()
  await expect
    .poll(async () => {
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      const next = await hubBox()
      const settled = JSON.stringify(next) === JSON.stringify(hub)
      hub = next
      return settled
    })
    .toBe(true)
  await storeApi(page).run((api) => api.selection.clear())
  await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector('[data-testid="viewport-canvas"]')
    for (const type of ['pointerdown', 'pointerup']) {
      canvas?.dispatchEvent(
        new PointerEvent(type, { pointerId: 5, pointerType: 'mouse', isPrimary: true, button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true }),
      )
    }
  }, { x: (hub?.x ?? 0) + (hub?.width ?? 0) / 2, y: (hub?.y ?? 0) + (hub?.height ?? 0) / 2 })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', 'cube')
  // History badges the row with data-004's existing broken chip.
  await openHistory(page)
  await expect(page.getByTestId('chip-broken')).toHaveCount(1)
  await closeHistory(page)

  // Resolve… from the cube reopens the same dialog; Remap onto a part the Pi 5 has.
  await selectFromList(page, 'cube')
  await page.getByTestId('dependents-resolve').click()
  await expect(page.getByTestId('repair-dialog')).toBeVisible()
  const row = page.getByTestId('repair-row')
  await row.getByTestId('repair-fix').selectOption('remap')
  await row.getByTestId('repair-remap').selectOption('ethernet')
  await page.getByTestId('repair-apply').click()
  await expect(page.getByTestId('repair-dialog')).toHaveCount(0)
  await expect(page.getByTestId('references-banner')).toHaveCount(0)
  await selectFromList(page, 'pi')
  await expect(page.getByTestId('dependents-banner')).toHaveCount(0)
})

test('Only when Model is Pi 4 (whole body): the cube goes, chipped not broken; back to Pi 4 it returns snapped; survives a reload', async ({
  page,
}) => {
  await seedPiAndCube(page)
  await snapCubeTo(page, 'avjack')
  const snapped = await centerOf(page, 'Cube 1')

  await chooseModel(page, '5')
  const row = page.getByTestId('repair-row')
  await row.getByTestId('repair-fix').selectOption('condition')
  await expect(row.getByTestId('repair-scope')).toHaveValue('body')
  await page.getByTestId('repair-apply').click()
  await expect(page.getByTestId('repair-dialog')).toHaveCount(0)

  // The cube is gone from the canvas — not drawn at all — and nothing is flagged.
  await expectBodyCount(page, 1)
  await expect(page.getByTestId('dependents-banner')).toHaveCount(0)
  await openHistory(page)
  await expect(page.getByTestId('timeline-condition-chip').first()).toHaveText('if Raspberry Pi 1 = Pi 4')
  await expect(page.getByTestId('chip-broken')).toHaveCount(0)
  await closeHistory(page)

  // Back to a Pi 4: no dialog, and the cube reappears on the AV jack.
  await chooseModel(page, '4')
  await expect(page.getByTestId('repair-dialog')).toHaveCount(0)
  await expectBodyCount(page, 2)
  const back = await centerOf(page, 'Cube 1')
  for (let axis = 0; axis < 3; axis += 1) expect(back[axis]).toBeCloseTo(snapped[axis], 1)

  // Undo twice: the change back (Pi 5, cube inactive), then the whole dialog transaction.
  await undo(page)
  await expectBodyCount(page, 1)
  await undo(page)
  await expectBodyCount(page, 2)
  await openHistory(page)
  await expect(page.getByTestId('timeline-condition-chip')).toHaveCount(0)
  await closeHistory(page)

  // Redo onto the Pi 5 with the condition, then reload: still inactive, still chipped, and
  // selectable from the object list so the condition can be edited.
  await page.getByTestId('redo-button').click()
  await expectBodyCount(page, 1)
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-tone', 'saved', { timeout: 8000 })
  await page.reload()
  await expect(page.getByTestId('viewport')).toBeVisible()
  await expectBodyCount(page, 1)
  await openHistory(page)
  await expect(page.getByTestId('timeline-condition-chip').first()).toBeVisible()
  await closeHistory(page)
  await openObjectList(page)
  const inactive = page.getByTestId('objects-inactive-cube')
  await expect(inactive).toContainText('if Raspberry Pi 1 = Pi 4')
  await inactive.click()
  await expect(page.getByTestId('inspector-condition-text')).toHaveText("Only when Raspberry Pi 1's Model is Pi 4")
  // Selected but not built: no operation can use it, so none looks live (found hand-driving).
  await expect(page.getByTestId('operations-inactive-note')).toBeVisible()
  for (const op of ['fillet', 'chamfer', 'enlarge']) await expect(page.getByTestId(`operation-${op}`)).toBeDisabled()
})

test('removing a condition on a Pi 5 brings the cube back as a broken dependent, not hidden', async ({ page }) => {
  await seedPiAndCube(page)
  await snapCubeTo(page, 'avjack')
  await chooseModel(page, '5')
  await page.getByTestId('repair-row').getByTestId('repair-fix').selectOption('condition')
  await page.getByTestId('repair-apply').click()
  await expectBodyCount(page, 1)

  await openObjectList(page)
  await page.getByTestId('objects-inactive-cube').click()
  await page.getByTestId('inspector-condition-remove').click()

  await expectBodyCount(page, 2)
  await expect(page.getByTestId('references-banner')).toContainText('which no longer exists')
})

test('a case with a sub-part Subtract of clearance-avjack, Only when… this operation: kept un-cut on a Pi 5, cut again on a Pi 4', async ({
  page,
}) => {
  await storeApi(page).run((api) => {
    api.documentStore.append({ id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model: 4 } })
    api.documentStore.append({
      id: 'case',
      op: 'primitive.cuboid',
      name: 'Case 1',
      params: { size: [120, 90, 40], center: [42, 28, 10] },
    })
  })
  await expectBodyCount(page, 2)
  const uncut = (await sceneBodies(page)).find((body) => body.id === 'case')?.volume

  await openObjectList(page)
  await page.getByTestId('objects-check-case').click()
  await page.getByTestId('objects-expand-pi').click()
  await page.getByTestId('objects-part-check-pi-clearance-avjack').click()
  await page.getByTestId('operation-subtract').click()
  await expectBodyCount(page, 1)
  await expect.poll(async () => (await sceneBodies(page))[0]?.volume).not.toBe(uncut)
  const cut = (await sceneBodies(page))[0].volume

  // The Pi was consumed by the Subtract, so History's Edit is the way to its Model.
  await openHistory(page)
  const piRow = page.locator('[data-step-id="pi"]')
  await piRow.click()
  await page.getByTestId('timeline-edit').click()
  await page.getByTestId('timeline-field-model').selectOption({ label: 'Pi 5' })
  await page.getByTestId('timeline-apply').click()

  const row = page.getByTestId('repair-row')
  await expect(row.getByTestId('repair-row-relationship')).toHaveText('Subtract (operand) → clearance-avjack')
  await expect(row.getByTestId('repair-fix').locator('option', { hasText: 'Detach' })).toHaveCount(0)
  await row.getByTestId('repair-fix').selectOption('condition')
  await expect(row.getByTestId('repair-scope')).toHaveValue('operation')
  await page.getByTestId('repair-apply').click()
  await expect(page.getByTestId('repair-dialog')).toHaveCount(0)

  // The case is still there, without the cut-out. (Closing History first: a selected
  // History row previews the document at that step, which would show only the Pi.)
  await closeHistory(page)
  await expectBodyCount(page, 1)
  await expect.poll(async () => (await sceneBodies(page))[0]?.volume).toBe(uncut)

  // Back to a Pi 4: the cut-out comes back, with no dialog.
  await openHistory(page)
  await piRow.click()
  await page.getByTestId('timeline-edit').click()
  await page.getByTestId('timeline-field-model').selectOption({ label: 'Pi 4' })
  await page.getByTestId('timeline-apply').click()
  await expect(page.getByTestId('repair-dialog')).toHaveCount(0)
  await closeHistory(page)
  await expect.poll(async () => (await sceneBodies(page))[0]?.volume).toBe(cut)
})

test('Pi 4 + cube snapped to ethernet → Pi 5: no dialog, and the cube follows the jack', async ({ page }) => {
  await seedPiAndCube(page)
  await snapCubeTo(page, 'ethernet')
  const onPi4 = await centerOf(page, 'Cube 1')

  await chooseModel(page, '5')
  await expect(page.getByTestId('repair-dialog')).toHaveCount(0)
  await expect(page.getByTestId('inspector-param-model')).toHaveValue('5')
  await expect
    .poll(async () => {
      const now = await centerOf(page, 'Cube 1')
      return Math.hypot(now[0] - onPi4[0], now[1] - onPi4[1], now[2] - onPi4[2])
    })
    .toBeGreaterThan(1)
  // The Inspector's Position fields read the moved cube, not the old one.
  await selectFromList(page, 'cube')
  const moved = await centerOf(page, 'Cube 1')
  await expect(page.getByTestId('inspector-position-y')).not.toHaveValue(String(onPi4[1]))
  expect(moved).not.toEqual(onPi4)
})

test('a drilled-into part shows its parent’s Model read-only, with a way back to the whole Pi', async ({ page }) => {
  await seedPiAndCube(page)
  await openObjectList(page)
  await page.getByTestId('objects-expand-pi').click()
  await page.getByTestId('objects-part-pi-ethernet').click()
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('ethernet')
  await expect(page.getByTestId('inspector-parent-param-model')).toHaveValue('Pi 4')
  await expect(page.getByTestId('inspector-params-parent-note')).toContainText('Select the whole Raspberry Pi 1 to change its model')
  await page.getByTestId('inspector-params-select-parent').click()
  await expect(page.getByTestId('inspector-param-model')).toBeEnabled()
})

test('a drilled-into part that an Undo takes away falls back to the whole body (Pi 5 camera0 → Pi 4)', async ({ page }) => {
  /** @type {string[]} */
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await seedPiAndCube(page)
  await chooseModel(page, '5')
  await expect(page.getByTestId('inspector-param-model')).toHaveValue('5')
  // `camera0` is a Pi 5 part — the Pi 4 has `camera`.
  await page.getByTestId('inspector-part-camera0').scrollIntoViewIfNeeded()
  await page.getByTestId('inspector-part-camera0').click()
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('camera0')

  await undo(page)

  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveCount(0)
  await expect(page.getByTestId('inspector-breadcrumb-body')).toHaveText('Raspberry Pi 1')
  await expect(page.getByTestId('inspector-param-model')).toHaveValue('4')
  expect(errors).toEqual([])
})
