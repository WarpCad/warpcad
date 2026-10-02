---
title: Acceptance scenario 19 — place two gears, mesh them, and confirm they turn without interpenetrating
category: testing
kind: feature
priority: medium
model: sonnet
milestone: M11
depends: [ui-057, ui-058]
status: open
---

## Goal

`CLAUDE.md`'s rule: a new *class* of capability earns its own driven scenario instead of
folding into an old one, because the second attempt shipped four obvious bugs behind green
scripted specs. Gears are a new class — a composite family whose correctness is a
*relationship between two bodies*, which nothing in scenarios 1–16 exercises. "Done":
scenario **19** is written into `TODO/ACCEPTANCE.md` (17 and 18 are reserved by
`ai-010`) and has been driven live once, by hand, with the result logged.

## Interaction model

n/a — adds no control. It verifies controls `ui-057` and `ui-058` ship.

## Documentation

n/a — no user-visible control. (The scenario's steps are not user docs.)

## The scenario to write

**Steps** (a human drives these, at the laptop and then at phone width, with deliberate
mistakes):

1. Drag a **Spur gear** into the view; set Teeth 36, Module 1.4, Thickness 8, Bore 4. Drag a
   second **Spur gear**: Teeth 12, same module. Confirm both remain visible and neither is
   on its edge.
2. Select the large gear, then the small one, and click **Mesh**. Confirm the small gear
   moves, the large does not, and the popover reads a centre distance and ratio.
3. Try to mesh the large gear with a **cube** — the button must be disabled. Change the small
   gear's module to 2.0 and open Mesh again — the popover must say they are incompatible and
   refuse.
4. Set the module back; Mesh again. Select **both** and **Union**; confirm one body results
   (this is the "two gears fused" outcome — and *proves* they overlap only on the tooth
   flanks, since the volume of the union ≈ the sum of the volumes within backlash).
5. Undo twice; confirm the gears are separate again. Add a **Bevel pair** from the Library
   and confirm it renders complete (not a half-cone), with the apexes meeting.
6. Save, reload, and confirm both gears and the pair are unchanged; export STL and confirm
   the file opens with a non-zero triangle count.

**Expect**: no body disappears when another is added; Mesh is gated on *two gears* exactly;
the gears never interpenetrate beyond backlash; undo is one step per operation; the saved
file reproduces the scene.

## Affected files

- `TODO/ACCEPTANCE.md` (scenario 19), `TODO/BUDGET.md` Runner Log (note the new standing
  check), and — only if a bug is found — new finding files under `TODO/`.

## Effort

S.

## Testing

- The scenario itself *is* the test and is driven, not scripted (`CLAUDE.md` Verification).
  **Run it at phone, tablet and laptop, on Chromium, Firefox and WebKit** — the Mesh popover
  and the WebGL gear render are both engine-sensitive.
- Log PASS/FAIL per step in the scenario's **Last run** line, with every mistake made on
  purpose. A FAIL files a `TODO/` finding rather than being fixed silently.
- Per `.claude/commands/fix-todo.md`, every later `/fix-todo` that touches `src/core/gear/`,
  `library.js` or the Operations toolbar re-drives 19.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
