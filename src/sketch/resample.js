// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Loft numerics: make every slice's outline wall-able to the next (`TODO/sketch-001`).
 *
 * `@jscad/modeling`'s `extrudeFromSlices` walls slice *n* to slice *n + 1* **by vertex
 * index**. So every ring must have the same vertex count, the same winding, and
 * corresponding start points, or the skin twists or tears — `src/core/kernel/fillet.js`
 * already met the "cannot wall two rings of different lengths" version of this. For each
 * slice's single Solid outline this module:
 *
 * 1. normalizes the winding to counter-clockwise;
 * 2. rotates the vertex list to a **corresponding** start — the first ring at its farthest
 *    +X vertex, every later one at the vertex that best matches the ring below — so the
 *    skin does not twist (`TODO/sketch-008`; see the correspondence note further down);
 * 3. resamples by arc length to N points — **keeping every original vertex**, at stations
 *    shared by all the rings so index i is the same fraction of the way round on each. A
 *    corner is never rounded off by the resample, and a requested N below what keeps every
 *    vertex is raised to it rather than honoured by dropping corners.
 *
 * Framework-free and kernel-free: plain point lists in, plain point lists out.
 *
 * @module sketch/resample
 */

import { signedAreaMm2 } from './profile.js'

/** @typedef {import('./profile.js').Vec2Mm} Vec2Mm */

/** The most points a Loft ring is ever resampled to. */
export const MAX_LOFT_POINTS = 256

/** Below this, in mm², an outline encloses nothing. */
const AREA_EPS_MM2 = 1e-9

/**
 * The same ring, counter-clockwise.
 *
 * @param {readonly Vec2Mm[]} pointsMm
 * @returns {Vec2Mm[]} A new array when reversed; the input when already CCW.
 */
export function normalizeCcw(pointsMm) {
  return signedAreaMm2(pointsMm) < 0 ? [...pointsMm].reverse() : /** @type {Vec2Mm[]} */ (pointsMm)
}

/**
 * The ring rotated to start at the vertex whose direction from the centroid is closest
 * to +X. Choosing by *angle* rather than by distance to the ray keeps the choice stable
 * for rings of very different sizes, which is exactly the Loft case.
 *
 * @param {readonly Vec2Mm[]} pointsMm
 * @returns {Vec2Mm[]}
 */
export function rotateToPlusX(pointsMm) {
  let cx = 0
  let cy = 0
  for (const point of pointsMm) {
    cx += point[0]
    cy += point[1]
  }
  cx /= pointsMm.length
  cy /= pointsMm.length
  let start = 0
  let bestAngle = Infinity
  pointsMm.forEach((point, index) => {
    const angle = Math.abs(Math.atan2(point[1] - cy, point[0] - cx))
    if (angle < bestAngle - 1e-12) {
      bestAngle = angle
      start = index
    }
  })
  return [...pointsMm.slice(start), ...pointsMm.slice(0, start)]
}

/**
 * Resample a closed ring to `count` points by arc length, keeping every original vertex.
 *
 * @param {readonly Vec2Mm[]} pointsMm A closed ring, without a repeated closing point.
 * @param {number} count Wanted point count; raised to the ring's vertex count if lower.
 * @returns {Vec2Mm[]}
 * @throws {Error} For a ring that encloses no area (collinear or coincident points).
 */
export function resampleClosed(pointsMm, count) {
  const ring = pointsMm.filter((point, index) => {
    const next = pointsMm[(index + 1) % pointsMm.length]
    return Math.hypot(next[0] - point[0], next[1] - point[1]) > 1e-12
  })
  if (ring.length < 3 || Math.abs(signedAreaMm2(ring)) <= AREA_EPS_MM2) {
    throw new Error('resample: this outline encloses no area — its points are collinear or coincident')
  }
  const total = Math.max(ring.length, Math.round(count))
  const extra = total - ring.length
  const lengths = ring.map((point, index) => {
    const next = ring[(index + 1) % ring.length]
    return Math.hypot(next[0] - point[0], next[1] - point[1])
  })
  const perimeter = lengths.reduce((sum, length) => sum + length, 0)

  // Largest-remainder apportionment of the extra points over the edges.
  const ideal = lengths.map((length) => (extra * length) / perimeter)
  const given = ideal.map(Math.floor)
  let left = extra - given.reduce((sum, value) => sum + value, 0)
  const byRemainder = ideal.map((value, index) => [value - Math.floor(value), index]).sort((a, b) => b[0] - a[0])
  for (let k = 0; left > 0; k += 1, left -= 1) given[byRemainder[k % byRemainder.length][1]] += 1

  /** @type {Vec2Mm[]} */
  const out = []
  ring.forEach((point, index) => {
    const next = ring[(index + 1) % ring.length]
    out.push([point[0], point[1]])
    const between = given[index]
    for (let step = 1; step <= between; step += 1) {
      const t = step / (between + 1)
      out.push([point[0] + (next[0] - point[0]) * t, point[1] + (next[1] - point[1]) * t])
    }
  })
  return out
}

/**
 * @typedef {object} LoftRing
 * @property {number} zMm
 * @property {Vec2Mm[]} pointsMm
 */

// --- correspondence (TODO/sketch-008) ----------------------------------------
//
// sketch-001 started every ring "toward +X" independently and resampled each to N by its own
// edge lengths. Two airfoils showed both halves of that to be wrong: on a cambered section the
// vertex nearest the centroid's +X ray is an upper-surface point a few stations ahead of the
// trailing edge, not the trailing edge; and two rings of different point counts, each topped
// up to N on its own, put index i at different chord stations — 16 % of chord apart for an
// 80-point root and a 61-point tip. The skin then runs diagonally and the wing's volume drifts.
//
// Now: ring 0 starts at its **farthest +X vertex** (an airfoil's trailing edge; still a
// circle's or a regular polygon's +X vertex). Each later ring starts at whichever vertex makes
// it **match the ring below best** (shape compared at even arc-length steps, after removing
// position and size), so a swept, tapered or washed-out tip still pairs trailing edge to
// trailing edge, however its point list happened to start. Then every ring is resampled at one
// **shared set of arc-length fractions** — the union of all the rings' own vertex fractions —
// so index i is the same fraction of the way round on every ring, and every original vertex
// is still kept exactly.

/** Below this fraction of a perimeter, two rings' vertices count as the same station. */
const SHARED_STATION_EPS = 1e-3
/** How many even arc-length samples the start-vertex match compares. */
const MATCH_SAMPLES = 64

/**
 * Cumulative arc-length fraction of each vertex of a closed ring, from its vertex 0.
 *
 * @param {readonly Vec2Mm[]} ring
 * @returns {number[]} `[0, …]`, each in `[0, 1)`.
 */
function vertexFractions(ring) {
  const lengths = ring.map((point, index) => {
    const next = ring[(index + 1) % ring.length]
    return Math.hypot(next[0] - point[0], next[1] - point[1])
  })
  const total = lengths.reduce((sum, length) => sum + length, 0)
  /** @type {number[]} */
  const out = []
  let walked = 0
  for (let index = 0; index < ring.length; index += 1) {
    out.push(walked / total)
    walked += lengths[index]
  }
  return out
}

/**
 * The point `fraction` of the way round a closed ring, by arc length.
 *
 * @param {readonly Vec2Mm[]} ring
 * @param {readonly number[]} fractions {@link vertexFractions} of the ring.
 * @param {number} fraction In `[0, 1)`.
 * @returns {Vec2Mm}
 */
function pointAtFraction(ring, fractions, fraction) {
  // Binary search for the edge whose start fraction is the last one ≤ fraction.
  let lo = 0
  let hi = ring.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (fractions[mid] <= fraction) lo = mid
    else hi = mid - 1
  }
  const a = ring[lo]
  const b = ring[(lo + 1) % ring.length]
  const from = fractions[lo]
  const to = lo + 1 < ring.length ? fractions[lo + 1] : 1
  const t = to > from ? (fraction - from) / (to - from) : 0
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

/**
 * The ring rotated to start at its farthest +X vertex — ties broken toward the centroid's +X
 * ray, so a square still starts where {@link rotateToPlusX} would.
 *
 * @param {readonly Vec2Mm[]} ring
 * @returns {Vec2Mm[]}
 */
function rotateToFarthestPlusX(ring) {
  const maxX = Math.max(...ring.map((point) => point[0]))
  const span = maxX - Math.min(...ring.map((point) => point[0]))
  const candidates = ring.filter((point) => point[0] >= maxX - span * 1e-9)
  if (candidates.length === ring.length) return rotateToPlusX(ring)
  const start = rotateToPlusX(candidates)[0]
  const index = ring.indexOf(start)
  return [...ring.slice(index), ...ring.slice(0, index)]
}

/**
 * A ring sampled at {@link MATCH_SAMPLES} even arc-length steps from vertex `start`,
 * centred on its mean and scaled to unit RMS radius — position and size removed, so only
 * shape and orientation are compared. Also returns the centre and scale it used, so the
 * ring's own vertices can be put in the same frame.
 *
 * @param {readonly Vec2Mm[]} ring
 * @param {number} start
 * @returns {{ samples: Vec2Mm[], cx: number, cy: number, scale: number }}
 */
function shapeSignature(ring, start) {
  const rolled = [...ring.slice(start), ...ring.slice(0, start)]
  const fractions = vertexFractions(rolled)
  /** @type {Vec2Mm[]} */
  const raw = []
  for (let k = 0; k < MATCH_SAMPLES; k += 1) raw.push(pointAtFraction(rolled, fractions, k / MATCH_SAMPLES))
  let cx = 0
  let cy = 0
  for (const point of raw) {
    cx += point[0]
    cy += point[1]
  }
  cx /= raw.length
  cy /= raw.length
  let sumSq = 0
  for (const point of raw) sumSq += (point[0] - cx) ** 2 + (point[1] - cy) ** 2
  const scale = Math.sqrt(sumSq / raw.length) || 1
  const samples = raw.map((point) => /** @type {Vec2Mm} */ ([(point[0] - cx) / scale, (point[1] - cy) / scale]))
  return { samples, cx, cy, scale }
}

/**
 * `ring` rotated to the start vertex that corresponds to `reference`'s vertex 0.
 *
 * Two passes. A **coarse** one picks the start whose even arc-length samples best match the
 * reference's — that alone is only good to a vertex or so where stations crowd (an airfoil's
 * trailing edge), because a one-station shift and a 2° washout cost about the same. So a
 * **fine** one then takes the best-fit rotation between the two matched shapes, undoes it,
 * and starts at the ring's vertex nearest the reference's start point — the trailing edge,
 * exactly, on a twisted tip.
 *
 * @param {readonly Vec2Mm[]} reference
 * @param {readonly Vec2Mm[]} ring
 * @returns {Vec2Mm[]}
 */
function rotateToMatch(reference, ring) {
  const target = shapeSignature(reference, 0)
  let best = 0
  let bestCost = Infinity
  for (let start = 0; start < ring.length; start += 1) {
    const candidate = shapeSignature(ring, start).samples
    let cost = 0
    for (let k = 0; k < MATCH_SAMPLES && cost < bestCost; k += 1) {
      cost += (candidate[k][0] - target.samples[k][0]) ** 2 + (candidate[k][1] - target.samples[k][1]) ** 2
    }
    if (cost < bestCost - 1e-12) {
      bestCost = cost
      best = start
    }
  }
  // Best-fit rotation taking the ring's matched samples onto the reference's (2D Procrustes).
  const matched = shapeSignature(ring, best)
  let cross = 0
  let dot = 0
  for (let k = 0; k < MATCH_SAMPLES; k += 1) {
    const [bx, by] = matched.samples[k]
    const [ax, ay] = target.samples[k]
    dot += bx * ax + by * ay
    cross += bx * ay - by * ax
  }
  const turnRad = Math.atan2(cross, dot)
  const cos = Math.cos(turnRad)
  const sin = Math.sin(turnRad)
  const anchor = target.samples[0]
  let start = best
  let nearest = Infinity
  ring.forEach((point, index) => {
    const x = (point[0] - matched.cx) / matched.scale
    const y = (point[1] - matched.cy) / matched.scale
    const distance = Math.hypot(x * cos - y * sin - anchor[0], x * sin + y * cos - anchor[1])
    if (distance < nearest - 1e-12) {
      nearest = distance
      start = index
    }
  })
  return [...ring.slice(start), ...ring.slice(0, start)]
}

/**
 * Drop zero-length edges, and refuse a ring that encloses nothing.
 *
 * @param {readonly Vec2Mm[]} pointsMm
 * @returns {Vec2Mm[]}
 */
function cleanRing(pointsMm) {
  const ring = pointsMm.filter((point, index) => {
    const next = pointsMm[(index + 1) % pointsMm.length]
    return Math.hypot(next[0] - point[0], next[1] - point[1]) > 1e-12
  })
  if (ring.length < 3 || Math.abs(signedAreaMm2(ring)) <= AREA_EPS_MM2) {
    throw new Error('resample: this outline encloses no area — its points are collinear or coincident')
  }
  return ring
}

/**
 * The shared stations: every ring's vertex fractions, merged where two *different* rings put
 * a vertex at (nearly) the same fraction. Each station records, per ring, which of that ring's
 * vertices sits there, or `-1`.
 *
 * @param {readonly number[][]} fractionsByRing
 * @returns {{ fraction: number, vertexOf: number[] }[]}
 */
function sharedStations(fractionsByRing) {
  const all = fractionsByRing
    .flatMap((fractions, ring) => fractions.map((fraction, vertex) => ({ fraction, ring, vertex })))
    .sort((a, b) => a.fraction - b.fraction || a.ring - b.ring)
  /** @type {{ fraction: number, vertexOf: number[] }[]} */
  const stations = []
  for (const entry of all) {
    const last = stations[stations.length - 1]
    if (last && entry.fraction - last.fraction < SHARED_STATION_EPS && last.vertexOf[entry.ring] === -1) {
      last.vertexOf[entry.ring] = entry.vertex
      continue
    }
    const vertexOf = fractionsByRing.map(() => -1)
    vertexOf[entry.ring] = entry.vertex
    stations.push({ fraction: entry.fraction, vertexOf })
  }
  return stations
}

/**
 * Every Loft slice's outline, ready to wall: sorted by Z, CCW, started at corresponding
 * vertices, and resampled to one shared count so index i is the same station on every ring
 * (see the correspondence note above).
 *
 * @param {readonly LoftRing[]} rings One outline per slice, in any order.
 * @param {number} resolution Wanted points per ring; `0` means automatic (as few as keep
 *   every ring's own vertices). Capped at {@link MAX_LOFT_POINTS}, and never below what
 *   keeps every ring's vertices.
 * @returns {LoftRing[]}
 * @throws {Error} When two slices share a Z, or a ring encloses no area.
 */
export function loftRings(rings, resolution) {
  const sorted = [...rings].sort((a, b) => a.zMm - b.zMm)
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].zMm === sorted[index - 1].zMm) {
      throw new Error(`resample: two slices are at the same Z (${sorted[index].zMm} mm) — Loft needs each at its own height`)
    }
  }
  const largest = Math.max(...sorted.map((ring) => ring.pointsMm.length))
  if (largest > MAX_LOFT_POINTS) {
    throw new Error(`resample: a Loft outline has ${largest} points — the limit is ${MAX_LOFT_POINTS}`)
  }

  /** @type {Vec2Mm[][]} */
  const started = []
  for (const ring of sorted) {
    const clean = cleanRing(normalizeCcw(ring.pointsMm))
    started.push(started.length === 0 ? rotateToFarthestPlusX(clean) : rotateToMatch(started[started.length - 1], clean))
  }

  const fractionsByRing = started.map(vertexFractions)
  const stations = sharedStations(fractionsByRing)
  const wanted = Math.min(MAX_LOFT_POINTS, Math.max(resolution > 0 ? resolution : 0, stations.length))
  if (stations.length > MAX_LOFT_POINTS) {
    // Too many distinct stations to share: each ring keeps its own vertices and is topped up
    // on its own (sketch-001's resample), from the corresponding start found above.
    const count = Math.min(MAX_LOFT_POINTS, Math.max(resolution > 0 ? resolution : largest, largest))
    return sorted.map((ring, index) => ({ zMm: ring.zMm, pointsMm: resampleClosed(started[index], count) }))
  }

  // Top up to the wanted count by splitting the widest gaps between stations.
  const fractions = stations.map((station) => station.fraction)
  /** @type {(number[] | null)[]} */
  const owners = stations.map((station) => station.vertexOf)
  while (fractions.length < wanted) {
    let widest = 0
    let widestGap = -1
    for (let index = 0; index < fractions.length; index += 1) {
      const next = index + 1 < fractions.length ? fractions[index + 1] : 1 + fractions[0]
      if (next - fractions[index] > widestGap) {
        widestGap = next - fractions[index]
        widest = index
      }
    }
    fractions.splice(widest + 1, 0, fractions[widest] + widestGap / 2)
    owners.splice(widest + 1, 0, null)
  }

  return sorted.map((ring, ringIndex) => {
    const own = started[ringIndex]
    const ownFractions = fractionsByRing[ringIndex]
    return {
      zMm: ring.zMm,
      pointsMm: fractions.map((fraction, index) => {
        const vertex = owners[index]?.[ringIndex] ?? -1
        if (vertex >= 0) return /** @type {Vec2Mm} */ ([own[vertex][0], own[vertex][1]])
        return pointAtFraction(own, ownFractions, fraction % 1)
      }),
    }
  })
}
