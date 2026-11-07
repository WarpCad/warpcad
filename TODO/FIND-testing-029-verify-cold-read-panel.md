---
title: Run a cold-read panel on the VERIFY.md "does a stranger understand this" rows
category: testing
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-07 from the VERIFY.md drivable-row triage (third pass)
depends: []
status: open
---

## Problem

Many `TODO/VERIFY.md` rows ask a reader question rather than a device question. Does a stranger follow
this GIF? Does this error message make sense to a first-time user? Does this glyph read as "mirror"? Is
this button label understood without the docs? They waited for a person who had never seen the feature,
and the owner is the one person who has. A fresh agent with no project context is a closer stand-in for
the stranger these rows describe. It can read a page, step through a GIF's frames, look at a screenshot,
or try a task in the running app without instructions.

Settling rule: **two independent fresh agents agree → the row's verdict stands** (`OK`, or `Issue` with a
new finding). If they disagree, set the row back to `Open`, add both answers to Notes, and leave it for
the owner. A partial row moves only its cold-read half. The real-device half stays in VERIFY.md.

Rows (entry and row number in `TODO/VERIFY.md`; abridged, the full text is in VERIFY.md):

| Row | Check |
|---|---|
| `docs-020 #1` | Watch `ai-wing-airfoil.gif` and `ai-drawing-to-group.gif` cold: does a stranger understand what the Assistant did, and is the *Scripted* badge in `ai-chat-panel.png` explained well enough by the caption in `docs/ai-partner.md`? |
| `docs-020 #2` | `timeline-relink.gif` is 8 fps at 600 px to fit the size budget: is the amber `broken` chip and the Re-link press still readable? |
| `docs-019 #1` | Watch `docs/media/tour.gif` at the size GitHub shows it in `README.md`: is each step (drop, select, Subtract, nudge, export) on screen long enough to follow, and is the hole readable at 640 px wide? |
| `docs-006 #1` | Open `docs/media/primitive-drag-cube.gif`: is the yellow cursor dot easy to follow, and is the drag pace and 1.5 s end hold comfortable? |
| `docs-014 #3` | Read `rpi-keepout.png` cold: the keep-out is a small 15 x 10 x 1 mm block by the display's power connector. Does the page make that clear, or does it read as a stray red box? |
| `docs-014 #4` | Look at `resolution-low-vs-high.png`: is the Draft facet edge visible at the size it appears on the page? |
| `docs-013 #2` | Read `resize-fit.gif` and the Fit example cold: Keep aspect ratio applies the smallest ratio to all three axes, so X 60 to 30 takes Y and Z from 40 to 20. Does the second step read as "keeps its proportions", or does it look… |
| `docs-013 #3` | `fillet-vs-chamfer.png` is orbited to about 71 degrees elevation so both rims show. Is the rounded rim on the left readable as a fillet at the size it appears on the page? |
| `docs-012 #2` | Read `snap-operation.gif` and the new "Outside +/−" wording in `docs/snap-align.md` cold: the popover's sign names the moving shape's touching side, so `Outside −` puts the lug on the plate's +X side, which reads backwards at… |
| `docs-012 #3` | `snap-subpart-operand.gif` uses Align on X and Y against the Pi's `hole1` (a Snap orientation cannot centre a 5.7 mm screw on a 3.25 mm hole). Does a viewer still read it as "the sub-part is the operand"? |
| `docs-011 #1` | Watch `docs/media/boolean-subtract-order.gif` and `boolean-subpart-operand.gif` once as a stranger: is it clear which solid is the base, and that the two orders give different results? |
| `ui-069 #6` | Docs example: the Z step is *Relation: Inside*, *Offset -5*, Z ⊏ − face. Does a first-time reader find the Rotation X = `180` step (head-up) without help? |
| `core-063 #2` | Read the line under *Not part of the repeat* cold: *From the Assistant, so it is left out of the copies* (and *From Claude Code…*, *From a merge…*, *On another body, so it is not copied*). Does it say clearly that Bolt 1 keeps… |
| `core-063 #3` | Read the one remaining refusal: *The only step that points at hole1 is from the Assistant, and it is left out of the copies, so there is nothing to repeat. Make that step yourself.* Clear, or too long on a phone? |
| `ui-027 #2` | Trigger the radius-too-large error (Fillet a face with a radius at or past the solid's own extent) and read the resulting popover message as a first-time user would, not as the person who wrote it. Does "radius 45mm must be… |
| `ui-029 #2` | The Inspector's kernel-error message reuses `ui-027`'s convention verbatim, which means it also inherits its wording problem: a rejected diameter shows `document.append: primitive.cylinder could not be applied —… |
| `ai-009 #6` | Wording: an origin this build does not write reads *via another program*. Right words? |
| `ai-008 #6` | Wording: *Image sent to Anthropic with your request, using your key. It is not sent anywhere else.* Right words? |
| `ai-012 #5` | A Claude call during a held Library drag is refused as "project changed… while this call waited", not the spec's "the user is editing; try again"; the drop is kept. Acceptable wording? |
| `ai-017 #3` | Edit the very body the Assistant was asked to change, then read the conflict banner and the flagged row: is the wording understandable? |
| `data-006 #1` | Scenario 12 step 10, as an exploring human. Roll back, move a body a later step uses, and decide whether the amber `broken` row plus Re-link to the moved step reads as clear or as clutter. Also whether the button label is… |
| `core-061 #3` | Move the Pi after the bolts exist: only the Pi moves and the bolts stay (a later step is not consumed by earlier rows). Does that read as a bug to someone who did not read the docs? `ui-069` must explain it. |
| `core-064 #2` | Feel: drill two holes with one Pi, then move the Pi. The holes already drilled stay where they were (each Subtract reads the Pi as it was at that step); only a later Subtract uses the new place. A model edit on the Pi (say Pi… |
| `ui-069 #2` | The Inspector's note on a repeat body reads *"Move Bolt / screw 1 or Raspberry Pi 1; the repeats follow them"*, but a new move of either (gizmo or typed) after the Repeat moves only that part (driven: Pi +10 mm, bolts… |
| `ui-068 #1` | The spec disagrees with itself on the Bolt / screw summary line: Done says `× 8 mm` (dropdowns already show Type and Size), e2e step 1 says `M2.5 socket × 8 mm`. `× 8 mm` shipped. Does it read right on a phone, or would the… |
| `ui-038 #2` | Is `Bolt M10 hex × 20 mm` the right wording for a shopping-list line, or should the fit or a Pi's model read differently? |
| `ai-007 #1` | Grid lines nearly vanish in a `capture_view` PNG after the 2x downscale. Does a captured view still read well enough for a person to tell what the model saw? |
| `ai-007 #2` | Per-part recipe colours inside a group (a Bolt's head and thread) are not drawn in captures, only the body colour. Judge whether the thumbnail is misleading on a composite. |
| `ai-003 #3` | Any device: in History, is the small note icon at the end of a row recognisable as "why this step exists" without its tooltip (touch has no hover)? A feel judgement. |
| `ui-027 #1` | On a real phone, glance at the Operations toolbar with a body selected (all 8 icon-only buttons visible) *before* reading any documentation. Can you guess what Fillet (◠) and Chamfer (◢) do from the glyph alone, or only from… |
| `ui-078 #2` | At 390x844, confirm File ▾ → Share… is easy to find now that Share is off the row on phones. |
| `core-050 #1` | In the `ui-059` panel, type a value past a variable's max: is the refusal clear *before* commit, and if a file arrives with such a value, is "3 parts disappeared" explained by name on screen? |
| `ui-059 #4` | Edit variable on a chip scrolls its row into view but does not highlight it. Is that discoverable enough on a phone, where the tab also switches? |
| `ui-059 #3` | Vector fields (Size X / Y / Z) at 390 px: is the row of three link buttons under the inputs clear about which axis each binds, once one component is a chip? |
| `data-008 #2` | In the Assistant, ask for a cube and a sphere then a subtract: do `describe_scene` ids in the chat/tool readout still read acceptably (`cuboid-k3f5xa-1`), or is the replica segment noisy enough to want trimming in the UI? |
| `ui-047 #1` | Show a Bolt's `tap`, then deselect it (click empty space) and select a different body. Does the still-visible translucent clearance on the deselected bolt read as confusing without any cue in the Inspector's object list that… |
| `ui-012 #1` | The dimension lines do not turn during a rotate-ring drag. They track a *translate* drag exactly, but during a rotation the preview keeps the body's axis-aligned bounding box and only settles onto the real turned bounds on… |
| `ui-089 #1` | The body row's eye in the mixed state (one part hidden) reads as "some hidden", not as shown or hidden, at laptop width |
| `core-075 stage 2 #2` | The bowtie marker glyph for a hand-placed Butterfly does not rotate to match the edge it snapped to; judge whether that reads clearly on a phone |
| `core-075 stage 3 #3` | At 390 px the Place connectors kind row is seven icon-only buttons (Post, Wedge, Screw boss, Dowel, Butterfly, Tenon, Magnet). Is each one recognisable from its glyph on a real phone, or does it need a label? |
| `ui-039 #1` | The ⇋ glyph on the Mirror button reads as "mirror" next to ⤢ ⇱ ✂, and the toolbar still fits at 390px without wrapping badly |
| `ui-086 #1` (part) | On a real iPhone and iPad (Safari), the seven-icon strips read clearly at 44 px: can you tell half − from inside − by the icon alone, and does a tap land on the button you aimed at (no gaps between them)? |
| `ui-046 #1` (part) | On a real iPhone (Safari): select a body so the Inspector opens, then without instructions find a way to orbit with the on-screen buttons. Does the ✥ toggle read as the way in? |

## Affected files

- `TODO/VERIFY.md` (each row's Status and Notes, with both agents' one-line answers)
- `docs/*.md` or a UI string, only if both agents say a wording fails (file a finding instead if the fix is bigger than a sentence)

## Proposed fix

1. Build the app and serve it with the `run-warpcad` skill. For media rows, extract GIF frames
   (`ffmpeg` or a Node GIF decoder into the scratchpad), and render the docs page at the size it appears.
2. For each row, spawn two **fresh** agents (no fork, so no shared context). Give each only what a
   stranger would have (the page, the frames, a screenshot, or the app URL and a goal such as "share this
   project"), plus the row's question. Never give them the row's expected answer, the TODO or the code.
3. Discoverability rows (`ui-078` #2, `ui-046` #1, `ui-059` #4, `ui-047` #1): the agent gets the running
   app at the row's viewport and a goal, and drives it with Playwright. Record the steps it took and
   whether it got there.
4. Apply the settling rule. For a wording `Issue`, propose the replacement sentence in the finding.

## Effort

M–L (about 43 rows, two agents each; most are a single read).

## Testing

- `npm run spdx`; the help build passes if any `docs/` text changes.
- Engines: Chromium; emulated phone for the 390 px rows.
- Acceptance scenarios: none re-driven (reader checks).
- Closed-finding regression: none.

## Interaction model

Not UI-touching, unless a wording fix lands. That is then a one-string change covered by the existing spec for that control.

## Documentation

- **Page**: whichever `docs/` page a failed cold read names. No new media.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
