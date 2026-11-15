// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { pointer, sleep, viewportPoint } from './support/humanInput.js'

/**
 * The Library rail on a real clock (`TODO/testing-040`, graduated from the hand drive in
 * `TODO/testing-020` of `ui-084` #2 and #3): a tile's long-press name callout (500 ms to show,
 * 1500 ms linger) and the pulse on a newly saved My parts tile (900 ms).
 *
 * `LibraryRow.spec.js` and `LibraryRail.spec.js` cover both with fake timers only, which proves
 * the logic and not that the browser's clock, a trusted touch, or the CSS animation agree.
 * This spec uses real timers, no `page.clock`, and trusted CDP touch, so it is Chromium at
 * tablet width only (the rail is the tablet tier: the phone has the column, the laptop the
 * labelled rows). Tolerances are wide on purpose: these are timer-driven.
 */

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium-tablet', 'the rail is the tablet tier and the press is trusted CDP touch (Chromium)')
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await expect(page.getByTestId('library-rail')).toBeVisible()
})

/** Centre of a tile, after a hit test says the tile is what a finger would land on. */
async function tileCentre(page, testid) {
  const tile = page.getByTestId(testid)
  await expect(tile).toBeVisible()
  const c = await tile.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  const ok = await page.evaluate(([x, y, id]) => !!document.elementFromPoint(x, y)?.closest(`[data-testid="${id}"]`), [c.x, c.y, testid])
  expect(ok, `${testid} is covered at ${Math.round(c.x)},${Math.round(c.y)}`).toBe(true)
  return c
}

test('a long-press on a rail tile shows its name callout after about 500 ms, not before, and it lingers then goes (TODO/ui-084)', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page)
  const touch = (type, c) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: c ? [{ x: c.x, y: c.y, id: 1 }] : [] })
  const callout = page.getByTestId('library-tile-callout')
  const bodies = page.getByTestId('viewport')
  const c = await tileCentre(page, 'library-row-primitive.cuboid')

  // Held 300 ms then released: a tap-length press, no callout at 300 ms and none afterwards.
  await touch('touchStart', c)
  await sleep(300)
  expect(await callout.count(), 'no callout at 300 ms').toBe(0)
  await touch('touchEnd')
  await sleep(900)
  expect(await callout.count(), 'a tap-length press never shows one').toBe(0)

  // Held still: absent early, present between 450 and 900 ms (sampled at about 700).
  const t0 = Date.now()
  await touch('touchStart', c)
  await sleep(300)
  expect(await callout.count(), 'no callout at 300 ms into a held press').toBe(0)
  await sleep(Math.max(0, 700 - (Date.now() - t0)))
  // Immediate reads, not `expect(...).toHaveCount`, which retries for 5 s and would hide a late callout.
  expect(await callout.count(), 'callout up at about 700 ms').toBe(1)
  await expect(callout).toHaveText('Cube')
  const box = await callout.boundingBox()
  expect(box && box.width > 0 && box.height > 0).toBe(true)

  // Released: it lingers (still there a moment later), and is gone by about 2.2 s after release.
  await touch('touchEnd')
  const released = Date.now()
  await sleep(400)
  expect(await callout.count(), 'still lingering 400 ms after release').toBe(1)
  // Gone by about 2.2 s after release (the linger is 1500 ms): poll, then bound the wall time.
  await expect.poll(() => callout.count(), { timeout: 2000, intervals: [100] }).toBe(0)
  expect(Date.now() - released, 'gone within about 2.2 s of release').toBeLessThan(2600)
  // A long-press is not a place: no body came of it.
  await expect(bodies).toHaveAttribute('data-body-count', '0')

  // A plain drag from the same tile still places a Cube and shows no callout.
  const drop = await viewportPoint(page, 0.5, 0.45)
  const input = await pointer(page, test.info())
  await input.dragRow(page.getByTestId('library-row-primitive.cuboid'), drop.x, drop.y)
  await expect(bodies).toHaveAttribute('data-body-count', '1')
  await expect(callout).toHaveCount(0)
})

test('Save to library: the new My parts tile scrolls into view and pulses once with library-tile-pulse, finishing within about 1.1 s (TODO/ui-084)', async ({ page }, info) => {
  const input = await pointer(page, info)
  const drop = await viewportPoint(page, 0.5, 0.45)
  await input.dragRow(page.getByTestId('library-row-primitive.cuboid'), drop.x, drop.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')

  await input.press(page.getByTestId('op-library-save'))
  await expect(page.getByTestId('save-library-sheet')).toBeVisible()
  await page.getByTestId('save-library-name').fill('Standoff')

  // Watch the rail from inside the page: it records the pulse's animations and the tile's place
  // against the rail's scroller on every frame while the attribute is set.
  await page.evaluate(() => {
    const w = /** @type {any} */ (window)
    w.__pulse = { set: 0, removed: 0, names: [], inView: [], maxCurrent: 0 }
    const scroller = document.querySelector('.library-rail__scroll')
    const sample = (item) => {
      const tile = item.querySelector('[data-testid^="library-row-"]') ?? item
      const names = tile.getAnimations().map((a) => /** @type {any} */ (a).animationName)
      for (const n of names) if (!w.__pulse.names.includes(n)) w.__pulse.names.push(n)
      for (const a of tile.getAnimations()) w.__pulse.maxCurrent = Math.max(w.__pulse.maxCurrent, Number(a.currentTime ?? 0))
      const t = tile.getBoundingClientRect()
      const s = (scroller ?? document.body).getBoundingClientRect()
      w.__pulse.inView.push(t.top >= s.top - 1 && t.bottom <= s.bottom + 1)
    }
    const loop = (item) => {
      if (item.dataset.pulse !== 'true') return
      sample(item)
      requestAnimationFrame(() => loop(item))
    }
    new MutationObserver((records) => {
      for (const r of records) {
        const item = /** @type {HTMLElement} */ (r.target)
        if (r.attributeName !== 'data-pulse') continue
        if (item.dataset.pulse === 'true') {
          w.__pulse.set = performance.now()
          loop(item)
        } else if (w.__pulse.set && !w.__pulse.removed) w.__pulse.removed = performance.now()
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['data-pulse'], subtree: true })
  })

  await input.press(page.getByTestId('save-library-submit'))
  await expect(page.getByTestId('library-toast')).toHaveText('Saved Standoff')

  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).__pulse.removed), { timeout: 3000 }).toBeGreaterThan(0)
  const pulse = await page.evaluate(() => /** @type {any} */ (window).__pulse)
  expect(pulse.set).toBeGreaterThan(0)
  // One pulse animation, the CSS one, and it was running for roughly its 900 ms.
  // (a production build scopes the keyframe name with a hash suffix)
  expect(pulse.names).toHaveLength(1)
  expect(pulse.names[0]).toMatch(/^library-tile-pulse(-[0-9a-f]+)?$/)
  expect(pulse.removed - pulse.set).toBeGreaterThan(600)
  expect(pulse.removed - pulse.set).toBeLessThan(1100)
  expect(pulse.maxCurrent).toBeGreaterThan(300)
  // The tile was inside the rail's scroller for every sampled frame, and is a real, counted tile.
  expect(pulse.inView.length).toBeGreaterThan(10)
  expect(pulse.inView.every(Boolean)).toBe(true)
  await expect(page.getByTestId('library-user-count')).toHaveText('1')
  await expect(page.getByTestId('library-row-user.standoff')).toBeVisible()
  // And it settles: no animation left once the attribute has gone.
  await sleep(200)
  expect(await page.getByTestId('library-row-user.standoff').evaluate((el) => el.getAnimations().length)).toBe(0)
})
