# Gears: an analytic involute with a generated root, `module` as the stored size, profile op + extrude

Status: **Accepted 2026-10-16** (`TODO/done/core-039`). The user answered all eight calls at
the end of this page, one at a time, and took the recommendation on each. M11 (`core-040`
onward) builds on this page as written.
`CLAUDE.md`'s Stack table is unchanged: this decision adds no dependency.

This settles how WarpCad produces a gear tooth outline and what the parameters are called,
so `core-040`…`core-049` don't each re-derive it. It is a **new decision**. Neither
previous attempt had gears; the only prior experience is the user's own V1 library,
`@jwc/jscad-gears` 2.0.0, and that is weighed below from **measured output**, not from
reading its source.

All figures were measured or pulled on **2026-10-10**:

- **V1 output**: `~/src/jscad/jscad-gears/src/gear.js` (read-only, unmodified) loaded under
  Node 24.14.1 with the `@jscad/csg` 0.7.0 that package's own `node_modules` resolves.
  The scratch harness strips the one `import` line and the `export` keywords, then runs the
  file as-is. Area is the shoelace sum over the `CAG`'s sides. Outer and root radius are
  the largest and smallest vertex distance from the origin. **Tooth-flank width at the
  pitch circle** is the tooth's thickness measured along the pitch circle: intersect every
  side with `r = pitchRadius`, keep the arcs whose midpoint is inside the outline, and
  average them. "Arc" is that length along the circle; "chord" is the straight-line
  distance between the same two crossing points. Build time is wall clock for
  `new Gear(...).getZeroedShape()`, one cold run.
- **Analytic comparison**: a 40-line scratch generator using the textbook involute
  function, `inv(α) = tan α − α`, with flanks from `max(base, root)` to the tip, plain
  root and tip arcs, and **no trochoid**. It is deliberately the naive version, so its
  error against V1 shows what the trochoid has to fix.
- **npm**: the registry API (`registry.npmjs.org`) for version, licence, publish dates,
  maintainers, unpacked size and dependencies. **GitHub**: the REST API for stars,
  open-issue count (the API's count, which includes PRs) and last push. Closed-issue
  counts were **not checked**; none of the third-party candidates got far enough to need them.

---

## Summary

| # | Question | Recommendation |
|---|---|---|
| 1 | Profile generation | **(b) Analytic involute plus a computed rack-generated trochoid root**, written fresh in `src/core/gear/`. Validate it against V1's measured output in both forms: V1 at its default settings (what the user actually printed) and V1 converged (the true shape). No port, no package. |
| 2 | Parameter vocabulary | **Store `moduleMm`.** Accept `circularPitch` (mm) as an import alias. Import V1's `diametralPitch` as **1/module in 1/mm**, which is what V1's code actually computes, *not* teeth per inch. The Inspector shows module and circular pitch. |
| 3 | Tooth vs gear | **One `profile.gear` op returning a `geom2`, fed to `profile.extrudeLinear`.** The Library row is a composite recipe, the same pattern `hardware.bolt` uses. Helical twist goes onto `profile.extrudeLinear` (`core-042`) and the bevel loft reuses the slice path, so neither forks. |
| 4 | Resolution | V1's `qualitySettings` is **dropped as a per-gear setting**; resolution belongs to the document (`core-035`). Tip and root arcs use the existing `segmentsFor(radius, policy)`. Flank points are chosen so the involute's chordal error is ≤ `policy.toleranceMm`. |
| 5 | V1 defects not to port | The six the TODO lists, **plus five found by measuring**: V1's `diametralPitch` unit, the gear-vs-rack backlash mismatch, V1 crashing at finer quality, pinion-dependent internal teeth, and a hard-wired ring-rim thickness. Full list in Decision 5. |
| 6 | Licence | **Clean reimplementation from the published involute equations**, with V1 used only as a black-box measurement oracle. `LICENSING.md` needs no change. No new dependency. |

---

## Measured: V1 output for the reference gears (the `core-040` fixtures)

Parameters are exactly as the projects pass them. `window-motor` uses
`qualitySettings.resolution = CSG.defaultResolution2D` (= 32); `drive-wheel` uses 30.
Both use `stepsPerToothAngle 3`. "Default" is the settings each project actually used.
"Converged" is the same gear at `stepsPerToothAngle 20`. Past that point the area changes
by < 0.01 mm² per doubling, so this is the true rack-generated shape to within print
tolerance.

| Gear | Teeth | `circularPitch` (mm) | module (mm) | α | clearance | backlash | pitch R | base R |
|---|---|---|---|---|---|---|---|---|
| `window-motor` drive | 36 | π·50/36 = 4.363323 | 1.388889 | 20° | 0.5 | 0.1 | 25.0000 | 23.4923 |
| `window-motor` pinion | 12 | π·50/36 = 4.363323 | 1.388889 | 20° | 0.5 | 0.1 | 8.3333 | 7.8308 |
| `drive-wheel` 32T | 32 | π·50/32 = 4.908739 | 1.562500 | 20° | 0.05 | 0.05 | 25.0000 | 23.4923 |
| `window-motor` centre | 12 | 2.45 | 0.779859 | **35°** | 0 (omitted) | 0 (omitted) | 4.6792 | 3.8329 |

| Gear | Settings | Area (mm²) | Outer R (mm) | Root R (mm) | Flank width @ pitch, arc / chord (mm) | Vertices | Build |
|---|---|---|---|---|---|---|---|
| 36T drive | default | **1924.386** | **26.3889** | **23.1165** | **2.0766 / 2.0760** | 828 | 23 ms |
| 36T drive | converged | 1923.910 | 26.3889 | 23.1112 | 2.0753 / 2.0747 | 5364 | 371 ms |
| 12T pinion | default | **201.912** | **9.7222** | **6.4637** | **2.0794 / 2.0740** | 228 | 5 ms |
| 12T pinion | converged | 200.742 | 9.7222 | 6.4447 | 2.0754 / 2.0700 | 1164 | 137 ms |
| 32T | default | **1951.494** | **26.5625** | **23.3980** | **2.4032 / 2.4023** | 608 | 8 ms |
| 32T | converged | 1950.950 | 26.5625 | 23.3875 | 2.4012 / 2.4002 | 4000 | 270 ms |
| 12T α 35° | default | **68.594** | **5.4590** | **3.9028** | **1.2304 / 1.2268** | 180 | 5 ms |
| 12T α 35° | converged | 68.408 | 5.4590 | 3.8995 | 1.2250 / 1.2215 | 948 | 119 ms |

At every row, every tooth measured the same flank width (spread < 1e-13 mm). The flank
crossing count equals the tooth count, so each outline has exactly `N` teeth.

**What the formulas predict**, and what converged V1 actually gives:

| Quantity | Formula (V1 semantics) | 36T | 12T | 32T | 12T α35 |
|---|---|---|---|---|---|
| Outer R | `R + m·(1 + x)` | 26.3889 ✓ | 9.7222 ✓ | 26.5625 ✓ | 5.4590 ✓ |
| Root R | `R + x·m − m − clearance` | 23.1111 (V1 23.1112) | 6.4444 (6.4447) | 23.3875 ✓ | 3.8993 (3.8995) |
| Flank width @ pitch (arc) | `cp/2 − backlash / cos α` | 2.0752 (2.0753) | 2.0752 (2.0754) | 2.4012 ✓ | 1.2250 ✓ |

So the converged V1 shape *is* the textbook rack-generated involute, to within 0.0003 mm.
The default-settings shape is that involute faceted by the 3-steps-per-tooth sweep, and it
carries **0.03–0.58 % extra area**. That extra is material left in the root, where too few
cutter positions were swept.

### Analytic involute (no trochoid) against converged V1

| Gear | Analytic area | vs converged V1 | Time per gear |
|---|---|---|---|
| 36T | 1923.634 | −0.014 % | 0.064 ms |
| 12T | 201.750 | **+0.502 %** | 0.010 ms |
| 32T | 1951.286 | +0.018 % | 0.055 ms |
| 12T α35 | 68.338 | −0.099 % | 0.021 ms |

- **36T and 32T**: the naive analytic profile is already within 0.02 %.
- **12T at 20° is the case that decides the method.** Below about 17 teeth at 20°
  (`2 / sin²α`), a rack cutter undercuts the flank below the base circle. V1 reproduces
  that undercut naturally. A plain involute with a radial line under the base circle does
  not, and so carries 0.5 % extra material exactly where the 36T wheel's tips sweep. That
  is an interference risk on a pinion the user has already printed. **The trochoid is
  required, not polish.**
- **12T at 35°**: the analytic flanks meet at r ≈ 5.451 mm, **0.008 mm short of the tip
  circle**, so the tooth is pointed (negative tip land, −0.016 mm). V1 leaves a sliver at
  the nominal tip radius because its sweep stops early. The generator must clip the tip at
  the flank intersection and say so (`warnings: ['pointed-tip']`), never emit
  self-crossing flanks.
- **Speed**: the analytic generator takes 0.01–0.06 ms per gear. Converged V1 takes
  119–754 ms (the 30-steps 36T took 754 ms with 183 unions), and V1 *throws*
  `Area is not closed!` on the 12T pinion at `stepsPerToothAngle 30`.

### Tolerances `core-040` should use

Generate fixtures at **both** step counts, extending the scratch harness into
`scripts/generate-v1-gear-fixture.cjs` per `core-040`, and assert:

| Against | Area | Outer / root R | Flank width @ pitch |
|---|---|---|---|
| V1 converged (shape correctness) | ±0.1 % | ±0.005 mm | ±0.002 mm |
| V1 default (what was printed) | ±1 % | ±0.03 mm | ±0.01 mm |

---

## Decision 1 — Profile generation: **analytic involute + generated trochoid root**

### Options compared

| Option | What it is | Speed (measured) | V1 parity | Standalone internal gear | Risk |
|---|---|---|---|---|---|
| **(a) Port Hessmer's rack-cutter sweep** | Sweep a trapezoid cutter over one tooth (`2·steps` 2D unions), extract its outline, run the `_smoothConcaveCorners` heuristic, then rotate-copy the outline `N` times | 5–23 ms at default; 119–754 ms converged; unions grow linearly with steps but cost grows faster (36T: 19 unions/23 ms → 183 unions/754 ms) | Exact by construction, including undercut | **No.** The internal path cuts with the mating pinion (`connectedGear`) | Relies on V1 `CAG` union + `getOutlinePaths` + a corner-smoothing heuristic; V3's `geom2` booleans differ, so the port would re-derive V1's "not closed" failures on new inputs. V1 itself throws at 30 steps on a 12T pinion. |
| **(b) Analytic involute + rack-generated trochoid** *(recommended)* | Closed-form flank `ψ(r) = s/(2R) + inv α − inv α_r`, plus the trochoid traced by the *same* rack's tip corner V1 uses, clipped where the two meet, then tip and root arcs | 0.01–0.06 ms without the trochoid. The trochoid is the same closed form sampled once more, same order. | Measured within 0.02 % (no undercut) of converged V1 *before* adding the trochoid. With it, it is the same envelope V1 converges to. | **Yes.** An internal tooth space is the external involute with addendum and dedendum swapped. The pinion is an optional check, not an input. | Undercut and pointed-tip cases need explicit handling. Both are now measured fixtures (12T α20, 12T α35). |
| (c1) `@jwc/jscad-gears` 2.0.0 as a dependency | V1 package as published | as (a) | exact | no | Depends on `@jscad/csg` 0.7.0 (V1) and `@jwc/jscad-utils`; won't run on `@jscad/modeling` 2.13.0 without a CSG/CAG shim. Last publish 2020-09-10, 1 maintainer. |
| (c2) `@code3d/gears` 0.0.1-alpha.17 | Spur, helical and internal gear *solids* with hubs and keyways | not measured | unknown | yes | **Custom "Code3D provisional community licence"** forbidding commercial products that compete with it. That is a field-of-use restriction, not AGPL-compatible, and fails `npm run licenses`. Alpha; created 2026-09-19; 6 versions; 1 maintainer; peer-depends on its own `@code3d/core` kernel; GitHub `vilicvane/code3d` 5 stars, 20 open issues + PRs, last push 2026-09-27. |
| (c3) `svg-gear-generator` 1.1.5 | SVG icon gears | — | — | — | MIT, but its README says it is **not** an involute ("does NOT generate a technically accurate gear"). Depends on React. Last publish 2022-08-05; 1 star. |
| (c4) OpenJSCAD example `involuteGear` (as in `guide-mount/gears.jscad`) | Classic example: involute teeth unioned onto a root circle, with `twist` for helical and a `doubleHelical` mirror | not measured | **different parameter model** (`outerRadius`/`baseRadius`/`circularPitch 1`) | no | Not a package; no undercut, no clearance/backlash model the V1 gears use. Its licence was **not verified** (it isn't being proposed for copying). |

npm searches for `involute gear`, `gear generator`, `spur gear` and `jscad gear` turned up
nothing else that generates gears, as opposed to the unrelated "Gear.js" build tool and
packages that merely contain "gear" in their names.

### Rejection table

| Rejected | Specific reason |
|---|---|
| (a) Port the rack-cutter sweep | The TODO's premise that the sweep is slow is **only half right**: at V1's own defaults it takes 5–23 ms, because it sweeps one tooth and copies the outline. The real costs are (1) its default output is faceted (up to 0.58 % area, 0.02 mm at the root) and buying that back costs 100–750 ms; (2) it depends on 2D-boolean and outline-extraction behaviour that V3 doesn't share, and V1 already crashes at finer steps; (3) its internal gear can't exist without a pinion. (b) matches its converged output and has none of these problems. |
| (b) **without** a trochoid | Measured +0.5 % area on the 12T α20 pinion, all of it in the undercut zone where the mating wheel's tips sweep. It would reproduce the user's printed gears everywhere except the one place they'd bind. |
| (c1) `@jwc/jscad-gears` as a dependency | Targets the V1 kernel this attempt replaced (`docs/decisions/geometry-kernel.md`); needs a CSG/CAG compatibility shim to run at all. |
| (c2) `@code3d/gears` | Licence: a non-OSI, field-of-use-restricted licence is incompatible with AGPL-3.0-or-later and would fail `npm run licenses`. It is also alpha, single-maintainer, and built on a different kernel. |
| (c3) `svg-gear-generator` | Not an involute, by its own README. |
| (c4) OpenJSCAD `involuteGear` | A different parameter model from every gear the user has printed except `guide-mount`'s dial wheels; no undercut, clearance or backlash. Its one extra capability, `twist`, is covered by Decision 3. |

---

## Decision 2 — Parameter vocabulary: **store `moduleMm`**

Stored on the feature, framework-free, and every name carrying its unit (`CLAUDE.md`):

| Param | Unit | Notes |
|---|---|---|
| `teeth` | count, integer ≥ 3 (rack: teeth along its length) | Always positive; the kind is its own field (Decision 5) |
| `kind` | `'external' \| 'internal' \| 'rack'` | Replaces V1's sign of `toothCount` |
| `moduleMm` | mm | Canonical size. Pitch Ø = `moduleMm · teeth` |
| `pressureAngleDeg` | degrees | Default 20 |
| `profileShift` | coefficient × module (unitless) | V1 semantics, which are the standard ones: cutter offset by `x·m` |
| `clearanceMm` | mm | Root depth beyond one module. See the open call on its default. |
| `backlashMm` | mm | See the open call on its semantics |

Conversions, named at the import/Inspector boundary and nowhere else:

- `circularPitchMmToModuleMm(cp) = cp / π`
- `moduleMmToCircularPitchMm(m) = π · m`
- `diametralPitchPerInchToModuleMm(dp) = 25.4 / dp` — for a user typing a standard inch DP.
- `v1DiametralPitchToModuleMm(dpV1) = 1 / dpV1`. **V1's `diametralPitch` is not teeth per
  inch.** `gear.js` sets `diametralPitch = π / circularPitch` with `circularPitch` in mm,
  so V1's value is 1/module in 1/mm. An importer that read it as per-inch would scale the
  gear by 25.4×. None of the four projects pass `diametralPitch`, but the conversion
  exists so nobody gets that one wrong.

The Inspector (`ui-057`) shows module and circular pitch as two linked fields; editing
either writes `moduleMm`. Inch DP is a read-only line beneath them.

---

## Decision 3 — Where the tooth ends: **`profile.gear` + `profile.extrudeLinear`**

- **`profile.gear`** is a native op with 0 operands. It returns a `geom2`: the external
  outline, the internal ring (annulus with teeth on its inside edge), or the rack bar.
  Following `registry.js`'s documented split, it is a `profile.*` op: an intermediate
  value, never a Library row. It calls `src/core/gear/involute.js` for points, as
  `core-040` already plans (no `@jscad/modeling` import in `src/core/gear/`).
- **The Library row is a composite recipe** (`core-041`) that expands to
  `profile.gear` → `profile.extrudeLinear` → `transform.translate`. That is exactly how
  `hardware.bolt` keeps its expansion visible.
- **Helical / herringbone (`core-042`)**: add `twistDeg`/`twistSteps` to
  `profile.extrudeLinear`. The sketch extrude path in `registry.js` already passes
  `twistAngle`/`twistSteps` through to `extrusions.extrudeLinear`, so this is plumbing,
  not new geometry. Herringbone is two half-height twisted extrudes, mirrored, as
  `guide-mount`'s `doubleHelical` does.
- **Bevel (`core-045`)** lofts scaled copies of the same profile through the existing
  slice path, replacing V1's `poly2solid(enlarge(-2a))`. The cone angle becomes a
  parameter instead of a hard-wired 45°.
- **Rejected alternative, one op that does both:** it would need its own twist and loft
  code, i.e. a second copy of two paths the registry already has. It would also hide the
  2D profile that the bevel, hub (`core-048`) and planetary (`core-049`) tasks all want
  to reuse.

---

## Decision 4 — Resolution

V1's `qualitySettings` is per gear; `core-035` made resolution a property of the
**document**, with an export override. Gears follow the document, so a gear previews at
Normal and exports at Print like every other curve.

| V1 knob | What it controlled | WarpCad equivalent |
|---|---|---|
| `resolution` (segments per full circle) | Tip and root arcs, and V1's centre hole | `segmentsFor(tipRadiusMm, policy)` / `segmentsFor(rootRadiusMm, policy)`, scaled to the arc's angular span (`src/core/kernel/tessellation.js`) |
| `stepsPerToothAngle` (sweep density) | How faceted the flank and root were | Points per involute flank and per trochoid, chosen so chordal deviation from the true curve is ≤ `policy.toleranceMm` (Draft 0.1, Normal 0.05, Fine 0.02, Print 0.01 mm), clamped to `[minSegments/4, 64]` per flank |
| — | — | **`legacy`**: no document saved before `core-035` contains a gear, so legacy is never inherited by one. It maps to the same arcs-at-32 rule as other legacy curves and a fixed 8 points per flank, purely so it's deterministic. |

On import, a V1 `qualitySettings` value is **ignored, with a note**, rather than stored
per gear. A per-body resolution override is explicitly out of `core-035`'s scope, and gears
don't reopen that.

---

## Decision 5 — V1 behaviour not to port

From the TODO:

1. `GearSet.gearRatio = gear1.toothCount / gear1.toothCount`, which is always 1.
   WarpCad's mesh math (`core-044`) computes ratio and centre distance from both gears.
2. The rack is hard-coded to 41 teeth. WarpCad's rack takes `teeth` (or a length).
3. Gear type is encoded in the **sign** of `toothCount`. WarpCad uses an explicit `kind`.
4. `GearSet.createShape(showOption)` takes a bitmask. A pair is two features placed by
   `core-044`, each independently showable.
5. `getZeroedShape` bakes in `rotateZ(-90)`, so tooth 0 lands on +Y. WarpCad puts
   **tooth 0 on +X** (`core-040`). The V1 importer adds an explicit
   `transform.rotate` of −90° so imported parts land where they did.
6. The bevel train's `snap(..., ±addendum)` fudge, its hard-wired 45° cone (really
   ≈ 43° pitch cone), and the hand-tuned 215° pinion phase. `core-046` computes all
   three from the pitch cones and tooth counts.

Found while measuring, not in the TODO:

7. **`diametralPitch` is mislabelled.** It is 1/module in 1/mm, not teeth per inch
   (Decision 2).
8. **Backlash is applied inconsistently.** The gear cutter widens each side by
   `backlash / 2 / cos α`, so the tooth thins by `backlash / cos α` at the pitch circle
   (measured: 2.0752 predicted, 2.0753 converged). The comment beside that line says
   "a fourth". `_createRackTooth` does use `/4`. So a V1 rack and a V1 gear given the
   same `backlash` thin by amounts 2× apart. WarpCad defines backlash once, for all three
   kinds (see the open call).
9. **V1 crashes at finer quality.** `stepsPerToothAngle 30` on the 12T pinion throws
   `Area is not closed!` from `getOutlinePaths`. Nothing in WarpCad should depend on a
   2D-boolean outline being closed at arbitrary sampling.
10. **The internal gear requires `connectedGear`.** Its teeth are cut by sweeping the
    pinion, so a ring gear can't exist alone. `GearSet` also *mutates* both gears it's
    given (`connectedGear` set on each). WarpCad's internal gear is standalone; a mating
    tooth count is an optional input to an interference *warning* only.
11. **Hard-wired constants.** The ring gear's rim is always `4·addendum` thick, and the
    rack's backing bar always `4·addendum` wide. These become parameters with those
    values as defaults. `centerHoleDiameter` is not a gear parameter at all: bores
    belong to the hub op (`core-048`).

---

## Decision 6 — Licence: **clean reimplementation; `LICENSING.md` unchanged**

- `src/core/gear/` is written from the published involute and trochoid equations (the
  involute function and the rack-generation envelope, as in any gear-geometry text such
  as Litvin & Fuentes, *Gear Geometry and Applied Theory*), under AGPL-3.0-or-later like
  the rest of `src/`. It is not a line-by-line port of `gear.js`, so Hessmer's notice
  doesn't attach and `LICENSING.md` needs no new section.
- V1 is used **only as a measurement oracle**. `scripts/generate-v1-gear-fixture.cjs`
  (`core-040`) runs the user's own checkout at `~/src/jscad/jscad-gears` and records
  numbers, the same pattern as `generate-v1-bolt-fixture.cjs` and its siblings. It
  vendors no V1 source. The resulting fixture JSON is measured data, not code.
- **No new dependency**, so `npm run licenses` is unaffected.
- Noted for the user, outside this repo: `@jwc/jscad-gears`' `package.json` declares
  `"license": "ISC"`, while `src/gear.js` carries Hessmer's 2014 **MIT** notice. The
  published package metadata understates that the core file is MIT-licensed third-party
  code. This doesn't affect WarpCad under the recommendation above. It would matter if
  the port option were chosen instead, and then `LICENSING.md` would need a
  third-party-notice section for the MIT text.

---

## Items needing the user's call (before `core-040`)

Each has a recommendation; accepting this page as written accepts all eight.

**Answered 2026-10-16: the recommendation, on all eight.** Each call was put to the user
separately, not as one accept-all.

| # | Call | Recommendation | Alternative |
|---|---|---|---|
| 1 | Profile method | **(b) analytic involute + generated trochoid**, validated against V1 at both default and converged settings | (a) port the sweep into `@jscad/modeling` |
| 2 | Undercut handling | **Model the trochoid**, so 12T pinions keep their printed undercut, and return `warnings: ['undercut']` | Clamp with an automatic profile shift. That changes the user's printed 8T and 12T pinions. |
| 3 | Stored size | **`moduleMm`**, with `circularPitch` as an import alias and V1 `diametralPitch` imported as 1/module (1/mm) | Store `circularPitchMm` as V1 does |
| 4 | Backlash meaning | **Standard**: `backlashMm` is the total circumferential play of a pair, each gear thinned by half of it at the pitch circle, for gear, ring and rack alike. The V1 importer converts: `backlashMm = 2 · backlashV1 / cos α`, so imported geometry is unchanged. | V1-literal: each gear thinned by `backlash / cos α`, with the rack's 2× discrepancy reproduced or patched |
| 5 | Clearance default for *new* gears | **0.25 · module** (ISO 53, dedendum 1.25 m). The importer writes V1's explicit value, or **0 when V1 omitted it**, as the 35° centre gear did. | V1's 0 (dedendum = 1 module: no tip-to-root gap unless set) |
| 6 | Op split | **`profile.gear` + `profile.extrudeLinear`**, twist added to the extrude, Library row as a composite recipe | One native op that returns the solid |
| 7 | Internal gear | **Standalone**: teeth from the external involute with addendum/dedendum swapped; mating tooth count only feeds an interference warning. Accepts that this differs slightly from V1's pinion-shaped tooth spaces. | Keep V1's pinion-swept internal teeth (`connectedGear` required) |
| 8 | Licence path | **Clean reimplementation**; `LICENSING.md` unchanged; V1 used only to measure | Port `gear.js`, adding an MIT third-party notice to `LICENSING.md` |

---

## Sources

- `~/src/jscad/jscad-gears/src/gear.js`, `gearset.js` (`@jwc/jscad-gears` 2.0.0, Hessmer
  MIT header), run read-only; `window-motor/gears.jscad`, `drive-wheel/drive-wheel.jscad`
  and `guide-mount/gears.jscad` for the parameters each project passes.
- `src/core/kernel/registry.js` (`profile.*` ops and the sketch extrude's twist
  pass-through), `src/core/kernel/tessellation.js` (resolution presets),
  `TODO/done/core-035-design-resolution-and-export-resolution.md`.
- npm registry and GitHub API metadata for `@code3d/gears`, `svg-gear-generator` and
  `@jwc/jscad-gears`, pulled 2026-10-10. `@code3d/gears`' licence text was read from the
  published package's `LICENSE`.
- Rainer Hessmer, *Involute Spur Gear Builder* (the algorithm V1 ports), and the
  rack-generation method it cites (lcamtuf, *Guerrilla guide to CNC*, ch. 6), named in
  `gear.js`'s comments.

---

## Addendum — what `core-040` measured (2026-10-16)

Findings from building `src/core/gear/involute.js` against the V1 fixtures
(`src/core/gear/__fixtures__/v1-gears.json`, regenerated by `scripts/generate-v1-gear-fixture.cjs`).
They refine, and in places correct, the measurements above.

- **V1's real pressure angle is `atan(sin α)`, not `α`.** V1's cutter flank rises `sin α` per
  unit of depth where a textbook rack rises `tan α`, so V1 truly cuts at 18.88° when asked for
  20°, 14.06° for 14.5° and 29.84° for 35°. The generator keeps `pressureAngleDeg` as the
  **true** angle (what the Inspector shows and a gear-mesh calculation needs). How the V1
  importer maps V1's `pressureAngle` onto it (keep the number, or convert so the printed shape
  is reproduced) is a **later decision**, taken in the importer task, not here. The parity specs
  pass the converted angle to the generator.
- **Converged-area numbers in "Measured" are corrected.** Those rows were taken at V1's own
  30-32 segments per circle, so V1's tip circle was a polygon and its chord sag cost area on
  wide tips. The fixture re-measures "converged" at arc resolution 720 and the finest sweep V1
  survives. Corrected converged areas (mm²): 36T 1924.637 (was 1923.910), 12T pinion 200.885
  (was 200.742), 32T 1951.968 (was 1950.950), 12T 35° 68.414 (was 68.408), `bf-gear` 30T
  4555.250, `bf-gear` 8T 310.508. Root and outer radii are unchanged.
- **`bf-gear`'s printed 8T is outside the doc's default tolerances.** V1 swept that 45° tooth in
  15° cutter steps, which leaves material in the undercut: the printed shape has about +1.46 %
  area, a root 0.124 mm higher and a pitch flank 0.011 mm thicker than this generator. Its
  converged shape matches within the converged band. The spec therefore checks the default
  shape for this one gear one-sidedly (V1 may print more material, never less) within those
  measured bounds, instead of the +/-1 % default band above.
- **Vocabulary as implemented.** `moduleMm` is the stored size. Tooth thickness on the pitch
  circle is `circularPitch/2 - backlashMm/2` (`cp = pi * module`), per Decision 2's standard
  pair backlash. `clearanceMm` defaults to `0.25 * module` when omitted; pass `0` for V1's
  "no clearance".
- **Outline layout.** The outline is CCW with vertex 0 at -180/teeth degrees on the root
  circle (the middle of the gap before tooth 0). Tooth 0 is centred on +X, and rotating by
  `360/teeth` maps the outline onto itself, so `core-042`'s twist and `core-045`'s loft see a
  fixed vertex correspondence.

---

## Addendum — what `core-041` built, and two questions it leaves open (2026-10-16)

`gear.spur` is now a registry composite (`src/core/kernel/recipes/gear.spur.js`) over a new
native op. It has **no `ui` metadata yet**, so it is not a Library row and an AI turn cannot
create it; `ui-057` attaches the `GEAR_SPUR_UI` block. `library.js` gained the `gear`
section ("Gears") and its row order, empty until then.

- **The native op is `profile.gear`, not `gear.profile`.** The task file's name was written
  before this document fixed the `profile.*` namespace for ops that return a `geom2`. The
  composite keeps `gear.spur`. A second new native op, `profile.circle`, exists for the bore.
- **The bore is cut in 2D, before the extrude.** The recipe subtracts a `profile.circle`
  from the tooth outline and extrudes the result once, rather than extruding and then
  subtracting a cylinder. One extrude gives one watertight solid, and a bore at or above
  the root diameter is refused by name before any geometry is built instead of cutting
  through the teeth. The `bore` named part is still emitted so a pin can be snapped into it.
- **`pitch` is a hidden, full-thickness cylinder** of the pitch diameter, not the
  zero-thickness reference the task file described: a zero-height solid is not a valid
  kernel body. `core-044`'s mesh tools snap to it.
- **The alias table converts values, not only names** (`src/core/gear/aliases.js`):
  `circularPitch` becomes `moduleMm = cp / pi`; `diametralPitch` becomes `1 / dp` (V1's
  value is 1/module in 1/mm, defect 7); V1 `backlash` b becomes `backlashMm = 2b / cos(alpha)`
  (call 4); `clearance` is `0` when a V1-vocabulary record omits it (call 5);
  `toothCount` below 1 (internal) or 0 (rack) is refused, since those are `core-043`'s.
  `center` is refused (the Library's trailing translate places composites) and
  `qualitySettings` is dropped with a note.
- **Open: V1 `pressureAngle`.** The table refuses it with code `pressure-angle-undecided`
  rather than choose between keeping V1's number and converting to `atan(sin a)`
  (the core-040 addendum above). The importer task decides; callers write
  `pressureAngleDeg`.
- **Open: `boreMm` on `gear.spur`.** The `Decision 2` text above says `centerHoleDiameter`
  "is not a gear parameter at all: bores belong to the hub op (`core-048`)", while the
  `core-041` task file (and so this implementation) accepts `boreMm` on `gear.spur`. Settle
  it before `core-048`: either `boreMm` stays as the simple round-bore shorthand and the hub
  op extends it, or it moves out and `gear.spur` loses the param.

## Addendum — what `core-042` decided about helical and herringbone gears (2026-10-16)

- **On a helical gear `moduleMm` and `pressureAngleDeg` are the normal values**, the ones a
  store-bought gear is sold by. The profile is the true **transverse** section: module
  `mn / cos(beta)`, pressure angle `atan(tan(alpha_n) / cos(beta))`, while addendum, dedendum
  and clearance stay in the normal module (a radial height is the same in both planes).
  `backlashMm` stays a transverse value. `normalModuleMm` and `transverseModuleMm` are accepted
  spellings (`src/core/gear/aliases.js`). At beta = 0 nothing changes, record for record.
- **Hand is a sign, not a shape.** `handedness: 'right' | 'left'` flips the twist; both hands
  have the same section. A negative `helixAngleDeg` is refused: write `handedness: 'left'`.
  `helixAngleDeg` is capped at 45 degrees.
- **Twist is derived, never stored.** `gear.spur` computes `t * tan(beta) / r` and hands it to
  `profile.extrudeLinear` as `twistDeg`; the record carries no `twistSteps`. `profile.extrudeLinear`
  gained `twistDeg`, `twistSteps` and `herringbone`; the kernel derives the step count from
  the document resolution (`twistStepsFor`, `minTwistSteps` in `tessellation.js`), floored at
  the Draft resolution's count and capped at 360 (`MAX_TWIST_STEPS`).
- **One run may not twist more than 360 degrees**, and a twisted extrude is refused past a
  2,000,000-vertex budget. A thick, small gear at a steep angle is a worm, which is
  `core-047`'s, not a gear sampled at huge cost.
- **A herringbone is one chevron extrude** (`extrudeFromSlices`: twist up over the lower
  half, back over the upper), never two halves unioned on coincident faces. At beta = 0 a
  herringbone stays a chevron with no twist: a spur gear with a seam, valid and watertight.
- **`grooveMm` (the relief gap at the apex) is not built.** It is refused as an unknown
  parameter by name, and filed as `core-062` (M11, low priority).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
