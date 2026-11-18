// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Tap resolution for the orientation dial (`TODO/ui-134`). Neighbouring axis caps overlap in some
 * orientations, and the browser gives an overlap to the topmost box, so a fingertip aimed at one cap
 * fired another. The nearest cap centre is the better guess at what the finger aimed at.
 */

/** Cap centre offset from the dial centre, as a fraction of the dial's width, per unit of projection. */
export const CAP_RADIUS_FRACTION = 0.34

/**
 * The view of the cap whose centre is nearest a tap.
 * @param {ReadonlyArray<{view: string, x: number, y: number, depth: number}>} caps `x` and `y` are
 *   the projected axis in [-1, 1] (screen y down), `depth` positive toward the viewer
 * @param {number} dialPx the dial's width in CSS px
 * @param {{x: number, y: number}} tapPx the tap in CSS px from the dial's top-left corner
 * @returns {string | null} a view name, or null when the tap is outside the dial or there are no caps
 */
export function nearestCapView(caps, dialPx, tapPx) {
  if (tapPx.x < 0 || tapPx.y < 0 || tapPx.x > dialPx || tapPx.y > dialPx) return null
  const half = dialPx / 2
  let best = null
  let bestD = Infinity
  let bestDepth = -Infinity
  for (const cap of caps) {
    const dx = tapPx.x - (half + cap.x * dialPx * CAP_RADIUS_FRACTION)
    const dy = tapPx.y - (half + cap.y * dialPx * CAP_RADIUS_FRACTION)
    const d = Math.hypot(dx, dy)
    if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && cap.depth > bestDepth)) {
      best = cap.view
      bestD = d
      bestDepth = cap.depth
    }
  }
  return best
}
