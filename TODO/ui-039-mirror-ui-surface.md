---
title: UI surface for transform.mirror
category: ui
kind: feature
priority: medium
model: sonnet
milestone: M7
depends: [core-028, render-001]
status: open
---

## Goal

`core-028` builds `transform.mirror` at the kernel level, deliberately deferring its
document-layer selection-response decision (does the new mirrored body become selected
on commit?) to be answered explicitly in that task's own retirement note. This task is
the control, following whichever document semantics `core-028` actually resolves — most
likely a new body appearing alongside the original, per that row's own note. "Done"
looks like: select a body, trigger Mirror, pick an axis, commit — a second, reflected
body appears in the scene while the original remains exactly where it was.

## Interaction model

- **Precondition** — exactly 1 body selected, gated the same as every other exactly-1
  Operation (`OperationsToolbar.vue`'s `isExactOneOp`, `:579`) — even though the result
  is creation-shaped (two bodies afterward), the *trigger* requires an existing
  selection to act on, so it belongs on the Operations toolbar alongside Fillet/
  Enlarge/Bisect, not the Library panel, per `CLAUDE.md`'s creation-vs-operation split
  applied to what the control *requires*, not what it *produces*.
- **Trigger** — a new Operations-toolbar button, opening a popover with an axis
  choice (X/Y/Z) and, per `core-028`'s own default, an optional point override
  (defaulting to the body's own centre, matching the kernel's default) — mirrors the
  existing Snap/Align/Fillet/Bisect popover mechanism exactly.
- **Feedback** — **read `core-028`'s retirement note before writing this section for
  real** — if the new mirrored body becomes selected on commit (the recommended
  default, matching every creation-shaped op's existing convention), the gizmo/
  dimension lines retarget to it; the original stays visible, deselected, at its
  unchanged position. If `core-028` decided otherwise, this bullet must be rewritten to
  match, not left describing the recommendation as if it were the confirmed answer.
- **Placement** — n/a in the drag-to-place sense (this isn't a Library-panel creation),
  but the *result* is a new body — confirm it appears at a geometrically sensible
  location (the mirrored position) rather than needing a separate placement step, since
  `CLAUDE.md`'s placement rule is about *where new geometry appears*, and a mirror's
  answer to "where" is "wherever the math puts it," which is itself the whole point of
  the operation.
- **Selection response** — see Feedback above.
- **Selection count** — exactly 1, unchanged.
- **Small-screen behavior** — same phone/tablet popover-teleport pattern as every other
  toolbar popover.

## Documentation

- **Page** — new `docs/mirror.md`, or a section in an existing page if Step 2 finds a
  closer fit (e.g. alongside `docs/resize-bisect.md` if the popover mechanism reuse
  is judged close enough to warrant sharing a page — decide and state which).
- **Example**: "Select a body, click Mirror on the Operations toolbar, choose an axis
  (e.g. Y), and confirm — a new, reflected copy appears on the opposite side of that
  axis. The original body is untouched and stays selected... or the new one becomes
  selected, exactly per whichever `core-028` confirmed — update this line to match."

## Affected files

- `src/components/viewport/OperationsToolbar.vue` — new button + popover, following
  the established pattern; the commit function appends a `transform.mirror` record
  per `core-028`'s resolved document-layer shape (a **new creation record**, not a
  `supersedes` on the original — the toolbar's other four exactly-1 controls
  (`ui-027`/`ui-028`) are all `supersedes`-based, so this is the toolbar's **first**
  exactly-1 control whose commit produces a second body rather than mutating one in
  place — worth a short comment noting the deliberate divergence).
- `docs/mirror.md` (or extended existing page).

## Proposed fix

Pure UI wiring against `core-028`'s resolved kernel op and document semantics, mirroring
the established popover pattern. The one real risk: **`core-028`'s document semantics
must actually be resolved and stable before this task starts** — if it isn't, Step 2
should stop and flag it rather than guess at the missing half, per `TODO/README.md`'s
"a `depends` list is load-bearing" rule.

## Effort

M — UI wiring against an already-resolved kernel op and document decision, reusing an
established popover pattern; the one genuinely new piece (a toolbar commit that produces
a second body rather than mutating one) is well-scoped by `core-028`'s own note.
`model: sonnet` per `TODO/README.md`'s guidance that UI wiring mirroring an established
pattern stays sonnet.

## Testing

- Extend `OperationsToolbar.spec.js`: Mirror commits a `transform.mirror` record with
  the chosen axis; body count goes from 1 to 2 after commit (the specific assertion
  distinguishing this from every other exactly-1 control on this toolbar, which all
  keep body count at 1).
- New `e2e/mirror-operation.e2e.js` (required, new reachable control) — place a cube
  off-centre, select it, mirror about Y, confirm two bodies exist afterward with the
  new one's position correctly reflected and the original's position byte-identical to
  before the commit. Runs at all three reference viewports and all three engines
  (rebuilds kernel geometry and re-renders).
- **`TODO/ACCEPTANCE.md`**: per `ACCEPTANCE.md`'s own new-capability-class rule, this
  task should add a **new scenario** (the next available number) modeled on this
  control specifically, not fold into an existing one — mirror is a genuinely new
  capability class (the first creation-shaped exactly-1 Operation), the same bar color
  (scenario 13) cleared. **Scenario 1** — re-drive, since this is a new record kind on
  the shared `document.bodies()` fold.
- **Closed-finding regression surface**: `core-020`'s repro, re-run against a mirrored
  composite body specifically (mirror a `hardware.bolt`, confirm the new copy holds
  only its own parts and doesn't absorb the original or any unrelated body).
