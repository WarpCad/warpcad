// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Render `e2e/fixtures/drawing-board-85x56.svg` (a mechanical drawing of a FICTIONAL board,
 * `TODO/ai-008`) to the PNG the e2e spec and scenario 18 attach. Run it again only when the SVG
 * changes: `node scripts/render-drawing-fixture.mjs`.
 *
 * The PNG, not the SVG, is the fixture: the chat's Attach refuses SVG on purpose (it is markup,
 * not pixels — `sketch-003`'s sanitiser).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const svgPath = fileURLToPath(new URL('../e2e/fixtures/drawing-board-85x56.svg', import.meta.url))
const pngPath = fileURLToPath(new URL('../e2e/fixtures/drawing-board-85x56.png', import.meta.url))

const svg = readFileSync(svgPath, 'utf8')
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 })
  await page.setContent(`<!doctype html><html><body style="margin:0">${svg}</body></html>`)
  await page.locator('svg').screenshot({ path: pngPath, omitBackground: false })
  console.log(`wrote ${pngPath}`)
} finally {
  await browser.close()
}
