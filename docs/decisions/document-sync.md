# Document model / sync: no CRDT for v1 (deferred, not resolved)

Status: **Deferred**. `CLAUDE.md`'s Stack table "Document model / sync" row stays
**Open** after this document — this is not a Library-decision closing that row, it's
the stated-deferral record `CLAUDE.md` requires instead of leaving the gap silent.
Follows `Initial design.md` §1/§3.

## Why there's no concurrent-write problem to solve today

The document is the NDJSON action-log described in `Initial design.md` §3: an ordered
array of plain-JSON action records, replayed in full on every edit via a pure fold —
`actions.reduce((scene, action) => applyAction(scene, action, registry), emptyScene())`.
There is exactly one array, and today exactly one thing ever appends to it: the local
user's own UI, through the command layer `CLAUDE.md`'s Architecture section requires
for every document mutation. Nothing else writes to the log concurrently, so there is
no divergent state to reconcile and nothing for a merge algorithm to resolve — CRDT
semantics exist to answer a question this document doesn't currently ask.

## Options considered

| Approach | Merge model | Cost | Fit here |
|---|---|---|---|
| **No CRDT — single-writer append log (this decision)** | None needed; one writer, linear append | Zero added dependency or complexity | Matches the actual current write pattern exactly: local UI is the only writer |
| CRDT (Yjs + y-indexeddb, previous attempt's pick) | Automatic conflict-free merge across concurrent writers | A real dependency, a document-model rewrite around `Y.Array`/`Y.Map`, and merge-semantics edge cases to design and test | Solves a problem — concurrent writers — that doesn't exist yet in this attempt; `CLAUDE.md` explicitly does not carry this forward as a default (see "What's actually decided this time") |
| Operational Transform (OT) | Server-mediated transform-and-rebase | Requires a server component to sequence operations; this project is static-hosting-first (`CLAUDE.md` Stack: GitHub Pages, no backend) | Wrong shape for a project with no backend by default |

## Rejection table

| Rejected option | Specific reason |
|---|---|
| CRDT (Yjs) | No second writer exists to merge against yet. Adopting it now means carrying a dependency, a `Y.Array`-shaped document model, and merge-conflict test cases for a scenario (concurrent edits) that hasn't been built into the app at all — solving a problem before it exists, which also happens to be the exact library `CLAUDE.md` singles out as explicitly not a carried-forward default. |
| OT | Assumes a server to sequence and rebase operations against; this project's default hosting (GitHub Pages) is static with no backend, so OT would force a backend decision that nothing else in the roadmap currently requires. |

## The revival condition — what would reopen this

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

### Update, 2026-10-06 (`TODO/ai-001`, `docs/decisions/ai-partner.md`)

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

## Requirement to carry forward regardless of what eventually fills this row

Whatever backs this row when it's finally resolved — CRDT, OT, or something else —
must still satisfy `CLAUDE.md`'s Architecture requirement that **undo/redo is scoped
by transaction origin**, so a remote or programmatic edit (an MCP session, a future
sync peer) never lands in the local user's own undo stack. This is a requirement on
the eventual decision, not an afterthought to retrofit once a library is picked — a
library that can't express transaction-origin scoping is disqualified by that alone,
regardless of its merge-semantics quality.

## Sources

`Initial design.md` §1 ("Document model / sync — proposed as deferred, not resolved")
and §3 (the action/object array, replay-fold model); `CLAUDE.md`'s Architecture
section (transaction-origin undo scoping) and AI Partner section (the MCP
concurrent-editing case).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
