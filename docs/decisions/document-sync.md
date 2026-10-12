# Document model / sync: a hand-rolled, state-based merge over the NDJSON project file

Status: **Committed** (`TODO/docs-022`, written and accepted 2026-10-12).

Accepted by the user: 2026-10-12, including the version-rule correction below.

This replaces the 2026-09 deferral ("no CRDT for v1"), which is kept unchanged under
[History](#history-the-2026-09-deferral-superseded) below as the record of what
single-writer cost and why it was the answer at the time. `data-008` does not start until
this document is accepted, as `ai-001` gated `ai-002`.

## Why this row is being decided now

On 2026-10-12 the user reversed "no merge": **the AI partner is a second user of the same
file**, and its edits should merge with the human's instead of either side being paused or
thrown away. Every earlier answer kept the log single-writer by construction, and each one
discards work:

- an in-app AI turn pauses the human (`ai-partner.md` Decision 5);
- a file the MCP server changed on disk asks **Reload / Overwrite the file / Cancel**
  (Decision 6, `ai-009`);
- a stale hosted save asks Overwrite / Load / Cancel (`io-002`).

The user asked for this **without a CRDT library and without leaving the NDJSON format**.

## The decision

### Shape

A **state-based merge**: `merge(a, b) → state`, commutative, associative and idempotent, over
the existing snapshot file. It is **not an operation log**. The file stays "ordered record
lines plus one trailing `project-state` line", and **record lines stay byte-identical** to what
the command layer appended. All merge metadata lives in the state line (`data-011` owns the
encoding).

### Mechanism

- **Replica id and Lamport clock.** Every writer instance has a replica id: one per open tab,
  per AI fork, per MCP server process. A stamp is `[counter, replica]`; stamps are totally
  ordered by counter, then replica (`data-008`).
- **Record ids are replica-scoped**, so two writers cannot both mint `op-12`. Ids already in a
  file are never rewritten (`data-008`).
- **Per-entry merge metadata, beside the record, never inside it:**
  - a **position key** (a fractional index);
  - last-writer-wins stamps for the **record**, its **position**, its `suppressed` flag, its
    `leftBroken` flag, and its **presence**;
  - a **tombstone** for a removed row is its id plus a stamp. The record itself is not kept.
- **Order** is `(position key, born stamp)`. A reorder is last-writer-wins on the position key,
  so concurrent moves converge and cannot duplicate a row (the failure that list-move in a CRDT
  array has; see the comparison below).
- **Document-level values** are last-writer-wins registers: the rollback marker, the
  resolution, the standing instructions, the build volume, and each user-part definition.
- A **project id** in the state line says two files are copies of one project. Two files with
  different project ids are not merged; that case is a separate, reserved task (`io-012`).
- **Undo** stays remove-and-rebuild (`data-003`), and a removal now leaves a tombstone so the
  removal survives a merge with a copy that still has the row.

### The user's answers (2026-10-12)

Each of these is **decided**; later M15 tasks build against them, not around them.

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

### Correction to the version answer — confirmed by the user, 2026-10-12

The user was offered, and accepted, "a file that has never been merged keeps version 1".
**That rule cannot hold, and this document does not implement it.** A row removed by Undo needs
a tombstone the moment any other copy of the file might still hold that row, and a writer
cannot know whether such a copy exists (a download, a gist, the MCP server's view, another
device). Without the tombstone, the next merge with that copy brings the removed row back.

The rule recorded here instead:

> **A file a merge-capable build has edited is version 2. A legacy file opened and saved
> unchanged stays byte-identical at version 1.**

So in practice almost every file this build touches becomes version 2, and an older build
refuses it with a clear sentence rather than silently dropping the merge metadata. **The user
confirmed this on 2026-10-12 when the document was presented**; it is the one place
the recorded design differs from an answer the user gave.

### What this does not fix: convergence is not replayability

The merged **list** converges: every replica that has seen the same changes holds the same
ordered entries. That list can still **fail to fold**. One writer fillets an edge the other
writer's change removed; one writer `consumes` a body the other just superseded. The
flag-it-broken answer above is the whole response to that: the second row to fold is folded
as identity, marked `leftBroken`, and chipped with why. This **removes no work** from
`ReplayRejection` handling (`data-004`, `ui-052`); every merge path still goes through it.

### Origin-scoped undo, still satisfied

`CLAUDE.md` requires that undo/redo is scoped by transaction origin (the requirement carried
forward from the History section below). The merge does not touch the local undo stack: rows a
merge brings in land with a non-`local` origin, so header **Undo** never reaches them, and
**Undo merge** (`ui-062`) and **Undo AI turn** take a merge back as one step on their own
stacks. Stamps and tombstones are metadata the command layer writes; they add no new way to
mutate the document outside it.

## Options compared

Library numbers re-checked on **2026-10-12** (npm registry and GitHub API, same method as
the 2026-10-06 comparison in `ai-partner.md`), per `CLAUDE.md`'s "re-run the health check
when it's actually about to be pulled in". The four approaches:

| | **1. Hand-rolled state-based merge (chosen)** | 2. Three-way merge by record id against a shared base | 3. A CRDT library (Yjs / Automerge / Loro) | 4. Stay single-writer (the previous answer) |
|---|---|---|---|---|
| Dependency | None | None | One library (numbers below) | None |
| Fits a file transport (no server: disk, gist, git, download) | Yes: the state travels in the file | Only where a common ancestor is on hand | Yes, via each library's binary or JSON snapshot | n/a |
| Needs a shared base | **No** | **Yes** | No | n/a |
| Associative past two copies (laptop, phone, AI fork) | Yes, by construction | **No** | Yes | n/a |
| Storage format | NDJSON kept; record lines byte-identical; metadata in the state line (version 2) | Unchanged | A document-model rewrite around shared types; the library's own encoding | Unchanged |
| Reorder | LWW position key: concurrent moves converge, no duplicates | Per-copy; concurrent moves need a rule | Yjs/Automerge: move is delete + insert, concurrent moves duplicate. Loro: a movable list | n/a |
| Shared rollback marker | LWW register, anchored "after row X" | Needs a rule | No natural type in any of the three | n/a |
| Merged log still **replays** | **No** — flagged broken (above) | No | **No** | Yes (one writer) |
| Origin-scoped undo | Existing `document.js` stacks, unchanged | Existing stacks | Yjs `UndoManager` `trackedOrigins`; Automerge manual; Loro per-peer | Existing stacks |
| Cost | `src/core/merge/` plus state-line encoding and a fuzzed property suite (`data-009`..`data-011`) | Small: `forkChange` in `src/ai/agent.js` is most of it | Dependency, rewrite, merge test matrix | **Every concurrent case throws one side's work away** |

### CRDT library health, re-checked 2026-10-12

| | Yjs (`yjs`) | Automerge (`@automerge/automerge`) | Loro (`loro-crdt`) |
|---|---|---|---|
| npm version (published) | 13.6.33 (2026-09-23) | 3.5.0 (2026-09-16) | 1.16.4 (2026-09-30) |
| GitHub stars | 22,925 | 6,656 | 6,212 |
| Open / closed issues (open share) | 114 / 407 (21.9%) | 71 / 254 (21.8%) | 47 / 204 (18.7%) |
| Last push to the repo | 2026-10-07 | 2026-10-09 | 2026-10-09 |
| npm maintainers | **1** | 6 | 2 |
| GitHub contributors | 100+ (first API page full; not paged further) | 60 | 42 |
| Unpacked size | 2.31 MB | 47.53 MB (WASM) | 20.76 MB (WASM) |
| Licence | MIT (npm) / `NOASSERTION` (GitHub) | MIT | MIT |
| Archived | No | No | No |

All three are healthy and active; health is **not** why they lose. Since 2026-10-06 the
movement is small: stars up by 27 / 11 / 17, open issues 114→114, 68→71, 42→47. Unpacked size
is the npm tarball (several builds per package), **not** the bytes a browser would download;
the shipped WASM was not measured for this decision because no library is being adopted.

### Rejection table

| Rejected | Specific reason |
|---|---|
| **2. Three-way merge against a shared base** | Cheaper, no format change, and `forkChange` in `src/ai/agent.js` already computes most of it for an AI turn. Loses because two of the four required paths have **no reliable shared base**: the hosted git backend (a device's last-fetched copy is not a common ancestor of another device's edits) and **Merge file…** (any two downloaded copies). A three-way merge is also **not associative past two copies**: merging laptop, phone and an AI fork in different orders can give different results, which the state-based merge rules out by construction. |
| **3a. Yjs** | Same convergence-versus-replay gap as every option (a converged array that does not fold). Its `Y.Array` move is delete-plus-insert, so concurrent reorders duplicate rows; no type for the shared rollback marker. A document-model rewrite around shared types. A **single npm maintainer**. Its one real advantage, origin-tracked undo, already exists in `document.js`. Explicitly not a carried-forward default (`CLAUDE.md`). |
| **3b. Automerge** | Same convergence-versus-replay gap and list-move semantics. A 47.5 MB unpacked WASM package for a static PWA. Same rewrite. |
| **3c. Loro** | The closest fit of the three (a movable list handles reorder), but the same convergence-versus-replay gap, no shared-marker semantics, a 20.8 MB unpacked WASM package, and the same rewrite. |
| **3. Any CRDT library (all three)** | Also **the user's stated preference** (2026-10-12): merge without a CRDT library and without leaving NDJSON. |
| **4. Stay single-writer** | **Rejected by the user.** Its reasoning (History, below) was sound for one writer, and it is kept as the record of what that answer costs: the human paused during every AI turn, and every disk or hosted conflict resolved by discarding one side. |
| OT | Unchanged from the History section: needs a sequencing server this static-hosted app does not have. |

## Open risks the later tasks must measure

None of these is solved by this document. Each names the task that has to put a number on it.

| Risk | Why it matters | Who measures |
|---|---|---|
| **Position-key growth** under repeated inserts at one place | Fractional keys between two neighbours grow by roughly a character per insert at the same gap; a long session inserting "after row X" could produce long keys in the state line | `data-009` (bound and test it), `data-011` (measure in real files) |
| **File growth from tombstones** | Every removal leaves an id plus a stamp, forever. **No compaction in M15**; it is the reserved `data-012`, to be scheduled once `data-011` has measured real growth | `data-011`, then `data-012` |
| **Duplicate display names** | Two writers can each create "Cube 3"; the merge keeps both rows with distinct ids and the same name | `data-010` / `ui-062` (decide whether to rename on merge or only show it) |
| **Hostile stamps in an untrusted file** | A file is untrusted input (`ACCEPTANCE.md` scenario 8). A stamp with a huge counter would win every future merge; a tombstone could name a live row; a million tombstones could stall a load | `data-011` (caps enforced in code, one test per hostile shape) |
| **Convergence is not replayability** | Restated: the merge does not reduce `ReplayRejection` work | every merge path (`data-010`, `ui-062`, `io-010`, `io-011`, `ai-017`) |

## Out of scope for M15

Live multi-person editing over a network (there is still no server), tombstone compaction
(`data-012`), importing a *different* project's bodies (`io-012`), and any change to
`ai-012`'s relay (`ai-partner.md` Decision 11 is left as written; its own "Compatibility with
the M15 merge" section is the bridge's side of the contract).

## Sources (2026-10-12)

- **npm registry**: `npm view <pkg> version time.modified license maintainers dist.unpackedSize`
  for `yjs`, `@automerge/automerge`, `loro-crdt`.
- **GitHub API** (`gh api`): `repos/<r>`, `repos/<r>/releases/latest`,
  `repos/<r>/contributors?per_page=100`, and
  `search/issues?q=repo:<r>+type:issue+state:{open,closed}` for `yjs/yjs`,
  `automerge/automerge`, `loro-dev/loro`.
- **This repository**: `src/core/document.js` (`nextId`, `ReplayRejection`, the rollback
  marker as a count, `data-003` remove-and-rebuild undo); `src/ai/agent.js` (`forkChange`);
  `docs/decisions/ai-partner.md` (Decisions 5, 6, 11 and the CRDT section);
  `docs/decisions/persistence-export.md` (the hosted 409 path); `TODO/docs-022`,
  `data-008`..`data-011`, `ui-062`, `io-010`, `io-011`, `ai-017`.

---

## History: the 2026-09 deferral (superseded)

Kept unchanged below except that its headings moved one level down. Its original header
read:

> # Document model / sync: no CRDT for v1 (deferred, not resolved)
>
> Status: **Deferred**. `CLAUDE.md`'s Stack table "Document model / sync" row stays
> **Open** after this document — this is not a Library-decision closing that row, it's
> the stated-deferral record `CLAUDE.md` requires instead of leaving the gap silent.
> Follows `Initial design.md` §1/§3.

### Why there's no concurrent-write problem to solve today

The document is the NDJSON action-log described in `Initial design.md` §3: an ordered
array of plain-JSON action records, replayed in full on every edit via a pure fold —
`actions.reduce((scene, action) => applyAction(scene, action, registry), emptyScene())`.
There is exactly one array, and today exactly one thing ever appends to it: the local
user's own UI, through the command layer `CLAUDE.md`'s Architecture section requires
for every document mutation. Nothing else writes to the log concurrently, so there is
no divergent state to reconcile and nothing for a merge algorithm to resolve — CRDT
semantics exist to answer a question this document doesn't currently ask.

### Options considered

| Approach | Merge model | Cost | Fit here |
|---|---|---|---|
| **No CRDT — single-writer append log (this decision)** | None needed; one writer, linear append | Zero added dependency or complexity | Matches the actual current write pattern exactly: local UI is the only writer |
| CRDT (Yjs + y-indexeddb, previous attempt's pick) | Automatic conflict-free merge across concurrent writers | A real dependency, a document-model rewrite around `Y.Array`/`Y.Map`, and merge-semantics edge cases to design and test | Solves a problem — concurrent writers — that doesn't exist yet in this attempt; `CLAUDE.md` explicitly does not carry this forward as a default (see "What's actually decided this time") |
| Operational Transform (OT) | Server-mediated transform-and-rebase | Requires a server component to sequence operations; this project is static-hosting-first (`CLAUDE.md` Stack: GitHub Pages, no backend) | Wrong shape for a project with no backend by default |

### Rejection table

| Rejected option | Specific reason |
|---|---|
| CRDT (Yjs) | No second writer exists to merge against yet. Adopting it now means carrying a dependency, a `Y.Array`-shaped document model, and merge-conflict test cases for a scenario (concurrent edits) that hasn't been built into the app at all — solving a problem before it exists, which also happens to be the exact library `CLAUDE.md` singles out as explicitly not a carried-forward default. |
| OT | Assumes a server to sequence and rebase operations against; this project's default hosting (GitHub Pages) is static with no backend, so OT would force a backend decision that nothing else in the roadmap currently requires. |

### The revival condition — what would reopen this

The one concrete case identified so far that would turn this from a non-problem into
a real one: **a remote MCP session editing the same project concurrently with a human
who has it open**, per `CLAUDE.md`'s AI Partner section ("If the document/sync
decision above ends up supporting concurrent merge, that makes concurrent human
editing safe; if it doesn't, say so explicitly rather than assuming it"). That's a
second writer appending to the same action log from a different process at the same
time as the local UI — the exact condition a single-writer replay log has no answer
for. Until an MCP server is actually built and actually supports live concurrent
editing of an open project (both currently unbuilt), this condition doesn't exist, and
this document exists specifically so that isn't a silent gap when it eventually does.

No other candidate trigger is identified at this time. If one turns up before the MCP
live-editing bridge is built, add it here rather than treating this list as closed.

#### Update, 2026-10-06 (`TODO/ai-001`, `docs/decisions/ai-partner.md`)

The AI partner's design was settled with this condition in view, and **none of what M9
ships triggers it**. This row stays **Deferred**, and the reasoning above still holds:

- **The in-browser assistant is not a second concurrent writer.** It writes through the
  same command layer, in the same tab, with origin `ai`. Each turn builds on a forked
  throwaway document while the human's edits are paused (the existing History-preview
  mode), then lands as **one atomic `appendAll`**. At every moment exactly one thing
  writes the log. **Undo AI turn** removes a turn through the same remove-and-rebuild
  `data-003` built, so origin scoping is unchanged.
- **The MCP server (`ai-009`) edits a closed project file only in v1.** The file is
  written atomically (temp file plus rename, with a lock file). If the app has the same
  file open, the app detects the change on focus and offers Reload with the hosted path's
  Overwrite / Load / Cancel semantics. That's a **file-level** conflict, with no merge,
  the same answer `io-002` gave for a stale `sha`.
- **The live bridge is the reserved `ai-012`**, and the condition above is now scoped to
  it. Its planned answer is **one writer, the AI as its client**: Claude Code's MCP
  server forwards tool calls over a localhost link to the open tab, which runs them
  through the same tool registry and the same branch-per-turn. Built that way, `ai-012`
  **resolves this condition without a merge algorithm**.
- `docs/decisions/ai-partner.md`'s CRDT section asked whether a CRDT would help the AI
  co-editor and answered **no**, with a rejection table (Yjs, Automerge, Loro). A CRDT
  guarantees the merged *array* converges, not that the merged parametric log still
  replays, so `ReplayRejection` handling would be needed anyway. The timeline's reorder
  and shared rollback marker also fit CRDT types poorly.

**The remaining revival condition** is therefore **multi-person real-time editing**: a
second *human*, in a second browser, editing the same open project live. That's the one
scenario where "one writer" can't be kept by design. If it becomes a goal, reopen this
row then. Until then, an AI writer alone is not a reason to.

### Requirement to carry forward regardless of what eventually fills this row

Whatever backs this row when it's finally resolved — CRDT, OT, or something else —
must still satisfy `CLAUDE.md`'s Architecture requirement that **undo/redo is scoped
by transaction origin**, so a remote or programmatic edit (an MCP session, a future
sync peer) never lands in the local user's own undo stack. This is a requirement on
the eventual decision, not an afterthought to retrofit once a library is picked — a
library that can't express transaction-origin scoping is disqualified by that alone,
regardless of its merge-semantics quality.

### Sources

`Initial design.md` §1 ("Document model / sync — proposed as deferred, not resolved")
and §3 (the action/object array, replay-fold model); `CLAUDE.md`'s Architecture
section (transaction-origin undo scoping) and AI Partner section (the MCP
concurrent-editing case).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
