// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect } from '@playwright/test'

/**
 * **File → Import model…** and **File → Import part file…** (`TODO/ui-107`), driven the way a
 * person does it: open the File menu, press the item, and answer the system file chooser it opens.
 * Shared by every spec that brings a model file into the project.
 */

/**
 * @typedef {{ name: string, mimeType: string, buffer: Buffer }} ChosenFile
 * @typedef {(locator: import('@playwright/test').Locator) => Promise<void>} Press
 */

/**
 * Open the File menu and choose `item`, answering its file chooser with `file`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Press} press
 * @param {'file-import-model' | 'file-import-part'} item
 * @param {ChosenFile} file
 */
async function chooseThroughFileMenu(page, press, item, file) {
  await press(page.getByTestId('file-menu-button'))
  await expect(page.getByTestId('file-menu')).toBeVisible()
  const chooser = page.waitForEvent('filechooser')
  await press(page.getByTestId(item))
  await (await chooser).setFiles(file)
}

/**
 * File → Import model…: the model is read, then waits to be placed (the chip shows), or is refused.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Press} press
 * @param {ChosenFile} file
 */
export async function importModel(page, press, file) {
  await chooseThroughFileMenu(page, press, 'file-import-model', file)
}

/**
 * File → Import part file…: WarpCad's own part file, into My parts.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Press} press
 * @param {ChosenFile} file
 */
export async function importPartFile(page, press, file) {
  await chooseThroughFileMenu(page, press, 'file-import-part', file)
}

/**
 * How many rows My parts lists, read off its count badge (present in every Library form, open
 * or not).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>}
 */
export async function myPartsCount(page) {
  return Number((await page.getByTestId('library-user-count').first().textContent())?.trim() ?? 'NaN')
}

/**
 * Open the Objects list, through the Inspector sheet where there is one.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Press} press
 */
export async function openObjectList(page, press) {
  const list = page.getByTestId('object-list')
  if (await list.isVisible().catch(() => false)) return
  const inspector = page.getByTestId('inspector')
  if ((await page.getByTestId('inspector-tab').isVisible().catch(() => false)) && (await inspector.getAttribute('data-open')) !== 'true') {
    await press(page.getByTestId('inspector-tab'))
    await expect(inspector).toHaveAttribute('data-open', 'true')
  }
  if (!(await list.isVisible().catch(() => false))) await press(page.getByTestId('inspector-objects-header'))
  await expect(list).toBeVisible()
}
