// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { loadScene, openApp, shot } from './support.js'

/**
 * Docs media for `docs/ai-partner.md` (`TODO/ai-004`): the Assistant key sheet before a key is
 * pasted, and after Save and test succeeds. The Anthropic API is stubbed through Playwright
 * routing, so nothing here touches a network and the pasted "key" is a made-up string that is
 * never shown (the field is a password field and the sheet never shows a key back). Laptop,
 * Chromium only.
 */
test.describe('docs media: assistant key', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  test.beforeEach(async ({ page }) => {
    await page.route('https://api.anthropic.com/**', async (route) => {
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' }
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
      return route.fulfill({ status: 200, headers: { ...headers, 'content-type': 'application/json' }, body: '{"input_tokens":8}' })
    })
  })

  test('assistant-key-sheet still', async ({ page }) => {
    await openApp(page)
    await page.getByTestId('assistant-button').click()
    const sheet = page.getByTestId('ai-key-sheet')
    await expect(sheet).toBeVisible()
    await page.getByTestId('ai-key-input').fill('sk-ant-api03-made-up-for-the-picture')
    await shot(page, 'assistant-key-sheet.png', { locator: sheet })
  })

  test('assistant-connected still', async ({ page }) => {
    await openApp(page)
    await page.getByTestId('assistant-button').click()
    await page.getByTestId('ai-key-input').fill('sk-ant-api03-made-up-for-the-picture')
    await page.getByTestId('ai-key-save').click()
    const sheet = page.getByTestId('ai-key-sheet')
    await expect(page.getByTestId('ai-key-status-text')).toContainText('Connected')
    await shot(page, 'assistant-connected.png', { locator: sheet })
  })
})

/**
 * Docs media for `docs/ai-partner.md`'s *While the Assistant works* (`TODO/ai-017`): the header's
 * **Assistant working** chip, and **Watch** showing the Assistant's copy in the amber preview. A
 * turn has to be *running* for both, so the Messages API is routed: the first reply places one
 * standoff, and the second is held until the picture is taken. Nothing reaches a network; the key
 * is made up and never shown. Laptop only.
 */
test.describe('docs media: while the Assistant works', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' }
  /** @param {object} data */
  const frame = (data) => `event: ${/** @type {any} */ (data).type}\ndata: ${JSON.stringify(data)}\n\n`
  /** @param {{ text?: string, calls?: Array<{ name: string, input: object }> }} step @param {number} turn */
  const sse = (step, turn) => {
    let body = frame({ type: 'message_start', message: { model: 'claude-opus-5-5', usage: { input_tokens: 1500, output_tokens: 1 } } })
    let index = 0
    if (step.text) {
      body += frame({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } })
      body += frame({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: step.text } })
      body += frame({ type: 'content_block_stop', index })
      index += 1
    }
    for (const [k, call] of (step.calls ?? []).entries()) {
      body += frame({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: `toolu_watch_${turn}_${k}`, name: call.name, input: {} } })
      body += frame({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(call.input) } })
      body += frame({ type: 'content_block_stop', index })
      index += 1
    }
    body += frame({ type: 'message_delta', delta: { stop_reason: (step.calls ?? []).length > 0 ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 120 } })
    body += frame({ type: 'message_stop' })
    return body
  }

  /**
   * Start a turn that has placed one standoff on its copy and is waiting on its next reply.
   *
   * @param {import('@playwright/test').Page} page
   * @returns {Promise<() => void>} Lets the held reply go.
   */
  async function heldTurn(page) {
    /** @type {() => void} */
    let release = () => {}
    const held = new Promise((resolve) => {
      release = () => resolve(undefined)
    })
    let replies = 0
    await page.context().route('https://api.anthropic.com/**', async (route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
      if (request.url().endsWith('/count_tokens')) {
        return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: '{"input_tokens":8}' })
      }
      replies += 1
      const turn = replies
      if (turn === 1) {
        const step = {
          text: 'Adding M3 standoffs at the corners of the board, front left first.',
          calls: [{ name: 'create', input: { op: 'primitive.cylinder', positionMm: [-40, -30, 0], params: { diameter: 6, height: 5 }, rationale: 'M3 standoff, front left' } }],
        }
        return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sse(step, turn) })
      }
      await held
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sse({ text: 'Placed a standoff.' }, turn) })
    })
    await openApp(page)
    await loadScene(page, 'one-cube.ndjson', 1)
    await page.getByTestId('assistant-button').click()
    await page.getByTestId('ai-key-input').fill('sk-ant-api03-made-up-for-the-picture')
    await page.getByTestId('ai-key-save').click()
    await expect(page.getByTestId('ai-key-status-text')).toContainText('Connected')
    await page.getByTestId('ai-key-done').click()
    await page.getByTestId('ai-input').fill('add four M3 standoffs at the corners of the board')
    await page.getByTestId('ai-send').click()
    await expect(page.getByTestId('ai-working-chip')).toBeVisible()
    // The standoff is on the Assistant's copy: its activity row has landed in the transcript.
    await expect(page.getByTestId('ai-transcript')).toContainText('Created')
    return release
  }

  test('ai-working-chip still', async ({ page }) => {
    const release = await heldTurn(page)
    // Closed panel: the chip is what says the turn is still running.
    await page.getByTestId('assistant-close').click()
    await expect(page.getByTestId('ai-working-chip')).toBeVisible()
    await shot(page, 'ai-working-chip.png', { locator: page.getByTestId('app-header') })
    release()
  })

  test('ai-watch still', async ({ page }) => {
    const release = await heldTurn(page)
    await page.getByTestId('ai-watch').click()
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-previewing', 'true')
    await expect(page.getByTestId('timeline-preview-strip')).toContainText('Watching the Assistant')
    await shot(page, 'ai-watch.png')
    release()
  })
})

