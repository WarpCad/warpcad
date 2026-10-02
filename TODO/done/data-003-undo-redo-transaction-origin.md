---
title: Undo/redo command stack scoped by transaction origin
category: data
kind: feature
priority: medium
model: opus
milestone: M6
depends: [data-002]
status: done
---

> ## What actually shipped, and the design decision behind it
>
> **Placement superseded.** This file's Interaction model guessed "two small buttons in
> the existing toolbar chrome ... alongside `ui-019`'s settings gear". That guess is
> overridden by `docs/decisions/interaction-model-qa.md`'s cross-cutting "document bar"
> decision (commit `e7c1993`), confirmed by the user after this file was written: Undo and
> Redo are document-level and not selection-gated, so they live in the app's existing
> full-width header bar (`.app__bar` in `AppView.vue`), right-aligned, as 44px icon
> buttons. Only Undo and Redo were built here; the History toggle (`ui-032`), File menu
> (`ui-033`/`ui-034`) and save-status chip (`io-001`) are the rest of that cluster and are
> left to their own tasks. `AppView.vue` gained a right-aligned `document-bar` wrapper
> sized so those three land beside these two without moving them.
>
> **The design question the file left open — inverse-append vs truncation — resolved as
> neither, but much closer to truncation: remove the step and re-derive.** The file
> recommended investigating inverse-append first, *and* required checking it against
> `data-004`. That check is what decided it, on three grounds:
>
> 1. **The confirmed answers rule inverse-append out.** Section 18 states "nothing in the
>    timeline removes history; **only Undo removes a recent step**", and its worked example
>    is Undo *removing* an inserted row. An inverse-append would put two rows in `ui-032`'s
>    History panel for one Undo and two more for one Redo — the opposite of what the user
>    confirmed.
> 2. **There is no honest inverse for a `consumes` record.** Undoing a boolean must
>    un-retire two lineages, and nothing that can be *appended* does that: `mergedInto` is
>    set by the consuming record's mere existence. An "anti-record" would be a second,
>    parallel history mechanism invented purely to avoid touching the first.
> 3. **Remove-and-rebuild composes with `data-004` instead of fighting it.** Undo is
>    `splice`-out + re-fold; `data-004`'s insert-at-the-marker is `splice`-in + re-fold; its
>    mid-history param edit is `splice`-replace + re-fold. **Redo is literally an
>    insert-at-index** — the primitive section 18 names as a fixed requirement on
>    `data-004` — so that primitive is now built, exercised and proven by every redo, rather
>    than waiting to be invented. The internal `rebuildFrom(nextEntries)` is the one
>    mutation primitive all four operations sit on; `data-004` should widen it, not replace
>    it.
>
> What makes it safe against the lineage machinery the file worried about is that the
> rebuild re-runs **`ingest`, the same function `append` uses**, over the remaining entries
> in order. There is no second implementation of `supersedes`/`consumes`/`mergedInto`/root
> ordering to drift out of step, which is the same correctness-by-construction argument
> `data-004`'s own Proposed fix makes for a full re-fold. A rebuild that throws restores the
> captured indexes and rethrows, so a refused undo changes nothing — the atomic contract
> section 18 requires of a broken roll-forward, also already built.
>
> **Origin scoping** is a one-line consequence of that shape: only an `origin: 'local'`
> step is pushed onto the undo stack, so a programmatic or remote record stays in
> `entries` and in `bodies()` but is unreachable by Undo. Because removing a record that a
> later record still references would leave a hole, `undo` refuses **by name** when any
> other entry still points at the step being taken back (`referencedIdsOf` reads
> `supersedes`, `consumes`, `target` and `operands`, matching how `kernel/index.js` builds
> `inputRefs`) — section 19's point 4. Only a new *local* mutation clears redo, so a remote
> arrival cannot silently eat the user's redo.
>
> **Also decided here, as the file asked:** *one gesture = one step* needed a plural
> primitive, so `appendAll` is now the primitive and `append` the singular case of it —
> a composite placement's two records (`ui-030`) are one press of Undo, not two.
> *Selection restoration* is real: the store parks the pre-mutation selection on the step
> as opaque `meta` (the core stays framework-free), undo restores it filtered to bodies
> that still exist, and redo instead selects the step's own lineage roots, so redoing a
> placement leaves the placed body selected exactly as placing it did. Undo history does
> **not** survive a reload or a seeded load — `createDocument` clears the stacks after its
> seed loop, per section 19.
>
> **Two knock-on changes outside the Affected files list.** (1) `src/styles/tokens.css`
> gained a `--danger` token (dark + light); the file had no error colour and the refusal
> message needed one rather than a hardcoded literal. (2) `e2e/snap-align-operation.e2e.js`
> has two fixture-sanity guards lowered from `> 5` to `> 4`: the 44px header buttons grow
> the phone header from ~30px to 53px, which shifts the phone camera's projection enough
> that that fixture's X separation went from 5.61 mm to 4.69 mm. The guards protect an
> assertion with a 0.05 mm tolerance, so 4.69 mm is still ~90x the margin needed; the drop
> fractions were deliberately *not* re-tuned because seven other tests in that file share
> them. Both changes are recorded in `TODO/VERIFY.md`.
>
> **Not built, deliberately:** the "disabled while previewing" gate (section 19) has no
> preview state to read until `ui-032` exists — `HistoryControls.vue` says so at the point
> the condition belongs. The refusal live region is wired but unreachable in the app today
> (nothing produces a non-local record until MCP or `io-002`); `ui-033`'s shared
> `save-status` chip should absorb it.


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

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
