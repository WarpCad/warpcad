---
title: Let any MCP agent (Copilot, not just Claude Code) pair with the live bridge
category: ai
kind: feature
priority: high
model: opus
milestone: M9
depends: [ai-012]
status: open
---

## Goal

WarpCad's live MCP endpoint is a standard MCP server, but its current pairing flow is specific to
Claude Code. The user chose to replace pairing codes with explicit, timed access enabled from
WarpCad.

Done means: any MCP-capable agent can use the project open in the dev-host WarpCad tab
(`npm run dev`) while the user has explicitly enabled live MCP access there. Access can be enabled
for 15 minutes, 1 hour, the lifetime of the tab, or indefinitely until manually turned off. The
UI clearly says that any local MCP client can request access while enabled. No pairing code is
created or entered; Claude Code keeps working as an ordinary MCP client.

The exact failure is reported, not yet reproduced here: "it finds the MCP server, but cannot get
it started due to the Claude pairing." Reproduce it first (see Testing) so the fix targets the
real break, which may be in the pairing UI, the tool that asks for the code, or the message the
agent is shown.

## Interaction model

- **Precondition**: the dev server is running (`npm run dev`), an agent has the WarpCad live MCP
  endpoint registered, and the user has explicitly enabled a live-access lease in WarpCad. No
  project selection is needed.
- **Trigger**: the live-access control in the Assistant's existing bridge sheet, opened from the
  Assistant header (`src/components/ai/ConnectClaudeCode.vue`). The user chooses 15 minutes,
  1 hour, this tab, or unlimited until turned off. There is no code-entry step.
- **Feedback**: the bridge chip reads `connected` while a client is using the enabled tab and
  reports when access is off or expired. Calls are refused if more than one client or tab would
  make routing ambiguous.
- **Placement**: n/a (no geometry).
- **Selection response**: n/a.
- **Selection count**: n/a.
- **Small-screen behavior**: same as desktop. The access control is reachable from the header at
  phone width.

## Decision recorded (2026-10-16)

The user chose **explicit timed enablement in WarpCad, with no pairing code**. This amends
Decision 11 for the Vite dev-host live MCP endpoint only. WebMCP's separate **Browser agents**
switch is unchanged.

- Running `npm run dev` alone is not consent. The user explicitly enables live MCP access in
  WarpCad.
- Offer **15 minutes**, **1 hour**, **this tab**, or **unlimited until manually turned off**.
  Timed access starts when enabled.
- While access is enabled, any MCP client on the same computer that reaches the loopback endpoint
  may request access to the open project. The UI must say this plainly. The loopback binding,
  Origin gate, one-writer rule, and existing tool limits remain.
- Expiry or turning access off revokes the live connection. If multiple clients or tabs make the
  target ambiguous, refuse rather than route a call to an arbitrary tab.
- No code is generated, displayed, or sent in a tool result. There is no user-to-agent code-copy
  step.

The original Copilot-specific failure is still to be reproduced. The plain MCP client exercised
for this decision successfully paired through the current code flow, but that does not establish
what Copilot receives or why its setup failed.

## Documentation

- **Page**: `docs/mcp.md`, section *Live mode: an MCP agent edits the project you have open*
  (line 161). Add a short subsection *Using another agent (Copilot)* that names the agent-neutral
  steps, explains the timed live-access switch and its local-machine scope, and changes the
  table's "Claude Code" wording where it applies to any MCP client.
- **Example**: "Run `npm run dev` and register WarpCad with your agent using the command printed by
  `npm run mcp:add -- --live --dev`. In WarpCad, enable live MCP access for 15 minutes. In your
  agent, ask it to connect to WarpCad. The header reports the connected MCP agent."
- **Media**: `e2e/docs/ai-live-bridge.docs.js` already shoots `ai-live-bridge.png` (embedded in
  `docs/mcp.md`). Re-run `npm run docs:media` once the enable control is in place, so the picture
  shows the new switch, and confirm the embed still resolves (`e2e/docs-media.spec.js`).

## Affected files

- `mcp/bridge.js`: replace code pairing with timed access leases, fail-closed tab/session routing,
  and agent-neutral connection status.
- `mcp/liveBridge.js`, `mcp/liveHttp.js`: the dev host's HTTP MCP endpoint and Origin gate.
- `docs/decisions/ai-partner.md`: record the amendment to Decision 11 point 5 (the pairing code is
  replaced by timed access). The decision is the user's; the record must say so and the date.
- `e2e/docs/ai-live-bridge.docs.js`: update the shot's steps for the enable control.
- `src/ai/bridge/protocol.js`: access-enable, expiry, and connection-status messages; remove the
  pairing-code message.
- `src/composables/useLiveBridge.js`, `src/components/ai/ConnectClaudeCode.vue`,
  `src/components/ai/BridgeChip.vue`: the timed enable control, status, and agent-neutral wording.
- `src/components/ai/WebMcpChip.vue`: check only. WebMCP has no pairing; confirm it is unaffected.
- `e2e/` (new spec, see Testing).

## Proposed fix

1. Reproduce the reported Copilot failure and capture the exact setup response. Also confirm the
  plain MCP client path still works without any code.
2. Add the WarpCad live-access control with the chosen durations and a clear off/expiry state.
  Access is disabled by default; the UI must explain that any local MCP client can use the
  loopback endpoint during the enabled window.
3. Route a client only when there is an unambiguous enabled tab; refuse ambiguous sessions/tabs.
  Preserve the Origin gate, one-writer rule, and tool limits.
4. Reword the sheet and chip for an MCP agent rather than Claude Code, and document the opt-in
  workflow. Leave WebMCP's existing switch and behavior unchanged.

## Effort

M. The fix may be small once the reproduction is in hand. The design choice above is what
makes it `opus`.

## Testing

- **Unit** (`mcp/bridge.spec.js`, `mcp/liveBridge.spec.js`): calls are refused while access is off
  and after expiry, accepted during each lease, and refused when routing would be ambiguous. No
  pairing code is returned or accepted.
- **E2E** (new `e2e/ai-mcp-agent-pairing.e2e.js`, navigates to `/` under the dev server): enable
  live MCP access in WarpCad, call the dev endpoint through a plain MCP client, and assert the
  project changes and the chip reports the connected agent. Verify off and expiry refuse calls.
  Chromium only for the spec, which exercises the HTTP endpoint and dev-host Origin rule, not
  WebGL, kernel, or persistence. Run it at laptop 1440x900; phone gets its own pass only if the
  control's layout changes.
- **Acceptance scenarios to re-drive by hand**: **25** (Claude Code edits the open project, live
  bridge), which must still pass unchanged, and **23** (Claude Code edits the file you have
  open).
- **Closed findings whose repro gets re-run**: `ai-020` (the Assistant panel said "paste an API
  key" while the bridge was connected). This changes what the panel and chip say about the bridge,
  so re-run its steps: connect, then confirm the panel does not ask for a key.
- **Browser engines**: Chromium only. The dev host is `http://localhost`, where the WebKit
  loopback restriction in `docs/decisions/ai-partner.md` does not apply. Say so in the spec if
  the hosted origin is ever added.

## Notes

Raised by the user on 2026-10-16 in `TODO/NEW-TODO.md`. Related: `ai-012` (live bridge),
`ai-021` (WebMCP, a separate transport with no pairing).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
