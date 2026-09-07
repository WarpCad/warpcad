# TODO/ROADMAP.md — The Ordered Build Plan

Written by `TODO/docs-003-roadmap.md`, per `CLAUDE.md`'s Working Files section: built
from `core-001`/`core-002`'s real implementation experience (not just
`Initial design.md`'s plan) and `ui-001`'s confirmed per-control interaction-model
answers — both are now done, see their retirement notes in `TODO/done/` for what
actually shipped versus what was originally scoped. `docs-003` itself turned out to
have an undeclared prerequisite chain (`build-001` was needed before `core-001` could
run at all); see `TODO/done/build-001-project-scaffold.md`'s own note.

## How to read this file

- Each milestone is a table. A row is either a **real task** (`✅`/plain id links to a
  written `TODO/<id>.md`) or a **reserved id** (no file yet — named here so dependency
  order and numbering are fixed, written as its own `/fix-todo`-sized task when a
  milestone is actually being worked). Both count toward `CLAUDE.md`'s "every
  UI-touching catalog row becomes its own reachability-gated task" rule — a reserved
  row is a placeholder for a future *individual* task, not a batch.
- **Kind** marks Creation vs. Operation per `CLAUDE.md`'s non-negotiable split — never
  mixed in one control, never one dropdown.
- **Acceptance** names which `Initial design.md` §9 / future `TODO/ACCEPTANCE.md`
  scenario (numbered 1-8, per §9) the row plausibly affects, so `docs-004` and every
  later `/fix-todo` run know what to re-drive.

## A granularity decision this file had to make, stated explicitly

`CLAUDE.md` says every §6 catalog row becomes its own reachability-gated task, "not a
deferred batch." Taken completely literally, that would mean seven near-identical
tasks for Cube/Cylinder/Cone/Hexagon/Triangle/Tube/Sphere, each wiring the *same* drag-
to-place mechanism to a different registry op. That reads as fragmentation for its own
sake, not the failure mode the rule exists to prevent (a boolean operation hidden in a
flat feature-registry dropdown, per `PREVIOUS-ATTEMPT.md`). This file instead groups
by **distinct interaction pattern**, not by literal table row: one task wires the
generic "drag-place a primitive" mechanism to all seven base primitives at once (one
`*.e2e.js` spec exercising two of them is enough to prove the *mechanism* is reachable,
which is what the reachability rule is actually protecting), while hardware items,
kit-parts, and Raspberry Pi accessories — which differ from each other in real ways
(snap guides, composite recipes with their own size tables, per-item health risks like
the RPi board's snap-before-measurement problem below) — do get their own rows. This
interpretation is a judgment call, not a re-litigation of the rule; flag it for
revision if a milestone turns out to need finer granularity once it's actually worked.

## Kickoff decisions this roadmap assumes as resolved

- **Geometry kernel: Committed** — `@jscad/modeling` (JSCAD V3). See
  `docs/decisions/geometry-kernel.md` (`docs-001`).
- **Document model / sync: deferred, not resolved** — no CRDT for v1, single-writer
  NDJSON replay log. See `docs/decisions/document-sync.md` (`docs-002`). Revisit only
  if a concurrent-editing use case becomes real (see that doc's own trigger condition).
- **Kernel-adapter pattern: proven** — `core-001` confirmed the composite/native
  split and the V1→V3 Group port against real code, not just source-reading. Its
  retirement note flags one real limit carried into M4 below (a composite recipe
  can't call `group.snap` against geometry it didn't create itself — see M4's note).
- **Replay engine: built and hardened** — `core-002` built the NDJSON + fold engine
  and, in the process, fixed a real pre-existing bug in `core-001`'s registry-override
  path. `Initial design.md` §9 scenario 8 ("remote-load safety") already has a passing
  test against the real kernel (`src/core/replay.spec.js`) — `docs-004` should record
  this scenario as already-passing when it transcribes §9, not merely drafted.

---

## M0 — Kickoff: decisions, spike, scaffold

| id | Task | Status |
|---|---|---|
| `docs-001` | Geometry kernel decision | ✅ done |
| `docs-002` | Document-sync deferral decision | ✅ done |
| `build-001` | Vite + Vue 3 + Vitest project scaffold | ✅ done |
| `ui-001` | Interaction-model Q&A for the six §7 controls | ✅ done |
| `core-001` | Kernel-adapter spike (Group port + `hardware.bolt` end-to-end) | ✅ done |
| `core-002` | NDJSON action log + resilient replay engine | ✅ done |
| `docs-003` | **This file** | ✅ done (this commit) |
| ✅ `docs-004` | Transcribe §9's 8 scenarios into `TODO/ACCEPTANCE.md` | ✅ done |
| ✅ `core-003` | Spike: fillet/chamfer + Bearing native-op viability | ✅ done — **split finding.** Rim fillet/chamfer (V1's real semantics) shipped as `modify.filletRim`/`modify.chamferRim`; arbitrary-edge fillet is **not achievable** on `@jscad/modeling`, and the **OpenCascade.js fork question is now open and awaiting the user** (three costed options in the `docs/decisions/geometry-kernel.md` addendum). Bearing is **composite, not native**, and has no V1 source to port — blocked on a spec table, not on the kernel |

---

## M1 — Viewport scaffold + first primitive creation

Everything below this line needs a viewport to place geometry into — this whole
milestone is `Initial design.md` §8 step 8 and §10's "ships with the first `*.e2e.js`
spec, at all three viewports and all three engines, because it's WebGL from line one."

| id | Task | Kind | Depends | Acceptance |
|---|---|---|---|---|
| ✅ `render-001` | App shell + viewport scaffold (grid, orientation gizmo, nav chrome) | — | `build-001` | ✅ done — **three.js confirmed** as the renderer (`docs/decisions/rendering.md`, compared against Babylon.js/PlayCanvas on real health metrics; Stack row moved to Committed, pinned to `0.185.1` since three.js has no semver). `AppView.vue` is now the real mounted root. Ships the first `*.e2e.js`, running the full 3 viewport × 3 engine matrix. §9 scenario 7 (touch-only nav) **driven by hand and PASS** — that drive caught a light-mode defect (dark scene under light chrome) no test could see; fixed here |
| ✅ `ui-010` | Drag-place a primitive — generic mechanism wired to all 7 base primitives (Cube/Cuboid, Cylinder, Cone, Hexagon, Triangle, Tube, Sphere) | Creation | `render-001` | ✅ done — **§9 scenario 1 driven by hand and PASS** (laptop/Chromium and phone/WebKit). One drag mechanism parameterised by the row's `op`, not seven copies: rows come from the registry's own new `ui` metadata via `src/core/library.js`. Grew two required additions the spec called out up front: the **command layer** (`src/core/document.js` — origin-tagged append log folding incrementally through `core-002`'s `applyAction`, plus thin `src/stores/document.js`/`selection.js` wrappers), and the **4 missing kernel primitives** (`cone`, `triangle`, `tube`, `sphere`; `triangle` needed extruding because upstream's is 2D, `cone`/`tube` compose like `hexagon` already did). Also added the mesh bridge (`src/render/mesh.js`) and working-plane projection (`src/render/pick.js`) nothing had built yet. The hand-drive caught a phone-width defect no test saw — the Library sheet's tab covering the nav chrome — fixed here |
| ✅ `ui-011` | Selection → inspector + dimension lines + gizmo (display only) | — (selection display) | `ui-010` | ✅ done — **§9 scenarios 2 and 6 driven by hand, both PARTIAL PASS** (laptop/Chromium, tablet/WebKit, phone/WebKit), with the undrivable halves named rather than glossed: scenario 2's Inspector-opens-with-fields half passes with a Cylinder standing in for the absent Bolt row, while its property-edit and gizmo-drag steps need `ui-013`/`ui-012`; scenario 6's single-item and 2-selected contracts pass, while group/sub-part pick depth needs `ui-015`/`ui-016`. Scenario 1 re-checked and its previously-deferred "gizmo and dimension lines attach" half now **met**. Screen-space SVG overlays, matching `render-001`'s established pattern rather than a second overlay technology; all the maths lives framework-free in `src/render/annotate.js` (world→screen, asserted to be the exact inverse of `pick.js`) and `src/core/inspector.js` (fields read from the registry's own `ui.defaults`, so an eighth primitive gets a correct Inspector with no component change). Added `src/core/units.js` as the single mm/degree display boundary, and the minimum shift-click multi-select needed to reach control 3's 2+ state. **The hand-drive caught two phone-width defects no test saw** — the Inspector and Library sheets stacking into unreadable mush, and the nav chrome/scale readout sitting behind the sheet's top edge — both fixed here |
| ✅ `ui-012` | Gizmo move/rotate ↔ numeric-field sync per `docs/decisions/interaction-model-qa.md` control 4 | — | `ui-011` | ✅ done — **§9 scenario 2 re-driven and its whole gizmo/field half now PASSES**, scenario 1 re-checked and PASS (laptop/Chromium, tablet/WebKit, phone/WebKit). The task's real content was a **document-layer supersession mechanism**, not gizmo wiring: a transform is an appended record with its own id, so the naive `bodies()` would have rendered the moved body *and* the one it moved from — doubling it on the first drag, the inverse of scenario 1's regression. Chose a **`supersedes` field on the record plus a lineage index** (`rootById` / `terminalByRoot`) that `src/core/document.js` maintains, over a mutable latest-id pointer or deleting the superseded entry, precisely because it **deletes nothing** — every intermediate record stays in `entries` and `scene.byId` for the undo/redo a later task needs; supersession changes only what gets double-rendered. A `Body` now reports its **lineage root** as `id` (so a selection and a three.js mesh survive a move) and its **terminal** record as `recordId` (whose geometry renders), with `op`/`params`/`name` still from the root — which is why `src/core/inspector.js` needed no change to keep showing "a Cube with a 40 mm size" after it moves. Both triggers go through one framework-free `src/core/transform.js`, so a drag and a typed field cannot drift. Also added the `transform.rotate` registry op (degrees in, radians at the registry boundary, turning about the body's own centre rather than the world origin), a live-preview store so the fields track a drag without appending a record per frame, and fatter invisible hit targets for fingertips. **Group selection is explicitly deferred** to whichever task lands group-combine (`ui-015`, M3) rather than guessed at |
| ✅ `ui-017` | Transform gizmo scales to the selection's bounding box, instead of a fixed pixel size | — (gizmo sizing) | `ui-012` | ✅ done — **scenario 2's gizmo-drag half re-driven (still PARTIAL PASS for its own, unrelated, unchanged reasons) and scenario 1's gizmo-attaches half re-checked, both PASS**. New `gizmoSizeForBounds` helper in `src/render/annotate.js` sizes the arm/ring from the selected body's own `boundsMm` half-diagonal converted via `mmPerPixel`, floored at the old fixed 58px/40px (`ui-012`'s tuned grabbable minimum) and capped so an enormous body can't run the gizmo off screen; `Viewport.vue`'s `syncAnnotations()` now computes this per frame instead of using the two constants. `Gizmo.vue` needed no change — its hit targets already derive from the same `arrow.tipX/tipY`/ring points. Found and fixed a real regression in the process: a pre-existing `ui-012` e2e spec pressed the arm's rendered *midpoint*, which the now-longer arm can legitimately extend past — updated to grab near the hub end, which stays inside the body's clear zone by design regardless of arm length. No custom-size primitive placement exists in the UI yet, so both the unit tests and the e2e addition vary on-screen size via zoom instead of a literal large/small pair — see the retired TODO's own note |
| ✅ `ui-018` | Shift+left-drag or right-drag pans the viewport, without switching the nav-chrome mode | — (camera nav) | `render-001` | ✅ done — **scenario 7 re-driven and PASS, scenario 1's click/select half re-checked and PASS**. `Viewport.vue`'s pointer handlers now decide an *effective* per-gesture drag mode: right mouse button always pans; Shift+left pans only once the press's travel exceeds the existing `CLICK_SLOP_PX` threshold, reusing the same click-vs-drag distinction `render-001`'s selection click already relied on rather than a second one that could disagree with it. The button/Shift state is captured once at `pointerdown` (mirroring `pressId`/`pressTravelPx`) so releasing Shift mid-drag can't flip the gesture back to orbit. Added `@contextmenu.prevent` on the canvas so a right-drag's release doesn't pop the native menu — confirmed suppressed by dispatching a real `contextmenu` event in the hand-drive, not just by reading the template. The existing Shift-click additive-select path at the old line 754 is untouched and re-verified with a new regression spec |
| ✅ `ui-019` | Configurable mouse-button mapping for pan/orbit, persisted in `localStorage` | — (camera nav, settings) | `ui-018` | ✅ done — **scenario 7 re-driven and PASS** (hand-driven at the iPad viewport, WebKit, touch-only). New `src/stores/settings.js` — the project's first `localStorage` use — holds a `mouseNavPreset` id (`'shift-or-right-pans'` default, `'left-pans'` alternate), read once behind a try/catch so a blocked/throwing store can never crash startup, written back on every change. `Viewport.vue`'s `ui-018` `effectiveDragMode()` was split into a small `mouseDragOverride(preset)` mapping table plus a `pressPointerType === 'mouse'` gate — added because a touch `PointerEvent` also reports `button: 0`, and without the gate the `left-pans` preset would start panning on an ordinary one-finger touch orbit; confirmed by both a new e2e regression test and the hand-drive. `NavigationChrome.vue` gets a gear icon opening an upward popover (so it can never reach the top-right orientation gizmo) listing the two presets, marking the active one; it reads/writes the settings store directly rather than round-tripping through `Viewport.vue`. This completes **M1** |

---

## M1.5 — Selection/gizmo fixes from hands-on use (land before M2)

Filed 2026-09-06 from direct hands-on driving of the running app — exactly the kind of
signal `CLAUDE.md`'s Verification section says is the loudest in the whole process. Four
are correctness/legibility defects in the M1 gizmo and dimension-line subsystem
(`ui-021`, `ui-022`, `ui-023`, `ui-025`); one is a new selection mechanism the user flagged as
needed once multi-select matters more (`ui-024`); one (`build-002`) is a load-time
defect in the app shell itself, not the gizmo subsystem, and is sequenced **first in
this milestone** per explicit instruction — it's a recurrence of a white-flash-on-load
bug already seen and shelved in the first attempt (`PREVIOUS-ATTEMPT.md`), and
`CLAUDE.md`'s own Browser Support section separately names this exact failure class
from the second attempt too, so it gets fixed before any more UI lands on top of the
same `index.html` shell. Sequenced as their own milestone ahead of M2's new-catalog work
per explicit instruction: fixes to what's already shipped land before scope grows
further, rather than queuing behind M2/M3's reserved rows.

| id | Task | Kind | Depends | Acceptance |
|---|---|---|---|---|
| ✅ `build-002` | Fix bright white flash before first paint (FOUC) on app load | — (load-shell fix) | `build-001` | none directly — first-paint timing isn't covered by an ACCEPTANCE.md scenario; see the finding's own Testing section |
| ✅ `ui-023` | Dimension lines follow the body's own rotated frame, not the world-axis shadow (a rotated cylinder currently shows its axis-aligned bounding box, not its real diameter/length) | — (correctness fix) | `ui-012`, `ui-017` | scenario 1 (dimension-lines-attach half), scenario 2 (gizmo-drag/dimension-tracking half) — re-drive both against a *rotated* body specifically |
| ✅ `core-004` | A body's carried `rotationDeg` is a sum of deltas, but its geometry is their composition — an out-of-order multi-axis rotation history (e.g. Z then X) un-turns wrongly, drifting both the Inspector's rotation fields and `ui-023`'s local-bounds dimension numbers | — (correctness fix) | `ui-012`, `ui-023` | scenario 1 (dimension-lines-attach half), scenario 2 (gizmo-drag/dimension-tracking half) — re-drive both against an *out-of-order multi-axis rotated* body; extends `ui-023`'s subsystem, so re-run that finding's original repro (tilt a cylinder, read diameter/length off the lines) too |
| ✅ `ui-022` | Rotate rings get directional arrows, so they read as drag-to-rotate handles rather than decoration | — (affordance fix) | `ui-017` | none directly; glance at scenario 2's gizmo-drag half on next re-drive |
| `ui-021` | Gizmo arms/rings get a 3D appearance (shading/taper) instead of flat 2D lines | — (visual fix) | `ui-017` | none |
| `ui-024` | Drag a selection box (marquee) across the viewport to multi-select bodies, extending the existing Shift-click multi-select | — (new selection mechanism) | `ui-011` | scenario 1 (click-selects-only-that-item half — confirm plain click still doesn't start a marquee) |
| `ui-025` | Orientation gizmo's axis-label buttons crowd out the triad they annotate — shrink/recede the caps so the current orientation reads off the triad, not just the numeric caption | — (visual fix) | `ui-011` | none directly |

---

## M2 — Hardware + kit-part catalog, snap-guide placement

| id | Task | Kind | Depends | Acceptance |
|---|---|---|---|---|
| `ui-013` *(reserved)* | Drag-place hardware/kit-part with snap guides — generic snap-assist mechanism | Creation | `ui-010` | §9 scenario 3 (snap-placement of a kit assembly) |
| `core-010` *(reserved)* | `hardware.nut` composite recipe, dimensionally diffed against V1 | Creation (op) | `core-001` | feeds `ui-013`'s Library panel |
| `core-011` *(reserved)* | `hardware.washer` composite recipe, dimensionally diffed against V1 | Creation (op) | `core-001` | feeds `ui-013`'s Library panel |
| `core-012` *(reserved)* | Kit-part composite recipes: Board, BoardFrame, Anchor (§6's multi-part-`Group`-as-one-draggable example) | Creation (op) | `core-001` | feeds `ui-013`'s Library panel |

---

## M3 — Booleans, selection-count gating, group/sub-part selection

| id | Task | Kind | Depends | Acceptance |
|---|---|---|---|---|
| `ui-014` *(reserved)* | Boolean operation (Union/Subtract/Intersect) with selection-count gating — the Operations toolbar per `docs/decisions/interaction-model-qa.md` control 5, including Subtract's base/subtrahend visual indicator | Operation, 2+ | `ui-011` | §9 scenario 4 (boolean gating, incl. Subtract-order indicator check per the Q&A doc's flag), scenario 5 (hidden-part boolean — bolt tap-clearance) |
| `ui-015` *(reserved)* | "Combine into group" operation | Operation, 2+ | `ui-014` | feeds `ui-016` |
| `ui-016` *(reserved)* | Group selection vs. clicking a sub-part (`Group.pick` surfaced as a selection behavior, per control 6) | — (selection display) | `ui-015` | §9 scenario 6 (group vs. sub-part selection) |
| `core-013` *(reserved)* | Wire the remaining Group-math operations to the registry: Snap, Align, Enlarge/Fit, Bisect (§6 Operation table) | Operation | `core-001` | feeds later UI tasks that expose these; `.bisect` specifically feeds a future `picam-2`-style case-shell-split task, per §9 scenario 5's own source note |

---

## M4+ — Raspberry Pi accessory catalog, sketch mode, flagged-risk follow-ups

**Read `core-001`'s retirement note before starting `core-014`.** The bolt recipe's
snap offsets were all analytic (the size table gave every height), so it never had to
measure real geometry mid-expansion. A Raspberry Pi board snapping a camera module
against its own mounting holes cannot take that shortcut — it needs to measure
geometry a recipe didn't itself create. `core-001` names two candidate fixes
(two-phase expand→evaluate→measure→re-expand, or promoting `group.snap` to a real op
record the fold resolves) without picking one. **`core-014a` below is that decision
spike; it blocks every other row in this milestone, not just the RPi ones.**

| id | Task | Kind | Depends | Acceptance |
|---|---|---|---|---|
| `core-014a` *(reserved)* | Decide and implement how a composite recipe measures geometry it didn't create (blocks all RPi recipes) | — (architecture) | `core-001`'s flagged limitation | blocks scenario 3's full RPi+camera+screen version |
| `core-014` *(reserved)* | `raspberrypi.bplus` composite recipe (one factory, `model` param — not one draggable per revision, per §6) | Creation (op) | `core-014a` | §9 scenario 3, full assembly |
| `core-015` *(reserved)* | Camera Module recipes (v1/v2/v3, HQ, Arducam HQ — one task, model-select param, mirroring `raspberrypi.bplus`'s "one factory" shape) | Creation (op) | `core-014` | §9 scenario 3 |
| `core-016` *(reserved)* | Touch Display recipes (7", TouchScreen2) | Creation (op) | `core-014` | — |
| `core-017` *(reserved)* | Small-display recipes: Mini PiTFT, PiTFT 2.2/2.4, HyperPixel 4 | Creation (op) | `core-014` | — |
| `core-018` *(reserved)* | Accessory recipes: Active Cooling Fan, HAT, HAT Standoff, Spacer | Creation (op) | `core-014` | — |
| `ui-020` *(reserved)* | Open sketch mode, draw one entity — `src/sketch/`'s first task; `Initial design.md` gives this far less design depth than the 3D catalog, so this needs its own interaction-model Q&A pass before it's scoped further, per `CLAUDE.md`'s ordering rule | Creation | `render-001` | not one of §9's 8 numbered scenarios (drawn from `picam-touch`'s own toggle matrix, which has no 2D sketching) — but `TODO/ACCEPTANCE.md`'s own template header separately lists "drawing one entity" as a cover-at-minimum case, so `docs-004` should add it as a 9th scenario when this task is scoped, not skip it for lack of a §9 number |
| *(unscoped — needs a spec table)* | Bearing **composite** recipe, beside `hardware.bolt`/`nut`/`washer` | Creation (op) | a real bearing spec table from the user | `core-003` found no `Bearing` in `jscad-hardware` to port; geometry is an ordinary tube and mating already works via `core-001`'s `snap`/`align`, so this is blocked on data, not on the kernel |
| *(reserved)* | UI surface for `modify.filletRim` / `modify.chamferRim` — a **face**-oriented rim round/bevel, gated on exactly 1 selection | Operation, 1 | `render-001`, selection/inspector | ops already exist and are tested (`core-003`); this row is only the control, its `docs/` page, and its `*.e2e.js`. The `orientation` param names a face (`z+`), **not** an edge — the UI must not present it as edge selection |
| ⚠️ *(blocked on a user decision)* | Arbitrary-**edge** fillet/chamfer — requires forking to a dual-kernel architecture with `OpenCascade.js` | Operation, 1 | **user answer to the OpenCascade.js question** in `docs/decisions/geometry-kernel.md`'s `core-003` addendum | `core-003` proved this is unachievable on `@jscad/modeling` at any adapter cost — the limit is the geometry representation, not a missing function. Do **not** scope any task promising edge-selected fillets until this is answered |

---

## Completion Log

Backfilled from git history for the six M0 tasks completed before this file existed —
duration is the gap between consecutive commits within this session (a real,
`git log`-sourced measurement, not a live per-task stopwatch — `docs-001`/`docs-002`
predate this session entirely, so their duration is left unmeasured rather than
guessed, per `TODO/BUDGET.md`'s own stated preference for honest gaps over invented
precision). Every row from `docs-003` onward is measured live, per this file's own
convention going forward.

| id | completed | duration |
|---|---|---|
| `docs-001` | 2026-09-05 16:24 | — (pre-dates this session) |
| `docs-002` | 2026-09-05 16:28 | — (pre-dates this session) |
| `ui-001` | 2026-09-05 16:40 | ~12m (commit-to-commit gap) |
| `build-001` | 2026-09-05 16:51 | ~11m (commit-to-commit gap) |
| `core-001` | 2026-09-05 17:21 | ~30m (commit-to-commit gap; includes an Opus subagent delegation) |
| `core-002` | 2026-09-05 17:33 | ~13m (commit-to-commit gap) |
| `docs-003` | 2026-09-05 17:38 | ~5m (commit-to-commit gap from `core-002`; `docs` category has no test-suite preflight to time from) |
| `docs-004` | 2026-09-05 19:35 | ~1h57m (commit-to-commit gap from `docs-003`; `docs` category has no test-suite preflight to time from) |
| `core-003` | 2026-09-05 19:58 | ~21m (measured live from the Step 3 preflight test run at 19:37 UTC) |
| `render-001` | 2026-09-05 21:10 | 29m (measured live from the Step 3 preflight at 20:41 UTC) |
| `ui-010` | 2026-09-06 00:58 | ~3h41m wall-clock from the Step 3 preflight at 2026-09-05 21:17 UTC — but that span includes a session rate-limit interruption of roughly 2h45m during which no work happened, so **actual working time was ~55m**. Recorded both ways rather than quoting the wall-clock alone, which would badly misrepresent this task's cost to anyone pacing future L-effort work off this table |
| `ui-011` | 2026-09-06 01:22 | ~31m (measured live from the Step 3 preflight at 2026-09-06 00:51 UTC) |
| `ui-012` | 2026-09-06 13:09 | 25m (measured live from the Step 3 preflight at 2026-09-06 12:44 UTC). Scoped **L** for the document-layer architecture, and the architecture was real — but it landed inside an M-sized wall clock because the shape was decided by reading `document.js`, `group.js` and `ui-011`'s shipped code before writing a line, rather than by discovering the duplication problem from a failing drive afterwards |
| `ui-017` | 2026-09-06 15:47 | ~23m (measured live from the Step 3 preflight at 2026-09-06 15:24 UTC) |
| `ui-018` | 2026-09-06 16:08 | ~13m (measured live from the Step 3 preflight at 2026-09-06 15:54:49 UTC) |
| `ui-019` | 2026-09-06 16:24 | ~11m (measured live from the Step 3 preflight at 2026-09-06 16:12:59 UTC) |
| `build-002` | 2026-09-06 18:22 | ~5m (measured live from the Step 3 preflight at 2026-09-06 18:17:35 UTC) |
| `core-004` | 2026-09-06 19:18 | ~16m (measured live from the Step 3 preflight at 2026-09-06 19:01:50 UTC). Scoped **M** and landed inside it, but the effort sat somewhere other than where the file expected: the arithmetic was ~90 lines and the "schema and gimbal-lock decisions" the estimate was weighted toward evaporated once the code was read, because the architectural choice the file left open resolved *against* its own recommendation on inspection (a quaternion cannot remove a decomposition the Inspector's three degree fields force anyway — see the retirement note). What the estimate missed instead: two consumers outside the Affected-files list carrying the same defect (`rotateToRecord`'s `target − current`, and the live drag ghost in `useSelectedBody.js`), and the fact that one new unit test passed trivially on first write because the old sum arithmetic is self-consistent with its own inverse — it had to be re-aimed at the geometry before it was a real RED |
| `ui-023` | 2026-09-06 19:02 | ~33m (measured live from the Step 3 preflight at 2026-09-06 18:29:42 UTC). Scoped **L** and the geometry/numerics genuinely were L — matching `@jscad/modeling`'s z-y-x Tait-Bryan convention exactly, new oriented-corner math, two degenerate projection cases — but it landed inside an M wall clock because the rotation convention was read straight out of `node_modules/@jscad/modeling/src/maths/mat4/fromTaitBryanRotation.js` rather than re-derived. The acceptance drive was the expensive half, and it earned its keep: it found the pre-existing `core-004` rotation-composition defect that no test in either suite could see |
| `ui-022` | 2026-09-07 16:17 | ~12m (measured live from the Step 3 preflight at 2026-09-07 16:05 UTC). Scoped **S** and landed inside it — the tangent-direction maths was exactly the one new pure function the file described, reusing `writeArrowhead`'s existing three-point convention. The one real snag: the new `gizmo-ring-arrow-*` data-testids collided with `selection-inspector.e2e.js`'s own `[data-testid^="gizmo-ring-"]` selector (which expects exactly 3 matches, the ring polygons alone) and turned 9 unrelated tests red across the full engine matrix — caught by Step 5's full suite run, fixed by renaming to `gizmo-rotate-arrow-*`, a prefix that doesn't collide |
