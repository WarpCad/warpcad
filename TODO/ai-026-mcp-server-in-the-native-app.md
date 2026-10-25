---
title: An MCP server inside the WarpCad app, so agents can drive the project open on the phone
category: ai
kind: feature
priority: high
model: opus
milestone: M19
depends: [build-017, build-018]
status: open
---

> **Read `build-018` item 10 first.** The owner asked for an MCP service "for agents like the Claude
> app". Whether the Claude **iOS** app can reach a server running on the same phone is the open
> question. Its custom connectors are believed to be called from Anthropic's servers, which
> cannot see the phone. `build-018` records the answer. If no on-phone agent can reach the server,
> this task still builds it for the agents that can (Claude Desktop and Claude Code on a Mac on the
> same Wi-Fi, and the macOS build of this same shell), and `docs/ios-app.md` says plainly which
> agents work. It must not imply the Claude iPhone app works if it does not.

## Goal

Under `npm run dev`, an MCP agent can already edit the project open in a WarpCad tab
(`ai-012`/`ai-023`, scenario 25): `mcp/liveHttp.js` serves Streamable HTTP, `mcp/bridge.js` gates
it with an explicit timed lease, and each call is relayed to the tab's `TabEndpoint`. None of that
exists in a built app, because it runs inside the Vite dev server.

Done means the **native app itself hosts that endpoint**:

- A Streamable HTTP MCP server, written in Rust with the official SDK (`rmcp`), runs inside the app
  while it is open. It holds **no document and defines no tool**: `tools/list` returns the page
  registry's live list (`createToolRegistry`, the same list `mcp/liveHttp.js` serves), and each
  `tools/call` is relayed to the page and answered by `TabEndpoint` through Tauri IPC. One registry,
  as `docs/decisions/ai-partner.md` requires; this host adds no tool.
- Access is **off by default** and enabled from the existing **Live MCP access…** sheet with the
  same lease durations (15 min, 1 hour, until the app closes, until turned off).
- By default the server listens on **loopback only** (`127.0.0.1`), for agents on the same device.
  A second switch, **Allow devices on this Wi-Fi**, binds the LAN address too and requires a bearer
  token. The sheet shows the address and token, with **Copy** and a ready-to-paste
  `claude mcp add --transport http …` line.
- The UI says, where the user enables it: **"Works while WarpCad is open on screen."** iOS
  suspends a backgrounded app (TN2277). The server closes its listening socket on backgrounding and
  reopens it on return, as TN2277 tells apps to do.
- In the macOS build (`cargo tauri dev` / a Mac build of the same shell), the same server gives
  Claude Desktop a local endpoint on the same machine.

## Interaction model

- **Precondition**: running in the native app (iOS or macOS). The sheet entry is hidden in Safari
  and on the hosted PWA (they have no host), as today outside `npm run dev`.
- **Trigger**: **Assistant → Live MCP access…** (`ai-connect-open`, and the phone header button from
  `ui-075`), the existing sheet (`ai-connect-sheet`), with these additions:
  - a **Allow devices on this Wi-Fi** switch (`data-testid="ai-connect-lan"`), off by default,
    enabled only while a lease is on;
  - when on: the address (`http://192.168.x.y:port/mcp`), the token, **Copy address**
    (`ai-connect-copy-url`), **Copy token** (`ai-connect-copy-token`) and **Copy Claude Code
    command** (`ai-connect-copy-cmd`);
  - **New token** (`ai-connect-rotate`), which ends every connected session.
- **Feedback**: the existing header chip (`ai-bridge-chip`) reads **MCP agent · connected** while a
  client is calling, and the working chip, **Undo AI turn** and `via mcp` History rows behave
  exactly as in scenario 25. When the app returns from the background, the chip reads
  *"MCP paused while WarpCad was in the background"* for a few seconds if a client had been
  connected.
- **Placement / Selection response**: n/a. Agent writes land through the existing tools, and the
  placement rules are the tools' own.
- **Selection count**: n/a.
- **Small-screen behavior**: the sheet is the phone bottom sheet. The address and token wrap or
  truncate in the middle with **Copy**, never scroll horizontally, and every control has a 44 px
  target at 390 px.

## Documentation

- **Page**: `docs/mcp.md`, new section "From the iOS app". `docs/ios-app.md` links it. The section
  states which agents can connect (from `build-018` item 10, with the date measured) and which
  cannot.
- **Example**: "On your iPhone, open WarpCad, tap **Assistant → Live MCP access…**, choose
  **1 hour**, tap **Enable access**, then turn on **Allow devices on this Wi-Fi** and tap **Copy
  Claude Code command**. Send it to your Mac (AirDrop or Universal Clipboard), run it in Terminal,
  and ask Claude Code *add a 40 mm cube*. The cube appears on your phone. Keep WarpCad on screen
  while the agent works."
- **Media**: `e2e/docs/native-mcp.docs.js`, a still of the sheet with the Wi-Fi switch on
  (`docs/screenshots/native-mcp-sheet.png`) at phone width with the `nativeShell` fixture,
  embedded in `docs/mcp.md`.

## Affected files

**`warpcad-native/src-tauri`:**

- `src/mcp/mod.rs` (new): `rmcp` server with the Streamable HTTP transport on `axum`/`tokio`.
  It handles `initialize` (the same server instructions as `LIVE_SERVER_INSTRUCTIONS` in
  `mcp/liveHttp.js`, sent by the page at start, not copied into Rust), `tools/list` and
  `tools/call` (both relayed), and session tracking with the five-minute idle close from
  `mcp/liveHttp.js`.
- `src/mcp/gate.rs` (new): the request gate. A Host/Origin check equivalent to `mcp/bridge.js`
  `createRequestGate`; on LAN, the bearer token (constant-time compare, 256-bit random, regenerated
  on **New token**, never logged); lease state as set by the page; one-client/one-tab ambiguity
  refusals with `mcp/bridge.js`'s wording.
- `src/lib.rs`: start/stop on lease change and on app lifecycle (resign active → close the listener;
  become active → reopen if a lease is live).
- Capabilities: the page may call `mcp_set_access`, `mcp_reply`, `mcp_rotate_token`, and nothing
  else new. Info.plist: `NSLocalNetworkUsageDescription` **only if** `build-018` shows the LAN
  bind or anything else needs it. No Bonjour advertising in this task (it would prompt, TN3179).

**This repository:**

- `src/composables/useLiveBridge.js`: a second transport. Today it is `import.meta.hot` only; add
  the native one: Rust emits the same host messages `src/ai/bridge/protocol.js` defines
  (`parseHostMessage`) as Tauri events, and the page replies through `invoke('mcp_reply', …)`. The
  protocol module stays the contract for both hosts. `runOnTab`/`undoTabTurn` are unchanged.
- `src/native/mcp.js` (new): the event subscription and the three commands.
- The live-MCP sheet component (find it from `ai-connect-sheet`): the Wi-Fi switch, address, token
  and copy controls. Extract a subcomponent if the template passes ~30 lines.
- `e2e/native-mcp.e2e.js`, `e2e/docs/native-mcp.docs.js`, `e2e/fixtures/nativeShell.js` (fake
  event emitter for host messages).
- `docs/decisions/ai-partner.md`: Decision 11 gains a third host ("the native app") beside the dev
  host and the reserved standalone `--live` host, with its authorization policy (lease, plus a token
  on LAN). Decision 11 said one must be decided when a non-loopback host is built.

## Proposed fix

1. **Health check at pull-in**: `rmcp` (Question 7a recorded 3.6.0, 2026-10-20, 4,037 stars),
   `axum`, `tokio`. Check that `rmcp`'s Streamable HTTP server feature builds for
   `aarch64-apple-ios` and record its crate count and licences into `cargo deny`.
2. Build and test on the **macOS** shell first (`cargo tauri dev`): connect Claude Code with
   `claude mcp add --transport http warpcad-app http://127.0.0.1:<port>/mcp` and drive scenario 25's
   steps. Then build for iOS.
3. Port choice: a fixed default (propose 5184, beside the dev host's 5183), falling back to the
   next free port. The sheet always shows the real one.
4. Calls are serial and keep `mcp/bridge.js`'s refusals and timeouts (`CALL_TIMEOUT_MS` and the
   "may still have landed; check `get_timeline`" wording), because the phone sleeping mid-call is
   the expected case here, not an edge (decision record Q5, cases 1-3).
5. Out of scope, named so they are not silently assumed: Bonjour discovery; a fork per remote
   turn (decision record suggestion 7, a change to Decision 11); background execution (not
   possible on iOS); the outbound relay `ai-019`.

## Effort

L.

## Testing

- Rust unit tests (`cargo test`): the gate (no lease → refused; wrong or missing token on LAN →
  401; foreign Origin → 403; two clients → ambiguous) and the lifecycle (listener closed after
  resign-active, reopened after become-active only with a live lease).
- JS unit: `useLiveBridge` routes native host messages through `parseHostMessage` exactly as the
  HMR ones (the same fixtures as `protocol.spec.js`).
- **`e2e/native-mcp.e2e.js` navigates to `/`** with the `nativeShell` fixture standing in for the
  Rust host: enable a lease, turn on Wi-Fi access, and assert the address, token and copy controls;
  inject a `create` host message and assert the body lands with `via mcp`; **Undo AI turn** removes
  it; turn access off and assert the next call is refused. **Phone, tablet, laptop** with snapshots
  (sheet layout); **Chromium, Firefox, WebKit** (it touches the viewport and document).
- **Driven for real** (the part a fake cannot prove): on the macOS shell with a real Claude Code,
  then on the iPhone from Claude Code on the Mac over Wi-Fi. Run **acceptance scenario 25** steps
  2-7 in both, and report PASS/FAIL per step. Then background the phone mid-turn for 60 s and record
  what the agent saw and what landed (decision record Q5 cases 1-3).
- **Acceptance scenarios to re-drive**: 25 (live access), 24 (edit while the Assistant works; the
  BYOK path must be unaffected), 27 (WebMCP; must stay off in the app, since WebKit has none).
- **Closed findings re-run**: `ai-023`'s repros (a client that quits without DELETE stays counted;
  the lease reads "until this tab closes" before the host replies) and `ai-020`'s (the panel says no
  key during a live session).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
