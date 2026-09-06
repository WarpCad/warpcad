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
 * @param {number} [options.grabFraction] Where along an **arm's** own hit-target
 *   line (`x1,y1` → `x2,y2`) to press, as a fraction from the hub end. Defaults
 *   to the drawn line's own bounding-box midpoint (the previous, only, choice) —
 *   fine for an actual drag, which cares about the delta, not the exact start
 *   point. `TODO/ui-017` made the arm's length track the selected body's own
 *   on-screen size, so a handle long enough to clear a large body can now put
 *   its *midpoint* outside that body's own silhouette; a caller testing what a
 *   stationary press "falls through to" needs a point nearer the hub, which
 *   `Gizmo.vue`'s own header comment says is deliberately left inside the
 *   body's clear zone (`ARM_GRAB_FROM`).
 */
async function dragHandle(
  page,
  testId,
  { distancePx, midDrag, tangential = false, grabFraction },
) {
  // The gizmo is drawn from the viewport's *render callback*, so it appears a
  // frame after the selection it belongs to. `data-selected-id` flipping is
  // therefore not proof the handles exist yet — waiting on the handle itself is.
  await expect(page.locator(`[data-testid="${testId}"]`)).toBeAttached()
  const plan = await page.evaluate(
    ({ testId, distancePx, tangential, grabFraction }) => {
      const el = document.querySelector(`[data-testid="${testId}"]`)
      const view = document.querySelector('[data-testid="viewport"]')
      if (!el || !view) throw new Error(`missing handle ${testId}`)
      const gizmo = document.querySelector('[data-testid="transform-gizmo"]')
      const [ox, oy] = (gizmo?.getAttribute('data-origin') ?? '0,0').split(',').map(Number)
      const rect = view.getBoundingClientRect()

      let startX
      let startY
      if (grabFraction != null && el.hasAttribute('x1')) {
        // The SVG overlay sits at the viewport's own origin with no extra
        // scaling, so its line-endpoint attributes are already CSS pixels
        // relative to `rect`.
        const x1 = Number(el.getAttribute('x1'))
        const y1 = Number(el.getAttribute('y1'))
        const x2 = Number(el.getAttribute('x2'))
        const y2 = Number(el.getAttribute('y2'))
        startX = rect.left + x1 + (x2 - x1) * grabFraction
        startY = rect.top + y1 + (y2 - y1) * grabFraction
      } else {
        // Grab the middle of the handle's own box, wherever the camera has put it.
        const box = el.getBoundingClientRect()
        startX = box.left + box.width / 2
        startY = box.top + box.height / 2
      }
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
    { testId, distancePx, tangential, grabFraction: grabFraction ?? null },
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
 * Which frame each dimension line says it measured in (`TODO/ui-023`) — `world`
 * while the body is unrotated, `local` once it is turned.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Record<string, string>>}
 */
async function dimensionFrames(page) {
  const entries = await page.$$eval('[data-testid^="dimension-"][data-frame]', (nodes) =>
    nodes.map((node) => [node.getAttribute('data-testid') ?? '', node.getAttribute('data-frame') ?? '']),
  )
  return Object.fromEntries(entries)
}

/**
 * The on-screen angle of one dimension line, in degrees.
 *
 * Read off the drawn `<line>` rather than computed, so it measures what a user
 * actually sees. Used to show that a rotated part's line swings round with the
 * part even while its *number* stays put — the two halves of `ui-023`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testId e.g. `dimension-x`.
 * @returns {Promise<number>}
 */
async function dimensionLineAngle(page, testId) {
  const angle = await page.evaluate((id) => {
    const line = document.querySelector(`[data-testid="${id}"] .dims__line`)
    if (!line) return null
    const read = (name) => Number(line.getAttribute(name))
    return (Math.atan2(read('y2') - read('y1'), read('x2') - read('x1')) * 180) / Math.PI
  }, testId)
  expect(angle).not.toBeNull()
  return /** @type {number} */ (angle)
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

test('typing a rotation turns the mesh, and the dimensions still read the cube s own 40 mm (TODO/ui-023)', async ({
  page,
}) => {
  await placeCube(page)
  const before = await dimensionLengths(page)
  expect(before['dimension-x']).toBeCloseTo(40, 1)
  expect(await dimensionFrames(page)).toMatchObject({ 'dimension-x': 'world' })
  const lineBefore = await dimensionLineAngle(page, 'dimension-x')

  await typeIntoField(page, 'inspector-rotation-z', 45)

  expect(await fieldNumber(page, 'inspector-rotation-z')).toBeCloseTo(45, 1)
  // `ui-023`: a 40 mm cube turned 45° about Z is still a 40 mm cube. Before that
  // finding this read 40·√2 ≈ 56.57 mm — the width of the *world-axis box* the
  // turned cube fits inside, a number that describes no edge of the part and
  // that a user cannot act on. The line must now quote the part's own edge.
  await expect
    .poll(async () => (await dimensionLengths(page))['dimension-x'])
    .toBeCloseTo(40, 1)
  await expect(page.getByTestId('dimension-x')).toHaveAttribute('data-frame', 'local')

  // The panel and the overlay measure the same thing, so they can never quote a
  // rotated part at two different sizes.
  expect(await fieldNumber(page, 'inspector-size-x')).toBeCloseTo(40, 1)

  // ...and it really did turn: the *line* swung round with the cube even though
  // its number did not, which is the half a stable number alone cannot show.
  const lineAfter = await dimensionLineAngle(page, 'dimension-x')
  expect(Math.abs(lineAfter - lineBefore)).toBeGreaterThan(5)

  expect(await sceneBodies(page)).toHaveLength(1)
  // Turned on the spot, not swung around the world origin.
  const [after] = await sceneBodies(page)
  expect(after.center[2]).toBeCloseTo(20, 0)
})

test('a rotate-ring drag leaves a cylinder s own diameter and length on the dimension lines (TODO/ui-023)', async ({
  page,
}) => {
  // The finding's own worked example, driven through the real trigger rather
  // than a typed field: tilt a cylinder about a horizontal axis and the three
  // numbers must still be its diameter, its diameter and its length. Under the
  // old world-axis measurement two of the three grew with the tilt and neither
  // of those numbers was a dimension of the part at all.
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cylinder', fx: 0.45, fy: 0.4 })
  await closeLibrary(page)
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(1)

  const before = await dimensionLengths(page)
  expect(before['dimension-x']).toBeCloseTo(40, 1)
  expect(before['dimension-y']).toBeCloseTo(40, 1)
  expect(before['dimension-z']).toBeCloseTo(50, 1)

  await dragHandle(page, 'gizmo-grab-ring-x', { distancePx: 70, tangential: true })

  // It genuinely turned — the assertion below is worthless if it did not.
  const turnedBy = await fieldNumber(page, 'inspector-rotation-x')
  expect(Math.abs(turnedBy)).toBeGreaterThan(5)

  // Whatever angle the drag happened to land on, the part's own three numbers
  // are unchanged. That is a stronger claim than checking one fixed angle: the
  // measurement must not depend on the rotation at all.
  await expect.poll(async () => (await dimensionLengths(page))['dimension-y']).toBeCloseTo(40, 1)
  const after = await dimensionLengths(page)
  expect(after['dimension-x']).toBeCloseTo(40, 1)
  expect(after['dimension-z']).toBeCloseTo(50, 1)

  const frames = await dimensionFrames(page)
  expect(frames).toMatchObject({
    'dimension-x': 'local',
    'dimension-y': 'local',
    'dimension-z': 'local',
  })

  expect(await sceneBodies(page)).toHaveLength(1)
})

test('two rotate rings in a row leave a cylinder s own diameter and length on the lines, and a typed rotation still lands (TODO/core-004)', async ({
  page,
}) => {
  // `core-004`'s own reproduction, driven through the real triggers: drag the Z
  // rotate ring, then the X rotate ring. That is an **out-of-order** history, and
  // it is what a user reaches simply by grabbing one ring and then another.
  //
  // The carried rotation used to be the *sum* of those two deltas while the solid
  // was their *composition*, so the un-turn behind the dimension lines missed and
  // the numbers drifted back toward the world-axis box `ui-023` had just stopped
  // them reporting — measured at 46.82 / 51.05 / 59.42 on this very cylinder for
  // a 45°/45° pair, and 50 / 40 / 40 for a 90°/90° one.
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cylinder', fx: 0.45, fy: 0.4 })
  await closeLibrary(page)
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(1)

  const before = await dimensionLengths(page)
  expect(before['dimension-x']).toBeCloseTo(40, 1)
  expect(before['dimension-y']).toBeCloseTo(40, 1)
  expect(before['dimension-z']).toBeCloseTo(50, 1)

  // First ring: Z. Then a second, different ring: X. Two records, two axes, in
  // the order that used to break.
  await dragHandle(page, 'gizmo-grab-ring-z', { distancePx: 70, tangential: true })
  const afterFirst = await fieldNumber(page, 'inspector-rotation-z')
  expect(Math.abs(afterFirst)).toBeGreaterThan(5)

  await dragHandle(page, 'gizmo-grab-ring-x', { distancePx: 70, tangential: true })

  // Both turns really happened — the assertions below are worthless otherwise.
  // Checked as an orientation rather than as one field, because composing (unlike
  // adding) is free to express the same orientation with a different triple.
  const turned = [
    await fieldNumber(page, 'inspector-rotation-x'),
    await fieldNumber(page, 'inspector-rotation-y'),
    await fieldNumber(page, 'inspector-rotation-z'),
  ]
  expect(turned.some((angle) => Math.abs(angle) > 5)).toBe(true)
  expect(turned.filter((angle) => Math.abs(angle) > 0.5).length).toBeGreaterThanOrEqual(2)

  // Whatever the two drags landed on, the part's own three numbers are its
  // diameter, its diameter and its length. Turning something does not resize it.
  await expect.poll(async () => (await dimensionLengths(page))['dimension-z']).toBeCloseTo(50, 1)
  const after = await dimensionLengths(page)
  expect(after['dimension-x']).toBeCloseTo(40, 1)
  expect(after['dimension-y']).toBeCloseTo(40, 1)

  expect(await dimensionFrames(page)).toMatchObject({
    'dimension-x': 'local',
    'dimension-y': 'local',
    'dimension-z': 'local',
  })

  // Consequence 2 of the finding: typing an absolute rotation on top of an
  // out-of-order history has to land on the typed value, not on
  // `target − current` applied to an orientation the body was never in. Editing
  // one field means "set this axis, leave the other two", so the other two are
  // captured first and asserted to stay put — a typed X that quietly dragged Y
  // and Z along with it would be the same class of bug in a new place.
  const heldY = await fieldNumber(page, 'inspector-rotation-y')
  const heldZ = await fieldNumber(page, 'inspector-rotation-z')

  await typeIntoField(page, 'inspector-rotation-x', 90)
  await expect
    .poll(async () => await fieldNumber(page, 'inspector-rotation-x'))
    .toBeCloseTo(90, 1)
  expect(await fieldNumber(page, 'inspector-rotation-y')).toBeCloseTo(heldY, 1)
  expect(await fieldNumber(page, 'inspector-rotation-z')).toBeCloseTo(heldZ, 1)

  // And it is still the same cylinder: 40 / 40 / 50 on its own axes, after a
  // typed absolute rotation applied on top of a two-ring history.
  const typed = await dimensionLengths(page)
  expect(typed['dimension-x']).toBeCloseTo(40, 1)
  expect(typed['dimension-y']).toBeCloseTo(40, 1)
  expect(typed['dimension-z']).toBeCloseTo(50, 1)

  // Zeroing all three fields returns it to flat rather than to some residue of
  // the history it came through — which the lines report by going back to
  // measuring in the `world` frame at the cylinder's own upright 40 / 40 / 50.
  for (const axis of ['z', 'y', 'x']) {
    await typeIntoField(page, `inspector-rotation-${axis}`, 0)
  }
  await expect.poll(async () => (await dimensionFrames(page))['dimension-x']).toBe('world')
  const flat = await dimensionLengths(page)
  expect(flat['dimension-x']).toBeCloseTo(40, 1)
  expect(flat['dimension-y']).toBeCloseTo(40, 1)
  expect(flat['dimension-z']).toBeCloseTo(50, 1)

  expect(await sceneBodies(page)).toHaveLength(1)
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
  // `TODO/ui-017`: the arm's hit target now extends far enough to clear a large
  // body's own silhouette, so its rendered *midpoint* is no longer guaranteed to
  // sit over the body — press near the hub end instead, which `Gizmo.vue`'s own
  // `ARM_GRAB_FROM` deliberately keeps inside the body's clear zone regardless
  // of how long the arm grows.
  await dragHandle(page, 'gizmo-grab-arm-x', { distancePx: 0, grabFraction: 0.05 })
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

/**
 * The X arm's, and the same axis's ring's, screen geometry, read straight from
 * the rendered SVG — no maths of our own, just what `annotate.js` already wrote
 * (TODO/ui-017).
 *
 * There is no way to drop a primitive at a custom size yet (the Library always
 * drops at its registry defaults, and the Inspector's Parameters/Size fields are
 * read-only — `inspector-param-size-x` and `inspector-size-x` above), so this
 * varies the body's **on-screen** bounding box the way `ui-017`'s own Goal
 * describes doing it — "growing and shrinking with it as the user zooms" — via
 * the reachable `nav-zoom-in`/`nav-zoom-out` chrome, rather than via a "large
 * cube vs. small cube" pair the app cannot actually place yet.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{
 *   originX: number, originY: number, armPx: number, ringPx: number,
 *   armTipX: number, armTipY: number, grabTipX: number, grabTipY: number,
 * } | null>}
 */
function gizmoXGeometry(page) {
  return page.evaluate(() => {
    const gizmo = document.querySelector('[data-testid="transform-gizmo"]')
    const arm = document.querySelector('[data-testid="gizmo-arm-x"]')
    const grabArm = document.querySelector('[data-testid="gizmo-grab-arm-x"]')
    const ring = document.querySelector('[data-testid="gizmo-ring-x"]')
    if (!gizmo || !arm || !grabArm || !ring) return null
    const [originX, originY] = (gizmo.getAttribute('data-origin') ?? '0,0').split(',').map(Number)
    const armTipX = Number(arm.getAttribute('x2'))
    const armTipY = Number(arm.getAttribute('y2'))
    const armPx = Math.hypot(armTipX - originX, armTipY - originY)
    const points = (ring.getAttribute('points') ?? '')
      .trim()
      .split(' ')
      .map((pair) => pair.split(',').map(Number))
    const ringPx = points.reduce(
      (max, [x, y]) => Math.max(max, Math.hypot(x - originX, y - originY)),
      0,
    )
    return {
      originX,
      originY,
      armPx,
      ringPx,
      armTipX,
      armTipY,
      grabTipX: Number(grabArm.getAttribute('x2')),
      grabTipY: Number(grabArm.getAttribute('y2')),
    }
  })
}

/**
 * The grid readout's current millimetres-per-pixel, from the same
 * `data-scale-mm` attribute and scale-bar width `viewport-scaffold.e2e.js`
 * already reads — the only DOM-visible proxy for `overlay.mmPerPixel`.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>}
 */
async function mmPerPixelNow(page) {
  const scaleMm = Number(await page.getByTestId('grid-scale-readout').getAttribute('data-scale-mm'))
  const bar = await page.getByTestId('grid-scale-bar').boundingBox()
  return scaleMm / (bar?.width || 1)
}

test('the gizmo grows past its floor size as the selected body reads larger on screen, and shrinks back toward the floor without going under it', async ({
  page,
}) => {
  await placeCube(page)
  await page.getByTestId('nav-reset').click()
  await page.waitForTimeout(80)

  const baseline = await gizmoXGeometry(page)
  expect(baseline).not.toBeNull()

  // The gizmo genuinely clears the body's own projected bounding box at the
  // default view — not just "bigger than the old fixed constant" but "bigger
  // than the body it surrounds", the exact regression `ui-017`'s Goal describes
  // ("the rings sit inside or barely clear of the object's own silhouette").
  const baselineLengths = Object.values(await dimensionLengths(page))
  const baselineMmPerPixel = await mmPerPixelNow(page)
  const baselineHalfDiagonalPx = (0.5 * Math.hypot(...baselineLengths)) / baselineMmPerPixel
  expect(baselineLengths.length).toBeGreaterThan(0)
  expect(baseline?.armPx ?? 0).toBeGreaterThan(baselineHalfDiagonalPx)
  expect(baseline?.ringPx ?? 0).toBeGreaterThan(baselineHalfDiagonalPx)

  // The invisible hit target scales the very same way as the visible handle —
  // ui-017's own Interaction model note: the drawn arm and its grab target share
  // one tip (both come from the same `arrow.tipX/tipY` in annotate.js), so a
  // bigger ring can never visually promise a bigger target than is actually
  // clickable/tappable.
  expect(baseline?.grabTipX).toBeCloseTo(baseline?.armTipX ?? NaN, 1)
  expect(baseline?.grabTipY).toBeCloseTo(baseline?.armTipY ?? NaN, 1)

  // Zoom in hard: the same 40mm cube now covers far more of the screen, so its
  // gizmo must grow further still — the whole point of ui-017, versus the fixed
  // 58px/40px it replaces, which never responded to zoom at all. (A very large
  // on-screen body is expected to hit this module's own growth cap rather than
  // track the silhouette exactly, so this step only checks relative growth, not
  // the bounding-box comparison above.)
  for (let i = 0; i < 10; i += 1) await page.getByTestId('nav-zoom-in').click()
  await page.waitForTimeout(80)
  const zoomedIn = await gizmoXGeometry(page)
  expect(zoomedIn?.armPx ?? 0).toBeGreaterThan(baseline?.armPx ?? Infinity)
  expect(zoomedIn?.ringPx ?? 0).toBeGreaterThan(baseline?.ringPx ?? Infinity)
  // The arm still extends further than the ring at the same origin, matching
  // today's 58 > 40 ordering at every size.
  expect(zoomedIn?.armPx ?? 0).toBeGreaterThan(zoomedIn?.ringPx ?? Infinity)

  // Zoom back out, well past the original distance: the same cube now reads as
  // only a handful of screen pixels, so the gizmo must shrink — but never below
  // the floor `ui-012` already tuned as comfortably grabbable.
  for (let i = 0; i < 20; i += 1) await page.getByTestId('nav-zoom-out').click()
  await page.waitForTimeout(80)
  const zoomedOut = await gizmoXGeometry(page)
  expect(zoomedOut?.armPx ?? Infinity).toBeLessThan(zoomedIn?.armPx ?? -Infinity)
  expect(zoomedOut?.armPx ?? 0).toBeGreaterThanOrEqual(58 - 0.5)
  expect(zoomedOut?.ringPx ?? 0).toBeGreaterThanOrEqual(40 - 0.5)
})
