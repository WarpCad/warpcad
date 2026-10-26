---
title: Group the Operations toolbar into launchers between laptop and phone width
category: ui
kind: feature
priority: high
model: opus
milestone: M1
depends: [ui-079]
status: done
---

> ## What actually shipped
>
> As specified. The group table and `groupStates` live in `src/core/operationGroups.js` (the
> `core/library.js` precedent), with the popover in `OperationsGroupPopover.vue`; the toolbar reuses its
> existing gates, titles and handlers. Additions beyond the file: the group pop-out also closes on Escape
> (focus returns to the launcher), on an outside press, and when a selection change leaves no member able
> to run; an Escape with a group open no longer cancels an armed Repeat; `OperationsGroupPopover.vue` is
> an exception in `helpButtons.spec.js` (members that open popovers carry their own help). A disabled
> launcher's `title` is the lead member's reason ("Select 2 or more solids"); its `aria-label` adds the
> group name. Scenarios 4 and 16 hand-driven at 720x900 in WebKit and Chromium (PASS; the real-mouse
> canvas Shift-click gap recorded on 2026-10-21 still exists, so the second operand came from the Objects
> check). `ui-043` and `ui-015` repros re-run: clear at 390, 820 and 720. Three failures also present on
> clean `HEAD` are filed as `testing-009`.

## Goal

Split from `TODO/FIND-ui-079-tiered-library-and-operations-panels.md`, stage 6. When the viewport
pane falls into the groups range (about 641–741 px page width with no chat), the Operations
toolbar becomes one row of **group launchers**. Each opens a pop-out with labelled members.
`ui-079` stages 1–3 provide `data-ops-tier`, the icons tier and the shared `openPopout` field;
this file adds the groups tier on top.

Creation and operation stay separate (CLAUDE.md, Interaction Model). The groups are hand-written
from the table below, not derived from the operation registry.

## Interaction model

### Operations, groups tier

- **Precondition**: the viewport pane `P` is in the groups range.
- **Trigger**: the toolbar becomes the badge plus one row of **group launchers**, each a
  `--tap-compact` square with a glyph and a small ▾:

  | Group | Members (existing buttons, same test ids) |
  |---|---|
  | Combine | Union, Subtract, Intersect, Group |
  | Arrange | Align, Repeat, Mirror |
  | Shape | Fillet, Chamfer, Enlarge, Fit, Bisect, Split |
  | To library | stays a standalone button (one member; a group would add a tap for nothing) |

  Tapping a group launcher opens its **group pop-out** under it: a vertical list of the members
  **with labels**, each with its own enabled/disabled state and its existing reason text. Member
  buttons keep their `data-testid`s (`operation-union`, `op-repeat`, …). Tapping an enabled member
  runs it exactly as the toolbar button does today. For members that open their own popover (Align,
  Fillet/Chamfer, Enlarge/Fit/Bisect, Split, Repeat), the group pop-out closes first, then that popover
  opens where it does today.
- **Selection count** (CLAUDE.md's selection-count rule; must survive grouping):
  - A group launcher is **disabled** when none of its members can run with the current selection. Its
    `title` gives the most relevant reason (for example "Select 2 or more solids" for Combine).
  - When some members are enabled, the launcher shows a small count badge with how many, so enablement
    can be read before opening it.
  - The group must never be offered as a flat list of every registered operation.
- **Feedback**: the launcher shows an open state and `aria-expanded`. The pop-out lists members with
  live enablement. A run's existing feedback (record, highlight, error line) is unchanged.
- **Only one pop-out at a time** across both panels (shared `openPopout`, see `ui-081`). A group
  pop-out may cover the Library while open; say so in a comment, as `ui-081` does for the reverse.
- **Small-screen behavior**: phone (≤ 640 px) is unchanged and keeps three rows of icons (the decision
  confirmed 2026-10-21). Phone does not adopt groups in this task.

## Documentation

- **Page**: `docs/booleans.md` (Operations toolbar). Add a section "Grouped toolbar on narrow windows"
  with the example below. Add a pointer from `docs/mobile.md` (owned by `ui-079` stage 8) to it.
- **Example** (verbatim steps for the page):
  1. Narrow the window to about 720 px with two bodies selected. The Operations toolbar shows
     **Combine ▾** with a "4" badge.
  2. Tap **Combine ▾**. Its pop-out lists Union, Subtract, Intersect and Group, each labelled.
  3. Tap **Union**. The pop-out closes and the two bodies are combined.
  4. With one body selected, tap **Combine ▾** again. It is disabled, and its title says "Select 2 or
     more solids".
- **Media**: `e2e/docs/narrow-window.docs.js` (shared with `ui-081`/`ui-079`):
  - `docs/screenshots/operations-groups.png` (720×900, Combine open, two bodies selected)
  Regenerate the existing booleans shots that change (`npm run docs:media`).

## Affected files

- `src/components/viewport/OperationsToolbar.vue` (2398 lines): add the group launchers and the group
  pop-out. Existing per-button gating functions are reused, not re-derived.
- `src/components/viewport/OperationsGroupPopover.vue` (new): keeps the toolbar file from growing.
- `src/components/viewport/OperationsToolbar.spec.js`: the groups-tier cases.
- `docs/booleans.md`, `docs/mobile.md` (pointer only), `e2e/docs/narrow-window.docs.js`, the screenshot.

## Proposed fix

1. Add the group table as data in one place, and a unit-tested function that maps each group to its
   member enablement and its count badge.
2. Render group launchers in the groups tier (`data-ops-tier="groups"`); the icons CSS rule already
   covers the groups tier, so the group styles must not regress it.
3. Add the group pop-out and hand off to member popovers (the group closes first).
4. Wire the shared `openPopout` so only one pop-out is open across both panels.

## Effort

M. Mostly data and gating, with one new component. Depends on `ui-079` stages 1–3 (see `ui-081`'s
note: confirm they are committed before starting).

## Testing

- **Unit (`OperationsToolbar.spec.js`, extended)**: in the groups tier, Combine is disabled with one
  solid selected and shows a 4 badge with two selected. Shape's badge counts only the exactly-one
  members. Member test ids are present inside the open pop-out.
- **E2E (`e2e/panel-tiers.e2e.js`, navigates to `/`, shared with `ui-079`/`ui-081`)**:
  - At 720, select two cubes and check Combine is enabled with a badge. Open it, run Union and check the
    union record. With one cube selected, check Combine is disabled.
  - Widen past a breakpoint with a group pop-out open and check it closes with no orphaned element.
- **Engines**: all three (Chromium, Firefox, WebKit), per the Browser Support rule (touch and layout).
- **Viewports**: 720×900 for the groups tier (no reference viewport reaches it), plus the phone
  reference to confirm phone is unchanged.
- **Existing specs to re-run**: `boolean-operations`, `phone-toolbar-chrome-fit`, `viewport-scaffold`.
- **Acceptance scenarios to re-drive** (`TODO/ACCEPTANCE.md`) at ~720 px in WebKit and one other engine:
  **4** (boolean gating) and **16** (mirror), the two that depend on Operations gating.
- **Closed findings whose repro steps must be re-run**: `ui-043` (phone toolbar overlaps navigation
  chrome; label hiding) and `ui-015` (tablet toolbar overlaps the gizmo's view caps; the container cap
  must still hold in the groups tier).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
