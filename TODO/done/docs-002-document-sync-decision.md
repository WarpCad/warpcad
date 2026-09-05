---
title: Record the no-CRDT-for-v1 document/sync deferral explicitly
category: docs
kind: feature
priority: high
model: sonnet
milestone: M0
depends: []
status: done
---

## Goal

Write `docs/decisions/document-sync.md`, recording the "no CRDT for v1, single-writer
replay log" decision from `Initial design.md` §1/§3 as a **stated deferral**, not a
silent gap — `CLAUDE.md` explicitly warns against the latter. `CLAUDE.md`'s Stack table
"Document model / sync" row **stays Open** after this task; the goal is to make the
deferral and its trigger condition explicit and discoverable, not to resolve the row.

Done when: `docs/decisions/document-sync.md` exists, states plainly that the
NDJSON action-log/replay model (§3) is trivially single-writer and needs no merge
semantics today, and names the concrete condition that would reopen the question — a
remote MCP session editing the same project concurrently with a human (per
`CLAUDE.md`'s AI Partner section) is the only case identified so far.

## Interaction model

n/a — no user-visible surface.

## Documentation

n/a beyond the deliverable itself — no end-user `docs/` page; this doc's audience is
future contributors deciding whether to revisit the sync question.

## Affected files

- `docs/decisions/document-sync.md` (new)
- `CLAUDE.md` (optional: add a pointer from the Stack table's Document model/sync row
  to this doc, without changing its Open status)

## Proposed fix

Document: (1) why the replay-fold model (`actions.reduce(...)`, §3) has no concurrent-
write problem to solve today — there's only ever one writer appending to the array; (2)
the explicit "no CRDT for v1" call; (3) the named revival condition (concurrent
human+MCP editing of the same project); (4) that undo/redo's transaction-origin scoping
(`CLAUDE.md` Architecture) is a requirement to carry into whatever eventually fills this
row, not an afterthought once a library is picked. Follow the same rubric shape as other
Library decisions even though the conclusion is "defer, don't pick yet."

## Effort

S (< 1hr)

## Testing

No code or UI surface — docs-only. Acceptance scenarios: none. No closed findings to
re-check.
