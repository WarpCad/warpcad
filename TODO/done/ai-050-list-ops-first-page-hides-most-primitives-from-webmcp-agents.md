---
title: Stop a WebMCP agent from concluding an op doesn't exist after reading list_ops' first page
category: ai
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-20 from a Claude in Chrome run
depends: []
status: done
---

> **Shipped (2026-11-20):** fixes 1, 2 and 3. A bare WebMCP `list_ops` is rewritten to `detail: 'names'` (every op name, one page); `primitive.*` leads `create`; a partial page leads with `incomplete: true` and a NOT-complete note. Fix 4 already existed (`closest` in the unknown-op refusal). A real Claude in Chrome re-run was not done.

## Problem

On 2026-11-20 Claude in Chrome was asked, through the WarpCad tab's WebMCP tools, to *add a 40 mm
cube and put a 20 mm sphere on top of it*. It placed the cube, then said WarpCad "only has two
primitives: `primitive.cuboid` and `primitive.cone`" and offered a cone instead. `primitive.sphere`
exists. An earlier run the same day used it successfully.

Cause: `list_ops` is paged to the 1,500-character `OUTPUT_BUDGET` (`src/ai/webmcp/toolShape.js`,
`pageList`). Measured with the registry as of `d757410a`:

| Input | Catalogue | First page | `page.more` |
|---|---|---|---|
| `{}` | 44 ops, 41,777 chars | `hardware.bearing` only | "43 more. Call list_ops with offset: 1 for the rest." |
| `{ detail: 'summary' }` | 44 ops, 5,447 chars | 10 create ops, ending `primitive.cone`, `primitive.cuboid` | "34 more. Call list_ops with offset: 10 for the rest." |

The catalogue is alphabetical, so the first page is mostly hardware and kit parts. It ends with
exactly the two primitives the agent named. The `more` note sits inside the trailing `page` object.
The agent read the list as complete and never paged on. Nothing is cut silently by WarpCad's own
rule, but an agent that skims still gets it wrong, and it gets it wrong on the most common request
(a basic primitive).

## Affected files

- `src/ai/webmcp/toolShape.js:285-307` (`pageList`, and the `page` note's placement)
- `src/ai/tools/index.js:237-300` (`list_ops`: catalogue order, `detail: 'summary'`)
- `docs/webmcp.md` (the Claude in Chrome prompt; already tells the agent to follow `page.more`)

## Proposed fix

Pick one or more, smallest first:

1. **Put the paging note first and make it unmissable.** A paged result leads with
   `incomplete: true` and `page`, before the list, with wording like *"Showing 10 of 44 ops. This
   list is NOT complete: call list_ops with offset: 10."*
2. **Order the catalogue for agents.** List `primitive.*` first (create ops), then the other
   create families, then operate ops, so the first page of a summary holds what most requests need.
3. **Fit a whole summary-level index on page one.** Over WebMCP, a bare `list_ops` call returns
   only op names (about 44 short strings, well under budget) plus a line saying to ask
   `{ ops: [...] }` or `{ detail: 'summary', offset }` for parameters.
4. **Name the missing op in `create`'s refusal.** An unknown-op refusal already exists. Check that
   it suggests the nearest names, so an agent that guesses `primitive.sphere` gets a direct answer.

Recommended: 2 and 3 together. The first page then answers "which ops exist" on its own, and the
paging stays for parameter detail.

## Effort

S.

## Testing

- `src/ai/webmcp/toolShape.spec.js`: a bare `list_ops` over WebMCP lists every op name on page one
  under `OUTPUT_BUDGET`, and `primitive.sphere` is on it. Keep the existing paging tests for
  `detail: 'full'` and `summary`.
- `src/ai/tools/listOps.spec.js`: if the order changes, `primitive.*` ops come first in `create`.
- `e2e/webmcp.e2e.js` (Chromium only, through the fake `document.modelContext`; no WebGL
  assertion): extend the existing `list_ops` checks so the first-page names include
  `primitive.sphere`.
- Acceptance: re-drive **27. An in-browser agent adds ten cubes (WebMCP)**, and once with a real
  Claude in Chrome agent using the `docs/webmcp.md` prompt (cube plus sphere). Scenario 25 (live MCP)
  shares the registry, so re-run its spec too.
- Closed finding to re-run: `ai-024` (WebMCP agents cannot find or use the tools). Its
  reproduction steps run against the new paging.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
