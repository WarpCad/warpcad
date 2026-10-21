---
title: Research how to package WarpCAD as an iOS and Android app that can host the MCP tool surface
category: build
kind: feature
priority: medium
model: opus
tags: [research]
depends: []
status: done
---

> **Shipped:** the decision record `docs/decisions/native-mobile-shell.md` (status: proposed, awaiting the
> owner's acceptance). Recommends Capacitor 8 with an outbound relay for outside agents; corrects three of
> this file's premises (`mcp/server.js` cannot run as-is on a phone; a TCP listener alone does not trigger the
> iOS Local Network prompt; a relay turn is a group of `mcp`-origin batches, not one atomic `ai` merge). No
> code or dependency changed.

## Goal

Answer one question before any code is written: **what is the right way to turn the
WarpCAD PWA into an iOS and Android app that can also expose an MCP server?** The
deliverable is a decision record, not an implementation. Done means
`docs/decisions/native-mobile-shell.md` exists, follows the Library decisions process
in `CLAUDE.md` (several real options compared, a rejection table, a health check), and
ends with a recommendation the user can accept or reject.

The working hypothesis from the first pass, to be tested rather than assumed:

- **Shell: Capacitor** wrapping the Vite build in WKWebView and the Android WebView.
  It reuses the Vue and three.js code unchanged and handles App Store and Play Store
  packaging.
- **Tools run in the page.** The framework-free registry in `src/ai/tools/` executes
  inside the WebView, so the BYOK chat path needs no MCP hop.
- **Reaching the tools from outside the phone** is the open part. Candidates: an
  outbound WebSocket relay in the shape of the `ai-012` live bridge (pairing code, the
  app dials out); a foreground local HTTP/SSE listener via a Capacitor plugin (needs
  the iOS Local Network permission and dies on suspend); WebMCP (`ai-021`), only if the
  WebView engine exposes it.

Options to compare, at minimum: Capacitor, Tauri 2 mobile, nodejs-mobile (embedding
Node so `mcp/server.js` runs as-is), and a TWA for Android only.

## Interaction model

n/a — this is a research task with no user-visible surface. No control, panel, or
gesture is added or changed.

## Documentation

n/a — no user-visible control. The research output is a `docs/decisions/` page, which
is developer documentation, not end-user documentation.

## Problem

Not applicable. This is a planning question, not a defect.

## Affected files

- `docs/decisions/native-mobile-shell.md`   (new: the decision record)
- `TODO/ROADMAP.md`                         (only if the recommendation adds build rows; not in this task)

## Proposed fix

Research, then write the decision record. Work through these questions and answer each
in the record with evidence, not opinion:

1. **Shell comparison.** For each option, record features, bundle and binary size,
   stars, open/closed issue ratio, release recency, and maintainer count, per the
   Library decisions process. Include what each does with WebGL (three.js) in its
   native WebView, and whether WebGL context loss is handled.
2. **Storage survival.** How do WKWebView and the Android WebView treat IndexedDB
   eviction and site-data clearing? Which data needs mirroring into native storage or
   Keychain (the project file and the BYOK key), and which can stay in IndexedDB.
3. **File access.** The File System Access API is missing in WKWebView. Which native
   plugin covers save and open, and how does the share sheet fit the existing
   "no handle" fallback?
4. **Outside reachability.** Compare the three ways an external agent could reach the
   tools (outbound relay, foreground local listener, WebMCP). For each, state the
   suspension behaviour, the permission prompts, and what happens when the phone
   sleeps mid-turn.
5. **Single-writer rule.** Confirm how a remote AI turn lands as one atomic `ai`-origin
   merge (`docs-022`, `ai-017`) while the human keeps editing, and whether the relay
   design preserves that. Name any case where it does not.
6. **Health check.** Re-check the recommended shell's maintenance status on the day the
   record is written, and note the date.

## Effort

M — a few hours of reading, a few quick spikes at most, and one written record. No
production code, no dependency added to `package.json`.

## Testing

None — this is research. No `*.spec.js` or `*.e2e.js` is added. The acceptance check is
that the decision record exists, that each runner-up has a stated rejection reason, and
that the user has reviewed the recommendation.

Acceptance scenarios touched: none. The change is a single new `docs/decisions/` file,
so none of the scenarios in `TODO/ACCEPTANCE.md` can regress from it.

Closed findings re-run: none. This task extends no subsystem a closed finding was filed
against.

Responsive layout and browser engines: not applicable, no runtime code.

## Notes for whoever picks this up

- Keep the research separate from implementation. A spike to check whether a Capacitor
  build loads `three.js` is in scope only if it stays on a throwaway branch and is not
  merged.
- The MCP server (`mcp/server.js`) and the lock-file model assume a desktop filesystem.
  Do not assume they carry over to a phone; that is question 4's job to settle.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
