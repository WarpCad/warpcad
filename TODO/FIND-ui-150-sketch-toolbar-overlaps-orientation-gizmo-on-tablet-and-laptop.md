---
title: The Sketch toolbar overlaps the orientation gizmo on webkit-tablet and firefox-laptop (ui-020 finding #2 regressed)
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-18 from the io-032 e2e run
depends: []
status: open
---

## Problem

`e2e/sketch-primitive.e2e.js:533` ("the Sketch toolbar never meets the orientation gizmo, at any width", ui-020 finding #2)
fails on the `webkit-tablet` and `firefox-laptop` projects. The assertion at line 538 finds the toolbar's and the gizmo's
bounding boxes overlapping (the toolbar is neither left of, right of nor above it). It fails the same way on
plain `HEAD` (883a9202) in a clean worktree, so it predates `io-032`; it is reproducible, not flaky.

Not yet established: which commit broke it and on which other projects it fails. Likely suspects, from the recent history of
`src/components/sketch` and `src/components/viewport`: `f10919d1` (ui-135, wider phone nav mode row) and `9552b7a0`
(sketch-009). Bisect with `git bisect run` over that one spec.

## Affected files

- `src/components/sketch/` (the Sketch toolbar's layout) and `src/components/viewport/` (the orientation gizmo's position)
- `e2e/sketch-primitive.e2e.js` (the spec is right; do not loosen it)

## Proposed fix

Bisect to the breaking commit, then restore the separation (move the toolbar or the gizmo) without undoing that commit's own
goal. Print both boxes in the failure message while fixing.

## Effort

S.

## Testing

- `e2e/sketch-primitive.e2e.js` green on every engine and viewport (`npm run test:e2e:full`).
- `TODO/ACCEPTANCE.md`: the sketch scenarios; re-run `ui-020` finding #2's repro and `ui-135`'s.

## Interaction model

No new control. The toolbar and the gizmo must not overlap at any width.

## Documentation

- **Page**: n/a.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
