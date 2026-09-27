import { test, expect } from '@playwright/test'

/**
 * The Operations toolbar's ninth, tenth and eleventh buttons — Enlarge, Fit and
 * Bisect (`TODO/ui-028`) — driven against `/`, the running app, not a Storybook
 * iframe.
 *
 * **All three reference viewports, all three engines — no `test.skip` pin.**
 * Per this task's own Testing section: this spec touches the kernel's own
 * enlarge/fit/bisect numerics (`src/core/kernel/group.js`) and the WebGL render
 * path for a `supersedes`-produced *group* (Bisect's own result) — the first
 * time this codebase has exercised that specific combination end to end
 * (`consumes`-produced groups were already proven by `ui-016`; `supersedes`
 * producing the *same* geometry kind was already proven by `transform.*` and
 * Fillet/Chamfer; this is the first `supersedes` record whose result is a
 * *different* `KernelGeometry` kind than what it replaced) — matching the bar
 * `render-001`, `ui-016` and `ui-027` set for the same reason.
 *
 * ## Enlarge and Fit are measured by volume, not bounding box
 *
 * Same convention `ui-014`/`ui-027` established: a resize is exactly the kind
 * of change a bounding-box assertion could pass on accidentally-unchanged
 * geometry, so every "did this actually resize" assertion below reads the
 * `data-body-volume` attribute `ui-027` added to `Viewport.vue`'s scene-bodies
 * list, not a bounding box.
 *
 * ## Bisect: one reliable drill-in, not two fragile ones
 *
 * The natural assertion for Bisect's own two-part result would click into
 * *both* `negative` and `positive` by screen position and sum their volumes.
 * That was tried while writing this spec and abandoned: the two halves sit
 * immediately adjacent to each other (unlike `ui-016`'s own fixture, two
 * *separately dropped* cubes far apart on screen), so telling them apart needs
 * a screen offset fine enough to be genuinely viewport-projection-dependent —
 * measured directly against the running app, not assumed, and a value that
 * worked at one reference viewport missed the body entirely at another. This
 * spec instead exploits a fact `commitResize` already guarantees: the commit
 * leaves the *whole group* selected, so a single click at the body's own
 * original centre point (already proven reliable by every other spec in this
 * folder) is itself the "second, distinct click" `ui-016`'s pick-depth
 * contract calls for, and deterministically drills into whichever part sits
 * there — no offset-guessing needed. Volume conservation across *both* parts
 * is then checked the way `group.js`'s own `bisect` doc comment describes the
 * technique working: the group's own combined `data-body-volume` (which
 * `combine()` computes by *unioning* `negative` and `positive`) reproduces the
 * pre-bisect volume, since the two halves touch only at the cut plane and
 * never overlap — the same conservation `group.spec.js` already asserts at
 * the kernel level, exercised here through the real UI and render path
 * instead of a direct kernel call.
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
 * Put the Library sheet away, if this viewport has one.
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
 * Click at a fraction of the viewport, as a press that does not move.
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
  await page.waitForTimeout(150)
}

/**
 * Every body in the scene list, once each one's volume has been measured.
 *
 * A composite's volume (a bisect result is a two-part group) is a kernel union, which
 * `TODO/core-029` moved into the evaluation worker: `data-body-volume` is absent until
 * the worker's answer lands, so this waits for it rather than reading `NaN`.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ id: string, op: string, name: string, volumeMm3: number }[]>}
 */
async function sceneBodies(page) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-testid="scene-bodies"] li')].every((node) => node.hasAttribute('data-body-volume')),
  )
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      op: node.getAttribute('data-body-op') ?? '',
      name: node.getAttribute('data-body-name') ?? '',
      volumeMm3: Number(node.getAttribute('data-body-volume') ?? 'NaN'),
    })),
  )
}

/**
 * The three dimension lines' quoted lengths, in millimetres.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number[]>}
 */
function dimensionLengths(page) {
  return page.$$eval('[data-testid^="dimension-"][data-length-mm]', (nodes) =>
    nodes.map((node) => Number(node.getAttribute('data-length-mm'))),
  )
}

/**
 * One axis's own dimension line length, in millimetres — `DimensionLines.vue`
 * names each line `dimension-x`/`dimension-y`/`dimension-z`. Used instead of
 * {@link dimensionLengths}'s unordered array wherever the axis actually being
 * bisected matters, since a Y-axis cut leaves X and Z exactly as large as the
 * whole group — `Math.max` across all three would not shrink at all.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'x' | 'y' | 'z'} axis
 * @returns {Promise<number>}
 */
async function dimensionLengthOf(page, axis) {
  const value = await page.getByTestId(`dimension-${axis}`).getAttribute('data-length-mm')
  return Number(value)
}

// The Library's default cube (established by this folder's other specs).
const CUBE = { drop: { fx: 0.5, fy: 0.4 }, click: { fx: 0.5, fy: 0.36 } }
const EMPTY = { fx: 0.04, fy: 0.06 }

/**
 * Place one Cube and select it.
 *
 * @param {import('@playwright/test').Page} page
 */
async function placeAndSelectCube(page) {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE.drop })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  return (await sceneBodies(page))[0]
}

/**
 * Unfold the navigation chrome if it is folded behind its phone-only toggle — it
 * collapses while a bottom sheet raises it at ≤640px (`TODO/ui-046`). A no-op
 * everywhere else.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openNavChrome(page) {
  const toggle = page.getByTestId('nav-expand-toggle')
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false') {
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('Enlarge, Fit and Bisect are exactly-1-gated, same as Fillet/Chamfer: disabled at 0 and at 2, enabled at exactly 1', async ({
  page,
}) => {
  const enlarge = page.getByTestId('operation-enlarge')
  const fit = page.getByTestId('operation-fit')
  const bisect = page.getByTestId('operation-bisect')

  await expect(enlarge).toBeVisible()
  await expect(fit).toBeVisible()
  await expect(bisect).toBeVisible()
  await expect(enlarge).toBeDisabled()
  await expect(fit).toBeDisabled()
  await expect(bisect).toBeDisabled()
  await expect(enlarge).toHaveAttribute('title', 'Select exactly 1 solid')

  await placeAndSelectCube(page)
  await expect(enlarge).toBeEnabled()
  await expect(fit).toBeEnabled()
  await expect(bisect).toBeEnabled()

  // A second body, selected additively: 2 selected disables the trio again.
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.78, fy: 0.28 })
  await closeLibrary(page)
  await clickViewportAt(page, CUBE.click.fx, CUBE.click.fy)
  await clickViewportAt(page, 0.78, 0.24, { shift: true })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await expect(enlarge).toBeDisabled()
  await expect(fit).toBeDisabled()
  await expect(bisect).toBeDisabled()
  // The 2+-gated Union stays enabled at the same selection count.
  await expect(page.getByTestId('operation-union')).toBeEnabled()
})

test('Enlarge: commit stays disabled until a delta is non-zero, then grows the cube by volume, same id and op', async ({
  page,
}) => {
  const before = await placeAndSelectCube(page)
  expect(Number.isFinite(before.volumeMm3)).toBe(true)

  await page.getByTestId('operation-enlarge').click()
  const popover = page.getByTestId('resize-popover')
  await expect(popover).toBeVisible()
  await expect(popover).toHaveAttribute('data-op', 'modify.enlarge')
  // All three deltas default to 0 — a no-op — so Commit starts disabled.
  await expect(page.getByTestId('resize-enlarge-dx')).toHaveValue('0')
  await expect(page.getByTestId('resize-commit')).toBeDisabled()

  await page.getByTestId('resize-enlarge-dz').fill('10')
  await expect(page.getByTestId('resize-commit')).toBeEnabled()
  await page.getByTestId('resize-commit').click()
  await expect(popover).toHaveCount(0)

  const viewport = page.getByTestId('viewport')
  await expect(viewport).toHaveAttribute('data-body-count', '1')
  await expect(viewport).toHaveAttribute('data-selected-id', before.id)
  const [after] = await sceneBodies(page)
  expect(after.id).toBe(before.id)
  // `Body.op` reads from the lineage's *root* record, unchanged by a
  // `supersedes` record — same convention Fillet/Chamfer's own spec checks.
  expect(after.op).toBe(before.op)
  expect(after.volumeMm3).toBeGreaterThan(before.volumeMm3)
  // 40x40x40 growing by +10mm on Z alone -> 40*40*50, an exact expected volume
  // (unlike a rim fillet, Enlarge's scale-about-centroid arithmetic on an
  // axis-aligned box has no curved surface to introduce tessellation error).
  expect(after.volumeMm3).toBeCloseTo(40 * 40 * 50, 0)
})

test('Fit: fields default to the shape\'s current size (not 0), stay a no-op until changed, and resize by volume', async ({
  page,
}) => {
  const before = await placeAndSelectCube(page)

  await page.getByTestId('operation-fit').click()
  const popover = page.getByTestId('resize-popover')
  await expect(popover).toHaveAttribute('data-op', 'modify.fit')
  // Defaults are the cube's own current size (40mm), not 0 — the whole point
  // of this task's own "0-means-unchanged needs a real UI affordance" note.
  await expect(page.getByTestId('resize-fit-x')).toHaveValue('40')
  await expect(page.getByTestId('resize-fit-y')).toHaveValue('40')
  await expect(page.getByTestId('resize-fit-z')).toHaveValue('40')
  // Untouched, so this would be a pure no-op — Commit stays disabled exactly
  // like Enlarge's own all-zero guard.
  await expect(page.getByTestId('resize-commit')).toBeDisabled()

  await page.getByTestId('resize-fit-z').fill('10')
  await expect(page.getByTestId('resize-commit')).toBeEnabled()
  await page.getByTestId('resize-commit').click()
  await expect(popover).toHaveCount(0)

  const viewport = page.getByTestId('viewport')
  await expect(viewport).toHaveAttribute('data-body-count', '1')
  await expect(viewport).toHaveAttribute('data-selected-id', before.id)
  const [after] = await sceneBodies(page)
  expect(after.id).toBe(before.id)
  expect(after.op).toBe(before.op)
  // X and Y left at their own current-size default (40) -> unchanged per
  // `fit`'s own sentinel; only Z targeted to 10 -> 40*40*10.
  expect(after.volumeMm3).toBeCloseTo(40 * 40 * 10, 0)
})

test('Bisect: commit stays disabled until an offset is typed, then cuts the cube into a two-part group whose combined volume is conserved, reachable via ui-016\'s own pick-depth', async ({
  page,
}) => {
  const before = await placeAndSelectCube(page)

  await page.getByTestId('operation-bisect').click()
  const popover = page.getByTestId('resize-popover')
  await expect(popover).toHaveAttribute('data-op', 'modify.bisect')
  // No default offset — Commit stays disabled until a real value is typed,
  // per this task's own "don't pre-fill a value that looks safe" note.
  await expect(page.getByTestId('resize-commit')).toBeDisabled()

  await page.getByTestId('resize-bisect-axis').selectOption('y')
  await page.getByTestId('resize-bisect-offset').fill('20')
  await expect(page.getByTestId('resize-commit')).toBeEnabled()
  await page.getByTestId('resize-commit').click()
  await expect(popover).toHaveCount(0)

  const viewport = page.getByTestId('viewport')
  // `supersedes`, not `consumes`: still one body, same id.
  await expect(viewport).toHaveAttribute('data-body-count', '1')
  await expect(viewport).toHaveAttribute('data-selected-id', before.id)
  const [afterBisect] = await sceneBodies(page)
  expect(afterBisect.id).toBe(before.id)
  expect(afterBisect.op).toBe(before.op)
  // Volume conservation across the two-part group: `combine()` unions
  // `negative` and `positive`, which touch only at the cut plane, so the
  // union reproduces the pre-bisect volume (the `bisect` kernel doc comment's
  // own stated guarantee, exercised here through the real render path).
  expect(afterBisect.volumeMm3).toBeCloseTo(before.volumeMm3, 0)

  // The commit already leaves the *whole group* selected (`commitResize`'s
  // own `selection.select(onlyId)`), so a click at the body's own original
  // centre point is itself the "second, distinct click" ui-016's pick-depth
  // contract calls for — see this file's own header for why this is used
  // instead of guessing a second, offset click point for the other half.
  const wholeGroupYMm = await dimensionLengthOf(page, 'y')
  expect(wholeGroupYMm).toBeCloseTo(40, 0)
  await clickViewportAt(page, CUBE.click.fx, CUBE.click.fy)

  const breadcrumb = page.getByTestId('inspector-breadcrumb')
  await expect(breadcrumb).toBeVisible()
  await expect(page.getByTestId('inspector-breadcrumb-group')).toHaveText(/Cube/)
  const partName = await page.getByTestId('inspector-breadcrumb-part').textContent()
  expect(['negative', 'positive']).toContain(partName)

  // Display only, same ui-016 contract Fillet/Chamfer's own drilled-part
  // check already established: the gizmo goes, dimension lines stay (they
  // measure a smaller, real sub-part, not the whole group). The cut was along
  // Y, so only Y shrinks — X and Z stay the full 40mm, which is exactly why
  // this checks the Y line specifically rather than the max of all three.
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(0)
  const partLengths = await dimensionLengths(page)
  expect(partLengths).toHaveLength(3)
  const partYMm = await dimensionLengthOf(page, 'y')
  expect(partYMm).toBeLessThan(wholeGroupYMm)

  // The drilled-into part is a genuine, non-degenerate sub-cuboid: its own
  // box volume (product of its three dimension lines — exact for an
  // axis-aligned box, the same reasoning Enlarge/Fit's own volume checks
  // above use) is neither ~0 nor ~the whole original volume, so this really
  // is one of two real halves, not the whole thing re-labelled.
  const partVolume = partLengths[0] * partLengths[1] * partLengths[2]
  expect(partVolume).toBeGreaterThan(before.volumeMm3 * 0.05)
  expect(partVolume).toBeLessThan(before.volumeMm3 * 0.95)

  // Step back up (ui-016's own breadcrumb mechanism) — re-run against this
  // task's supersedes-produced group specifically, since ui-016's own
  // original repro only ever exercised a consumes-produced one.
  await page.getByTestId('inspector-breadcrumb-group').click()
  // Back at whole-group depth: the part segment goes (since `ui-049` the breadcrumb itself
  // stays, carrying its root `Objects` crumb).
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveCount(0)
  await expect(breadcrumb).toBeVisible()
  await expect(viewport).toHaveAttribute('data-selected-id', before.id)
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(1)
  const backToWholeYMm = await dimensionLengthOf(page, 'y')
  expect(backToWholeYMm).toBeCloseTo(wholeGroupYMm, 0)
})

test('Bisect: a real Angle tilts the cut plane, producing an asymmetric split rather than the axis-aligned bounds a straight cut would produce (TODO/ui-036)', async ({
  page,
}) => {
  const before = await placeAndSelectCube(page)

  await page.getByTestId('operation-bisect').click()
  const popover = page.getByTestId('resize-popover')
  await expect(popover).toHaveAttribute('data-op', 'modify.bisect')

  // Angle/Rotate-axis/Rotate-offset (TODO/ui-036) — the three new fields.
  // Angle defaults to 0 (unlike Offset, which has no default at all).
  await expect(page.getByTestId('resize-bisect-angle')).toHaveValue('0')
  // Rotate-axis defaults to the kernel's own per-cut-axis table entry —
  // cut axis defaults to 'x' (AXES[0]), whose table entry is 'y'.
  await expect(page.getByTestId('resize-bisect-rotate-axis')).toHaveValue('y')

  await page.getByTestId('resize-bisect-axis').selectOption('z')
  // Cut axis changed to 'z' -> Rotate-axis re-defaults to the table's 'z'
  // entry ('x'), not left stranded on 'y'.
  await expect(page.getByTestId('resize-bisect-rotate-axis')).toHaveValue('x')
  await page.getByTestId('resize-bisect-offset').fill('20')
  await page.getByTestId('resize-bisect-angle').fill('30')
  // Rotate-offset left at its own (blank) default — the Goal's own "leaving
  // Rotate-offset at its default" flow.
  await expect(page.getByTestId('resize-commit')).toBeEnabled()
  await page.getByTestId('resize-commit').click()
  await expect(popover).toHaveCount(0)

  const viewport = page.getByTestId('viewport')
  await expect(viewport).toHaveAttribute('data-body-count', '1')
  await expect(viewport).toHaveAttribute('data-selected-id', before.id)
  const [afterBisect] = await sceneBodies(page)
  expect(afterBisect.id).toBe(before.id)
  // Volume conservation holds for the angled form exactly as the straight
  // one — `bisect()`'s own doc comment states the technique is a coordinate
  // transform around the same half-space cut, not a new boolean.
  expect(afterBisect.volumeMm3).toBeCloseTo(before.volumeMm3, 0)

  // The commit leaves the whole group selected; a click at the body's own
  // original centre point drills into whichever half sits there, same
  // reliable-drill-in technique this file's own header explains.
  await clickViewportAt(page, CUBE.click.fx, CUBE.click.fy)
  const breadcrumb = page.getByTestId('inspector-breadcrumb')
  await expect(breadcrumb).toBeVisible()
  const partName = await page.getByTestId('inspector-breadcrumb-part').textContent()
  expect(['negative', 'positive']).toContain(partName)

  // The real proof this is a *tilted* split, not the axis-aligned one a
  // straight cut would produce: the cube is 40mm on a side and the cut sits at
  // its mid-height (offset 20mm from the Z minimum face), so a straight Z cut
  // would leave each half exactly 20mm tall with X and Y still the full 40mm.
  // Tilting the plane 30 degrees about X (hinged on the Y centre, so it rises
  // by 20 * tan(30) = ~11.5mm at one Y face and drops by as much at the other)
  // makes each half's Z extent 20 + 11.5 = ~31.5mm instead — a straight cut can
  // never produce that.
  const partLengths = await dimensionLengths(page)
  expect(partLengths).toHaveLength(3)
  const partZMm = await dimensionLengthOf(page, 'z')
  expect(partZMm).toBeGreaterThan(20 + 5)
  expect(partZMm).toBeLessThan(40 - 5)
  expect(partZMm).toBeCloseTo(20 + 20 * Math.tan((30 * Math.PI) / 180), 0)
  // X is the tilt axis, so it is untouched.
  expect(await dimensionLengthOf(page, 'x')).toBeCloseTo(40, 0)

  // Still a genuine, non-degenerate sub-part — neither sliver nor the whole
  // shape re-labelled (same sanity bound the straight-cut test above uses).
  const partVolume = partLengths[0] * partLengths[1] * partLengths[2]
  expect(partVolume).toBeGreaterThan(before.volumeMm3 * 0.02)
  expect(partVolume).toBeLessThan(before.volumeMm3 * 0.98)

  // ui-016's closed-finding regression surface, re-driven specifically
  // against an *angled*-Bisect-produced group (ui-028's own drive only ever
  // exercised a straight-Bisect-produced one) — drilling in shows a correct,
  // smaller dimension (checked above), and stepping back out via the
  // breadcrumb reattaches the gizmo and restores the full-group reading.
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(0)
  await page.getByTestId('inspector-breadcrumb-group').click()
  // Back at whole-group depth: the part segment goes (since `ui-049` the breadcrumb itself
  // stays, carrying its root `Objects` crumb).
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveCount(0)
  await expect(breadcrumb).toBeVisible()
  await expect(viewport).toHaveAttribute('data-selected-id', before.id)
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(1)
})

test('a resize the kernel rejects (a delta that would invert an axis) surfaces visibly in the popover, and commits nothing', async ({
  page,
}) => {
  const before = await placeAndSelectCube(page)

  await page.getByTestId('operation-enlarge').click()
  // The Library's default cube is 40mm on every axis — a -45mm delta on Z
  // would invert the axis, which `enlarge` (src/core/kernel/group.js) refuses
  // by throwing rather than silently mirroring the solid (V1's own behaviour).
  await page.getByTestId('resize-enlarge-dz').fill('-45')
  await expect(page.getByTestId('resize-commit')).toBeEnabled()
  await page.getByTestId('resize-commit').click()

  const error = page.getByTestId('resize-error')
  await expect(error).toBeVisible()
  await expect(error).not.toHaveText('')

  // Nothing committed: the popover stays open (so the value can be corrected)
  // and the body is untouched.
  await expect(page.getByTestId('resize-popover')).toBeVisible()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  const [unchanged] = await sceneBodies(page)
  expect(unchanged.id).toBe(before.id)
  expect(unchanged.volumeMm3).toBeCloseTo(before.volumeMm3, 3)

  await page.getByTestId('resize-cancel').click()
  await expect(page.getByTestId('resize-popover')).toHaveCount(0)
})

test('the resize popover stays on-screen and reachable at every reference viewport — no horizontal page scroll', async ({
  page,
}) => {
  await placeAndSelectCube(page)
  // Bisect's popover is the widest of the three (an extra hint line) and the
  // last of the toolbar's now-eleven buttons, the one most likely to widen
  // the row into a fourth wrap at phone width — see this toolbar's own CSS
  // comment on that exact, previously-fixed collision.
  await page.getByTestId('operation-bisect').click()
  const popover = page.getByTestId('resize-popover')
  await expect(popover).toBeVisible()

  const box = await popover.boundingBox()
  expect(box).not.toBeNull()
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(clientWidth + 1)

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)

  // TODO/ui-036: Bisect's popover now also carries Angle / Rotate-axis /
  // Rotate-offset, so it's taller than it was — confirm it still fits
  // vertically with no internal scrolling, and that every control is actually
  // hit-testable (the topmost element at its centre is itself or a descendant),
  // rather than merely having a bounding box.
  const innerHeight = await page.evaluate(() => window.innerHeight)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(innerHeight + 1)
  const scrolls = await popover.evaluate((el) => el.scrollHeight > el.clientHeight + 1)
  expect(scrolls).toBe(false)

  for (const testid of [
    'resize-bisect-axis',
    'resize-bisect-offset',
    'resize-bisect-angle',
    'resize-bisect-rotate-axis',
    'resize-bisect-rotate-offset',
    'resize-cancel',
    'resize-commit',
  ]) {
    const control = page.getByTestId(testid)
    const controlBox = await control.boundingBox()
    expect(controlBox).not.toBeNull()
    expect(controlBox.y + controlBox.height).toBeLessThanOrEqual(innerHeight + 1)
    const hit = await control.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      return top === el || el.contains(top) || (top !== null && top.closest('label') === el.closest('label'))
    })
    expect(hit, `${testid} is hit-testable`).toBe(true)
  }

  // The toolbar row itself, with an eleventh button now on it, must not
  // overlap the orientation gizmo or intercept the navigation chrome — the
  // same collision `ui-015`/`ui-026`/`ui-027` each hit once already on this
  // toolbar. A real click succeeding on every nav control is the functional
  // proof: an intercepted click throws rather than silently passing.
  await page.getByTestId('resize-cancel').click()
  await openNavChrome(page)
  await expect(page.getByTestId('nav-mode-orbit')).toBeVisible()
  await page.getByTestId('nav-mode-orbit').click()
})
