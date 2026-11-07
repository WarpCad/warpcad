---
title: Drive the VERIFY.md MCP and live-bridge checks with a real Claude Code as the client
category: testing
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-07 from the VERIFY.md drivable-row triage
depends: []
status: open
---

## Problem

A group of `TODO/VERIFY.md` rows asks what "a real Claude Code" or "a real MCP client" does with the
WarpCad MCP server (`mcp/server.js`) or the dev live bridge (`mcp/liveBridge.js`, `mcp/bridge.js`). Claude
Code is installed on this Mac, and headless `claude -p --mcp-config <file>` is a real client. An agent can
start it against a scratch project file, or against the dev bridge with a Playwright-driven tab open, and
read the result from the file and the page. No API key is needed in the app. The runs use the owner's
Claude Code subscription.

Rows (entry and row number in `TODO/VERIFY.md`):

| Row | What to drive |
|---|---|
| `ai-029` #2 | `/mcp__warpcad__build` with the plate example lands the plate, with the request as every History row's intent; `check-print` leaves the file's bytes unchanged (hash before and after) |
| `ai-029` #3 | Does Claude Code deliver the embedded guide whole, not cut at 2,048 characters? If not, add the "read `warpcad://guide`" fallback to the recipes |
| `ai-029` #4 | Does headless `claude -p "/mcp__warpcad__build …"` expand MCP prompts at all? |
| `ai-027` #1 | Fresh project file: *a 40 mm cube with a 10 mm hole straight through it* places, subtracts, measures and does not ask about units; the ambiguous airfoil request makes zero writes |
| `ai-028` #1 | Repeat `ai-027`'s three-case drive twice each; record whether the agent read `warpcad://guide` unasked; append to that task's result file. **The row asks for the owner's consent**: running this task counts as consent only if the owner starts it |
| `ai-031` #1 (Claude Code half) | *a 140 × 250 mm fan duct, 1.6 mm walls*: the agent calls `record_prompt` first with the exact words, and the Inspector's Prompt row shows them |
| `ai-009` #1 | `claude mcp add`-style config against a scratch `bracket.ndjson`: *add a 3 mm base plate under the bracket* picks the right tools, fills `request`, reports the appended rows |
| `ai-016` #1 | `npm run mcp:add -- bracket.ndjson`, then `claude mcp list` shows `warpcad` connected and no stale placeholder. This edits the owner's Claude Code MCP config: save it first, restore it after |
| `ai-012` #1 | `npm run dev` plus `npm run mcp:add -- --dev`, a Playwright tab on the dev app: ask for a cube and a sphere; the pairing sentence reads clearly and the change lands |
| `perf-003` #3 | Acceptance scenario 25, steps 1–7, with that loopback client and the lease enabled, plus phone reachability of the access control (390×844) |
| `ai-033` #2 | Scenario 25: raise the AI step limit mid-burst; the next call lands in the same group |
| `ai-023` #2 | `kill -9` a connected client while access is enabled, connect a second immediately and again after five minutes: first refused as ambiguous, then accepted |

## Affected files

- `TODO/VERIFY.md` (each row's Status and Notes)
- `bench/results/ai/` (transcripts for `ai-027` / `ai-028`, if that task's result file lives there)
- `mcp/` recipes, only if `ai-029` #3 shows the guide is cut

## Proposed fix

1. Work in a scratchpad copy of a project file; never the owner's `~/Documents` files.
2. Write a throwaway `--mcp-config` JSON naming `node mcp/server.js <scratch file>` so the owner's
   global config is untouched, except for `ai-016` #1, which tests `mcp:add` itself (back up and restore).
3. Run each prompt with `claude -p` (add `--output-format stream-json` to capture tool calls), then read
   the project file and, for the live-bridge rows, the Playwright page.
4. Record what the client did: tool calls in order, rows appended, file hash, wording seen. A failure is
   a result. File a finding for any defect, with its id in Notes.

## Effort

M (each `claude -p` run is quick; the live-bridge setup is the slow part).

## Testing

- No code change expected unless `ai-029` #3 fails; `npm run spdx` passes.
- Engines: Chromium for the live-bridge tab; phone viewport for `perf-003` #3's reachability step.
- Acceptance scenarios re-driven: 23 (Claude Code edits the file you have open) and 25 (live access).
- Closed-finding regression: `ai-023`'s reported failure (`ai-023` #2).

## Interaction model

Not UI-touching (verification only).

## Documentation

- **Page**: `docs/mcp.md` only if a drive shows its instructions are wrong.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
