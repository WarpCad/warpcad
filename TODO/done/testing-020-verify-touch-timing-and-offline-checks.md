---
title: Drive the VERIFY.md touch, timing and offline checks that emulation and real timers can settle
category: testing
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-07 from the VERIFY.md drivable-row triage
depends: []
status: done
---

## What shipped

Verification only; no product code changed. All eight rows were driven against HEAD on 2026-11-14, and each one's Status and Notes are in
`TODO/VERIFY.md` with the raw numbers: `core-029` #3 (offline reload plus a Bolt drop on the production build with its service worker: OK),
`ui-084` #2 (long-press callout at 522 ms, gone 1539 ms after release, a drag from the same tile still places: OK), `ui-084` #3 (the new My
parts tile pulses once for 900 ms and is scrolled into view: OK), `core-061` #2 (Bolt 1 and its repeats update in the same frame: OK),
`data-010` #2 (stamping 0.051 ms per mutation, input to second frame about 40 ms on 200 records: OK), `ui-062` #4 (**reproduces**, see
`FIND-ui-126`; acceptance 7's chrome steps re-driven and pass), `ui-051` #3 (WebKit 820x1180: Delete, Backspace and Backspace-in-a-field behave;
the premise of a collapsed Inspector sheet does not hold at that width, noted), `core-031` #2 (headed Google Chrome 157 on the M4 Pro at 120 Hz:
0 blank frames in 1,280 sampled over 8 transitions: OK). Two follow-ups filed: `FIND-ui-126` (the ring wins a Pan-mode press) and
`FIND-testing-040` (graduate the long-press and the pulse to a real-timer spec). Nothing is left Open. The preview builds were made from the
working tree; the owner's theme work in progress adds no files under `src/styles/themes/` here (only `dark.css` and `light.css`), so no
measurement was affected.

## Problem

These `TODO/VERIFY.md` rows were held back because their only coverage used fake timers, a synthetic
pointer or no network change. None of them asks how something feels under a real thumb. Each asks whether
something happens: a long-press callout, a pulse, a lag, an offline reload, a gesture misroute. Chromium's
CDP touch emulation, real timers, `context.setOffline` and headed Chrome on this Mac's GPU can answer
them.

Rows (entry and row number in `TODO/VERIFY.md`):

| Row | What to drive |
|---|---|
| `core-029` #3 | Install the PWA in Chromium, go offline (`context.setOffline(true)`), reload, drop a Bolt: its measurement lands (worker chunk served from the precache) |
| `ui-084` #2 | Touch emulation at tablet width, real timers: long-press a rail tile and the name callout appears; a drag from the same tile still places |
| `ui-084` #3 | Save a part to My parts: its new tile scrolls into view and pulses once (watch the animation class or `getAnimations()`) |
| `core-061` #2 | Edit Bolt 1's Length with a repeat on screen: count frames between Bolt 1 repainting and the three repeats repainting (`requestAnimationFrame` stamps) |
| `data-010` #2 | A 200-record scene: time a mutation from input to paint, and report the stamping share (expected ~0.05 ms) |
| `ui-062` #4 | Pan mode, touch drag starting on a selected body's gizmo ring: does it rotate the body instead of panning? File a finding if it reproduces |
| `ui-051` #3 | WebKit at 820×1180 with a keyboard: select a body with the Inspector sheet collapsed, press Delete, then Backspace: each removes the selection, and Backspace inside a Position field edits only the digit |
| `core-031` #2 | Headed Google Chrome (`channel: 'chrome'`, this Mac's GPU): select a mid-log History row, press **Back to latest** and **Roll forward**, and record per-frame canvas samples. Is there a blank frame a person could see (≥ 1 frame at 60 Hz)? |

## Affected files

- `TODO/VERIFY.md` (each row's Status and Notes)

## Proposed fix

1. Serve the production build with the `run-warpcad` skill. `core-029` #3 needs the service worker, so
   it must be the built preview, not dev.
2. Drive each row, recording raw numbers (frame counts, milliseconds, event traces) in Notes. Leave the
   "on a real device" wording of related rows alone; this task covers only what emulation can settle.
3. A defect becomes its own finding, with its id in Notes. If `ui-084` #2 and #3 pass, consider whether
   the long-press and the pulse deserve a real-timer `*.e2e.js` assertion, and file that as a graduate
   TODO rather than writing it here.

## Effort

M.

## Testing

- No code change expected; `npm run spdx` passes.
- Engines: Chromium (touch emulation, offline, headed Chrome); WebKit for `ui-051` #3.
- Acceptance scenarios: 7 (touch-only navigation) is adjacent to `ui-062` #4; re-drive its pan steps if that row reproduces.
- Closed-finding regression: none.

## Interaction model

Not UI-touching (verification only).

## Documentation

- **Page**: n/a.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
