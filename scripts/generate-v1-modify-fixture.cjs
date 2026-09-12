/*
 * Dev-only fixture generator — NOT part of the app, NOT imported by src/.
 *
 * Runs the *real* JSCAD V1 `jscad-utils` `util.enlarge()`, `util.fit()` and
 * `util.bisect()` under Node and records the bounding box and volume each produces, so
 * `group.spec.js` can diff the V3 ports in `src/core/kernel/group.js` against measured
 * V1 output instead of against a source-reading guess (TODO/core-019 Testing section;
 * mirrors `scripts/generate-v1-nut-fixture.cjs` / TODO/core-010 and
 * `scripts/generate-v1-washer-fixture.cjs` / TODO/core-011).
 *
 * Run with:  node scripts/generate-v1-modify-fixture.cjs
 * Output:    src/core/kernel/__fixtures__/modify.v1-reference.json
 *
 * ── Why this file exists at all, rather than reading V1's source ───────────────
 * Two of the three ports have a convention that source-reading cannot settle on its
 * own, and getting either backwards is the kind of sign error `TODO/README.md`'s
 * `model: opus` guidance is about:
 *
 *  1. **Which half of a bisect V1 calls `positive`.** V1 builds them as
 *     `negative = object.cutByPlane(plane)` and `positive = object.cutByPlane(
 *     plane.flipped())`, and `cutByPlane`'s own retained-side convention lives in
 *     `@jscad/csg`, not in `jscad-utils`. Only running it answers this.
 *  2. **What `offset` measures from.** `util.getDelta` flips to the max side for a
 *     negative offset (`isNegative` counts `-0`), and treats `undefined` — but not
 *     `0` — as "centre". Three distinct behaviours off one argument.
 *
 * ── Why this file is CommonJS and does surgery on node_modules source ──────────
 * See `generate-v1-bolt-fixture.cjs`'s own header for the full explanation of why
 * `jscad-utils@3.2.0` needs patching to run standalone under Node. Identical here:
 * `util.bisect` reaches `Group` and `util.centroid` through the same frozen-namespace
 * and `depreciated()` paths the hardware recipes do. Every patch is applied to an
 * in-memory copy of the bundle source; nothing on disk is touched.
 *
 * `.color()` is stubbed to identity, same as the bolt/nut/washer generators: this
 * fixture only records dimensions.
 */

'use strict'

const fs = require('fs')
const path = require('path')
const Module = require('module')

const REPO_ROOT = path.resolve(__dirname, '..')
const OUT_PATH = path.join(REPO_ROOT, 'src/core/kernel/__fixtures__/modify.v1-reference.json')

/** Load `jscad-utils@3.2.0` with the packaging defects above patched out. */
function loadPatchedJscadUtils() {
  const entry = require.resolve('jscad-utils', { paths: [REPO_ROOT] })
  const source = fs
    .readFileSync(entry, 'utf8')
    .replace("depreciated('defaults', true,", "depreciated('defaults', false,")
    .replace(/Object\.freeze\(\{/g, '({')

  const mod = new Module(entry, null)
  mod.filename = entry
  mod.paths = Module._nodeModulePaths(path.dirname(entry))
  mod._compile(source, entry)
  return mod.exports
}

function setUpV1() {
  const jscadUtils = loadPatchedJscadUtils()
  const { util, array } = jscadUtils

  const utilsDir = path.dirname(require.resolve('jscad-utils', { paths: [REPO_ROOT] }))
  const { CSG, CAG } = require(require.resolve('@jscad/csg', { paths: [utilsDir] }))

  jscadUtils.init.default(CSG)
  CSG.prototype.color = function color() {
    return this
  }

  util.group = jscadUtils.group
  util.array = array

  globalThis.CSG = CSG
  globalThis.CAG = CAG
  globalThis.util = util

  return { util, CSG }
}

const round = (n) => Number(n.toFixed(9))

/** `[[minX, minY, minZ], [maxX, maxY, maxZ]]` in millimetres, rounded to 1e-9. */
function boundsOf(csg) {
  const [min, max] = csg.getBounds()
  return [
    [round(min._x), round(min._y), round(min._z)],
    [round(max._x), round(max._y), round(max._z)],
  ]
}

/**
 * Signed volume in cubic millimetres, by the divergence theorem over a fan
 * triangulation of every polygon — identical formula to the bolt/nut/washer
 * generators, so every V1↔V3 diff in this project uses the same math.
 */
function volumeOf(csg) {
  let total = 0
  for (const polygon of csg.polygons) {
    const v = polygon.vertices.map((vertex) => [vertex.pos._x, vertex.pos._y, vertex.pos._z])
    for (let i = 1; i < v.length - 1; i++) {
      const [ax, ay, az] = v[0]
      const [bx, by, bz] = v[i]
      const [cx, cy, cz] = v[i + 1]
      total +=
        (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
    }
  }
  return round(total)
}

const measure = (csg) => ({ bounds: boundsOf(csg), volume: volumeOf(csg) })

function main() {
  const { util, CSG } = setUpV1()

  // A deliberately asymmetric, off-origin box: size [10, 20, 30] centred at [1, 2, 3].
  // Nothing about a cube centred on the origin can tell a centroid-preserving scale
  // apart from a plain scale-about-the-origin, which is the whole point of `enlarge`.
  const brick = () => CSG.cube({ center: [1, 2, 3], radius: [5, 10, 15] })
  // V1's own bisect doc-comment example: a 10 mm cube.
  const cube = () => CSG.cube({ center: [0, 0, 0], radius: [5, 5, 5] })

  const enlargeCases = [
    { label: 'mixed grow/hold/shrink deltas', args: [2, 0, -4] },
    { label: 'array form agrees with the three-argument form', args: [[2, 0, -4]] },
    { label: 'uniform positive delta', args: [[3, 3, 3]] },
    // The reason the V3 port adds a guard V1 does not have: a delta more negative
    // than the axis it shrinks produces a *negative* scale factor, which mirrors the
    // solid through its own centroid instead of erroring. Recorded so the spec can
    // cite measured V1 behaviour as the thing being deliberately diverged from.
    { label: 'V1 silently inverts when a delta exceeds the axis size', args: [[-12, 0, 0]] },
  ].map(({ label, args }) => ({
    label,
    args,
    input: measure(brick()),
    result: measure(util.enlarge(brick(), ...args)),
  }))

  const fitCases = [
    { label: 'independent per-axis targets', args: [5, 10, 15] },
    { label: 'keep_aspect_ratio, ratios already equal', args: [5, 10, 15, true] },
    // The pair that actually proves uniform scaling: targets whose three ratios
    // differ (0.5 / 0.25 / 0.1667), so independent and aspect-preserving scaling
    // cannot agree by accident the way the equal-ratio pair above does.
    { label: 'distinct ratios, scaled independently', args: [5, 5, 5] },
    { label: 'distinct ratios, smallest ratio applied to all three', args: [5, 5, 5, true] },
    { label: 'zero is a no-scale sentinel', args: [5, 0, 15] },
    { label: 'keep_aspect_ratio with a zero axis', args: [5, 0, 15, true] },
    // `fitRatio` returns 1 for a zero target, and that 1 is still a candidate for
    // `array.min` — so a zero axis can hold the uniform factor at 1 and leave the
    // other axes' real targets unmet. A V1 quirk, pinned rather than smoothed over.
    { label: "a zero axis's sentinel 1 can win the keep_aspect_ratio min", args: [15, 0, 60, true] },
  ].map(({ label, args }) => ({
    label,
    args,
    input: measure(brick()),
    result: measure(util.fit(brick(), ...args)),
  }))

  const bisectCases = [
    { label: "V1's own doc example: 10mm cube, offset 2", args: ['z', 2] },
    { label: 'negative offset measures from the max side', args: ['z', -2] },
    { label: 'undefined offset cuts at the centre', args: ['z'] },
    { label: 'zero offset cuts at the min face', args: ['z', 0] },
    { label: 'negative zero cuts at the max face', args: ['z', -0] },
    { label: 'another axis', args: ['x', 3] },
    { label: 'cut plane entirely past the max bound', args: ['z', 20] },
  ].map(({ label, args }) => {
    const group = util.bisect(cube(), ...args)
    const parts = {}
    for (const key of Object.keys(group.parts)) parts[key] = measure(group.parts[key])
    return {
      label,
      // `-0` does not survive JSON (`JSON.stringify(-0) === '0'`), which is itself a
      // finding the port has to state — see group.js's `bisect` doc comment.
      args: args.map((a) => (Object.is(a, -0) ? '-0' : a)),
      input: measure(cube()),
      names: group.names,
      parts,
    }
  })

  const fixture = {
    $comment:
      'GENERATED by scripts/generate-v1-modify-fixture.cjs from the real jscad-utils V1' +
      ' util.enlarge / util.fit / util.bisect. Do not hand-edit. All values are' +
      ' millimetres, Z-up. `bounds` is [[minX,minY,minZ],[maxX,maxY,maxZ]]; `volume` is' +
      ' signed mm^3 by the divergence theorem, the same formula every other V1 fixture in' +
      ' this project uses. The V3 ports in src/core/kernel/group.js are diffed against' +
      ' this in group.spec.js.',
    source: {
      'jscad-utils': require(require.resolve('jscad-utils/package.json', { paths: [REPO_ROOT] }))
        .version,
    },
    enlarge: enlargeCases,
    fit: fitCases,
    bisect: bisectCases,
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(fixture, null, 2)}\n`)
  // eslint-disable-next-line no-console
  console.log(`wrote ${path.relative(REPO_ROOT, OUT_PATH)}`)
}

main()
