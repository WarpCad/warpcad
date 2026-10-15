// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Renders the app's install and tab icons from one source, `public/favicon.svg` (the "warp
// flash" mark, concept 16 in `design/logo-concepts/`). Edit the SVG, then regenerate:
//
//   npm run icons
//
// Rendering goes through Playwright's Chromium, not ImageMagick: the mark is built from
// gradients and a clip path, which ImageMagick's own SVG renderer gets wrong.
//
// Two shapes come out of the one source. The rounded tile is the favicon and the manifest's
// "any" icons. The *full-bleed* square (the same SVG with the tile's corner radius removed) is
// for platforms that apply their own mask — Android's maskable icon and iOS's apple-touch-icon —
// because a pre-rounded tile inside their mask shows the corners as a dark ring.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(repoRoot, 'public')
const SOURCE = join(PUBLIC, 'favicon.svg')

/**
 * Every PNG generated into `public/`. `manifest` entries are listed in the web app manifest
 * (`manifestIcons`); the rest are linked from `index.html`.
 *
 * @type {ReadonlyArray<{ file: string, size: number, fullBleed: boolean, manifest?: 'any' | 'maskable' }>}
 */
export const ICONS = Object.freeze([
  { file: 'pwa-192x192.png', size: 192, fullBleed: false, manifest: 'any' },
  { file: 'pwa-512x512.png', size: 512, fullBleed: false, manifest: 'any' },
  { file: 'maskable-icon-512x512.png', size: 512, fullBleed: true, manifest: 'maskable' },
  { file: 'apple-touch-icon.png', size: 180, fullBleed: true },
])

/** Sizes packed into `public/favicon.ico`, for browsers and tools that ignore the SVG. */
export const ICO_SIZES = Object.freeze([16, 32, 48])

/**
 * The `icons` array for vite-plugin-pwa's manifest. Paths are relative, so they resolve
 * against the manifest's own URL and follow `BASE_PATH`.
 *
 * @returns {{ src: string, sizes: string, type: string, purpose?: string }[]}
 */
export function manifestIcons() {
  return ICONS.filter((icon) => icon.manifest).map(({ file, size, manifest }) => ({
    src: file,
    sizes: `${size}x${size}`,
    type: 'image/png',
    ...(manifest === 'maskable' ? { purpose: 'maskable' } : {}),
  }))
}

/**
 * The full-bleed variant of the rounded-tile mark: the same drawing with every `rx="112"`
 * (the tile and its clip path) removed, so the artwork runs to the square's edges.
 *
 * @param {string} svg
 * @returns {string}
 */
export function fullBleed(svg) {
  const out = svg.replaceAll(' rx="112"', '')
  if (out === svg) throw new Error('fullBleed: no rx="112" tile found — has the mark’s tile radius changed?')
  return out
}

/**
 * Pack PNG images into a Windows `.ico` container (PNG-compressed entries, supported by every
 * browser and by Windows Vista onwards).
 *
 * @param {{ size: number, data: Uint8Array }[]} images square PNGs, at most 256 px
 * @returns {Buffer}
 */
export function encodeIco(images) {
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ size, data }, i) => {
    if (size < 1 || size > 256) throw new RangeError(`encodeIco: ${size}px is outside 1–256`)
    const entry = 6 + 16 * i
    header.writeUInt8(size === 256 ? 0 : size, entry) // width (0 means 256)
    header.writeUInt8(size === 256 ? 0 : size, entry + 1) // height
    header.writeUInt8(0, entry + 2) // palette colours
    header.writeUInt8(0, entry + 3) // reserved
    header.writeUInt16LE(1, entry + 4) // colour planes
    header.writeUInt16LE(32, entry + 6) // bits per pixel
    header.writeUInt32LE(data.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += data.length
  })
  return Buffer.concat([header, ...images.map(({ data }) => Buffer.from(data))])
}

/**
 * Render an SVG to a square PNG with a transparent background.
 *
 * @param {import('playwright').Browser} browser
 * @param {string} svg
 * @param {number} size
 * @returns {Promise<Buffer>}
 */
async function renderPng(browser, svg, size) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}img{display:block}</style><img src="${src}" width="${size}" height="${size}">`,
  )
  await page.locator('img').evaluate((img) => /** @type {HTMLImageElement} */ (img).decode())
  const png = await page.screenshot({ omitBackground: true })
  await page.close()
  return png
}

async function main() {
  const { chromium } = await import('playwright')
  const svg = readFileSync(SOURCE, 'utf8')
  const browser = await chromium.launch()
  try {
    for (const { file, size, fullBleed: bleed } of ICONS) {
      writeFileSync(join(PUBLIC, file), await renderPng(browser, bleed ? fullBleed(svg) : svg, size))
      console.log(`public/${file}  ${size}×${size}${bleed ? '  full-bleed' : ''}`)
    }
    const images = []
    for (const size of ICO_SIZES) images.push({ size, data: await renderPng(browser, svg, size) })
    writeFileSync(join(PUBLIC, 'favicon.ico'), encodeIco(images))
    console.log(`public/favicon.ico  ${ICO_SIZES.join(', ')} px`)
  } finally {
    await browser.close()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
