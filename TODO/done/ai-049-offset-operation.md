---
title: An offset operation that is exact for any shape
category: ai
kind: finding
priority: low
model: opus
milestone: none — Findings table, split from ai-044 (gap 5) on 2026-11-18
depends: []
status: done
---

> **What shipped (2026-11-19).** `modify.offset` (`distanceMm`) in `src/core/kernel/offset.js`, a mitred vertex offset rather than `@jscad/modeling`'s `expand` (which cannot shrink, rounds every convex edge and is slow; measured in `docs/decisions/geometry-kernel.md`, "Offsetting a solid"). Exact for boxes, L-shapes and cylinders; approximate on spheres and cone tips; refuses a distance past half the thinnest feature and opposed coplanar faces. `add-clearances` now uses it (`distanceMm: 0.2` for a 0.2 mm clearance, not 2 x), with `modify.enlarge` as the fallback. Re-drive on Housing: 0.2 mm exactly (`bench/results/ai/2026-11-19-offset-over-mcp.md`). Three assumed defaults are in OWNER.md as Q103 to Q105.

## Problem

Gap 5 of `ai-041`'s remainder (owner 2026-11-17, OWNER.md Q3: build it). There is no offset operation. `modify.enlarge` scales about the bounds centre: exact for boxes and cylinders, approximate for anything else.

## Affected files

- `src/core/kernel/`, `src/ai/tools/operate.js`, `mcp/skills/add-clearances/SKILL.md`.

## Proposed fix

Add an offset (grow or shrink every face by a distance) through the kernel, and use it in `add-clearances` in place of `modify.enlarge`. Check `@jscad/modeling`'s expand first (`docs/decisions/geometry-kernel.md`); if it is too slow or not manifold-safe on concave parts, say so in the decision record. Each closed gap gets a skill-text edit and a re-drive.

## Effort

M.

## Testing

- Numerical tests: a box and a cylinder match `enlarge`; an L-shaped part grows by the distance on every face (measured), a negative offset shrinks, a distance larger than the thinnest feature is refused, empty result handled. Re-drive `add-clearances` on Housing.
- Acceptance scenarios this could break: none. Closed findings re-run: `ai-041`'s drives (`add-clearances` on the Housing fixture, `create-enclosure` on the Pi fixture).

## Documentation

AI tool: no control. Update `docs/mcp.md` with the tool or action and a worked example call.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
