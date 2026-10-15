---
title: export-ui "History previews a past state" failed once on firefox-tablet — File menu never appeared (not reproduced)
category: testing
kind: finding
priority: high
model: sonnet
milestone: M8
depends: []
status: done
---

> **Shipped (2026-10-15):** mechanism found and fixed. The File button moved. The header is a
> right-aligned row and the save-status chip changed width when "Saved · HH:MM" replaced its
> earlier text ~500 ms after an edit, sliding the File button 9-31 px left under a pointer
> already aimed at it; under Firefox load the click straddled that moment and never fired.
> Evidence: a trace from a CPU-contended run (28 busy loops, 14 workers, three Firefox
> projects, ten failures with this exact signature) showing the click resolved at x=1142,
> a 200 ms click action, and `aria-expanded="false"` in every later snapshot; and a rAF probe
> showing the button's left edge going 496.2 → 465.2. Fix: `SaveStatus.vue` `min-width: 132px`
> (tablet/laptop; phone is already a fixed dot). Test: "the File button does not move when an
> edit autosaves…" in `e2e/save-load-ui.e2e.js` (red before, green after). The earlier
> History-strip-reflow hypothesis was wrong; it was the chip, not the strip. See
> `TROUBLESHOOTING.md`, 2026-10-15.

## Problem

During the full headless e2e run for the licensing commit (`38a0759`), one test failed out of
2,845 (2,395 passed, 449 skipped):

`[firefox-tablet] e2e/export-ui.e2e.js:626` — *while History previews a past state Export… is
dimmed with the way out; it is live again after leaving*.

It failed at `openFileMenu` (`export-ui.e2e.js:208`, reached from line 647): after leaving the
History preview, a click on `file-menu-button` was followed by
`expect(file-menu).toBeVisible()` timing out at 5 s with "element(s) not found".

## What is known

- Not reproduced: 3 of 3 passes alone, and 40 of 40 passes with `--repeat-each=40 --workers=7`
  on `firefox-tablet`. The failing run had every project's WebGL specs loading the machine.
- Not caused by the licensing commit: that commit changed this spec by one SPDX comment line
  and changed no behaviour under `src/`.
- Reading `src/components/storage/FileMenu.vue` found no path that closes the menu behind the
  click; `toggleMenu()` only opens it when `menuOpen` is false, and the test asserts
  `file-menu` count 0 after Escape before it reaches line 647.
- Hypothesis, unverified: the History strip disappearing reflows the header between
  Playwright's actionability check and the click, so the click lands on something other than
  the button. An uncommitted edit to `e2e/inspector-hidden-parts.e2e.js` describes the same
  class of Firefox-under-load timing problem in a different test.

## Seen again (2026-10-03, during `TODO/sketch-002`) — priority raised to medium

Two more full-suite runs, **one failure each, same signature, two different specs** — so it is
not specific to `export-ui.e2e.js` or to the History strip:

- Baseline run (before any change): `[firefox-tablet] e2e/export-ui.e2e.js:626` again — 2,483
  passed / 501 skipped / 1 failed. Passed alone right after (1/1).
- Post-change run: `[firefox-laptop] e2e/save-load-ui.e2e.js:1101` (*hosted storage through the
  File menu › Disconnect deletes the credential…*) — `openFileMenu` at `save-load-ui.e2e.js:228`:
  `file-menu-button` clicked, `file-menu` "element(s) not found" for 5 s. 2,525 passed / 519
  skipped / 1 failed. Passed alone 3/3.

Both are Firefox, both under the full 7-worker matrix, both at the first `file-menu` open in the
test, and neither touches the History preview in the second case — which weakens the
History-strip reflow hypothesis above and points at the File menu's own open path (or the
header) under load. `sketch-002` touched neither.

## Seen a third time (2026-10-12, during `TODO/docs-022`, a prose-only diff)

Full 9-project run: 3,322 passed / 860 skipped / **1 failed** (4,183 tests, 1,034 s).
The failure is `e2e/save-load-ui.e2e.js:230` (*hosted storage through the File menu ›
Disconnect deletes the credential…*), the same test as the 2026-10-03 occurrence, again at
`openFileMenu`: `file-menu` "element(s) not found" for 5 s. Passed alone **9/9** across every
project right after (5.3 s). The compact run report did not record which project failed, so
the Firefox-only pattern above is **not confirmed** this time. The diff under test touched
nothing under `src/`, `e2e/`, `mcp/` or `scripts/`. This is the second occurrence of this exact
test, which the "Done when" section names as the signal to raise the priority: **priority
raised to high.** The commit was made with the red test recorded here, at the user's
instruction.

## Done when

- The mechanism is identified (a trace of a failing run, or a reproduction under full-suite
  load), then fixed or the test made to wait on the real condition, **not** by raising the
  timeout.
- `/troubleshoot` entry written once the mechanism is known.
- Until then, a second occurrence of this failure is the signal to raise the priority.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
