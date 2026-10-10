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
const bodyIds = (page) => page.$$eval('[data-body-id]', (nodes) => nodes.map((node) => node.getAttribute('data-body-id')))

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
    await expect(page.getByTestId('inspector')).toContainText(/Cube 1\s*30 × 30 × 260 mm/)
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

test('a production build ignores a transcript: no badge, and the Assistant asks for a key', async ({ page }) => {
  test.skip(process.env.E2E_PREVIEW !== '1', 'needs the production build: E2E_PREVIEW=1 npx playwright test e2e/ai-scripted.e2e.js')
  await useScript(page, transcript('airfoil-wing'))
  await page.getByTestId('assistant-button').click()
  await expect(page.getByTestId('ai-key-input')).toBeVisible()
  await expect(page.getByTestId('ai-scripted-badge')).toHaveCount(0)
})
