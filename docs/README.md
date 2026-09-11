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

- [Placing a shape](primitive-placement.md) — dragging a primitive out of the
  Library panel into the 3D view, on desktop and on a phone, lining a new shape
  up with one already placed, and selecting what you placed.
- [Selecting a shape, and reading its size](selection-and-inspector.md) — the
  gizmo, the three dimension lines, and the Inspector panel's parameters and
  Transform section, on desktop and as a phone bottom sheet.
- [Combining shapes: Union, Subtract and Intersect](booleans.md) — the
  Operations toolbar, why its buttons stay dimmed until two shapes are selected,
  and how to tell which shape Subtract is about to cut.
- [Combining shapes into a group](groups.md) — the Operations toolbar's fourth
  button, which combines shapes into one selectable body without merging or
  discarding any of their geometry.
- [Precise placement: Snap and Align](snap-align.md) — the Operations toolbar's
  fifth and sixth buttons, which move one shape to a computed position against
  another without combining or discarding either one.
- [Moving around the 3D view](viewport-navigation.md) — orbit, pan, zoom, the
  orientation triad, touch gestures, and reading size off the grid.

## Decisions

Library and architecture decisions, with the data behind them, live in
[`decisions/`](decisions/):

- [Geometry kernel](decisions/geometry-kernel.md) — `@jscad/modeling` (JSCAD V3)
- [Rendering](decisions/rendering.md) — three.js
- [Document model / sync](decisions/document-sync.md) — no CRDT for v1
- [Interaction-model Q&A](decisions/interaction-model-qa.md) — the six §7 controls
- [Stack-defaults health check](decisions/stack-defaults-health-check.md)
