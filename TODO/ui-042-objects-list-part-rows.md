---
title: Expandable part rows in the Objects list, so a hidden body's sub-part can be a boolean operand
category: ui
kind: feature
priority: low
model: sonnet
milestone: M6
depends: [ui-041]
status: open
---

## Goal

`ui-041`'s Objects list selects **whole bodies**. That is enough to select a fully enclosed
bolt and subtract it from its shell (measured: the result is the shell's volume minus the
bolt's, exactly), but not to address one *piece* of an enclosed composite — `hardware.bolt`'s
`tap`, a Raspberry Pi's `ethernet` jack — because drilling into a part is still a **second
viewport click** (`ui-016`), and an enclosed body cannot be clicked once.

"Done" looks like: with a Raspberry Pi board enclosed in a case shell, the user can expand its
row in the Objects list, tap `ethernet`, add the shell, and Subtract — getting the port
opening (`ui-040`'s worked example: a 1 207.743 mm3 opening, not the 5 661.317 mm3 whole-board
footprint) without moving anything.

For `hardware.bolt` this changes no geometry (`ACCEPTANCE.md` scenario 5: the whole bolt and
its `tap` cut the same hole); it matters for the composites where a part is smaller than its
parent.

## Interaction model

- **Precondition** — the body's geometry is a Group with at least one named, visible part
  (the same condition `createBodyObject` uses to build a container rather than a bare mesh).
- **Trigger** — a disclosure chevron at the right of a composite body's row in the Objects
  list, `objects-expand-<id>` (44px, `aria-expanded`); tapping a child row calls
  `selection.select(bodyId)` then `selection.drillInto(partName)` — the same two calls a
  second viewport click makes. Bare solids get no chevron.
- **Feedback** — child rows indented under the parent, the selected one filled; the Inspector's
  existing breadcrumb (`Bolt 1 ▸ tap`) and the drilled-in dimension lines, exactly as after a
  second click.
- **Selection count** — a child row is never counted as a second body: `selection.count` is
  unchanged by depth (`ui-040`'s invariant). The parent's check keeps adding/removing the
  whole body and leaves a depth alone, as `toggle` does.
- **Small-screen behavior** — the same sheet; child rows are 44px and the sheet scrolls. Hidden
  parts (`hidden: true`, e.g. a tap-clearance solid) **are** listed, because they are exactly
  what a boolean wants to address, and are labelled as hidden.

## Documentation

- **Page** — `docs/selection-and-inspector.md`'s Objects section, replacing its "One limit"
  paragraph.
- **Example** — select an enclosed Raspberry Pi's `ethernet` from the list, add the case shell,
  Subtract, and read the volume difference off the Inspector.

## Affected files

- `src/stores/objectsPanel.js` — `ObjectRow` gains `parts`; needs the part names, which
  `BodySummary` does not carry today (`summarizeBody` reads bounds and volume only).
- `src/stores/document.js` — `summarizeBody` gains `partNames`.
- `src/components/layout/ObjectsPanel.vue` — the chevron and child rows.
- `e2e/objects-panel.e2e.js` — the enclosed-composite case.

## Effort

M — the selection calls exist; the work is exposing part names through the summary and the
row-tree keyboard/touch behaviour.

## Testing

- A real `*.e2e.js` against `/`: an enclosed composite, expand, tap a part, add the shell,
  Subtract, volume measured against the kernel; three viewports, Chromium + WebKit.
- **`ACCEPTANCE.md` scenario 5** (the sub-part half for an enclosed operand), **4** (count gate
  unchanged by depth), **6** (a second viewport click still drills). Extends the subsystem
  `ui-016`, `ui-040` and `ui-041` were filed against: re-run each one's original repro.
