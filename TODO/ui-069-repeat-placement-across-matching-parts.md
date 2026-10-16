---
title: Repeat — place a part once against one target, then apply the same steps to every matching target
category: ui
kind: feature
priority: medium
model: opus
depends: [core-061]
status: open
---

## Goal

Requested by the user on 2026-10-15:

> *"Some tasks are repetitive, for example, load a Raspberry Pi 5 and a Touchscreen 2, rotate the
> screen and align the holes and mounting posts, snap the Pi mb to the top of the mounting posts.
> Now create an M2.5 socket head bolt, rotate and align with the Pi holes and snap it to the inside
> of the mb with a −5 mm offset (so the screw will be 5 mm inside the screen post). You now have to
> repeat the same operation for the other holes. […] You select the Pi holes, start the repeat, then
> add the part to one till it's finished (rotated, aligned and snapped), and apply the repeat. All 4
> screws should be done."*

Today the second, third and fourth screws each cost the same five steps as the first: drag a bolt
from the Library, rotate it, tick the next hole in the Objects list, Align X/Y, re-address to `mb`,
Snap Z with the offset. There is no Duplicate or pattern command to shortcut them.

This task is the **control**: the **⟳ Repeat** button, the recording panel, and the docs.
`core-061` is the **record** it commits: a linked `pattern.repeat` row, so editing the first
bolt later updates every repeat (the user's choice, 2026-10-15).

**Done looks like:** with the Pi drilled into `hole1`, the user presses **⟳ Repeat**, sees
`hole1`–`hole4` pre-ticked as targets, finishes one screw on `hole1` the normal way, presses
**Apply to 3 more**, and three more screws appear, each turned the same, centred on its own hole
and 5 mm into its post. That is **one** Undo step and **one** History row (*Repeat → hole2, hole3,
hole4*). Changing Bolt 1's length afterwards changes all four.

## Decisions (confirmed with the user 2026-10-15)

1. **Linked, not copied.** Apply appends one `core-061` `pattern.repeat` record. The repeats follow
   any edit to Bolt 1's existing steps; a *new* move of Bolt 1 after the Repeat row moves Bolt 1
   only (`core-061` decision 4). To make one repeat different, **Detach** it.
2. **Start first.** Repeat is armed *before* the first part exists; the session's subject is the
   next body created. A part finished before Repeat was pressed can't be the subject: delete it and
   redo it inside the session.
3. **Targets are parts of one body**, such as a Pi's `hole1`–`hole4` or a screen's four posts.
   Targets spread over separate bodies are out of scope.
4. **The AI gets the same capability**, through `core-061`'s `repeat` tool in the shared registry.
   This task adds no AI code of its own.

## Design decisions (made here, so `/fix-todo` doesn't re-derive them)

1. **Repeat is an operation, not a Library feature.** The user suggested the Library; it is the
   wrong home under `CLAUDE.md`'s Interaction Model: the Library is a *creation* surface, Repeat is
   gated on a *selection*, and "creation and operation are never the same list". The Library does
   take part (it's where the screw is dragged from, and it shows a one-line hint while a session is
   armed), but the control that starts and applies Repeat sits in the Operations toolbar beside
   **⇔ Align**.
2. **Targets are picked inside the Repeat panel, not in the global selection.** The selection store
   holds one part per body (`addressMap: { [bodyId]: partName }`, `src/stores/selection.js:25`), so
   "hole1 *and* hole2 on the same Pi" can't be expressed there, and `ui-063` showed how many callers
   assume that shape. The session owns its own list: drill into one part (the **seed**, `hole1`),
   press Repeat, and the panel lists that body's parts as checkboxes, **pre-ticking the seed's name
   family** (`core-061`'s `nameFamily`: `hole1` → `hole1`…`hole4`). No change to `selection.js`.
3. **The session watches one body, the subject**: the first body created after Repeat is armed (a
   Library drop, a primitive, a My-parts drop). The panel lists each step committed to the
   subject's lineage as it lands, marking the ones that mention the seed with `↻` (they will be
   re-aimed per target). Records that touch other bodies are listed under "not part of the repeat"
   so nothing is silently included or dropped. Only committed **local-origin** records count; an AI
   or merge record arriving mid-session is listed as "not part of the repeat" even if it touches
   the subject.
4. **Apply** calls the same command-layer append `core-061`'s `repeat` tool uses, with
   `source: subject`, `seed: { id, pieces }`, `targets: ticked − seed`, one local-origin
   transaction. If `core-061` refuses (decision 5 there), the panel shows the reason in red and
   nothing is committed. The most likely one, *"Nothing in Bolt 1's steps refers to hole1"*, is
   also shown live, so Apply stays disabled until a step mentions the seed.

## Interaction model

- **Precondition** — exactly **one** body selected, drilled into one named part (the seed), and that
  body has at least one other part. The subject must not exist yet.
- **Trigger** — a **⟳ Repeat** button in the Operations toolbar (`OperationsToolbar.vue`), beside
  **⇔ Align**, `data-testid="op-repeat"`. Disabled with a tooltip saying why when the precondition
  fails (*"Drill into a part first, such as a hole"*, *"This part has no others to repeat on"*).
  Pressing it opens the **Repeat panel** and arms the session.
- **The Repeat panel** (`data-testid="repeat-sheet"`), stays open while the user works:
  - Top line: **Repeat on Raspberry Pi 1 › hole1 and 3 more**.
  - Targets: a checklist of the body's parts, the seed ticked and locked, its name family
    pre-ticked (`repeat-target-<part>`).
  - Status, which changes as the session runs:
    1. *"Now make one part on hole1: drag it in, turn it, Align and Snap it as usual."*
    2. after the subject is created: *"Recording Bolt 1: 3 steps"*, with each step listed
       (`Rotate`, `↻ Align → hole1 (X, Y)`, `Snap → mb (Z, −5 mm)`).
  - **Apply to 3 more** (`repeat-apply`), enabled once the subject exists, at least one step
    mentions the seed, and at least one target besides the seed is ticked. **Cancel**
    (`repeat-cancel`, and **Escape**) ends the session and keeps the first part as it is; nothing is
    undone. Escape closes the Align popover first if it is open (`ui-060`'s Escape order).
- **During the session** — the Library shows one hint line above its sections:
  *"Repeating on 4 targets: drag the part you want onto hole1."* Every other ticked target is
  outlined in the viewport with the Objects list's hovered-part highlight, so the user can see where
  the repeats will go. Everything else works normally (Align, the gizmo, the Inspector).
- **Feedback** — on Apply, the repeats appear at once, the panel closes, a History row
  *Repeat → hole2, hole3, hole4* appears, and a toast reads *"Repeated Bolt 1 on 3 more holes"*
  with **Undo**. One Undo removes the Repeat row and leaves Bolt 1.
- **Placement** — the subject is placed by the normal drag-to-place interaction. The repeats are
  placed by Bolt 1's own steps re-aimed at each target, not by a drag; that is the point of the
  feature, and it is stated here because `CLAUDE.md` asks for any non-drag placement to be justified.
- **Selection response** — after Apply, the new repeat body (*Bolt 1 ×3*) is selected. Its
  Inspector shows `core-061` decision 6: the source's name, read-only Parameters, **Go to Bolt 1**
  (`repeat-goto-source`) and **Detach** (`repeat-detach`). No transform gizmo attaches to it; the
  gizmo's place shows *"Move Bolt 1 or the Pi; the repeats follow them."* Drilling into one member
  (`hole3`) and pressing Delete removes that one repeat.
- **Selection count** — exactly 1 body with 1 addressed part to start; at least 2 ticked targets
  (the seed plus one) to apply. Apply's label carries the count.
- **Small-screen behavior** — at phone width the panel is a bottom sheet that **minimises to a
  single bar** (`Repeating on 4 · Bolt 1: 3 steps · Apply`) whenever the user drags in the viewport
  or opens the Library, so the viewport and the Align popover stay usable underneath. The bar's
  **Apply** works without expanding it. Tablet and laptop: a floating panel anchored to the
  Operations toolbar, the same anchoring as the Align popover.

## Affected files

- `src/stores/repeat.js` (new, UI-only Pinia store): the armed session (seed body, seed part,
  targets, log position at arming, subject id). Session state never enters the document.
- `src/components/viewport/OperationsToolbar.vue`: the **⟳ Repeat** button and its gate.
- `src/components/viewport/RepeatSheet.vue` (new): the panel above.
- `src/components/inspector/`: the repeat body's source line, **Go to Bolt 1**, **Detach**, and the
  gizmo-refusal note (the behaviour is `core-061`'s; the controls are here).
- `src/components/layout/LibraryPanel.vue`: the session hint line.
- `src/components/viewport/Viewport.vue`: the target outlines during a session.
- `src/help/topics.js`: map the Repeat panel to the new docs section.
- `docs/snap-align.md`, `docs/hardware-library.md`, `docs/timeline.md`,
  `e2e/docs/snap-align.docs.js`, `docs/media/manifest.json`.

## Proposed fix

1. Store and session watcher first (unit-tested against a fake document), then the button and
   panel, then the Inspector controls, then docs and media.
2. Reuse `core-061`'s `nameFamily` and refusal reasons; do not re-implement them in the component.

## Effort

M on top of `core-061`: the session store, the panel's minimising bottom sheet and the Inspector
controls.

## Testing

- **Unit.**
  - `src/stores/repeat.spec.js`: arming needs exactly one body with an addressed part; the subject
    is the first body created after arming; only that lineage's local-origin steps are recorded; an
    `ai`/`mcp`/merge record touching the subject goes to "not part of the repeat"; deleting the
    subject mid-session ends it with nothing applied; Cancel undoes nothing.
  - Apply's enabled state: no subject; subject with no step mentioning the seed; only the seed
    ticked; all good.
- **E2E — a new `e2e/repeat-placement.e2e.js`** that navigates to `/` and drives the user's flow:
  drag a Pi 5 and a Touchscreen 2 in from the Library, seat the Pi on the posts (Align X/Y with
  `hole1`/`piMountingPost1`, Snap `mb` on Z), drill into `hole1`, press **⟳ Repeat**, check
  `hole1`–`hole4` are ticked, drag a **Bolt** (M2.5) in, rotate it, Align X/Y to `hole1`, Snap to
  `mb` on Z with Offset −5, press **Apply to 3 more**, and read all four bolts' positions back
  through the Inspector. Then: change Bolt 1's **Length** in the Inspector and check all four change;
  **Undo** (back to one bolt), **Redo**; Delete one member; **Detach** another; save and reload.
  Runs at **all three viewports** (the panel is a minimising bottom sheet at phone width) with a
  snapshot at each, and on **all three engines** (Library drag, canvas selection and Objects-list
  ticking are engine-sensitive).
- **Acceptance scenarios to re-drive by hand** (not scripted), PASS/FAIL each: **3** (snap-placement
  of a kit assembly), **6** (group vs. sub-part selection), **10** (save, reload, nothing changed),
  **12** (edit a step mid-history: edit Bolt 1's Align after Apply, all four follow), **15** (change
  the Pi's model under the repeats; the repair dialog lists the right members), **22** (merge a
  copy).
- **Closed findings whose repro to re-run verbatim**: `ui-063` (both-sides sub-part Align, the
  "Mounting a Raspberry Pi on a screen's posts" walkthrough), `ui-035`, `ui-060` (the Align tool and
  its Escape order, since Repeat sits beside it), `ui-042`/`ui-049` (Objects-list part rows),
  `core-034` (`hole1`–`hole4` still addressable).

## Documentation

- **Page**: `docs/snap-align.md`, a new section **Repeating a placement on every hole**, right after
  "Mounting a Raspberry Pi on a screen's posts". It covers the panel, what "linked" means (edit
  Bolt 1's steps and every repeat follows; a new move of Bolt 1 doesn't), **Go to Bolt 1**,
  **Detach**, deleting one repeat, and the repair rows when a target goes away. A one-line pointer
  from `docs/hardware-library.md`'s "Example: a matching M2.5 bolt and nut", and the Repeat row's
  label in `docs/timeline.md`.
- **Example** (units are millimetres, Z up):
  1. Seat a Pi 5 on a Touchscreen 2's posts as in the section above.
  2. In the Objects list, tap the Pi's **hole1**. Press **⟳ Repeat**. The panel reads
     *Repeat on Raspberry Pi 1 › hole1 and 3 more*, with `hole1`–`hole4` ticked.
  3. Drag a **Bolt** in from the Library and set it to **M2.5**. Turn it head-up with the rotate
     ring.
  4. Tick the Pi's **hole1** and the bolt, press **⇔ Align**, tap **X ◇ ctr** and **Y ◇ ctr**.
  5. Re-address the Pi to **mb**, set **Snap** to *Inside* and **Offset** to `-5`, and tap the Z
     button that seats the screw 5 mm inside the post. (`/fix-todo`: drive this by hand and write
     the exact button and side here; Repeat copies whichever one the first screw used, so the
     feature doesn't depend on it, but the docs example must be one a user can follow verbatim.)
  6. The panel now lists three steps, one marked ↻. Press **Apply to 3 more**. Bolts appear on
     holes 2, 3 and 4.
  7. Select Bolt 1 and change its **Length** from 12 to 16: all four bolts get longer.
- **Media**: add `repeat-placement.gif` (the whole flow, ending on four bolts and the length edit)
  and `repeat-sheet.png` (the panel mid-session, three steps listed) to
  `e2e/docs/snap-align.docs.js`, both embedded in `docs/snap-align.md`. `e2e/docs-media.spec.js`
  must pass.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
