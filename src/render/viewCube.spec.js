// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { STANDARD_VIEWS, positionFromSpherical, rightFromSpherical, upFromSpherical } from './camera.js'
import { FACING_EPSILON, VIEW_CUBE_FACES, cubeMatrix, faceTransforms, facingFaces, isFacing } from './viewCube.js'

/**
 * The view cube's maths (`TODO/ui-158`). A world direction `v` lands at CSS screen `(R·v, −U·v)` with
 * depth `C·v` (toward the viewer), where R, U and C are `camera.js`'s right, up and to-camera vectors.
 * Every sign here is an easy slip (WarpCad1's `render-008` turned the cube *with* the camera), so the
 * views are pinned one by one.
 */

/** @type {string[]} */
const FACE_NAMES = VIEW_CUBE_FACES.map((f) => f.view)
const SIX = ['top', 'bottom', 'front', 'back', 'left', 'right']

/** @param {number} az @param {number} el @returns {string[]} the faces marked facing, sorted */
function facingAt(az, el) {
  const depths = facingFaces(az, el, new Float64Array(6))
  return FACE_NAMES.filter((_, i) => isFacing(depths[i])).sort()
}

/**
 * Project a world point through the cube matrix: [screenX, screenY(down), depth].
 * @param {Float64Array} m
 * @param {ArrayLike<number>} p
 * @returns {number[]}
 */
function project(m, p) {
  return [m[0] * p[0] + m[1] * p[1] + m[2] * p[2], m[3] * p[0] + m[4] * p[1] + m[5] * p[2], m[6] * p[0] + m[7] * p[1] + m[8] * p[2]]
}

describe('the six faces', () => {
  it('are the six standard views, each an outward unit normal with an orthonormal in-plane frame', () => {
    expect([...FACE_NAMES].sort()).toEqual([...SIX].sort())
    for (const face of VIEW_CUBE_FACES) {
      const [n, u, w] = [face.normal, face.u, face.w]
      /** @param {ArrayLike<number>} a @param {ArrayLike<number>} b */
      const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
      expect(dot(n, n)).toBe(1)
      expect(dot(u, u)).toBe(1)
      expect(dot(w, w)).toBe(1)
      expect(dot(n, u)).toBe(0)
      expect(dot(n, w)).toBe(0)
      expect(dot(u, w)).toBe(0)
      // The face's normal is where the camera sits for its view.
      const pos = positionFromSpherical(STANDARD_VIEWS[face.view].azimuthDeg, STANDARD_VIEWS[face.view].elevationDeg, 1, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })
      expect(pos.x).toBeCloseTo(n[0], 9)
      expect(pos.y).toBeCloseTo(n[1], 9)
      expect(pos.z).toBeCloseTo(n[2], 9)
      expect(face.title.length).toBeGreaterThan(0)
    }
  })
})

describe('facingFaces', () => {
  it('at Home shows exactly Top, Front and Right', () => {
    const { azimuthDeg, elevationDeg } = STANDARD_VIEWS.home
    expect(facingAt(azimuthDeg, elevationDeg)).toEqual(['front', 'right', 'top'])
  })

  it.each(SIX)('at the %s view exactly that face has depth > 0, the rest within 1e-9 of 0 or below', (view) => {
    const { azimuthDeg, elevationDeg } = STANDARD_VIEWS[view]
    const depths = facingFaces(azimuthDeg, elevationDeg, new Float64Array(6))
    expect(facingAt(azimuthDeg, elevationDeg)).toEqual([view])
    const i = FACE_NAMES.indexOf(view)
    expect(depths[i]).toBeCloseTo(1, 9)
    for (let j = 0; j < 6; j++) if (j !== i) expect(depths[j]).toBeLessThanOrEqual(FACING_EPSILON)
  })

  it.each([-180, -135, -90, -30, 0, 45, 90, 170])('at either pole, azimuth %d, the four side faces sit at depth 0 and none is facing', (az) => {
    /** @type {[number, string][]} */
    const poles = [[90, 'top'], [-90, 'bottom']]
    for (const [el, face] of poles) {
      const depths = facingFaces(az, el, new Float64Array(6))
      for (const side of ['front', 'back', 'left', 'right']) expect(Math.abs(depths[FACE_NAMES.indexOf(side)])).toBeLessThanOrEqual(FACING_EPSILON)
      expect(facingAt(az, el)).toEqual([face])
    }
  })

  it('swaps Front for Back as the camera swings round behind the part', () => {
    expect(facingAt(135, 35)).toEqual(['back', 'left', 'top'])
    expect(facingAt(45, -35)).toEqual(['back', 'bottom', 'right'])
  })

  it('writes into the caller-owned array and returns it (no allocation per call)', () => {
    const out = new Float64Array(6)
    expect(facingFaces(10, 20, out)).toBe(out)
  })
})

describe('cubeMatrix', () => {
  it('has camera.js basis rows: right, negated up, to-camera', () => {
    const m = cubeMatrix(-30, 25, new Float64Array(9))
    const r = rightFromSpherical(-30, 25, { x: 0, y: 0, z: 0 })
    const u = upFromSpherical(-30, 25, { x: 0, y: 0, z: 0 })
    const c = positionFromSpherical(-30, 25, 1, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })
    const expected = [r.x, r.y, r.z, -u.x, -u.y, -u.z, c.x, c.y, c.z]
    for (let i = 0; i < 9; i++) expect(m[i]).toBeCloseTo(expected[i], 9)
  })

  it('at Top, +X runs right and +Y runs up the screen', () => {
    const m = cubeMatrix(STANDARD_VIEWS.top.azimuthDeg, STANDARD_VIEWS.top.elevationDeg, new Float64Array(9))
    const x = project(m, [1, 0, 0])
    const y = project(m, [0, 1, 0])
    const z = project(m, [0, 0, 1])
    ;[1, 0, 0].forEach((v, i) => expect(x[i]).toBeCloseTo(v, 9))
    ;[0, -1, 0].forEach((v, i) => expect(y[i]).toBeCloseTo(v, 9))
    ;[0, 0, 1].forEach((v, i) => expect(z[i]).toBeCloseTo(v, 9))
  })

  it('at Front, +X runs right, +Z runs up and −Y faces the viewer', () => {
    const m = cubeMatrix(STANDARD_VIEWS.front.azimuthDeg, STANDARD_VIEWS.front.elevationDeg, new Float64Array(9))
    ;[1, 0, 0].forEach((v, i) => expect(project(m, [1, 0, 0])[i]).toBeCloseTo(v, 9))
    ;[0, -1, 0].forEach((v, i) => expect(project(m, [0, 0, 1])[i]).toBeCloseTo(v, 9))
    ;[0, 0, 1].forEach((v, i) => expect(project(m, [0, -1, 0])[i]).toBeCloseTo(v, 9))
  })

  it('at Right, +Y runs right and +Z runs up', () => {
    const m = cubeMatrix(STANDARD_VIEWS.right.azimuthDeg, STANDARD_VIEWS.right.elevationDeg, new Float64Array(9))
    ;[1, 0, 0].forEach((v, i) => expect(project(m, [0, 1, 0])[i]).toBeCloseTo(v, 9))
    ;[0, -1, 0].forEach((v, i) => expect(project(m, [0, 0, 1])[i]).toBeCloseTo(v, 9))
  })

  it('at Home, the corner nearest the viewer sits at the centre with +Z straight up the screen', () => {
    const { azimuthDeg, elevationDeg } = STANDARD_VIEWS.home
    const m = cubeMatrix(azimuthDeg, elevationDeg, new Float64Array(9))
    // The (+X, −Y, +Z) corner points straight at the camera: it projects onto the centre.
    const near = project(m, [1, -1, 1])
    expect(near[0]).toBeCloseTo(0, 9)
    expect(near[1]).toBeCloseTo(0, 9)
    expect(near[2]).toBeCloseTo(Math.sqrt(3), 9)
    const z = project(m, [0, 0, 1])
    expect(z[0]).toBeCloseTo(0, 9)
    expect(z[1]).toBeLessThan(0)
  })

  it('turns against the camera: orbiting the camera to +az swings +X to the left (render-008)', () => {
    const a = project(cubeMatrix(0, 0, new Float64Array(9)), [1, 0, 0])
    const b = project(cubeMatrix(30, 0, new Float64Array(9)), [1, 0, 0])
    // Camera on +X looks at +X face-on; orbiting the camera counter-clockwise (seen from above) carries
    // the +X axis toward screen-left, as the main view shows it.
    expect(a[0]).toBeCloseTo(0, 9)
    expect(b[0]).toBeLessThan(0)
  })
})

describe('faceTransforms', () => {
  it('is the identity at each face\'s own view, centred in the box', () => {
    const out = new Float64Array(36)
    for (const view of SIX) {
      const { azimuthDeg, elevationDeg } = STANDARD_VIEWS[view]
      faceTransforms(azimuthDeg, elevationDeg, out)
      const i = FACE_NAMES.indexOf(view) * 6
      const [a, b, c, d, tx, ty] = out.subarray(i, i + 6)
      expect(Math.abs(a * d - b * c)).toBeCloseTo(1, 9)
      expect(Math.abs(a) + Math.abs(b)).toBeCloseTo(1, 9)
      expect(tx).toBeCloseTo(0, 9)
      expect(ty).toBeCloseTo(0, 9)
    }
  })

  it('puts every face corner where the cube matrix projects it', () => {
    const out = new Float64Array(36)
    for (const [az, el] of [[-45, 35.26], [120, -20], [10, 80], [-170, 5]]) {
      faceTransforms(az, el, out)
      const m = cubeMatrix(az, el, new Float64Array(9))
      VIEW_CUBE_FACES.forEach((face, k) => {
        const [a, b, c, d, tx, ty] = out.subarray(k * 6, k * 6 + 6)
        for (const [lx, ly] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
          // In side lengths: a local point (lx, ly) on the face is world n/2 + u·lx + w·ly.
          const world = [0, 1, 2].map((i) => face.normal[i] / 2 + face.u[i] * lx + face.w[i] * ly)
          const [sx, sy] = project(m, world)
          expect(a * lx + c * ly + tx).toBeCloseTo(sx, 9)
          expect(b * lx + d * ly + ty).toBeCloseTo(sy, 9)
        }
      })
    }
  })

  it('collapses an edge-on face to zero area', () => {
    const out = new Float64Array(36)
    faceTransforms(STANDARD_VIEWS.front.azimuthDeg, STANDARD_VIEWS.front.elevationDeg, out)
    const k = FACE_NAMES.indexOf('top') * 6
    expect(out[k] * out[k + 3] - out[k + 1] * out[k + 2]).toBeCloseTo(0, 9)
  })

  it('writes into the caller-owned array and returns it', () => {
    const out = new Float64Array(36)
    expect(faceTransforms(0, 0, out)).toBe(out)
  })
})
