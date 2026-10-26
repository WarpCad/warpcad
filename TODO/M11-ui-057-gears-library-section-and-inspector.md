---
title: Gears section in the Library, drag-to-place, and a parametric Inspector with derived readouts
category: ui
kind: feature
priority: high
model: sonnet
milestone: M11
depends: [core-041, core-048, ui-052]
status: open
---

## Goal

The gear ops (`core-041`…`core-049`) are unreachable until a person can find them. "Done": a
**Gears** section in the Library lists the gear kinds; dragging one into the 3D view places
it; selecting a placed gear shows its teeth, module, pressure angle, thickness and shaft
options in the Inspector and recomputes the solid as they are edited, with the *derived*
numbers (pitch Ø, outside Ø, root Ø, centre distance to a mate, ratio) readable without
doing arithmetic. This is the control surface a V1 user (typing `circularPitch` and
`toothCount` into a script) has to get to without writing code.

## Interaction model

- **Precondition**: nothing for placing (a creation, `operandCount: 0`). Editing needs
  exactly one gear selected; with a non-gear or several selected the gear fields are absent,
  not disabled-and-empty.
- **Trigger**: the Library panel gets a **Gears** section (via `SECTION_DEFINITIONS`, so no
  component names a gear — `src/core/library.js` is the one place). Rows, in this order:
  *Spur gear, Helical gear, Internal (ring) gear, Rack, Bevel gear, Worm, Worm wheel,
  Planetary set*, plus the *pair* rows *Gear pair*, *Bevel pair*, *Worm pair* where a pair
  recipe exists. Dragging a row arms placement mode: the ghost follows the pointer (mouse
  or touch) and commits on release, exactly as for every other Library row
  (`ui-030`/`ui-031`) — never a fixed-origin insert.
- **Feedback**: the placed gear appears under the pointer with correct tooth count and
  orientation (axis up, **flat on the grid** — a gear that spawns on its edge is a bug to
  assert against); it becomes the selection; History reads `Spur gear 36T`; the Inspector
  opens.
- **Selection response**: the Inspector shows editable `teeth`, `module` (with a read-only
  `circularPitch` beside it — the V1 vocabulary the user knows), `pressureAngleDeg`
  (14.5 / 20 / 25 as quick picks and a free field), `thicknessMm`, `helixAngleDeg` where it
  applies, plus the collapsed **Shaft & hub** group (`core-048`). Derived readouts (from
  `gearDimensions`, never recomputed in the component): pitch Ø, outside Ø, root Ø, and an
  **undercut warning** when `core-040` reports one. Edits go through `ui-052`'s
  edit-composite-params path, so a dependent (a mated gear, a bore subtract) is repaired,
  not orphaned. The move/rotate gizmo attaches as for any body.
- **Selection count**: n/a for creation; a placed *pair* or *planetary* selected as a group
  shows its own params once, and one of its named parts selected shows that part's.
- **Small-screen behavior**: Gears section is a collapsible group in the phone Library sheet;
  Inspector is the existing bottom sheet; every row and numeric field has a 44 px tap
  target; the `teeth` field is a stepper, not a tiny spinner.
- Row `data-testid`s follow the registry (`library-row-gear.spur`, …); each numeric field
  carries `data-testid="gear-<param>"`.

## Documentation

- **Page**: new `docs/gears.md` (+ sidebar entry per `.claude/commands/docs.md` Step 4), and a
  one-line pointer from `docs/primitive-placement.md`.
- **Example** (verbatim steps, units stated): "Open the Library, expand **Gears**, drag
  **Spur gear** into the view and release. In the Inspector set **Teeth** to 36, **Module**
  to 1.4 mm (this is `circularPitch ≈ 4.4 mm` — the value printed beside it) and **Thickness**
  to 8 mm. Set **Bore** under *Shaft & hub* to 4 mm. The readout shows *Pitch Ø 50.4 mm*;
  that is the number to use when spacing a mating pinion." Also a **porting note** for V1
  scripts: the name table from `core-041` (`circularPitch` → module, `toothCount` → teeth,
  `centerHoleDiameter` → bore).

## Affected files

- `src/core/library.js` (`SECTION_DEFINITIONS`, `ROW_ORDER`), `src/components/inspector/
  GearParams.vue` (new, under 30 template lines of logic in the view),
  `src/components/inspector/InspectorPanel.vue` (mount), `src/components/viewport/` (ghost
  preview needs the gear's outer radius — read it from the registry's `ui.defaults`),
  `docs/gears.md`, `e2e/gears.e2e.js`.

## Effort

L.

## Testing

- **A real `e2e/gears.e2e.js` that navigates to `/`**: drag *Spur gear* in, assert it renders
  and is selected, change Teeth and Module, assert the Pitch Ø readout and the bounding box
  agree to 0.01 mm, place a *second* gear and confirm **both remain** (the exact
  "adding one overwrote the previous" failure `SECOND-ATTEMPT.md` records).
- Runs at **phone, tablet and laptop** with a snapshot at each (the Small-screen bullet is
  not "same as desktop"), and against **Chromium, Firefox and WebKit** — it touches the
  WebGL viewport, the kernel worker and persistence (save/reload round-trip with a gear
  in the project).
- **Acceptance scenarios to re-drive**: 1 (two bodies remain), 3 (library drag), 6 (group vs
  sub-part — a gear's `bore` part), 7 (touch-only navigation with a gear in the scene), 10
  (save and reload). **Closed findings re-run**: `ui-053`'s repro (first library drag after
  Escape is ignored) on a *Gears* row, and `core-020`/`core-024`'s composite-part repros.
- Also a unit spec for the section ordering in `library.js`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
