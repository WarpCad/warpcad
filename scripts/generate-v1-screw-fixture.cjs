// SPDX-License-Identifier: AGPL-3.0-or-later
/*
 * Dev-only fixture generator — NOT part of the app, NOT imported by src/.
 *
 * Runs the *real* JSCAD V1 `jscad-hardware` `Hardware.Screw.PanHead()` /
 * `Hardware.Screw.FlatHead()` under Node and records every part's bounding box, volume
 * and colour, so `hardware.screw.spec.js` can diff the V3 recipe against measured V1
 * output instead of a source-reading guess (TODO/core-027; mirrors
 * `generate-v1-bolt-fixture.cjs` / `generate-v1-nut-fixture.cjs`, whose headers explain
 * why `jscad-hardware@1.1.0`/`jscad-utils@3.2.0` need the in-memory patches below).
 *
 * Run with:  node scripts/generate-v1-screw-fixture.cjs
 * Output:    src/core/kernel/recipes/__fixtures__/hardware.screw.v1-reference.json
 */

'use strict'

const fs = require('fs')
const path = require('path')
const Module = require('module')

const REPO_ROOT = path.resolve(__dirname, '..')
const OUT_PATH = path.join(
  REPO_ROOT,
  'src/core/kernel/recipes/__fixtures__/hardware.screw.v1-reference.json'
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
  const MetricScrews = loadJscadScript('node_modules/jscad-hardware/metric.jscad', 'MetricScrews', {
    util,
  })
  const ImperialWoodScrews = loadJscadScript(
    'node_modules/jscad-hardware/imperial.jscad',
    'ImperialWoodScrews',
    { util }
  )

  return { Hardware, screwTables: { ...MetricScrews, ...ImperialWoodScrews } }
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

// `Screw.PanHead`/`Screw.FlatHead` never read `fit` (V1 destructures `tap`/`countersink`
// out of the tuple and uses neither), so a case is spec + length + head + clearLength.
// Both heads on the metric and on an imperial wood-screw size, plus a `clearLength` case
// on each head to measure the hidden `headClearSpace`.
const CASES = [
  { spec: 'm4', length: 12, head: 'PanHead' },
  { spec: 'm4', length: 12, head: 'FlatHead' },
  { spec: '#8', length: 20, head: 'PanHead', clearLength: 15 },
  { spec: '#8', length: 20, head: 'FlatHead', clearLength: 15 },
]

function main() {
  const { Hardware, screwTables } = setUpV1()

  const cases = CASES.map(({ spec, length, head, clearLength }) => {
    const table = screwTables[spec]
    if (!table) throw new Error(`no V1 screw spec named ${spec}`)
    const options = clearLength === undefined ? {} : { clearLength }
    const screw = Hardware.Screw[head](table, length, 'loose', options)

    const parts = {}
    for (const key of Object.keys(screw.parts)) {
      parts[key] = {
        bounds: boundsOf(screw.parts[key]),
        volume: volumeOf(screw.parts[key]),
        color: colorOf(screw.parts[key]),
      }
    }
    const combined = screw.combine()
    return {
      params: { spec, length, head, ...(clearLength === undefined ? {} : { clearLength }) },
      names: screw.names,
      parts,
      combined: { bounds: boundsOf(combined), volume: volumeOf(combined) },
    }
  })

  const fixture = {
    $comment:
      'GENERATED by scripts/generate-v1-screw-fixture.cjs from the real jscad-hardware' +
      ' V1 Hardware.Screw.PanHead()/FlatHead(). Do not hand-edit. All values are' +
      ' millimetres, Z-up, head base on z=0.',
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
