# CAD — Componentize Page Controls Audit Prompt

It is an analysis-only pass: it must not edit, refactor, or "fix" any source file —
it only produces a report.

---

## Prompt

Audit the Vue views in `src/views/` for page-control componentization opportunities.
This is an ANALYSIS pass only — do not write or edit any code. Produce a report.

Context:
- Start by measuring, not assuming: run `wc -l src/views/*.vue` and rank the views by
  size. Target the largest and most control-dense ones first.
- If any view is already well componentized (imports most of its UI from
  `src/components/<category>/`, holds only layout and wiring), use it as the bar for
  "well factored" and don't propose changes to it unless something was clearly missed.
- Standard component categories already in use (extend only if nothing fits, and match
  `CLAUDE.md`'s Component Categories list exactly): `viewport/`, `timeline/`,
  `features/`, `sketch/`, `inspector/`, `storage/`, `ai/`, `layout/`, `controls/`,
  `display/`. Components live in `src/components/<category>/`.
- Project conventions: props in / events out, no reaching into parent state; dark mode
  is the primary theme, light mode via `prefers-color-scheme`, styled with CSS custom
  properties (not hardcoded colors) so components stay themeable; every component
  eventually needs a `.spec.js`, a component-workshop story, and `data-testid`
  attributes on interactive elements (don't write these yet — just flag testability).

For each monolithic view, identify:

1. **Distinct control sections** (tool option bars, property/dimension fields, unit-aware
   numeric inputs, snap and constraint toggles, layer/visibility lists, button groups,
   menu items, dialogs) that are self-contained enough to extract as
   props-in/events-out components.
2. **Duplicated or near-duplicated control markup** across two or more views — repeated
   button styling, repeated numeric-input patterns, repeated confirm-dialog usage.
   These are the highest-value extractions, since they'd become a single shared
   `controls/` or `display/` component instead of N copies. In a CAD UI the recurring
   one to look for specifically is the **unit-aware numeric field** (a number plus a
   unit, with parsing, clamping, and increment behavior) — if it's been reimplemented
   per panel, that's finding number one.
3. **Geometry or coordinate math living in the view.** This does *not* become a
   component — it belongs in `src/core/` or a composable. Report it separately from the
   component proposals, because extracting a component around untestable math just
   moves the problem.
4. **Document mutations that bypass the command/history layer** (breaking undo) —
   report these too; they constrain how a section can be extracted.
5. Anything hardcoding colors or spacing inline that would block theming if left as-is.

Output format: a markdown report, one section per view, each listing:
  - proposed component name, category, and one-line responsibility
  - which lines/section of the current view it would replace
  - whether it's view-specific or a candidate for cross-view reuse
  - current testability blockers (e.g. "mixed with canvas access", "reads parent refs
    directly", "does its own coordinate transform")

End with a prioritized top-5 list of extractions ranked by
reuse-value × current pain (hardest to test today, most duplicated).

---

## After the audit

Feed the report's top candidates into the `/refactor-ui` skill one view (or one
cross-cutting component) at a time — that skill handles the actual red/green TDD
extraction, component-workshop stories, and E2E coverage.

Anything the report flagged under items 3 and 4 above goes to `/tdd` or `/fix-todo`
instead: it's a logic move, not a component extraction.
