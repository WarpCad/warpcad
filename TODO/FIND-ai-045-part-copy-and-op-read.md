---
title: A tool to read a part's op and params, and to copy a part
category: ai
kind: finding
priority: low
model: opus
milestone: none — Findings table, split from ai-044 (gap 2) on 2026-11-18
depends: []
status: open
---

## Problem

Gap 2 of `ai-041`'s remainder (owner 2026-11-17, OWNER.md Q3: build it). No tool shows a part's op and params, or copies a part. `get_timeline` rows carry no params, and a consumed step cannot be described. The `add-clearances` skill can rebuild only a box (from `evaluate_formula` bounds); a round pin is left alone.

## Affected files

- `src/ai/tools/read.js`, `src/ai/tools/create.js` (or `operate.js`), `mcp/skills/add-clearances/SKILL.md`.

## Proposed fix

Add a read that returns a step's op and params, including a consumed step, and a copy of a part (a new body with the same op and params, optionally named). Then let `add-clearances` rebuild a round pin from the copy instead of leaving it alone. Each closed gap gets a skill-text edit and a re-drive.

## Effort

M.

## Testing

- Unit next to each tool: a consumed step reads back its params; a copy of a cylinder matches its source and is independent of it. Re-drive `add-clearances` on the Housing fixture with `claude -p --model haiku` (subscription, never an API key), now including a round pin.
- Acceptance scenarios this could break: none. Closed findings re-run: `ai-041`'s drives (`add-clearances` on the Housing fixture, `create-enclosure` on the Pi fixture).

## Documentation

AI tool: no control. Update `docs/mcp.md` with the tool or action and a worked example call.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
