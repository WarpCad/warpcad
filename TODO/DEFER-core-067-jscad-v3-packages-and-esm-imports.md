---
title: "JSCAD V3 switch: bump the three @jscad packages and replace the default import in 82 files"
category: core
kind: feature
priority: low
model: sonnet
milestone: deferred — JSCAD V3 switch, not on the current roadmap
depends: [core-066]
status: deferred
---

**Deferred 2026-10-17** with its umbrella, `core-066`. Do not start until `core-066`'s "Defer
until" condition is met and its preconditions are recorded.

## Goal

The first step of the switch, on the `core-066` branch: install the V3 packages and make every
module load. Nothing else changes behaviour here. Done means the app boots and the evaluation
worker starts under V3, `npm run typecheck` reports errors only in the call sites the later tasks
own (listed below), and every unit spec *runs* (failures in areas owned by `core-068` to
`core-072` are expected and listed in the hand-off note, not fixed here).

## Current behaviour (2.13.0)

`@jscad/modeling` 2.13.0 is CommonJS (`"main": "src/index.js"`, no `"type"`, no `"exports"`).
Vite's CommonJS interop gives it a default export, and the repo relies on that:

- **82 files** do `import modeling from '@jscad/modeling'` (one, `e2e/inspector-object-list.e2e.js:5`,
  names it `jscad`). Non-spec ones: `src/core/kernel/{fillet,group,measure,meshQuery,registry,
  sketchFrame,split,text,transport,watertight}.js`, `src/core/kernel/recipes/{importMesh,
  joint.common,kit.anchor,raspberrypi.cameraModule,raspberrypi.piTFT24,rpi-recipe-kit}.js`,
  `src/core/{printPrep,userPart}.js`, `src/render/partThumbnail.js`,
  `e2e/rpi-mounting-holes.e2e.js:5`, `e2e/docs/fillet-chamfer.docs.js:3`,
  `bench/ai-007-analysis.mjs:23`, `bench/watertight-equivalence.mjs:31`. The rest are
  `*.spec.js` files and `src/ai/tools/__fixtures__/fakeRegistry.js:21`,
  `src/core/kernel/__fixtures__/tessellationCases.js:18`. Regenerate the full list with:
  `grep -rlE "^import (modeling|jscad) from '@jscad/modeling'" src e2e bench`.
- `src/core/kernel/evaluationJob.spec.js:128` and `:138` do
  `(await import('@jscad/modeling')).default`.
- `src/core/export.js:60-61` default-imports `@jscad/stl-serializer` and `@jscad/obj-serializer`
  and calls `stlSerializer.serialize(...)` / `objSerializer.serialize(...)` at `:315-316`.
- `src/shims.d.ts:7-22` declares both serializers as CommonJS modules with a `default` export.
- Two files already use named imports, which keep working: `src/core/__fixtures__/
  documentObservation.js:13` (`geometries`) and `src/stores/summarizeBody.spec.js:5`
  (`primitives`).
- JSDoc typedefs use `import('@jscad/modeling').geometries.geom3.Geom3` (and `geom2.Geom2`,
  `maths.vec3.Vec3`) in about 60 places.

## Expected V3 behaviour

Verified (3.0.7-alpha.0 source, 2026-10-17):

- `@jscad/modeling` 3.x is ESM (`"type": "module"`) with
  `"exports": { "node": "./src/index.js", "default": "./dist/jscad-modeling.js" }`.
  **`src/index.js` has no default export**, so `import modeling from '@jscad/modeling'` fails
  (Vite reports a missing default export; Node throws a SyntaxError).
- The serializers are ESM too and export only `{ mimeType, serialize }`, no default. Their
  `serialize` returns the same shape as 2.x: `[ArrayBuffer]` for binary STL, `[string]` for OBJ.
- The runtime exports both the flat V3 API (`union`, `cuboid`, `offset`, `slice`, `path3`,
  `minkowskiSum`, ...) and a **V2 compatibility layer** of namespaces: `booleans`, `colors`,
  `curves`, `extrusions` (plus `extrudeRectangular` and `slice` shims), `expansions`
  (`offset`, `expand`), `geometries` (`geom2` with a `create(sides)` shim, `geom3`, `path2`,
  `poly2`, `poly3` with `fromPoints`/`toPoints` shims), `hulls`, `maths`, `measurements`,
  `modifiers`, `primitives`, `text`, `transforms`, `utils`.
- **The typings do not match the runtime.** `src/index.d.ts` declares namespaces `offsets` and
  `minkowski`, which the runtime does not export, and does not declare `expansions`, which it
  does. `geometries/index.d.ts` declares `slice` and `path3` inside `geometries`; the runtime's
  compat `geometries` object has neither. The compat shims (`extrusions.slice`,
  `extrusions.extrudeRectangular`, `geometries.geom2.create(sides)`) are untyped.
- Node resolves the `node` condition (`src/index.js`); a browser build resolves `default`
  (the single bundled `dist/jscad-modeling.js`). So Vitest and the shipped app may load
  different files of the same version. Unverified: which condition Vitest picks under this
  repo's config, and whether the dist bundle behaves identically.

## Proposed fix

1. Pin the target versions from `core-066` exactly in `package.json`: `@jscad/modeling`,
   `@jscad/stl-serializer`, `@jscad/obj-serializer`. `npm ls @jscad/modeling` must show one copy.
2. Replace every default import with `import * as modeling from '@jscad/modeling'` (and
   `* as jscad` in `e2e/inspector-object-list.e2e.js`). Keep the existing
   `const { booleans, ... } = modeling` destructures. Change `evaluationJob.spec.js:128,138`
   to drop `.default`.
3. `src/core/export.js:60-61`: `import * as stlSerializer from '@jscad/stl-serializer'` (same
   for OBJ). Rewrite `src/shims.d.ts:7-22` for named exports (`export const mimeType: string`,
   `export function serialize(...)`), or delete the shims if the target version ships types.
4. Type references: prefer namespaces that exist in **both** the runtime and the typings
   (`booleans`, `primitives`, `transforms`, `measurements`, `maths`, `geometries.geom2/geom3/
   path2/poly3`, `extrusions.extrudeLinear/extrudeRotate/extrudeHelical/extrudeFromSlices/
   project`, `modifiers`, `text`). Do **not** fix the compat-only uses here; they belong to
   later tasks, which replace them with the flat V3 functions:
   `expansions.*` (`core-069`), `extrusions.slice.*` (`core-068`, `core-069`),
   `extrusions.extrudeRectangular` (`core-070`), `minkowski.minkowskiSum` (`core-069`).
   Record the remaining `npm run typecheck` errors, by file, in the hand-off note.
5. `bench/bundle-modules.mjs:148` maps bundle paths under `@jscad/modeling/src/...` to module
   names. Under V3 the browser build sees one file, `dist/jscad-modeling.js`, so per-module
   attribution collapses. Teach it the dist path and say in a comment that V3 is one module.
6. Regenerate licence and notice output (`npm run licenses`, the `THIRD-PARTY-NOTICES.txt`
   generator from `build-011`); `scripts/third-party-notices.spec.js:88` lists
   `@jscad/modeling` as a direct dependency and must still pass.
7. Re-measure the production bundle (`perf-002` method) and record the kernel's size before and
   after. Unverified whether the V3 dist bundle is larger or smaller once tree-shaken.

## Affected files

- `package.json`, `package-lock.json`
- the 82 files from the grep above (a one-line import change each)
- `src/core/kernel/evaluationJob.spec.js:128,138`
- `src/core/export.js:60-61`, `src/shims.d.ts:7-22`
- `bench/bundle-modules.mjs:148`
- `THIRD-PARTY-NOTICES.txt` output (generated)

## Effort

M (a few hours; mostly mechanical, plus the typings triage).

## Interaction model

n/a — no control changes.

## Documentation

n/a — no user-visible change.

## Testing

- `npm run typecheck`: errors only in the call sites listed in step 4, each named in the
  hand-off note with the task that owns it.
- `npm test`: every spec file loads (no import errors). Record the failing tests by file; every
  failure must map to `core-068` to `core-072`. A failure that maps to none of them is a new
  finding for `core-066`'s list.
- `src/core/kernel/evaluationClient.spec.js` and `src/core/kernel/transport.spec.js` pass
  (they cover the worker boundary and do not use a compat-only API).
- `src/core/export.spec.js` and `src/core/exportJob.spec.js`: export still writes bytes (exact
  triangle counts may change; `core-072` owns that).
- E2E smoke: `e2e/naming.spec.js` and one app spec that drops a cube (Acceptance scenario 1's
  flow) at laptop on Chromium, Firefox and WebKit, to prove the browser build resolves the dist
  bundle and the worker boots on all three engines.
- Acceptance scenarios: none re-driven here (the branch is not expected to be green yet);
  `core-073` re-drives them.
- Closed-finding regression: none specific to this task.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
