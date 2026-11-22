// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What a software rasteriser charges for a dense mesh: indexed against non-indexed, at several
 * triangle counts (`TODO/render-009`). Draws a displaced grid in a bare three.js scene (no app, no
 * server) with a `MeshStandardMaterial`, times `render` plus a one-pixel `readPixels` (which forces
 * the draw to finish), and prints the median of 5 warm frames per cell.
 *
 * The finding's premise was that a non-indexed result (660 k vertices for 220 k triangles) is slow
 * because the rasteriser transforms three times the vertices. This is the control that tests it:
 * if indexing helped, the `indexed` column would be well under the `flat` one.
 *
 * Usage: `node bench/raster-triangle-cost.mjs [--headed]`
 *
 * @module bench/raster-triangle-cost
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'

const THREE_BUILD = fileURLToPath(new URL('../node_modules/three/build/', import.meta.url))
/** Grid sides: 2 n² triangles, so 54 k, 109 k and 218 k (the dense 3MF's 219,540 is the last). */
const SIDES = [165, 233, 330]

const PAGE = `<canvas id="c" width="1440" height="900"></canvas>
<script type="importmap">{"imports":{"three":"/three.module.js"}}</script>
<script type="module">
import * as T from 'three'
const renderer = new T.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true })
const camera = new T.PerspectiveCamera(45, 1440 / 900, 1, 500)
camera.position.set(0, -120, 90)
camera.lookAt(0, 0, 0)
/** @param {number} n grid side @param {boolean} indexed */
function build(n, indexed) {
  const pos = []
  const idx = []
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) pos.push(i * 0.3 - 50, j * 0.3 - 50, Math.sin(i * j * 0.01) * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const a = i * (n + 1) + j, b = a + n + 1; idx.push(a, b, b + 1, a, b + 1, a + 1) }
  const g = new T.BufferGeometry()
  if (indexed) {
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3))
    g.setIndex(idx)
  } else {
    const flat = new Float32Array(idx.length * 3)
    idx.forEach((v, k) => { flat[k * 3] = pos[v * 3]; flat[k * 3 + 1] = pos[v * 3 + 1]; flat[k * 3 + 2] = pos[v * 3 + 2] })
    g.setAttribute('position', new T.BufferAttribute(flat, 3))
    g.computeVertexNormals()
  }
  return g
}
window.measure = (n, indexed) => {
  const scene = new T.Scene()
  scene.add(new T.AmbientLight(0xffffff, 0.5))
  const light = new T.DirectionalLight(0xffffff, 2)
  light.position.set(1, 1, 2)
  scene.add(light)
  const geometry = build(n, indexed)
  const mesh = new T.Mesh(geometry, new T.MeshStandardMaterial({ color: 0x8899aa, flatShading: indexed, metalness: 0.08, roughness: 0.55 }))
  scene.add(mesh)
  const gl = renderer.getContext()
  const px = new Uint8Array(4)
  const frame = () => { const t = performance.now(); renderer.render(scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t }
  frame() // first draw uploads the buffers and compiles the program
  const times = []
  for (let i = 0; i < 5; i++) times.push(frame())
  geometry.dispose()
  times.sort((a, b) => a - b)
  return { vertices: geometry.getAttribute('position').count, median: times[2] }
}
window.ready = true
</script>`

const headed = process.argv.includes('--headed')
const browser = await chromium.launch({ headless: !headed })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.route('http://bench.local/**', async (route) => {
  const path = new URL(route.request().url()).pathname
  if (path === '/') return route.fulfill({ contentType: 'text/html', body: PAGE })
  return route.fulfill({ contentType: 'text/javascript', body: readFileSync(THREE_BUILD + path.slice(1)) })
})
await page.goto('http://bench.local/')
await page.waitForFunction('window.ready')
console.log(`raster-triangle-cost: ${headed ? 'headed (GPU)' : 'headless (software rasteriser)'}, 1440x900`)
console.log('triangles | non-indexed (vertices, ms) | indexed + flat shading (vertices, ms)')
for (const n of SIDES) {
  const flat = await page.evaluate((side) => /** @type {any} */ (window).measure(side, false), n)
  const indexed = await page.evaluate((side) => /** @type {any} */ (window).measure(side, true), n)
  console.log(`${String(2 * n * n).padStart(9)} | ${flat.vertices} v, ${flat.median.toFixed(0)} ms | ${indexed.vertices} v, ${indexed.median.toFixed(0)} ms`)
}
await browser.close()
