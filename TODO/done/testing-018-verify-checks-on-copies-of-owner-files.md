---
title: Drive the VERIFY.md checks that name the owner's own project files, against copies
category: testing
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-07 from the VERIFY.md drivable-row triage
depends: []
status: done
---

> **What shipped (2026-11-14):** the seven rows were driven on a production build (`npm run build`, `vite preview`) against copies of the
> owner's files in the session scratchpad (no original in `~/Documents` or `~/Downloads` was opened for writing, moved or deleted), and written into
> `TODO/VERIFY.md`. **OK:** `ui-097` #1 (the cutter's low-Y face goes from 14.34 to **14.09** after Align to Battery-Connector, Y outside +; the
> Undo step cannot run because Undo is disabled on a fresh open), `ui-096` #2 (390x844, Chromium and WebKit: the `Only in this project` line and
> the ⋯ note wrap with no sideways scroll, and scenario 31 steps 1 to 4 on the 3MF stay at scroll width 390), `ui-092` #1 (hover-to-painted p50
> 15.0 to 15.2 ms and p95 15.6 to 16.2 ms at 1x on all five targets, twins-heavy rows included; at 4x p50 is still 15.2 to 15.4 ms with a two-frame
> tail; `bench/results/2026-11-14-testing-018.md`, new script `bench/prompts-hover.mjs`) and `ui-092` #2 (two rows, Combine with next gives one
> row equal to `fan-duct.prompt.txt`, one Add reply…, 3 parts, Undo restores two, `fan-duct.response.txt` pasted as the reply). **N/A, with the drive
> recorded:** `data-010` #1 and `data-008` #1, because no owner file predates those tasks (all nine `.ndjson` files are version 2 with a `merge`
> section and replica-scoped ids; the behaviour was driven on the oldest files in Chromium and WebKit and a Download copy keeps every old record line
> byte-identical). **Left `Open` on purpose:** `data-011` #2, the measurement half is answered (`merge` is 14 to 15% of the two big projects and 18 to
> 23% of the small ones, 1.8 to 2.6% where a `parts` section dominates, and a re-save is byte-identical), and the `data-012` decision stays the
> owner's (`FIND-testing-033`). No product code changed and no defect was found, so no finding was filed.

## Problem

Several `TODO/VERIFY.md` rows were left for the owner because they name a file only the owner has. Those
files are on this Mac (`~/Documents/*.ndjson`, `~/Documents/fan-duct.*`, `~/Downloads/esp8266 feather.3mf`),
so an AI drive can load a **copy** in the built app and run the check. Only the browser-profile rows
(`ui-095` #1, `ui-096` #1) need the owner's own profile and stay in the queue.

Rows (entry and row number in `TODO/VERIFY.md`):

| Row | File (copy it first) | What to drive |
|---|---|---|
| `ui-097` #1 | `~/Documents/alilgn-issue.ndjson` | Undo the two snaps, select the cutter, tick Battery-Connector once, open Align: the top line ends `› Battery-Connector`, and after **Y outside +** the cutter sits at 14.09, not 14.34 |
| `ui-096` #2 | `~/Downloads/esp8266 feather.3mf` | Scenario 31 at 390×844 (Chromium and WebKit): the project-only line and the ⋯ note wrap with no horizontal scroll |
| `ui-092` #1 | `~/Documents/fan-duct.ndjson` | Hover-to-painted per `.claude/prompts/perf-benchmark.md`, target one 16 ms frame, including the twins-heavy case |
| `ui-092` #2 | `~/Documents/fan-duct.ndjson`, `.prompt.txt`, `.response.txt` | At laptop width: the two Prompts rows, **Combine with next**, one request matching `fan-duct.prompt.txt`, one **Add reply…**, parts still listed, **Undo** restores two; then paste `fan-duct.response.txt` as the reply |
| `data-010` #1 | any `~/Documents/*.ndjson` saved before `data-010` (check the file's version line) | Open, edit, Undo, Redo, reload: it behaves as it did, and no legacy metadata is written back |
| `data-008` #1 | the oldest `~/Documents/*.ndjson` | Add a body, Save (download), read the file: old `op-7`-style ids unchanged, only new rows carry `prefix-<replica>-<n>` |
| `data-011` #2 (measurement half) | every `~/Documents/*.ndjson` | Save each as version 2 and report the `merge` section's share of the file. The decision on `data-012` stays the owner's, so the row stays `Open` with the numbers added |

## Affected files

- `TODO/VERIFY.md` (each row's Status and Notes)
- `bench/results/` (the `ui-092` #1 benchmark result, per the perf prompt)

## Proposed fix

1. Copy every named file into the session scratchpad first. **Never open, save over or move an
   original in `~/Documents` or `~/Downloads`.** Saves go through the download path into the scratchpad.
2. Serve the production build (`run-warpcad` skill). Open each copy through **File ▾ → Open…**, the
   Library's **Import model file…**, or the hidden file input Playwright can set, whichever the row's flow
   uses.
3. Drive each row and record the measured values (positions to 0.01 mm, frame times, byte shares) in Notes.
   A wrong result becomes its own finding, and its id goes in Notes.
4. `ui-092` #1: commit the benchmark result file the perf prompt asks for.

## Effort

M.

## Testing

- No code change expected; `npm run spdx` passes.
- Engines: Chromium for all; WebKit as well for `ui-096` #2 (phone) and `data-010` #1 (persistence).
- Acceptance scenarios: 31 (Import a 3MF) at phone width; 10 (Save, reload) through `data-010` #1.
- Closed-finding regression: `ui-097`'s own reproduction is row 1.

## Interaction model

Not UI-touching (verification only).

## Documentation

- **Page**: n/a.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
