---
title: Live bridge — Claude Code edits the project you have open, on your subscription
category: ai
kind: feature
priority: high
model: opus
milestone: M9
depends: [ai-009, ai-006, ai-016, data-010, ai-017]
status: done
---

> **Shipped 2026-10-14 (dev host only, as scoped).** `mcp/bridge.js` core, `mcp/liveHttp.js` + `mcp/liveBridge.js` (Vite plugin: Streamable HTTP `/mcp`, tab over the HMR socket), `src/ai/bridge/`, Connect sheet + header chip, `npm run mcp:add -- --dev`. Differences from the text below: the pairing code is read from the MCP tool result (never stderr or any log); no explicit pause while a call runs (the run is synchronous, the staleness check covers the wait); Claude Code groups stay undoable after the user's own edits and are refused by name when an edit builds on them; Connect is left out of the chat panel at phone/tablet width (shown disabled on the key sheet with its reason); "port taken" belongs to the standalone `--live` host, not built. Not driven: a real Claude Code, Safari, the Chromium local-network prompt.

## Goal

Today the only subscription route is Claude Code driving the MCP server against a **closed**
project file (decision 6): you ask, it edits the file, you reload the app. This task lets the
person keep WarpCad open in a browser tab and have Claude Code's tool calls appear **in that
tab**, live, as `mcp`-origin History rows they can undo. No API key, no credit, no token in the
app: the model runs in Claude Code on the user's own plan, and WarpCad supplies only tools.

"Done": with Claude Code registered in live mode and the app open, saying "add a 40 mm cube
and a 20 mm sphere on top of it" in Claude Code makes both appear in the viewport, selectable
and movable by hand, as one **Undo AI turn** step; a failed or refused call leaves the document
byte-identical; and nothing but the user's own browser and Claude Code can reach the link.

The open tab stays the one writer and the AI is its client (decision 6's planned shape), so the
bridge needs **no replica of its own** and no merge. M15's merge (`docs-022`) landed after this
was written; Decision 11's "Compatibility with the M15 merge" section is the contract.
Build it after `data-010` (stamping) and `ai-017` (the `AiTurn` shape), and only once
`docs-022` is accepted.

## Design (what has to be true; the decision doc records it before building)

**Scope decided 2026-10-12: the dev host only.** Build `mcp/bridge.js` and the Vite plugin; do
**not** build the standalone `mcp/server.js --live` listener or add `ws`. The standalone points
below stay as the design for the reserved follow-up row. `npm run mcp:add` gains `--dev` (HTTP
registration), not `--live`. Documentation says plainly that live editing runs under
`npm run dev` on a desktop browser.

**Amended 2026-10-12 (Decision 11):** the bridge core (`mcp/bridge.js`) has two hosts. Under
`npm run dev` a Vite plugin serves MCP over Streamable HTTP at `/mcp` and talks to the tab over
Vite's own HMR WebSocket (same origin, no port, no `ws` dependency). The standalone
`mcp/server.js --live` below is for a built or hosted app. Hosted WebKit cannot connect (measured:
mixed-content block), and Chromium needs the local-network-access grant. Points 1 to 6 describe
the standalone host; the dev host keeps points 2 to 4 and 6 and replaces 1 and 5's transport.

Append **Decision 11** to `docs/decisions/ai-partner.md` first, accepted by the user before code,
exactly as `ai-013` did decision 10. It records the three choices below and the browser-support
facts verified on the day.

1. **A relay with no document.** `mcp/server.js --live` is still a stdio MCP server to Claude
   Code, and additionally listens on `ws://127.0.0.1:<port>` (loopback only). A `tools/call` is
   forwarded to the connected tab, which runs it through the *same* registry
   (`createToolRegistry().run`) and returns the JSON (and PNG for `capture_view`). The helper
   never parses a project and never writes a file in live mode. One server, one mode: a file
   argument means closed-file, `--live` means live, and there is **no silent fallback** from one
   to the other (that would be two writers).
2. **Live mode lists the browser tool set.** The tab has a GPU and a selection, so live mode
   offers `capture_view`, `get_selection` and `select`, which the closed-file transport cannot.
   Records keep origin `mcp` so History chips tell them apart from the in-app chat's `ai`. The
   registry gains the minimum needed for "origin `mcp`, browser tool list" (a transport value or
   a capability flag), not a third copy of the tools.
3. **A turn is a group of landed batches, not a fork.** MCP has no turn boundary, so the
   in-app fork-then-land (`agent.js`) does not apply. Instead each write call lands at once as
   one atomic `mcp`-origin batch (`batch` + `insertAt`, as `landFork`), and consecutive batches
   with the same `request` string within a 60 s idle gap form one entry in `aiTurns`, so
   **Undo AI turn** takes back the whole group in one step and never touches the local undo
   stack. A call that fails lands nothing. Partial progress inside a group is visible and
   undoable, which is more honest than hiding it behind an all-or-nothing fork the client
   cannot see.
4. **One writer is enforced, not hoped for.** Calls run one at a time on the tab. While a call
   runs the user's edits are paused (the existing preview-mode backstop). A call that arrives
   mid-gesture (a drag, a number field with focus) waits up to 10 s for the gesture to end, then
   is refused with a sentence the model can read: "the user is editing; try again". A call whose
   live document changed under it is refused, never landed over the change.
5. **Pairing and origin.** Any web page can open a WebSocket to `127.0.0.1`, so the link needs
   its own gate: (a) the helper rejects the upgrade unless `Origin` is the app's own origin or a
   localhost dev origin; (b) it requires a single-use, 8-character pairing code the helper
   prints on first call ("Open WarpCad → Assistant → Connect to Claude Code → enter `K7Q-4FX2`"),
   valid 5 minutes and invalidated when the helper exits; (c) the code is never written to a
   file, a log, or a tool result's `document_data`. The code is *not* a credential store entry
   (decision 8): it is a one-session handshake and dies with the helper.
6. **Caps, trust and data rules are unchanged.** `limits.js` caps still count per call and per
   group; document text stays `document_data`, never instructions; no subscription token is read,
   stored or sent by WarpCad (decision 10 point 3 stands).

**Risks to verify, not assume (record the result in Decision 11):**

- An `https://` page opening `ws://127.0.0.1`: expected to work in Chromium and Firefox
  (loopback is treated as potentially trustworthy) but **WebKit/Safari has historically blocked
  it**. If it does, the Connect control must say so plainly on that engine, not fail silently.
- Chromium's local-network-access permission prompt (recent versions): confirm what the user
  sees and word the Connect sheet to prepare them for it.
- Port: a fixed default (e.g. 47600) with `--port` override; a second Claude Code session finding
  it taken is told so in the tool result, not given a random port the tab will not find.

## Interaction model

- **Precondition** — Claude Code is registered in live mode (`npm run mcp:add -- --live`, from
  `ai-016`) and running; the app is open on a device that can reach `127.0.0.1` on the same
  machine (desktop browser, not a phone). No project file, no key, no selection needed.
- **Trigger** — **Connect to Claude Code** in the Assistant panel header (beside the key/route
  entry), which opens a small sheet with a code field and a one-line explanation of what it
  allows. Pairing happens once per helper session. Claude's calls then arrive without any further
  user action; there is no per-call confirmation (the History row, Undo AI turn and preview are
  the safety net, consistent with the in-app assistant).
- **Feedback** — a header chip: *Claude Code · connected* / *waiting for Claude Code* /
  *disconnected — reconnect*. While a call runs the viewport shows the same "AI is working"
  preview state as an in-app turn and edits are paused. Each landed group appears as a History
  row with an `mcp` origin chip and its `request` as intent; **Undo AI turn** is enabled.
- **Placement** — geometry Claude creates is placed by the tool's `positionMm`, exactly the
  records a drag writes (`ai-002`); it is then an ordinary body the user moves with the gizmo.
- **Selection response** — unchanged: Claude's bodies select like any other. `get_selection`
  tells Claude what the user has picked, so "make *this* 5 mm taller" works.
- **Selection count** — n/a (not a selection-gated tool).
- **Small-screen behavior** — a phone or tablet browser cannot reach another machine's
  `127.0.0.1`, so there the Connect control is shown disabled with the reason ("Claude Code must
  run on this device") rather than hidden, and the sheet is a bottom sheet at ≤ 640 px like the
  existing key sheet. Tablets are in the same position and say the same.

## Affected files

- `mcp/server.js` (`--live`, `--port`), new `mcp/bridge.js` (WebSocket listener, pairing,
  origin check, call queue, timeouts), `mcp/bridge.spec.js`
- `src/ai/bridge/` (new, framework-free): `protocol.js` (message shapes), `tabEndpoint.js`
  (receives a call, runs the registry, returns the result), specs
- `src/ai/tools/index.js` (the origin/tool-list seam only)
- `src/composables/useLiveBridge.js`, `src/stores/aiChat.js` (connection state, group → `aiTurns`)
- `src/components/ai/ConnectClaudeCode.vue`, header chip in the existing Assistant header
- `scripts/mcp-add.mjs` (`--live`, from `ai-016`)
- `docs/mcp.md`, `docs/ai-partner.md`, `docs/decisions/ai-partner.md` (Decision 11),
  `docs/decisions/document-sync.md` (a line saying the bridge is a single-replica client of the
  merge, after `docs-022` rewrites it), `CLAUDE.md` (the AI Partner section's "reserved `ai-012`"
  sentence, which `docs-022` also edits: rebase on its wording, do not overwrite), `TODO/ACCEPTANCE.md`

## Effort

L

## Testing

- Unit (`mcp/bridge.spec.js`, plain Node, real loopback socket): rejects a foreign `Origin`;
  rejects a wrong, expired or reused code; one call at a time in order; a call with no tab
  connected returns the instruction sentence (with the code), not a hang; a dropped socket
  fails in-flight calls with a readable error; port taken is reported; **the pairing code
  appears in no stdout/stderr line and no tool result** (assert by scanning).
- Unit (`src/ai/bridge/`): a call runs through the real registry against a real document and
  lands one atomic `mcp` batch; failure lands nothing and the serialised NDJSON is
  byte-identical; same-`request` batches inside 60 s group into one `aiTurns` entry and a
  different `request` or an idle gap starts a new one; a call mid-gesture waits then is refused;
  document changed underneath is refused.
- **Driven end to end, not scripted by the author alone:** an integration spec starts the real
  `mcp/server.js --live` and uses `@modelcontextprotocol/client` as Claude Code's stand-in.
  The `*.e2e.js` spec (navigates to `/`) pairs through the real Connect sheet with the code read
  from the helper's stderr, then has the client `create` a box and a sphere and asserts both are
  in the viewport and the History, moves one with the real gizmo, and presses **Undo AI turn**.
  Hostile-origin and wrong-code attempts are asserted refused.
- Engines: **all three** — WebSocket-to-loopback behaviour is exactly what differs by engine. On
  an engine where the connection is blocked (expected WebKit), the spec asserts the Connect
  sheet states it, rather than skipping.
- Viewports: all three, snapshot at each (the control is disabled with a reason at phone and
  tablet).
- Acceptance scenarios to re-drive: **10 and 12** (MCP closed-file must be unchanged), 17 and 18
  plumbing specs (the registry seam changed), 1 (placement still works), 2 (gizmo), 3 and 6
  (library parts Claude may place). Add a new scenario to `TODO/ACCEPTANCE.md` for this flow.
- Closed findings re-run: `ai-002` (atomic landing), `ai-006` (Undo AI turn leaves local undo
  alone), `data-007`, `core-056` (a batch of insert + revision is one Undo step), `ai-009`
  (closed-file behaviour, as `io-010` left it, is unchanged when the app is *not* in live mode),
  `data-008`'s id audit (a bridge-landed batch mints replica-scoped ids).

## Documentation

- **Page** — `docs/mcp.md` (new "Live mode" section) and `docs/ai-partner.md`.
- **Example** — "1. From your WarpCad folder run `npm run mcp:add -- --live`. 2. Open WarpCad
  in Chrome or Firefox. 3. In Claude Code, say 'add a 40 mm cube'. It replies with a pairing code.
  4. In WarpCad choose **Assistant → Connect to Claude Code** and type the code. 5. Say 'add a
  cube' again: it appears in the viewport. Press **Undo AI turn** to take it back."
- **Media** — `e2e/docs/ai-live-bridge.docs.js`: a shot of the connected chip with an `mcp` row in
  History, embedded in `docs/mcp.md`. No movie (needs a second process).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
