---
title: Make a selected primitive's own parameters (diameter, height, size…) editable in the Inspector
category: ui
kind: feature
priority: high
model: opus
milestone: M4
depends: [ui-011, ui-012]
status: done
---

> **Shipped, with four things worth recording — three deviations from this file's own
> spec and one defect this task's own verification found mid-flight, per `/fix-todo`
> Step 2/Step 6:**
>
> 1. **The rebuilt record omits `name`**, though the Proposed fix says "`op` and `name`
>    copied from the root". `src/core/transform.js`'s "Why transform records are
>    unnamed" section gives a specific, checked reason a `supersedes`-based record must
>    stay unnamed — `Body.name` is read from a lineage's *root* record only, so a name
>    here is inert at best and a duplicate `group.js` does not deduplicate at worst.
>    `ui-027` made the identical call one task earlier; followed that precedent rather
>    than opening a second one.
> 2. **The lineage-walk helper is split across two modules, not one.**
>    `document.js` gained `lineageOf(id)` — a read-only, **op-agnostic** walk returning
>    a lineage root-first — and the *policy* ("is everything above the creation record a
>    transform?") lives in the new framework-free `src/core/paramEdit.js`. The command
>    layer stays ignorant of what any particular op means, which is the boundary its own
>    module doc draws; the guard stays unit-testable against a hand-built entries array,
>    which is what this file's Testing section asks for.
> 3. **`Body.params` no longer always come from the lineage root** — the one change
>    outside this file's Affected files list, and it was not optional. `document.js`
>    read `Body.params` off the root record, so a rebuilt body kept *displaying* its
>    original diameter while rendering the new one. Caught by this task's own e2e run,
>    not by reasoning. They now come from the newest record carrying the root's own op
>    (`paramEdit.js`'s `currentParamsRecordOf`); a `transform.*`'s params are still never
>    read as dimensions, which was the original reason that field was pinned to the root.
> 4. **A real defect, found and fixed mid-task**: the first implementation spread each
>    edit from the **root's** params, so a second edit silently resurrected whatever the
>    first had changed (edit Diameter, then Height, and the diameter jumped back). Both
>    the panel and the next edit now read their base through the same helper, so they
>    cannot disagree. Pinned by `paramEdit.spec.js`'s "chained edits" describe block.
>
> **Kernel-error display, the cross-reference this file and `ui-027` both asked for**:
> `ui-027` landed first, so it built the first user-facing runtime kernel-error surface
> (`OperationsToolbar.vue`'s `opError` and its popover `<p>`). This task **reuses that
> convention** rather than inventing a second: the Inspector's `paramError` and its
> `.inspector__error` paragraph follow the same shape, the same neutral styling (no
> `danger` token exists in this codebase yet), and the same "the message is not a latched
> state" behaviour. A note to that effect has been added to
> `TODO/done/ui-027-fillet-chamfer-rim-operation.md`.
>
> **Follow-up question this file asked to settle at Step 2** — "is replaying a
> fillet/chamfer/boolean on top of a rebuilt creation record worth a follow-up TODO?"
> **Yes, but not urgently**, and it is deliberately left unfiled here rather than
> speculatively scoped: a rim op's params are measured against the exact solid they were
> aimed at, so re-running one against a resized body can legitimately fail
> `assertRadiusFits` — or, worse, succeed and produce a rim nobody asked for. The honest
> shape of that task is "let the user re-enter the rim parameters after a resize", which
> is a UI question, not a replay engine, and it should be scoped when someone actually
> hits the freeze. The freeze is discoverable and self-explaining in the meantime.

## Goal

Reported directly from hands-on use (2026-09-12): place a Cylinder, select it, try to
change Diameter from 40 to 10 in the Inspector's Parameters section — nothing happens.
This is not a bug in the sense of broken code; the fields are `readonly` on purpose
(`src/components/inspector/Inspector.vue:404-429`) and both `ui-011` and `ui-012` say so
explicitly in their own doc comments — `ui-012`'s note in `Inspector.vue:65-75` names the
op's own params as "a different mutation — rewriting a creation record's params and
re-evaluating everything downstream of it... and it belongs with the task that lands
it." This is that task. `TODO/ACCEPTANCE.md` scenario 2 ("Hardware property edit") has
been re-checked **PARTIAL PASS** four times since 2026-09-06 for exactly this reason —
its own log names this as the one remaining blocker on its first `Expect` sentence every
time.

"Done" looks like: place a Cylinder, select it, type `10` into the Diameter field, press
Enter — the mesh visibly narrows to 10 mm while staying centred where it was, the gizmo
and dimension lines resize to match, and the field shows `10.000 mm` afterward. The same
works for Height, for a Cuboid's Size X/Y/Z, and for a Triangle's Side A/B/C. It also
still works after the body has been moved and/or rotated first — editing a param must
not silently snap the body back to the origin.

**Explicit scope cut**: this task covers numeric params only (`ParamField.kind ===
'number' | 'vector'` in `src/core/inspector.js` — diameter, height, size, sides, etc.).
Hardware recipe fields like a bolt's `spec`/`fit` (`kind: 'text'`, effectively an enum)
need a dropdown fed by the recipe's own valid values, not a numeric parser — a
genuinely different control, out of scope here. Scenario 2's spec/fit half stays
partial after this task; only its Diameter/Height-shaped half is being closed.

## Interaction model

- **Precondition** — exactly 1 body selected, same as the existing Transform section,
  and **not** drilled into a sub-part (`body.subPart` set — `ui-016`). A sub-part has no
  record of its own a param edit could target, for the same reason the Transform
  section is already read-only in that state (`Inspector.vue:119-127`); this task
  extends the identical guard to the Parameters section rather than inventing a new one.
- **Additional precondition, specific to this task** — see Proposed fix: if the body's
  lineage (`document.js`'s `supersedes` chain from root to current terminal) contains
  any **non-transform** record — a fillet/chamfer (`ui-027`), or anything else that
  isn't `transform.translate`/`transform.rotate` — the Parameters fields stay read-only
  for that body, because rebuilding the creation record from scratch would silently
  discard that operation's effect. This must fail safe (stay read-only, no silent data
  loss) rather than fail loud after the fact.
- **Trigger** — typing into a Parameters field and pressing Enter or blurring it. This
  is the *exact same mechanism* the Transform section already uses
  (`Inspector.vue`'s `editingField`/`editingSnapshot`/`fieldValue`/`parseNumeric`/
  `onFieldFocus`/`onFieldEnter`) — this task removes `readonly` from the eligible
  Parameters inputs and wires them to a new commit function alongside
  `commitTransformField`, not a parallel implementation of the same live-typing-safe
  field contract.
- **Feedback** — the mesh's shape visibly changes to match the new value; the gizmo and
  dimension lines resize to the new bounds (already automatic — they read the
  evaluated geometry, same as after a Transform edit); the field shows the committed,
  formatted value.
- **Placement** — n/a; operates on existing geometry.
- **Selection response** — this task *is* the missing half of "selecting an object
  shows that object's controls and dimensions" (CLAUDE.md's Interaction Model) — the
  dimensions have been shown, read-only, since `ui-011`; this makes them the controls
  too.
- **Selection count** — exactly 1, unchanged from the existing single-selection
  contract.
- **Small-screen behavior** — same as desktop: reuses the exact Parameters section
  already present and reachable at all three reference widths since `ui-011`; no new
  layout, no new control placement.

## Documentation

- **Page**: `docs/selection-and-inspector.md` — line 109 currently reads "The
  **Parameters** section is still read-only." That line and its surrounding paragraph
  need rewriting now that it isn't, mirroring how the existing Position/Rotation
  walkthrough (lines ~118-145) already documents the Transform fields.
- **Example**: "Drag a Cylinder onto the grid and select it. In the Inspector's
  Parameters section, click into the Diameter box, type `10`, and press Enter — the
  cylinder narrows to 10 mm across, staying centred on the same spot. Diameter is in
  millimetres, same as Position."

## Affected files

- `src/components/inspector/Inspector.vue:389-429` — remove `readonly` from eligible
  Parameters inputs (`number` and `vector` kinds; `text`-kind fields stay read-only per
  the scope cut above); add `onFieldFocus`/commit/`onFieldEnter` bindings mirroring the
  Transform section's fields, keyed by `param-${field.key}` (scalar) or
  `param-${field.key}-${index}` (vector component) so `editingField`'s live-typing
  guard extends to these without collision with `position-*`/`rotation-*` keys.
- `src/core/document.js` — no change expected to the supersession mechanism itself
  (`supersedes` is already generic over the superseding record's op — see its own doc
  comment at the top of the file); this task needs a read-only helper that walks a
  lineage's records between root and terminal and reports whether all of them are
  `transform.*` ops, for the read-only guard above.
- `src/core/transform.js` — reuse `moveToRecord`/`rotateToRecord` unchanged (see
  Proposed fix); no change expected here either.
- `src/core/paramEdit.js` (new, framework-free per CLAUDE.md's Project Structure) — the
  pure builder: given the document, a body's root id, and the edited params, produces
  the new creation record (`op` and `name` copied from the root, `params` = root's
  current params with the edited key(s) overridden, `supersedes` = current terminal
  id).
- `src/composables/useParamCommands.js` (new) — the thin reactive adapter, mirroring
  `useTransformCommands.js`: builds the record via `paramEdit.js`, appends it, then (see
  Proposed fix) appends `moveToRecord`/`rotateToRecord` on top when the body's
  pre-edit position/rotation weren't already the geometry's own default.
- `docs/selection-and-inspector.md` (update).
- `e2e/inspector-param-edit.e2e.js` (new) — see Testing.

## Proposed fix

**The mechanism, reusing what `ui-012` already built rather than inventing a replay
engine:**

1. Before editing, read the body's current absolute `positionMm`/`rotationDeg`
   (already exposed by `useSelectedBody`/`src/core/inspector.js`, the same values the
   Transform fields already display).
2. Append a fresh creation record: same `op` as the body's root record, `params`
   spread from the root's current params with the edited field(s) overridden,
   `supersedes: <current terminal id>`, a new `id`. This is legal under
   `document.js`'s own rule — supersession only requires replacing the lineage's
   *current* terminal, and does not care what op built either record — but this
   record's build ignores any prior geometry entirely (`primitive.cylinder` etc. are
   `operandCount: 0`, per `src/core/kernel/registry.js`), so the fresh geometry lands
   back at the origin, un-rotated.
3. Immediately append `moveToRecord(..., previousPositionMm)` and, if the rotation
   wasn't already `[0,0,0]`, `rotateToRecord(..., previousRotationDeg)` on top,
   superseding the record from step 2 — the exact same absolute-target builders
   `useTransformCommands.js` already calls for a typed Position/Rotation field. This
   restores the pre-edit pose without any new geometry-composition logic: two already-
   proven builders, called back to back.
4. **The read-only guard**: before offering an edit at all, walk the lineage from root
   to current terminal (via whatever internal index `document.js` already keeps,
   `rootById`/`terminalByRoot` per its own doc comment) and confirm every record in
   that walk other than the root itself is a `transform.*` op. If not — a fillet,
   chamfer, or anything else sits in the chain — the Parameters section for that body
   stays exactly as read-only as it is today, with a note analogous to the existing
   sub-part note explaining why (mirrors `ui-016`'s "freeze rather than silently do the
   wrong thing" precedent for the Transform section).

This deliberately does **not** attempt to replay a fillet/chamfer/boolean on top of a
rebuilt creation record — confirm at Step 2 whether that's worth a follow-up TODO once
this lands, rather than scoping it here speculatively.

**Kernel validation errors** (e.g. a Diameter of `0` or negative hits
`requirePositive`'s throw in `registry.js`) need a visible surface, not just a console
error — `ui-027`'s own Proposed fix flags this as new ground for that task; if this task
lands first, it becomes the first place that needs it instead, and `ui-027` should
reference this task's solution rather than building a second one. Whichever task lands
first should say so in a short note in the other's file.

## Effort

L — the field-level UI mechanics are a near-mirror of `ui-012`'s existing Transform
fields (low risk), but the lineage-walk read-only guard and the creation-record-plus-
reapply-pose sequencing are new command-layer behavior with a real failure mode (silent
loss of a downstream op's effect) if the guard is wrong. `model: opus` for that reason —
this is exactly CLAUDE.md's "geometry and numerics... subtle errors here are easy to
write and hard to see" plus "real architectural ambiguity" case, not a mirror of an
already-established pattern.

## Testing

Vitest:
- `src/core/paramEdit.spec.js` (new) — the record-building function: same-op/name
  preserved, edited key(s) overridden, other params untouched, `supersedes` set
  correctly; degenerate cases — editing a param to the same value (should this still
  append? decide and test whichever way, mirroring `translateBy`'s "no-op delta appends
  nothing" convention in `useTransformCommands.js`), editing on a body with no prior
  transform (root === terminal, no reapply step needed), editing on a body with a
  rotate-only or translate-only history.
- `document.spec.js` — extend or add a case: a creation record superseding another
  creation record's terminal (not a `transform.*` superseding a creation record, the
  direction every existing test covers) folds correctly and reports one body.
- Lineage-walk guard: unit-test directly against a hand-built entries array containing
  a `modify.filletRim` record in the chain — confirm the guard reports "not safe to
  edit" rather than silently allowing it.

`*.e2e.js` — required, new control behavior:
- `e2e/inspector-param-edit.e2e.js` (new): place a Cylinder, select it, edit Diameter
  40→10, assert the rendered mesh's X/Y bounding box shrank to ~10mm and Z (height)
  unchanged. A second case: drag the body to move it first, *then* edit Height — assert
  the body's position is unchanged after the edit (this is the specific silent-regression
  risk named in Proposed fix). A third case: place a Cube, select it, edit Size X — assert
  only the X extent changed. A fourth case: fillet a Cube's top face (`ui-027`, once
  landed — or skip/flag this case if `ui-027` hasn't landed yet, since it depends on that
  control existing to set up the precondition), then confirm its Parameters fields are
  now read-only rather than silently discarding the fillet on edit.
- Reference viewports: same as desktop per the Interaction model section above, but per
  `CLAUDE.md`'s Browser Support rule this touches the kernel (a fresh
  `primitive.*`/`hardware.*` build) and the rendered mesh, so run the full engine matrix
  regardless of the viewport claim (see Engines below) — no separate viewport-only run
  needed since layout is unchanged.
- Engines: **all three** (Chromium/Firefox/WebKit) — this is a new path that rebuilds
  kernel geometry from a live user action and re-renders it, the same class of surface
  `ui-027`'s and `ui-016`'s own Testing sections call out for the full matrix.

**Acceptance scenarios**: **`TODO/ACCEPTANCE.md` scenario 2 ("Hardware property edit")**
by name — its own log has recorded this exact gap as PARTIAL PASS across four separate
re-checks since 2026-09-06 ("ui-012 deliberately left the Parameters fields read-only...
belonging to whichever task lands it"). Re-drive it after this lands; expect it to move
from partial toward (but likely not fully to) PASS, since the spec/fit enum-editing half
is explicitly out of this task's scope (see Goal) and the scenario was written around a
Bolt, not a Cylinder. Also re-drive **scenario 1** (two independent primitives), since
this is the second task (after `ui-012`) to add a new kind of superseding record through
`document.js`'s shared append/fold path, and scenario 1 is what would catch a body
silently doubling or disappearing if that path regressed.

**Regression surface**: this task's new record-append path shares `document.js`'s
`append`/fold/`supersedes` machinery with the composite-expansion path
`TODO/done/core-020-composite-absorbs-earlier-bodies.md` fixed (a composite wrongly
absorbing every previously-placed body into its own group). That finding's original
reproduction — place a plate, then a bolt (or two ordinary primitives as a stand-in, per
that scenario's own already-established Cylinder substitution), confirm the second
body's group doesn't absorb the first — should be re-run once this task lands, since it
is the next task to append a new record kind through the same shared path since that fix
closed.
