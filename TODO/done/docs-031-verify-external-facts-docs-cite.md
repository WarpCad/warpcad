---
title: Check the outside facts that VERIFY.md rows say the docs and data tables rely on
category: docs
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-07 from the VERIFY.md drivable-row triage
depends: []
status: done
---

> **Shipped as written, with one fact fixed.** Four of the five rows checked out and are now `OK` with
> citations in `TODO/VERIFY.md`. The one wrong fact was the Sonnet 5.5 cache-hit price in
> `bench/ai/score.js` ($0.20 to $0.10), with its spec updated. The WebMCP origin-trial row (ai-021 #4)
> stays `Open` on purpose: Chrome's own pages state neither a token rule for deployed sites nor an end
> date, so `docs/webmcp.md` stays silent.

## Problem

Five `TODO/VERIFY.md` rows ask someone to check a fact against an outside source: legal names, a
standard's table, model prices, a browser trial and a client limit. Web research answers each, with a
citation. None needs the owner, though fixing a sentence or table may.

Rows (entry and row number in `TODO/VERIFY.md`):

| Row | What to check | Where the fact lives |
|---|---|---|
| `docs-023` #1 | Each owner's current legal name and mark on its own trademark page: Raspberry Pi Ltd, Apple Inc., Samsung Electronics, Google LLC, Adafruit Industries, Pimoroni Ltd, Anthropic PBC, GitHub Inc., Functional Software Inc. d/b/a Sentry | the trademarks notice from `docs-023` |
| `core-052` #1 | Spot-check the ISO 4032 nut rows (M1.6–M20: across flats, across corners, height) against a published table | `nut-specs.js` |
| `ai-011` #3 | The model price table (dated 2026-09-25) against Anthropic's current pricing page; load the `claude-api` skill first | `bench/ai/score.js` |
| `ai-021` #4 | Whether a deployed https app needs a WebMCP origin-trial token, and the trial's end date, from Chrome's own pages | `docs/webmcp.md` (deliberately silent until confirmed) |
| `ai-027` #2 | Whether Claude Code still caps MCP tool and server descriptions at 2,048 characters (`CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH`) | `mcp/` instructions, `docs/mcp.md` |

## Affected files

- `TODO/VERIFY.md` (each row's Status and Notes, with the source URL and the date read)
- The file in the right-hand column, only where the fact is wrong

## Proposed fix

1. Look each fact up at the primary source (the owner's own trademark page, the ISO table or a
   manufacturer's catalogue that reproduces it, Anthropic's pricing page, Chrome's origin-trial page,
   Claude Code's docs or changelog). Note the URL and the date read.
2. Where the repo is right, mark the row `OK` with the citation. Where it is wrong, fix it in the same
   change (numbers to the table's stated precision), and run the unit tests that cover that table.
3. `docs/webmcp.md`: add the origin-trial facts only if Chrome's page states them; otherwise record
   "not stated as of <date>" in Notes and leave the row `Open`.

## Effort

S.

## Testing

- `npm run spdx`; `npx vitest run` on the specs next to any changed table (`nut-specs`, `score`), with the progress reporters.
- Engines: n/a. Chromium only if a `docs/` page changes and the help build is checked.
- Acceptance scenarios: none.
- Closed-finding regression: none.

## Interaction model

Not UI-touching.

## Documentation

- **Page**: `docs/webmcp.md`, `docs/mcp.md` or the trademarks notice, only where a fact changes. No media.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
