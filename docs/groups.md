# Combining shapes into a group

**Group** turns several separate solids into one thing you can select, move and
rotate together — without merging their shapes into each other. It lives on the
same **Operations toolbar** as [Union, Subtract and Intersect](booleans.md), as the
fourth button.

Group is fundamentally different from a boolean: Union, Subtract and Intersect
compute a *new* volume and throw away the shapes that went into it. Group keeps
every original shape exactly as it was — nothing is added, removed or merged — and
just makes the whole collection behave as a single selectable body.

| Button | What it does |
|---|---|
| **⊞ Group** | Combines the selected solids into one body. Each solid's own geometry is preserved; only how you *select* them changes. |

## You need at least two shapes selected

Just like Union, Subtract and Intersect, the Group button stays **dimmed and
unclickable until two or more solids are selected** — see
[Combining shapes: Union, Subtract and Intersect](booleans.md#you-need-at-least-two-shapes-selected)
for how selecting more than one shape works (Shift-click on desktop, or the
**Select** marquee tool on a touch screen).

Unlike Subtract, **Group does not care what order you pick things in.** There is no
base and no subtrahend — every selected solid is an equal member of the resulting
group, so the badge under the toolbar just shows the selected count, with no
"first is the base" note.

## A worked example

1. Open the Library panel and drag a **Cube** into the 3D view. Drag a **second
   Cube** in somewhere that does *not* overlap the first — leave some empty grid
   between them.
2. Click the first cube, then hold **Shift** and click the second. The Operations
   toolbar's badge reads `2 selected`, and all four buttons — Union, Subtract,
   Intersect and **Group** — light up.
3. Click **Group**. Both cubes become **one selectable body**: the transform gizmo
   now sizes itself to fit both cubes together, and dragging the gizmo's arrows
   moves both cubes at once, keeping their relative positions.
4. The result is selected on its own, named `Group 1` in the Inspector. Because
   only one thing is selected again, the toolbar dims until you select another
   two.

Look closely at the two cubes after grouping: **neither one changed shape.**
Nothing was unioned, cut, or intersected away — this is the difference from
running Union on the same pair, which would replace both cubes with a single
merged volume.

## What happens to the original shapes

The two shapes you grouped are **gone as independently-selectable bodies** — you
cannot click just one of them on its own anymore, the same way a boolean result
replaces its operands in the scene list. The difference is what is *inside* the
result: a boolean's result is one computed volume; a group's result still contains
both original solids, complete, just not addressable individually yet.

**There is no way yet to select just one part of a group and edit it on its own.**
That capability — clicking into a group to reach one of its members — is planned
for a later release. For now, once two shapes are grouped, you can move, rotate,
or feed the whole group into another Group or boolean operation, but you cannot
pick out a single part of it.

## Notes and gotchas

- **Units are millimetres**, as everywhere else in WarpCad.
- **More than two at once is fine.** Select three or more solids and Group
  combines all of them into one body, the same way Union does.
- **Order never matters.** Grouping A-then-B gives the identical result to
  grouping B-then-A — there is nothing analogous to Subtract's base/subtrahend
  distinction.
- **A group's dimension lines and Inspector report the combined bounding box** —
  the smallest box that contains every part — not any single part's own size.

## See also

- [Combining shapes: Union, Subtract and Intersect](booleans.md) — the same
  toolbar's other three buttons, which compute a new volume instead of keeping
  every part intact.
- [Placing a shape](primitive-placement.md) — getting shapes into the view in the
  first place.
- [Selecting a shape, and reading its size](selection-and-inspector.md) — what
  selection does, and reading a group's combined size afterwards.
