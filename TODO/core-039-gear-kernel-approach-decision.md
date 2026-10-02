---
title: Decision — how WarpCad generates gear tooth profiles, and the parameter vocabulary every gear op shares
category: core
kind: feature
priority: high
model: opus
milestone: M11
depends: []
status: open
---

## Goal

Four of the user's jscad1 projects build gears, and none of them can be rebuilt in WarpCad
today because the Library has no gear at all. Before any gear op is written, settle *how* a
tooth profile is produced and *what the parameters are called*, once, so `core-040`…`core-049`
don't each re-derive it. "Done": `docs/decisions/gears.md` exists, follows `CLAUDE.md`'s
Library-decisions rules (real options compared, an explicit rejection table), and the user
has read it.

## What the V1 projects actually use (the evidence this decision must cover)

All under `~/src/jscad/`. `@jwc/jscad-gears` v2.0.0 (`jscad-gears/src/gear.js`,
`gearset.js`; an MIT-licensed port of Rainer Hessmer's *Involute Spur Gear Builder*).

| project | what it builds | gear parameters it exercises |
|---|---|---|
| `window-motor/gears.jscad` | 36-tooth drive gear + 12-tooth pinion as a `GearSet`; a separate 12-tooth "centre gear" | `circularPitch = π·50/36`, `clearance 0.5`, `backlash 0.1`, `connectedGear`, `getZeroedShape`, `createShape(1\|2)`; centre gear `circularPitch 2.45`, **`pressureAngle 35`**; extruded 8 mm, with bearing posts and a pin slot |
| `drive-wheel/drive-wheel.jscad` | a **64-tooth internal ring gear** (`toothCount: -64`, `connectedGear` = a 14-tooth pinion) inside a wheel; **four "bevel" gears** in a right-angle train | `circularPitch = π·(id+4)/64` (pitch Ø 82.5); 32-tooth gear `circularPitch π·50/32`, `pressureAngle 20`, `clearance 0.05`, `backlash 0.05`; the "bevel" is `poly2solid(shape.enlarge(-2a), shape, h)` — a uniform scale of the spur outline over a **hard-wired 45°** cone, so the pitch cone is really ≈ 43° — arranged by `rotateY(±90/180)` and `snap(..., ±addendum)` fudge; the pinion's phase is a hand-tuned `rotateAround(..., 215)` |
| `bf-gear/bf-gear.jscad` | 30-tooth + 8-tooth pair, centre holes | `circularPitch 8`, **`pressureAngle 14.5`**, `clearance 0.05`, `backlash 0.05`, `profileShift`, `centerHoleDiameter 4`, `showOption` bitmask |
| `guide-mount/gears.jscad` | two dial wheels via an *older* `Gears.involuteGear` (OpenJSCAD example code) | `outerRadius`, `baseRadius`, `circularPitch 1`, **`twist`** (→ helical) — a different parameter model from jscad-gears |
| `jscad-gears` itself | `Gear` regular / **internal** (`toothCount < 0`) / **rack** (`toothCount 0`); `GearSet` | `profileShift`, `qualitySettings { resolution, stepsPerToothAngle }` |

**Coverage gaps the V1 library never filled** (each is a task in M11): helical and
herringbone gears, a *real* bevel gear and bevel pair, a worm and worm wheel (the
`drive-mount` RA bracket models its worm as a plain `Parts.Cylinder(6, 86)` placeholder),
planetary sets, hubs/keyways/D-flats, and an actual API for mating two gears.

## The questions to answer

1. **Profile generation.** (a) Port Hessmer's rack-cutter simulation (what V1 does: sweep a
   trapezoid cutter, union ~N shapes per tooth, then `_smoothConcaveCorners`); (b) an
   **analytic involute** with a computed root fillet/trochoid (what OpenJSCAD's `gear.jscad`
   and `guide-mount/gears.jscad` do); (c) a third-party package. V1's approach is slow
   (hundreds of 2D unions per gear — unacceptable per `CLAUDE.md`'s kernel-off-main-thread
   rule if repeated per parameter edit) and its internal-gear path *requires the mating
   pinion* as an input (`connectedGear`) — an API wart that makes a ring gear unaddressable
   alone. Lean: **(b), validated against (a)'s output** (area, tip radius, tooth count, root
   radius within a stated tolerance) so the numbers the user has already printed still hold.
2. **Parameter vocabulary.** V1 speaks `circularPitch` (mm per tooth). The rest of the world
   speaks **module** (mm, = circularPitch/π) or diametral pitch (1/in). Pick one canonical
   stored param and say how the others convert at the boundary (`CLAUDE.md`: name every
   conversion). Lean: store `module` *and* accept `circularPitch` as an alias on import so V1
   projects port 1:1; the Inspector shows both.
3. **Where the tooth ends and the gear begins.** One native op that returns a `geom2` outline
   (`gear.profile`) fed to the existing `profile.extrudeLinear` — the very split
   `registry.js` documents for the profile-then-extrude shape — versus one native op that
   does both. Lean: **profile op + extrude**, so helical (twist), herringbone and the bevel
   loft reuse the extrude/loft paths instead of forking them.
4. **Resolution.** V1's `qualitySettings.resolution` / `stepsPerToothAngle` map onto
   `core-035`'s design/export resolution. State the mapping so a gear exports finer than it
   previews, as every other round shape does.
5. **Known V1 defects not to port**, to be listed in the decision so nobody "faithfully"
   reproduces them: `GearSet.gearRatio = gear1.toothCount / gear1.toothCount` (always 1);
   rack length hard-coded to 41 teeth; gear type encoded in the *sign* of `toothCount`;
   `showOption` as a bitmask; the `rotateZ(-90)` baked into `getZeroedShape` so the first
   tooth lands on +Y; the fudge-factor `snap(..., -addendum)` the bevel train needed.
6. **Licence.** `gear.js` carries Hessmer's MIT notice. A reimplementation from the
   published involute equations needs no attribution; a line-by-line port does. Either is
   compatible with AGPL-3.0-or-later, but `LICENSING.md` must say which this is. A new
   dependency's licence goes through `npm run licenses` and is the user's call.

## Interaction model

n/a — a decision record. No user-visible surface.

## Documentation

n/a — no user-visible control. The decision itself lives in `docs/decisions/gears.md`.

## Affected files

- `docs/decisions/gears.md` (new), `LICENSING.md` (only if a port is chosen).

## Effort

M.

## Testing

None to write; the output is a document. It must include a **measured** comparison — run
`~/src/jscad/jscad-gears` for the three gears in the table above (36T/12T `cp = π·50/36`;
32T `cp = π·50/32`; 12T `pa 35`) and record the profile's area, outer and root radius and
tooth-flank width at the pitch circle, because `core-040` uses those as its fixtures.
`TODO/ACCEPTANCE.md`: none (nothing user-visible). No closed finding is extended.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
