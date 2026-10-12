---
title: Replica-scoped record ids and a Lamport clock on every document
category: data
kind: feature
priority: high
model: sonnet
milestone: M15
depends: [docs-022]
status: done
---

> **What shipped (2026-10-12).** As specified: `src/core/replica.js` (replica id, Lamport clock,
> `compareStamps`, `isStamp`, plus `counterOfId`), `createDocument({ replica, clock })`,
> `nextId` returning `prefix-replica-counter`, `replicaId()` on the document, and `loadEntries`
> moving the clock past the highest counter in the ids it reads (a legacy `op-7` reads zero and
> is never rewritten). Differences from the file: the alphabet is `a-z2-7` (base32), so the
> example id in this file was corrected to `op-k3f5xa-12`; the clock is advanced from the
> **ids** in a loaded log because stamps are not stored until `data-010`; `agent.js` and
> `stores/document.js` needed no change because every `createDocument` call already draws its
> own random replica (`agent.js` gained an optional `replica` seam so scripted specs can name the
> ids a fork mints, and `bench/ai/run.js` fixes one for its seed). Nothing else minted ids: the
> audit found every record id comes from `nextId`. Specs that asserted a literal `<kind>-<n>`
> for a new row now inject `replica: 'abcdef'` or normalise the replica segment; five e2e specs
> and `src/ai/providers/scripted.js`' `$last:`/`$all:` placeholders accept the replica form.
> **Known gap for `data-010`:** `nextName` is untouched, so two writers can both produce
> "Cube 3"; conflict reasons should name the step number as well as the label.

## Goal

Two writers must never mint the same record id. Today `nextId` is a per-document counter
(`src/core/document.js`, `nextId`), and its own comment says it is safe only because the log has
one writer. A human's tab and an AI fork seeded from it will both hand out `op-12` next.

This task gives every document instance a **replica id** and a **Lamport clock**, and makes new
ids replica-scoped. Nothing merges yet. It is useful alone: it removes a latent collision
between the live document and any throwaway document that outlives its seed.

"Done": two documents seeded from the same entries, each appending ten records, share no id;
every existing project file opens and re-saves byte-identical; every existing spec passes.

## Interaction model

Does not apply — a pure `core` change. No control is added. One visible consequence to state:
ids shown in a saved file read `op-k3f5xa-12` instead of `op-12` for rows created after this
lands. Ids are not shown in the app's UI.

## Documentation

Does not apply. No user-visible control. `docs/save-load.md` mentions the file format only in
passing; update its one example line if it shows an `op-N` id.

## Affected files

- `src/core/replica.js` (new) — `createReplicaId()`, `createClock(replica, start)`,
  `compareStamps(a, b)`, `isStamp(value)`; `src/core/replica.spec.js`
- `src/core/document.js` — `createDocument({ replica, clock })`, `nextId`, the four derived-id
  call sites (`-color`, `-delete`, `-remove`), `loadEntries`
- `src/ai/agent.js` (the fork gets its own replica id), `mcp/projectFile.js` (one per process)
- `src/stores/document.js` (the live document's replica id, one per page load)
- any spec that hard-codes `op-<n>` for a **newly created** row

## Proposed fix

1. **Replica id.** Six characters from a 32-symbol lower-case alphabet (30 bits), from
   `crypto.getRandomValues`. Framework-free: the generator is injected so a spec passes a fixed
   one (`CLAUDE.md`: mock at the boundary). One per `createDocument` call unless the caller
   passes one. A reload gets a new one; two tabs never share one. That is the property the
   clock's uniqueness depends on, so say it in the JSDoc.
2. **Clock.** A counter that `tick()`s on every mutation and `observe(n)`s any stamp it reads,
   so it is always ahead of everything it has seen. `loadEntries` observes the highest counter
   in the loaded data (zero for a legacy file).
3. **Ids.** `nextId(prefix)` returns `${prefix}-${replica}-${counter}` using the clock, still
   checked against `entries` as today. Legacy ids (`op-7`) stay valid and are never rewritten.
4. **Stamps are not stored yet.** This task only makes the clock exist and advance;
   `data-010` attaches stamps to entries.
5. **Audit for ids minted elsewhere.** Grep `src/` and `mcp/` for any record id not produced by
   `nextId` (the AI tools' `@n` references resolve to real ids; confirm they come from
   `nextId`). Any found goes through `nextId`.
6. **`nextName` is left alone.** Two writers can both produce "Cube 3". Nothing breaks, but
   refusal messages become ambiguous; record it in the retirement note as a known gap for
   `data-010`'s conflict reasons to work around (they name a step number as well as a label).

## Effort

M

## Testing

- Unit (`src/core/replica.spec.js`): stamp ordering is total (counter, then replica id);
  `observe` never moves the clock backwards; a malformed stamp is rejected by `isStamp`.
- Unit (`src/core/document.spec.js`): two documents seeded from the same entries share no new
  id over 1 000 appends each; a legacy file's ids survive a load/serialise round trip
  byte-identical; a suppressed or rolled-back row's id is still never reissued (`data-004`'s
  existing case, re-run); a fork's records land on the live document without an id clash.
- Sweep: every existing `.spec.js` and `*.e2e.js` passes. Specs asserting a literal `op-<n>` for
  a new row are changed to assert shape or to inject a fixed replica id, not deleted.
- Acceptance scenarios this could break: **10** (save, reload, nothing changed), **12** (edit a
  mid-history step), **14** (delete, bring back, reload), **21** (variables). Re-drive 10 and 14.
- Closed findings to re-run: `data-004` (id reuse after suppress/rollback), `ai-002` (atomic
  landing of a fork), `core-056` (a batch of insert plus revision is one Undo step).
- Engines: Chromium only for unit work; scenario 10's reload half on all three, because it
  crosses IndexedDB.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
