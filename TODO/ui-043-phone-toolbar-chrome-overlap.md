---
title: At 390px the navigation chrome rides up over the Operations toolbar when one body is selected and the Inspector sheet is open
category: ui
kind: finding
priority: medium
model: sonnet
milestone: M6
depends: []
status: open
---

## Problem

Found by measuring bounding rectangles while building `ui-041`, and **present on the commit
before that task** (identical numbers with `ui-041`'s changes stashed): at **390x844**, with
exactly **one** body selected and the Inspector's bottom sheet open, the navigation chrome
overlaps the Operations toolbar by **21px**.

Measured (WebKit, phone viewport): Operations toolbar `top 61, bottom 228`; navigation chrome
`top 207, bottom 407`; Inspector `top 426`. The chrome's "Orbit / Pan / Select" row lands on the
toolbar's last button row (Enlarge / Fit / Bisect), which is the state a hand-drive of the app
shows in a screenshot and a `.spec.js` cannot.

**Why.** `AppView.vue` insets the viewport's overlays by `--viewport-bottom-inset`, and
`--inspector-sheet-height` (38vh) is a *constant*. The toolbar's height is not: with one body
selected its badge wraps to two lines (`1 selected` / `select 2 or more solids`), so the toolbar
is ~167px tall; with two selected and the Objects sheet open it measured 152px (`bottom 213`,
a 28px gap to a chrome at `top 241`). The Inspector-sheet-open + two-selected combination was
**not** measured, so whether the overlap is specific to one selected body is unconfirmed. `ui-040`'s retirement note
already recorded "~4px of slack" between the two at 390px — the margin has been that thin
since; nothing re-checked it when the badge text grew.

## Affected files

- `src/views/AppView.vue` — the phone `--viewport-bottom-inset` arithmetic.
- `src/components/viewport/OperationsToolbar.vue` — the badge's wrap at phone width.
- `src/components/viewport/NavigationChrome.vue` — its bottom anchoring.

## Proposed fix

Either stop the badge wrapping at phone width (a shorter `select 2+` string under 640px) or
anchor the chrome relative to the toolbar's real bottom rather than to a constant sheet height.
Do not "fix" it by shrinking the sheet: `--bottom-panel-height`'s own comment records why 34vh
was already the arithmetic ceiling for History.

## Effort

S.

## Testing

- A real `*.e2e.js` at 390x844 that selects one body (Inspector open, then Objects open, then
  History open) and asserts the toolbar and the chrome **do not intersect**, and that every
  toolbar button and the chrome's Orbit/Pan/Select pass a trial click. `ui-035`'s phone spec is
  the pattern.
- **`ACCEPTANCE.md` scenarios 4 and 7** re-driven at phone width. Extends the subsystem `ui-010`,
  `ui-035`, `ui-040` and `ui-032` each found a phone overlap in; re-run their original repros.
