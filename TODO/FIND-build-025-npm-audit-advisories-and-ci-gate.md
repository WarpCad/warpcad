---
title: Clear the open npm advisories (Vite, Storybook, zod) and make npm audit a CI gate
category: build
kind: finding
priority: high
model: sonnet
milestone: none — Findings table, filed 2026-11-10 from the architecture audit
depends: []
status: open
---

## Problem

`npm audit`, run 2026-11-10, reports 21 advisories in the app's tree (1 critical, 9 high) and 1 high
in `mcp/`. CI runs `npm run spdx`, `npm run licenses` and `npm run mcp:licenses`
(`.github/workflows/ci.yml:35-37`) and **no audit**, so nothing reported these. Three matter for how
this project is actually used:

1. **`vite` 8.3.0–8.3.2 (direct, high)**: among others, "Cross origin script execution through Vite
   custom middleware" (GHSA-9jrq-w75r-8gcw) and "Files outside `server.fs.allow` could be served"
   (GHSA-rq7h-c2jc-7f22). This project runs custom middleware on the dev and preview servers on
   purpose: the live bridge's `/mcp` endpoint (`mcp/liveBridge.js`, `mcp/livePreview.js`), which
   lets an agent edit the open project.
   - **Attacker**: any web page the developer has open in another tab while `npm run dev` or
     `npm run preview` is running.
   - **Entry point**: the dev or preview server on `127.0.0.1:5183` / `:4173`.
   - **Impact**: script running in the app's local origin. That origin's IndexedDB holds the BYOK
     API key and GitHub tokens if the developer has ever connected them there
     (`src/storage/tokenStorage.js`), and `connect-src` allows posting them to `api.github.com`.
   - The bridge's own Origin/Host gate (`mcp/bridge.js:339-352`) does not help if Vite's layer is
     the one bypassed. Whether GHSA-9jrq-w75r-8gcw is reachable through this project's middleware
     is **not confirmed**; reading the advisory against `mcp/liveHttp.js:215-225` would confirm it.
     The fix (upgrade) is the same either way.
2. **`storybook` 10.0.0–10.6.1 (direct, critical)**: "Missing origin validation in Storybook
   preview allows code injection from malicious websites" (GHSA-f2ph-cmg5-wxc8) and a local-network
   variant (GHSA-px85-f4q5-jh77). Same attacker and entry point, while `npm run storybook` is up.
   Storybook's origin is separate from the app's, so the impact is code execution in the Storybook
   page, not the key store.
3. **`zod` < 4.6.6 in `mcp/` (high, transitive)**: "Zod can exhaust memory while validating
   oversized constrained collections" (GHSA-mrhx-c7xc-m3w5). It comes in through
   `@modelcontextprotocol/server` 2.3.1, the only dependency in `mcp/package.json`, which uses it to
   validate protocol messages. WarpCad's own tool schemas are plain JSON Schema
   (`mcp/server.js:199`), so whether a tool call's arguments reach a constrained zod collection is
   **not confirmed**; sending `list_ops` an `ops` array of a few million entries and watching the
   server's memory would confirm it.
   - **Attacker**: text in a project file that steers the connected agent (the prompt-injection
     case `docs/decisions/ai-partner.md` decision 7 plans for), or a buggy client.
   - **Impact if reachable**: the MCP server process runs out of memory mid-call. The lock file is
     taken over as stale afterwards (`mcp/lock.js`), so this is denial of service, not corruption.

The one production-tree advisory, `source-map-js` (high, transitive through the Vue compiler), is a
build-time package that does not ship in the bundle. It has a fix available and goes with the rest.

The other dev-tree advisories (`release-it` and its proxy chain, `undici`, `brace-expansion`,
`workbox-build`, `vite-plugin-pwa`) run only in CI or at release. Lower risk, same fix.

## Affected files

- `package.json`, `package-lock.json`
- `mcp/package.json`, `mcp/package-lock.json`
- `.github/workflows/ci.yml:35-37`
- `docs/decisions/stack-defaults-health-check.md` (record the gate)

## Proposed fix

1. `npm audit fix` in the root and in `mcp/`. Every advisory listed reports `fix available`. If a
   fix needs a major version (`release-it`, `storybook`), take it in its own commit and run that
   tool once to prove it still works.
2. Add two CI steps after the licence checks:
   `npm audit --omit=dev --audit-level=high` and `npm --prefix mcp audit --omit=dev --audit-level=high`.
   These fail the build on a high or critical advisory in what ships.
3. Add a third, non-blocking step, `npm audit --audit-level=critical || true`, printed in the log, so
   dev-tree advisories are seen without holding a push hostage to a tool that has no fix yet.
   (Default taken without asking: blocking on production, reporting on dev. Say so in the commit.)
4. `mcp/server.js` already caps what a tool call may do (`src/ai/tools/limits.js`). Check that
   every array in the tool input schemas (`src/ai/tools/schema.js`, `src/ai/tools/index.js`) carries
   a `maxItems`, as `list_ops` does (`index.js:282`). If one is unbounded, bound it; that limits the
   memory case whatever the SDK's zod version.
5. Do not add an audit step to the pre-push hook: it needs the network.

## Effort

S–M. M only if a major-version bump is needed.

## Testing

- `npm audit --omit=dev` and `npm --prefix mcp audit --omit=dev` both exit 0.
- `npm run test:unit`, which picks up `mcp/*.spec.js` (`mcp/server.spec.js` drives real tool calls through
  the SDK).
- Because `vite`, `vite-plugin-pwa` and `workbox-build` change: `npm run build`, then
  `npm run test:e2e:headless`. The service worker's precache is persistence, so all three engines
  matter for `e2e/pwa-update.e2e.js` and `e2e/csp.e2e.js`.
- The live bridge after the Vite bump: `e2e/ai-live-bridge-preview.e2e.js` and
  `mcp/liveBridge.spec.js`, `mcp/liveHttp.spec.js`.
- Acceptance scenarios to re-drive: 23 and 25 (an agent edits the open project, over the file and
  over the live bridge), since both paths sit on the upgraded packages.
- Closed findings whose reproductions re-run: `ai-012` (the live bridge's Origin/Host refusals).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
