// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * `TODO/ui-145` items 8 and 9, driven against `/`: the Align popover's position strips tell "inside −"
 * from "half −" by more than a sliver, and the Operations toolbar's Align and Split buttons carry
 * glyphs of their own (Mirror no longer sits beside Align as a near-duplicate) at the 44 px tap size.
 *
 * Every reference viewport, every engine: the toolbar's tier differs per width (labels, icons, and
 * at phone the Arrange and Shape pop-outs), so each tier is measured where it shows the buttons.
 */

/** @param {import('@playwright/test').Page} page */
async function placeCube(page, fx = 0.5, count = 1) {
  const tab = page.getByTestId('library-tab')
  if (!(await page.getByTestId('library-rows').isVisible())) {
    await tab.click()
    await expect(page.getByTestId('library-rows')).toBeVisible()
  }
  await page.evaluate((fx) => {
    const row = document.querySelector('[data-testid="library-row-primitive.cuboid"]')
    const view = document.querySelector('[data-testid="viewport"]')
    if (!row || !view) throw new Error('missing row or viewport')
    const from = row.getBoundingClientRect()
    const to = view.getBoundingClientRect()
    const sx = from.left + from.width / 2
    const sy = from.top + from.height / 2
    const ex = to.left + to.width * fx
    const ey = to.top + to.height * 0.3
    const fire = (target, type, x, y) =>
      target.dispatchEvent(
        new PointerEvent(type, { pointerId: 13, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, bubbles: true, cancelable: true }),
      )
    fire(row, 'pointerdown', sx, sy)
    for (const t of [0.25, 0.5, 0.75, 1]) fire(window, 'pointermove', sx + (ex - sx) * t, sy + (ey - sy) * t)
    fire(window, 'pointerup', ex, ey)
  }, fx)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', String(count))
  if (await tab.isVisible()) {
    if (await page.getByTestId('library-rows').isVisible()) await tab.click()
    await expect(page.getByTestId('library-rows')).toBeHidden()
  }
}

/**
 * Bring a toolbar button on screen: it is on the row at the labels and icons tiers, and inside its
 * group's pop-out at the groups tier (phone).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testid
 * @param {string} group
 */
async function reveal(page, testid, group) {
  const button = page.getByTestId(testid)
  if (await button.isVisible()) return button
  await page.getByTestId(`ops-group-${group}`).click()
  await expect(button).toBeVisible()
  return button
}

/** @param {import('@playwright/test').Locator} button */
const glyphOf = (button) => button.evaluate((el) => el.querySelector('[aria-hidden="true"]')?.textContent?.trim() ?? '')

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('Align, Split and Mirror have three different glyphs and Align and Split are 44 px targets (ui-145 item 9)', async ({ page }) => {
  await placeCube(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')

  const align = await reveal(page, 'operation-align', 'arrange')
  const alignGlyph = await glyphOf(align)
  const alignBox = await align.boundingBox()
  const mirror = await reveal(page, 'operation-mirror', 'arrange')
  const mirrorGlyph = await glyphOf(mirror)
  await page.keyboard.press('Escape')
  const split = await reveal(page, 'op-split', 'shape')
  const splitGlyph = await glyphOf(split)
  const splitBox = await split.boundingBox()

  expect(new Set([alignGlyph, mirrorGlyph, splitGlyph]).size, `glyphs ${alignGlyph} ${mirrorGlyph} ${splitGlyph}`).toBe(3)
  // The old Align glyph was an arrow pair one row above Mirror's; neither may come back.
  expect(alignGlyph).not.toBe('⇔')
  expect(splitGlyph).not.toBe('⫽')
  for (const [name, box] of [['Align', alignBox], ['Split', splitBox]]) {
    expect(box?.height ?? 0, `${name} height`).toBeGreaterThanOrEqual(43.5)
    expect(box?.width ?? 0, `${name} width`).toBeGreaterThanOrEqual(43.5)
  }
  // The bigger hit area must still be the button's own: its centre and a point near each edge hit it, not a neighbour.
  for (const [name, button, box] of [['Align', align, alignBox], ['Split', split, splitBox]]) {
    for (const [dx, dy] of [[0.5, 0.5], [0.5, 0.08], [0.5, 0.92], [0.08, 0.5], [0.92, 0.5]]) {
      const hit = await button.evaluate(
        (el, [x, y]) => document.elementFromPoint(x, y)?.closest('button') === el,
        [box.x + box.width * dx, box.y + box.height * dy],
      )
      expect(hit, `${name} at ${dx},${dy} hits itself`).toBe(true)
    }
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('in the Align popover "inside −" and "half −" mark different faces, far enough apart to see (ui-145 item 8)', async ({ page }) => {
  await placeCube(page, 0.3, 1)
  await placeCube(page, 0.7, 2)
  // Two solids selected: Align then targets the second, which is a box, so every strip has a face to mark.
  await page.evaluate(async () => {
    const { useSelectionStore } = await window.__e2eImport('/src/stores/selection.js')
    const ids = [...document.querySelectorAll('[data-testid="scene-bodies"] li')].map((li) => li.getAttribute('data-body-id'))
    useSelectionStore().selectMany(ids, false)
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  const align = await reveal(page, 'operation-align', 'arrange')
  await align.click()
  await expect(page.getByTestId('align-popover')).toBeVisible()
  /** @param {string} key */
  const contactX = async (key) =>
    Number(await page.getByTestId(`align-x-${key}`).locator('[data-part="contact"]').getAttribute('x1'))
  const inside = await contactX('inside-minus')
  const half = await contactX('half-minus')
  expect(half - inside, 'contact lines are a half target apart').toBeGreaterThanOrEqual(6)
  // Centre touches nothing.
  await expect(page.getByTestId('align-x-center').locator('[data-part="contact"]')).toHaveCount(0)
  // Every button is still a tap-size target.
  const box = await page.getByTestId('align-x-half-minus').boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5)
})

test('Align and Split show a footprint of their own beside their neighbours, without growing the row (ui-153 item 4)', async ({ page }) => {
  await placeCube(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  const tier = await page.getByTestId('operations-toolbar').getAttribute('data-ops-tier').catch(() => null)
  const style = (button) =>
    button.evaluate((el) => {
      const css = getComputedStyle(el)
      const glyph = getComputedStyle(el.querySelector('[aria-hidden="true"]'))
      return { border: parseFloat(css.borderTopWidth), fill: css.backgroundColor, glyph: parseFloat(glyph.fontSize) }
    })
  const align = await reveal(page, 'operation-align', 'arrange')
  const alignStyle = await style(align)
  const alignBox = await align.boundingBox()
  await page.keyboard.press('Escape')
  const split = await reveal(page, 'op-split', 'shape')
  const splitStyle = await style(split)
  await page.keyboard.press('Escape')
  const repeat = page.getByTestId('op-repeat')
  const neighbour = (await repeat.isVisible()) ? await style(repeat) : { border: 0, fill: '', glyph: 0 }
  if (tier === 'icons') {
    // Icons tier: a heavier edge and a bigger glyph than the 38 px neighbours, so the 44 px square reads.
    for (const [name, s] of [['Align', alignStyle], ['Split', splitStyle]]) {
      expect(s.border, `${name} border`).toBeGreaterThanOrEqual(2)
      expect(s.glyph, `${name} glyph`).toBeGreaterThan(neighbour.glyph)
    }
  }
  expect(alignBox?.height ?? 0).toBeGreaterThanOrEqual(43.5)
})

test('the Align strips draw their icons in a box big enough to tell "in" from "half" and explain themselves (ui-153 item 3)', async ({ page }) => {
  await placeCube(page, 0.3, 1)
  await placeCube(page, 0.7, 2)
  await page.evaluate(async () => {
    const { useSelectionStore } = await window.__e2eImport('/src/stores/selection.js')
    const ids = [...document.querySelectorAll('[data-testid="scene-bodies"] li')].map((li) => li.getAttribute('data-body-id'))
    useSelectionStore().selectMany(ids, false)
  })
  const align = await reveal(page, 'operation-align', 'arrange')
  await align.click()
  await expect(page.getByTestId('align-popover')).toBeVisible()
  const icon = await page.getByTestId('align-x-half-minus').locator('svg').boundingBox()
  expect(icon?.width ?? 0, 'icon width').toBeGreaterThanOrEqual(30)
  expect(icon?.height ?? 0, 'icon height').toBeGreaterThanOrEqual(26)
  const inside = await page.getByTestId('align-x-inside-minus').locator('[data-part="contact"]').boundingBox()
  const half = await page.getByTestId('align-x-half-minus').locator('[data-part="contact"]').boundingBox()
  expect(Math.abs((half?.x ?? 0) - (inside?.x ?? 0)) > 0).toBe(true)
  // The strip's own words: what the rule ends and "half" mean.
  await expect(page.getByTestId('align-rule')).toContainText('toward −X') // ui-159: the rule names the axis direction
  await expect(page.getByTestId('align-rule')).toContainText('toward +X')
  await expect(page.getByTestId('align-caption')).toContainText(/half = /)
  const buttonBox = await page.getByTestId('align-x-half-minus').boundingBox()
  expect(buttonBox?.height ?? 0).toBeGreaterThanOrEqual(43.5)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
