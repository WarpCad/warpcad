---
title: Interaction-model Q&A for every §7 control, before the roadmap is written
category: ui
kind: feature
priority: high
model: sonnet
milestone: M0
depends: []
status: done
---

## Goal

Answer `.claude/commands/feature.md` Phase 1's Q10-16 for every control named in
`Initial design.md` §7, in writing, **before** any `TODO/ROADMAP.md` entry names these
as tasks — per `CLAUDE.md`'s explicit ordering ("walk through the interaction-model
questions... before writing the roadmap entry, not after"). The six controls:

1. Drag-place a primitive (§7a, no snap guide — nothing else in the scene yet)
2. Drag-place a hardware/kit-part item with snap guides against existing geometry (§7a)
3. Selecting an item → inspector + dimension lines + gizmo (§7b)
4. Gizmo move/rotate ↔ numeric-field sync (§7b)
5. Boolean operation (union/subtract/intersect) with selection-count gating (§6's
   Operation table)
6. Group selection vs. clicking a sub-part inside an already-selected group (§7b,
   `Group.pick`)

Done when: each of the six has a written Q10-16 answer set (§7's existing
precondition/trigger/feedback prose is the starting point, not a substitute — Q11/15/16
specifically need the exact operand/selection counts and the phone-width (390px)
behavior spelled out per-control, which §7 states in prose but not in the Q10-16
checklist shape), reviewed and ready to seed both `docs-003`'s `TODO/ROADMAP.md` task
specs and `docs-004`'s `TODO/ACCEPTANCE.md` scenario write-ups.

## Interaction model

n/a for this task itself — it *produces* the interaction-model answers for other
tasks; it doesn't add a control of its own.

## Documentation

n/a — this task's output feeds other tasks' own Documentation sections later; it is
not itself an end-user `docs/` page.

## Affected files

- `docs/decisions/interaction-model-qa.md` (new — the six Q&A write-ups)

## Proposed fix

For each of the six controls, write out Q10-16 concretely, reusing §7a/§7b's
precondition/trigger/feedback drafts as the starting point and confirming what those
sections leave implicit:
- Q11/15 (exact operand/selection count) — §6's Operation table already states counts
  per operation; make sure each maps to a concrete "control disabled unless exactly N
  selected" statement.
- Q16 (phone-width behavior) — §7c sketches the bottom-sheet pattern generally; confirm
  it per-control (e.g. does the inspector bottom-sheet auto-open on selection at phone
  width, or require a tap?).
- Q17 (does this need a new `TODO/ACCEPTANCE.md` entry, or extend an existing one?) —
  cross-reference against §9's 8 draft scenarios.

## Effort

M (a few hours)

## Testing

n/a — this task produces a planning document, not code. No `.spec.js`/`.e2e.js`.
Acceptance scenarios: none run by this task directly, but its output is the direct
input `docs-004` needs to write real (not provisional) scenario steps. No closed
findings to re-check.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
