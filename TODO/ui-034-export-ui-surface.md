---
title: Export UI surface — trigger, format picker, and scope choice
category: ui
kind: feature
priority: medium
model: sonnet
milestone: M6
depends: [io-003]
status: open
---

## Goal

`io-003` builds the STL/OBJ/glTF serialization mechanism. This task is its control
surface: a trigger, a format picker, and the selection-vs-whole-scene choice, per
`data-002`'s confirmed answers. "Done" looks like: select a body (or nothing), trigger
Export, pick a format, and a file downloads — matching `TODO/ACCEPTANCE.md` scenario
11's concrete bar exactly.

## Interaction model

- **Precondition** — none in the disabled/enabled sense (0 or 1+ selected are both
  valid, with different scope per `io-003`'s Goal); an Operation-shaped control
  regardless (it acts on existing geometry, never creates any), so it belongs on the
  Operations toolbar alongside Union/Subtract/Fillet/etc., not the Library panel.
- **Trigger** — a new Operations-toolbar button (per `data-002`'s confirmed answer),
  opening a small format-picker popover (STL/OBJ/glTF) mirroring the existing
  Snap/Align/Fillet/Bisect popover mechanism.
- **Feedback** — a browser file download; the popover closes on commit, same as every
  other toolbar popover.
- **Placement** — n/a.
- **Selection response** — n/a beyond scope.
- **Selection count** — **0 or more** — genuinely different from every other toolbar
  control, which are gated at exactly-1 or 2+/2. This is worth naming explicitly as a
  new gating shape `OperationsToolbar.vue`'s existing `exactOneDisabled`/`isExactOneOp`
  computed properties don't cover — Export is **never disabled** by selection count,
  only its *scope* changes.
- **Small-screen behavior** — same phone/tablet popover-teleport pattern as every other
  toolbar popover.

## Documentation

- **Page** — `docs/export.md` (created by `io-003`; this task adds the control's
  walkthrough).
- **Example**: "Select a body (or select nothing to export everything), click Export on
  the Operations toolbar, choose a format, and the file downloads immediately."

## Affected files

- `src/components/viewport/OperationsToolbar.vue` — a new, **never-disabled** button
  and popover, alongside the existing exactly-1/2+ gated ones — the toolbar's first
  control with this gating shape, worth a short comment noting the deliberate
  divergence from the existing `exactOneDisabled` pattern so a future reader doesn't
  assume it's a bug.
- Wiring to `io-003`'s exported export function.
- `docs/export.md`.

## Proposed fix

Pure UI wiring once `io-003` exists, mirroring the established popover pattern. The one
real design note: adding a sixth-or-so button to an already width-constrained toolbar —
`ui-015`'s and `ui-027`'s own retirement notes both name real cross-engine toolbar-width
regressions found only by hand-driving at narrow viewports (Firefox's wider button-label
rendering overlapping the orientation gizmo). Budget real driving time for this at
tablet width specifically, not just trust the existing `max-width`/wrap CSS to absorb a
new button without checking.

## Effort

M — UI wiring against an already-built serialization mechanism, reusing the established
popover pattern, with one real named cross-engine layout risk to verify by hand rather
than assume away. `model: sonnet`.

## Testing

- Extend `OperationsToolbar.spec.js`: the Export button is never disabled regardless of
  selection count (0, 1, 2+); the popover's format choice is passed correctly to the
  export call.
- New `e2e/export-ui.e2e.js` (required, new reachable control) — place two solids,
  union them, select the result, trigger Export, choose STL, confirm a file downloads
  (Playwright's download interception). Runs at all three reference viewports (toolbar-
  width risk named above, specifically re-check tablet per the cited precedent) and all
  three engines (touches the rendered/kernel geometry export path).
- **`TODO/ACCEPTANCE.md` scenario 11** by name, in full, per its own Steps — this
  control is the scenario's explicit trigger.
- **Closed-finding regression surface**: the toolbar-width-vs-orientation-gizmo defect
  `ui-015` found and `ui-027` re-confirmed the fix held for — re-run that same check
  (a button-count increase on this toolbar, driven by hand at tablet width in Firefox)
  since this task is the next one to add a button to the same toolbar.
