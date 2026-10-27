// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { settle, shot } from './support.js'

/**
 * Docs media for `docs/sharing.md` (`TODO/io-016`): the Shared view at phone width, what someone
 * who taps a WarpCad link sees — the project's name, the model with the navigation pad and the
 * view box, and the one button, **Make my own copy to edit**. The link is made by the app's own
 * encoder from a docs fixture and opened cold, as from a text message. Phone only, Chromium only.
 *
 * Not an acceptance check: scenario 29 is driven by hand on a real iPhone.
 */
test.describe('docs media: the Shared view', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'phone only')

  test('shared-view.png: a shared cube and sphere, opened from a link', async ({ page }) => {
    const text = readFileSync(join(process.cwd(), 'e2e', 'docs', 'fixtures', 'cube-and-sphere.ndjson'), 'utf8')
    await page.goto('/')
    await expect(page.getByTestId('app-root')).toBeVisible()
    const hash = await page.evaluate(async (projectText) => {
      const { parseNdjson } = await window.__e2eImport('/src/core/ndjson.js')
      const { encodeShareLink } = await window.__e2eImport('/src/core/shareLink.js')
      const url = await encodeShareLink(parseNdjson(projectText).records, { name: 'Phone stand' })
      return url.slice(url.indexOf('#'))
    }, text)

    // A fresh page, as a tapped link opens one.
    const viewer = await page.context().newPage()
    await viewer.goto(`/${hash}`)
    await expect(viewer.getByTestId('shared-view')).toHaveAttribute('data-state', 'ready')
    const viewport = viewer.getByTestId('viewport')
    await expect(viewport).toHaveAttribute('data-webgl', 'ready')
    await expect(viewport).toHaveAttribute('data-body-count', '2')
    await expect.poll(async () => Number(await viewport.getAttribute('data-frames-rendered'))).toBeGreaterThan(1)
    await settle(viewer)
    await shot(viewer, 'shared-view.png')
  })
})
