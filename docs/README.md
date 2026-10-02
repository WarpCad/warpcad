# WarpCad documentation

End-user documentation lives in this folder. Every task that adds or changes a
user-visible control adds its page here at the same time, per `CLAUDE.md`'s
Interaction Model rule — there is no later "write the docs" pass.

This index **is** the sidebar for now. `CLAUDE.md`'s Stack table still lists the
documentation-site tool as TBD (a Library decision nobody has needed to make
yet), so pages are plain Markdown and this file is the table of contents. When a
docs-site generator is chosen, its sidebar config replaces this list — the pages
themselves won't have to move.

## Using WarpCad

- [Placing a shape](primitive-placement.md) — dragging an item out of the
  Library panel into the 3D view, on desktop and on a phone: the basic solids in
  **Primitives**, the ready-made fasteners in **Hardware** (Bolt, Nut, Washer,
  Bearing), the building blocks in **Kit Parts** (Board, Board Frame, Anchor) and
  the real boards and accessories in **Raspberry Pi**, and a 3D **Text** label — including picking which
  board revision or camera a row places. Also: lining a new shape up with one
  already placed, and selecting what you placed.
- [Selecting a shape, and reading its size](selection-and-inspector.md) — the
  gizmo, the three dimension lines, and the Inspector panel's parameters and
  Transform section, on desktop and as a phone bottom sheet. Also the Inspector's
  **object list** and **Parts** section, for finding and selecting a shape (or one
  piece of it) you cannot click because it is inside another one.
- [Bill of materials](bill-of-materials.md) — the Inspector's read-only tally of
  the bolts, nuts, washers, bearings, kit parts and Raspberry Pi boards you've
  placed, by size, updating as you add, change or delete them.
- [Combining shapes: Union, Subtract and Intersect](booleans.md) — the
  Operations toolbar, why its buttons stay dimmed until two shapes are selected,
  and how to tell which shape Subtract is about to cut.
- [Combining shapes into a group](groups.md) — the Operations toolbar's fourth
  button, which combines shapes into one selectable body without merging or
  discarding any of their geometry.
- [Precise placement: Snap and Align](snap-align.md) — the Operations toolbar's
  fifth and sixth buttons, which move one shape to a computed position against
  another without combining or discarding either one.
- [Rounding or bevelling an edge: Fillet and Chamfer](fillet-chamfer.md) — the
  Operations toolbar's seventh and eighth buttons, which round or bevel the
  whole rim of one chosen face on a single selected shape.
- [Resizing and cutting a shape: Enlarge, Fit and Bisect](resize-bisect.md) —
  the Operations toolbar's ninth, tenth and eleventh buttons, which grow or
  shrink a single selected shape, resize it to an exact size, or cut it into
  two independently selectable parts.
- [Mirroring a shape: Mirror](mirror.md) — the Operations toolbar's Mirror button,
  which adds a reflected copy of one shape across an X, Y or Z plane and leaves the
  original untouched.
- [The History panel: revisiting any step you've taken](timeline.md) — the
  **History** button in the top bar, the list of every step in your model, and the
  five things you can do to a past step: look at the model as it was then, change
  its numbers and have everything after it rebuild, switch it off without deleting
  it, reorder it, or park the model at an earlier point and keep building there.
- [Undoing and redoing a change](undo-redo.md) — the two buttons at the right of
  the top bar, the Ctrl/Cmd+Z shortcuts, what counts as one step, what Undo puts
  back on screen, and why Undo never removes a change you didn't make.
- [Saving and reopening your work](save-load.md) — your work autosaves as you go
  and reopens where you left off when you reload; the little status light at the
  right of the top bar; the **File ▾** menu — saving a copy (Save on desktop
  Chrome and Edge, Download copy everywhere else), opening one, and keeping a
  copy in a GitHub repository, with auto-push and what happens when someone else
  changed it first; and what it says when your browser won't let WarpCad store
  anything.
- [Exporting your model: STL, OBJ and glTF](export.md) — **File ▾ → Export…**:
  choosing the whole scene or just your selection, picking STL, OBJ or glTF, what
  each format contains, how files are named, why the menu item is sometimes
  greyed out (nothing to export; History is showing a past step), what a rolled-back
  export holds, exporting at a finer resolution than the design, and what it says when an
  export is refused.
- [Resolution: how smooth curves are, and why it matters for fit](resolution.md) —
  **File ▾ → Resolution…**: Draft, Normal, Fine or Print for the whole design, why a
  faceted hole prints small (and a big one more so), what Legacy means on an older
  project, and exporting at a higher resolution than the design with
  **File ▾ → Export… → Resolution**.
- [Moving around the 3D view](viewport-navigation.md) — orbit, pan, zoom, the
  orientation triad, touch gestures, and reading size off the grid.
- [Sketch primitives](sketch-mode.md) — drag **Sketch** from the Library, draw
  outlines with Line, Rectangle, Circle and Polygon, mark outlines Solid or Hole, stack
  slices, and turn them into a solid with Linear, Revolve, Helical, Outline or Loft; then
  **Edit sketch** to change it later. Worked examples: a tube, and a lofted wing.

## Decisions

Library and architecture decisions, with the data behind them, live in
[`decisions/`](decisions/):

- [Geometry kernel](decisions/geometry-kernel.md) — `@jscad/modeling` (JSCAD V3)
- [Rendering](decisions/rendering.md) — three.js
- [Document model / sync](decisions/document-sync.md) — no CRDT for v1
- [Interaction-model Q&A](decisions/interaction-model-qa.md) — the six §7 controls
- [Stack-defaults health check](decisions/stack-defaults-health-check.md)
