---
title: Undo/redo command stack scoped by transaction origin
category: data
kind: feature
priority: medium
model: opus
milestone: M6
depends: [data-002]
status: open
---

## Goal

`CLAUDE.md`'s Architecture section has required this since before M0: "Undo/redo is
scoped by transaction origin, so remote or programmatic edits never land in the local
user's own undo stack." `ui-012`'s own retirement note built the `supersedes` lineage
index specifically to support this ("the mechanism a later task needs") and named it as
deferred rather than built. No task through M5 built it. "Done" looks like: every
document mutation the local user makes through the command layer is undoable (Ctrl+Z /
an on-screen control, per `data-002`'s confirmed answer) and redoable, while a
programmatic mutation — from the MCP surface once it exists, or from a hosted-backend
sync pull (`io-002`) — never appears in, or corrupts, the local user's own undo stack.

## Interaction model

- **Precondition** — nothing selected; undo/redo act on document history, not a
  selection state.
- **Trigger** — per `data-002`'s confirmed answer: at minimum a keyboard shortcut
  (Ctrl+Z / Ctrl+Shift+Z or platform equivalent), plus a real on-screen control per
  `CLAUDE.md`'s touch-device rule (keyboard-only fails on a phone/tablet with no
  keyboard) — likely two small buttons in the existing toolbar chrome, enabled/disabled
  based on stack depth.
- **Feedback** — the mesh visibly reverts/reapplies; the affected control (undo or
  redo) disables when its stack is empty (mirroring the existing exactly-1/2+ disabled-
  state convention `OperationsToolbar.vue` already establishes for selection-count
  gating — this is a different gating dimension, stack depth, but the same UI idiom).
- **Placement** — n/a.
- **Selection response** — n/a directly, though undoing a transform/param-edit should
  restore whatever was selected at that point if reasonably possible — a UX nicety to
  decide and state explicitly, not silently drop.
- **Selection count** — n/a.
- **Small-screen behavior** — the on-screen undo/redo controls must be reachable at
  390px; likely live in the existing top toolbar area alongside `ui-019`'s settings
  gear, per that control's own established placement pattern for a global (not
  selection-gated) action.

## Documentation

- **Page** — new `docs/undo-redo.md`, or a section in an existing page if one already
  covers general document-editing conventions (check at Step 2 before creating a new
  page, per `CLAUDE.md`'s convention).
- **Example**: "Place a cube, move it, then press Ctrl+Z (or tap the Undo button) — the
  cube returns to its previous position. Press Ctrl+Shift+Z to redo the move."

## Affected files

- `src/core/document.js` — the `supersedes`/`consumes` lineage machinery already
  exists; this task needs a **transaction-origin field** on appended records (or on the
  append call itself) distinguishing `'local'` from e.g. `'remote'`/`'programmatic'`,
  and an undo/redo stack that only ever pops/pushes `'local'`-origin transactions.
- `src/stores/document.js` (or a new `src/stores/history.js`) — the reactive undo/redo
  stack the UI reads to enable/disable its controls.
- New UI control(s) in the existing toolbar chrome (`NavigationChrome.vue` or a new
  small component per the Component Categories' `layout/` bucket).
- `docs/undo-redo.md` (or extended existing page).

## Proposed fix

**The real design question is what "undo" means for this document model, and it needs
investigation before coding**: this is not a mutable-state undo stack (there is no
mutation, only append), so undoing likely means **appending an inverse record** (or
truncating the append log back to a prior point and re-deriving `bodies()`), not
literally popping history off `entries`. Truncation is simpler but interacts badly with
`consumes`/`supersedes` lineage bookkeeping if anything downstream referenced a
truncated record's id; an inverse-append keeps the full history (useful for `ui-032`'s
timeline panel, which wants to *see* every step, not have some silently vanish) but
needs a well-defined inverse for every op kind, including the just-invented
`consumes`-based booleans. **Recommend investigating the inverse-append approach first**
since it composes with the timeline panel's needs, but this is exactly the kind of
"real architectural ambiguity" `TODO/README.md` names for `model: opus` — do not treat
the recommendation as settled without checking it against `data-004`'s mid-history-edit
needs too, since the two tasks' data models must agree.

## Effort

L — a correctness-critical document-model feature with no existing precedent in this
codebase (append-only logs and CRDTs each have well-known undo patterns, but this
project uses neither), real architectural ambiguity (see Proposed fix), and direct
interaction with `data-004`'s mid-history-edit mechanism that must be designed
consistently, not independently. `model: opus` per `TODO/README.md`'s guidance on real
architectural ambiguity and geometry/numerics-adjacent correctness risk.

## Testing

- `document.spec.js` (or new `history.spec.js`): appending a local transform then
  undoing it restores the pre-transform position exactly (`toBeCloseTo`, per numerical-
  code convention); a programmatic-origin append is never visible to undo (construct a
  document with one local and one programmatic record, confirm undo only ever touches
  the local one); redo after undo reapplies exactly, including for a `consumes`-based
  boolean (degenerate case: undo a boolean, confirm both original operands reappear
  correctly, not merged or missing).
- New `e2e/undo-redo.e2e.js` (required — this is a new user-visible control per
  `CLAUDE.md`'s reachability gate): place a cube, move it via the gizmo, press the
  keyboard shortcut, confirm the mesh reverts; press the on-screen redo control, confirm
  it reapplies. Runs at all three reference viewports (a new toolbar control affects
  layout) and all three engines (this touches the rendered mesh and the kernel fold,
  per `CLAUDE.md`'s Browser Support rule).
- **`TODO/ACCEPTANCE.md` scenario 12**'s "nothing silently reverts" half — this is the
  scenario this task is named against directly; drive it once `data-004` also exists
  (undo/redo and mid-history-edit are meant to compose). **Scenario 1** — re-drive,
  since undo/redo touches `document.bodies()`'s rendering path for every body kind.
- **Closed-finding regression surface**: `core-020`'s repro, re-run after an undo/redo
  cycle specifically (undo a composite placement, confirm no earlier body was absorbed
  either before or after the undo).
