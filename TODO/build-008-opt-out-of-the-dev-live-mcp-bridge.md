---
title: Add a configuration switch to disable the dev live MCP bridge
category: build
kind: feature
priority: medium
model: sonnet
milestone: M9
depends: [ai-012]
status: open
---

## Goal

Keep the live MCP bridge enabled by default for development, but let someone turn it off when
testing Chrome's WebMCP integration or running a local preview. Done means an explicit server-side
configuration setting disables bridge registration and its `/mcp` endpoint for both `npm run dev`
and `npm run preview`, without disabling WebMCP in the app or changing the default behavior.

## Interaction model

Not applicable. This is a developer configuration setting, not an in-app control. Example invocation:
`WARPCAD_LIVE_BRIDGE=0 npm run dev` (and the equivalent `npm run preview`).

## Documentation

- **Page**: update `docs/mcp.md`.
- **Example**: start the dev server with `WARPCAD_LIVE_BRIDGE=0 npm run dev`, then test the app's
  WebMCP tools in Chrome; the live bridge's `/mcp` endpoint is not available. Document the same
  setting for `npm run preview`.
- **Media**: none; this documents a developer-only server setting, not an app UI.

## Affected files

- `vite.config.js`: conditionally register `warpcadLiveBridge()` from a server-side environment
  setting, defaulting to enabled.
- `mcp/liveBridge.spec.js`: cover default-on and opt-out behavior, including that a disabled bridge
  does not mount its MCP middleware or HMR handlers.
- `e2e/`: add an app-level Chromium spec for the opt-out configuration that confirms the app still
  exposes WebMCP while the dev live bridge is disabled.
- `docs/mcp.md`: explain the setting and both commands.

## Proposed fix

Use one server-only environment variable (for example, `WARPCAD_LIVE_BRIDGE=0`) at the Vite
configuration boundary. Keep the current default on. Ensure the switch is honored by both the dev
server and preview server; if Vite does not activate the plugin in preview, verify that behavior and
document it rather than implying the setting controls a server where the bridge is absent. Do not
gate or remove the browser's separate WebMCP registration.

## Effort

S.

## Testing

- Extend the Vite integration coverage to prove the default server serves `/mcp`, and the opted-out
  dev and preview servers do not register the bridge endpoint or its HMR hooks.
- Add a real app-level `*.e2e.js` spec navigating to `/` with the opt-out setting; in Chromium,
  confirm WebMCP is still registered when supported. No layout changes, so desktop only; Chromium
  only because the WebMCP API under test is Chrome-specific and this change does not touch WebGL,
  canvas, or persistence.
- **Acceptance scenarios to re-drive**: none; the setting changes only the development bridge, not
  app modeling behavior. The new app-level check covers WebMCP availability in the opted-out run.
- **Closed findings to re-run**: none; this does not extend a subsystem with a closed finding.

## Notes

Requested in `TODO/NEW-TODO.md` on 2026-10-16 while testing WebMCP in Chrome.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->