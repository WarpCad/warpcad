---
title: Transcribe the 8 draft scenarios into TODO/ACCEPTANCE.md
category: docs
kind: feature
priority: high
model: sonnet
milestone: M0
depends: [ui-001]
status: done
---

## Goal

Fill in `TODO/ACCEPTANCE.md`'s empty Scenarios section using `Initial design.md` §9's
8 drafted candidates, once `ui-001` has confirmed the exact control shapes (button
names, gesture descriptions, exact selection counts) each scenario needs to reference.
Per `CLAUDE.md`'s Verification section, this must be written before feature work
starts, using `TODO/ACCEPTANCE.md`'s own template (Steps/Expect/Last run).

Done when: all 8 scenarios from §9 are written into `TODO/ACCEPTANCE.md` in its
required template shape, each with concrete numbered steps a human could literally
follow (not the design doc's provisional/descriptive phrasing).

## Interaction model

n/a — this task edits a planning file; it adds no control of its own.

## Documentation

n/a — `TODO/ACCEPTANCE.md` is an internal verification artifact, not end-user
documentation.

## Affected files

- `TODO/ACCEPTANCE.md` (edit — fill in the Scenarios section)

## Proposed fix

Transcribe §9's 8 scenarios (two independent primitives; hardware property edit;
snap-placement of a kit assembly; boolean gating; hidden-part boolean; group vs.
sub-part selection; touch-only viewport navigation; remote-load safety), rewriting each
one's Steps using `ui-001`'s confirmed control names/gestures rather than §9's
provisional descriptions. Leave `Last run` blank/unset until each scenario is actually
driven for the first time (that happens starting at `render-001` and later
catalog/operation tasks, not in this task).

## Effort

S (< 1hr)

## Testing

n/a — this task creates the scenarios, it doesn't run them. The first real PASS/FAIL
run happens once `render-001` and the catalog tasks named in `docs-003`'s roadmap
exist to drive against.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
