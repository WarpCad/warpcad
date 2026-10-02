---
title: Group selection vs. clicking a sub-part (Group.pick pick-depth)
category: ui
kind: feature
priority: high
model: opus
milestone: M3
depends: [ui-015]
status: done
---

## Goal

A Group body (`ui-015`'s `group.assemble`, or a kit-part composite from `core-012`)
currently behaves as one opaque selectable object — clicking anywhere on it selects the
whole thing, and there is no way to reach an individual member's own bounding box or
name. This task adds **pick depth**: once a group is already selected as a whole, a
second, distinct click landing on one of its member meshes narrows the selection to
that sub-part — `Initial design.md` §7b's `Group.pick`, and
`docs/decisions/interaction-model-qa.md` control 6 (already answered; this file does
not re-derive it, only implements it). "Done" looks like: place two cubes, group them,
click the group once (whole-group Inspector/gizmo/dimension-line contract, as today),
click again on one cube specifically (Inspector breadcrumb reads "Group ▸ Cube 1",
gizmo and dimension lines shrink to that cube's own bounding box), click the breadcrumb's
"Group" segment (steps back up to the whole-group selection), click empty space (clears
entirely).

**This task is selection-display only**, matching its own roadmap `Kind` — moving or
editing a sub-part independently of its group is explicitly out of scope; see
Interaction model's Selection response bullet for why the gizmo must actually be
*disabled*, not merely inert, while a sub-part is drilled into.

## Interaction model

Transcribed from `docs/decisions/interaction-model-qa.md` §6 (control 6), which is the
authority here — this section states it in this file's own vocabulary but changes
nothing:

- **Precondition** — A group (2+ items combined via `ui-015`'s Group button) is
  *already selected as a whole* from a prior click.
- **Trigger** — A second, distinct tap/click landing specifically on one of the group's
  member meshes. A fresh click on any part of an *unselected* group always selects the
  whole group first — it never jumps straight to a sub-part on the first click. Once
  a sub-part of a group is drilled into, clicking a *different* member mesh of the same
  group re-targets directly to that sibling (no need to click the whole group again
  first) — this is the one behavior control 6's Q&A left implicit rather than stating,
  recorded here as this task's own explicit call rather than left to be guessed at
  during implementation.
- **Feedback** — Gizmo, dimension lines, and Inspector re-target from the group's
  combined bounding box to the clicked sub-part's own bounding box. The Inspector
  header shows a breadcrumb ("Group ▸ Camera Module") so the pick-depth change is
  visible, not a silent field swap indistinguishable from a bug.
- **Placement** — n/a; this is a selection-retargeting mechanism, not a creation
  control.
- **Selection response** — Inspector shows the sub-part's own name and bounding-box
  size. **Whether it also shows the sub-part's own editable params depends on how it
  was produced** (see Proposed fix's two cases) — but even when params are shown, they
  are **read-only** in this task. The gizmo **must not attach** while a sub-part is
  drilled into: `document.bodies()` only exposes group-level ids, so there is no
  record for a `transform.*` op to target that means "just this named part" — showing
  an active, draggable gizmo here would either throw on drag or silently move the
  whole group instead of the part the Inspector claims is selected, which is exactly
  the "gizmo and numeric fields must drive the same underlying transform" contract
  CLAUDE.md's Interaction Model section requires and this state cannot satisfy. Hide
  the gizmo and show dimension lines only (display, not a drag handle) whenever a
  sub-part is the active selection.
- **Selection count** — Exactly one group must already be selected as a whole before
  sub-part narrowing can trigger. Clicking a sub-part mesh with nothing currently
  selected selects the parent group first, per the Trigger bullet.
- **Small-screen behavior** — Same auto-opening bottom sheet as control 3, now also
  showing the breadcrumb. Sub-part hit targets need a minimum tap-target padding
  independent of the mesh's own rendered screen size at phone width (Q16) — the same
  touch-target concern `ui-012`'s gizmo handles already carry, applied here to
  raycast hit-testing instead of a fixed-size handle.

## Documentation

- **Page**: `docs/groups.md` (existing, from `ui-015`) — add a new "Selecting a part
  inside a group" section rather than a separate page; this is a direct continuation of
  the page's existing "combine into group" content, not a distinct concept.
- **Example**: "After grouping two cubes (see the section above), click the group once
  — the Inspector shows the combined group as one object. Click one of the two cubes
  again — the Inspector header now reads 'Group ▸ Cube 1', and the gizmo/dimension
  lines shrink to that cube's own size. Click the 'Group' breadcrumb segment to step
  back up to the whole-group selection, or click empty space to deselect entirely."

## Affected files

- `src/components/viewport/Viewport.vue` — `syncBodies()` (~L472-504): for a
  Group-valued body, build a `THREE.Group` of one `Mesh` per named part instead of one
  `Mesh` from the combined solid, so a raycast can land on an individual part. Each
  part mesh gets `userData.bodyId`/`userData.partName`; the outer object keeps
  `name = body.id` for backward-compatible whole-body identification.
  `raycastBodyId()` (~L1213-1220) needs `intersectObjects(bodiesGroup.children, true)`
  (recursive — currently `false`) and a new `raycastHit()` returning
  `{ bodyId, partName }` (`partName` undefined for a non-group body), with
  `raycastBodyId` kept as a thin `raycastHit(...)?.bodyId ?? null` wrapper so
  `hitsBodyAt()` and the marquee path need no change. `pickAt()` (~L1233-1244) gets the
  pick-depth decision logic from the Interaction model section above.
- `src/render/mesh.js` — no signature change; `geom3ToBufferGeometry` already converts
  one `Geom3` at a time, which is what per-part mesh building needs (call it once per
  `group.parts[name]` instead of once on the pre-combined solid).
- `src/stores/selection.js` — add sub-part drill-down state (e.g. a `subPart` ref
  holding `{ bodyId, partName } | null`), cleared by `select`/`clear`/`selectMany`
  whenever the selected body id changes, and a `drillInto(partName)` /
  `stepUp()` pair for the breadcrumb.
- `src/core/inspector.js` — `describeSelection`/`describeBody` need a sub-part path:
  given a Group body and an active `partName`, build a display description from
  `group.parts[partName]`'s own bounds, plus the sub-part's op/params **when
  recoverable** (see Proposed fix's two cases), else bounds/name only.
- `src/composables/useSelectedBody.js` — read `selection.subPart` alongside
  `selection.ids` and pass it into `describeSelection`.
- `src/components/inspector/Inspector.vue` — the breadcrumb: a small header row above
  the existing single-selection contract, "Group ▸ <part name>", the "Group" segment
  clickable to call `selection.stepUp()`.
- `docs/groups.md` — see Documentation above.
- `e2e/group-subpart-selection.e2e.js` (new) — see Testing.

## Proposed fix

**The real content is the render path, not the click handler.** `ui-015`'s
`group.assemble` (and every `core-012` kit-part composite before it) already produces a
`Group` value, and every existing consumer flattens it before it ever reaches a mesh:
`Viewport.vue:485`/`:492`/`:716` all call `toGeom3(body.geometry)`, whose `isGroup`
branch (`group.js:334-336`) calls `combine()`, which **unions every part into one
solid via a CSG boolean** — after that boolean, there is no polygon-level trace of
which part contributed what, so a raycast hit today can only ever resolve to the
*body*, never a *part*. This is not a gap in the click handler; there is no data left
to hand it. Fix: for a Group-valued body, stop calling `toGeom3`/`combine` for mesh
building and instead build one `Mesh` per entry in `group.parts` (each already a plain
`Geom3`, no boolean needed), parented under one `THREE.Group` named `body.id`. Visually
this is equivalent to today's combined mesh **when parts don't overlap or touch** —
which is `ui-015`'s own stated design intent ("Group keeps every selected solid's own
geometry intact... making the whole thing act as one selectable body", nothing unioned
away) — so this is not expected to introduce a visible regression for the cases the
feature was built for. State explicitly in code comments that two touching/overlapping
parts may show a per-part seam or z-fighting at their shared boundary where the old
combined mesh would have shown a clean unioned surface — an accepted, already-implicit
tradeoff of "every part survives," not a new one this task introduces.

`boundsOf()`/`localBoundsOf()` (used for the *whole-group* gizmo/dimension sizing) stay
unchanged — they still need the combined overall extent, which still requires
`combine()` internally for that one measurement; only the *mesh-building* call sites
stop flattening early.

**Two cases for sub-part param recovery, stated so the implementer isn't left to guess
which one applies:**

1. **The Group came from `ui-015`'s `group.assemble`.** Its record carries
   `consumes: [id, id, ...]` and `params.names: [name, name, ...]` in the same order
   (`ui-015`'s own Proposed fix). Zipping the two gives `partName → consumedId`, and
   `document.js`'s `entries`/`scene.byId` still hold the consumed record even though
   `bodies()` skips it (`document.js`'s own module comment on `consumes`/`mergedInto`)
   — so the *original* record's `op`/`params` are recoverable, and `describeBody` can
   describe the sub-part with its real per-op fields (e.g. a grouped Cube's own size),
   read-only, not just a bare bounding box.
2. **The Group came from a `core-012` composite recipe** (`kit.board`, `kit.boardFrame`,
   `kit.anchor`) **or any future composite**. Its parts were built by the recipe's own
   internal expansion, not by consuming a top-level document record — there is no
   `consumes` entry to resolve. Fall back to a bounds-only sub-part description (name +
   size, no param fields) in this case. This mirrors `ui-015`'s own stated scope limit
   on nested composite operands, applied one layer further out.

**Pick-depth state and click decision**, in `pickAt()`:

```js
function pickAt(clientXPx, clientYPx, additive = false) {
  const hit = raycastHit(clientXPx, clientYPx)
  if (!hit) { selection.clear(); return }               // empty space
  if (additive) { selection.toggle(hit.bodyId); return } // marquee/shift path unchanged
  const alreadyThisBody = selection.ids.length === 1 && selection.ids[0] === hit.bodyId
  if (hit.partName && alreadyThisBody) {
    selection.drillInto(hit.partName)                     // narrow or re-target sibling
  } else {
    selection.select(hit.bodyId)                          // fresh select clears subPart
  }
}
```

The breadcrumb's "Group" segment calls `selection.stepUp()` (clears `subPart`, keeps
`ids` unchanged) — a UI-only affordance, not a raycast path.

## Effort

L — this is real architectural work, not wiring: it changes how *every* Group-valued
body is rendered (not just `ui-015`'s new bodies but every already-shipped `core-012`
kit-part composite too), adds a genuine two-case design decision for param recovery
that the implementer must apply correctly rather than invent, and touches a cross-layer
contract (render mesh structure → raycast → selection store → inspector) with no
existing closely-mirrored pattern in this codebase. `model: opus` per
`TODO/README.md`'s Model field guidance: rendering-algorithm work where the correctness
argument is partly about what *doesn't* regress (every existing Group producer's visual
output), plus real cross-layer ambiguity (the two param-recovery cases above).

## Testing

Vitest:
- `src/render/mesh.spec.js` or a new `Viewport`-adjacent unit — building per-part
  meshes from a `Group` with 2-3 named parts produces one `BufferGeometry` per part,
  each matching `geom3ToBufferGeometry(group.parts[name])` directly (no boolean
  applied), and the combined visual bounding box of all part meshes together equals
  `boundsOf(group)` (confirming nothing was lost or duplicated by skipping `combine()`
  at this call site).
- `src/core/inspector.spec.js` — sub-part description for a `group.assemble`-produced
  Group recovers the original consumed record's `op`/`params` (case 1); sub-part
  description for a `core-012` composite Group falls back to bounds/name only, no
  `params` (case 2); an unknown `partName` against a real Group throws rather than
  silently returning nothing (mirrors `group.js`'s own `pick()` error convention).
- `src/stores/selection.spec.js` — `drillInto`/`stepUp` transitions; selecting a
  different body id clears `subPart`; `additive` toggle never touches `subPart`.

`*.e2e.js` — required, this adds a new trigger (second click on a member mesh) and a
new Inspector element (the breadcrumb):
- `e2e/group-subpart-selection.e2e.js` (new): drag-place two non-overlapping cubes,
  select both, click Group (reusing `ui-015`'s own `group-combine.e2e.js` setup path);
  click the resulting single body once more, but targeting one member's own screen
  position specifically — confirm the Inspector breadcrumb reads "Group ▸ <name>", the
  gizmo is **not present** (per this task's own display-only rule), and the dimension
  lines' rendered extent matches that one cube's own size, not the combined group's.
  Click the breadcrumb's "Group" segment — confirm the whole-group contract returns
  (gizmo reattaches sized to the combined bbox). Click empty space — confirm full
  deselection. A second case clicks a *different* member directly while already
  drilled into the first, confirming direct sibling re-targeting without needing to
  click the whole group again first (the explicit Interaction-model call this file
  made above).
- Reference viewports: **all three** (phone/tablet/laptop) — Q16 explicitly calls out
  sub-part hit-target padding as a phone-width concern, and the breadcrumb is a new
  element in the same bottom sheet `ui-011`'s hand-drive already found stacking
  problems in once.
- Engines: **all three** (Chromium/Firefox/WebKit) — this changes the mesh-building
  path (`geom3ToBufferGeometry` call sites) for every Group-valued body and adds a
  recursive raycast, both WebGL/canvas-adjacent per CLAUDE.md's Browser Support
  section, matching the bar `ui-013`'s snap-guide picking work set for the same reason.

**Acceptance scenarios**: **scenario 6** ("Group vs sub-part selection") directly — this
is the task that completes it; `ui-011`'s and `ui-015`'s retirement notes both named
this task as the one scenario 6's remaining half depends on, so drive it in full, not
partially. Also re-drive **scenario 1** (two independent primitives both remain
visible), since this task changes how a Group body becomes a mesh — confirm placing,
grouping, drilling into a part, stepping back up, and placing a third unrelated body
afterward doesn't regress body count or visibility. Also re-drive **scenario 2**'s
Inspector-fields contract for the ordinary single-body case (not a sub-part), since
`describeSelection`'s signature is changing to accept a `subPart` argument — confirm
the ordinary path is unaffected when `subPart` is absent.

**Regression surface**: this extends the render path every Group producer feeds, not
just `ui-015`'s new one — re-run `core-012`'s existing kit-part recipe specs and
visually re-check a placed `kit.board`/`kit.boardFrame`/`kit.anchor` item still renders
with no new seam/z-fighting artifact now that its parts are meshed individually instead
of pre-combined (this is the first change to *how any Group renders* since `core-012`
shipped those composites and `ui-013` first placed them). Also re-run `ui-015`'s own
`group-combine.e2e.js` unchanged as this task's own baseline check (grouping still
yields exactly one body with the combined bounding box, before this task's narrowing
behavior is exercised on top). This task reads `document.js`'s `consumes`/`mergedInto`
bookkeeping (case 1 above) but does not write to it, so `core-020`'s composite-fold fix
is not directly at risk — state this explicitly rather than silently skip re-running
its repro, since this task does extend the same `consumes` surface `core-020`'s fix
lives beside.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
