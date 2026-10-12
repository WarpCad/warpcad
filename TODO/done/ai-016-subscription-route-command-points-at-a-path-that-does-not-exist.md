---
title: The "Use my Claude subscription" command registers a server path that does not exist
category: ai
kind: finding
priority: high
model: sonnet
depends: [ai-009, ai-013]
status: done
---

> **What shipped.** `scripts/mcp-add.mjs` / `npm run mcp:add -- <file>` registers the server at
> **user** scope (Claude Code's default scope is per-folder, which contradicted "start Claude Code in
> any folder"), clears stale `user` and `local` entries first, validates or creates the project file,
> and checks `mcp/` dependencies are installed. `mcp/server.js` exits 1 naming the path when it
> cannot open or create the file. The `--live` flag (item 4) was not built: `ai-012` does not exist
> yet. The spec for the script lives in `mcp/mcp-add.spec.js` (not `scripts/`) because the MCP client
> is an `mcp/` devDependency.

## Problem

`ai-013` made the no-key key sheet offer **Use my Claude subscription…**, which shows a command
with a **Copy** button. The command is a constant, `MCP_ADD_COMMAND` in
`src/ai/subscriptionRoute.js:12`:

```
claude mcp add warpcad -- node ~/src/WarpCad/mcp/server.js ~/parts/bracket.ndjson
```

Both paths are placeholders copied from `docs/mcp.md`. A static PWA cannot know where the
repository was cloned (here it is `~/src/WarpCad2`, there is no `~/src/WarpCad`), and
`~/parts/bracket.ndjson` is nobody's file. Pasted as shown, Claude Code registers a server whose
`node` process exits at once, and `/mcp` reports `warpcad: CONNECTION_CLOSED`. That is exactly
what happened on 2026-10-12: `~/.claude.json` held the placeholder verbatim and the server, when
run by hand against a real path, answered `initialize` correctly.

This is the same failure class as `SECOND-ATTEMPT.md`'s: the control exists, is reachable and
was tested (the spec asserts the sheet *shows* a command and Copy copies it), and the thing the
user actually does with it was never driven. Nothing ran the pasted command.

## Affected files

- `src/ai/subscriptionRoute.js` (the constant)
- `src/components/ai/SubscriptionRoute.vue` (the sheet that shows it)
- `docs/mcp.md:30`, `docs/ai-partner.md` (the same placeholder, presented as the thing to run)
- `package.json` (new `mcp:add` script)
- `e2e/` spec for the sheet (asserts only that a command is shown)

## Proposed fix

1. **Never print a path the app cannot know.** Add `npm run mcp:add -- <project-file>`, a small
   `scripts/mcp-add.mjs` that resolves `mcp/server.js` from its own location, resolves the project
   file to an absolute path (creating an empty valid project file if it does not exist), and runs
   `claude mcp remove warpcad` (ignoring "not found") then `claude mcp add warpcad -- node <abs>
   <abs>`. It prints exactly what it registered and where, and exits non-zero with the reason if
   the `claude` CLI is missing.
2. The sheet and both docs pages show `npm run mcp:add -- my-part.ndjson`, "from the folder you
   cloned WarpCad into", instead of a raw `claude mcp add`. The Copy button copies that.
3. `mcp/server.js` itself fails loudly at start when its file argument is unreadable *and*
   cannot be created (a one-line stderr message naming the path). Today a bad path surfaces only
   as `CONNECTION_CLOSED` in the client, which is undiagnosable from there.
4. Superseded for live editing by `ai-012`: there the server takes no file argument at all, and
   this script's `--live` flag registers that mode. Build this task first; it is small and fixes
   the only subscription route that exists today.

## Effort

S

## Testing

- Unit: the script's argument handling against a temp dir with a fake `claude` on `PATH` that
  records its argv (absolute paths, existing registration replaced, missing CLI is a clear
  error, missing project file is created and loads through `projectFile.js`).
- Unit: `mcp/server.js` exits non-zero with a message naming the path when it cannot open or
  create the file.
- **Drive it, not just assert it.** The e2e spec for the sheet must not stop at "a command is
  shown": a spec in `mcp/server.spec.js` spawns the server with the argv the script *produces*
  and completes an MCP `initialize` + `tools/list` with `@modelcontextprotocol/client` (already a
  devDependency). That is the check that would have caught this.
- `*.e2e.js` against `/`: the existing no-key sheet flow, updated to assert the shown command is
  the `npm run mcp:add` form and contains no `~` or `/path/to`. Chromium only (clipboard grants,
  as `ai-013`).
- Acceptance scenarios to re-drive: 1 (app still loads, key sheet reachable), 10 and 12 (MCP).
- Closed finding re-run: `ai-009`'s own repros (atomic append, reload-on-change).

## Documentation

- **Page** — `docs/mcp.md` (Register the server) and `docs/ai-partner.md` (the no-key route).
- **Example** — "From the folder you cloned WarpCad into, run `npm run mcp:add -- bracket.ndjson`.
  Start Claude Code in any folder and type `/mcp`: `warpcad` should say *connected*. Ask it to
  'add a 40 mm cube', then open `bracket.ndjson` in WarpCad."
- **Media** — none new; the existing `ai-013` sheet shot is regenerated by `npm run docs:media`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
