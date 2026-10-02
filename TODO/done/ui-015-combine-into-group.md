---
title: "Combine into group" operation — Group.assemble on the Operations toolbar
category: ui
kind: feature
priority: high
model: sonnet
milestone: M3
depends: [ui-014]
status: done
---

> **What actually shipped, where it differs from this file's own plan** (same
> convention `ui-014`'s retired file used): the registry entry, the toolbar's fourth
> button, and the `params.names` mechanism all landed exactly as proposed below. Four
> real deviations, found while implementing and verifying rather than designed up
> front:
>
> 1. **`OperationsToolbar.spec.js` does not exist** (confirmed at Step 2, as this
>    file's own Affected files section flagged as a possibility) — there is no
>    component-level test file alongside `OperationsToolbar.vue` for any of the four
>    buttons, boolean or Group. Its Testing-section case is therefore not written;
>    coverage for the button's wiring comes from `e2e/group-combine.e2e.js` instead
>    (real app, not a component harness), which is the stronger guarantee anyway.
> 2. **The `params.names` lookup uses `selection.ids` (lineage roots), not
>    `operandIds` (terminal ids)** as this file's own Proposed fix sketched
>    (`operandIds.map(id => documentStore.bodies.find(b => b.id === id)?.name ?? id)`).
>    `documentStore.bodies` keys each summary by its *lineage root* id, while
>    `operandIds` (built via `currentIdOf`) holds each operand's *terminal* record id —
>    the two only coincide for a body that has never been moved. The proposed lookup
>    would have silently fallen back to an opaque record id for any moved operand
>    instead of its real name. Fixed by looking the name up from `selection.ids`
>    (index-aligned with `operandIds`) instead.
> 3. **A fourth button's width broke a corner of the tablet layout — found by this
>    task's own full e2e run, not designed for up front.** Adding Group pushed the
>    toolbar's natural width from ~251px to ~326px, and at tablet width the persistent
>    Library/Inspector side panels leave the 3D viewport *pane* itself only ~390px wide
>    (a page-width media query never sees this — the page is 820px). The wider row
>    reached into the orientation gizmo's own corner, and Firefox's ~15px-wider button
>    labels turned that into a real, deterministic "intercepts pointer events" failure
>    in `viewport-scaffold.e2e.js`/`selection-inspector.e2e.js` (not this task's own new
>    spec) at tablet and phone widths. Fixed in `OperationsToolbar.vue`'s `<style>`: a
>    container-relative `max-width` on `.ops` (reserving the gizmo's own footprint) plus
>    unconditional `flex-wrap` on `.ops__row`, replacing a page-width-only cap that could
>    no longer catch a pane-width squeeze. Verified by direct bounding-box measurement in
>    both Chromium and Firefox, and re-driven by hand in WebKit at phone width (see
>    `TODO/ACCEPTANCE.md` scenario 1's re-check).
> 4. **Testid derivation changed from `operation.op.replace('boolean.', '')` to
>    `operation.label.toLowerCase()`**, so the fourth button reads `operation-group`
>    instead of the unchanged `operation-group.assemble` the old replace-only-`boolean.`
>    logic would have produced. Backward-compatible for the existing three (`union`/
>    `subtract`/`intersect` lower-case exactly as before).
>
> Also not in the original plan: an `aria-label` update on the toolbar's root
> (`"Boolean operations"` → `"Boolean and group operations"`, nothing depended on the
> old string) and an `id` prefix of `'group'` rather than `'bool'` for a
> `group.assemble` record's own id, for readability in an NDJSON document.

## Goal

Add a fourth button — **Group** — to the already-shipped Operations toolbar
(`OperationsToolbar.vue`, `TODO/ui-014`), alongside Union/Subtract/Intersect. Where a
boolean discards the operands' individual shapes and keeps only the combined volume,
Group keeps every selected solid's own geometry intact, addressable by name, while
making the whole thing act as **one** selectable/movable/rotatable body — `Initial
design.md` §6/§7's "multi-part `Group`-as-one-draggable" idea, now reachable from
user-placed bodies instead of only from a composite recipe's own internal parts
(`core-012`'s `kit.board`/`kit.boardFrame`/`kit.anchor`).

This task's own job stops at **producing a real Group body that behaves as a single
selection**. Actually clicking *into* one of its parts (`Group.pick` surfaced as a
selection behavior) is `ui-016`, the next M3 row, which this task exists to unblock —
see `docs/decisions/interaction-model-qa.md` control 6, already answered, which this
file does not re-derive.

## Interaction model

- **Precondition** — 2 or more solids currently selected. Identical gate to Union/
  Subtract/Intersect (`useSelectionStore().count >= 2`).
- **Trigger** — A fourth button, **Group**, appended to `OperationsToolbar.vue`'s
  existing `OPERATIONS` array (`OperationsToolbar.vue:51-70`) and its template loop
  (`OperationsToolbar.vue:149-163`) — no new control surface, no new mount point.
  Lives in the same top-left viewport-chrome band as the other three.
- **Feedback** — Same shape as the three existing buttons: disabled/dimmed below 2
  selected, live "N selected" badge once eligible. Clicking appends one
  `group.assemble` record `consumes`-ing every selected id (see Proposed fix), the
  result becomes the new selection (firing the ordinary selection→inspector→gizmo
  contract on it), and the button disables again since exactly one body is now
  selected.
- **Placement** — n/a; acts on existing geometry, creates nothing at a transform.
- **Selection response** — Not during staging, identical to the boolean buttons (2+
  selected has no single-item Inspector contract). Once the Group commits and
  auto-selects, control 3/4's ordinary contract (`ui-011`/`ui-012`) takes over: gizmo
  attaches sized to the *combined* bounding box (already works — `boundsOf`/
  `toGeom3` already measure a `Group` value uniformly, see Proposed fix), dimension
  lines read the combined extent, Inspector shows the Transform section as normal.
  **Explicitly not built here**: the Inspector's per-part breadcrumb and clicking a
  member mesh to narrow the pick — that is `ui-016`'s whole scope. Until `ui-016`
  lands, a Group body's Inspector looks exactly like a boolean result's today (no
  per-op param fields, since `group.assemble` carries no `ui` metadata — same as
  `boolean.union`/`subtract`/`intersect` already ship with none).
- **Selection count** — 2 or more, **order-independent** — unlike Subtract, Group has
  no base/subtrahend asymmetry, so it needs none of `ui-014`'s secondary-highlight
  machinery. Every selected solid is an equal member.
- **Small-screen behavior** — Same as desktop: it is the fourth button in a toolbar
  that already wraps to two rows under 640px width (`OperationsToolbar.vue`'s
  `.ops__row { flex-wrap: wrap }` at `@media (max-width: 640px)`, `TODO/ui-014`) — no
  new phone-width behavior to design, only to confirm the wrap still fits four
  buttons without horizontal scroll.

## Documentation

- **Page**: `docs/groups.md` (new) — Group is conceptually distinct from a boolean
  (nothing is subtracted or unioned away; every part survives, addressable later by
  `ui-016`), so it earns its own page rather than a subsection of `docs/booleans.md`.
  Add one cross-reference line to `docs/booleans.md`'s existing toolbar description
  noting the fourth button and linking to the new page, so a reader who lands on
  either page finds the other.
- **Example**: "Drag two Cubes into the viewport so they don't overlap. Click the
  first, then Shift-click the second — the Operations toolbar's Union/Subtract/
  Intersect/**Group** buttons all light up and show '2 selected'. Click Group: both
  cubes become one selectable body — the gizmo now sizes to fit both, and dragging it
  moves both cubes together. Each cube's own geometry is preserved inside the group
  (nothing is unioned or cut away), but there is no way yet to select just one of them
  — that's coming in a later task." Name that this is the same toolbar `docs/
  booleans.md` already documents, not a separate control to hunt for.

## Affected files

- `src/core/kernel/registry.js` — new `'group.assemble'` entry. Placed near
  `boolean.union`/`subtract`/`intersect` (`registry.js:571-580`) rather than beside
  `group.snap`/`group.align` (`registry.js:612-652`), because its *shape* — `2+`
  operands, each flattened via the fold's normal (non-raw) resolution before the op
  ever sees them — matches the booleans exactly; `group.snap`/`align`'s `rawOperands`
  machinery is irrelevant here despite the shared `group.` prefix. See Proposed fix
  for why raw operands are deliberately **not** used.
- `src/core/kernel/registry.spec.js` — new coverage, mirroring the `boolean.intersect`
  `describe` block `core-013`/`ui-014` already established.
- `src/components/viewport/OperationsToolbar.vue` — add the fourth entry to
  `OPERATIONS`, and extend `run()` (currently `OperationsToolbar.vue:95-125`) to
  attach `params: { names }` when (and only when) `op === 'group.assemble'` — see
  Proposed fix for where the names come from.
- `src/components/viewport/OperationsToolbar.spec.js` (if it exists as a
  component-level test alongside the `.vue` file — confirm during Step 2) — new case
  for the fourth button's enabled/disabled state and its click handler.
- `docs/groups.md` (new), `docs/booleans.md` (one cross-reference line) — see
  Documentation above.
- `e2e/group-combine.e2e.js` (new) — see Testing. Deliberately a separate file from
  `e2e/boolean-operations.e2e.js` rather than an addition to it, since Group's
  assertions (part count preserved, combined bounding box, no volume change) differ
  enough from the booleans' volume-based assertions that sharing one spec file would
  blur two different claims.

## Proposed fix

**The toolbar half is close to free.** `run(op, label)` (`OperationsToolbar.vue:95-125`)
already builds the generic `{ id, op, name, target, operands, consumes }` shape for
any op — that genericity is exactly what `ui-014`'s own file asked for when it wrote
"`ui-015` only needs to call `append()` with its own `op`/`consumes`, not touch
`document.js` again," and it held. The one real addition: `group.assemble`'s registry
entry needs to know each operand's **display name**, so the resulting `Group`'s parts
carry names `ui-016` can put in a breadcrumb later, rather than being addressable only
by opaque record ids. `useDocumentStore().bodies` (a `shallowRef<BodySummary[]>`,
`src/stores/document.js:36`, already carries `{ id, name, op, center }` per body) is
the lookup: `operandIds.map(id => documentStore.bodies.find(b => b.id === id)?.name ??
id)`. Pass this as `params: { names: [...] }` on the appended record — every other
field (`target`/`operands`/`consumes`) stays exactly as `run()` already builds it for
the other three ops.

**The registry entry is a plain `native('2+', ...)` op, deliberately not
`rawOperands`.** By the time a normal (non-raw) op sees its `inputs`, the fold has
already reduced every operand to a flat `Geom3` via `toGeom3` — which means a
composite operand (a placed `hardware.bolt`, say) arrives here with its own internal
parts already collapsed into one solid. That is a real, stated scope limit, not an
oversight: preserving a *nested* composite's own part structure inside a new outer
group would need `rawOperands` and `add()`'s existing `subpartPrefix` option
(`group.js:398-420`, already built for exactly this, V1's `subparts` argument) — but
wiring that through is `ui-016`-or-later work, once there is a UI that can actually
address a doubly-nested part. Building it here with no consumer would be exactly the
kind of premature generality `CLAUDE.md` warns against. State this limit in the
registry entry's own doc comment so it isn't silently rediscovered.

```js
'group.assemble': native('2+', ({ params, inputs }) => {
  const names = params.names
  if (!Array.isArray(names) || names.length !== inputs.length) {
    throw new Error(
      `group.assemble: expected one name per operand (${inputs.length}), got ` +
        `${JSON.stringify(names)}`
    )
  }
  if (new Set(names).size !== names.length) {
    throw new Error(`group.assemble: operand names must be unique, got ${JSON.stringify(names)}`)
  }
  let group = createGroup()
  inputs.forEach((geometry, index) => {
    group = add(group, geometry, names[index])
  })
  return group
}),
```

The uniqueness check matters concretely: `add()` (`group.js:398-420`) builds
`parts[partName] = object` by plain assignment — a duplicate name would silently
overwrite an earlier part rather than error, which is exactly the "wrong geometry with
no error" failure class `index.js`'s own `normalizeRef` comment already calls out for
a different case. In practice two sibling bodies can't collide (`document.js`'s
`nextName` counter guarantees "Cube 1"/"Cube 2"), but the op should not *trust* that
invariant from outside its own module — check it here, loudly, rather than inherit
correctness from a caller that happens to be well-behaved today.

**Rendering and measurement need no new code.** `Viewport.vue` already calls
`toGeom3(body.geometry)` before building a mesh (`Viewport.vue:485`, `:492`, `:716`)
and `boundsOf(body.geometry)` for dimension lines and the gizmo's sizing
(`Viewport.vue:765`, `:1268`) — both already handle a `Group` value uniformly via
`toGeom3`'s `isGroup(value) ? combine(value) : value` branch (`group.js:334-336`),
because every composite item (`hardware.bolt`, `kit.board`, ...) already produces a
`Group`-valued body today and already renders correctly. A `group.assemble` result is
not a new *kind* of value the render path has never seen — it is the same `Group`
shape a composite recipe already produces, just built from already-placed bodies
instead of from a recipe's own expansion.

**Document-layer change: none expected.** `document.js`'s own module comment
(`document.js:64-93`) already names `ui-015` as the second consumer of `consumes` and
states the mechanism "should need no change here." Confirm that by adding a
`group.assemble`-shaped fixture to the existing `consumes` test coverage in
`document.spec.js` rather than assuming the comment is still accurate — the check is
cheap and the comment predates this task actually landing.

## Effort

M — most of the surrounding machinery (`consumes`, the toolbar's generic `run()`, the
render path's `toGeom3`/`boundsOf` handling of `Group` values) already exists and was
built with this task in mind, so the new work is one registry entry, one toolbar
addition, and their tests. `model: sonnet` rather than `opus`: this closely mirrors an
existing, well-established pattern (`boolean.intersect`'s own addition in `ui-014`)
with no real architectural ambiguity — the one open design question (whether nested
composite operands keep their own sub-structure) is explicitly deferred, not decided
under pressure here.

## Testing

Vitest:
- `src/core/kernel/registry.js` / `registry.spec.js` — `group.assemble` with 2 and 3
  operands builds a `Group` whose `names`/`parts` match the given names 1:1 and whose
  `combine()` output volume equals `boolean.union`'s output volume for the same
  inputs (a cross-check that grouping doesn't silently lose or double geometry, since
  a `Group`'s default combine unions its visible parts the same way `boolean.union`
  does); a `names` array shorter/longer than `inputs` throws; duplicate names throw.
- `src/core/document.spec.js` — one new `consumes`-path case using a `group.assemble`
  -shaped record: `bodies()` reports exactly one Body afterward, that Body's
  `.geometry` satisfies `isGroup(...)`, `currentIdOf` on each original operand id
  resolves to the new record's id — confirming the module comment's "should need no
  change" claim with a real assertion, not by inspection alone.
- `OperationsToolbar.spec.js` (component-level, if this file exists — check during
  Step 2) — the fourth button's disabled state mirrors the other three; clicking it
  calls `documentStore.append` with `op: 'group.assemble'` and a `params.names` array
  matching the selected bodies' current display names, in selection order.

`*.e2e.js` — **required**, per `CLAUDE.md`'s reachability rule; this adds a new
control (the Group button) even though it shares a mounted component with `ui-014`:
- `e2e/group-combine.e2e.js` (new): drag-place two non-overlapping cubes; confirm all
  four toolbar buttons start disabled; select one, Shift-select the other (buttons
  enable, badge reads "2 selected"); click Group — confirm exactly one body remains
  (`data-body-count`), the toolbar disables again, the result is selected (Inspector/
  gizmo attach), and the rendered mesh's bounding box spans both original cubes'
  combined extent (proving neither cube's geometry was discarded or shrunk the way a
  boolean's would be). A second case groups three bodies at once (selection count 3),
  confirming the `'2+'` gate accepts more than the minimum.
- Runs against **Chromium only** for engine coverage, same reasoning `ui-014` gave for
  its own spec: no new WebGL/WASM/canvas/touch/persistence surface beyond what
  `render-001`'s matrix already covers — the risk here is DOM/state logic (toolbar
  wiring, name lookup), not rendering.
- Reference viewports: **Chromium only across all three widths is not required by
  this task** — the toolbar's layout at phone width is unchanged (a fourth button in
  an already-wrapping row), so this does not need the full three-viewport snapshot
  matrix `ui-014`'s own toolbar-placement work needed the first time. A single
  laptop-width run plus one phone-width run confirming the row still wraps without
  horizontal scroll is enough; no new snapshot baseline is being established.

**Acceptance scenarios**: no `TODO/ACCEPTANCE.md` scenario names this task directly.
Scenario 6 ("Group vs sub-part selection") is control 6's job — `ui-016` — which
depends on this task existing but does not complete until `ui-016` lands; do not claim
scenario 6 here. This task's own acceptance-relevant check is **scenario 1** ("two
independent primitives... both remain visible"), re-driven by hand because this task
changes `document.bodies()`'s output the same way `ui-014`'s Subtract/Union/Intersect
did — confirm placing, grouping, and then placing a third unrelated body afterward
doesn't regress body-count or visibility.

**Regression surface**: `document.js`'s `bodies()`/`currentIdOf()`/`append()` are the
same shared surface `ui-014` flagged as a standing regression concern for any
`consumes`-based op. Re-run the existing suite unchanged (`document.spec.js`, every
`recipes/*.spec.js`, `ui-012`'s transform specs, `core-013`'s `group.snap`/`group.align`
specs, `ui-014`'s own boolean specs) and confirm no existing lineage/body-count
assertion moved. This task adds a `native` registry entry, not a `composite` one, so
it does **not** touch `kernel/index.js`'s composite-expansion branch `core-020` fixed
(the `{ ...options }` spread that leaked `initial` into a recipe's nested fold) — no
re-run of that finding's specific repro is needed, since a `native` entry never calls
the nested `evaluate()` `core-020`'s bug lived in. State this explicitly rather than
silently skip it, since this task does extend the same `group.` op-name family
`core-013` introduced.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
