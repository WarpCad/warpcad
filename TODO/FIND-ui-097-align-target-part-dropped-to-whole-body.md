---
title: Align measured the whole Feather after the owner ticked its Battery-Connector part; a second tick silently drops the part and nothing on screen says the target is now whole
category: ui
kind: finding
priority: high
model: sonnet
milestone: none — Findings table, filed 2026-11-06 from the owner's report
depends: []
status: open
---

## Problem

**The report.** In `~/Documents/alilgn-issue.ndjson` (file name misspelled on disk) the owner
selected **Battery-Connector clearance cutter** and the **Battery-Connector** part of
**esp8266 feather** in the Inspector's **Objects list**, pressed **Align** and tapped **outside +** on
Y. The cutter should touch the connector, 0 mm gap. It touches the feather's overall +Y edge, 0.256
mm past the connector. This is the same symptom as `ui-063` (*"I selected the RPI hole … it aligns on
the center of the whole pi"*), which was fixed on 2026-10-13. The owner reasonably reads it as that
bug come back.

**What the file shows.** The last record is:

```json
{"id":"snap-iehsuz-959","op":"group.snap","target":"cuboid-iehsuz-947-rename-iehsuz-956",
 "operands":["esp8266-feather-1-v5jezw-917-rename-v5jezw-944"],
 "params":{"axes":"y","orientation":"outside-","deltaMm":0}}
```

The operand is a bare id, the whole feather. The record before it (`snap-iehsuz-958`, the same tap on
the other side) is bare too. A part-addressed operand would read
`{"id":"esp8266-feather-1-v5jezw-917-rename-v5jezw-944","pieces":"Battery-Connector"}`. Measured from
the file's embedded meshes, placed where the document puts the feather:

| | min Y (mm) | max Y (mm) |
|---|---|---|
| feather, whole (the hidden `board` part sets both edges) | −8.517 | **14.343** |
| `Battery-Connector` part | 5.487 | **14.087** |

`outside-` (the popover's **outside +**) puts the cutter's −Y face on the reference's +Y face
(`SNAP_SIDES['outside-'] = [1, 0]`, `src/core/kernel/group.js:183`): 14.343 whole, 14.087 for the
connector. The difference is the gap.

**What was reproduced (2026-11-06, built app at `934656a`, Chromium, 1440×900, the owner's file
loaded through File ▸ Open, scratch script driving the Objects list):**

| Gesture in the Objects list | Popover top line | Result of Y **outside +** |
|---|---|---|
| Tap the cutter row, tick **Battery-Connector**'s check | `… to esp8266 feather › Battery-Connector` | cutter min Y 14.34 → **14.09**, gap 0 ✅ |
| Tick the cutter's check, tick **Battery-Connector**'s check | `… › Battery-Connector` | same ✅ |
| Tap the cutter row, tick **Battery-Connector**, **tick it again** | `… to esp8266 feather` | whole feather: **exactly the owner's record** ❌ |

So the part addressing `ui-063` built still works on a fresh load. The one route found that produces
the owner's record is a second tap, which undoes the address with almost no visible change. See "The
owner's gesture" below for what that does and doesn't explain. What makes this easy to hit:

1. **A second tick on an addressed part's check doesn't deselect anything. It steps the body up to
   whole and keeps it selected.** `selectPart(bodyId, partName, additive)` in
   `src/stores/selection.js` (*"Additive on the part that is already addressed steps back up to the
   whole body and leaves the body selected, mirroring how a check toggles"*, `ui-042`). The part's
   check empties, but the feather's body row keeps its **2** badge and its highlight, so the list
   still reads "feather is operand 2". The only visible change is the small
   `› Battery-Connector` line under the body name disappearing. Before and after:
   - after one tick: body row `2 esp8266 feather › Battery-Connector`, part check `2`;
   - after two ticks: body row `2 esp8266 feather`, part check empty, and the part row still shows
     the purple focus bar, so it still looks like the active row.

   A check that reads *off* while its body is still operand 2 means "measured whole", which no
   user would guess. A double tap, a tap that seemed not to register, or a tap to confirm is enough.
2. **The Align popover doesn't call out a whole-body target.** The top line reads *Aligning
   Battery-Connector clearance cutter to esp8266 feather*. A missing `›` is the only sign, and nothing
   says the feather will be measured **whole**, hidden `board` included. Exactly the "wrong
   geometry, no error" class `ui-063` was about.
3. **The popover can't fix it in place.** **Measure from** (`AlignPopover.vue:112-145`, `ui-050`)
   picks a part of the **moving** body. Nothing picks a part of the **target**, so having noticed,
   the user must close the popover and go back to the list.

The name doesn't help either: the cutter is called *Battery-Connector clearance cutter*. The Objects
list truncates it to `Battery-Connec…`, directly under the feather's `Battery-Connector` part row, so
the two rows the owner had to pick read almost the same.

**The owner's gesture, and what is still unexplained.** Asked on 2026-11-06, the owner said:
*"I clicked on the battery-connector checkbox in the inspector."* That is the part-row check above
(`onPartCheck`; the Inspector's own Parts section, `inspector-parts-list`, calls the same handler).
A **single** tick on it was re-driven on the owner's file and works on every combination tried:

| Engine | Input | Viewport | Popover | Cutter min Y after **outside +** |
|---|---|---|---|---|
| Chromium | mouse | 1440×900 | `› Battery-Connector` | 14.09 ✅ |
| Chromium | touch | 820×1180 | `› Battery-Connector` | 14.09 ✅ |
| WebKit | mouse | 1440×900 | `› Battery-Connector` | 14.09 ✅ |
| WebKit | touch | 820×1180 | `› Battery-Connector` | 14.09 ✅ |
| Firefox | mouse | 1440×900 | `› Battery-Connector` | 14.09 ✅ |

Both of the owner's snaps (`958`, then `959`) are bare, so the address was already gone at the
**first** tap. Ruled out by reading: Undo (restores `addressesBefore`), Redo (selects only the
moved body), an AI or MCP `select` (sets the turn's own selection, never the user's), and an
outside change (`afterOutsideChange` passes the addresses through). Not yet ruled out:

- **a second tick**: a double click, or a tap that seemed not to register (reproduced above);
- **the owner's real session state**: the cutters were created moments earlier by an agent in
  **Chrome over WebMCP** (owner, 2026-11-06), which writes through the open tab (hence the shared
  `iehsuz` id prefix), and the cutters were renamed just before the snaps (`955`, `956`). Read and
  ruled out for that path: `tabEndpoint.js`'s `selectionFor` only *reads* the user's ids (the
  agent's `select` sets its own `picked`), and `runOnTab` (`useTabEndpoint.js`) only calls
  `documentStore.refresh()`, whose step-up touches a **single** drilled body whose part is gone,
  never a two-body selection. A fresh load can't reproduce whatever else that session did.
- **the owner's device**: a Mac, desktop Chrome (owner, 2026-11-06), which is the combination
  already passing in the table above.

So the **RED step starts with the owner in Chrome on the Mac**: load
`~/Documents/alilgn-issue.ndjson`, undo the two snaps, select the cutter, tick **Battery-Connector**
once, open Align, and read the top line. If it ends in `› Battery-Connector`, the fault needs the
original session's history: re-drive it with a WebMCP agent (scenario 27's setup) creating and
renaming two cubes while the owner ticks and aligns, and watch the selection store's
`addresses` across each landing. If it doesn't, capture the exact steps (a screen recording)
before building. Parts 1–3 below are worth building either way:
Part 1 closes the second-tick trap, Part 2 would have shown the owner the problem before the tap, and
Part 3 lets them fix it without leaving the popover. They are not proven to be the owner's cause.
The other route to the same record, Shift-clicking in the 3D view (always the whole body: `pickAt`,
`src/components/viewport/Viewport.vue:3471-3474`), is covered by Part 3.

**Workaround today:** select the cutter, tick the feather's **Battery-Connector** check **once**, and
check that the Align popover's top line ends in `› Battery-Connector` before tapping. Undo the bad
snaps first.

**Not this finding:** the AI turn placed the cutters with hard-coded `transform.translate` records
instead of snapping them to the parts they clear. That's the agent's placement behaviour; file it
separately if it keeps happening. Also separate: "whole" here includes the `board` part the owner
had hidden. Whether a hidden part should count toward a whole-body measurement is `ui-093`'s area,
so raise it there if wanted.

## Affected files

- `src/stores/selection.js` (`selectPart`, additive branch): second tick steps up instead of
  deselecting.
- `src/stores/objectList.js:330-370` (`choosePart`) and `src/components/inspector/ObjectList.vue`
  (`onPartCheck`, part check `aria-checked`, body-row badge): what the list shows for each state.
- `src/components/viewport/AlignPopover.vue:83-145, 179-195, 264`: operand line, Measure from,
  `alignToSecond`.
- `src/stores/alignReference.js`: per-body remembered Measure from part.
- `docs/selection-and-inspector.md` (Objects list) and `docs/snap-align.md` ("A second example:
  positioning against one named part", "You can address a part on both sides").

## Proposed fix

**Part 1: an addressed part's check, ticked again, takes the body out of the selection.** In
`selectPart`'s additive branch, ticking the part that is already the body's address calls
`deselect(bodyId)` (drops the body and its address) instead of `setAddress(bodyId, null)`. A part
check then means one thing, *this body, at this part, is an operand*, and *off* means *not an
operand*. To use the body whole, tick the **body row's** check, which already does that. Ticking a
**sibling** part still re-addresses, as now. This reverses `ui-042`'s documented "steps back up"
rule, so update its wording in `selection.js`, `objectList.js` and the docs together. The
Inspector's breadcrumb **group** segment (`stepUp`) stays as the way to step up a single drilled
body.

**Part 2: name "whole" on the Align popover's operand line.** When an operand that has named parts
is measured whole, the line says so: *Aligning **Battery-Connector clearance cutter** to **esp8266
feather** (whole object, 4 parts)*. Addressed, it stays `esp8266 feather › Battery-Connector`. Put
the suffix in its own `span` so `align-operand-target`'s text-matching specs keep passing, or
update them.

**Part 3: Measure to for the target, mirroring Measure from.** With **Target** = *Second selected*
and the second body a composite with visible parts that isn't already addressed, show **Measure to**
under **Measure from**: *Whole object* plus the target's visible part names. A part writes
`operands: [{ id: terminalId, pieces: part }]`; *Whole object* writes the bare id. Hidden when the
selection already addresses the target (the `›` is the answer), as Measure from is. Remember it per
body in `alignReference.js` **in its own map**, so a body that was a target doesn't carry a part
into its next turn as the moving body. Forget a part the body no longer has, using Measure from's
`watch`. This is the fix for every route in "Not confirmed" above, including the viewport
Shift-click, and it works on touch.

**Out of scope, ask the owner before building:** making a viewport **Shift-click on a part of an
already-selected group** address that part. It reverses `ui-016`/`ui-040`'s whole-body rule for
additive clicks and has no touch equivalent; Part 3 covers the case without it.

## Interaction model

- **Precondition:** two bodies selected for Align; the second has named parts.
- **Trigger:** Part 1, the part-row check in the Inspector's **Objects list** (tablet rail and phone
  sheet render the same rows). Parts 2–3, the **Align** button in the Operations toolbar; **Measure
  to** sits directly under **Measure from**.
- **Feedback:** Part 1, a second tick on the addressed part clears its check **and** the body row's
  number badge and highlight, and the count line drops to `1 selected`. Part 2, the popover's top line
  reads `(whole object, N parts)` or `› part`. Part 3, choosing a part changes the top line to
  `esp8266 feather › Battery-Connector` at once; a position tap then moves the moving body against
  that part.
- **Placement:** n/a (moves an existing body).
- **Selection response:** Part 1 changes the selection as described; Measure to never does.
- **Selection count:** Align with a second-selected target needs exactly 2; with 1, Target is World
  origin and Measure to is not shown.
- **Small-screen behavior:** at 390 px the popover is the existing bottom sheet; Measure to is one
  more full-width native `<select>`, like Measure from, with tap target ≥ 44 px. The Objects list
  rows are unchanged in layout; nothing depends on hover.

## Documentation

- **Pages:** `docs/selection-and-inspector.md`, the Objects list section: a part's check ticked
  again removes the body; tick the body row to use it whole. `docs/snap-align.md`: a short
  "Measuring to one part of the target" subsection presenting Measure to, a line that the top line
  says *(whole object)* when no part is picked, and "You can address a part on both sides"
  naming Measure from and Measure to.
- **Example:**
  1. Place a **Raspberry Pi 5** and drag a **Cube** in beside it.
  2. Click the cube, then Shift-click the Pi. Press **Align**. The top line reads *Aligning Cube 1
     to Raspberry Pi 1 (whole object, N parts)*.
  3. Set **Measure to** to `ethernet`. The top line now reads `Raspberry Pi 1 › ethernet`.
  4. On the **Y** row tap **outside +**. The cube's −Y face now touches the Ethernet jack's +Y face,
     0 mm apart, not the board's edge.
  5. Alternative: press **Escape**, open the Objects list, tick the Pi's `ethernet` check once. Tick
     it again and the Pi leaves the selection (the count reads `1 selected`).
- **Media:** one still, `docs/screenshots/snap-align-measure-to.png` (popover with Measure to set
  and the `›` line), from a new shot in its own `e2e/docs/snap-align-measure-to.docs.js`, so the
  existing snap-align movies are not re-recorded. Never `npm run docs:gifs` (it rewrites every GIF).

## Effort

M (a few hours)

## Testing

- **RED first, owner's file, owner's numbers:** an app-level `e2e/align-target-part.e2e.js`
  (navigates to `/`) that opens a trimmed copy of the owner's project as a fixture (feather
  `user.*` parts embedded in the state line, the two cutters), taps the cutter row, ticks
  `Battery-Connector` **twice**, and asserts the feather is no longer selected (fails today: it stays
  selected, whole). Then: tick once, Align, Y **outside +**, cutter min Y =
  connector max Y (14.087) within 0.01 mm, not 14.343. Then the Measure to route: cutter row, feather
  **body** check, Align, Measure to `Battery-Connector`, same assertion. Runs at **phone, tablet and
  laptop** (popover and list layout) with a snapshot at each, on **Chromium, Firefox and WebKit**
  (viewport picking, kernel results, touch checks).
- **Unit:** `src/stores/selection.spec.js`: additive `selectPart` on the addressed part deselects
  the body and drops its address; on a sibling it re-addresses; on an unselected body it adds at the
  end. `src/components/viewport/AlignPopover.spec.js`: Measure to shown only for a composite,
  unaddressed target; writes `{ id, pieces }` / bare id; hidden when addressed; forgets a lost part;
  separate storage from Measure from; operand line `(whole object, N parts)` vs `›`.
- **Kernel guard (already passing, keep it so):** `group.snap` `outside-` on `y` against
  `{ id, pieces }` vs the bare id gives the two different edges above, `toBeCloseTo(…, 6)`,
  including a part sharing the group's +Y edge (no spurious move).
- **Acceptance scenarios to re-drive:** 3 (snap-placement of a kit assembly), 6 (group vs. sub-part
  selection), 31 (import a 3MF and use one part as a reference, plus the owner's esp8266 feather
  case: cutter first, Battery-Connector, gap 0).
- **Closed findings whose repro steps get re-run:** `ui-063` (the owner's Pi `hole1` against the
  screen's `piMountingPost1`, then `mb` against the post top, both sides addressed, from the Objects
  list; Part 1 must not break re-addressing `hole1` → `mb` by ticking the sibling), `ui-042`
  (Objects list part selection; its "steps back up" wording is the one Part 1 reverses), `ui-040`
  (the drill / Shift-click-out / back-in route; parked addresses still return), `ui-050` (Measure
  from still works and stays separate).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
