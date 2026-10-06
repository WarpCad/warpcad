// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * **Auto-trace** (`TODO/sketch-004`): a tap inside a photographed part becomes its outline
 * and its holes, as image-pixel rings. Pure functions over `{ width, height, data }` (RGBA,
 * the shape `ImageData` has), so every step is tested in plain Node; the image worker
 * (`./imageJob.js`) runs them off the main thread.
 *
 * ## The pipeline
 *
 * 1. **Grayscale** ({@link grayscaleOf}) — luma, with transparency read as the light table.
 * 2. **Threshold** — Otsu's ({@link otsuThreshold}) unless the user overrides it. Which
 *    side counts as "part" is decided by the **tap**: a dark part on a light table and a
 *    light part on a dark mat are both normal.
 * 3. **Flood fill from the tapped pixel** (4-connected). Tracing only the region the user
 *    tapped is what keeps the ruler, shadows and table texture out of the result. A region
 *    that reaches the image border is refused with a reason — a tap on the background
 *    always does, because the background surrounds everything.
 * 4. **Clean-up**: one morphological close (fills pinholes and cracks under 3 px) and one
 *    open (drops spurs and specks under 3 px), with a 3 × 3 square, then the tapped
 *    component again.
 * 5. **Marching squares** ({@link contoursOf}) on the cleaned mask. The region is
 *    4-connected and the background therefore 8-connected; saddle cells are resolved to
 *    match, so every boundary is one closed ring that never crosses itself. The outer ring
 *    becomes the **Solid**; each ring around an enclosed background region bigger than the
 *    tolerance becomes a **Hole**.
 * 6. **Ramer–Douglas–Peucker** (`./simplify.js`, the same pass the Inspector's Simplify
 *    uses) at the tolerance — converted to px by the caller through the photo's `mmPerPx`
 *    — then a pass dropping vertices left collinear where a ring happened to start. A
 *    simplification that would make a ring cross itself is retried at half the tolerance.
 *
 * ## Coordinates
 *
 * Image px, as `./calibration.js` defines them: origin at the image's top-left corner, +x
 * right, **+y down**; pixel (x, y) covers [x, x+1) × [y, y+1). A straight edge between part
 * and table lands exactly on the pixel boundary, so a run of pixels 10..109 traces to
 * x = 10 and x = 110. In these coordinates (y down) a Solid ring has negative shoelace
 * area and a Hole positive; the caller normalizes winding once it is in sketch mm.
 *
 * ## Cost
 *
 * Linear in the image for the grayscale and the fill (the fill stops the moment it
 * reaches the border, so a tap on the background is cheap); the clean-up and contouring run
 * only on the tapped region's bounding box. Typed arrays throughout — never a per-pixel
 * object.
 *
 * @module sketch/trace
 */

import { simplifyPoints } from './simplify.js'

/** @typedef {[number, number]} Vec2Px */
/** @typedef {{ width: number, height: number, data: Uint8ClampedArray | Uint8Array }} RgbaImage */

/**
 * @typedef {object} TracedOutline
 * @property {'solid' | 'hole'} role
 * @property {Vec2Px[]} pointsPx A ring in image px, without a repeated closing point.
 */

/**
 * @typedef {{ ok: true, threshold: number, tolerancePx: number, outlines: TracedOutline[], pointCount: number }
 *   | { ok: false, code: 'empty' | 'outside' | 'edge' | 'small', reason: string, threshold?: number }} TraceResult
 */

/**
 * @typedef {object} TraceOptions
 * @property {number} [tolerancePx] RDP tolerance in image px. Non-finite or negative is 0.
 * @property {number | null} [threshold] A manual threshold, 0..255; `null`/absent is Otsu.
 * @property {number} [otsu] A precomputed Otsu threshold for this image (the worker caches it).
 */

/** The words each refusal shows. */
export const TRACE_REASONS = Object.freeze({
  empty: 'The photo has no pixels to trace',
  outside: 'Tap on the photo, inside the part',
  edge: 'That region runs off the edge of the photo — tap inside the part',
  small: 'That spot is too small to trace — tap inside the part',
})

/** A traced ring is kept under this many points — far under the 4096 a polyline may hold. */
export const MAX_TRACE_POINTS = 2000

/** Fewer pixels than this, after clean-up, is a speck, not a part. */
const MIN_REGION_PX = 9

/** How far (px) to look for the cleaned region when the clean-up removed the tapped pixel. */
const SEED_SEARCH_PX = 2

/**
 * Luma (Rec. 601, integer), composited over white so a transparent pixel reads as table.
 *
 * @param {RgbaImage} image
 * @returns {Uint8Array} One byte per pixel, row-major.
 */
export function grayscaleOf(image) {
  const count = image.width * image.height
  const data = image.data
  const out = new Uint8Array(count)
  for (let index = 0, at = 0; index < count; index += 1, at += 4) {
    const luma = (77 * data[at] + 150 * data[at + 1] + 29 * data[at + 2] + 128) >> 8
    const alpha = data[at + 3]
    out[index] = alpha === 255 ? luma : ((luma * alpha + 255 * (255 - alpha) + 127) / 255) | 0
  }
  return out
}

/**
 * Otsu's threshold: the gray level `t` that best splits the histogram into "≤ t" and
 * "> t". A one-tone image has no split; it answers its own tone, so every pixel is on one
 * side. An empty image answers 127.
 *
 * @param {Uint8Array} gray
 * @returns {number} 0..255
 */
export function otsuThreshold(gray) {
  if (gray.length === 0) return 127
  const histogram = new Float64Array(256)
  for (let index = 0; index < gray.length; index += 1) histogram[gray[index]] += 1
  let sum = 0
  let highest = 0
  for (let level = 0; level < 256; level += 1) {
    sum += level * histogram[level]
    if (histogram[level] > 0) highest = level
  }
  const total = gray.length
  let threshold = highest
  let best = -1
  let weightBelow = 0
  let sumBelow = 0
  for (let level = 0; level < 256; level += 1) {
    weightBelow += histogram[level]
    if (weightBelow === 0) continue
    const weightAbove = total - weightBelow
    if (weightAbove === 0) break
    sumBelow += level * histogram[level]
    const meanBelow = sumBelow / weightBelow
    const meanAbove = (sum - sumBelow) / weightAbove
    const between = weightBelow * weightAbove * (meanBelow - meanAbove) ** 2
    if (between > best) {
      best = between
      threshold = level
    }
  }
  return threshold
}

// --- morphology on a window -----------------------------------------------------------

/**
 * 3 × 3 dilate (`max`) or erode (`min`), separable, with everything outside the window
 * reading as 0. Writes `out`; `scratch` is a same-size buffer.
 *
 * @param {Uint8Array} mask @param {number} width @param {number} height
 * @param {boolean} dilate @param {Uint8Array} scratch @param {Uint8Array} out
 */
function morph3(mask, width, height, dilate, scratch, out) {
  for (let y = 0; y < height; y += 1) {
    const row = y * width
    for (let x = 0; x < width; x += 1) {
      const left = x > 0 ? mask[row + x - 1] : 0
      const right = x < width - 1 ? mask[row + x + 1] : 0
      const here = mask[row + x]
      scratch[row + x] = dilate ? left | here | right : left & here & right
    }
  }
  for (let y = 0; y < height; y += 1) {
    const row = y * width
    for (let x = 0; x < width; x += 1) {
      const up = y > 0 ? scratch[row - width + x] : 0
      const down = y < height - 1 ? scratch[row + width + x] : 0
      const here = scratch[row + x]
      out[row + x] = dilate ? up | here | down : up & here & down
    }
  }
}

/**
 * Keep only the 4-connected component of `mask` containing `seed`; returns its size.
 *
 * @param {Uint8Array} mask Modified in place.
 * @param {number} width @param {number} seed
 * @param {Int32Array} stack At least `mask.length` long.
 */
function keepComponent(mask, width, seed, stack) {
  const component = new Uint8Array(mask.length)
  let top = 0
  let count = 0
  /** @param {number} index */
  const visit = (index) => {
    if (mask[index] && !component[index]) {
      component[index] = 1
      stack[top++] = index
    }
  }
  visit(seed)
  while (top > 0) {
    const index = stack[--top]
    count += 1
    const x = index % width
    if (x > 0) visit(index - 1)
    if (x < width - 1) visit(index + 1)
    if (index >= width) visit(index - width)
    if (index + width < mask.length) visit(index + width)
  }
  mask.set(component)
  return count
}

// --- marching squares -------------------------------------------------------------------

// Directed segments per cell case, as [start, end] edge names: walking start → end keeps the
// region on the same side every time. Corners: TL = 8, TR = 4, BR = 2, BL = 1. Saddles (5, 10)
// are split, because the region is 4-connected: diagonal region corners do not touch.
const T = 0
const R = 1
const B = 2
const L = 3
/** @type {readonly (readonly number[])[]} */
const SEGMENTS = [
  [], // 0
  [B, L], // 1  BL
  [R, B], // 2  BR
  [R, L], // 3  BR BL
  [T, R], // 4  TR
  [T, R, B, L], // 5  TR BL (saddle: two segments)
  [T, B], // 6  TR BR
  [T, L], // 7  all but TL
  [L, T], // 8  TL
  [B, T], // 9  TL BL
  [L, T, R, B], // 10 TL BR (saddle: two segments)
  [R, T], // 11 all but TR
  [L, R], // 12 TL TR
  [B, R], // 13 all but BR
  [L, B], // 14 all but BL
  [], // 15
]

/**
 * Every boundary of a binary mask, as closed rings in the mask's own pixel coordinates
 * (pixel (x, y) covers [x, x+1) × [y, y+1); a straight boundary lies on pixel edges). The
 * mask is padded with 0 all round, so a region touching the border still closes. With +y
 * down, a ring around set pixels has negative shoelace area and a ring around an enclosed
 * gap positive.
 *
 * @param {Uint8Array} mask Non-zero is "in".
 * @param {number} width
 * @param {number} height
 * @returns {Vec2Px[][]}
 */
export function contoursOf(mask, width, height) {
  const pw = width + 2
  const ph = height + 2
  /** @param {number} i @param {number} j padded sample, 0 outside the mask */
  const at = (i, j) => (i >= 1 && j >= 1 && i <= width && j <= height && mask[(j - 1) * width + (i - 1)] ? 1 : 0)
  // Edge ids: horizontal edge from sample (i, j) to (i+1, j) is 2·(j·pw + i); vertical edge
  // from (i, j) to (i, j+1) is 2·(j·pw + i) + 1.
  const next = new Int32Array(2 * pw * ph).fill(-1)
  /** @type {number[]} */
  const edges = [0, 0, 0, 0]
  for (let j = 0; j < ph - 1; j += 1) {
    for (let i = 0; i < pw - 1; i += 1) {
      const code = at(i, j) * 8 + at(i + 1, j) * 4 + at(i + 1, j + 1) * 2 + at(i, j + 1)
      const segments = SEGMENTS[code]
      if (segments.length === 0) continue
      edges[T] = 2 * (j * pw + i)
      edges[B] = 2 * ((j + 1) * pw + i)
      edges[L] = 2 * (j * pw + i) + 1
      edges[R] = 2 * (j * pw + i + 1) + 1
      for (let s = 0; s < segments.length; s += 2) next[edges[segments[s]]] = edges[segments[s + 1]]
    }
  }
  /** @type {Vec2Px[][]} */
  const loops = []
  const visited = new Uint8Array(next.length)
  for (let start = 0; start < next.length; start += 1) {
    if (next[start] === -1 || visited[start]) continue
    /** @type {Vec2Px[]} */
    const loop = []
    let edge = start
    while (edge !== -1 && !visited[edge]) {
      visited[edge] = 1
      const cell = edge >> 1
      const i = cell % pw
      const j = (cell - i) / pw
      // Midpoint of the edge, in mask pixel coordinates (sample (i, j) is pixel (i-1, j-1),
      // whose centre is (i - 0.5, j - 0.5)).
      loop.push(edge & 1 ? [i - 0.5, j] : [i, j - 0.5])
      edge = next[edge]
    }
    if (loop.length >= 3) loops.push(loop)
  }
  return loops
}

// --- ring utilities -----------------------------------------------------------------------

/** @param {readonly (readonly number[])[]} ring */
function signedArea(ring) {
  let twice = 0
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index]
    const b = ring[(index + 1) % ring.length]
    twice += a[0] * b[1] - b[0] * a[1]
  }
  return twice / 2
}

/** @param {readonly number[]} p @param {readonly number[]} a @param {readonly number[]} b */
function distanceToSegment(p, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/**
 * Whether a closed ring crosses itself. Neighbouring edges sharing a vertex, collinear
 * overlaps and coincident points do not count — only a proper crossing. O(n²).
 *
 * @param {readonly (readonly number[])[]} ring
 * @returns {boolean}
 */
export function ringSelfIntersects(ring) {
  const count = ring.length
  if (count < 4) return false
  /** @param {readonly number[]} p @param {readonly number[]} q @param {readonly number[]} r */
  const side = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  for (let i = 0; i < count; i += 1) {
    const a1 = ring[i]
    const a2 = ring[(i + 1) % count]
    for (let j = i + 2; j < count; j += 1) {
      if (i === 0 && j === count - 1) continue
      const b1 = ring[j]
      const b2 = ring[(j + 1) % count]
      const d1 = side(b1, b2, a1)
      const d2 = side(b1, b2, a2)
      if (!((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))) continue
      const d3 = side(a1, a2, b1)
      const d4 = side(a1, a2, b2)
      if ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)) return true
    }
  }
  return false
}

/**
 * Drop every vertex within `tolerance` of the chord joining its neighbours — RDP always
 * keeps its anchors, and on a closed ring one anchor is wherever tracing happened to start,
 * often the middle of a straight edge. Never leaves fewer than 3.
 *
 * @param {Vec2Px[]} ring
 * @param {number} tolerance
 * @returns {Vec2Px[]}
 */
function dropCollinear(ring, tolerance) {
  const out = ring.slice()
  let changed = true
  while (changed && out.length > 3) {
    changed = false
    for (let index = 0; index < out.length && out.length > 3; index += 1) {
      const before = out[(index + out.length - 1) % out.length]
      const after = out[(index + 1) % out.length]
      if (distanceToSegment(out[index], before, after) <= tolerance) {
        out.splice(index, 1)
        changed = true
        index -= 1
      }
    }
  }
  return out
}

/**
 * Simplify a traced ring: RDP at the tolerance, then collinear clean-up. Raises the
 * tolerance until the ring fits {@link MAX_TRACE_POINTS}, and halves it again (down to
 * nothing) when a simplification would make the ring cross itself.
 *
 * @param {Vec2Px[]} ring
 * @param {number} tolerancePx
 * @returns {Vec2Px[] | null} `null` when the ring would collapse under 3 points.
 */
function simplifyRing(ring, tolerancePx) {
  let tolerance = tolerancePx
  /** @type {Vec2Px[] | null} */
  let out = null
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const simplified = /** @type {Vec2Px[] | null} */ (simplifyPoints(ring, tolerance, true))
    out = simplified ? dropCollinear(simplified, Math.max(tolerance, 1e-9)) : null
    if (out && out.length > MAX_TRACE_POINTS) {
      tolerance = Math.max(0.25, tolerance * 2)
      continue
    }
    break
  }
  if (!out) return null
  // Never hand back a ring that crosses itself: retry finer. The unsimplified marching-squares
  // ring never does, so this always ends.
  while (ringSelfIntersects(out) && tolerance > 0.05) {
    tolerance /= 2
    const finer = /** @type {Vec2Px[] | null} */ (simplifyPoints(ring, tolerance, true))
    if (!finer) break
    out = dropCollinear(finer, tolerance)
  }
  return out
}

// --- the pipeline -------------------------------------------------------------------------

/**
 * @param {Vec2Px[]} ring
 * @param {number} dx
 * @param {number} dy
 * @returns {Vec2Px[]}
 */
function shifted(ring, dx, dy) {
  return ring.map(([x, y]) => /** @type {Vec2Px} */ ([x + dx, y + dy]))
}

/**
 * Auto-trace from a precomputed grayscale image — what the worker calls, so the grayscale
 * and Otsu threshold are computed once per photo, not once per tap. Never throws.
 *
 * @param {Uint8Array} gray One byte per pixel, row-major.
 * @param {number} width
 * @param {number} height
 * @param {readonly number[]} seedPx Where the user tapped, in image px.
 * @param {TraceOptions} [options]
 * @returns {TraceResult}
 */
export function traceGray(gray, width, height, seedPx, options = {}) {
  if (!(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0) || gray.length < width * height) {
    return { ok: false, code: 'empty', reason: TRACE_REASONS.empty }
  }
  const sx = Math.floor(seedPx[0])
  const sy = Math.floor(seedPx[1])
  if (!(Number.isFinite(seedPx[0]) && Number.isFinite(seedPx[1])) || sx < 0 || sy < 0 || sx >= width || sy >= height) {
    return { ok: false, code: 'outside', reason: TRACE_REASONS.outside }
  }
  const manual = options.threshold
  const threshold =
    typeof manual === 'number' && Number.isFinite(manual)
      ? Math.min(255, Math.max(0, Math.round(manual)))
      : typeof options.otsu === 'number'
        ? options.otsu
        : otsuThreshold(gray)
  const rawTolerance = options.tolerancePx ?? 0
  const tolerancePx = Number.isFinite(rawTolerance) && rawTolerance > 0 ? rawTolerance : 0

  // 1. Flood fill from the tap, over pixels on the tap's side of the threshold. Stops the
  //    moment it reaches the border.
  const dark = gray[sy * width + sx] <= threshold
  const region = new Uint8Array(width * height)
  const stack = new Int32Array(width * height)
  let top = 0
  let minX = sx
  let maxX = sx
  let minY = sy
  let maxY = sy
  const seed = sy * width + sx
  region[seed] = 1
  stack[top++] = seed
  while (top > 0) {
    const index = stack[--top]
    const x = index % width
    const y = (index - x) / width
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
      return { ok: false, code: 'edge', reason: TRACE_REASONS.edge, threshold }
    }
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    // Interior pixel (the border returned above), so all four neighbours exist.
    for (let side = 0; side < 4; side += 1) {
      const neighbour = side === 0 ? index - 1 : side === 1 ? index + 1 : side === 2 ? index - width : index + width
      if (!region[neighbour] && gray[neighbour] <= threshold === dark) {
        region[neighbour] = 1
        stack[top++] = neighbour
      }
    }
  }

  // 2. Clean up on the region's bounding box plus a 2 px margin (the region is at least a
  //    pixel clear of the border, so the margin fits up to the image edge).
  const x0 = Math.max(0, minX - 2)
  const y0 = Math.max(0, minY - 2)
  const ww = Math.min(width - 1, maxX + 2) - x0 + 1
  const wh = Math.min(height - 1, maxY + 2) - y0 + 1
  const window = new Uint8Array(ww * wh)
  for (let y = 0; y < wh; y += 1) window.set(region.subarray((y0 + y) * width + x0, (y0 + y) * width + x0 + ww), y * ww)
  const scratch = new Uint8Array(ww * wh)
  const buffer = new Uint8Array(ww * wh)
  morph3(window, ww, wh, true, scratch, buffer) // close: dilate…
  morph3(buffer, ww, wh, false, scratch, window) // …then erode
  morph3(window, ww, wh, false, scratch, buffer) // open: erode…
  morph3(buffer, ww, wh, true, scratch, window) // …then dilate

  // 3. The tapped component again — the clean-up may have cut a thread to something else.
  let local = (sy - y0) * ww + (sx - x0)
  if (!window[local]) {
    local = -1
    for (let dy = -SEED_SEARCH_PX; dy <= SEED_SEARCH_PX && local < 0; dy += 1) {
      for (let dx = -SEED_SEARCH_PX; dx <= SEED_SEARCH_PX && local < 0; dx += 1) {
        const x = sx - x0 + dx
        const y = sy - y0 + dy
        if (x >= 0 && y >= 0 && x < ww && y < wh && window[y * ww + x]) local = y * ww + x
      }
    }
    if (local < 0) return { ok: false, code: 'small', reason: TRACE_REASONS.small, threshold }
  }
  if (keepComponent(window, ww, local, stack) < MIN_REGION_PX) {
    return { ok: false, code: 'small', reason: TRACE_REASONS.small, threshold }
  }

  // 4. Boundaries: the one ring around the region is the Solid; rings around enclosed gaps
  //    bigger than the tolerance are Holes.
  const loops = contoursOf(window, ww, wh)
  let solidIndex = -1
  let solidArea = 0
  loops.forEach((loop, index) => {
    const area = signedArea(loop)
    if (area < solidArea) {
      solidArea = area
      solidIndex = index
    }
  })
  if (solidIndex < 0) return { ok: false, code: 'small', reason: TRACE_REASONS.small, threshold }
  const minHoleArea = Math.PI * Math.max(1, tolerancePx) ** 2

  /** @type {TracedOutline[]} */
  const outlines = []
  const solid = simplifyRing(shifted(loops[solidIndex], x0, y0), tolerancePx)
  if (!solid) return { ok: false, code: 'small', reason: TRACE_REASONS.small, threshold }
  outlines.push({ role: 'solid', pointsPx: solid })
  loops.forEach((loop, index) => {
    if (index === solidIndex || signedArea(loop) < minHoleArea) return
    const hole = simplifyRing(shifted(loop, x0, y0), tolerancePx)
    if (hole) outlines.push({ role: 'hole', pointsPx: hole })
  })
  return {
    ok: true,
    threshold,
    tolerancePx,
    outlines,
    pointCount: outlines.reduce((sum, outline) => sum + outline.pointsPx.length, 0),
  }
}

/**
 * Auto-trace an RGBA image from a tap. Never throws: a refusal comes back as
 * `{ ok: false, code, reason }` in words the banner can show.
 *
 * @param {RgbaImage} image
 * @param {readonly number[]} seedPx
 * @param {TraceOptions} [options]
 * @returns {TraceResult}
 */
export function traceRegion(image, seedPx, options = {}) {
  const { width, height, data } = image ?? {}
  if (!(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0) || !data || data.length < width * height * 4) {
    return { ok: false, code: 'empty', reason: TRACE_REASONS.empty }
  }
  return traceGray(grayscaleOf(image), width, height, seedPx, options)
}
