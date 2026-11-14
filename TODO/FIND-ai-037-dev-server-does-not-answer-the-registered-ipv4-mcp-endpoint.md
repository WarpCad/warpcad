---
title: `npm run dev` listens on IPv6 loopback only, so the endpoint `mcp:add -- --dev` registers (127.0.0.1:5183) refuses connections
category: ai
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-14 from the testing-022 drive of ai-016 and ai-012 #1
depends: []
status: open
---

## Problem

`FIND-testing-022` ran `npm run dev` and then `npm run mcp:add -- --dev` on the owner's Mac. `claude mcp get warpcad` reported
`Status: Failed to connect`, `ECONNREFUSED`, for `http://127.0.0.1:5183/mcp`. The dev server was up and the app answered on
`http://localhost:5183/`. `vite.config.js` sets `server: { port: 5183, strictPort: true }` with no `host`, so Vite binds
`localhost`, which resolved to `::1` here (`lsof -iTCP:5183` showed `TCP localhost:5183 (LISTEN)` on IPv6 only):

- `curl http://[::1]:5183/mcp` → HTTP 406 (the endpoint answers)
- `curl http://localhost:5183/` → 200
- `curl http://127.0.0.1:5183/` → connection refused

Everything the docs and `mcp:add` name uses the IPv4 address (`DEV_URL` in `scripts/mcp-add.mjs`, `docs/mcp.md` lines 41, 280, 288,
362, and the sheet's endpoint text). The preview server was already fixed for this (`preview: { host: '127.0.0.1', ... }`, with a
comment saying so); the dev server was not. The drive got past it with `npm run dev -- --host 127.0.0.1` and a browser on
`http://127.0.0.1:5183/`. With that flag `claude mcp get warpcad` read `Connected`.

Also: the owner's own `~/.claude.json` already held the `--dev` registration (`type: http`, `http://127.0.0.1:5183/mcp`) when the
drive began, and Claude Code's session start reported `warpcad ... ECONNREFUSED`. That is this defect, not a stopped server.

## Affected files

- `vite.config.js` (`server`)
- `e2e/` or `scripts/` spec guarding the bound address (see Testing)

## Proposed fix

1. Bind the dev server to `127.0.0.1` the way `preview` is, keeping `http://localhost:5183` working (Chromium resolves `localhost`
   to both families; Safari and Firefox try both). If a spec shows `localhost` then fails on some host, bind both families
   (`host: true` is too broad: it exposes the LAN, which the lease model must not allow).
2. Check the live bridge's Host and Origin gate (`mcp/liveHttp.js`) accepts both `127.0.0.1:5183` and `localhost:5183` pages.
3. A spec that starts the dev server and asserts `127.0.0.1:5183/mcp` answers.

## Effort

S.

## Testing

- Unit or script spec for the bound address; engines: not applicable (no UI).
- Re-run `FIND-testing-022`'s `ai-016` #1 / `ai-012` #1 drive: `npm run dev`, `npm run mcp:add -- --dev`, `claude mcp get warpcad`
  reads Connected, and acceptance 25 step 2 refusal wording is unchanged.

## Interaction model

Not UI-touching.

## Documentation

- **Page**: `docs/mcp.md` needs no change if the endpoint stays `127.0.0.1`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
