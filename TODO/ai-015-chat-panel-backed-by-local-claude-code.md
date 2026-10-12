---
title: Chat panel backed by the user's own local Claude Code, no API key
category: ai
kind: feature
priority: medium
model: opus
milestone: M9
depends: [ai-012, ai-013]
status: open
---

## Goal

`ai-012` lets Claude Code edit the open project, but the conversation still happens in a
terminal. This task lets the person type in WarpCad's own Assistant panel and have **their
locally installed, already-signed-in Claude Code** answer, with its tool calls landing in the
open tab through the `ai-012` bridge. The panel stays the familiar one (transcript, streamed
text, tool-call rows, **Stop**, **Undo AI turn**); the difference is which engine answers.

"Done": with Claude Code installed and logged in on the user's plan, **no API key set**, typing
"make the bracket 5 mm thicker" in the panel streams a reply, applies the change as one
**Undo AI turn** group, and shows no dollar cost (there is none to show).

## The gate: re-read the terms before writing code

Decision 10 (`docs/decisions/ai-partner.md`) rejected reusing a subscription token **in the app**.
This task is not that — WarpCad never sees a token and the user runs the official `claude`
binary on their own machine — but it is *automation of the official CLI by a third-party
program*, which is the part the written terms are not clear about (the legal-and-compliance
page tells products built on Claude and the Agent SDK to use API keys; Pro/Max limits assume
ordinary individual use). So, before any implementation:

1. **Decision 12**: quote the current wording (Consumer Terms, Claude Code "legal and
   compliance", and `claude --help`/docs for headless `-p` use), state which side this falls
   on and why, and get the user's acceptance. If it is **not** clearly permitted, close this
   file as `won't do`, keep `ai-012` (which needs no such judgement because the user is typing
   into Claude Code themselves), and say so in the roadmap.
2. Ship it **opt-in and labelled**: the engine choice says "Runs your local Claude Code. Uses
   your Claude plan's limits. WarpCad never sees your sign-in."

## Design

1. **It is an engine, not a provider.** The existing provider interface (`client.js`) is one
   method that returns a model reply to `agent.js`, which owns the loop, the fork and the caps.
   With Claude Code the loop lives *in Claude Code*. Do not bend the provider interface: add an
   `engine` seam in the chat store (`api-key` → today's `useAgent`; `claude-code` → this) that
   both feed the same transcript item types, so `ai-006`'s components do not fork.
2. **The helper spawns the CLI.** On a `chat.send` message over the `ai-012` socket the helper
   runs the user's `claude` in print mode with streaming JSON output, `--resume` for follow-up
   turns, `--strict-mcp-config` pointing at WarpCad only, and a tool allow-list of
   `mcp__warpcad__*` so the spawned session **cannot** run shell commands or edit files
   (a model driven from a web page's text box must not get Bash). Exact flag names are verified
   against the installed version's `--help` at implementation time and recorded in Decision 12;
   they are not assumed here.
3. **How the spawned Claude reaches the tools** is the one real unknown: it must call back into
   the *same* helper process (which owns the socket to the tab), not a second server. Options to
   evaluate in Decision 12: (a) the helper also serves a streamable-HTTP MCP endpoint on loopback
   and passes its URL in the config; (b) a stdio shim that dials the helper. Pick the smaller one
   that the pinned `@modelcontextprotocol/server` supports without a new dependency (licence
   allow-list, decision 3).
4. **Stream mapping.** Text deltas become `text` events; `tool_use`/`tool_result` events become
   the tool-call rows the panel already renders; the final result carries `usage`, shown as
   tokens only. **Stop** kills the child process and the in-flight bridge call is abandoned
   (the `ai-012` rules mean nothing half-lands inside one call).
5. **Everything on the page is still untrusted data.** The panel's text goes in as the user's
   message; document text stays `document_data` (the helper adds the same standing-instructions
   block `agent.js` does, by reusing `documentData.js`, not re-implementing it).
6. **Failure is a sentence.** `claude` not on `PATH`, not logged in, rate-limited, or exited
   non-zero each produce one plain line in the transcript naming the cause and the fix. Never a
   spinner that does not end.

## Interaction model

- **Precondition** — the `ai-012` connection is paired, and the helper reports a usable
  `claude` binary. No API key is needed; if one *is* set, the user chooses the engine.
- **Trigger** — an **Engine** control in the Assistant header: *Claude Code (your plan)* or *API
  key*. Choosing the first when disconnected opens the `ai-012` Connect sheet. Sending uses the
  normal composer and Enter.
- **Feedback** — the transcript streams as for the key engine; the header chip says which engine
  answered; the cost readout shows tokens and the words "your plan", never dollars.
- **Placement / Selection response / Selection count** — n/a; tools place and select exactly as
  in `ai-012`.
- **Small-screen behavior** — as `ai-012`: unavailable on phone/tablet (the helper is on another
  device), shown disabled with the reason; the key engine remains the phone path.

## Affected files

- `mcp/bridge.js` (a `chat.send` message, child-process management, stream parsing) and a new
  `mcp/claudeRunner.js`, with specs against a **fake `claude`** script on `PATH` that emits
  recorded stream-JSON
- `src/ai/engines/claudeCode.js` (framework-free: maps stream events → transcript items)
- `src/stores/aiChat.js`, `src/components/ai/` (Engine control, cost readout wording)
- `docs/decisions/ai-partner.md` (Decision 12), `docs/ai-partner.md`, `docs/mcp.md`

## Effort

L

## Testing

- Unit: the stream mapper against recorded fixtures (text delta, tool use, tool result, error,
  rate limit, truncated stream); the runner against a fake `claude` that also records its argv
  (assert the tool allow-list, the strict MCP config, **no** shell tools, resume id threaded).
- Unit: Stop kills the child and leaves the document byte-identical when no call had landed;
  `claude` missing/not logged in each yield their one sentence.
- `*.e2e.js` against `/`: the real helper with the fake `claude`; type in the panel, see the
  streamed reply and the landed group, press **Undo AI turn** and **Stop** mid-stream. Engines:
  **all three**, viewports: **all three** with snapshots (disabled-with-reason at phone/tablet).
- **Not provable in CI:** that a real `claude` session accepts the flags and a real plan answers.
  That is a human-run check, logged once in `TODO/VERIFY.md`, as `ai-010` did for the live model.
- Acceptance scenarios to re-drive: **8** (hostile intent text stays data — it must hold through
  this engine too), 10, 12, 17 and 18 plumbing, 1; plus the scenario `ai-012` adds.
- Closed findings re-run: `ai-006` (Undo AI turn, Stop), `ai-013` (no-key sheet flow), `ai-016`
  (the registered command works), `ai-005` (caps and stop reasons are reported, never silent).

## Documentation

- **Page** — `docs/ai-partner.md` (new "Use your Claude Code instead of an API key" section).
- **Example** — "With Claude Code installed and signed in, and WarpCad connected (see
  `docs/mcp.md`), open **Assistant**, set **Engine** to *Claude Code (your plan)*, type 'add a
  25 mm cylinder next to the cube' and press Enter. Watch it stream and appear; **Undo AI turn**
  removes it."
- **Media** — `e2e/docs/ai-engine-claude-code.docs.js`: the Engine control and a streamed turn,
  embedded in `docs/ai-partner.md`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
