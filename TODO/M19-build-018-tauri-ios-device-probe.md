---
title: Measure the Tauri iOS app on the owner's iPhone and settle the decision record's open questions
category: build
kind: feature
priority: high
model: sonnet
milestone: M19
depends: [build-017]
status: open
---

## Goal

`docs/decisions/native-mobile-shell.md` marks a dozen behaviours **unverified** or **unmeasured**
because no app had been built. With `build-017`'s shell on a real iPhone, measure them once and
record them. The later M19 rows are designed around the answers. Two answers can change a row's
design, and this task must say so in the row's file when they do:

- **Which agents can reach an MCP server inside the app** (sets `ai-026`'s scope).
- **Whether files opened through `tauri-plugin-dialog` from iCloud Drive can be re-read later**
  (sets `io-014`'s in-place save scope).

Done means a new **Question 8, measured on device** section in the decision record, with a table
of each item: value, method, device and iOS version, date. Every number has a method; nothing is
estimated.

## Interaction model

n/a. This is a measurement task with no user-visible change. Throwaway probe code goes on a branch
of `warpcad-native` or in a scratch window behind a debug flag, and is **not** merged.

## Documentation

n/a for end users. The results go in `docs/decisions/native-mobile-shell.md` Question 8.

## Affected files

- `docs/decisions/native-mobile-shell.md` (Question 8)
- `TODO/io-014-*.md`, `TODO/ai-026-*.md`: amend their Proposed fix if a result changes them.
- `TODO/VERIFY.md`: only for a one-off judgment the table cannot hold.

## Proposed fix

Measure, on the owner's iPhone (record model and iOS version), with a release build:

1. **Size**: `.ipa` and installed size; how much is the web bundle, how much is
   `dist-native/help/img` (89 MB on the web build), and how much is native code. Compare with
   Question 7b's 4.46-7.78 MB estimate.
2. **Cold start** to first rendered frame (a `performance.now()` mark posted to a log via
   `invoke`), five launches, median.
3. **Memory**: Xcode's memory gauge for the app plus the WebContent process, with an empty scene
   and with scenario 3's library parts placed.
4. **WebGL context loss after backgrounding**: place two bodies, background for 1, 5 and 15
   minutes, foreground. Does `webglcontextlost` fire? Does the page reload (WebContent killed)?
   Tauri's handling of `webViewWebContentProcessDidTerminate` was **unverified** (Q1). Read wry's
   source and record what it does. If it does nothing, a killed WebContent leaves a blank app, and
   `render-006` must cover that case too.
5. **IndexedDB survival** across app kill and relaunch, and after a 24 h gap.
   `navigator.storage.persist()`'s answer inside the app.
6. **`ws://` from `tauri://localhost`** to a LAN address (the laptop running `npm run dev`).
   Allowed or blocked as mixed content? Does a Local Network prompt appear?
7. **`<input type=file>`** opens the document picker and returns the file. **Blob
   `<a download>`**: does anything happen?
8. **`tauri-plugin-dialog` open from iCloud Drive**: is the returned path readable again after a
   relaunch (security-scoped access), or only once?
9. **Files app visibility**: with `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace` set,
   does a file written to the app's Documents folder appear under *On My iPhone › WarpCad*?
10. **MCP reachability**, the question that sets `ai-026`'s scope. Start a throwaway HTTP listener
    in Rust (`tokio` + `axum`, loopback and `0.0.0.0`) in the app and record who can reach it, and
    when:
    - **the Claude iOS app.** Its custom connectors are believed to be called from Anthropic's
      servers, not from the phone, so a server on the phone is unreachable. Verify against current
      Claude docs and record what is actually possible;
    - Claude Desktop and Claude Code on the owner's Mac, over the LAN to `http://<phone-ip>:<port>`;
    - another app on the same phone (Safari `fetch` to `http://127.0.0.1:<port>`);
    - each of the above with the app backgrounded for 10 s, 60 s and 5 min.
    Note whether listening alone produced a Local Network prompt (TN3179 says it should not), and
    whether advertising via Bonjour did.
11. **CSP**: any console violation under `tauri://localhost`.

If item 10 shows that no agent on the phone can reach an in-app server, **stop and tell the owner**
before `ai-026` starts. The owner asked for "MCP service for agents like the Claude app", and the
honest options then are LAN agents (Mac), the macOS build of the same shell, or the reserved outbound
relay `ai-019`. That choice is the owner's.

## Effort

M.

## Testing

No spec; the deliverable is measurements. Re-drive **acceptance scenario 10** (save and reload)
on device as part of item 5, and report PASS/FAIL.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
