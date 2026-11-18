---
title: Reword the "via another program" chip, the stale-project refusal and the Assistant conflict strip
category: ai
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-14 from the testing-029 cold-read panel
depends: []
status: done
---

> **What shipped (2026-11-18):** all three strings, with one reversible choice on the first. The History origin chip reads *via unknown source* for an origin the app does not recognise and *via a merge* for `merge`; `via mcp`, `via ai`, `via webmcp` and `via remote` are kept, because renaming `via mcp` to *via an external tool (MCP)* means about 30 quoted copies in the docs and specs and the docs already define MCP (OWNER.md Q99 asks whether to rename). The stale-project refusal reads *…(you edited it, or another copy was merged in), so nothing was applied. Read it again with describe_scene, then retry.* The Assistant conflict strip reads *1 step from the Assistant couldn't be built next to your own edits, so it is marked broken in History. The other step was applied. Show opens it.* (the applied clause only when other steps landed), after confirming the outcome: the conflicted step is kept and flagged broken, never applied. It names no step or cube, because the conflict data carries only row ids. `docs/ai-partner.md` and `docs/merging.md` quote the new strip.

## Problem

Two independent fresh agents read these strings with no documentation (judged from the strings, not the live UI):

1. **`via another program`** (`ai-009` #6, `src/core/origin.js` line 32). One called it misleading, one unclear: it asserts a program acted
   when the app only does not recognise the origin. Also `via mcp` and `via merge` are developer terms for a first-time user. Proposed:
   `via unknown source` (or *from an unrecognised source*), `via an external tool (MCP)`, `via a merge`.
2. **The stale-project refusal** (`ai-012` #5, `src/ai/bridge/protocol.js` line 75). Both agents called it fine for the agent (it names
   `describe_scene` and says to retry) but unclear for a human reading the log: *a merge landed* is jargon. Proposed: *The project changed in
   WarpCad while this call waited (you edited it, or another copy was merged in), so nothing was applied. Read it again with
   describe_scene, then retry.*
3. **The Assistant conflict strip** (`ai-017` #3): *Merged 1 step from the Assistant — 1 step conflicted*. One agent called it unclear, one misleading:
   "merged" suggests success and "conflicted" suggests failure, and neither says whether the edit was applied. Proposed, after confirming the real
   outcome: *The Assistant's step on Cube 1 couldn't be built because you moved the cube meanwhile. Show opens it in History.*

## Affected files

`src/core/origin.js`, `src/ai/bridge/protocol.js` (its specs), the merge strip component, `docs/ai-partner.md` (quotes the strip), `docs/merging.md`.

## Proposed fix

Change the three strings and every quoted copy.

## Effort

S.

## Testing

Unit specs that assert the strings; the Assistant and merge e2e on the rotating pair; re-run the `ai-017` conflict reproduction.

## Interaction model

Preconditions: an unknown-origin record; a call during a held Library drag; an Assistant turn on a body the user then edits. Feedback: the new wording.

## Documentation

`docs/ai-partner.md` and `docs/merging.md`, where the strip text is quoted.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
