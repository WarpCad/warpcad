---
title: Retire the Objects panel and fold its list into the Inspector, with hover-to-highlight in the 3D view
category: ui
kind: feature
priority: high
model: opus
milestone: M7
depends: [ui-041, ui-042, ui-047]
status: done
---

> **What shipped (2026-09-27, `/fix-todo` via `/run-todos`).** The Objects panel, its header
> toggle and the fourth sheet-slot claimant are gone. The list lives in the Inspector
> (`src/components/inspector/ObjectList.vue`, the store renamed to `stores/objectList.js`),
> composites get a **Parts** section, and list rows hover-highlight in the viewport
> (`stores/hoverHighlight.js`, a third `BODY_COLORS.*.hover` tint plus its own x-ray twin and
> a transient hidden-part mesh).
>
> **"The list must not vanish on the first tap": the file's Recommendation, adopted.** The
> list is the whole Inspector at 0 selected, and a collapsible **Objects** section at the top
> of every other state: collapsed by default at 1, expanded at 2+, remembered for the session.
> The breadcrumb gains a root **Objects** crumb. One refinement, found while driving: a
> **check** keeps the section open for the next operand for as long as the selection keeps
> changing through the list, and a **plain** row tap folds it. At first "open" was stored as
> the session preference, so after a check sequence every later viewport click opened with
> the list above the body's detail. The section sits *above* the breadcrumb, so the first
> check does not move the rows under the finger.
>
> **Deviations, each for a measured reason.**
> - *Hover is keyed on a moving mouse, not `pointerenter`.* Driving at 390px WebKit found
>   touch taps inventing a hover. After a tap the browser keeps a phantom mouse at the tap
>   point. When the Inspector reflows it fires mouse-typed `pointerover`/`pointerenter`, and
>   in WebKit a `pointermove` too, at whatever row slid under that point. Hover now needs a
>   mouse `pointermove` that is not at the last touch/pen press point. Keyboard focus counts
>   only if no pointer press just preceded it. Both have unit specs and a touch e2e.
> - *No phone tab in an empty document.* The spec says the list shows "including in an empty
>   document". It does at tablet/laptop, where the column is always there. At phone width,
>   with nothing to list, the tab stays hidden rather than spend 44px of viewport on
>   `Objects (0)`. The Library tab is the way in. With 1+ bodies the tab reads `Objects (n)`.
> - *The Parts section is absent at sub-part depth*, as `ui-047`'s section was (`describeSubPart`
>   reports `parts: []`). Re-targeting a sibling part goes through the root crumb's list.
> - *`describeBody.parts` uses `hasNamedParts`, not `isGroup`*, the same condition as the
>   renderer, the list and `choosePart`, so the Parts section never lists a row that
>   selecting would refuse.
> - *The 359px title-hiding rule in `AppView.vue` was removed.* It existed only because the
>   Objects toggle added 44px. Re-measured at 320px: the title ends at x=75, Undo starts at
>   88, and nothing overflows.
>
> **Found and fixed while driving, beyond the spec.** (1) A row's name was squeezed to zero
> width by its size in the narrow Inspector column: a Group read as a check and a size only.
> Name and size now stack, with an e2e at every viewport. (2) `bench/hover-sweep.mjs` found
> ~90 ms frames entering and leaving the Pi's translucent `mb`. Disposing its plain material,
> the only user of the transparent shader program, is consistent with a program
> delete-and-recompile each time (inferred, not CPU-profiled). The fix keeps a colour's
> plain and hovered materials alive as a pair (`bench/results/2026-09-27-ui-049.md`).
>
> **`ACCEPTANCE.md` scope, stated.** Only scenario 5's Steps named the Objects list. The
> other six scenarios the file lists (1, 4, 6, 7, 10, 13) mention it only in historical run
> logs, which are records and were left alone. All seven were re-driven.

## Goal

Requested by the user on 2026-09-27, after using `ui-047`'s Hidden parts section:

> *"There is currently a separate 'objects' panel and an inspector panel. When selecting
> a 'group' object like a raspberry pi object, the inspector shows the 'hidden' parts.
> This is odd to me. I would like to see the 'objects' of a group in the inspector along
> with the 'hidden' parts."*

Today one question, "what is in this thing?", is answered in two places that each give
half the answer:

- **Objects** (`ui-041`/`ui-042`) is a separate bottom dock/sheet with its own header
  toggle. Its ▸ disclosure lists every part of a composite, visible and hidden.
- **Inspector** (`ui-047`) lists **only** the hidden parts of the selected body. A Pi's
  `ethernet` jack, `usb` ports and board, which are the parts a user most wants to drill
  into, appear only in the other panel.

This task removes the Objects panel and its header toggle. The Inspector becomes the one
place that lists the scene and a composite's parts. "Done" looks like this:

1. **Nothing selected**: the Inspector shows a list of every body in the scene, not
   `(nothing selected)`. Its rows are the Objects panel's rows: name, size, the selection
   check and the ▸ disclosure.
2. **A composite selected** (a Raspberry Pi, a Bolt): the Inspector has a **Parts**
   section that lists **all** of its parts in group order, with hidden ones labelled
   `hidden` in the same row style. It replaces `ui-047`'s hidden-only list. The **Show
   hidden parts** toggle moves into this section unchanged.
3. **Hover a row** (a body, or a part row inside an expanded group): the matching
   geometry highlights in the 3D view. A part row highlights only that part, not its
   whole group.
4. **Click/tap a row**: selects that body (or that body at that part) in the 3D view,
   exactly as the Objects panel does today. Nothing downstream can tell the routes apart:
   same highlight, same gizmo, same Operations-toolbar count gate.
5. **Expand a group**: its part rows appear indented beneath it, and they hover-highlight
   and select individually.
6. The `objects-toggle` button, `ObjectsPanel.vue`, and the fourth bottom-panel slot
   `AppView.vue` arbitrates for it are gone.

Nothing `ui-041` made reachable may become unreachable. `ui-041` exists because a body
completely inside another cannot be clicked, and the list is its only selection route.
`ui-040`/`ui-042` depend on the list to reach a sub-part operand (a Pi's `ethernet` jack
inside a case) with no keyboard. Both routes have to survive the move, at phone width
too. See the Interaction model's "The list must not vanish on the first tap" below; it is
the one real design problem in this task.

## Interaction model

- **Precondition**:
  - Scene list: none. It shows whenever the Inspector's selection is empty, including in
    an empty document, which shows the existing empty-state copy: *"No objects yet, drag
    a shape in from the Library"*.
  - Parts section: exactly 1 body selected, and its evaluated `Group` has at least one
    part, visible or hidden. A bare solid (Cube) gets no Parts section. This is the same
    "absent, not disabled" rule `ui-047` used.
- **Trigger**:
  - The list lives in `Inspector.vue`'s sheet, in place of `inspector-empty`. It is not a
    new panel and has no new toggle.
  - Row gestures stay exactly as `ui-041`/`ui-042` defined them, because users and three
    acceptance scenarios already rely on them:
    - Tap/click a row to make it the whole selection.
    - Tap its **check**, or Shift/Ctrl/Cmd-click the row, to add or remove it (the touch
      route to "2 selected").
    - Tap ▸ to expand a composite.
    - The same two gestures work on child part rows.
  - **Hover**: `pointerenter`/`pointerleave` on a row, for `pointerType === 'mouse'`
    only. **Keyboard focus** on a row counts as hover (`focus`/`blur`), which also gives
    keyboard users the highlight.
  - Touch has no hover, and this task invents none: no long-press preview. On touch the
    tap selects, and the selection highlight is the feedback.
- **Feedback**:
  - **Hover highlight**: the hovered body's parts, or only the hovered part, render with
    a **hover tint**. This is a new third highlight, distinct from the base (`selected`)
    and `secondary` selection colours, so hovering over an already-selected body still
    reads as different. It must also show through occluders. A hover that paints only
    the front faces of a body inside a case changes nothing on the canvas, which is
    exactly the case the list exists for. So the hovered target also gets an x-ray twin
    (`createXrayMaterial`/`addXrayTwin`, `ui-041`) in the hover tint.
  - **Hovering a hidden part row** (`tap`, `clearance`) while **Show hidden parts** is
    off: that one part's translucent mesh (`ui-047`'s path) appears for the duration of
    the hover and is disposed on leave. Otherwise hovering a hidden part row would do
    nothing, and hidden parts are the rows a user most needs to *see* before using one
    as a Subtract operand.
  - The hover clears on `pointerleave`, on list unmount (a selection change swaps the
    Inspector's content), and when the row's body leaves the scene (undo, rollback).
    A stale highlight on geometry the pointer isn't over is a bug.
  - **No document record, no Undo step**, for hover or expand. Both are view state,
    like `ui-047`'s toggle.
- **Placement**: n/a. Nothing is created.
- **Selection response**: selecting from a row is the ordinary selection. The Inspector
  switches to that body's detail view (name, Color, Parts, Parameters, Transform), the
  gizmo attaches, and dimension lines appear. Drilling into a part from a row shows the
  existing breadcrumb `Pi 1 ▸ ethernet`, as `ui-042`/`ui-047` do today.
- **The list must not vanish on the first tap (decide at Step 2 and state it)**:
  - A literal "list only when none selected" breaks `ui-041`'s two-operand route. Tapping
    a check to select body 1 would swap the list for body 1's detail view, and there
    would be no list left to check body 2 from. That route is the only no-keyboard,
    no-raycast way to Subtract an enclosed body (scenario 5), so it has to stay.
  - **Recommendation**: the scene list is the Inspector's whole content at 0 selected,
    and it **stays available as a collapsible "Objects" section** at the top of every
    other state:
    - **1 selected**: collapsed by default, one 44px header tap to open. The body's own
      detail stays the focus, as the user asked.
    - **2+ selected**: expanded by default. The multi state today is only a count and a
      note, so the list costs nothing there, and it's where operand order (the `1`/`2`
      checks) is most useful.
  - Its expanded/collapsed state is UI-only and remembered for the session.
  - The existing breadcrumb gains a root crumb, **Objects**, which opens that section.
    This gives "back to the list" a named control rather than "deselect everything".
  - If the user prefers the strict reading (list only at 0), Step 2 must say how a phone
    user reaches a second operand without the viewport, and scenario 5's re-drive must
    prove it.
- **Selection count**: n/a for the list itself. Its checks feed the existing selection
  store, and the Operations toolbar's own count gates are unchanged.
- **Small-screen behaviour**: not "same as desktop". Confirm each point below at
  390×844:
  - The phone Inspector sheet today **auto-opens on selection** and **dismisses by
    clearing the selection** (`Inspector.vue`'s header comment, control 3 Q16). With the
    list living in the empty state, the sheet also has to be openable **with nothing
    selected**. Tapping the Inspector tab with an empty selection opens the sheet on the
    scene list, and the tab's label reads `Objects (n)` in that state instead of
    `Inspector`.
  - Dismissing the sheet keeps its meaning: swipe down clears the selection and
    collapses. At 0 selected it just collapses.
  - Selecting from a row inside the open sheet must **not** re-trigger the auto-open
    animation or scroll-jump. The sheet is already open.
  - The bottom-panel slot arbitration in `AppView.vue` drops from four claimants to three
    (Library, History, Inspector). Re-measure `ui-043`'s phone header fit with one fewer
    button: the `objects-toggle` removal frees 44px + a gap in the 390px header.
  - Rows, checks and chevrons keep their 44px tap targets inside the sheet. A fully
    expanded Pi (23 parts, 10 hidden) must still scroll inside the sheet, not the page,
    with no horizontal overflow. That is the same measurement `ACCEPTANCE.md` scenario 5
    already records for the Objects sheet.

## Documentation

- **Pages**:
  - `docs/selection-and-inspector.md`: rewrite its Objects-list material as "The
    Inspector's object list", and fold `ui-047`'s "Hidden parts" section into a
    "Parts" section.
  - `docs/groups.md`, `docs/booleans.md`, `docs/timeline.md`, `docs/README.md`: every
    one currently tells the user to open the **Objects** toggle. Re-route each to the
    Inspector. `grep -rn -i 'objects' docs --include='*.md'` must find no instruction to
    press a button that no longer exists. `docs/decisions/` is history and is left
    alone.
- **Example**: *"Drop a Raspberry Pi and a Bolt, then tap empty space so nothing is
  selected. The Inspector lists both. Move the pointer over **Bolt 1** and the bolt
  lights up in the viewport. Tap ▸ on **Raspberry Pi 1** to list its parts, then hover
  `ethernet` and only the jack lights up. Tap `ethernet` to select just that part: the
  Inspector shows `Raspberry Pi 1 ▸ ethernet`. Tap **Objects** in that breadcrumb to
  get back to the list, and tick **Bolt 1**'s check to make it the second operand."*

## Affected files

- **Removed**:
  - `src/components/layout/ObjectsPanel.vue`
  - `src/components/layout/ObjectsPanel.spec.js`: port its still-meaningful cases to the
    new component's spec. Don't drop them.
  - `src/components/layout/ObjectsToggle.vue`
- `src/stores/objectsPanel.js`:
  - Keep the row model: `rows`, `choose`, `choosePart`, `toggleExpanded`,
    `disabledReason`. It is correct, tested, and reads the same summaries the viewport
    announces.
  - Drop `open`/`setOpen`/`toggle`. Consider renaming it to `stores/objectList.js`,
    since nothing is a panel any more.
- `src/components/inspector/ObjectList.vue` (new): the row list, extracted per the
  "views must be thin" rule. `Inspector.vue` is already ~1,500 lines and must not absorb
  ~200 more template lines inline. Used both for the empty-state list and for the
  collapsible Objects section.
- `src/components/inspector/Inspector.vue`:
  - Mount `ObjectList` in the empty state and as the collapsible section.
  - Replace the Hidden parts section with a Parts section, reusing `ObjectList`'s part-row
    rendering, and keep the Show hidden parts toggle.
  - Add the root breadcrumb crumb.
  - Handle the phone tab label and opening with an empty selection.
- `src/core/inspector.js`: `describeBody` reports `parts: { name, hidden }[]` in group
  order (visible, then hidden, matching `hiddenNamesOf()`), superseding
  `hiddenParts: string[]`. Keep this framework-free and unit-tested.
- `src/stores/hoverHighlight.js` (new, UI-only): `{ bodyId, partName | null }` or
  `null`, plus `setHover`/`clearHover`. Not persisted and not in the document.
- `src/render/mesh.js`:
  - Add the hover tint to `createColorMaterialCache`/`setHighlights`, so a
    colour-scheme switch retints it too.
  - Add a transient single hidden-part mesh path, reusing `ui-047`'s translucent build.
- `src/components/viewport/Viewport.vue`:
  - Watch the hover store.
  - Paint the hover tint through `paintBodies`, and manage a separate hover x-ray twin
    that is added and removed on hover change only, **not** by rebuilding every selection
    twin in `applySelectionMaterial`.
  - Give it a new CSS token for the hover colour, dark and light.
- `src/views/AppView.vue`: remove `ObjectsToggle`/`ObjectsPanel`, the `objects.open`
  claims in the slot arbitration, and `data-objects-sheet` with its CSS.
- `e2e/objects-panel.e2e.js`: migrate to `e2e/inspector-object-list.e2e.js`. Update
  `e2e/phone-toolbar-chrome-fit.e2e.js` (one fewer header button) and
  `e2e/inspector-hidden-parts.e2e.js` (its list is now the Parts section).
- `TODO/ACCEPTANCE.md`: scenarios 1, 4, 5, 6, 7, 10 and 13 name the Objects list or
  `objects-*` controls in their Steps/Expect text. Rewrite those Steps to the Inspector
  route in this task. Don't leave scenarios describing a control that no longer exists.
- `TODO/VERIFY.md`: `ui-047`'s open question (a shown-hidden body with no list cue)
  and `ui-042`'s iPhone row-feel check both move to the new surface. Update their wording
  rather than filing new entries.
- The docs pages above.

## Proposed fix

Move, don't rewrite. The row model in `objectsPanel.js` and the row markup in
`ObjectsPanel.vue` are proven by `ui-041`/`ui-042` and three acceptance scenarios.
Extract them into `ObjectList.vue` nearly verbatim, and change only what "no longer a
panel" demands: no header bar, no close button, no `open` state.

Hover is the only genuinely new mechanism:

1. **UI-only store, one writer.** Only `ObjectList` writes `hoverHighlight` in this
   task. (Viewport pointer-hover highlighting of meshes is **out of scope**. It is a
   natural follow-up, and it would reuse the same store and render path.)
2. **Repaint at change rate, not pointer rate.** `pointerenter` fires once per row.
   Guard `setHover` against same-target writes so moving within a row costs nothing.
   `paintBodies` already runs at picker `input` rate, so it is cheap enough. Adding and
   removing the one hover twin is one `Mesh` per hover change, and it must be disposed
   on clear. Measure with `.claude/prompts/perf-benchmark.md` on the fully expanded Pi
   by sweeping the pointer down all 23 part rows.
3. **Precedence**: selection role and colour override come first, then the hover tint
   on top as emissive, the same mechanism `OVERRIDE_HIGHLIGHT_INTENSITY` uses. A hovered,
   selected, red-overridden part must still read as red, selected, and hovered.

## Effort

L. The list move is M on its own. On top of it come the phone-sheet state change (the
sheet opening with nothing selected), a new render highlight with its own x-ray twin and
transient hidden-part mesh, and rewriting seven acceptance scenarios' steps.

## Testing

- **Unit**:
  - `inspector.spec.js`: `describeBody` lists a Pi's parts in group order with hidden
    flags, a Bolt's four hidden parts, and none for a Cube.
  - `hoverHighlight.spec.js`: set, clear, the same-target no-op, and clearing when the
    body is removed.
  - `mesh.spec.js`: the hover tint is distinct from both selection colours and retints
    on `setHighlights`. The transient hidden-part mesh is built on hover and disposed on
    clear, and a body with nothing hovered builds exactly today's mesh count.
  - The ported `ObjectsPanel.spec.js` cases pass against `ObjectList.vue`.
- **New `e2e/inspector-object-list.e2e.js`** (navigates to `/`):
  - With nothing selected, the Inspector lists every body. `objects-toggle` does not
    exist anywhere in the DOM.
  - Hovering a body row changes canvas pixels over that body, and leaving reverts them.
  - Hovering a Pi's `ethernet` part row changes pixels over the jack only, not the whole
    board. Hovering a Bolt's `tap` row, with Show hidden parts off, shows the translucent
    clearance, and leaving removes it.
  - Hovering a body **fully inside** another (a Cube inside a larger Cube) visibly
    changes pixels. That is the x-ray twin working.
  - Tapping a row selects it (breadcrumb, gizmo), and tapping **Objects** in the
    breadcrumb reopens the list with the selection intact.
  - At 1 selected, ticking a second row's check gives `2 selected` and enables Union and
    Subtract.
  - At phone width, with nothing selected, tapping the Inspector tab opens the sheet on
    the list.
  - Runs at **all three viewports** with a snapshot at each (a panel/overlay/layout
    change), and on **all three engines** (a WebGL material, x-ray and picking path).
- **`TODO/ACCEPTANCE.md` scenarios to re-drive, after rewriting their Steps**:
  - **5**: the hidden-part boolean via the Parts section, and the enclosed-body operand
    via the list. This one matters most.
  - **6**: group vs. sub-part selection.
  - **4**: boolean gating from list checks.
  - **1**: several placed bodies, all listed.
  - **13**: recolour, with the hover tint over an override.
  - **7**: touch-only navigation, now with no Objects toggle in the header.
  - **10**: save and reload, with the list rebuilt.
- **Closed-finding regression surface**: this rewires the exact surfaces three closed
  tasks were filed against. Re-run each one's original repro:
  - **`ui-041`**: select a body entirely inside another with no raycast, and confirm its
    x-ray twin still draws **alongside** a hover twin.
  - **`ui-042`**: a sub-part operand in the correct order (case first, then the jack's
    check), and the parent row's `› ethernet` address while collapsed.
  - **`ui-043`**: the phone header and chrome fit at 390px.
  - **`ui-047`**: the Show hidden parts toggle, and a shown hidden part still pickable as
    its sub-part.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
