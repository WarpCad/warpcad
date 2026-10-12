---
title: The document carries merge state — every mutation stamps, removal is a tombstone, and a merge folds
category: data
kind: feature
priority: high
model: opus
milestone: M15
depends: [data-009]
status: done
---

> **As shipped (2026-10-12):** all eight items landed, with one deliberate deviation from item 5: the `leftBroken` conflict flag is *derived* at merge time rather than written as a stamped `merge`-origin register, because a stamped flag made the result depend on merge order (a later merge that repairs the row left a stale flag on one path). It is set on the entry so the fold, save and reload all see it, and re-derived by every `mergeFrom`. Metadata lives in a side table keyed by record id, stamps use their own Lamport clock, and a transaction is stamped by one before/after diff. Deferred: Redo of a `revise` step that adds or removes rows after a merge still re-inserts at the old index; `projectId` stays `null` (`data-011`). The store does not yet show the `dropped`/`note` an undo returns after a merge (`ui-062`).

## Goal

`src/core/document.js` becomes a replica: every mutation it already performs also records the
metadata `data-009`'s merge needs, and it gains one new entry point, `mergeFrom(state)`, that
merges another replica's state in and re-folds. Nothing calls `mergeFrom` from the app yet;
`ui-062`, `io-010`, `io-011` and `ai-017` do.

"Done": two documents seeded from one file, edited independently through the ordinary command
layer and merged into each other in either order, end with identical `timeline()`,
`bodies()` and serialised state; a merged row that cannot build is flagged, not fatal; and with
no merge ever performed, every existing behaviour and every existing spec is unchanged.

## Interaction model

Does not apply — `core` only, no control. The conflict wording this task produces
(`TimelineRow.broken`) is displayed by `ui-062`.

## Documentation

Does not apply. No user-visible surface until `ui-062`.

## Affected files

- `src/core/document.js` — `DocumentEntry` metadata, every mutator, the rollback marker,
  `HistoryStep`, `captureState`/`restoreState`, new `mergeState()` and `mergeFrom()`
- `src/core/origin.js` — a `merge` origin for the flag a merge sets
- `src/core/documentMerge.spec.js` (new), plus the existing history and batch specs

## Proposed fix

**1. Metadata on entries.** Each entry carries `born`, `pos`, and stamps for its record and its
two flags, beside the record (as `origin` and `intent` are), never inside it. A document that
has never been touched by this build derives them deterministically from the file: position
keys from row index, every stamp zero. Two builds upgrading the same legacy file must derive
identical metadata, or they will not merge; assert it.

**2. Every mutator stamps.** `append`, `appendAll`, `insertAt`, `replaceRecord`,
`reviseRecords`, `setSuppressed`, `moveStep`, `removeRecords`, `deleteBodies`, `removePart`,
`rollBackTo`, `rollForward`, `setResolution`, `setStandingInstructions`, `setBuildVolume`, and
user-part adoption. One clock tick per transaction, so a batch shares a stamp. List the
mutators in a table in the module note with the register each writes; a mutator missing from
the table is the silent failure here.

**3. Removal is a tombstone.** Undo, **Undo AI turn** and `removeRecords` still splice the entry
out of `entries` (the fold and every reader are unchanged), and additionally record
`dead[id] = stamp`. Redo and the re-insert half of Undo AI turn put the entry back with a fresh
stamp that beats the tombstone. The record is not kept in the tombstone; the undo stack already
holds it.

**4. The rollback marker becomes an anchor.** Internally "after row id X" with a stamp;
`rollbackAt()` still returns the count every consumer reads, derived from the anchor.
`HistoryStep.index` (where Redo re-inserts) becomes a position key for the same reason: an index
is meaningless after a merge inserted rows before it.

**5. `mergeState()`** returns this document's `MergeState`. **`mergeFrom(state, transaction)`**:

- refuses an `unrelated` state by name (callers decide whether to offer anything else);
- computes `mergeStates(own, theirs)`, then re-folds through the existing `rebuildFrom` with
  `tolerateAll`, so there is still exactly one implementation of lineage bookkeeping;
- for every row that failed in that fold, sets `leftBroken` as an ordinary stamped write with
  origin `merge`. This is the `docs-022` answer: flagged, never re-parented. A flagged row folds
  as identity exactly as `ui-052` defined, so later rows of its lineage still build;
- returns `{ scene, change, conflicts }`, where `change` is `diffStates` of before and after and
  `conflicts` lists each flagged row with the row it lost to;
- is atomic: any throw restores the captured state, as `rebuildFrom` already guarantees;
- never pushes onto the local undo or redo stack (origin scoping), and bumps `stateToken`, so
  `core-030`'s restore path correctly falls back to a re-fold for steps older than the merge.

**6. Conflict reasons.** A flagged row whose `supersedes`/`consumes` target is no longer its
lineage's terminal gets the reason `conflicts with step N (<label>, <origin>)`, naming the row
that advanced the lineage. It is derived at fold time from the log, so it survives a reload
with no extra persisted field. A row that fails for a missing reference keeps the existing
`needs <name>` reason. Two reason shapes become three; update the `BrokenStep` JSDoc.

**7. Local undo after a merge.** `undo` already refuses by name when a later row from another
origin depends on the step. Keep that, and add the case a merge creates: the step's rows were
removed or revised by the other side. Undo then drops the step from the stack with a returned
note instead of resurrecting or half-applying it. Decide the exact wording here and expose it
for the store to show.

**8. What does not change.** With no `mergeFrom` call, `entries`, `timeline()`, `bodies()`,
`version` bumps and every refusal are exactly as before. A local edit that breaks a row is
still an atomic rejection; tolerance applies only to a merge.

## Effort

L

## Testing

- Unit (`documentMerge.spec.js`, real kernel registry): from one seed, the named conflicts —
  human moves Cube 1 while the other side fillets it; human unions A+B while the other side
  moves A; both define a variable called `wall`; one side deletes a body the other recolours;
  one side suppresses a row the other edits; both reorder (`U,V,W` with `W` needing `U`, the
  case where two legal moves combine into an illegal order); both move the marker. For each:
  merge in both orders, assert identical `timeline()` and serialised state, and assert which row
  is flagged and its reason text.
- **Model-based property suite**: random command-layer scripts on three documents, merged in
  every order; compare `timeline()`, body count and serialised state. Seeded, with the seed in
  the failure message.
- Equivalence: `historyRestore.spec.js`'s always-fold twin and `foldReuse.spec.js` extended with
  a merge between steps; a merged document equals a fresh document loaded from its own
  serialised state.
- Atomicity: a `mergeFrom` that throws mid-fold leaves `entries`, the marker, both undo stacks
  and `stateToken` untouched.
- Performance (`.claude/prompts/perf-benchmark.md`): `mergeFrom` on `data-004`'s 200-record
  scene and the 24-body composite scene, with and without the fold cache. Record medians; the
  bar is the same as a row action (a deliberate action, not the 16 ms frame budget). Also
  measure the per-mutation cost of stamping; it must not be visible in `core-031`'s numbers.
- Acceptance scenarios this could break: **1, 4, 10, 12, 14, 15, 21** (every one that writes,
  undoes or reloads). Re-drive 10, 12 and 14.
- Closed findings to re-run: `data-003` (origin-scoped undo, refusal by name), `data-004`
  (rollback, insert at the marker, the tail shadow check), `core-030` (restore versus re-fold),
  `core-056` (mixed batch is one Undo step), `ui-052` (left-broken rows fold as identity),
  `ai-006` (Undo AI turn leaves the local stack alone), `data-007` (snapped dependents follow a
  resize).
- Engines: Chromium only (plain Node).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
