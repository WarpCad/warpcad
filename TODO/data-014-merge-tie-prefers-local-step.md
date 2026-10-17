---
title: Merge tie-break: when two clocks tie, the flagged row prefers the local step, not the replica id
category: data
kind: finding
priority: medium
model: opus
depends: []
status: open
---

## Problem

In a move-versus-fillet conflict, the flagged row is chosen by replica ids when two Lamport
clocks tie. Which step loses can therefore change from run to run. The user chose on
2026-10-17 (question 9 of the decision list) to prefer the local step on a tie.

This is merge semantics. It touches the state-based merge in `src/core/merge/`, so it is
`opus` and needs care about determinism on both sides of the merge.

## Affected files

- `src/core/merge/merge.js` (the tie-break inside the conflict resolution)
- `src/core/merge/state.js` (where the stamps and the local-replica marker are compared)
- `src/core/merge/merge.spec.js`, `src/core/documentMerge.spec.js` (update and add cases)
- `src/stores/merge.js` (the banner that names the step that lost)

## Proposed fix

When the clocks tie, prefer the step made by the local replica, and only then fall back to
the replica id order, so the result is still deterministic. The banner keeps naming the
step that lost. Record the tie-break rule in `docs/decisions/document-sync.md`.

## Effort

M (a few hours). Determinism is the risk: a merge must give the same answer on every
side, or two replicas diverge.

## Testing

- Unit: a tie with a local step and a remote step keeps the local step, on both merge
  directions, and the result is identical on both replicas.
- Unit: a tie with no local step falls back to the replica order, and the result is
  stable across runs.
- Unit: a non-tie is unchanged (regression on the existing merge specs).
- E2E: `e2e/` merge spec (the merge banner) on the laptop project.
- Acceptance scenarios: the merge scenarios in `TODO/ACCEPTANCE.md` (the AI turn and the
  file merge). Re-drive them on laptop Chromium.
- Closed-finding regression: `io-010` (disk file auto-merge), re-run its move-versus-fillet
  repro.
- Engines: Chromium only, because this is pure merge logic with no WebGL, WASM or canvas.

## Documentation

- **Page**: `docs/decisions/document-sync.md` (the tie-break rule). This is a developer
  decision record, not end-user documentation, so no user docs page or media is needed.
  The user-visible banner is unchanged in wording.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
