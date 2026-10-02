// SPDX-License-Identifier: AGPL-3.0-or-later
/*
 * Dev-only fixture generator — NOT part of the app, NOT imported by src/.
 *
 * Runs the *real* JSCAD V1 `jscad-hardware` `Hardware.Washer()` under Node and records
 * the bounding box and volume it produces per part, so `hardware.washer.spec.js` can
 * diff the V3 recipe against measured V1 output instead of against a source-reading
 * guess (TODO/core-011 goal; mirrors `scripts/generate-v1-nut-fixture.cjs`,
 * TODO/core-010, and `scripts/generate-v1-bolt-fixture.cjs`, TODO/core-001 goal 5).
 *
 * This only covers `ImperialWashers` — there is no `MetricWashers` table in V1 to call
 * `Hardware.Washer()` against at all (see `tables/washer-specs.js`'s module doc), so
 * the metric sizes have no fixture here and are instead checked directly against the
 * published ISO 7089 values in `hardware.washer.spec.js`.
 *
 * Run with:  node scripts/generate-v1-washer-fixture.cjs
 * Output:    src/core/kernel/recipes/__fixtures__/hardware.washer.v1-reference.json
 *
 * ── Why this file is CommonJS and does surgery on node_modules source ──────────
 * See `generate-v1-bolt-fixture.cjs`'s own header for the full four-point
 * explanation of why `jscad-hardware@1.1.0`/`jscad-utils@3.2.0` need patching to run
 * standalone under Node — identical here, since `Hardware.Washer` runs through the
 * same `Parts.Tube`/`Parts.Cylinder` → `util.defaults` → `CAG.fromPoints` call path
 * `Hardware.Nut`'s hexagon does. This script duplicates that setup rather than
 * importing it, matching the one-generator-per-recipe convention `TODO/core-010` and
 * `TODO/core-011` both ask for: none of this is app code, so a shared helper module
 * would be one more thing living outside `src/` for no runtime benefit.
 *
 * `.color()` is V1's real one (TODO/core-026), same as the bolt/nut generators, so
 * each part's colour is recorded alongside its dimensions — `.color('gray')` on
 * `washer`, `.color('red')` on `clearance`, as measured rather than as read.
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
  'src/core/kernel/recipes/__fixtures__/hardware.washer.v1-reference.json'
)

/** Load `jscad-utils@3.2.0` with the three packaging defects above patched out. */
function loadPatchedJscadUtils() {
  const entry = require.resolve('jscad-utils', { paths: [REPO_ROOT] })
  const source = fs
    .readFileSync(entry, 'utf8')
    // (2) un-break util.defaults, which Parts.Cylinder/Tube depend on
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
  // not the repo root — see the bolt generator's identical comment for why.
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
  const ImperialWashers = loadJscadScript(
    'node_modules/jscad-hardware/imperial.jscad',
    'ImperialWashers',
    { util }
  )

  return { Hardware, washerTables: { ...ImperialWashers } }
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
 * triangulation of every polygon — identical formula to the bolt/nut generators, so
 * every V1↔V3 diff in this project uses the same math.
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

// Both branches of the one real conditional (`if (fit)`), on the same spec, per
// TODO/core-011's Testing section — a `loose`-fit case and a no-`fit` case for
// `ImperialWashers['1/4']`.
const CASES = [
  { spec: '1/4', fit: 'loose' },
  { spec: '1/4', fit: undefined },
]

function main() {
  const { Hardware, washerTables } = setUpV1()

  const cases = CASES.map(({ spec, fit }) => {
    const table = washerTables[spec]
    if (!table) throw new Error(`no V1 washer spec named ${spec}`)
    const group = Hardware.Washer(table, fit)

    const parts = {}
    for (const key of Object.keys(group.parts)) {
      parts[key] = {
        bounds: boundsOf(group.parts[key]),
        volume: volumeOf(group.parts[key]),
        color: colorOf(group.parts[key]),
      }
    }

    return {
      params: { spec, fit: fit ?? null },
      names: group.names,
      parts,
    }
  })

  const fixture = {
    $comment:
      'GENERATED by scripts/generate-v1-washer-fixture.cjs from the real jscad-hardware' +
      ' V1 Hardware.Washer(). Do not hand-edit. All values are millimetres, Z-up. Covers' +
      ' ImperialWashers only — there is no MetricWashers table in V1 to call this' +
      ' against (see src/core/kernel/tables/washer-specs.js). V1 builds the washer with' +
      ' its base on z=0; the V3 recipe centres it instead (see' +
      ' src/core/kernel/recipes/hardware.washer.js), so hardware.washer.spec.js diffs' +
      ' size (bounds[1]-bounds[0] per axis) and volume against this fixture, not raw' +
      ' bounds position.',
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
