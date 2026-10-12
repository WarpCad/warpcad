// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, shot } from './support.js'

/**
 * Docs media for `docs/merging.md` (`TODO/ui-062`): the merge toast with **Undo merge**, and the
 * conflict banner with the History list open on the chipped row. Laptop, Chromium only.
 *
 * The "other copy" is built in the page from this project's own file — read back into a
 * throwaway document, one step added, serialised — which is exactly what a second device holds
 * after opening the downloaded file. The merge itself goes through the real **File ▾ → Merge
 * file…** and the real file chooser, and every shot asserts the sentence it is meant to show.
 */
test.describe('docs media: merging', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  const MOVE = { id: 'move-1', op: 'transform.translate', target: 'cube-1', supersedes: 'cube-1', params: { vector: [30, 0, 0] } }
  const CYLINDER = { id: 'cyl-1', op: 'primitive.cylinder', name: 'Cylinder 1', params: { diameter: 30, height: 40, center: [-50, 0, 20] } }
  const FILLET = { id: 'fillet-1', op: 'modify.filletRim', target: 'cube-1', supersedes: 'cube-1', params: { face: 'top', radius: 4 } }

  /**
   * Another copy of the open project with `records` added (and, first, a stamped setting, so
   * a conflicting row is the later-stamped one), as file text.
   *
   * @param {import('@playwright/test').Page} page
   * @param {any[]} records
   * @returns {Promise<string>}
   */
  const otherCopy = (page, records) =>
    page.evaluate(async (records) => {
      const { useDocumentStore } = await import('/src/stores/document.js')
      const { createDocument } = await import('/src/core/document.js')
      const { parseProject, serializeProject } = await import('/src/core/project.js')
      const parsed = parseProject(serializeProject(useDocumentStore().raw))
      const copy = createDocument({ resolution: parsed.resolution })
      copy.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution, parsed)
      copy.setStandingInstructions('Round the top edges', { origin: 'local' })
      for (const record of records) copy.append(record, { origin: 'local' })
      return serializeProject(copy)
    }, records)

  /** @param {import('@playwright/test').Page} page @param {any} record */
  const appendHere = (page, record) =>
    page.evaluate(async (record) => {
      const { useDocumentStore } = await import('/src/stores/document.js')
      useDocumentStore().append(record)
    }, record)

  /** @param {import('@playwright/test').Page} page @param {string} text */
  const mergeFile = async (page, text) => {
    await page.getByTestId('file-menu-button').click()
    const chooserEvent = page.waitForEvent('filechooser')
    await page.getByTestId('file-merge').click()
    const chooser = await chooserEvent
    await chooser.setFiles({ name: 'bracket-copy.ndjson', mimeType: 'text/plain', buffer: Buffer.from(text) })
  }

  test('merging-toast still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'one-cube.ndjson', 1)
    const theirs = await otherCopy(page, [CYLINDER])
    await appendHere(page, MOVE)
    await mergeFile(page, theirs)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
    await expect(page.getByTestId('merge-toast-text')).toHaveText('Merged 1 step from bracket-copy.ndjson')
    await expect(page.getByTestId('merge-undo')).toBeVisible()
    await shot(page, 'merging-toast.png')
  })

  test('merging-conflict still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'one-cube.ndjson', 1)
    const theirs = await otherCopy(page, [FILLET])
    await appendHere(page, MOVE)
    await mergeFile(page, theirs)
    await expect(page.getByTestId('merge-banner-text')).toHaveText('Merged 1 step from bracket-copy.ndjson — 1 step conflicted')
    await page.getByTestId('merge-banner-show').click()
    await expect(page.getByTestId('timeline-panel')).toBeVisible()
    await expect(page.getByTestId('timeline-broken-reason')).toHaveText('conflicts with step 2 (Move Cube 1, by you)')
    await shot(page, 'merging-conflict.png')
  })
})
