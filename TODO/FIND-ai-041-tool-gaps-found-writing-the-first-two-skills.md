---
title: Tool gaps found writing the first two skills (no part copy, no body rename, no offset, no per-part clearance)
category: ai
kind: finding
priority: low
model: opus
milestone: none — Findings table, filed 2026-11-15 when `ai-035` closed
depends: []
status: open
---

## Problem

Writing `add-clearances` and `create-enclosure` (`ai-035`), and driving them with Claude Code over MCP
(`bench/results/ai/2026-11-15-skills-over-mcp.md`), met these gaps. The skills work around each one. None is a defect on its own; together they
make the skills longer and less exact than they need to be. Decide which are worth a tool.

1. **A boolean on a part of a group uses up the whole group.** `boolean.subtract` with `{ id: group, pieces: "Base" }` returns a plain solid with no
   parts; the other parts vanish. The `add-clearances` skill rebuilds the group in one call. Seen in the first drive (`run1`), where the Pin was lost.
2. **No tool shows a part's op and params, or copies a part.** `get_timeline` rows carry no params, and a consumed step cannot be described. The skill
   can rebuild only a box (from `evaluate_formula` bounds); a round pin is left alone.
3. **No tool names or renames a body.** `create` takes no `name`. A rebuilt group is "Group 1".
4. **`check_clearance` and `measure` take whole bodies, not parts of a group**, so the gap between two parts of one group is by construction, not measured.
5. **No offset operation.** `modify.enlarge` scales about the bounds centre: exact for boxes and cylinders, approximate for anything else.
6. **`modify.splitWithJoint` with a tongue joint is refused on a hollow box** ("no room"), so the enclosure lid is split with no joint.
7. **Keep-out parts other than a Raspberry Pi's mounting holes consume the whole part when subtracted**, so the enclosure skill cuts port openings with separate cutter bodies sized from the keep-outs.
8. **No direct parameter edit**: changing a placed body's size means a variable and `bind_param`, or a new step.

## Affected files

- `src/ai/tools/` (read, operate, create), `src/core/kernel/registry.js` for 1 and 7, `mcp/skills/*/SKILL.md` once a gap closes.

## Proposed fix

Do not implement here. Triage with the owner. Likely order: 1 (a part-preserving boolean, or a result that keeps the other parts), 3 (a name on `create`
and a rename tool), 4 (a part-aware `check_clearance`). Each closed gap shortens a skill and gets a skill-text edit and a re-drive.

## Effort

S each for 3 and 4; M for 1, 2 and 5; unscoped for 6.

## Testing

- Unit next to each tool. The matching skill is re-driven with `claude -p --model haiku` on the subscription, never an API key, as `ai-035` did.
- Acceptance scenarios this could break: none. Closed findings re-run: `ai-035`'s drive.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
