---
title: Tool gaps left after ai-041 (no part copy or op read, no offset, a splitWithJoint refusal, keep-out consumption, no direct parameter edit)
category: ai
kind: finding
priority: low
model: opus
milestone: none — Findings table, filed 2026-11-17 as the remainder of ai-041
depends: []
status: open
---

## Problem

`ai-041` built gaps 1 (a boolean on one part of a group keeps the other parts), 3 (a name on `create`, and `style.rename` in `operate`) and 4 (`check_clearance` between parts of one group). These five gaps were left open when it closed. The skills work around each one, so none is a defect on its own.

2. **No tool shows a part's op and params, or copies a part.** `get_timeline` rows carry no params, and a consumed step cannot be described. The `add-clearances` skill can rebuild only a box (from `evaluate_formula` bounds); a round pin is left alone.
5. **No offset operation.** `modify.enlarge` scales about the bounds centre: exact for boxes and cylinders, approximate for anything else.
6. **`modify.splitWithJoint` with a tongue joint is refused on a hollow box** ("no room"), so the enclosure lid is split with no joint.
7. **Keep-out parts other than a Raspberry Pi's mounting holes consume the whole part when subtracted**, so the enclosure skill cuts port openings with separate cutter bodies sized from the keep-outs.
8. **No direct parameter edit**: changing a placed body's size means a variable and `bind_param`, or a new step.

## Affected files

- `src/ai/tools/` (read, operate, create), `src/core/kernel/registry.js` for 7, `mcp/skills/*/SKILL.md` once a gap closes.

## Proposed fix

Do not implement here. Triage with the owner before building, as `ai-041` did. Each closed gap shortens a skill and gets a skill-text edit and a re-drive.

## Effort

S for 8 if it is only a convenience; M for 2 and 5; unscoped for 6 and 7.

## Testing

- Unit next to each tool. The matching skill is re-driven with `claude -p --model haiku` on the subscription, never an API key.
- Acceptance scenarios this could break: none. Closed findings re-run: `ai-041`'s drives (`add-clearances` on the Housing fixture, and `create-enclosure` on the Pi fixture).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
