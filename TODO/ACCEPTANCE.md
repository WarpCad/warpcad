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

**Last run**: (unset — not yet driveable; `ui-013` doesn't exist yet)

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

**Last run**: (unset — not yet driveable; `ui-014` doesn't exist yet)

### 5. Hidden-part boolean (bolt tap-clearance)

**Steps**:
1. Drag a case-shell solid into the viewport.
2. Drag a "Bolt" into the viewport, positioned so its hidden `tap` clearance geometry
   overlaps the shell (visually, the bolt's head/thread mesh will appear to just touch
   or slightly penetrate the shell wall).
3. Select both the shell and the bolt (per scenario 4's multi-select gesture).
4. Click "Subtract" (shell selected first/as base, per scenario 4's ordering).

**Expect**: A hole appears in the shell sized to match the bolt's hidden tap-clearance
diameter (the fastener's thread-clearance geometry), not the bolt's visible
head/thread mesh diameter — confirming the hidden geometry, not just the rendered
mesh, drives the boolean result.

**Last run**: (unset — not yet driveable; `ui-014` and a case-shell primitive/composite
don't exist yet)

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
