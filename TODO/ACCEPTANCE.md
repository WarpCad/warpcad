# TODO/ACCEPTANCE.md — Fixed Acceptance Scenarios

Written at kickoff (`docs-004`), in the same session as `TODO/ROADMAP.md` and after
the interaction-model walkthrough (`docs/decisions/interaction-model-qa.md`, `ui-001`),
per `CLAUDE.md`'s Verification section. This is a fixed, small set — see "Keep this
list fixed and small" below before adding to it.

## What this file is for

The second attempt shipped an app with passing tests and a clean reachability audit
where adding an item overwrote the previous one, the scene was too dark to see
anything in, sketch mode never opened, and dragging in the viewport only ever rotated
the grid. Every one of those bugs sat underneath green test suites, because a scripted
Playwright spec only proves its own author's click sequence still works — it doesn't
reproduce what happens when a person free-forms the UI.

This file holds a small, fixed set of named end-to-end use cases — 5 to 10 of them —
that get **driven, not scripted**: actually launching the app (the `run` skill) and
interacting with it the way an exploring human would, then reporting PASS/FAIL. Every
`/fix-todo` run re-drives whichever of these scenarios plausibly touch the subsystem it
just changed (see that command's own step on this), and a regression against any one of
them is the loudest signal in the whole process — louder than that task's own green
test suite.

Keep this list fixed and small. It is not a growing backlog — new use cases get added
here only when a whole new capability class lands (e.g. sketch mode, once it exists),
not one per task.

## Writing the scenarios (do this at kickoff)

Model each scenario on the second attempt's own stop note: *"adding a cube and a
sphere and subtracting one from the other."* Concrete, few steps, no scripted
assertions — just what a person would actually do and what they'd expect to see. Cover
at minimum:

- Placing two independent primitives and confirming both remain visible (this exact
  scenario caught a real regression in the second attempt where placing a second body
  silently hid the first).
- A boolean operation between two solids, start to finish.
- Dragging a component/library part in and confirming it renders complete, not partial.
- Opening whatever the 2D-sketch entry point turns out to be, and drawing one entity.
- Navigating the viewport using touch-only input (no keyboard, no mouse) — orbit, pan,
  zoom, and a camera-orientation snap.
- Anything else specific to a capability this project actually commits to that a human
  would try first, in the first five minutes of opening the app.

## Scenario template

```markdown
### <short name>

**Steps**: numbered, concrete, as a human would perform them — not a selector list.
**Expect**: what confirms success, in plain terms a non-developer could judge.
**Last run**: <UTC timestamp> — PASS | FAIL (<note if FAIL>)
```

## Scenarios

Transcribed from `Initial design.md` §9's 8 drafted candidates, per `docs-004`, with
each scenario's Steps rewritten against `docs/decisions/interaction-model-qa.md`'s
confirmed control names/gestures/selection counts (from `ui-001`) rather than §9's
provisional wording. Two scenarios (2 and 4) incorporate the Q&A doc's own flagged
refinements — see each scenario's note.

### 1. Two independent primitives

**Steps**:
1. Open the app to an empty scene.
2. From the Library panel's "Primitives" section, pointer-down on the "Cube" row and
   drag into the viewport; release over the grid to drop it.
3. From the same section, pointer-down on the "Cylinder" row and drag to a different
   point in the viewport; release to drop it.
4. Click empty viewport space to clear selection, then click the cube, then click the
   cylinder.

**Expect**: Both the cube and the cylinder remain visible in the viewport after both
drops (dropping the second body must not hide or replace the first). Clicking each one
individually selects only that item (gizmo and dimension lines attach to whichever was
just clicked, not both at once).

**Last run**: 2026-09-06 00:52 — PASS (hand-driven against `ui-010`'s drag-placement, twice:
laptop 1440×900 in Chromium, and phone 390×844 in WebKit — the engine an iPhone actually
runs — where opening the Library sheet is a real precondition step. Both drives: dragged
Cube in, then Cylinder to a different point; **both stayed visible**, and the first body's
millimetre centre was byte-identical before and after the second drop, so the second
attempt's "new body replaces the old" regression is genuinely absent rather than merely
not obvious. Each drop selected only the new item. Clicking empty grid cleared the
selection; clicking the cube selected only the cube; clicking the cylinder moved the
highlight to the cylinder alone — never both at once. Beyond the scenario's own steps: the
drags were driven with a wandering, jittery path rather than a straight line, and an orbit
between operations confirmed both solids are really in the scene from another angle rather
than a one-frame artefact. Console clean in both drives. **The drive found one real defect
the test suite could not see**: at phone width the Library sheet's collapsed tab sat on top
of the navigation chrome's bottom row and the scale readout, partly covering controls
scenario 7 depends on. Fixed in this task — the viewport's overlays now inset above the
tab — and re-driven with a screenshot confirming the whole nav pad and readout are clear.
Gizmo and dimension lines are not part of this pass: they are `ui-011`'s contract, so the
"gizmo and dimension lines attach" half of Expect is deferred, not claimed.)

**Re-checked**: 2026-09-25 21:15 UTC (`ui-037`) — PASS at laptop 1440x900 Chromium (real mouse) and phone 390x844 WebKit (real touch taps). Re-driven because this task changes how **every** body gets its material: `Viewport.vue`'s selection paint now goes through `paintBodyObject` and a colour-keyed material cache, and a new `style.recolor` supersedes-record kind rides the shared document fold. Cube, then Cylinder, dropped on wandering, jittery paths. **Both stayed visible** (`Cube 1,Cylinder 1`), and the first body's bounds were byte-identical strings before and after the second drop (`-143.72,-24.72,0.00,-103.72,15.28,40.00` at laptop, `-107.73,11.27,0.00,-67.73,51.27,40.00` at phone). Each drop selected only the new item. Tapping empty grid cleared the selection. Tapping the cube selected only `Cube 1`, with the gizmo attached. Tapping the cylinder moved the selection to `Cylinder 1` alone. The screenshot shows bodies nobody recoloured drawing exactly as before: palette blue, amber when selected. Console clean.

**Re-checked**: 2026-09-21 19:27 UTC (`perf-001`) — PASS at laptop 1440x900 Chromium and phone 390x844 WebKit. Re-driven rather than reasoned about, because this task introduces the repo's **first worker boundary**, and `CLAUDE.md`'s Verification section names scenario 1 as the check for exactly that — even though the boundary is entered only from the export path and the document/viewport path is untouched. Dragged with wandering, jittery pointer paths (sinusoidal jitter on every move, not a straight line), onto drop points proven to reach the grid at 390 px — a drop below about `fy` 0.45 at phone width misses the grid entirely and silently places nothing, so those points are deliberate. **Both bodies stayed visible** (`data-body-count=2`, `Cube 1` and `Cylinder 1`), and the first body's millimetre bounds were **byte-identical strings** before and after the second drop — `-124.60,-49.37,0.00,-84.60,-9.37,40.00` at laptop, `-87.06,-11.83,0.00,-47.06,28.17,40.00` at phone — so the second attempt's "new body replaces the old" regression is genuinely absent rather than merely not obvious. Clicking empty grid cleared the selection; clicking the cube selected **only** the cube, with the Inspector reading `Cube 1`; clicking the cylinder moved it to `Cylinder 1` alone, never both at once (`data-selected-count=1` each time). Console and page errors: none, in both drives.

**Re-checked**: 2026-09-21 16:52 — PASS (`io-005`). Re-driven rather than reasoned about, because that task edits `src/render/mesh.js` — the bridge every body the viewport draws goes through — even though its change is opt-in and the export path is the only caller that opts in. Two independent checks, both done: (a) **measured**, `geom3ToBufferGeometry`'s default output is **bit-identical** to its pre-`io-005` output on four shapes including a `raspberrypi.bplus` (every float compared with `Object.is`; 1,440 / 1,602 / 4,707 / 1,872 floats), at an unchanged 0.007-0.018 ms per rebuild against the 16 ms frame budget; (b) **driven**, at laptop 1440x900 Chromium and phone 390x844 WebKit, a Cube then a Cylinder dragged in on wandering, jittery paths to different points. **Both stayed visible** (`data-body-count=2`), and the first body's millimetre bounds were byte-identical strings before and after the second drop (`-130.78,-34.25,0,-90.78,5.75,40` at laptop; `-95.75,0.79,0,-55.75,40.79,40` at phone). Clicking empty grid cleared the selection; clicking the cube selected only the cube and the Inspector read `Cube 1`; clicking the cylinder moved it to `Cylinder 1` alone, never both, with the transform gizmo attaching to whichever was picked. Console clean in both drives.

**Re-checked**: 2026-09-06 01:15 — PASS, and **the deferred half is now met** (`ui-011`).
A quick re-drive rather than a full one, since that task's changes are additive selection
*response* and touch no placement logic: at laptop/Chromium, tablet/WebKit and
phone/WebKit, a Cube then a Cylinder were dragged in with wandering, jittery paths; both
stayed visible, the first body's millimetre centre was unchanged after the second drop,
and each drop selected only the new item. Clicking empty grid cleared; clicking each solid
in turn selected only that one. The previously-deferred half of **Expect** now holds too —
the gizmo and all three dimension lines attach to whichever body was just clicked and to
that body alone, never to both at once, confirmed by watching them retarget between the
two solids and by orbiting with one selected. Console clean.

**Re-checked**: 2026-09-06 13:12 — PASS (`ui-012`). Re-checked in full rather than
glanced at, because that task replaced how `document.bodies()` decides what to render —
exactly the subsystem this scenario's regression lives in. Driven at laptop/Chromium and
phone/WebKit: a Cube then a Cylinder dragged in on wandering, jittery paths; **both stayed
visible**, and each drop selected only the new item. Clicking empty grid cleared; clicking
each solid in turn selected only that one, with the gizmo and dimension lines retargeting.

**The new half, and the reason for the re-check**: with the Cube selected, its gizmo's X
arrow was dragged. Afterwards there were still **exactly two bodies, not three** — the
moved Cube kept its own id (`cuboid-1`) rather than becoming a second entry alongside the
record that moved it. That is the duplication regression `ui-012`'s supersession mechanism
exists to prevent, and it is genuinely absent rather than merely not obvious. The
**untouched Cylinder's millimetre centre was byte-identical** before and after
(`-24.05,143.77,25.00` at laptop, `-57.80,110.02,25.00` at phone), so there is no
cross-talk through the document fold. Snapping to the front view afterwards showed both
solids still present from another angle rather than a one-frame artefact. Console clean in
both drives.

**Re-checked**: 2026-09-06 15:44 — PASS (`ui-017`, quick glance only, as its own Testing
section calls for — the gizmo-attaches half is the same overlay code path `ui-017`
resized, not new selection logic). Two cubes dropped close enough together that their
now-larger gizmos plausibly overlap; clicking each in turn retargeted the gizmo's
`data-origin` cleanly from one body to the other every time (`435.9,407.5` →
`553.2,407.5`), never both at once. Screenshots taken at each step confirm this visually —
each body's own gizmo and dimension lines attach to it alone.

**Re-checked**: 2026-09-06 18:12 — PASS (`ui-018`, clicking/selection half only, per that
task's own Testing section — the new Shift/right-button pan overrides share the same
pointer-handling code path scenario 1's clicks depend on). Hand-driven at laptop
1440×900 in Chromium: a Cube and a Cylinder dropped with wandering, non-straight-line
paths; both stayed visible (`data-body-count` read `2`). Clicking empty grid cleared the
selection; clicking the cube selected it alone (count `1`); clicking the cylinder with no
modifier replaced the selection rather than adding to it (count stayed `1`, not `2`) —
confirming `ui-018`'s new click-vs-drag travel gating didn't make a plain click
accidentally additive. Shift-clicking the cube on top of the cylinder selection then
correctly grew the count to `2`, screenshotted with the Inspector showing "2 selected".
Console clean.

**Re-checked**: 2026-09-06 18:52 — PASS (`ui-023`). Re-driven at laptop 1440×900 in
Chromium and phone 390×844 in WebKit. A Cube then a Cylinder dragged in on deliberately
wandering paths (with an overshoot and a doubling-back): **both stayed visible**, and the
cube's millimetre centre was byte-identical before and after the second drop
(`-65.69,-20.42,20.00` at laptop, `-41.41,3.85,20.00` at phone). Clicking empty grid
cleared; clicking each solid in turn selected only that one, with the gizmo and all three
dimension lines retargeting — the cube's 40/40/40 giving way to the cylinder's 40/40/50.

**The half this task is about, and the half no prior drive of this scenario had ever
exercised**: the dimension lines were then read off a **rotated** body. Tipping the
cylinder with a real X rotate-ring drag turned it to `-34.61°` and the three lines still
read **40 / 40 / 50** — its diameter, its diameter and its length — where before this
task they would have read the growing world-axis box the tilted cylinder fits inside.
Typing an exact `62°` held the same three numbers, and a screenshot confirms the 50 mm
line now runs diagonally *down the cylinder's own axis* rather than staying vertical.
The Inspector's Size row read the identical 40/40/50, so panel and overlay cannot
disagree. Orbiting with the tilted body selected left all three numbers unchanged.
Console clean in both drives.

**Re-checked**: 2026-09-06 19:16 — PASS (`core-004`). Re-driven at laptop 1440×900 in
Chromium and phone 390×844 in WebKit, because this task changes what the carried rotation
*means* and the "gizmo and dimension lines attach" half of **Expect** reads off it. A Cube
then a Cylinder dragged in on deliberately wandering paths (overshoot, doubling back,
per-step jitter): **both stayed visible** (`2` bodies), and the cube's millimetre centre
was byte-identical before and after the second drop — `-65.69,-20.42,20.00` at laptop,
`-150.84,71.78,20.00` at phone. Clicking empty grid cleared; clicking each solid in turn
selected only that one, `data-selected-id` moving cleanly `cuboid-1` → `cylinder-2`, with
the gizmo and all three dimension lines retargeting and the cube's 40/40/40 giving way to
the cylinder's 40/40/50. Never both annotated at once. Console clean in both drives.

**Re-checked**: 2026-09-07 17:07 — PASS (`ui-021`, quick glance only, as its own Testing
section calls for — this task only re-textures the gizmo's arms/heads/rings with SVG
gradients and a drop-shadow filter, the same overlay code path this scenario's "gizmo
attaches" half depends on, and touches no placement or selection logic). A Cube then a
Cylinder dropped in the viewport: `data-body-count` read `2` immediately after both
drops, with distinct centres (`-94.18,2.36,20` and `45.65,5.4,25`). Clicking each in turn
retargeted the gizmo cleanly between the two, screenshotted at each step. Console clean.

**Re-checked**: 2026-09-07 18:41 — PASS (`ui-024`, click-selects-only-that-item half
only, per that task's own Testing section — the new marquee/drag-box logic added a
"drag started on empty space" branch to the same `Viewport.vue` pointer-dispatch code
this scenario's clicks go through, so this checks that branch didn't regress a plain
click into starting a marquee instead). Driven at laptop 1440×900 in Chromium via a
real headless-browser session (`chromium.launch()` against the dev server — the
`chromium-cli` this project's `run` skill prefers is not installed in this
environment): a Cube then a Cylinder dropped with a wandering, jittery drag path;
`data-body-count` read `2` immediately after both drops. Clicking empty grid cleared
the selection (`data-selected-id` → `""`); clicking the cube selected only it
(`cuboid-1`); clicking the cylinder moved the highlight to the cylinder alone
(`cylinder-2`, confirmed different from the cube's id) — never both at once.
Screenshotted at each step.

**Beyond scenario 1's own steps, the new capability itself**: a third body (a Sphere)
was dropped in a far corner, then a marquee was dragged two ways — via the new
`Select` nav-chrome toggle (touch's own path) and via desktop's Ctrl+drag — each time
enclosing the Cube and Cylinder and correctly excluding the far Sphere
(`data-selected-count` read `2` both times, Inspector showed "2 selected", and the
screenshot confirms exactly the enclosed two are highlighted). An empty-space marquee
cleared the selection (count `0`). Switching back to Orbit mode and plain-dragging the
canvas still orbited the camera (`azimuth` moved from `-45.00` to `-121.00`) —
confirming the new gesture-precedence logic did not swallow the ordinary orbit drag.
Console clean throughout.

**Re-checked**: 2026-09-09 13:06 — PASS (`ui-013`). Re-driven in full rather than
glanced at, because that task changes the **drop-commit path itself**: a drop no longer
commits the raw pointer position but a snapped one, which is precisely the code this
scenario's regression ("placing a second body hides or replaces the first") lives in.
Driven at laptop/Chromium, phone/WebKit and tablet/WebKit, with wandering, jittery drag
paths.

- A Cube then a Cylinder, dropped **far apart** so no snap was involved: both stayed
  visible (`data-body-count` = 2) and the cube's millimetre centre was **byte-identical**
  before and after the second drop — laptop `-136.01,6.72,20.00`, phone
  `-99.57,43.16,20.00`, tablet `-91.41,51.32,20.00`. Each drop selected only the new item.
- Clicking empty grid cleared the selection; clicking the cube selected `cuboid-1` alone;
  clicking the cylinder moved the highlight to `cylinder-2` alone — never both at once.
- **And the new case this task creates**, driven separately: a second body dropped
  *deliberately snapped onto* the first. The snapped-against body was still there and
  still **byte-identical** afterwards (`-110.70,70.22,20.00` before and after at laptop;
  `-99.29,81.63,20.00` at phone) — a snap moves the body being placed and touches nothing
  else, which is the specific way this task could have reintroduced the old regression.
  Exactly two bodies, not one and not three.

Console clean in all three drives.

**Re-checked**: 2026-09-09 14:21 — PASS (`core-012`). That task's own Testing section judged
no scenario to move on it (three kernel recipes, no UI surface), and that call stands — but
it added five entries to `src/core/kernel/registry.js`, and `src/core/library.js` builds this
scenario's Library rows *by iterating that registry* and **throws** on any `primitive.*` entry
without `ui` metadata. A new op kind added to the pipeline a past finding was fixed in is
exactly `CLAUDE.md`'s standing-regression-surface case, so it was driven rather than assumed.
Laptop 1440×900 in Chromium; kernel-only change, so one engine rather than three (the 9-way
e2e matrix ran green separately).

- **`ui-010`'s own repro, re-run**: the panel still renders **exactly seven rows** — Cube,
  Cylinder, Cone, Hexagon, Triangle, Tube, Sphere — with no `profile.roundedRectangle`,
  `profile.extrudeLinear`, `kit.board`, `kit.boardFrame` or `kit.anchor` leaking in, and no
  throw at panel build. The three kit ops are unreachable from the Library panel, as
  `core-010` already confirmed and this task did nothing to change.
- **The scenario itself**: a Cube then a Cylinder dragged in on wandering paths with a
  deliberate overshoot and doubling-back; both stayed visible (`data-body-count` = 2) and the
  cube's millimetre centre was **byte-identical** before and after the second drop
  (`-75.17,-25.15,20.00`). Each drop selected only the new item. Clicking empty grid cleared
  the selection (`data-selected-id` → `""`); clicking the cube selected `cuboid-1` alone;
  clicking the cylinder moved the highlight to `cylinder-2` alone. An orbit afterwards showed
  both solids still present from the new angle. Console clean.
- **A false alarm worth writing down so the next drive doesn't rediscover it**: the first
  deselect probe clicked the lower-left of the viewport (fx 0.13, fy 0.86) and the selection
  did *not* clear. `elementFromPoint` there returns `DIV.chrome__pad` inside
  `#navigation-chrome` — that is the nav chrome's own button pad, not empty viewport space, so
  refusing to deselect is correct. Deselect fires normally at fx 0.04/fy 0.06 (where the e2e
  spec clicks) and at fx 0.50/fy 0.86 (bare canvas). Not a defect and not a regression.
- **Beyond the scenario, since no UI can reach the new recipes**: all three were evaluated
  through the real fold *in the browser* (the same `src/core/kernel/index.js` the app imports,
  not a Node-only harness) — `kit.board` → one `board` part measuring 60 × 40 × 1.62 mm,
  `kit.boardFrame` → one `frame` part at 59.9998 × 40.0003 × 1.62 (the ~1e-4 mm of 2D-boolean
  noise its module doc describes), `kit.anchor` → a two-part group (`hole`, `post`) measuring
  12 × 12 × 9. No console errors, so nothing in the new 2D `geom2` layer trips the browser
  build or the mesh bridge.

**Re-checked**: 2026-09-10 15:40 — PASS (`core-013`). That task's own Testing section judged
no scenario to pass or fail on it (two kernel registry entries, no UI surface), and that call
stands — but it also changed **`evaluate()`'s operand resolution**, the fold every op in the
document goes through, and this scenario's named regression ("placing a second body hides or
replaces the first") lives in exactly that fold. `CLAUDE.md`'s standing-regression-surface rule
therefore applies whether or not any new control exists, so it was driven rather than assumed.
Laptop 1440×900 in Chromium; kernel-only change, so one engine rather than three (the 9-way e2e
matrix ran green separately: 571 passed, 42 skipped, identical to the pre-change baseline).

- **`ui-010`'s own repro, re-run** (two new registry keys, and `src/core/library.js` builds this
  scenario's Library rows by iterating that registry): still **exactly seven rows** — Cube,
  Cylinder, Cone, Hexagon, Triangle, Tube, Sphere — with no `group.snap`/`group.align` leaking
  in and no throw at panel build. The two new ops are `group.*`, not `primitive.*`, so the
  panel's filter never sees them.
- **The scenario itself**: a Cube then a Cylinder dragged in on wandering, jittery paths with a
  deliberate overshoot and a doubling-back. **Both stayed visible** (`data-body-count` = 2), and
  the cube's millimetre centre read off the Inspector was **byte-identical before and after the
  second drop** (`-74,-19,20` both times) — the specific regression signature, confirmed absent
  rather than merely not obvious. Each drop selected only the new item. Clicking empty grid
  cleared the selection (`data-selected-id` → `""`, count 0); clicking the cube selected
  `cuboid-1` alone; clicking the cylinder moved the highlight to `cylinder-2` alone, never both
  at once. An orbit afterwards (azimuth → `-128.60`) showed both solids still present from the
  new angle rather than a one-frame artefact. Screenshot confirms both bodies rendered, the
  gizmo and all three dimension lines on the selected cylinder, and the Inspector populated.
  Console clean.
- **Beyond the scenario, since no UI can reach the new ops**: both were evaluated through the
  real fold *in the browser* (the same `src/core/kernel/index.js` the app imports, not a
  Node-only harness). `group.snap` with `target: { id: 'bolt1', pieces: 'head' }` against a
  cuboid returned a **group with its parts intact** (`head`, `thread`, `tap`) whose head max-z
  landed exactly on the case's min-z (`-15`); `group.align` with a named piece on *both* sides
  returned `hole`/`post` intact. The guard also fires in the browser: `boolean.subtract` handed
  a `{ id, pieces }` operand throws by name rather than silently measuring the whole bolt. No
  console errors, so nothing in the new operand-resolution path trips the browser build.

**Re-checked**: 2026-09-10 17:52 — PASS (`ui-014`). Re-driven in full rather than glanced
at, because this task changes **`document.bodies()` itself** — it adds a second way for a
record to stop being reported as a body (`consumes`), and this scenario's named regression
("placing a second body hides or replaces the first") lives in exactly that loop. Laptop
1440×900 in Chromium.

- **`ui-010`'s own repro, re-run** (this task adds a registry entry, and `library.js`
  builds this scenario's rows by iterating the registry): still **exactly seven rows** —
  Cube, Cylinder, Cone, Hexagon, Triangle, Tube, Sphere — with no `boolean.intersect`
  leaking in. The new op is `boolean.*`, not `primitive.*`, so the panel's filter never
  sees it; asserted in `registry.spec.js` as well, since "an operation must never appear
  as a creation row" is the rule this whole task exists to honour.
- **The scenario itself**: a Cube then a Cylinder dragged in on wandering, jittery paths
  with an overshoot and a doubling-back. **Both stayed visible** (`data-body-count` = 2),
  and the cube's millimetre centre was **byte-identical before and after the second drop**
  (`-97.25,-22.01,20.00` both times). Clicking empty grid cleared the selection (count 0);
  clicking the cube selected `cuboid-1` alone; clicking the cylinder moved the highlight to
  `cylinder-2` alone, count 1 each time — never both at once — with the gizmo retargeting
  and the dimension lines changing to the cylinder's 40/40/50. A front-view snap afterwards
  showed both solids still present from the new angle. Console clean.
- **The new failure mode this task could have introduced, checked directly**: that a
  `consumes` record retires *more* than it should. It does not — with two bodies placed and
  neither consumed, `bodies()` still reports both; the skip is keyed on the consuming
  record's own named roots, and the unit suite pins the untouched-bodies case
  (`leaves untouched bodies alone and keeps creation order`).

**Re-checked**: 2026-09-10 22:19 — PASS (`core-020`). Re-driven rather than glanced at,
because this fix changes **`evaluate()`'s composite-expansion branch** — the fold every
placed body goes through — and this scenario's named regression ("placing a second body
hides or replaces the first") lives in exactly that fold. Laptop 1440×900 in Chromium;
kernel-only change, so one engine rather than three (the 9-way e2e matrix ran green
separately: 598 passed / 96 skipped, identical to the pre-change baseline).

- **The scenario itself**: a Cube then a Cylinder dragged in on wandering, jittery paths
  with a deliberate overshoot and a doubling-back. **Both stayed visible**
  (`data-body-count` = 2), and the cube's millimetre centre was **byte-identical before
  and after the second drop** (`-74.00,-19.00,20.00` both times) — the specific regression
  signature, confirmed absent rather than merely not obvious. Each drop selected only the
  new item. Clicking empty grid cleared the selection (`data-selected-id` → `""`, count
  0); clicking the cube selected `cuboid-1` alone; clicking the cylinder moved the
  highlight to `cylinder-2` alone, never both at once. An orbit afterwards showed both
  solids still present from the new angle. Console clean.
- **`ui-010`'s own repro, re-run** (this fix touches the fold `src/core/library.js` reads
  through): still **exactly seven rows** — Cube, Cylinder, Cone, Hexagon, Triangle, Tube,
  Sphere — no composite leaking in, no throw at panel build.
- **The new guarantee, checked directly in the browser**: a plate then a bolt appended
  through `document.append` now stores the bolt with `names: ["head","thread","tap"]` and
  bolt-sized bounds (`-9.25,-8.01,0 .. 9.25,8.01,27`) — **identical to the batch
  `evaluate()` path**, where before the fix it read `["Shell 1","head","thread","tap"]`
  spanning `-20,-20,0 .. 20,20,27`. Driven four composites deep (`hardware.nut`,
  `hardware.washer`, `hardware.bolt`, `kit.anchor` after a primitive): each keeps only its
  own parts and its own bounds, so a composite no longer absorbs what came before it.

**Re-checked**: 2026-09-11 14:31 — PASS (`ui-015`). Re-driven in full rather than glanced
at, per this task's own Testing section: `group.assemble` is `consumes`-shaped exactly
like a boolean — 2+ operand ids in, 1 new lineage root out — so it changes
`document.bodies()`'s output the same way `ui-014`'s Union/Subtract/Intersect did, and
this scenario's named regression ("placing a second body hides or replaces the first")
lives in exactly that loop. Driven with a real headless Chromium session at laptop
1440×900 (`chromium.launch()` against the dev server, the `chromium-cli` this project's
`run` skill prefers still not installed in this environment, same as `ui-024`'s drive),
plus a supplementary phone 390×844 WebKit touch-only drive (the engine an iPhone
actually runs) — not required by this task's own Testing section (which reasons
Chromium-only, DOM/state logic), done anyway because the automated e2e run for this same
task caught a real cross-engine layout regression in this exact area (below).

- **The scenario itself**: a Cube then a Cylinder dragged in on wandering, jittery paths
  with a deliberate overshoot and a doubling-back. **Both stayed visible**
  (`data-body-count` = 2), with distinct centres
  (`-103.21,-27.98,20.00` / `-33.67,188.95,25.00`). Clicking empty grid cleared the
  selection (count 0); clicking the cube selected `cuboid-1` alone; clicking the
  cylinder moved the highlight to `cylinder-2` alone — never both at once. Console clean.
- **This task's own new case, driven exactly as its Testing section names it** — "confirm
  placing, grouping, and then placing a third unrelated body afterward doesn't regress
  body-count or visibility": selecting both (`2 selected`) enabled all four toolbar
  buttons including the new **Group**; clicking it left **exactly one body**
  (`group-3`, `op: group.assemble`), auto-selected, with the toolbar dimming again — the
  transform gizmo attached and the three dimension lines read **109.54 / 256.92 / 50 mm**,
  far past a single 40 mm cube's own size, confirming the combined bounding box spans
  both originals rather than one shrunk/discarded volume. A **third body (a Sphere)**
  was then dropped: body count became exactly **2** (the group plus the sphere, neither
  three nor one), both listed, and the **group's own centre was byte-identical before and
  after** the unrelated placement (`-68.44,80.48,25.00` both times) — the specific
  regression signature this scenario exists to catch, confirmed absent rather than merely
  not obvious.
- **The cross-engine defect this same task's automated e2e run found, and re-driven here
  by hand to confirm the fix holds under real touch input**: the fourth Group button
  widened the Operations toolbar enough that, on the narrow 3D-viewport pane the tablet
  layout's persistent side panels leave (measured ~390px against an 820px page — a
  page-width media query alone never catches this), it started overlapping the
  orientation gizmo's own clickable view caps. Chromium tolerated it by a few pixels;
  Firefox's ~15px-wider button-label rendering pushed it past the Front-view cap's click
  point and Playwright reported a genuine "intercepts pointer events" timeout — not
  flakiness, reproduced deterministically pre-fix and absent post-fix. Fixed with a
  container-relative `max-width` on the toolbar (reserving the gizmo's own corner) plus
  unconditional row-wrapping, verified by direct bounding-box measurement in both engines
  before shipping. Re-driven by hand at phone width in WebKit with real touch
  `PointerEvent`s: dragged two cubes in via the Library sheet, marquee-selected both
  (touch has no Shift key), tapped **Group** — one body resulted — and then successfully
  **tapped the orientation gizmo's Front-view cap** with no interception or retry, the
  exact gesture that failed before the fix. Screenshot confirms the toolbar wraps to two
  rows and stays entirely clear of the gizmo's dial at this width.
- Console clean in every drive (laptop/Chromium and phone/WebKit).

**Re-checked**: 2026-09-11 19:45 — PASS (`ui-016`). Re-driven in full rather than
glanced at, because that task changes **how a Group-valued body becomes a mesh** — one
mesh per named part instead of one mesh from the combined solid — which is the render
path this scenario's "both remain visible" regression lives in. Driven at
laptop/Chromium, tablet/WebKit and phone/WebKit with wandering, overshooting drag paths.

A Cube then a second Cube dropped well apart: **both stayed visible**, and the first
cube's millimetre centre was byte-identical before and after the second drop
(`-103.21,-27.98,20.00` at laptop, `-66.23,9.00,20.00` at phone). Clicking empty grid
cleared; clicking each in turn selected only that one, gizmo and all three dimension
lines retargeting, never both at once.

**The half this task put at risk, and the reason for the full re-drive**: the two cubes
were then grouped, drilled into, stepped back out of, and a **third, unrelated Cylinder
dropped afterwards**. The scene ended with **exactly two bodies** (`Group 1`,
`Cylinder 1`) and a screenshot confirms **all three solids visibly on the grid** — both
grouped cubes rendering complete and separate, plus the new cylinder with its own gizmo
and its own `Diameter`/`Height` fields. Per-part meshing lost nothing, duplicated
nothing, and did not resurrect the second attempt's "the new body replaces the old"
regression. Orbiting afterwards confirmed all three from another angle rather than a
one-frame artefact. Console clean in all three drives.

**Re-checked**: 2026-09-11 20:19 — PASS (`ui-026`). Re-driven specifically because Snap
and Align are the first buttons on the Operations toolbar whose entire point is that
**both operands remain independently selectable afterward** — every prior button
(Union/Subtract/Intersect/Group) retires its operands via `consumes`, so this is the
first time this scenario's "stay visible, stay independently selectable" claim is
checked against a `supersedes`-based commit path instead.

Driven at laptop 1440×900 (Chromium): a Cube and a Cylinder dropped apart, both stayed
visible (`data-body-count` 2), and clicking each in turn selected only that one. Then
both were selected (Cube first, Cylinder second — Shift-click), **Align** opened, the Z
axis checked, and committed. **`data-body-count` stayed at 2** (not 1, the way a
boolean or Group would have left it) — both `Cube 1` and `Cylinder 1` were still present
in the scene list by name, at `-103.21,-27.98,25.00` and `-33.67,188.95,25.00`
respectively, not merged into one entry. A **third, unrelated Cube** was then dropped:
body count became exactly **3**, and all three bodies' centres — including the two from
before the Align commit — were unchanged from immediately after that commit, confirming
the new `supersedes` path doesn't disturb `document.bodies()`'s existing "both remain
visible" guarantee.

Beyond the scenario's own steps: reselected the same Cube/Cylinder pair afterward and
ran **Snap** (Z, `outside+`, 5 mm offset) — the Cube's position changed a second time
(to `-103.21,-27.98,-15.00`, matching `calcSnap`'s own arithmetic exactly, not
eyeballed) while the Cylinder's stayed byte-identical, and both remained separately
clickable, each opening its own Inspector entry (`Cube 1`, `Cylinder 1`) with no
breadcrumb or merged fields. Console clean throughout.

**Re-checked**: 2026-09-11 20:41 — PASS (`core-019`). That task's own Testing section
judged no scenario to pass or fail on it (three kernel ports, no UI surface), and that
call stands — but it adds three keys to `src/core/kernel/registry.js`, and
`src/core/library.js` builds this scenario's Library rows *by iterating that registry*
and **throws** on any `primitive.*` entry without `ui` metadata. A new op kind added to
the pipeline a past finding was fixed in is exactly `CLAUDE.md`'s
standing-regression-surface case, so it was driven rather than assumed. Laptop
1440×900 in Chromium; kernel-only change, so one engine rather than three (the full
e2e matrix ran green separately: 671 passed / 158 skipped, identical to the
pre-change baseline).

- **`ui-010`'s own repro, re-run**: the panel still renders **exactly seven rows** —
  Cube, Cylinder, Cone, Hexagon, Triangle, Tube, Sphere — with no `modify.enlarge`,
  `modify.fit` or `modify.bisect` leaking in, and no throw at panel build. The three
  new ops are `modify.*`, not `primitive.*`, so the panel's filter never sees them;
  also asserted in `registry.spec.js`, since "an operation must never appear as a
  creation row" is the rule that check exists for.
- **The scenario itself**: a Cube then a Cylinder dragged in on wandering, jittery
  paths with a deliberate overshoot *past* the drop point and a doubling-back. **Both
  stayed visible** (`data-body-count` = 2), and the cube's millimetre centre was
  **byte-identical before and after the second drop** (`-74.00,-19.00,20.00` both
  times) — the specific regression signature, confirmed absent rather than merely not
  obvious. Each drop selected only the new item. Clicking empty grid cleared the
  selection; clicking the cube selected `cuboid-1` alone; clicking the cylinder moved
  the highlight to `cylinder-2` alone, never both at once. An orbit afterwards left
  both bodies present and their centres unchanged, so neither is a one-frame artefact.
  The screenshot confirms both solids rendered on the grid, the gizmo and all three
  dimension lines on the selected cylinder (40/40/50), and the Inspector populated.
  Console clean.
- **Beyond the scenario, since no UI can reach the new ops**: all three were evaluated
  through the real fold *in the browser* (the same `src/core/kernel/index.js` the app
  imports, not a Node-only harness), against a 10 × 20 × 30 mm brick.
  `modify.enlarge` with `deltaMm: [2, 0, -4]` → **12 × 20 × 26**, matching measured V1
  exactly; `modify.fit` to `[5, 5, 5]` → **5 × 5 × 5** independently and **1.667 ×
  3.333 × 5** with `keepAspectRatio` (one uniform 1/6 factor, not three);
  `modify.bisect` on `z` at offset 2 → a **group with its parts intact**, `names`
  `["negative","positive"]`, the halves measuring 2 mm and 28 mm on z. The new guard
  also fires in the browser rather than only under Node: a `-12 mm` delta on a 10 mm
  axis throws *"enlarge: x delta -12 mm would invert a 10 mm axis"* instead of V1's
  silent mirror, and the operand gate reports `modify.bisect: expected 1 operand(s),
  got 0`. No console errors, so nothing in the new ops trips the browser build.

**Re-checked**: 2026-09-12 15:53 — PASS (`ui-027`). Re-driven because Fillet/Chamfer
is the second `OperationsToolbar.vue` control (after `ui-026`'s Snap/Align) to add a
`supersedes`-based commit path alongside the existing `consumes`-based one, and
because this task's own Testing section names this scenario explicitly. Hand-driven
against the real dev server (no `chromium-cli` in this environment, so a small
Playwright-driven Node script filled in, screenshotting at each step): a Cube dragged
in and dropped, then a Cylinder to a different point — **both stayed visible**
(2 bodies), and clicking empty space then each solid in turn selected only that one.
With the Cube alone selected, Fillet was opened, "Top (+Z)" chosen, radius 5mm, and
committed: the popover closed, the body count stayed at **2** (not 3 or 1), the
Cylinder's centre was **byte-identical** before and after
(`-40.73,181.89,25.00`), and the Cube's own volume dropped (64000 → 63188.3 mm³) —
the real, kernel-test-backed signal that the rim actually changed (see
`e2e/fillet-chamfer-operation.e2e.js`'s own header for why volume, not bounding box).
A second drive with a dramatic 15mm radius on a 40mm cube, snapped to the Front
orientation-gizmo view, visually confirmed the actual claim rather than just the
numbers: a flat-walled box below, a clean rounded dome above — exactly the "whole rim
of one face" shape `docs/fillet-chamfer.md` describes, not a whole-body collapse
(an elevated 3/4-view screenshot of the same shape looked almost sphere-like at a
glance, purely a foreshortening effect of viewing a domed cap from above — the
Front-view drive was what actually settled it). Console clean throughout (only the
Vite HMR connect log and a benign headless-GL "GPU stall due to ReadPixels"
performance notice, not an application error).

**Regression-surface baseline, `ui-026`'s own e2e spec re-run unchanged**:
`e2e/snap-align-operation.e2e.js`, all 18 cases, at all three reference viewports
(that spec's own chromium-only scope, per its header) — 18/18 passed, confirming
Fillet/Chamfer's new third commit path on the same `run()`/popover machinery didn't
disturb Snap/Align's `supersedes` path landed one task earlier.

**Re-checked**: 2026-09-12 21:58 — PASS (`ui-029`). Re-driven because this is the second
task after `ui-012` to append a **new kind of superseding record** through
`document.js`'s shared append/fold path — a *creation* record superseding another
lineage's terminal, a direction nothing had exercised before — and because it changed
where `Body.params` are read from, which every body in this scenario goes through.
Hand-driven at laptop 1440×900 in Chromium (no `chromium-cli` in this environment, so a
Playwright-driven Node session against the real dev server, same as `ui-015`/`ui-024`).

- **The scenario itself**: a Cube then a Cylinder dragged in on wandering, jittery paths
  with a deliberate overshoot past the drop point and a doubling-back. **Both stayed
  visible** (`data-body-count` = 2), and the cube's millimetre centre was
  **byte-identical before and after the second drop** (`-68.56,-23.29,20.00` both times).
  Clicking empty grid cleared the selection (count 0); clicking the cube selected
  `cuboid-1` alone; clicking the cylinder moved the highlight to `cylinder-2` alone.
- **The new record kind, driven directly**: the cylinder's Diameter was then edited
  40 → 12 in the Inspector. Body count **stayed at 2** — a rebuild supersedes, it does
  not fork a lineage into a second live body — and the **untouched cube's centre was
  byte-identical** across the edit, so there is no cross-talk through the fold. A
  **third, unrelated Sphere** was then dropped: count became exactly **3**, all three
  listed by name, and the edited cylinder was still 12 mm across afterwards
  (`[12, 12, 50]`) — the edit was not undone by a later unrelated append.
- Console clean.

**Regression re-check, `TODO/done/core-020-composite-absorbs-earlier-bodies.md`'s own
repro** (`CLAUDE.md`'s standing-regression-surface rule: this task is the next one to
append a new record kind through the same shared path since that fix closed). Run in the
browser against the real fold: a plate placed, then a bolt. The bolt's group holds
**only its own parts** — `head, thread, tap-head, tap-thread, tap-headClearSpace, tap` —
with no `Plate 1` absorbed into it, which is the exact symptom that finding fixed. Then,
the half that is new here: a **param edit on the plate** (`size` → `[60, 40, 5]`) through
the same append path. Afterwards `bodies()` still reports exactly `plate, bolt`, the
bolt's part list is unchanged, and the plate's params read `[60, 40, 5]`. The composite
neither absorbed the resized plate nor lost its own parts. (The part list is six names
rather than the three that entry recorded; that is `core-010`/`core-011`'s later bolt
recipe, not a change from this task — the load-bearing claim, that `Plate 1` is not among
them, holds.)

**Re-checked**: 2026-09-13 18:35 — PASS (`core-014`). That task's own Testing section judged
no scenario to pass or fail on it (one kernel recipe plus a dimension table, no UI surface),
and that call stands — but it adds a key to `src/core/kernel/registry.js`, and
`src/core/library.js` builds this scenario's Library rows *by iterating that registry* and
**throws** on any `primitive.*` entry without `ui` metadata. That is the same standing
regression surface `core-012`/`core-013`/`core-019`/`core-020` each drove rather than
assumed, so it was driven here too. Laptop 1440×900 in Chromium (a Playwright-driven session
against the real dev server — no `chromium-cli` in this environment, same as those drives);
kernel-only change, so one engine rather than three, with the full e2e matrix run separately
(842 passed / 158 skipped, identical to the pre-change baseline).

- **`ui-010`'s own repro, re-run**: the panel still renders **exactly seven rows** — Cube,
  Cylinder, Cone, Hexagon, Triangle, Tube, Sphere — with no `raspberrypi.bplus` leaking in
  and no throw at panel build. The new op is `raspberrypi.*`, not `primitive.*`, so the
  panel's filter never sees it.
- **The scenario itself**: a Cube then a Cylinder dragged in on wandering, jittery paths with
  a deliberate overshoot *past* the drop point and a doubling-back. **Both stayed visible**
  (`data-body-count` = 2), and the cube's millimetre centre was **byte-identical before and
  after the second drop** (`-71.43,-26.16,20.00` both times) — the specific regression
  signature, confirmed absent rather than merely not obvious. Clicking empty grid cleared the
  selection (`data-selected-id` → `""`); clicking the cube selected `cuboid-1` alone; clicking
  the cylinder moved the highlight to `cylinder-2` alone, never both at once. An orbit
  afterwards left both bodies present with unchanged centres, so neither is a one-frame
  artefact. Console clean.
- **Beyond the scenario, since no UI can reach the new recipe**: it was evaluated through the
  real fold *in the browser* (the same `src/core/kernel/index.js` the app imports, not a
  Node-only harness) for all four models — 23/25/33/38 parts for models 2/3/4/5, an 85 × 56 ×
  1.32 mm board every time, `hole1` spanning `1.875..5.125` on both x and y (centre 3.5, 3.5),
  and an unknown model throwing *"raspberrypi.bplus: unknown model 7, expected one of
  2 | 3 | 4 | 5"* rather than rendering something wrong. Then **actually rendered**, which a
  fold result cannot stand in for: a Pi 4 appended through `document.append` draws a
  recognisable board in the viewport — the flat 85 × 56 slab, the ethernet and stacked USB
  jacks along the right edge, the USB-C/HDMI/AV row along the front, the GPIO strip and both
  ribbon connectors — not a blank frame and not one undifferentiated blob. A Pi 5 appended
  alongside rendered too. No console errors, so nothing in the new recipe trips the browser
  build or the mesh bridge.

**Regression re-check, `TODO/done/core-020-composite-absorbs-earlier-bodies.md`'s own repro**
(`CLAUDE.md`'s standing-regression-surface rule: this is the first *new composite kind* added
to the expansion path since that fix closed, which is exactly the change class that finding
was about). Run in the browser against the real fold: a `Plate 1` placed first, then the Pi
appended after it. The Pi's group holds **only its own parts** — `mb, ethernet, usb1, usb2,
usbc, hdmi1, hdmi2, avjack, camera, display, gpio, activityled, powerled, microsd` — with no
`Plate 1` among them, and the Pi's bounds are Pi-sized (`-2.5,-2,-1.5 .. 88,56,17.05`) rather
than stretching back to the plate at x = −120. `bodies()` still reports both. The symptom that
finding fixed is absent against the new composite.

**Re-checked**: 2026-09-13 19:05 — PASS (`core-015`). Same reasoning as `core-014`'s entry
directly above, and deliberately re-driven rather than assumed to be covered by it: this task
adds a *second* key to `src/core/kernel/registry.js`, and `src/core/library.js` builds this
scenario's rows by iterating that registry. "The previous task proved the filter holds" is not
a standing guarantee — a second registration is a second chance to trip it. Laptop 1440×900 in
Chromium, Playwright-driven against the real dev server; kernel-only change, so one engine,
with the full e2e matrix run separately (842 passed / 158 skipped, identical to the
pre-change baseline).

- **Library row count, re-run**: the panel still renders **exactly seven rows** — Cube,
  Cylinder, Cone, Hexagon, Triangle, Tube, Sphere — read off the rendered DOM, and
  `PRIMITIVE_LIBRARY` in the browser is those same seven `primitive.*` ops. No
  `raspberrypi.cameraModule` leaking in, no throw at panel build.
- **The scenario itself**: a Cube then a Cylinder dragged in on wandering, jittery paths.
  **Both stayed visible** after the second drop, and each drop selected only the new item.
  Clicking empty grid cleared the selection (`0 selected`, inspector "(nothing selected)");
  clicking the cube selected the cube alone (`1 selected`, inspector "Cube 1"); clicking the
  cylinder moved the highlight to the cylinder alone (inspector "Cylinder 1") — never both at
  once, with the gizmo and dimension lines retargeting between them. An orbit between the two
  drops confirmed both solids are really in the scene from another angle. Console clean.
- **Beyond the scenario, since no UI can reach the new recipe**: all five models were folded
  *in the browser* through the same `src/core/kernel/index.js` the app imports — 21/21/21
  parts for v1/v2/v3 and 13/10 for hq/arducam-hq, a 38 × 38 × 1.1 mm board for hq and
  38 × 38 × 1.6 for arducam-hq, `v3` at 23.862 × 25 × 1.12. Then **actually rendered**, which
  a fold result cannot stand in for: a v3 appended through the document store draws a
  recognisable camera — the small rectangular board, the square sensor block, the cylindrical
  lens barrel standing on it and the ribbon strip off one edge — and an HQ appended alongside
  draws its 38 mm square board, the big lens-mount ring with a real bore through it, and the
  tripod block projecting past the front edge. Neither a blank frame nor an undifferentiated
  blob. No console or page errors, so nothing in the new recipe trips the browser build or the
  mesh bridge. (The two sit coincident at the origin because no composite takes a `center`
  param yet — `core-014`'s own module doc says so; expected, not a defect of this task.)

**Regression re-check, `TODO/done/core-020-composite-absorbs-earlier-bodies.md`'s own repro,
re-run against *this* composite** — the rule is that a closed finding's subsystem is a standing
surface, so `core-014` having passed it does not discharge it for the next composite kind. Run
in the browser, in core-020's own shape: a `Shell 1` 40 × 40 × 6 plate appended first, then a
`raspberrypi.cameraModule` v3 appended after it through `document.append`. The camera's group
holds **only its own parts** — `board, sensor, lens, lensribbon, ribbon` — with no `Shell 1`
among them, and its bounds (`-11.931,-12.5,-2.75 .. 11.931,12.5,9.925`) are camera-sized. The
incremental path's names and bounds are **identical to the batch `evaluate()` path's**, which
is the comparison that finding turned on. And its severe consequence was re-checked directly:
`boolean.subtract(shell, camera)` through the incremental path yields the correct plate
(`-20,-20,0 .. 20,20,6`), not the EMPTY solid the bug produced.

**Re-checked**: 2026-09-14 19:26 — PASS (`core-017`). Re-driven for the same reason
`core-015`'s entry above gives, four times over: this task adds **four** keys to
`src/core/kernel/registry.js`, and `src/core/library.js` builds this scenario's rows by
iterating that registry. Laptop 1440×900 in Chromium, Playwright-driven against the real
dev server on a wandering, overshooting drag path rather than the straight ramp the e2e
specs use; kernel-only change, with the full e2e matrix run separately.

- **Library row count, re-run**: the panel still renders **exactly seven rows** — Cube,
  Cylinder, Cone, Hexagon, Triangle, Tube, Sphere. None of `raspberrypi.miniPiTFT`,
  `piTFT22`, `piTFT24` or `hyperPixel4Rectangular` leaks in, and the panel builds without
  throwing.
- **The scenario itself**: a Cube then a Sphere dragged in. **Both stayed visible** after
  the second drop (`cuboid-1` at 64 000 mm³ and `sphere-2` at 32 975.5 mm³ both still
  reported), and each drop selected only the new item.
- **Pushed well past the scenario's two items, deliberately**, because "adding an item
  overwrote the previous one" is the exact failure this scenario exists to catch: **six**
  successive cubes were dragged in and all six survived as distinct bodies
  (`cuboid-1`…`cuboid-6`), each click selecting exactly one. A seventh drop deliberately
  *onto* an already-occupied point still added a body (6 → 7), and an eighth dragged in
  **while another body was selected** also landed (7 → 8). Console and page errors: none
  across the whole session.

**Regression re-check, `TODO/done/core-020-composite-absorbs-earlier-bodies.md`'s own
repro, run against all four new composite kinds** — the rule is that a closed finding's
subsystem is a standing surface, so `core-014`/`015`/`016` having passed it does not
discharge it here. In core-020's own shape: a `Shell 1` 40 × 40 × 6 plate appended first,
then each screen appended after it through `document.append`. For all four, the screen's
group holds **only its own parts** (5 / 8 / 5 / 6 visible parts), no `Shell 1` among them,
and the incremental path's names and bounds are **identical to the batch `evaluate()`
path's** — the comparison that finding turned on. Its severe consequence was re-checked
directly too: `boolean.subtract(shell, screen)` through the incremental path yields a real
plate for every one of the four (`-20,-20,0 .. 20,20,6` for the three HAT-framed screens;
`-20,-20,1.65 .. 20,20,2.15`, 800 mm³, for HyperPixel 4, which is the 0.5 mm gap between
its board and its LCD and is arithmetically right), never the EMPTY solid the bug produced.

**Note: no `kernel/index.js` fold change was made by this task.** `TODO/core-017`
anticipated one might be needed for nested sub-part addressing and required this re-check
if so. It was not needed — see the task's retirement note — but the re-check was run
anyway, on the "four new composite kinds" grounds above.

**Re-checked**: 2026-09-16 23:18 — PASS (`core-018`). Re-driven because this task adds four
entries to `src/core/kernel/registry.js`, and this scenario's first step is the Library panel,
whose rows are *derived from that registry* — the precedent `core-012`/`013`/`019`/`020` set is
that a registry change re-checks `ui-010`'s 7-row repro rather than assuming the filter holds.
Checked both ways: statically, `buildRows` filters `op.startsWith('primitive.')`, so four
`raspberrypi.*` composites cannot reach it; and in the **running app**, the panel renders exactly
7 rows — Cube, Cylinder, Cone, Hexagon, Triangle, Tube, Sphere — unchanged, with the registry now
holding 40 ops. Driven at laptop 1440×900/Chromium with deliberately wandering, jittery drag paths
rather than straight lines: a Cube dragged in, then a Cylinder to a different point. **Both stayed
visible** and `data-body-count` went 1 → 2, so the second attempt's "new body replaces the old"
regression is absent. Clicking empty grid cleared the selection; clicking each solid in turn
selected only that one (`cuboid-1`, then `cylinder-2`, never both), with the gizmo and all three
dimension lines retargeting. Console clean, no page errors.

**Re-checked**: 2026-09-17 13:26 — PASS (`ui-028`). Re-driven because this task adds a
third `supersedes`-based commit path to `OperationsToolbar.vue` (after `ui-026`'s and
`ui-027`'s), and because Bisect's own result is the first `supersedes` record in this
codebase to change `KernelGeometry` *kind* — a solid becoming a two-part `Group` —
rather than just its value, which is exactly the class of change this scenario's named
regression ("placing a second body hides or replaces the first") lives closest to.
Hand-driven via a Playwright-driven Node script against the real dev server (no
`chromium-cli` in this environment, same substitution `ui-015`/`ui-024`/`ui-027`/`ui-029`
each used) at laptop 1440×900 in Chromium, with wandering, jittery drag paths.

- A Cube then a Cylinder dragged in on deliberately wandering paths: **both stayed
  visible** (`data-body-count` 1 → 2), reported as `cuboid-1` (64000 mm³) and
  `cylinder-2` (62428.903 mm³). The cube's own volume was unchanged after the second
  drop (still 64000 mm³ in the post-cylinder listing) — this drive read body
  id/op/name/volume rather than millimetre centres, so volume-invariance is the
  no-cross-talk evidence here rather than a byte-identical position, stated explicitly
  rather than implied.
- Clicking empty grid cleared the selection (`data-selected-count` → `0`); clicking
  the cube selected `cuboid-1` alone (count `1`); clicking the cylinder moved the
  highlight to `cylinder-2` alone (count `1`) — never both at once.
- Console clean (only the Vite HMR connect log and benign headless-GL "GPU stall due
  to ReadPixels" performance notices, not an application error).

**This task's own new integration case, driven separately and specifically** (its
Testing section names this as an unexercised risk: a `supersedes` record that changes
`KernelGeometry` *kind*, not just value): a fresh Cube (40×40×40, 64000 mm³) placed and
selected, Bisect opened, axis **Y**, offset **20**, committed. `data-body-count` stayed
at **1** (not 2) and the id stayed `cuboid-1` — `supersedes`, not `consumes`. Clicking
the body once kept the whole two-part group selected with the gizmo attached and the Y
dimension line reading the full **40mm**. Clicking again at the same point drilled in:
the gizmo detached (count `0`), the Inspector breadcrumb read `Cube 1 > negative`, and
the Y dimension line now read **20mm** — the drilled-in half's own size, not the whole
group's. Clicking the breadcrumb's group segment stepped back out: breadcrumb gone,
gizmo reattached (count `1`), selected id back to `cuboid-1`, and the Y dimension line
back to the full **40mm** — confirming `ui-016`'s pick-depth/breadcrumb contract holds
against a `supersedes`-produced group exactly as it already did against a `consumes`-
produced one. Screenshots taken at the whole-group-selected, drilled-in, and
stepped-back-out states confirm this visually (a real 40×40×40 cube, then the same
cube shown drilled into its lower `negative` half at 40×20×40, per the Inspector's own
Size row).

**Re-checked**: 2026-09-17 19:10 — PASS (`ui-030`). Re-driven **in full**, not glanced at,
because this task changes `src/core/library.js`'s shared drop-commit path — the one every
placed body goes through — and changes its arity: a drop can now commit **two** records
rather than one. Hand-driven via a Playwright-driven Node script against the real dev
server (no `chromium-cli` in this environment, the same substitution
`ui-015`/`ui-024`/`ui-027`/`ui-028`/`ui-029` each used), laptop 1440x900 in Chromium and
phone 390x844 in WebKit, with deliberately wandering, overshooting drag paths rather than
the straight ramp the e2e specs use.

- **The scenario itself**: a Cube then a Cylinder dragged in. **Both stayed visible**, and
  the cube's millimetre centre was **byte-identical** before and after the second drop
  (`-136.01,6.72,20.00` both times) with its volume unchanged at 64 000 mm³ — so the
  second attempt's "new body replaces the old" regression is genuinely absent rather than
  merely not obvious. Each drop selected only the new item. Clicking empty grid cleared
  the selection (`data-selected-count` → 0); clicking the cube selected `cuboid-1` alone,
  clicking the cylinder moved the highlight to `cylinder-2` alone — never both at once.
- **Pushed past the scenario, deliberately mixing the two row kinds**, since this task's
  own risk is that a composite drop (two records) corrupts the single-record path: a
  Bolt, a Sphere, a Washer, a Nut and a Bearing were dragged in after the first two.
  **Seven bodies, seven distinct millimetre centres, nothing replaced anything** —
  `cuboid-1`, `cylinder-2`, `bolt-3`, `sphere-5`, `washer-6`, `nut-8`, `bearing-10`. The
  id gaps (4, 7, 9) are each composite's own trailing `transform.translate` record, which
  is the mechanism working, not a leak: every one of those is **one** body in the scene
  list, not two. Orbiting afterwards showed all seven still present from another angle
  rather than a one-frame artefact.
- **Phone 390x844 / WebKit, touch only**: a Bolt, a Cube and a Bearing placed by
  `pointerType: 'touch'` drags out of the bottom sheet — three bodies, three distinct
  centres. The sheet is genuinely scrollable now that there are eleven rows
  (`scrollHeight` 643 vs a 388 px sheet) and **Hardware is below the fold**, so reaching
  it is a real scroll — confirmed by driving at 390 px rather than read off the CSS, per
  `ui-030`'s own Small-screen-behavior bullet. No horizontal page scroll; tap targets
  unchanged at 44 px.
- Console and page errors: **none**, in either drive.

**Re-checked**: 2026-09-17 23:58 — PASS (`ui-031`). Re-driven **in full**, because this
task changes the same shared drop-commit path `ui-030` did and adds a second thing that
travels with a drag — a chosen variant — through `placement.js`, `Viewport.vue`'s drop
target and `library.js`'s record builder. Hand-driven via a Playwright-driven Node
session against the real dev server (no `chromium-cli` in this environment, the same
substitution `ui-015`/`ui-024`/`ui-027`/`ui-028`/`ui-029`/`ui-030` each used), laptop
1440x900 in Chromium, with deliberately wandering, overshooting drag paths.

- **The scenario itself**: a Cube then a Cylinder dragged in. **Both stayed visible**
  (`data-body-count` = 2), and the cube's millimetre centre was **byte-identical** before
  and after the second drop (`-165.69,28.72,20.00` both times) with its volume unchanged
  at 64 000 mm³. Each drop selected only the new item. Clicking the cube selected
  `cuboid-1` alone, clicking the cylinder moved the highlight to `cylinder-2` alone —
  never both at once.
- **A false alarm worth writing down, alongside `core-012`'s own**: the first deselect
  probe clicked the viewport's top-left (fx 0.04, fy 0.06) and the selection did *not*
  clear. `elementFromPoint` there returns `BUTTON.ops__btn` — the Operations toolbar's
  own button, not empty viewport space — so refusing to deselect is correct. Deselect
  fires normally at three genuinely bare points (fx 0.50/fy 0.85, 0.85/0.70, 0.12/0.50),
  each confirmed to be `CANVAS.viewport__canvas` underneath. Not a defect, and the same
  class of trap as `core-012`'s nav-chrome entry — the toolbar has simply grown enough
  since then to reach that corner.
- Console clean.

**Re-checked**: 2026-09-18 00:41 — PASS (`core-024`). Re-driven **in full**, not glanced
at, because this task changes `evaluate()`'s shared operand resolution — the fold every
op goes through, the same standing-regression-surface reasoning `core-013` and `core-020`
each used — **and** changes what `transform.translate`/`transform.rotate` return, which
is the record every placed composite and every gizmo drag commits. Laptop 1440x900 in
Chromium, via a Playwright-driven Node session against the real dev server (no
`chromium-cli` in this environment, the same substitution
`ui-015`/`ui-024`/`ui-027`/`ui-028`/`ui-029`/`ui-030`/`ui-031` each used), with
deliberately wandering, overshooting drag paths that double back past the drop point.

- **The scenario itself**: a Cube then a Cylinder dragged in. **Both stayed visible**,
  and the cube's millimetre centre was **byte-identical before and after the second
  drop** (`-25.82,-66.07,20.00` both times) — the specific regression signature,
  confirmed absent rather than merely not obvious. Each drop selected only the new item.
- Clicking bare canvas cleared the selection (`data-selected-count` → `0`) at **three**
  genuinely bare points, each confirmed to be `CANVAS.viewport__canvas` underneath
  (fx 0.50/fy 0.88, 0.88/0.80, 0.20/0.20); clicking the cube then selected `Cube 1`
  alone and clicking the cylinder moved the highlight to `Cylinder 1` alone — never both
  at once.
- **`ui-031`'s false alarm reproduced exactly, and confirmed still a false alarm**: the
  first deselect probe at fx 0.04/fy 0.06 again hit `BUTTON.ops__btn` and correctly did
  not deselect. Recorded a second time because two consecutive drives have now tripped
  over it; it is the toolbar, not a defect.
- Console and page errors: **none**.

**Re-checked**: 2026-09-18 01:44 — PASS (`ui-035`). Re-driven because this task changes
what operand shape the Operations toolbar's commit path can produce — a record that now
sometimes carries `{ id, pieces }` where it always carried a bare id — and every body in
this scenario reaches the screen through the same `evaluate()` fold that resolves it.
Laptop 1440×900 in Chromium, Playwright-driven against the real dev server, drags
deliberately wandering with an overshoot past the drop point and a doubling-back.

- A Cube then a Cylinder dragged in: **both stayed visible**, and the cube's millimetre
  centre was **byte-identical before and after the second drop** (`-80.04,-34.77,20.00`
  both times) — the second attempt's "new body replaces the old" signature, absent.
- Clicking bare canvas cleared the selection (`data-selected-id` → `""`); clicking the
  cube selected `cuboid-1` alone, with the **gizmo attached and all three dimension
  lines** (`data-axis-count` = 3); clicking the cylinder moved the highlight to
  `cylinder-2` alone, `data-selected-count` staying at 1 — never both at once.
- Console and page errors: **none**.

**Re-checked**: 2026-09-18 19:13 — PASS (`ui-036`). Re-driven because this task adds three fields to the Bisect popover on the shared `OperationsToolbar.vue` commit path and raises the popover's z-index above the phone Inspector sheet. Real mouse, jittery drag path, human-paced typing. Laptop 1440x900 (Chromium): cube then cylinder dropped at different points, both stayed (`cuboid-1` 64000 mm^3, `cylinder-2` 62428.9 mm^3); bare-canvas click cleared selection (count 0); cube click selected `cuboid-1` alone (gizmo 1, dims 40/40/40); cylinder click moved selection to `cylinder-2` alone (gizmo 1, dims 40/40/50). Phone 390x844 (WebKit, pointer not touch emulation — Playwright cannot drive a touch drag): same sequence, same numbers, but only the right third of the canvas is free of nav chrome, so both bodies had to be dropped there (pre-existing layout, not this task). Then the new popover: 260 x 466 px on the 844 px phone viewport, no internal scroll, Commit clickable by a real click (before the z-index fix the Inspector sheet intercepted it — caught by the e2e fit test, not by the old drive). Body count stayed 2, volume conserved (62428.903 -> 62428.903 mm^3). A straight Z Bisect of the cube at 20 mm (Angle left 0) gave part dims 40 x 40 x 20, unchanged from before. Console clean in both drives.

**Re-checked**: 2026-09-18 19:26 — PASS (`core-025`). That task's own Testing section judged no scenario directly affected (pure internal refactor of `src/core/kernel/recipes/`, no UI or registry change), but it rewrites the internals of five already-registered composite recipes that the Library's rows expand through, so `ui-010`'s repro and this scenario were re-driven anyway. Real mouse, jittery multi-segment drag paths with an overshoot past the drop point and a doubling back. Laptop 1440x900 (Chromium) and phone 390x844 (WebKit). `ui-010`'s own repro: the primitive list still has **exactly seven rows** (Cube, Cylinder, Cone, Hexagon, Triangle, Tube, Sphere); 26 rows in the whole Library, unchanged. Cube then Cylinder: both stayed (`data-body-count` 2) and the cube's mm centre was byte-identical before and after the second drop (`-109.48,-12.94,20.00` on laptop, `-209.42,107.85,20.00` on phone). Then, through the real Library rows and the same drag, eight composites with prior bodies present: `raspberrypi.bplus`, `cameraModule`, `touchDisplay7inch`, `touchScreen2` (the four recipes whose private helper copies were deleted) plus `hat`, `hatStandoff`, `spacer`, `activeCoolingFan` (the kit's existing users, whose builder was extended). Every drop added exactly one body (final count 10 on both viewports), selected only the new one, and left every earlier body's centre byte-identical. A screenshot shows the board, camera, both touch displays, HAT, spacer and fan all rendering as recognisable parts, none blank or partial. (The first phone attempt placed 0 for several rows: my driver aimed drops at the lower canvas, which the open bottom sheet covers — a script fault, fixed by dropping into the free upper region, not an app defect.) `TODO/done/core-020-composite-absorbs-earlier-bodies.md`'s repro, re-run in the browser against the real `createDocument` after a `Plate 1`, for bplus (model 4), cameraModule (hq), touchDisplay7inch and touchScreen2: none of the four groups' `names` or `parts` contain `Plate 1`, and the bounds are the recipe's own (`0,0,0 .. 85,56,1.32` for the Pi board; `-19,-19,0 .. 19,19,1.1` for the HQ board), not stretched back to the plate. `bodies()` reports 5. Console clean in both drives.

**Re-checked**: 2026-09-19 03:52 — PASS (`data-003`). Re-driven in full, not glanced at, because this task replaced how `document.bodies()` is derived: an undo now **re-folds the whole action log** through the same `ingest` path an append uses, so every body's identity, order and geometry is rebuilt from scratch on each undo — exactly the subsystem this scenario's regression lives in. Laptop 1440x900 (Chromium), real drags on wandering, jittery paths with an overshoot. A Cube then a Cylinder dragged in: **both stayed visible** (`data-body-count` 2) and the cube's millimetre centre was **byte-identical before and after the second drop** (`-66.60,-21.34,20.00` both times). Clicking bare grid cleared the selection; clicking the cube selected `cuboid-1` alone; clicking the cylinder moved the highlight to `cylinder-2` alone — never both at once, with the gizmo and all three dimension lines retargeting. A screenshot confirms both solids on screen with the Inspector reading the cylinder's 40/50. **The half this task adds**: after a gizmo move and an Undo there were still **exactly two bodies, not three** — the pre-move record did not start rendering alongside the moved one, which is the double-render defect a naive rebuild would reintroduce (`ui-012`'s repro, re-run explicitly). The untouched body's centre and volume were byte-identical through an undo *and* a redo. Console clean.

**Re-checked**: 2026-09-19 04:47 — PASS (`data-004`). Re-driven because this task widens the *same* `rebuildFrom` re-fold `data-003` built, and every body in the document now goes through a fold that can skip entries (suppressed), stop early (rolled back) and be re-entered by an insert — so "does placing a second body still leave the first alone" is being asked of a materially different fold. Laptop 1440x900 (Chromium), real mouse, wandering drag paths. A Cube dropped at 0.35/0.5, then a Sphere at 0.68/0.45: **both stayed** and the Cube's millimetre centre, bounds and volume were byte-identical before and after the second drop (`-41.39,-41.39,20.00` / `64000.000` both times). A third drop — a **Bolt**, a composite — left both of the first two byte-identical again and reported its own bounds (`59.55,-77.28,0.00 .. 78.55,-60.82,27.50`, volume `3647.047`), i.e. its own ~19mm footprint around its own drop point, not a group stretched back over the Cube at −61mm or the Sphere at +95mm: `core-020`'s repro, re-run through the real drag-drop UI. A screenshot shows all three solids on screen, separate and correctly shaped, with the Inspector reading the Bolt. Console clean.

**Re-checked**: 2026-09-19 — PASS (`io-001`: startup now restores a document, touching the
load path every body takes). Hand-driven with a real mouse and wandering, jittery drags
(not dispatched events): chromium/laptop, and webkit/phone 390×844, webkit/tablet 820×1180,
chromium/phone, chromium/tablet. Cube then Cylinder dropped at different points: both stayed
visible; the first body's millimetre centre was identical before and after the second drop
(laptop `-98.51,-23.28,20.00`; phone `-143.29,79.88,20.00`), each click selected only that
solid with one gizmo, an empty-grid click cleared it. The drive also produced one harness
lesson worth keeping: a selected body's gizmo rings overlay its neighbours, so a Shift-click
aimed *through* them selects nothing new — the same as it would for a human, not a defect.
Console clean in every drive.

**Re-checked**: 2026-09-19 14:00 UTC — PASS (`io-002`). Re-driven because this task adds a
second writer to the persistence/mutation path scenario 1's bodies travel through (a store
subscribed to `documentStore.version`, feeding a push scheduler), and "does a new subscriber
on that path disturb placement" is exactly the question a green unit suite cannot answer.
Hand-driven at **chromium/laptop 1440×900** and **webkit/phone 390×844** with wandering,
jittery drag paths. Both drives: Cube dropped, then Cylinder at a different point — **both
stayed visible**, and the Cube's millimetre centre was byte-identical before and after the
second drop (laptop `-81.26,-35.99,20.00`; phone `-48.40,-3.14,20.00`, volume `64000.000`
both times). Clicking empty grid cleared the selection (0); clicking the Cube selected only
it with the gizmo attached; clicking the Cylinder moved the selection to it alone — never
both. A screenshot at laptop width shows both solids, the Inspector reading `Cylinder 1`
(Ø40 × 50 mm at `-46.44, 176.18, 25`) and the operations toolbar correctly greying Union at
one selected. Console clean in both drives apart from the usual WebGL ReadPixels perf
notice. One harness lesson, not a defect: a synthetic click dispatched at the viewport
*wrapper* rather than at `viewport-canvas` does not clear the selection, because the app
listens on the canvas — the first drive's apparent "empty click did not clear" was my
driver, and clicking the canvas as a real pointer does clears it every time.

**Re-checked**: 2026-09-19 15:20 UTC — PASS (`io-003`, smoke only: that task adds two new modules nothing in the
app imports yet, so the app's main bundle is byte-identical — same hashed chunk with and without them — and this
is a confidence check, not a regression hunt). Hand-driven at laptop 1440×900 in Chromium against the dev
server: dragged a Cube in with a wandering, jittery path, then a Cylinder to a different point. Both stayed in
the scene (`scene-body-cuboid-1`, `scene-body-cylinder-2`), the second drop selected only the Cylinder, clicking
empty grid cleared the selection and the gizmo, clicking the cube selected Cube 1 alone and then the cylinder
selected Cylinder 1 alone (one gizmo each time, never both), and an orbit left both bodies in the scene.
Console clean.

**Re-checked**: 2026-09-20 22:00 — PASS (`ui-032`). Re-driven rather than glanced at, because that task adds
a whole new way for `document.bodies()`'s reported set to change shape — a suppress, a reorder, a rollback and
a mid-history edit all re-fold the log — and this scenario's named regression ("placing a second body hides or
replaces the first") lives in exactly that fold. Laptop 1440×900 in Chromium, from a cleared IndexedDB, with
wandering drag paths.

A Cube then a Cylinder dragged in: **both stayed visible** (`data-body-count` 2) and the cube's millimetre
centre was **byte-identical before and after the second drop** (`-111.08,56.74,20.00` both times) — the
regression signature, absent rather than merely not obvious. Each drop selected only the new item. Clicking
empty grid cleared the selection (count 0); clicking the cube selected `cuboid-1` alone; clicking the cylinder
moved the highlight to `cylinder-2` alone, never both at once. Console clean.

**The new failure mode this task could have introduced, checked directly**: that the *preview* leaks into the
live scene. It does not — entering a preview reports only the previewed prefix (`["Cube 1"]` of two bodies)
and leaving it restores both, with no record appended, no undo step created and `rollbackAt()` still `null`.
An early build of this task got the **rendering** right and left the **announcement** reading the live
document, so the canvas showed one body while the DOM said two; caught by `e2e/timeline-panel.e2e.js`, fixed
by routing both through one accessor, and pinned by a store test.

**Re-checked**: 2026-09-20 23:58 — **PASS** (`ui-040`, which changes the operand every
boolean commits and so touches the fold this scenario's regression lives in). Laptop
1440x900/Chromium, drags driven on wandering, jittery paths rather than straight lines:
a Cube then a Cylinder dropped at different points, **both stayed visible**, clicking
empty grid cleared the selection, and clicking each in turn selected only that one
(`cuboid-1` → `cylinder-2`, never both). Still exactly two bodies after navigating the
camera between operations. Console clean.

**Re-checked**: 2026-09-21 13:39 UTC — PASS (`ui-033`, as part of scenario 10's drive: the new header File ▾
control, the chip's new sources and a new modal layer all sit over this scenario's surface, and Open…/Load now
replace the whole document). webkit/laptop 1440×900, webkit/phone 390×844 (touch), chromium/laptop,
chromium/phone. A Cube then a Cylinder dropped on wandering, jittery paths: **both stayed visible**
(`data-body-count` 2) and the first body's millimetre centre was byte-identical before and after the second
drop (`-67.02,29.51,20.00` laptop, `-56.51,40.02,20.00` phone). Clicking empty grid cleared the selection;
clicking each solid selected only that one (laptop probe: cylinder `0.51,0.32`, cube `0.44,0.37`). Opening the
File menu with a body selected left the selection unchanged (asserted by the e2e at every viewport, and the
menu was opened over the Inspector sheet at phone). Console clean.

**Re-checked**: 2026-09-21 — PASS (`ui-034`, laptop Chromium and phone WebKit; hand-driven, real mouse). Re-run because Export reads the same `bodies()` the drops write, and a broken read would show first here: a Cube then a Cylinder dragged in on wandering paths, **both stayed visible**, and the first body's millimetre centre was byte-identical after the second drop. Exporting the whole scene with nothing selected produced one STL of **both** (volume 126429.04 mm³ against the kernel's 126428.90 summed), and afterwards both bodies were still there, at unchanged centres — Export consumes nothing and appends no record. (Scenario 1's own click-each-solid steps were not re-driven: this change touches no selection code.)

**Re-checked**: 2026-09-21 20:36 UTC — PASS (`ui-041`, laptop 1440x900 Chromium, tablet 820x1180 and phone 390x844 WebKit; hand-driven, real mouse at laptop, touch taps at phone/tablet). Re-run because this task adds a second selection route and an x-ray pass to the canvas. Driven in the *opposite* order to the scenario's own steps: a **Sphere first, then a Cube**, on jittery paths. **Both stayed visible** (`data-body-count` 2, the Objects list naming both) at all three sizes. Clicking each solid selected **only that one** (`data-selected-count` 1, the id matching the clicked body's), and the sphere click after the cube click *replaced* the selection rather than adding to it. (No selection code was changed by this task beyond a store read; the click path is untouched.)

**Re-checked**: 2026-09-22 13:51 UTC — PASS (`ui-042`, laptop 1440x900 Chromium and WebKit, tablet 820x1180 Chromium, phone 390x844 WebKit). Re-run because this task touches `summarizeBody` (a `Cube 1`/`Cylinder 1` drop reads it every time) and `createBodyObject`'s part-addressability condition was refactored out into a shared helper — exactly the kind of shared-code change that could quietly alter what an ordinary, non-composite drop looks like. Two primitives dragged in on wandering paths at every viewport/engine combination: **both stayed visible**, each drop selected only the new item, and clicking empty grid cleared the selection. Neither primitive has parts, so neither grew a chevron — confirmed on screen, not just inferred from the count. Console clean throughout.

**Re-checked**: 2026-09-24 02:42 UTC — **PASS** (`core-029`, which moved composite volume measurement into a new evaluation worker and made `boundsOf` measure a hole-free group part by part instead of unioning it — so both the summary every drop produces and the bounds every click reads went through new code). Driven with Playwright's real mouse at human pace (25-step drags from the Library rows, real clicks on the canvas — not the e2e event dispatch), at laptop 1440x900 **Chromium** and phone 390x844 **WebKit**, screenshots read. Cube then Cylinder dropped at different points: **both stay on screen** after the second drop (`data-body-count` 2, both in the picture). Empty click → 0 selected; clicking the Cube selects only it (gizmo + dimension lines on the Cube, Inspector "Cube 1", Cylinder `data-selected=false`); clicking the Cylinder moves everything to it alone. Volumes 64000.000 / 62428.903 exactly as before. At phone width the Cube sits partly behind the translucent nav chrome — pre-existing layout, still visible and selectable. Console clean in both.

**Re-checked**: 2026-09-24 15:57 UTC — **PASS** (`core-030`), production build, laptop 1440x900 Chromium and WebKit (mouse clicks) and phone 390x844 WebKit (touch taps): Cube then Cylinder dropped, both remain; clicking/tapping each selects only it. **New for `core-030`**: Undo removes only the Cylinder, Redo returns it byte-identical, two Undos empty the scene and two Redos restore both byte-identical. *Driver note, not a regression*: at phone width a Cube dropped at the left of the viewport lies under the translucent nav chrome and cannot be tapped; re-driven with both drops in the exposed upper-right region. Console clean.

**Re-checked**: 2026-09-24 16:31 UTC: **PASS, all twelve steps** (`ui-044`: an Inspector param edit on a moved or turned body is now one Undo step, through a new core `document.batch`). Production build, driven by mouse, on laptop 1440x900 Chromium, laptop WebKit and phone 390x844 WebKit. Every Expect line held in all three, console clean: step 7's 3 mm chamfer with the sphere byte-identical, step 8's Undo/Redo, step 9's Suppress, step 10's Cone inserted at the marker and rolled forward, step 11's Move up and Undo, and step 12's refusal naming step 6 (step 5 on the phone run, which placed one body fewer before it) with nothing changed. At phone width the Library sheet covers the lower ~55% of the viewport, so the driver's drop points were moved into the clear upper band; that was a driver fix, not an app one.

**Re-checked**: 2026-09-24 17:50 UTC: **PASS at laptop Chromium and laptop WebKit; FAIL at phone WebKit on step 4's taps, pre-existing, filed as `TODO/ui-045`** (`core-031`). Both bodies remain after both drops, in all three. Laptop: clicking empty grid clears the selection, then the cube and then the cylinder each select alone. Phone WebKit with **trusted** touch taps (`page.touchscreen.tap`, not the synthetic mouse-type events every e2e spec uses): the empty-space tap clears, but after it neither body tap selects anything. A tap that lands on the Inspector sheet instead leaves later body taps working. Synthetic mouse- or touch-type presses at the same points select correctly, and Chromium's touch emulation works. The same probe against a production build of `65b86de` (before `core-031`) fails identically, and `core-031` touches no selection or pointer code. It is filed rather than fixed here, with the evidence, and a real iPhone/iPad check is in `TODO/VERIFY.md`.

**Re-checked**: 2026-09-24 19:45 UTC — **PASS at phone WebKit and phone Chromium** (`ui-045`'s own Step 6 re-drive, real `page.touchscreen.tap`, no synthetic events). Launched the dev server and drove it directly (not via a Playwright *test*) with a Cube and Cylinder dropped clear of every overlay band (nav chrome, orientation gizmo, Operations toolbar, Inspector sheet — the bands `TODO/ui-046` catalogues). A trusted empty-space tap cleared the selection; a trusted tap on the Cube selected it; a trusted tap on the Cylinder selected it; and — beyond the scenario's own steps — a direct Cylinder-to-Cube trusted retarget with **no** intervening empty tap also worked, on both engines. Screenshots confirm a normal, fully-rendered scene at every step (not blank/broken), and both engines' console stayed clean. **This does not overturn `core-031`'s FAIL above as wrong** — see `TODO/done/ui-045-webkit-touch-tap-select-after-empty-tap.md`'s own retirement note: the original coordinates that failed there land inside `NavigationChrome`'s raised footprint once an Inspector sheet is open (filed separately as `TODO/ui-046`), which is why this re-drive deliberately used coordinates proven clear of it rather than the original ones. No bug was found in the selection/raycasting code itself.

**Re-checked**: 2026-09-24 21:15 UTC — **PASS at phone WebKit and phone Chromium** (`ui-046`, hand-driven with a script-free exploratory driver: wandering real-mouse drags from the Library, then real `page.touchscreen.tap` for every selection). Cube dropped at (0.22, 0.45), inside the band the raised nav chrome used to cover, and Cylinder at (0.72, 0.30). Both stayed visible. With the Inspector sheet up, the chrome is now a 48×48 **✥** toggle at `x 8-56, y 359-407` (was `194×200` at `y 207-407`), and `elementFromPoint` at the cube's position is `viewport-canvas`. A 6-tap sequence (empty, cube, cylinder, cube, empty, cube) selected exactly what was tapped each time, and the camera azimuth never moved from −45.00, so no stray tap reached a camera button. No horizontal overflow, console clean.

**Re-checked**: 2026-09-25 01:33 UTC — **PASS at laptop 1440x900 Chromium (mouse) and phone 390x844 WebKit (real `page.touchscreen.tap`)** (`core-026`: every kernel `Group` now carries a per-part `colors` map, threaded through `add()`, every group-rebuilding function and the worker transport, and eight composite recipes now emit V1's `.color(...)` on their records). This is a kernel-only change with no render-path change. The scenario was re-driven because every scene mixes primitives with composites whose evaluated value changed shape. Steps 1-4 were driven as written (Cube, then Cylinder, click empty space, click each), then extended with a Bolt and an Anchor. All four bodies stayed visible after every drop. The empty-space click cleared the selection (count 0). Each click or tap selected only that body (`cuboid-1`, `cylinder-2`, `bolt-3`, `anchor-5`, count 1 each). The console was clean on both. A separate placement drive (Washer, Bolt, Anchor, Raspberry Pi model 5 and Camera Module v3, whose `mb`/`board` records now carry `colorAlpha: 0.75`) rendered every composite complete at both sizes. Bodies still draw in the theme palette, as intended until `data-005`/`ui-037`/mesh.js consume the field.

**Re-checked**: 2026-09-25 13:56 UTC — **PASS at laptop 1440x900 Chromium** (`data-005`: the document model gained a `style.recolor` supersedes-record kind, a `Body.colorOverrides` field, and a new registry entry — no render-path or UI change; there is still no control that creates one). Re-run because this task's new record type goes through the same shared `evaluate()`/`document.js` fold every drop already does. Hand-driven with a wandering, jittery real-`PointerEvent` drag (not the scripted e2e's straight-line path): a Cuboid then a Cylinder dropped at different points, **both stayed visible** (`data-body-count` 2), console clean. Also the full non-Firefox Playwright matrix (`guards` + `chromium`/`webkit` × laptop/tablet/phone, `npx playwright test`) re-run in full: **1245 passed, 202 skipped, 0 failed**, including `primitive-placement.e2e.js`.

**Re-checked**: 2026-09-26 12:20 UTC — **PASS, light spot-check** (`render-004`: `hardware.bolt`'s `tap` clearance record marked `hidden: true`; touches only that one recipe and four `docs/` pages, no code in the placement/selection path this scenario exercises). Driven at laptop 1440x900 Chromium: a Cube then a Cylinder dragged in on wandering pointer paths to different points. Both stayed visible, and the cube's `data-body-bounds` string was byte-identical before and after the second drop (`-130.78,-34.25,0.00,-90.78,5.75,40.00`). Console clean. Not re-driven at phone/WebKit or with real touch taps — this task's change has no code path in common with what those variants exist to catch (touch input, layout), so the laptop/Chromium spot-check is the proportionate re-drive.

**Re-checked**: 2026-09-26 13:15 UTC — **PASS, light spot-check** (`ui-047`: adds a new
Inspector section and a hidden-part render path that only activates for a body that has
a hidden part and only once a user turns its toggle on — a Cube and a Cylinder have
neither, so nothing this task added is reachable from this scenario's own steps at all).
Driven against the real dev server, laptop 1440x900 Chromium: a Cube and a Cylinder
dropped apart, both stayed visible (`data-body-count` 2), and clicking each individually
selected only that one, with no Hidden parts section appearing for either (as expected —
see this task's own new e2e spec, `e2e/inspector-hidden-parts.e2e.js`, for the explicit
"a Cube shows no Hidden parts section" check). Console clean.

### 2. Hardware property edit

**Steps**:
1. From the Library panel's "Hardware" section, drag a "Bolt" row into the viewport and
   release to drop it.
2. Click the bolt to select it. Confirm the Inspector panel opens showing the bolt's
   `spec`, `length`, `fit`, and `color` fields alongside the Transform section
   (position X/Y/Z, rotation X/Y/Z).
3. In the Inspector, change `spec` from its default to `M2.5 Socket` and change `fit`
   to `loose`.
4. Confirm the 3D mesh updates to match (visibly different length/diameter).
5. Drag the gizmo's translate handle in the viewport a short distance.
6. While dragging, watch the Inspector's Transform section position fields — confirm
   they update live, in step with the drag, not only after release.
7. Release the drag, then edit one of the Transform section's position fields directly
   (type a new value and press Enter/blur).
8. Confirm the mesh moves to match the typed value.

**Expect**: The mesh visibly changes shape after the spec/fit edit (step 4). The
Inspector's numeric fields track the gizmo drag live during step 6, not just after
release. A direct field edit (step 7) moves the mesh (step 8) — gizmo-drag and
numeric-field edits stay in sync in both directions.

*(Note: steps 5-8 are the gizmo-drag refinement `docs/decisions/interaction-model-qa.md`
control 4 flagged for this scenario — the original §9 draft only checked the
inspector-field-edit direction.)*

**Last run**: 2026-09-06 01:15 — **PARTIAL PASS** (`ui-011`. Only the
*Inspector-opens-and-shows-fields* half of this scenario is drivable, and it is
deliberately reported as a partial rather than a PASS.

**What was driven, and passed**: steps 2's Inspector contract, with a **Cylinder
substituted for the Bolt** — the Library has no "Hardware" section yet (`ui-013`), so
step 1 cannot be performed as written. Hand-driven at laptop 1440×900 in Chromium,
tablet 820×1180 and phone 390×844 in WebKit (the engine an iPad and an iPhone actually
run). Clicking the placed solid opened the Inspector showing that op's **own** param
schema — Cylinder → `Diameter 40 mm`, `Height 50 mm`; a Cube in the same session →
`Size X/Y/Z`; a Tube → `Diameter`, `Inner diameter`, `Height` — alongside the standing
**Transform** section (Position X/Y/Z, Rotation X/Y/Z, Size X/Y/Z) reading the solid's
real current values, measured off the evaluated geometry rather than the raw param.
Beyond the scenario's own steps: six rapid clicks with no settle time, an orbit with a
body selected (the gizmo and all three dimension lines tracked the camera and kept
quoting the same millimetres from the new angle), a standard-view snap, and a
deliberate attempt to **type into a Transform field** — which correctly refused,
because the panel says out loud that its values are read-only until the transform
tools land. Console clean in all three drives.

**What is NOT drivable and is therefore NOT claimed**: step 1 (no Hardware/Bolt row —
`ui-013`), step 3-4 (no editable params, so no mesh update — `ui-012`), and steps 5-8
in full (no gizmo *drag*, no live field sync, no field-edit-moves-the-mesh — `ui-012`;
`ui-011` ships the gizmo as visual handles only, by its own scope). This scenario's
**Expect** section is entirely about those steps, so nothing in it is met yet.

**The drive found two real defects the test suite could not see**, both fixed in
`ui-011` and re-driven green:
1. At phone width the Inspector's auto-opening bottom sheet and the Library's bottom
   sheet claimed the same slot and stacked — the Library's rows legibly bleeding
   *through* the Inspector's translucent ground into unreadable mush. No spec had ever
   opened both at once. Resolved by making the phone-width sheet slot exclusive: the
   Inspector declines to auto-open over a Library sheet the user deliberately opened
   (its tab shows the selected body's name instead, one tap away), and tapping the
   Inspector's tab collapses the Library. A drop deliberately does **not** close the
   Library, because that would break scenario 1's place-several-in-a-row flow.
2. The viewport's scale readout and the bottom row of its navigation pad sat behind the
   Inspector sheet's top edge — measured, not guessed: readout at 406-451px against a
   sheet starting at 426px. The inset formula had counted the sheet's body but not its
   own 44px tab. Now a three-state inset (`none`/`tab`/`open`), because a *collapsed*
   sheet still covers 44px of the 3D view. Re-measured at 362-407px against 426px.

A third, smaller thing was found and logged rather than fixed — see `TODO/VERIFY.md`.)

**Re-checked**: 2026-09-06 13:12 — **PARTIAL PASS, and the whole gizmo/field half of
Expect is now met** (`ui-012`). Still a partial, and deliberately reported as one: the
`spec`/`fit` property edit this scenario is *named* after is still not drivable. What
changed is that every one of steps 5-8 now is. Hand-driven at laptop 1440×900 in Chromium,
tablet 820×1180 and phone 390×844 in WebKit, with a **Cylinder standing in for the Bolt**.

**What was driven, and passed** — the entire **Expect** section's second and third
sentences:
- **Steps 5-6 (gizmo drag, fields live during it)**: dragging the X translate arrow moved
  the mesh, and the Inspector's Position X was sampled *mid-gesture* at six points along
  the drag — laptop: `-42.40 → -38.16 → -33.23 → -29.01 → -21.67 → -17.69`, settling at
  `-16.09`. The numbers move **with** the drag, not at release, which is the specific claim
  control 4 makes and the one a before/after look cannot make. Same on tablet and phone.
- **Steps 7-8 (typed field moves the mesh)**: typing `-35` into Position Y and pressing
  Enter moved the solid to exactly `-35`, on all three.
- **The two directions agree**: after a drag, the field read the mesh's own centre to the
  displayed precision; after a typed edit, the previously-dragged axis stayed where the
  drag had left it rather than being reset.
- **Beyond the scenario's own steps**: a rotate-ring drag (Rotation Z tracked live the same
  way, `-39.6° → -52.2°` across the sweep) and a typed `45°`; garbage input (`abc`) into a
  Position field, which correctly restored the previous value and moved nothing; four rapid
  drags in a row with no settle time, which accumulated correctly and left exactly one body;
  a drag performed **after orbiting the camera** to 15° az / 50° el, which still moved the
  body along X alone; and a Z-arm drag, which moved Z alone. A Cube typed to 45° about Z
  made its X/Y dimension lines read **56.569 mm** — exactly 40·√2 — and typing `0` back
  returned them to exactly `40`, so the rotation is real geometry rather than a number in a
  box, and it is reversible without drift. Console clean in every drive.

**What is still NOT drivable and is therefore NOT claimed**: **step 1** (no Hardware
section and no Bolt row — `ui-013`), and **steps 3-4** (changing `spec`/`fit` and watching
the mesh change shape). Step 3-4 is blocked twice over: there is no Bolt to have a `spec`,
and `ui-012` deliberately left the **Parameters** fields read-only, because editing those
means rewriting a creation record and re-evaluating what depends on it — a different
mutation from appending a transform, belonging to whichever task lands it. So the first
sentence of **Expect** ("the mesh visibly changes shape after the spec/fit edit") remains
unmet. The Inspector now says which fields are editable and which are not, rather than
`ui-011`'s blanket "read-only for now" note, so a user is not misled about either.

**Re-checked**: 2026-09-06 15:44 — **PARTIAL PASS, still partial for the same reasons as
before** (`ui-017`). This task only resizes the gizmo's arms/rings to clear the selected
body's own on-screen silhouette instead of a fixed 58px/40px — it does not touch steps
1/3-4's blockers, so the partial-pass boundary is unchanged. What was re-driven: two
cubes dropped close together (so their now-larger gizmos plausibly overlap), zoomed in
until the rendered `gizmo-arm-x` measured 184px on screen (versus the old fixed 58px),
then dragged. **The correct body moved each time and its close neighbour never did**:
dragging the right-hand cube's gizmo moved only that cube (`29.45,12.79` →
`36.07,12.79`), the left-hand cube stayed exactly put; after resetting zoom and
re-selecting the left-hand cube, dragging its gizmo moved only it (`-2.23,-18.89` →
`10.7,-18.89`), leaving the other body untouched. This is exactly the risk the task's own
Testing section named ("doesn't accidentally grab a neighbouring body's overlapping
gizmo"), confirmed absent rather than merely not obvious. Screenshots at each step show
the gizmo visibly growing well past the old fixed size and always clearing the selected
cube's own silhouette. Console clean throughout.

**Re-checked**: 2026-09-06 18:52 — **PARTIAL PASS, still partial for exactly the same
reasons as before** (`ui-023`). Steps 1 and 3-4 remain blocked on the missing Hardware
section (`ui-013`) and read-only Parameters, so the first sentence of **Expect** is still
not claimed. Steps 5-8 were re-driven in full at laptop/Chromium and phone/WebKit,
because this task changes what the dimension lines measure and they are half of what
those steps watch.

- **Steps 5-6 (gizmo drag, fields live during it)** still hold: dragging the X arm on a
  **rotated** cylinder moved it and Position X was sampled mid-gesture at eight points
  along the drag — laptop `-17.25 → -12.72 → -8.20 → -3.67 → 0.85 → 5.38 → 9.90 → 14.43`,
  settling at `14.43`. The numbers move *with* the drag, not at release.
- **Steps 7-8 (typed field moves the mesh)** still hold: typing `-35` into Position Y
  landed on exactly `-35`.
- **New, and the point of this re-drive**: the three dimension numbers stayed **frozen
  across both the drag and the typed move** of a tilted body. Moving something does not
  change its size, and now the lines say so — previously a rotated body's world-axis box
  was the thing being reported, so this is the first drive where that claim means
  anything. Exactly one body throughout; the untouched Cube's centre unchanged.

**One real defect found that no test caught, and it is not this task's**: driving an
**out-of-order** rotation history — turn about Z (or Y) and *then* about X, which a user
reaches by dragging one ring and then another — makes the dimension numbers drift again.
Measured on a ⌀40 × 50 cylinder: `Y=45` then `X=45` reports **46.82 / 51.05 / 59.42**
instead of 40/40/50, and `Z=90` then `X=90` reports the right three numbers attributed to
the wrong axes (**50 / 40 / 40**). Single-axis turns and an in-order X→Y→Z history are
exact. The cause is pre-existing and upstream of this task: `rotationDeg` is carried as a
**sum** of deltas while the geometry is their **composition**, so the Inspector's own
Rotation fields were already describing an orientation the body is not in. Filed with the
measured reproduction as `TODO/core-004`, and pinned by a unit test in
`src/core/inspector.spec.js` so it cannot quietly become folklore. Not treated as a FAIL
of this scenario: every step of scenario 2's own **Expect** passes, and the behaviour is
strictly better than before this task in every case measured, exact in the common ones.

**Re-checked**: 2026-09-06 19:16 — **PARTIAL PASS, still partial for exactly the same
reasons as before** (`core-004`). Steps 1 and 3-4 remain blocked on the missing Hardware
section (`ui-013`) and read-only Parameters, so the first sentence of **Expect** is still
not claimed. Steps 5-8 were re-driven at laptop/Chromium and phone/WebKit against an
**out-of-order multi-axis rotated** body, which is the case this task is about.

- **Steps 5-6 (gizmo drag, fields live during it)** still hold, now on a body carrying a
  composed two-ring rotation: dragging the X arm moved it and Position X was sampled
  mid-gesture at six points — laptop `-15.34 → -8.91 → -2.47 → 3.97 → 10.41 → 16.84`,
  settling at `16.84`; phone `-128.50 → -120.82 → -114.06 → -107.44 → -100.06 → -91.71`.
  The numbers move *with* the drag, not at release.
- **Steps 7-8 (typed field moves the mesh)** still hold: typing `-35` into Position Y
  landed on exactly `-35` on both.
- **The half this task is about**: the `ui-023` defect logged against this scenario on
  2026-09-06 18:52 is **fixed and confirmed by hand**. Driving the out-of-order histories
  that used to drift now gives the cylinder's own three numbers in every case. Re-driving
  the finding's own measured table by typing, on a ⌀40 × 50 cylinder:

  | history | was | now |
  |---|---|---|
  | X=30 then X=90 (single axis) | 40 / 40 / 50 | 40 / 40 / 50 |
  | X=30, Y=40, Z=50 (in order) | 40 / 40 / 50 | 40 / 40 / 50 |
  | **Z=90 then X=90** | **50 / 40 / 40** (right numbers, wrong axes) | **40 / 40 / 50** |
  | **Y=45 then X=45** | **46.82 / 51.05 / 59.42** | **40 / 40 / 50** |

  Reached by hand as well as by typing: dragging the **Z rotate ring** and then the **X
  rotate ring** — the gesture that produces this history without anyone typing anything —
  left all three lines at 40 / 40 / 50 throughout, mid-gesture as well as at rest, and
  they stayed at 40 / 40 / 50 after orbiting the camera. The Inspector's Rotation row
  then read `20.92° / -8.54° / 21.23°` at laptop and `98.84° / 55.89° / -172.66°` at
  phone: a genuinely three-component orientation with a **Y term the two drags never
  touched**, which is the visible signature of a composition and something a running sum
  could not have produced. Screenshots at each step; console clean in both drives.

**Re-checked**: 2026-09-07 17:07 — **PARTIAL PASS, still partial for the same reasons as
before** (`ui-021`). This task only changes how the gizmo's arms/heads/rings are painted
(per-axis SVG gradients, a double-stroke ring band, a drop-shadow filter) — it doesn't
touch steps 1/3-4's blockers, so the partial-pass boundary is unchanged. What was
re-driven, at laptop 1440×900 in Chromium: **step 5-6** — dragging the X translate arm
80px moved the cube and Position X was sampled live at six points mid-gesture
(`-89.53 → -84.89 → -80.24 → -75.6 → -70.95 → -66.31`), settling at `-66.31` — the field
moves *with* the drag, exactly as before this task's shading change. **Step 5-6 again,
rotation**: dragging the Z ring, grabbed at a real point on its rim (not its
bounding-box centre, which is the gizmo's own origin and gives a false negative — noted
here so a future re-check doesn't rediscover this), turned the cube and Rotation Z was
sampled live at six points (`0 → -9.11 → -17.78 → -25.69 → -32.68 → -38.73`), settling at
`-43.9`. **The point of this re-drive**: the new shading did not change the hit-test
geometry or the drag maths — both handles are still grabbable and both fields still
track live, at the same handle locations `ui-012`/`ui-017` established. Also re-checked
`ui-022`'s own repro while in the same session (its arrow markers are drawn by the same
component this task restyled): all three visible rings (`x`, `y`, `z`) still carry
exactly 2 triangular direction-arrow markers each, not swallowed or hidden by the new
gradient/shadow. Console clean.

**Re-checked**: 2026-09-11 19:45 — **PARTIAL PASS, still partial for exactly the same
reason as every entry above** (`ui-016`: steps 1-4's Bolt spec/fit edit is still not
drivable — no Hardware Library section, M2 — and is not claimed). Re-driven because
this task **changes `describeSelection`'s signature**, which every field in this
scenario reads through, so "the ordinary single-body path is unaffected when no
sub-part is active" had to be confirmed on screen and not only in a unit test.

Driven at laptop/Chromium with a Cylinder standing in for the Bolt: selecting it opened
the Inspector with its **own** schema (`Diameter 40 mm`, `Height 50 mm`) plus the
standing Transform section, unchanged from the last drive. Typing `60` into Position X
and pressing Enter moved the solid to exactly `60.00` (step 7-8's field→mesh
direction). Dragging the gizmo's X arm then updated the Position X field **live**,
sampled at four points mid-drag (`64.18 → 69.06 → 75.33 → 82.29`), and the committed
centre on release was `82.29` — the same number the field had been showing, so gizmo
and numeric entry still drive one transform in both directions (step 6's "not only
after release"). Console clean.

**Re-checked**: 2026-09-12 21:58 — **PARTIAL PASS, and the blocker named in every
previous entry since 2026-09-06 is gone** (`ui-029`). Still a partial, and still
deliberately reported as one — but for **one** remaining reason instead of two. Driven at
laptop 1440×900 in Chromium, laptop in **Firefox**, and phone 390×844 in **WebKit** (the
engine an iPhone actually runs), with a **Cylinder standing in for the Bolt**.

**The half that has been unmet through all seven previous drives of this scenario
(one `Last run` plus six `Re-checked`, 2026-09-06 to 2026-09-11), now met** — steps 3-4,
"the mesh visibly changes shape after the property edit", the first sentence of
**Expect**:
- The Inspector's **Parameters** fields are editable (`data-editable="true"`). Typing
  `10` into **Diameter** and pressing Enter narrowed the cylinder from 40 mm to 10 mm
  across on all three engines: measured size went `[40, 40, 50]` → `[10, 10, 50]`, the
  **Height was untouched**, the Size row followed to `10 / 10 / 50`, the dimension lines
  resized, and the field itself read `10` afterwards. The screenshot shows a narrow rod
  where a fat cylinder was.
- **It stayed exactly where it was** — centre `-60.51,36.03,25.00` before and after,
  byte-identical. This is the specific silent-snap-back failure the task was written
  around, confirmed absent rather than merely not obvious.

**Steps 5-8 re-driven and still holding** (they read through the same panel this task
changed): a real **gizmo X-arm drag** moved the body with Position X sampled live at five
points mid-gesture — laptop `-53.27 → -46.03 → -38.79 → -31.55 → -24.31`, phone/WebKit
`-45.92 → -38.22 → -30.53 → -22.83 → -15.14` — settling where the field had been showing;
then typing `-35` into Position Y landed on exactly `-35`. Gizmo and numeric entry still
drive one transform in both directions.

**Beyond the scenario's own steps**, because this task's failure mode is silent:
- **A param edit on a body that had already been moved *and* turned**: with the cylinder
  at `-24.31,-35.00,25.00` and Rotation X `30°`, editing **Height** 50 → 20 left the
  centre byte-identical, the rotation still `30°`, the diameter untouched, and exactly
  one body. Editing a parameter does not undo a move.
- **Chained edits**: Diameter → 18 after the Height edit kept Height at 20 rather than
  resurrecting the original 50. (This was genuinely broken mid-task — the first
  implementation spread each edit from the lineage's *root* params, so the second edit
  silently undid the first. Found by this task's own e2e run, fixed, and pinned by unit
  tests.)
- **Four rapid edits with no settle time** (12, 30, 7, 22) accumulated correctly and left
  one body.
- **Garbage input** (`abc`) restored the previous value and changed nothing, with no
  error shown — it never reaches the kernel.
- **A value the kernel refuses** (Height `0`) showed a visible message under the fields
  rather than vanishing into the console, and committed **nothing**: the solid kept its
  size. Correcting it to `35` cleared the message and committed normally. This reuses
  `ui-027`'s own popover-error convention rather than a second one.
- **The frozen case**: after a Fillet, the Parameters section reported
  `data-editable="false"`, `data-blocked-by="modify.filletRim"`, every field was
  `readonly`, and a note named the Fillet. Forcing `5` into the frozen Diameter box
  programmatically and blurring it changed nothing — volume identical to 3 decimal
  places — so the rounded rim is not discardable even by a determined user. Transform
  still worked on that same body, which is the point: the *parameters* freeze, not the
  panel.
- Console clean in all three drives.

**What is still NOT drivable and is therefore NOT claimed**: **step 1** (no Hardware
section and no Bolt row — M2), and with it the `spec`/`fit` half of step 3. Those are
`kind: 'text'` enum fields needing a dropdown fed by the recipe's own valid values, which
`ui-029` explicitly scoped out — a numeric parser is the wrong control for them. So this
scenario stays PARTIAL, but the reason has narrowed from "no editable params at all" to
"no enum editor, and no Bolt to need one".

**Re-checked**: 2026-09-16 23:20 — **PARTIAL PASS, for the same single reason as the entries above
and not because of this task** (`core-018`). Steps 1-4 (the Bolt `spec`/`fit` edit) are still not
drivable — the Library panel has one section, "Primitives", and no Hardware row — so they are not
claimed. Re-driven anyway because this task changes `registry.js`, which `src/core/inspector.js`
reads to build a body's param schema. **Steps 5-8 pass**, driven at laptop/Chromium: with a Cube
selected, its gizmo's X grab-arm was dragged and the Inspector's Position X was sampled *during*
the gesture — it read -13.51 → -4 → 6.45 → 16.9 while the button was still down, so the fields
track the drag live rather than only on release. Typing `-30` into Position X and pressing Enter
moved the mesh to match. Body count stayed 1 throughout, so the moved Cube kept its identity
rather than becoming a second body. Console clean.

**Re-checked**: 2026-09-17 19:12 — **PARTIAL PASS, and the partial has moved** (`ui-030`).
**Step 1 is driveable for the first time**: the Library panel now has a **Hardware**
section and a real Bolt row, so "drag a Bolt into the viewport and release" is a gesture a
person can actually perform. It was hand-driven at laptop 1440x900/Chromium and phone
390x844/WebKit.

- **Steps 1-2 PASS.** The Bolt drops at the release point resting on the grid
  (`-59.50,59.50,13.75`, size 19 x 16.45 x 27.5 mm) and is selected. The Inspector opens
  on it showing its own recipe schema — **Spec `m10 hex`, Length `20`, Fit `loose`** —
  alongside the standing Transform section reading the solid's real position, rotation and
  size. (`color` is not among them: that is `data-005`/`ui-037`, not this task, and is not
  claimed here.)
- **Steps 3-4 remain NOT driveable and are not claimed** — but the reason has narrowed
  again and is now *stated on screen* rather than discovered by typing. All three fields
  are `readonly`, the section reports `data-editable="false"`
  `data-blocked-by="hardware.bolt"`, and the panel explains itself: *"These are catalogue
  values for a ready-made part, not dimensions you can type over: Bolt is built from a
  size table, so changing it means picking another size rather than entering a number.
  Move, rotate and delete all work as usual."* Forcing `99` into the frozen Length
  programmatically and blurring changed **nothing** — same volume, same body — so the
  freeze is not merely cosmetic. What is still missing is the size picker `ui-029`
  explicitly scoped out; a numeric parser is the wrong control for `spec`/`fit`.
- **Steps 5-8 PASS on a composite**, which is new and was the real question this re-check
  existed to answer: a placed Bolt's lineage *already ends in* a `transform.translate` (the
  drop's own), so a gizmo drag stacks a second one. With the Bolt selected, its gizmo's X
  grab-arm was dragged and Position X was sampled **during** the gesture: `-58.11 →
  -52.64 → -47.17 → -41.71 → -36.24`, settling at `-36.24` — live, not only on release.
  A rotate-ring drag turned it to `-45.94°` about Z. Typing `-35` into Position Y moved it
  to exactly `-35.00`. Throughout: **one body, same id (`bolt-1`), volume unchanged at
  3 647.047 mm³** — the moved bolt kept its identity rather than becoming a second body.
  A Cube driven with the identical gesture in the same session gave identical samples,
  which is how "the gizmo works on a composite" was told apart from "the driver worked".
- Console and page errors: none.

**Re-checked**: 2026-09-19 03:52 — PASS, undo-relevant slice only (`data-003`), per that task's own Testing section, which names "scenarios 2/4 where a transform or boolean is undone" rather than the whole scenario. Laptop 1440x900 (Chromium). Steps 5-8's gizmo/field sync were re-driven and then **undone**: a real X grab-arm drag moved Cube 1 from `-75.39,-30.13,20.00` to `-37.98,-30.13,20.00`; Ctrl+Z (cursor in the viewport, not a field) returned it to `-75.39,-30.13,20.00` **exactly**, and the independently placed Sphere 1 was byte-identical throughout (`-18.55,124.18,20.00`, volume `32975.534`) — nothing silently reverted alongside the undone move. The Redo button reapplied `-37.98` exactly. The Inspector's own field path was undone too: typing Diameter `70` on a Cylinder took its volume `62428.903 -> 191188.516`, Undo returned it to `62428.903` exactly, Redo back to `191188.516`, with the tooltip naming it `Undo: Edit Cylinder 1`. **The field-undo carve-out was checked rather than assumed**: with the caret in the Inspector's Diameter field, Ctrl+Z left the document completely unchanged (the browser's own field undo wins, per the confirmed shortcut table). Selection was restored to the cube after each undo, so the gizmo and Inspector stayed attached. Console clean.

**Re-checked**: 2026-09-19 04:56 — **PARTIAL PASS, unchanged in kind** (`data-004`). Re-driven because every append and every undo in this scenario now goes through a fold that can skip and stop; nothing about the hardware freeze changed. Laptop 1440x900 (Chromium), with a Cube placed **first** so a composite lands after an existing body. Step 1 PASS: the Bolt drops as its own body (`51.41,11.15,13.75`, volume `3647.047`) and the Cube is byte-identical. Step 2 PASS: the Inspector opens on `Bolt 1` showing **Spec `m10 hex`, Length `20`, Fit `loose`** plus Transform Position/Rotation and a read-only Size — and says why in prose ("These are catalogue values for a ready-made part, not dimensions you can type over"). **Steps 3-4 still NOT driveable and not claimed**: the three Parameters fields are `readOnly`, which is `ui-029`/`ui-030`'s deliberate composite freeze awaiting a catalogue dropdown, not a regression — and, worth stating now that `data-004` exists, **editing a Bolt from the *timeline* will hit the same freeze** (`stepParamEditability` refuses a composite row for the same reason), so `ui-032` inherits this gap rather than closing it. Steps 7-8 PASS: typing `12` into Position X moved the Bolt to exactly `12.00,11.15,13.75` while the Cube stayed byte-identical, and **Undo restored the whole document byte-identically**. Console clean.

**Re-checked**: 2026-09-24 16:31 UTC: **PARTIAL PASS, unchanged in kind** (`ui-044`). Bolt `spec`/`fit` are still read-only by design (`ui-030`), so steps 3-4 still can't be performed. Drove steps 1-2 and 5-8 on a real Bolt on laptop Chromium, laptop WebKit and phone WebKit: the Inspector field tracked the gizmo drag live, the field matched the measured centre on release, typed X = 25 landed exactly, and two Undos walked back through the typed move and the gizmo move to the dropped bolt, byte-identical. `ui-044`'s own change (primitive param edits) was driven separately with `data-003`'s repro on a moved body. Place a cube and a cylinder, move the cylinder by gizmo, type X, type Y, set Diameter 12, then Subtract. Five Undos walk back through all six snapshots one user action per press, and five Redos walk forward; every state matched byte for byte, including the Subtract (64000 - 4494.9 = 59505.119 mm³). PASS on laptop Chromium, laptop WebKit, phone WebKit (touch) and tablet WebKit (touch).

**Re-checked**: 2026-09-26 11:50 UTC — **PARTIAL PASS, unchanged in kind, plus the Color row `ui-037` added now shows the Bolt's recipe colour state** (`render-003`). Step 2's own text names `color` alongside `spec`/`length`/`fit` as fields the Inspector should show. Driven at laptop 1440x900 Chromium: a dropped Bolt's Inspector shows the standing Color row reading **`Default`** with a theme-blue swatch, not any of the recipe's own `head`/`thread`/`tap` colours — correct and by design, since a Bolt has three differently-coloured parts and there is no single "whole body" colour to show (only a single-visible-part composite, like a Washer, gets a recipe colour in that row). The rendered mesh itself still shows its real per-part colours regardless of what the whole-body swatch reads. Steps 1 and 3-4 remain not driveable/not claimed for the same reason as every prior entry (no `spec`/`fit` enum editor yet). Console clean.

### 3. Snap-placement of a kit assembly

**Steps**:
1. From the Library panel's "Raspberry Pi" section, drag a "Raspberry Pi 5" board row
   into the viewport and release to drop it.
2. From the same section, drag a "Camera Module V3" row and start dragging it toward
   one of the Pi board's mounting holes.
3. While the drag is still in progress (before release), confirm dashed alignment
   guides appear on the Pi board's faces/edges nearest the camera module's current
   ghost position.
4. Continue the drag until the ghost is within the snap tolerance radius of a mounting
   hole; confirm the ghost visibly snaps to the hole.
5. Release to drop the camera module.

**Expect**: Alignment guides appear on the board during the drag (step 3), the ghost
snaps into place once within tolerance (step 4), and on release the camera module sits
aligned to the board's mounting holes, not at an arbitrary offset position.

**Last run**: 2026-09-09 13:06 — **PASS, with a named stand-in for the two parts**
(`ui-013`). Hand-driven at laptop 1440×900 in Chromium, phone 390×844 in WebKit and
tablet 820×1180 in WebKit (the engine an iPhone and an iPad actually run), touch input
on both touch viewports.

**The stand-in, stated rather than glossed**: steps 1-2 name a Raspberry Pi 5 board and
a Camera Module V3. Both are M4 items (`core-014`/`core-015`) and neither exists yet;
`hardware.nut`/`hardware.washer` (`core-010`/`core-011`) had not landed either, and
`hardware.bolt` — which does exist in the kernel — has no Library row yet, since the
Hardware section is fed by those same M2 recipe tasks. So the drive used **a Cube as the
reference item and a Cylinder as the part snapped onto it**, per this task's own
sequencing note ("proving it against any two placeable items is the bar"). What is
claimed here is therefore the **mechanism**: guides on approach, a snapped ghost, and a
snapped commit. The literal RPi-plus-camera assembly remains `core-014`'s own bar.

**Steps 3-4 (the half no scripted spec can make on its own)**: the second row was dragged
in on a wandering, jittery path with a deliberate overshoot and a doubling-back, and
`data-snapped`/the guide count were sampled at **ten points along the approach** rather
than at one. The guides genuinely appear *on approach* and not before — laptop:
`fx=0.90 … 0.60` all un-snapped, then snapped from `fx=0.56` inward; phone: un-snapped
to `fx=0.66`, snapped from `fx=0.60`. Retreating back out to the far corner mid-drag
dropped them again, and coming back in brought them back — driven four times in a row
(`far → close → far → close`), which is the check that matters most: a guide that once
appeared and then never let go would pass every fixed script ever written.

**Step 5, and the claim the whole scenario turns on**: the **snapped** position committed,
not the raw pointer position. Measured rather than eyeballed — the identical screen
gesture was replayed on a second, empty page where there was nothing to snap to, and the
two drops landed in different places: laptop `-110.70,70.22` (snapped, exactly the
reference's own centre) against `-97.21,70.61` (the raw pointer alone); phone
`-99.29,81.63` against `-89.71,78.11`; tablet `-96.74,84.18` against `-88.04,79.79`. The
placed part is aligned to the reference, not at an arbitrary offset — which is exactly
what **Expect** asks for.

**Beyond the scenario's own steps**: an **orbit** between drags, after which the guides
still projected onto the solid from the new angle (and correctly switched from a centre
alignment to a face alignment as the approach angle changed); a **cancel** mid-gesture,
which cleared both guides and ghost and placed nothing; the drag driven under
`pointerType: 'touch'` end to end on both touch viewports; and the **light colour
scheme** as well as dark. Console clean in every drive.

**The drive found two real defects no test could see, both fixed in this task and
re-driven**:
1. When the ghost snapped *centred* on the reference, the two boxes coincided, so the
   guide spanned only their union — a dashed stub exactly as long as the solid it lay on
   top of, geometrically correct and invisible in practice. Guides now overhang by one
   tolerance at each end (`GUIDE_OVERHANG_RATIO`), so the line runs visibly past what it
   aligns; pinned by a unit test asserting the span exceeds the solid's own size.
2. The guides were drawn in `--accent`, which is also the transform gizmo's ring colour
   and the Z dimension line's — so over a selected body (and the body just dropped *is*
   selected) they read as a fourth part of the gizmo rather than as a placement cue. They
   now have their own `--snap-guide` token, magenta, defined for both colour schemes.

**Also measured, since `ui-013` calls for the tolerance to read the same at any zoom**:
the engagement distance shrinks monotonically as the camera zooms in — 83.7 mm apart at
distance 420, 70.0 mm at 215, and only ~7 mm at 110 — so zooming in does buy finer
control rather than the snap staying equally grabby. The exact conversion
(`SNAP_TOLERANCE_PX × mmPerPixel`) is pinned by unit tests; how the 48 px radius *feels*
on real hardware is logged in `TODO/VERIFY.md` rather than claimed here.

**Re-checked**: 2026-09-11 20:19 — **PASS, with the same named stand-in `ui-013` used**
(`ui-026`). `core-013`'s own retirement note states this task "feeds §9 scenario 3 (kit
assembly placement)" once it exists, for the still-M4-blocked RPi/Camera case — the
Raspberry Pi 5 board and Camera Module V3 remain unbuilt Library rows, so this re-drive
again stands a Cube in as the reference item and a Cylinder in as the item being
positioned against it, exactly as `ui-013`'s own PASS entry above already established
for the drag-time mechanism. What's new here is the **precise, computed** counterpart:
not a drag-time snap guide, but the Operations toolbar's new Snap/Align buttons moving
an *already-placed* item against another on command.

Driven at laptop 1440×900 (Chromium): a Cube and a Cylinder dropped apart and confirmed
not overlapping. Selected Cube then Cylinder (order matters — Cube is "moving", Cylinder
is "reference"), opened **Align**, checked the **Z** axis, and clicked **Align** inside
the popover. The Cube's centre moved from `z=20.00` to `z=25.00` — exactly the
Cylinder's own centre — while its **X and Y stayed at `-103.21,-27.98`, untouched**, and
the popover's own copy read *"Moves the moving item (first selected) against the
reference item (second selected), which never moves. Unlike every other button here,
both stay separately selectable afterward — nothing is combined"* — the literal
divergence-from-precedent this task's Interaction model calls for, present verbatim, not
paraphrased into something weaker. Clicking the Cube afterward showed its own
`Cube 1` Inspector entry; clicking the Cylinder showed its own `Cylinder 1` — neither
merged, no breadcrumb, no stale fields.

Re-selected the same pair and ran **Snap** (Z axis, orientation `Outside +`, 5 mm
offset): the Cube moved a second time, to `z=-15.00`, matching `calcSnap`'s own
arithmetic on the two real bodies' bounds to the hundredth of a millimetre
(`0 − 45 + 5 = −40`, `25.00 + (−40) = −15.00`) — computed independently, not eyeballed
against a screenshot. The Cylinder's position was byte-identical before and after both
commits. Console clean throughout.

**Beyond the scenario's own steps, driven freeform at phone width (390×844, touch,
WebKit)**: the popover — new UI surface this task adds — rendered fully on-screen with
no horizontal clipping and every control (axis checkboxes, orientation dropdown, offset
field, Cancel/commit buttons) reachable by touch. A real (hit-tested, not a bypassing
`element.click()`) touch tap on the on-screen nav-chrome's Pan button *while the popover
was open* was correctly swallowed by the popover's own backdrop rather than reaching the
control underneath — confirmed by the drag mode staying `orbit` rather than flipping to
`pan`. Screenshot on file. This is the literal check this task's own Interaction model
flagged as needing its own verification ("it may need to anchor differently... check for
edge-of-viewport clipping at phone width specifically"), and it holds.

**Re-checked**: 2026-09-13 19:43 — **PASS, and for the first time with no stand-in for
the two parts** (`core-016`). Every prior entry above stood a Cube and a Cylinder in for
the board-plus-accessory pair, because no composite existed. `core-014` and this task
close that: the drive used a **real `raspberrypi.bplus` board and a real
`raspberrypi.touchScreen2` screen**, then repeated the whole thing with
`raspberrypi.touchDisplay7inch`. This is the RPi-plus-accessory case `ui-013`'s and
`ui-026`'s own entries named as still-blocked and deferred to M4.

Driven at laptop 1440×900 (Chromium) and phone 390×844 (touch). Both bodies were
appended through the document store's own `append` — the command layer, the same one
`OperationsToolbar.vue` uses — rather than dragged from the Library, because the Library
is `primitive.*`-only by design (`src/core/library.js:58`) and no composite has a row
yet; that is `core-016`'s own stated Interaction model, not a gap this drive found.

**What the re-drive was actually for** (`CLAUDE.md`'s standing-regression-surface rule):
`ui-026` proved Snap/Align against two primitives with one part each. These composites
have **29 and 27 named parts**, so the question was whether the operation still resolves
against a Group that size. It does:

- Both composites rendered — 467 and 478 distinct canvas colours respectively, so a real
  drawn frame, not the blank/black rectangle `SECOND-ATTEMPT.md` warns about. Screenshots
  on file; the 7-inch shot shows the board seated on the display with every connector.
- Each body was individually pickable by a real hit-tested viewport click despite the
  part count, and `data-selected-count` went 1 → 2 on shift-click, enabling Snap/Align.
- **Align (Z)** moved the screen by exactly the difference of the two centres and left
  the Pi's `hole1` bounds byte-identical.
- **Snap (Z, `outside+`, 5 mm offset)** moved the screen by −11.7000 mm — computed
  independently from `calcSnap`'s own arithmetic on the two real bodies' bounds
  (`pi.min.z(−1.5) − screen.max.z(15.2) + 5`), not eyeballed — the Pi again unmoved, and
  both bodies still separately listed afterward.
- At phone width the popover fitted fully (x 65…325 inside 390) with `scrollWidth` 390,
  i.e. no horizontal overflow, with both composites loaded.

**The V1-equivalent attachment, driven as records**: the two sub-part-addressed records
`core-016` hands to the user — `group.align` on `xy` and `group.snap` on `z`/`outside+`,
addressed `{ id, pieces: 'piMountingPost1' }` / `'piMountingPad1'` against the Pi's
`hole1` and `mb` — were appended live and the result compared part-by-part against real
`jscad-raspberrypi@62a8e3b` output. **All 29 TouchScreen2 parts match V1 to 1.4e-14 mm,
and all 27 7-inch parts to 3.6e-15 mm.** That is the claim "dropping the board parameter
changes the frame and nothing else", checked in the running app rather than argued.
Console clean in every drive.

**One real gap this drive found, and it is not a regression** — the popover itself says
*"Whole-object snap/align only — sub-part addressing isn't available yet."* So the
attachment above is reachable through the **document/command layer** (proved) but **not
yet through the toolbar by hand**: a user can select the screen and the Pi and snap them
whole-object, but cannot say "this pad against that hole". `core-013` registered
`pieces`; no UI constructs it. This is the same standing blocker scenario 5 records as
its "Blocker 2", now reached from a second direction, and it wants its own `ui-*` task —
logged in `TODO/VERIFY.md` rather than silently absorbed here.

**Re-checked**: 2026-09-16 23:21 — PASS (`core-018`). Re-driven because this task makes
`kit.boardFrame` — a composite this scenario's machinery also uses — be consumed *as a record
nested inside another composite's expansion* for the first time. Driven at laptop/Chromium with a
Cube as the anchor and a Cylinder crept toward it: dashed alignment guides appeared during the
drag while the pointer was still down, the ghost snapped, and on release the Cylinder landed at
X/Y `-13.51, -13.51` — exactly the anchor's own centre, concentric rather than at an arbitrary
offset — while the anchor itself never moved. After release the guide elements are still in the
DOM but each reports `visible: false` and nothing is drawn on screen; checked explicitly rather
than inferred from an element count, because a count-only check had suggested otherwise. Console
clean. The RPi-board-plus-camera wording of the Steps is still driven with primitives, since no
Raspberry Pi Library section exists — unchanged by this task, which adds no `ui` metadata.

**Re-checked**: 2026-09-17 23:58 — **PASS, and for the first time with the parts this
scenario actually names** (`ui-031`). Every prior run of this scenario since `ui-013`
used a Cube-and-Cylinder stand-in, because steps 1-2 name a **Raspberry Pi 5 board** and
a **Camera Module V3** and neither had a Library row. Both now do, so the stand-in is
retired and the literal scenario was driven. Laptop 1440x900 in Chromium, against the
real dev server.

- **Step 1**: the Raspberry Pi row's **Model** dropdown opened on `4` (the row default),
  was set to **Pi 5**, and the board was dragged in — landing at `-63.57,32.97,9.54`,
  90.5 x 57 x 19.07 mm, drawn as a recognisable Pi 5 with its ethernet/USB stack, the
  USB-C and HDMI row, the GPIO strip and both ribbon connectors. Not a blank frame and
  not one undifferentiated blob.
- **Steps 3-4, the half no scripted spec can make on its own**: the Camera Module row's
  dropdown (defaulting to `v3`) was left at **Camera v3** and the camera crept toward the
  board, with `data-snapped` sampled at **eleven points on the approach** — and, crucially,
  sampled *after letting Vue flush*, which an earlier pass of this drive got wrong and
  which produced a false "never snaps" reading worth recording so the next drive doesn't
  repeat it. The guides genuinely appear **on approach and not before**: un-snapped from
  fx 0.95 down to 0.66, snapped from **fx 0.62** inward. Retreating back out to fx 0.70 /
  0.85 / 0.95 dropped them again, and coming back in (0.70 → 0.58 → 0.50) brought them
  back — driven far → close → far → close, which is the check that matters most, since a
  guide that appeared once and never let go would pass any fixed script ever written.
- **Step 5, and the claim the whole scenario turns on**: the **snapped** position
  committed, not the raw pointer position — measured rather than eyeballed by replaying
  the identical gesture on a second, empty page with nothing to snap to. The two drops
  landed in **different places**: `-63.57,48.97` snapped against `-48.27,48.27` raw. The
  camera's X is **byte-identical to the Pi's own X** (`-63.57`), while its Y stayed where
  the pointer was — which is the per-axis independent snapping working exactly as
  designed (aligned to the board's centre line on one axis, left alone on the other),
  not a partial failure. The Pi itself never moved.
- Console clean. Screenshots taken on approach and after the drop.

**Re-checked**: 2026-09-18 01:47 — **PASS, and the sub-part half of this scenario is
real for the first time** (`ui-035`). `core-016`'s own retirement note recorded the
honest gap this re-drive closes: the assembly it designed (a screen's pad against a
*particular* hole) was reachable through the command layer but the popover itself said
*"Whole-object snap/align only — sub-part addressing isn't available yet."* That line is
gone, and what replaces it was driven rather than asserted.

**The scenario's own steps 1-5, with the real parts** (no Cube/Cylinder stand-in): a
**Raspberry Pi 5** (the `Raspberry Pi` row's own Model dropdown, `ui-031`) and a **Camera
Module V3** dragged in at laptop 1440×900. Both rendered complete. The camera was dragged
toward the board on a wandering path with a deliberate overshoot and a doubling-back,
sampling at seven points: un-snapped at t=0.15/0.40/0.65, **snapped** at 0.85, released
again on the overshoot at 1.15, and snapped again coming back (0.95, 1.00) — the guide
genuinely lets go and re-engages rather than latching once. Three guides drawn throughout.
On release the camera's **Y was byte-identical to the board's** (`-40.53` both) while X
stayed where the pointer was: per-axis snapping, not an arbitrary offset. **PASS.**

**The new half — precise attachment by named part.** Driven at laptop 1440×900 (mouse)
and phone 390×844 (touch pointers end to end), both Chromium:

- Clicking the board once selects the whole board; clicking again narrows to the part
  under the ray, with the Inspector breadcrumb reading `Raspberry Pi 1 › ethernet`.
- Shift-clicking a Cube makes it exactly 2, **with the pick depth surviving**, and the
  Align popover's new top line states what is armed: *"Aligning **Raspberry Pi 1 ›
  ethernet** to **Cube 1**"*. This line is the whole feedback contract — a sub-part move
  and a whole-object move look identical once they have happened.
- Committing X+Y moved the board so the **Ethernet jack**, not the board's centre, landed
  on the Cube. Verified as arithmetic against the kernel rather than eyeballed: an
  independent probe measures the `ethernet` part's centre at **(+34.50, −17.30) mm** from
  the board's bounding-box centre, and the live move implies exactly `cube − board_after`
  = **(34.50, −17.30)** at *both* viewports, to the hundredth of a millimetre. A
  whole-object align would have put the board's own centre on the Cube instead. The
  Inspector's own readout for the drilled part agrees a third time (board centre
  `-139.01,113.60` + offset = part position `-104.51,96.30`).
- **The reverse direction, which is the realistic assembly**: with the board drilled in
  and Shift-clicked off and back on, it lands at the *end* of the selection and becomes
  the **reference** — *"Snapping **Cube 1** to **Raspberry Pi 1 › ethernet**"*. Snap on
  X+Y at `center+` moved **the Cube** and left the board byte-identical (`-27.02,-27.02`
  before and after); the Cube's max corner landed exactly on the jack's centre
  (`7.48,-44.32`), which is `center+`'s own definition. So addressing is genuinely
  **asymmetric**: either operand may be a part while the other is whole.
- At **390 px** the popover measured x=65 w=260 (inside a 390 px client) with the new
  operand line at x=74 w=242 — fully inside the popover, `scrollWidth === clientWidth`,
  no horizontal page scroll. Screenshot on file; the line sits directly above
  Cancel/Align, which is the last thing read before committing.
- Console clean in every drive.

**What the drive found that no test would have**: the Goal's own literal example — "a
specific **hole** on a Pi board" — is still not performable, for a reason outside this
task. A 289-point pointer sweep across the board at the default camera reached only
`mb`, `ethernet`, `usb1` and `usb2`; `hole1`–`hole4` pass *through* the PCB, so the
raycast hits `mb` in front of them every time. The operand mechanism is complete and
proven, but the *selection* of an occluded part is a `ui-016` picking limitation. This
corrected `docs/snap-align.md` (which had been drafted around a mounting hole, and now
uses the Ethernet jack, a part actually reachable) and is logged in `TODO/VERIFY.md`
rather than silently left as a doc that describes something a user cannot do.

**Re-checked**: 2026-09-20 23:58 — **PASS** (`ui-040`). Re-driven because this task's
whole design question was whether `drillInto`'s rule had to change — it did not, and
this is the scenario that would have caught it if it had. Laptop/Chromium: two solids
grouped, a third placed beside them; the first click on the group selected the **whole
group**, a second click on a member drilled to **`Cube 1`**, a click on the other member
re-targeted straight to **`Cylinder 1`** without stepping up first, and the breadcrumb's
group segment stepped back up (no part crumb left). `ui-035`'s own path was re-driven on
top of it: with `Group 1 › Cube 1` drilled and a third body Shift-clicked, the Align
popover read **"Aligning Group 1 › Cube 1 to Cone 1"** with `data-subpart="true"`, and
the commit moved the group by the member's own arithmetic (centre x -74.57 → -93.11)
while the reference stayed put. Console clean.

**Re-checked**: 2026-09-24 02:42 UTC — **PASS, with the real parts for the first time** (`core-029`). This scenario's snap neighbours are measured with `boundsOf` at every drag start, which `core-029` changed for composites (parts' boxes instead of a union). Laptop 1440x900 Chromium, real mouse: a **Raspberry Pi 5** (the Library row's model select set to Pi 5) dropped, then a **Camera Module v3** dragged in on a wandering path — far, close, far again, close again — sampling `data-snapped` and the `snap-guides` count at ten points: un-snapped with 0 guides at fx 0.92/0.80/0.66, **snapped with 2 guides from fx 0.55 inward**, back to 0 on retreating to 0.90 and 0.60, snapped again on the second approach. Dashed guides visible on the board mid-drag (screenshot). Committed at the board's exact XY centre `-5.94,-46.20`; the **identical gesture on an empty page** lands at `3.26,-44.51`, so the snapped position is what commits. The Inspector reads the Pi 5 as **90.5 × 57 × 19.07 mm** — its real extents, from the new part-wise bounds. **Limit, stated**: the snap is to the board's centre/faces, not specifically to a mounting hole; the scenario's hole-alignment wording is still not claimed. Console clean.

**Re-checked**: 2026-09-26 11:50 UTC — **PASS, "renders complete" now means its own colours too** (`render-003`). This task's own Testing section names this scenario for exactly one reason: a kit assembly has to render *complete*, and a translucent recipe part (alpha < 1) is a real way for "complete" to silently fail (hidden behind, or z-fighting with, an opaque part it should show through). Laptop 1440x900 Chromium: dropped a real `raspberrypi.bplus`. It rendered as a recognisable board — translucent green PCB with its components (USB/ethernet stack, GPIO header) visibly drawn on and through it, not a blank silhouette, not hidden by the parts sitting on it, and no visible z-fighting where the translucent board and its opaque parts share a boundary. Screenshot inspected by eye. This is the transparency check this task's own Proposed fix section asked for (`depthWrite: false` on the alpha < 1 material), confirmed on screen rather than only by the unit test's material-property assertion. Console clean.

### 4. Boolean gating

**Steps**:
1. Drag two solids (e.g. two cubes) into the viewport so they overlap.
2. Click one solid to select it alone. Confirm the Operations toolbar's
   Union/Subtract/Intersect buttons are disabled (dimmed, non-interactive), and confirm
   a tooltip on hover/long-press reads "select 2 or more solids".
3. Shift-click (or platform-equivalent multi-select) the second solid so both are now
   selected. Confirm the toolbar shows a live counter badge (e.g. "2 selected") and the
   Union/Subtract/Intersect buttons become enabled.
4. Confirm the first-selected solid is outlined in the standard selection-highlight
   color and the second-selected solid shows a visually distinct secondary highlight
   (dimmer or differently-hued outline), making the base/subtrahend order visible
   before running Subtract.
5. Click "Subtract".
6. Confirm exactly one resulting solid remains, selected, and the Operations toolbar
   buttons disable again (back to the single-selection state).

**Expect**: Buttons stay disabled at 0/1 selected and enable only at 2+ (step 2-3). The
base/subtrahend visual indicator is visible before Subtract runs (step 4). The result
after Subtract reflects both operands (material removed where the second solid
overlapped the first) and the toolbar disables again once only the result remains
selected (step 6).

*(Note: step 4 is the Subtract base/subtrahend indicator check
`docs/decisions/interaction-model-qa.md` control 5 flagged for this scenario — the
original §9 draft only checked count-gating, not the order indicator.)*

**Last run**: 2026-09-10 17:52 — **PASS** (`ui-014`, the task that makes this scenario
driveable at all — first run of this scenario ever). Hand-driven at laptop 1440×900 in
Chromium, and touch-only at phone 390×844 and tablet 820×1180 in WebKit (the engine an
iPhone and an iPad actually run).

- **Steps 2-3, the count gate**: with one solid selected the toolbar read `1 selected`,
  all three buttons were `disabled`, and hovering any of them showed **"Select 2 or more
  solids"** — the tooltip this scenario asks for by name. Shift-clicking the second solid
  flipped the badge to `2 selected` and enabled all three. Checked at 0, 1 and 2 selected
  rather than only at the enabled end, because a presence-gate and a count-gate are
  indistinguishable if you only ever look at "something is selected".
- **Step 4, the base/subtrahend indicator** — the half `docs/decisions/interaction-model-qa.md`
  control 5 flagged, and the half a scripted spec can assert but not judge. It reads
  clearly: the first-picked solid keeps the amber selection colour and the second turns
  **teal**, an unmistakably different hue rather than a dimmer shade of the same one, and
  the badge spells it out in words next to two matching colour chips ("first is the
  base"). Confirmed by screenshot at every viewport, not by reading the data attribute.
  Picking the two solids in the **opposite** order swapped the colours, so the indicator
  follows the click order rather than document order.
- **Steps 5-6, the result**: driven for all three operations against two 40 mm cubes
  overlapping by exactly 20 mm, and **measured by volume rather than by eye**, since a
  boolean that quietly returned one of its operands would look plausible in a screenshot.
  Subtract → one body, 20×40×40, **32 000 mm³**; Union → 60×40×40, **96 000 mm³**;
  Intersect → 20×40×40, **32 000 mm³** — all three exactly the arithmetic answer, each a
  clean 6-polygon solid. Two bodies became one every time (not three, not zero), the
  result auto-selected with the Inspector and gizmo attaching to it, and the toolbar
  **dimmed again** because one selected is no longer two.
- **Order really drove Subtract**: the same pair run base-first-A gave a result centred at
  the cut side of A, and base-first-B gave the mirror — the results differ, so ordering is
  genuine rather than incidental.
- **Beyond the scenario's own steps**: driven touch-only at phone and tablet (multi-select
  via the `Select` marquee chrome, since a touch device has no Shift key), where the
  toolbar sits at the viewport's top-left, clear of both bottom sheets, with 38 px/44 px
  tap targets and no horizontal page scroll; pressing an operation a second time is inert
  rather than throwing, because the button is genuinely disabled; and one operand was
  **moved first**, which is the case that would silently cut a hole where a body *used to
  be* if the toolbar named lineage roots instead of `currentIdOf(...)`. Console clean in
  every drive.

**One rough edge found, logged not fixed, and not this task's**: when two faces are
*nearly* but not exactly coplanar — which is what you get by typing a rounded coordinate
against a dragged, full-precision one — `@jscad/modeling`'s subtract leaves paper-thin
sliver polygons. The volume is still right (32 004.54 mm³ against 32 000 expected, a
0.014 % error) but the **bounding box still spans the uncut base**, so the dimension
lines and the Inspector's Size row report the *original* 40 mm rather than the cut 20 mm.
Exactly-coplanar and clearly-non-coplanar inputs are both clean (6 polygons, exact
volume). Pre-existing kernel numerics, reachable since `core-001`, unrelated to this
task's changes — logged in `TODO/VERIFY.md` with the measured reproduction.

**Re-checked**: 2026-09-10 22:19 — PASS (`core-020`). Not required by that task's own
scope (no composite appears anywhere in this scenario), but re-driven because the fix
sits in `evaluate()`'s shared fold and this scenario's whole claim is about what a
boolean returns. Laptop 1440×900 in Chromium.

- **Steps 2-3, the count gate**, unchanged: 0 selected → all three buttons disabled with
  the tooltip **"Select 2 or more solids"**; 1 selected → still disabled, same tooltip;
  2 selected → badge reads `2 selected` / "first is the base" and all three enable.
- **Steps 5-6**: Subtract left **exactly one body**, auto-selected, and the toolbar
  **dimmed again**. Measured by volume rather than by eye, on geometry replayed from the
  document's own records: two 40 mm cubes (64 000 mm³ each) offset 10.62 mm in X and Y
  gave **29 484.3 mm³**, against the arithmetic answer 64 000 − 29.38²×40 = **29 477**
  (the 7 mm³ gap is the rounded centre readout, not the kernel). So material really is
  removed, and the result is neither operand.
- **Two degenerate cases driven deliberately, since both look like the `core-020` bug
  and neither is**: two **coincident** cubes subtract to an empty body (`0 × 0 × 0`) —
  arithmetically correct, A−A is nothing; and two **non-overlapping** cubes subtract to
  the base cube untouched (40 × 40 × 40). Both are right, and both were confirmed by
  reading the operands' centres rather than assumed.
- **A placement quirk found while driving this, logged not fixed**: at the default camera
  distance the snap engagement radius (48 px converted to mm) is *wider than a 40 mm
  cube*, so dragging a second cube anywhere near the first pulls it into **exact
  coincidence** rather than a partial overlap — which then subtracts to an empty body.
  Step 1 of this scenario ("drag two solids so they overlap") is therefore not performable
  by drag alone until you zoom in (5 zoom-in taps shrinks the radius enough; the overlap
  above was reached that way). Not this task's, not a regression — logged in
  `TODO/VERIFY.md`.

**Re-checked**: 2026-09-14 19:26 — PASS (`core-017`). Not required by that task's own
scope — no composite reaches this scenario — but re-driven because this task modifies
`src/core/kernel/fillet.js`, which backs the Fillet and Chamfer buttons sitting on **this
scenario's own toolbar**. Laptop 1440×900 in Chromium.

- **Steps 2-3, the count gate**, unchanged: with one body selected the badge read
  `1 selected` and Subtract was `disabled` with the tooltip **"Select 2 or more solids"**;
  shift-clicking a second body moved the badge to `2 selected` / **"first is the base"**
  and enabled it.
- **Steps 5-6**: Subtract took the document from **8 bodies to 7** and the button
  **disabled itself again** immediately afterwards.
- **The toolbar's other buttons were exercised in the same session** since `fillet.js`
  changed underneath them: Fillet on a 40 mm cube, face "Top (+Z)", radius 3 mm, committed
  cleanly and took the body from 64 000 mm³ to **63 700.84 mm³** — rim material removed,
  bounding box unchanged, which is `ui-027`'s own stated contract. That number is
  **bit-identical to the pre-change `fillet.js`** (63 700.904 mm³ measured directly against
  `git show HEAD:src/core/kernel/fillet.js`), so the negative-radius support and the
  vertex-realignment fix this task added are a genuine no-op for every positive radius the
  UI can produce — the popover gates commit on `radius > 0` and the input carries `min="0"`,
  so the relaxed sign is not reachable from this control at all.
- **One pre-existing limit surfaced while driving, not a regression and not this task's**:
  committing a *second* rim op against a *perpendicular* face of an already-filleted body
  is refused by `assertPrismaticBand` ("the solid is not prismatic over the rim band"),
  which `ui-027`'s Interaction model says should work. The error surfaces cleanly in the
  popover rather than producing wrong geometry, and it **reproduces identically against
  `fillet.js` at HEAD**, so it predates this task. Logged in `TODO/VERIFY.md`.

**Re-checked**: 2026-09-16 23:19 — PASS (`core-018`). Not required by this task's own scope — no
composite of its reaches this scenario — but re-driven because tool enablement reads
`acceptsOperandCount` off the very registry this task extends, and because the result of Subtract
comes out of the shared fold. Driven at laptop/Chromium with two overlapping Cubes: at 1 selected
the badge read "1 selected · select 2 or more solids" and Union/Subtract/Intersect were disabled;
shift-clicking the second took the badge to "2 selected", enabled all three, and showed the
"first is the base" legend **before** Subtract ran. Subtract left exactly one solid
(`bool-3`, `boolean.subtract`), still selected, with material visibly removed where the second
cube overlapped, and the toolbar disabled itself again. The Inspector correctly froze the
result's params as read-only. Console clean.

**Re-checked**: 2026-09-19 03:52 — PASS, undo-relevant slice only (`data-003`), per that task's own Testing section. Laptop 1440x900 (Chromium), two genuinely **overlapping** solids (a Cube, and a Sphere typed into overlap through the Inspector's Position fields — a first attempt with two drops was abandoned because snap-placement lands the second body concentric with the first, which is a drive artefact, not an app defect). The count gate re-confirmed: 1 selected left Subtract `disabled` with the "Select 2 or more solids" tooltip; shift-clicking the second took `data-selected-count` to 2 and enabled it. Subtract left exactly one solid with **material really removed** (`64000.000 -> 54858.239` mm3) and disabled the toolbar again. **The half this task adds**: pressing Undo brought **both original operands back, byte-identical** — `Cube 1@-75.79,-40.02,20.00/v64000.000` and `Sphere 1@-49.79,-36.02,20.00/v32975.534`, the exact strings recorded before the boolean — neither merged nor missing, which is `ui-014`'s `consumes` repro re-run against the rebuild. Both came back **selected** (count 2, per section 19's "undoing a boolean brings back and selects both operands"), and the Operations toolbar correctly re-enabled itself at that count rather than staying stuck in its post-boolean state. Redo returned to `54858.239` exactly. Console clean.

**Re-checked**: 2026-09-19 04:52 — PASS (`data-004`). Re-driven because a `consumes` record is the hardest case for a re-fold — undoing or replaying one has to *un-retire* two lineages — and this task changed the fold every one of them goes through. Laptop 1440x900 (Chromium), real mouse. **The count gate, both directions**: with 1 selected, Union/Subtract/Intersect/Group/Snap/Align were all `disabled` and Fillet/Chamfer/Enlarge/Fit/Bisect all enabled; Shift-clicking the second body took `data-selected-count` to 2 and **exactly inverted** every one of those ten — the multi-operand five enabled, the single-operand five disabled. Not "some became enabled": the whole gate flipped as a unit. Subtract then left exactly one body, `Subtract 1`, and both operands stopped being separately selectable. **Undo brought both back byte-identical** (`Cube 1@-41.39,-41.39,20.00/v64000.000`, `Sphere 1@51.41,11.15,20.00/v32975.534` — string-compared against the values recorded before the boolean, equal), and Redo re-consumed them back to the single `Subtract 1`. `ui-014`'s `consumes` repro, re-run against the widened fold. Console clean.

**Re-checked**: 2026-09-20 23:58 — **PASS** (`ui-040`, which changes `run()` and the
operand every one of these buttons commits). Laptop 1440x900/Chromium, driven out of
order rather than down the list. At 0 selected the toolbar read `0 selected` /
*"select 2 or more solids"* and `data-enabled="false"`; at 1 it stayed disabled with the
hover/long-press title **"Select 2 or more solids"**; at 2 it flipped to `2 selected` /
*"first is the base"* with the roles reading `Cube 1=base`, `Cylinder 1=secondary` —
the colour distinction this scenario's step 4 exists to check. The new operand line read
**"Cube 1 then Cylinder 1"**, with no part marker, which is the regression that matters:
an undrilled selection still commits bare ids. Step 5 was driven on a genuinely
overlapping pair (two 40 mm cubes overlapped 20 mm by hand, via Align Y/Z then Snap X
`inside+` 20): **64 000 → 32 000.000 mm³**, exactly the half removed, one body left,
selected, toolbar disabled again. Console clean.

**Re-checked**: 2026-09-21 20:36 UTC — **PASS** (`ui-041`, which adds a second route into the same count gate). Laptop Chromium, tablet and phone WebKit (touch taps for the list, real mouse clicks for the viewport). Driven out of order and *mixed*: the toolbar's `Union`/`Subtract`/`Intersect` were **disabled at 0 selected, disabled at 1, enabled at 2**, checked at every step of this sequence — sphere added by its list **check** (1), cube added by its check (2, all three enabled), sphere checked off (1, disabled again), a plain **row** tap (1, *replaces* rather than adds), a **viewport click** on the cube (1), then the sphere added from the list (2, enabled). So "2 selected" is reachable purely from the list, from the viewport, and from any mix of the two, and the gate reads the same count either way. Order carried through: the body picked first by a viewport click showed `base` and the one added from the list `secondary`, in the list's own check numbers (1, 2) and in the Operations toolbar (`2 selected`, *first is the base*). Console clean.

**Re-checked**: 2026-09-22 13:51 UTC — **PASS** (`ui-042`, which adds a pick *depth* reachable from the list — the count gate has to stay blind to it). Laptop Chromium and WebKit, tablet Chromium, phone WebKit. Driven with the depth set at every step, not just at the end: one body expanded and a child part tapped (**1 selected**, drilled — Union/Subtract/Intersect still disabled, exactly as an un-drilled 1 selected is), a second body added by its own check (**2 selected**, enabled — the *depth stayed on the first body* the whole time), the drilled body's own parent check toggled out (**1 selected**, disabled again — the depth was left in place, inert, per `ui-040`'s own dance) and back in (**2 selected**, enabled, depth revived on the same part). At every one of those four states the ten-button gate (the multi-operand five vs. the five single-operand ones) read exactly what an equivalent **un-drilled** selection of the same count reads — confirmed by comparing the two enabled/disabled arrays directly rather than by eye. Console clean.

**Re-checked**: 2026-09-22 14:33 UTC — **PASS** (`ui-043`, phone-width nav-chrome/toolbar overlap fix — re-driven specifically at **390×844**, since the badge/legend text this task touches is exactly what this scenario's step 2-3 reads). Real drag-and-drop (a Cube then a Cylinder, wandering pointer paths, `pointerType: 'touch'`) followed by real clicks, WebKit and Chromium. **Steps 2-3, the count gate**: 1 selected → `data-enabled="false"`, `title="Select 2 or more solids"` (the full sentence, unchanged — the phone-only legend shortening this task adds is cosmetic, not a title change), and the badge visibly reads `select 2+` at this width; shift-clicking the second body → `data-enabled="true"`, badge `first is the base`. **Step 4**: `data-selection-role` read `base` on the first-clicked body and `secondary` on the second, confirmed from the DOM at the same states the toolbar was measured in. **Steps 5-6**: Subtract took the document from 2 bodies to 1, the toolbar disabled again. **The scenario's own claim plus this task's own**: at both 1- and 2-selected, with the Inspector sheet open (the state the file's own numbers came from), `operations-toolbar`'s bounding rect and `navigation-chrome`'s did **not** intersect (a live measurement, not the fixed synthetic-selection one this task's own e2e spec also runs) — a real regression this scenario would not otherwise have caught, since scenario 4's own steps never previously drove the two-selected state at phone width with the Inspector open specifically. Every toolbar button and the chrome's `nav-mode-orbit`/`nav-mode-pan`/`nav-mode-select` passed a trial click (topmost-element-at-centre) in both selection states. Console clean in both engines.

**Re-checked**: 2026-09-24 02:42 UTC — **PASS** (`core-029`), laptop 1440x900 **Chromium** and tablet 820x1180 **WebKit**, real mouse. Two cubes dropped apart, the second moved to overlap the first by typing its X/Y into the Inspector. One selected: Union/Subtract/Intersect **disabled**, `title` "Select 2 or more solids". Second added through the Objects list check: badge **"2 selected — first is the base"**, the three enabled, and the order shown both ways — `data-selection-role` base vs secondary, orange vs teal in the picture, and the toolbar's "Cube 2 then Cube 1". Subtract → **exactly one body, selected, the toolbar back to disabled** at "1 selected". Result 20 mm wide at 32004.684 mm³ (the 4.7 mm³ over 32000 is my own doing: I typed the second cube's Y from a centre printed to 2 dp, leaving a 0.003 mm sliver — correct geometry for the input). Console clean.

**Re-checked**: 2026-09-24 15:57 UTC — **PASS** (`core-030`), production build, laptop 1440x900 Chromium and WebKit, phone 390x844 WebKit (touch). One selected: Union/Subtract/Intersect disabled with the title `Select 2 or more solids`; Shift-click (laptop) / Objects-list check (phone) of a second cube: `2 selected · first is the base`, all three enabled, orange base and teal second operand visible with `Cube 1 then Cube 2` (screenshot). *Driver note*: two cubes dropped near each other **snap flush**, so their Subtract correctly removes nothing (64000.000 → 64000.000); the Subtract was therefore run on a snap-stacked Cube + Cylinder, selected from the Objects list with the Cube as base: 64000.000 → 14056.878, one body, selected, toolbar disabled again. **New for `core-030`**: Undo brings both operands back with identical ids/volumes/bounds, Redo re-subtracts to the same volume. Console clean.

**Re-checked**: 2026-09-24 17:50 UTC: **PASS** (`core-031`). Production build, **laptop Chromium, laptop WebKit and phone WebKit**, 4/4 checks each, console clean. Two cubes were made to overlap by moving Cube 2 onto Cube 1 with the Inspector's X/Y fields. With one selected (by the Objects list), Union/Subtract/Intersect are disabled, titled `Select 2 or more solids`. With two, the toolbar reads `2 selected` and they enable. Subtract leaves one selected body, `Subtract 1`, at 38997.760 mm³ (phone 39007.291), down from 64000, with the toolbar disabled again.

**Re-checked**: 2026-09-24 19:45 UTC — **PASS, selection steps only** (`ui-045`'s Step 6 re-drive; steps 5-6's boolean commit were not re-driven, this task touched no operation-execution code). Phone WebKit, real touch throughout, dev server launched and driven directly. Two Cubes dropped clear of every overlay band. A trusted tap selected the first alone — `data-selected-count` 1, Union genuinely `disabled` (verified via the real DOM property, not just an attribute). A trusted tap on empty space cleared it, then a real one-finger **marquee drag** (the Select-mode chrome toggle, this app's touch-only route to multi-select) enclosing both Cubes took the count to 2 and enabled Union. **One real driver mistake caught and corrected, not an app defect**: an earlier marquee attempt started its drag on top of the Operations toolbar (a live DOM-target check confirmed the press literally landed on toolbar chrome, not canvas) and silently did nothing — exactly the `TODO/ui-046`-class hazard, tripped organically while driving rather than by a script. Re-driven from a canvas-confirmed start point, clean. Console clean.

### 5. Hidden-part boolean (bolt tap-clearance)

**Amended 2026-09-26** (`ui-047`, following the user's decision recorded in
`TODO/BUDGET.md` 2026-09-26 — "Amend scenario 5", not "whole-body Subtract uses
clearance", "revert `render-004`" or "hold"): `render-004` hid `hardware.bolt`'s `tap`
by default, so a plain whole-bolt Subtract (this scenario's original literal Steps)
now cuts the bolt's **metal** envelope, not its clearance — it no longer demonstrates
this scenario's own claim at all. Rather than relax the Expect to match what
`render-004` made the default do, the Steps below route through `ui-047`'s new
Inspector **Hidden parts** section — the same discoverability mechanism `render-004`'s
own retirement note promised as a follow-up — to explicitly address `tap`. The
**Expect** is unchanged: a clearance-sized hole, not a metal-sized one.

**Steps**:
1. Drag a case-shell solid into the viewport.
2. Drag a "Bolt" into the viewport, positioned so it overlaps the shell (visually, the
   bolt's head/thread mesh will appear to just touch or slightly penetrate the shell
   wall).
3. Select the bolt (click it, or its Objects-list row). Under the Inspector's **Hidden
   parts** section, tap `tap` to drill into the bolt's hidden clearance envelope — the
   breadcrumb reads `Bolt 1 ▸ tap`.
4. Reorder the selection so the shell is the base and the bolt's `tap` piece is the
   second operand: Shift-click (or, from the Objects list, uncheck/recheck) the bolt
   out and back in, with the shell added first, so the toolbar reads "Shell 1 then
   Bolt 1 › tap" (per scenario 4's base-first ordering).
5. Click "Subtract".

**Expect**: A hole appears in the shell sized to match the bolt's hidden tap-clearance
diameter (the fastener's thread-clearance geometry), not the bolt's visible
head/thread mesh diameter — confirming the hidden geometry, not just the rendered
mesh, drives the boolean result. For the `ui-041`/`ui-042` enclosed-bolt fixture (a 40
mm cube minus an m10 hex bolt, length 12, wholly inside it) this is a measured
**61 108.343 mm³** remaining, not the metal-only **61 695.679 mm³** a whole-bolt
Subtract now leaves.

**Last run**: 2026-09-10 17:52 — **NOT DRIVEABLE, and deliberately not claimed**
(`ui-014`). The boolean half this scenario needs now exists and is proven by scenario 4;
what is still missing is everything that would put a bolt and a shell on screen to run it
on. Checked by driving rather than by reading code, so the blockers are stated as
measurements:

- **Step 2 is unreachable**: the Library panel offers exactly **seven rows**, all
  `primitive.*` (Cube, Cylinder, Cone, Hexagon, Triangle, Tube, Sphere), and has no
  sections at all. There is no Bolt row — `src/core/library.js`'s `buildRows` filters to
  `op.startsWith('primitive.')`, so `hardware.bolt` is invisible to the panel however
  complete the recipe is (the already-confirmed note from `core-010`). Step 1's
  "case-shell solid" has no row either; a Cube would stand in, but with no bolt to cut
  with it there is nothing to stand in *for*.
- **Steps 3-4 would work if the operands existed**: the Operations toolbar, the
  multi-select gesture and the shell-selected-first ordering are all exactly scenario 4's,
  which passes.
- **And the `Expect` itself is blocked twice over, at the kernel, not just the UI.** The
  bolt's clearance geometry is addressable as the part `tap`, but a `boolean.subtract`
  naming a sub-part is **deliberately rejected** by `core-013` — re-confirmed by hand
  against the current code: *"boolean.subtract: operand "bolt1" names pieces ("tap"), but
  boolean.subtract consumes whole solids — only group.snap/group.align can address a
  sub-part"*. So there is no route today by which the hidden tap-clearance, rather than
  the visible head/thread, drives a boolean — which is the entire claim this scenario
  makes. Whichever task lands the Hardware Library section needs to answer that too.
- **A second, independent blocker was found while checking this, and filed**: a composite
  appended through the command layer absorbs every earlier named body into its own group
  (a bolt placed after a plate reports `names: ["Shell 1", "head", "thread", "tap"]`), so
  subtracting it removes the whole plate and returns an empty solid. Correct through the
  batch `evaluate()` path, wrong through `document.append`, and **wrong with or without
  `ui-014`'s changes** — pre-existing, currently unreachable because no composite has a
  Library row. Measured reproduction in `TODO/core-020-composite-absorbs-earlier-bodies.md`.
  This must be fixed before this scenario can pass even once a Bolt row exists.

**Re-checked**: 2026-09-10 22:19 — **STILL NOT DRIVEABLE, but one of its three blockers
is now gone** (`core-020`). This is the task filed *from* this scenario's last check, so
the point of this re-drive is to say precisely which blockers remain. Checked by driving
against the real modules in the browser, not by reading code. Laptop 1440×900, Chromium.

- **Blocker 3 of 3 — the composite-absorption bug — is FIXED and confirmed by
  measurement.** The reproduction recorded on 2026-09-10 17:52 no longer reproduces: a
  plate then a bolt through `document.append` now stores the bolt as
  `names: ["head","thread","tap"]` with bounds `-9.25,-8.01,0 .. 9.25,8.01,27`, matching
  the batch `evaluate()` path exactly, where before it read
  `["Shell 1","head","thread","tap"]` spanning the whole plate. **And the consequence is
  gone with it**: `boolean.subtract(shell, bolt1)` through the incremental path now
  returns a real plate-with-a-hole — bounds `-20,-20,0 .. 20,20,6`, volume **8 266.2 mm³**
  against the plate's own 9 600, i.e. a 1 333.8 mm³ hole whose cross-section (222.3 mm²)
  is exactly the hexagonal head's — where before it returned an **empty** solid
  (`0,0,0 .. 0,0,0`) and silently erased the plate.
- **Blocker 1 — no Bolt Library row — REMAINS.** The panel still offers exactly seven
  rows, all `primitive.*`; `src/core/library.js` filters to `op.startsWith('primitive.')`,
  so step 2 ("drag a Bolt in") is still unreachable from the UI. Unchanged by this task,
  which is a kernel fix and deliberately adds no control.
- **Blocker 2 — a boolean cannot address a sub-part — REMAINS**, and re-confirmed verbatim
  against the current code: *"boolean.subtract: operand "bolt1" names pieces ("tap"), but
  boolean.subtract consumes whole solids — only group.snap/group.align can address a
  sub-part"*. So the specific claim in **Expect** — that the hidden `tap` clearance, not
  the visible head/thread, drives the hole — still has no route. The hole measured above
  is the **whole bolt's** silhouette (head-sized), which is why this is reported as
  progress, not as a pass.

So: the scenario's kernel foundation is now sound, and what stands between it and a first
real pass is a UI task (a Hardware Library section) plus a decision on how a boolean names
a sub-part. Both belong to whichever task lands the Hardware section.

**Re-checked**: 2026-09-16 23:23 — **STILL NOT DRIVEABLE, and deliberately not claimed**
(`core-018`). Unchanged by this task and blocked for the same reason as every entry above: there
is no Hardware Library section, so no bolt can be put on screen by hand. Noted here rather than
skipped because this task's `raspberrypi.spacer` emits hidden parts of its own, so the
*mechanism* this scenario tests — hidden geometry participating in a boolean — was exercised
another way: `core-020`'s original reproduction was re-run (below) and a `boolean.subtract` of a
Spacer from a plate returned the correct plate bounds rather than empty geometry.

**Closed-finding re-run, `core-020` (composite absorbs earlier bodies)**: this task adds four
composite registry entries and, in `raspberrypi.spacer`, nests a composite (`kit.boardFrame`)
inside another composite's expansion for the first time — squarely the subsystem that finding was
filed against. Its original repro was re-run verbatim (a plate appended, then a composite
appended, both through `document.append`'s incremental path, compared against a batch
`evaluate()`): `hardware.bolt` still reports `["head","thread","tap"]` with identical bounds both
ways, and all four new ops likewise — `activeCoolingFan` `["board"]`, `hat` `["mb","gpio"]`,
`hatStandoff` `["standoff"]`, `spacer` `["spacer"]`, none absorbing "Shell 1" and every one
matching its batch evaluation exactly. The finding's "severe and silent" consequence was checked
directly too: `subtract(shell, spacer)` through the command layer returns
`-20,-20,0 .. 20,20,6`, the correct plate, not the empty result the bug produced.

**Re-checked**: 2026-09-17 19:20 — **STILL NOT DRIVEABLE, and deliberately not claimed**
(`ui-030`). This is the task that closes this scenario's *first* named blocker, so the
point of this entry is to say precisely what is left. Driven, not read: laptop
1440x900/Chromium against the real dev server, plus kernel-level measurements taken in the
running browser against the real modules.

- **Blocker 1 — no Bolt Library row — is GONE.** The panel now has a **Hardware** section
  with Bolt, Nut, Washer and Bearing, and step 2 ("drag a Bolt in") is a gesture a person
  can perform. Step 1's "case-shell solid" still has no row of its own, but a Cube stands
  in for it exactly as this scenario always intended.
- **Blocker 2 — a boolean cannot address a sub-part — REMAINS**, re-confirmed verbatim
  against the current code, now through a *placed* bolt rather than a hand-built record:
  *"boolean.subtract: operand "bolt-1-drop-2" names pieces ("tap"), but boolean.subtract
  consumes whole solids — only group.snap/group.align can address a sub-part"*. This is
  `TODO/core-024`, which `ui-030` explicitly does not touch.
- **Blocker 3 — NEW, found by this drive, and it is why lifting blocker 2 alone would not
  be enough.** A *placed* composite has **no named sub-parts left to address**. Measured
  in the same session: the bolt **as built** reports `names: ["head","thread","tap"]`,
  identical to the batch `evaluate()` path — but after the trailing `transform.translate`
  that a drag-drop commits to put it where the user dropped it, the same body reports
  `names: undefined`. That is not a defect of this task: `src/core/kernel/index.js`'s
  operand resolution hands every native op a flat `Geom3` on purpose (*"a boolean or a
  transform has no use for a composite's part breakdown and would have to collapse it
  anyway"*), so the gizmo's own translate already flattens any group a user drags. But it
  means the `tap` this scenario's **Expect** turns on does not exist on the body a user
  actually places. Logged against `TODO/core-024` with the measurements, since that task
  has to decide it.
- **A fourth, purely-UI obstacle, also new**: with the bolt standing *inside* a 40 mm
  shell it is completely enclosed and **cannot be picked by clicking at all** — a probe
  grid of clicks across and around its position never selected it, and the toolbar
  therefore never reached "2 selected". Step 3 ("select both the shell and the bolt") has
  no hand-driveable route once the two genuinely overlap, until there is a timeline or
  scene list to select from (`ui-032`).
- **What *does* work now, and is worth recording as progress rather than a pass**:
  subtracting a **whole** placed bolt from a plate, through the real drop records, gives
  the correct plate-with-a-hole — bounds `-20,-20,0 .. 20,20,6`, volume **8 193.14 mm³**
  against the plate's own 9 600, i.e. a **1 406.86 mm³** hole — never the empty solid
  `core-020` once produced. The hole is the **whole bolt's** clearance silhouette, not the
  `tap`-only clearance this scenario asks for, which is exactly why this is reported as
  three-blockers-down-to-two-plus-one-new and not as a pass.

**Closed-finding re-run, `core-020` (a composite absorbs earlier bodies)** — mandatory
here, because `ui-030` is the **first** task to make that pipeline reachable from the real
UI rather than only from tests and MCP. Run in core-020's own shape and also through the
actual drag-drop UI:

- Through the **drop records** (`recordsForDrop`, the path a drag now commits): a `Shell 1`
  40 x 40 x 6 plate appended first, then a Bolt. The bolt's group holds **only its own
  parts** — `["head","thread","tap"]`, no `Shell 1` among them — with bounds
  `-9.5,-8.227,0 .. 9.5,8.227,27.5`, **identical to the batch `evaluate()` path's**, which
  is the comparison that finding turned on. The plate is untouched at `-20,-20,0 ..
  20,20,6`, and after the bolt's trailing translate there are exactly **two** bodies,
  `Shell 1` and `Bolt 1`.
- Through the **real UI**, which is what is new: a Cube dragged in, then a Bolt dragged in
  after it. Two bodies; the cube kept its own id, its own name and a **byte-identical**
  millimetre centre. The finding's severe consequence was re-checked directly as above —
  `subtract(shell, bolt)` returns a real plate, not EMPTY.

**Re-checked**: 2026-09-18 00:41 — **STILL NOT DRIVEABLE end to end, and deliberately not
claimed — but both of its *kernel* blockers are now closed** (`core-024`). This is the
task filed to answer this scenario's kernel question, so the point of this entry is to
say precisely what changed and precisely what is left. Driven, not read: laptop
1440x900/Chromium against the real dev server, with kernel measurements taken in the
running browser against the same modules the app imports.

- **Blocker 1 — no Bolt Library row — GONE** (`ui-030`, unchanged here).
- **Blocker 2 — a boolean cannot address a sub-part — GONE.** `boolean.union`,
  `boolean.subtract` and `boolean.intersect` now accept `{ id, pieces }` and resolve it
  through `combine`, on either side of the op. Measured live, cutting a 40 mm shell with
  a *placed* bolt: whole bolt → 60 352.953 mm³ remaining, `pieces: 'tap'` → **60 352.953,
  identical**, `pieces: 'head,thread'` → 61 071.390, `pieces: 'head'` → 62 632.113. So
  the address genuinely selects geometry rather than being ignored. A bad part name now
  throws naming the op, the operand *and* the part: *"boolean.subtract: operand "drop" —
  combine: no part named "tip" in group "hardware.bolt" (parts: head,thread,tap-head,
  tap-thread,tap-headClearSpace,tap)"*.
- **Blocker 3 — a placed composite has no named sub-parts left to address — GONE.** A
  transform now preserves what it is handed. Measured in the browser: the bolt as built
  reports `names: ["head","thread","tap"]`, and after its drop `transform.translate`
  reports **`["head","thread","tap"]`** where `ui-030`'s drive measured `undefined`;
  after a `transform.rotate`, likewise. Confirmed through the UI too — clicking a
  *placed* bolt a second time now drills in, with the Inspector breadcrumb reading
  **`Bolt 1▸tap`**, where before this task it did nothing at all.
- **Blocker 4 — NEW, and purely UI: there is no route by which the toolbar can send a
  sub-part operand.** `OperationsToolbar.vue`'s `run()` builds operands from
  `document.currentIdOf(id)` alone, and `selection.js`'s `drillInto` is a documented
  no-op unless exactly **one** body is selected — so "shell selected, plus the bolt
  drilled to `tap`" is not an expressible selection state, whatever the kernel now
  accepts. Filed as `TODO/ui-040`, scoped to be done together with `ui-035`, which sits
  on the identical two gaps for Snap/Align.
- **Blocker 5 — still UI, unchanged from `ui-030`'s drive**: a bolt standing inside a
  shell is completely enclosed and cannot be picked by clicking at all, so step 3 has no
  hand-driveable route once the two genuinely overlap, until `ui-032` gives a scene list
  or timeline to select from.

**And a correction to this scenario's own Expect, measured rather than argued.** It asks
for "a hole sized to match the bolt's hidden tap-clearance diameter, not the bolt's
visible head/thread mesh diameter". For `hardware.bolt` **that distinction does not
exist**: `tap` is a *visible* part (the recipe's own module doc says so, following V1,
which added it with `hidden = false`) and it geometrically contains both `head` and
`thread` — so `combine(bolt)` and `combine(bolt, 'tap')` are byte-identical, measured at
**3 647.047 mm³ each**. A whole-bolt subtract has therefore *always* cut the clearance
envelope, and the hole `ui-030` recorded as "the whole bolt's silhouette, not the
`tap`-only clearance" was in fact both at once. The address that changes the result is
`head,thread` — the bolt's metal, 2 928.610 mm³ — which cuts a **smaller** hole, not a
larger one. Whoever drives this scenario next should either rewrite Expect against a
composite where the two genuinely differ (a Pi board's port clearances are the real
case) or state that for a bolt the sub-part address buys explicitness rather than
different geometry. Recorded here so the next drive does not spend its time hunting a
difference this recipe does not have.

**Closed-finding re-run, `TODO/done/core-020-composite-absorbs-earlier-bodies.md`** —
mandatory here, because this task puts new code in the exact fold that finding was filed
against and adds a second way for a composite's parts to reach an op. Run in core-020's
own shape through the real document fold in the browser: a `Cube 1` placed first, then a
Bolt through `recordsForDrop`. The bolt's group holds **only its own parts** —
`["head","thread","tap"]`, with `Cube 1` absent from `Object.keys(parts)` — and
bolt-sized bounds (`-9.5,-8.227,0 .. 9.5,8.227,27.5`), with the cube untouched at
`-140,-20,0 .. -100,20,40`. The finding's severe consequence was re-checked **through a
sub-part operand specifically**, which is the new code: `subtract(shell, { id, pieces:
'tap' })` returns a real plate — bounds `-20,-20,0 .. 20,20,6`, volume **8 193.142 mm³**
— never the EMPTY solid the bug produced. Console clean.

**Re-checked**: 2026-09-20 23:58 — **FULL PASS, for the first time**, with one honest
limit stated rather than papered over (`ui-040`). Hand-driven against the real dev
server at laptop 1440x900/Chromium and phone 390x844/WebKit, with every number measured
off `data-body-volume`/`data-body-bounds` in the running app.

- **Blocker 4 — the toolbar had no route to send a sub-part operand — GONE.** Driven:
  a Cube and a Bolt dragged in, the bolt clicked twice to drill to `tap` (Inspector
  breadcrumb `Bolt 1 ▸ tap`), Shift-clicked out of the selection, the cube Shift-clicked
  in, the bolt Shift-clicked back in so it lands second — the toolbar then read
  **"Cube 1 then Bolt 1 › tap — booleans use that part; Group uses the whole body"** and
  Subtract committed. So the two halves this scenario needed (`core-024`'s kernel, this
  task's UI) now meet.
- **Blocker 4's premise was stale and is recorded as such.** `TODO/ui-040` claimed the
  selection store "cannot even hold" the state. It already could: `ui-035` shipped on
  the same fact, because `toggle` is deliberately the one selection path that does not
  prune a pick depth. No change to `selection.js` was needed or made, so every
  count-gated tool's gate is byte-identical to before.
- **The measured result, with a real hole.** A drag-drop *snaps* a placed body flush
  against its neighbour (`ui-013`), so overlapping the two is itself a hand step: Align
  on Y/Z, then Snap on X `inside+` with a 12 mm offset, which leaves the bolt 7 mm into
  the cube's face and its head still pickable. Cube 1 = 64 000.000 mm³. Subtract with
  **`tap`** → **63 013.621 mm³**. Subtract with the **whole bolt**, same geometry, same
  gesture minus the drill → **63 013.621 mm³, identical**. That is this scenario's own
  correction confirmed from the UI for the first time: for `hardware.bolt` the sub-part
  address buys explicitness, not different geometry.
- **And a case where it genuinely differs, driven end to end**, since a doc that claimed
  a difference nobody can observe would be worse than none: a **Raspberry Pi** in place
  of the bolt, drilled to **`ethernet`**. Same 40 mm cube: `ethernet` → **62 792.257
  mm³** (a **1 207.743 mm³** port opening), the **whole board** → **58 338.683 mm³** (a
  **5 661.317 mm³** hole, the board's whole footprint). A 4.7x difference, visible in
  the scene and in the numbers. The jack's own size reads **21.38 x 16.12 x 13.83 mm**
  off the Inspector while drilled in; `docs/booleans.md`'s worked example is written
  against exactly this and those numbers are the measured ones.
- **Blocker 5 — a fully enclosed body cannot be picked — STILL OPEN, and `ui-032` did
  not close it.** Checked rather than assumed: the History panel's rows are a *row*
  selection, which by `data-002` §13's confirmed rule never triggers a body selection,
  so it is not a route to select an enclosed body. There is no clickable scene list
  either (`data-body-count` is an announcement, not a control). So the scenario's step 3
  is driveable only while both bodies remain pickable — which, as above, a partial
  overlap satisfies and a full envelopment does not. Filed as **`TODO/ui-041`** rather
  than widened into this task.
- **Phone 390x844/WebKit**: the same drill-and-dance reached "2 selected" with the depth
  intact, and all six operation buttons stayed clickable. The operand *line* is
  deliberately hidden at this width — there is no room for it above the navigation
  chrome, measured — and the same text is on every button's long-press instead:
  *"Subtract — Remove every later-selected solid from the first (Cube 1 then Bolt 1 ›
  tap — booleans use that part; Group uses the whole body)"*. Console clean in every
  drive.

**Re-checked**: 2026-09-21 20:36 UTC — **FULL PASS, with a genuinely enclosed operand for the first time** (`ui-041`), and one limit stated rather than papered over. Laptop 1440x900 Chromium, tablet 820x1180 and phone 390x844 WebKit (touch taps at the last two — no Shift key anywhere). Every number is read off `data-body-volume`/`data-body-bounds` in the running app.

- **Blocker 5 — a fully enclosed body cannot be picked — CLOSED, and this is the route that closes it.** Fixture: a 40 mm Cube (bounds `-20,-20,0 .. 20,20,40`, **64 000.000 mm3**) with a `hardware.bolt` (m10 hex, length 12) standing entirely inside it (bounds `-9.50,-8.23,8.00 .. 9.50,8.23,27.50`, **2 891.657 mm3**) — at least 8 mm clear of every face. **Seeded through the document store**, not dragged, because a drag-drop snaps flush against its neighbour (`ui-013`); every action after that is a real tap/click. The **premise was proved, not assumed**: the e2e runs an 11x11 grid of 121 real canvas clicks across and around the cube's silhouette, and it selects the cube and never the bolt.
- **Steps 3-4, from the list alone, without moving, hiding or reloading anything.** Objects → tap `Shell 1` (toolbar `1 selected`, Subtract disabled) → tap the check on `Bolt 1` (`2 selected — first is the base`, checks `1` and `2`, Subtract enabled) → Subtract. Result at **all three sizes: 1 body, 61 108.343 mm3 = 64 000 - 2 891.657 exactly**, bounds unchanged (`-20,-20,0 .. 20,20,40` — a fully enclosed cut leaves the bounding box alone by construction, which is why the volume is the measurement), the bolt's row gone from the list, and a page sentinel set before the drive still present afterwards (nothing reloaded). Undo restored the bolt's row and its 2 891.657 mm3.
- **The trap the task file did not mention, measured and fixed.** Selecting the enclosed bolt from the list changed **0 canvas pixels** (WebGL canvas alone, every overlay hidden): the highlight is a material swap and the shell wins the depth test everywhere. The Inspector, the list row and the gizmo/dimension lines all worked — the last two are SVG overlays above the canvas — but "identical to a clicked body" was not true on the canvas. **A selected body now gets an x-ray twin** (same geometry, depth test inverted, front faces, 50%): **~1 186 changed pixels** in Chromium *and* WebKit at 1440x900, back to <40 after deselecting. Looked at, not only counted: an amber (base) or teal (secondary) silhouette of the bolt through the cube, with the gizmo and dimension lines on it.
- **Gizmo drag on the enclosed body.** The gizmo's hit targets are overlays, so the shell cannot occlude them; the e2e trial-clicks the handle (topmost element is a `gizmo-*` node) and a real mouse drag moves the bolt (`data-body-center` X changes, still one `Bolt 1`). **Not hand-driven** — asserted by the e2e at three viewports only.
- **`ui-040`'s sub-part addressing: the mixed route works, the enclosed one is NOT reachable — and that is the limit.** With a *partly* overlapping bolt (bounds `12.50,-8.23,8.00 .. 31.50,8.23,27.50`, head outside the cube): drill to `tap` with two real viewport clicks, Shift-click it out, add the Cube and then the Bolt **from the list checks** — the operand line read *"Cube 1 then Bolt 1 › tap — booleans use that part; Group uses the whole body"*, so the list route composes with a pick depth (laptop Chromium, tablet WebKit). Subtract with `tap` -> **63 058.148 mm3**, with the whole bolt via a plain row tap + check -> **63 058.148 mm3, identical**, as `ui-040` recorded for `hardware.bolt`. But for a *fully enclosed* body, drilling to a sub-part is still a second viewport click, so **an enclosed body's hidden pieces cannot be addressed by a boolean**; the list selects whole bodies only. Filed as `TODO/ui-042` (expandable part rows). For a bolt this changes no geometry; for an enclosed Raspberry Pi's `ethernet` it would.
- **Phone (390x844, WebKit, touch).** Objects sheet 461..748 with the Inspector tab (748..792) and Library tab (800..844) beneath it and the nav chrome (241..441) above — no two overlap; every row, check, `✕`, the Subtract button, Orbit/Pan and both tabs pass a trial click. Header (Undo, Redo, Objects, History, File, chip) fits with 33px of slack, no horizontal scroll. **Two pre-existing defects found by hand-driving here, one fixed and one filed:** tapping the Library tab with History (or now Objects) open stacked the Library sheet *behind* the panel (fixed, same three lines closes both); and with **one** body selected and the Inspector sheet open, the nav chrome rides 21px up over the Operations toolbar — **identical on the commit before this task** — filed as `TODO/ui-043`.

**Re-checked**: 2026-09-22 13:51 UTC — **FULL PASS, the enclosed sub-part limit named above is now closed** (`ui-042`). Driven with wandering, differently-ordered actions rather than a fixed script, at laptop 1440x900 (Chromium + WebKit), tablet 820x1180 (Chromium) and phone 390x844 (WebKit), against a fixture seeded through the document store (a 100x70x40 case shell wholly enclosing a `raspberrypi.bplus`) — a drag-drop snaps flush, so overlap/envelopment is a seeded fixture, exactly as the `ui-041` re-drive above did.

- **The premise re-proved first, as `ui-041` did**: a 9x9 (81-point) real-canvas-click sweep across the case's silhouette selected the shell every time and the Pi zero times.
- **The operand-order trap this task's own brief flagged was driven both ways, on purpose.** Tapping `ethernet` first and then adding the shell (the task file's own literal suggested flow) makes the **Pi the boolean base** — the operand line reads *"Raspberry Pi B+ › ethernet then Shell 1"*, backwards from what a port-opening cut needs, and it was left to commit: the kernel accepted it (a small solid subtracting a much larger enclosing one leaves nothing — an empty/zero-volume result, not an error and not a crash) rather than silently doing the wrong thing invisibly. The corrected order — tap the **shell's row first** (a plain tap, which replaces the selection and drops any depth), then the **`ethernet` child row's check** — reads *"Shell 1 then Raspberry Pi B+ › ethernet"* and is what the Interaction model example above and `docs/selection-and-inspector.md`'s new worked example both teach.
- **Volume measured against the kernel directly** (not against the app's own prior output): shell alone **280 000.000 mm3**; shell minus the `ethernet` part **275 455.001 mm3** — a **4 545.0 mm3** opening — against shell-minus-whole-board **256 831.788 mm3** (a **23 168.2 mm3** hole), a 5.1x difference. The app's own Subtract, run through the natural order, landed on **275 455.001 mm3** at every viewport driven, matching the kernel to three decimal places.
- **A second viewport click still drills (`ui-016`), and the list agrees with it**: on an un-enclosed Pi (so a real click can reach it), the first click on an unselected Pi selects the whole board, a second click on a member drills into whichever part is under it, the Inspector breadcrumb reads the part, and the Objects list's parent row names that same part (`› <part>`) collapsed, filling the matching child row when expanded — driven at laptop (Chromium + WebKit) and tablet (Chromium); at phone width the `ethernet` jack specifically was too small a target to hit by a raw pointer sweep in this drive (a different part — `mb`, on the same board — was drilled instead and confirmed the same list-follows-viewport behaviour), stated rather than silently substituted.
- **`ui-040`'s viewport-click sub-part dance re-run against a NEW body (a Pi instead of a bolt), through real clicks**: drill to `ethernet` with two viewport clicks, Shift-click it out (depth kept, per `toggle`'s own contract), Shift-click a Cube in as the base, Shift-click the Pi back in at the end — operand line *"Cube 1 then Raspberry Pi B+ › ethernet"* — Subtract measured **62 502.119 mm3**, matching the kernel's `cube(64000) - ethernet` exactly, at laptop (Chromium and WebKit). At tablet, every screen point landing on the jack was covered by the base cube's own gizmo overlay in this particular camera framing, so this specific sub-step of the dance was not driven at that viewport in this run (stated rather than silently skipped); the same dance's list-route equivalent (Objects list checks in the natural order) was driven and passed at every viewport.
- **`ui-041`'s original repro re-run untouched**: the 40 mm-cube-minus-enclosed-bolt case still returns **61 108.343 mm3** at laptop (Chromium + WebKit) and tablet (Chromium), byte-identical to its own recorded number, and the bolt's row still carries a chevron (a bolt is itself a composite) without changing that scenario's result.
- **`core-020`'s original repro re-run against the current code**: a plate appended then a bolt appended through the incremental `document.append` path reports `names: ["head","thread","tap"]` (never absorbing the plate), and `Subtract(shell, bolt)` returns the correct non-empty plate-with-a-hole (`-20,-20,0 .. 20,20,6`), not the empty-solid regression the finding was originally filed against.
- **Scenario 4 (count gate) re-driven and unchanged**: drilling a body to a part never changes `selection.count`, Union/Subtract/Intersect stay disabled at 1 (even 1-drilled), and enable only once a second body is actually added — checked with and without a depth set, same enabled/disabled set both times.
- **Phone-width measurements of the new controls**: the Raspberry Pi (23 parts, 10 hidden, labelled `HIDDEN`) fully expanded in the 390x844 sheet — the row list (`objects-rows`) is 211px tall showing 1 170px of content, i.e. it genuinely scrolls; every measured row, chevron (44x44) and child row was on-screen and the topmost element at its own centre (a trial click), including the last child row after scrolling; no horizontal overflow on the page or the row list; the four layout surfaces (Objects panel, Operations toolbar, nav chrome, Inspector/Library tabs) did not overlap each other, with the pre-existing `ui-043` finding neither newly triggered nor made worse.
- **Sketch mode and the History/Objects mutual-exclusion re-run (`ui-032`'s original concern)**: opening Sketch mode while a Pi's parts were expanded disabled every row and check with the printed reason, left the chevron itself live (reading a part's name is not a selection), and selected nothing when a disabled child row was tapped; opening History while Objects was open closed Objects (and vice versa), with the Pi's own expansion state surviving the round trip.
- **No console or page errors in any of the drives above**, at any viewport or engine.

**Re-checked**: 2026-09-24 02:42 UTC — **PASS** (`core-029`, which moved a composite's volume into the evaluation worker — this scenario's Bolt is exactly such a body). Laptop 1440x900 in **Chromium and WebKit**, real mouse: a Cube (the shell) dropped, a Bolt dropped, the bolt moved over the cube's top by typing its position into the Inspector. The Bolt's `data-body-volume` read **3647.047 mm³** within the drop's 400 ms (worker-measured — the same value this scenario recorded before `core-029`). Shell then Bolt selected in that order (Objects list), Subtract: **61 651.279 mm³**, equal to the kernel's own `subtract(shell, combine(bolt, 'tap'))` computed in the page **to the thousandth**, in both engines. As the correction above already measured, the whole-bolt cut is identical here (`tap` is a visible part), so the two are not distinguished by this setup; the result matches the kernel either way. Console clean.

**Re-checked**: 2026-09-26 12:15 UTC — **PASS, and the correction recorded twice above (2026-09-18/2026-09-24: "for `hardware.bolt` the sub-part address buys explicitness, not different geometry") is now itself corrected back** (`render-004`, user decision 2026-09-26: hide `tap` by default). `tap` is now a hidden part — the same divergence `hardware.washer.js`'s `clearance` already had — so the default whole-bolt address and the explicit `tap` address genuinely differ again, for the first time since `core-026`/`render-003` made this file's own earlier correction true. Driven against the real dev server (a throwaway Playwright driver script, not the checked-in e2e — same "driven, not scripted" discipline as every entry above) at laptop 1440x900 Chromium and phone 390x844 WebKit, seeded through the document store with `ui-041`'s own enclosed fixture (40 mm Cube, an m10 hex bolt length 12 translated to sit entirely inside it):
- **A freshly-dropped Bolt, standing alone, was screenshotted at both engines and looked at.** It now reads as a recognisable bolt — a darker gray hex head atop a lighter cylindrical thread — not the plain red/orange cylinder `render-003`'s drive found. Its own bounds are now `-9.00,-7.79,0.00,9.00,7.79,26.50` and its default combine() volume **2928.61 mm³** (head+thread only), where before this task it was the tap-inclusive envelope.
- **Objects → Shell 1 row tapped, Bolt 1's check ticked (whole-bolt, no piece addressed), Subtract**: shell (64 000.000 mm³) minus the bolt's default combine() left **61 695.679 mm³** — a **2 304.321 mm³** hole, exactly the bolt's own now-metal-only volume (the bolt was fully enclosed, so the hole is exactly its volume). This is now the *undersized* hole, not the correctly-clearanced one.
- **Undo, then Objects → Shell 1 row tapped, Bolt 1's ▸ disclosure opened, its `tap` piece's check ticked, Subtract**: **61 108.343 mm³** — a **2 891.657 mm³** hole, matching `ui-041`/`ui-042`'s own historically-recorded number for this exact fixture's tap-clearance hole. **The two numbers now genuinely differ** (61 695.679 vs 61 108.343), for the first time since the 2026-09-18 correction — addressing `tap` explicitly once again buys a different, larger, correctly-clearanced hole, exactly as this scenario's own **Expect** always asked for.
- Both engines matched to the same three decimal places at both viewports. Inspector's Size fields on the selected Bolt read **18 × 15.59 × 26.5 mm** (metal only), confirming the app's own reported size tracks the new default combine(). Console clean in every drive.
- **Closed-finding re-run, `core-020` (composite absorbs earlier bodies)**: a `Shell 1` cuboid, a `Lug 1` cuboid, then a Bolt appended through the incremental `document.append` path (the finding's own reproduction shape). The bolt reports `names: ["head","thread"]` (not `["Shell 1","Lug 1","head","thread","tap"]`) with `Object.keys(parts)` still including `tap`/`tap-*` and excluding both other bodies, and `document.bodies()` still lists exactly `["Shell 1","Lug 1","Bolt 1"]` — the absorption bug stays fixed. The bolt's own bounds are now `-9.00,-7.79,0.00,9.00,7.79,26.50` (metal only, down from the tap-inclusive `-9.25,-8.01,0,9.25,8.01,27` this repro recorded under `fit: 'close'` before this task) — a deliberate, expected change, not a regression: see `TODO/done/render-004-bolt-tap-clearance-visibility.md`'s retirement note for the full accounting of every hard-coded bolt bound this task updated.

**Re-checked**: 2026-09-26 13:15 UTC — **PASS, driven through the amended Steps for the
first time** (`ui-047`). This is the re-drive the amendment above exists for: the
literal Steps as amended, not the old whole-bolt Subtract. Driven against the real dev
server with a throwaway Playwright driver (seeded through the document store with
`ui-041`'s own enclosed fixture — a drag-drop snaps flush, so the overlap has to be
seeded, exactly as every prior drive of this fixture has done), laptop 1440x900
Chromium:

- Selected **Bolt 1** (Objects list row). The Inspector's **Hidden parts** section
  (`ui-047`) listed `tap`. Tapped it: breadcrumb read `Bolt 1 ▸ tap`.
- Reordered via the additive toggle-out-and-back-in dance (`ui-040`'s own established
  route, the same one `docs/selection-and-inspector.md`'s Ethernet-port example
  teaches): toggled the bolt out, toggled **Shell 1** in first, toggled the bolt back
  in second — depth survived the whole dance. The operand line read **"Shell 1" /
  "Bolt 1 › tap"**.
- Pressed **Subtract**. Result: **1 body, 61 108.343 mm³** — byte-identical to
  `ui-041`/`ui-042`'s own historically recorded number for this exact fixture, and to
  the Expect's stated figure above. **Confirmed this is not what a plain reorder
  without the drill would give**: the whole-bolt route (no `tap` addressed) measures
  **61 695.679 mm³** on the same fixture — the two numbers genuinely differ, exactly
  the distinction this scenario exists to prove, and precisely why the amendment
  routes through the drill rather than accepting the whole-bolt default.
- **A scripting mistake caught and corrected while driving, worth recording**: a first
  attempt reordered the selection with plain (replacing) row clicks rather than the
  checkbox's additive toggle. A plain click on the shell's row silently drops the
  bolt's pick depth (`selection.js`'s `select()` prunes it), so the Subtract landed on
  the whole bolt (61 695.679, not 61 108.343) with no error at all — a real trap a
  human could fall into just as easily, which is exactly why this file's "driven, not
  scripted" discipline exists: a fixed script would have encoded the same mistake and
  called it a pass. Corrected to the additive dance above.
- **Closed-finding re-run, `ui-041` (x-ray twin, selection inside an enclosing shell)**:
  with the same enclosed fixture, a snapshot before selecting the bolt was compared
  against one right after — the canvas visibly changed (the x-ray twin's translucent
  amber silhouette through the shell), exactly as `ui-041` shipped it. Turning on
  **Show hidden parts** on top of that selection changed the canvas *again* (the
  translucent red clearance drawn alongside the twin) — the two features compose
  without either breaking the other, which is exactly what needed checking once a
  second translucent overlay could land on the same enclosed body.
- **Closed-finding re-run, `core-020` (composite absorbs earlier bodies)**: a `Shell 1`
  appended, then a Bolt, through the incremental `document.append` path (the finding's
  own reproduction shape). The bolt's group reports
  `parts: ["head","thread","tap-head","tap-thread","tap-headClearSpace","tap"]` and
  `names: ["head","thread"]`, with `Shell 1` absent from both — `document.bodies()`
  lists exactly `["Shell 1","Bolt 1"]`. The absorption bug stays fixed.
- Console clean throughout.

### 6. Group vs. sub-part selection

**Steps**:
1. Place a Raspberry Pi 5 board, a Camera Module V3 (snapped per scenario 3), and a
   display/screen part in the viewport.
2. Select all three (per scenario 4's multi-select gesture) and click "Combine into
   group" in the Operations toolbar.
3. Click empty viewport space to deselect, then click anywhere on the combined group's
   mesh.
4. Confirm the gizmo and all three dimension lines cover the whole assembly's combined
   bounding box, and the Inspector shows no per-item fields (multi-part group state).
5. With the group still selected, click a second time, now landing specifically on the
   camera module's own mesh within the group.
6. Confirm the gizmo, dimension lines, and Inspector re-target to just the camera
   module's own bounding box and param schema, and the Inspector header shows a
   breadcrumb ("Group ▸ Camera Module").
7. Click the "Group" segment of the breadcrumb.

**Expect**: The first click on an unselected group always selects the whole group
first (step 4), never jumping straight to a sub-part. A second, distinct click on a
member mesh narrows to that sub-part (step 6), with the breadcrumb showing the pick
depth. Clicking the breadcrumb's "Group" segment (step 7) steps back up to whole-group
selection.

**Last run**: 2026-09-06 01:18 — **PARTIAL PASS** (`ui-011`. Only the *single-item
selection contract* this scenario is built on top of is drivable; the group/sub-part
behaviour that the scenario is actually about is not, and is not claimed.

**What was driven, and passed**: the selection-targeting half of steps 3-4 and 6, at
laptop/Chromium, tablet/WebKit and phone/WebKit. Clicking one solid attached the gizmo
and all three dimension lines to **that solid's own bounding box** and populated the
Inspector with its schema; clicking a second, different solid **fully retargeted** all
three — the gizmo moved, the dimension numbers changed from the cube's 40/40/40 to the
cylinder's 40/40/50, and the cube's `Size` row was replaced by the cylinder's
`Diameter`/`Height` rather than lingering. Never two bodies annotated at once. Clicking
empty space cleared the gizmo, the lines and the fields together.

Step 4's *"the Inspector shows no per-item fields (multi-part group state)"* was driven
in the only form that exists yet — **2 individually-selected bodies**, reached by
shift-click, which `ui-011` added as the minimum multi-select needed to exercise the
state (`docs/decisions/interaction-model-qa.md` control 3 Q15). The Inspector showed
`2 selected` and no per-item fields, did not crash, and — the part that matters — did
not keep showing the *first* body's fields. Shift-clicking the second body again
dropped cleanly back to the single-selection contract.

**What is NOT drivable and is therefore NOT claimed**: steps 1-2 (no Raspberry Pi /
camera-module rows — M2; no "Combine into group" — `ui-015`), the whole
group-vs-sub-part pick-depth behaviour of steps 5-7, and the breadcrumb (`ui-016`).
This scenario's **Expect** section is entirely about that behaviour, so none of it is
met yet — `ui-011` only guarantees the single-item contract it will be layered onto.)

**Re-checked**: 2026-09-11 19:45 — **PASS. This scenario's whole Expect section is now
met** (`ui-016`, the task that completes it). Hand-driven end to end at
laptop/Chromium, tablet/WebKit and phone/WebKit — the two engines an iPad and iPhone
actually run — with wandering, jittery drag paths, off-centre clicks, and an orbit
between operations rather than a fixed click sequence.

**Substitution, stated rather than glossed**: steps 1-2 still cannot be performed as
written — there are no Raspberry Pi / camera-module Library rows (M2), so **two Cubes
dropped well apart** stand in for the three named parts, combined with the real
"Combine into group" button (`ui-015`). The pick-depth behaviour under test is
identical; only the parts' identities are substitutes.

**Every clause of Expect, driven and passed**:
- *First click on an unselected group selects the whole group, never a sub-part*
  (step 4): after clearing the selection, one click anywhere on the group selected
  `Group 1` as a whole — gizmo and all three dimension lines spanning the combined box
  (109.54 / 256.92 / 40 mm at laptop), no breadcrumb.
- *A second, distinct click narrows to that sub-part* (step 6): clicking the same cube
  again switched the Inspector to `Cube 1`, the dimension lines shrank from the pair's
  combined span to that one cube's own **40 / 40 / 40 mm**, and the Inspector showed
  the cube's *own* `Size X/Y/Z` params — the original consumed record's schema,
  recovered through `consumes`/`params.names`, not the group's.
- *The breadcrumb shows the pick depth*: the header read **`Group 1 ▸ Cube 1`**, with
  `Group 1` rendered as an underlined link. Read off a screenshot at all three
  viewports, not only from the DOM.
- *Clicking the "Group" segment steps back up* (step 7): the breadcrumb vanished, the
  gizmo reattached, and the dimension lines went back to the combined 109.54 / 256.92 /
  40 mm. Then clicking empty grid cleared everything — gizmo, lines and fields.

**Beyond the scenario's own steps**, because a fixed script would not have caught
these: clicking a **different** member while already drilled into the first re-targeted
straight to it (`Group 1 ▸ Cube 2`) with no step-up — this task's own explicit call on
the one behaviour control 6 left implicit. **Orbiting while drilled in** kept the
dimension lines on the part and the gizmo absent, rather than the overlays snapping
back on the next camera move. The **gizmo is genuinely absent** while drilled in, not
merely inert, and the Inspector's Position/Rotation fields render `readonly` with a
note saying why — the display-only rule this task set itself, confirmed on screen.
Console clean in all three drives.

**One thing worth knowing, not a failure**: while drilled in, *both* cubes stay painted
the selected colour — a group highlights as one object, and the drilled-into part is
identified by the dimension lines, the breadcrumb and the panel rather than by a third
highlight colour. That reads correctly on screen; noting it so the next drive does not
mistake it for a bug.

**Re-checked**: 2026-09-16 23:22 — PASS (`core-018`). Re-driven because this task's new recipes
emit **hidden** named parts (the Hat's four mounting holes, the Spacer's four posts), which is the
sub-part addressing this scenario is about. Driven at laptop/Chromium: a Cube and a Cylinder
placed, both selected, "Group" clicked — one body `group-3` (`group.assemble`) resulted, whose
volume 126428.903 mm³ is exactly the two members' 64000.000 + 62428.903. After clearing the
selection, the **first** click on the group's mesh selected the whole group ("Group 1", no
breadcrumb), and a **second** click at the same point narrowed to the member ("Cylinder 1") with
the breadcrumb reading "Group 1 ▸ Cylinder 1" and the dimension lines shrinking to that member
alone. The Inspector explained the sub-part is shown for measurement only. Console clean.

**Re-checked**: 2026-09-18 00:04 — **PASS, and for the first time with real multi-part
composites** (`ui-031`). Every prior run used a two-Cube stand-in, because steps 1-2 name
a Raspberry Pi 5 board, a Camera Module V3 and a screen part, and none had a Library row.
Laptop 1440x900 in Chromium, against the real dev server.

- **Steps 1-2**: a **Pi 5** and a **Camera Module V3** placed from their own Library rows
  (each picked on its row's Model dropdown first), then both selected — click, then
  Shift-click — and **Combine into group** clicked. One body resulted (`group-5`,
  "Group 1"), and its bounds span **both** parts (`-148.46,-56.48,0 .. -21.74,201.45,19.07`),
  which is the combined box rather than one shrunk or discarded volume.
- **Steps 3-4**: clicking bare grid cleared the selection (count 0); the **first** click
  on the group's mesh selected the **whole group** — `group-5`, count 1, **no breadcrumb**
  — with the three dimension lines reading **126.719 / 257.922 / 19.07 mm**, the whole
  assembly's box. The first click never jumped straight to a sub-part, which is exactly
  what **Expect** asks.
- **Steps 5-6**: a second, distinct click landing on the **camera module's own mesh**
  narrowed to it: the breadcrumb read **"Group 1 ▸ Camera Module 1"**, the Inspector
  header showed `Camera Module 1` / op `Camera Module` with its `model` parameter reading
  `v3`, and the dimension lines shrank to **23.862 / 25 / 12.675 mm** — the Camera v3's
  own real dimensions, not the group's. Screenshotted.
- **Step 7**: clicking the breadcrumb's **Group 1** segment stepped back out — breadcrumb
  gone, selection back to `group-5`, dimension lines back to 126.719 / 257.922 / 19.07.
- **What is still NOT claimed, and why**: `ui-031`'s Testing section suggested drilling
  into the **Pi's own `usbc` sub-part**. That is *not* reachable and is not claimed here.
  A *placed* composite is flattened by its own trailing `transform.translate` — `ui-030`
  measured this and pinned it with a unit test — so a dropped Pi has no addressable
  internal parts, only the whole solid. Confirmed by hand against a genuinely 15-part
  body for the first time: a second click on a lone placed Pi kept `bplus-1` selected with
  no breadcrumb. The pick-depth contract this scenario is about works, one level up, on
  **group members**; reaching a recipe's internal parts is `TODO/core-024`'s decision,
  already filed, and unchanged by this task.
- Console clean.

**Re-checked**: 2026-09-18 00:41 — **PASS, and the entry directly above is now out of
date in the best way** (`core-024`). Driven rather than assumed, because that task
changes what a `transform.*` returns and this scenario's entire subject — pick depth —
depends on a body still being a group.

- **The limitation the `ui-031` entry above records is gone.** A *placed* composite is no
  longer flattened by its own drop translate, and a second click on a lone placed Bolt
  now drills in: the Inspector breadcrumb reads **`Bolt 1▸tap`**, where the drive one
  entry above measured "kept `bplus-1` selected with no breadcrumb". Reaching a recipe's
  internal parts was `core-024`'s decision to make, and it made it: a composite that has
  been moved is still a composite.
- **A latent defect in this scenario's own subject, found by driving and now fixed.**
  Run as an explicit A/B against the same code with the change stashed: group two cubes
  (`group.assemble` → `names: ["Cube 1","Cube 2"]`), then move the group the way the
  gizmo does (a `transform.translate` through `src/core/transform.js`). **Before**, the
  moved group came back `isGroup: false, names: null` — so drilling into a group
  *silently stopped working the moment the user dragged it*, which is steps 5-7 of this
  scenario breaking with no error and no test catching it. **After**, the moved group
  still reports `names: ["Cube 1","Cube 2"]`, and the body count stays 1 either way. This
  was never filed as a finding because nothing had driven step 5 *after* a move; it is
  recorded here so the fix is attributable.
- **No visual regression from per-part meshing, measured rather than eyeballed.** A
  placed composite is now a `Group` body, so `src/render/mesh.js` meshes it part by part
  instead of as one combined solid — the seam/z-fighting tradeoff that module's own doc
  flagged and asked to be looked at "when those rows land". Screenshotted at a hard zoom
  and from the Front view, with the change stashed and unstashed, and diffed pixel by
  pixel: `hardware.bolt` renders **byte-identical** both ways (the A/B toggle itself
  verified live — `names` null before, populated after — so this is a real comparison and
  not a cached module). `kit.anchor`, the harder case because its `hole` shares a
  coplanar face with its `post`, differs by **52 pixels out of 1 296 000** (max channel
  delta 55) in the 3/4 view and **19 pixels** (max delta 9) from the front — present but
  far below anything visible. Logged to `TODO/VERIFY.md` for a look on real hardware,
  where z-precision differs.
- Console clean.

**Re-checked**: 2026-09-18 19:13 — PASS (`ui-036`). Re-run against the *angled*-Bisect-produced group `ui-016`'s own repro names (previously only straight-Bisect groups). Drove a real cylinder (40 mm dia x 50 mm) bisected on Z at Offset 20 mm, Angle 30 degrees, Rotate-axis X, at laptop 1440x900 (Chromium) and phone 390x844 (WebKit). Clicking the group selected the whole thing (gizmo 1, dims 40 x 40 x 50); a second click drilled into a part (breadcrumb `Cylinder 1 > positive`, gizmo detached to 0) with **correct, tilted dimensions: positive 40 x 40 x 41.547 mm, negative 40 x 40 x 31.547 mm** (20 +/- 20*tan(30 deg)=11.547; matches a direct kernel `bisect()` call's bounds exactly), both engines. The `Cylinder 1` breadcrumb segment stepped back out to the whole group: breadcrumb gone, gizmo reattached (1), dims back to 40 x 40 x 50. Clicking bare canvas cleared the selection. Console clean.

**Re-checked**: 2026-09-21 20:36 UTC — PASS (`ui-041`, laptop 1440x900 Chromium and tablet 820x1180 WebKit; **not driven at phone**, see below). Re-run because `ui-016`'s "second click drills into a part" is the meaning a pick-cycling answer would have collided with, and this task chose the list precisely to leave it alone — so it is checked, not assumed. A Bolt dragged into an empty scene and clicked: the **first click selected the whole body** (breadcrumb absent), the **second click drilled** (`Bolt 1 ▸ tap` in the Inspector breadcrumb). With the Objects list open the depth survived (the panel does not touch it), a plain **row tap stepped back up to the whole body** (breadcrumb gone, same body selected — a row names a body), and a viewport click on the already-selected bolt drilled again. At 390x844 the dropped bolt lands beneath the nav chrome and Operations toolbar (a framing quirk of the phone layout, present before this task), so a real click could not reach it and the phone half was **not hand-driven**; `e2e/group-subpart-selection.e2e.js` passes at phone in the full suite. Console clean.

**Re-checked**: 2026-09-22 13:51 UTC — PASS (`ui-042`, laptop 1440x900 Chromium and WebKit, tablet 820x1180 Chromium, phone 390x844 WebKit). Re-run because this task adds a *second* route to the same drilled state (a list tap) and a new one of its own (a list-only depth, `selectPart`) — the two have to agree with the viewport's own drill/re-target/step-up meanings rather than defining a competing set. A Raspberry Pi dragged in and clicked twice from the viewport (whole body, then drilled to a part) showed the **Objects list's parent row naming that same part** (`› <part>`) while collapsed, and expanding it filled **exactly that one** child row — never zero, never more than one. Going the other way, tapping a child row in the list drilled the same way a second viewport click does (re-targeting straight to a sibling with no step-up in between, and a repeat tap on the same part staying drilled rather than toggling back up — both confirmed by tapping twice and by tapping a different part), and the parent row's own plain tap stepped back up to the whole body, mirroring the Inspector breadcrumb's group segment. Driven at every viewport/engine combination; the phone-width limitation `ui-041`'s own re-check recorded (a dropped body landing under the nav chrome) did not apply here because the fixture was seeded, not dragged. Console clean.

### 7. Touch-only viewport navigation

**Steps**:
1. Open the app at the iPad reference viewport (820×1180), using touch input only — no
   keyboard, no mouse.
2. Using the viewport's navigation chrome (not a keyboard shortcut), orbit the camera
   around the scene.
3. Using the same chrome, pan the camera.
4. Using the same chrome, zoom in and out.
5. Tap the orientation gizmo (view cube or axis triad) to snap the camera to a
   standard view (e.g. Top or Front).

**Expect**: Orbit, pan, and zoom are all reachable and functional via on-screen chrome
alone, with no dependency on keyboard or mouse input. Tapping the orientation gizmo
snaps the camera to the corresponding standard view.

**Last run**: 2026-09-05 21:08 — PASS (hand-driven against `render-001`'s viewport at
820×1180 in WebKit — the engine an iPad actually runs — touch input only, in both light
and dark colour schemes. Orbit, pan and zoom were each reached through the on-screen
navigation chrome with no keyboard or mouse; tapping the gizmo's `Z` cap snapped to the
top view and `−Y` to front, both preserving zoom and pan position. Beyond the scenario's
own steps: a one-finger diagonal drag, a vertical-only drag (the gesture the previous
attempt's iPad bug swallowed) in both directions, a two-finger pinch, eight rapid taps
with no settle time, and a drag ending on top of the chrome overlay all behaved; the page
never scrolled or overflowed in either axis and the console stayed clean. **The drive
found one real defect the test suite could not see**: the 3D scene was hardcoded dark
while the DOM chrome followed `prefers-color-scheme`, so in light mode the app rendered
light chrome around a dark canvas. Fixed in this task — the scene palette now follows the
colour scheme, with unit and e2e coverage — and re-driven green in both schemes.)

**Re-checked**: 2026-09-06 18:12 — PASS (`ui-018`). Re-driven in full even though
`ui-018`'s own change is gated on desktop-only signals (Shift key, right mouse button)
a touch device can't produce, because it shares the same `dragMode`/pointer-handling
code path this scenario exercises. Hand-driven at the iPad viewport (820×1180) in
WebKit, touch input only: tapping the chrome's orbit step-left button moved the
azimuth from `-45°` to `-60°`; switching to `Pan` and tapping step-right moved the
target from `0,0,0` to `15.79,9.12,0`; zoom-in reduced distance from `420` to `336`;
tapping the orientation gizmo's `Z` cap snapped elevation to `90°` (top view); a
one-finger touch drag afterward (chrome still in `Pan`) moved the target again, target
never confused with orbit. Console clean throughout. No regression from `ui-018`'s new
desktop overrides — touch has no button/Shift concept, so the new logic's conditions
never trigger on this input path, confirmed by direct observation rather than just
by code inspection.

**Re-checked**: 2026-09-06 16:38 — PASS (`ui-019`). Re-driven at the iPad viewport
(820×1180, WebKit, touch-only) after adding the settings gear icon to `NavigationChrome`
— the concern this re-drive exists to rule out is the new control crowding or covering
the existing orbit/pan/zoom/orientation-gizmo chrome at this exact viewport. Orbit, pan,
zoom via chrome, and the gizmo-tap view snap all still worked; the gear icon and its
preset popover were confirmed (bounding-box checks plus screenshots) not to overlap the
orientation gizmo, the home button, or the scale readout. The preset choice itself is
inert on this input path by design — touch has no Shift key or right mouse button — so
this re-drive is purely a layout/crowding check, not a behavior check.

**Re-checked**: 2026-09-07 18:52 — PASS (`ui-025`). `ui-025`'s own Testing section
judged this scenario "none directly" affected (purely a cap-opacity/spoke-length CSS
change, no trigger-semantics change), but step 5 of this scenario literally taps the
orientation gizmo, so that call was verified by hand rather than taken on faith. Driven
at the iPad viewport (820×1180, WebKit, touch-only) in both dark and light colour
schemes: a real touch `tap()` on the `Z` cap snapped to top (elevation 90°), a tap on
the `−Y`/front cap — one of the now-dashed, more-translucent *negative*-axis caps, the
element whose styling changed the most — snapped to front (azimuth −90°, elevation 0°)
without any loss of hit-testability, and a tap on `X`/right in light theme snapped to
azimuth 0°. All three snaps landed exactly where scenario 1/`ui-011` already established
they should. Beyond the scenario's own steps: screenshotted the gizmo after each tap —
the triad reads clearly through the translucent caps with a visible colour stub past
each button's edge, in both themes, at this exact viewport, which is the legibility
`ui-025` exists to fix. No regression.

**Re-checked**: 2026-09-12 17:31 — PASS (`ui-020`). Re-driven in full because this task
adds a new branch to `Viewport.vue`'s gesture routing (`decideGestureKind` returns
`'sketch'`, `applyDrag` bails while sketching) and changes what the direction pad and
the orientation gizmo do — all on the exact code path this scenario exercises. The
concern being ruled out is that ordinary 3D navigation, *outside* sketch mode, is
completely unaffected by the new branch merely existing. Hand-driven at the iPad
reference (820×1180, WebKit, touch input only) in **both** dark and light colour
schemes: chrome-tap orbit moved azimuth −45°→−60°; switching to Pan and tapping
step-right moved the target 0,0,0→15.79,9.12,0; zoom in/out moved distance
420→336→420; tapping the gizmo's `Z` cap snapped to top (el 90°) and `−Y` to front
(az −90°, el 0°). Every number is identical to the values this scenario's previous
re-drives recorded, so the new branch changed nothing on this path. Beyond the
scenario's own steps: one-finger horizontal, **vertical in both directions** (the
gesture the previous attempt's iPad bug swallowed), and diagonal touch drags all
orbited; a two-finger pinch zoomed 420→129.23; sketch mode stayed off throughout, so
the new `sketchMode` guard never fired on this path — confirmed by direct observation
rather than by code inspection. No horizontal overflow, console clean in both schemes.

**Re-checked**: 2026-09-22 14:33 UTC — PASS (`ui-043`). Re-driven at **phone (390×844)**
rather than the scenario's own iPad reference, since this task's fix touches
`NavigationChrome`'s clearance from the Operations toolbar — a phone-width-specific
concern the iPad viewport never exercises (at ≥641px no sheet ever insets the chrome).
WebKit and Chromium, touch context (`hasTouch: true`), driven through the chrome
buttons directly (Playwright cannot dispatch a real touch drag). Orbit: tapping
`nav-step-right` while in Orbit mode moved azimuth `-45.00°→-30.00°` (elevation
unchanged). Pan: switching to Pan and tapping `nav-step-right` moved the camera target
`0.00,0.00,0.00→18.66,18.66,0.00`. Zoom: `nav-zoom-in` moved distance `420.00→336.00`
— the identical number this scenario's own iPad drives have recorded since 2026-09-06,
confirming the zoom step itself is viewport-independent. Orientation gizmo: tapping
`gizmo-view-top` snapped `elevation 35.26°→90.00°` (and azimuth to `-90.00°`, the
gizmo's own top-view convention). All four chrome buttons plus every Operations
toolbar button passed a trial click at both 1- and 2-selected in the same session
(this scenario's chrome half and scenario 4's toolbar half share one screen at phone
width, so both were driven together rather than as two separate page loads). Console
clean in both engines.

**Re-checked**: 2026-09-24 19:45 UTC — **PASS** (`ui-045`'s Step 6 re-drive, since this
task's change lives in the same pointer-handling code this scenario's gestures go
through). Driven at the **iPad reference viewport (820×1180), WebKit, touch input
only** — the scenario's own steps, not the phone substitution `ui-043`'s re-check
used. Orbit via the chrome's step button moved azimuth `-45.00°→-30.00°`; switching to
Pan and stepping moved the target off `0,0,0`; `nav-zoom-in` reduced distance
`336.00→` (below the pre-zoom figure); tapping the orientation gizmo's top cap snapped
elevation to exactly `90.00°`. **Beyond the scenario's own steps**: a real one-finger
drag directly on the canvas, dragged in the direction that leaves the 90° top-view
clamp rather than pressing further into it, tilted elevation to `30.00°` — confirming
the gizmo-snap and the free-drag path agree on which way is "away from" a pole rather
than only checking that *a* number changed. Screenshots at each step show a normal,
fully-rendered scene. Console clean.

**Re-checked**: 2026-09-24 21:15 UTC — **PASS at tablet and phone, WebKit and Chromium** (`ui-046`, touch taps only). Tablet 820×1180: no **✥** toggle, and orbit, pan, zoom and the `−Y`/`Z` gizmo snaps all worked from the chrome. Phone 390×844 with the Inspector sheet open: the chrome starts folded, one tap on **✥** opens it at `y 207-407` (the Operations toolbar ends at `bottom 201`, so `ui-043`'s 6px gap is intact). Orbit right/up, Pan mode + pan left, zoom in/out, the `Z` gizmo cap and `⌂` all changed the camera readouts as expected, and **✥** stayed open across all of them. Another tap folded it. Clearing the selection dropped the chrome back to the bottom edge in full. Reselecting reopened it folded, not expanded, and the Objects sheet folds it the same way.

### 8. Remote-load safety

**Steps**:
1. Load a project via a `#/gist/<id>`-style NDJSON URL.
2. Confirm the document replays into the expected scene.
3. Load a second NDJSON document containing one deliberately malformed line (a bogus
   `op` value).
4. Confirm the bad record is skipped and reported (e.g. surfaced as a load warning),
   never executed, and that the rest of the document still replays correctly.

**Expect**: A well-formed remote document loads and renders as expected (step 2). A
malformed record in an otherwise-valid document is skipped and reported rather than
executed or halting the whole replay (step 4).

**Last run**: 2026-09-05 — PASS (already covered by an automated test, not yet
hand-driven through the UI: `core-002`'s `src/core/replay.spec.js`, the test named
"remote-load safety (Initial design.md §9 scenario 8): a bogus op never executes, and
the rest of the document still loads" at line 233, passes against the real
`core-001` kernel registry. Per `TODO/ROADMAP.md`'s own instruction, recorded here as
already-passing rather than left blank — the UI-driven walkthrough above still applies
once a loader UI exists to drive it through, at which point this should be re-run
by hand and this line updated.)

**Re-checked**: 2026-09-10 15:40 — PASS (`core-013`), still through the replay engine rather
than a loader UI, for the same reason as above. Re-checked deliberately and not by assumption:
this scenario's whole claim is that a **bad record is skipped and reported, never executed**,
and `core-013` introduces a *new class* of record-level error — a malformed or misplaced
operand reference — that no prior drive of this scenario had ever seen. Driven against the real
`src/core/replay.js`: a four-record document whose 2nd record carries a reference with no id
(`{ pieces: 'head' }`) and whose 3rd names a sub-part on a `boolean.subtract` that cannot use
one. **Both bad records were skipped and surfaced as warnings naming the record id, the op and
the reason**, neither was executed, and the 1st and 4th records still replayed into the scene
(`parts: a, c`). So the new throw paths behave as loadable-document warnings, not as a halt.

### 9. Open sketch mode and draw one entity

Added per `TODO/ROADMAP.md`'s own instruction: not one of `Initial design.md` §9's
original 8 (drawn from `picam-touch`'s toggle matrix, which has no 2D sketching), but
this file's own template header names "drawing one entity" as a cover-at-minimum case.
Written now, alongside `TODO/ui-020-sketch-mode-line-entity.md`'s scoping, from
`docs/decisions/interaction-model-qa.md`'s new section 7 Q&A rather than invented here.

**Steps**:
1. Open the app to an empty scene.
2. Click the **Sketch** toggle in the viewport chrome.
3. Confirm the camera snaps to a straight-on view of the working plane and a Sketch
   toolbar (Line tool, Exit Sketch) appears.
4. Pointer-down at one point on the grid, drag to a second point, release.
5. Click empty space, then click the drawn line.
6. Click **Exit Sketch**.

**Expect**: Sketch mode's own chrome (camera lock, Sketch toolbar) appears on step 2-3,
distinct from ordinary orbit/pan/zoom mode. The drag in step 4 shows a live preview
segment following the pointer and commits one visible line entity on release, rendered
in a style distinct from 3D solid geometry. Step 5's click selects the line and shows
its own fields (start/end/length) in the Inspector, with no 3D transform gizmo attached
(per section 7's Q14). Exiting in step 6 returns free orbit and hides the Sketch
toolbar; the drawn line remains in the scene, not deleted by exiting.

**Last run**: 2026-09-12 17:28 — PASS (`ui-020`, the task that implements this scenario).
Hand-driven against the running app at the laptop reference (1440×900, Chromium) with
real mouse input — deliberately not the synthetic `PointerEvent`s this task's own
`e2e/sketch-line-entity.e2e.js` dispatches at the canvas, since only a real press goes
through the browser's own hit-testing. All six steps behaved: the Sketch toggle snapped
the camera from the isometric home view (az −45°, el 35.26°) to straight down the
working plane (az −90°, el 90°) and mounted the Sketch toolbar with Line already
active; a drag showed a live dashed preview tracking the pointer (206.7 mm mid-drag)
and committed one 206.7 mm line on release, rendered as a thin bright cyan stroke,
visibly unlike a shaded solid; clicking empty space then the line selected it and filled
the Inspector with Start (−84.07, 69.59), End (68.78, −69.59) and Length 206.72, with
two endpoint handles and **no** 3D transform gizmo; Exit Sketch restored free orbit
(a drag on empty canvas moved az −90°→−142°, el 90°→66°) and all three lines stayed in
the scene. Beyond the scenario's own steps: an endpoint-handle drag updated the
Inspector's length live mid-gesture (206.72 → 226.21) and committed one superseding
record rather than a second line; a motionless tap committed nothing; a fast
near-vertical drag, a drag released outside the viewport, zoom and pad-pan while
sketching, dropping a cube alongside the sketch, and re-entering sketch mode with a
body present all behaved; console clean throughout; verified at all three reference
viewports with no horizontal overflow.

**The drive found three real defects the green test suite could not see**, all fixed in
this task and re-driven:

1. *An invisible dead strip across the viewport.* Each stroke carried a transparent
   18px-wide `pointer-events: stroke` hit target above the canvas (copied from
   `Gizmo.vue`'s handles). It swallowed every `pointerdown` landing on a drawn line, so
   a drag started there neither drew nor orbited. Every spec passed throughout, because
   they dispatch events straight at the canvas element and bypass hit-testing. The hit
   targets were dead weight — picking goes through a screen-space distance test — so
   they were removed, and the regression is now covered by a real-mouse spec.
2. *The Sketch toolbar collided with the orientation gizmo at the tablet and phone
   references.* The viewport element is only 390px wide at **both** (persistent side
   columns at 820, full-width at 390), so a top-centred bar ran into the top-right
   gizmo. Moved to the viewport's top-left toolbar slot, which the Operations toolbar
   now yields while sketching — that toolbar acts on selected solids, and sketch mode
   selects only sketch geometry, so it was dead chrome in the one slot needed.
3. *Committing a line hid the line you had just drawn, on a phone.* Auto-selecting the
   new entity auto-opened the Inspector's bottom sheet; measured with a 10×10 hit-test
   grid, reachable canvas fell from 69% to 29% of the view and the fresh line sat
   behind the sheet. A drawn line is no longer auto-selected — drawing several in a row
   is the whole point of sketch mode, the same reasoning `AppView.vue` already applies
   to not closing the Library on every drop, and scenario 9's own step 5 treats
   selecting as a separate deliberate click anyway. Back to 69% after the fix.

**Re-checked**: 2026-09-24 21:15 UTC — **PASS at phone WebKit and phone Chromium** (`ui-046`: the `Sketch` toggle now folds away with the rest of the nav chrome while a sheet is open). With nothing selected, `Sketch` was tapped directly and one line was drawn (`data-sketch-count` 1). With the line selected and the Inspector open, the chrome folded to **✥** and `Exit Sketch` on the Sketch toolbar stayed visible and left sketch mode on one tap.

### 10. Save, reload, and confirm nothing changed

Added 2026-09-17 alongside `TODO/ROADMAP.md`'s M6, per this file's rule that a new
capability class (persistence) earns a new scenario rather than folding into an existing
one. Steps rewritten against `docs/decisions/interaction-model-qa.md` sections 8-11
(`data-002`, confirmed by the user) rather than the provisional wording this scenario was first written with —
the same treatment `ui-001` gave scenarios 1-9. Control names: the header's **File ▾**
menu (`file-menu-button`), its **Save** / **Download copy** / **Open…** items, and the
header's save-status chip (`save-status`). **Label depends on the browser**: desktop
Chromium shows **Save** (and **Save As…**); Firefox, Safari and every phone or tablet
shows **Download copy** instead — drive whichever your browser shows, and say which.

**Steps**:
1. Open the app to an empty scene (a fresh browser profile, or clear site data first).
2. Drag a Cube from the Library's "Primitives" section into the viewport, then drag a
   Cylinder so it **overlaps** the cube. Select both (click one, Shift-click the other;
   on a phone, use the nav chrome's **Select** mode and drag a box round both) and press
   **Union** on the Operations toolbar. One body remains, selected. Note its position in
   the Inspector's Transform fields.
3. Without touching anything, watch the header's save-status chip: it should move from
   `Saving…` to `Saved · <time>` on its own (at phone width the chip is a dot — read its
   full text from the top of the File menu).
4. **Reload the page** with no other action in between (browser reload).
5. The project should already be there. Open **History** in the header and note its rows.
6. *File round-trip.* Open **File ▾** and choose **Save** (desktop Chromium: pick a
   location in the picker) or **Download copy** (everywhere else). Read the chip: it
   should name the file (`Saved to warpcad-project.ndjson` / `Download started:
   warpcad-project-<timestamp>.ndjson`). Then change the scene: drag a Sphere in.
7. **File ▾ → Open…**, confirm **Replace** in the dialog, and choose the file you just
   saved (on a phone, from the browser's file chooser / the Files app).
8. *Hosted half — run only when a scratch GitHub repo and a fine-grained token limited to
   it are available; otherwise report "hosted half not driven".* **File ▾ → Connect
   repository…**, paste the token, enter `owner/repo`, press **Connect**. Then **File ▾
   → Save to owner/repo** and confirm the chip says `Saved to owner/repo` and a commit
   appears on GitHub. Change the file on GitHub directly (a second commit), return to the
   app, drop a Sphere in, and press **Save to owner/repo** again.
9. *Hosted auto-push — same scratch repo.* Resolve step 8's dialog with **Load remote**.
   Then **File ▾ → Auto-push** (it is off by default; turning it on pushes once
   immediately). Drop a Sphere in, then Cylinder, **wait about 40 seconds without
   touching anything**, and watch the File button's dot. Press **Ctrl/Cmd+S**
   (Save / Download copy) and confirm no network push happens.
10. *Auto-push conflict.* With Auto-push still on, make another commit to the file on
    GitHub directly, return to the app, drop one more Cube in, and wait about 40 seconds.
    When the dialog appears press **Cancel**, make one more local edit, and wait again.

**Expect**:
- After step 4 the unioned body reappears **exactly as left** — one body, same position
  (compare with the Inspector), the same rows in History (Cube, Cylinder, Union) — with no
  manual re-import step and no "restore?" prompt; the chip reads `Restored your last
  session`. Nothing reverts to an earlier state and the union is not discarded.
- After step 6 the label matched the browser (**Save** on desktop Chromium, **Download
  copy** elsewhere — never a "Save" that only downloads a copy), and the chip named the
  file. Cancelling the desktop picker shows no error.
- After step 7 the Sphere from step 6 is **gone** and the union-only project is back,
  framed in the viewport, with the chip `Opened <file> · N steps`, N matching the row count seen in step 5. A garbage file (try a
  text file renamed `.ndjson`) is refused by name and leaves the current project untouched.
- After step 8 the second **Save to owner/repo** does **not** overwrite: a dialog says the
  repository copy changed and offers **Overwrite remote / Load remote / Cancel**. Choosing
  **Cancel** leaves the GitHub file as the second commit left it.
- Step 9: Auto-push is **off until switched on**. After the edits the dot goes from the
  hollow **pending** ring to the animated **pushing** ring to solid green **in sync**, the
  chip reads `Pushed · <time>`, and GitHub shows **one** new `WarpCad: auto-push ...`
  commit for the burst (Sphere and Cylinder together, not two). Ctrl/Cmd+S does not
  produce a commit.
- Step 10: the dot turns to the amber `!`, the menu item reads `Auto-push paused —
  repository changed`, and the **Overwrite remote / Load remote / Cancel** dialog appears
  **once** and never over a drag in progress. Nothing on GitHub is overwritten. After
  **Cancel** the second local edit does **not** raise the dialog again and does not push;
  an explicit **Save to owner/repo** raises it again.

**Last run**: 2026-09-19 — **local autosave/reload half PASS; file half and hosted half not
driveable yet** (`io-001`; File ▾ / History / Open… are `ui-033`/`ui-032`, hosted is `io-002`).
Hand-driven with a real mouse and jittery drags at chromium/laptop and webkit/laptop (full
sequence), plus webkit/phone, webkit/tablet, chromium/phone, chromium/tablet (touch
viewports). Steps 1-5 of the scenario: Cube + overlapping Cylinder dropped, both selected,
**Union** pressed → one `boolean.union` body at `-78.51,-23.28,25.00`, volume `126428.903`
mm³ (chromium) / `-79.04,-22.90,25.00` (webkit). The chip went **`Saving…` → `Saved · 08:26`**
on its own. **Reload with nothing else in between**: the union reappeared with identical
id/op/centre/volume, no prompt, chip `Restored your last session` (reverting to `Saved · …`
after ~6 s), undo and redo both disabled, selection empty, and the camera re-framed on the
content (after panning 14 nav steps away, the target went from `-412.12,-110.43,301.69` back
to `-130.20,132.86,25.00` = the bodies' centre; screenshot confirmed both bodies in view at
390px). Odd-moment reloads: ~60 ms after placing a Sphere (before the 500 ms debounce),
mid-placement-drag (ghost visible, `data-placing=true`), and 40 ms after an edit on the
phone viewports — every one kept the last committed state and no ghost body; the first of
these **initially failed in real Chromium** (an IndexedDB write started in `pagehide` is not
committed before the page dies) and is why `src/storage/localMirror.js` exists. Not driven
(no UI yet): steps 5's History rows, 6-7 (File round-trip — the mechanism is covered by
`e2e/local-persistence.e2e.js` against real download/file-chooser events, not by clicking a
File menu), 8-10 (hosted). **Not claimed**: native File System Access Save As on desktop
Chrome — an OS dialog nothing headless can drive (see `TODO/VERIFY.md`).

**Re-checked**: 2026-09-19 14:05 UTC — **local half PASS; hosted half (steps 8-10) NOT
DRIVEABLE and deliberately not claimed** (`io-002`).

*Not driveable, and why*: steps 8-10 need a real scratch GitHub repository and a real
fine-grained token, and this run had neither — nor may it: nothing in this project's
automated loop may hold a real credential or make a real request to a git host. They also
need `ui-033`'s **File ▾ → Connect repository… / Save to / Load from / Auto-push** items,
which do not exist. What *is* claimed below is the same mechanism driven through the store
functions `ui-033` will call, against a **fully intercepted** `api.github.com`. The hosted
half of this scenario stays open for a human with a scratch repo.

*Local half (steps 1-5), re-driven in full* because this task adds a second subscriber to
the mutation path autosave uses. **chromium/laptop 1440×900** and **webkit/phone 390×844**
(touch-only: the nav chrome's **Select** mode and a marquee round both solids, exactly as
the scenario prescribes for a phone; no keyboard at any point). Cube + overlapping Cylinder
→ Union → **one** `boolean.union` body, volume `126428.903` mm³ on both engines (the same
figure `io-001`'s own drive measured — the union is byte-for-byte the same result). The
chip went to **`Saved · 09:03`** on its own. **Reload with nothing else in between**: the
union came back with identical id/op/centre/volume (`-15.35,-27.91,25.00` laptop,
`-70.25,46.28,25.00` phone), chip **`Restored your last session`**, undo *and* redo
disabled, selection empty. Union stayed correctly **disabled at one solid selected** and
enabled at two.

*Hosted mechanism, driven against the mock* (chromium/laptop and webkit/laptop): connect →
`No project file yet — the first Save to owner/repo will create it`, auto-push **off**;
Save → one commit `WarpCad: save` whose bytes are **identical to the local project file**,
project-state line included; a second writer commits; the next Save is **refused** with
*The repository copy changed since you last loaded or saved it* and the repository is
**untouched**; **Cancel** writes nothing and leaves the dot at `!`; **Overwrite remote**
writes the local document; **Load remote** replaces the project and clears undo/redo. The
token never appeared in a request URL, in any page text, or in any console line, and
**Disconnect** deleted the stored credential outright (verified by reading IndexedDB
directly) while leaving the model on screen. **One real defect found by driving and fixed
in this task**: after **Cancel** with auto-push off, the File dot returned to solid "in
sync" although the repository copy was known to have diverged — it now stays `!` and the
chip says `owner/repo changed — Save to or Load from it to resolve`.

**Re-checked**: 2026-09-21 13:39 UTC — **PASS: local half in full (steps 1-7) through the real File ▾ menu;
hosted half (steps 8-10) driven against a `page.route` MOCK of `api.github.com` ONLY — the hosted half
against a REAL scratch repository is NOT DRIVEABLE here and is NOT claimed** (`ui-033`).

**Re-checked**: 2026-09-24 15:57 UTC — **local half PASS (steps 1-7); hosted half not driven** (`core-030`). Production build, fresh context, laptop 1440x900 Chromium and WebKit and phone 390x844 WebKit (touch): Cube + Cylinder overlapping (snap-stacked), both selected from the **Objects list** (a click cannot pick each of a stacked pair), Union → one body; chip `Saved · <time>`; reload restores it byte-identical with 3 History rows and Undo empty. `showSaveFilePicker` was hidden in Chromium so every engine took **Download copy** (a headless run cannot answer the native picker — the native Save path is `ui-033`'s fake-picker spec, not claimed here); the file downloaded, a Sphere was added, **Open… → Replace** loaded the file back: Sphere gone, union byte-identical, Undo empty. **New for `core-030`**: a Sphere dropped then **undone by restore** is what autosave kept — it stays gone after a reload — and after Open a new step's Undo/Redo work. 24/24 checks per config, console clean.

**Re-checked**: 2026-09-24 17:50 UTC: **local half PASS (steps 1-7); hosted half not driven** (no scratch repo or token in this sandbox) (`core-031`, which reuses unchanged builds in every re-fold; Open's `loadEntries` stays a full, synchronous, atomic fold). Production build at **laptop Chromium, laptop WebKit and phone WebKit**, 3/3 checks plus a clean console each. Cube + overlapping Cylinder → Union; the chip went to `Saved · <time>`. After a reload, `Restored your last session` with the union byte-identical in volume and bounds and History `Cube 1 — placed`, `Cylinder 1 — placed`, `Union …`. **Download copy** was the label (the File System Access picker is forced off in these drives, so Chromium takes the fallback, as `e2e/save-load-ui.e2e.js` does). The chip read `Download started: warpcad-project-<ts>.ndjson`, a Sphere was dropped, then **Open… → Replace** brought back the union alone, byte-identical, with `Opened <file> · 3 steps`. A garbage file is refused by name, persistently (`Couldn't open …junk.ndjson: line 1 is not valid JSON — this is not a WarpCad project file`, error tone). A well-formed file whose last record cannot build is refused atomically by name (`Couldn't open …broken.ndjson: Step 4 (Move) needs nowhere`). The project was untouched both times. One note, pre-existing and by design (`io-001`): if the garbage Open follows the previous Open within about a second, that Open's own autosave lands afterwards and clears the error. The drive waits for `Saved` first, as the e2e spec does.

*Not driveable, and why*: steps 8-10 name "a scratch GitHub repo and a fine-grained token limited to it".
This run had neither, and nothing in this project's automated loop may hold a real credential or reach a
real git host, so no token was asked for or invented. What is claimed is the **UI and the mechanism**
under a fully intercepted host (a sentinel token string; every request was checked to have gone to
`api.github.com` only, with the token in the `Authorization` header and never in a URL, the page HTML, or
the console). A human with a scratch repo still owns the real-host half. Also not clicked: the **native**
File System Access picker on desktop Chromium (an OS dialog nothing headless can drive) — chromium/laptop
reported the right labels (**Save** + **Save As…**) and the native path is proven against an injected fake
in `e2e/save-load-ui.e2e.js`; `TODO/VERIFY.md` keeps the by-hand click.

*How it was driven*: a Playwright session against `npm run dev`, not the e2e spec — real `PointerEvent`
drags with jitter, the actions deliberately out of order (peeking at the Connect dialog and Escaping out
before doing anything, opening and abandoning the menu by tapping outside, cancelling the confirm, opening a
file while History was previewing, a drag held across a conflict coming due). **webkit/laptop 1440×900,
webkit/phone 390×844 (touch, `tap()`), chromium/laptop, chromium/phone.** Firefox cannot launch in this
sandbox (`TROUBLESHOOTING.md`); tablet 820×1180 is covered by the e2e layout measurements only, not by hand.

*Local half (steps 1-7), webkit — the fallback path, the real one on every phone*:
- Empty scene; Cube then overlapping Cylinder dropped; both selected (click + Shift-click at laptop,
  **Select-mode marquee at phone**); **Union** → one `boolean.union` body, volume `126428.903` mm³ on both
  sizes (`-67.02,49.51,25.00` laptop, `-56.51,60.02,25.00` phone).
- Chip: **`Saving…` → `Saved · 08:30`** on its own. At phone the menu's first line reads the same text.
- Reload, nothing in between: the union back **byte-identical** (same centre and volume), chip
  `Restored your last session`, undo **and** redo disabled, selection empty. History: 3 rows
  (`Cube 1 — placed`, `Cylinder 1 — placed`, `Union …`).
- File ▾ label: **`Download copy`, no Save As…** (webkit has no File System Access); chromium showed
  **`Save` + `Save As…`**. Download named `warpcad-project-20260921-0830.ndjson`; chip
  `Download started: warpcad-project-20260921-0830.ndjson`. A Sphere then dropped in.
- **Open…**: confirm appears top-anchored (`t=64`, `l=8,r=382` at 390px), Cancel and Escape each lose
  nothing; Replace → file chooser → the Sphere is **gone**, the union back with the identical centre and
  volume, chip **`Opened … · 3 steps`** (3 = the History rows seen earlier), camera **re-framed** (wandered
  to `-255.62,-139.08,25` with 14 pad steps, back to `-56.51,60.02,25` = the body's centre), preview strip
  cleared, undo/redo empty. A text file renamed `notes.txt` is refused **by name** with its line
  (`Couldn't open notes.txt: line 1 is not valid JSON …`), stays on the chip 1.8 s later, leaves the
  project at 1 body; tapping the erroring chip opens the File menu, whose **Dismiss this message** clears it.
- **Layout, measured**: menu rect `l=34,r=354,t=54,b=251` at 390px (fully on screen), and a hit-test at the
  centre of `file-save`, `file-open` and `hosted-connect` returned the item itself with a 44px row — i.e.
  **above** the Inspector and Library sheets. Header at 390px: `File` button `306-354`, chip `360-380`,
  `scrollWidth 390` (no horizontal overflow); the erroring chip grows to a 28×44 target **without moving**
  Undo/Redo/History/File.

*Hosted half, against the mock (all four runs)*: Connect dialog inputs are **16px**, the token field
`type=password`; a wrong repository is refused *before* anything is stored (`Repository not found, or the
token has no access to it`); then `Token saved in this browser`, the token field **gone from the DOM**, dot =
`in-sync`, chip `No project file yet — the first Save to drive-test/scratch will create it`. **Save to** →
exactly one commit `WarpCad: save`, remote bytes **equal** the local project bytes, chip `Saved to
drive-test/scratch · 08:30`. A second writer commits; Save to again → the three-button dialog (`t=64`,
`l=8,r=382`), GitHub **untouched**; **Cancel** → still the second writer's file, dot stays `!` (`paused`),
the dialog does not return by itself; an explicit Save re-raises it; **Load remote** replaces the project
(`bool-3,their-cube`), undo cleared, dot `in-sync`. **Auto-push** off until switched on; on → one immediate
push (`1 → 2` commits); two edits 1.5 s apart, hands off: dot `pending` at 2 s → `in-sync` at **32 s**
(sampled every 250 ms — `pushing` is too brief against a mock to catch, and is shown in a separate
screenshot with a 4 s delayed PUT), **one** `WarpCad: auto-push 2026-09-21T13:31:33.193Z` commit for the
burst. **Ctrl/Cmd+S / Download copy while connected with auto-push on: 0 network requests (10 → 10).**
**A conflict that came due while a drag was HELD** (edit at t=0, drag started at 24 s and held to 40 s):
the dot reached `paused` at 30 s and the dialog did **not** appear for the ~10 s remaining of the drag; it
appeared once, right after the release, and **Load remote** resumed auto-push. Step 10: edit, wait ~40 s →
dot `pending` → `paused` at **30 s**, the dialog **once**, GitHub untouched; after **Cancel** the menu item
reads **`Auto-push paused — repository changed`**, a further local edit and 36 s raised no dialog and made
**0 requests (13 → 13)**. Nothing escaped to any non-mocked origin; the sentinel token never appeared in a
URL, the page HTML, or the console.

*Two real defects found by driving, both fixed in this task* (see `TODO/done/ui-033-*.md`): after **Cancel**
the auto-push item read `Auto-push paused — will retry` (a retry §11 rule 5 says is not coming) — fixed in
`stores/hosted.js`; and a stale `Couldn't open notes.txt` error outranked, and hid, every later hosted
success message — fixed by making errors dismissible and the newer notice win. **Console**: one WebKit/Chromium
`Failed to load resource … 404` per Connect against an empty repository — the mock's honest answer to
"no project file yet" (real GitHub answers the same); no page errors.

*Closed-finding surfaces re-driven* (webkit/laptop, webkit/phone, chromium/laptop, chromium/phone, 20 checks
each, all PASS): **`io-001`** — a solid dropped then reloaded 186-501 ms later survived, undo empty after
restore; **`data-003`/`data-004`** — undo/redo, a suppressed row and a rollback marker (`rollbackAt 2`)
saved as a file (511 bytes, **byte-identical to `serializeProject`**) then re-opened: the re-serialised
project is byte-identical, same bodies, row 2 still suppressed, the rollback strip still shown, undo empty;
**`io-002`** — the first Save into a repository that already held a file raised the conflict dialog with the
line *o/r already has a project file that this session has not loaded* and wrote nothing, Cancel left the dot
at `!`; **`ui-032`** — header cluster order Undo, Redo, History, File, chip preserved; Esc with the File menu
open closes **only** the menu (the preview stays), the next Esc leaves the preview; while previewing, undo/redo
are disabled, Save stays enabled and the menu says Save writes the current project.

### 11. Export a solid and confirm it opens elsewhere

Added 2026-09-17 alongside `TODO/ROADMAP.md`'s M6, same rule as scenario 10. Steps
rewritten against `docs/decisions/interaction-model-qa.md` section 12 (`data-002`).
Control names: header **File ▾ → Export…** (`file-export`), which opens the export popover
(`export-popover`) with a **Scope** choice and a **Format** choice.

**Steps**:
1. Open the app to an empty scene. Open **File ▾** and look at **Export…**, then close the
   menu.
2. Drag a Cube and a Cylinder in so they overlap, select both, press **Union** on the
   Operations toolbar. The union is now the one selected body.
3. **File ▾ → Export…**. Read the popover before touching anything: note which Scope is
   chosen and which Format is chosen.
4. Leave Scope and Format as they are and press **Export**.
5. Find the downloaded file. Open it in something that reads STL — a slicer, a mesh viewer,
   macOS Quick Look, or an online STL viewer — and look at the shape.
6. Back in the app, click empty viewport space to clear the selection, then **File ▾ →
   Export…** again. Read the Scope line, choose **OBJ**, press **Export**, and open that
   file in a mesh viewer.
7. Repeat once more choosing **glTF (.glb)** and open it in any glTF viewer.

**Expect**:
- Step 1: **Export…** is **dimmed**, with `Nothing to export` as its reason, on an empty scene.
- Step 3: Scope reads **Selection — Union 1**, already chosen, because the union was
  selected; Format reads **STL**. The popover never leaves the user guessing what will be
  exported. Pressing **File ▾** did not clear the selection.
- Step 4: a file named `union-1.stl` downloads (browser-dependent folder; on a phone, the
  browser's download sheet), and the chip says `Exported union-1.stl`.
- Step 5: the file opens cleanly outside WarpCad and visibly **matches the shape in the
  viewport** — one merged cube-and-cylinder solid — not an empty mesh, a bounding box, or
  the two pre-union solids overlapping. (Slicers that flag non-manifold meshes should
  raise nothing.)
- Step 6: with nothing selected the Scope defaults to **Whole scene — 1 body**, and the
  file is named after that one body (`union-1.obj`) — `io-003`'s rule is *one body → its name,
  several → `warpcad-scene.<ext>`*, and the popover's summary line states the exact name before you
  press Export. (This scenario originally said `warpcad-scene.obj` here; it only becomes that with
  two or more bodies in the scope — see the 2026-09-21 re-check.)
- Step 7: a single `.glb` file downloads and shows the same shape.

**Last run**: 2026-09-21 19:25 UTC (`perf-001`) — **PASS for steps 1-4, 6 and 7, in all three formats, at laptop 1440x900 Chromium and phone 390x844 WebKit; step 5 (a real slicer / mesh viewer / glTF viewer) still NOT DRIVEN and not claimed; no defect found.** The reason for this re-drive is that `perf-001` moved the whole of export — the `combine()`, the `io-004`/`io-005` repair, and STL/OBJ serialization — **into a Web Worker**, and rewrote the repair's inner machinery. Both are exactly the kind of change that quietly alters bytes, so the bar here was not "a file downloaded" but "the same file downloaded". Driven against `npm run dev` from a **fresh browser context** each time (`page.reload()` would not do: `io-001` restores the last document from IndexedDB, so step 1's empty scene needs a new context), with every downloaded file measured by a parser sharing no code with the serializers.

**The headline: every measured number is byte-for-byte what `io-004` and `io-005` recorded, through the new worker path, identically at both viewports and both engines.**

- **Step 1**: Export… `aria-disabled=true`, reason `Nothing to export` printed under it; pressing it opened **0** popovers.
- **Step 2**: the Ø40 x 50 cylinder and 40 mm cube at centres (-100.89, 66.93, 25) and (-95, 75, 20) unioned into one `Union 1`, kernel volume **88073.939 mm3**, bounds (-120.89, 46.93, 0)...(-75, 95, 50) — the same figures every previous drive recorded.
- **Step 3**: `Selection — Union 1` already checked, Format **STL**, summary `Exports Union 1 as union-1.stl`.
- **Step 4**: `union-1.stl`, **10,384 B -> 206 triangles, 0 of 309 undirected edges open, 0 unmatched, 0 zero-area**, signed volume 88074.534 against the kernel's 88073.939 (**6.75e-6** relative), bbox (-120.890, 46.930, 0.000)...(-75.000, 95.000, 50.000). Chip: `Exported union-1.stl`. **Identical to `io-004`'s and `io-005`'s records, to the byte.** `workerAvailable()` reported **true**, so this is the worker path and not a silent fallback.
- **Step 6**: selection cleared, scope fell back to `Whole scene — 1 body` with the Selection radio disabled; `union-1.obj`, **7,926 B -> 206 triangles, 0 of 309 open** — again identical.
- **Step 7**: `union-1.glb`, **14,268 B -> 184 triangles, 0 of 276 open, 0 zero-area**, volume 88073.942 (3.55e-8 relative), one root node `warpcad-export`, two nodes, one mesh. The root matrix is unchanged (mm->m with +Z->+Y and +Y->-Z; printed here as `0.001,0,0,0, 0,2.22e-19,-0.001,0, 0,0.001,2.22e-19,0, 0,0,0,1` — the 2.22e-19 entries are the same floating-point zeros `io-005` printed rounded, and the file length is identical to the byte, so the matrix cannot have moved).
- **`io-004` / `io-005` regression surface, re-driven through the UI in all three formats**: a placed `hardware.bolt` (m10 hex, 30 long — a **Group** body, so the worker does its `combine()` too) -> STL 11,484 B / 228 tri / **0 of 342**, OBJ 8,848 B / 228 tri / **0 of 342**, GLB 16,320 B / 212 tri / **0 of 318**, volume within 2.9e-6 (STL/OBJ) and 7.3e-8 (GLB) of the kernel's 4591.284. A `raspberrypi.bplus` — `io-005`'s worst case, once 271 of 920 open with 101 zero-area triangles — exported as `.glb`: **682 triangles, 0 of 1023 open, 0 zero-area**. A two-body scene in one file: `warpcad-scene.stl`, 1,030 triangles, **0 of 1545 open**.
- **`ui-034` re-checks, driven**: a refusal appears **by name** (`Cannot export "Ghost": it has no triangles, so the file would be empty`), the popover **stays open**, **no file downloads**, the pending state is cleared, and — the new one — the worker is **still healthy afterwards** rather than being knocked into the fallback by a refusal, a distinction that only exists since this task.
- **The new user-visible state, driven under CPU throttling** (the reason `perf-001` added it): a 24-body scene (12 boards + 12 bolts, 618,084 B, 12,360 triangles, 0 of 18,540 open) at laptop **and** phone viewports. At 4x and 6x CPU throttling the button reads `Exporting...` and the line `Writing warpcad-scene.stl...` appears, at both viewports. At 1x on this laptop the same export finishes right at the 100 ms threshold, so the line is absent or a ~10 ms flash — the borderline any threshold has. The small-export case is clean: a one-body export showed **no** pending state in 5 of 5 runs even at 6x throttling.
- **The freeze itself, measured the same way**: the worst animation-frame gap during that 24-body export went from **224.2 ms to 26.2 ms at 4x CPU, and 341.8 ms to 38.2 ms at 6x**, same scene, same session; the main thread painted 11-12 frames *during* the export instead of stalling through it.
- **Console and page errors: none, in any drive.**
- **Still NOT DRIVEN, and not claimed**: step 5's *"opens cleanly outside WarpCad"*. There is still no slicer, mesh viewer or glTF viewer in this environment, and no real viewer has ever opened a file this app produced. `TODO/VERIFY.md` holds that gap — this task did not narrow it and does not pretend to.

**Re-checked**: 2026-09-21 16:52 UTC (`io-005`) — **PASS for steps 1-4, 6 and 7, in all three formats; step 5 (a real slicer / mesh viewer / glTF viewer) still NOT DRIVEN and not claimed; no defect found.** The reason for this re-drive is step 7: the previous drive found the `.glb`'s mesh open (44 of 262 edges) and filed it; `io-005` closed it, and this is the check that a human pressing the same buttons gets a closed file rather than a green unit test saying so. Driven by hand against `npm run dev` at **laptop 1440x900 Chromium** and **phone 390x844 WebKit**, in a different order again — **glTF exported first, before STL**, the cylinder dragged in before the cube on a wandering, jittery pointer path, both solids' dimensions and positions typed into the Inspector, the dimmed menu item actually pressed, the selection cleared by clicking empty grid between formats. Every downloaded file measured by a parser sharing no code with the serializers. **Identical numbers at both viewports and both engines**, byte-length for byte-length:

- **Step 1**: Export… `aria-disabled=true`, reason `Nothing to export`; pressing it opened **0** popovers.
- **Step 2**: a Ø40 × 50 cylinder and a 40 mm cube typed to centres (-100.89, 66.93, 25) and (-95, 75, 20), unioned into one `Union 1`, kernel volume **88073.939 mm³**, bounds (-120.89, 46.93, 0)…(-75, 95, 50).
- **Step 3**: `Selection — Union 1` already checked, Format **STL**, summary `Exports Union 1 as union-1.stl`.
- **Step 7, the part this drive exists for**: `union-1.glb`, 14,268 B, **184 triangles, 0 of 276 undirected edges open — was 44 of 262 — 0 zero-area triangles**, signed volume 88073.942 against the kernel's 88073.939 (**3.55e-8** relative), winding outward-positive, millimetre bbox (-120.890, 46.930, 0.000)…(-75.000, 95.000, 50.000), **bit-identical to what it was before the repair**. One root node `warpcad-export`, one mesh; the root matrix is unchanged — `0.001,0,0,0, 0,0,-0.001,0, 0,0.001,0,0, 0,0,0,1`, i.e. mm→m with +Z→+Y and +Y→-Z. `Preparing…` still appears on the button for glTF.
- **Step 4**: `union-1.stl`, 10,384 B → 206 triangles, volume 88074.534 (6.75e-6), **0 of 309 open** — the exact numbers `io-004` recorded, so its repair is intact. Chip: `Exported union-1.stl`.
- **Step 6**: selection cleared (`data-selected-count=0`), scope fell back to `Whole scene — 1 body` with the Selection radio disabled; `union-1.obj`, 7,926 B → 206 triangles, volume 88074.541, **0 of 309 open**.
- **Multi-body `.glb`, driven separately**: a Union and a bored plate in one scene → `warpcad-scene.glb`, 35,188 B, summary `Exports 2 bodies together as warpcad-scene.glb`, **one root with two mesh nodes** named `Union 1` and `Subtract 1`, each shell independently closed (0 of 276 and 0 of 426, 0 zero-area).
- **`io-004` regression surface, re-run through the UI**: a placed `hardware.bolt` exported whole in all three formats — STL 228 tri **0 of 342**, OBJ 228 tri **0 of 342**, and now GLB 212 tri **0 of 318** (was 46 of 290), volume 3647.047 against the kernel's 3647.047 (1.58e-8).
- **`ui-034` re-checks, driven**: a refusal appears by name on the glTF format too (`Cannot export "Subtract 1": it has no triangles, so the file would be empty`), the popover **stays open**, and **no file downloads**. Console and page errors: none, in any drive.
- **Still NOT DRIVEN, and not claimed**: step 5's *"opens cleanly outside WarpCad"*. There is still no slicer, mesh viewer or glTF viewer in this environment, and **no real glTF viewer has ever opened a file this app produced, before `io-005` or after**. What can now be said is narrower and precise: all three formats' bytes contain a closed, consistently-wound surface of the kernel's volume. `TODO/VERIFY.md` holds that gap.

**Re-checked**: 2026-09-21 16:05 UTC (`io-004`) — **PASS for steps 1-4, 6 and 7's mechanics, in both STL and OBJ; the defect the previous run found is gone and measured gone; step 5 (a real slicer/mesh viewer) still NOT DRIVEN; one NEW defect found in the `.glb` and filed rather than fixed (`io-005`).** Driven by hand against `npm run dev` at **laptop 1440x900 Chromium** and **phone 390x844 WebKit**, in a different order from both the spec and the previous drive — the cylinder dragged in first, both solids' dimensions and positions **typed into the Inspector** rather than seeded, the dimmed menu item actually pressed, the selection cleared by clicking empty space, formats changed between exports — with every downloaded file measured by a parser sharing no code with the serializers:

- **Step 1**: Export… `aria-disabled=true` with `Nothing to export` printed under it; pressing it opened **0** popovers.
- **Step 2**: a Ø40 × 50 cylinder and a 40 mm cube typed to centres (-100.89, 66.93, 25) and (-95, 75, 20) — the exact placement `io-004` was filed against — selected and unioned into one `Union 1`, kernel volume **88073.939 mm³**.
- **Step 3**: Scope `Selection — Union 1` already checked, `Whole scene — 1 body` beside it, Format **STL**, summary `Exports Union 1 as union-1.stl`.
- **Step 4**: `union-1.stl`, 10,384 B → **206 triangles, signed volume 88074.534 vs the kernel's 88073.939 (6.8e-6 relative), 0 of 309 undirected edges open, 0 zero-area triangles**, bounding box (-120.89, 46.93, 0)…(-75, 95, 50). Chip: `Exported union-1.stl`. **The previous run measured 9 of 300 open on this same shape; the node-level reproduction measured 6 of 303.** Identical bytes at both viewports and both engines.
- **Step 6**: selection cleared (`data-selected-count=0`), Scope fell back to `Whole scene — 1 body` with the Selection radio disabled; `union-1.obj`, 7,926 B → 206 triangles, volume 88074.541 (6.8e-6), **0 of 309 open**. With a second body in the scene: `warpcad-scene.stl`, `Whole scene — 2 bodies, in one file`, 230 triangles, volume 88224.928 against the summed kernel 88224.334, **0 of 345 open**.
- **Step 7**: format remembered as OBJ on reopening; `union-1.glb`, 12,540 B, one mesh, volume 88073.942 (3.6e-8 relative). **Its mesh is NOT closed — 44 of 262 edges open.** glTF is serialized from the render mesh (`src/render/mesh.js`), which `io-004` did not touch and which has no T-junction pass at all; measured at 42-271 open edges on five shapes including the two `io-003` always got right. Filed as **`TODO/io-005`**, with the prior question (does a `.glb` consumer care?) stated rather than assumed.
- **Composite / `core-020` surface**: a placed `hardware.bolt` (m10 hex, 30 long) exported whole from a `Selection — Bolt 1` scope: `bolt-1.stl`, 228 triangles, volume 4591.271 vs the kernel's 4591.284 (2.9e-6), **0 of 342 open — was 40 of 302**.
- **`ui-034` re-checks, driven**: a refusal appears by name (`Cannot export "Ghost": it has no triangles, so the file would be empty`), the popover **stays open**, and **no file downloads**. Console and page errors: none, in any drive.
- **Still NOT DRIVEN, and not claimed**: step 5's *"opens cleanly outside WarpCad … a slicer that flags non-manifold meshes should raise nothing."* There is still no slicer, mesh viewer or glTF viewer in this environment. What `io-004` can now say is narrower and precise: the bytes contain a closed, consistently-wound surface of the kernel's volume. Whether a real slicer agrees is `TODO/VERIFY.md`'s standing row, which nobody has done.

**Re-checked**: 2026-09-21 (`ui-034`) — **PASS for everything `ui-034` owns; one pre-existing defect found in the bytes and NOT fixed there (`io-004`); step 5 (a real slicer/viewer) NOT DRIVEN.** Driven by hand against `npm run dev`, with wandering, differently-ordered actions (cylinder before cube, an Inspector nudge, a Select-mode marquee, Esc and backdrop dismissals, format changes between exports), measuring values and rectangles rather than eyeballing:

- **Laptop 1440x900, Chromium — the scenario as written, overlapping solids.** Step 1: **Export…** dimmed, `aria-disabled=true`, `Nothing to export` printed under it, as its `title`, and as its `aria-describedby` description; pressing it did nothing (menu stayed, no popover). Step 2: a Ø40x50 cylinder and a 40 mm cube, the cube pulled into overlap by typing X/Y into the Inspector, selected by marquee, **Union** pressed (one body, `Union 1`, 88074.793 mm³, selected). Step 3: File ▾ did not clear the selection; popover read `Selection — Union 1` (checked) / `Whole scene — 1 body`, **STL** checked, `Exports Union 1 as union-1.stl`. Step 4: `union-1.stl` downloaded, popover closed, chip `Exported union-1.stl`. **Bytes, read by an independent parser: 197 triangles, signed volume 88074.774 mm³ against the kernel's 88074.793 (2.1e-7 relative), bbox (-120.89, 46.93, 0) to (-75, 95, 50), and 9 of 300 undirected edges unmatched (see the defect below).** Step 6: selection cleared, scope defaulted to `Whole scene` with Selection disabled; OBJ downloaded as `union-1.obj` (197 triangles, volume 88074.785, the same 9 unmatched); with a Sphere added the whole scene downloaded as `warpcad-scene.obj` (1157 triangles, volume 121050.289 against the kernel's 121050.327 summed, one file). Step 7: the format was remembered as OBJ on reopening; **glTF** downloaded as `union-1.glb` (12,540 bytes; magic `glTF`, version 2, header length = file length, one root node `warpcad-export` whose matrix is scale 0.001 with +Z→+Y and +Y→-Z, one mesh, POSITION accessor min z = 0 / max z = 50 in millimetre data) and, with two bodies, `warpcad-scene.glb` with two mesh nodes under the one root.
- **Phone 390x844 WebKit; tablet 820x1180 Chromium and WebKit; phone Chromium; laptop WebKit** — steps 1-7 with a cylinder and a cube dropped on the spec's proven points (a real-mouse drop at 390px snapped the two solids far apart, so these unions are disjoint solids): Export dimmed then live, `Selection — Union 1` default, `union-1.stl` 140 triangles, volume within 2.2e-6 / 1.2e-5 / 8.8e-6 of the kernel's 126428.903, **0 of 210 edges unmatched**, `union-1.obj` the same, `union-1.glb` 10,844 bytes with the same root matrix. On the phone the chip is a dot, and `Exported union-1.stl` is the first line of the File menu, as §8 says. No horizontal overflow at any size (`scrollWidth - innerWidth = 0`); every popover control's trial click landed on itself and every radio/segment/button was 44 px tall (popover 320x273 at 390, x = 34..354). Console clean in every drive.
- **Layout regression check, measured old tree against new at all three viewports (WebKit):** the header cluster's x/width for Undo, Redo, History, File and the chip is **identical**; the File menu's Save/Download and Open… rows are at the same y (91, 135) and 44 px tall; only the Hosted group moved down, by exactly the new Export row (`hosted-connect` y 200 → 245), and the menu grew 197 → 242 px, comfortably inside 844.

**Not driven, and not claimed:** step 5's *"opens cleanly outside WarpCad ... a slicer that flags non-manifold meshes should raise nothing"* — there is no slicer, mesh viewer or glTF viewer in this environment, so no real one has opened any file (`TODO/VERIFY.md`'s io-003 row is extended, not duplicated). What the byte-level check does say is **not** clean: **the STL/OBJ of the hand-built overlapping union has 9 unmatched edges of 300, and a placed bolt 37-40 of ~305** — every one a T-junction (one face's edge split into two on its neighbour), with the *volume* right and nothing missing. `io-003` reported 0 on the two shapes it measured, and that does not hold in general. That is `io-003`'s serializer, unchanged by this task, so it is **not a regression from `ui-034`** — filed as **`TODO/io-004`** (`priority: high`) rather than folded in here; whether any real slicer minds is exactly what step 5 is for and is still unanswered.

**Re-checked**: 2026-09-19 15:20 UTC — **NOT DRIVEABLE, and deliberately not claimed** (`io-003`). This scenario is
driven through **File ▾ → Export…** and its popover, which `ui-034` builds and which does not exist yet; `io-003`
is only the serialization underneath it, so there is no control to press, no download to find, and no popover
to read Scope/Format off. What `io-003` *could* measure, it did, against the same evaluated union this scenario
builds (a 20 mm cube plus a Ø12 × 40 cylinder, centred 10 mm off-axis), on the STL and OBJ bytes only — the
bytes the scenario's step 5 would hand to a slicer: parsed back by two parsers that share no code with the
serializer (a hand-written one in the unit spec, and numpy plus three.js's `STLLoader`/`OBJLoader` out of band),
the STL read 286 triangles, signed volume 11371.311 mm³ against the kernel's 11371.161 (1.3e-5 relative),
bounding box −10…16 × −10…10 × −20…20, and **0 of 429 undirected edges unmatched (closed manifold)**; the OBJ
read 145 shared vertices, 286 faces, the same volume and the same 0 unmatched edges. A cube minus a Ø6 bore
(the shape `persistence-export.md` found three.js's `STLExporter` non-watertight on: 100 of 362 edges) came out
of the kernel path at 292 triangles, 438 edges, **0 unmatched**. The `.glb` was checked by an independent
container parser (header, JSON and BIN chunks, world bounds through the node transform), not opened in an
external glTF viewer. **Still owed when `ui-034` lands:** the whole of Expect — the dimmed empty-scene Export…,
Scope/Format defaults, the `union-1.stl` download and chip, and above all opening the real downloaded files in
a slicer / mesh viewer and comparing them to the viewport, which no byte-level check replaces.

### 12. Edit a step in the middle of the history and confirm it replays

Added 2026-09-17 alongside `TODO/ROADMAP.md`'s M6, per the same new-capability-class
rule — this is the scenario this milestone exists for, modeled directly on the concrete
case that prompted it: chamfer an edge 5mm, place a few more items, then decide the
chamfer should have been 3mm. Steps rewritten against
`docs/decisions/interaction-model-qa.md` sections 13-19 (`data-002`, confirmed by the
user). Control names: the
header's **History** toggle (`timeline-toggle`), the timeline's rows and the selected
row's action bar (**Edit**, **Suppress**, **Move up/down**, **Roll back to here**), the
preview strip and the rollback strip (with **Roll forward**), and the header's **Undo** /
**Redo** buttons. At phone width
(390px) History opens as a bottom sheet and the Inspector will not auto-open while it is up.

**Steps**:
1. Open the app to an empty scene. Drag a Cube in.
2. With the cube the only selected body, press **Chamfer** on the Operations toolbar,
   choose **Top (+Z)**, set Radius to `5`, and press **Chamfer** in the popover. The top rim
   bevels.
3. Drag a Sphere from the Library into an empty part of the viewport. Select it and note
   its position and size in the Inspector.
4. Open **History** in the header. Read the rows.
5. Tap the **Chamfer** row. Look at the viewport and at the strip under the header.
6. In that row's action bar press **Edit**, change Radius from `5` to `3`, press **Apply**.
7. Look at the viewport, the sphere's Inspector values, and the Chamfer row's label.
8. Press **Undo** in the header, look, then press **Redo** (on desktop, try Ctrl/Cmd+Z
   too — but with the cursor in the viewport, not in a numeric field).
9. Tap the Chamfer row and press **Suppress**; look; then press **Unsuppress** in the same
   row.
10. Tap the Chamfer row and press **Roll back to here**; look at the viewport, the
    strip and the list. **With the rollback still active**, drag a Cone in from the
    Library to an empty part of the viewport, well away from the Sphere's spot. Look at
    the viewport, the strip and the list again. Then press **Roll forward** on the strip.
11. Tap the Sphere row and press **Move up**; look; press **Undo**.
12. *Break it on purpose.* Select the cube alone, press **Fillet**, choose **Top (+Z)**,
    radius `4`, commit. Then in History tap the **Chamfer** row, **Edit**, set Radius to
    `18` (the chamfer now eats nearly the whole top face, so the later fillet cannot fit),
    press **Apply**.

**Expect**:
- Step 4: History lists at least, in order, `Cube 1 — placed`, `Chamfer Top (+Z) 5 mm on
  Cube 1`, `Sphere 1 — placed` (drag-move rows may also appear).
- Step 5: the strip reads `Previewing step 2 of 3 — read-only` with a **Back to latest**
  button; the viewport shows the chamfered cube and **no sphere**; the Library, the
  Operations toolbar and the gizmo are disabled; Undo/Redo and **File ▾ → Export…** are
  disabled. Nothing about it looks editable.
- Step 7: the strip is gone. The cube's chamfer is **visibly smaller (3 mm)**. The **sphere
  is untouched** — still present, same position, same size as in step 3. The Chamfer row
  now reads `3 mm`, not `5 mm`. The body count is unchanged.
- Step 8: Undo returns the bevel to **5 mm** and the sphere stays put; Redo returns it to
  3 mm. Neither silently reverts the sphere nor the cube.
- Step 9: Suppress turns the cube back to an **unchamfered cube** with the sphere
  untouched, and the row is greyed and struck through; Unsuppress brings the 3 mm bevel back.
- Step 10, on rolling back: the Sphere **disappears** from the viewport, the Sphere row
  dims and is chipped `inactive` below a drawn marker line, and the strip reads `Rolled
  back to step 2 of 3` with a **Roll forward** button and the line `New steps insert here
  · 1 later step inactive`. Nothing is greyed out: the Library, Operations toolbar and
  gizmo all still work.
- Step 10, after the Cone drop: the Cone **appears and stays**; the Sphere is **still
  hidden**; in the list the Cone row sits **directly under the Chamfer row and above the
  marker line** (row 3), the Sphere row is still `inactive` below it (now row 4), and the
  strip reads `Rolled back to step 3 of 4` (step numbers throughout assume no extra
  drag-move rows; if there are some, read the same ordering off the labels). On **Roll forward** the strip disappears, the
  Sphere **reappears at exactly the position and size it had in step 3**, all three bodies
  (chamfered Cube, Cone, Sphere) are on screen, the row order is Cube, Chamfer, Cone,
  Sphere, and nothing was deleted or reordered along the way.
- Step 11: the rows swap and the viewport looks **identical**; Undo swaps them back.
- Step 12: either the edit applies and the geometry is visibly correct, **or** it is
  refused with a named message (`Step 5 (Fillet Top (+Z) 4 mm on Cube 1) can't be built:
  ...`), the document is unchanged (the chamfer still reads its old value) and the failing
  row is marked `broken` while the message is up. **Not acceptable**: the cube vanishes or
  turns wrong-shaped, the sphere moves or disappears, or nothing at all is said — the exact
  failure class `SECOND-ATTEMPT.md` and this file both exist to catch.

**Last run**: 2026-09-19 03:52 — **PARTIAL PASS: the undo/redo steps only (`data-003`), and the rest deliberately not claimed.** Steps 4-7 and 9-11 need `ui-032`'s History panel and `data-004`'s mid-history edit, neither of which exists yet, so there is no History toggle, no row, no Edit/Suppress/Move/Roll back — those steps were not driveable and are **not** reported as passing. What was driven is step 8's half, "nothing silently reverts", against the mutations that do exist today (laptop 1440x900 Chromium; phone 390x844 WebKit for the touch-only path): after a gizmo move, an Inspector param edit and a Subtract, **Undo returned the document to exactly its prior state and left every unrelated body untouched** — the independently placed Sphere's centre and volume were byte-identical strings before and after each undo and redo, and Redo reapplied each change exactly. Undo/Redo name what they will do (`Undo: Move Cube 1`, `Redo: Edit Cylinder 1`), disable when their stack empties, and restore the selection the undone step started with. On the phone the two 44px buttons were tapped with no keyboard involved at all. Console clean in both drives. The scenario's own rollback/insert/broken-tail steps remain unrun until `data-004` and `ui-032` land.

**Last run**: 2026-09-19 04:54 — **PARTIAL PASS: steps 1-3 and 8 only, and the rest deliberately not claimed** (`data-004`). This task builds the scenario's whole *data layer* — mid-history edit with downstream replay, suppress, reorder, rollback, insert-at-the-marker, the tail shadow check and the broken-step contract — but **not one of its triggers**, which are `ui-032`'s. There is still no History toggle in the header (the only timeline-ish `data-testid` in the running app is `history-controls`, i.e. Undo/Redo), so **steps 4, 5, 6, 7, 9, 10, 11 and 12 were not driveable and are not reported as passing**: no row to tap, no preview strip, no Edit/Suppress/Move up/Roll back action bar, no rollback strip, no `broken` chip. Everything those steps exercise is covered instead by 39 new unit cases in `src/core/timeline.spec.js`, including the scenario's own step-12 shape (shrink a cube under a fillet that no longer fits → atomic rejection naming the failing row), driven against both a fake registry and the real kernel.

What **was** driven, by hand, at laptop 1440x900 (Chromium) and phone 390x844 in **both** Chromium and **WebKit** (the engine an iPhone runs), with the Library sheet closed between actions the way a phone user actually works:

- **Step 1-2 PASS** — a Cube dragged in, selected, then Chamfer → Top (+Z) → Radius `5` → commit. Material really came off: volume `64000.000 → 62166.670` mm³, identical to the last digit on all three configurations.
- **Step 3 PASS** — a Sphere dragged in afterwards, independently. The chamfered Cube's centre **and** volume were byte-identical before and after that drop, i.e. the later placement did not disturb the earlier chamfer.
- **Step 8 PASS, in full, including its "nothing silently reverts" half** — Undo removed the Sphere placement and left the chamfered Cube byte-identical; a second Undo took the chamfer itself back off, returning the Cube to exactly its unchamfered `64000.000` mm³; two Redos restored **both**, with the Sphere's centre and volume and the Cube's chamfered volume all byte-identical to the strings recorded before. On the phone this was done with the two 44px header buttons and no keyboard at all.
- Console clean in all three drives; a screenshot confirms the phone layout (3D view above, Inspector sheet below, Undo/Redo in the header, ops toolbar overlaying the viewport) is legible and operable at 390px.

The honest summary: after `data-004` this scenario's *mechanism* is built and unit-proven, and its *reachability* is unchanged. It cannot be driven in full until `ui-032`.

**Last run**: 2026-09-20 22:00 — **PASS, driven in full for the first time** (`ui-032`). Every step
1-12 was driven by hand at **laptop 1440×900 in Chromium** and **phone 390×844 in WebKit** (the engine an
iPhone actually runs) — 51 checks per drive, console clean in both. Not the e2e spec re-run: wandering,
overshooting drag paths, a different action order, and readings taken off what the app actually announces.
Two steps carry an honest caveat, stated below rather than papered over.

- **Steps 1-3 PASS** — Cube in, Chamfer → Top (+Z) → `5` committed (volume `64000.000 → 62166.718` laptop,
  `→ 62166.670` phone: material really came off), then a Sphere dropped elsewhere. The chamfered cube's
  volume was byte-identical before and after that drop.
- **Step 4 PASS** — History opens from the header and lists exactly `Cube 1 — placed`,
  `Chamfer Top (+Z) 5 mm on Cube 1`, `Sphere 1 — placed`.
- **Step 5 PASS, all of it** — the strip reads **`Previewing step 2 of 3 — read-only`** with **Back to
  latest**; the viewport carries the amber outline (`data-previewing="true"`) and shows **the chamfered cube
  and no sphere** (body count `1`, scene list `["Cube 1"]`); Undo, Redo, the Operations toolbar and the
  Library rows are all disabled; nothing is selected, so no gizmo. *Caveat, by design*: at phone width the
  Library-rows check is unreachable — §13 gives History and the Library one shared sheet slot, so reaching
  the Library means closing History, which ends the preview. The disabled state is proved at tablet and
  laptop, where both are persistent columns.
- **Steps 6-7 PASS** — Edit opened the step's own fields inline, with the **Face menu still reading
  `Top (+Z)`**; Radius `5 → 3`, Apply. The strip cleared, the **cube's bevel shrank**
  (`62166.718 → 63316.033`, i.e. back toward but not to the unchamfered `64000`), the **Sphere was
  byte-identical in both centre and volume** (`-69.47,324.78,20.00 / 32975.534` before and after), the body
  count was unchanged, and the row relabelled itself to `Chamfer Top (+Z) 3 mm on Cube 1`.
- **Step 8 PASS** — Undo returned the bevel to exactly `62166.718` with the sphere unmoved; Redo returned it
  to exactly `63316.033`. At laptop, **Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z from the viewport did the same**; on
  the phone the two 44px header buttons were the only path used, no keyboard at all.
- **Step 9 PASS** — Suppress returned the cube to exactly `64000.000` (a plain 40 mm cube) with the sphere
  untouched, greyed and struck the row through and chipped it `suppressed`, and **deleted nothing** (still
  three rows). Unsuppress restored exactly `63316.033`.
- **Step 10 PASS, including the insert** — rolling back to step 2 hid the Sphere (count `1`), dimmed and
  chipped its row `inactive` below a drawn marker line, and put up **`Rolled back to step 2 of 3`** /
  **`New steps insert here · 1 later step inactive`**. Nothing was greyed out and Undo still worked. A Cone
  dragged in **with the rollback still active** landed as **row 3, above the marker**, the Sphere stayed
  hidden at row 4 `inactive`, and the strip updated to **`Rolled back to step 3 of 4`**. On **Roll forward**
  the strip vanished, **the Sphere reappeared byte-identical to step 3** (`-69.47,324.78,20.00 / 32975.534`),
  all three bodies were on screen, and the order was Cube, Chamfer, Cone, Sphere — nothing deleted, nothing
  reordered. At phone width this was driven the way §18 says a phone user would: History closed for the drag
  (the strip **outlived the panel**, confirmed), then reopened.
- **Step 11 PASS** — Move up swapped the rows and **every solid stayed in exactly the same place at the same
  size**; Undo swapped them back. *Worth recording*: the DOM scene *list* order does change, because
  `document.bodies()` walks creation order and a reorder genuinely changes that. The rendered picture is
  identical; only the list sequence differs. Checked order-insensitively for that reason.
- **Step 12 — the caveat that matters.** The scenario's **literal** setup cannot arm: after a 5 mm top
  chamfer, `modify.filletRim` **refuses** a 4 mm fillet on the same face with *"the solid is not prismatic
  over the rim band — cross-section area changes from 1600.012mm² at the cut plane to 1156.145mm² at the
  face"*. That is `core-003`'s deliberate guard, pre-existing and correct, not a `ui-032` defect — but it
  means the scenario's own words describe a setup the app will not build. **The break path was therefore
  driven in its equivalent shape** and passed in full: a 4 mm top fillet on a *plain* cube, then the cube's
  own row edited to shrink it to 2 × 2 mm so the fillet above can no longer fit. The result is exactly §15's
  contract — **`Step 4 (Fillet Top (+Z) 4 mm on Cube 1) can't be built: modify.filletRim: radius 4mm is
  wider than the cross-section can absorb …`**, the document **completely unchanged** (rows byte-identical,
  no body vanished or turned wrong-shaped, checked back at the latest state), the failing row chipped
  `broken`, and the form still open with the typed value. Driving the scenario's literal text instead, the
  edit simply applied and the scene stayed coherent — the other branch of its own **Expect**.

**Two real defects this drive found that no passing spec could see, both fixed in `ui-032`:** at phone width
the Inspector's collapsed tab sat **on top of the History sheet's last rows** and silently swallowed taps on
them; and the sheet at its first-drafted 46vh pushed the nav chrome **44px into the Operations toolbar**
(measured: chrome top 184 vs toolbar bottom 228). The sheet now insets above both tabs and is sized from that
arithmetic (34vh), re-measured at 57px clearance. Same class as the defect `ui-010`'s own drive found with
the Library tab over the nav chrome.

**Re-checked**: 2026-09-24 02:42 UTC — **PASS, all twelve steps** (`core-029`), laptop 1440x900 **Chromium and WebKit**, real mouse. Every step's Expect held as written: History rows in order (step 4); "Previewing step 2 of 3 — read-only" with one body, Undo and Fillet disabled (5); the edit to 3 mm drops the strip, relabels the row, raises the cube's volume 62166.6 → 63316.0 and leaves the Sphere's centre/bounds/volume byte-identical (7); Undo/Redo 5↔3 mm with the sphere untouched (8); Suppress → 64000.000 with the chip, Unsuppress back (9); roll back → sphere gone, "Rolled back to step 2 of 3 / New steps insert here · 1 later step inactive"; Cone dropped → row 3 above the marker, "step 3 of 4"; Roll forward → Sphere back exactly (10); Move up changes the list, not the picture (checked order-insensitively), Undo restores (11). **Step 12**, driven both ways as the previous pass recorded: the literal chamfer→18 mm edit applies coherently, and the literal *fillet-after-chamfer* setup is refused by `core-003`'s prismatic guard, named in the popover. The equivalent break (4 mm fillet on a plain Cube 2, then its placed row shrunk to 2×2) is refused with **"Step 6 (Fillet Top (+Z) 4 mm on Cube 2) can't be built: … radius 4mm is wider than the cross-section can absorb …"**, one `broken` chip, rows unchanged, and — checked **back at the latest state** after leaving the preview the row tap opens — every body byte-identical, Cube 2 still filleted at 63 474.367. **New for `core-029`**: previewing a past step that contains a Bolt (a fresh fold, so fresh geometry) lands the Bolt's volume on the preview's own worker channel — 3647.047, equal to the live body's — while "Previewing step 7 of 9" is up. One frame captured mid-resize, as the rollback strip pushed the layout down, showed no grid; re-captured after a settle it was normal — a capture-timing artefact, not a render defect. Console clean.

**Re-checked**: 2026-09-24 15:57 UTC — **PASS, all twelve steps** (`core-030`: Undo/Redo now *restore* the state captured with the step instead of re-folding the log, whenever nothing has been written since). Production build, fresh context each, at **laptop 1440x900 Chromium (26/26 checks), laptop 1440x900 WebKit (26/26) and phone 390x844 WebKit with touch taps (25/25)**, console clean in all three. Every step's Expect held: rows in order (4); `Previewing step 2 of 3 — read-only` with one body and Undo/Redo disabled (5); edit to 3 mm raises the cube 62166.718 → 63316.033 with the Sphere's name/volume/bounds byte-identical (7); Undo → 5 mm, Redo → 3 mm, and Ctrl/Cmd+Z / Shift+Z with the cursor in the viewport (8); Suppress → 64000.000 and back (9); roll back → `Rolled back to step 2 of 3` / `New steps insert here · 1 later step inactive`, Cone dropped while rolled back stays, Roll forward returns the Sphere exactly (10); Move up changes the list not the picture, Undo restores the order (11); the equivalent break (4 mm fillet on Cube 2, its placed row shrunk to 2x2) refused with `Step 6 (Fillet Top (+Z) 4 mm on Cube 2) can't be built: …`, every body and row unchanged (12). **New for `core-030`**, each checked in all three configs: Undo *and* Redo of Suppress, of the insert-at-the-marker, of the Move-up and of the fillet after a refused edit all land exactly; **two Undo clicks fired back to back with no wait** land two steps back (the Sphere placement and the edit) and two Redo clicks return byte-identical; no main-thread long task (>50 ms, Chromium's PerformanceObserver) around any Undo/Redo press. The 24-body/200-record cost is in `bench/results/2026-09-24-core-030.md`, not claimed from this small scene.

**Re-checked**: 2026-09-24 17:50 UTC: **PASS, all twelve steps** (`core-031`: every History row action, the Undo fallback and the row-click preview now reuse each unchanged record's build from a per-document fold cache instead of rebuilding the whole log). Production build, a fresh context each, wandering and overshooting drag paths. **Laptop 1440x900 Chromium (18/18 checks), laptop WebKit (18/18) and phone 390x844 WebKit with touch taps (18/18)**, console clean in all three. Rows in order (4). `Previewing step 2 of 3 — read-only` with the chamfered cube alone at exactly its live volume and Undo disabled (5). The edit to 3 mm raises the cube 62166.624 → 63315.973 (phone 62166.667 → 63315.999) with the Sphere's volume and bounds byte-identical (7). Undo/Redo and Cmd+Z 5↔3 mm (8). Suppress → 64000.000 with the chip, Unsuppress back to the 3 mm volume exactly (9). Roll back → 1 body, `Rolled back to step 2 of 3`; a Cone inserted at the marker (`step 3 of 4`); roll forward → all three, the Sphere untouched (10). Move up, then Undo restores the order (11). **Step 12** in its documented equivalent shape (the literal setup cannot arm; see the `ui-032` run above): Cube 2, a 4 mm top fillet, then Cube 2's row shrunk to 2×2 → `Step 6 (Fillet Top (+Z) 4 mm on Cube 2) can't be built: … radius 4mm is wider than the cross-section can absorb`, with the `broken` chip. It was refused **twice, identically** (a failure is never cached), and the live document was unchanged both times. (While the refused edit is open the viewport shows the read-only preview of step 5. That is by design, and it is why the check reads the document after **Back to latest**.) Then a valid edit (30×30) rebuilt the fillet. **Added for this task:** the warm-cache document was compared against a reload, which is a cold autosave-restore fold with an empty cache. Every body's volume and bounds were byte-identical in all three drives. Observed and not caused by this task: in headless Chromium the canvas is blank for the frame right after the preview or rollback strip is dismissed, because the viewport resize clears it. It renders by 500 ms, and pressing Back to latest alone, with no fold, does the same. This is logged in `TODO/VERIFY.md` for real hardware.

**Re-checked**: 2026-09-25 13:56 UTC — **PASS, targeted (not a fresh 12-step drive)** (`data-005`: `paramEdit.js`'s `paramEditability` guard — the one this scenario's step 6/12 Edit action depends on — was extended to tolerate the new `style.recolor` record kind, since a colour override, unlike a fillet, never touches geometry and so cannot be lost by a rebuild). Re-run because that guard is exactly the mechanism steps 6 and 12 exercise, and this task changed its logic, not just added an unreachable record kind beside it. Hand-driven at laptop 1440x900 Chromium: a Cube and a Cylinder dropped (both visible, `data-body-count` 2), Cylinder selected, its Diameter edited `40 → 20` via the Inspector's Parameters field — the mesh visibly narrowed, the Transform section's Size field read back `20`, the gizmo and dimension lines resized to match, console clean (screenshot on file). This is the ordinary case, with no colour override present, confirming the guard's existing behaviour for every body that has never had one is unchanged. The full non-Firefox Playwright matrix (`guards` + `chromium`/`webkit` × laptop/tablet/phone) was re-run in full — **1245 passed, 202 skipped, 0 failed**, including `timeline-panel.e2e.js`, `undo-redo.e2e.js` and `inspector-param-edit.e2e.js`, which between them exercise this scenario's steps 4-12 as scripted specs. A fresh, full manual 12-step hand-drive was **not** repeated here — this task adds no reachable control and the guard's own new-versus-old behaviour is what a document-level unit test (`document.spec.js`, `paramEdit.spec.js`) proves directly, with a hand-built lineage carrying the new record kind through `modify.filletRim`'s exact freeze case this guard exists for.

### 13. Recolor a placed body

Added 2026-09-17 alongside `TODO/ROADMAP.md`'s new M7, scoped from a real-usage survey
of `~/src/jscad/` that found `.color(...)` used in ~65 of ~80 surveyed real projects —
more consistently than fillet/chamfer or snap/align, both already core scenarios here.
Per this file's own new-capability-class rule: color is a new user-visible capability,
not a variant of an existing one, so it earns its own scenario rather than folding into
scenario 1 or 2.

**Steps**:
1. Place a cube and a cylinder, apart from each other.
2. Select the cube. Open its color control (whatever the confirmed trigger turns out to
   be — see `ui-037`) and pick a visibly different color (e.g. red).
3. Click empty viewport space to deselect, then select the cylinder and confirm its
   color is unchanged.
4. Re-select the cube and confirm its new color persisted (not reset by the
   deselect/reselect round-trip).

**Expect**: Only the cube's mesh visibly changes color; the cylinder stays whatever
color it started as — a color edit on one body must not leak onto another, the same
"no cross-talk" property every other scenario in this file checks for its own
mutation. The cube's new color survives a deselect/reselect cycle and an unrelated
third body being placed afterward, without a page reload.

**Last run**: 2026-09-25 21:15 UTC — PASS (`ui-037`, **first drive**). Driven at laptop 1440x900 Chromium (real mouse) and phone 390x844 WebKit (real `touchscreen.tap` for every selection, the swatch, Reset and Undo; wandering, jittery pointer paths for the two drops). The native OS colour dialog itself cannot be opened headless, so the picker's own event stream was emulated on the real `<input type=color>`: several `input` events wandering through colours, then one `change`, which is what a browser sends while a person drags round the picker and then settles. **Steps 1-4 as written:** Cube and Cylinder dropped apart. The cube was selected by tapping it, and the Inspector's new **Color** row (the first section, visible without scrolling in the phone sheet) read `Default`, with Reset disabled and a 44x44 swatch. Picking red turned the cube red **while still selected**: 203/59/17 sampled off the canvas, its own red with a light warm selection tint, not the amber a plain selected body wears. The readout said `#ff0000`, and Undo said `Undo: Recolor Cube 1`. After deselecting, the cube sampled **182/4/4** and the cylinder **79/104/135**, byte-for-byte the same as before the pick. Selecting the cylinder showed `Default`. Reselecting the cube showed `#ff0000` in both the readout and the swatch. A Sphere placed afterwards changed nothing (`Cube 1=#ff0000 Cylinder 1=default Sphere 1=default`, and the same pixels). Screenshots were inspected by eye at both form factors. **Beyond the steps, human mistakes on purpose:** (a) moved the picker through three colours and then, without settling, tapped the cylinder instead. The cube's live preview (184/64/76) was dropped and it went straight back to its committed default (77/104/142), with no record written. (b) Re-picked the colour already in force: no new Undo step. (c) Pressed Reset, then again on the now-disabled button: one `Undo: Reset color of Cube 1` step, and one Undo brought the red back. **Found and fixed during the drive:** at the first-cut selection tint (0.35) a picked pure red read visibly orange while selected (217/78/24). A user who had just chosen red could fairly call that the wrong colour, so the tint was lowered to 0.2 and everything above was re-driven at 0.2. Console clean in every drive. **Per-part (data-005's two open VERIFY rows)**, driven on a Group of two cubes at both form factors (Shift-click at laptop, Objects-list checkboxes by touch at phone): drilled into Cube 2 and set it blue, stepped up and set the whole group red. Cube 1 rendered **182/4/4**, and Cube 2 kept its own **5/5/171** ("that one part is different"). Resetting Cube 2 alone made it **169/5/5**: the whole-body colour takes over again, the readout says `#ff0000 (whole body)` and Reset disables. Undo brought the blue back.)

**Re-checked**: 2026-09-26 11:50 UTC — **PASS, and the recipe tier this scenario's own name half-implies is real for the first time** (`render-003`). Every prior drive above recoloured plain primitives with no built-in colour of their own; this task made a ready-made part's *own* baked-in colour actually render, which changes what "Default" means for one. Driven at laptop 1440x900 Chromium and phone 390x844 WebKit (real `.tap()` for the Library tab and Reset). A **Washer** was dropped: the Inspector's Color row read `#808080` (not the literal word `Default`) with **Reset already disabled** — there is nothing of the user's to reset yet, even though a colour is showing. Picking a colour (red at laptop, green at phone) changed the readout and the swatch to that pick, and pressing **Reset** returned the readout to `#808080` and disabled Reset again — the washer's own recipe colour, not the app's theme blue, exactly per this file's own worked-example wording ("it goes back to gray, not to the app's blue"). Screenshots inspected by eye at both form factors. **Also re-driven**: a **Bolt**, whose `head`/`thread`/`tap` are three different recipe colours — undrilled, the Inspector correctly falls back to the theme's `Default` swatch (there is no single "whole body" colour to show), while the rendered mesh itself shows its real per-part colours. **A real, unscoped finding surfaced by this drive**, not a regression in this scenario: the Bolt's `tap` part is opaque red and fully encloses `head`/`thread` (V1's own design, confirmed), so a freshly-dropped Bolt visibly renders as a plain red/orange cylinder rather than a recognisable bolt — filed as `TODO/render-004-bolt-tap-clearance-visibility.md` rather than fixed here, since diverging from V1 is a real product decision outside this task's scope. Console clean in both drives.

**Re-checked**: 2026-09-26 12:15 UTC — **PASS, the unscoped finding above is now closed** (`render-004`, user decision 2026-09-26: hide `tap` by default). Driven at laptop 1440x900 Chromium and phone 390x844 WebKit against the real dev server (a throwaway Playwright driver, same "driven, not scripted" discipline as every entry above). A fresh **Bolt** was dropped alone and selected: the Inspector's Color row still reads the theme's `Default` swatch, unchanged from `render-003`'s drive — `tap` being hidden now doesn't remove it from `Group.colors` (that map is keyed by name regardless of visibility), so the undrilled multi-colour fallback logic this scenario's own name half-implies is exercised exactly as before. What *did* change, confirmed by eye in a screenshot at both engines: the bolt itself now reads as a gray head and silver thread — a recognisable bolt — where `render-003`'s own drive found a plain red/orange cylinder. The Inspector's Size fields also now read the metal-only envelope (18 × 15.59 × 26.5 mm, not the old tap-inclusive numbers), consistent with `tap` no longer being part of the default combine() this scenario's Size readout is drawn from. Console clean in both drives.

**Re-checked**: 2026-09-26 13:15 UTC — **PASS, unaffected by `ui-047`** (a new Inspector
section sitting below Color, not a change to Color itself). Driven against the real dev
server, laptop 1440x900 Chromium: a Cube and a Cylinder placed apart, the cube selected
and recoloured `#ff0000` via the swatch — `data-body-color` read `#ff0000` on the cube
and `''` (unchanged) on the cylinder, exactly as every prior drive of this scenario
found. The automated spec this scenario's own trigger owns
(`e2e/inspector-color-control.e2e.js`) was also re-run in full as part of this task's
Step 5 verification — 4/4 passed, all three engines' non-Firefox projects — so this
entry is a targeted hand confirmation on top of that, not a replacement for it.

