// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `TODO/ai-010` — the **plumbing** of `TODO/ACCEPTANCE.md` scenarios 17 (airfoil and wing) and
 * 18 (a drawing becomes a library part), played by the **scripted provider**
 * (`src/ai/providers/scripted.js`) against the real app at `/`: the real agent loop, tool
 * registry, document, kernel worker, viewport and chat panel, with a recorded transcript in
 * place of the model.
 *
 * ## What this proves, and what it cannot
 *
 * That a chat message reaches the tools, the tools change the document, the viewport shows every
 * body, Stop and Undo AI turn work, a follow-up edits instead of duplicating, and a library save
 * waits for Confirm. It does **not** prove the model would choose any of these calls: only the
 * live runs of scenarios 17 and 18 and `ai-011`'s eval do (`docs/decisions/ai-partner.md`).
 * The panel wears a **Scripted** badge so nobody mistakes this for the model.
 *
 * ## No network, no key
 *
 * The transcript is handed to the page before it loads (`window.__WARPCAD_SCRIPTED__`, honoured
 * only by a dev build). Any request to the Anthropic API fails the test, and the real key store
 * is never read.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`)
 *
 * All three viewports (the chat is a half-height sheet at phone width) and all three engines
 * (kernel worker, canvas, IndexedDB for the library save). Firefox may fail to launch in some
 * sandboxes (`TROUBLESHOOTING.md`, 2026-09-17); that is the environment, not this spec.
 */

const FIXTURES = join(process.cwd(), 'e2e', 'fixtures')
/** @param {string} name */
const transcript = (name) => JSON.parse(readFileSync(join(FIXTURES, 'ai', `${name}.json`), 'utf8'))

/**
 * Hand the page a transcript before it loads, and fail on any call to the real API.
 *
 * @param {import('@playwright/test').Page} page
 * @param {any} script
 */
async function useScript(page, script) {
  await page.addInitScript((value) => {
    /** @type {any} */ (window).__WARPCAD_SCRIPTED__ = value
  }, script)
  await page.context().route('https://api.anthropic.com/**', (route) => {
    throw new Error(`the scripted provider must not reach the network: ${route.request().url()}`)
  })
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
}

/** @param {import('@playwright/test').Page} page */
async function openAssistant(page) {
  await page.getByTestId('assistant-button').click()
  await expect(page.getByTestId('assistant-panel')).toBeVisible()
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} message
 */
async function send(page, message) {
  await page.getByTestId('ai-input').fill(message)
  await page.getByTestId('ai-send').click()
}

/** @param {import('@playwright/test').Page} page */
const idle = (page) => expect(page.getByTestId('assistant-panel')).toHaveAttribute('data-running', 'false', { timeout: 30_000 })

/** @param {import('@playwright/test').Page} page */
const bodyIds = async (page) => {
  const ids = await page.$$eval('[data-body-id]', (nodes) => nodes.map((node) => node.getAttribute('data-body-id') ?? ''))
  // Ids are `kind-<replica>-<counter>` (`TODO/data-008`); the replica is random per page load,
  // so compare `kind-<counter>` — the order and the kinds are what these specs assert.
  return ids.map((id) => id.replace(/-[a-z2-7]{6}-(\d+)$/, '-$1'))
}

const WING_PROMPT = 'Use the sketch tool to create an airfoil for a model plane wing, create the wing then the rest of the model so I can 3D print it.'

test.describe('scenario 17 plumbing — airfoil and wing', () => {
  test.skip(process.env.E2E_PREVIEW === '1', 'scripted mode is dev-only: the production build ignores a transcript (the last test)')
  test('the Assistant opens straight to the chat, marked Scripted, with no key sheet', async ({ page }) => {
    await useScript(page, transcript('airfoil-wing'))
    await openAssistant(page)
    await expect(page.getByTestId('ai-scripted-badge')).toBeVisible()
    await expect(page.getByTestId('assistant-connection-text')).toContainText('Scripted transcript')
    await expect(page.getByTestId('ai-key-input')).toHaveCount(0)
    // The developer-only mode must not offer the key sheet: a dev's real key is not touched.
    await expect(page.getByTestId('assistant-keys')).toHaveCount(0)
  })

  test('a loft wing and the rest appear, every body stays, and Undo AI turn takes the whole turn back', async ({ page }) => {
    await useScript(page, transcript('airfoil-wing'))
    await openAssistant(page)
    await send(page, WING_PROMPT)
    await idle(page)

    const viewport = page.getByTestId('viewport')
    // Scenario 1's lesson: placing more bodies must not hide or replace the first.
    await expect(viewport).toHaveAttribute('data-body-count', '4')
    expect(await bodyIds(page)).toEqual(['sketch-1', 'cuboid-2', 'cuboid-3', 'cuboid-4'])
    await expect(page.getByTestId('ai-transcript')).toContainText('all on the bed')
    // check_printability really flags the airfoil's knife-edge trailing edge, and the reply says so.
    await expect(page.getByTestId('ai-transcript')).toContainText('Wall 0 mm thick')
    await expect(page.getByTestId('ai-transcript')).toContainText('trailing edge is a 0 mm wall')
    // The wing's own parameters are in the project, with the intent that made them.
    await expect(page.getByTestId('ai-undo-turn')).toBeEnabled()

    // One Undo AI turn removes the wing and the rest together.
    await page.getByTestId('ai-undo-turn').click()
    await expect(viewport).toHaveAttribute('data-body-count', '0')
  })

  test('a follow-up edits the wing in place: no new body, and the wing is 20 % longer', async ({ page }) => {
    await useScript(page, transcript('airfoil-wing'))
    await openAssistant(page)
    await send(page, WING_PROMPT)
    await idle(page)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '4')
    // The Objects list gives every body's size: the wing's span is 200 mm to begin with.
    await expect(page.getByTestId('inspector')).toContainText(/Sketch 1\s*120 × [\d.]+ × 200 mm/)

    await send(page, 'make the wing 20 % longer')
    await idle(page)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '4')
    expect(await bodyIds(page)).toEqual(['sketch-1', 'cuboid-2', 'cuboid-3', 'cuboid-4'])
    await expect(page.getByTestId('ai-transcript')).toContainText('same wing, edited in place')
    // The same wing, now 240 mm of span (20 % more), and the other three untouched.
    await expect(page.getByTestId('inspector')).toContainText(/Sketch 1\s*120 × [\d.]+ × 240 mm/)
    await expect(page.getByTestId('inspector')).toContainText(/Cube 1\s*30 × 30 × 200 mm/)
  })

  test('Stop mid-reply ends the turn, lands nothing, and the app is usable afterwards', async ({ page }) => {
    const slow = transcript('airfoil-wing')
    slow.turns[0].delayMs = 120
    await useScript(page, slow)
    await openAssistant(page)
    await send(page, WING_PROMPT)

    const stop = page.getByTestId('ai-stop')
    await expect(stop).toBeVisible()
    await stop.click()
    await idle(page)
    // A stopped turn lands nothing: the document is still empty.
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
    await expect(page.getByTestId('ai-send')).toBeVisible()
  })
})

test.describe('scenario 18 plumbing — a drawing becomes a library part', () => {
  test.skip(process.env.E2E_PREVIEW === '1', 'scripted mode is dev-only: the production build ignores a transcript (the last test)')
  test('attach, a named group is built on the drawing, and My parts changes only on Confirm', async ({ page }) => {
    await useScript(page, transcript('drawing-board'))
    await openAssistant(page)
    await expect(page.getByTestId('library-user-count')).toHaveText('0')

    await page.getByTestId('ai-attach-input').setInputFiles({
      name: 'board.png',
      mimeType: 'image/png',
      buffer: readFileSync(join(FIXTURES, 'drawing-board-85x56.png')),
    })
    await expect(page.getByTestId('ai-attachments').locator('img')).toHaveCount(1)
    await send(page, 'Here is a drawing of a raspberry pi 7 create a group object to be added to the library.')
    await expect(page.getByTestId('ai-save-proposal')).toBeVisible({ timeout: 30_000 })
    await idle(page)

    // It said what it assumed instead of stating a connector height as a fact.
    await expect(page.getByTestId('ai-transcript')).toContainText('Assumed (not printed)')
    await expect(page.getByTestId('ai-transcript')).toContainText('Set scale 85.0 mm')
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    await expect.poll(() => page.$$eval('[data-testid="inspector-parts"] li', (nodes) => nodes.map((node) => (node.textContent ?? '').trim()))).toEqual(['Board', 'USB-A 1', 'USB-A 2', 'Ethernet'])

    // Nothing is saved until the user taps Confirm.
    await expect(page.getByTestId('library-user-count')).toHaveText('0')
    await page.getByTestId('ai-save-confirm').click()
    await expect(page.getByTestId('ai-save-status')).toHaveText('Saved to My parts.')
    await expect(page.getByTestId('library-user-count')).toHaveText('1')
  })
})

/**
 * `TODO/ai-017` — keep editing while the Assistant works. A **paced** transcript (`delayMs` per
 * text chunk) keeps the turn observably in progress while the test places one body and moves
 * another with pointer events in the real viewport, then toggles **Watch**. The Assistant panel
 * is closed for the edits: at phone width its sheet owns the bottom slot and hides the Library
 * (`AppView.vue`), so closing it is what a person on a phone does, and the header chip is what
 * says the turn is still running.
 *
 * Engines: all three (viewport, pointer input, IndexedDB autosave during a turn). Viewports: all
 * three, with a snapshot of the chip and of Watch at each.
 */
const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'ai-edit-while-working')

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
 * Drag a Library row into the viewport with pointer events (the `gizmo-transform.e2e.js` helper:
 * one gesture that drives every engine, including those without touch emulation).
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ op: string, fx: number, fy: number }} options
 */
async function placeFromLibrary(page, { op, fx, fy }) {
  await openLibrary(page)
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
      /** @param {EventTarget} target @param {string} type @param {number} x @param {number} y */
      const fire = (target, type, x, y) =>
        target.dispatchEvent(
          new PointerEvent(type, { pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, bubbles: true, cancelable: true })
        )
      fire(row, 'pointerdown', startX, startY)
      for (const t of [0.25, 0.5, 0.75, 1]) fire(window, 'pointermove', startX + (endX - startX) * t, startY + (endY - startY) * t)
      fire(window, 'pointerup', endX, endY)
    },
    { op, fx, fy }
  )
  await page.waitForTimeout(120)
  await closeLibrary(page)
}

/**
 * Drag the selected body's X arm outward by `distancePx`: one move step, by the user.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} distancePx
 */
async function dragGizmoArm(page, distancePx) {
  const handle = page.locator('[data-testid="gizmo-grab-arm-x"]')
  await expect(handle).toBeAttached()
  await page.evaluate((distancePx) => {
    const el = document.querySelector('[data-testid="gizmo-grab-arm-x"]')
    const view = document.querySelector('[data-testid="viewport"]')
    const gizmo = document.querySelector('[data-testid="transform-gizmo"]')
    if (!el || !view || !gizmo) throw new Error('no gizmo')
    const rect = view.getBoundingClientRect()
    const [ox, oy] = (gizmo.getAttribute('data-origin') ?? '0,0').split(',').map(Number)
    const box = el.getBoundingClientRect()
    const startX = box.left + box.width / 2
    const startY = box.top + box.height / 2
    let dx = startX - (rect.left + ox)
    let dy = startY - (rect.top + oy)
    const length = Math.hypot(dx, dy) || 1
    dx /= length
    dy /= length
    /** @param {string} type @param {number} t */
    const fire = (type, t) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 21,
          pointerType: 'mouse',
          isPrimary: true,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          clientX: startX + dx * distancePx * t,
          clientY: startY + dy * distancePx * t,
          bubbles: true,
          cancelable: true,
        })
      )
    fire('pointerdown', 0)
    for (const t of [0.2, 0.45, 0.7, 1]) fire('pointermove', t)
    fire('pointerup', 1)
  }, distancePx)
  await page.waitForTimeout(80)
}

/** @param {import('@playwright/test').Page} page */
const cubeCenter = (page) => page.getByTestId('scene-bodies').locator('[data-body-name="Cube 1"]').getAttribute('data-body-center')

/** A paced turn: two standoffs, each in a reply slow enough to edit during. */
const STANDOFF_PROMPT = 'add four M3 standoffs at the corners of the board'

test.describe('TODO/ai-017 — keep editing while the Assistant works', () => {
  test.skip(process.env.E2E_PREVIEW === '1', 'scripted mode is dev-only: the production build ignores a transcript')
  test.setTimeout(90_000)

  test('edit during a turn, Watch on and off, both writers land; Undo AI turn takes the AI’s part, header Undo the user’s', async ({ page }, testInfo) => {
    await useScript(page, transcript('edit-while-working'))
    // Before the turn: the cube the user will move while the Assistant works.
    await placeFromLibrary(page, { op: 'primitive.cuboid', fx: 0.35, fy: 0.45 })
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    const startCenter = await cubeCenter(page)

    await openAssistant(page)
    await send(page, STANDOFF_PROMPT)
    await expect(page.getByTestId('ai-status')).toContainText('Working')
    const chip = page.getByTestId('ai-working-chip')
    await expect(chip).toBeVisible()
    await expect(chip).toHaveAccessibleName('Assistant working')
    // The viewport shows the live document, with no amber outline.
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-previewing', 'false')

    // Close the panel (the chip stays) and work: move the cube, then drop a sphere.
    await page.getByTestId('assistant-close').click()
    await expect(chip).toBeVisible()
    await page.screenshot({ path: join(SNAPSHOT_DIR, `${testInfo.project.name}-chip.png`) })
    await page.getByTestId('scene-bodies').locator('[data-body-name="Cube 1"]').waitFor({ state: 'attached' })
    await dragGizmoArm(page, 60)
    await expect.poll(() => cubeCenter(page)).not.toBe(startCenter)
    const movedCenter = await cubeCenter(page)
    await placeFromLibrary(page, { op: 'primitive.sphere', fx: 0.75, fy: 0.25 })
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')

    // Watch: the fork, read-only, in the amber preview; and back.
    await openAssistant(page)
    const watch = page.getByTestId('ai-watch')
    await expect(watch).toBeEnabled()
    await watch.click()
    await expect(watch).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-previewing', 'true')
    await expect(page.getByTestId('timeline-preview-strip')).toContainText('Watching the Assistant — your project is unchanged')
    await expect(page.getByTestId('undo-button')).toBeDisabled()
    await page.screenshot({ path: join(SNAPSHOT_DIR, `${testInfo.project.name}-watch.png`) })
    await watch.click()
    await expect(watch).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-previewing', 'false')
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')

    await idle(page)
    await expect(chip).toBeHidden()
    await expect(watch).toBeDisabled()
    // Both writers: the user's cube and sphere, and the Assistant's two standoffs.
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '4')
    expect(await cubeCenter(page)).toBe(movedCenter)
    await expect(page.getByTestId('ai-transcript')).toContainText('Merged with 2 changes you made meanwhile')

    // Undo AI turn removes only the standoffs; header Undo then removes the user's last step.
    await page.getByTestId('ai-undo-turn').click()
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
    expect(await cubeCenter(page)).toBe(movedCenter)
    await page.getByTestId('assistant-close').click()
    await page.getByTestId('undo-button').click()
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    expect(await cubeCenter(page)).toBe(movedCenter)
  })

  test('the user moves the cube first, the Assistant fillets it: the banner, Show, and the AI row is the one flagged', async ({ page }) => {
    await useScript(page, transcript('edit-while-working-conflict'))
    await placeFromLibrary(page, { op: 'primitive.cuboid', fx: 0.4, fy: 0.45 })
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

    await openAssistant(page)
    await send(page, 'round the top edge of the cube')
    await expect(page.getByTestId('ai-working-chip')).toBeVisible()
    await page.getByTestId('assistant-close').click()
    await dragGizmoArm(page, 60)

    await expect(page.getByTestId('ai-working-chip')).toBeHidden({ timeout: 30_000 })
    await expect(page.getByTestId('merge-banner-text')).toHaveText(/1 step conflicted$/)
    await page.getByTestId('merge-banner-show').click()
    await expect(page.getByTestId('timeline-panel')).toBeVisible()
    const row = page.locator('[data-testid="timeline-panel"] [aria-current="true"]')
    await expect(row.getByTestId('chip-broken')).toBeVisible()
    await expect(row).toContainText(/Fillet/)
    await expect(page.getByTestId('timeline-broken-reason')).toHaveText(/^conflicts with step 2 \(Move Cube 1\)$/)
  })

  test('Stop mid-turn after a user edit: the user’s edit stays, nothing from the turn does', async ({ page }) => {
    await useScript(page, transcript('edit-while-working'))
    await openAssistant(page)
    await send(page, STANDOFF_PROMPT)
    await expect(page.getByTestId('ai-working-chip')).toBeVisible()
    await page.getByTestId('assistant-close').click()
    await placeFromLibrary(page, { op: 'primitive.sphere', fx: 0.5, fy: 0.25 })
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

    await openAssistant(page)
    await page.getByTestId('ai-stop').click()
    await idle(page)
    await expect(page.getByTestId('ai-transcript')).toContainText('Nothing from this turn was kept')
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    expect(await bodyIds(page)).toEqual(['sphere-1'])
    await expect(page.getByTestId('ai-working-chip')).toBeHidden()
  })
})

test('a production build ignores a transcript: no badge, and the Assistant asks for a key', async ({ page }) => {
  test.skip(process.env.E2E_PREVIEW !== '1', 'needs the production build: E2E_PREVIEW=1 npx playwright test e2e/ai-scripted.e2e.js')
  await useScript(page, transcript('airfoil-wing'))
  await page.getByTestId('assistant-button').click()
  await expect(page.getByTestId('ai-key-input')).toBeVisible()
  await expect(page.getByTestId('ai-scripted-badge')).toHaveCount(0)
})
