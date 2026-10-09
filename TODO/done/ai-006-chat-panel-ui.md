---
title: Assistant chat panel — overlay at phone and tablet, side panel at laptop, with visible agent activity
category: ai
kind: feature
priority: high
model: sonnet
milestone: M9
depends: [ai-004, ai-005]
status: done
---

> **What shipped (2026-10-09).** The chat as specced, plus the core hook `ai-005` handed over:
> `document.removeRecords(ids, { origin })` in `src/core/document.js` (atomic re-fold, both undo stacks untouched,
> refuses by name when a record outside the set depends on one inside it) is what **Undo AI turn** calls. Undo is
> gated on the document `version` matching the one recorded when the turn landed (`stores/aiChat.js`), so any later
> edit by the user switches it off. New: `src/ai/transcript.js` (pure event reducer, row labels, token readout),
> `stores/aiChat.js` (UI state only), `composables/useAgent.js` (turn lifecycle), `ChatPanel.vue`, `Composer.vue`,
> `ActivityRow.vue`, `TokenReadout.vue`; `AssistantPanel.vue` (ai-004's modal) is gone, its test ids moved into
> `ChatPanel`. Differences from the file: the readout is **tokens only** (no price table exists, and a drifting price is
> worse than none); the layout is a bottom sheet with Fold/Half/Tall below 1100px and a fourth grid column above it
> (the persistent column at laptop is not a floating overlay). **The hand-drive found two defects no spec could**:
> the Library, then the selection-driven Inspector sheet, showed through or poked above the chat sheet at 390px; fixed
> by letting the chat own the phone's bottom slot (the other sheets are hidden, not unmounted). Not done: **sheet
> drag-to-resize** (the three heights are buttons, not a drag handle), and the iOS keyboard lift
> (`visualViewport`) has no real-device check yet (see `TODO/VERIFY.md`).

## Goal

A person can talk to the assistant, watch what it does to the model, stop it, and take a
turn back, on a phone as well as a laptop. "Done": an unscripted user types a request,
sees streaming text and one activity row per tool call, sees the new body appear in the
viewport and a History row appear, and can press Stop or **Undo AI turn**.

## Interaction model

- **Precondition**: a key is stored (`ai-004`); otherwise the button opens the key sheet.
  *Send* needs non-empty text or an attached image and no turn already running.
  *Undo AI turn* needs the last turn to have written records and nothing newer by the user.
- **Trigger**: header **Assistant** button (`data-testid="ai-open"`), Enter to send
  (Shift+Enter newline; **Send** button for touch, `ai-send`), **Stop** (`ai-stop`, replaces
  Send while running), **Attach image** (`ai-attach`: file picker, which on a phone offers
  the camera), **Undo AI turn** (`ai-undo-turn`).
- **Feedback**:
  - Streaming assistant text; each tool call is a collapsed **activity row** ("Created
    Sketch *Wing root* · 3 slices", "Subtract *Cube 1* − *Cylinder 2*") with its result;
    tapping a row selects the affected body (so the viewport answers the chat); an error row
    is visibly distinct and says what the agent did next.
  - The viewport is **never hidden**: the panel is a translucent / minimisable bottom sheet
    at phone and tablet width, a persistent side panel at laptop (`CLAUDE.md` Responsive
    Layout). Minimising keeps a one-line status ("Working… step 4") so a long turn is still
    visible.
  - Per-turn token/cost readout; running state shown on the header button.
- **Selection response**: selecting a body adds a "Ask about this" chip that pre-fills the
  composer with a reference to that body's id and name; the AI is told the selection.
- **Selection count**: n/a (the chat does not gate on selection).
- **Small-screen behavior**: sheet snaps to three heights (peek / half / full); composer
  stays above the on-screen keyboard (visual viewport handling, which is a classic iOS
  Safari failure — test it); every control ≥ 44 px; no horizontal scroll at 390 px.
- **Placement**: n/a (the AI places bodies by tool call; the viewport animates them in).

## Documentation

Extend `docs/ai-partner.md`: *Asking for a part*, *Stopping and undoing*. Example: "Tap
**Assistant**, type *a 40 mm cube with a 10 mm hole through the middle*, tap **Send**. Two
activity rows appear and the cube shows in the viewport. Tap **Undo AI turn** and it is gone."

## Affected files

- `src/components/ai/ChatPanel.vue`, `Composer.vue`, `ActivityRow.vue`, `TokenReadout.vue`,
  `src/stores/ai.js` (UI state only: open/height/draft/running — transcript text may live
  here, **document state never**), `src/composables/useAgent.js`, `docs/ai-partner.md`;
  mounted from the root view.

## Effort

L.

## Testing

- **Unit**: transcript reducer (streamed text, tool rows, errors); composer disabled states.
- **E2E** (`e2e/ai-chat.e2e.js` → `/`, scripted provider via route stubbing, **not** a live
  model): open, send, rows appear, body appears, Stop, Undo AI turn. **Three viewports with
  a snapshot each; all three engines** — the on-screen-keyboard and sheet behaviour is
  exactly the kind of Safari-only bug both earlier attempts shipped.
- **Acceptance**: re-drive 1 (two primitives stay visible while the sheet is open), 7
  (touch-only nav still works with the sheet at each height); closed findings `ui-020 #3`
  (canvas ≥ 69% reachable), `ui-043`, `ui-046`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
