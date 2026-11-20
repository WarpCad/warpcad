---
title: Add a "Copy setup for a browser agent" button to the Assistant, with the user's request going after it
category: ui
kind: feature
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-20 at the owner's request
depends: []
status: done
---

> **Shipped 2026-11-20.** As specced: `STARTER_BROWSER_AGENT` in `src/ai/mcpPrompts.js`, a `BrowserAgentSetup.vue` (button, hint line, Show the text disclosure) shown in the Assistant's meta block and the hosted Live MCP access panel while the switch is on; `docs/webmcp.md` quotes the constant, checked by a unit spec. The real Claude in Chrome re-drive of scenario 27 is owner item M25. `webmcp-chip.png` did not change (the shot does not frame the button); no new picture was added.

## Goal

To drive WarpCad from Claude in Chrome, a user has to paste a setup paragraph before their own
request (`docs/webmcp.md`, *Using Claude in Chrome*). Without it the agent says it can't call the
tools, calls `executeTool` the wrong way, or stops after the first page of `list_ops`. That
paragraph exists only in the docs today, so the user has to open Help, find the paragraph, select
it and copy it every time.

Owner's request, 2026-11-20: *"If I want to create something in the claude extension, and I want
this setup for my prompt, I'd like to have a button in the assistant to copy this for me. It should
also include instructions that indicate if it needs to go before or after the instructions of what
I want built."*

Done looks like this:

1. The Assistant panel has a **Copy setup for a browser agent** button wherever the **Browser
   agents** switch is shown and on.
2. Next to the button, a short line says where the request goes: *Paste this into your agent
   first, then type what you want built after it.*
3. The copied text says the same in its own words, so it still makes sense pasted alone. It ends
   with a labelled slot the request follows, for example a last line
   `What I want built (my request follows this line):`. Any agent, and the user, then reads the
   setup first and the request second.
4. The text has **one source**: a constant in `src/ai/` (beside `STARTER_OTHER_AGENT` in
   `src/ai/mcpPrompts.js`, say `STARTER_BROWSER_AGENT`). `docs/webmcp.md` quotes it, and a unit
   spec fails if the docs quote and the constant differ. The docs paragraph and the in-app button
   can't drift apart. They already drifted once: `executeTool`'s signature, corrected 2026-11-20.
5. The constant carries what the docs paragraph does today: call the tools through the JavaScript
   tool; `getTools()` then `executeTool(toolObject, plainObjectArgs)`; parse the JSON string
   result; follow `incomplete` / `page.more` before deciding an op doesn't exist (`ai-050`); call
   `record_prompt` first with the user's request. It names no project content (Decision 7: project
   text is data, and this text is pasted into another agent).

## Interaction model

- **Precondition** — the browser offers WebMCP (`chat.webMcp !== 'unavailable'`) and the
  **Browser agents** switch is **on**. When the switch is off, the button is hidden. Copying
  instructions for tools that aren't offered would only confuse the agent.
- **Trigger** — a **Copy setup for a browser agent** button in the Assistant panel
  (`src/components/ai/ChatPanel.vue`), next to the `WebMcpChip` switch, or in the no-key line
  (*A browser agent can drive this project…*) when that line is showing. Reuse `StarterCopy.vue`,
  as the Live MCP access sheet's **Copy for another agent** does. `data-testid="ai-webmcp-copy-setup"`.
  Also offer it on the Live MCP access sheet's hosted-app panel (`ConnectClaudeCode.vue`, the
  `ai-connect-browser-agents` row), since that panel already points hosted users to browser agents.
- **Feedback** — `StarterCopy`'s existing feedback: the label reads **Copied** for two seconds,
  and if the clipboard is blocked a note says to select the text by hand. The text is also shown
  (collapsed under a **Show the text** disclosure) so it can be selected when the clipboard fails.
- **Placement** — n/a (creates no geometry).
- **Selection response** — n/a.
- **Selection count** — n/a.
- **Small-screen behavior** — no phone browser offers WebMCP yet, so on a real phone the button is
  absent along with the switch. When it is shown (tablet and laptop, or a phone-width desktop
  window), it sits on its own row under the switch at tap size (44 px), with no horizontal scroll,
  as the starter buttons in `ConnectClaudeCode.vue` stack at phone width.

## Documentation

- **Page** — `docs/webmcp.md`, *Using Claude in Chrome*: step 2 becomes *In WarpCad's Assistant,
  tap **Copy setup for a browser agent**. In the Claude in Chrome pane, paste it, then type what
  you want built on the line after it.* The paragraph below it stays as the quoted text (checked
  against the constant) for anyone who can't use the button. Mention the button in *Try it* and in
  *If your agent can't see the tools*, item 5.
- **Example** — *Open WarpCad, choose **Assistant**, tap **Copy setup for a browser agent**. In
  Claude in Chrome, paste, press Shift+Enter for a new line, type "add a 40 mm cube and put a
  20 mm sphere on top of it", and send. The cube and sphere appear; History marks both
  **via webmcp**.*
- **Media** — update `e2e/docs/webmcp-chip.docs.js` so `docs/screenshots/webmcp-chip.png` shows
  the button beside the switch, or add a shot `docs/screenshots/webmcp-copy-setup.png` embedded in
  *Using Claude in Chrome*.

## Affected files

- `src/ai/mcpPrompts.js` (new `STARTER_BROWSER_AGENT`) and `src/ai/mcpPrompts.spec.js`
- `src/components/ai/ChatPanel.vue` or `src/components/ai/WebMcpChip.vue` (the button and its line)
- `src/components/ai/ConnectClaudeCode.vue` (the hosted-app panel's browser-agents row)
- `docs/webmcp.md`, `e2e/docs/webmcp-chip.docs.js`, `docs/screenshots/`
- `e2e/webmcp.e2e.js`

## Effort

S.

## Testing

- **Unit** (`src/ai/mcpPrompts.spec.js`): `STARTER_BROWSER_AGENT` names `executeTool` with a tool
  object, `page.more`/`incomplete`, and `record_prompt`; it ends with the request slot as its last
  line; and the quoted paragraph in `docs/webmcp.md` matches it, whitespace-normalised.
- **Component** (`ChatPanel.spec.js`): the button is shown when the switch is on and hidden when
  it is off or WebMCP is unavailable.
- **E2E** — `e2e/webmcp.e2e.js` navigates to `/` with the fake `document.modelContext`, opens the
  Assistant, presses **Copy setup for a browser agent**, and reads the clipboard: the text equals
  the constant and ends with the request slot. Then it turns the switch off and checks the button
  is gone. It runs at all three viewport projects (phone, tablet, laptop) with a snapshot at each,
  because the row reflows at phone width. **Chromium only for the clipboard read**: no WebGL, WASM,
  canvas or persistence is involved, and WebMCP itself is Chrome-only. The visibility checks run
  on every engine in the rotating pair.
- **Acceptance**: re-drive **27. An in-browser agent adds ten cubes (WebMCP)**, using the copied
  setup in a real Claude in Chrome session. Paste, type "add a 40 mm cube and put a 20 mm sphere
  on top of it" after it, and confirm both bodies land on the first try with no corrections from
  the agent.
- **Closed finding to re-run**: `ai-024` (WebMCP agents cannot find or use the tools). Its
  reproduction, with the copied setup as the agent's instructions.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
