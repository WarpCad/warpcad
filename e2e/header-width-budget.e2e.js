// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `TODO/ui-078` — the header's width budget, measured (not summed). At every viewport each header
 * control's right edge is inside the viewport; at phone width no two tap targets overlap and
 * neighbours keep at least an 8 px gap; and (dev host) the grouped **AI** menu opens both entries.
 * Against the real app at `/`.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`)
 *
 * All three viewports with a snapshot at each, on all three engines: WebKit and Firefox lay out
 * flex gaps and `scrollWidth` differently (`ui-075`). No WebGL/WASM/persistence beyond mounting.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'header-width-budget')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

// Silent HMR socket: the dev host would otherwise broadcast live-access status over the state set here.
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {})
})

/** @param {import('@playwright/test').Page} page */
async function headerBoxes(page) {
  return page.getByTestId('app-header').evaluate((bar) => {
    const out = []
    for (const el of bar.querySelectorAll('button, [role="button"], a')) {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden') continue
      // Skip anything inside the open menu: it is a popover, not part of the row.
      if (el.closest('[data-testid="ai-menu"]')) continue
      out.push({ id: el.getAttribute('data-testid') || el.className, x: r.x, y: r.y, w: r.width, h: r.height, right: r.right })
    }
    return out
  })
}

for (const bridge of ['unavailable', 'idle']) {
  test(`every header control stays inside the viewport (bridge ${bridge})`, async ({ page }, testInfo) => {
    await page.goto('/')
    await expect(page.getByTestId('viewport')).toBeVisible()
    await page.evaluate(async (value) => {
      const { useAiChatStore } = await window.__e2eImport('/src/stores/aiChat.js')
      useAiChatStore().bridge = value
    }, bridge)
    const width = page.viewportSize().width
    const boxes = await headerBoxes(page)
    expect(boxes.length).toBeGreaterThan(3)
    for (const b of boxes) expect(b.right, `${b.id} right edge`).toBeLessThanOrEqual(width)
    const bar = await page.getByTestId('app-header').evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
    expect(bar.scroll).toBeLessThanOrEqual(bar.client)
    if (testInfo.project.name.endsWith('phone')) {
      const taps = boxes.filter((b) => b.w >= 43.5 && b.h >= 43.5).sort((a, b) => a.x - b.x)
      for (let i = 1; i < taps.length; i += 1) {
        const gap = taps[i].x - taps[i - 1].right
        expect(gap, `gap ${taps[i - 1].id} → ${taps[i].id}`).toBeGreaterThanOrEqual(7.5)
      }
      console.log(`[budget ${testInfo.project.name} ${bridge}]`, JSON.stringify(boxes.map((b) => [b.id, Math.round(b.x * 10) / 10, Math.round(b.right * 10) / 10])))
    }
    await page.screenshot({ path: join(SNAPSHOT_DIR, `${testInfo.project.name}-${bridge}.png`) })
  })
}

test('phone (dev host): the AI menu opens both entries', async ({ page }, testInfo) => {
  test.skip(process.env.E2E_PREVIEW === '1', 'the grouped menu exists only on the dev host: E2E_DEV=1 npx playwright test e2e/header-width-budget.e2e.js')
  test.skip(!testInfo.project.name.endsWith('phone'), 'The group is the phone-width layout.')
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  const trigger = page.getByTestId('ai-menu-button')
  await expect(trigger).toBeVisible()
  await expect(page.getByTestId('assistant-button')).toHaveCount(0)
  await trigger.click()
  const menu = page.getByTestId('ai-menu')
  await expect(menu).toBeVisible()
  for (const id of ['assistant-button', 'live-mcp-button']) {
    const box = await page.getByTestId(id).boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(43.5)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width)
  }
  await page.screenshot({ path: join(SNAPSHOT_DIR, `${testInfo.project.name}-menu.png`) })
  // Escape dismisses; the Live MCP row opens the access sheet; the Assistant row opens the chat/key sheet.
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await trigger.click()
  await page.getByTestId('live-mcp-button').click()
  await expect(page.getByTestId('ai-connect-sheet')).toBeVisible()
  await expect(menu).toBeHidden()
})
