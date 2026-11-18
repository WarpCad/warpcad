---
title: Keep-out parts consumed whole when subtracted
category: ai
kind: finding
priority: low
model: opus
milestone: none — Findings table, split from ai-044 (gap 7) on 2026-11-18
depends: []
status: open
---

## Problem

Gap 7 of `ai-041`'s remainder (owner 2026-11-17, OWNER.md Q3: build it). Keep-out parts other than a Raspberry Pi's mounting holes consume the whole part when subtracted, so the enclosure skill cuts port openings with separate cutter bodies sized from the keep-outs.

## Affected files

- `src/core/kernel/registry.js`, `src/ai/tools/operate.js`, `mcp/skills/create-enclosure/SKILL.md`.

## Proposed fix

Scope first: find which keep-out kinds consume the whole part and why the Pi holes do not. Then make a subtract of a keep-out cut only its keep-out volume, and shorten the enclosure skill to use it for port openings. Each closed gap gets a skill-text edit and a re-drive.

## Effort

unscoped.

## Testing

- Kernel unit tests with explicit tolerances for each keep-out kind, including a zero-overlap and a coincident-face case. Re-drive `create-enclosure` on the Pi fixture with `claude -p --model haiku`.
- Acceptance scenarios this could break: none. Closed findings re-run: `ai-041`'s drives (`add-clearances` on the Housing fixture, `create-enclosure` on the Pi fixture).

## Documentation

AI tool: no control. Update `docs/mcp.md` with the tool or action and a worked example call.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
