// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Snapping a point being drawn onto the outlines already on the slice (`TODO/sketch-007`).
 *
 * Framework-free and pure: no Vue, no DOM, no three.js. `Viewport.vue` builds the targets
 * once per change of the active slice's outlines ({@link snapTargets}) and asks
 * {@link snapPoint} once per pointer event.
 *
 * ## Tiers
 *
 * A higher tier beats a lower one whenever both are in range; inside a tier the nearest
 * target wins. In priority order:
 *
 * 1. `vertex` — a polyline's points, a rectangle's corners, a polygon's vertices.
 * 2. `centre` — a circle's, rectangle's or polygon's centre; and `quadrant` — a circle's
 *    four axis points. Same tier, different words.
 * 3. `midpoint` — the middle of a polyline segment, a rectangle edge or a polygon edge.
 * 4. `edge` — the nearest point on any of those edges, or on a circle's circumference.
 * 5. `origin` — the sketch origin `[0, 0]`, only when some other outline is on the slice
 *    (an empty slice has nothing to snap to, so snapping is invisible).
 *
 * ## Units and allocation
 *
 * Everything is sketch-local millimetres (`Vec2Mm`). The radius arrives already in mm — the
 * caller converts its screen-pixel radius at its own boundary. Targets are flat number
 * arrays, not objects, and {@link snapPoint} writes into a caller-owned result
 * ({@link createSnapResult}), so the pointer path allocates nothing (CLAUDE.md Performance).
 * Distances are `Math.sqrt(dx * dx + dy * dy)`, never `Math.hypot`: V8's `hypot` is a varargs
 * builtin that allocated on every call in `bench/snap-search.mjs`, the explicit form allocates
 * nothing.
 *
 * @module sketch/snap
 */

/** @typedef {import('./profile.js').Profile} Profile */
/** @typedef {'vertex' | 'centre' | 'quadrant' | 'midpoint' | 'edge' | 'origin'} SnapKind */
/**
 * @typedef {object} SnapTargets
 * @property {number[]} points `[xMm, yMm, kindCode, …]` — every point target, stride 3.
 * @property {number[]} segments `[axMm, ayMm, bxMm, byMm, …]` — the edges, stride 4.
 * @property {number[]} circles `[cxMm, cyMm, radiusMm, …]` — the circumferences, stride 3.
 */
/** @typedef {{ pointMm: [number, number], kind: SnapKind }} SnapResult */

/** The word shown beside the marker, per kind. */
export const SNAP_LABELS = Object.freeze({
  vertex: 'Corner',
  centre: 'Centre',
  quadrant: 'Quadrant',
  midpoint: 'Midpoint',
  edge: 'On edge',
  origin: 'Origin',
})

/** Kind codes as stored in `points`, and each kind's tier (lower wins). */
const KINDS = /** @type {readonly SnapKind[]} */ (Object.freeze(['vertex', 'centre', 'quadrant', 'midpoint', 'edge', 'origin']))
const TIER = Object.freeze([1, 2, 2, 3, 4, 5])
const VERTEX = 0
const CENTRE = 1
const QUADRANT = 2
const MIDPOINT = 3
const EDGE = 4
const ORIGIN = 5

/** @param {number[]} points @param {number} x @param {number} y @param {number} code */
function pushPoint(points, x, y, code) {
  if (Number.isFinite(x) && Number.isFinite(y)) points.push(x, y, code)
}

/** @param {SnapTargets} targets @param {number} ax @param {number} ay @param {number} bx @param {number} by */
function pushSegment(targets, ax, ay, bx, by) {
  if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by)) return
  targets.segments.push(ax, ay, bx, by)
  pushPoint(targets.points, (ax + bx) / 2, (ay + by) / 2, MIDPOINT)
}

/**
 * Corners (or points) of a closed ring/open chain, with every edge and its midpoint.
 *
 * @param {SnapTargets} targets
 * @param {readonly (readonly number[])[]} ring
 * @param {boolean} closed
 */
function pushRing(targets, ring, closed) {
  for (const point of ring) pushPoint(targets.points, point[0], point[1], VERTEX)
  const edges = closed ? ring.length : ring.length - 1
  for (let index = 0; index < edges; index += 1) {
    const a = ring[index]
    const b = ring[(index + 1) % ring.length]
    pushSegment(targets, a[0], a[1], b[0], b[1])
  }
}

/**
 * Every snap target of one profile.
 *
 * @param {SnapTargets} targets
 * @param {Profile} profile
 */
function addProfileTargets(targets, profile) {
  if (profile.kind === 'circle') {
    const [cx, cy] = profile.centerMm
    const r = profile.radiusMm
    pushPoint(targets.points, cx, cy, CENTRE)
    if (!Number.isFinite(r) || r < 0) return
    pushPoint(targets.points, cx + r, cy, QUADRANT)
    pushPoint(targets.points, cx, cy + r, QUADRANT)
    pushPoint(targets.points, cx - r, cy, QUADRANT)
    pushPoint(targets.points, cx, cy - r, QUADRANT)
    if (Number.isFinite(cx) && Number.isFinite(cy)) targets.circles.push(cx, cy, r)
    return
  }
  if (profile.kind === 'rect') {
    const [cx, cy] = profile.centerMm
    const halfW = profile.widthMm / 2
    const halfH = profile.heightMm / 2
    pushPoint(targets.points, cx, cy, CENTRE)
    pushRing(
      targets,
      [
        [cx - halfW, cy - halfH],
        [cx + halfW, cy - halfH],
        [cx + halfW, cy + halfH],
        [cx - halfW, cy + halfH],
      ],
      true,
    )
    return
  }
  if (profile.kind === 'polygon') {
    const [cx, cy] = profile.centerMm
    pushPoint(targets.points, cx, cy, CENTRE)
    const sides = Math.max(3, Math.round(profile.sides))
    if (!Number.isFinite(sides)) return
    const start = (profile.rotationDeg * Math.PI) / 180
    /** @type {number[][]} */
    const ring = []
    for (let index = 0; index < sides; index += 1) {
      const angle = start + (index / sides) * Math.PI * 2
      ring.push([cx + profile.radiusMm * Math.cos(angle), cy + profile.radiusMm * Math.sin(angle)])
    }
    pushRing(targets, ring, true)
    return
  }
  pushRing(targets, profile.pointsMm, profile.closed)
}

/**
 * The snap targets of a slice's outlines, minus the one being drawn or edited.
 *
 * Build this once per change of the slice's outlines, not per pointer move.
 *
 * @param {readonly Profile[]} profiles The active slice's outlines.
 * @param {string} [excludeProfileId] The outline being drawn or edited — never snapped to.
 * @param {{ keepFirstVertex?: boolean }} [options] `keepFirstVertex`: the excluded outline is a
 *   live Line chain, whose **first** point stays a vertex target once it has 3 or more points
 *   — closing the chain is just the vertex tier hitting its own first point.
 * @returns {SnapTargets}
 */
export function snapTargets(profiles, excludeProfileId = '', options = {}) {
  /** @type {SnapTargets} */
  const targets = { points: [], segments: [], circles: [] }
  let others = 0
  for (const profile of profiles) {
    if (profile.id === excludeProfileId && excludeProfileId !== '') {
      if (options.keepFirstVertex && profile.kind === 'polyline' && !profile.closed && profile.pointsMm.length >= 3) {
        pushPoint(targets.points, profile.pointsMm[0][0], profile.pointsMm[0][1], VERTEX)
      }
      continue
    }
    others += 1
    addProfileTargets(targets, profile)
  }
  if (others > 0) targets.points.push(0, 0, ORIGIN)
  return targets
}

/** A result object for {@link snapPoint} to write into, so a caller can reuse one. */
export function createSnapResult() {
  return /** @type {SnapResult} */ ({ pointMm: [0, 0], kind: 'vertex' })
}

/**
 * Snap a point to the best target within `radiusMm`: the highest tier in range, nearest
 * inside that tier.
 *
 * @param {readonly number[]} pointMm The pointer on the sketch plane, sketch-local mm.
 * @param {SnapTargets} targets From {@link snapTargets}.
 * @param {number} radiusMm How far a target may be and still win, mm (inclusive).
 * @param {SnapResult} [out] Written and returned instead of allocating a new result.
 * @returns {SnapResult | null} `null` when nothing is in range.
 */
export function snapPoint(pointMm, targets, radiusMm, out) {
  const px = pointMm[0]
  const py = pointMm[1]
  if (!Number.isFinite(px) || !Number.isFinite(py) || !(radiusMm >= 0)) return null
  let bestTier = 99
  let bestDistance = Infinity
  let bestX = 0
  let bestY = 0
  let bestCode = -1

  const points = targets.points
  for (let at = 0; at < points.length; at += 3) {
    const dx = points[at] - px
    const dy = points[at + 1] - py
    const distance = Math.sqrt(dx * dx + dy * dy)
    if (distance > radiusMm) continue
    const tier = TIER[points[at + 2]]
    if (tier < bestTier || (tier === bestTier && distance < bestDistance)) {
      bestTier = tier
      bestDistance = distance
      bestX = points[at]
      bestY = points[at + 1]
      bestCode = points[at + 2]
    }
  }

  // The edge tier only matters when nothing better (a point target) is in range.
  if (bestTier > TIER[EDGE]) {
    let edgeDistance = Infinity
    const segments = targets.segments
    for (let at = 0; at < segments.length; at += 4) {
      const ax = segments[at]
      const ay = segments[at + 1]
      const dx = segments[at + 2] - ax
      const dy = segments[at + 3] - ay
      const lengthSquared = dx * dx + dy * dy
      let t = lengthSquared > 0 ? ((px - ax) * dx + (py - ay) * dy) / lengthSquared : 0
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const x = ax + t * dx
      const y = ay + t * dy
      const distance = Math.sqrt((x - px) * (x - px) + (y - py) * (y - py))
      if (distance <= radiusMm && distance < edgeDistance) {
        edgeDistance = distance
        bestX = x
        bestY = y
        bestCode = EDGE
      }
    }
    const circles = targets.circles
    for (let at = 0; at < circles.length; at += 3) {
      const cx = circles[at]
      const cy = circles[at + 1]
      const r = circles[at + 2]
      const fromCentre = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy))
      // On the centre itself every rim point is equally near; the centre tier covers it.
      if (fromCentre === 0) continue
      const distance = Math.abs(fromCentre - r)
      if (distance <= radiusMm && distance < edgeDistance) {
        edgeDistance = distance
        bestX = cx + ((px - cx) / fromCentre) * r
        bestY = cy + ((py - cy) / fromCentre) * r
        bestCode = EDGE
      }
    }
  }

  if (bestCode < 0) return null
  const result = out ?? createSnapResult()
  result.pointMm[0] = bestX
  result.pointMm[1] = bestY
  result.kind = KINDS[bestCode]
  return result
}
