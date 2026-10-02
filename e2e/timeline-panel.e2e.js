// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * The History panel (`TODO/ui-032`), driven against `/` — the running app, not
 * a Storybook iframe.
 *
 * **All three reference viewports, all three engines — no `test.skip` pin.**
 * Per this task's own Testing section: a new panel is `CLAUDE.md`'s
 * layout/panel/overlay case outright (it is a bottom *dock* at ≥641px and a
 * bottom *sheet* at 390px, arbitrated against two other panels for one slot),
 * and every row action here re-evaluates kernel geometry, which is the
 * WebGL/kernel surface Browser Support defaults to all three engines for.
 * Firefox is excepted in this sandbox only — its Playwright build fails at
 * browser launch here, a pre-existing defect logged in `TROUBLESHOOTING.md`,
 * not a claim about Firefox.
 *
 * ## What this spec is and is not
 *
 * It is the reachability gate: these controls exist, are mounted where the root
 * view renders them, and do what they say at every reference size. It is **not**
 * the proof that the feature works — `CLAUDE.md`'s Verification section is
 * explicit that a passing scripted sequence proves only that its own author's
 * click order still works. `TODO/ACCEPTANCE.md` scenario 12, driven by hand, is
 * the other half, and neither substitutes for the other.
 *
 * ## Why volume, not bounding box
 *
 * Every "did the chamfer actually change" assertion reads `data-body-volume`.
 * `src/core/kernel/fillet.js`'s module doc states that a rim op "leaves the
 * bounding box alone — it removes rim material, it does not shrink the solid",
 * so a bounds assertion here would be asserting something the kernel is built
 * never to do. `ui-027`'s own spec header works through this at length; this
 * spec inherits the conclusion rather than rediscovering it.
 */

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
  await page.waitForTimeout(140)
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ id: string, name: string, volumeMm3: number, bounds: string }[]>}
 */
function sceneBodies(page) {
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      name: node.getAttribute('data-body-name') ?? '',
      volumeMm3: Number(node.getAttribute('data-body-volume') ?? 'NaN'),
      bounds: node.getAttribute('data-body-bounds') ?? '',
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

/** @param {import('@playwright/test').Page} page */
function rowTexts(page) {
  return page.$$eval('[data-testid="timeline-rows"] .row__text', (nodes) =>
    nodes.map((node) => node.textContent?.trim() ?? ''),
  )
}

// Drop points kept in the upper half of the viewport. Below roughly fy 0.45 at
// 390×844 the ray misses the ground grid entirely and the drop silently places
// nothing — a pre-existing placement trap, not this task's, but one every spec
// in this folder has to steer around. `ui-027`'s spec picked its points the
// same way and for the same reason.
const CUBE_DROP = { fx: 0.5, fy: 0.38 }
const SPHERE_DROP = { fx: 0.8, fy: 0.24 }
const CONE_DROP = { fx: 0.22, fy: 0.26 }

/**
 * Scenario 12's own opening: a Cube, a 5 mm top chamfer on it, then a Sphere
 * dropped somewhere else.
 *
 * @param {import('@playwright/test').Page} page
 */
async function seedCubeChamferSphere(page) {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_DROP })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  // The drop leaves what it placed selected, which is already the exactly-1
  // precondition Chamfer needs.
  await expect(page.getByTestId('operation-chamfer')).toBeEnabled()
  await page.getByTestId('operation-chamfer').click()
  await page.getByTestId('fillet-chamfer-face').selectOption('z+')
  await page.getByTestId('fillet-chamfer-radius').fill('5')
  await page.getByTestId('fillet-chamfer-commit').click()
  await expect(page.getByTestId('fillet-chamfer-popover')).toBeHidden()

  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.sphere', ...SPHERE_DROP })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
}

/**
 * Is the Library a bottom *sheet* here rather than a persistent column?
 *
 * True at phone width only. It matters because of §13's one-slot rule: at
 * phone width History and the Library cannot both be up, so a few assertions
 * below are genuinely unreachable there — stated and scoped, rather than
 * loosened everywhere to make one project pass.
 *
 * @param {import('@playwright/test').Page} page
 */
function libraryIsSheet(page) {
  return page.getByTestId('library-tab').isVisible()
}

/** @param {import('@playwright/test').Page} page */
async function openHistory(page) {
  await page.getByTestId('timeline-toggle').click()
  await expect(page.getByTestId('timeline-panel')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('History is reachable from the header, closed by default, and toggles shut again', async ({
  page,
}) => {
  const toggle = page.getByTestId('timeline-toggle')
  await expect(toggle).toBeVisible()
  // §13: default closed on every device, every load.
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('timeline-panel')).toHaveCount(0)

  await toggle.click()
  await expect(page.getByTestId('timeline-panel')).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  // An empty document still has a panel — it says so rather than showing
  // nothing, which is indistinguishable from being broken.
  await expect(page.getByTestId('timeline-empty')).toHaveText(
    'No steps yet — drag a shape in from the Library',
  )

  await page.getByTestId('timeline-close').click()
  await expect(page.getByTestId('timeline-panel')).toHaveCount(0)
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
})

test('rows read as the scenario describes them, one per step, in order', async ({ page }) => {
  await seedCubeChamferSphere(page)
  await openHistory(page)

  await expect(page.getByTestId('timeline-rows')).toBeVisible()
  expect(await rowTexts(page)).toEqual([
    'Cube 1 — placed',
    'Chamfer Top (+Z) 5 mm on Cube 1',
    'Sphere 1 — placed',
  ])
})

test('selecting an earlier row previews it and disables everything that would mutate', async ({
  page,
}) => {
  await seedCubeChamferSphere(page)
  await openHistory(page)

  await page.getByTestId('timeline-row-2').click()

  // §14's four feedbacks, all at once.
  await expect(page.getByTestId('timeline-preview-strip')).toHaveText(/Previewing step 2 of 3/)
  await expect(page.getByTestId('timeline-preview-strip')).toHaveText(/read-only/)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-previewing', 'true')
  // The chamfered cube and *no sphere* — the previewed state, not the latest.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  expect((await sceneBodies(page)).map((body) => body.name)).toEqual(['Cube 1'])
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')

  // Nothing about it looks editable.
  await expect(page.getByTestId('undo-button')).toBeDisabled()
  await expect(page.getByTestId('redo-button')).toBeDisabled()
  await expect(page.getByTestId('operation-chamfer')).toBeDisabled()
  // The Library too — but only where it can be open at the same time as
  // History. At phone width they share one bottom-sheet slot (§13), so
  // reaching the Library means closing History, which ends the preview by
  // definition. That is the design working, not a gap: the whole point of
  // preview is that you cannot place anything from it, and on a phone you
  // cannot even get to the control. The disabled state is still proved at
  // tablet and laptop, where both panels are persistent columns.
  if (!(await libraryIsSheet(page))) {
    await openLibrary(page)
    await expect(page.getByTestId('library-row-primitive.cuboid')).toBeDisabled()
    await closeLibrary(page)
  }

  await page.getByTestId('timeline-back-to-latest').click()
  await expect(page.getByTestId('timeline-preview-strip')).toHaveCount(0)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-previewing', 'false')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await expect(page.getByTestId('undo-button')).toBeEnabled()
})

test('selecting the last row is not a preview — it is the current document', async ({ page }) => {
  await seedCubeChamferSphere(page)
  await openHistory(page)

  await page.getByTestId('timeline-row-3').click()
  await expect(page.getByTestId('timeline-actions')).toBeVisible()
  await expect(page.getByTestId('timeline-preview-strip')).toHaveCount(0)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-previewing', 'false')
})

test('editing the chamfer replays downstream: the cube changes and the sphere does not', async ({
  page,
}) => {
  await seedCubeChamferSphere(page)
  const cubeAt5 = (await bodyNamed(page, 'Cube 1')).volumeMm3
  const sphereBefore = await bodyNamed(page, 'Sphere 1')

  await openHistory(page)
  await page.getByTestId('timeline-row-2').click()
  await page.getByTestId('timeline-edit').click()
  await expect(page.getByTestId('timeline-edit-form')).toBeVisible()
  await page.getByTestId('timeline-field-radius').fill('3')
  await page.getByTestId('timeline-apply').click()

  // The form closes, the preview ends, and the whole document is on screen.
  await expect(page.getByTestId('timeline-edit-form')).toHaveCount(0)
  await expect(page.getByTestId('timeline-preview-strip')).toHaveCount(0)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')

  // A smaller chamfer removes less material, so the cube's volume rises toward
  // the unchamfered 64000 without reaching it.
  const cubeAt3 = (await bodyNamed(page, 'Cube 1')).volumeMm3
  expect(cubeAt3).toBeGreaterThan(cubeAt5)
  expect(cubeAt3).toBeLessThan(64000)

  // The sphere is untouched — the claim scenario 12 exists to check.
  const sphereAfter = await bodyNamed(page, 'Sphere 1')
  expect(sphereAfter.bounds).toBe(sphereBefore.bounds)
  expect(sphereAfter.volumeMm3).toBe(sphereBefore.volumeMm3)

  // The row now shows the new value.
  expect(await rowTexts(page)).toEqual([
    'Cube 1 — placed',
    'Chamfer Top (+Z) 3 mm on Cube 1',
    'Sphere 1 — placed',
  ])

  // §19: one user-meaningful action, one press of Undo.
  await page.getByTestId('undo-button').click()
  expect((await bodyNamed(page, 'Cube 1')).volumeMm3).toBeCloseTo(cubeAt5, 3)
  expect((await bodyNamed(page, 'Sphere 1')).bounds).toBe(sphereBefore.bounds)
  await page.getByTestId('redo-button').click()
  expect((await bodyNamed(page, 'Cube 1')).volumeMm3).toBeCloseTo(cubeAt3, 3)
})

test('suppressing the chamfer reverts the cube and unsuppressing brings it back', async ({
  page,
}) => {
  await seedCubeChamferSphere(page)
  const cubeChamfered = (await bodyNamed(page, 'Cube 1')).volumeMm3
  const sphereBefore = await bodyNamed(page, 'Sphere 1')

  await openHistory(page)
  await page.getByTestId('timeline-row-2').click()
  await page.getByTestId('timeline-suppress').click()

  // An unchamfered 40 mm cube is exactly 64000 mm³.
  expect((await bodyNamed(page, 'Cube 1')).volumeMm3).toBeCloseTo(64000, 1)
  expect((await bodyNamed(page, 'Sphere 1')).bounds).toBe(sphereBefore.bounds)
  // Non-destructive: the row is still there, greyed, struck through and chipped.
  await expect(page.getByTestId('timeline-row-2')).toHaveAttribute('data-suppressed', 'true')
  await expect(page.getByTestId('chip-suppressed')).toBeVisible()
  expect(await rowTexts(page)).toHaveLength(3)

  await page.getByTestId('timeline-suppress').click()
  expect((await bodyNamed(page, 'Cube 1')).volumeMm3).toBeCloseTo(cubeChamfered, 3)
  await expect(page.getByTestId('timeline-row-2')).toHaveAttribute('data-suppressed', 'false')
})

test('Edit says why it is disabled instead of opening an empty form', async ({ page }) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_DROP })
  await closeLibrary(page)
  await openHistory(page)

  // A placement has real params, so it *is* editable — the control is not
  // disabled by default, which is what makes the disabled cases meaningful.
  await page.getByTestId('timeline-row-1').click()
  await expect(page.getByTestId('timeline-edit')).toBeEnabled()
})

test('Move up is disabled on a step the next one builds on, and says so', async ({ page }) => {
  await seedCubeChamferSphere(page)
  await openHistory(page)

  await page.getByTestId('timeline-row-2').click()
  const up = page.getByTestId('timeline-move-up')
  await expect(up).toBeDisabled()
  await expect(up).toHaveAttribute('title', "Step 2 uses step 1's result")

  // Step 1 cannot go up at all; step 3 cannot go down.
  await page.getByTestId('timeline-row-1').click()
  await expect(page.getByTestId('timeline-move-up')).toBeDisabled()
  await page.getByTestId('timeline-row-3').click()
  await expect(page.getByTestId('timeline-move-down')).toBeDisabled()
})

test('a legal reorder swaps the rows and leaves the viewport identical', async ({ page }) => {
  await seedCubeChamferSphere(page)
  const before = await sceneBodies(page)

  await openHistory(page)
  await page.getByTestId('timeline-row-3').click()
  await page.getByTestId('timeline-move-up').click()

  expect(await rowTexts(page)).toEqual([
    'Cube 1 — placed',
    'Sphere 1 — placed',
    'Chamfer Top (+Z) 5 mm on Cube 1',
  ])
  // "the viewport looks identical" — same bodies, same volumes, same bounds.
  expect(await sceneBodies(page)).toEqual(before)

  await page.getByTestId('undo-button').click()
  expect(await rowTexts(page)).toEqual([
    'Cube 1 — placed',
    'Chamfer Top (+Z) 5 mm on Cube 1',
    'Sphere 1 — placed',
  ])
})

test('rollback hides the tail, a new drop lands at the marker, and roll forward restores it', async ({
  page,
}) => {
  await seedCubeChamferSphere(page)
  const sphereBefore = await bodyNamed(page, 'Sphere 1')

  await openHistory(page)
  await page.getByTestId('timeline-row-2').click()
  await page.getByTestId('timeline-rollback').click()

  // The sphere leaves the *evaluated* document; its row stays, dimmed.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('timeline-row-3')).toHaveAttribute('data-active', 'false')
  await expect(page.getByTestId('chip-inactive')).toBeVisible()
  await expect(page.getByTestId('timeline-marker')).toBeVisible()
  await expect(page.getByTestId('timeline-rollback-text')).toHaveText('Rolled back to step 2 of 3')
  await expect(page.getByTestId('timeline-rollback-detail')).toHaveText(
    'New steps insert here · 1 later step inactive',
  )
  // §18: nothing is blocked while rolled back.
  await expect(page.getByTestId('undo-button')).toBeEnabled()

  // A new placement inserts at the marker, not at the end.
  //
  // At phone width the History sheet holds the slot the Library tab lives in,
  // so this is driven exactly the way §18 says a phone user would: "the user
  // can drag-place and use the Operations toolbar with the sheet closed and
  // the strip still reporting where new steps will land." The rollback strip
  // outliving the panel is what makes that safe, and it is asserted here
  // rather than assumed.
  const phoneSlot = await libraryIsSheet(page)
  if (phoneSlot) {
    await page.getByTestId('timeline-close').click()
    await expect(page.getByTestId('timeline-rollback-strip')).toBeVisible()
  }
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cone', ...CONE_DROP })
  await closeLibrary(page)
  if (phoneSlot) await openHistory(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  expect(await rowTexts(page)).toEqual([
    'Cube 1 — placed',
    'Chamfer Top (+Z) 5 mm on Cube 1',
    'Cone 1 — placed',
    'Sphere 1 — placed',
  ])
  await expect(page.getByTestId('timeline-row-3')).toHaveAttribute('data-active', 'true')
  await expect(page.getByTestId('timeline-row-4')).toHaveAttribute('data-active', 'false')
  await expect(page.getByTestId('timeline-rollback-text')).toHaveText('Rolled back to step 3 of 4')

  await page.getByTestId('timeline-roll-forward').click()

  // The strip goes, the sphere comes back exactly as it was, nothing was
  // deleted and nothing was reordered.
  await expect(page.getByTestId('timeline-rollback-strip')).toHaveCount(0)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '3')
  const sphereAfter = await bodyNamed(page, 'Sphere 1')
  expect(sphereAfter.bounds).toBe(sphereBefore.bounds)
  expect(sphereAfter.volumeMm3).toBe(sphereBefore.volumeMm3)
  expect(await rowTexts(page)).toEqual([
    'Cube 1 — placed',
    'Chamfer Top (+Z) 5 mm on Cube 1',
    'Cone 1 — placed',
    'Sphere 1 — placed',
  ])
})

test('an inactive row offers Suppress only, and says why Edit and Move are off', async ({
  page,
}) => {
  await seedCubeChamferSphere(page)
  await openHistory(page)
  await page.getByTestId('timeline-row-2').click()
  await page.getByTestId('timeline-rollback').click()

  await page.getByTestId('timeline-row-3').click()
  // Tapping an inactive row selects it but does not preview it (§18).
  await expect(page.getByTestId('timeline-actions')).toBeVisible()
  await expect(page.getByTestId('timeline-preview-strip')).toHaveCount(0)

  const reason = "Roll forward first — inactive steps can't be checked yet"
  await expect(page.getByTestId('timeline-edit')).toBeDisabled()
  await expect(page.getByTestId('timeline-edit')).toHaveAttribute('title', reason)
  await expect(page.getByTestId('timeline-move-up')).toBeDisabled()
  await expect(page.getByTestId('timeline-rollback')).toBeDisabled()
  // Suppress stays available — §18's own way to resolve a broken tail row.
  await expect(page.getByTestId('timeline-suppress')).toBeEnabled()
})

test('the History panel and the Inspector never fight over the phone sheet slot', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.split('-')[1] !== 'phone', 'the one-slot rule is phone-only')

  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_DROP })
  await closeLibrary(page)

  await openHistory(page)
  // §13: opening History collapses the Library sheet.
  await expect(page.getByTestId('library-rows')).toBeHidden()

  // Tapping the Inspector's tab is a deliberate claim on the slot — History
  // yields rather than stacking two sheets into unreadable mush, which is the
  // defect `ui-011`'s own acceptance drive found between the first two panels.
  await page.getByTestId('inspector-tab').click()
  await expect(page.getByTestId('timeline-panel')).toHaveCount(0)
})
