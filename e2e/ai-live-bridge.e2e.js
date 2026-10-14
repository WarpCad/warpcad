// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { connectClaudeCode } from '../mcp/claudeCodeStandIn.js'

/**
 * The live bridge, driven end to end against `/` (`TODO/ai-012`, Decision 11): Claude Code's
 * stand-in (a real MCP client over Streamable HTTP to the dev server's `/mcp`) asks for a change,
 * gets the pairing sentence back, and the code from it is typed into the real **Connect to Claude
 * Code** sheet. Then Claude places a box and a sphere, the user moves one with the real gizmo, and
 * **Undo AI turn** takes Claude's group back — refused by name first, because the user's move
 * builds on it, then allowed once that move is undone.
 *
 * The code is read from the MCP tool result, which is where Claude Code shows it to the user. The
 * TODO's "read from the helper's stderr" predates the rule that the code is never written to a
 * log; the bridge's own specs assert it is in no log line.
 *
 * - **Engines: all three.** The tab talks over Vite's HMR WebSocket, exactly the surface that
 *   differs by engine. WebKit is not skipped: it is driven through the whole flow (it works from
 *   `http://localhost`) and its sheet must state plainly that a hosted (https) copy cannot connect.
 * - **Viewports: all three, a snapshot at each.** At phone and tablet width the control is
 *   disabled with its reason, because a browser there cannot reach Claude Code on another machine.
 * - Each project gets its own MCP session, so its own code and its own tab: parallel projects
 *   never answer each other's calls.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'ai-live-bridge-snapshots')
const REQUEST = 'add a 40 mm cube and a 20 mm sphere on top of it'

/** @param {import('@playwright/test').TestInfo} testInfo */
const isLaptop = (testInfo) => testInfo.project.name.endsWith('-laptop')
/** @param {import('@playwright/test').TestInfo} testInfo */
const engineOf = (testInfo) => testInfo.project.name.split('-')[0]

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} testInfo
 * @param {string} name
 */
async function snapshot(page, testInfo, name) {
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `${name}-${testInfo.project.name}.png`) })
}

/** @param {import('@playwright/test').Page} page */
async function openHistory(page) {
  if (await page.getByTestId('timeline-panel').isVisible()) return
  await page.getByTestId('timeline-toggle').click()
  await expect(page.getByTestId('timeline-panel')).toBeVisible()
}

/**
 * Drag a gizmo arm with real pointer events (as `gizmo-transform.e2e.js` does), outward from the
 * hub, so one helper drives every engine.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 * @param {number} distancePx
 */
async function dragArm(page, testId, distancePx) {
  await expect(page.locator(`[data-testid="${testId}"]`)).toBeAttached()
  await page.evaluate(
    async ({ testId, distancePx }) => {
      const el = /** @type {Element} */ (document.querySelector(`[data-testid="${testId}"]`))
      const view = /** @type {Element} */ (document.querySelector('[data-testid="viewport"]'))
      const gizmo = document.querySelector('[data-testid="transform-gizmo"]')
      const [ox, oy] = (gizmo?.getAttribute('data-origin') ?? '0,0').split(',').map(Number)
      const rect = view.getBoundingClientRect()
      const x1 = Number(el.getAttribute('x1'))
      const y1 = Number(el.getAttribute('y1'))
      const x2 = Number(el.getAttribute('x2'))
      const y2 = Number(el.getAttribute('y2'))
      const startX = rect.left + x1 + (x2 - x1) * 0.3
      const startY = rect.top + y1 + (y2 - y1) * 0.3
      let dx = startX - (rect.left + ox)
      let dy = startY - (rect.top + oy)
      const length = Math.hypot(dx, dy) || 1
      dx /= length
      dy /= length
      /** @param {string} type @param {number} t */
      const fire = (type, t) =>
        el.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 31,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            clientX: startX + dx * distancePx * t,
            clientY: startY + dy * distancePx * t,
            bubbles: true,
            cancelable: true,
          }),
        )
      const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
      fire('pointerdown', 0)
      for (const t of [0.25, 0.5, 0.75, 1]) {
        fire('pointermove', t)
        await frame()
      }
      fire('pointerup', 1)
    },
    { testId, distancePx },
  )
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

test('Claude Code pairs through the Connect sheet, places a box and a sphere, and Undo AI turn takes them back', async ({ page, baseURL }, testInfo) => {
  test.skip(!isLaptop(testInfo), 'Phone and tablet cannot reach Claude Code; their test below asserts the disabled control and its reason.')
  test.setTimeout(90_000)

  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()

  const claude = await connectClaudeCode(`${baseURL}/mcp`)
  try {
    // The browser tool set is listed (the registry seam), alongside the shared tools.
    const names = await claude.toolNames()
    for (const name of ['create', 'get_selection', 'select', 'capture_view']) expect(names).toContain(name)

    // No tab yet: the instruction sentence, with the code — not a hang.
    const first = await claude.call('create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], request: REQUEST })
    expect(first.isError).toBe(true)
    expect(first.text).toContain('Assistant → Connect to Claude Code')
    const code = /** @type {RegExpExecArray} */ (/\b([A-Z2-9]{4}-[A-Z2-9]{4})\b/.exec(first.text))[1]

    // The real way in with no key: Assistant → the key sheet → Connect to Claude Code…
    await page.getByTestId('assistant-button').click()
    await expect(page.getByTestId('ai-key-sheet')).toBeVisible()
    await page.getByTestId('ai-key-connect').click()
    const sheet = page.getByTestId('ai-connect-sheet')
    await expect(sheet).toBeVisible()

    // Each engine's plain-words line. WebKit: what a hosted copy cannot do, stated rather than skipped.
    const engine = engineOf(testInfo)
    const note = page.getByTestId('ai-connect-engine-note')
    if (engine === 'webkit') {
      await expect(note).toHaveAttribute('data-engine', 'webkit')
      await expect(note).toContainText('A hosted (https) copy of WarpCad cannot connect')
    } else if (engine === 'chromium') {
      await expect(note).toContainText('choose Allow')
    } else {
      await expect(note).toHaveCount(0)
    }

    // A wrong code is refused, in words, and pairs nothing.
    await page.getByTestId('ai-connect-code').fill('ABCD-EFGH')
    await page.getByTestId('ai-connect-submit').click()
    await expect(page.getByTestId('ai-connect-status')).toContainText('not right')
    await expect(page.getByTestId('ai-connect-connected')).toHaveCount(0)

    await page.getByTestId('ai-connect-code').fill(code.toLowerCase())
    await page.getByTestId('ai-connect-submit').click()
    await expect(page.getByTestId('ai-connect-connected')).toBeVisible()
    await snapshot(page, testInfo, 'connected-sheet')
    await page.getByTestId('ai-connect-done').click()
    await expect(page.getByTestId('assistant-panel')).toBeVisible()
    await expect(page.getByTestId('ai-bridge-chip')).toHaveText('Claude Code · connected')

    // `TODO/ai-020`: with no key, a connected panel says Claude Code is editing — it never asks for
    // a key — and the composer is off with its reason instead of sending to a model that is not there.
    await expect(page.getByTestId('assistant-connection-text')).toContainText('Claude Code is editing this project')
    await expect(page.getByTestId('assistant-connection-text')).not.toContainText('paste')
    await expect(page.getByTestId('assistant-model-name')).toHaveCount(0)
    await expect(page.getByTestId('ai-composer-reason')).toBeVisible()
    await expect(page.getByTestId('ai-input')).toBeDisabled()
    await expect(page.getByTestId('ai-send')).toBeDisabled()

    // Claude places a box and a sphere: both in the viewport, both in History via mcp.
    const cube = await claude.call('create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], request: REQUEST })
    expect(cube.isError, cube.text).toBe(false)
    expect(cube.text).not.toContain(code)
    const sphere = await claude.call('create', { op: 'primitive.sphere', positionMm: [0, 0, 40], request: REQUEST })
    expect(sphere.isError, sphere.text).toBe(false)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
    await expect(page.getByTestId('ai-undo-turn')).toBeEnabled()

    await openHistory(page)
    for (const step of [1, 2]) {
      const row = page.locator('li.row-wrap', { has: page.getByTestId(`timeline-row-${step}`) })
      await expect(row.getByTestId('chip-origin')).toHaveText('via mcp')
    }
    // Opening the History dock resizes the canvas; WebKit clears it on resize until the next frame.
    await page.waitForTimeout(500)
    await snapshot(page, testInfo, 'connected-history')
    await page.getByTestId('timeline-toggle').click()

    // The user moves Claude's sphere with the real gizmo: an ordinary body.
    const sphereId = /** @type {RegExpExecArray} */ (/"bodyId":"([^"]+)"/.exec(sphere.text))[1]
    await page.getByTestId(`objects-row-${sphereId}`).click()
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', sphereId)
    const before = (await sceneBodies(page)).find((body) => body.id === sphereId)?.center
    await dragArm(page, 'gizmo-grab-arm-x', 80)
    await expect.poll(async () => JSON.stringify((await sceneBodies(page)).map((body) => body.center))).not.toContain(JSON.stringify(before))
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')

    // Undo AI turn is refused by name while the user's move builds on Claude's sphere; nothing changes.
    await page.getByTestId('ai-undo-turn').click()
    await expect(page.getByTestId('ai-notice').last()).toContainText("Can't undo the AI turn")
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')

    // The user's own Undo takes back their move (Claude's rows were never on that stack)…
    await page.getByTestId('undo-button').click()
    await expect(page.getByTestId('undo-button')).toBeDisabled()
    // …and then Undo AI turn takes Claude's whole group back in one step.
    await page.getByTestId('ai-undo-turn').click()
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
    await expect(page.getByTestId('ai-notice').last()).toContainText('Took back the last change Claude Code made')
    await expect(page.getByTestId('ai-undo-turn')).toBeDisabled()
    await expect(page.getByTestId('undo-button')).toBeDisabled()
    await snapshot(page, testInfo, 'after-undo')

    // A hostile web page cannot reach /mcp; the pairing code is single use.
    const hostile = await page.request.post('/mcp', {
      headers: { origin: 'https://evil.example', 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      data: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'evil', version: '0' } } },
    })
    expect(hostile.status()).toBe(403)
  } finally {
    await claude.close()
  }
})

test('on a phone or tablet the Connect control is disabled with its reason, not hidden', async ({ page }, testInfo) => {
  test.skip(isLaptop(testInfo), 'A desktop browser can connect; the laptop test drives the whole flow.')
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await page.getByTestId('assistant-button').click()
  await expect(page.getByTestId('ai-key-sheet')).toBeVisible()
  const button = page.getByTestId('ai-key-connect')
  await expect(button).toBeVisible()
  await expect(button).toBeDisabled()
  await expect(page.getByTestId('ai-key-connect-reason')).toHaveText('Claude Code must run on this device')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await snapshot(page, testInfo, 'disabled')
})
