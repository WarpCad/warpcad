// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { fakeGitHub, routeFakeGitHub } from '../support/fakeGistApi.js'
import { loadScene, openApp, shot } from './support.js'

/**
 * Docs media for `docs/sharing.md` (`TODO/io-017`): the Share sheet at phone width just after
 * **Publish to a gist** — the **Short link with GitHub** group showing *Published*, with Copy gist
 * link, Update gist, Open on GitHub and Stop sharing, and the disclosure line. Phone only,
 * Chromium only. GitHub is the e2e fake (`e2e/support/fakeGistApi.js`): no real network and no
 * real token. The clock in the status pill is pinned to the docs' 14:05 (UTC, the context's zone).
 *
 * Not an acceptance check: scenario 30 is driven by hand.
 */
const TOKEN = 'github_pat_DOCS_SENTINEL_not_a_real_token'

test.describe('docs media: the Share sheet gist group', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'phone only')
  test.use({ timezoneId: 'UTC' })

  test('share-gist.png: a cube and a sphere, published as a gist', async ({ page }) => {
    await routeFakeGitHub(page, fakeGitHub({ tokens: { [TOKEN]: { login: 'janecoder', kind: 'fine-grained', expiry: '2026-11-27 14:05:00 UTC' } } }))
    await page.addInitScript(() => {
      // The clipboard and the OS share sheet are the boundary; the picture shows a successful copy.
      const copied = /** @type {string[]} */ ([])
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (/** @type {string} */ text) => copied.push(text),
          write: async () => copied.push('copied'),
        },
      })
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    })
    await openApp(page)
    await loadScene(page, 'cube-and-sphere.ndjson', 2)

    await page.getByTestId('file-menu-button').click()
    await page.getByTestId('gist-connect-open').scrollIntoViewIfNeeded()
    await page.getByTestId('gist-connect-open').click()
    await page.getByTestId('gist-connect-token').fill(TOKEN)
    await page.getByTestId('gist-connect-submit').click()
    await expect(page.getByTestId('gist-connect-status')).toContainText('Connected as janecoder')
    await page.getByTestId('gist-connect-done').click()

    const button = page.getByTestId('share-open')
    if (await button.isVisible()) {
      await button.click()
    } else {
      await page.getByTestId('file-menu-button').click()
      await page.getByTestId('file-share').click()
    }
    await expect(page.getByTestId('share-sheet')).toBeVisible()
    await page.getByTestId('share-name').fill('Phone stand')
    await page.getByTestId('share-gist-publish').click()
    await expect(page.getByTestId('share-gist-group')).toHaveAttribute('data-state', 'published')
    // The pill's time, pinned: the docs' example says 14:05.
    await page.evaluate(async () => {
      const { useGistStore } = await window.__e2eImport('/src/stores/gist.js')
      useGistStore().noteOutcome({ ok: true, publishedAt: Date.UTC(2026, 9, 27, 14, 5) })
    })
    await expect(page.getByTestId('share-gist-status')).toHaveText('Published · secret · 14:05')
    // The toast is on a timer; the picture is of the sheet, not of a moment.
    await expect(page.getByTestId('share-toast')).toHaveAttribute('data-visible', 'false', { timeout: 8000 })
    await page.getByTestId('share-name').blur()
    await shot(page, 'share-gist.png')
  })

  test('gist-prompts.png: the Include prompts in the README box and its note, before publishing', async ({ page }) => {
    await routeFakeGitHub(page, fakeGitHub({ tokens: { [TOKEN]: { login: 'janecoder', kind: 'fine-grained', expiry: '2026-11-27 14:05:00 UTC' } } }))
    await openApp(page)
    await loadScene(page, 'cube-and-sphere.ndjson', 2)
    // The request that made the first body, as an agent's write records it.
    await page.evaluate(async () => {
      const { useDocumentStore } = await window.__e2eImport('/src/stores/document.js')
      const store = useDocumentStore()
      store.raw.recordPrompt({ text: 'a 140 × 250 mm fan duct, 1.6 mm walls', produced: [store.bodies[0].id] }, { origin: 'mcp' })
      store.refresh()
    })

    await page.getByTestId('file-menu-button').click()
    await page.getByTestId('gist-connect-open').scrollIntoViewIfNeeded()
    await page.getByTestId('gist-connect-open').click()
    await page.getByTestId('gist-connect-token').fill(TOKEN)
    await page.getByTestId('gist-connect-submit').click()
    await expect(page.getByTestId('gist-connect-status')).toContainText('Connected as janecoder')
    await page.getByTestId('gist-connect-done').click()

    const button = page.getByTestId('share-open')
    if (await button.isVisible()) {
      await button.click()
    } else {
      await page.getByTestId('file-menu-button').click()
      await page.getByTestId('file-share').click()
    }
    await expect(page.getByTestId('share-sheet')).toBeVisible()
    await expect(page.getByTestId('share-gist-prompts')).toBeChecked()
    await expect(page.getByTestId('share-gist-prompts-note')).toHaveText('1 prompt — the request and the reply — will be in the README. The project file has them either way.')
    await shot(page, 'gist-prompts.png')
  })

  /**
   * `TODO/io-023`: the README a publish writes, as text — the description, the request and the
   * reply, the variables with a range. Published through the real Share sheet against the fake;
   * the README is then shown in a `<pre>` (GitHub's rendering is GitHub's). The two values that
   * differ on every run — the fake's random gist id and the *Last published* time — are swapped for
   * fixed ones in the picture (not in the README), so the picture is the same every run.
   */
  test('gist-readme-brief.png: the README a publish writes, as text', async ({ page }) => {
    const fake = fakeGitHub({ tokens: { [TOKEN]: { login: 'janecoder', kind: 'fine-grained', expiry: '2026-11-27 14:05:00 UTC' } } })
    await routeFakeGitHub(page, fake)
    await openApp(page)
    await loadScene(page, 'cube-and-sphere.ndjson', 2)
    await page.evaluate(async () => {
      const { useDocumentStore } = await window.__e2eImport('/src/stores/document.js')
      const { defineVariable } = await window.__e2eImport('/src/core/variables.js')
      const store = useDocumentStore()
      const prompt = store.raw.recordPrompt({ text: 'A fan duct with an inlet_diameter variable between 40 and 120 mm.', produced: [store.bodies[0].id] }, { origin: 'mcp' })
      store.raw.addPromptResponse(prompt.id, 'Made the duct; inlet_diameter is 80 mm.\n\nProblems met: none.', { origin: 'mcp' })
      defineVariable(store.raw, { name: 'inlet_diameter', kind: 'number', value: 80, unit: 'mm', min: 40, max: 120 }, { origin: 'mcp' })
      store.raw.setDescription('A **wall-mounted** fan duct for a closet.\n\n- prints in *PETG*\n- walls are `1.6` mm', { origin: 'local' })
      store.refresh()
    })

    await page.getByTestId('file-menu-button').click()
    await page.getByTestId('gist-connect-open').scrollIntoViewIfNeeded()
    await page.getByTestId('gist-connect-open').click()
    await page.getByTestId('gist-connect-token').fill(TOKEN)
    await page.getByTestId('gist-connect-submit').click()
    await expect(page.getByTestId('gist-connect-status')).toContainText('Connected as janecoder')
    await page.getByTestId('gist-connect-done').click()
    const button = page.getByTestId('share-open')
    if (await button.isVisible()) {
      await button.click()
    } else {
      await page.getByTestId('file-menu-button').click()
      await page.getByTestId('file-share').click()
    }
    await page.getByTestId('share-name').fill('Fan duct')
    await page.getByTestId('share-gist-publish').click()
    await expect(page.getByTestId('share-gist-group')).toHaveAttribute('data-state', 'published')

    const [gist] = [...fake.gists.values()]
    const readme = String(gist.files['README.md'])
      .replaceAll(gist.id, '0123456789abcdef0123456789abcdef')
      .replace(/^- Last published .*$/m, '- Last published 2026-10-27 14:05 UTC')
    expect(readme).toContain('## Variables')
    await page.evaluate((text) => {
      const pre = document.createElement('pre')
      pre.dataset.testid = 'docs-readme'
      pre.textContent = text
      pre.style.cssText =
        'position:fixed;inset:0;margin:0;padding:16px;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere;' +
        'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--surface-1,#1b1d21);color:var(--text-1,#e8e8e8);z-index:2147483647'
      document.body.append(pre)
    }, readme)
    await shot(page, 'gist-readme-brief.png', { locator: page.getByTestId('docs-readme') })
  })
})
