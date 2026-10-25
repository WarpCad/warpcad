---
title: Acceptance scenario 28, the iOS app end to end, driven on the owner's iPhone
category: testing
kind: feature
priority: high
model: sonnet
milestone: M19
depends: [build-019, render-006, io-014, io-015, ai-025, ai-026]
status: open
---

## Goal

Every M19 row proves its own piece, and most of that proof is a Playwright spec at `/` with a fake
Tauri boundary, because Playwright cannot drive a WKWebView inside an app. That is exactly the gap
`SECOND-ATTEMPT.md` warns about: code that passes its author's script and was never tried by a
person. This task adds **one acceptance scenario that only a real device can pass** and drives it.

Done means `TODO/ACCEPTANCE.md` has **scenario 28, "The iOS app end to end"**, written in the
existing format (control names with `data-testid`s, Steps, Expect, Never, Last run), and a first
**Last run** line recording PASS/FAIL per step from a TestFlight build on the owner's iPhone.

## Interaction model

n/a. This task adds a scenario and runs it; it adds no control. (Every control it exercises is
specified in its own row.)

## Documentation

n/a for end users. The scenario lives in `TODO/ACCEPTANCE.md`. If driving it finds a docs step
that does not match the app, fix the page in this task and name it in the retirement note.

## Affected files

- `TODO/ACCEPTANCE.md` (scenario 28)
- `TODO/VERIFY.md`: only for a device quirk that is genuinely one-off.

## Proposed fix

Scenario 28's steps, on the iPhone (TestFlight build, portrait, then landscape for step 2):

1. Install from TestFlight and open the app. Expect no white flash in dark mode and the viewport
   within the cold-start time `build-018` measured.
2. Drag a **Cube** and a **Sphere** in; orbit, pan and zoom by touch only, including with the
   on-screen navigation chrome. Expect both visible (scenario 1, scenario 7).
3. **File ▾ → Save** as `scenario-28`; open the Files app and find it under *On My iPhone ›
   WarpCad*.
4. Switch to another app for 5 minutes, then return. Expect the view restored (`render-006`), both
   bodies, the selection kept.
5. Force-quit and relaunch. Expect the autosave back; **Open…** lists `scenario-28`.
6. Subtract the sphere from the cube and export STL. Expect a file in *WarpCad › Exports*.
7. Save an API key, send one Assistant message. Kill and relaunch, then send another without
   re-entering the key.
8. Enable **Live MCP access** with **Allow devices on this Wi-Fi**; from Claude Code on a Mac on
   the same network, ask for *a 20 mm cylinder on top of the cube*. Expect it to land, with
   **Undo AI turn** removing it. Then lock the phone for 60 s mid-request and record what lands and
   what the agent is told.
9. In the Files app, tap `scenario-28.ndjson` and choose **Open in WarpCad**.

**Never**: a reload that loses edits, a Save that wrote nowhere, a Blob download that does
nothing, a Restore that needs the app killed, an MCP write while access is off.

Then do the milestone's **five-minute free-form pass** (CLAUDE.md Verification) **here**, not after
`build-020`: `build-020` is M19's last row, but it changes nothing a user can operate, so this is the
last point where the app changes. When `/run-todos` reaches the end of M19, it records this pass as
the owed one. The pass is done by the owner on the iPhone *and* an iPad if one is available, with no
script. Record what was found as findings, not as fixes in this
task.

## Effort

M.

## Testing

The task *is* the test. Report each step PASS/FAIL with the device, iOS version and build number.
Re-drive **scenarios 1, 7, 10 and 25** on the device in the same session. If any step fails, file a
finding (`TODO/<category>-NNN`) with the repro, add a row to the M19 table, and leave
`build-020` blocked on it.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
