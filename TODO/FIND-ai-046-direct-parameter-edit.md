---
title: A direct parameter edit for a placed body
category: ai
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, split from ai-044 (gap 8) on 2026-11-18
depends: []
status: open
---

## Problem

Gap 8 of `ai-041`'s remainder (owner 2026-11-17, OWNER.md Q3: build it). There is no direct parameter edit: changing a placed body's size means a variable and `bind_param`, or a new step.

## Affected files

- `src/ai/tools/operate.js`, `src/core/` command layer, the matching skill text.

## Proposed fix

Add an `operate` action that sets a placed body's op parameter (size, radius, height) through the command layer, in one transaction with the AI origin. It refuses an unknown parameter name and a value the op rejects. A bound parameter is refused with a pointer to its variable. Each closed gap gets a skill-text edit and a re-drive.

## Effort

S.

## Testing

- Unit next to the tool: edit a box's width, the rebuilt geometry changes; undo of the AI turn reverts it; a bound parameter is refused. Re-run the `ai-041` drives (`add-clearances` on Housing, `create-enclosure` on the Pi fixture).
- Acceptance scenarios this could break: none. Closed findings re-run: `ai-041`'s drives (`add-clearances` on the Housing fixture, `create-enclosure` on the Pi fixture).

## Documentation

AI tool: no control. Update `docs/mcp.md` with the tool or action and a worked example call.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
