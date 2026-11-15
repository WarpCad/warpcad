---
title: Show a body's variable bindings in describe_scene so a model finds set_variable
category: ai
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-15 from the testing-032 drive of ai-014 #1
depends: []
status: open
---

## Problem

`TODO/testing-032` drove `ai-014` #1 through Claude Code over MCP (`claude -p --model haiku`, three runs, fixtures and transcripts in
`bench/results/ai/2026-11-15-claude-code-over-mcp/`). The project held a Raspberry Pi whose `model` was bound to the variable `piModel` (4).
The prompt was *make this case for a Pi 5*. In **all three runs** the model never called `list_variables` or `set_variable`. It placed a
**second** Pi with `model: 5` and built a tray and lid around it, and `piModel` stayed 4.

The cause is what the model could see. `describe_scene` lists the Pi's parts, bounds and size, and says nothing about `model` being bound.
The word `piModel` appears in no tool result. The server instructions (`mcp/server.js`, line 60) do say that to change what every bound body
shares, call `set_variable`, but nothing says that this body is bound, so the instruction has no trigger. The in-app Assistant reads the same
registry, so it has the same blind spot.

## Affected files

`src/ai/tools/read.js` (the `describe_scene` and `describe_body` rows), its spec, `src/ai/tools/description.js` if the tool text changes,
`docs/agent-prompting.md` (generated tool list) and `docs/mcp.md` if they quote the result.

## Proposed fix

Add to each body row in `describe_scene` a compact `boundTo` entry, only when something is bound (`[{ path: "model", variable: "piModel" }]`),
so a project with no variables costs nothing. Keep `describe_body` listing the same with the current value. Then re-run the three-run drive
from `bench/results/ai/2026-11-15-claude-code-over-mcp.md` and count how many runs call `set_variable`.

## Effort

S.

## Testing

Unit specs on the new field (present when bound, absent otherwise, one row per bound slot). A scripted-transcript spec is not enough: re-run the
MCP drive with `claude -p --model haiku` against `fixture-pi.ndjson` and record the calls. Acceptance scenario 21 (variables) re-driven.

## Interaction model

Not UI-touching.

## Documentation

`docs/agent-prompting.md` if the generated tool section changes.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
