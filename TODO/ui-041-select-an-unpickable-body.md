---
title: A hand route to select a body that cannot be clicked
category: ui
kind: feature
priority: medium
model: sonnet
milestone: M6
depends: [ui-032, ui-040]
status: open
---

## Goal

A body that is completely inside another one **cannot be selected by hand at all**.
Every selection route this app has goes through a raycast against the rendered meshes
(`Viewport.vue`'s `raycastHit`/`pickAt`), and a raycast from any camera angle hits the
enclosing solid first. `ui-030`'s drive found it, `core-024`'s re-drive confirmed it,
and `ui-040`'s drive confirmed it a third time and established that **`ui-032` did not
close it**, which had been assumed.

"Done" looks like: with a bolt standing entirely inside a 40 mm shell, the user can
select the bolt, see it become the current selection (Inspector, gizmo, highlight), and
use it as a boolean operand — without moving it, hiding the shell, or reloading.

## Why `ui-032` is not the answer, checked rather than assumed

`ACCEPTANCE.md` scenario 5 and `TODO/ui-040` both named `ui-032` (the History panel) as
the cure. It has landed, and it is not: its rows select a **timeline step**, and
`docs/decisions/data-002-persistence-interaction-model-qa.md` §13's confirmed rule is
that *"a row selection and a body selection are two different selections that never
trigger each other."* That rule is deliberate and should not be quietly reversed to
solve this — a step and a body are genuinely different things (a step can be suppressed,
rolled back, and may not correspond to any body at all).

Nor is there a clickable scene list. `data-body-count` and the `scene-bodies` list are a
test/accessibility **announcement** (`Viewport.vue`'s own comment says so), not a
control: the `<li>`s carry no click handler and no `data-testid` a user could reach.

Driven at `ui-040` Step 6: a 121-point click probe across and around a fully enclosed
bolt selected nothing but the shell.

## Interaction model

- **Precondition** — none; this is a selection route, available whenever the document
  has bodies.
- **Trigger** — to be decided at Step 2, but the two candidates are worth naming here
  so the next run does not re-derive them: (a) a **scene/objects list panel** whose rows
  select the body they name — the conventional CAD answer, and the one `ACCEPTANCE.md`
  has been calling "a scene list" for three drives now; or (b) **cycling the pick**
  under the pointer — a repeat click at the same point steps to the next body along the
  ray, the way many CAD apps disambiguate overlapping geometry. (b) is cheaper and needs
  no new panel, but it collides with `ui-016`'s existing "second click drills into a
  part" meaning, which is the thing to settle first. (a) does not collide with anything
  and also answers "what is in this document?", which nothing currently does.
- **Feedback** — the selected body gets the ordinary selection contract (highlight,
  Inspector, gizmo), identical to a clicked one; the list row, if there is one, shows
  which body is current.
- **Selection count** — a list must support the multi-select this app's operations gate
  on (`ui-014`): Shift-click or equivalent to reach "2 selected", or booleans remain
  unreachable for enclosed bodies and this task has not actually finished the job.
- **Small-screen behavior** — decide at Step 2 against the existing bottom-sheet
  pattern; the top-left column at 390px is already full (`ui-040` measured ~4px of
  slack between the Operations toolbar and the navigation chrome), so a new persistent
  panel there is not available.

## Documentation

- **Page** — `docs/selection-and-inspector.md`, extending it rather than adding a page.
- **Example** — a concrete run of the case that motivates it: place a shell, place a
  bolt inside it, select the bolt without being able to click it, then subtract it.

## Affected files

- `src/components/viewport/Viewport.vue` — `pickAt`/`raycastHit` if the answer is
  pick-cycling.
- `src/components/` — a new `display/` or `inspector/` panel if the answer is a list.
- `src/stores/selection.js` — probably unchanged; the store can already hold any id.
- `e2e/` — a new `*.e2e.js` against `/`.

## Effort

M — the mechanism is small either way; the cost is the interaction decision above and,
for the list route, a new panel to place at three viewports.

## Testing

- A real app-level `*.e2e.js` against `/`: a body fully inside another is selected, then
  used as a boolean operand, with the result measured by volume.
- **`TODO/ACCEPTANCE.md` scenario 5** — this is the last thing standing between that
  scenario and a full pass *with a genuinely enclosed* operand; `ui-040` passes it with
  a partial overlap and says so explicitly. **Scenario 4** — re-drive, since a new
  selection route feeds the same count gate. **Scenario 6** — re-drive if the answer is
  pick-cycling, since that shares the click path `ui-016`'s pick depth owns.
- **Closed-finding regression surface**: `ui-016`'s own drill-down repro, for the
  pick-cycling route specifically — a second click currently means "drill into a part",
  and any new meaning for it has to leave that one intact.
- Engines: all three (this touches the raycast/canvas path) if pick-cycling; Chromium
  across the three viewports is enough for a pure DOM list.
