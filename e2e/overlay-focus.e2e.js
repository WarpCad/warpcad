// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { revealAssistantButton } from './support/assistantEntry.js'

/**
 * `TODO/ui-110` — one set of overlay behaviours, against the real app at `/`:
 *
 * - a modal dialog (the Assistant's Key sheet) keeps Tab inside itself, and hands focus back to
 *   the control that opened it;
 * - with a popover and the Help sheet open together, one Escape closes only Help (the top of the
 *   overlay stack), and the next closes the popover.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`)
 *
 * No WebGL, WASM or persistence is involved, so Chromium alone would do; it runs on every
 * project anyway, because Tab order and focus-on-click differ across engines. Each viewport
 * writes a screenshot of the open dialog to `test-results/`, as the other overlay specs do.
 * The opener is focused and activated from the keyboard, so Safari's habit of not focusing a
 * clicked button does not change what is under test.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'overlay-focus-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

/**
 * Whether keyboard focus is inside the element with this test id.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 * @returns {Promise<boolean>}
 */
function focusIsIn(page, testId) {
  return page.evaluate((id) => !!document.activeElement?.closest(`[data-testid="${id}"]`), testId)
}

test('Tab never leaves the Key sheet, and Escape returns focus to the Assistant button', async ({ page }, info) => {
  await page.goto('/')
  const opener = await revealAssistantButton(page)
  await opener.focus()
  await page.keyboard.press('Enter')
  const sheet = page.getByTestId('ai-key-sheet')
  await expect(sheet).toBeVisible()
  await expect.poll(() => focusIsIn(page, 'ai-key-sheet')).toBe(true)

  for (let press = 0; press < 10; press += 1) {
    await page.keyboard.press('Tab')
    expect(await focusIsIn(page, 'ai-key-sheet'), `Tab ${press + 1} stayed in the dialog`).toBe(true)
  }
  for (let press = 0; press < 3; press += 1) {
    await page.keyboard.press('Shift+Tab')
    expect(await focusIsIn(page, 'ai-key-sheet'), `Shift+Tab ${press + 1} stayed in the dialog`).toBe(true)
  }
  await page.screenshot({ path: join(SNAPSHOT_DIR, `key-sheet-${info.project.name}.png`) })

  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(page.getByTestId('assistant-button')).toBeFocused()
})

test('Escape closes only the Help sheet when a popover is open under it', async ({ page }, info) => {
  // The tier where the Library is a launcher that opens a pop-out (`ui-081`), at any project.
  await page.setViewportSize({ width: 760, height: 900 })
  await page.goto('/')
  await page.getByTestId('library-launcher-hardware').click()
  const popout = page.getByTestId('library-section-popout')
  await expect(popout).toBeVisible()

  await page.keyboard.press('?')
  const help = page.getByTestId('help-sheet')
  await expect(help).toBeVisible()
  await page.screenshot({ path: join(SNAPSHOT_DIR, `help-over-popout-${info.project.name}.png`) })

  await page.keyboard.press('Escape')
  await expect(help).toHaveCount(0)
  await expect(popout).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(popout).toHaveCount(0)
})

test('Tab stays inside the Help sheet too', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('?')
  await expect(page.getByTestId('help-sheet')).toBeVisible()
  for (let press = 0; press < 10; press += 1) {
    await page.keyboard.press('Tab')
    expect(await focusIsIn(page, 'help-sheet'), `Tab ${press + 1} stayed in Help`).toBe(true)
  }
})

// --- `TODO/ui-116`: the dialogs that moved onto `BaseDialog` ---------------------------------------

/**
 * Tab and Shift+Tab ten times each: focus must never leave the dialog with this test id.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 */
async function expectTabStaysIn(page, testId) {
  await expect.poll(() => focusIsIn(page, testId)).toBe(true)
  for (let press = 0; press < 10; press += 1) {
    await page.keyboard.press('Tab')
    expect(await focusIsIn(page, testId), `Tab ${press + 1} stayed in ${testId}`).toBe(true)
  }
  for (let press = 0; press < 3; press += 1) {
    await page.keyboard.press('Shift+Tab')
    expect(await focusIsIn(page, testId), `Shift+Tab ${press + 1} stayed in ${testId}`).toBe(true)
  }
}

test('the repair dialog traps Tab, sits over the page, and Escape cancels it', async ({ page }, info) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await page.evaluate(async () => {
    const { useRepairDialogStore } = await /** @type {any} */ (window).__e2eImport('/src/stores/repairDialog.js')
    useRepairDialogStore().show({
      edit: { rootId: 'body-1', record: null, param: null, oldValue: null },
      breakages: [
        {
          dependentRecordId: 'rec-1',
          dependentBodyId: 'body-2',
          dependentName: 'Cube 1',
          step: 2,
          relationship: 'Snap → avjack',
          placement: true,
          missingPieces: ['avjack'],
          newParts: ['usb-a', 'hdmi'],
          suggestions: {},
          reason: 'The part has no piece named avjack',
          refIds: [],
        },
      ],
    })
  })
  const dialog = page.getByTestId('repair-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(page.getByTestId('repair-backdrop')).toBeVisible()
  await expectTabStaysIn(page, 'repair-dialog')
  await page.screenshot({ path: join(SNAPSHOT_DIR, `repair-dialog-${info.project.name}.png`) })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('the variable-usage dialog traps Tab and Escape cancels it', async ({ page }, info) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  // A Pi with its Model bound to a variable, so deleting the variable has a consumer to list.
  const rows = page.getByTestId('library-rows')
  if (!(await rows.isVisible())) {
    await page.getByTestId('library-tab').click()
    await expect(rows).toBeVisible()
  }
  await page.getByTestId('library-rows-raspberrypi').scrollIntoViewIfNeeded()
  await page.evaluate(() => {
    const row = document.querySelector('[data-testid="library-row-raspberrypi.bplus"]')
    const view = document.querySelector('[data-testid="viewport"]')
    if (!row || !view) throw new Error('missing library row or viewport')
    const from = row.getBoundingClientRect()
    const to = view.getBoundingClientRect()
    const startX = from.left + from.width / 2
    const startY = from.top + from.height / 2
    const endX = to.left + to.width * 0.3
    const endY = to.top + to.height * 0.25
    const fire = (/** @type {EventTarget} */ target, /** @type {string} */ type, /** @type {number} */ x, /** @type {number} */ y) =>
      target.dispatchEvent(
        new PointerEvent(type, { pointerId: 31, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, bubbles: true, cancelable: true }),
      )
    fire(row, 'pointerdown', startX, startY)
    for (const t of [0.25, 0.5, 0.75, 1]) fire(window, 'pointermove', startX + (endX - startX) * t, startY + (endY - startY) * t)
    fire(window, 'pointerup', endX, endY)
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  const tab = page.getByTestId('library-tab')
  if ((await tab.isVisible()) && (await rows.isVisible())) await tab.click()
  const inspector = page.getByTestId('inspector')
  if ((await inspector.getAttribute('data-open')) !== 'true' && (await page.getByTestId('inspector-tab').isVisible())) {
    await page.getByTestId('inspector-tab').click()
    await expect(inspector).toHaveAttribute('data-open', 'true')
  }
  const inspectorView = page.getByTestId('inspector-view-inspector')
  if (await inspectorView.isVisible()) await inspectorView.click()
  await page.getByTestId('param-bind-model').click()
  await page.getByTestId('param-bind-new').click()
  await page.getByTestId('param-bind-new-name').fill('board')
  await page.getByTestId('param-bind-new-create').click()
  await expect(page.getByTestId('param-chip-model')).toHaveAttribute('data-variable', 'board')
  const variablesView = page.getByTestId('inspector-view-variables')
  if (await variablesView.isVisible()) await variablesView.click()
  await page.getByTestId('variable-menu-board').click()
  await page.getByTestId('variable-delete-board').click()

  const dialog = page.getByTestId('variable-usage-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expectTabStaysIn(page, 'variable-usage-dialog')
  await page.screenshot({ path: join(SNAPSHOT_DIR, `usage-dialog-${info.project.name}.png`) })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('variable-row-board')).toBeVisible()
})

test('the Share sheet is modal: Tab stays inside, the clear scrim catches a click, Escape closes it', async ({ page }, info) => {
  await page.goto('/')
  await expect(page.getByTestId('app-header')).toBeVisible()
  // Nothing in the scene still opens the sheet (with only the reason in it); the frame is the same.
  // The header's Share button, or the request File ▾ → Share… makes where the row has no room for it (the phone header).
  const openShare = async () => {
    const button = page.getByTestId('share-open')
    if (await button.isVisible()) {
      await button.focus()
      await page.keyboard.press('Enter')
    } else {
      // File ▾ → Share… is dimmed with nothing in the scene; it asks for the sheet through this store.
      await page.evaluate(async () => {
        const { useShareStore } = await /** @type {any} */ (window).__e2eImport('/src/stores/share.js')
        useShareStore().requestSheet()
      })
    }
  }
  await openShare()
  const sheet = page.getByTestId('share-sheet')
  await expect(sheet).toBeVisible()
  await expect(sheet).toHaveAttribute('aria-modal', 'true')
  await expectTabStaysIn(page, 'share-sheet')
  await page.screenshot({ path: join(SNAPSHOT_DIR, `share-sheet-${info.project.name}.png`) })
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)

  await openShare()
  await expect(sheet).toBeVisible()
  // The scrim is clear (it never dims) but it is there: a click on it closes the sheet.
  const backdrop = page.getByTestId('share-backdrop')
  await expect(backdrop).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await backdrop.click({ position: { x: 4, y: 4 } })
  await expect(sheet).toHaveCount(0)
})
