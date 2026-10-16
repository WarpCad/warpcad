---
title: The `group.snap` tool tells the AI partner that `outside+` puts the first body on the second's + side, which is backwards
category: ai
kind: finding
priority: medium
model: sonnet
depends: []
status: done
---

> **What actually shipped (2026-10-16):** the description was corrected, as proposed. The Testing
> section asked for a measured check on both `outside+` and `outside-`, so it has one (`operate.spec.js`).
> The description test pins the sentence itself, so the two checks are separate: one reads the text, one measures the kernel. Two things went beyond
> the TODO: the scripted AI transcripts (`e2e/fixtures/ai/`) went stale on the schema hash, so the three
> hash lines were re-stamped (`npm run ai:stamp`) only after `e2e/ai-scripted.e2e.js` matched its pre-change
> baseline; and the browser run was the gate for the stamp, not the stamp script's own order.

## Problem

Found 2026-10-15 while building `ui-060` (the one Align tool). `src/ai/tools/operate.js` (~line 211)
describes the `group.snap` `orientation` argument as *"Which sides meet, e.g. "outside+" puts the
first body on the second's + side."* By `SNAP_SIDES` in `src/core/kernel/group.js`
(`[referenceSide, movingSide]`, `0` min, `1` max) `outside+` is `[0, 1]`: the first body's **max**
face meets the second's **min** face, so the first body ends up on the second's **−** side. The
description is backwards, so a model that trusts it places a body on the wrong side and reads the
result as a bug. `ui-060` documented the true table (`docs/snap-align.md`, "The popover's fields").

## Affected files

- `src/ai/tools/operate.js` (the `orientation` description, and any sibling copy of the sentence)
- `src/ai/tools/operate.spec.js` (or the registry's description spec, if one pins the text)
- `docs/ai-partner.md`, `docs/mcp.md` only if either repeats the wrong sentence

## Proposed fix

Correct the sentence to say what each key does, from `SNAP_SIDES`: *"outside+ puts the first body on
the second's − side (its + face against the second's − face); outside- puts it on the + side."*
Add a unit test that derives the expected side from `SNAP_SIDES` and a measured snap, so the text
cannot drift from the table again. Do not rename the keys: saved projects and MCP clients use them.

## Effort

S

## Testing

- Unit: a spec that applies `group.snap` with `outside+` and `outside-` to two boxes and asserts which
  side the first ends up on, against the description's own claim.
- `*.e2e.js`: none (no UI surface); `src/ai/tools` specs run in the normal unit stage.
- Acceptance: none; closed finding `ui-060` (the popover's labels) is unaffected.

## Documentation

- **Page**: `docs/ai-partner.md` only if it repeats the sentence (grep `outside+`). No new example.
- **Media**: none.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
