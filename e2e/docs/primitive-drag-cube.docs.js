// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, startMovie, endMovie, humanDrag, shot } from './support.js'

/**
 * Pilot docs movie (`TODO/docs-006`): drag a cube out of the Library into the 3D view and
 * release. Records `.docs-movies/primitive-drag-cube.webm`; `npm run docs:gifs` turns it
 * into `docs/media/primitive-drag-cube.gif`. The end-state assertion and the final-frame
 * still are the correctness gate — GIF bytes are not stable and are never pixel-compared.
 *
 * A scripted recording is not an acceptance check: `TODO/ACCEPTANCE.md` is still driven by hand.
 */
test.describe('docs movie: drag a cube', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'pilot is laptop-only')

  test('primitive-drag-cube', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    const viewport = page.getByTestId('viewport')
    await expect(viewport).toHaveAttribute('data-body-count', '0')

    const row = await page.getByTestId('library-row-primitive.cuboid').boundingBox()
    const view = await viewport.boundingBox()

    await startMovie(page, 'primitive-drag-cube')
    await humanDrag(
      page,
      { x: row.x + row.width / 2, y: row.y + row.height / 2 },
      { x: view.x + view.width * 0.5, y: view.y + view.height * 0.55 },
    )
    await expect(viewport).toHaveAttribute('data-body-count', '1')
    await endMovie(page, 'primitive-drag-cube')

    await shot(page, 'primitive-drag-cube-end.png')
  })
})
