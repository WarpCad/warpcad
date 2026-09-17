---
title: Add a Hardware Library section to the Library panel (Bolt, Nut, Washer, Bearing)
category: ui
kind: feature
priority: high
model: opus
milestone: M5
depends: [core-010, core-011, core-023, core-003]
status: done
---

> **What actually shipped.** Option 2 as recommended — a composite drop commits the
> recipe's own record plus a trailing `transform.translate` that `supersedes` it
> (`recordsForDrop`), and `recordForDrop` now refuses a composite by name rather than
> silently misplacing it. Three corrections to this file, all found by building it:
>
> 1. **"None of the four destructure a `center`" is wrong for three of them.**
>    `hardware.nut`, `hardware.washer` and `hardware.bearing` all take a `center` and
>    thread it into their own `primitive.*` record; only `hardware.bolt` has no position
>    param. Option 2 was still the right call — it is one mechanism for all four and for
>    every future recipe, and it needs no recipe edits — but the file's stated reason
>    was only a quarter true, so it is corrected here rather than left to mislead
>    `ui-031`.
> 2. **The trailing translate flattens the composite's `Group`.** A placed bolt reports
>    `names: ["head","thread","tap"]` as built and `names: undefined` after its drop
>    translate. This is deliberate pre-existing kernel semantics, not something this task
>    introduced — `src/core/kernel/index.js` hands every native op a flat `Geom3` on
>    purpose, so the gizmo's own translate already flattens any group a user drags — but
>    it means a *placed* composite has no sub-parts to address, which is a third blocker
>    for `ACCEPTANCE.md` scenario 5 on top of the two this file names. Measured, pinned
>    by a unit test that says so out loud, and logged with the numbers against
>    `TODO/core-024`, which is the task that has to decide it. Making transforms
>    group-aware would be a cross-cutting kernel-semantics change to every existing
>    transform path, which is exactly the class of work this file reserved rather than
>    bundled.
> 3. **Two files outside the stated Affected files had to change**, both to satisfy this
>    file's own Interaction model rather than to extend it: `src/core/paramEdit.js` now
>    reports a composite-recipe root un-editable (otherwise a bolt's numeric `length`
>    would have been an editable field, contradicting the "read-only" contract), and
>    `src/components/inspector/Inspector.vue` gives that case its own note — telling a
>    user their freshly-dropped bolt is frozen "because an operation is applied on top of
>    it" would have been a lie. Two existing specs' claims were rewritten where this task
>    made them false: `registry.spec.js`'s "bearing is invisible to `buildRows`" and
>    `inspector.spec.js`'s no-`ui`-schema fallback case (moved to `kit.board`, an op that
>    genuinely still has none).
>
> Swatches are CSS silhouettes cut from the existing swatch element — a bolt profile, a
> bored hexagon, and two rings with different bores — not icon art, per this file's
> Testing section asking that the choice be stated.


## Goal

A user can drag a **Bolt**, **Nut**, **Washer** or **Bearing** out of the Library panel
into the 3D view, exactly the way `ui-010` already lets them drag a Cube or Sphere.
Today the panel shows exactly seven rows, all `primitive.*` — every fastener recipe
from M2 (`core-010`/`core-011`/`core-012`) and M4's `core-023` (`hardware.bearing`) is
fully built, dimensionally verified against V1, and registered in the kernel, but
**invisible in the app**, because `src/core/library.js`'s `buildRows` filters registry
keys to `op.startsWith('primitive.')`. Every one of those tasks' own retirement notes
flagged this gap explicitly rather than silently leaving it — see `core-010`'s "the
Library panel is not purely registry-driven" note, re-confirmed unchanged as recently
as `core-018`'s task on 2026-09-16.

"Done" here means: a second section, **Hardware**, appears in the Library panel below
Primitives, with rows for Bolt, Nut, Washer and Bearing (the four `hardware.*` recipes
— the simplest and most self-contained composite family, `operandCount: 0`, no board
parameter to drop unlike the kit-part/Raspberry Pi rows), each draggable into the
viewport with the same drag-preview/drop-commit gesture `ui-010`/`ui-013` already
built, landing as a correctly positioned, independently selectable body at the drop
point.

**Scoped narrower than "the whole catalog" on purpose**, mirroring this roadmap's own
precedent (`ui-010` shipped one mechanism for 7 primitives, not 7 tasks; M4 split the
Raspberry Pi catalog into `core-014`-`core-018` by family rather than one giant task).
`kit.board`/`kit.boardFrame`/`kit.anchor` and the whole `raspberrypi.*` family are
**explicitly out of scope** for this task — they follow the *mechanism* this task
builds, as a reserved follow-on row (`ui-031`, see Proposed fix), the same way an
eighth primitive would follow `ui-010`'s mechanism with no code change here.

This task also does **not** attempt to fully pass `TODO/ACCEPTANCE.md` scenario 5
(hidden-part boolean / bolt tap-clearance). Scenario 5's own re-check log names two
independent blockers: no Bolt Library row (this task), and `boolean.subtract`
deliberately refusing a sub-part-addressed operand like `tap` (`core-013`'s guard,
re-confirmed still in place as of `core-018`). This task closes the first blocker only
— see Proposed fix for why the second is a separate kernel-semantics decision, not
UI wiring, and must not be bundled in here.

## Interaction model

- **Precondition** — nothing must be selected; this is a creation control, same
  precondition as any Primitives row.
- **Trigger** — a new **Hardware** section in the Library panel (`LibraryPanel.vue`),
  below the existing Primitives section, with one draggable row each for Bolt, Nut,
  Washer, Bearing. Same panel, same pointer-driven drag gesture, same left-button-only
  guard as the existing rows — this reuses `usePlacementStore`, `onRowPointerDown`, and
  the window-level pointer tracking verbatim; nothing about the gesture mechanism
  changes, only the row source.
- **Feedback** — identical to `ui-010`'s Primitives feedback contract: a label follows
  the pointer over the panel; crossing into the 3D view swaps it for a translucent
  preview of the real part (a bolt's actual head/thread/tap silhouette, not a bounding
  box); releasing commits the part at the drop point, resting on the grid, selected.
- **Placement** — drag-to-place into the 3D view, per `CLAUDE.md`'s non-negotiable
  rule. **This is the task's real complexity, not the panel markup** — see Proposed
  fix: unlike every `primitive.*` op, none of the four `hardware.*` recipes accept a
  `center` (or any position) param, so `src/core/library.js`'s existing
  `paramsForDrop`/`recordForDrop` cannot place a composite the way they place a
  primitive without a design decision on how a composite's *result* gets moved to the
  drop point.
- **Selection response** — identical to any other placed body: Inspector shows its
  params (read-only, per `ui-029`'s precedent for anything a Fillet/Chamfer would
  freeze — n/a here since fasteners have no rim op applied, but the *pattern* of
  showing recipe params like `spec`/`fit`/`length` read-only, not editable geometry
  fields, follows `ui-029`), gizmo attaches to the whole placed group (per `ui-016`,
  since every `hardware.*` recipe returns a multi-part `Group`).
- **Selection count** — n/a, this is a 0-operand creation control like every
  Primitives row.
- **Small-screen behavior** — same as desktop: the Hardware section lives in the same
  phone bottom sheet as Primitives (`LibraryPanel.vue`'s existing `.library__sheet`),
  no new phone-specific layout. If the combined Primitives+Hardware row count no
  longer fits the sheet's `max-height: 46vh` without scrolling at phone width, that's
  fine — `.library__sheet` already scrolls (`overflow-y: auto`); confirm this by
  driving at 390px, don't assume it from reading the CSS.

## Documentation

- **Page** — update `docs/primitive-placement.md` (not a new page: it's the same
  panel and the same gesture, just a second section — a new page would duplicate the
  "Where the Library panel is" and gesture-mechanics content this one already covers).
  Retitle its "Placing your first shape" framing slightly if needed so it reads as
  covering the panel generally, not only Primitives, and add sidebar wording in
  `docs/README.md`'s existing bullet for this page.
- **Example** — add a concrete section, e.g.:
  > ## Placing a hardware part
  >
  > 1. Scroll down in the Library panel (or the phone sheet) past Primitives to the
  >    **Hardware** section: Bolt, Nut, Washer, Bearing.
  > 2. Drag **Bolt** into the 3D view the same way you'd drag a Cube. The preview
  >    shows the bolt's actual head and thread, not a placeholder box.
  > 3. Release to place it. Like a primitive, it lands resting on the grid at the
  >    drop point, selected — you can move, rotate or delete it the same way.
  >
  > A Bolt's Inspector parameters (`spec`, `fit`, `length`) are read-only, the same as
  > any recipe-built part — see [Selecting a shape](selection-and-inspector.md).

## Affected files

- `src/core/kernel/registry.js:150-201` — `composite()` currently has no third `ui`
  parameter (unlike `native()`, which already threads one through). Needs extending to
  accept and freeze an optional `ui` argument, matching `native`'s shape.
- `src/core/kernel/registry.js:796-813` — the four `'hardware.*'` entries (`bolt`,
  `nut`, `washer`, `bearing`) need a `ui: { label, defaults }` argument added, e.g.
  `composite(0, bolt, { label: 'Bolt', defaults: { spec: 'm10 hex', length: 20 } })`.
  Pick one representative default spec per part from its own table
  (`tables/bolt-specs.js`, `nut-specs.js`, `washer-specs.js`, `bearing-specs.js`) —
  `'m10 hex'`/20mm for Bolt, `'m4'` for Nut, `'m6'` for Washer (the ISO-7089-ported
  metric size `core-011` added), `'608'` for Bearing (the size `core-023`/`core-003`
  already measured and diffed).
- `src/core/library.js:43-121` — `buildRows`/`ROW_ORDER` filter to `primitive.*` only;
  needs a second pass (or a generalised filter reading any entry with `ui` metadata,
  grouped by op-namespace) that also picks up `hardware.*`. `restingCenter` assumes
  every op accepts a `center` param the way primitives do — **false for composites**,
  see Proposed fix.
- `src/core/library.js:139-161` — `paramsForDrop`/`recordForDrop` fold the drop
  position straight into `params.center`. For a composite this key is silently
  ignored by the recipe (none of the four destructure a `center`/`origin` param), so
  today's code would commit every hardware part at the recipe's own fixed internal
  origin regardless of where the user dropped it — a silent placement bug, not a
  crash. Needs a real branch on `entry.kind` here.
- `src/components/layout/LibraryPanel.vue` — add a second `<h2>`/`<ul>` block for the
  Hardware rows below Primitives, reusing `rows`/`onRowPointerDown` unchanged; add
  `.library__swatch[data-shape='hardware.*']` variants (or a generic fallback swatch
  if a per-shape icon isn't worth the effort at S/M size — state which in the PR, per
  this task's own Testing section).
- `docs/primitive-placement.md`, `docs/README.md` — per Documentation above.
- `e2e/` — new or extended `*.e2e.js` spec, see Testing.

## Proposed fix

**The panel/row wiring is the easy half and mirrors `ui-010` almost exactly — extend
`buildRows` to read a second namespace, add a second section to `LibraryPanel.vue`.
The real decision is how a composite's placed result gets moved to the drop point,**
since none of the four `hardware.*` recipes have a position parameter (they place
every internal part at a fixed `baseZMm`/origin, per `hardware.bolt.js`'s own module
doc on how V1's centring differs from V3's). Two options, recommend the second:

1. **Add a `center`/`origin` param to all four recipes**, threaded through their own
   internal `transform.translate` records. Touches four recipe files and their specs
   (`hardware.bolt.spec.js` etc. all assert exact translate vectors today), and every
   future composite recipe would need to remember to support it too — the same
   per-type-copy problem `ui-010`'s own doc explicitly rejected for primitives.
2. **Recommended: append a trailing `transform.translate` record targeting the
   composite's own id**, the same pattern `ui-029` already uses to reapply a rebuilt
   body's pose (`moveToRecord`/`rotateToRecord`) — a `supersedes`-based record that
   moves a whole prior result without touching what produced it. `recordForDrop`
   would need to return **two** records for a composite (the `hardware.bolt` line
   itself, unmoved, plus a `transform.translate` supersession moving it to
   `restingCenter`) instead of one, and the document/command layer already knows how
   to append more than one record per user action (`ui-015`'s `group.assemble`
   precedent). `restingCenter` for a composite needs to measure the *unmoved* Group's
   bounds via `evaluateOp` (this already works — `evaluateOp` folds a composite through
   the real pipeline and returns its `Group`, `boundsOf` handles a `Group` the same as
   a `Geom3`) and then feed that Z offset into the trailing translate's vector, rather
   than into a `center` param the recipe would ignore.

**Deliberately not doing here, named as follow-on work:**

- `ui-031` *(reserved)* — extend the same mechanism to `kit.board`/`kit.boardFrame`/
  `kit.anchor` and the `raspberrypi.*` catalog. Several of those recipes (per
  `docs/decisions/composite-recipe-geometry.md`) already expect their board parameter
  dropped and standalone expansion — confirm that still holds once a real Library row
  exists to drive by hand, don't assume the M4 decision doc's paper answer survives
  a real drive unchanged.
- A kernel-semantics decision *(reserved, category `core`)* — whether/how
  `boolean.subtract` (or a new op) can address a composite's hidden sub-part (e.g.
  `hardware.bolt`'s `tap`), which `core-013` currently rejects outright. This is
  `TODO/ACCEPTANCE.md` scenario 5's second blocker and is explicitly **not** part of
  this task — it's a boolean-operand-addressing design question, not Library-panel
  wiring, and bundling it in here would violate `TODO/README.md`'s "one suggestion per
  file" rule. Scenario 5 stays NOT DRIVEABLE after this task lands; re-check it and
  update its log entry to reflect exactly one blocker remaining (name it explicitly),
  not a full pass.

## Effort

L (multi-session / needs design discussion) — the panel wiring alone is S/M, but the
composite-placement decision above is real architectural ambiguity with no fully
existing pattern (closest precedent is `ui-029`'s pose-reapplication, not an exact
match), which is also why `model: opus` is set per `TODO/README.md`'s guidance on
cross-layer contracts with no existing pattern to mirror closely.

## Testing

- New `hardware-library.spec.js` (or extend `library.spec.js`) unit-testing the
  extended `buildRows` (Hardware section present, four rows, correct `op`/`label`),
  `composite()`'s new `ui` parameter, and the drop-record shape for a composite
  (asserting the trailing translate lands at the expected point, not folded into a
  no-op `center` param).
- New real app-level `e2e/hardware-library-placement.e2e.js`, navigating to `/`
  (`CLAUDE.md`'s reachability gate — not a `.story.e2e.js`), per this task's own
  Interaction model: drag Bolt from the Hardware section into the viewport, confirm it
  lands at the drop point (not at a fixed origin — this is the specific regression the
  Proposed fix's Option 2 exists to prevent), is selected, and the Inspector shows its
  `spec`/`fit`/`length` params read-only. Runs at all three reference viewports
  (phone/tablet/laptop — the Small-screen-behavior bullet above isn't "no change
  needed," it's "confirm by driving," so the phone case needs its own snapshot) and
  against Chromium/WebKit (this exercises the same drag/drop/viewport-projection path
  `ui-010`'s own spec already covers cross-engine; Firefox is expected to fail only at
  the pre-existing sandbox launch defect logged in `TROUBLESHOOTING.md`, per every
  M3/M4 task's own precedent — confirm that's still the *only* Firefox failure, don't
  assume it).
- **`TODO/ACCEPTANCE.md` scenarios this could plausibly break**: scenario 1 (two
  independent primitives) — re-drive in full, since this changes `buildRows`/
  `library.js`'s shared drop-commit path every placed body goes through, exactly the
  reason `core-012`/`ui-013` each re-ran it for a smaller change. Scenario 5 (hidden-
  part boolean) moves from NOT DRIVEABLE toward partially driveable — re-check and log
  precisely which blocker(s) remain, per Proposed fix above; do not claim a pass.
- **Closed-finding regression surface**: this task extends the exact pipeline
  `core-020` (composite-appended-through-`document.append` absorbs earlier bodies) was
  filed and fixed against, and is the *first* task to make that pipeline reachable
  from the real UI rather than only from tests/MCP. Re-run `core-020`'s original
  repro (a primitive placed, then a composite placed after it, via the real drag-drop
  UI this time rather than `document.append` called directly) and confirm the earlier
  body's name isn't absorbed. Also re-run `TODO/ACCEPTANCE.md` scenario 5's own logged
  `core-020` closed-finding re-check (2026-09-16 entry) one more time now that a real
  UI path exists to drive it through, not just the command layer directly.
