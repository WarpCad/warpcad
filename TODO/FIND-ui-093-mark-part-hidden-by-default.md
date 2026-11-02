---
title: Mark a part of a group as hidden by default, or a hidden part as shown by default
category: ui
kind: feature
priority: medium
model: sonnet
milestone: none — Findings table, outside the milestone plan (filed 2026-11-02 at the owner's request)
depends: []
status: open
---

## Goal

**In user terms:** the owner can hide and show a part of a group with the eye, but cannot change
whether that part is *hidden by default*, or make a hidden part an ordinary shown one. This adds that
switch. Tick **Hidden by default** on a part and it behaves like a bolt's `tap`: not drawn, carrying the
`hidden` chip, still there to pick and cut with. Untick it on a hidden part, a bolt's `tap` included, and
it becomes an ordinary part.

**Why the eye cannot do this.** "Hidden" already means two things (`ui-089`, rule 6), and only one of
them has a control today:

| | The eye (`ui-089`) | Hidden by default (this task) |
|---|---|---|
| Stored as | `viewHidden` on the project's state line | The part is absent from `Group.names`, through a record |
| On the row | Dimmed, eye crossed out | `hidden` chip |
| Size and bounds | **Counts** | Does not count |
| Export, Print pieces, whole-body cuts | **Included** | Left out |
| Bill of materials | Counted | Counted (`hardwareOf` walks every part) |
| A library copy of the group | Forgets it (the state line is not part of the definition) | Keeps it |
| History and Undo | Neither | One row, one Undo |
| **Show all** | Brings it back | Leaves it hidden |
| Can be set by | Anyone, today | Only a recipe, today. This task adds the control |

The second column is what a person means by "this part is a clearance, not part of the object". Before
this task a Group-made body has **no** hidden parts at all, because `group.assemble` only calls `add()`
without `hidden` (`registry.js:1796`). So the "unhide" half applies today only to built-in shapes, and
the "hide" half has no route for anything.

## Done means

**A Group, hiding by default.** Drag in two **Cubes** (40 × 40 × 40 mm by default) apart from each other,
select both and press **Group**. Tap `Cube 2` under **Parts**, then tick **Hidden by default**:

- `Cube 2` leaves the 3D view, and its row moves below `Cube 1` with the `hidden` chip.
- Step back to the group: **Size reads 40 × 40 × 40 mm**, `Cube 1` alone.
- History gains `Hide Cube 2 by default on Group 1`, and one **Undo** puts everything back.
- **Show hidden parts** now appears, and draws `Cube 2` as a translucent overlay.
- Whole-group Export contains `Cube 1` only. After a reload, all of the above still holds.
- **Show all** does not bring `Cube 2` back. It offers nothing, because the eye hid nothing.

**A built-in, showing by default.** Measured on 2026-11-02 with the kernel half prototyped outside the
repo. For `hardware.bolt` `{ spec: 'm10 hex', length: 20, fit: 'close' }`:

| State | `names` | Size (mm) |
|---|---|---|
| As placed | `head`, `thread` | 18 × 15.588 × 26.5 |
| `tap` shown by default | `head`, `thread`, `tap` | 18.5 × 16.021 × 27 |
| Then `tap` hidden again | `head`, `thread`, identical to the first row | 18 × 15.588 × 26.5 |
| `thread` hidden instead | `head` | 18 × 15.588 × 6.5 |

**The workflow it exists for.** Hide a clearance block inside a Group by default, then Subtract that part
from a shell. The shell gets the pocket and **the Group stays in the scene**, so the next clearance can be
cut too (see the cut rule in Proposed fix).

## Decisions

| Question | Answer | What follows |
|---|---|---|
| Is "by default" the eye's state saved somewhere, or the recipe tier? | **Filing choice: the recipe tier.** The eye is already saved with the project, so a second eye-like flag would add a word and no ability. **Check this with the owner first** if they only wanted a starting visibility that still exports | Size, Export and whole-body cuts all change, which the checkbox's note must say |
| New op, or a flag on `group.removePart`? | **New op, `group.setPartHidden`** | An unknown op is refused by name in an older build, which `project.js` calls the honest outcome. A flag would silently delete the part there |
| Is it an Undo step? | **Yes** | It changes geometry for everything downstream, so `ui-089` rule 1 (a view setting is not a step) does not apply |
| What about the part's eye? | **Marking either way clears that part's eye hide**, through `setViewHidden`, not an undo step | Otherwise ticking off **Hidden by default** on an eye-hidden part changes nothing on screen, the "I pressed it and nothing happened" failure this project keeps paying for |
| What if a later parameter change removes the part? | **The step does nothing, it does not fail.** A hide of an absent part gives the correct geometry, and `dependents.js` would not offer a repair, because it does not read `params.part`. A Pi model change must not break a row over a display choice. Writing a step for an unknown part is still refused at write time | Differs from `removePart` on purpose. Re-run scenario 15 for it |
| Can the last shown part be hidden? | **No.** Same rule and wording pattern as `removePart` | A group with no visible part cannot be drawn, and `hasNamedParts` turns false, so its rows would vanish. Disabled, with the reason beside it |
| Do built-in shapes get it? | **Yes, any body with named parts** | Unhiding a bolt's `tap` is the owner's "opposite" case |
| Is it offered to the AI? | **Filing choice: yes**, in `OPERATIONS`. It deletes nothing and is one undoable step, and `describe_scene` already reports `hidden` per part (`read.js:130`) | `ai-008`-style clearances can be hidden by an agent. Move it to `NOT_OFFERED` if the owner prefers |

## The record

```json
{ "id": "group-1-hide-2", "op": "group.setPartHidden", "target": "group-1", "supersedes": "group-1",
  "params": { "part": "Cube 2", "hidden": true } }
```

Unnamed, `target` and `supersedes` both the current terminal, as `group.removePart` is. The body id does
not change, so `viewHidden`, `hiddenPartVisibility` and the selection all stay keyed correctly.

## Interaction model

- **Precondition**: exactly one body selected, drilled into one named part (breadcrumb
  `Objects ▸ Group 1 ▸ Cube 2`). The body is a group with named parts, and is not a Repeat (see Not in this
  task). The control is **absent**, not disabled, on a plain solid, a whole-body selection, a Repeat and a
  multi-selection.
- **Trigger**: a **Hidden by default** checkbox in the Inspector, directly below the Color row, which is the
  other control that works while drilled in. `data-testid="inspector-default-hidden"`. The whole label is the
  tap target, built like `inspector__hidden-toggle`. Reached by tapping the part's row in **Parts** or the
  Objects list, or a second click in the 3D view; a hidden part is reached from the rows. There is no new
  keyboard shortcut, and **H** stays the eye's. Not on the row itself: at 390 px it already holds a check, a
  name, a chip and an eye (`ui-078`, `ui-085`). Do not use the id `inspector-part-hidden-default`, because
  `partTestId` would collide with a part named `default`.
- **Feedback**: the 3D view updates once the fold lands, the `hidden` chip appears or goes, and the row moves
  (parts list visible first, then hidden). History gains `Hide <part> by default on <body>` or
  `Show <part> by default on <body>`, and Undo reads the same. The note below the checkbox reads *"Left out of
  this shape's size, Export and whole-shape cuts. The eye only hides it from view."* When disabled, it reads
  *"Last shown part: it needs one shown part."* (`inspector-default-hidden-reason`).
- **Placement**: n/a. Nothing moves.
- **Selection response**: the selection stays on the part, breadcrumb unchanged, because the part still exists
  (unlike Remove part, which steps up). A newly hidden part then looks as a selected `tap` does today.
- **Selection count**: exactly one part; the control is absent otherwise. Multi-part marking is not in this task.
- **Small-screen behavior**: same control in the Inspector sheet, 44 px tall, wrapping rather than widening. The
  sheet must not scroll sideways at 390 px (`ui-085`).

## Documentation

- **Page**: `docs/selection-and-inspector.md`, a new **Hidden by default** subsection under **Parts**, plus a
  sentence in **Hide and show** stating the difference and that **Show all** leaves these parts hidden. Update
  `docs/groups.md` (the paragraph on a `hidden` part), `docs/booleans.md` (the cut rule), `docs/hardware-library.md`
  (a `tap` can be shown by default) and `docs/mcp.md` (the op). `docs/export.md:108` says "hidden stays out, exactly
  as it is on screen", while the selection page says a hidden piece is still exported. Both are true of different
  tiers, so reword the Export sentence to name this one.
- **Example** (the page contains this; millimetres, Z up):
  1. Drag two **Cubes** into the view, apart from each other. Select both and press **Group**.
  2. In the Inspector's **Parts** section, tap `Cube 2`. The breadcrumb reads `Group 1 ▸ Cube 2`.
  3. Tick **Hidden by default**. `Cube 2` disappears and its row gains a small **hidden** label.
  4. Tap `Group 1` in the breadcrumb. **Size** now reads 40 × 40 × 40 mm, the size of `Cube 1` alone.
  5. To bring it back as an ordinary part, tap the `Cube 2` row and untick **Hidden by default**.
  6. To do the opposite on a built-in shape, drag in a **Bolt / screw**, tap `tap` in **Parts**, and untick
     **Hidden by default**. The clearance is now drawn, counted in **Size**, and exported with the bolt.

  State plainly: use the eye to look past something for a moment, and this box when the part is not part of
  the finished object. Undo takes this back; it does not take back the eye.
- **Media**: `e2e/docs/selection-inspector.docs.js` gains a still, `docs/screenshots/inspector-default-hidden.png`,
  and a movie, `docs/media/part-hidden-by-default.gif` (the Example's steps 2 to 5), both embedded in
  `docs/selection-and-inspector.md`. `e2e/docs-media.spec.js` guards them.

## Affected files

- `src/core/kernel/group.js`: `setPartHidden(value, partName, hidden)`, beside `removePart`
- `src/core/kernel/registry.js`: the `group.setPartHidden` entry, and the note at `:416`
- `src/core/document.js`: `setPartHidden`, the op-to-verb table at `:1242`, and the module note at `:338`
- `src/core/dependents.js`, `src/core/timelineLabel.js`: verb and label
- `src/core/booleanConsumes.js`: the cut rule, and `LineageView` gains `hiddenPartsOf`
- `src/stores/document.js`: the store action, which also clears the eye
- `src/components/inspector/PartDefaultHidden.vue` (new), `src/components/inspector/Inspector.vue`
- `src/ai/tools/operate.js`
- `docs/` as above, `e2e/part-default-hidden.e2e.js` (new), `e2e/docs/selection-inspector.docs.js`

**Overlaps with `core-076`**, which is open and filed the same day. It adds **Hide these parts** while merging,
and it also adds `hiddenPartsOf` and a hidden-part cut rule for its own `group.merge` root. Neither depends on
the other. Whichever lands first adds `hiddenPartsOf`; the second adds its root to the same list. Merged parts
marked with this control keep their state, because `core-076` carries `names` through.

## Proposed fix

1. **`setPartHidden` in `group.js`.** Returns a frozen group with the same `parts`, `holes`, `colors` and `meta`.
   Only `names` changes, rebuilt as `Object.keys(parts)` filtered to the visible set, so that hide-then-show restores
   the exact original list (prototyped on a bolt, 2026-11-02). Throws for a bare solid, a non-boolean `hidden`, a part
   name that is not a non-empty string, and hiding the last visible part. **An absent part returns the value
   unchanged** (see Decisions). Marking a part already in that state returns the value unchanged too.
2. **The registry entry**: `wholeGroupNative(1, …)`, like `group.removePart`, so that a `pieces` address is refused.
3. **`document.setPartHidden(id, partName, hidden, transaction)`**: `removePart`'s shape, with `document.nextId(`${root}-hide`)`.
   Refuses a deleted body, a Repeat root, and a part the current value does not have (read from `scene.byId`, because
   the fold will no longer refuse it). Refuses a no-op as well, so History cannot gain a row that changes nothing.
4. **The store action**: append with an explicit transaction `label`, then `setViewHidden(id, { subPart, hidden: false })`
   if the eye had hidden it.
5. **The cut rule, or the clearance workflow fails.** Today a sub-part Subtract retires the whole tool body unless the
   op declares drill parts, so cutting with a hidden part of a Group deletes the Group. Extend `keepsToolBody`: **when the
   tool body's lineage root is `group.assemble` and every named piece is hidden, the body stays**. No saved file changes,
   because `consumes` is decided when a record is written. A Group could not hold a hidden part before this task, so no
   current workflow changes either. A bolt's root is `hardware.bolt`, so scenario 5 is untouched and its `tap` is still used
   up. Showing `tap` by default and cutting with it also uses the bolt up, as today. The toolbar and `operate` share this
   rule already.
6. **`PartDefaultHidden.vue`**: reads the selected part's `hidden` from the body summary. It is one extracted component,
   per "views must be thin".
7. **`operate`**: an `OPERATIONS` entry using the "one-body edit in place" pattern (`operate.js:118`), with params `part`
   and `hidden`. It refuses an unknown part with the body's part names in the message. Part names stay data, not
   instructions.
8. **Then docs, e2e and the re-drives.**

## Not in this task

- **A Repeat's members.** `removePart` on a Repeat edits its `targets`, and member names follow them. Hiding a member needs
  its own rule, so the control is absent there.
- Marking several parts at once, or an Objects-list row control.
- Hiding a whole body by default. A body has no tier above the eye, and the eye already covers it.
- Changing what the eye does to Export (`ui-089`'s open question).
- Choosing hidden at creation or in **Group** itself. `core-076` has that for merging.

## Effort

M. `group.removePart` is a close template through the kernel, document, label and undo layers, so most of the work is the
control, the cut rule, the docs and driving the app.

## Testing

- **Unit, `group.spec.js`**, tolerance 1e-6 mm: the bounds in Done means; hide then show restores `names` exactly and leaves
  `parts`, `colors` and `meta` alone; `combine()` and `resolvePieces` before and after (a hidden part is still addressable by
  `pieces`); `hardwareOf` unchanged. Degenerate: a bare solid, the last visible part refused, a one-part group, an absent part
  unchanged, an already-hidden part unchanged, a non-boolean `hidden`, a `__proto__` part name.
- **Unit, `registry.spec.js`, `document.spec.js`**: a `pieces` address is refused; the record supersedes and the body id holds;
  Undo and Redo; suppressing the row, rolling back past it and deleting it each show the part again; an unknown part, a deleted
  body, a Repeat and a no-op are refused. A bolt with `tap` shown by default, then changed to a size with no `tap`: the row folds,
  and no row breaks.
- **Unit, `booleanConsumes.spec.js`**: a hidden part of a Group stays; a visible part retires it; hidden mixed with visible
  retires it; a bolt's `tap` still retires, whether or not it was marked; a Pi's `hole1` still stays (`core-064`).
- **Unit, elsewhere**: `project.spec.js`, the record round-trips byte for byte; `userPart.spec.js`, a library copy keeps the hidden
  state; `transport` keeps `names` through the worker; `operate.spec.js`, the mapped op and its refusal; `timelineLabel.spec.js`,
  both labels.
- **E2E, `e2e/part-default-hidden.e2e.js`, navigates to `/`**: build the Group with real mouse and, at phone and tablet, trusted
  touch. Run Done means: canvas presence through `window.__canvasSnaps`, as `inspector-hidden-parts.e2e.js` does, not by trusting the
  DOM; the chip; Size; the History row; Undo and Redo; reload; **Show all** leaving the part hidden; Export excluding it. Then the bolt
  `tap`, and the last-part refusal. Then cut a plate with the hidden part: the pocket exists and the Group stays. An eye-hidden part
  unticked: drawn straight away.
- **Viewports**: all three, with a snapshot of the control at each, because it changes the Inspector's layout. At phone width in
  WebKit, assert the sheet's `scrollWidth` equals its `clientWidth`.
- **Engines**: all three. It toggles real WebGL meshes and writes to persistence.
- **Acceptance scenarios to re-drive, by hand**: 1 (nothing hides that the user did not hide), **5 (an unmarked bolt's `tap` is still
  used up)**, 6, 10, 11, 12 (edit a step beneath the record), 13 (a recoloured part keeps its colour through hide and show), 14, **15 (a
  Pi model change under a hidden part that the new model lacks)**, 22 (merge a copy holding the record), 24 and 25 (an agent marks a part).
  *Drive it differently*: tick it straight after dragging, before the fold settles; tick and Undo fast; mark a part of a group that has
  been moved and rotated; drill in from the 3D view and from each list; hide the eye first, then tick, then untick; mark the last-but-one
  part, then try the last; use the part in a Snap, then hide it.
- **Closed findings whose repros must be re-run**: `ui-047` and `ui-049` (the toggle and hover preview over a part that became hidden),
  `ui-051` (Remove part on a marked part), `ui-089` (the eye and Show all unchanged), `render-004` (`tap` hidden as placed), `core-064`
  (Pi drilling), `ui-042` and `ui-016` (part rows and the breadcrumb), `ui-085` (the sideways scroll, on a real iPhone).
- **Open `render-007`** is a flake in this same overlay path, so a remnant seen here belongs there, not on this task. Say so in the
  commit if it shows.
- **Perf**: no CSG in the op, only a re-fold of what follows it. No benchmark target.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
