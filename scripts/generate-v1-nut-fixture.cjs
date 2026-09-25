/*
 * Dev-only fixture generator — NOT part of the app, NOT imported by src/.
 *
 * Runs the *real* JSCAD V1 `jscad-hardware` `Hardware.Nut()` under Node and records
 * the bounding box and volume it produces, so `hardware.nut.spec.js` can diff the V3
 * recipe against measured V1 output instead of against a source-reading guess
 * (TODO/core-010 goal; mirrors `scripts/generate-v1-bolt-fixture.cjs`, TODO/core-001
 * goal 5).
 *
 * Run with:  node scripts/generate-v1-nut-fixture.cjs
 * Output:    src/core/kernel/recipes/__fixtures__/hardware.nut.v1-reference.json
 *
 * ── Why this file is CommonJS and does surgery on node_modules source ──────────
 * See `generate-v1-bolt-fixture.cjs`'s own header for the full four-point
 * explanation of why `jscad-hardware@1.1.0`/`jscad-utils@3.2.0` need patching to
 * run standalone under Node — identical here, since `Hardware.Nut` runs through
 * the same `Parts.Hexagon` → `util.defaults` → `CAG.fromPoints` call path
 * `Hardware.Bolt`'s head does. This script duplicates that setup rather than
 * importing it, matching the one-generator-per-recipe convention `TODO/core-010`
 * and `TODO/core-011` both ask for (`scripts/generate-v1-washer-fixture.cjs`,
 * once it exists, will duplicate it a third time for the same reason: none of
 * this is app code, so a shared helper module would be one more thing living
 * outside `src/` for no runtime benefit).
 *
 * `.color()` is V1's real one (TODO/core-026), same as the bolt generator, so the
 * fixture also records the colour V1 leaves on the nut: none — `Hardware.Nut` never
 * calls `.color()`, and the recorded `null` is what says so.
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
  'src/core/kernel/recipes/__fixtures__/hardware.nut.v1-reference.json'
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
  // metric.jscad declares MetricBolts/MetricScrews/MetricNuts as three separate
  // `var`s in one file; loading it once per global name just re-evaluates the
  // whole file and reads back a different one of the three — cheap, and it keeps
  // this script from needing its own copy of the file-parsing logic.
  const MetricNuts = loadJscadScript('node_modules/jscad-hardware/metric.jscad', 'MetricNuts', {
    util,
  })
  const ImperialNuts = loadJscadScript(
    'node_modules/jscad-hardware/imperial.jscad',
    'ImperialNuts',
    { util }
  )

  return { Hardware, nutTables: { ...MetricNuts, ...ImperialNuts } }
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
 * triangulation of every polygon — identical formula to the bolt generator's
 * `volumeOf`, so both sides of every V1↔V3 diff in this project use the same math.
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

// One case per spec table (`MetricNuts['m4']`, `ImperialNuts['1/4 hex']`), per
// `TODO/core-010`'s Testing section, plus a `tap` case on `m4` — tap is the one
// fit class with a *negative* clearance delta, and the only way to be sure the
// recipe's `entry.acrossCornersMm + FIT_CLEARANCE_MM[fit]` arithmetic actually
// shrinks the diameter rather than assuming it does is to diff it against V1 too.
const CASES = [
  { spec: 'm4', fit: 'loose' },
  { spec: 'm4', fit: 'tap' },
  { spec: '1/4 hex', fit: 'close' },
]

function main() {
  const { Hardware, nutTables } = setUpV1()

  const cases = CASES.map(({ spec, fit }) => {
    const table = nutTables[spec]
    if (!table) throw new Error(`no V1 nut spec named ${spec}`)
    // Hardware.Nut(nut, fit) takes the bare [F, C, H, D] tuple directly — it is
    // not a named-field object the way MetricBolts' entries are.
    const csg = Hardware.Nut(table, fit)

    return {
      params: { spec, fit },
      bounds: boundsOf(csg),
      color: colorOf(csg),
      volume: volumeOf(csg),
    }
  })

  const fixture = {
    $comment:
      'GENERATED by scripts/generate-v1-nut-fixture.cjs from the real jscad-hardware' +
      ' V1 Hardware.Nut(). Do not hand-edit. All values are millimetres, Z-up. V1' +
      ' builds the nut with its base on z=0; the V3 recipe centres it instead (see' +
      ' src/core/kernel/recipes/hardware.nut.js), so hardware.nut.spec.js diffs' +
      ' size (bounds[1]-bounds[0] per axis) and volume against this fixture, not' +
      ' raw bounds position.',
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
