// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * `TODO/ui-138`: the Objects list's hover tint reads clearly on the default (light-blue) body.
 *
 * Driven against `/`, the running app. A real mouse hovers the body's row in the Inspector's
 * list; the canvas is photographed before and during, and the **colour difference (CIEDE2000)**
 * between the body's own pixels in the two photographs is asserted `>= 10`, the "recognisably
 * different" line `testing-030` measured against (it found 7.7 dark and 6.2 light on this body).
 * The same body is then selected by a real click and photographed, and hover-versus-selected
 * must stay `>= 25`, so a stronger hover never starts to look like a selection.
 *
 * **Engines and viewports.** WebGL material path, so all three engines at the three reference
 * viewports, through the project matrix. Both colour schemes, by `emulateMedia`.
 *
 * The measurement is the mean colour of the pixels that differ between the two photographs
 * (the body's screen footprint), converted to Lab; a mean over the same pixel set in every
 * photograph cancels the body's own shading.
 */

/** @param {number} c sRGB channel, 0-255 @returns {number} linear light */
function toLinear(c) {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/**
 * @param {[number, number, number]} rgb mean sRGB, 0-255
 * @returns {[number, number, number]} CIE Lab (D65)
 */
function rgbToLab([r, g, b]) {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)]
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047
  const y = 0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / 1.08883
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  const [fx, fy, fz] = [f(x), f(y), f(z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/**
 * CIEDE2000 between two sRGB colours.
 *
 * @param {[number, number, number]} rgb1
 * @param {[number, number, number]} rgb2
 * @returns {number}
 */
function deltaE00(rgb1, rgb2) {
  const [L1, a1, b1] = rgbToLab(rgb1)
  const [L2, a2, b2] = rgbToLab(rgb2)
  const rad = Math.PI / 180
  const deg = 180 / Math.PI
  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const Cbar = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)))
  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)
  const hue = (b, a) => (b === 0 && a === 0 ? 0 : ((Math.atan2(b, a) * deg) + 360) % 360)
  const h1p = hue(b1, a1p)
  const h2p = hue(b2, a2p)
  const dLp = L2 - L1
  const dCp = C2p - C1p
  let dhp = 0
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p
    if (dhp > 180) dhp -= 360
    else if (dhp < -180) dhp += 360
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * rad) / 2)
  const Lbp = (L1 + L2) / 2
  const Cbp = (C1p + C2p) / 2
  let hbp = h1p + h2p
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbp += h1p + h2p < 360 ? 360 : -360
    hbp /= 2
  }
  const T =
    1 -
    0.17 * Math.cos((hbp - 30) * rad) +
    0.24 * Math.cos(2 * hbp * rad) +
    0.32 * Math.cos((3 * hbp + 6) * rad) -
    0.2 * Math.cos((4 * hbp - 63) * rad)
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2))
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7))
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2)
  const Sc = 1 + 0.045 * Cbp
  const Sh = 1 + 0.015 * Cbp * T
  const Rt = -Math.sin(2 * dTheta * rad) * Rc
  return Math.sqrt(
    (dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh),
  )
}

/**
 * Photograph the canvas alone into page memory under `key`: every element that is not the canvas
 * or one of its ancestors is made transparent for the shot (never hidden, so the hovered row keeps
 * its hover), and restored after.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} key
 */
async function snapshotCanvas(page, key) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="viewport-canvas"]')
    /** @type {[HTMLElement, string][]} */
    const faded = []
    let node = canvas
    while (node && node.parentElement && node !== document.body) {
      for (const sibling of node.parentElement.children) {
        if (sibling === node) continue
        const el = /** @type {HTMLElement} */ (sibling)
        faded.push([el, el.style.getPropertyValue('opacity')])
        el.style.setProperty('opacity', '0', 'important')
      }
      node = node.parentElement
    }
    window.__faded = faded
  })
  try {
    const box = await page.getByTestId('viewport-canvas').boundingBox()
    const png = await page.screenshot({ clip: /** @type {any} */ (box) })
    await page.evaluate(
      async ({ b64, key }) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
        const surface = new OffscreenCanvas(bitmap.width, bitmap.height)
        const context = surface.getContext('2d')
        context.drawImage(bitmap, 0, 0)
        window.__snaps = window.__snaps ?? {}
        window.__snaps[key] = context.getImageData(0, 0, bitmap.width, bitmap.height)
      },
      { b64: png.toString('base64'), key },
    )
  } finally {
    await page.evaluate(() => {
      for (const [el, opacity] of window.__faded ?? []) {
        if (opacity) el.style.setProperty('opacity', opacity)
        else el.style.removeProperty('opacity')
      }
      window.__faded = []
    })
  }
}

/**
 * The body's footprint: pixels that differ between photographs `a` and `b`. Returns its mean
 * colour in `a`, in `b` and in each of `others`, plus the footprint's centroid as canvas
 * fractions. Only small numbers cross the protocol.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} a
 * @param {string} b
 * @param {string[]} others
 */
function footprintMeans(page, a, b, others) {
  return page.evaluate(
    ({ a, b, others }) => {
      const snaps = window.__snaps
      const first = snaps[a]
      const second = snaps[b]
      /** @type {number[]} */
      const mask = []
      let sx = 0
      let sy = 0
      for (let index = 0; index < first.data.length; index += 4) {
        const delta =
          Math.abs(first.data[index] - second.data[index]) +
          Math.abs(first.data[index + 1] - second.data[index + 1]) +
          Math.abs(first.data[index + 2] - second.data[index + 2])
        if (delta > 12) {
          mask.push(index)
          const pixel = index / 4
          sx += pixel % first.width
          sy += Math.floor(pixel / first.width)
        }
      }
      const mean = (image) => {
        const sum = [0, 0, 0]
        for (const index of mask) for (let c = 0; c < 3; c += 1) sum[c] += image.data[index + c]
        return sum.map((value) => value / Math.max(1, mask.length))
      }
      return {
        count: mask.length,
        centroid: [sx / Math.max(1, mask.length) / first.width, sy / Math.max(1, mask.length) / first.height],
        a: mean(first),
        b: mean(second),
        others: others.map((key) => mean(snaps[key])),
      }
    },
    { a, b, others },
  )
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {number} fx
 * @param {number} fy
 */
async function clickViewportAt(page, fx, fy) {
  await page.evaluate(
    ({ fx, fy }) => {
      const canvas = document.querySelector('[data-testid="viewport-canvas"]')
      if (!canvas) throw new Error('no canvas')
      const box = canvas.getBoundingClientRect()
      for (const type of ['pointerdown', 'pointerup']) {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 3,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            clientX: box.left + box.width * fx,
            clientY: box.top + box.height * fy,
            bubbles: true,
            cancelable: true,
          }),
        )
      }
    },
    { fx, fy },
  )
  await page.waitForTimeout(60)
}

/** @param {import('@playwright/test').Page} page */
async function openObjectList(page) {
  const list = page.getByTestId('object-list')
  if (await list.isVisible()) return
  const inspector = page.getByTestId('inspector')
  if ((await inspector.getAttribute('data-open')) !== 'true' && (await page.getByTestId('inspector-tab').isVisible())) {
    await page.getByTestId('inspector-tab').click()
    await expect(inspector).toHaveAttribute('data-open', 'true')
  }
  if (!(await list.isVisible())) {
    await page.getByTestId('inspector-objects-header').click()
  }
  await expect(list).toBeVisible()
}

for (const scheme of /** @type {const} */ (['dark', 'light'])) {
  test(`the Objects-list hover tint is clearly visible on the default body (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/')
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')

    // One default-coloured cube, seeded through the document store (building the scene only).
    // A second body keeps the Objects list on screen with nothing selected.
    await page.evaluate(async () => {
      const documentModule = await window.__e2eImport('/src/stores/document.js')
      const store = documentModule.useDocumentStore()
      store.append({ id: 'cube', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [40, 40, 40], center: [0, 0, 20] } })
    })
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    await openObjectList(page)
    await page.mouse.move(4, 4)
    await snapshotCanvas(page, 'plain')

    const row = page.getByTestId('objects-line-cube')
    await row.scrollIntoViewIfNeeded()
    await row.hover()
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover', 'cube')
    // The repaint is a rAF away: wait until the canvas shows the hover.
    await expect
      .poll(async () => {
        await snapshotCanvas(page, 'hover')
        const m = await footprintMeans(page, 'plain', 'hover', [])
        return m.count
      }, { timeout: 15_000 })
      .toBeGreaterThan(200)

    // Select the cube with a real click on its footprint, move away, photograph it selected.
    await page.mouse.move(4, 4)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover', '')
    const where = await footprintMeans(page, 'plain', 'hover', [])
    await clickViewportAt(page, where.centroid[0], where.centroid[1])
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
    await snapshotCanvas(page, 'selected')

    const means = await footprintMeans(page, 'plain', 'hover', ['selected'])
    const hoverVsPlain = deltaE00(means.a, means.b)
    const hoverVsSelected = deltaE00(means.b, means.others[0])
    test.info().annotations.push({ type: `dE00 ${scheme}`, description: `hover vs plain ${hoverVsPlain.toFixed(1)}, hover vs selected ${hoverVsSelected.toFixed(1)}` })
    expect(hoverVsPlain, `hover vs unhovered, dE00 (${scheme})`).toBeGreaterThanOrEqual(10)
    expect(hoverVsSelected, `hover vs selected, dE00 (${scheme})`).toBeGreaterThanOrEqual(25)
  })
}
