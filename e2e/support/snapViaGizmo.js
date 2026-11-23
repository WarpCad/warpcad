// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect } from '@playwright/test'

/**
 * Snap the camera to a standard view through the view cube the way a user would (`TODO/ui-158`):
 * click the cube's face when it is turned toward the viewer, otherwise open **Views** and pick the
 * face from the six-face grid. A face turned away (or edge-on, as Top and Right are at Front) takes no
 * pointer, so a spec that clicked it straight would wait on a hidden button.
 *
 * Every face, Views and the grid's cells are DOM buttons, so a plain `click()` works on every
 * engine and viewport; nothing here depends on the pointer type.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | 'home'} view
 */
export async function snapViaGizmo(page, view) {
  if (view === 'home') {
    await page.getByTestId('gizmo-view-home').click()
    return
  }
  const face = page.getByTestId(`gizmo-view-${view}`)
  if ((await face.getAttribute('data-facing')) === 'true') {
    try {
      await face.click({ timeout: 2_000 })
      return
    } catch (error) {
      // The camera moved between the read and the click (a snap's overlay update lands a frame
      // later), turning the face away. Anything else is a real failure.
      if ((await face.getAttribute('data-facing')) === 'true') throw error
    }
  }
  await page.getByTestId('gizmo-views').click()
  await expect(page.getByTestId('gizmo-picker')).toBeVisible()
  await page.getByTestId(`gizmo-picker-view-${view}`).click()
  await expect(page.getByTestId('gizmo-picker')).toHaveCount(0)
}
