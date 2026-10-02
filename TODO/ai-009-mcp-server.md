---
title: MCP server — let Claude Code read and drive a project file with the same tools the chat uses
category: ai
kind: feature
priority: medium
model: opus
milestone: M9
depends: [ai-001, ai-002, ai-003]
status: open
---

## Goal

`CLAUDE.md`: *"MCP server (`mcp/`) — reads and writes the project file or a hosted project
reference, so Claude Code can drive modeling."* "Done": `claude mcp add warpcad -- node
mcp/server.js project.warpcad` and Claude Code can describe the scene, create and operate
on bodies, and the next time the file is opened in the app the new rows are there with
their `mcp` origin chip and their intent.

## Design

- `mcp/server.js` (Node, stdio transport via the SDK `ai-001` picked) wraps `src/ai/tools/`.
  `src/core/` is framework-free and testable in plain Node, so the document, registry and
  kernel run here **without a browser** — build on that rather than starting a headless one.
- Origin `mcp`. Each write is appended to the file atomically (write-temp-then-rename; a
  lock file so two servers cannot interleave). The file format is the one `project.js` owns;
  `mcp/` imports it, it does not re-implement it.
- **Closed-file only in v1** (`ai-001` decision 6). If the app has the same file open, the
  server cannot know; the app detects an external change on focus (the hosted path's
  conflict dialog already exists — reuse `ConflictDialog` semantics for a local file) and
  asks to reload. Live co-editing is the reserved `ai-012`.
- `capture_view` is unavailable here (no GPU): omitted from `list_tools`. Analysis tools
  (`measure`, `check_printability`) work, since they run on the kernel.
- Resources: `warpcad://scene` (the same summary `describe_scene` gives) and
  `warpcad://op-catalogue`, so a client can read without a tool call.
- Hosted references (`#/gist/<id>`) are read-only for v1 unless the token path from
  `io-002` is supplied through an env var the server never logs.

## Interaction model

- **Precondition**: Claude Code (or any MCP client) configured with the command above.
- **Trigger**: the client calls tools; in the app, **File ▾ → Open** (or the focus-reload
  prompt) brings the changes in.
- **Feedback**: in the app, History rows chipped `mcp` with intent text; the Save-status
  chip shows "File changed on disk — Reload". In the client, every tool result names the
  rows it appended.
- **Small-screen behavior**: n/a for the server; the reload prompt is a normal dialog sheet.

## Documentation

New `docs/mcp.md` (sidebar entry). Example: "Run `claude mcp add warpcad -- node mcp/server.js
~/parts/bracket.warpcad`, then in Claude Code say *add a 3 mm base plate under the bracket*.
Open the file in WarpCad — the new step is in History, marked **mcp**."

## Affected files

- `mcp/server.js`, `mcp/package.json` if separate, `mcp/server.spec.js`,
  `mcp/lock.js`, `docs/mcp.md`, `package.json` script, `CLAUDE.md` AI Partner note on
  concurrency made concrete.

## Effort

L.

## Testing

- **Unit/integration** (Node, spawning the server over stdio with a test client): list
  tools, create + operate, a rejected record leaves the file byte-identical, two servers
  race on one file (lock), a truncated file, a file from a newer build, `capture_view`
  absent, the file round-trips into the app's `parseProject`.
- **E2E** (`e2e/mcp-reload.e2e.js` → `/`): the app opens a file, the file is modified on
  disk by the server, the focus-reload prompt appears and the new row shows with the `mcp`
  chip. Three viewports; Chromium + WebKit + Firefox for the File System Access fallback.
- **Acceptance**: re-drive 10 and 12; closed findings `io-001`, `data-004`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
