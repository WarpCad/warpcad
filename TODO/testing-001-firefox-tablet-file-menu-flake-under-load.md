---
title: export-ui "History previews a past state" failed once on firefox-tablet — File menu never appeared (not reproduced)
category: testing
kind: finding
priority: low
model: sonnet
milestone: M8
depends: []
status: open
---

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

## Done when

- The mechanism is identified (a trace of a failing run, or a reproduction under full-suite
  load), then fixed or the test made to wait on the real condition, **not** by raising the
  timeout.
- `/troubleshoot` entry written once the mechanism is known.
- Until then, a second occurrence of this failure is the signal to raise the priority.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
