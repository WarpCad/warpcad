---
title: Hide and show bodies and parts from the Inspector's Objects list, so either piece of a split can be seen on its own
category: ui
kind: feature
priority: high
model: opus
milestone: none — Findings table, outside the milestone plan
depends: []
status: done
---

> **What shipped (2026-10-26).** Everything in this spec except three details. The eye and the
> mixed-state half-eye are in `EyeToggle.vue`, and the note in `ViewHiddenNote.vue`; the rows
> were not moved into a new `ObjectRow.vue`, because the rows share scoped styles with body rows.
> "Fit" is not a control in this app, so the framing rule is applied to the on-load framing only.
> Undo merge does not revert visibility (`diffStates` does not report it). Older files and older
> builds both open with everything visible (owner decision, rule 2 and Versioning above).

## Goal

Reported by the user on 2026-10-26 while testing Split (screenshot: `Cube 1`, enlarged to
40 × 90 × 40 mm and split into `Cube 1 A` and `Cube 1 B`, beside `Cylinder 1`, at laptop width).
**After a split the two pieces sit together exactly where the body was, so the user cannot see
either piece on its own.** The joint (pins, tongue, sockets, groove) is on the cut faces, which
face each other and are fully covered. The only way to check that the joint came out right today
is to move a piece out of the way, which changes the model just to look at it.

What this adds: an **eye toggle on every row of the Inspector's Objects list**: on a body row
(`Cube 1`, `Cylinder 1`) and on each part row under an expanded body (`Cube 1 A`, `Cube 1 B`).
Turning it off removes that body or part from the 3D view. Nothing is deleted, nothing moves, and
no geometry changes. Turning it on brings it back.

"Done" looks like: split a cube, expand its row, turn off `Cube 1 A`, and `Cube 1 B` is alone on
screen with its sockets visible; turn `Cube 1 A` back on and `Cube 1 B` off, and the pins on
`Cube 1 A` are visible. Reload the page and the same piece is still hidden. A **Show all** control
brings everything back in one tap.

### Rules that define it

1. **Visibility is a view setting, not a modelling step.** Hiding never changes geometry, the
   History, the BOM, Export or Export → Print pieces: a hidden body or part is still exported and
   still counted. It is **not** an undo step. The same tap that hid a thing shows it again, and
   Undo after hiding undoes the last *modelling* change, not the hide. This is the rule
   `setBuildVolume` and the standing instructions already follow ("a `local` document change that
   bumps the version but is not an undo step", `src/stores/document.js`).
2. **It is saved with the project.** A reload, a saved file reopened, and the autosave all keep
   what was hidden. It travels in the project file's **state line**, not as a record (see Proposed
   fix), so every record line stays byte-identical.
   **A file with no `viewHidden` field opens with everything visible** (owner decision,
   2026-10-26). That covers every file saved before this feature, every file with no state line
   at all, and every file whose state line omits the field. Absence means "nothing hidden", so no
   migration step is needed. An empty `viewHidden` is never written: the field is only written
   when something is hidden.
3. **Body and part are independent switches.** A part is drawn only when **both** its body and the
   part itself are shown. Hiding `Cube 1` hides both pieces. Showing `Cube 1` again restores
   whatever each part was set to before, so a hidden `Cube 1 A` stays hidden.
4. **A hidden thing cannot be picked in the viewport.** A click or tap where it was goes through
   to whatever is behind it, or to empty space. It is never selected by a marquee either.
5. **Hiding something that is selected removes it from the selection.** An operation never acts
   on an operand the user cannot see without having chosen it explicitly. **The Objects list can
   still select a hidden row** (its checkbox and its name work as they do today). That keeps the
   `ui-041` route ("select a body you cannot click") open for a hidden cutter: hide the cutter,
   look at the target, tick both rows, Subtract. A selected hidden body draws no outline and no
   gizmo, because there is nothing on screen to attach either to. The Inspector shows its fields
   with a one-line note, **"Hidden in the view · Show"**.
6. **This is not the existing "hidden part".** `hidden` already means something in this codebase:
   a recipe's helper part that is addressable but not drawn by default (a bolt's `tap`, a washer's
   `clearance`; `group.js`'s `hiddenNamesOf`, `ui-047`'s **Show hidden parts**, the `hidden` chip
   on a part row). The two must stay distinct in code and on screen:
   - **In code**, the new flag is never called bare `hidden`. Use `viewHidden` (state line,
     `Body`, store) so `grep hidden` keeps finding only the recipe concept.
   - **On screen**, user-hidden rows are marked by the **eye-slash icon and a dimmed row, with no
     text chip**, so the existing `hidden` chip keeps its one meaning. The button labels are
     **Hide** and **Show** (`aria-label="Hide Cube 1 A"` / `"Show Cube 1 A"`).
   - **Show hidden parts** reveals recipe helper parts only. It does not override a user's hide,
     and **Show all** does not turn on Show hidden parts.
7. **New bodies are always shown.** A body created by an operation on hidden inputs (a Union of
   two hidden solids) starts visible, because its id is new. A body that keeps its identity
   through an edit (Split, Bisect, Resize all `supersedes` their target) keeps its visibility. A
   part-level hide names a part, and if that part name disappears (re-split, a renamed piece) the
   stale entry is ignored and dropped on the next save.

## Interaction model

- **Precondition** — at least one body exists. The toggles live on the Objects list rows, so no
  selection is needed. `Show all` appears only while something is hidden.
- **Trigger** —
  - An **eye button at the right of each body row and each part row** in the Inspector's Objects
    list (`src/components/inspector/ObjectList.vue`), between the name and the expand chevron on a
    body row. `data-testid="objects-eye-<id>"` on a body row, and `partTestId('eye', id, part)` on
    a part row (the existing helper's pattern). The same eye on rows in the Inspector's **Parts**
    list for a selected body (`inspector-parts-list`), which renders the same part rows.
  - A body row's eye has **three states**: shown, hidden, and *some parts hidden* (a
    half-filled eye). Tapping it when shown hides the body. Tapping it when hidden shows the body.
    Tapping it in the mixed state shows every part of that body.
  - **Show all** (`data-testid="objects-show-all"`): a text button on the Objects list's count
    line, which then reads e.g. `3 objects · 1 hidden · Show all`. It clears every body and part
    hide in one change.
  - **Keyboard, secondary:** `H` toggles visibility of the current selection (bodies, or the
    drilled part); `Shift+H` is Show all. Not active in sketch mode or while a text field has
    focus. Check the existing shortcut map for a collision before taking `H`; the eye buttons are
    the primary trigger because phones have no keyboard.
- **Feedback** — the body or part disappears from the 3D view on the same frame. The row dims and
  its eye becomes an eye-slash. The count line gains `· N hidden · Show all`. Hiding a selected
  thing drops it from the `N selected` count in the Operations toolbar, which re-gates its
  buttons. Turning it back on restores it with its colour override and translucency intact.
- **Placement** — n/a (nothing is created).
- **Selection response** — unchanged for shown bodies. For a hidden body or part selected from the
  list: the Inspector shows its fields plus the note **"Hidden in the view · Show"** (the `Show`
  is a button doing the same as the eye). No outline and no gizmo in the viewport.
- **Selection count** — n/a for the toggle itself. Operations count a hidden-but-selected
  operand like any other operand (rule 5), so Subtract with a hidden cutter works.
- **Small-screen behavior** — the Objects list is in the Inspector sheet at phone width (`ui-079`
  tiers). The eye is a **44 × 44 px tap target** on every row, at every tier. The row's name
  truncates with an ellipsis before the eye or chevron ever wrap or push the row wider than the
  sheet. A sheet that scrolls sideways is `ui-085`'s Safari failure again (see Testing). Show all
  stays on the count line at every width.

## Documentation

- **Page** — `docs/selection-and-inspector.md` (update): a new **Hide and show** section covering
  the eye on body and part rows, the mixed state, Show all, `H` / `Shift+H`, the fact that hiding
  is not an undo step and does not change export, and how it differs from **Show hidden parts**
  (one sentence, linking to `docs/hardware-library.md`'s section). `docs/print-prep.md` (update):
  after the Split steps, one line, "To check the joint, hide one piece: see
  [Hide and show](selection-and-inspector.md#hide-and-show)."
- **Example** —
  1. Drag a **Cube** in from the Library and drop it on the grid.
  2. With it selected, choose **Enlarge** and set it to 40 × 90 × 40 mm (X × Y × Z).
  3. Choose **Split**, keep the default plane across Y and the default pins, and confirm. The
     Objects list now shows `Cube 1` with a ▸.
  4. Tap ▸ beside `Cube 1`. Tap the eye on **Cube 1 A**. Piece A disappears and you are looking at
     the cut face of **Cube 1 B**, with its sockets.
  5. Tap the eye on Cube 1 A again, then the eye on **Cube 1 B**. Now you see Cube 1 A's pins.
  6. Tap **Show all** on the Objects count line to bring everything back.
- **Media** — new `e2e/docs/object-visibility.docs.js` producing
  `docs/screenshots/objects-hide-split-piece.png` (step 4: Cube 1 A off, Cube 1 B's socket face
  visible, the dimmed row and eye-slash in the Objects list), embedded in
  `docs/selection-and-inspector.md` and reused by `docs/print-prep.md`. Regenerate with
  `npm run docs:media`.

## Affected files

- `src/core/project.js` — state-line field `viewHidden` (read, write, validate, refuse a wrong
  type like every other state-line field). Written only when something is hidden, so a document
  that never hid anything keeps its bytes.
- `src/core/merge/state.js`, `src/core/merge/merge.js`, `src/core/merge/section.js` — the merge
  rule for the new field (see Proposed fix).
- `src/core/document.js` — a `setViewHidden(id, { subPart?, hidden }, transaction)` and
  `showAll(transaction)` beside `setBuildVolume` in the command table (non-undoable, `local`
  origin), and a derived `Body.viewHidden` / `Body.viewHiddenParts` on `bodies()`.
- `src/core/visibility.js` (new) — the one rule "is this body / this part drawn?" (rule 3) and
  "which ids are hidden?", framework-free, read by both the store and the render loop. This is the
  same reasoning that gave `colorOverride.js` its own module.
- `src/stores/document.js` — `setViewHidden`, `showAll`, and dropping newly hidden ids from the
  selection store.
- `src/stores/selection.js` (or wherever selection lives) — prune on hide.
- `src/render/mesh.js` — skip hidden bodies and parts when building or updating the scene
  (`mesh.visible = false` on the existing per-part meshes, not a rebuild).
- `src/render/pick.js` and the marquee — exclude hidden meshes.
- `src/components/inspector/ObjectList.vue` — the eye buttons, the mixed state, the dimmed row,
  the count line and Show all. It is 838 lines already, so the row markup is the natural thing to
  extract into `src/components/inspector/ObjectRow.vue` (`/refactor-ui`) if the eye pushes it
  further.
- The Inspector body panel — the "Hidden in the view · Show" note.
- The keyboard-shortcut composable — `H` / `Shift+H`.
- `docs/selection-and-inspector.md`, `docs/print-prep.md`
- `e2e/object-visibility.e2e.js` (new), `e2e/docs/object-visibility.docs.js` (new)

## Proposed fix

**Where the state lives: the project file's state line, not a record and not Pinia.**

- *Not a record* (`style.hide`, mirroring `style.recolor`): every toggle would be a History row
  and an undo step. Checking a joint means flipping two pieces back and forth several times, which
  would bury the real modelling steps. `core-037` rejected a record for user-part definitions on
  the same grounds ("as a record it would be a History row, an Undo step").
- *Not UI-only state* (a Pinia store): it would be lost on reload, and a project reopened with a
  hidden piece silently visible again is the less surprising failure but still a failure of rule 2.
  It would also be invisible to the merge and to an AI partner reading the file.
- *The state line* already carries exactly this class of data (`buildVolume`,
  `standingInstructions`, `suppressed`, `intents`), non-undoable and byte-neutral for records.

**Shape.** `viewHidden: { "<bodyId>": true | { "parts": ["Cube 1 A"] } | { "body": true, "parts": [...] } }`
or an equivalent shape the implementer finds cleaner, as long as body-level and part-level flags
are independent (rule 3). Written only when non-empty. Keyed by **body id**: the id that `Split`,
`Bisect` and `Resize` keep via `supersedes`, so a split body's hide survives a re-split.

**Merge (`docs-022`).** Per-body, per-part **last-writer-wins**, stamped like the per-entry
`suppressed` flag (`Lww<boolean>` in `MergeEntry`), **not** one register for the whole map. That
way, if one replica hides `Cube 1 A` and another hides `Cylinder 1`, both survive the merge. An
AI turn (`mergeFrom`, `ai-017`) that never touched visibility must never flip the user's choice,
which falls out of LWW because it writes no stamp. Pin in `merge.spec.js`: concurrent hides of
different parts both survive, and concurrent hide/show of the *same* part resolves to the later
stamp.

**Versioning.** Older *files* are settled: no field means everything is visible (rule 2). The
remaining check is about older *builds* opening a newer file. Add the field the way `intents` and
`parts` were added: a build that predates it ignores an unknown state-line field and opens the file
with everything shown. That is the same outcome rule 2 gives an older file, so it is acceptable. Confirm that holds
for the merge-metadata **version 2** state line as well as version 1, and pin it in
`project.spec.js`. If version 2's reader refuses unknown fields, stop and say so; a version bump
would make older builds refuse the file and is a decision for the owner.

**Render.** `mesh.js` already builds one `Mesh` per part with `userData.partName`. Visibility is
`mesh.visible`, set from `visibility.js`'s rule whenever the scene or `viewHidden` changes. No
geometry rebuild, no kernel round-trip, and no per-frame allocation. The `ui-049` transient
hover-preview of a recipe-hidden part must not resurrect a user-hidden one: a user-hidden part's
row hover shows nothing.

**Fit / Home.** Framing ("fit to view") uses visible geometry only, so a user who hid everything
but one piece and presses Fit gets that piece. If nothing is visible, Fit frames all bodies as
today.

**Out of scope, file separately if wanted.** MCP / Assistant tools to read or set visibility. The
read side (a `viewHidden` flag on the body summary the tools return) is a one-line follow-up, and
the write side needs a decision on whether an agent may hide things. Also out of scope: isolate
("hide everything else"), which is Show all plus hides and can wait for a request.

## Effort

L: a state-line field with its merge rule, a render filter, a pick filter, a selection rule, three
UI surfaces (body rows, part rows, Parts list), a shortcut, two doc pages, and a 3 × 3 e2e. If it
runs long, land it in two commits: (1) core + merge + store + render, with unit tests, then (2) the
Objects list UI, shortcut, docs and e2e. Do not ship (1) without (2): the feature is not reachable
until the eye exists.

## Testing

- **Unit (core, Node):**
  - `visibility.spec.js`: rule 3's truth table (body shown/hidden × part shown/hidden); stale part
    names ignored; a new body id defaults to shown.
  - `project.spec.js`: round-trip of `viewHidden`; a document that never hid anything is
    byte-identical; a malformed field (`viewHidden: 3`, a part list that is not strings) is refused
    by name. Every existing project fixture (`src/core/__fixtures__/projectText.js` and the
    pre-feature files the merge tests use) opens with **every body and part visible**: a file
    with no state line, a version 1 line and a version 2 line, each without the field. Re-saving
    such a file without hiding anything leaves it byte-identical, with no empty `viewHidden`
    added. A build ignoring the field still opens the file (both state-line versions).
  - `merge.spec.js`: the two LWW cases above, plus an AI-fork merge that leaves a user's hide
    untouched.
  - `document.spec.js`: `setViewHidden` bumps the version, pushes **no** undo step, and Undo
    after a hide undoes the previous modelling change; Split of a hidden body keeps it hidden.
- **Unit (store/render):** hiding a selected body removes it from the selection; a hidden mesh has
  `visible === false` and is excluded by `pick.js` (a ray through a hidden part hits the part
  behind it or nothing).
- **E2E, `e2e/object-visibility.e2e.js`, navigates to `/`.** It drives the Example above:
  1. Place a cube, Enlarge it, and Split it.
  2. Expand the row and hide `Cube 1 A`. Assert the row has the eye-slash and the count line says
     `1 hidden`.
  3. Click the viewport where A was: nothing gets selected, or B does, but never `Cube 1 A`.
  4. Reload: A is still hidden.
  5. Show all: both pieces are back.
  6. Select a body, then hide it: `0 selected`.
  7. Tick a hidden body's checkbox: it is selected, the Inspector shows the "Hidden in the view"
     note, and no gizmo is drawn.

  Canvas presence is asserted the way `inspector-hidden-parts.e2e.js` does it
  (`window.__canvasSnaps`), not by trusting the DOM.
  **All three reference viewports** (phone/tablet/laptop) with a snapshot of the Objects list at
  each, because the eye changes row layout at 390 px. **All three engines** (Chromium/Firefox/
  WebKit), because it toggles real WebGL meshes and picking, and it writes to IndexedDB
  (autosave). At phone width in WebKit, assert the Inspector sheet's `scrollWidth` equals its
  `clientWidth`, so the new button cannot reintroduce `ui-085`'s sideways scroll.
- **Acceptance scenarios to re-drive, by hand:**
  - 1 (Two independent primitives): nothing hides that the user didn't hide.
  - 5 (Hidden-part boolean): the recipe `tap` is still a separate concept, and Show hidden parts
    still works with a user hide on the same body.
  - 6 (Group vs. sub-part selection): part rows still select, and the eye doesn't steal the tap.
  - 10 (Save, reload, and confirm nothing changed): visibility round-trips and nothing else moves.
  - 13 (Recolor a placed body): a hidden-then-shown part keeps its colour.
  - 17 (Airfoil and wing, ready to print): hiding a split piece doesn't drop it from Print pieces.
  - 22 (Merge a copy of the project): visibility merges per rule above.
- **Closed findings to re-run:**
  - `ui-042` (expandable part rows): the row still expands, and a part is still a boolean operand.
  - `ui-047` (Show hidden parts): the toggle is unchanged and independent of user hides.
  - `ui-049` (hover preview of a hidden part): it never shows a user-hidden part.
  - `ui-085` (sheet scrolls sideways in Safari): the scrollWidth check above, on a real iPhone too.
  - `io-007` (split): the split piece names and Print pieces are unchanged.

## Open questions

- **Should Export skip hidden things?** This spec says no (rule 1: visibility is a view setting).
  Some CAD tools export only what's visible. If the owner wants that, it's an Export-dialog option
  ("Only visible objects"), off by default, as a follow-up task, not a change to rule 1.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
