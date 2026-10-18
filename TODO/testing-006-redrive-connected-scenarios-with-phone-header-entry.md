---
title: Hand-drive scenarios 24 and 25 and the ui-071 repro against the phone header's Live MCP entry
category: testing
kind: feature
priority: medium
model: sonnet
depends: [ui-075]
status: open
---

## Goal

`TODO/ui-075`'s Testing section requires acceptance scenarios 24 (connected half) and 25
(connected Assistant) to be re-driven by hand on laptop and phone Chromium, plus the original
repro of the closed finding `ui-071` (hide Assistant chrome when an MCP agent is connected). Its
automated specs pass; this is the unscripted pass `CLAUDE.md`'s Verification section asks for,
and it has not been done. Done means each result is recorded PASS or FAIL, with the **Last run**
lines in `TODO/ACCEPTANCE.md` updated.

## Interaction model

n/a. Verification only.

## Documentation

n/a. No user-visible change.

## Affected files

- `TODO/ACCEPTANCE.md` (scenarios 24 and 25, **Last run** lines)
- `TODO/done/ui-071-hide-assistant-chrome-when-mcp-agent-is-connected.md` (read for its repro)

## Proposed fix

Launch the app with the `run` skill (`npm run dev -- --host`) and drive, as a human would, not as
a fixed selector sequence:

1. Scenarios 24 and 25 as written, at 1440 and 390 px, Chromium.
2. `ui-071`'s repro steps from its done file.
3. Phone-specific things a script won't notice: with access **on**, does the header button's ring
   show? With an agent **connected**, does it go solid? Do **Undo**, **Redo**, History, File and
   Help all remain tappable, with none pushed off the row at 390 px? Is the Assistant button still
   fully on screen? (`ui-075` shrank the header gaps to 4 px to fit; check taps don't hit the
   neighbour.) Rotate to landscape and repeat the header check.
4. On a real phone over the LAN if one is to hand. Safari/WebKit is the engine that has failed
   here before (`ui-070`).

File any FAIL as its own TODO and stop; do not close `ui-075` over a failing scenario.

## Effort

S (< 1hr).

## Testing

The task is the test. Report PASS/FAIL per scenario in the commit or retirement note.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
