// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Generate the reference-image e2e fixtures (`TODO/sketch-003`). Run once and commit the
 * output; re-run only to change them:
 *
 *     node scripts/generate-trace-fixtures.mjs
 *
 * - `e2e/fixtures/trace-bracket.jpg` — a "photo" drawn in headless Chromium, so the test
 *   knows its true dimensions: a dark L-bracket with two round holes beside a ruler with
 *   10 mm ticks, on a light background, at exactly **5 px per mm** (0.2 mm per px). 1400 ×
 *   1000 px, under the import's 2048 px cap, so importing it never resamples it.
 *     - The ruler's **0** mark is at image px (200, 915); its **100 mm** mark at (700, 915).
 *     - The bracket is an L, 120 × 100 mm overall with 30 mm arms; its holes are Ø 16 mm.
 * - `e2e/fixtures/hostile-images.ndjson` — a project holding four hostile `asset.image`
 *   records, each referenced by a sketch body: an SVG with a script, an `https://`
 *   reference instead of data, PNG bytes declared as JPEG, and a PNG header declaring
 *   50 000 × 50 000 px. Loading it must drop all four with a warning each and still render
 *   all four sketches, with no dialog and no request off the app's origin.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const OUT = join(process.cwd(), 'e2e', 'fixtures')
mkdirSync(OUT, { recursive: true })

// --- the bracket photo ---------------------------------------------------------------

const browser = await chromium.launch()
const page = await browser.newPage()
const dataUrl = await page.evaluate(() => {
  const PX_PER_MM = 5
  const canvas = document.createElement('canvas')
  canvas.width = 1400
  canvas.height = 1000
  const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
  g.fillStyle = '#e9e5dc'
  g.fillRect(0, 0, canvas.width, canvas.height)

  // The bracket: an L, 120 × 100 mm, arms 30 mm, top-left corner at px (300, 150).
  const mm = (/** @type {number} */ v) => v * PX_PER_MM
  const x0 = 300
  const y0 = 150
  g.fillStyle = '#2a2a2e'
  g.beginPath()
  g.moveTo(x0, y0)
  g.lineTo(x0 + mm(120), y0)
  g.lineTo(x0 + mm(120), y0 + mm(30))
  g.lineTo(x0 + mm(30), y0 + mm(30))
  g.lineTo(x0 + mm(30), y0 + mm(100))
  g.lineTo(x0, y0 + mm(100))
  g.closePath()
  g.fill()
  // Two Ø 16 mm holes, one in each arm.
  g.fillStyle = '#e9e5dc'
  for (const [cx, cy] of [[x0 + mm(15), y0 + mm(80)], [x0 + mm(100), y0 + mm(15)]]) {
    g.beginPath()
    g.arc(cx, cy, mm(8), 0, Math.PI * 2)
    g.fill()
  }

  // The ruler: 220 mm, its 0 mark at px x = 200; ticks every mm, longer every 5 and 10.
  const zeroX = 200
  const top = 870
  g.fillStyle = '#f2d36b'
  g.fillRect(zeroX - 20, top, mm(220) + 40, 90)
  g.strokeStyle = '#1b1b1b'
  g.fillStyle = '#1b1b1b'
  g.lineWidth = 2
  g.font = 'bold 18px sans-serif'
  g.textAlign = 'center'
  for (let at = 0; at <= 220; at += 1) {
    const x = zeroX + mm(at)
    const length = at % 10 === 0 ? 45 : at % 5 === 0 ? 30 : 16
    g.beginPath()
    g.moveTo(x, top)
    g.lineTo(x, top + length)
    g.stroke()
    if (at % 10 === 0) g.fillText(String(at / 10), x, top + 70)
  }
  g.font = '14px sans-serif'
  g.fillText('cm', zeroX + mm(225), top + 70)
  return canvas.toDataURL('image/jpeg', 0.92)
})
await browser.close()
writeFileSync(join(OUT, 'trace-bracket.jpg'), Buffer.from(dataUrl.split(',')[1], 'base64'))

// --- the hostile project ---------------------------------------------------------------

/** @param {number} value */
const u32be = (value) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
/** @param {string} text */
const ascii = (text) => [...text].map((char) => char.charCodeAt(0))
/** @param {number} width @param {number} height */
const pngHeader = (width, height) =>
  Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...u32be(13), ...ascii('IHDR'), ...u32be(width), ...u32be(height), 8, 2, 0, 0, 0, ...u32be(0),
    ...u32be(0), ...ascii('IEND'), ...u32be(0),
  ])

const hostile = [
  {
    id: 'img-5f9000000000000000000001',
    op: 'asset.image',
    params: {
      mime: 'image/svg+xml',
      widthPx: 10,
      heightPx: 10,
      dataBase64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert("svg")</script></svg>').toString('base64'),
    },
  },
  {
    id: 'img-5f9000000000000000000002',
    op: 'asset.image',
    params: { mime: 'image/png', widthPx: 1, heightPx: 1, url: 'https://tracker.example/pixel.png?who=you' },
  },
  {
    id: 'img-5f9000000000000000000003',
    op: 'asset.image',
    params: { mime: 'image/jpeg', widthPx: 8, heightPx: 8, dataBase64: pngHeader(8, 8).toString('base64') },
  },
  {
    id: 'img-5f9000000000000000000004',
    op: 'asset.image',
    params: { mime: 'image/png', widthPx: 50000, heightPx: 50000, dataBase64: pngHeader(50000, 50000).toString('base64') },
  },
]

const lines = []
hostile.forEach((asset, index) => {
  lines.push(asset)
  lines.push({
    id: `sketch-${index + 1}`,
    op: 'primitive.sketch',
    name: `Sketch ${index + 1}`,
    params: {
      center: [index * 60 - 90, 0, 0],
      slices: [
        {
          id: 's1',
          zMm: 0,
          profiles: [{ id: 'p1', kind: 'rect', role: 'solid', centerMm: [0, 0], widthMm: 40, heightMm: 30 }],
          image: { assetId: asset.id, offsetMm: [0, 0], rotationDeg: 0, opacity: 0.5, mmPerPx: 0.1 },
        },
      ],
      extrusion: { method: 'linear', heightMm: 10, twistDeg: 0, twistSteps: 1 },
    },
  })
})
writeFileSync(join(OUT, 'hostile-images.ndjson'), lines.map((line) => JSON.stringify(line)).join('\n') + '\n')
console.log('wrote e2e/fixtures/trace-bracket.jpg and e2e/fixtures/hostile-images.ndjson')
