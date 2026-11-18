---
title: splitWithJoint with a tongue joint refused on a hollow box
category: ai
kind: finding
priority: low
model: opus
milestone: none — Findings table, split from ai-044 (gap 6) on 2026-11-18
depends: []
status: done
---

> **Shipped (2026-11-18):** a new recipe, `src/core/kernel/recipes/joint.tongueWall.js`, runs when the ordinary tongue search finds nothing. It measures the wall by bisecting an exact containment probe and sizes the rib from it: tongue and each side wall are `(wall − 2 × clearance) / 3`, none under 0.5 mm, so a 2 mm wall takes a 0.53 mm rib. One rib per side that has a clear stretch (up to four). Each is confirmed by `tongueMisfit`, which now takes a per-rib `wallMm`. A wall under `1.5 + 2 × clearance` (1.9 mm at 0.2) is refused, and the message names it. `create-enclosure` now splits with `joint: "tongue"`. The Pi-sized shell with ports re-drove clean in the kernel (4 ribs, both pieces watertight); the skill itself was not re-run with `claude -p` because the warpcad MCP server was down.


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
