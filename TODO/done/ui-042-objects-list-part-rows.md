---
title: Expandable part rows in the Objects list, so a hidden body's sub-part can be a boolean operand
category: ui
kind: feature
priority: low
model: sonnet
milestone: M6
depends: [ui-041]
status: done
---

> ## What actually shipped, and the decisions behind it
>
> **The file's own worked-example flow is a trap, and this file said so — it was real.** Tap
> `ethernet`, then add the shell (the file's literal step order) makes the *part's body* the
> boolean base, backwards from what a port opening needs (Subtract cuts every later-selected
> operand from the first). Fixed by giving the Objects list an explicit, named action —
> `selection.selectPart(bodyId, partName, additive)` — whose **additive** gesture adds the body
> **at the end** of `ids` with the depth on it (a body already selected keeps its position;
> addressing the already-addressed part steps back up to the whole body). That makes "case row
> first, then the part's check" reach the right order without any change to `drillInto`'s
> existing exactly-one-body rule (`ui-016`), and the toolbar's existing operand line
> (`selectedOperands`, `ui-040`) proves the order before commit with no changes of its own.
> `selection.count` stays exactly `ids.length` throughout — a depth is never a second operand.
> Recorded as `docs/decisions/interaction-model-qa.md` §20's dated addendum.
> - **`summarizeBody` gains `partNames`/`hiddenPartNames`**, not by re-deriving "is this a
>   composite worth expanding" in the component, but by extracting `createBodyObject`'s own
>   part-addressability test into `hasNamedParts` (`src/core/kernel/group.js`) and calling it
>   from both places — so the renderer (what can be drilled by a raycast) and the Objects list
>   (what gets a chevron) can never disagree about which body is a composite.
> - **Hidden parts are listed and labelled**, deliberately: a tap-clearance solid or a Pi's
>   mounting hole is exactly what a boolean wants to address, and `combine()` skips them the
>   same way whether or not they're addressed by name.
> - **Expansion is a UI-only Pinia ref** (`expandedIds`), keyed by lineage-root id so a move,
>   rename or param edit leaves it alone, and watched against the **live** document (not the
>   previewed one) so History preview never collapses anything and a body that leaves the live
>   scene forgets its expansion rather than growing the set forever.
> - **Measured, not assumed**: an enclosed Raspberry Pi's `ethernet` cuts 4 545.0 mm3 from a
>   100x70x40 case versus 23 168.2 mm3 for the whole board (both read directly off the kernel,
>   independent of the app) — this file's own headline claim, now driven and true.
>
> Honest process note: RED was shown by writing all five spec files first (`selection.spec.js`,
> `summarizeBody.spec.js`, `objectsPanel.spec.js`, `ObjectsPanel.spec.js`,
> `OperationsToolbar.spec.js`) and running them — 44 failures for the right reason
> (`selectPart is not a function`, `partNames` undefined, no `objects-expand-*` in the DOM) —
> before any implementation code, correcting the previous run's shortcut of writing code first
> and demonstrating RED by mutation.

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

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
