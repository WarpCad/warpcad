---
title: When an MCP agent is connected, hide the Assistant's chat chrome and shrink the bridge status to a chip
category: ui
kind: feature
priority: medium
model: sonnet
milestone: M9
depends: [ai-012, ai-020]
status: open
---

## Goal

The Assistant panel has two modes. With your own API key, it is a chat: the composer, the
transcript, the token readout, the model row. With the live bridge (`ai-012`), an external agent
such as Claude Code does the work and the chat is not used. Right now the bridge mode keeps most of
the chat panel on screen, so it is mostly empty space.

Done means: while the bridge is **connected**, the Assistant shows only what the person needs to
see about the bridge (the status and a way to reconnect or disconnect), and the rest of the panel
is hidden. The bridge status takes as little screen area as possible at every width. Once the
bridge disconnects, or no agent is connected, the full Assistant comes back exactly as it is now.

This is hiding, not removing: the chat, its state and the key path stay in the code, and the
user can still reach **Key and model…** from the panel to save a key, so BYOK still works.

## Interaction model

- **Precondition**: the live bridge is `connected` (`chat.bridge === 'connected'`, from
  `src/stores/aiChat.js`). Not a selection precondition: this is panel state, not an operation.
- **Trigger**: automatic. The panel reads the bridge state. No new control is added. The way out
  stays: the bridge chip still opens **Connect to Claude Code**, which can disconnect (or reconnect
  with a new code). A **Key and model…** link stays reachable from the connect sheet, so a user
  who wants BYOK instead can still get to the key sheet.
- **Feedback**: the chat area and composer disappear, and the header reads the bridge state in a
  compact chip: `Claude Code · connected` (or the existing wording, unchanged). The bridge chip
  remains the one status control.
- **Placement**: n/a (no geometry).
- **Selection response**: n/a.
- **Selection count**: n/a.
- **Small-screen behavior**: at phone width the connected Assistant sheet collapses to its header
  row (the chip) and nothing else, so the viewport keeps the space. The chip must stay a tappable
  control of at least 44 px, which the header already meets. Don't shrink it below that to save
  space.

## Documentation

- **Page**: `docs/mcp.md`, section *Live mode: Claude Code edits the project you have open*.
  Add: "While Claude Code is connected, the Assistant panel shows only the connection status. To
  use your own API key instead, open **Connect to Claude Code** and choose **Key and model…**."
- **Example**: "Run `npm run dev`, pair Claude Code with the code from **Assistant ▾ → Connect to
  Claude Code**. The panel now shows just **Claude Code · connected** in its header. Ask Claude
  Code for a change in its own window and watch it appear in the viewport. To go back to the chat,
  tap **Claude Code · connected** and choose **Disconnect**, then **Key and model…**."
- **Media**: the `e2e/docs/` mobile shot that shows the Assistant (look for it under
  `e2e/docs/`, probably the Assistant or live-bridge shot). Re-shoot it with
  `npm run docs:screenshots:update` once the bridge-connected state is captured, and embed the new
  `mcp-connected.png` in `docs/mcp.md`. If no shot covers the connected state, add one.

## Affected files

- `src/components/ai/ChatPanel.vue`: hide the transcript, composer and token readout when
  `chat.bridge === 'connected'`. This is the view that renders the bridge state now. Keep the
  hidden nodes mounted (`v-show`) so no state is lost.
- `src/components/ai/Composer.vue`: no change, unless the composer must be non-focusable while
  hidden.
- `src/components/ai/BridgeChip.vue`: confirm the compact form at phone width.
- `src/components/ai/ConnectClaudeCode.vue`: add the **Key and model…** link and the disconnect
  action, if it is not already there.
- `e2e/mcp-connected-assistant.e2e.js` (new): see Testing.

## Proposed fix

Hide the chat body by bridge state, not by a separate flag. The bridge store is the one source of
truth. In `ChatPanel.vue`, wrap the transcript, composer and token readout in one `v-show` on
`chat.bridge !== 'connected'`, and have the header render only the chip while connected. Leave
the key and subscription paths untouched.

Don't reuse the `claudeCodeOnly` branch in `assistant.js` to decide this, if it has drifted from
the bridge state. Check it first; `ai-020`'s note says it is driven by `bridge: connected` and no
scripted mode, which is the right condition.

## Effort

S to M. Mostly a template change plus one spec.

## Testing

- **Unit** (`src/components/ai/ChatPanel.spec.js`, new or extended): with the bridge `connected`,
  the transcript and composer are not visible; with `disconnected` or `waiting`, they are. The
  chip's label is unchanged.
- **E2E** (`e2e/mcp-connected-assistant.e2e.js`, navigates to `/`, against a fake connected bridge
  state with the same test hook used by `e2e/ai-*.e2e.js`; do not run a real Claude Code):
  1. With no bridge, open the Assistant: the full chat is visible (regression guard).
  2. Put the bridge in `connected`: the transcript, composer and token readout are hidden; the
     chip reads `Claude Code · connected`.
  3. Open the chip, choose **Key and model…**: the key sheet opens and saving a key returns the
     chat to visible when the bridge is not connected.
  4. Assert the viewport's bounding box is unchanged in size between states at each viewport, so
     the space is reclaimed by the panel and not by the canvas shrinking unexpectedly.
  Run at all three reference viewports (phone 390x844, tablet 820x1180, laptop 1440x900) with a
  snapshot at each, since this is layout and overlay behaviour.
- **Browser engines**: Chromium and WebKit. The layout is DOM/CSS, but the phone bottom sheet has
  failed on WebKit before (`ui-070`, scenario 12). Firefox runs locally only.
- **Acceptance scenarios to re-drive by hand**:
  - **25** (live bridge, Claude Code edits the open project): the connected panel must still be
    usable as the status surface, and the drop-through still lands both bodies.
  - **6** (group vs. sub-part selection, at phone width): the Inspector's tab must still be
    reachable with the connected Assistant open.
  - **24** (edit while the Assistant works): with the chat hidden, the user must still be able to
    drag and select while an agent is active.
- **Closed findings whose repro gets re-run**: `ai-020` (the panel's connected state drives the
  header and the composer's disabled reason; this change hides both, so re-run its steps and
  confirm the status text still reads correctly). `ui-070` (phone Inspector tab vs. sheets), since
  the Assistant's bottom slot shares the phone layout with it.

## Notes

Raised by the user on 2026-10-16 in `TODO/NEW-TODO.md`. Independent of `ai-023` (Copilot
pairing): this keys on the bridge state, not the agent's name, so once another agent can connect
through `ai-023`, this mode applies to it with no extra change.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
