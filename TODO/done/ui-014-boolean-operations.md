---
title: Boolean operation (Union/Subtract/Intersect) with selection-count gating
category: ui
kind: feature
priority: high
model: opus
milestone: M3
depends: [ui-011]
status: done
---

> **What actually shipped, where it differs from this file.** Three deviations, all
> small, all recorded rather than silently absorbed:
>
> 1. **The toolbar sits at the viewport's top-left, not stacked above the nav chrome.**
>    This file's Small-screen bullet asked for the bottom-left navigation-chrome band. It
>    is still viewport chrome and still not a fourth bottom-sheet tab — the load-bearing
>    part — but the bottom-left corner turned out to be the wrong half of the screen for a
>    control whose *enabled state* the user watches while picking the second solid: at
>    phone width the bottom band already carries the nav pad, the scale readout, the
>    Library tab and the Inspector sheet, which at a 2-body selection stack to roughly
>    630 px of an ~800 px viewport. Top-left is the one corner nothing else claims
>    (navigation bottom-left, readout bottom-right, orientation gizmo top-right), it
>    clears both sheets outright rather than by arithmetic, and it avoids the settings
>    popover — which opens *upward* out of the chrome — covering the toolbar.
> 2. **Operands are named by `document.currentIdOf(...)`, not by the raw selection ids**
>    this file's sketch passed. A selection holds *lineage root* ids, and a root's entry in
>    the evaluated scene still holds the geometry the body had when it was first placed —
>    so subtracting it would cut a hole where the body *used to be*. Covered by a unit test
>    and hit for real in the acceptance drive, which moved an operand before combining it.
> 3. **`consumes` validation also rejects a duplicate lineage and an empty/non-array
>    value**, which this file did not specify — cheap guards on the same code path, each
>    with a test.
>
> Everything else — the `consumes` field, its mutual exclusion with `supersedes`, the
> shared validation helper, the `mergedInto` index, `bodies()` skipping a retired root, and
> `currentIdOf` chaining through a merge — shipped as proposed.

## Goal

Let a user combine two or more placed solids into one, via a new **Operations**
toolbar: Union (merge), Subtract (remove the 2nd-and-later selected from the 1st),
Intersect (keep only the overlap). This is `Initial design.md` §6's first Operation
row and the concrete instance of `CLAUDE.md`'s non-negotiable creation-vs-operation
split — the toolbar is a new control, never a dropdown item alongside Library rows.

All Q10-17 answers below are **not new decisions** — they transcribe
`docs/decisions/interaction-model-qa.md` control 5 (already answered at kickoff,
confirmed against `Initial design.md` §6/§7) into this file's required shape, then
ground each one against the real current code so the Proposed fix section below is
assembly, not re-derivation.

## Interaction model

- **Precondition** — 2 or more solids currently selected (`useSelectionStore().count
  >= 2`, already tracked — see Affected files).
- **Trigger** — A button in a new **Operations toolbar**: Union / Subtract /
  Intersect, one button each. Lives in the viewport's own navigation-chrome band
  (same band as orbit/pan/zoom, per Q12/Q16 below) — not inside the Library panel or
  the Inspector, and not a dropdown alongside primitive/hardware rows.
- **Feedback** — Each button is disabled/dimmed until the count precondition is met.
  Once eligible: a live "N selected" badge shows on the toolbar itself, so the
  requirement is visible *before* it's satisfied. Clicking a button appends one
  `boolean.*` record consuming every selected id, replaces the selection with the new
  result's id (firing the selection→inspector contract on it), and the toolbar
  immediately disables again (now exactly 1 body is selected).
- **Placement** — n/a; this acts on existing geometry, it creates nothing at a
  transform.
- **Selection response** — Not during staging (2+ selected has no single-item
  Inspector contract, per control 3's Q15 "2+ individually-selected" state — Inspector
  shows its no-single-item state, same as today). Once the operation completes and the
  result auto-selects, the ordinary selection→inspector→gizmo contract (`ui-011`/
  `ui-012`) takes over on the result with no special-casing needed.
- **Selection count** — 2 or more for all three ops. **Subtract needs order, not just
  count**: the **first-selected** solid is the base, every solid selected after it is
  a subtrahend. The base keeps the ordinary selection outline color (`--accent`); every
  subsequent selected solid gets a visually distinct secondary outline (new
  `--accent-secondary` token, following the `--snap-guide` precedent from `ui-013`
  rather than reusing `--accent` for a different meaning) — visible for **any** 2+
  selection, not only while hovering Subtract, so the base/subtrahend relationship
  reads before the button is even clicked.
- **Small-screen behavior** — The toolbar must stay reachable without a keyboard and
  without living behind the Library/Inspector sheets (its enabled state needs to stay
  visible while the user is mid-selection in the viewport, unlike a panel that's fine
  to collapse). It joins the same navigation-chrome band `ui-018`/`ui-019` already
  built for orbit/pan/zoom/settings, as an icon-only row, at all three reference
  widths — not a fourth bottom-sheet tab.

## Documentation

- **Page**: `docs/booleans.md` (new).
- **Example**: "Drag two Cubes into the viewport so they overlap. Click the first,
  then Shift-click the second — the toolbar's Union/Subtract/Intersect buttons light
  up and show '2 selected'. The second cube's outline turns a dimmer accent color,
  marking it as Subtract's subtrahend. Click Subtract: the overlapping volume is cut
  from the first cube, the result is selected, and the toolbar dims again until
  another 2+ selection is made." Also documents that the base (first-selected) is
  always Subtract's minuend, with a note on how to tell which solid that is on screen.

## Affected files

- `src/core/kernel/registry.js` — add `'boolean.intersect'` (mirrors `union`/
  `subtract` at `registry.js:563-565`; `booleans.intersect` already exists in the
  `modeling` import used there, just not yet registered). Widen the `OpRecord`
  typedef (`registry.js:84-97`) with a new `consumes` field — see Proposed fix.
- `src/core/document.js` — `append()`'s supersession block (`document.js:197-218`)
  and `bodies()` (`document.js:259-284`) need a second consumption path alongside the
  existing single-id `supersedes` — see Proposed fix for why `supersedes` itself is
  the wrong field to overload for this.
- `src/core/document.spec.js` — new coverage for the `consumes` path (multi-input
  retirement, `currentIdOf` resolution through a merge, the mutual-exclusion guard
  against `supersedes`).
- `src/core/kernel/registry.spec.js` — `boolean.intersect` coverage mirroring the
  existing `union`/`subtract` tests.
- `src/components/viewport/OperationsToolbar.vue` (new) — the toolbar itself: three
  buttons, disabled state bound to `selection.count`, live count badge, appends the
  chosen `boolean.*` record via `useDocumentStore().append()` with `target` = first
  selected id, `operands` = the rest, `consumes` = all selected ids, then calls
  `useSelectionStore().select(newId)`.
- `src/components/viewport/Viewport.vue` — mount `OperationsToolbar.vue` in the
  nav-chrome band (near `NavigationChrome.vue`'s existing mount, `Viewport.vue`
  template around line 1412+); extend the selection-highlight logic at
  `Viewport.vue:513` (`mesh.material = selection.has(id) ? selectedMaterial :
  bodyMaterial`) to a three-way split: first selected id → `selectedMaterial`
  (unchanged), any other selected id → new `secondaryMaterial`, everything else →
  `bodyMaterial`. New `secondaryMaterial` created/disposed alongside
  `selectedMaterial` (`Viewport.vue:270`, `:1319`, `:1387`, `:1390`).
- `src/render/mesh.js` — add a `secondary` entry to the `dark`/`light` palettes
  (`mesh.js:85-86`), and a matching `--accent-secondary` CSS custom property
  (dark/light both) wherever `--accent`/`--snap-guide` are currently defined.
- `docs/booleans.md` (new) — end-user page, see Documentation above.
- `e2e/boolean-operations.e2e.js` (new) — see Testing.

## Proposed fix

**The registry half is mechanical**: `boolean.intersect` is a one-line addition next
to the existing `union`/`subtract` entries — `booleans.intersect` is already imported
via the `modeling` namespace, just unused. `boolean.subtract`'s existing `'2+'`
operand count and `inputs[0]`-is-base ordering (confirmed against
`@jscad/modeling`'s own `subtract(...geometries)`, which treats `geometries[0]` as
the minuend) already match Q15's base/subtrahend contract exactly, because the fold
resolves `target` before `operands` (`index.js`'s `inputRefs` construction) — so
`target` = first-selected = base falls out for free. No kernel-math work here.

**The real design decision is document-level, not kernel-level**: how does a 2-or-more
-input, 1-output operation retire its inputs? `document.js`'s existing `supersedes`
(singular string, `document.js:35-79`) was built for `ui-012`'s move/rotate case —
*one* record continuing *one* prior lineage's identity (a moved Cube is still a Cube:
`Body.op`/`params`/`name` are read from the **original root**). A boolean result is
not a continuation of either input's identity — a `Subtract` result is not "the base,
but consumed" the way a moved body is "the same Cube, but relocated"; it's a new thing
that happens to have been built from two others. Overloading `supersedes` to accept an
array would conflate two different meanings under one field name (continue an
identity vs. retire N identities into a new one) and would need to answer an
unanswerable question — *whose* `op`/`params`/`name` does the merged body inherit when
there's no longer one clear "original"?

**Proposed instead: a second field, `consumes: string[]`**, orthogonal to
`supersedes` (a record may set one or the other, never both — reject at `append()` if
both are present). Semantics:

- The consuming record is **its own new lineage root** — exactly what already happens
  today for any record with no `supersedes` (`document.js:234`: `root =
  supersededRoot ?? record.id`). No change needed there.
- For each id named in `consumes`, resolve its root the same way `supersedes`
  resolution already does (reuse/extract the three checks at `document.js:200-217` —
  exists, is currently its own lineage's terminal, isn't itself already consumed —
  into a small shared helper so `supersedes` and `consumes` validate identically
  rather than duplicating the checks).
- A new `mergedInto: Map<string, string>` index, alongside `rootById`/
  `terminalByRoot`. On a successful append with `consumes` present: for every named
  id's root `R`, `mergedInto.set(R, record.id)`.
- `bodies()` (`document.js:259-284`) skips any `rootId` from `rootOrder` that has an
  entry in `mergedInto` — one added `if (mergedInto.has(rootId)) continue` in the
  existing loop. This is the whole "the two inputs stop being independently
  selectable" behavior.
- `currentIdOf(id)` (`document.js:254-257`) should **chain through a merge**, not just
  a supersession: after resolving `terminalByRoot.get(root)` as today, if that root
  has since been merged (`mergedInto.has(root)`), follow it to the consuming record
  and repeat — so a reference to an id that got absorbed into a boolean two operations
  ago still resolves forward to whatever currently represents it, the same forward-
  resolution guarantee `supersedes` already gives a moved body. (This matters for
  `ui-026`'s future `group.snap`/`group.align` UI, which will need to resolve a
  possibly-stale id the same way.)

**Why build this generically now, not boolean-specific**: `ui-015` *(reserved,
"Combine into group")*, the very next M3 row, is the *same shape* — 2+ existing
bodies in, 1 new body out, inputs retired. Building `consumes` as a boolean-only
mechanism here would mean re-deriving this exact design question again one task
later. This file's scope stays boolean ops only (per `TODO/README.md`'s one-file-one-
change rule) — `ui-015` is not scoped here — but the `consumes` field and
`document.js` mechanism should be written generic enough that `ui-015` only needs to
call `append()` with its own `op`/`consumes`, not touch `document.js` again.

**Toolbar component**: `OperationsToolbar.vue` reads `useSelectionStore()` directly
(same pattern `NavigationChrome.vue` reads `settings` store), computes `disabled =
selection.count < 2`, and on click:
```js
documentStore.append(
  {
    id: documentStore.raw.nextId('bool'),
    op: 'boolean.union', // or subtract / intersect
    target: selection.ids[0],
    operands: selection.ids.slice(1),
    consumes: [...selection.ids],
  },
  { origin: 'local' }
)
selection.select(newRecordId)
```

## Effort

L — the toolbar and registry entry are each small, but `document.js`'s supersession
model is a shared, load-bearing module (every existing lineage/body-count assertion
in `document.spec.js` and every consumer of `bodies()`/`currentIdOf()` is a regression
surface for this change), and this is real architectural ambiguity with no existing
pattern in the codebase to mirror closely (per `TODO/README.md`'s opus criteria) —
hence `model: opus`.

## Testing

Vitest:
- `src/core/document.spec.js` — new `consumes` coverage: two independent roots merged
  by one record, `bodies()` reports exactly one body afterward (not three, not zero);
  `currentIdOf` on each original id resolves to the new record's id; a `consumes` id
  that doesn't exist, that's already been merged elsewhere, or that names a record
  that's itself been superseded (not currently terminal) all throw, mirroring
  `supersedes`'s existing error shapes; a record setting both `supersedes` and
  `consumes` throws; a chained case (A+B merge into C, then C+D merge into E) —
  `currentIdOf(A)` resolves all the way to `E`.
- `src/core/kernel/registry.spec.js` — `boolean.intersect`, mirroring the existing
  `union`/`subtract` `describe` blocks (operand count enforcement, actual geometric
  overlap result).

`*.e2e.js` — **required**, per `CLAUDE.md`'s reachability rule; this task adds a
brand-new toolbar control:
- `e2e/boolean-operations.e2e.js` (new): drag-place two overlapping cubes; confirm the
  toolbar's three buttons start disabled with no badge; select one cube (still
  disabled, "1 selected" if shown at all); Shift-select the second (buttons enable,
  badge reads "2 selected", second cube's outline visibly differs from the first's);
  click Union — confirm exactly one body remains (`data-body-count`), toolbar disables
  again, the result is selected (Inspector/gizmo attach). Repeat the click-and-count
  assertion for Subtract and Intersect against fresh pairs. A dedicated case selects
  base-then-subtrahend in one order, runs Subtract, then repeats with the same two
  cubes selected in the *opposite* order, asserting the two results differ (proving
  order, not just count, drove the op).
- Runs against **all three reference viewports** (phone/tablet/laptop), since the
  toolbar's small-screen placement is a stated requirement (Q16/Small-screen behavior
  above), with a snapshot at each.
- **Chromium only** for engine coverage: no new WebGL/WASM/canvas/touch/persistence
  surface is introduced beyond what `render-001`'s existing 9-way matrix already
  covers for the viewport itself — the new risk here is DOM/state logic (toolbar
  enablement, selection-order tracking), not rendering. If the secondary-highlight
  color rendering itself needs cross-engine confirmation, that's covered by extending
  an existing WebGL-path spec, not this one.

**Acceptance scenarios**: this is `TODO/ACCEPTANCE.md` scenario 4 ("Boolean gating")
directly, and scenario 5 ("hidden-part boolean — bolt tap-clearance") once a
`hardware.bolt`'s hidden tap sub-part is one of the operands — re-drive both by hand
per `CLAUDE.md`'s Verification section, not only the new e2e spec above. Scenario 4's
drive should explicitly check the Subtract base/subtrahend visual indicator (flagged
in `docs/decisions/interaction-model-qa.md` control 5's own Q17 note), since that's a
detail a scripted spec can assert but a human driving the app is what actually catches
if it's confusing on screen.

**Regression surface**: `document.js`'s `bodies()`/`currentIdOf()`/`append()` are
shared by every existing feature that places or moves geometry. Re-run the full
existing suite unchanged (`document.spec.js`, every `recipes/*.spec.js`, `ui-012`'s
transform specs, `core-013`'s `group.snap`/`group.align` specs) and confirm no
existing lineage/body-count assertion moved. This isn't a previously-closed
`TODO/VERIFY.md` finding in the strict sense, but `document.js`'s centrality makes it
the same kind of standing regression surface as `core-013`'s own re-check of
`evaluate()` — treat it with the same explicit re-run, not skipped as "unrelated."

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
