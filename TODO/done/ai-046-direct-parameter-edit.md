---
title: A direct parameter edit for a placed body
category: ai
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, split from ai-044 (gap 8) on 2026-11-18
depends: []
status: done
---

> **What shipped:** a standalone `set_params` tool (`src/ai/tools/params.js`) rather than an `operate` action, because `operate` only builds records for registry ops and a resize swaps a creation record in place. It takes `{ id, part?, params: [{ name, value }] }` (a name/value list, since the strict tool schema forbids a free-form object) and goes through the Inspector's `paramEditRecord`, `impactOf` and `reviseRecords`, as an AI-origin write. It refuses an unknown name (listing the real ones), a value the op rejects, a body made from operands, a variable-bound parameter (pointing at `set_variable`), and a size a later step can't build at. `RESERVED_PARAMS` is now exported from `paramEdit.js`. The `ai-041` drives (`add-clearances`, `create-enclosure`) were not re-run with `claude -p`: the change only adds a tool and edits no existing one. The skill text was not changed.

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
