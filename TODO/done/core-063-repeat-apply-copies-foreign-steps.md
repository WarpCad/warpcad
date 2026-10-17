---
title: Repeat Apply copies a foreign step on the first part, listed as "Not part of the repeat", instead of disabling Apply
category: core
kind: finding
priority: medium
model: sonnet
depends: [core-061]
status: done
---

> **Retirement note (2026-10-17):** shipped, with these deviations.
>
> **The spec contradicts itself; this is the reading that shipped.** The Problem says "let Apply copy it"; the
> Proposed fix and the Testing section say the foreign step is *listed under Not part of the repeat* and
> *produces no copy of it at every target*. The operative reading is the second one. Apply is enabled, the step
> is listed under **Not part of the repeat** with a one-line reason (*From the Assistant, so it is left out of the
> copies*; Claude Code and a merge read the same), and no copy carries it. Bolt 1 keeps its own step. If the owner
> wanted the copies to *carry* the step, that is a different rule (drop the `skip` list; the control case in
> `repeat.fold.spec.js` shows that behaviour), and the sheet's wording would flip.
>
> **Where the rule was.** Not in `src/core/repeat.js`: the foreign-step refusal was in the Repeat *session store*
> (`src/stores/repeat.js`, `applyReason`), which knows each step's origin. The record has no origin, so leaving a
> step out needed a place to write it down: **`params.skip`**, an optional list of lineage step ids on the
> `pattern.repeat` record (omitted when empty, so every existing file is byte-identical; ids no longer in the
> lineage are ignored, so deleting such a step later cannot break the repeat). The AI `repeat` tool and its schema
> are untouched (the model never writes `skip`; no recorded transcript hash changed).
>
> **How a copy leaves a step out** (`chainFor`, `detachedLineage`): the step passes its input through, so a later
> step of the user's own that read it reads what it read, and no reference can dangle. A copy re-runs from the first
> step that mentions the seed **or the first left-out step, whichever is earlier**, so a foreign step ahead of the
> first Align is not baked into every copy. Detach leaves the step out too, so a detached copy is what the member was.
>
> **"Cannot be copied at all" turned out to be a different set from "foreign".** Every step after a lineage's first
> continues it (`supersedes`; a record that `consumes` starts a new lineage), so a foreign step can always be passed
> through; the only unskippable step is the first (the part itself), refused in the core. The refusals that remain are
> the existing ones, now worded apart from the foreign case in the panel: *Nothing in ... refers to hole1*, *is cut with
> ...* (core-064, kept intact and applied to the steps that are actually re-run, so a left-out step is never mistaken
> for a cut), and one new panel-only sentence for the case that really cannot work: the only step that points at the
> seed is the foreign one (*The only step that points at hole1 is from the Assistant, and it is left out of the
> copies, so there is nothing to repeat. Make that step yourself.*).
>
> **Docs.** `docs/repeat.md` does not exist; the Repeat is documented in `docs/snap-align.md`
> ("Repeating a placement on every hole"), so that is where the foreign-step paragraph and the step-by-step example
> went. The Repeat still (`repeat-sheet.png`) is unchanged: the new reason line only appears when a step is left out.
> E2E: a new case in `e2e/repeat-placement.e2e.js` (the Assistant, scripted through Playwright routing, lifts Bolt 1
> 3 mm mid-session; the panel lists it, Apply stays on, the three copies sit 3 mm below Bolt 1), on all nine projects.

## Problem

`core-061` copies the source body's whole lineage into a repeat. When an Assistant, Claude
Code or merge step sits on the first part, Apply is disabled with *"… has a step you didn't
make … Cancel and make the part by hand"*. The original `core-061` spec said such a step
should instead be listed under *Not part of the repeat*. The user chose that behaviour on
2026-10-17 (question 5 of the decision list): let Apply copy it.

Affected: `src/core/repeat.js` (the foreign-step check) and the Repeat sheet's Apply
gate in `src/components/viewport/RepeatSheet.vue`.

## Affected files

- `src/core/repeat.js` (foreign-step detection and the copy)
- `src/components/viewport/RepeatSheet.vue` (the Apply gate and the *Not part of the repeat* list)
- `src/core/repeat.fold.spec.js`, `src/core/inspector.repeat.spec.js` (update expectations)

## Proposed fix

Replace the disabled-Apply rule for foreign steps. Apply copies the source's lineage
except for steps the user did not make. Those steps are listed under *Not part of the
repeat* with a one-line reason, and they are left out of every repeat. Keep the refusal for
cases that cannot be copied at all, and say which case is which in the sheet's text.

## Effort

M (a few hours). It changes a rule the user had just accepted, so the sheet wording needs
care.

## Testing

- Unit: a repeat from a part with a foreign step applies, lists the step under *Not part of
  the repeat*, and produces no copy of it at every target.
- Unit: a part whose lineage cannot be copied still refuses with a message.
- E2E: a new case in `e2e/repeat-placement.e2e.js` that runs on all 9 projects (three
  viewports, three engines), since the sheet is user-visible.
- Acceptance scenarios: scenario 10 and scenario 15 (repeat and repair), re-driven on laptop
  and phone Chromium.
- Closed-finding regression: `core-061`'s original repro steps, re-run against the new code.
- Engines: all three (the repeat is a WebGL-rendered path).

## Interaction model

- **Precondition**: a repeat is seeded on a body whose first part has a foreign step.
- **Trigger**: Apply in the Repeat sheet, unchanged.
- **Feedback**: Apply is enabled, and the sheet lists the foreign step under *Not part of
  the repeat*.
- **Placement**: n/a. **Selection response**: n/a. **Selection count**: n/a.
- **Small-screen behaviour**: same as desktop. The list reflows inside the sheet.

## Documentation

- **Page**: `docs/repeat.md` (update the section on foreign steps).
- **Example**: step-by-step, a body with an Assistant step, seed Repeat, tap Apply, read
  the *Not part of the repeat* line.
- **Media**: update the Repeat still in `e2e/docs/` if the sheet's appearance changes.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
