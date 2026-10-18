// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'

/**
 * The header shows the release beside the `WarpCad` title (`TODO/ui-077`), driven against `/`.
 * The label is `v<version> · <commit>` once the package has a release; on the `0.0.0`
 * placeholder it reads `dev` (plus the commit when the build has one), so the placeholder never
 * reaches the UI (`TODO/ai-024`). Runs at all nine projects, and the label is checked at the
 * three reference viewports (phone 390x844, tablet 820x1180, laptop 1440x900) by the projects.
 *
 *     npx playwright test e2e/app-header-version.e2e.js
 */

const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
const PLACEHOLDER = pkg.version === '0.0.0'

/** Release: `v1.2.3 · a1b2c3d`; placeholder: `dev` or `dev · a1b2c3d`. The commit is 7 hex, or `dev`. */
const EXPECTED = PLACEHOLDER
  ? /^dev( · (?:[0-9a-f]{7}|dev))?$/
  : new RegExp(`^v${pkg.version.replace(/\./g, '\\.')} · (?:[0-9a-f]{7}|dev)$`)

test.describe('app header version label', () => {
  test('the label sits beside the title and reads the release, never 0.0.0', async ({ page }) => {
    await page.goto('/')
    const header = page.getByTestId('app-header')
    const label = page.getByTestId('app-version')

    await expect(header).toBeVisible()
    await expect(label).toBeVisible()
    await expect(label).toHaveText(EXPECTED)
    await expect(label).not.toContainText('0.0.0')
    await expect(header.getByRole('heading', { name: 'WarpCad' })).toBeVisible()
  })

  test('the label stays on one line and fully inside the viewport', async ({ page }) => {
    await page.goto('/')
    const label = page.getByTestId('app-version')
    const box = await label.boundingBox()
    const viewport = page.viewportSize()

    expect(box).not.toBeNull()
    expect(box.height).toBeLessThan(24)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
    await expect(page.getByTestId('document-bar')).toBeVisible()
  })

  test('the header keeps the version label at this viewport', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('app-header')).toHaveScreenshot('app-header-version.png', {
      maxDiffPixelRatio: 0.02,
    })
  })
})
