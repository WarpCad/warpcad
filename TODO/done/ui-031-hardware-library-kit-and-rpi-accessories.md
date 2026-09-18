---
title: Extend the Hardware Library mechanism to Kit-parts and the Raspberry Pi accessory catalog
category: ui
kind: feature
priority: high
model: opus
milestone: M5
depends: [ui-030]
status: done
---

> **What actually shipped, and the judgment call this file asked to have stated.**
>
> **The model selector is a row-level `<select>`, as recommended** — one row per recipe,
> a variant chosen on it before the drag, rather than one row per revision. The
> alternative was weighed rather than waved off: four Pi rows plus five camera rows
> would make a 26-row panel a 33-row one in which nine rows are the same two parts, and
> it would bake a revision list into the panel that the recipe is supposed to own. The
> chosen shape keeps `core-014a`'s "one factory, not one draggable per revision"
> decision true of the UI and not just of the kernel.
>
> Three things worth knowing beyond the plan:
>
> 1. **The variant had to be threaded through four layers, and the ghost caches had to be
>    re-keyed.** `paramsForDrop`/`recordsForDrop`/`ghostBoxAtOrigin` already took an
>    `overrides` argument (`ui-010` built that in), so `library.js` needed no branch at
>    all — but `placement.js` carried only an op string, and `Viewport.vue` cached built
>    ghost geometry, boxes and offsets **per op**. One op is now several solids, so an
>    op-keyed cache would have drawn whichever model was dragged first for every model
>    dragged after it. New `variantKey(op, overrides)` in `core/library.js` is what those
>    three caches key on now. This was the real work; the fifteen rows were the easy half,
>    exactly as this file predicted.
> 2. **`kit.board` and `kit.boardFrame` needed real `defaults`, not `{}`.** They are the
>    only recipes in the catalogue with *required* params their own recipe has no default
>    for (`cornerRadius`; the frame's four sizes), so a row with empty defaults would have
>    thrown the instant it was picked up. Caught by the unit test that builds every row's
>    defaults, which is why that test exists.
> 3. **This file's own row arithmetic was wrong** — it says "22-row" twice; 7 + 4 + 3 + 12
>    is **26**. Corrected in the code comments rather than carried forward.
>
> **The standalone-expansion assumption held, confirmed by driving.** The eight
> board-taking accessories do expand standalone and render complete on their own, resting
> on the grid wherever dropped — a HAT's GPIO header hangs 8.72 mm below its own board
> origin and the drop still seats it correctly on Z=0. Nothing floated at a
> board-relative origin. The decision doc's paper answer survived the first real drive
> unchanged. What *is* worth saying plainly, and is now in `docs/primitive-placement.md`:
> a dragged-in accessory arrives **unattached**, and mounting it onto a board is a
> separate Snap/Align step by design.
>
> **Two existing tests' claims were rewritten where this task made them false**, the same
> way `ui-030` had to: `registry.spec.js`'s "leaves kit/rpi without `ui` metadata, per
> ui-030's scope" now asserts the opposite (and that all fifteen build), and
> `inspector.spec.js`'s no-`ui`-schema fallback case moved from `kit.board` to
> `profile.roundedRectangle` — now the only 0-operand op in the registry with no `ui`, so
> the fallback is still genuinely exercised rather than quietly asserting nothing.
>
> **Scenario 6's deeper half is still not reachable, and is not claimed.** Drilling into a
> *group member* works with real parts (breadcrumb "Group 1 ▸ Camera Module 1"); drilling
> into a *placed recipe's own* sub-part (the Pi's `usbc`) does not, because the trailing
> `transform.translate` flattens the group — `ui-030` measured and pinned this, and
> `TODO/core-024` owns the decision. Confirmed by hand against a 15-part body for the
> first time rather than assumed from ui-030's note.

## Goal

`ui-030` builds the mechanism — a Library-panel section, drag/drop, and the
trailing-`transform.translate` technique that moves a positionless composite's result to
the drop point — for the four simplest `hardware.*` recipes. This task is the deliberate
follow-on named in `ui-030`'s own Proposed fix: apply that same mechanism to every other
composite recipe already built and kernel-verified but still invisible in the app —
`kit.board`, `kit.boardFrame`, `kit.anchor` (`core-012`) and the full `raspberrypi.*`
family (`core-014` through `core-018`: `bplus`, `cameraModule`, `touchDisplay7inch`,
`touchScreen2`, `miniPiTFT`, `piTFT22`, `piTFT24`, `hyperPixel4Rectangular`,
`activeCoolingFan`, `hat`, `hatStandoff`, `spacer` — 12 recipe files under
`src/core/kernel/recipes/`, plus the 3 kit-part ones, 15 in total).

"Done" looks like: a **Kit Parts** section (Board, Board Frame, Anchor) and a
**Raspberry Pi** section (every recipe above) appear in the Library panel below
`ui-030`'s Hardware section, each row draggable into the viewport with the identical
gesture, landing correctly positioned and independently selectable — closing the gap
`TODO/ACCEPTANCE.md` scenario 3 has stood in for with a Cube/Cylinder pair since
`ui-013`, and scenario 6 has stood in for with two Cubes since `ui-016`.

**The real complexity beyond repeating `ui-030`'s mechanism**: `raspberrypi.bplus` and
`raspberrypi.cameraModule` are each a **single registry op parameterised by `model`**
(`core-014a`'s own "one factory, not one draggable per revision" decision, per §6) —
a Pi board row can't just drag-and-drop a fixed shape the way a Bolt does, because
`model` (`2`/`3`/`4`/`5` for `bplus`; `v1`/`v2`/`v3`/`hq`/`arducam-hq` for
`cameraModule`) has no sensible single default and every real use case needs to pick
one. This task must decide how a Library row exposes a model choice — before or during
the drag — where `ui-030`'s four rows needed no equivalent decision at all.

## Interaction model

- **Precondition** — nothing selected; a creation control, same as `ui-030`.
- **Trigger** — two new sections in `LibraryPanel.vue`, "Kit Parts" and "Raspberry Pi",
  reusing `usePlacementStore`/`onRowPointerDown` unchanged. **New surface**: the
  `bplus`/`cameraModule` rows need a model selector reachable before the drag commits —
  recommend a small inline `<select>` on the row itself (default to the most common
  real model — Pi 4 / Camera v3, per `core-014`/`core-015`'s own module docs on which
  variant the surveyed corpus uses most) rather than a separate popover, so the drag
  gesture itself stays identical to every other row's.
- **Feedback** — identical drag-preview/drop-commit contract as `ui-030`: label follows
  the pointer, swaps for a translucent real-shape preview crossing into the viewport,
  commits selected at the drop point resting on the grid.
- **Placement** — drag-to-place, reusing `ui-030`'s trailing-`transform.translate`
  technique verbatim for all 15 recipes (none of them accept a position param either,
  confirmed by the same `paramsForDrop`/`recordForDrop` gap `ui-030` already found).
- **Selection response** — identical to `ui-030`: Inspector shows recipe params
  read-only, gizmo attaches to the whole placed `Group`. For the multi-part `raspberrypi.*`
  bodies this is the first real (not Cube-stand-in) exercise of `ui-016`'s sub-part
  pick-depth — confirm drilling into e.g. a Pi's `usbc` part still shows a sensible
  breadcrumb and read-only params, not just that it doesn't crash.
- **Selection count** — n/a, 0-operand creation control.
- **Small-screen behavior** — same as desktop: two more sections in the existing
  scrollable phone/tablet sheet. With 4 (Primitives... actually 7) + 4 (Hardware) + 3
  (Kit) + 12 (Raspberry Pi) rows the sheet's `max-height: 46vh` scroll needs re-confirming
  by driving at 390px, not assumed from `ui-030`'s single-section confirmation — a
  22-row scrollable list is a materially different UI than an 11-row one.

## Documentation

- **Page** — extend `docs/primitive-placement.md` again (the same page `ui-030`
  retitles/extends), adding "Placing a kit part" and "Placing a Raspberry Pi part"
  sections mirroring `ui-030`'s own worked example, including how to pick a model on the
  Pi/Camera rows specifically.
- **Example**: "Drag **Raspberry Pi** into the 3D view. Before dragging, use the row's
  model dropdown to choose Pi 4 or Pi 5 — the preview and placed board reflect whichever
  is selected. Release to place it, exactly like a primitive."

## Affected files

- `src/core/kernel/registry.js` — add `ui: { label, defaults }` metadata to all 15
  entries, mirroring `ui-030`'s pattern for the 4 `hardware.*` ones. The `bplus`/
  `cameraModule` entries need `defaults.model` set to a real, named default rather than
  left to throw on an unset param.
- `src/core/library.js:43` (`ROW_ORDER`), `:57` (`buildRows`) — extend the section
  grouping beyond `ui-030`'s two-namespace pass to a third and fourth (`kit.*`,
  `raspberrypi.*`), or generalise to "group by any namespace with `ui` metadata" if
  `ui-030` didn't already do so generically — check `ui-030`'s shipped code first
  rather than re-deciding this.
- `src/components/layout/LibraryPanel.vue` — two more section blocks; a new
  `<select>` (or equivalent) control on the two model-parameterised rows specifically,
  reading from each recipe's own valid-model list (`tables/rpi-parts.js` for `bplus`,
  the camera recipe's own model union type).
- `docs/primitive-placement.md`, `docs/README.md`.
- `e2e/` — see Testing.

## Proposed fix

Mechanically identical to `ui-030` for 13 of the 15 rows (no position param, same
trailing-translate technique, same drag/drop gesture). The two model-parameterised rows
need a **row-level model selector** rather than a fixed default — recommend a small
`<select>` inline in the row's markup, defaulting to the recipe's own most-common real
value, changing which `params.model` a drag from that row commits. This keeps the drag
gesture itself untouched (it still starts from `onRowPointerDown` reading a fixed
`params` object per row) while letting the user pick a variant first. An alternative —
one row per model variant (e.g. "Raspberry Pi 4", "Raspberry Pi 5" as separate rows) —
was considered and is **not recommended**: it would produce 4 rows for `bplus` and 5 for
`cameraModule`, working against `core-014a`'s own explicit "one factory, not one
draggable per revision" decision for exactly this reason. State whichever is chosen in
this task's own retirement note, since it's a real judgment call with no existing
precedent in this codebase to mirror.

**Confirm the standalone-expansion assumption by driving, not just by reading the
decision doc**: `docs/decisions/composite-recipe-geometry.md` says the 8 board-taking
accessories (`touchDisplay7inch`, `touchScreen2`, `miniPiTFT`, `piTFT22`, `piTFT24`,
`hyperPixel4Rectangular`, `hat`, `spacer`) already drop their board parameter and expand
standalone — meaning a Library-dragged accessory renders with no board underneath it
until the user separately places one and runs `group.snap`/`group.align` (`ui-026`) to
attach them. `ui-030`'s own Proposed fix flagged this as needing confirmation "once a
real Library row exists to drive by hand, don't assume the M4 decision doc's paper
answer survives a real drive unchanged" — this is that first real drive; if a
standalone accessory renders in a way that's confusing or wrong (e.g. floating at an
origin that only makes sense relative to a board), log it rather than silently accept it.

## Effort

L — 15 recipes' worth of registry/panel wiring is mechanical and low-risk on its own
(closely mirrors `ui-030`'s just-shipped pattern), but the model-selector UI is new
ground with no existing control to copy, and the standalone-expansion assumption above
is a real "confirm by driving" risk `core-014a` already got wrong once on paper. `model:
opus` per `TODO/README.md`'s guidance on real architectural ambiguity with no exact
existing pattern.

## Testing

- Extend `library.spec.js`/`hardware-library.spec.js`: 15 more rows registered, correct
  section grouping, and (new) that the model-selector rows' `params.model` changes what
  a drop commits.
- New or extended `e2e/hardware-library-placement.e2e.js` (built by `ui-030`): drag a
  Kit Board, then a Raspberry Pi (both model choices), confirm each lands at the drop
  point selected with read-only params. Runs at all three reference viewports (the
  22-row scroll case named above) and Chromium/WebKit (Firefox expected to fail only at
  the pre-existing sandbox launch defect, per every M3/M4/M5 precedent).
- **`TODO/ACCEPTANCE.md` scenarios**: **scenario 3** (kit assembly) — re-drive in full
  with the *real* Raspberry Pi 5 + Camera Module V3 pair for the first time, replacing
  the Cube/Cylinder stand-in `ui-013`/`ui-026` used; this is the scenario this task
  exists to stop standing in for. **Scenario 6** (group/sub-part selection) — re-drive
  with a real multi-part composite (e.g. drilling into the Pi's `usbc` sub-part)
  replacing the two-Cube stand-in. **Scenario 1** — re-drive in full, since this changes
  the shared drop-commit path every placed body goes through, same as `ui-030`.
- **Closed-finding regression surface**: `core-020` (composite absorbs earlier bodies) —
  re-run its repro against several of these 15 new composite kinds specifically, since
  each is a "new composite kind added to the expansion path" per `CLAUDE.md`'s standing-
  regression-surface rule, the same re-check every `core-01x` task already performed for
  its own recipes.
