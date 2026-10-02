# TODO/VERIFY.md — Manual Verification Queue (kept small, on purpose)

Appended by `/fix-todo` Step 9, but narrower in scope than the previous attempt's file
of the same name: that one grew to roughly 2,000 lines of "should work now" checklists
across dozens of tasks — a queue nobody could keep up with is the same as no queue.
Read `CLAUDE.md`'s Verification section before adding to this file.

**This file's job now**: log only what's genuinely one-off and not already covered by
a standing `TODO/ACCEPTANCE.md` scenario — a visual/feel judgment call, a
device-specific quirk, something a task's own Testing section explicitly deferred. If
an entry would duplicate what an acceptance scenario already checks on a standing
basis, it belongs there instead, not here.

Newest entry at the top. Each entry is a short prose note (why this is here, what was
already measured or ruled out) followed by a table — one row per thing to check by
hand. Fill in **Status** and **Notes** as you actually verify, on real hardware where
the note asks for it; leave the entry and its filled-in rows in place afterward as a
record rather than deleting it, the same way a checked-off item used to stay in place
under the old checkbox format.

**Status** values:
- `Open` — not yet checked.
- `OK` — checked, reads fine as-is.
- `Issue` — checked, found a real problem. File it as its own `TODO/<id>.md` and put
  that id in Notes.
- `N/A` — no longer checkable as written (e.g. the reachability gate changed). Say why
  in Notes.

**Notes** is free text: what you actually saw, on what device, and anything a future
reader would need — this is the column the old checkbox-only format had no room for.
If this file's queue ever starts growing the way the previous attempt's did — several
entries per day, unread between sessions — that's itself a signal to move more of it
into `TODO/ACCEPTANCE.md` rather than let the queue outpace anyone's attention again.

## Queue

### docs-006 — Docs movie pipeline (2026-10-02 21:05)

The pilot GIF passed its budget and frame checks; whether it reads well to a person is a judgment call.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Open `docs/media/primitive-drag-cube.gif`: is the yellow cursor dot easy to follow, and is the drag pace and 1.5 s end hold comfortable? | Open | |


### sketch-001 — Sketch primitive: draw outlines, extrude to a solid (2026-10-02 19:20)

The run was unattended, so the interaction-model answers this task was told to confirm with
the user first were **not** confirmed: rows 1-7 are those decisions, each a yes/no for the
user (status `Open` until answered; say `Issue` and file a TODO to change one). Rows 8-11 are
the device/feel checks no headless drive can settle. Scenario 9's hand drive (laptop mouse,
phone touch-only via CDP) and the re-drives of 1, 4, 7, 8, 10, 11, 12 already cover the flows.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **UNCONFIRMED default:** a Sketch row sits in Primitives **after Tube**, and its drop opens the editor (nothing in the document until Done; Cancel leaves no body). | Open | |
| 2 | **UNCONFIRMED default:** double-click / double-tap a sketch body as an Edit sketch shortcut — **not built**; only the Inspector's Edit sketch exists. Wanted? | Open | |
| 3 | **UNCONFIRMED default:** Loft v1 needs exactly one Solid outline and no Holes per slice (cut holes afterwards with Subtract). | Open | |
| 4 | **UNCONFIRMED default (implementer's):** while editing on a narrow viewport the nav chrome folds to ✥ even with no sheet open (extends ui-046; it is what keeps the resting editor's reachable canvas ≥ 69 %, 67 % → 76 % at 390 px). | Open | |
| 5 | **UNCONFIRMED interpretation:** with the Slices/Extrude sheet open the phone's whole-canvas reachability is 47-57 % (tablet 64-74 %), below the task's literal ≥ 69 %; the drawing area round the origin stays 100 % reachable and that is what is asserted. Acceptable, or should the sheet get smaller / collapsible? | Open | |
| 6 | **UNCONFIRMED defaults (implementer's):** Polygon starts at 6 sides; a new slice is placed 50 mm above the highest; a new sketch starts as Linear 10 mm; Revolve 360° / 32 segments; Helical pitch 10 mm × 2 turns; Outline wall 2 mm × 10 mm. | Open | |
| 7 | **UNCONFIRMED (implementer's):** Undo/Redo and Delete are off while the editor is open (the draft isn't in the document yet), and old `sketch.line` records are dropped on load with a chip warning rather than migrated (the spec's own "no migration"). | Open | |
| 8 | On a real iPhone and iPad: drag Sketch out of the Library, draw two circles with a finger, tap the inner one, Hole, Extrude ▾ → Linear 30, Done. No accidental orbit, no sheet popping over the drawing, Done/Cancel always reachable. | Open | |
| 9 | On a real phone: two-finger pan/pinch inside the editor while one finger draws — does a two-finger gesture ever leave a stray outline behind? | Open | |
| 10 | Feel: the translucent extrusion preview behind the strokes — readable in both light and dark mode? Is the dashed Hole / amber open outline distinction obvious at a glance? | Open | |
| 11 | Firefox (any real machine with a working Firefox): `npx playwright test e2e/sketch-primitive.e2e.js` with the firefox projects enabled — not runnable in this sandbox (TROUBLESHOOTING 2026-09-17). | Open | |


### ui-054 — File ▸ New (2026-10-01 22:57)

The native Save-picker and hosted auto-push halves were proven only against a fake picker and a mocked GitHub host.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | In desktop Chrome with a real saved file: File ▸ New, build something, File ▸ Save — the real OS picker appears and the old file is untouched | Open | |
| 2 | On a phone, the New confirm dialog reads comfortably and Replace is easy to hit | Open | |


### ui-039 — Mirror (2026-10-01 21:12)

Scenario 16 covers the reflect, original-untouched and selection behaviour. What it doesn't judge is how the control reads.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | The ⇋ glyph on the Mirror button reads as "mirror" next to ⤢ ⇱ ✂, and the toolbar still fits at 390px without wrapping badly | Open | |
| 2 | Blank plane position on a symmetric shape adds an invisible copy sitting on the original — is the popover hint enough, or should it warn on commit? | Open | |

### ui-038 — Bill-of-Materials panel (2026-10-01 20:48)

The tally itself is covered by unit and e2e specs; these are the judgment calls they cannot make.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | At 390px with several part types placed, does the BOM section push the Inspector's selected-body detail too far down the sheet? (It sits above the breadcrumb and is open by default.) | Open | |
| 2 | Is `Bolt M10 hex × 20 mm` the right wording for a shopping-list line, or should the fit or a Pi's model read differently? | Open | |


### render-002 — Text/label as a placed body (2026-10-01 17:49)

Placed/retyped labels were driven on laptop Chromium and covered by the e2e matrix; what's left is feel and device behaviour that no scripted check judges.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Is the default label (`Label`, size 10, stroke 1.5, height 2) legible and pleasant to click-select at default zoom — thin strokes are easy to miss with a click; does picking a label feel fiddly? | Open | |
| 2 | Typing a label's wording on a real phone/iPad (software keyboard + the Inspector bottom sheet) — does the Text field commit on keyboard Done, not just Enter? | Open | |

### data-007 — Primitive resize: snapped dependents follow (2026-10-01 15:05)

The scripted e2e covers the snap-follows and fillet-refusal cases at all three viewports; what it cannot judge is how the refusal reads on a phone.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real phone, shrink a filleted cube's Size X below twice the fillet radius: is the "Fillet on Cube 1 (step 2) would no longer build at this size" line under the boxes readable without scrolling, and does the box repaint with the real value? | Open | |


### core-034 — Drill the mounting holes through raspberrypi.* boards (2026-09-30 18:03)

Volume, hole-centre and hole-rim checks are automated; what no test judges is how it reads. The translucent green board now has through-holes, and I only looked at it from the default camera, too small to see them.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Zoom onto a dropped Pi 5 from above: do the four mounting holes and two fan holes read clearly through the translucent green board, without z-fighting at the rims? | Open | |
| 2 | Same on a real iPad/iPhone (WebKit GPU): the coplanar camera-module v1/v2 holes (cutter exactly as tall as the board) render without speckle at the hole walls. | Open | |


### core-032 — Open announces itself before it folds (2026-09-30 15:55)

The spinner on the File button is a compositor-driven CSS transform, so it should keep turning while a large file folds; that is unproven on real hardware, and the in-between state is too brief for a screenshot in the e2e spec.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone/iPad, open a large project (200-record fillet fixture): the File button's spinner keeps turning and the chip reads `Opening <name>…` before the pause | Open | |


### core-028 — transform.mirror (2026-09-30 15:25)

Kernel-only; no control yet. One judgment call deferred to `ui-039` because it can only be judged on screen.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Once `ui-039` lands: mirroring a symmetric body with the default (own-centre) point looks like "nothing happened" — confirm the popover's committed point makes the copy visibly appear | Open | |


### core-027 — hardware.screw family (2026-09-30 14:35)

Kernel-only; nothing in the app reaches it yet. One judgement call the V1 diff can't settle.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | V1's `FlatHead` puts the *wide* end of the cone on z=0 and the thread above the narrow end, so a "flat head" sits upside-down relative to a real countersunk screw (matches V1 and `hardware.bolt`'s head-at-z=0 convention). When the Library row lands, check that a placed FlatHead reads correctly and whether orientation `down` (not ported) is wanted. | Open | |


### ui-052 — Edit a composite part's parameters and repair what the change breaks (2026-09-29 21:40)

Scenario 15 and scenarios 2, 3, 5, 6, 10, 12 and 13 were hand-driven at laptop Chromium and phone WebKit (see `TODO/ACCEPTANCE.md`). What is left can only be judged on real hardware or by eye: headless WebKit cannot open iOS's native picker or show the home indicator, and "would a person notice" is not something a drive can measure.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone and iPad, tap a selected Raspberry Pi's **Model** (and a Bolt's **Spec**): it should open as the system wheel picker, and choosing Pi 5 should commit on its own, with no Apply. | Open | |
| 2 | On a real iPhone, open the repair dialog (Pi 4 with a cube snapped to its AV jack → Pi 5): it should be a full-height sheet whose **Apply**/**Cancel** sit clear of the home indicator, with the Fix dropdowns full width and easy to hit. | Open | |
| 3 | At laptop width, after **Leave broken**, the Pi's warning banner sits at the top of the Inspector's detail view, and it is scrolled out of sight if you were down at Parameters when you changed the Model. Does a person notice the problem anyway (the cube stays visible; History badges the row), or should the banner also appear near Parameters? | Open | |

### core-035 — Design resolution and export resolution (2026-09-28 06:05)

Scenarios 1, 5, 10, 11 and 12 were driven live at laptop Chromium and phone WebKit, and every exported file was checked by independent parsers (0 open edges at Print). What no drive can judge: whether the finer facets actually fix fit in plastic, how the presets look on real GPUs, and how the synchronous main-thread re-fold feels on a real phone.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Print a Ø22 bore (or a bearing seat) exported at **Normal** and again with **Export → Resolution: Print**, and measure both across the flats with calipers. Print should be measurably closer to nominal (docs/resolution.md's table: 0.084 vs 0.019 mm undersize). Open both STLs in a real slicer first; it should report no repairs | Open | |
| 2 | On a real iPhone and iPad, open **File ▾ → Resolution…**, step Draft → Normal → Fine → Print on a scene with a large cylinder and a sphere. The re-facet should be visibly different at each step, and Draft should not look broken. The native **Resolution** select in the Export popover should open the iOS picker at a comfortable tap size | Open | |
| 3 | On a real phone, with a busy scene (a few Pi boards and bolts), change the design resolution to **Print**. It re-folds on the main thread (76 ms median on 24 bodies on an M4 Pro; a phone is several times slower). Judge whether the pause feels acceptable or needs the pending indicator the TODO asked for (`core-032` owns moving cold folds off the main thread) | Open | |


### ui-051 — Delete the selected body, or remove one part of a group (2026-09-28 03:09 UTC)

Delete, Undo, Remove part and reload were driven in Playwright at 1440x900 Chromium/WebKit
and 390x844 WebKit with real touch (`ACCEPTANCE.md` scenario 14). What a sandbox can't
settle is how the **pinned Delete footer** feels on real hardware, and whether a **real
iPad keyboard's** Delete/Backspace reaches the window listener the way desktop WebKit's
does.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone: select a body, the Inspector sheet opens with **Delete** pinned just above the Library tab. Is it easy to hit on purpose and hard to hit by accident when reaching for the Library tab below it? | Open | |
| 2 | On a real iPhone or iPad: does the pinned footer covering the bottom ~67 px of the sheet ever hide something you needed (for example the Pi's **Show hidden parts** toggle before you scroll)? | Open | |
| 3 | On an iPad with a hardware keyboard: select a body with the Inspector sheet collapsed and press Delete, then Backspace. Each removes the selection, and Backspace inside a Position field only edits the digit. | Open | |

### ui-049 — Objects list folded into the Inspector, hover-to-highlight (2026-09-27 22:34 UTC)

Everything measurable is measured and standing. `e2e/inspector-object-list.e2e.js` covers
every viewport, including hover pixels, the enclosed-body x-ray, the no-touch-hover
regression and the row-name fit. `ACCEPTANCE.md` scenarios 1, 4, 5, 6, 7, 10 and 13 were
re-driven, and `bench/results/2026-09-27-ui-049.md` has the hover sweep. What is left is
judgement a headless drive cannot make: how the new violet hover tint reads on a real
screen, and whether real touch hardware behaves like Playwright's WebKit, whose phantom
mouse after a tap is what the no-touch-hover fix was built against. `ui-047`'s open row and
`ui-041`/`ui-042`'s real-phone rows below were reworded to the new surface, not duplicated
here.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real monitor, in both dark and light themes, hover a row for an unselected light-blue body, a selected (amber) body and a red-recoloured body. Does the violet hover tint read clearly as "this one" without looking like a selection or a rendering glitch? (Headless: light blue went lavender, amber went pale peach, red went magenta-red.) | Open | |
| 2 | On a real iPhone and iPad (Safari), tap rows and checks in the Inspector's list, including one that changes the selection count so the sheet reflows. No row and no body should ever light up violet from a tap. Then on an iPad with a trackpad, or a touch laptop: after tapping, move the pointer onto a row. It should highlight on the first real movement. | Open | |
| 3 | At phone width, select an enclosed body from the list, then fold the Inspector sheet with its tab to reach the gizmo (the sheet stays up after a list selection, as after any selection). Is that one extra tap workable, or does selecting from the list want the sheet to fold on its own? | Open | |
| 4 | Feel of the Objects section: ticking checks keeps the list open, a plain row tap folds it to the body's detail, and the breadcrumb's **Objects** crumb or the bar reopens it. Does that read naturally on a phone, or does the list folding after a plain tap surprise you? | Open | |

### ui-050 — Align to origin: real-device feel of the small grid and the native select (2026-09-27 20:15 UTC)

The precondition gating, the arithmetic, gizmo/field sync, the closed-finding
regressions (`ui-012`, `core-004`), and the 390px layout (no horizontal scroll,
44×44px targets, scrollWidth checked) are all covered by `transform.spec.js`,
`AlignToOrigin.spec.js`, the new `e2e/align-to-origin.e2e.js` (all 3 viewports, 2
non-Firefox engines), and a live hand-drive with screenshots. What is left is judgment
by eye and on real hardware — a native `<select>`'s own platform chrome and a
fingertip's real contact area are exactly the things a headless WebKit emulation
cannot stand in for.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone, open the Reference `<select>` for a dropped Raspberry Pi. iOS renders this as its own native picker wheel, not an inline dropdown — confirm it's reachable one-handed and that picking `mb` reads back correctly in the row once dismissed. | Open | |
| 2 | On a real iPhone or Android phone, tap through all nine grid buttons (`⊢ min`/`◇ ctr`/`⊣ max` × X/Y/Z) in quick succession on a Cube. Each label is small (0.72rem) inside a 44px target — confirm the text itself is legible without squinting, not just that the tap target measures 44px in a bounding box. | Open | |
| 3 | On a real tablet (iPad), with the Inspector as a persistent side column rather than a sheet, confirm the Align to origin row doesn't visually crowd Position/Rotation/Size above it — the column is narrower than laptop width but the row was only checked at exactly 390px and 1440px in the automated matrix, not at the 820px tablet column width by eye. | Open | |
| 4 | Firefox (desktop): the row, its select, and all ten buttons render and commit correctly. Environment-blocked here (`TROUBLESHOOTING.md` 2026-09-17), so this is untested on this engine at all so far. | Open | |

### ui-048 — smaller cone-tipped move arrows (2026-09-27 17:16 UTC)

The sizes and positions are asserted by e2e on 6 of 9 matrix cells, and scenarios 1 and 6 were driven at all three form factors. What is left is judgment by eye and on real hardware, plus the one engine this sandbox cannot launch.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a Raspberry Pi at laptop width (gizmo near its cap), do the ring chevrons (~22-29 px) read as secondary to the new 13-16 px arrow cones, or do they now compete with them? The TODO said to leave the chevrons unchanged; if they compete, file a finding to size them off `gizmoHeadPx` instead of `ringPx`. | Open | |
| 2 | On a real iPad, select a Pi near the middle of the view. At tablet width the viewport column is ~390 px, so a capped gizmo (arm 198 px) can put the X/Y cones under the Inspector column. Is that a real usability problem? The old, larger arms were worse, but the cap may want to scale with viewport width. | Open | |
| 3 | On a real iPhone, grab the small red cone with a fingertip and drag. It should feel as grabbable as before: the 34 px invisible catchment is unchanged, only the drawn head shrank. | Open | |
| 4 | Firefox (desktop): the arrows show a lit flank and a darker flank, the vertical Z shaft is visibly blue (not missing), and X/Y/Z stay red/green/blue in both themes. Environment-blocked here (`TROUBLESHOOTING.md` 2026-09-17). | Open | |

### core-033 — a pre-existing dimension mismatch found while porting colour, and real-device colour legibility (2026-09-26 16:53 UTC)

Two things surfaced while walking `raspberrypi.touchDisplay7inch.js` and every other
recipe part-by-part that are genuinely one-off, not covered by an `ACCEPTANCE.md`
scenario, and out of this task's own scope to fix silently:

1. `raspberrypi.touchDisplay7inch.js`'s `NO_GO_POWER_MM.sizeMm` records `[15, 10, 1]`,
   but the V1 source it's quoting (`touch-display-7inch.js:139`) is
   `Parts.Cube({ x: 15, y: 10, z: 7 })` — a `z` of 7, not 1. This predates `core-033`
   (colour was the only thing this task touched) and was left alone rather than
   silently "fixed" as a drive-by; it's noted in `TODO/render-005-visible-nogo-keepout-touchdisplay7inch.md`
   because the block's real-world obtrusiveness (relevant to that finding's own
   opaque-vs-hidden decision) is currently being judged against an undersized sliver,
   not the true 7 mm block.
2. Every `raspberrypi.*` recipe now renders with roughly 150 more real part colours
   than before (measured: 237 record-level colour changes across a 22-variant sweep).
   This was screenshotted and inspected by eye at laptop Chromium and phone WebKit
   during this task's own Step 6 drive and read as sensible in both cases, but a
   from-scratch look on real phone/tablet hardware — this project's own standing
   ask, not just a headless screenshot — hasn't happened yet for this specific
   change.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Fix (or explicitly decide to keep) `touchDisplay7inch`'s `NO_GO_POWER_MM.sizeMm` z-dimension mismatch (1 mm vs V1's 7 mm) — ideally alongside whichever option `render-005` picks, since the two are related | Open | |
| 2 | On a real phone and tablet (not headless), drop a `raspberrypi.bplus` (any model) and a `raspberrypi.cameraModule`, and confirm the newly-visible per-part colours (lightgray jacks, orange ethernet, gray GPIO, gold camera lensribbon, etc.) read as sensible board components rather than as visual noise, at both the translucent-board and opaque-part boundaries | Open | |

### ui-047 — Objects-row indicator for a shown hidden part, deliberately not built (2026-09-26 13:18 UTC)

The task's own Interaction model section asked for "a small indicator (for example on
its Objects row) so a clearance left on isn't mistaken for real geometry" once **Show
hidden parts** is on for a body. This was not built: it sits outside the file's own
Affected files list (`ObjectsPanel.vue`/`objectsPanel.js` are not named there), and the
Inspector's own toggle state — checked, and the body still selected while its
translucent clearance is on screen — is the feedback that shipped instead. Not
covered by an `ACCEPTANCE.md` scenario, because none of the 13 named scenarios exercise
"deselect a body while its hidden parts are still shown" specifically. Worth a real
judgment call on real hardware: does a translucent clearance left on an unselected,
now-decoy-covered body read as confusing without a list-row cue, in practice rather
than in theory?

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Show a Bolt's `tap`, then deselect it (click empty space) and select a different body. Does the still-visible translucent clearance on the deselected bolt read as confusing without any cue in the Inspector's object list that it's still "on"? *(Reworded by `ui-049`: the Objects panel is now the Inspector's object list, and the toggle lives in the bolt's **Parts** section; still no row cue for a shown-hidden body.)* | Open | |

### render-003 — Recipe-baked part colours actually render (2026-09-26 11:50 UTC)

Everything measurable is measured and standing: `mesh.spec.js`'s new cases (recipe tier,
user-override-beats-recipe, palette regression guard, `depthWrite: false` on alpha < 1),
the new `hardware-library-placement.e2e.js` washer-gray pixel sample (all three
viewports and engines, WebGL material path — proven to bite by a `git stash` A/B of the
`Viewport.vue` wiring alone), and `ACCEPTANCE.md` scenarios 13/3/2 re-driven by hand at
laptop Chromium and phone WebKit with real taps, screenshots inspected by eye. What is
left is the one thing this sandbox's headless/software rasteriser cannot settle —
`core-024`'s own VERIFY entry made the same call for a different z-fighting question.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real GPU (not this sandbox's headless renderer): drop a Raspberry Pi board and orbit close around where its translucent `mb`/`board` part overlaps an opaque part on top of it (a USB stack, the GPIO header). Does the translucent surface read cleanly through, with no flicker or wrong-order blending as the camera moves — the kind of artefact `depthWrite: false` exists to prevent but that a real driver's blend-sorting can still get subtly wrong in a way a still screenshot won't show? | Open | |
| 2 | Same device: drop two Raspberry Pi boards close enough that their translucent parts overlap each other (not just an opaque part). This project has never needed two *overlapping* translucent surfaces before this task — confirm it still reads sensibly rather than double-darkening or z-fighting between the two translucent layers. | Open | |

### ui-037 — Inspector color control (2026-09-25 21:15)

Scenario 13 was driven in full at laptop Chromium and phone WebKit with real taps, plus data-005's per-part questions (closed below). What headless drives can't reach is the **native colour picker itself**: the OS dialog was emulated as its `input`/`change` stream on the real element. Everything else here is a look-and-feel judgement or a known geometric limit.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone and iPad (Safari): tap the Color swatch for a selected body. Does the native picker open, does the body change colour **live** while you move around the picker (the `input` preview), and does closing it keep the colour and add exactly one Undo step? Then open it, move to a different colour and **dismiss without choosing**. Does the body go back to its committed colour, or stay showing the abandoned one? The preview clears on `change`, on a selection change, or when another body/part is picked. It deliberately does not clear on `blur`, because some engines blur when the picker opens. | Open | |
| 2 | Dark mode (OS set to dark): select a recoloured body. Is its own colour still recognisable under the selection tint (`OVERRIDE_HIGHLIGHT_INTENSITY` 0.2, lowered from 0.35 during the drive because red read orange), and is it still obvious that it is selected? The drives ran in the light scheme. | Open | |
| 3 | Drop a **Bolt**, look inside it, and colour `head` or `thread`: nothing visibly changes, because the visible `tap` clearance solid (±9.25 mm, 0-27 mm) encloses both. Measured, not a colour bug, and the same interpenetration `ui-016`'s VERIFY row flagged. Decide whether that is acceptable, or whether `tap` should render hidden/translucent (a recipe or `render-003` question). | OK | Closed by `render-004` (2026-09-26): the user chose "hide `tap` by default" — `hardware.bolt.js`'s `tap` record now carries `hidden: true`, the same divergence `hardware.washer.js`'s `clearance` already had. A freshly-dropped Bolt now reads as gray head + silver thread, driven and confirmed on screen at laptop Chromium and phone WebKit (Step 6). `tap` stays addressable for scenario 5's subtract; it just no longer renders or counts toward the bolt's default bounds. See `TODO/done/render-004-bolt-tap-clearance-visibility.md`. |

### data-005 — Per-body / per-part colour override, document model only (2026-09-25 13:57)

No UI exists to create an override yet (`ui-037`), so nothing here is hand-checkable
today — this is a note for whoever drives `ui-037`'s own Step 6, not an open item on
this task. `Body.colorOverrides` tracks a whole-body override and any number of
per-part overrides as independent entries, and a later override never clears an
earlier, differently-targeted one — that's a document-model decision, proven correct
by unit test, but "correct" and "reads as intuitive to a person picking colours" are
different questions this task has no control to ask with yet.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Once `ui-037` exists: override a whole body's colour, then override one of its named sub-parts to a different colour. Does the rendered result read as "that one part is different", not as two colours silently fighting or the whole-body override winning unexpectedly? | OK | Decided and driven in `ui-037` (2026-09-25): a sub-part override wins on its own part and the whole-body override paints the rest (`src/core/colorOverride.js`). Group of two cubes at laptop Chromium and phone WebKit (touch): whole group red, Cube 2 blue rendered 182/4/4 vs 5/5/171, so it reads as "that one part is different". One caveat moved to `ui-037`'s entry below: on a **bolt**, the visible `tap` clearance solid encloses `head` and `thread`, so colouring either of those can't show through at all. |
| 2 | Same setup: clear the sub-part override (once `ui-037` builds a clear affordance — this task deliberately did not). Does the whole-body override reassert itself on that part, or does the part stay stuck at its old sub-part colour? | OK | `ui-037` built the affordance: the Inspector's **Reset** appends a `style.recolor` with `colorOverride: null` (`document.clearColorOverride`), which drops only its own key and is one Undo step. Driven on the same group: Reset on Cube 2 made it 169/5/5, so the whole-body red takes over again. The readout says `#ff0000 (whole body)`, Reset disables, and Undo brings the blue back. |

### ui-046 — Nav chrome folds to a ✥ toggle while a phone sheet is open (2026-09-24 21:16)

Emulated WebKit and Chromium at 390×844 confirmed the fold, the expand and every button inside it (ACCEPTANCE.md scenarios 1, 7 and 9). What emulation can't judge is whether a person on a real phone recognizes the ✥ glyph as "navigation controls" without reading the docs.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone (Safari): select a body so the Inspector opens, then without instructions find a way to orbit with the on-screen buttons. Does the ✥ toggle read as the way in? | Open | |
| 2 | Same phone: with the Inspector open, tap a body sitting just above the ✥ toggle. Does it select without nudging the camera? | Open | |


### core-031 — row actions on the fold cache, and what only real hardware can settle (2026-09-24 17:58 UTC)

`core-031` makes every History row action (edit, suppress, move, roll back, roll forward,
insert while rolled back), the Undo fallback and the row-click preview reuse each unchanged
record's build instead of re-folding the whole log. Proved here: results identical to the
uncached fold after every action (unit differential, real kernel), and identical to a cold
reload in the app. In headless Chromium at 4× CPU the worst frame gap for a row action went
284 → 30 ms (200 records) and 458 → 20 ms (24 bodies), and for selecting a row 168 → 19 and
232 → 18 ms. Scenario 12 passed in full in Chromium and WebKit, phone included. Three things
it could not settle headless:

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone and iPad: place two bodies, tap empty grid to deselect, then tap each body. Does each tap select that body? Headless WebKit with trusted touch says **no** after an empty-space tap; Chromium says yes. This decides whether `TODO/ui-045` is a real-device bug or an emulation artifact. | Open | **Narrowed by `ui-045`'s own diagnosis (2026-09-24):** extensive controlled reproduction (instrumented `onPointerUp`/`pickAt`, capture-phase `event.target` logging) never found a case where a trusted tap that genuinely reached the canvas raycast differently than a synthetic one — every failure traced to a stray tap landing on `NavigationChrome`/the gizmo/the Inspector sheet instead of the canvas (`TODO/ui-046`), which the original coordinates happen to sit under once a sheet is open. With coordinates verified clear of every overlay band, the full sequence — including body→body with no intervening empty tap — passed on every repetition, on webkit-phone **and** chromium-phone. So: **on the real device, try it first with the two bodies placed somewhere clearly not under the nav-chrome cluster or a body's own gizmo**, before concluding this is a real WebKit bug — a same-symptom failure there would most likely be the `ui-046` layout hazard, not this file's pointer-handling one. Still worth trying the *original* cramped placement too, since a real device's touch/gesture stack is the one thing this session's tooling could not stand in for. |
| 2 | Desktop Chrome, real GPU: in History, select a mid-log row (the preview strip appears), then press **Back to latest** or **Roll forward**. Does the 3D view flash blank for a frame as the strip goes away and the viewport grows? Headless Chromium captures a blank canvas in the first frame and a correct one by 500 ms. That is pre-existing, and dismissing the strip alone does it too. Say whether a person can see it. | Open | |
| 3 | On a phone, on a document of 20+ bodies (Open `bench/`'s 24-body scene or build one): tap a History row, then Edit or Suppress it. Does the row action now feel instant, with no stall between the tap and the viewport updating? | Open | |

### core-030 — Undo/Redo by restore, felt on real hardware (2026-09-24 15:59 UTC)

`core-030` makes Undo/Redo restore the state captured with each step instead of re-folding the
log. Proved here: identical results to the always-fold path after every action (a unit
differential against an always-fold twin plus a fresh fold), zero kernel work per press
(counted at the registry), and in headless Chromium the worst frame gap at 4× CPU went
296 → 22 ms (200 records) and 474 → 18.5 ms (24 bodies). Scenario 12 was driven in full in
Chromium and WebKit, phone included. That cannot say how it *feels* on a real GPU and a real
touch screen, or whether the 50-step restore window's memory shows on an older device.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone and iPad: drop about 12 Raspberry Pis and 12 Bolts, then tap **Undo** ten times as fast as you can, then **Redo** ten times. Every tap lands with no visible stall, and the scene ends exactly where it started. Before `core-030` each tap froze the screen for about half a second on this scene. | Open | |
| 2 | Same device, the same heavy scene: make about 60 small edits (move, param edit, place), then Undo all the way back. The first 50 Undos should feel instant. The ones past 50 re-fold and may pause briefly, which is expected. Nothing should reload the tab or run out of memory. | Open | |

### core-029 — the evaluation worker on a real phone and tablet, and the ~80 ms drop floor (2026-09-24 02:50 UTC)

`core-029` moved a composite body's volume union into a module worker and stopped `boundsOf`
unioning at all. Proved here: identical answers to the main thread (unit, e2e digit-for-digit
in Chromium and WebKit at all three viewports), the production chunk loading in both engines,
and the freeze gone at 4-6× CPU throttling in headless Chromium. Not provable here: a real iOS
Safari/iPadOS module worker under memory pressure, and what the remaining ~70-90 ms drag-place
gap is — it barely moves with CPU throttling (77 → 80 → 92 ms at 1×/4×/6×), so it is probably
the headless software rasteriser, which says nothing about a real GPU.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone (Safari), drop a Raspberry Pi and then a Bolt. Tap empty space and open the Inspector's **Objects (2)** tab (the Objects list, since `ui-049`): both rows show a size, and the scene responds while they land (no visible hitch on the second drop). If a remote Web Inspector is attached, confirm an `evaluation.worker-*.js` worker exists and the console is clean. | Open | |
| 2 | On a real iPad, with ~10 Raspberry Pi boards placed (drag them in), drag one more Cube in and then press Undo. The drag-place should feel instant; Undo will still pause briefly (that is `core-030`, expected). Note roughly how long Undo hangs. | Open | |
| 3 | Install the PWA, go offline, reload, and drop a Bolt: its measurement must still land (the worker chunk is in the service-worker precache — 9 entries, up from 8 — but offline was not driven here). | Open | |

### ui-043 — phone toolbar/chrome margin is thin: 6px, not 0, but real-Safari font metrics were never checked (2026-09-22 14:36 UTC)

The fix closes both measured overlaps (21px and a previously-unmeasured 6px) to a uniform 6px
*clear gap* at 390×844, confirmed by a standing e2e spec (`e2e/phone-toolbar-chrome-fit.e2e.js`,
which will catch a future regression here automatically) and a hand-drive in this sandbox's
WebKit and Chromium. What none of that proves is that real iOS Safari renders the same 11px
system-font legend at the same pixel width as this sandbox's WebKit build — a font-metric
difference of even a few px would erase the margin. Not a case for a bigger fix (there is no
slack left to spend without reopening the trade the retirement note describes), just a real-device
check the standing spec cannot perform for itself.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone (Safari, 390pt-class device), select one body so the Inspector sheet auto-opens, and confirm the Operations toolbar and the navigation chrome (Orbit/Pan/Select row) do not visually touch or overlap. Repeat with two bodies selected. | Open | |

### ui-042 — Objects list part rows: chevron feel, and a wrong-order empty result (2026-09-22 13:51 UTC)

Everything measurable is measured and standing (`e2e/objects-panel.e2e.js`'s new part-row cases at
three viewports, `ACCEPTANCE.md` scenarios 5/4/6/1). Two things are not, deliberately not
duplicating `ui-041`'s own real-phone-feel row above: the *new* nested-row/chevron interaction
specifically (a level of touch target `ui-041` didn't have), and a kernel behaviour this task's own
hand-drive surfaced but did not introduce or fix.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real phone, with nothing selected, open the Inspector's **Objects (n)** tab, expand a composite with many parts (a Raspberry Pi), scroll the part list, and tap a hidden part's row and its check: does the indent read clearly as "inside this body" at a glance, does the chevron's rotate-on-open animation feel responsive, and does scrolling the parts ever fight scrolling the Inspector sheet or the page? *(Reworded by `ui-049`: the list moved from the Objects panel into the Inspector sheet.)* | Open | |
| 2 | Addressing a part on the body that ends up as Subtract's *target* (the wrong-order case: e.g. drilling a small part first, then adding a much larger enclosing body second) can make the kernel return a **zero-volume result with no error** — a small solid entirely swallowed by what it's being subtracted with leaves nothing. This is existing kernel/boolean behaviour, not something this task changed, and it committed cleanly in the drive rather than crashing. Does a silently-empty result (one body left in the scene, at zero size) read as confusing or alarming to a real user, and is a "this result is empty" affordance worth a future finding? | Open | |

Everything measurable here is measured and standing (`e2e/objects-panel.e2e.js` at three viewports,
`ACCEPTANCE.md` scenario 5). What is left is judgement a Playwright touch emulation cannot make:
whether the new sheet and toggle *feel* right under a real thumb, and whether the hidden-body tint is
legible on a real screen in sunlight rather than a 1440px monitor.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone, with nothing selected, tap the Inspector's **Objects (n)** tab, tick one row's check, then a second row's check, then **Subtract**: are the 44px rows and checks comfortable, does the sheet scroll without fighting the page, and does a row tap ever land on the check by mistake (or the reverse)? *(Reworded by `ui-049`: the Objects panel and its header button are gone; the list is the Inspector's.)* | Open | |
| 2 | With a body enclosed in another (open a project that has one), select the enclosed body from the list: is the **teal/amber x-ray tint** legible at phone size in both the dark and light themes, and does it read as "hidden body, selected" rather than as a rendering glitch? At 390px the selected body's gizmo can sit partly under the nav chrome (the phone framing is not adjusted for the sheet) — is that workable, or does it want the camera to re-frame? | Open | |

### perf-001 — export moved into a worker, and the slow-export pending state (2026-09-21 19:32 UTC)

Everything measurable here is already measured and standing: the freeze (worst animation-frame gap, 224 → 27 ms at 4x CPU throttling and 346 → 40 ms at 6x, `bench/results/2026-09-21-perf-001.md`, re-runnable with one command), the threshold behaviour (5/5 appearances on a 24-body export, 0/5 on a one-body one even at 6x), the output equivalence (SHA-256 over the ordered vertex list and the whole written STL/OBJ/GLB for all ten `io-004`/`io-005` shapes), and `ACCEPTANCE.md` scenario 11's byte-level re-drive. The e2e matrix covers the pending state at all three viewports in Chromium and WebKit. What is left is the one thing a throttling multiplier is **not**: a real phone.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **On a real iPhone and a real iPad, does a big export still feel alive?** CPU throttling at 4-6x is a stand-in for a phone, not a measurement of one — a real device also differs in memory pressure, thermal throttling and how Safari schedules a module worker. Build a heavy scene (a dozen library boards and bolts), press **Export**, and judge two things by hand: does the viewport really keep responding to a drag *while* `Writing warpcad-scene.stl…` is showing, and does the file still arrive? Then the borderline case the numbers cannot settle: on a fast laptop at 1x a 24-body export lands right at the 100 ms threshold, so the line is absent or a ~10 ms flash. On a phone the same export is several times slower, so it should show properly — **but if it flickers on and off, or appears for so short a time that it reads as a glitch rather than as progress, the threshold is wrong for real hardware** and is worth raising. File it if so. | Open | |
| 2 | **Does the worker actually survive a real mobile Safari backgrounding?** Start a big export on an iPhone and immediately switch apps or lock the screen, then come back. iOS suspends timers and can terminate workers aggressively; the code falls back to the main thread only when a worker cannot be *constructed*, not when a live one is killed mid-job — in that case `runExport` rejects and the popover shows `Export failed: …` rather than quietly retrying. Is that what happens, and is the message survivable (popover still open, Export still pressable)? If iOS kills workers routinely on backgrounding, a retry-on-the-main-thread path becomes worth having and should be filed. | Open | |

### ui-034 — File ▾ → Export… (2026-09-21 14:50 UTC)

Everything checkable without a person or a real slicer is covered on a standing basis: `e2e/export-ui.e2e.js`
(chromium + webkit, all three viewports — real downloads parsed by an independent reader), `ACCEPTANCE.md`
scenario 11 (driven by hand), and the unit specs. What is left is what only a hand and a real tool can judge:

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Real iPhone Safari: does the download actually land and can you find it?** Export a body as STL from the phone. The chip is a dot on a phone, so the browser's own download sheet (and the Files app's Downloads) is the only confirmation the user sees. Does `union-1.stl` appear, is the `Preparing…` button state on glTF perceptible or a flash, and does pressing Export feel like it did something before the sheet appears? Also: do the popover's 44 px scope/format segments feel like a comfortable thumb target, and does the dimmed **Export…** row's printed reason read as an explanation rather than clutter? | Open | |
| 2 | **Open one exported STL and one OBJ in a real slicer or mesh checker** (PrusaSlicer / Cura / Bambu Studio / MeshLab) — both a plain Union and a placed bolt. **Precondition and expectation both changed on 2026-09-21 when `io-004` landed: those files are now measured closed** — 0 of 309 undirected edges open on the union (was 9 of 300) and 0 of 342 on the bolt (was 40 of 302), each edge used by exactly two faces in opposite directions, volume within 7e-6 of the kernel's, no zero-area triangles. So this row is no longer "how bad is the defect" but **"does a real tool agree with our own parser"**: the slicer should load it, report nothing to repair, and offer no auto-fix — if it still offers to repair, that is a new finding and the measurement above is wrong about something. Check the `.glb` in a glTF viewer in the same sitting, and on **the same terms, not weaker ones — this changed on 2026-09-21 when `io-005` landed**: the `.glb` is now measured closed too (0 of 276 undirected edges open on that same union, was 44 of 262; 0 of 318 on the bolt, was 46 of 290; 0 zero-area triangles; volume within 4e-8 of the kernel's; outward winding), so a DCC tool importing it should **not** complain about holes — if Blender's *Select → All by Trait → Non Manifold* finds anything, that is a new finding. This remains `ACCEPTANCE.md` scenario 11 step 5, which **no drive has ever been able to perform** — no slicer, mesh viewer or glTF viewer exists in this environment, and nobody has opened any exported file in one, before or after `io-005`. | Open | |

### ui-033 — File ▾ menu: Save / Open… / hosted storage (2026-09-21 13:46 UTC)

Everything checkable without a person, a real credential or a real device is covered on a standing
basis: `e2e/save-load-ui.e2e.js` (chromium + webkit, all three viewports), `ACCEPTANCE.md` scenario 10
(re-driven by hand against a mocked `api.github.com`), and the unit specs. The `data-001` rows on real
iOS `<a download>` and `<input type=file accept>` behaviour, and the `io-001` header-feel rows, are **not
repeated** — the File button is in that same header, so check it in the same sitting. Three things are left
that only a real device or a real OS dialog can answer:

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **The native File System Access picker on real desktop Chrome or Edge** — an OS dialog nothing headless can click, proven here only against an injected fake. **Save** should open the picker the first time and then write over the same file with **no** second prompt (`Saved to warpcad-project.ndjson · HH:MM`); **Save As…** should always prompt; cancelling either picker should be silent; **Open…** then **Save** should write back to the file you opened. Edit the file in a text editor between two Saves to see the write really lands on disk. | Open | |
| 2 | **Real iPhone Safari, the Connect dialog with the keyboard up.** Tap **File ▾ → Connect repository…**, tap the Token field. The inputs are 16px so the page should **not** zoom, and the dialog is top-anchored so the keyboard should not hide the fields or the Connect button. Also: does iOS offer to autofill a saved password or autocorrect/capitalise into the token field despite `autocomplete="off"` / `autocapitalize="none"` (Safari does not always honour the former)? Use a made-up token; do not paste a real one to test this. | Open | |
| 3 | **The File-button status dot at real phone size.** It is a 14px badge on the button's corner (solid green disc in sync, hollow ring pending, spinning ring pushing, amber `!` paused, red `✕` failed), shape-coded so it does not rely on hue. Judgment call: can you tell those five apart at arm's length, in sunlight and in dark mode, and does the spinning ring read as "working" rather than "stuck"? (Reduced-motion users get a dashed ring instead of a spin — check that setting reads too.) | Open | |

### ui-040 — Sub-part-addressed boolean operands (2026-09-20 23:59 UTC)

Everything about *whether it works* is covered by `ACCEPTANCE.md` scenarios 4, 5 and 6, all
re-driven and measured, so only the two judgment calls this task made for phone width are
logged here — both are "does this feel right to a person holding the device", which no
assertion in this repo can answer.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | At 390px the operand line (*"Cube 1 then Bolt 1 › tap"*) is **hidden**, because the column above the navigation chrome is already full — measured, 151px against ~147px spent — and the same text is on the buttons' long-press instead. On a real iPhone: is a long-press actually how someone would discover which depth is armed, or does a sub-part boolean feel like it commits blind at that width? If it feels blind, the answer is probably a different home for the line (the Inspector's 2-selected state), not a smaller font. | Open | |
| 2 | A rejected sub-part commit shows its kernel error on the toolbar, and at phone width that message sits in the same band as the navigation chrome's buttons, so the toolbar is lifted above the chrome **only while an error is showing**. On a real device: does that read as an error, or as the toolbar glitching over the nav pad? Reachable by drilling into a part, Shift-clicking a second body, then rolling the History back so the part no longer exists, then clicking Subtract. | Open | |

### ui-032 — Timeline (History) panel (2026-09-20 22:05 UTC)

`ACCEPTANCE.md` scenario 12 was driven in full at laptop/Chromium and phone/WebKit, so nothing
that scenario already covers is repeated here. What is left is genuinely one-off: two *feel*
judgments that only a hand on real hardware can make, and one decision this task was asked to
record. The measured facts behind them — the phone sheet is 34vh with the nav chrome clearing the
Operations toolbar by 57px, and the tablet dock is 220px inside a viewport column roughly 390px
wide at the 820px reference — are in the task's retirement note; what nobody has judged is whether
those numbers *feel* right to use.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **On a real iPhone**, open History with three or four bodies placed and try to actually work: read the rows, tap one, edit a value, roll back. The sheet is 34vh (~287px) and the 3D view above it keeps only ~296px, most of which the Operations toolbar and nav chrome overlay. The arithmetic says nothing *collides*; the open question is whether the remaining sliver of viewport is enough to see what a row action just did to the model, or whether the honest answer at phone width is that History wants a full-screen presentation rather than a sheet. If it is the latter, that is a real finding and wants its own `TODO/<id>.md` | Open | |
| 2 | **On a real iPad**, same exercise against the 220px bottom dock. At the 820px reference the viewport column is only ~390px wide, so the dock takes over a third of the 3D view's height while it is open. Judge whether the "select a row, watch the viewport" loop the panel is built around actually works at that size, or whether the dock wants to be collapsible to a strip | Open | |
| 3 | The inline edit form uses 16px inputs specifically so iOS Safari does not zoom the page on focus (`§15`'s own phone rule). Verified by construction, never on a real iPhone. Tap into the Radius field on device and confirm the page does **not** zoom and the form does not scroll out from under the thumb | Open | |

### io-003 — Export serialization: STL, OBJ, glTF (2026-09-19 15:21 UTC)

The STL and OBJ bytes were re-read by numpy and three.js's own loaders (closed surface, kernel volume to
1.3e-5 relative) and the `.glb` container by an independent parser, but **no real slicer or glTF viewer has
opened any of them** — `ui-034` (2026-09-21) built the control and drove real downloads, and re-read the bytes by an independent parser (including the glTF root matrix), but still no real viewer was available, so this row is still open. Scenario 11
covers "opens cleanly and matches the viewport"; this entry is only the glTF judgement it does not name — that
the file is the right *size and way up*, which is the one place the export deliberately differs from the
document's space (mm / Z-up in, metres / Y-up out) and which only a real viewer can confirm.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Now that `ui-034` has landed (File ▾ → Export…, choose **glTF (.glb)**): export a body you know the size of (a 40 mm cube standing on the grid) as glTF and open the `.glb` in a real viewer (Blender, `gltf-viewer.donmccurdy.com`, macOS Quick Look). It should stand **upright** (not lying on its side) and read **40 mm / 0.04 m** across, not 40 m or 0.04 mm. **Updated 2026-09-21 (`io-005`) — what the file now is, and what is still unknown:** the `.glb`'s mesh is now **closed** by this repo's own independent POSITION-accessor parser (0 of 276 open edges on the scenario-11 union, 0 of 318 on a placed bolt, 0 of 1023 on a `raspberrypi.bplus`, 0 zero-area triangles, outward winding, volume within 4e-8 of the kernel's) and the mm→m / Z-up→Y-up root matrix is unchanged and re-measured. **No real glTF viewer has still ever opened one of these files** — not before `io-005` and not after — so this row stays `Open` and is now the check on *two* things at once: the size-and-orientation judgement it was always for, and whether a real importer agrees the surface is closed. | Open | |

### io-002 — Hosted git-backend persistence (2026-09-19 14:09 UTC)

Everything about this task that *can* be checked without a real credential is covered on a
standing basis: `src/storage/*.spec.js` + `src/stores/hosted.spec.js` (59 cases, including the
whole auto-push state machine under fake timers), `e2e/hosted-persistence.e2e.js` on chromium +
webkit against an intercepted `api.github.com`, and `ACCEPTANCE.md` scenario 10 — whose hosted
half (steps 8-10, a real scratch repo and a real token) is **already the standing home** for
"does this work against real GitHub", so it is deliberately **not** duplicated here. The two
rows below are the ones a mocked host cannot answer even in principle, because they are claims
about the *real service's* behaviour rather than about this code. The open real-device rows from
`io-001`/`data-002` are not repeated either.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **A project over 1 MB, against real GitHub.** The Contents API stops returning file content above ~1 MB (`"encoding": "none"`, empty `content`), and `hostedBackend.js` follows the blob endpoint rather than reading that as an empty project — which would commit a truncated log over a real one. That branch is tested against a fake answer shaped from the docs, never against the real service. Build a log past 1 MB (a few hundred placements, or a big imported part), Save to a scratch repo, reload with site data cleared, and Load it back: does the whole model return? | Open | |
| 2 | **403 really is two different failures.** A missing `Contents: write` permission and a rate limit both arrive as 403, and they are told apart here by `x-ratelimit-remaining`/the body text, then reported as different messages (*"does not have permission… Contents: read and write"* vs *"Rate limited — try again in N minutes"*). Confirm against the real API with a deliberately read-only fine-grained token: is the wrong-permission message the one that appears, and is it true? | Open | |

### io-001 — Local persistence: IndexedDB autosave, restore and the save-status chip (2026-09-19 13:31)

Autosave/restore, the flush-on-hide path, the blocked-storage state and the chip layout are
all covered on a standing basis (`e2e/local-persistence.e2e.js` on chromium + webkit, and
`ACCEPTANCE.md` scenario 10's local half, re-driven by hand this task). The two open real-device
rows from `data-001`/`data-002`/`data-003` (real iPhone/iPad header feel) are **not repeated**
here — the chip's dot now sits in that same header, so check it in the same sitting. What is
left is what a headless WebKit and a simulated `indexedDB` cannot stand in for:

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Real iPhone Safari, the tab-kill path.** Place a shape, then within about a second swipe to the home screen (or lock the phone) and later reopen the tab/app. Is the last shape still there? The save-on-hide path (`visibilitychange`/`pagehide` → a synchronous `localStorage` copy, then IndexedDB) was found necessary in real Chromium and passes in headless WebKit, but iOS suspends and kills tabs on its own schedule that no headless run reproduces. | Open | |
| 2 | The chip is a **10px dot** at phone width, coloured *and* shaped (grey idle, amber ring saving, green disc saved, red square failed). Is it legible at arm's length, in sunlight and in dark mode, and does the ring/disc/square difference actually read without relying on hue? (Judgment call; not asserted anywhere.) | Open | |
| 3 | **A real private window** in Safari and Firefox (not the simulated throw the e2e uses). Does WebKit/Gecko actually block IndexedDB there, and if so does the chip go red with the app usable? `docs/save-load.md` claims only that private windows *in some browsers* block or wipe storage — tighten or loosen that sentence to what you see. | Open | |

### data-004 — Edit a past timeline entry's params in place and replay after it (2026-09-19 04:59)

Almost everything this task built is already covered on a standing basis — `ACCEPTANCE.md`
scenario 12 owns the whole edit/suppress/reorder/rollback surface, and 39 unit cases cover
the mechanism — so only the three things below are logged here, and none of them is a
restated pass. Two are **judgment calls that need a human looking at a screen**, which is
exactly what this file is for and what no assertion of mine can settle; the third is a
number that should be re-taken on real hardware rather than trusted from a laptop.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | The full re-fold measured 67 ms for a 200-record, 50-fillet document on this Mac. That is a **row action, not a frame**, so it is within budget by design — but it is also the first operation in this app whose cost scales with document length. Re-take it on the **iPad and the iPhone** once `ui-032` gives it a trigger: if a mid-history edit on a real phone feels like a hang rather than a pause, the incremental re-fold this task deliberately did not build becomes a real task rather than a deferred one. Record the device and the felt latency, not just the number | Open | |
| 2 | A `transform.rotate` row is **not editable at all** (its only param is the absolute rotation `core-004` carries forward, so editing one row's copy would be silently overwritten by the next). This is correct and is now stated in code — but it is a capability a user may well expect. When `ui-032` lands, judge by hand whether the disabled `Edit` button's reason reads as *an honest limitation* or as *a bug*. If it reads as a bug, that is a real finding and wants its own `TODO/<id>.md`, not a wording tweak | Open | |
| 3 | Section 18's inactive-tail `broken` flag is informational by decision: an insert that breaks a tail row still succeeds. `data-004` measured that **36% of roll-back-then-move cases** break at least one row (filed as `TODO/data-006`). Once `ui-032` can show the chip, drive scenario 12 step 10 a few times as an exploring human and judge whether being told "this later step can no longer be built, Suppress it or Undo" is *acceptable* or *infuriating* — that judgment, not the 36%, is what should decide whether `data-006` gets built | Open | |

### data-003 — Undo/redo command stack scoped by transaction origin (2026-09-19 03:58)

The mechanism itself is covered by standing checks and is deliberately not restated here:
`ACCEPTANCE.md` scenarios 1, 2, 4 and 12 were all re-driven by hand for this task, and
`src/core/history.spec.js` plus `e2e/undo-redo.e2e.js` (3 viewports x chromium/webkit)
cover the rest. What is left is three things a scenario genuinely does not check — a
layout cost the confirmed design accepted on paper but nobody has seen on glass, a
contract with no reachable trigger in the app yet, and a threshold this task moved in
another task's spec.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **On a real iPhone and a real iPad**: the header is now ~53px tall at phone width (was ~30px) because Undo/Redo are 44px tap targets, and the mouse-oriented hint text is hidden below 641px. Does the taller bar feel right, and are the two buttons comfortably thumb-reachable one-handed? The 390px budget was checked arithmetically and in a screenshot, never on glass. | Open | |
| 2 | The undo **refusal** path (`history-refusal`, `role="alert"`) cannot be triggered from the app today — nothing produces a non-local record until the MCP surface or `io-002` exists — so it is proven only by `history.spec.js`. When `io-002` lands, confirm the message actually appears and reads sensibly, and fold it into `ui-033`'s shared `save-status` chip rather than leaving a second status surface. | Open | |
| 3 | `e2e/snap-align-operation.e2e.js`'s two fixture-sanity guards were lowered `> 5` → `> 4` because this task's taller phone header shifts the phone camera's projection (that fixture's X separation went 5.61 mm → 4.69 mm). The guards still sit ~90x above the 0.05 mm tolerance they protect, and the shared drop fractions were deliberately left alone. Worth a second opinion on whether the fixture should instead be re-positioned when someone next touches that file. | Open | |

### data-002 — M6 interaction-model Q&A (2026-09-19 03:10)

This task shipped no code, so nothing here is about how something looks. One claim in
`docs/decisions/interaction-model-qa.md` section 10 is **from memory, not measured**, is
load-bearing for `io-001`, and cannot be checked by any automated spec (Playwright's WebKit
is not iOS Safari): that an `<input type="file">` on iOS Safari **greys out files whose type
it does not recognise**, which is why the Q&A asks `io-001` to use an `accept` list of
`.ndjson,.json,.txt` plus `text/plain` rather than a custom extension alone. If a real
iPhone lets a plain `.ndjson` be picked from the Files app with any `accept` value, the
constraint is moot; if it cannot with `.ndjson,.json,.txt`, `io-001` needs a different
project-file extension. Cheap, and worth doing before `io-001` starts, alongside the two
open rows in the `data-001` entry below (same devices, same scratch page). The header's
390px width budget is also arithmetic rather than measurement, but `ui-033` will hand-drive
it at 390px as part of its own acceptance run, so it is not a separate row here.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On real iPhone **and** iPad Safari, put `<input type="file" accept=".ndjson,.json,.txt,text/plain">` on a scratch page, and try to pick a file named `project.ndjson` saved in the Files app. Then try again with a bare `accept=".ndjson"` and with no `accept` at all. Record which of the three let the file be selected. If only the no-`accept` case works, `io-001` should drop `accept` entirely and validate the file's content instead of its extension. | Open | |

### data-001 — Persistence/export Library decision (2026-09-18 20:20)

This task shipped no code, so nothing here is about how something looks. It is here
because `docs/decisions/persistence-export.md` makes **one load-bearing claim about real
devices that was taken from caniuse and MDN rather than measured on hardware**, and
`io-001` is about to build its whole Save/Open path on top of it. The claim: File System
Access is desktop-Chromium-only (~30.85% global, no pickers on Safari, Firefox, or
**Chrome for Android**), therefore the `<a download>` / `<input type="file">` fallback is
the *primary* path on every phone and tablet this project supports, not an edge case.

Both rows below are cheap, and both are worth doing **before** `io-001` starts rather
than after, because each one would invalidate a different part of that plan. Row 2 is the
one that actually worries me: iOS Safari has historically handled `<a download>` on a
blob URL by *opening* the file in a tab rather than saving it, and if that is still true
then the fallback this decision calls "primary" does not work on the two devices the
second attempt's stop note specifically complained about. No acceptance scenario covers
this (scenario 10 is "not yet built"), and no automated spec can, since Playwright's
WebKit is not iOS Safari and does not share its download behaviour.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | In a JS console (or a scratch page) on real iPhone Safari, real iPad Safari, and desktop Chrome, evaluate `typeof window.showSaveFilePicker`. Expect `"undefined"` on both iOS devices and `"function"` on desktop Chrome. Anything else means the capability gate in `docs/decisions/persistence-export.md` sub-decision 2 is wrong and `io-001`'s branch needs rethinking before it is written. | Open | |
| 2 | On real iPhone **and** iPad Safari, trigger a plain `<a download="test.ndjson">` pointing at a `Blob` object URL and see what actually happens: does a file land somewhere the user can retrieve it (Files app / Downloads), or does it just open the text in a new tab? If it opens rather than downloads, the "fallback is the primary path" plan is broken on iOS specifically, and `io-001` needs a different Save mechanism there (Web Share API `files:`, or copy-to-clipboard) — file it as its own TODO and put the id in Notes. | Open | |

### ui-036 — Angled Bisect controls (2026-09-18 19:14)

Measured live at 390x844 (WebKit): the six-field popover is 260 x 466 px, no internal scroll, and every control hit-tests. What automation cannot judge is how it *reads*: the popover's glass background lets the Inspector sheet's text show through behind it now that it sits above that sheet.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone, open Bisect with a body selected and read the popover over the auto-opened Inspector sheet: is the faint Inspector text ("INSPECTOR", part name) showing through behind the fields distracting enough to want a more opaque popover background at phone width? | Open | |
| 2 | On a real iPhone, tap into the Angle field and check the numeric keyboard offers a minus sign (Angle accepts negative degrees); `type="number"` keyboards without one are an iOS quirk the desktop drive cannot show | Open | |

### ui-035 — an occluded sub-part still cannot be picked, and one feel question about the new operand line (2026-09-18 01:55)

The operand mechanism itself needs no hand-check and is deliberately not listed below:
`TODO/ACCEPTANCE.md` scenario 3 now carries it as a standing check, driven live against
a real Raspberry Pi 5 at both laptop and phone and verified as arithmetic against an
independent kernel probe (the `ethernet` part sits at (+34.50, -17.30) mm from the
board's bbox centre, and the live move implies exactly that to the hundredth of a
millimetre, in both directions of addressing). What is left is one real gap this task
cannot close from inside itself, and one judgment no measurement settles.

Row 1 is the important one, and it is the reason `docs/snap-align.md` no longer uses a
mounting hole in its worked example. This task's own Goal names "a specific hole on a Pi
board" as the case it exists to enable. The *operand* half of that now works. The
*selection* half does not: a mounting hole passes through the PCB, so a raycast hits
`mb` in front of it every time. A 289-point pointer sweep across a real Pi 5 at the
default camera reached only `mb`, `ethernet`, `usb1` and `usb2` — four of the board's
thirty-odd named parts. This is a `ui-016` picking limitation reached from a new
direction, and `ui-032` (the enclosed-body picking task scenario 5 is also blocked on)
is the natural place for it rather than a task of its own; the sweep result is recorded
here so that scoping does not have to rediscover it.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Confirm the occlusion gap and decide where it belongs. Place a Raspberry Pi 5, try by hand to drill into `hole1`-`hole4` — including by orbiting underneath the board, which the automated sweep did not try, since the hole's underside is coplanar with the PCB's and may or may not win the depth tie. If it is genuinely unreachable from every angle, fold it into `ui-032`'s scope (an occluded *part*, alongside its enclosed *body*) rather than filing a fourth picking task. `docs/snap-align.md` already tells users to orbit until the part faces them, which is the honest workaround only if it actually works. | Open | **`ui-032` has now weighed the "fold it into `ui-032`" half and declined it (2026-09-20).** That gap is about the *raycast*; the History panel is a list, which is a picking route needing no raycast at all, and `ui-032` touches picking only to disable it during a preview. Folding it in would also cut across §13's confirmed rule that a row selection and a body selection are two different selections that never trigger each other. The occlusion question itself is still open and still worth the hand-check above — it belongs with `ui-040`/`ui-016`'s sub-part addressing work, not with the timeline. |
| 2 | Feel check on the new operand line ("Aligning **Raspberry Pi 1 › ethernet** to **Cube 1**"), on real phone and tablet hardware rather than an emulated viewport. It measured fully inside the popover at 390px with no page scroll, but two things are judgment: whether it reads as *confirmation to check* or as decoration one skims past on the way to the commit button, and whether a genuinely long composite part name (the catalogue ships names like `powerswitch-button` and `clearance-statusled`) wrapping to three lines pushes the Cancel/commit pair uncomfortably far down a 390px-tall popover. | Open | |

### core-024 — a placed composite is now meshed part-by-part; look at the two interpenetrating recipes on real hardware (2026-09-18 00:52)

`src/render/mesh.js` draws a `Group` body one mesh per visible part instead of one
combined solid, and warned in its own module doc that two shipped composites
interpenetrate — `hardware.bolt`'s `tap` overlaps `head` and `thread`, and
`kit.anchor`'s `hole` shares a **coplanar face** with its `post` — asking for a look
"when those rows land". Before this task no *placed* composite ever reached that path,
because the drop translate flattened it; now every one does.

**Already measured, so this is not an open question so much as a second opinion on a
different GPU.** A/B screenshots at a hard zoom and from the Front view, with the change
stashed and unstashed (the toggle itself verified live, so it is a real comparison):
`hardware.bolt` is **byte-identical** both ways, and `kit.anchor` differs by **52 pixels
out of 1 296 000** (max channel delta 55) in the 3/4 view and 19 px (max delta 9) from
the front — present, and far below visible. That was headless Chromium on this machine.
Depth-buffer precision and coplanar-face tie-breaking are exactly the things that differ
between GPUs and drivers, which is the one reason this is worth a human's eye rather
than closed on the numbers. `mesh.js`'s own documented fix, if it reads badly, is to
fall back to the combined mesh for that body (the `holes` branch is the pattern),
trading its pick depth for a clean surface — not to re-union everything.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Place an **Anchor** (Kit Parts) on a real phone/tablet, zoom in hard, and orbit slowly around the join between its `post` and its `hole` — looking for a flickering or shimmering seam where the two share a face, which is what a z-fight looks like in motion and what a still screenshot cannot show | Open | |
| 2 | Same, for a **Bolt**, at the base of the head where `head` and `tap` share the `z = 0` plane — the one coincident surface in that recipe, normally face-down on the grid and so usually hidden | Open | |
| 3 | Confirm a placed composite still reads as one solid object rather than visibly separate pieces, at ordinary working zoom on a real device — the question the pixel diff answers only for one GPU | Open | |

### ui-031 — the Inspector's collapsed tab overlaps the bottom of the open Library sheet at phone width (2026-09-18 00:05)

One layout observation the Step 6 drive surfaced and **measured**, which no acceptance
scenario covers and which this task did not create but did make far easier to reach.
At 390x844, with the Library sheet open *and a body selected*, the Inspector's collapsed
tab occupies y 748-792 while the Library sheet still spans y 456-844 — so the tab sits on
top of the sheet's bottom **96 px**, about two rows' worth. With `ui-030`'s eleven rows
you rarely scrolled that far; with this task's twenty-six you routinely do, and the last
row (PiTFT 2.4) is exactly where you end up.

**Ruled out already, so nobody re-checks it**: this does not block anything. The sheet
scrolls (`overflow-y: auto`, `scrollHeight` 1499 against a 388 px sheet), every row can
be brought above the tab, and the drive placed a Pi 5 by touch from the Raspberry Pi
section at the bottom of the list with no trouble. It is also not row-count-dependent in
its *cause* — the same overlap exists with two rows — so it is a pre-existing
sheet-stacking question, not a regression. What is new is only how often you meet it.
Left as a judgment call rather than fixed here, because deciding how two bottom sheets
share one slot is a layout concern of its own and not this task's to settle unilaterally.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone: open the Library sheet with something selected, scroll to the bottom of the Raspberry Pi section, and judge whether the Inspector tab sitting over the last ~2 rows reads as broken or as ordinary sheet stacking. If broken, file it as its own `ui-*` task (inset the sheet's bottom padding by the tab's height, or collapse one sheet when the other opens). | Open | |
| 2 | Same viewport: confirm the two Model dropdowns are comfortable to operate with a thumb. They are 32 px tall rather than the rows' 44 px — a deliberate call so twelve extra controls don't cost twelve rows of height in a 46vh sheet, but 32 px is below the usual 44 px tap-target guidance and only a real thumb can settle whether that was the right trade. | Open | |

### ui-030 — hardware parts are much smaller than the primitives they share a grid with (2026-09-17 19:35)

Two visual/feel judgments that the acceptance drive surfaced but cannot settle, both
about *scale* rather than correctness — the geometry is right and dimensionally verified
against V1, and `ACCEPTANCE.md` scenarios 1, 2 and 5 already cover placement, selection
and the Inspector on a standing basis, so only what they cannot judge is logged here.

An M4 nut is about 8 mm across and an M6 washer about 12 mm, against a default Cube of
40 mm, and at the viewport's default zoom the nut and washer render as a few pixels each
(visible in the drive's own screenshot: the bolt reads clearly, the nut and washer are
specks). Nothing is wrong — those are the real sizes of those parts — but whether the
defaults should be bigger, or the camera should frame a newly-placed body, is a taste
call for a human at a real screen. The related, sharper consequence *is* already logged
where it belongs (a bolt inside a shell cannot be picked by clicking at all — scenario 5's
own entry, and `TODO/core-024`).

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | At the default zoom on a real screen, are a placed Nut and Washer big enough to see and to click, or should the Hardware rows' default specs be larger (or the camera frame what was just dropped)? | Open | |
| 2 | On a real phone and a real tablet: the Library sheet now holds eleven rows and Hardware is below the fold, so reaching Bolt is a genuine scroll inside a 46vh sheet. Does that scroll feel right with a thumb, or does the sheet want to be taller / the sections collapsible? | Open | |

### core-021 — a Y-axis bisect now names its halves the other way round (2026-09-17 13:56)

One entry, and it is a genuine judgment call rather than a restated pass. `core-021`
found that `core-019`'s straight `bisect` was wrong on the `y` axis — V1 builds that
one cut plane from a left-handed basis pair, so its `negative` is the **maximum**-side
half on `y` and the minimum-side half on `x`/`z`. The port now reproduces V1 exactly,
which is this project's standing rule and is fully covered by fixture cases on both the
straight and angled forms. What no test can decide is whether faithfully reproducing
what is almost certainly a V1 *oversight* is the right call for a human driving the
app, who has no reason to expect one axis to behave differently from the other two. The
alternative — "negative is always the lower side", diverging from V1 and documenting it
— is equally defensible and was not chosen unilaterally. Everything else this task
touched is covered: 848 unit tests, and `e2e/resize-bisect-operation.e2e.js` re-run
green including its real Y-axis cut.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Bisect a cube on **Y** in the running app, drill into each half, and judge whether `negative` landing on the far side reads as a bug. If it does, that is a decision to diverge from V1 — file it as its own TODO rather than patching it here | Issue | Decided without waiting for the hand-drive: the user judged it a real inconsistency at this task's own check-in (2026-09-17) and chose to diverge from V1 rather than keep it. Filed as `TODO/core-022-bisect-negative-always-min-side.md` |
| 2 | Read `docs/resize-bisect.md`'s new "a cut on **Y** names them the other way round" paragraph cold and judge whether it actually prevents the surprise, or just documents it after the fact | N/A | Moot once `core-022` ships — that paragraph is removed rather than kept, since there's no longer a per-axis exception to explain |

### core-018 — a broken Firefox toolchain, and two shapes no bounding box can judge (2026-09-16 23:28)

Step 6 re-drove five acceptance scenarios and re-ran two closed findings' repros, and all four
new recipes were evaluated through the real render bridge in both Chromium and WebKit (identical
triangle counts, all-finite vertex data, no page errors). What is left here is one environment
fault that needs a human on their own machine, and two judgments that are about whether a shape
looks *right*, which V1 agreement cannot settle — the port can reproduce V1 exactly and V1 can
still be a shape nobody wants to print.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Firefox will not launch in this environment at all** — `browserType.launch: Could not find profile folder`, failing all 276 firefox-project e2e tests. Confirmed pre-existing and unrelated to this task by reproducing it on a clean stashed tree at HEAD. Chromium and WebKit are unaffected (587 passed, 0 failed). Needs a human to decide whether the Playwright Firefox install is corrupt here only (`npx playwright install firefox`) or whether CI sees it too — until then, one of the three engines `CLAUDE.md` names as a real target is unverified for every task, not just this one. | Open | |
| 2 | **Does the `Spacer`'s diagonal cross-brace look right, and is it printable?** Its geometry reproduces V1 to 0.000000 mm³ and its angle is asserted against closed-form trigonometry, so it is provably the shape V1 makes — but nobody has looked at a picture of one. Worth a glance specifically at where the two mirrored bars cross near the centre and at the 3.0mm-rounded ends (V1 asks for 3.1 and is silently clamped): a brace that is correct and still has a sliver or a near-tangent overlap there is a print problem, not a geometry problem. | Open | |
| 3 | **Is the `hatStandoff`'s peg-through-pad the intended solid?** V1 unions a 2.8mm peg straddling z=0 with a 6.2mm pad, so the peg protrudes 1.5mm *both* above and below the pad rather than standing on it. That is faithfully ported and fixture-confirmed, but it means the part as built has a spigot on its underside; whether a real HAT standoff should be printed that way, or whether V1's shape assumes the underside gets cut by whatever it mounts into, is a call for someone who has handled one. | Open | |

### core-017 — one pre-existing rim-op limit, and a hidden-volume judgment call (2026-09-14 19:34)

The geometry needs no hand-check and is deliberately not listed below: every part of all
four small displays is diffed against real `jscad-raspberrypi@62a8e3b` bounding boxes in
`__fixtures__/raspberrypi.smallDisplays.v1-reference.json`, mutation-tested three ways, and
all four were rendered live in the viewport during Step 6 as genuinely drawn boards rather
than blank frames. What is left is one limit that predates this task and one call a bounding
box cannot settle.

Row 1 is the important one. It was **found by driving the app during this task's Step 6 but
is not caused by it** — it reproduces identically against `git show HEAD:src/core/kernel/
fillet.js`, verified directly. It is a genuine contradiction between `ui-027`'s stated
Interaction model and `fillet.js`'s `assertPrismaticBand` guard, and settling it is a product
decision (narrow the doc, or relax the guard for the cases where the band really is
prismatic) rather than a bug fix, which is why it is logged here instead of being fixed
inside a commit about display recipes.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | `ui-027` says "committing a *second* Fillet/Chamfer against a *different* face of the same, already-rounded body must work identically — nothing about this control is one shot per body." It is not so for a **perpendicular** face: fillet a 40mm cube's Top (+Z) at r=3, then try Chamfer on Right (+X) at r=2, and the popover shows *"the solid is not prismatic over the rim band — cross-section area changes from 1590.044mm² at the cut plane to 1481.431mm² at the face."* The guard is correct (the rounded top really does make the x-section non-prismatic) and it fails loudly rather than returning wrong geometry, so nothing is unsafe — but the documented promise is wrong as written. Decide which side moves, and file the follow-up: narrow `docs/fillet-chamfer.md` and `ui-027`'s wording to "a different face, provided the band is still prismatic", or teach the guard to accept a band whose section change is itself the previous rim op. Note the *opposite* face (`z-` after `z+`) should still work — worth confirming while you are here. | Open | |
| 2 | `miniPiTFT`'s `display-clearance` is the catalogue's first **outward-flared** volume (V1's `.chamfer(-5, 'z+')`) — a frustum 10mm wider at the top than the display it protects. It is hidden geometry, so nothing renders it and no acceptance scenario can see it. Once something consumes clearance volumes for real (an enclosure generator, or a Library row that can place one visibly), eyeball the flare against a real Adafruit Mini PiTFT: is a 5mm-per-side draft over the top 5mm actually the clearance a printed case wants, or was V1's number chosen for a different bezel? The port reproduces V1 exactly either way; this is asking whether V1 was right. | Open | |
| 3 | `fillet.js`'s cross-section is read through `project`, whose `unionGeom2` round-trip inflates the outline by a shape-dependent ~6e-6 to 6e-5 mm. Harmless and invisible on an inward rim (it lands inside the remainder), and the reason `display-clearance` is compared to V1 at 4 decimal places rather than the 9 every other part uses. If a future task ever needs a rim op accurate to better than a micron — or starts stacking outward flares, where the error would compound — this is the place it comes from, and the fix is a section reader that does not round-trip through `unionGeom2`. Nothing to do today; recorded so the next person does not rediscover it from scratch. | Open | |

### core-016 — the touch-display attachment a user cannot yet perform by hand (2026-09-13 19:50)

The geometry needs no hand-check and is deliberately not listed below: every part of both
screens is diffed against real `jscad-raspberrypi@62a8e3b` bounding boxes in
`raspberrypi.touchDisplay7inch.spec.js` / `raspberrypi.touchScreen2.spec.js`, that diff
was mutation-tested so it cannot be a test that never bites, and Step 6 drove the whole
assembly live in the running app — a real `raspberrypi.bplus` plus each real screen,
attached with the sub-part-addressed `group.align`/`group.snap` records, matching V1 to
1.4e-14 mm. `TODO/ACCEPTANCE.md` scenario 3 now carries that as a standing check, so it
is not restated here.

What is left is one real gap and two judgment calls no bounding box can settle.

Row 1 is the important one. This task's whole design is that the board-attachment step
becomes *the user's own* `ui-026` Snap/Align action — but the popover states, in its own
copy, **"Whole-object snap/align only — sub-part addressing isn't available yet."**
`core-013` registered `pieces` and the kernel honours it (proved live), but no UI builds
such an operand, so a user can snap the screen to the Pi as whole objects and cannot say
"this mounting pad against that hole". That is the same standing blocker scenario 5
records as its "Blocker 2", now reached from a second direction, and it is the difference
between this recipe pair being *usable as designed* and merely *correct*. It wants its
own `ui-*` task rather than another VERIFY row next time it is noticed.

Row 2 is the `noGoPower` narrowing, which is exact for the case V1 itself produced and
only diverges outside it — worth one look by someone who actually designs enclosures,
since they are the only person who can say whether the frozen offset matters.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Snap/Align cannot address a sub-part from the UI, so the board attachment this task is designed around is reachable only through the command layer. Confirm the gap, then file it as its own `ui-*` task (sub-part operands for `group.snap`/`group.align`, feeding off `ui-016`'s pick-depth selection) rather than logging it here again. | Open | |
| 2 | `raspberrypi.touchScreen2`'s hidden `noGoPower` marker is frozen at the offset a stock B+ at the stock attachment datum produces (zero divergence from V1 there, asserted). Judgment call for whoever designs a real enclosure: does a marker that no longer tracks the header on a non-stock board cause a real problem, or is the frozen constant fine? If it is a problem, that is revival condition #2 in `docs/decisions/composite-recipe-geometry.md` (reopen recipe nesting), not an ad-hoc fix. | Open | |
| 3 | Both screens are large parts (193×111 mm and 143×91 mm) next to a 85×56 mm board. Eyeball on a real phone and tablet whether a freshly placed screen frames sensibly at the default camera distance, or whether it arrives clipped/oversized enough that a Library row for these would need its own framing behaviour. | Open | |

### core-015 — three camera-module judgment calls a bounding box cannot answer (2026-09-13 19:15)

The geometry is not in question and needs no hand-check: every part of all five variants
(plus the flipped HQ) is diffed against the real `jscad-raspberrypi@62a8e3b` library's own
bounding boxes in `raspberrypi.cameraModule.spec.js`, that diff was mutation-tested so it
genuinely bites, and a v3 and an HQ were both rendered in the real viewport during this
task's Step 6 drive. What is left is three things a number cannot settle — two of them
*port decisions with no V1 precedent to check against*, which is what separates them from
`core-014`'s row 1 below.

Nothing here belongs in `TODO/ACCEPTANCE.md`: no scenario can reach this recipe yet (there
is still no Hardware/Kit Library row to drag a camera from), and all three are one-time
looks rather than standing checks.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Render each of the five models and eyeball them against the real cameras (or V1's own `test/images/create a camera v*.snap.png`): do the sensor, lens barrel, ribbon and mount read as the right parts in the right places to someone who knows the hardware? The fixture proves the port matches *V1*; it cannot prove V1 was right. | Open | |
| 2 | Confirm `DEFAULT_MODEL = 'v3'` is the right default. This is a **port decision with no V1 answer to check against** — V1 ships five separate factories and no shared entry point, so nothing was carried over here. `v3` was chosen as the current-generation standard camera and to keep the op usable with no params, like every sibling composite. If a different default (or requiring `model` outright) is wanted, it is a one-line change in `raspberrypi.cameraModule.js`. | Open | |
| 3 | Confirm which way `flipTripodMount` should default for the HQ camera. V1's `HQCameraModule(flipTripodMount = false)` gives the name but not the intent; measured here, `true` raises the tripod post in z relative to the mount block (`3.68..15.18` vs `-0.2..11.3`). Whether the `false` default matches how a real HQ camera's tripod boss actually sits needs the hardware in hand. | Open | |

### core-014 — two judgment calls only a Raspberry Pi owner can settle (2026-09-13 18:44)

The geometry itself is not in question and does not need a hand-check: every one of the
115 parts across models 2/3/4/5 is diffed part-by-part against the real
`jscad-raspberrypi@62a8e3b` library's own bounding boxes in
`raspberrypi.bplus.spec.js`, matching to 1.4e-14 mm, and the board was rendered in the
real viewport during this task's Step 6 drive. What is left is two things a number
cannot answer, both deliberately chosen rather than discovered, and both needing an eye
that knows the actual hardware — which is this project's own author (they wrote
`jscad-raspberrypi`).

Neither belongs in `TODO/ACCEPTANCE.md`: no scenario can reach this recipe yet (there is
no Hardware/Kit Library row to drag a Pi from — see the retired task's Interaction model
section), and row 1 is a one-time look, not a standing check.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Render a `raspberrypi.bplus` at each model and eyeball it against a real board (or V1's own `test/images/create a bplus.snap.png`): do the connectors read as the right parts in the right places to someone who knows the hardware? The diff proves it matches *V1*; it cannot prove V1 was right, and V1's own dimensions were eyeballed with the `dimCheck` rulers this port drops. | Open | |
| 2 | Decide whether the board should render **drilled**. V1 assigns `group.holes`, so its combined board has the four mounting holes cut through it; this port carries them as hidden `hole1`-`hole4` parts only, because no `OpRecord` field reaches `group.js`'s `addHole` (see the retired task's deviation 2). The board therefore renders solid. If drilled is wanted, it needs either a record-level hole flag or a `boolean.subtract` in the recipe — file whichever as its own TODO. Note V1's own subtraction also carves the micro-USB shell, which overlaps `hole1`, so "match V1 exactly" is probably not the right answer. | Open | |

### ui-029 — a frozen field's affordance, and a second kernel-error surface (2026-09-12 22:05)

Editable Inspector parameters are functionally verified (unit suite, the full 9-way
e2e matrix, and a hand-drive at laptop/Chromium, laptop/Firefox and phone/WebKit that
moved `ACCEPTANCE.md` scenario 2 off its long-standing PARTIAL blocker). Two things
left over turn on human judgment an automated check cannot render, and both are
deliberately *shared* with `ui-027`'s entry above rather than diverging from it —
if either is changed, both surfaces should move together.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | A body carrying a Fillet/Chamfer has its **Parameters** fields frozen, with a note naming the op. The note is legible and correct at all three reference widths (checked). What is *not* settled: whether a frozen field **looks** frozen at a glance before anyone reads the note. The only visual difference is `:read-only`'s `color: var(--text-2)` against `--text-1` plus the absent `--editable` border, which in the laptop screenshot is subtle enough that the Diameter box reads much like an editable one. Decide on a real screen whether that needs a stronger treatment (dimmed ground, a lock glyph) — and if so, apply it to *every* read-only field in the panel (Size, sub-part Transform), not just this case | Open | |
| 2 | The Inspector's kernel-error message reuses `ui-027`'s convention verbatim, which means it also inherits its wording problem: a rejected diameter shows `document.append: primitive.cylinder could not be applied — primitive.cylinder: height must be a positive number of millimetres, got 0`. The second half is genuinely useful; the `document.append:` prefix and the repeated op key are internals leaking into a user-facing panel. Judge on a real screen whether to strip the command-layer prefix at the display boundary — this is the same row as `ui-027`'s own error-wording check, and the fix belongs in one shared place now that there are two surfaces showing it | Open | |

### ui-027 — icon-only phone toolbar, and the first user-facing kernel-error message (2026-09-12 15:58)

Two things this task shipped are functionally verified (headless e2e, all three
engines and viewports, plus a hand-driven check against the real dev server) but
turn on human judgment an automated check can't render:

1. Adding Fillet/Chamfer made the Operations toolbar's phone-width layout run out of
   vertical room — 4 wrapped rows of 2 buttons reached into `NavigationChrome`'s own
   space once the Inspector sheet pushed it up on selection (measured: `y≈242` vs.
   the chrome's `y≈207`). The fix hides each button's text label below 640px width,
   leaving icon + `title`/`aria-label` only — the same `--tap-compact` square-icon
   pattern `NavigationChrome.vue` already uses at its own breakpoint, not a new one.
   Confirmed this clears the collision and that every `*.e2e.js` spec covering this
   toolbar still passes at phone width. Not confirmed: whether eight bare glyphs
   (∪ − ∩ ⊞ ⇥ ⇔ ◠ ◢) are actually *identifiable* at a glance on a real phone, or
   whether they read as an opaque row of symbols until tapped once.
2. `commitFilletChamfer`'s catch block is this toolbar's first path that shows a
   *thrown kernel error* to the user (every op before this validated only shape, not
   a value like radius-vs-solid-size) — a plain `<p>` inside the popover, unstyled as
   an alert (this codebase has no `--danger` token yet — see the CSS comment). Its
   *existence* and *trigger condition* are e2e-tested; its wording
   (`fillet.js`'s own `Error` message, e.g. `"modify.filletRim: radius 45mm must be
   less than the solid's 40mm extent along the axis"`) has not been read by anyone
   who didn't already know what it meant.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real phone, glance at the Operations toolbar with a body selected (all 8 icon-only buttons visible) *before* reading any documentation. Can you guess what Fillet (◠) and Chamfer (◢) do from the glyph alone, or only from `title` on long-press? If it's illegible, a future task should swap in real SVG icons rather than Unicode glyphs. | Open | |
| 2 | Trigger the radius-too-large error (Fillet a face with a radius at or past the solid's own extent) and read the resulting popover message as a first-time user would, not as the person who wrote it. Does "radius 45mm must be less than the solid's 40mm extent along the axis" make sense without already knowing what `fillet.js` means by "extent along the axis"? | Open | |

### ui-020 — sketch mode on real touch hardware, and the lines' lifetime (2026-09-12 17:35)

Scenario 9 now covers sketch mode's whole flow on a standing basis, and the Step 6
drive already measured the layout numerically at all three reference viewports
(bounding-box collision checks against the orientation gizmo and nav chrome, plus a
10×10 hit-test grid of how much canvas is actually reachable — 69% at phone width in
sketch mode). What that *cannot* settle is fingertip precision and the feel of a
drawing gesture, neither of which a synthetic pointer or a headless engine reproduces.
Rows 1-2 are that. Row 3 is a limitation this task knowingly ships rather than a thing
to judge.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real phone and iPad, draw several lines in a row with a fingertip. Is the 14px pick tolerance (`SKETCH_PICK_TOLERANCE_PX`) enough to reliably *select* a thin line by tapping it, and are the 11px endpoint handles grabbable without zooming in first? A fingertip contact patch is far larger than either number, and both were tuned against a mouse. | Open | |
| 2 | On the same hardware, judge whether the drawn stroke reads clearly against the grid in **both** colour schemes — the line is `--sketch-stroke` (a bright cyan) and the grid's major lines are close in weight. A stroke that disappears into the grid on a sunlit phone screen is the same class of defect as the second attempt's too-dark scene, and the only device that can answer it is a real one outdoors. | Open | |
| 3 | Confirm the missing-delete story is acceptable for now: there is **no way to delete a sketch line**, so a mis-drawn line stays for the session (`docs/sketch-mode.md` says so out loud under "Coming later"). Undo/redo does not exist yet either, so this is not an oversight specific to sketching — but sketching is the first feature where a user can create clutter in one careless gesture. If it grates in practice, that is a signal to pull a delete/undo task forward rather than leave it to the sketch-tools milestone. | Open | |

### ui-026 — Snap/Align operation (2026-09-11 20:20)

The Snap/Align popover is a **modal-style overlay with a full-page, click-catching
backdrop** — a departure from `ui-019`'s row-anchored gear popover, forced by a real
phone-width collision with `NavigationChrome` (see the retired TODO's own note and
`OperationsToolbar.vue`'s `.ops__popover` CSS comment for the mechanics). Functionally
verified by headless Chromium and Firefox/WebKit-equivalent hit-testing (a real click
on a background control while the popover is open is genuinely blocked), but the
*feel* of a centred modal appearing over the viewport — rather than growing out of the
button the way every other popover in this app does — hasn't been judged on real
phone/tablet hardware.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On real phone/tablet hardware, open Snap/Align and judge whether the popover reads as "this button opened a thing" or as a jarring, disconnected overlay. | Open | |

### ui-016 — look at `hardware.bolt` and `kit.anchor` on screen the moment they get Library rows (2026-09-11 20:02)

`ui-016` changed how **every** Group-valued body is rendered: one mesh per named part
instead of one mesh built from `combine()`, which is a CSG union. That union used to
merge parts that interpenetrate into a single clean surface; separate meshes do not, so
two overlapping parts can show a seam or z-fight along their shared boundary.

This is not a hypothetical. Measured during this task's regression check rather than
assumed, by comparing each composite's per-part boxes:

- **`hardware.bolt`** — its visible `tap` part overlaps *both* `head` and `thread`.
- **`kit.anchor`** — its `hole` part overlaps `post`, and the two share a **coplanar
  face** at `y = -5`, which is the worst case for z-fighting specifically.

Every other composite is clean (`kit.board`, `hardware.washer`: one visible part each;
no group anywhere carries `holes`, so the combined-mesh fallback never triggers today).

**Why this is a manual item and not a spec or a scenario**: neither composite is
reachable from the Library — the Hardware and Kit sections are M2 — so nothing a user
can place today renders through the overlapping path at all, and there is no scenario
that could drive it. It is also a pure *visual* judgment: "does this read as one part
or as two badly-drawn ones" is not a number a test can assert. `ACCEPTANCE.md`
scenario 5 (the bolt's tap clearance) is still marked NOT DRIVEABLE for the same
reachability reason, so it does not cover this either.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | When `hardware.*` / `kit.*` get Library rows (M2), place a **Bolt** and an **Anchor**, orbit right around each one, and look for a seam or flickering surface where `tap` meets `head`/`thread` and where `hole` meets `post` — at all three reference viewports, and in WebKit as well as Chromium (depth-buffer precision differs between engines, so a z-fight can be engine-specific). If either reads badly, the fix is documented at `createBodyObject` in `src/render/mesh.js`: fall back to the combined mesh for that body — trading its pick depth for a clean surface — rather than re-unioning every group and losing pick depth for the ones that never needed it. | Open | |

### core-020 — the snap radius is wider than the parts, so two solids cannot be drag-placed *partially* overlapping (2026-09-10 22:25)

Found while driving `ACCEPTANCE.md` scenario 4 during `core-020`'s Step 6. Not a
regression and not this task's code — `ui-013`'s snap, behaving as specified — but it
makes a scenario step unperformable as written, and the failure it produces looks exactly
like the bug `core-020` just fixed, which is why it is worth a human's eyes rather than
another assertion.

At the default camera distance the snap engagement radius is 48 px converted to mm, which
scenario 3 already measured at **~83.7 mm** — *wider than a 40 mm cube*. So dragging a
second cube anywhere near the first does not give a partial overlap; it pulls the ghost
into **exact coincidence** (both bodies measured at `-21.62,-21.62,20.00`). Subtracting
two coincident solids then returns an empty body, correctly — but on screen it reads as
"Subtract deleted my model". Scenario 4's step 1 ("drag two solids into the viewport so
they overlap") therefore cannot be performed by drag alone at default zoom; five taps of
zoom-in shrinks the radius enough, and that is how the 29 484.3 mm³ result recorded
against scenario 4 was actually reached.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Judge, by hand on real hardware, whether the snap should refuse a *centre-on-centre* alignment when both solids are already within each other's bounds — or whether an overlapping drop should snap to a face rather than a centre. This is a feel question about what a user means by dropping a part on top of another one, not a numeric one. | Open | |
| 2 | Related and cheap to check at the same time: whether an empty boolean result should say so out loud (a toast, or a refusal) rather than silently leaving a `0 × 0 × 0` body in the scene list. Two coincident operands are the common way to reach it by accident. | Open | |

### ui-014 — a *nearly* coplanar subtract reports the uncut size (2026-09-10 17:20)

Not a feel question and not `ui-014`'s own code — pre-existing `@jscad/modeling` numerics,
reachable since `core-001` — but it surfaces *through* the new Operations toolbar, it is
not covered by any acceptance scenario (scenario 4 measures volume, which is correct), and
it is the kind of thing only a human reading the panel would notice. Logged with the
measurement so nobody has to rediscover it.

When two solids' faces are **nearly but not exactly** coplanar, `boolean.subtract` leaves
paper-thin sliver polygons along those faces, and the slivers keep the result's bounding
box at the **uncut** extent. The material really is removed — the volume is right — but the
three dimension lines and the Inspector's Size row quote the original size, which is the
number a user would actually read and act on.

Measured, two 40 mm cubes overlapping 20 mm, in Chromium:

| faces | polygons | volume (expect 32 000) | reported size |
|---|---|---|---|
| exactly coplanar | 6 | 32 000 | 20 × 40 × 40 ✅ |
| clearly non-coplanar | 6 | 32 000 | 20 × 40 × 40 ✅ |
| **off by ~0.001 mm** | **10** | **32 004.54** | **40 × 40 × 40** ❌ |

The near-coplanar case is not exotic: it is what you get by **typing a rounded coordinate
for one body against another that was dragged into place**, which is exactly how a user
lines two things up. Reached in `ui-014`'s own drive without trying to.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Decide whether this is worth its own finding (a tolerance-snap on operand coordinates, a post-boolean sliver cleanup, or measuring the result some way other than its raw bounding box) or is acceptable as-is. Judge it by dragging two cubes into rough overlap by hand and typing a round position for one of them, then reading the dimension lines against the shape actually on screen. | Open | |

### ui-014 — the Inspector shows an empty PARAMETERS heading for a boolean result (2026-09-10 17:20)

Cosmetic, one-off, and genuinely a judgement call rather than a defect. A boolean result
has no creation parameters, so selecting one leaves the Inspector's **PARAMETERS** section
header standing over nothing, with the Transform section below it. It is not wrong — the
body really has no parameters — but an empty labelled section reads as something that
failed to load.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Look at it and decide: hide the header when a body has no params, or say something in the empty space ("this shape was built from others"). Visible in the drive's `Subtract 1` screenshot. | Open | |

### ui-013 — does a 48 px snap radius *feel* right on real hardware? (2026-09-09 13:12)

A feel judgement, not a correctness question. `SNAP_TOLERANCE_PX = 48` is pinned by unit
tests and its zoom behaviour was measured during the drive (engagement shrank from 83.7 mm
apart at camera distance 420 to ~7 mm at 110, so zooming in genuinely buys finer control),
but "is the assist helpful or grabby" is the one thing neither a test nor a headless
screenshot can answer. At default zoom on a laptop the guides start about 80-110 px out;
on a phone about 60 px.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real phone and a real iPad, drop three or four solids near each other in a row and judge whether the snap helps or fights you — in particular whether you can still place something deliberately *just* beside another part without it jumping flush, and whether a fingertip's own imprecision makes 48 px feel too small rather than too large. | Open | |
| 2 | Look at the magenta guides on a real screen against the dark grid, at an angle and in daylight. They were chosen (over `--accent`) on a desktop screenshot, where they read clearly; a phone at low brightness is the case that screenshot can't stand in for. | Open | |

### ui-024 — marquee drag feel on real touch hardware (2026-09-07 18:41)

A device-specific quirk, not a correctness question — `e2e/selection-inspector.e2e.js`'s
new marquee tests run across all three engines at all three reference viewports
including phone/tablet, but Playwright's touch emulation dispatches synthetic
`PointerEvent`s directly; it does not reproduce a real capacitive touchscreen's own
scroll-suppression, momentum, or contact-area quirks. Not covered by a standing
`TODO/ACCEPTANCE.md` scenario (scenario 7, touch-only navigation, predates this
control and doesn't cover selection).

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real phone/tablet, tap the nav chrome's **Select** button, then drag a finger from empty grid space: the box should track the finger smoothly with no visible lag, and the gesture must not also scroll the page or trigger the browser's own pull-to-refresh/back-swipe — `touch-action: none` is already set on the canvas for orbit/pan (`ui-018`'s own fix for exactly this class of bug on iPad), but the marquee is new code sharing that same element, not a guarantee it inherited by itself without a real device confirming it. | Open | |
| 2 | Confirm the **Select** button itself is comfortably tappable at phone width next to the existing Orbit/Pan buttons — the chrome row grew by one button for this task, and only a bounding-box assertion (`>=36px`) checked size in e2e, not whether three adjacent small buttons are comfortable to hit accurately with a real thumb. | Open | |

### ui-021 — gradient/shadow subtlety at the gizmo's floor size, and on real touch hardware (2026-09-07 17:09)

A visual/feel judgment call, not a correctness question — the e2e spec asserts the
gradients and shadow filter are actually wired up (real `<defs>` entries, real stop
colours, three genuinely distinct axis hues), and a hand-drive at laptop width in
Chromium/Firefox/WebKit confirmed the effect renders and doesn't break hit-testing. What
that drive could not judge: whether the effect still *reads* as 3D shading, rather than
disappearing into noise, at the extremes this task's own Testing section flagged as
worth a second look.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | At the gizmo's floor size (58px arm / 40px ring, `ui-017`'s minimum — the size most selections actually render at on an average-sized part) the gradient's highlight band is only a few pixels wide. Screenshots taken during this task's own drive looked fine at 1440×900 desktop resolution, but that is not the same claim as legible on a real phone/tablet screen's pixel density and viewing distance — CLAUDE.md's Responsive Layout section asks for real on-device hand-testing, not just a Chromium viewport emulation, and this task's own drive was desktop-emulation only. | Open | |
| 2 | The double-stroke ring "tube" cue (a dim gradient band plus a thin bright core, both drawn from the same points) is the subtlest of the three techniques used here — worth a specific glance on a real device to confirm it doesn't just look like a slightly-thicker single ring, which would mean that particular technique earned its added draw call for nothing. | Open | |

### ui-022 — ring arrowhead legibility at phone width and at the gizmo's floor size (2026-09-07 16:17)

A visual/feel judgment call, not a correctness question — the maths is asserted exactly
in `annotate.spec.js` and the e2e spec confirms the markers render, but neither can judge
whether the chevrons *read* as an arrow to a person rather than as a stray dot once the
gizmo shrinks. Not a standing acceptance scenario: scenario 2's gizmo-drag half checks
that dragging still works, not how the ring's own decoration looks at a given size.

`ringArrowheads`' size (`RING_ARROW_SIZE_RATIO = 0.16` of the ring's own screen radius)
was only eyeballed at laptop width against a body sized comfortably above the gizmo's
58px/40px floor (`ui-017`). Two cases that ratio was never looked at:

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | At phone width (390×844), with the ring at or near `GIZMO_RING_FLOOR_PX` (40px) — confirm the two chevrons per ring are still individually distinguishable as arrows, not a single blob, at a real fingertip's viewing distance. | Open | |
| 2 | On a heavily edge-on ring (camera looking nearly along that axis, e.g. after a standard-view snap) — confirm the chevron near the ring's collapsed end doesn't visually merge into the ring's own line. | Open | |

### core-004 — how a rotation number wrapping past ±180° feels mid-drag (2026-09-06 19:18)

A feel judgment about a number on screen, not a correctness question, which is why it is
here rather than an acceptance scenario: the geometry is right either way, and scenario 2
already checks the *sizes* on a standing basis.

The carried rotation is now canonical — yaw and roll in `(-180, 180]`, pitch in
`[-90, 90]` — instead of a running total. That is what makes a typed absolute rotation
and a dragged one comparable at all, and it is inherent to any faithful representation
(a quaternion decomposes the same way). But it means a ring dragged steadily past half a
turn makes the Inspector's number flip sign — `179°` to `-179°` — rather than counting
on to `200°`. The same is true of the two angles that are not being dragged: they can
move on their own during a single-ring drag, because the composed orientation genuinely
has components on all three axes.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Drag one rotate ring slowly through more than half a turn on a laptop and watch the Rotation fields. Does the sign flip read as the app losing track, or as an obviously-equivalent way of saying the same angle? If the former, the fix is a display concern (an unwrapped "turns" readout, or holding the pre-drag branch for the duration of a gesture), not a change to what is stored — file it as its own `ui-*` finding. | Open | |
| 2 | Same drag on the phone (390×844), where the fields are in a bottom sheet and a thumb is over part of the viewport, so there is less peripheral context for what the number is doing. | Open | |

### ui-023 — legibility of diagonal dimension lines on a tilted part (2026-09-06 19:02)

Purely a visual/feel judgment, which is why it is here and not an acceptance scenario:
the numbers themselves are now correct and are checked on a standing basis by scenario 1's
rotated-body half.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Tip a cylinder over about 60° and look at it on a **phone** (390×844). At laptop width the three lines are clearly readable, but they now run diagonally *through* the gizmo's rotate rings rather than sitting square around the silhouette, and the laptop screenshot is already a little busy where a `40 mm` label crosses a ring. Judge whether the labels stay readable at phone width, or whether the lines want a larger offset (`DIMENSION_OFFSET_PX` in `Viewport.vue`) once they are no longer axis-aligned. | Open | |
| 2 | While there: two of the three labels can end up close together when a rotation lines two local axes up on nearly the same screen direction (the degenerate case covered numerically in `annotate.spec.js`). The maths is right and the lines are separated by the perspective divide, but whether that separation is *enough* to read at phone size is an eye judgment no assertion makes. | Open | |

### build-002 — Fix bright white flash before first paint (FOUC) on app load (2026-09-06 18:22)

One entry. The TODO's own Testing section asked for the throttled-load re-check to be
done "by eye" specifically because the defect is a paint-timing race that a numeric
assertion can approximate but not fully stand in for. What was actually run was a
Playwright script (Chromium/Firefox/WebKit) that delays JS/CSS responses by 2s and
samples the `<html>`/`<body>` computed background color and the `color-scheme` meta's
presence 150ms after navigation commit — confirming the dark background (`#10131a`)
and the meta tag are both already in place well before the delayed resources resolve,
on all three engines. That is a solid proxy for "the race is closed," but it is not the
same as a human actually watching a real Slow-3G-throttled load in DevTools and judging
whether any white frame is perceptible to the eye — a synthetic 150ms sample can miss a
one-compositor-frame flash that a live visual watch would catch, and Playwright's route
delay doesn't reproduce a real mobile network's connection-setup latency.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Watch a real Slow-3G + 4x-CPU-throttled load in Chrome/Firefox/Safari DevTools by eye**, on a real machine, and confirm no white frame is visible between navigation and the dark UI appearing — per the TODO's own Testing section, this matters most for WebKit/Safari specifically, since this defect is very plausibly the same white-flash bug both previous attempts shipped on iPad/Safari. | Open | |

### ui-018 — Shift+left-drag or right-drag pans the viewport (2026-09-06 16:08)

One entry, a real trackpad/mouse-hardware feel judgment the automated suite and the
hand-drive (both driven through synthetic `PointerEvent`s at fixed pixel deltas) cannot
make. Everything *functional* — Shift+left and right-button both pan regardless of the
chrome toggle, a Shift+left click with no real drag still additively selects, the
native context menu is suppressed, and a plain left-drag still follows the toggle
unchanged — is now covered on a standing basis by `TODO/ACCEPTANCE.md` scenarios 1 and
7, so none of it is restated here.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Right-button drag on a laptop trackpad with no physical right button.** Most trackpads synthesize a right-click via a two-finger tap/click-and-hold rather than a true held "button 2" during a drag, and some trackpad drivers only fire `button: 2` on the initial press, not on subsequent `pointermove` events during the drag. Try an actual two-finger-click-and-drag on a real Mac trackpad and a real two-button mouse and confirm both actually pan smoothly for the drag's whole duration, not just flicker into pan mode for the first frame (the constant to check is `pressButton` in `src/components/viewport/Viewport.vue`, captured once at `pointerdown`). | Open | |

### ui-012 — Gizmo move/rotate ↔ numeric-field sync (2026-09-06 13:09)

Two entries, both feel judgments the acceptance drive genuinely cannot make. Everything
*functional* about this task — the fields tracking a drag live, a typed value moving the
mesh, and above all "exactly one body after a move" — is now covered on a standing basis
by `TODO/ACCEPTANCE.md` scenarios 1 and 2, so none of it is restated here.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **The dimension lines do not turn during a rotate-ring drag.** They track a *translate* drag exactly, but during a rotation the preview keeps the body's axis-aligned bounding box and only settles onto the real turned bounds on release (`src/composables/useSelectedBody.js` says why: the true bounds of a partly-turned solid need the kernel to rotate it, which is precisely the per-frame work the preview exists to avoid). Functionally correct, and the numbers are right the instant you let go. The open question is whether it *reads* as broken mid-drag — three dimension lines visibly not following the solid they annotate — or whether nobody notices because they are watching the solid. Judge it by eye on a Cube at laptop width; if it reads badly, the cheap fix is hiding the lines while a rotate preview is active, not measuring the turned solid every frame. | Open | |
| 2 | **Rotate-ring drag feel under a real finger.** A ring drag maps the pointer's sweep *around the gizmo hub* to degrees, so how much rotation a given finger movement produces depends on how far out from the hub you grabbed — near the hub a small movement spins it fast. That is the correct dial behaviour and it felt fine with a synthesised pointer, but a fingertip has contact area and lands less precisely than a mouse: the driven sweeps produced about −52° at laptop width and about −105° at phone width for the same 70px gesture, purely because the fatter phone hit target moves the effective grab point. Try it on a real iPhone and iPad and say whether the phone case is too fast to control; if it is, the fix is clamping the effective grab radius in `rotateDeltaDeg`'s caller, not shrinking the touch target back down. | Open | |

### ui-011 — Selection → inspector + dimension lines + gizmo (2026-09-06 01:22)

One entry. The two *structural* defects this task's acceptance drive found — the two
bottom sheets stacking, and the nav chrome sitting behind the sheet's edge — were fixed
in the task and re-driven, so they belong in `TODO/ACCEPTANCE.md`'s scenario 2 note, not
here. What is left is a genuine visual judgment call that no assertion can settle.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Dimension-label collisions at phone width.** The three labels are placed at each dimension line's midpoint, pushed outward from the solid's screen centre (`updateDimensionAnnotation` in `src/render/annotate.js`). That keeps them off the solid, which is the hard part — but nothing stops one from landing under the orientation-gizmo card in the top-right corner, and at 390px that card is large relative to the screen. It happened once in the drive: the X label drifted behind the card while the camera was near the home view on a body placed high in the viewport. Nothing was *wrong* — the number is also in the Inspector's Size row — but it looks untidy. Worth a few minutes of orbiting on a real phone to judge whether this is rare enough to leave, or whether the labels want a simple clamp inside a safe area. Do not reach for a general label-collision solver before deciding it is actually a problem. | Open | |

### ui-010 — Drag-place a primitive (2026-09-06 00:58)

One entry only. The scenario-1 drive covers whether placement *works*; what it cannot
cover is whether the gesture feels right under a real finger, because every drag in
that drive was a synthesised `PointerEvent` sequence with no contact area, no
momentum, and no chance of the sheet being in the way of the hand holding it.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Sheet-to-viewport drag on real phone hardware.** At 390px the Library is a bottom sheet, so the drag starts near the bottom of the screen, crosses the sheet's own edge, and has to end up somewhere in the visible strip of grid above it — a path that only exists at phone width and that no other gesture in the app takes. Try it on an actual iPhone: is there enough uncovered viewport above the open sheet to drop into comfortably, or does the sheet want to be shorter (its `max-height` is `46vh` in `src/components/layout/LibraryPanel.vue`)? Does the translucent ghost read clearly against the grid at that size, or does a thumb cover it entirely? | Open | |

### render-001 — App shell + viewport scaffold (2026-09-05 21:10)

Both items are physical-hardware feel judgments that the scenario-7 drive cannot make
for itself: an emulated 820×1180 WebKit context registers a tap or a drag perfectly,
where a real finger has contact area and a real wrist has momentum.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Orbit sensitivity on a real touchscreen.** Drag speed is a fixed 0.4° of orbit per pixel, slightly faster than three.js's own OrbitControls default at this viewport height. In the driven pass a single 260px diagonal swipe rotated ~104° and parked the camera flat against the top-down pole — correct clamping, but possibly too twitchy in the hand. Try a few casual swipes on an iPhone and an iPad and say whether it wants lowering (the constant is `ORBIT_DEG_PER_PX` in `src/components/viewport/Viewport.vue`). | Open | |
| 2 | **Orientation-triad cap tap targets.** The six axis caps are 32px (30px at phone width) rather than the 44px used for the navigation chrome — six 44px targets will not fit a 116px dial without overlapping. The e2e matrix proves they are hittable at their centres; what it can't tell us is whether a thumb reliably picks the intended cap when two are visually adjacent. If it doesn't, the fix is a bigger dial at touch widths, not bigger caps in the same space. | Open | |

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
