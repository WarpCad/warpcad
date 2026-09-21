---
title: A hand route to select a body that cannot be clicked
category: ui
kind: feature
priority: medium
model: sonnet
milestone: M6
depends: [ui-032, ui-040]
status: done
---

> ## What actually shipped, and the decisions behind it
>
> **Route (a), the Objects list — not (b), pick-cycling.** The runner's recommendation stood.
> (b) collides with `ui-016`'s "second click drills into a part" in exactly the case that
> motivates this task (an enclosed *composite*: "drill if it has parts, else cycle" makes an
> enclosed plain body reachable and the enclosed bolt not), cannot be discovered, and needs a
> "same point again" gesture touch does not have. Recorded, with the rest, as
> `docs/decisions/interaction-model-qa.md` **section 20**.
>
> - **Header toggle + one shared slot.** An **Objects** button (cube glyph) sits between Redo and
>   History in the document-bar cluster. The panel is History's dock (>=641px) / History's bottom
>   sheet (phone), reusing its offsets — no fourth overlay technology. The CSS variables were
>   renamed `--timeline-sheet-*` -> `--bottom-panel-*` now that two panels read them. Objects and
>   History are mutually exclusive at every width; the Inspector declines to auto-open over the
>   Objects sheet exactly as it does over History.
> - **Rows select through the ordinary store.** A row tap = the whole selection (and drops a pick
>   depth: a row names a body); the row's **check** — a `<button>`, deliberately not an `<input>`,
>   because `HistoryControls`' Ctrl+Z guard would treat a checkbox as text entry — or Shift/Ctrl/Cmd
>   on the row is `selection.toggle`, so a phone reaches "2 selected" with no Shift key and
>   `ui-040`'s depth-preserving dance still composes. The check shows the body's place in the
>   selection (1 = Subtract's base) in the toolbar's own two colours.
> - **§13 not reversed, and the lists are told apart** by heading, glyph, printed `Selects bodies`
>   line, row content (name + size + check vs numbered step), and selected look (full-row fill vs
>   left bar). Tested in both directions.
> - **Rolled-back / suppressed bodies have no row** (rows = the announced scene) and a printed note
>   says why. **Previewing** is read-only with a printed reason — but since opening Objects ends a
>   preview, that state is unreachable from the UI; implemented and unit-tested anyway. **Sketch
>   mode** disables it too, which moved `sketchMode` from a private ref in `Viewport.vue` to
>   `src/stores/sketchMode.js`.
>
> ### The trap the file did not mention was real
>
> Selecting the enclosed bolt from the list changed **0 canvas pixels**: the highlight is a
> material swap and the shell wins the depth test everywhere. The Inspector, the list row and the
> gizmo/dimension lines (SVG overlays) all worked, and a gizmo drag on the enclosed bolt works, so
> "identical to a clicked body" was false on the canvas alone. **Fixed, minimally:** a selected
> body gets an **x-ray twin** — same geometry, `GreaterDepth`, front faces, 50% — that draws only
> where the body is hidden, child of the mesh so it follows a gizmo drag, excluded from the
> raycast. ~1 186 changed pixels in Chromium and WebKit; <40 after deselecting; an unoccluded
> selection is unchanged.
>
> ### Deliberately not built, filed rather than widened
>
> - **Expandable part rows** (for `ui-016`'s drill-down / `ui-040`'s sub-part operands): optional,
>   not built. Consequence stated plainly — an enclosed body can be a *whole-body* operand, but its
>   hidden sub-parts cannot be addressed by a boolean while it is enclosed. **`TODO/ui-042`.** For
>   `hardware.bolt` this changes no geometry (whole bolt and `tap` cut the same hole).
> - **`ui-043`** — found while measuring, and **pre-existing** (identical numbers with this task
>   stashed): at 390x844 with one body selected and the Inspector sheet open, the nav chrome rides
>   21px over the Operations toolbar.
>
> ### Two things this task fixed that it did not set out to
>
> - Opening the phone **Library sheet** with History open stacked the Library *behind* History's
>   sheet (found by hand-driving at 390px). The same three lines now close Objects and History when
>   the Library opens.
> - Adding a 44px control to the header caused **26px of horizontal overflow at 320px** (below the
>   390px target, but it had none before); the brand title yields below 360px.
>
> ### Honest process note
>
> The store, component and canvas twin were written **before** their unit specs, not after —
> RED was demonstrated by mutation (removing the disabled guard and the twin's `raycast` opt-out
> each failed the specs that name them), not by a failing run first. The e2e was written against
> the finished UI.

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
