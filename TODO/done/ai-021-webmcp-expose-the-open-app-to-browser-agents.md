---
title: WebMCP — expose the open app's tools to in-browser agents
category: ai
kind: feature
priority: low
model: opus
milestone: M9
depends: [ai-012, ai-017]
status: done
---

> **What shipped (2026-10-14).** Decision 13 (accepted by the user the same day) superseded parts
> of this spec, so read it before the text below: the entry point is `document.modelContext`
> (falling back to `navigator.modelContext`), unregistering is an `AbortController` signal (there
> is no `unregisterTool`), results are plain JSON values with refusals returned as
> `{ ok: false, error }`, and `capture_view` is withheld on this transport. The user's direction
> was *"if WebMCP is available it should be supported"*, so registration is **default on** with a
> **Browser agents · on/off** chip and switch in the Assistant header (state remembered per
> browser profile), not the opt-in sheet described below, and the docs shot is that chip
> (`webmcp-chip.png`), not a sheet. The Assistant offers a key whenever WebMCP is absent outside
> dev, a key or an agent when it is present, and the dev-host bridge as well in dev. Tools are
> registered only while the tab is visible. `describe_scene`, `get_timeline`, `list_ops` and
> `list_variables` take `limit`/`offset` to stay near Chrome's 1.5K-character advice. Real Chrome
> with the flag and the two-tab case were not verified; see `TODO/VERIFY.md`.

## Goal

Let an AI agent that lives **in the browser** operate the WarpCad tab it is looking at, with no
helper process, no pairing code and no `npm run dev`. WebMCP is the W3C Web Machine Learning
Community Group draft (Google and Microsoft) in which a page registers tools on
`navigator.modelContext` and a browser-side agent discovers and calls them. It is experimental:
Chrome ships it behind a flag, as an early preview, and the spec has already changed shape
(`provideContext` / `clearContext` were removed in March 2026; `registerTool` is what remains).

Today there are two routes in (Decision 11, Decision 1): the in-app BYOK chat, and Claude Code
over the dev-host live bridge. Both need either a key or a terminal. WebMCP is a third
**transport** onto the same registry, and the only one that works on the built or hosted app,
because the tab itself is the server and nothing crosses a network boundary. The mixed-content
and local-network blocks that made the standalone bridge Chromium-only (Decision 11's spike) do
not apply: there is no socket.

"Done": in Chrome with the WebMCP flag on, an agent that can see the page's tools (Google's
Model Context Tool Inspector extension is the reference client) lists WarpCad's tool set, and
asking it for "a 40 mm cube with a 20 mm sphere on top" puts both in the viewport as one
**Undo AI turn** group with an `mcp`-origin chip — the same outcome as `ai-012`, with the app
served from anywhere. In a browser without the API nothing changes and nothing throws.

## Design (what has to be true; Decision 13 records it before building)

Append **Decision 13** to `docs/decisions/ai-partner.md` first, accepted by the user before
code, as `ai-012` did Decision 11. It records the choices below and the facts **re-verified on
the day** — flag name, Chrome channel/version, `registerTool` signature, `unregister` shape,
`ToolAnnotations` — because the spec has already moved once and a second-hand blog is not a
source. Cite the spec and Chrome's own docs, not summaries.

1. **A third transport, not a third tool list.** The WebMCP adapter is a thin layer over
   `createToolRegistry()` (`src/ai/tools/index.js`) exactly as `mcp/server.js` and
   `src/ai/bridge/tabEndpoint.js` are. It adds **no** tools. Each registry tool becomes one
   `registerTool({ name, description, inputSchema, execute })`; the schema is the registry's own
   (already `strict`), not a re-typed copy.
2. **Calls go through the live bridge's `TabEndpoint`.** The tab already has the one-writer
   rules (serial queue, mid-gesture wait and refusal, stale-revision refusal, group-per-`request`
   into `aiTurns`, `undoLast`). WebMCP calls must reuse that object rather than re-implement
   it, so a WebMCP call and a Claude Code call can never interleave. The seam is making
   `TabEndpoint` constructible without the dev-host socket; today `useLiveBridge.js` owns both.
3. **Origin is its own value.** Landed records get origin `webmcp` (a new transport value beside
   `ai` and `mcp`), so History chips say who did what and Decision 5's origin scoping keeps them
   out of the local undo stack. The registry's "origin + browser tool list" seam from `ai-012`
   is where it goes.
4. **Never the default; the user opts in per site.** The page registers **nothing** until the
   user turns it on (see Interaction model). The API's own purpose is that any agent running in
   the browser can call these tools, so "registered" must mean "the person said yes", and
   turning it off calls `unregister` on every tool.
5. **A group needs a `request`.** WebMCP has no turn boundary and no natural-language request
   string. Group by the idle gap (`GROUP_IDLE_MS`) as `ai-012` does and take the intent from the
   tool's own `rationale` argument; where an agent passes none, intent is the tool name and a
   one-line summary of its arguments, never empty and never model text promoted to an
   instruction.
6. **Trust model unchanged.** Document text (intent, names, standing instructions) stays
   `document_data`, never instructions; `limits.js` caps count per call and per group; no key
   or token is read, stored or sent. **New exposure to state plainly:** a WebMCP tool result is
   read by an agent WarpCad does not choose and cannot see, so what a tool returns is exactly
   what that agent's operator sees. `capture_view` PNGs and document text leave the tab to
   whichever agent is attached. Decision 13 says this in one sentence and the opt-in sheet
   repeats it.
7. **Feature-detect and degrade silently.** `'modelContext' in navigator` is the whole gate. No
   polyfill is shipped and no `@mcp-b/*` or similar shim is added (a runtime dependency for an
   experimental API is a Library-decisions question, not a convenience); if a shim turns out to
   be needed, that is a separate `docs/decisions/` entry with its health check.
8. **Declarative form attributes are out of scope.** WebMCP also defines annotating HTML forms.
   WarpCad has no form that is the right unit of agent interaction; the imperative tool API is
   the whole of this task.

**Risks to verify, not assume (record the result in Decision 13):**

- **Which tools make sense for an unattended in-browser agent.** `capture_view` is the
  interesting one: confirm the result type (image content in a WebMCP tool result) works in the
  reference client, or say plainly that vision tools are withheld on this transport.
- **Tool-count and schema-size limits** in the client. The registry has ~25 tools; if a client
  caps or degrades past some number, record the number and decide whether to register a
  curated subset (create, operate, describe, select, apply_records).
- **Re-entrancy.** An agent in the same browser may call tools while the user is mid-drag.
  `TabEndpoint`'s refusal sentence must come back as a normal tool error the agent can act on,
  not an exception that kills its loop.
- **Lifecycle.** Tools registered on load must be unregistered on opt-out and on `pagehide`;
  confirm what the browser does with registrations across a reload and across tabs (two open
  WarpCad tabs both registering `create` — which one does the agent reach?). One tab, the
  focused one, is the intended answer; verify it can be arranged.
- **Secure-context and permission requirements** (HTTPS only? a permission prompt?). Record
  what the user sees and word the opt-in sheet to prepare them.

## Interaction model

- **Precondition** — a browser that exposes `navigator.modelContext` (Chrome with the WebMCP
  flag; the sheet names the flag and says the feature is experimental). No project, key,
  helper process or selection needed.
- **Trigger** — a **Let browser agents use WarpCad** switch in the Assistant panel's header
  menu, beside the live-bridge Connect entry. It opens a small sheet: one paragraph on what an
  attached agent can do and see, one on how to turn it off, then a **Turn on** button. The
  choice is remembered per browser profile (IndexedDB, with `localStorage`-style failure
  tolerance), never in the project file.
- **Feedback** — a header chip: *Browser agents · on* (tools registered) / *off*; absent when
  the API is missing, with the switch shown disabled and the reason ("This browser doesn't
  expose WebMCP"). While a call runs the viewport shows the same "AI is working" state as
  `ai-012`'s. Each landed group is a History row with a `webmcp` origin chip; **Undo AI turn**
  takes it back.
- **Placement** — geometry is placed by the tool's `positionMm`, exactly as `ai-002`/`ai-012`;
  afterwards it is an ordinary body the user moves with the gizmo.
- **Selection response** — unchanged. `get_selection` shows the agent what the user picked and
  never changes it.
- **Selection count** — n/a (not a selection-gated tool).
- **Small-screen behavior** — Chrome on Android is where this could reach a phone, but the flag
  and the agent client are desktop-first today. The switch lives in the same header menu at
  phone width (a bottom sheet ≤ 640 px like the key sheet) and says "not available in this
  browser" when the API is missing, which on phones is the expected case. Same as desktop
  otherwise.

## Documentation

- **Page** — `docs/webmcp.md` (new; sidebar entry under the AI pages), linked from
  `docs/mcp.md`, which gains a short "three ways in" table: closed-file MCP, live bridge,
  WebMCP, each with what it needs and where it works.
- **Example** — "In Chrome, open `chrome://flags/#enable-webmcp-testing`, set it to Enabled and
  relaunch. Open WarpCad, choose **Assistant → ⋯ → Let browser agents use WarpCad**, read the
  sheet and press **Turn on**. In the Model Context Tool Inspector extension, ask: 'Add a
  40 mm cube and put a 20 mm sphere on top of it.' Both bodies appear in the viewport and
  History shows one row with a `webmcp` chip; press **Undo AI turn** to remove both." State the
  flag name as verified on the day, and that millimetres and Z-up apply.
- **Media** — `e2e/docs/webmcp-sheet.docs.js` (screenshot `docs/screenshots/webmcp-sheet.png`,
  the opt-in sheet) embedded in `docs/webmcp.md`. No movie: the agent side is a browser
  extension that cannot be captured by the harness.

## Affected files

- `docs/decisions/ai-partner.md` (Decision 13 — first, and accepted before any code)
- `src/ai/webmcp/` (new, framework-free): `register.js` (tool list → `registerTool`, feature
  detect, `unregisterAll`), `register.spec.js`, `toolShape.js` (registry schema → WebMCP shape,
  result → content blocks)
- `src/ai/bridge/tabEndpoint.js` (only the seam that lets it be built without the dev-host
  socket; no behavior change)
- `src/ai/tools/index.js` (the `webmcp` origin / transport value only)
- `src/composables/useWebMcp.js`, `src/stores/aiChat.js` (opt-in state, connection chip)
- `src/components/ai/WebMcpSheet.vue`, header chip and menu entry in the Assistant header
- `docs/webmcp.md`, `docs/mcp.md`, `e2e/docs/webmcp-sheet.docs.js`

## Proposed fix

1. Decision 13, with the facts re-verified on the day; get the user's acceptance.
2. Extract `TabEndpoint` construction from `useLiveBridge.js` so a second transport can hold
   one (no behavior change, existing `tabEndpoint.spec.js` and `liveBridge.spec.js` unchanged).
3. `src/ai/webmcp/register.js`: given a registry and an endpoint, register each tool, route
   `execute` through `endpoint.handle`, map refusals to tool errors, and return an
   `unregister` function. A no-op when the API is absent.
4. The opt-in store, composable, sheet and chip.
5. Docs page, media shot, `docs/mcp.md` table.

## Effort

M, with an L tail if Decision 13's lifecycle risks (two tabs, `capture_view` results) turn out
to need a curated subset or a per-tab election.

## Testing

- **Unit (`register.spec.js`, plain Node, fake `navigator.modelContext`):** every registry
  tool is registered once with the registry's own schema; no registration when the API is
  absent or the user has not opted in; `unregisterAll` unregisters exactly what was registered;
  an `execute` that the endpoint refuses (editing, stale, cap exceeded) returns a tool error
  carrying the refusal sentence and leaves the serialised NDJSON byte-identical; two calls
  with the same intent inside the idle gap form one `AiTurn`; origin is `webmcp` and never
  `local`. Hostile intent text stays `document_data`.
- **App-level e2e (`e2e/webmcp.e2e.js`, navigates to `/`):** inject a fake
  `navigator.modelContext` with `addInitScript` (the real flag is not available in a
  Playwright-launched browser), open the sheet, turn it on, assert the tools appear on the
  fake, call `create` and `operate` through it with real timing, assert both bodies render and
  **Undo AI turn** removes the group, then turn it off and assert everything was unregistered.
  Also run with the API absent and assert the switch is disabled with its reason.
- **Engines and viewports:** all three engines, because the registered `execute` drives
  persistence and the WebGL viewport; the fake API works in each. Phone, tablet and laptop
  viewports with a snapshot at each, since the sheet moves to a bottom sheet at ≤ 640 px.
  The *real* WebMCP path is Chromium-with-flag only and is **not** automatable here; that part
  goes to `TODO/VERIFY.md` as a one-off hand check with the Inspector extension, stated as
  such rather than implied by the fake-API spec.
- **Acceptance scenarios to re-drive:** 1, 10, 12, 17, 18 (the AI scenarios), 24 (edit while
  the Assistant works), 25 (the panel's state during a bridge session), and the live-bridge
  scenario added by `ai-012`.
- **Closed findings re-run:** `ai-002` (atomic landing), `ai-006` (Undo AI turn), `ai-012`
  and `ai-017` repros, because this reuses `TabEndpoint` and the group-to-`aiTurns` path they
  were filed against; `ai-020` (the panel's no-key wording) since a WebMCP-attached state is a
  second case of "someone else is editing".

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
