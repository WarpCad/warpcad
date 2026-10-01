import { test, expect } from '@playwright/test'

/**
 * Editing a selected body's **own** parameters in the Inspector (`TODO/ui-029`),
 * driven against `/` — the running app, not a Storybook iframe.
 *
 * **All three reference viewports, all three engines — no `test.skip` pin.**
 * Per this task's own Testing section: typing a diameter rebuilds kernel
 * geometry from a live user action and re-renders it, which is the same class of
 * surface `ui-016`'s and `ui-027`'s Testing sections put on the full matrix. The
 * layout is unchanged by this task, so there is no separate viewport-only run —
 * the nine projects `playwright.config.js` already builds cover both axes.
 *
 * ## What each case is actually guarding
 *
 * The interesting failure mode here is **silent**, not loud. A param edit swaps the body's
 * creation record in place and the whole log re-folds (`TODO/data-007`), so anything the
 * body has since been through must come out the other side without a word said:
 *
 * - **"a moved and turned body keeps its pose"** — the later transforms stay in the log and
 *   replay against the resized solid. Get that wrong and the body silently jumps back to
 *   where it was first dropped, un-turned, with no error anywhere.
 * - **"a filleted body stays editable"** — the rim is re-applied at the new size, and a size
 *   it no longer fits is refused with the Fillet named. Get that wrong and the fillet
 *   disappears on the next keystroke. (`ui-029` froze the fields instead.)
 * - Snapped dependents following a resize live in `snap-align-operation.e2e.js`.
 *
 * Measurements come off `data-body-bounds`/`data-body-center` (`Viewport.vue`),
 * the same DOM surface the boolean, snap/align and fillet specs already assert
 * through — real evaluated geometry, not the record's own params.
 */

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
 * Put the Library sheet away, if this viewport has one. At phone width this is
 * also what lets the Inspector's own sheet claim the single sheet slot and
 * auto-open on the current selection (`ui-011`).
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
 * Drag a Library row into the viewport and release inside it — real
 * `PointerEvent`s, matching every other spec in this folder.
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
 * The scene's bodies, with their measured world bounds.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ id: string, op: string, name: string, center: number[], bounds: number[], volumeMm3: number }[]>}
 */
function sceneBodies(page) {
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      op: node.getAttribute('data-body-op') ?? '',
      name: node.getAttribute('data-body-name') ?? '',
      center: (node.getAttribute('data-body-center') ?? '').split(',').map(Number),
      bounds: (node.getAttribute('data-body-bounds') ?? '').split(',').map(Number),
      volumeMm3: Number(node.getAttribute('data-body-volume') ?? 'NaN'),
    })),
  )
}

/**
 * `[x, y, z]` extents of a body, in millimetres.
 *
 * @param {{ bounds: number[] }} body
 * @returns {number[]}
 */
function sizeOf(body) {
  return [body.bounds[3] - body.bounds[0], body.bounds[4] - body.bounds[1], body.bounds[5] - body.bounds[2]]
}

/**
 * Type a value into an Inspector field and commit it with Enter — the trigger
 * `TODO/ui-029`'s Interaction model names, and the same one `ui-012`'s Transform
 * fields already use.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 * @param {string | number} value
 */
async function typeIntoField(page, testId, value) {
  const field = page.getByTestId(testId)
  await expect(field).toBeVisible()
  await field.click()
  await field.fill(String(value))
  await field.press('Enter')
  await page.waitForTimeout(160)
}

/**
 * A field's number, with the unit suffix the field displays stripped.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 * @returns {Promise<number>}
 */
async function fieldNumber(page, testId) {
  const raw = await page.getByTestId(testId).inputValue()
  return Number(raw.replace(/[°\s]/g, '').replace(/mm$/i, ''))
}

// A drop point central enough to be clear of the Library sheet and the
// Inspector bottom sheet at every reference viewport.
const DROP = { fx: 0.5, fy: 0.38 }

/**
 * Place one primitive, leaving it selected (a drop selects what it placed) and
 * the Inspector open on it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} op
 */
async function placeAndSelect(page, op) {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op, ...DROP })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  await expect(page.getByTestId('inspector-params')).toBeVisible()
  return (await sceneBodies(page))[0]
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('typing a new Diameter resizes the cylinder on that axis alone, and the field keeps the committed value', async ({
  page,
}) => {
  const before = await placeAndSelect(page, 'primitive.cylinder')
  expect(sizeOf(before)[0]).toBeCloseTo(40, 1)
  expect(sizeOf(before)[2]).toBeCloseTo(50, 1)

  // The Parameters section is offered as editable in the first place — this is
  // the state the guard decides, asserted before the edit rather than inferred
  // from it working.
  await expect(page.getByTestId('inspector-params')).toHaveAttribute('data-editable', 'true')
  await typeIntoField(page, 'inspector-param-diameter', 10)

  const [after] = await sceneBodies(page)
  // Still one body with the same identity: a rebuild supersedes, it does not
  // add a second lineage (`document.js`'s own doubling regression).
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  expect(after.id).toBe(before.id)
  expect(after.name).toBe(before.name)
  expect(after.op).toBe(before.op)

  const [sx, sy, sz] = sizeOf(after)
  expect(sx).toBeCloseTo(10, 1)
  expect(sy).toBeCloseTo(10, 1)
  // Height untouched — one param changed, not the whole record.
  expect(sz).toBeCloseTo(50, 1)
  // Centred where it was, not snapped back to the origin.
  expect(after.center[0]).toBeCloseTo(before.center[0], 1)
  expect(after.center[1]).toBeCloseTo(before.center[1], 1)
  expect(after.center[2]).toBeCloseTo(before.center[2], 1)

  // The field shows the committed, document-formatted value afterwards.
  expect(await fieldNumber(page, 'inspector-param-diameter')).toBeCloseTo(10, 3)
  expect(await fieldNumber(page, 'inspector-size-x')).toBeCloseTo(10, 1)
  // Nothing was rejected.
  await expect(page.getByTestId('inspector-param-error')).toHaveCount(0)
})

test('a moved and turned body keeps its pose when a parameter changes — it does not snap back to where it was dropped', async ({
  page,
}) => {
  // The specific silent-regression risk `TODO/ui-029`'s Proposed fix names: the
  // rebuilt creation record knows nothing about the transforms it supersedes, so
  // the pose has to be re-applied on top of it.
  const dropped = await placeAndSelect(page, 'primitive.cylinder')

  await typeIntoField(page, 'inspector-position-x', 60)
  await typeIntoField(page, 'inspector-position-y', -20)
  await typeIntoField(page, 'inspector-rotation-x', 30)

  const [posed] = await sceneBodies(page)
  expect(posed.center[0]).toBeCloseTo(60, 1)
  expect(posed.center[1]).toBeCloseTo(-20, 1)
  expect(await fieldNumber(page, 'inspector-rotation-x')).toBeCloseTo(30, 1)
  // The pose really did move it off its drop point, so the assertion below is
  // about something rather than trivially true.
  expect(Math.abs(posed.center[0] - dropped.center[0])).toBeGreaterThan(1)

  // A body with a transform history is still editable: transforms are exactly
  // what the guard allows, because they can be re-applied.
  await expect(page.getByTestId('inspector-params')).toHaveAttribute('data-editable', 'true')
  await typeIntoField(page, 'inspector-param-height', 20)

  const [after] = await sceneBodies(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  expect(after.id).toBe(posed.id)

  // The shape changed...
  expect(await fieldNumber(page, 'inspector-param-height')).toBeCloseTo(20, 3)
  // ...and the pose did not. Position is measured off the evaluated solid, so
  // this is the real centre, not the number in the box.
  expect(after.center[0]).toBeCloseTo(posed.center[0], 1)
  expect(after.center[1]).toBeCloseTo(posed.center[1], 1)
  expect(after.center[2]).toBeCloseTo(posed.center[2], 1)
  expect(await fieldNumber(page, 'inspector-position-x')).toBeCloseTo(60, 1)
  expect(await fieldNumber(page, 'inspector-position-y')).toBeCloseTo(-20, 1)
  // The rotation survived too — it is re-applied, not silently dropped.
  expect(await fieldNumber(page, 'inspector-rotation-x')).toBeCloseTo(30, 1)
  // The turned cylinder's own diameter is unchanged; only its length moved.
  expect(await fieldNumber(page, 'inspector-param-diameter')).toBeCloseTo(40, 3)
})

test('editing one component of a vector parameter changes that extent alone', async ({ page }) => {
  const before = await placeAndSelect(page, 'primitive.cuboid')
  const [bx, by, bz] = sizeOf(before)
  expect(bx).toBeCloseTo(40, 1)

  await typeIntoField(page, 'inspector-param-size-x', 15)

  const [after] = await sceneBodies(page)
  const [ax, ay, az] = sizeOf(after)
  expect(ax).toBeCloseTo(15, 1)
  // Y and Z are the other two components of the *same* param — an edit that
  // rewrote the whole vector rather than one index would show up right here.
  expect(ay).toBeCloseTo(by, 1)
  expect(az).toBeCloseTo(bz, 1)
  expect(after.center[0]).toBeCloseTo(before.center[0], 1)
  expect(await fieldNumber(page, 'inspector-param-size-x')).toBeCloseTo(15, 3)
  expect(await fieldNumber(page, 'inspector-param-size-y')).toBeCloseTo(by, 1)
})

test('a filleted body stays editable: the rim is re-applied, and a size it no longer fits is refused by name (TODO/data-007)', async ({
  page,
}) => {
  const before = await placeAndSelect(page, 'primitive.cuboid')
  await expect(page.getByTestId('inspector-params')).toHaveAttribute('data-editable', 'true')

  await page.getByTestId('operation-fillet').click()
  await page.getByTestId('fillet-chamfer-face').selectOption('z+')
  await page.getByTestId('fillet-chamfer-radius').fill('5')
  await page.getByTestId('fillet-chamfer-commit').click()
  await expect(page.getByTestId('fillet-chamfer-popover')).toHaveCount(0)

  const [filleted] = await sceneBodies(page)
  // Real rim material removed, so the precondition is established rather than assumed.
  expect(filleted.volumeMm3).toBeLessThan(before.volumeMm3)

  // `ui-029` froze this section. The replace path re-runs the fillet instead.
  const params = page.getByTestId('inspector-params')
  await expect(params).toHaveAttribute('data-editable', 'true')
  await typeIntoField(page, 'inspector-param-size-x', 60)

  const [resized] = await sceneBodies(page)
  expect(sizeOf(resized)[0]).toBeCloseTo(60, 1)
  // Still rounded: a plain 60x40x40 box is bigger than the filleted one by more than the
  // 20 mm of extra width alone would add if the rim had been thrown away.
  const plainVolume = 60 * 40 * 40
  expect(resized.volumeMm3).toBeLessThan(plainVolume)

  // Narrower than the fillet's own radius allows: refused, nothing changes, the Fillet named.
  await typeIntoField(page, 'inspector-param-size-x', 8)
  const error = page.getByTestId('inspector-param-error')
  await expect(error).toBeVisible()
  await expect(error).toContainText(/Fillet/)
  const [still] = await sceneBodies(page)
  expect(sizeOf(still)[0]).toBeCloseTo(60, 1)
  expect(still.volumeMm3).toBeCloseTo(resized.volumeMm3, 3)

  // Transform is unaffected by any of this.
  await typeIntoField(page, 'inspector-position-x', 25)
  const [moved] = await sceneBodies(page)
  expect(moved.center[0]).toBeCloseTo(25, 1)
  expect(moved.volumeMm3).toBeCloseTo(resized.volumeMm3, 3)
})

test('a value the kernel rejects is shown in the panel and commits nothing', async ({ page }) => {
  const before = await placeAndSelect(page, 'primitive.cylinder')

  // Zero hits `requirePositive`'s throw in the registry. Before this task no
  // Inspector field could produce a kernel error at all; the surface reuses
  // `ui-027`'s own popover-error convention rather than inventing a second one.
  await typeIntoField(page, 'inspector-param-diameter', 0)

  const error = page.getByTestId('inspector-param-error')
  await expect(error).toBeVisible()
  await expect(error).not.toHaveText('')

  // Nothing committed: still one body, same size, same place.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  const [after] = await sceneBodies(page)
  expect(after.id).toBe(before.id)
  expect(sizeOf(after)[0]).toBeCloseTo(sizeOf(before)[0], 3)
  expect(after.center[0]).toBeCloseTo(before.center[0], 3)
  // The field itself is repainted with the document's own value, so the box and
  // the solid agree again rather than the box keeping a number nothing honours.
  expect(await fieldNumber(page, 'inspector-param-diameter')).toBeCloseTo(40, 3)

  // And a good value straight afterwards still works — the error is a message,
  // not a latched state.
  await typeIntoField(page, 'inspector-param-diameter', 25)
  await expect(error).toHaveCount(0)
  const [fixed] = await sceneBodies(page)
  expect(sizeOf(fixed)[0]).toBeCloseTo(25, 1)
})

test('one Undo takes back a param edit on a moved body whole, not only its move-back (TODO/ui-044)', async ({ page }) => {
  // `ui-044`'s own steps 1-5. The edit is a rebuilt record plus a move-back;
  // committed separately, one Undo removed only the move-back and left the thin
  // cylinder at its drop spot, a state the user never made.
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.sphere', fx: 0.72, fy: 0.38 })
  await dragRowIntoViewport(page, { op: 'primitive.cylinder', fx: 0.36, fy: 0.38 })
  await closeLibrary(page)
  const viewport = page.getByTestId('viewport')
  await expect(viewport).toHaveAttribute('data-body-count', '2')
  await expect(viewport).toHaveAttribute('data-selected-count', '1')
  await expect(page.getByTestId('inspector-params')).toBeVisible()

  const byOp = async (op) => (await sceneBodies(page)).find((body) => body.op === op)
  const sphere = await byOp('primitive.sphere')

  await typeIntoField(page, 'inspector-position-x', 33)
  const moved = await byOp('primitive.cylinder')
  expect(moved.center[0]).toBeCloseTo(33, 1)
  expect(sizeOf(moved)[0]).toBeCloseTo(40, 1)

  await typeIntoField(page, 'inspector-param-diameter', 12)
  const edited = await byOp('primitive.cylinder')
  expect(sizeOf(edited)[0]).toBeCloseTo(12, 1)
  expect(edited.center[0]).toBeCloseTo(33, 1)

  const undo = page.getByTestId('undo-button')
  await expect(undo).toHaveAttribute('title', 'Undo: Edit Cylinder 1')
  await undo.click()

  // One press: the moved 40 mm cylinder, exactly where it was moved to.
  await expect.poll(async () => sizeOf(await byOp('primitive.cylinder'))[0]).toBeCloseTo(40, 1)
  const undone = await byOp('primitive.cylinder')
  expect(undone.center[0]).toBeCloseTo(moved.center[0], 1)
  expect(undone.center[1]).toBeCloseTo(moved.center[1], 1)
  expect(undone.center[2]).toBeCloseTo(moved.center[2], 1)
  // The next step back is the move itself, not a leftover piece of the edit.
  await expect(undo).toHaveAttribute('title', 'Undo: Move Cylinder 1')
  // The Sphere was never part of it.
  expect((await byOp('primitive.sphere')).bounds).toEqual(sphere.bounds)

  // And Redo puts the whole edit back in one press.
  await page.getByTestId('redo-button').click()
  await expect.poll(async () => sizeOf(await byOp('primitive.cylinder'))[0]).toBeCloseTo(12, 1)
  expect((await byOp('primitive.cylinder')).center[0]).toBeCloseTo(33, 1)
})
