---
title: "Timeline panel: list, preview, edit, suppress, reorder, and roll back history entries"
category: ui
kind: feature
priority: medium
model: opus
milestone: M6
depends: [data-004]
status: open
---

## Goal

`src/components/timeline/`'s first task — the category has existed in `CLAUDE.md`'s
Project Structure and Component Categories since before M0 ("the feature history list,
rollback, suppress, reorder") with nothing built against it. "Done" looks like: a panel
listing every entry in the document's history, in order; selecting one previews the
document as it stood at that point; editing a step's params in place (wired to
`data-004`'s replay mechanism) updates the whole downstream document; suppressing a
step disables it without deleting it; reordering and rolling back are both real,
reversible operations.

**Scope note**: this is the largest single UI task named in this roadmap's M5-M7
reservation — five distinct interactions (list/preview, edit, suppress, reorder,
rollback) in one new panel category. If Step 2's investigation shows this doesn't fit
one task's Effort budget cleanly, say so explicitly and split by interaction (e.g.
list+preview+edit as this task, suppress+reorder+rollback as a follow-on) rather than
silently under-scoping — the exact discipline `CLAUDE.md`'s reachability rule asks for.

## Interaction model

- **Precondition** — nothing selected in the 3D viewport is required; the panel itself
  is always available once a document has any history (which is always, per this
  project's replay-log model).
- **Trigger** — per `data-002`'s confirmed answer: a toggle or persistent panel,
  following `CLAUDE.md`'s Component Categories placement (`timeline/`) and its
  Responsive Layout rule that a persistent side panel is laptop-only — at phone/tablet
  width this likely needs the same overlay/bottom-sheet treatment the AI chat panel
  already uses, per `CLAUDE.md`'s explicit phone/tablet overlay rule, rather than a
  third persistent side-by-side panel competing with the Inspector and Library sheets.
- **Feedback**:
  - **Select-to-preview**: the viewport shows the document as evaluated up to that
    point (not the current full document) — needs a clear visual indicator that the
    viewport is in a "previewing a past state" mode, not live-editable, to avoid the
    exact confusion class `SECOND-ATTEMPT.md` warns about (a control that looks live
    but silently isn't).
  - **Edit-in-place**: per `data-004`'s contract, either the edit succeeds (mesh
    updates for every downstream-affected body) or a named downstream entry is reported
    as broken — this panel is where that report must surface, not swallowed.
  - **Suppress**: the entry shows a visibly disabled/greyed state in the list; the
    document re-evaluates as if that step didn't happen (needs its own document-model
    support — check whether `data-004`'s mechanism already covers "treat as absent" or
    whether this task needs to extend it).
  - **Reorder**: drag-to-reorder in the list (or up/down controls, for a11y and touch
    parity) with the same "does the new order stay valid" question `data-004`'s
    downstream-validity contract already has to answer for edits.
  - **Rollback**: sets the document's effective terminal to a past point — needs a
    clear, named distinction from "delete everything after" (rollback is likely
    non-destructive, i.e. it doesn't discard the later entries, only stops evaluating
    past the rollback point, so un-rolling-back is possible) — state this explicitly.
- **Placement** — n/a.
- **Selection response** — selecting a timeline entry is itself a selection-shaped
  trigger with its own feedback contract (the preview above), distinct from selecting a
  body in the 3D viewport — name this distinction clearly so it isn't conflated with
  `ui-011`'s existing selection mechanism.
- **Selection count** — n/a (a timeline entry selection, not a body selection).
- **Small-screen behavior** — real design work, not "same as desktop": per
  `CLAUDE.md`'s phone-first rule, design this panel's phone layout first, not shrunk
  down from a desktop list-with-inline-controls design.

## Documentation

- **Page** — new `docs/timeline.md`.
- **Example**: "Open the Timeline panel (see trigger, per `data-002`). Click any past
  step to preview the document as it stood then. To change a step, click Edit, change
  its value, and confirm — every step after it replays automatically. To temporarily
  remove a step's effect without deleting it, click Suppress."

## Affected files

- `src/components/timeline/` (new directory, this task's first content) — the panel
  component(s): a list view, an entry row (with edit/suppress/reorder controls), and
  the preview-mode viewport indicator.
- `src/composables/useTimelineCommands.js` (new) — the reactive adapter calling into
  `data-004`'s replay mechanism and `data-003`'s undo/redo-adjacent state, mirroring
  the existing `useTransformCommands.js`/`useParamCommands.js` pattern.
- `src/stores/document.js` (or a new `src/stores/timeline.js`) — preview-mode state
  (which point in history is being previewed, if any) as UI-only reactive state per
  `CLAUDE.md`'s Project Structure ("`src/stores/` — UI state only... Document state...
  never mirrored into Pinia").
- `docs/timeline.md`.

## Proposed fix

Investigate at Step 2 whether "suppress" and "reorder" already have a natural document-
model expression once `data-004`'s replay-from-point mechanism exists (a suppressed
entry might just be "replay with this record's build treated as a no-op / identity,"
and a reorder might be "replay with `entries`' order changed before the fold, subject to
the same dependency-validity check an edit needs") — if so, this task is UI wiring
against `data-004`'s single mechanism used three ways, not three separate document-model
features. If investigation shows they need genuinely different document-model support,
name that explicitly and scope it as part of this task's own Effort rather than
silently assume `data-004` already covers it.

## Effort

L — first task in a new component category, five distinct interactions, and direct
dependence on `data-003`/`data-004`'s not-yet-built mechanisms whose exact contracts
this task is the first real consumer of (a common place for a leaky abstraction to
surface, per this project's own repeated experience of a "no UI exists yet" task's
design assumptions not surviving a real drive — `ui-030`'s composite-placement decision
is the most recent example). `model: opus` per `TODO/README.md`'s guidance on large
multi-module orchestration owning real lifecycle/state.

## Testing

- New `.spec.js` coverage for `useTimelineCommands.js` and any new pure document-model
  helpers this task adds beyond `data-004`'s own.
- New `e2e/timeline-panel.e2e.js` (required, new panel) — place a cube, chamfer it,
  place a sphere, open the timeline, edit the chamfer's radius, confirm the cube updates
  and the sphere doesn't move; suppress the chamfer entirely, confirm the cube reverts
  to unchamfered; re-enable it, confirm it returns. Runs at all three reference
  viewports (a new panel is exactly `CLAUDE.md`'s layout/panel/overlay case) and, since
  it re-evaluates kernel geometry on every edit, all three engines.
- **`TODO/ACCEPTANCE.md` scenario 12** by name, in full, per its own Steps — this panel
  is the scenario's whole trigger mechanism. **Scenario 1** — re-drive, since a
  suppress/rollback/reorder is a new way for `document.bodies()`'s reported set to
  change shape.
- **Closed-finding regression surface**: `core-020`'s repro, re-run after a suppress/
  reorder specifically (the ordering-sensitive absorption bug that finding fixed is
  exactly the kind of thing a reorder feature could reintroduce if the replay doesn't
  re-run `evaluate()`'s composite-expansion branch identically to the original fold).
