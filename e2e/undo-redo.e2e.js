// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Undo / Redo in the header document bar (TODO/data-003), driven against `/` —
 * the running app, not a Storybook iframe.
 *
 * Runs the full viewport × engine matrix from `playwright.config.js`:
 *
 * - **Viewports**, because these two controls are new occupants of the header
 *   strip and the 390px budget is the whole reason they are 44px icon buttons
 *   with no text label (`docs/decisions/interaction-model-qa.md`, cross-cutting
 *   "document bar"). A header that reflows or forces horizontal scrolling at
 *   phone width is a layout regression this spec exists to catch, which is why
 *   it snapshots at each.
 * - **Engines**, because an undo re-folds the whole action log through the
 *   geometry kernel and re-uploads the resulting meshes to a WebGL context, and
 *   because the keyboard path goes through a `window` listener whose modifier
 *   semantics differ between platforms (CLAUDE.md Browser Support). Firefox is
 *   environment-blocked in this sandbox — see `TROUBLESHOOTING.md`'s
 *   2026-09-17 entry — so the honest claim is chromium + webkit.
 *
 * The load-bearing test is **"the mesh reverts, and exactly one body survives"**.
 * Undo here is remove-the-record-and-re-derive, so the failure mode that would
 * matter to a user is not "nothing happened" but "the body came back twice", or
 * "an unrelated body moved" — a rebuild that gets lineage bookkeeping wrong
 * produces exactly those, and both are invisible to a test that only asserts the
 * undone value.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'undo-redo-snapshots')

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
 * Drag a Library row into the viewport and release inside it. Real
 * `PointerEvent`s rather than Playwright's mouse API, matching every other
 * placement spec here: one helper drives every engine, including those with no
 * touch emulation.
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
 * Click a point in the viewport canvas, as a fraction of its box — how every
 * other spec here selects a solid, since the `scene-bodies` list the assertions
 * read from is visually hidden and not clickable.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} fx
 * @param {number} fy
 */
async function clickViewportAt(page, fx, fy) {
  await page.evaluate(
    ({ fx, fy }) => {
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
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        )
      }
    },
    { fx, fy },
  )
  await page.waitForTimeout(100)
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ id: string, center: number[] }[]>}
 */
function sceneBodies(page) {
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      center: (node.getAttribute('data-body-center') ?? '').split(',').map(Number),
    })),
  )
}

/**
 * Drag one gizmo handle outward from the hub — the same technique
 * `gizmo-transform.e2e.js` uses, trimmed to the one case this spec needs.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 * @param {number} distancePx
 */
async function dragHandle(page, testId, distancePx) {
  await expect(page.locator(`[data-testid="${testId}"]`)).toBeAttached()
  const plan = await page.evaluate(
    ({ testId, distancePx }) => {
      const el = document.querySelector(`[data-testid="${testId}"]`)
      const view = document.querySelector('[data-testid="viewport"]')
      if (!el || !view) throw new Error(`missing handle ${testId}`)
      const gizmo = document.querySelector('[data-testid="transform-gizmo"]')
      const [ox, oy] = (gizmo?.getAttribute('data-origin') ?? '0,0').split(',').map(Number)
      const rect = view.getBoundingClientRect()
      const box = el.getBoundingClientRect()
      const startX = box.left + box.width / 2
      const startY = box.top + box.height / 2
      let dx = startX - (rect.left + ox)
      let dy = startY - (rect.top + oy)
      const length = Math.hypot(dx, dy) || 1
      dx /= length
      dy /= length
      return { startX, startY, endX: startX + dx * distancePx, endY: startY + dy * distancePx }
    },
    { testId, distancePx },
  )

  /**
   * @param {string} type
   * @param {number} x
   * @param {number} y
   */
  const fire = (type, x, y) =>
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
      { testId, type, x, y },
    )

  await fire('pointerdown', plan.startX, plan.startY)
  for (const t of [0.34, 0.67, 1]) {
    await fire(
      'pointermove',
      plan.startX + (plan.endX - plan.startX) * t,
      plan.startY + (plan.endY - plan.startY) * t,
    )
  }
  await fire('pointerup', plan.endX, plan.endY)
  await page.waitForTimeout(120)
}

test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('app-root')).toBeVisible()
})

test.describe('undo / redo', () => {
  test('both controls are in the header, reachable and disabled on an empty document', async ({
    page,
  }, testInfo) => {
    // The reachability gate: mounted in the root view's own header, not merely
    // registered somewhere (CLAUDE.md Interaction Model).
    await expect(page.getByTestId('document-bar')).toBeVisible()
    const undo = page.getByTestId('undo-button')
    const redo = page.getByTestId('redo-button')
    await expect(undo).toBeVisible()
    await expect(redo).toBeVisible()
    await expect(undo).toBeDisabled()
    await expect(redo).toBeDisabled()
    // Stack depth, not selection, is the gate — and an empty stack says so
    // rather than offering a button that does nothing.
    await expect(undo).toHaveAttribute('aria-label', 'Nothing to undo')

    // 44px tap targets at every width: the phone is the device with no Ctrl key,
    // so these buttons are the *only* path to undo there.
    for (const button of [undo, redo]) {
      const box = await button.boundingBox()
      // 0.01px of slack for float error only: at a fractional x Firefox's boundingBox subtracts two
      // float32 edges and reports a 44px box as 43.99998 (the DOM's own width is exactly 44).
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44 - 0.01)
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44 - 0.01)
    }

    // No horizontal overflow of primary UI at any reference viewport.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)

    await page.screenshot({
      path: join(SNAPSHOT_DIR, `header-empty-${testInfo.project.name}.png`),
    })
  })

  test('reverts a gizmo move by keyboard and reapplies it from the on-screen control', async ({
    page,
  }, testInfo) => {
    await openLibrary(page)
    // Kept in the upper half of the viewport: at the 390×844 phone reference a
    // drop below about `fy: 0.45` casts a ray that misses the grid entirely and
    // silently places nothing. That is pre-existing behaviour, unchanged by this
    // task (measured against both trees), but it is a trap every placement spec
    // here has to stay clear of.
    await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.45, fy: 0.42 })

    const placed = await sceneBodies(page)
    expect(placed).toHaveLength(1)
    const before = placed[0].center

    // The drop selects what it placed, so the gizmo is already attached.
    await expect(page.getByTestId('undo-button')).toBeEnabled()
    await expect(page.getByTestId('undo-button')).toHaveAttribute(
      'aria-label',
      /^Undo: Place /,
    )

    await dragHandle(page, 'gizmo-grab-arm-x', 70)
    const moved = await sceneBodies(page)
    expect(moved).toHaveLength(1)
    const movedCenter = moved[0].center
    expect(Math.abs(movedCenter[0] - before[0])).toBeGreaterThan(1)
    // The tooltip names the action, not just the verb.
    await expect(page.getByTestId('undo-button')).toHaveAttribute('aria-label', /^Undo: Move /)

    await page.screenshot({ path: join(SNAPSHOT_DIR, `moved-${testInfo.project.name}.png`) })

    // Keyboard path. Focus is on `body` — deliberately not in a numeric field,
    // where the shortcut is suppressed so the browser's own field undo wins.
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(150)

    const undone = await sceneBodies(page)
    // Exactly one body, not two: a rebuild that mishandled the supersession
    // lineage would leave the pre-move record rendering alongside the body.
    expect(undone).toHaveLength(1)
    expect(undone[0].id).toBe(placed[0].id)
    expect(undone[0].center[0]).toBeCloseTo(before[0], 3)
    expect(undone[0].center[1]).toBeCloseTo(before[1], 3)
    expect(undone[0].center[2]).toBeCloseTo(before[2], 3)

    // The selection that existed before the move is back, so the gizmo and the
    // Inspector are still pointing at the cube (section 19's Feedback).
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', placed[0].id)

    await page.screenshot({ path: join(SNAPSHOT_DIR, `undone-${testInfo.project.name}.png`) })

    // On-screen path — the only one a phone has.
    const redo = page.getByTestId('redo-button')
    await expect(redo).toBeEnabled()
    await expect(redo).toHaveAttribute('aria-label', /^Redo: Move /)
    await redo.click()
    await page.waitForTimeout(150)

    const redone = await sceneBodies(page)
    expect(redone).toHaveLength(1)
    expect(redone[0].center[0]).toBeCloseTo(movedCenter[0], 3)
    await expect(redo).toBeDisabled()

    await page.screenshot({ path: join(SNAPSHOT_DIR, `redone-${testInfo.project.name}.png`) })
  })

  test('undoes a placement, and clicking the header never clears the selection', async ({
    page,
  }) => {
    await openLibrary(page)
    await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.3, fy: 0.42 })
    await dragRowIntoViewport(page, { op: 'primitive.cylinder', fx: 0.7, fy: 0.34 })
    expect(await sceneBodies(page)).toHaveLength(2)

    const cubeId = (await sceneBodies(page))[0].id

    // Undo the cylinder's placement from the on-screen control.
    await page.getByTestId('undo-button').click()
    await page.waitForTimeout(150)
    const afterUndo = await sceneBodies(page)
    expect(afterUndo).toHaveLength(1)
    // The *first* body is the survivor — undo took the newest step, and did not
    // quietly take the cube with it.
    expect(afterUndo[0].id).toBe(cubeId)

    await page.getByTestId('redo-button').click()
    await page.waitForTimeout(150)
    expect(await sceneBodies(page)).toHaveLength(2)

    // A header click must not route through the viewport's own empty-space
    // clear (`interaction-model-qa.md`: "Selection is never disturbed by header
    // controls"). Export's scope will depend on this later, and a header that
    // silently deselected would turn "export the selection" into "export
    // everything" with nothing on screen to say so.
    // A body sits on the grid, so its screen image is a little above the point
    // it was dropped at — the same `drop fy − 0.04` convention the other
    // placement specs here use to click what they just placed.
    await clickViewportAt(page, 0.3, 0.38)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cubeId)
    await page.getByTestId('app-header').click({ position: { x: 4, y: 4 } })
    await page.waitForTimeout(80)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cubeId)
  })
})
