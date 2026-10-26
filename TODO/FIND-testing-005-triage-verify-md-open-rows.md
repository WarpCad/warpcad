---
title: Triage the roughly 347 Open rows in TODO/VERIFY.md: move, graduate or close each one
category: testing
kind: finding
priority: medium
model: sonnet
depends: []
status: open
---

## Problem

`TODO/VERIFY.md` is meant to stay small (see `CLAUDE.md`, Verification). On 2026-10-17 it held
about 347 table rows with Status `Open` in 1,923 lines, the same growth the second attempt's
retrospective warned about. Many rows likely repeat what an `ACCEPTANCE.md` scenario already
checks, or are WebGL, canvas or persistence checks that `CLAUDE.md` says should graduate into
a real `*.e2e.js` spec. The user chose on 2026-10-17 to file this triage task.

## Affected files

- `TODO/VERIFY.md`
- `TODO/ACCEPTANCE.md` (rows that duplicate or extend a scenario)
- `e2e/*.e2e.js` (only if a row is graduated)

## Proposed fix

1. List every `Open` row with its entry heading, then give each exactly one verdict:
   **keep** (a genuine one-off judgment call or device quirk), **move** (already a standing
   scenario, so add a line to that scenario and delete the row), **graduate** (a WebGL,
   canvas or persistence check verified by hand more than once, so file a TODO for a real
   spec on all three engines) or **close** (answered by a later change; cite it).
2. Apply the **move** and **close** verdicts. Do not touch rows that need a human on real
   hardware or the owner (the Sentry and GA setup rows, real-phone checks): those are **keep**.
3. File one TODO per **graduate** group, not per row.
4. Report the before and after counts. Aim for a file a person can read in one sitting.

## Effort

M (a few hours, mostly reading).

## Testing

- `npm run spdx` passes; no code changes expected.
- Acceptance scenarios: none re-driven (documentation only).
- Closed-finding regression: none.

## Interaction model

Not UI-touching.

## Documentation

- **Page**: n/a (internal process file).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
