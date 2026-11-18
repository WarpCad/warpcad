---
title: splitWithJoint with a tongue joint refused on a hollow box
category: ai
kind: finding
priority: low
model: opus
milestone: none — Findings table, split from ai-044 (gap 6) on 2026-11-18
depends: []
status: open
---

## Problem

Gap 6 of `ai-041`'s remainder (owner 2026-11-17, OWNER.md Q3: build it). `modify.splitWithJoint` with a tongue joint is refused on a hollow box ("no room"), so the enclosure lid is split with no joint.

## Affected files

- `src/core/` split-with-joint op, `src/core/kernel/`, `mcp/skills/create-enclosure/SKILL.md`.

## Proposed fix

Work out why the wall leaves no room and make the tongue fit inside the wall thickness, or size it from the wall, so a hollow box splits with a joint. Where the wall is truly too thin the refusal stays, with a message naming the minimum wall. Each closed gap gets a skill-text edit and a re-drive.

## Effort

unscoped.

## Testing

- Numerical tests with explicit tolerances: hollow box with thick and thin walls, a tongue exactly the wall thickness, and the two halves rejoining to the original. Re-drive `create-enclosure` with the lid split jointed.
- Acceptance scenarios this could break: none. Closed findings re-run: `ai-041`'s drives (`add-clearances` on the Housing fixture, `create-enclosure` on the Pi fixture).

## Documentation

AI tool: no control. Update `docs/mcp.md` with the tool or action and a worked example call.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
