// SPDX-License-Identifier: AGPL-3.0-or-later
/*
 * Dev-only fixture generator — NOT part of the app, NOT imported by src/.
 *
 * Runs the user's own JSCAD V1 gear library (`@jwc/jscad-gears` 2.0.0,
 * `~/src/jscad/jscad-gears/src/gear.js`) under Node as a **black-box measurement oracle**
 * and records what it produces for the reference gears the user has printed, so
 * `src/core/gear/involute.spec.js` can diff the clean-room involute generator against
 * measured V1 output (TODO/core-040; `docs/decisions/gears.md` Decision 6 — no V1 source
 * is vendored, only numbers are recorded). Mirrors the `generate-v1-*-fixture.cjs`
 * siblings: one generator per recipe, every patch applied to an in-memory copy.
 *
 * Run with:  node scripts/generate-v1-gear-fixture.cjs [path/to/jscad-gears]
 *            (default `~/src/jscad/jscad-gears`, or `$JSCAD_GEARS_DIR`)
 * Output:    src/core/gear/__fixtures__/v1-gears.json (external gears, core-040) and
 *            src/core/gear/__fixtures__/v1-internal-rack.json (ring gears and racks, core-043)
 *
 * ── How V1 is loaded ──────────────────────────────────────────────────────────────
 * `gear.js` is an ES module whose only import is `Debug` from `@jwc/jscad-utils`, and it
 * expects `CSG`/`CAG` as ambient globals (V1's `.jscad` convention). The harness strips
 * that one import line and the `export` keywords, stubs `Debug`, and evaluates the file
 * with `CSG`/`CAG` from the `@jscad/csg` that jscad-gears' own `node_modules` resolves
 * (0.7.0) — exactly the harness `docs/decisions/gears.md` measured with.
 *
 * ── What is measured, per gear, at two sweep densities ─────────────────────────────
 * `default` is `stepsPerToothAngle 3` at the project's own arc `resolution` — exactly what
 * was printed. `converged` is the finest sweep V1 survives (30 steps, else 20, 16, 12 —
 * it throws `Area is not closed!` at finer steps on some pinions, decision-doc defect 9)
 * at an arc `resolution` of 720: the true rack-generated shape. The fine arc matters on
 * few-tooth gears: at the projects' 30-32 segments per circle V1's tip circle is a
 * polygon whose chord sag across `bf-gear`'s wide 8T tip lands alone costs 0.15 % of the
 * area (measured: 310.09 mm² at resolution 30 vs 310.57 at 720, both 20 steps), which
 * would read as a profile error. Measurements:
 *   - areaMm2: shoelace sum over the CAG's sides.
 *   - outerRadiusMm / rootRadiusMm: max / min vertex distance from the origin.
 *   - thicknessAt: tooth thickness along the circle at each sampled radius — every side
 *     is intersected with the circle, the arcs whose midpoint is inside the outline are
 *     kept, and their mean length (arc, mm) and chord (mm) recorded, plus how many
 *     teeth crossed and the spread between teeth. The pitch circle is always sampled;
 *     the other radii are fixed fractions between the converged root and the tip so
 *     both densities are sampled at the same absolute radii.
 *   - vertexCount, buildMs (one cold run, informational only).
 *
 * ── Ring gears and racks (TODO/core-043) ─────────────────────────────────────────────
 * V1 encodes a ring as a negative `toothCount` and cuts it by sweeping the mating pinion
 * (`connectedGear`), so each ring case names its pinion. A rack is `toothCount 0`, always 41
 * teeth along Y with teeth pointing +X. Ring measurements split the outline's vertices into
 * the rim circle (those at the largest radius) and the toothed inner boundary:
 *   - rimOuterRadiusMm: the rim circle's radius.
 *   - tipRadiusMm / rootRadiusMm: min / max vertex radius of the inner boundary.
 *   - thicknessAt: ring-tooth thickness along circles, as above (material = inside).
 * Rack measurements, in V1's own frame (pitch line on x = 0):
 *   - tipXMm (largest x), rootXMm (the bar's toothed edge, largest x of the backing bar's
 *     corners), backXMm (smallest x), lengthMm (y span).
 *   - widthAt: tooth width along y on vertical lines at the pitch line and at fractions
 *     between root and tip — mean, count and spread of the inside intervals.
 */

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

const REPO_ROOT = path.resolve(__dirname, '..')
const OUT_PATH = path.join(REPO_ROOT, 'src/core/gear/__fixtures__/v1-gears.json')
const INTERNAL_OUT_PATH = path.join(REPO_ROOT, 'src/core/gear/__fixtures__/v1-internal-rack.json')
const GEARS_DIR = path.resolve(
  process.argv[2] || process.env.JSCAD_GEARS_DIR || path.join(os.homedir(), 'src/jscad/jscad-gears')
)

/** Load V1's `Gear` constructor from `src/gear.js` with `CSG`/`CAG` as ambient globals. */
function loadV1Gear() {
  const csgEntry = require.resolve('@jscad/csg', { paths: [GEARS_DIR] })
  const { CSG, CAG } = require(csgEntry)
  const source = fs
    .readFileSync(path.join(GEARS_DIR, 'src/gear.js'), 'utf8')
    .replace(/^import .*$/m, '')
    .replace(/^export default .*$/m, '')
    .replace(/^export /gm, '')
  const body = `${source}\nreturn Gear;`
  // eslint-disable-next-line no-new-func
  const Gear = new Function('CSG', 'CAG', 'Debug', body)(CSG, CAG, () => () => {})
  const version = JSON.parse(fs.readFileSync(path.join(GEARS_DIR, 'package.json'), 'utf8')).version
  const csgVersion = JSON.parse(
    fs.readFileSync(path.join(path.dirname(csgEntry), 'package.json'), 'utf8')
  ).version
  return { Gear, version, csgVersion }
}

const round = (n) => Number(n.toFixed(9))

/** Sides of a CAG as `[[x0, y0, x1, y1], ...]` in mm. */
function sidesOf(cag) {
  return cag.sides.map((s) => [s.vertex0.pos._x, s.vertex0.pos._y, s.vertex1.pos._x, s.vertex1.pos._y])
}

/** Signed shoelace area, mm². */
function areaOf(sides) {
  let a = 0
  for (const [x0, y0, x1, y1] of sides) a += x0 * y1 - x1 * y0
  return a / 2
}

/** Winding-number point-in-outline test over raw sides. */
function inside(sides, px, py) {
  let w = 0
  for (const [x0, y0, x1, y1] of sides) {
    if (y0 <= py) {
      if (y1 > py && (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) > 0) w++
    } else if (y1 <= py && (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) < 0) w--
  }
  return w !== 0
}

/** Tooth thickness along the circle of radius `rMm`: mean arc and chord, count, spread. */
function thicknessAt(sides, rMm) {
  const angles = []
  for (const [x0, y0, x1, y1] of sides) {
    const dx = x1 - x0
    const dy = y1 - y0
    const a = dx * dx + dy * dy
    const b = 2 * (x0 * dx + y0 * dy)
    const c = x0 * x0 + y0 * y0 - rMm * rMm
    const disc = b * b - 4 * a * c
    if (disc < 0 || a === 0) continue
    for (const sign of [-1, 1]) {
      const t = (-b + sign * Math.sqrt(disc)) / (2 * a)
      if (t >= 0 && t < 1) angles.push(Math.atan2(y0 + t * dy, x0 + t * dx))
    }
  }
  angles.sort((p, q) => p - q)
  const arcs = []
  const chords = []
  for (let i = 0; i < angles.length; i++) {
    const a0 = angles[i]
    const a1 = i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI
    const mid = (a0 + a1) / 2
    if (a1 - a0 < 1e-12) continue
    if (inside(sides, rMm * Math.cos(mid), rMm * Math.sin(mid))) {
      arcs.push(rMm * (a1 - a0))
      chords.push(2 * rMm * Math.sin((a1 - a0) / 2))
    }
  }
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length
  return {
    radiusMm: round(rMm),
    teeth: arcs.length,
    arcMm: arcs.length ? round(mean(arcs)) : null,
    chordMm: chords.length ? round(mean(chords)) : null,
    spreadMm: arcs.length ? round(Math.max(...arcs) - Math.min(...arcs)) : null,
  }
}

function measure(Gear, params, steps, resolution, sampleRadiiMm) {
  const t0 = process.hrtime.bigint()
  const gear = new Gear({ ...params, qualitySettings: { resolution, stepsPerToothAngle: steps } })
  const cag = gear.getZeroedShape()
  const buildMs = Number(process.hrtime.bigint() - t0) / 1e6
  const sides = sidesOf(cag)
  let rMax = 0
  let rMin = Infinity
  for (const [x0, y0] of sides) {
    const r = Math.hypot(x0, y0)
    if (r > rMax) rMax = r
    if (r < rMin) rMin = r
  }
  return {
    stepsPerToothAngle: steps,
    arcResolution: resolution,
    areaMm2: round(Math.abs(areaOf(sides))),
    outerRadiusMm: round(rMax),
    rootRadiusMm: round(rMin),
    vertexCount: sides.length,
    buildMs: Number(buildMs.toFixed(1)),
    thicknessAt: sampleRadiiMm.map((r) => thicknessAt(sides, r)),
    _rootRadiusMm: rMin,
    _outerRadiusMm: rMax,
  }
}

// Reference gears, parameters exactly as each project passes them to V1
// (`docs/decisions/gears.md` "Measured", plus `bf-gear`'s own `params` block).
const CASES = [
  {
    id: 'window-motor-36T',
    project: 'window-motor/gears.jscad (driveGear)',
    v1: { toothCount: 36, circularPitch: (Math.PI * 50) / 36, pressureAngle: 20, clearance: 0.5, backlash: 0.1, resolution: 32 },
  },
  {
    id: 'window-motor-12T',
    project: 'window-motor/gears.jscad (pinionGear)',
    v1: { toothCount: 12, circularPitch: (Math.PI * 50) / 36, pressureAngle: 20, clearance: 0.5, backlash: 0.1, resolution: 32 },
  },
  {
    id: 'window-motor-centre-12T-pa35',
    project: 'window-motor/gears.jscad (CenterGear)',
    v1: { toothCount: 12, circularPitch: 2.45, pressureAngle: 35, resolution: 32 },
  },
  {
    id: 'drive-wheel-32T',
    project: 'drive-wheel/drive-wheel.jscad',
    v1: { toothCount: 32, circularPitch: (Math.PI * 50) / 32, pressureAngle: 20, clearance: 0.05, backlash: 0.05, resolution: 30 },
  },
  {
    id: 'bf-gear-30T',
    project: 'bf-gear/bf-gear.jscad (wheel1ToothCount)',
    v1: { toothCount: 30, circularPitch: 8, pressureAngle: 14.5, clearance: 0.05, backlash: 0.05, profileShift: 0, resolution: 30 },
  },
  {
    id: 'bf-gear-8T',
    project: 'bf-gear/bf-gear.jscad (wheel2ToothCount)',
    v1: { toothCount: 8, circularPitch: 8, pressureAngle: 14.5, clearance: 0.05, backlash: 0.05, profileShift: 0, resolution: 30 },
  },
]

// Ring gears the user's projects build, with the pinion V1 cuts each with
// (`jscad-gears/examples/gear-set.jscad`, `drive-wheel/drive-wheel.jscad`'s `ring`).
const INTERNAL_CASES = [
  {
    id: 'gear-set-96T-ring',
    project: 'jscad-gears/examples/gear-set.jscad (96T ring, 14T pinion)',
    v1: { toothCount: -96, circularPitch: (Math.PI * 50) / 96, resolution: 32 },
    pinion: { toothCount: 14 },
  },
  {
    id: 'drive-wheel-64T-ring',
    project: 'drive-wheel/drive-wheel.jscad (64T ring, 14T pinion)',
    v1: { toothCount: -64, circularPitch: (Math.PI * (78.5 + 4)) / 64, pressureAngle: 20, clearance: 0.05, backlash: 0.05, resolution: 30 },
    pinion: { toothCount: 14 },
  },
]

// No project prints a rack; these are V1 racks at two reference gears' settings.
const RACK_CASES = [
  {
    id: 'rack-drive-wheel-32T-settings',
    project: 'V1 rack (toothCount 0) at drive-wheel 32T settings',
    v1: { toothCount: 0, circularPitch: (Math.PI * 50) / 32, pressureAngle: 20, clearance: 0.05, backlash: 0.05, resolution: 30 },
  },
  {
    id: 'rack-window-motor-settings',
    project: 'V1 rack (toothCount 0) at window-motor 36T settings',
    v1: { toothCount: 0, circularPitch: (Math.PI * 50) / 36, pressureAngle: 20, clearance: 0.5, backlash: 0.1, resolution: 32 },
  },
]

/** Split a ring's sides into the rim circle and the toothed boundary, and measure both. */
function measureRing(Gear, v1, pinionParams, steps, resolution, sampleRadiiMm) {
  const qualitySettings = { resolution, stepsPerToothAngle: steps }
  const { toothCount: _t, resolution: _r, ...shared } = v1
  const pinion = new Gear({ ...shared, ...pinionParams, qualitySettings })
  const t0 = process.hrtime.bigint()
  const gear = new Gear({ ...shared, toothCount: v1.toothCount, connectedGear: pinion, qualitySettings })
  const cag = gear.getZeroedShape()
  const buildMs = Number(process.hrtime.bigint() - t0) / 1e6
  const sides = sidesOf(cag)
  const radii = sides.map(([x0, y0]) => Math.hypot(x0, y0))
  const rim = Math.max(...radii)
  const inner = radii.filter((r) => r < rim - 1e-6)
  return {
    stepsPerToothAngle: steps,
    arcResolution: resolution,
    areaMm2: round(Math.abs(areaOf(sides))),
    rimOuterRadiusMm: round(rim),
    tipRadiusMm: round(Math.min(...inner)),
    rootRadiusMm: round(Math.max(...inner)),
    vertexCount: sides.length,
    buildMs: Number(buildMs.toFixed(1)),
    thicknessAt: sampleRadiiMm.map((r) => thicknessAt(sides, r)),
    _tip: Math.min(...inner),
    _root: Math.max(...inner),
  }
}

/** Tooth widths along y on the vertical line x = xMm. */
function widthAt(sides, xMm) {
  const ys = []
  for (const [x0, y0, x1, y1] of sides) {
    if (x0 === x1) continue
    const t = (xMm - x0) / (x1 - x0)
    if (t >= 0 && t < 1) ys.push(y0 + t * (y1 - y0))
  }
  ys.sort((p, q) => p - q)
  const widths = []
  for (let i = 0; i + 1 < ys.length; i++) {
    const mid = (ys[i] + ys[i + 1]) / 2
    if (ys[i + 1] - ys[i] > 1e-12 && inside(sides, xMm, mid)) widths.push(ys[i + 1] - ys[i])
  }
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length
  return {
    xMm: round(xMm),
    teeth: widths.length,
    widthMm: widths.length ? round(mean(widths)) : null,
    spreadMm: widths.length ? round(Math.max(...widths) - Math.min(...widths)) : null,
  }
}

function measureRack(Gear, v1) {
  const gear = new Gear({ ...v1, qualitySettings: { resolution: v1.resolution, stepsPerToothAngle: 3 } })
  const sides = sidesOf(gear.getZeroedShape())
  const xs = sides.map(([x0]) => x0)
  const ysAll = sides.map(([, y0]) => y0)
  const tipX = Math.max(...xs)
  const backX = Math.min(...xs)
  // The bar's toothed edge: the largest x among the vertices at the bar's two ends.
  const yMax = Math.max(...ysAll)
  const rootX = Math.max(...sides.filter(([, y0]) => Math.abs(y0 - yMax) < 1e-9).map(([x0]) => x0))
  const sample = [0, ...FRACTIONS.map((f) => rootX + f * (tipX - rootX))]
  return {
    areaMm2: round(Math.abs(areaOf(sides))),
    tipXMm: round(tipX),
    rootXMm: round(rootX),
    backXMm: round(backX),
    lengthMm: round(yMax - Math.min(...ysAll)),
    vertexCount: sides.length,
    widthAt: sample.map((x) => widthAt(sides, x)),
  }
}

const FRACTIONS = [0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 0.97]
const CONVERGED_STEPS = [30, 20, 16, 12]
const RING_CONVERGED_STEPS = [20, 16, 12, 10, 8, 6, 5, 4]
const CONVERGED_ARC_RESOLUTION = 720

function main() {
  const { Gear, version, csgVersion } = loadV1Gear()
  const cases = CASES.map(({ id, project, v1 }) => {
    const pitchRadiusMm = (v1.toothCount * v1.circularPitch) / Math.PI / 2
    // Probe once at the converged density to get the root, so both densities share radii.
    let converged = null
    let probeError = []
    for (const steps of CONVERGED_STEPS) {
      try {
        converged = measure(Gear, v1, steps, CONVERGED_ARC_RESOLUTION, [])
        break
      } catch (err) {
        probeError.push(`steps ${steps}: ${err.message}`)
      }
    }
    if (!converged) throw new Error(`${id}: V1 failed at every converged density: ${probeError.join('; ')}`)
    const root = converged._rootRadiusMm
    const outer = converged._outerRadiusMm
    const radii = [pitchRadiusMm, ...FRACTIONS.map((f) => root + f * (outer - root))]
    const results = {
      default: measure(Gear, v1, 3, v1.resolution, radii),
      converged: measure(Gear, v1, converged.stepsPerToothAngle, CONVERGED_ARC_RESOLUTION, radii),
    }
    for (const r of Object.values(results)) {
      delete r._rootRadiusMm
      delete r._outerRadiusMm
    }
    return {
      id,
      project,
      v1Params: { ...v1, circularPitch: round(v1.circularPitch) },
      pitchRadiusMm: round(pitchRadiusMm),
      ...(probeError.length ? { convergedFallback: probeError } : {}),
      ...results,
    }
  })

  const fixture = {
    $comment:
      'GENERATED by scripts/generate-v1-gear-fixture.cjs from the real @jwc/jscad-gears V1' +
      ' Gear().getZeroedShape(), used only as a measurement oracle (docs/decisions/gears.md' +
      ' Decision 6). Do not hand-edit. Millimetres. "default" = stepsPerToothAngle 3 (as' +
      ' printed, at the project\'s own arc resolution); "converged" = the finest sweep V1' +
      ' survives (30/20/16/12 steps, see convergedFallback) at arc resolution 720.' +
      ' thicknessAt[0] is the pitch circle. V1 params are V1-literal: its backlash thins' +
      ' each tooth by backlash/cos(pa), and its cutter flank slope is sin(pa), see' +
      ' src/core/gear/dimensions.js v1* converters.',
    source: { '@jwc/jscad-gears': version, '@jscad/csg': csgVersion },
    cases,
  }
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(fixture, null, 2)}\n`)
  // eslint-disable-next-line no-console
  console.log(`wrote ${path.relative(REPO_ROOT, OUT_PATH)}`)

  // ── Ring gears and racks (TODO/core-043) ──
  const internal = INTERNAL_CASES.map(({ id, project, v1, pinion }) => {
    const toothCount = -v1.toothCount
    const pitchRadiusMm = (toothCount * v1.circularPitch) / Math.PI / 2
    // V1's ring sweep throws `Area is not closed!` at finer densities far sooner than its
    // external sweep (defect 9), so the ring walks further down; `converged` is null when
    // nothing finer than the printed density survives.
    let converged = null
    const probeError = []
    for (const steps of RING_CONVERGED_STEPS) {
      for (const resolution of [CONVERGED_ARC_RESOLUTION, v1.resolution]) {
        try {
          converged = measureRing(Gear, v1, pinion, steps, resolution, [])
          break
        } catch (err) {
          probeError.push(`steps ${steps} @ ${resolution}: ${err.message}`)
        }
      }
      if (converged) break
    }
    const probe = converged ?? measureRing(Gear, v1, pinion, 3, v1.resolution, [])
    const radii = [pitchRadiusMm, ...FRACTIONS.map((f) => probe._tip + f * (probe._root - probe._tip))]
    const results = {
      default: measureRing(Gear, v1, pinion, 3, v1.resolution, radii),
      converged: converged
        ? measureRing(Gear, v1, pinion, converged.stepsPerToothAngle, converged.arcResolution, radii)
        : null,
    }
    for (const r of Object.values(results)) {
      if (!r) continue
      delete r._tip
      delete r._root
    }
    return {
      id,
      project,
      v1Params: { ...v1, circularPitch: round(v1.circularPitch) },
      pinionParams: pinion,
      pitchRadiusMm: round(pitchRadiusMm),
      ...(probeError.length ? { convergedFallback: probeError } : {}),
      ...results,
    }
  })
  const racks = RACK_CASES.map(({ id, project, v1 }) => ({
    id,
    project,
    v1Params: { ...v1, circularPitch: round(v1.circularPitch) },
    ...measureRack(Gear, v1),
  }))
  const internalFixture = {
    $comment:
      'GENERATED by scripts/generate-v1-gear-fixture.cjs from the real @jwc/jscad-gears V1' +
      ' Gear().getZeroedShape() for negative toothCount (ring, cut by sweeping the named pinion)' +
      ' and toothCount 0 (rack, always 41 teeth along Y, teeth +X, pitch line x = 0), used only as' +
      ' a measurement oracle (docs/decisions/gears.md Decision 6). Do not hand-edit. Millimetres.' +
      ' Ring "default" = stepsPerToothAngle 3 at the project\'s arc resolution; "converged" = the' +
      ' finest sweep V1 survives at arc resolution 720. V1 params are V1-literal (see v1-gears.json).',
    source: { '@jwc/jscad-gears': version, '@jscad/csg': csgVersion },
    internal,
    racks,
  }
  fs.writeFileSync(INTERNAL_OUT_PATH, `${JSON.stringify(internalFixture, null, 2)}\n`)
  // eslint-disable-next-line no-console
  console.log(`wrote ${path.relative(REPO_ROOT, INTERNAL_OUT_PATH)}`)
}

main()
