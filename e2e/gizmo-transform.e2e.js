import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Gizmo drag ↔ numeric-field sync (TODO/ui-012), driven against `/` — the
 * running app, not a Storybook iframe.
 *
 * Runs the full 3 viewport × 3 engine matrix from `playwright.config.js`:
 *
 * - **Viewports**, because a gizmo handle is explicitly *not* the same control at
 *   phone width: `docs/decisions/interaction-model-qa.md` control 4 Q16 requires a
 *   larger invisible hit-test radius for a fingertip, and the Inspector's fields
 *   are edited through an on-screen keyboard in a bottom sheet rather than beside
 *   the viewport. "Same as desktop" would be a false claim.
 * - **Engines**, because the drag maths reads a camera the WebGL frame was drawn
 *   with, the preview is a real three.js object transform, and pointer capture on
 *   an SVG element is exactly the kind of thing that diverges between Chromium,
 *   Gecko and WebKit (CLAUDE.md Browser Support).
 *
 * The load-bearing test here is **"exactly one body after a move"**. A transform
 * is an appended record with its own id and its own entry in the evaluated scene,
 * so the natural implementation renders the moved body *and* the one it moved
 * from — the body doubles on the very first drag. That is the inverse of
 * `TODO/ACCEPTANCE.md` scenario 1's regression and just as visible to a user, and
 * it is what `src/core/document.js`'s supersession mechanism exists to prevent.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'gizmo-transform-snapshots')

/**
 * Open the Library if this viewport keeps it behind a tab.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (await rows.isVisible()) return
  await page.getByTestId('library-tab').click()
  await expect(rows).toBeVisible()
}

/**
 * Put the Library away so the Inspector can claim the single phone-width sheet
 * slot. A no-op at tablet and laptop width, where both are persistent columns.
 *
 * @param {import('@playwright/test').Page} page
 */
async function closeLibrary(page) {
  const tab = page.getByTestId('library-tab')
  if (!(await tab.isVisible())) return
  if (await page.getByTestId('library-rows').isVisible()) await tab.click()
  await expect(page.getByTestId('library-rows')).toBeHidden()
}

/**
 * Drag a Library row into the viewport and release inside it. Real
 * `PointerEvent`s rather than Playwright's mouse API, for the same reason
 * `primitive-placement.e2e.js` does it: one helper drives every engine including
 * the ones with no touch emulation.
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
 * @returns {Promise<{ id: string, name: string, center: number[] }[]>}
 */
function sceneBodies(page) {
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      name: node.getAttribute('data-body-name') ?? '',
      center: (node.getAttribute('data-body-center') ?? '').split(',').map(Number),
    })),
  )
}

/**
 * A Transform field's number, with the unit suffix the field displays stripped.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 * @returns {Promise<number>}
 */
async function fieldNumber(page, testId) {
  const raw = await page.getByTestId(testId).inputValue()
  return Number(raw.replace(/[°\s]/g, ''))
}

/**
 * Drive a drag on one gizmo handle, pausing mid-way so the caller can look at
 * the app *during* the gesture — which is the whole point of this spec, and
 * something a single before/after assertion could never see.
 *
 * The handle's own geometry decides the direction: dragging along an axis arm's
 * screen image is what moves the body along that axis, and that image depends on
 * where the camera happens to be.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testId Hit-target test id, e.g. `gizmo-grab-arm-x`.
 * @param {object} options
 * @param {number} options.distancePx How far along the handle to drag.
 * @param {(page: import('@playwright/test').Page) => Promise<void>} [options.midDrag]
 * @param {boolean} [options.tangential] Drag across the handle rather than along
 *   it — what a rotate ring needs.
 */
async function dragHandle(page, testId, { distancePx, midDrag, tangential = false }) {
  // The gizmo is drawn from the viewport's *render callback*, so it appears a
  // frame after the selection it belongs to. `data-selected-id` flipping is
  // therefore not proof the handles exist yet — waiting on the handle itself is.
  await expect(page.locator(`[data-testid="${testId}"]`)).toBeAttached()
  const plan = await page.evaluate(
    ({ testId, distancePx, tangential }) => {
      const el = document.querySelector(`[data-testid="${testId}"]`)
      const view = document.querySelector('[data-testid="viewport"]')
      if (!el || !view) throw new Error(`missing handle ${testId}`)
      const gizmo = document.querySelector('[data-testid="transform-gizmo"]')
      const [ox, oy] = (gizmo?.getAttribute('data-origin') ?? '0,0').split(',').map(Number)
      const rect = view.getBoundingClientRect()
      const box = el.getBoundingClientRect()
      // Grab the middle of the handle's own box, wherever the camera has put it.
      const startX = box.left + box.width / 2
      const startY = box.top + box.height / 2
      // Outward from the gizmo hub, or at right angles to that for a ring.
      let dx = startX - (rect.left + ox)
      let dy = startY - (rect.top + oy)
      const length = Math.hypot(dx, dy) || 1
      dx /= length
      dy /= length
      const [ux, uy] = tangential ? [-dy, dx] : [dx, dy]
      return {
        startX,
        startY,
        endX: startX + ux * distancePx,
        endY: startY + uy * distancePx,
      }
    },
    { testId, distancePx, tangential },
  )

  /**
   * @param {string} type
   * @param {number} t
   */
  const step = (type, t) =>
    page.evaluate(
      ({ testId, type, x, y }) => {
        const el = document.querySelector(`[data-testid="${testId}"]`)
        if (!el) throw new Error(`missing handle ${testId}`)
        el.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 21,
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
      },
      {
        testId,
        type,
        x: plan.startX + (plan.endX - plan.startX) * t,
        y: plan.startY + (plan.endY - plan.startY) * t,
      },
    )

  await step('pointerdown', 0)
  for (const t of [0.2, 0.45, 0.7]) await step('pointermove', t)
  await page.waitForTimeout(60)
  if (midDrag) await midDrag(page)
  await step('pointermove', 1)
  await page.waitForTimeout(40)
  await step('pointerup', 1)
  await page.waitForTimeout(120)
}

/**
 * Type an absolute value into one Transform field and commit it with Enter.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 * @param {number} value
 */
async function typeIntoField(page, testId, value) {
  const field = page.getByTestId(testId)
  await field.click()
  await field.fill(String(value))
  await field.press('Enter')
  await page.waitForTimeout(140)
}

/**
 * The three dimension lines' measured lengths, in millimetres.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Record<string, number>>}
 */
async function dimensionLengths(page) {
  const entries = await page.$$eval('[data-testid^="dimension-"][data-length-mm]', (nodes) =>
    nodes.map((node) => [
      node.getAttribute('data-testid') ?? '',
      Number(node.getAttribute('data-length-mm')),
    ]),
  )
  return Object.fromEntries(entries)
}

/**
 * Place one cube and leave it selected, with the Inspector's fields readable.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ fx?: number, fy?: number }} [where]
 */
async function placeCube(page, { fx = 0.45, fy = 0.4 } = {}) {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx, fy })
  await closeLibrary(page)
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(1)
  await expect(page.getByTestId('inspector-transform')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('the gizmo mounts draggable hit targets, larger than the handles they cover', async ({
  page,
}) => {
  // Reachability, per CLAUDE.md: a control that is not in the app's real render
  // tree is not shipped, whatever its own component tests say.
  await placeCube(page)
  await expect(page.locator('[data-testid^="gizmo-grab-ring-"]')).toHaveCount(3)
  const arms = await page.locator('[data-testid^="gizmo-grab-arm-"]').count()
  expect(arms).toBeGreaterThanOrEqual(2)

  // The hit target is genuinely fatter than the 2.5px arm it stands for — the
  // whole point of Q16's "larger invisible hit-test radius".
  const strokePx = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="gizmo-grab-arm-x"]')
    return el ? Number.parseFloat(getComputedStyle(el).strokeWidth) : 0
  })
  expect(strokePx).toBeGreaterThanOrEqual(20)
})

test('dragging a translate arm moves the body, and the Position fields track it live', async ({
  page,
}, testInfo) => {
  await placeCube(page)
  const [before] = await sceneBodies(page)
  const startX = await fieldNumber(page, 'inspector-position-x')

  /** @type {number | null} */
  let duringDrag = null
  await dragHandle(page, 'gizmo-grab-arm-x', {
    distancePx: 70,
    async midDrag(page) {
      // The claim control 4 makes in one sentence, and the one a before/after
      // assertion cannot make: the fields move *with* the drag, not at release.
      await expect(page.getByTestId('viewport')).toHaveAttribute('data-transforming', 'true')
      duringDrag = await fieldNumber(page, 'inspector-position-x')
    },
  })

  expect(duringDrag).not.toBeNull()
  expect(Math.abs(/** @type {number} */ (duringDrag) - startX)).toBeGreaterThan(0.5)

  // Released: the preview is gone and the document has caught up.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-transforming', 'false')
  const [after] = await sceneBodies(page)

  // *** The regression this task exists to prevent. ***
  const bodies = await sceneBodies(page)
  expect(bodies).toHaveLength(1)
  expect(after.id).toBe(before.id)
  expect(Math.abs(after.center[0] - before.center[0])).toBeGreaterThan(0.5)

  // The mesh and the field agree — one mutation, not two views of two states.
  const endX = await fieldNumber(page, 'inspector-position-x')
  expect(endX).toBeCloseTo(after.center[0], 1)
  // And the mid-drag reading was on the way to the final one, not a stale value.
  expect(Math.abs(endX - startX)).toBeGreaterThan(0.5)

  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `moved-${testInfo.project.name}.png`) })
})

test('typing an absolute position moves the mesh to match', async ({ page }) => {
  await placeCube(page)
  const [before] = await sceneBodies(page)

  await typeIntoField(page, 'inspector-position-x', 62.5)

  const [after] = await sceneBodies(page)
  expect(await sceneBodies(page)).toHaveLength(1)
  expect(after.center[0]).toBeCloseTo(62.5, 1)
  // Only the axis that was typed moves.
  expect(after.center[1]).toBeCloseTo(before.center[1], 1)
  expect(after.center[2]).toBeCloseTo(before.center[2], 1)
  expect(await fieldNumber(page, 'inspector-position-x')).toBeCloseTo(62.5, 1)
})

test('a drag and a typed value are the same mutation, in either order', async ({ page }) => {
  // The "both directions stay in sync" half of ui-012's Done-when: drag, then
  // read the field; type, then read the mesh. Neither may drift from the other.
  await placeCube(page)
  await dragHandle(page, 'gizmo-grab-arm-x', { distancePx: 55 })
  const dragged = await fieldNumber(page, 'inspector-position-x')
  const [afterDrag] = await sceneBodies(page)
  expect(dragged).toBeCloseTo(afterDrag.center[0], 1)

  await typeIntoField(page, 'inspector-position-y', 33)
  const [afterType] = await sceneBodies(page)
  // The typed axis moved, and the previously *dragged* axis stayed where the
  // drag left it — a second mutation must build on the first, not replace it.
  expect(afterType.center[1]).toBeCloseTo(33, 1)
  expect(afterType.center[0]).toBeCloseTo(afterDrag.center[0], 1)
  expect(await sceneBodies(page)).toHaveLength(1)
})

test('typing a rotation turns the mesh, and the dimensions prove it really turned', async ({
  page,
}) => {
  await placeCube(page)
  const before = await dimensionLengths(page)
  expect(before['dimension-x']).toBeCloseTo(40, 1)

  await typeIntoField(page, 'inspector-rotation-z', 45)

  expect(await fieldNumber(page, 'inspector-rotation-z')).toBeCloseTo(45, 1)
  // A 40 mm cube turned 45° about Z has a bounding box 40·√2 ≈ 56.57 mm across.
  // Asserting the *measured solid* rather than the field is what proves the
  // kernel actually rotated the geometry instead of the number changing alone.
  await expect
    .poll(async () => (await dimensionLengths(page))['dimension-x'])
    .toBeCloseTo(40 * Math.SQRT2, 0)
  expect(await sceneBodies(page)).toHaveLength(1)
  // Turned on the spot, not swung around the world origin.
  const [after] = await sceneBodies(page)
  expect(after.center[2]).toBeCloseTo(20, 0)
})

test('dragging a rotate ring turns the body and the Rotation fields track it live', async ({
  page,
}) => {
  await placeCube(page)

  /** @type {number | null} */
  let duringDrag = null
  await dragHandle(page, 'gizmo-grab-ring-z', {
    distancePx: 60,
    tangential: true,
    async midDrag(page) {
      await expect(page.getByTestId('viewport')).toHaveAttribute('data-transforming', 'true')
      duringDrag = await fieldNumber(page, 'inspector-rotation-z')
    },
  })

  expect(duringDrag).not.toBeNull()
  expect(Math.abs(/** @type {number} */ (duringDrag))).toBeGreaterThan(1)
  const settled = await fieldNumber(page, 'inspector-rotation-z')
  expect(Math.abs(settled)).toBeGreaterThan(1)
  expect(await sceneBodies(page)).toHaveLength(1)
})

test('transforming one body leaves the other exactly where it was', async ({ page }) => {
  // ACCEPTANCE.md scenario 1's guarantee, restated for the mutation this task
  // adds: no cross-talk through the document fold, and no body that quietly
  // vanishes or doubles because a *different* one moved.
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.28, fy: 0.42 })
  await dragRowIntoViewport(page, { op: 'primitive.cylinder', fx: 0.72, fy: 0.3 })
  await closeLibrary(page)
  const before = await sceneBodies(page)
  expect(before).toHaveLength(2)

  // The cylinder is the current selection, having just been dropped.
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(1)
  await typeIntoField(page, 'inspector-position-x', -70)

  const after = await sceneBodies(page)
  expect(after).toHaveLength(2)
  expect(after.map((body) => body.id)).toEqual(before.map((body) => body.id))
  const movedBefore = before[1]
  const movedAfter = after[1]
  const stillBefore = before[0]
  const stillAfter = after[0]
  expect(movedAfter.center[0]).toBeCloseTo(-70, 1)
  expect(movedAfter.center[0]).not.toBeCloseTo(movedBefore.center[0], 1)
  // The untouched body is byte-for-byte where it was.
  expect(stillAfter.center).toEqual(stillBefore.center)
})

test('a press on a handle that never moves still selects what is underneath', async ({ page }) => {
  // A gizmo-shaped dead zone over the very solid the gizmo is attached to would
  // be its own bug — the same class as ui-011's "the overlays never swallow the
  // click that selects", now that the overlay finally does take pointer events.
  await placeCube(page)
  const [cube] = await sceneBodies(page)

  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="viewport-canvas"]')
    const box = canvas.getBoundingClientRect()
    for (const type of ['pointerdown', 'pointerup']) {
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 5,
          pointerType: 'mouse',
          isPrimary: true,
          button: 0,
          clientX: box.left + 6,
          clientY: box.top + 6,
          bubbles: true,
          cancelable: true,
        }),
      )
    }
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', '')

  // Nothing is selected, so there is no gizmo to press — select the cube by
  // clicking it, then press (without moving) on one of its own arm handles.
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="viewport-canvas"]')
    const box = canvas.getBoundingClientRect()
    for (const type of ['pointerdown', 'pointerup']) {
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 6,
          pointerType: 'mouse',
          isPrimary: true,
          button: 0,
          clientX: box.left + box.width * 0.45,
          clientY: box.top + box.height * 0.36,
          bubbles: true,
          cancelable: true,
        }),
      )
    }
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cube.id)

  const centreBefore = (await sceneBodies(page))[0].center
  await dragHandle(page, 'gizmo-grab-arm-x', { distancePx: 0 })
  // Nothing moved, nothing was appended, and the selection survived.
  expect((await sceneBodies(page))[0].center).toEqual(centreBefore)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cube.id)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-transforming', 'false')
})

test('the Transform fields say they are editable, and the params say they are not', async ({
  page,
}) => {
  await placeCube(page)
  // ui-011's blanket "read-only for now" note has to be gone: a stale instruction
  // is worse than none, because a user believes it and never tries.
  await expect(page.getByTestId('inspector-readonly-note')).toHaveCount(0)
  await expect(page.getByTestId('inspector-transform-note')).toBeVisible()

  await expect(page.getByTestId('inspector-position-x')).not.toHaveAttribute('readonly', '')
  await expect(page.getByTestId('inspector-rotation-z')).not.toHaveAttribute('readonly', '')
  // Still read-only, and deliberately so — resizing is a different mutation.
  await expect(page.getByTestId('inspector-size-x')).toHaveAttribute('readonly', '')
  await expect(page.getByTestId('inspector-param-size-x')).toHaveAttribute('readonly', '')
})

test('a rejected value restores the field rather than moving the body', async ({ page }) => {
  await placeCube(page)
  const [before] = await sceneBodies(page)

  await typeIntoField(page, 'inspector-position-x', /** @type {any} */ ('not a number'))

  // The field snaps back to the document's own value, and nothing moved.
  expect(await fieldNumber(page, 'inspector-position-x')).toBeCloseTo(before.center[0], 1)
  const [after] = await sceneBodies(page)
  expect(after.center).toEqual(before.center)
  expect(await sceneBodies(page)).toHaveLength(1)
})

test('the page never scrolls sideways with the gizmo handles mounted', async ({ page }) => {
  await placeCube(page)
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }))
  expect(overflow.x).toBeLessThanOrEqual(1)
  expect(overflow.y).toBeLessThanOrEqual(1)
})
