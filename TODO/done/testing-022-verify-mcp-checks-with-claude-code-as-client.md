---
title: Drive the VERIFY.md MCP and live-bridge checks with a real Claude Code as the client
category: testing
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-07 from the VERIFY.md drivable-row triage
depends: []
status: done
---

## What shipped

Verification only; no product code changed. Twelve rows were driven on 2026-11-14 with a real Claude Code 2.1.322, headless (`claude -p --model haiku`, which
resolved to `claude-haiku-5-5`, the cheapest model the build offers; owner subscription, no API key), 21 runs in all: 6 for the `ai-028` three-case
drive, 2 discarded (the bench prompt *make me something nice* with Claude Code default tools answered with an Artifact page and never reached
WarpCad; the tool set was cut for every later run), build and check-print (2, which also answer `ai-029` #4's first half), 1 fan duct, 1 bracket plate, and
9 on the dev live bridge (lease off, an ambiguous refusal, a killed client, its second client, the accepted third, an expired lease, and three bursts, one of which
never reached the limit). Answered OK: `ai-029` #2 and #3 (the
guide arrives whole, 10,394 characters, not cut at 2,048, so no recipe fallback), `ai-028` #1 (the agent read `warpcad://guide` unasked in all 6 runs;
table in `bench/results/ai/2026-11-14-mcp-guide.md`), `ai-031` #1, `ai-009` #1, `ai-016` #1 (the owner's `~/.claude.json` was backed up first and
restored; `diff` empty), `ai-012` #1, `ai-033` #2, `ai-023` #2. `ai-027` #1 is **Issue**: on Haiku one of two airfoil runs asked and wrote nothing,
the other built 8 steps without asking (model variance, `FIND-testing-032`). Left Open: `ai-029` #4 (the half that pastes the other-agent paragraph into
a client without prompt support: no such client here) and `perf-003` #3 (a held Library drag during an agent write, and a gizmo drag). Acceptance
23 re-driven (a real Claude edit merged into an opened copy through File, Merge file: `Merged 5 steps from bracket.ndjson`, no dialog, 30 x 20 x 33
mm body) and 25 (steps 2 to 5 and 7, plus phone reachability). Two defects filed: `FIND-ai-037` (`npm run dev` binds `::1` only, so the registered
`127.0.0.1:5183/mcp` refuses: the owner's own `--dev` registration showed `ECONNREFUSED`) and `FIND-ai-038` (a normal client exit leaves its session
counted, so the next client is "ambiguous" for up to five minutes). Also seen, already filed: the Undo AI turn refusal shows internal ids
(`FIND-ui-125`). Social drafts: none.

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

**Decided 2026-11-13 (owner):** consent given for this task to run unattended under `/loop /run-todos`. That covers `ai-028` #1 (the owner starting the loop counts as starting this task) and `ai-016` #1 (edit the owner's Claude Code MCP config: save a copy first and restore it afterwards, and say in Notes that it was restored). The runs use `claude -p` on the owner's subscription; no API key.

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
