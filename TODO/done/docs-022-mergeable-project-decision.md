---
title: Decide the document/sync row — a hand-rolled, state-based merge over the NDJSON project file
category: docs
kind: feature
priority: high
model: opus
milestone: M15
depends: []
status: done
---

> **Shipped 2026-10-12.** Written as specified; `document-sync.md` and the CLAUDE.md Stack row
> read Committed, accepted by the user the same day with the version-rule correction confirmed.
> One deviation: `persistence-export.md` never held the literal "Overwrite / Load / Cancel, no
> merge" wording (that is `io-002`'s), so the pointer sits at its hosted 409 paragraph.

## Goal

`CLAUDE.md`'s Stack table still lists "Document model / sync" as **Open**, and two decision
records answer "no CRDT": `docs/decisions/document-sync.md` (deferred) and the "CRDT,
explicitly" section of `docs/decisions/ai-partner.md` (no). On 2026-10-12 the user reversed
that: the AI partner is a second writer on the same file, and a merge is wanted, **without a
CRDT library and without leaving the NDJSON format**. This task writes that decision down, with
the comparison data `CLAUDE.md`'s Library decisions section requires, so every later M15 task
has a contract to build against.

"Done": `docs/decisions/document-sync.md` reads **Committed**, names the design below, carries
the options table and the rejection table, and records the eight answers the user gave; the
other documents that say "no merge, ever" say what is now true; no code has changed.

## Interaction model

Does not apply. A decision record; no control is added or changed.

## Documentation

Does not apply to `docs/` end-user pages. The decision files below are the deliverable.

## The decision to record

**Shape.** A state-based merge (`merge(a, b) → state`, commutative, associative, idempotent)
over the existing snapshot file. Not an operation log: the file stays "ordered record lines
plus one trailing `project-state` line", and record lines stay byte-identical.

**Mechanism.**

- A **replica id** per writer instance (one per open tab, per AI fork, per MCP server process)
  and a **Lamport clock**; a stamp is `[counter, replica]`.
- **Record ids are replica-scoped** so two writers cannot both mint `op-12`.
- Each entry carries merge metadata beside the record (never inside it): a **position key**
  (fractional index) and last-writer-wins stamps for its record, its position, its
  `suppressed` and `leftBroken` flags, and its presence (a **tombstone** is an id plus a stamp;
  the record itself is not kept).
- Order is `(position key, born stamp)`. A reorder is last-writer-wins on the position key, so
  concurrent moves converge and cannot duplicate.
- Document-level values (rollback marker, resolution, standing instructions, build volume, each
  user-part definition) are last-writer-wins registers.
- A **project id** in the state line says two files are copies of one project.

**The user's answers (2026-10-12), each to be recorded as decided:**

| Question | Answer |
|---|---|
| A merged row that no longer builds | **Flagged broken**, never re-parented. The row that folds second is the one flagged; for rows inserted at the same place that is the later-stamped one. It is folded as identity and marked `leftBroken`, the `ui-052` mechanism. |
| Rollback marker | **Shared, last writer wins**, re-expressed as "after row X" instead of a count. |
| Format compatibility | **State-line version 2** once a file carries merge metadata, so an older build refuses it instead of stripping it. See the correction below. |
| Concurrent edits to one row | **Whole record** wins, one stamp per row. |
| Viewport during an AI chat turn | **The live document**, editable; a status chip with a **Watch** toggle shows the AI's fork. |
| File changed on disk (MCP) | **Merged automatically**, then a toast with **Undo merge**. |
| Conflicted rows | The existing **broken chip** with a "conflicts with …" reason, plus a one-line banner. No review dialog. |
| Scope | AI chat turn, MCP project file, hosted git backend, and a **Merge file…** menu action. |

**One correction to record, found while scoping.** The user was offered "a file that has never
been merged keeps version 1". That rule cannot hold: a row removed by Undo needs a tombstone the
moment any other copy might still hold it, and a writer cannot know whether one does. The honest
rule is: **a file a merge-capable build has edited is version 2; a legacy file opened and saved
unchanged stays byte-identical at version 1.** State this plainly and ask the user to confirm it
when the document is presented.

**Still true, and to be said so:** convergence is not replayability. The merged list can
converge and still not fold; the flag-it-broken answer is the whole response to that, and it
removes no work from `ReplayRejection` handling.

## Affected files

- `docs/decisions/document-sync.md` — status **Committed**; new sections for the design, the
  options compared, the rejection table and the answers above. Keep the old text as history.
- `docs/decisions/ai-partner.md` — the "CRDT, explicitly" section gains a dated amendment
  pointing here; Decisions 5 and 6 gain a note that M15 replaces "the human is paused" and
  "no merge, ever". Decision 11 (`ai-012`, uncommitted on 2026-10-12) is left as written.
- `docs/decisions/persistence-export.md` — the hosted "Overwrite / Load / Cancel, no merge"
  answer gains the same pointer.
- `CLAUDE.md` — Stack row to **Committed**; the "No CRDT" bullet under "What's actually decided
  this time"; the AI Partner section's "does **not** support concurrent merge" paragraph; the
  `nextId` single-writer rationale it implies.
- `TODO/README.md` — the `data` category note ("whether this attempt uses one at all is open").
- `TODO/ROADMAP.md` — "Kickoff decisions this roadmap assumes as resolved".

## Proposed fix

Write the options table with real, re-checked numbers (stars, issues, release recency,
maintainers, unpacked size, licence) for the three libraries the 2026-10-06 comparison already
used (Yjs, Automerge, Loro), per "re-run the health check when it's actually about to be
pulled in". Compare four rows:

1. **Hand-rolled state-based merge (chosen).** No dependency; fits a file transport; the order
   and marker semantics are designed for this timeline instead of borrowed.
2. **Three-way merge by record id against a shared base.** Cheaper, no format change, and
   `forkChange` in `src/ai/agent.js` is already most of it. Rejected because the hosted backend
   and Merge file… have no reliable shared base, and it is not associative past two copies.
3. **A CRDT library (Yjs / Automerge / Loro).** Rejected: same convergence-versus-replay gap, a
   document-model rewrite around shared types, tens of megabytes of WASM for two of them, and
   the user's stated preference.
4. **Stay single-writer (the previous answer).** Rejected by the user; keep its reasoning as
   the record of what this costs.

Record the open risks the later tasks must measure: position-key growth under repeated inserts
at one place, file growth from tombstones (no compaction in M15; a reserved row), duplicate
display names ("Cube 3" from both writers), and hostile stamps in an untrusted file.

Present the finished document to the user and record their acceptance, with the date, before
`data-008` starts — as `ai-001` did.

## Effort

M

## Testing

No code. `npm run spdx` and the docs link check must pass.

- Acceptance scenarios this could break: **none** (documentation only).
- Closed findings to re-run: none.
- Engines: n/a.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
