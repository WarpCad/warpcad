---
title: Add a design-wide curve resolution setting, with a per-export override
category: core
kind: feature
priority: high
model: opus
milestone: M7
depends: []
status: done
---

## What actually shipped (2026-09-28)

Both surfaces, in this task — **no `io-006` split.** Step 2 found the export-worker re-fold
was reuse, not a sub-project: `createDocument` is framework-free, so `exportJob.js` folds the
document's plain records itself (`refoldRequestOf` → `runExportJob({ refold })`) and then
runs the unchanged `solidsForExport` → `makeWatertight` → serialize path, entirely in the
export worker. `exportClient.cancelExport()` terminates the worker mid-job when the popover
closes, so a Print re-fold really stops.

What differs from the file, and why:

- **Segment counts are rounded up to a multiple of 4** (Step 2 tuning). The spec's own
  formula gives a Ø40 cylinder 45 sides at Normal, an odd count whose bounding box is
  39.95 mm wide — so dimension lines, Snap/Align and the Inspector's size fields would read
  under nominal. A multiple of 4 keeps a vertex on each axis at every preset; it only ever
  adds sides, so every tolerance still holds. The table becomes Draft 12/24/36,
  Normal 16/32/52, Fine 24/52/80, Print 32/72/112 at Ø3/Ø20/Ø50 (raw counts match the
  file's exactly), and the docs example's Ø22 at Fine is 56 sides, not 55.
- **`hardware.bolt` and `kit.anchor` stopped baking `segments` too**, not only the four
  files named. The bolt's tap clearance is exactly the round hole scenario 5's fit case is
  about; left baked, it would have escaped the setting. Recipe *probe* geometry (used only to
  measure placement offsets) stays at a fixed 32, a multiple of 4, so offsets are nominal at
  every preset. A golden-digest oracle captured from HEAD's own sources pins all 41
  library/composite cases byte-identical under `legacy`.
- **No History row for a resolution change.** The file asks for one *and* says the setting
  "is not a timeline record"; History rows are log entries, so those conflict. The explicit
  design decision won: the change is one Undo step labelled `Resolution → Fine` (the Undo
  button's label), the status chip announces it, and the File menu row reads the value.
- **Core `createDocument()` still defaults to `legacy`**, so every pre-existing caller and
  fixture folds byte-identically; the app's store creates new documents at
  `DEFAULT_RESOLUTION` (Normal). An **empty** file reads as Normal, not Legacy (Legacy exists
  to protect old geometry, and an empty file has none), and an empty Normal document still
  serializes to `''`.
- **The File-menu row lives in its own "Design" group** rather than in "This device", whose
  last item stays Export… (`ui-034`'s tested contract).
- **Two defects found on the way, both fixed here.** (1) The drag ghost was folded at legacy
  while the drop commits at the design resolution — now keyed on and folded at it.
  (2) A real `e2e/selection-inspector` failure: at Normal a tap exactly on a shared triangle
  edge of the finer cylinder fell through three.js's non-watertight ray–triangle test, so
  `Viewport.vue`'s pick now retries a miss at ±0.25 px (`render/pick.js`
  `PICK_OFFSETS_PX`); logged in `TROUBLESHOOTING.md`. (3, WebKit-only, found by the new
  e2e) Safari ignores `min-height` on a native `<select>`, so the Export popover's Resolution
  select uses `appearance: none` with an explicit 44 px height.
- **Changing the design resolution re-folds on the main thread**, like every row action and
  Open (76 ms median on the 24-body scene at Print, `bench/results/2026-09-28-core-035.md`);
  there is no separate pending indicator because the fold is synchronous. `core-032` owns cold
  folds off the main thread; the export override is the off-thread path.

## Goal

A user can set how finely curved geometry is faceted: once for the whole design, and
again, higher if they want, at the moment they export to a fixed mesh (STL / OBJ /
glTF). This is the WarpCad equivalent of the `resolution` parameter every JSCAD V1
project in `~/src/jscad/` carried, which set `CSG.defaultResolution2D/3D` before
building so circles, cylinders, spheres and round extrusions came out smoother for a
print than for a preview.

**Why this matters beyond looks — it is a fit problem.** A tessellated circle has its
vertices *on* the nominal circle and its flats *inside* it, so every faceted hole
prints tighter and every faceted peg prints looser than its dimension says. Across the
flats, the diameter is short by `D·(1 − cos(π/n))`:

| Ø (mm) | n = 16 | n = 32 (today, everywhere) | n = 64 | n = 128 |
|---|---|---|---|---|
| 3 | 0.058 | 0.014 | 0.004 | 0.001 |
| 8 | 0.154 | 0.039 | 0.010 | 0.002 |
| 20 | 0.384 | 0.096 | 0.024 | 0.006 |
| 50 | 0.961 | **0.241** | 0.060 | 0.015 |

A fixed segment count gets worse as the diameter grows. A Ø50 bore at today's 32
segments is a quarter-millimetre undersize across the flats, which is enough to stop a
bearing or a mating part from seating. A Ø3 screw hole at the same count is fine.

**Done looks like:**

1. The document carries a `resolution` setting that saves and reloads with the
   project, and changing it is one undoable step.
2. Every tessellation-intent curve in the kernel (primitive cylinders, cones,
   spheres, tubes, round-rect profiles, fillet rims, recipe cylinders) takes its
   segment count from that setting instead of a hardcoded constant.
3. The Export popover has a **Resolution** control that defaults to the design's
   setting and can be raised for this export only. The exported file really is
   faceted at the chosen resolution, while the document and viewport stay at the
   design setting.
4. An existing project file with no `resolution` field folds **byte-identically** to
   today, so nothing already saved changes shape when it is reopened.

## Design decisions this file makes (object at Step 2 if wrong)

- **Presets are chord tolerances, not fixed segment counts.** V1's levels were fixed
  counts. That is exactly what produces the growing error in the table above. Each
  preset instead sets a maximum deviation from the true circle, in mm, and derives
  `n = ceil(π / acos(1 − tol / r))`, clamped to `[minSegments, maxSegments]`. The
  floor keeps small holes round enough that a bolt doesn't catch on facets, and the
  ceiling stops a Ø300 disc from producing a triangle count that stalls the worker.
  Starting values (tune at Step 2 against real prints if the user has them):

  | Preset | tol (mm) | min n | resulting n at Ø3 / Ø20 / Ø50 |
  |---|---|---|---|
  | Draft | 0.10 | 12 | 12 / 23 / 36 |
  | Normal | 0.05 | 16 | 16 / 32 / 50 |
  | Fine | 0.02 | 24 | 24 / 50 / 79 |
  | Print | 0.01 | 32 | 32 / 71 / 112 |

  `maxSegments` is 256 for all presets. Note that Normal gives the same count as today
  at Ø20.
- **Old files keep today's geometry.** A document with no `resolution` field reads as a
  `legacy` preset that means "fixed 32, exactly as before". The control shows it as
  *Legacy (32 segments)* only while it is the active value. New documents default to
  **Normal**.
- **An explicit `segments` param on a record wins.** That is the user's (or MCP's)
  deliberate choice and is not overridden. **But shape-intent counts are not
  tessellation:** `primitive.hexagon`'s `segments: 6` (and any hex nut / hex head
  built the same way) is geometry and must never follow the setting. It is already
  hardcoded in the registry rather than read from params, which keeps it out of
  scope, but a test must pin it.
- **Recipe constants move to the policy.** `rpi-recipe-kit.js`'s `SEGMENTS`,
  `kit.board.js`'s `DEFAULT_PROFILE_SEGMENTS` and `fillet.js`'s `DEFAULT_RIM_SEGMENTS`
  exist only to pin V1's `defaultResolution2D`. Where a recipe bakes `segments:
  SEGMENTS` into the *params* of the steps it emits (`rpi-recipe-kit.js:197,337`),
  those steps would be treated as explicit and escape the setting. Drop the baked
  value so the policy applies, and still get byte-identical output under `legacy`.
- **The setting lives on the project state line**, next to `suppressed` and
  `rollbackAt` (`src/core/project.js`). It changes through a new document command
  `setResolution(preset, transaction)` modelled directly on `setSuppressed`, with a
  new undo-entry kind beside `'replace' | 'suppress' | 'reorder' | 'rollback'`. It is
  not a timeline record, because it is a property of the whole design and not a step
  in its history.
- **The design setting drives the viewport too.** One setting, one truth. Draft
  is the answer for someone whose viewport is slow, and the export override is the
  answer for "preview coarse, print fine".

## Interaction model

Two surfaces.

**A. Design resolution**

- **Precondition** — none. It is a document property, available with or without a
  selection, and while History is previewing it is disabled with that reason, like
  every other document write.
- **Trigger** — header **File ▾ → Resolution…**, which opens a small popover built
  the same way as `ExportPopover.vue` (same backdrop, Escape and topmost-dismiss
  rules via `stores/fileMenu.js`). Inside: a radio group Draft / Normal / Fine /
  Print (plus Legacy only when active). Each option has a one-line hint showing what
  it means at a reference size, e.g. *"Fine — Ø20 hole: 50 sides, ≤0.02 mm off"*,
  and changing the choice commits it. The menu item's own label shows the current
  value (*Resolution: Normal*), so the setting can be read without opening anything.
- **Feedback** — curved bodies in the viewport visibly re-facet once the re-fold
  lands. A History row *Resolution → Fine* appears and Undo reverts it. While the
  re-fold is running, the existing pending indicator shows.
- **Placement** — n/a (no geometry is created).
- **Selection response** — n/a.
- **Selection count** — n/a.
- **Small-screen behavior** — same popover, anchored under the File menu, full-width
  at 390px as `ExportPopover` already is. Radio rows meet the 44px tap-target
  minimum. It must not stack under the Inspector sheet (the class of bug `ui-036`
  and `ui-043` fixed).

**B. Export resolution override**

- **Precondition** — the Export popover's existing availability rules
  (`stores/exportDialog.js`), unchanged.
- **Trigger** — a new **Resolution** select in `ExportPopover.vue`, under Format:
  *Same as design (Normal)* (the default), then Draft / Normal / Fine / Print. The
  choice is remembered for the session, not written to the document.
- **Feedback** — when the choice differs from the design setting, a note line reads
  *"Re-evaluating at Print resolution — the design itself is unchanged."* The
  existing `export-pending` status covers the re-fold, and the summary line reports
  the resulting triangle count, which is how a user can see the setting did
  something.
- **Placement / Selection response / Selection count** — n/a (Scope already
  handles selection-vs-scene).
- **Small-screen behavior** — same as the rest of the Export popover.

## Documentation

- **Page** — new `docs/resolution.md` (add it to the sidebar per
  `.claude/commands/docs.md` Step 4). Update `docs/export.md` with the override and
  link to the new page from its Format section.
- **Example** — *"Your Ø22 bearing seat is printing tight. Open **File ▾ →
  Resolution…** and pick **Fine**: the seat is now drawn with 55 sides and is at most
  0.02 mm under size. To keep the viewport fast and only print fine, leave the design
  on **Normal** and instead choose **Print** in **File ▾ → Export… → Resolution**
  before clicking Export."* Include the fit table from the Goal (in user terms:
  "holes print small, pegs print loose, bigger circles more so") and a sentence
  explaining that resolution cannot fix printer over-extrusion. That is a clearance
  allowance in the design, not a facet count.

## Affected files

- `src/core/kernel/tessellation.js` — **new**: preset table, `segmentsFor(radiusMm,
  policy)`, `legacy` policy; pure functions.
- `src/core/kernel/registry.js` — every `params.segments ?? DEFAULT_SEGMENTS` reads
  the policy from the evaluation context instead (cylinder, cone, sphere, tube, round
  rect, and the rest at `:523,551,633,648,682,930`).
- `src/core/kernel/fillet.js`, `recipes/kit.board.js`, `recipes/kit.boardFrame.js`,
  `recipes/rpi-recipe-kit.js` — constants become policy reads (see decisions above).
- `src/core/replay.js` / the fold entry point — thread the policy through the
  evaluation context.
- `src/core/document.js` — `setResolution` command, undo kind, state accessor.
- `src/core/project.js` — state-line field. Absent means `legacy`. Reject an unknown
  preset with a `ProjectFormatError`.
- The `core-031` fold cache and the `core-030` undo-restore snapshots — **the policy
  must be part of the cache key / snapshot validity check**, or changing resolution
  serves stale geometry from cache. This is the easiest thing to get wrong in this
  task.
- `src/core/exportJob.js`, `export.worker.js`, `exportClient.js` — when the export
  policy differs from the design's, the worker receives the **records** (not packed
  evaluated bodies), folds them at the export policy, then runs the unchanged
  `solidsForExport` → `makeWatertight` → serialize path. Confirm at Step 2 whether
  the `core-030` document-fold path can run inside the export worker. If it can't,
  that is the sub-problem to solve here, since a Print-resolution re-fold must not
  run on the main thread (`core-032` is the same concern for cold folds).
- `src/stores/exportDialog.js`, `src/components/storage/ExportPopover.vue` — the
  override control.
- `src/components/storage/ResolutionPopover.vue` + a store — **new**, the File ▾
  surface.
- `docs/resolution.md` (new), `docs/export.md`.

## Out of scope (name them so they aren't silently assumed)

- **Hole compensation** (circumscribing a polygon so its flats sit *on* the nominal
  circle, as in "polyholes"). This is a different, per-feature fix for the same fit
  problem and worth its own TODO if wanted. This task only reduces the error; it
  doesn't cancel it.
- A free-form numeric tolerance field. Presets first, and a Custom row can come later
  if presets prove too coarse.
- Per-body resolution overrides.

## Effort

L. It spans core, fold cache, worker, persistence, two UI surfaces and docs. If Step 2
finds the export-worker re-fold is itself L, split it: this file keeps A plus the
core policy, and a new `io-006` owns B.

## Testing

- **Unit (Vitest, `toBeCloseTo` with explicit tolerance):**
  - `tessellation.spec.js`: `segmentsFor` against the preset table above (±0
    segments, since it's integer math); max chord deviation ≤ tol for each preset
    at Ø1, Ø3, Ø20, Ø50, Ø300. Degenerate cases: r → 0 and r < tol (floor applies,
    no NaN from `acos` of an out-of-range argument), r = tol / 2, huge r (ceiling
    applies).
  - Registry: a cylinder under `legacy` produces the **identical polygon set** to
    today's `DEFAULT_SEGMENTS` path; `primitive.hexagon` stays 6 sides under every
    preset; an explicit `segments: 7` on a record wins over every preset.
  - Recipes: every `raspberrypi.*` and `kit.*` recipe is byte-identical under
    `legacy` (the existing fixtures in `src/core/kernel/__fixtures__/` are the
    oracle).
  - `project.spec.js`: round-trip with and without the field; an old file with no
    field loads as `legacy`; an unknown preset is rejected.
  - `document.spec.js` / `history.spec.js`: `setResolution` is one undo step, is
    origin-scoped (a non-`local` origin doesn't land on the local stack), and a
    fold-cache hit after the change never returns the old tessellation.
  - `exportJob.spec.js`: an override re-folds and the STL triangle count rises
    accordingly; the design document is untouched afterwards; watertightness (0
    unmatched edges) holds at Print for the cube-minus-Ø6-bore fixture and for a
    sphere ∪ cube.
- **E2E (real app at `/`):** `e2e/resolution.e2e.js` — place a cylinder, File ▾ →
  Resolution… → Fine, assert the History row and the menu label, Undo reverts; then
  File ▾ → Export… with Resolution = Print, intercept the download, and assert the
  STL triangle count is higher than a same-scene export at Same-as-design. Runs at
  **all three reference viewports** (new popover + Export popover change) with a
  snapshot at each, against **Chromium, Firefox and WebKit**, because it touches
  kernel worker output, persistence and a rendered viewport.
- **Perf:** measure a Print-resolution export of the 24-body scene and a Ø100 sphere
  with `.claude/prompts/perf-benchmark.md`, before and after. Report the numbers.
  The export must stay off the main thread and remain cancellable through the
  existing pending path.
- **Acceptance scenarios to re-drive:** 1 (two primitives: still render at the
  default), 5 (bolt tap-clearance: the fit case this exists for), 10 (save, reload,
  nothing changed, now including the setting), 11 (export and open elsewhere, now
  also at an override), 12 (history edit replays, since a new undo kind shares that
  surface).
- **Closed findings whose repros re-run:** `io-004` and `io-005` (open edges /
  T-junctions). Higher segment counts produce far more near-collinear vertices for
  `makeWatertight` to handle, so re-run both original repros at Print, not only
  Normal.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
