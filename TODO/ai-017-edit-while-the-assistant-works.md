---
title: Keep editing while the Assistant works — an AI turn lands by merge
category: ai
kind: feature
priority: high
model: opus
milestone: M15
depends: [ui-062]
status: open
---

## Goal

During an AI chat turn the viewport switches to the AI's fork in the amber preview mode, and
Operations, Library, Undo and Redo are disabled until it finishes (`ai-partner.md` decision 5).
That lock is what made the turn single-writer. With M15's merge it is no longer needed: the
person keeps working on the live document, the AI works on its fork, and the turn lands as a
merge of the two.

"Done": ask the Assistant for something that takes several tool calls, and while it runs place
a cylinder and move a cube by hand; when the turn ends the AI's bodies appear alongside the
cylinder, the cube is where the user put it, **Undo AI turn** removes only the AI's part, and
header **Undo** removes only the user's.

## Interaction model

- **Precondition** — an Assistant turn is running (a key or a scripted transcript, as today).
- **Trigger** — none to keep editing: every control behaves as it does with no turn running.
  One new control: **Watch** (`ai-watch`), a toggle on the Assistant's status line beside the
  existing `ai-status` text, enabled only while a turn runs.
- **Feedback** —
  - While a turn runs: the status line reads `Working…` as today, and a small chip in the
    header (`ai-working-chip`, visible even with the Assistant panel closed) reads
    `Assistant working`. The viewport shows the **live** document, with no amber outline.
  - **Watch on**: the viewport shows the AI's fork, read-only, in the existing amber preview
    with the label `Watching the Assistant — your project is unchanged`. Operations, Library,
    Undo and Redo are disabled with that reason while watching, as they are in any preview.
    **Watch off**, or the turn ending, returns to the live document.
  - Turn ends cleanly: the AI's rows appear in History with `ai` chips; the transcript line
    reads as today. If the user edited during the turn, it adds
    `Merged with 2 changes you made meanwhile`.
  - Turn ends with a conflict: `ui-062`'s banner (`… — 1 step conflicted`), **Show** and the
    chipped row. The AI's row is the one flagged when the user's edit came first.
  - Stop, cancel, error or cap: the fork is dropped; the live document, including everything
    the user did during the turn, is exactly as the user left it.
  - **Undo AI turn** (`ai-undo-turn`): unchanged in meaning. It removes the turn's rows,
    restores the rows it revised and brings back the ones it removed, and refuses by name if a
    later step builds on one of them.
- **Placement** — unchanged; the AI places by `positionMm`, the user by dragging.
- **Selection response** — unchanged. The user's selection is not changed when a turn lands.
  `get_selection` and `select` act on the fork's own selection, seeded from the user's at turn
  start; say so in the tool descriptions.
- **Selection count** — n/a.
- **Small-screen behavior** — the header chip collapses to an icon with an accessible name at
  ≤ 640 px. **Watch** is inside the Assistant bottom sheet; while watching, the sheet's
  smallest height keeps the viewport visible above it (`CLAUDE.md` Responsive Layout: the chat
  overlays, it does not replace).

## Documentation

- **Page** — `docs/ai-partner.md` ("While the Assistant works") and `docs/merging.md`.
- **Example** — "1. Open the Assistant and ask *add four M3 standoffs at the corners of the
  board*. 2. While it says *Working…*, drag a Cube in from the Library and move it. 3. To see
  what the Assistant is doing, tap **Watch**; tap it again to come back. 4. When it finishes,
  the standoffs appear next to your cube. **Undo AI turn** removes the standoffs only; **Undo**
  removes your move."
- **Media** — `e2e/docs/ai-partner.docs.js`: `ai-working-chip.png` and `ai-watch.png`, embedded
  in `docs/ai-partner.md`; update the existing turn movie if it shows the locked preview.

## Affected files

- `src/ai/agent.js` — `runTurn` (the fork's replica id; landing), `landFork`, `forkChange`,
  `undoAiTurn`, the `AiTurn` record
- `src/composables/useAgent.js`, `src/stores/aiChat.js`, `src/stores/assistant.js` — turn state,
  watch state; `src/stores/timeline.js` — preview source can be the AI's fork
- `src/components/ai/ChatPanel.vue` (Watch), `src/components/display/AiWorkingChip.vue` (new),
  the header slot in `AppView.vue`
- `src/ai/tools/` — selection tools' descriptions; nothing else
- `e2e/ai-chat.e2e.js`, `e2e/ai-scripted.e2e.js`, `e2e/docs/ai-partner.docs.js`
- `docs/ai-partner.md`, `docs/merging.md`, `docs/decisions/ai-partner.md` (decision 5 amended),
  `CLAUDE.md` (AI Partner section), `TODO/ACCEPTANCE.md`

## Proposed fix

1. **Fork as a replica.** The fork is seeded as today and given its own replica id; its clock
   starts from the live document's.
2. **Land by merge.** On success, `live.mergeFrom(fork.mergeState(), { origin: 'ai' })` replaces
   `forkChange` plus `landFork`. Rows keep the origin and intent they were born with on the
   fork. The merge is atomic and never touches the local undo stack (`data-010`).
3. **The turn record** is `data-010`'s returned `change`, restricted to what the fork did, so
   **Undo AI turn** is `ui-062`'s inverse mechanism with origin `ai`. Delete `forkChange` once
   nothing reads it; do not keep two diff implementations.
4. **Stop the pause.** Remove the preview-mode lock that starts with a turn; keep the preview
   machinery for **Watch** and for History.
5. **Staleness the model can see.** The fork does not receive the user's mid-turn edits (the
   user chose one merge at the end, not continuous two-way merging). When the turn lands with
   conflicts, add one line to the transcript the model sees on its next turn naming the
   conflicted rows, as `document_data`, never as instructions (decision 7).
6. **Limits unchanged.** `limits.js` caps count the fork's records, not the merged total.
7. **`ai-012` is not changed here.** Its one-writer rules stay as Decision 11 wrote them;
   relaxing them is a reserved row in the roadmap.

## Effort

L

## Testing

- Unit (`agent.spec.js`): a turn with no user edits lands byte-identical to today's result
  (compare against the recorded fixtures); a turn with interleaved user appends lands both;
  Stop mid-turn leaves the live document, including mid-turn user edits, byte-identical to the
  moment before Stop; Undo AI turn after a mixed landing removes only `ai` rows and leaves both
  local stacks' lengths unchanged; Undo AI turn refuses by name when a user step builds on an
  AI row; a turn that revised a variable the user also changed mid-turn resolves by stamp and
  reports it.
- Unit (`useAgent.spec.js`): Watch is enabled only during a turn; turning it on never mutates
  the live document; the turn ending while watching returns to live.
- App-level `e2e/ai-scripted.e2e.js` (navigates to `/`, scripted transcript with a paced
  provider so the turn is observably in progress): start a turn, drag-place a body and move
  another **with the real pointer** while it runs, toggle Watch on and off, wait for the turn,
  assert both writers' results, the chip, the transcript line, **Undo AI turn**, then header
  **Undo**. A second case forces the move-versus-fillet conflict and asserts the banner. A
  third presses Stop mid-turn after a user edit.
- **New `TODO/ACCEPTANCE.md` scenario 24, "Edit while the Assistant works"**: the Documentation
  example, driven by hand with a real key at laptop and at phone width, including one edit made
  to the very body the Assistant was asked to change.
- Acceptance scenarios to re-drive: **1**, **4**, **12**, **17**, **18**, **21**, **22**, and
  scenario **7** at phone width with the chip showing.
- Closed findings to re-run: `ai-002` (atomic landing; `appendAll`'s fast path is not atomic),
  `ai-006` (Undo AI turn and the local stack; the header Undo's disabled reason pointing at
  Undo AI turn), `ai-014` (revised and removed variable rows restored exactly), `core-056`,
  `ui-032` (History preview still locks editing when the *user* previews a step), `ui-043`.
- Engines: **all three** (viewport, pointer input, IndexedDB autosave during a turn).
- Viewports: **all three**, snapshot of the working chip and of Watch at each.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
