---
title: Move the hand-built sheets, popouts and segmented pickers onto the base components
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-14 when the theme umbrella (ui-111) closed
depends: []
status: open
---

## Problem

The theme chain (`ui-114`–`ui-118`) left some controls on their own markup and CSS, deliberately, to avoid forcing a base
component onto something that behaves differently. They still pass the guard (it covers colour, layering and type, not
shape or layout), but a restyle of dialog frames, menus or segmented pickers does not reach them:

- `layout/HelpSheet.vue` and `layout/UserPartMenu.vue` are hand-rolled frames. `ui-116` listed them last because they differ most
  (HelpSheet routes by hash and is `aria-modal`; UserPartMenu has a clear and a dimmed backdrop).
- `storage/FileMenu.vue` and the two Library popouts are menus, not dialogs. `ui-116` said to leave them unless a `BaseMenu` earns its place.
- 17 hand-built segmented rows (`aria-pressed` groups, `radiogroup`, `tablist`) and the Inspector tabs still carry their own
  rules; `ui-115` built `SegmentedToggle` but left the adoption to the sweep, and `ui-118` did not do it.
- About 26 components still define their own `.…btn`/`.…button` rule (layout-specific ones are legitimate); `ui-114` listed
  `sketch/ExtrudePanel`, `SketchProfileFields`, `SketchPanelSheet`, `inspector/Inspector.vue`, `ParamBindPopover` and
  `FormulaInsertList` as left for a decision.

## Goal

Decide each item and act: adopt the base component where behaviour matches, or record why it stays its own component (a
one-line comment at the top of the file is enough). Candidates for adoption first: `SegmentedToggle` for the plain
`aria-pressed` rows, `BaseDialog`/`BaseSheet` for `UserPartMenu` and `HelpSheet`. Add a `BaseMenu` only if three or more menus
share a frame.

## Testing

- Each adopted component keeps its `data-testid`s, so existing `*.e2e.js` specs stand. Run them on the rotating pair, plus the
  layout specs at all three viewports; zero snapshot diffs unless the frame deliberately changes.
- Re-run `ui-116`'s and `ui-115`'s reproductions (backdrop, focus return, roving tabindex).
- `npm run docs:media` if a docs picture shows one of these.
- Docs: no new control, so no new page; update any step text that names a changed label.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
