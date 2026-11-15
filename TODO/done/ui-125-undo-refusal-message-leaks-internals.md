---
title: The header's Undo refusal reads like a stack trace and sits beside the save-status chip instead of in it
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-14 from the testing-019 drive of data-003 #2
depends: []
status: done
---

> **What shipped (2026-11-15).** The refusal is built in `src/core/document.js` from both steps' History labels and a plain-words
> origin (`originActorText` in `src/core/origin.js`): `Can't undo Place Cube 1: a step added by a browser agent (Move Cube 1) builds on
> it. Open History to suppress that step first.` The error carries `code: 'undo-blocked'`, `step`, `blocker` and `blockerOrigin`; nothing else
> in the tree matched the old text (grep of `src/`, `mcp/`, `e2e/`, `docs/`: only unit specs and `docs/undo-redo.md`, all updated), and the AI
> tool registry has no undo tool. `HistoryControls` now sends it to `persistence.announceRefusal`, so the save-status chip shows it as
> `role="alert"` for 12 s in a wrapped panel under the header (at every width; fixed under the header on a phone). The old
> `history-refusal` block is gone. Spec: `e2e/undo-refusal.e2e.js`.

## Problem

`FIND-testing-019` drove `TODO/VERIFY.md` `data-003` #2 on `npm run dev` with the stand-in browser agent (`document.modelContext`, no key, no
network). A cube was placed by hand; the agent moved it with `operate` (`transform.translate`, one `webmcp`-origin record); then the header
**Undo** was pressed. The refusal appears (`data-testid="history-refusal"`, `role="alert"`), the cube stays put and Undo stays enabled.
It reads:

> document.undo: "cuboid-oprfjy-1-move-oprfjy-2", added via webmcp, depends on "Place Cube 1" — suppress or edit it first

Problems measured at 1440x900:

1. It names the blocker by record id and prefixes the internal `document.undo:`, not the step's History label.
2. It is a separate red text block in the header bar (239.6 × 39 px, three lines) squeezing the app hint to "Drag a shape from the Lib…",
   while the `save-status` chip beside it still reads "Saved · 14:28". `HistoryControls.vue`'s comment says it should be folded into that chip.
3. "suppress or edit it first" does not say where (History panel) or how.

## Affected files

- `src/components/layout/HistoryControls.vue` (the refusal region and its comment)
- `src/core/document.js` (the `document.undo` error text, near line 4056)
- the save-status chip component under `src/components/layout/`

## Proposed fix

1. Word the refusal from the step's label and origin: "Can't undo Place Cube 1: a step added by a browser agent (Move Cube 1)
   builds on it. Open History to suppress that step first."
2. Show it through the save-status chip (or a toast) instead of a second header block; keep `role="alert"`.
3. Update `src/core/history.spec.js`'s `toThrow` patterns and add an e2e for the message at all three viewports.

## Effort

S.

## Testing

- Unit and e2e as above, three viewports and engines (header layout, persistence untouched).
- Re-run `FIND-testing-019`'s `data-003` #2 reproduction (agent `operate` on a placed cube, then header Undo).

## Interaction model

Precondition: a local step with a later non-local step that depends on it. Trigger: header **Undo**. Feedback: a readable message in
the status chip.

## Documentation

- **Page**: `docs/undo-redo.md`, a line on what Undo says when an agent step builds on yours.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
