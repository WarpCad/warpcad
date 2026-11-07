---
title: Drive the VERIFY.md model-behaviour rows through Claude Code over MCP instead of an API key
category: testing
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-07 from the VERIFY.md drivable-row triage (third pass)
depends: []
status: open
---

## Problem

The in-app Assistant needs an Anthropic API key, and none exists in this environment. Several
`TODO/VERIFY.md` rows that say "with a real key" mainly ask what a real model does with WarpCad's tools.
Does it call `set_variable` instead of hunting? Does it land `outside+` on the − side? Does it notice the
knife-edge warning? Does it read a drawing's callouts? The MCP server exposes the **same tool registry**
(`src/ai/tools/`, `docs/decisions/ai-partner.md`), and Claude Code runs on the owner's subscription. So
`claude -p` against `mcp/server.js` answers the model-behaviour half. The in-app half (the chat panel, the
cost chip, the fork-and-merge turn) still needs a key and stays in VERIFY.md.

`docs-029` #1 also asks a model with web access, and only the deployed URL, to write the box-and-lid
prompt. A fresh agent with web fetch is that model.

Rows (entry and row number in `TODO/VERIFY.md`; abridged, the full text is in VERIFY.md):

| Row | Check |
|---|---|
| `docs-029 #1` | After deploy, give a model with web search only `https://app.warpcad.com/help/agent-prompting.html` (and separately `https://app.warpcad.com/llms.txt`) and ask it to write the box-and-lid prompt. Record whether it found the… |
| `ai-014 #1` (part) | With a real key, a project holding a bound `piModel`: type *make this case for a Pi 5*. Does it call `set_variable` (not `list_ops`/`operate` hunting for the Pi), and does the row read *Set piModel to 5* with the impact line? |
| `ai-022 #1` (part) | With a real Assistant key, ask it to snap a body with `outside+` onto another and say which side it lands on. It should answer the − side, and the result should match. |
| `ai-010 #1` (part) | Run scenario 17 live with a real key at laptop and at phone (touch), exactly as `TODO/ACCEPTANCE.md` says, and save the transcript and cost under `bench/results/ai/`. A FAIL recorded as FAIL is a good result |
| `ai-010 #2` (part) | Run scenario 18 live with a real key (`e2e/fixtures/drawing-board-85x56.png`): does it read the callouts, set scale first, ask about or flag the connector heights, and give an honest overlay residual? (also `ai-008` VERIFY row 1) |
| `ai-010 #3` (part) | Real finding to watch in the live 17 run: the airfoil's default knife-edge trailing edge is a 0 mm wall, which `check_printability` flags as unprintable at a 0.4 mm nozzle. Does the real model notice the warning and fix it… |
| `ai-008 #1` (part) | Run scenario 18 with a real key: does the model read the callouts into a table, set scale before building, and ask about or flag the connector heights instead of stating them? Read the residual it reports against the overlay… |

## Affected files

- `TODO/VERIFY.md` (each row's Notes, and Status for `docs-029` #1)
- `bench/results/ai/` (transcripts and outcomes, dated, labelled "Claude Code over MCP, not the in-app Assistant")

## Proposed fix

1. Scratch project files only, with a throwaway `--mcp-config` as in `testing-022`.
2. Scenario 17 and 18 (`ai-010` #1-#3, `ai-008` #1): follow `TODO/ACCEPTANCE.md`'s steps through
   `claude -p --output-format stream-json`. For 18, give the agent `e2e/fixtures/drawing-board-85x56.png`
   to read. Record tool calls in order, the final project and `check_printability`'s output. A FAIL is a
   result.
3. `ai-014` #1 and `ai-022` #1: build the fixture project (a bound `piModel`; two bodies to snap), give the
   row's prompt, and check the calls and the result.
4. `docs-029` #1: a fresh agent (no fork) with only web fetch and the two URLs writes the box-and-lid
   prompt. Check it used the exact tool names the row lists.
5. Note in every transcript that the system prompt differs from the in-app Assistant's, so a pass here is
   evidence about the tools, not about the chat panel.

## Effort

M.

## Testing

- No code change expected; `npm run spdx` passes.
- Engines: n/a (no browser, except screenshots of the result in Chromium).
- Acceptance scenarios: 17 (Airfoil and wing) and 18 (A drawing becomes a library part), MCP route.
- Closed-finding regression: none.

## Interaction model

Not UI-touching.

## Documentation

- **Page**: `docs/agent-prompting.md`, only if `docs-029` #1 shows the page misleads a model.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
