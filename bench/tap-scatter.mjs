// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Pure helpers for simulated fingertip taps (`TODO/testing-031`): a seeded Gaussian scatter around an
 * aim point and a hit/miss tally. The browser driving (trusted touch events through CDP
 * `Input.dispatchTouchEvent`, `document.elementFromPoint` to see what a tap lands on) stays in the
 * caller, so these stay testable in plain Node.
 */

/**
 * Millimetres on a 96 dpi CSS pixel grid.
 * @param {number} mm
 * @returns {number} CSS pixels
 */
export function mmToCssPx(mm) {
  return (mm * 96) / 25.4
}

/**
 * A small seeded generator (mulberry32), so a run can be repeated.
 * @param {number} seed
 * @returns {() => number} uniform in [0, 1)
 */
export function seededRng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * `n` taps scattered with an isotropic Gaussian of standard deviation `sigmaPx` around `aim`.
 * @param {{x: number, y: number}} aim CSS px
 * @param {number} sigmaPx CSS px per axis
 * @param {number} n
 * @param {() => number} rng uniform [0, 1)
 * @returns {{x: number, y: number}[]} CSS px
 */
export function scatterTaps(aim, sigmaPx, n, rng) {
  const out = []
  for (let i = 0; i < n; i++) {
    if (sigmaPx === 0) {
      out.push({ x: aim.x, y: aim.y })
      continue
    }
    const r = Math.sqrt(-2 * Math.log(1 - rng()))
    const th = 2 * Math.PI * rng()
    out.push({ x: aim.x + sigmaPx * r * Math.cos(th), y: aim.y + sigmaPx * r * Math.sin(th) })
  }
  return out
}

/**
 * Count hits on the intended target and group the misses by what they landed on.
 * @param {(string|null)[]} landed what each tap landed on (a name, or null for nothing)
 * @param {string} intended
 * @returns {{n: number, hits: number, hitRate: number, misses: Record<string, number>}}
 */
export function tally(landed, intended) {
  const misses = {}
  let hits = 0
  for (const l of landed) {
    if (l === intended) hits++
    else {
      const k = l ?? '(nothing)'
      misses[k] = (misses[k] ?? 0) + 1
    }
  }
  return { n: landed.length, hits, hitRate: landed.length ? hits / landed.length : 0, misses }
}
