---
title: Gather the owner decisions parked in VERIFY.md, draft a recommendation for each, and ask in batches
category: testing
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-07 from the VERIFY.md drivable-row triage (third pass)
depends: []
status: open
---

## Problem

`TODO/VERIFY.md` is for checking that something works. About 80 of its open rows are not checks at all.
They are decisions: "Decide whether…", "Product call:", "UNCONFIRMED default", "Is that acceptable, or
should…". Scattered among device checks, the owner never sees them as a list. They have no recommendation
attached, and they stay `Open` for weeks (`sketch-001`'s seven defaults date from 2026-10-02). An agent can
gather the evidence and draft a recommendation for each, so the owner's part is one answer per row.

Rows (entry and row number in `TODO/VERIFY.md`; abridged, the full text is in VERIFY.md):

| Row | Decision |
|---|---|
| `ai-031 #3` | Decide whether the timeline (History) row should also show the prompt, as the finding's Feedback line says; if so, file it. |
| `io-017 #3` | At 390 px there is no persistent Published indicator (Share is under File ▾, the chip is hidden there). Decide whether a phone needs one, for example a dot on File ▾ |
| `io-017 #4` | The "Published. Link copied" toast covers the sheet's Share title for about 4 s at tablet and laptop width; judge whether it bothers |
| `io-021 #1` | At 1440 px, the "Saved to gist: <name>" toast covers part of the Operations toolbar (Chamfer, Enlarge) for a few seconds after Save as gist. Is that acceptable, or should it sit elsewhere? |
| `ui-081 #1` | Dragging a row from the section pop-out's text can highlight that text (seen in the Raspberry Pi pop-out, all three engines, during a mouse drag). Decide whether a row drag should suppress text selection. |
| `ui-084 #4` | At about 641-700 px the compact pad overlaps the scale readout (also true at 760 before this task). Decide whether to file it as its own finding, or leave it to `ui-081` |
| `ui-084 #6` | Dropping a model file onto the rail does nothing (the labelled column accepts it); the rail's ⋯ menu is the way in. Confirm that is acceptable |
| `ui-071 #2` | At laptop width the connected column still fills its grid cell with empty space under Undo AI turn. Is that acceptable, or should the column narrow while connected? |
| `ui-069 #1` | A step the Assistant, Claude Code or a merge added to the first part disables Apply with *"… has a step you didn't make … Cancel and make the part by hand"*, because `core-061` copies the source's whole lineage. The spec said… |
| `ui-069 #4` | ⟳ Repeat is enabled on a Group's sub-part (it has other parts), seeding on a member that has no name family. Harmless, but should it need a numbered family like `hole1`? |
| `ui-068 #3` | Does the always-on memory surprise anyone (the spec's follow-up: a Settings "remember" toggle only if it does)? |
| `core-060 #1` | The Library row's Type dropdown clips its longest label ("Wood screw, flat head" reads "Wood screw, fla" in the 197 px Library column). Decide whether to widen the column, shorten the labels or let it wrap |
| `core-060 #3` | The History row Edit form still shows a legacy `hardware.bolt`'s old Spec form (`m10 hex`), not Type + Size; submitting writes the new shape. Decide whether that is acceptable or worth a task |
| `core-060 #4` | The BOM line for a bolt whose Size or Fit is bound to a variable drops the size (`Bolt / screw hex × 20 mm`), because the bound value is not a string. Same as before core-060; decide whether the BOM should show the resolved value |
| `ui-067 #1` | On a real iPad, the Split sheet covers the orientation cube (right-hand panel at 820 px), so the face can only be turned square-on before opening Split or by dragging the view; judge whether a "face the cut" button in the… |
| `ui-067 #2` | The offset handle (44 px) sits at the centre of the cut face; on a small face it covers much of it until you zoom in. Judge whether the handle should hide, or shrink, while Place connectors is on. |
| `ui-067 #4` | Markers are SVG only: no keyboard path to move or remove one yet. Judge whether that is acceptable for v1. |
| `io-010 #4` | The flagged row in a move-versus-fillet conflict is chosen by replica ids when both clocks tie, so it can be either one on different runs. Is a banner naming whichever step lost clear enough, or should the app prefer the local… |
| `ai-012 #4` | Undo AI turn looks greyed for ~1.5 s after a call while the `Claude Code working` chip lingers; feels right or just laggy? |
| `ui-062 #1` | On a real phone, the merge strip pushing the workspace down 49-70 px when it appears and again when it goes: is the layout jump acceptable, or should it overlay? |
| `ui-062 #2` | At laptop height 900 the History selected-row action bar (Edit / Suppress / Move up…) is cramped at the bottom of the panel; on a phone sheet "Roll back to here" sits under the peek bars. Judge whether a conflicted row's fix… |
| `ui-062 #3` | The strip never times out and stays until dismissed. Does a clean-merge toast that lingers feel wrong? |
| `data-011 #2` | Judge the size: a project you actually work on, saved as version 2 — is the `merge` section (34-43% of a small test file) still a reasonable share of *your* file? That decides whether `data-012`'s tighter encoding is worth… |
| `ui-059 #5` | With an empty scene at phone width there is no sheet tab, so + is unreachable until something is placed. Acceptable, or should the tab stay? |
| `ui-059 #6` | Type a value in a variable's number box and, without pressing Enter, tap Delete from its menu: the typed value commits on blur first. Is committing surprising? |
| `ai-011 #4` | Product call: the browser-driven runner for scenario 18 (an image needs a canvas, `capture_view` a GPU) is not built. Worth building, or is the live scenario enough? |
| `ai-011 #5` | Product call: `askedOrAssumed` is a crude text check (a question mark, or the word "assume"). Is it good enough for the ambiguous and under-specified cases, or does it need a stricter test? |
| `ai-010 #4` | Product call: transcripts are hand-written, not recorded. Is it worth adding a recorder (save a live run as a transcript) once a live run exists? |
| `ai-009 #2` | Product call: hosted references (`github:owner/repo/path`, read-only, writes with `WARPCAD_GITHUB_TOKEN`) are deferred. Build them as a follow-up? |
| `ai-009 #4` | Product call: limits are per tool call over MCP, not per user turn. Acceptable, or add a session-level cap? |
| `ai-009 #5` | Product call: the optional `request` field on write tools is how intent travels over MCP. Right design? |
| `ai-008 #3` | Product call: the overlay draws the model at 0.55 opacity with the grid hidden. Is that the right look for judging a match? |
| `ai-008 #4` | Product call: a cancelled turn keeps the scale it set for the rest of the session (the project itself is untouched). Acceptable, or should a cancel forget it? |
| `ai-008 #5` | Product call: if you send a new message while a Save proposal is pinned, the proposal stays until Confirm or Not now. Should a new message dismiss it? |
| `io-007 #4` | The cut plane is the body's cross-section at the cut, so on a long thin bar it is a small slot behind the gizmo (docs `split-sheet.png`). Decide whether it needs a larger or brighter plane. |
| `sketch-008 #2` | On a real laptop (900 px tall) the Slices card is now taller, so Add image… and Set scale sit below its fold and need a scroll inside the card. Decide whether Offset X/Y and Twist should sit on one compact row |
| `ai-004 #4` | Product call: the Assistant button sits in the header at every width and the saved-key dot is a hollow ring until a test this visit. Is "saved, not yet checked" clear enough, or should the app test once on open? |
| `core-052 #2` | Is the flat 45-entry Spec list usable on a phone, or does it want `<optgroup>`s? |
| `sketch-004 #3` | Phone, after Finish: the Sketch toolbar's two rows come back over the top of the canvas (to y 223 at 390 × 844), and the traced Solid's top points can sit under them, next to Cancel. In the drive a finger aimed at a top point… |
| `sketch-004 #4` | Phone, Inspector sheet open while Auto-trace or Set scale is armed: the Slices sheet steps aside (77 % reachable canvas), but an Inspector sheet that was already expanded stays up and cuts the reachable canvas to 56 %, under… |
| `sketch-003 #2` | UNCONFIRMED default: on a phone and tablet, the Slices sheet disappears completely while Set scale is armed (the spec said "collapses to its header"; the header alone measured 67 % reachable canvas against the 69 % floor, 77 %… |
| `sketch-003 #3` | UNCONFIRMED default: the photo is its own row in History (*Reference image 1400 × 1000 px*), cannot be edited there, and suppressing it hides the photo (its slice says *switched off in History*). Is a separate row acceptable,… |
| `sketch-003 #4` | Pre-existing, found by the drive: at laptop size, once a Line chain is live the Sketch toolbar grows a Finish / Undo-point row that covers the top ~50 px of the canvas, so a photo's top edge (or anything drawn there) cannot be… |
| `sketch-007 #1` | Is 12 px the right pull? At the editor's opening zoom that is ~5 mm. Draw the docs' tube on a real phone without Shift (an r20 circle, then an r15 one from the same centre): the second circle's rim jumps onto the first… |
| `sketch-006 #3` | Esc-twice to cancel a line (a second Esc within 0.9 s of the one that finished it) has no on-screen cue. Decide whether it needs a toast ("Line discarded") or whether Undo point is enough |
| `docs-015 #1` | The header's Undo / Redo / History cluster is right-aligned, so it shifts about 27 px left when the save chip changes from `Saving…` to `Saved · hh:mm` (about 1 s after every edit). Clicking Undo during that second can land on… |
| `docs-015 #2` | Scenario 12 step 12 cannot be driven as written: Fillet Top (+Z) 4 on a cube that already has a 5 mm top chamfer is refused in the Fillet popover with an engineering message (`modify.filletRim: the solid is not prismatic over… |
| `docs-015 #3` | The History dock is a fixed ~220 px at laptop width, so a five-step model needs scrolling and an open Edit form is cramped. Judge whether it should be taller or resizable. |
| `docs-013 #1` | Enlarge and Fit do not carry snapped parts with them: with a lug snapped to a plate's top, Enlarge Z +16 (and Fit Z 24) moved the plate's top to 16 and left the lug at Z 8, buried in the plate; typing the same size in the… |
| `docs-012 #1` | Group drops a body's own colour: two cubes recoloured red and blue lose both colours when grouped (`data-body-color` and `data-body-part-colors` empty on the group, rendered default blue), while a composite's recipe colours… |
| `sketch-002 #2` | Dense outline under Select: convert a ~20 mm circle at normal zoom (32 dots ~10 px apart). A press anywhere near the line grabs the nearest dot, so a near-miss *inside* the ring pulled a neighbouring point inward and briefly… |
| `sketch-002 #3` | Phone 390 px: with a point picked the status line wraps to two lines (*… 3 points · point 1 selected*), the toolbar is 178 px tall, and reachable canvas still measured exactly 69 % (the ui-020 #3 floor, no slack). Decide… |
| `sketch-001 #1` | UNCONFIRMED default: a Sketch row sits in Primitives after Tube, and its drop opens the editor (nothing in the document until Done; Cancel leaves no body). |
| `sketch-001 #2` | UNCONFIRMED default: double-click / double-tap a sketch body as an Edit sketch shortcut — not built; only the Inspector's Edit sketch exists. Wanted? |
| `sketch-001 #3` | UNCONFIRMED default: Loft v1 needs exactly one Solid outline and no Holes per slice (cut holes afterwards with Subtract). |
| `sketch-001 #4` | UNCONFIRMED default (implementer's): while editing on a narrow viewport the nav chrome folds to ✥ even with no sheet open (extends ui-046; it is what keeps the resting editor's reachable canvas ≥ 69 %, 67 % → 76 % at 390 px). |
| `sketch-001 #5` | UNCONFIRMED interpretation: with the Slices/Extrude sheet open the phone's whole-canvas reachability is 47-57 % (tablet 64-74 %), below the task's literal ≥ 69 %; the drawing area round the origin stays 100 % reachable and… |
| `sketch-001 #6` | UNCONFIRMED defaults (implementer's): Polygon starts at 6 sides; a new slice is placed 50 mm above the highest; a new sketch starts as Linear 10 mm; Revolve 360° / 32 segments; Helical pitch 10 mm × 2 turns; Outline wall 2 mm… |
| `sketch-001 #7` | UNCONFIRMED (implementer's): Undo/Redo and Delete are off while the editor is open (the draft isn't in the document yet), and old `sketch.line` records are dropped on load with a chip warning rather than migrated (the spec's… |
| `ui-039 #2` | Blank plane position on a symmetric shape adds an invisible copy sitting on the original — is the popover hint enough, or should it warn on commit? |
| `ui-052 #3` | At laptop width, after Leave broken, the Pi's warning banner sits at the top of the Inspector's detail view, and it is scrolled out of sight if you were down at Parameters when you changed the Model. Does a person notice the… |
| `core-033 #1` | Fix (or explicitly decide to keep) `touchDisplay7inch`'s `NO_GO_POWER_MM.sizeMm` z-dimension mismatch (1 mm vs V1's 7 mm) — ideally alongside whichever option `render-005` picks, since the two are related |
| `ui-042 #2` | Addressing a part on the body that ends up as Subtract's *target* (the wrong-order case: e.g. drilling a small part first, then adding a much larger enclosing body second) can make the kernel return a zero-volume result with… |
| `data-003 #3` | `e2e/snap-align-operation.e2e.js`'s two fixture-sanity guards were lowered `> 5` → `> 4` because this task's taller phone header shifts the phone camera's projection (that fixture's X separation went 5.61 mm → 4.69 mm). The… |
| `core-018 #3` | Is the `hatStandoff`'s peg-through-pad the intended solid? V1 unions a 2.8mm peg straddling z=0 with a 6.2mm pad, so the peg protrudes 1.5mm *both* above and below the pad rather than standing on it. That is faithfully ported… |
| `core-017 #1` | `ui-027` says "committing a *second* Fillet/Chamfer against a *different* face of the same, already-rounded body must work identically — nothing about this control is one shot per body." It is not so for a perpendicular face:… |
| `core-017 #2` | `miniPiTFT`'s `display-clearance` is the catalogue's first outward-flared volume (V1's `.chamfer(-5, 'z+')`) — a frustum 10mm wider at the top than the display it protects. It is hidden geometry, so nothing renders it and no… |
| `core-017 #3` | `fillet.js`'s cross-section is read through `project`, whose `unionGeom2` round-trip inflates the outline by a shape-dependent ~6e-6 to 6e-5 mm. Harmless and invisible on an inward rim (it lands inside the remainder), and the… |
| `core-016 #2` | `raspberrypi.touchScreen2`'s hidden `noGoPower` marker is frozen at the offset a stock B+ at the stock attachment datum produces (zero divergence from V1 there, asserted). Judgment call for whoever designs a real enclosure:… |
| `core-015 #2` | Confirm `DEFAULT_MODEL = 'v3'` is the right default. This is a port decision with no V1 answer to check against — V1 ships five separate factories and no shared entry point, so nothing was carried over here. `v3` was chosen as… |
| `core-015 #3` | Confirm which way `flipTripodMount` should default for the HQ camera. V1's `HQCameraModule(flipTripodMount = false)` gives the name but not the intent; measured here, `true` raises the tripod post in z relative to the mount… |
| `core-014 #2` | Decide whether the board should render drilled. V1 assigns `group.holes`, so its combined board has the four mounting holes cut through it; this port carries them as hidden `hole1`-`hole4` parts only, because no `OpRecord`… |
| `core-020 #1` | Judge, by hand on real hardware, whether the snap should refuse a *centre-on-centre* alignment when both solids are already within each other's bounds — or whether an overlapping drop should snap to a face rather than a… |
| `core-020 #2` | Related and cheap to check at the same time: whether an empty boolean result should say so out loud (a toast, or a refusal) rather than silently leaving a `0 × 0 × 0` body in the scene list. Two coincident operands are the… |
| `ui-014 #1` | Decide whether this is worth its own finding (a tolerance-snap on operand coordinates, a post-boolean sliver cleanup, or measuring the result some way other than its raw bounding box) or is acceptable as-is. Judge it by… |
| `ui-014 #1` | Look at it and decide: hide the header when a body has no params, or say something in the empty space ("this shape was built from others"). Visible in the drive's `Subtract 1` screenshot. |
| `core-063 #1` | Decision for the owner: the spec's Problem says "let Apply copy it", its Proposed fix and Testing say the step is *left out of every copy*. The second shipped. Is "Bolt 1 keeps the Assistant's step, the copies do not" what you… |
| `core-064 #1` | Decision for the owner: should the HAT's, the Camera Module's and the touch screens' mounting holes also keep their part when used to Subtract? Today only the Pi does; those still use their part up, as does the Ethernet jack,… |
| `core-064 #3` | Decision for the owner: Repeat now refuses a source whose steps include a Subtract (from the seed's first mention onward), with *"... a repeat would copy the whole of <body> once per target. Subtract the other parts one at a… |
| `ai-023 #3` | At 390x844 with an API key saved, find the way to Live MCP access. The panel entry is laptop-only now (it pushed Send out of the half sheet), so a keyed phone user has only the chip once access is on. Is that acceptable, or… |
| `io-016 #6` | Phone and tablet: the Shared view's nav pad and view box are the editor's compact 28-38 px controls, not 44 px (`--tap-compact`, unchanged by this task). Is that acceptable for someone using it for the first time with a thumb,… |
| `ui-061 #3` | First install on a phone connection: the extra ~15 MB precache is acceptable (or flip `HELP_PRECACHE_GLOBS` in `scripts/vite-plugin-help.mjs`) |

## Affected files

- `TODO/VERIFY.md` (each row: `OK` with the owner's answer and date, or `Issue` with the follow-up id)
- New `TODO/FIND-…` files for every answer that asks for a change
- `TODO/ROADMAP.md` (rank the new follow-ups)

## Proposed fix

1. For each row, collect the evidence: current behaviour (a quick drive or screenshot), the spec and task
   file it came from (`TODO/done/<id>`), and any measurement already in Notes. Then write a
   recommendation in one sentence with its reason.
2. Group the rows by area (sketch editor, Repeat, gist and share, AI and MCP, hardware and Pi recipes,
   layout and toasts, merge). Ask the owner per group through `AskUserQuestion`, following
   `~/.claude/CLAUDE.md`. More than four questions: print the group's list with recommendations, then ask
   one prompt with **Ready to answer**, **Accept all recommendations**, **Explain more** and **Pause**.
3. Record each answer in the row's Notes with the date, and set Status `OK` (keep as is) or `Issue` (a
   change wanted, follow-up filed). `core-017` #3 records a fact rather than a decision: propose moving it
   to `TROUBLESHOOTING.md` via `/troubleshoot`, and mark it `N/A`.
4. `ai-023` #3 and `ui-084` #4 may already be answered by later work (`ui-075` and `ui-078` added header
   entries; `ui-081` touched the rail). Check before asking.

## Effort

M (gathering) plus the owner's answering time.

## Testing

- `npm run spdx` passes; no code change in this task (follow-ups carry their own Testing).
- Engines: Chromium for the evidence screenshots.
- Acceptance scenarios: none re-driven.
- Closed-finding regression: none.

## Interaction model

Not UI-touching.

## Documentation

- **Page**: n/a (follow-ups name their own pages).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
