---
title: Let a Claude Pro/Max subscription drive the AI partner, so no separate API credit is needed
category: ai
kind: feature
priority: medium
model: opus
milestone: M9
depends: [ai-009]
status: open
---

## Goal

Today the in-app chat (`ai-004`..`ai-007`) is BYOK: the user pastes an Anthropic **API**
key and every turn is billed against prepaid API credit. A Claude Pro/Max subscription is a
separate product with separate billing, and a user who already pays for it reasonably
asks why the AI partner can't just use that. "Done": a person with only a Pro/Max
subscription (no API key, no purchased credit) can get an AI turn applied to their
project, by a route Anthropic's terms allow, and the app says plainly which route to use
and why the chat panel's key box is the other one.

## Findings so far (verify before building — terms and products change)

- **A subscription does not include API access.** The Messages API is billed on its own
  prepaid credit, so no setting makes the chat panel's `fetch` draw from Pro.
- **Reusing the subscription's OAuth token from a third-party app is not an option.**
  Anthropic's consumer terms reserve those tokens for Claude.ai and Claude Code; a
  web app that extracts or proxies one risks account action and would sit badly with the
  key-handling model in `docs/decisions/ai-partner.md` (the key never leaves the credential
  store). **Re-read the current terms at the start of this task** and record the wording
  in the decision doc; if they have loosened, the answer changes.
- **Two routes do use the subscription legitimately**, both with the subscription-billed
  client doing the thinking and WarpCad supplying only tools:
  1. **Claude Code + the MCP server** (`ai-009`, planned): `claude mcp add warpcad -- node
     mcp/server.js project.warpcad`. Closed-file only in v1. Works today once `ai-009`
     lands, at no API cost.
  2. **Claude.ai custom connector (remote MCP)**: Claude.ai can attach a remote MCP server
     to a chat. WarpCad has no backend, so this needs either a user-run tunnel to a local
     server or the live bridge in `ai-012`; likely a poor fit for a static PWA.
- **Cheaper-key alternatives** if neither route is acceptable: a smaller default model
  (Haiku 5.5 for simple edits), the per-turn token/step caps already in `limits.js`
  surfaced as a visible cost estimate, or a second provider behind the one-method
  interface with a free tier or local model (`docs/decisions/ai-partner.md` keeps this
  possible; it is currently out of scope for v1).

## Proposed work

1. **Decision doc first** — append a section to `docs/decisions/ai-partner.md`:
   the terms wording, the options above compared, and a recommendation. Expect the answer
   to be "route 1 is the subscription path; the chat panel stays BYOK; make route 1
   discoverable." Don't start building until the user accepts it.
2. **Make the subscription path discoverable in the app.** The chat panel's empty/no-key
   state offers two clearly separate choices — *Use your own API key* (existing) and
   *Use your Claude subscription via Claude Code* — the latter opens the docs page with
   the exact `claude mcp add` command and a copy button.
3. **Cost transparency for the key path**: show tokens used and an approximate cost for the
   last turn and the session, so BYOK users aren't surprised. Read usage from the
   Messages API response the client already parses; no new network call.
4. Only if the decision picks it: a provider-interface second implementation (separate
   TODO, not this one).

## Interaction model

- **Precondition**: chat panel open with no API key stored (route choice), or a key stored
  (cost readout).
- **Trigger**: the chat panel's no-key state gets a second button, **Use my Claude
  subscription…**, beside **Add API key**. The cost readout is passive.
- **Feedback**: the button opens a dialog sheet with the `claude mcp add` command, a
  **Copy** button (toast "Copied") and a link to `docs/mcp.md`. The readout is a one-line
  chip under the transcript: "Last turn 4.1k tokens ≈ $0.06 · session $0.31".
- **Selection response / Selection count / Placement**: n/a.
- **Small-screen behavior**: the chat panel already overlays the viewport at phone and
  tablet widths; the dialog is a bottom sheet there, and the command wraps rather than
  scrolling horizontally.

## Documentation

- **Page** — update `docs/ai.md` (new "No API key? Use your subscription" section) and
  cross-link `docs/mcp.md` (created by `ai-009`).
- **Example** — "Open the chat panel, click **Use my Claude subscription…**, copy the
  command, run it once in a terminal in your parts folder, then in Claude Code say *add a
  3 mm base plate under the bracket*. Open the file in WarpCad and the new step is in
  History marked **mcp**."
- **Media** — `e2e/docs/ai-subscription-route.docs.js` (shot of the no-key state and the
  dialog), embedded in `docs/ai.md`.

## Affected files

- `docs/decisions/ai-partner.md` (decision section), `docs/ai.md`, `docs/mcp.md`
- `src/components/ai/ChatPanel.vue` (no-key state), `src/components/ai/SubscriptionRoute.vue` (new)
- `src/ai/client.js`, `src/ai/agent.js` (surface `usage` from the response), `src/ai/models.js`
  (per-model price table, one place, dated)
- `e2e/ai-subscription-route.e2e.js`, `e2e/docs/ai-subscription-route.docs.js`

## Effort

M — most of it is the decision and the docs; the code is a dialog and a usage readout.

## Testing

- **Unit** (`client.spec.js`, `models.spec.js`): usage parsed from a fixture response incl.
  cache-read/cache-write tokens; cost arithmetic with `toBeCloseTo`; missing `usage`
  (error response, aborted stream) shows no readout rather than `NaN`.
- **E2E** (`e2e/ai-subscription-route.e2e.js` → `/`): with no key, the second button is
  present, opens the sheet, Copy puts the exact command on the clipboard; with the fake
  provider (`ai-010`) a turn shows the cost chip. Three viewports with a snapshot each;
  Chromium only (no WebGL/persistence path beyond the existing credential store).
- **Acceptance**: re-drive the chat scenarios in `TODO/ACCEPTANCE.md` that open the panel
  with and without a key; closed findings against the key-entry flow (`ai-004`) get their
  original repro steps re-run.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
