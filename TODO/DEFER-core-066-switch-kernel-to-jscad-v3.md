---
title: Switch the geometry kernel from @jscad/modeling 2.13.0 to the JSCAD V3 line (deferred)
category: core
kind: feature
priority: low
model: opus
milestone: deferred — JSCAD V3 switch, not on the current roadmap
depends: []
status: deferred
---

**Deferred 2026-10-17:** the owner wants JSCAD V3 but chose to switch later, not now. Nothing
here is scheduled. This file and its children (`core-067` to `core-073`) are the plan for when
the "Defer until" condition below is met. They are deliberately left out of `TODO/ROADMAP.md`'s
milestone tables so `/run-todos` does not pick them up; add rows there when the owner says go.

## Goal

Move WarpCad's geometry kernel to the JSCAD V3 release line (`@jscad/modeling` 3.x, with the
matching `@jscad/stl-serializer` and `@jscad/obj-serializer` 3.x), with **no change a user can
see**: every body, recipe, gear, fillet, sketch extrusion, text label and export comes out the
same within the tolerances the existing parity fixtures and kernel specs already state.

Done means:

- `package.json` pins exact 3.x versions of the three `@jscad/*` packages (no caret, the same
  convention as today).
- `npm test`, `npm run typecheck`, the e2e suite on all three engines, `npm run licenses` and
  `npm run spdx` pass.
- The V1-parity fixtures (below) still pass at their stated tolerances. These were generated
  from V1 (`@jscad/csg`), not from 2.x, so they are an independent reference across the switch.
- The acceptance scenarios listed in `core-073` are re-driven and pass.
- `docs/decisions/geometry-kernel.md` names the version actually installed.

## Why

The owner chose "JSCAD V3" at kickoff (`Initial design.md` §2,
`docs/decisions/geometry-kernel.md`). What was installed is `@jscad/modeling` **2.13.0**, which
JSCAD itself calls V2. The repo calls it "V3" throughout (see "A naming problem" below), so the
mismatch was never visible. V3 was alpha-only then and still is (checked 2026-10-17).

## A naming problem to fix first

In JSCAD's own terms: V1 = `@jscad/csg` (what `jscad-utils`, `jscad-hardware` and the gear
library run on), **V2 = `@jscad/modeling` 2.x**, V3 = `@jscad/modeling` 3.x. This repo uses "V3"
for 2.13.0: `docs/decisions/geometry-kernel.md` (title, line 11, line 101: "V3 (`@jscad/modeling`
2.13.0)"), `CLAUDE.md`'s Stack table ("`@jscad/modeling` (JSCAD V3)"), `Initial design.md`, and
code comments (for example `src/core/kernel/group.js:331`, `:364` and `:490` "The V3 port of
`jscad-utils`' ...", `src/core/kernel/fillet.js:119`). About 44 files say "V3". `core-073` corrects
the decision doc and `CLAUDE.md`; comments can keep saying "V3" once V3 is installed.

## Preconditions — what to check on npm before starting

State on **2026-10-17** (verified with `npm view`, read-only):

| package | `latest` | `alpha` | last 2.x publish | last 3.x publish |
|---|---|---|---|---|
| `@jscad/modeling` | 2.13.0 | 3.0.7-alpha.0 | 2026-02-22 | 2026-08-02 |
| `@jscad/stl-serializer` | 2.1.23 | 3.0.7-alpha.0 | 2026-02-22 | 2026-08-02 |
| `@jscad/obj-serializer` | 2.1.23 | 3.0.7-alpha.0 | 2026-02-22 | 2026-08-02 |

V3 alphas have shipped roughly every 6-8 weeks in 2026 (3.0.3 Jan 18, 3.0.4 Apr 12, 3.0.5 May 16,
3.0.6 Jun 28, 3.0.7 Aug 2). No stable 3.0 date or roadmap was found (web search 2026-10-17; the
JSCAD forum only has alpha release announcements).

Before starting, run and record the output in this file:

```sh
npm view @jscad/modeling dist-tags
npm view @jscad/modeling versions --json | tail -15
npm view @jscad/stl-serializer dist-tags
npm view @jscad/obj-serializer dist-tags
npm view @jscad/modeling@<target> dependencies   # must pin the same @jscad/* line as the serializers
```

Then check:

1. **Is `latest` a 3.x version?** If yes, target it. If no, the owner must explicitly accept a
   pinned alpha (exact version, for example `3.0.7-alpha.0`). Record that decision here with a
   date, as `**Decided YYYY-MM-DD:** ...`.
2. **Do the three packages share one version line?** The 2.x serializers pin
   `@jscad/modeling` exactly (2.1.23 → 2.13.0), and the 3.0.7-alpha.0 serializers pin
   `@jscad/modeling` 3.0.7-alpha.0. Pick versions whose pins agree, or npm installs two kernels.
3. **Re-run the Library-decisions health check** (`CLAUDE.md`, "If a dependency is deliberately
   deferred... re-run the health check when it's actually about to be pulled in"): release
   recency, open/closed issue ratio and maintainer count on `github.com/jscad/OpenJSCAD.org`.
4. **Licences.** 3.0.7-alpha.0 vendors code that 2.13.0 does not have: a port of the Martinez
   2D boolean library under `src/operations/booleans/martinez` (header: "Copyright (c) 2018
   Alexander Milevski"). Earcut was already vendored in 2.x and moved to
   `src/geometries/slice/earcut`. Confirm the target version still passes `npm run licenses`
   and that `THIRD-PARTY-NOTICES.txt` (`build-011`) carries the Martinez notice if the
   generator reads per-file headers. The Martinez port's licence text was not checked.
5. **Re-check every "verified" item in the child TODOs against the target version's source**
   (the findings below were read from 3.0.7-alpha.0; a later alpha or a stable release may have
   changed them, in either direction).

## Defer until

Start when **either**:

- `npm view @jscad/modeling dist-tags` shows `latest` on a 3.x version (a stable V3), **or**
- the owner explicitly decides to pin a named 3.x alpha, recorded here with a date.

And, in both cases, when no milestone that touches the kernel is in flight (the gear milestone
M11 has open tasks today: `core-048`, `core-049`, `core-062`, `ui-057`, `ui-058`). A switch
landing under them makes every kernel regression ambiguous.

## Scope

In scope: `src/` (kernel, recipes, gear builders, render and store code that imports the kernel),
`e2e/` specs that import the kernel in Node, `bench/` scripts, `src/shims.d.ts`, `package.json`
and the lockfile, licence and notice output, the kernel decision doc.

Not affected (checked 2026-10-17):

- **`jscad-utils` 3.2.0 and `jscad-hardware` 1.1.0** (devDependencies). Both depend on V1
  (`jscad-utils` → `@jscad/csg` ^0.3.7 and `@jscad/scad-api` ^0.4.2; `jscad-hardware` →
  `jscad-utils` ^3.1.2). Nothing in them uses the 2.x API. They are used only by the
  `scripts/generate-v1-*-fixture.cjs` generators and by `src/core/kernel/colors.spec.js:4`
  (reads V1's colour table as text), so the switch does not touch them.
- **`jscad-raspberrypi`** is not installed (`node_modules` has no copy). The `raspberrypi.*`
  recipes are ports with V1 reference fixtures, not imports.
- **The gear V1 oracle** (`scripts/generate-v1-gear-fixture.cjs`) resolves `@jscad/csg` from an
  external `jscad-gears` checkout, not from this repo's kernel.
- **mcp/** has no `@jscad` import.
- **Compact binary** (`geom2/geom3/path2.fromCompactBinary`/`toCompactBinary`, removed in V3):
  no use anywhere in the repo.
- **path3** (new in V3): nothing to migrate. It could later replace hand-built 3D polylines, which
  would be a new feature, not part of this switch.
- **JSCAD colours**: WarpCad never calls `colors.colorize` or sets `.color` on a kernel geometry.
  Part colours live on WarpCad's own records and `Part` wrappers (`group.js:545`,
  `rpi-recipe-kit.js:745`), so V3's "preserve color for offset and extrude" does not apply.
- **geom3 / poly3 internals**: V3 keeps `{ polygons, transforms }` and `{ vertices }`, so code
  that reads `.polygons` / `.vertices` directly (`transport.js`, `render/mesh.js`, `meshQuery.js`,
  `watertight.js`, `printPrep.js`, `importMesh.js`) needs no change. The maths functions used
  (`mat4.fromTaitBryanRotation`, `fromVectorRotation`, `fromRotation`, `fromZRotation`,
  `multiply`, `fromTranslation`, `vec3.transform`, `poly3.plane`, `poly3.measureArea`) are
  identical in 3.0.7-alpha.0 apart from module syntax.

## The work, in order

Do it on a dedicated branch (for example `jscad-v3`), not on `main`: after `core-067` the unit
suite fails in the areas the later tasks own, and stays red until they land. Merge only from
`core-073`.

| order | id | what |
|---|---|---|
| 1 | `core-067` | Bump the three packages; replace the default import in 82 files; serializer imports and `src/shims.d.ts`; typings |
| 2 | `core-071` | geom2 is now stored as outlines, not sides; 2D booleans use Martinez (gear profiles, sketch regions, 2D subtracts) |
| 3 | `core-068` | Slices moved and changed shape (`{edges}` → `{contours}`): sketch loft, herringbone, bevel gear |
| 4 | `core-069` | Fillet and chamfer rim: slices, `offset` hole handling, `project`, and `fillet.spec.js`'s probes of the 2.x API |
| 5 | `core-070` | `extrudeRectangular` and `vectorText`: sketch Outline walls and `text.label` |
| 6 | `core-072` | Boolean, measurement and serializer edge semantics; polygon and triangle counts; export watertightness |
| 7 | `core-073` | Full suite on three engines, acceptance re-drive, decision doc, merge |

## How the findings were verified

On 2026-10-17 the published tarballs of `@jscad/modeling`, `@jscad/stl-serializer` and
`@jscad/obj-serializer` **3.0.7-alpha.0** were downloaded (to a scratch directory, not the repo)
and read; the export surface of `src/index.js` was probed under Node and compared with the
installed 2.13.0. The package's `CHANGELOG.md` was read for 3.0.0-alpha.0 to 3.0.7-alpha.0. Each
child file marks every claim as **verified (3.0.7-alpha.0 source)** or **unverified**. Nothing was
run against the WarpCad test suite under V3; every "breaks" below is from reading the source, and
every parity claim is a prediction the child task's tests must confirm.

## Interaction model

n/a — the switch must not change any control, panel or gesture. Any visible change is a parity
failure to fix, not a feature.

## Documentation

n/a for end-user docs (no user-visible change). `docs/decisions/geometry-kernel.md` and
`CLAUDE.md`'s Stack row are updated by `core-073`.

## Affected files

See each child file. Summary: 82 files with `import modeling from '@jscad/modeling'`;
`src/core/kernel/registry.js`, `fillet.js`, `text.js`, `group.js`, `measure.js`, `split.js`,
`transport.js`, `src/core/export.js`, `src/shims.d.ts`, `src/core/kernel/__fixtures__/
tessellationCases.js`, `bench/ai-007-analysis.mjs`, `bench/bundle-modules.mjs`, `package.json`.

## Proposed fix

Follow the order table above. This file is done when the preconditions are recorded, the owner's
go decision is recorded, and the branch exists; the switch itself is done when `core-073` is.

## Effort

L overall (multi-session). Each child is sized to one session.

## Testing

- Unit: the whole Vitest suite, with the V1-parity fixtures as the reference:
  `src/core/kernel/__fixtures__/modify.v1-reference.json`,
  `src/core/kernel/recipes/__fixtures__/*.v1-reference.json`,
  `src/core/gear/__fixtures__/v1-gears.json`, `src/core/gear/__fixtures__/v1-internal-rack.json`.
- E2E: the full suite on Chromium, Firefox and WebKit (kernel results reach the viewport, export
  and persistence).
- Acceptance scenarios and closed-finding repros: listed in `core-073`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
