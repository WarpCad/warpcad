// SPDX-License-Identifier: AGPL-3.0-or-later
/*
 * Dev-only fixture generator — NOT part of the app, NOT imported by src/.
 *
 * Runs the *real* JSCAD V1 `jscad-hardware` `Hardware.Bolt()` under Node and records
 * the per-part bounding boxes it produces, so `hardware.bolt.spec.js` can diff the V3
 * recipe against measured V1 output instead of against a source-reading guess
 * (TODO/core-001 goal 5; `Initial design.md` §11's flagged fidelity risk).
 *
 * Run with:  node scripts/generate-v1-bolt-fixture.cjs
 * Output:    src/core/kernel/recipes/__fixtures__/hardware.bolt.v1-reference.json
 *
 * ── Why this file is CommonJS and does surgery on node_modules source ──────────
 * `jscad-hardware@1.1.0` and `jscad-utils@3.2.0` are 2022-vintage OpenJSCAD V1
 * libraries. They still *run* standalone (which is what this script proves) but they
 * are not importable as-is from an ESM project, for four separate reasons:
 *
 *   1. `jscad-hardware`'s entry point is `jscad-hardware.jscad` — a bare script that
 *      assigns an undeclared global `Hardware` and expects ambient `util`/`Parts`
 *      globals injected by the OpenJSCAD page loader. It is not a module at all, so
 *      it is loaded here by reading the text and wrapping it in a `Function` whose
 *      parameters supply those ambient globals. (This is a build-time fixture step,
 *      never the app's replay path — `Initial design.md` §3's "no eval in the replay
 *      path" property is unaffected.)
 *   2. `jscad-utils@3.2.0` — the version `jscad-hardware`'s `^3.1.2` range resolves
 *      to — made `util.defaults()` throw ("depreciated"), which breaks its own
 *      `Parts.Cylinder`, and therefore every `Hardware.*` factory. In `3.1.2` it was
 *      a plain `Object.assign`. The published 3.2.0 bundle is simply broken for this
 *      call path, so the throw is downgraded to a warning in the loaded text below.
 *   3. `3.2.0` also dropped `util.group` and `util.array` from the `util` namespace
 *      (they became sibling exports), while its own `src/parts.js` still calls
 *      `util.group(...)`. The namespaces are `Object.freeze`d in the bundle, so the
 *      freeze is removed in the loaded text and the two members are re-attached.
 *   4. `src/group.js` calls a bare `union(...)` and `instanceof CSG`, both of which
 *      were ambient globals in the OpenJSCAD runtime. They are set on `globalThis`.
 *
 * `.color()` is V1's real one, loaded from `jscad-utils-color.jscad` (TODO/core-026).
 * It has no effect on geometry, but it is what V1 draws each part in, so every part's
 * colour is recorded alongside its dimensions. The `combined` solid gets none: it
 * mixes the head's gray with the thread's silver and the tap's red.
 *
 * None of the above touches files on disk; every patch is applied to an in-memory
 * copy of the bundle source.
 */

'use strict'

const fs = require('fs')
const path = require('path')
const Module = require('module')

const REPO_ROOT = path.resolve(__dirname, '..')
const OUT_PATH = path.join(
  REPO_ROOT,
  'src/core/kernel/recipes/__fixtures__/hardware.bolt.v1-reference.json'
)

/** Load `jscad-utils@3.2.0` with the three packaging defects above patched out. */
function loadPatchedJscadUtils() {
  const entry = require.resolve('jscad-utils', { paths: [REPO_ROOT] })
  const source = fs
    .readFileSync(entry, 'utf8')
    // (2) un-break util.defaults, which Parts.Cylinder/Hexagon depend on
    .replace("depreciated('defaults', true,", "depreciated('defaults', false,")
    // (3) let the util namespace accept the members 3.2.0 forgot to keep on it
    .replace(/Object\.freeze\(\{/g, '({')

  const mod = new Module(entry, null)
  mod.filename = entry
  mod.paths = Module._nodeModulePaths(path.dirname(entry))
  mod._compile(source, entry)
  return mod.exports
}

/** Evaluate one ambient-global `.jscad` script and return the named global it defines. */
function loadJscadScript(relativePath, globalName, scope) {
  const source = fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8')
  const body = `var ${globalName};\n${source}\nreturn ${globalName};`
  const names = Object.keys(scope)
  // eslint-disable-next-line no-new-func
  return new Function(...names, body)(...names.map((n) => scope[n]))
}

function setUpV1() {
  const jscadUtils = loadPatchedJscadUtils()
  const { util, parts: Parts, array } = jscadUtils

  // Resolve `@jscad/csg` and `@jscad/scad-api` from *jscad-utils' own* module paths,
  // not the repo root. jscad-utils pins `@jscad/csg@^0.3.7`; whether that lands
  // hoisted or nested depends on what else the repo depends on, and loading a
  // different copy than the library itself uses silently breaks everything —
  // `init.default(CSG)` would patch a `CSG` class that `Parts.Cylinder` never
  // instantiates, and every prototype method added below would be missing at runtime.
  const utilsDir = path.dirname(require.resolve('jscad-utils', { paths: [REPO_ROOT] }))
  const { CSG, CAG } = require(require.resolve('@jscad/csg', { paths: [utilsDir] }))
  const scadApi = require(require.resolve('@jscad/scad-api', { paths: [utilsDir] }))

  jscadUtils.init.default(CSG)
  // TODO/core-026: V1's real `.color()`, from its own `jscad-utils-color.jscad` loaded
  // verbatim, not an identity stub, so the fixture records the colour V1 actually
  // leaves on each part (`colorOf` below) alongside the dimensions.
  const Colors = loadJscadScript('node_modules/jscad-utils/jscad-utils-color.jscad', 'Colors', {})
  Colors.init(CSG)

  util.group = jscadUtils.group
  util.array = array

  // (4) the ambient globals the OpenJSCAD page loader used to inject. The bundle's
  // own src/parts.js and src/group.js still reference `util`, `Parts`, `CSG` and
  // `union` as free variables, so a plain `require()` of the package cannot work.
  globalThis.CSG = CSG
  globalThis.CAG = CAG
  globalThis.util = util
  globalThis.Parts = Parts
  globalThis.union = scadApi.booleanOps.union

  const Hardware = loadJscadScript(
    'node_modules/jscad-hardware/jscad-hardware.jscad',
    'Hardware',
    { util, Parts, CSG, CAG }
  )
  const MetricBolts = loadJscadScript(
    'node_modules/jscad-hardware/metric.jscad',
    'MetricBolts',
    { util }
  )
  const ImperialBolts = loadJscadScript(
    'node_modules/jscad-hardware/imperial.jscad',
    'ImperialBolts',
    { util }
  )

  return { Hardware, boltTables: { ...MetricBolts, ...ImperialBolts } }
}

/**
 * The colour V1 left on a solid, as `[r, g, b, a]` in 0-1, or `null` when V1 never
 * coloured it — read off every polygon's `shared.color`, which is where V1's
 * `setColor` puts it (TODO/core-026). Throws if the polygons disagree: one colour per
 * part is what a V3 op record can carry, so a mixed part must fail loudly here rather
 * than be summarised.
 */
function colorOf(csg) {
  const seen = new Set(
    csg.polygons.map((polygon) => JSON.stringify((polygon.shared && polygon.shared.color) || null))
  )
  if (seen.size !== 1) throw new Error(`solid carries ${seen.size} colours: ${[...seen].join(' ')}`)
  return JSON.parse([...seen][0])
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
 * triangulation of every polygon. Deliberately written out rather than taken from a
 * library call so the V1 and V3 sides of the diff use the identical formula —
 * `@jscad/csg` has no `getVolume()` and `@jscad/modeling`'s `measureVolume` would
 * otherwise be comparing itself to nothing.
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

// `resolution` (V1) and `segments` (V3) are the same concept under different names.
// Their defaults happen to agree for cylinders: `CSG.cylinder` reads
// `defaultResolution2D` (32 — see the FIXME at @jscad/csg src/primitives3d.js:198,
// it is NOT the 12 of `defaultResolution3D` the name suggests) and
// `@jscad/modeling`'s `cylinder` also defaults to 32 segments. Recorded explicitly so
// the volume comparison in hardware.bolt.spec.js is a like-for-like tessellation and
// not an accident that a future default change would silently break.
const V1_CYLINDER_SEGMENTS = 32

const CASES = [
  { spec: 'm10 hex', length: 20, fit: 'loose' },
  { spec: '1/4 socket', length: 12, fit: 'close' },
]

function main() {
  const { Hardware, boltTables } = setUpV1()

  const cases = CASES.map(({ spec, length, fit }) => {
    const table = boltTables[spec]
    if (!table) throw new Error(`no V1 bolt spec named ${spec}`)
    const bolt = Hardware.Bolt(length, { name: spec, ...table }, fit)

    const parts = {}
    for (const key of Object.keys(bolt.parts)) {
      parts[key] = {
        bounds: boundsOf(bolt.parts[key]),
        volume: volumeOf(bolt.parts[key]),
        color: colorOf(bolt.parts[key]),
      }
    }

    const combined = bolt.combine()
    return {
      params: { spec, length, fit, segments: V1_CYLINDER_SEGMENTS },
      names: bolt.names,
      parts,
      combined: { bounds: boundsOf(combined), volume: volumeOf(combined) },
    }
  })

  const fixture = {
    $comment:
      'GENERATED by scripts/generate-v1-bolt-fixture.cjs from the real jscad-hardware' +
      ' V1 Hardware.Bolt(). Do not hand-edit. All values are millimetres, Z-up.',
    source: {
      'jscad-hardware': require(
        require.resolve('jscad-hardware/package.json', { paths: [REPO_ROOT] })
      ).version,
      'jscad-utils': require(
        require.resolve('jscad-utils/package.json', { paths: [REPO_ROOT] })
      ).version,
    },
    cases,
  }

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(fixture, null, 2)}\n`)
  // eslint-disable-next-line no-console
  console.log(`wrote ${path.relative(REPO_ROOT, OUT_PATH)}`)
}

main()
