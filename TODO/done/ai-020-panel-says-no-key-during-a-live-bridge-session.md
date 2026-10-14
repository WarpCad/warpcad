---
title: The Assistant panel tells a bridge-connected user to paste an API key
category: ai
kind: finding
priority: high
model: sonnet
depends: [ai-012]
status: done
---

> **What shipped.** `assistant.claudeCodeOnly` (no key, not scripted, bridge `connected`) drives
> `statusText` ("Claude Code is editing this project — type your request in Claude Code"),
> `dotState` (`ok`), the key sheet's exit (`doneWithKeySheet` now goes to the chat when the bridge
> is connected, as `open()` already did), the hidden **Model** row, and a disabled composer with
> its reason (`ai-composer-reason`). **Key and model…** stays, because it is the way to a key.

## Problem

Found 2026-10-14 while deciding whether `ai-015` was needed. With Claude Code connected over the
live bridge (`ai-012`) and no API key, the Assistant panel opens (`open()` was taught about the
bridge) but its header says **No key — paste one to connect** (`statusText`, `dotState`), shows
**Model: …**, and **Done** on the key sheet closes the panel (`doneWithKeySheet`). The composer
looks usable and would send to a model that is not configured. `ai-012` had the status chip and
`open()` but not the rest of the panel; its e2e asserted the chip, never the status line.

## Affected files

- `src/stores/assistant.js`, `src/stores/assistant.spec.js`
- `src/components/ai/ChatPanel.vue`, `src/components/ai/Composer.vue`
- `e2e/ai-live-bridge.e2e.js`
- `docs/mcp.md`, `docs/ai-partner.md`

## Proposed fix

One computed, `claudeCodeOnly`, read by the status line, the dot, the key-sheet exit, the model row
and the composer. No new engine (see `ai-015`, closed won't do).

## Effort

S

## Testing

- Unit: `assistant.spec.js` — connected and keyless is `claudeCodeOnly`; any other bridge state, or
  a key, is unchanged.
- `*.e2e.js` against `/`: `ai-live-bridge.e2e.js` (laptop, all three engines) asserts the status
  line, no model row, and a disabled composer with its reason after pairing.
- Acceptance: **25**, **1**; closed findings `ai-012`, `ai-013` re-run through the same spec.

## Documentation

- **Page** — `docs/mcp.md` (live mode, "How it behaves") and `docs/ai-partner.md`.
- **Example** — "Pair Claude Code as in the steps above, then open **Assistant**: the status line
  reads *Claude Code is editing this project* and the message box is greyed out. Ask Claude Code
  for *a cube*; it appears here."
- **Media** — none new; the existing `ai-live-bridge` screenshot already shows the connected panel.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
