# LinkedIn Posts

## [2026-09-05T16:20:34Z] — Kickoff commit: third CAD attempt + geometry kernel decision

**Post:** Starting a third build of a browser-based parametric CAD app, and this kickoff commit leads with two retrospectives instead of a feature list.

The first attempt built well-tested components that never got assembled into a working app. The second fixed that, then shipped a version where every automated test passed and a real user still couldn't get sketch mode to open — a concrete lesson in the gap between "the code does what its own test asserts" and "a human can actually drive it."

This kickoff writes both lessons directly into the process docs: a fixed set of human-driven acceptance scenarios instead of an ever-growing manual checklist, per-task reachability gates, and JSCAD V3 as the geometry kernel — chosen for direct continuity with three existing hand-maintained libraries rather than on raw technical merits alone.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #SoftwareEngineering
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** This is the repo's first commit → `git log` this session ("does not have any commits yet"); sketch mode / passing-tests-but-broken-app failure → `SECOND-ATTEMPT.md` (diff); JSCAD V3 chosen for continuity with existing libraries → `docs/decisions/geometry-kernel.md` (diff)
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-05T16:27:47Z] — Recorded the no-CRDT-for-v1 document-sync deferral

**Post:** Sometimes the right architectural decision is explicitly not deciding yet — as long as you write down why.

WarpCad's document model is an append-only action log with a single writer, so there's no concurrent-edit problem to solve today. Rather than bolting on a CRDT for a scenario that doesn't exist, I recorded the deferral itself: what makes single-writer safe now, and the one condition (a remote AI session editing concurrently with a human) that would reopen the question.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #SoftwareEngineering
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Document model/sync row stays Open, not resolved → `TODO/docs-002-document-sync-decision.md` Goal section; revival trigger is concurrent MCP+human editing → `Initial design.md` §1 and `CLAUDE.md` AI Partner section; undo/redo transaction-origin scoping requirement → `CLAUDE.md` Architecture section
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-05T17:05:00Z] — Interaction-model Q&A for the six core controls (TODO/ui-001)

**Post:** Before writing a single roadmap task for WarpCad's UI, I answered a fixed set of interaction-model questions for each of its six core controls — drag-to-place, selection, gizmo sync, boolean gating, and group sub-part picking. Every one gets an exact precondition, trigger, and feedback contract, plus concrete phone-width behavior.

This caught a few real gaps: the design mockups never specified a numeric Transform panel for gizmo sync, never committed to whether the mobile inspector opens automatically on selection, and never showed how a Subtract operation indicates which selected solid is the base. Small details, but exactly the kind that turn into ambiguous bugs later.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #SoftwareEngineering
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Must exist before ROADMAP.md names tasks → `CLAUDE.md` Working Files section; Transform-panel/phone-auto-open/Subtract-indicator gaps → diff (`docs/decisions/interaction-model-qa.md`) vs. `Initial design.md` §7
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-05T18:10:00Z] — Project scaffold: Vite + Vue 3 + Vitest (TODO/build-001)

**Post:** Three attempts into this CAD project, and this is the first commit with an actual package.json. Vite + Vue 3 + Pinia for the app shell, Vitest for unit tests, Playwright running across Chromium, Firefox, and WebKit from day one, Storybook for component isolation, and a PWA plugin.

The one test this task ships isn't a feature test — it's a guard: it fails the build if anyone points an app-level e2e spec at a Storybook iframe instead of the real running app. That distinction mattered enough in the two prior attempts that it's worth enforcing in code from the very first commit rather than trusting convention.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #Vue #SoftwareEngineering
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Repo had no package.json before this commit → `git status`/diff this session; naming guard fails against a deliberately wrong fixture, passes once removed → Playwright output this session; full typecheck/unit/e2e chain green across all three engines → `npm test` output this session
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-05T19:40:00Z] — Kernel-adapter spike: JSCAD V1→V3 proven on a real bolt (TODO/core-001)

**Post:** Before committing to a full parts catalog, I proved the riskiest architectural bet first: can a 2022-vintage JSCAD V1 hardware library's geometry be faithfully reproduced by JSCAD V3 primitives composed through a plain-JSON recipe format, instead of hand-ported as opaque JS?

Ported the generic bounding-box math (snap, align, combine, pick) as pure immutable functions, then built one hardware.bolt recipe and diffed its output against the real V1 library's actual bolt geometry — bounding boxes and volumes, not just visual similarity. Matched to better than a thousandth of a millimeter. Getting there also meant finding and patching two real bugs in the decade-old library along the way, which the fixture generator documents rather than works around silently.

The pattern holds, with one honest limitation flagged for the next spike rather than glossed over: a recipe that needs to snap against geometry it doesn't already know about will need a different evaluation strategy.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #JSCAD #SoftwareEngineering
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Dimensional diff tolerance and pass, both specs → `hardware.bolt.spec.js` + this session's independent test run and mutation check; jscad-utils bugs found and patched → `scripts/generate-v1-bolt-fixture.cjs` header (diff); recipe-can't-measure limitation → `TODO/done/core-001-kernel-adapter-spike.md` retirement note (diff)
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-05T20:15:00Z] — Resilient document replay + a bug found in yesterday's own code (TODO/core-002)

**Post:** A CAD document that can load from a remote URL needs a different failure mode than internal code does. If a composite geometry recipe has a bug, that should fail loudly — it's a programming error. But if a loaded document has one bad line (an unknown operation, a broken reference, a malicious string), the rest of the document still needs to load. One bad line shouldn't take down everything after it.

Building that resilience layer for WarpCad's replay engine surfaced something I didn't expect: a genuine bug in the kernel code I'd written a few hours earlier in the same session. An operand-count check was silently checking the real registry instead of whatever registry it had actually been handed — invisible until a test finally used a different one. Fixed it, added regression tests directly to the original module's own test file, and re-ran its full suite before moving on, rather than letting the fix live only in the new code.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #SoftwareEngineering
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Bug root cause and fix → `src/core/kernel/registry.js`/`index.js` diff, this session; fix verified against core-001's own full suite with zero regressions → this session's test run; resilience confirmed load-bearing via mutation check → this session (disabling it failed 7 tests)
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-05T20:20:00Z] — WarpCad's build roadmap, written from real spike results (TODO/docs-003)

**Post:** A project's own process rules said the roadmap couldn't be written from the design doc alone — it had to wait for a real kernel spike and a real interaction-model pass to confirm the plan actually holds up. That ordering paid off immediately: the kernel spike surfaced a genuine limitation (a geometry recipe can't measure something it didn't create itself), and the roadmap now names a dedicated spike to resolve that architectural question before any Raspberry Pi accessory work touches it, instead of leaving it to be rediscovered as a mystery bug three tasks later.

The roadmap also documents its own judgment call in plain text: grouping a large parts catalog by interaction pattern rather than by literal table row, with the reasoning written down so it's a decision someone can revisit, not a rule quietly bent.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #SoftwareEngineering #ProductDevelopment
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Roadmap ordering requirement → `CLAUDE.md` Working Files section; snap-before-measurement limitation and its dedicated spike → `TODO/ROADMAP.md` M4 section + `TODO/done/core-001-kernel-adapter-spike.md` retirement note, this session
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-05T19:35:00Z] — Writing the test scenarios before the app has any UI to test (TODO/docs-004)

**Post:** WarpCad's process rules require writing the acceptance test scenarios before feature work starts, not after — the opposite of how testing usually gets sequenced. Today's task filled in the 8 fixed end-to-end scenarios this project will drive by hand at every milestone, from placing two shapes and confirming both stay visible, to loading a project from a remote URL and confirming a malformed record gets skipped instead of executed.

The scenarios couldn't be written from the design doc alone. An earlier task had already worked out the exact controls this app will actually have — an Operations toolbar with selection-count gating, an Inspector panel with a Transform section, a breadcrumb for stepping between a group and its sub-parts — and two scenarios changed shape once those specifics were in hand: a hardware-property scenario now also drags the transform gizmo instead of only editing a field, and a boolean-gating scenario now checks that Subtract visibly marks which solid is the base before it runs. One scenario, remote-load safety, already has a passing automated test from an earlier session's replay-engine work, so it's recorded as already-verified rather than left blank.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #SoftwareEngineering
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 8 scenarios written up front, before UI work → `TODO/ACCEPTANCE.md` diff + `CLAUDE.md` Verification section's ordering rule; control names came from a prior Q&A task → `docs/decisions/interaction-model-qa.md`; two scenarios revised per that doc's own flags → interaction-model-qa.md controls 4 and 5, Q17; remote-load scenario already passing → `src/core/replay.spec.js` line 233, test run this session
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-05T19:58:00Z] — Fillet spike: the rim ports, the edge doesn't (TODO/core-003)

**Post:** WarpCad's design doc flagged fillet and chamfer as a risk to spike before committing to them. The useful part of the spike was reading the old V1 source before writing any new code, because it showed the question was framed wrong. V1 never had an arbitrary-edge fillet. Its fillet and chamfer were the same function, rounding the whole rim of one axis-aligned face by lofting a single cross-section. The parameter called "orientation" names a face, not an edge.

So the risk split cleanly. The rim behaviour ports to JSCAD V3 exactly, and now matches hand-derived analytic volumes to seven decimal places, including on a boolean-union result and a shape with a concave corner. Arbitrary-edge fillet does not port, and no amount of adapter work fixes it: there is no fillet operation, no way to erode a solid, and boolean results come back as polygon soup where 42% of edges have no second face. There is no edge to select, and nothing stable to name in a saved document.

That last part is a kernel fork question rather than a feature question, so it went into the decision record as an open question with three costed options instead of being quietly worked around. Two silent-wrong-geometry behaviours turned up along the way, including one where filleting a domed top added material instead of removing it and reported no error at all. Both are now guarded and pinned by tests.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #Geometry #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** V1 fillet/chamfer are both `util.reShape` with a face-named `orientation` → `node_modules/jscad-utils/src/util.js:1023-1068`, read this session; rim ops match analytic to 2e-7 incl. boolean-union and reflex-corner fixtures → `npm test`, this session; 112/264 edges unmatched after a boolean subtract → measurement this session, pinned in `src/core/kernel/fillet.spec.js`; `expand` throws on negative delta despite documenting contraction → run this session; domed-top fillet added ~131mm³ (8576 vs 8445) before the guard existed → measurement this session
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-05T21:10:00Z] — The test suite was green. Driving the app by hand still found a bug. (TODO/render-001)

**Post:** WarpCad's 3D viewport is now the app's actual root view: a millimetre grid with minor and major lines, a clickable orientation triad, and orbit/pan/zoom controls you can reach with a finger alone. It ships with the project's first real end-to-end spec, running across three reference viewports and all three browser engines, because it is WebGL from line one.

Before writing any of it, the renderer had to stop being an assumption. three.js was carried forward from a previous attempt as a default to reconsider, so it was compared against Babylon.js and PlayCanvas on stars, issue ratios, release cadence, maintainer count, and payload. Babylon.js genuinely wins on maintenance hygiene — 10 open issues against 3,221 closed, and four npm maintainers to three.js's two. It still lost, because this app needs a drawing surface rather than a game engine, and three.js is a third of the unpacked size for the parts that get used. That reasoning is written down, rejection table included.

Then the part that mattered. With 131 end-to-end tests passing across the whole matrix, the process here still requires driving the app by hand at an iPad viewport with touch only. That pass found a defect no assertion was looking for: the DOM chrome followed the browser's colour scheme while the 3D scene stayed hardcoded dark, so in light mode the app rendered pale controls around a dark canvas. Fixed, with unit and end-to-end coverage added, and the scenario re-driven in both schemes.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #ThreeJS #Vue
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Babylon.js 10 open / 3,221 closed issues and 4 npm maintainers vs three.js 253 / 13,519 and 2 → GitHub search API and npm registry, queried this session, recorded in `docs/decisions/rendering.md`; three.js unpacked 23.2 MB vs Babylon.js 70.2 MB → npm registry `dist.unpackedSize`, this session; 131 e2e tests passing across 3 viewports × 3 engines → `npm run test:e2e:headless`, this session; light-mode scene defect found by hand-driving, not by a test → `TODO/ACCEPTANCE.md` scenario 7 Last-run note, this session
**To Add:** side-by-side screenshot of the light and dark viewport; repo URL once public


## [2026-09-06T00:58:00Z] — A drag-and-drop feature that had to build a command layer first (TODO/ui-010)

**Post:** WarpCad can create geometry now. You drag a shape out of the Library panel and drop it into the 3D view, and it lands where you released, resting on the grid, selected and ready. Seven primitives, one drag mechanism: the rows come from the geometry kernel's own registry, so adding an eighth primitive gives it a row, a preview and a working drop without touching a component.

Two things had to be built underneath it that were not really about dragging. The first is a command layer, because every document mutation in this project has to carry a transaction origin, and undo scoping is not something you can retrofit onto a log whose entries never recorded who wrote them. The second was four missing kernel primitives, which is where the interesting bug lives: `@jscad/modeling` exports a `triangle`, and it is two-dimensional. Registering it as a solid would have produced a shape the renderer silently could not draw. It gets extruded into a prism instead, and re-centred, because unlike every other primitive the library's 2D triangle sits in one quadrant with a vertex at the origin.

The whole matrix was green — 223 unit tests, 225 end-to-end across three viewports and three browser engines — and then the required hand-driven pass found something none of it was looking for. At phone width the Library is a bottom sheet, and its collapsed tab was sitting on top of the viewport's navigation controls. No assertion covers "is this button visually underneath something else". A screenshot does.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #Vue #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** `@jscad/modeling@2.13.0`'s `triangle` returns a geom2, and `cylinderElliptic` takes `startRadius`/`endRadius` pairs rather than a `radiusEnd` → node inspection and source reading of `node_modules/@jscad/modeling`, this session; no command layer existed beforehand (`src/core/` held only `replay.js` and `ndjson.js`) → the diff, and `TODO/done/ui-010-drag-place-primitive.md`'s own Required-addition section; 223 unit + 225 e2e across 3 viewports × 3 engines → `npm run test:unit`/`npm run test:e2e:headless`, this session; phone-width sheet-tab overlap found by the hand-driven acceptance pass, not by a test → `TODO/ACCEPTANCE.md` scenario 1 Last-run note and the screenshots taken this session
**To Add:** before/after screenshot of the phone-width overlap; repo URL once public


## [2026-09-06T01:22:00Z] — Selection response: gizmo, dimension lines, Inspector (TODO/ui-011)

**Post:** Selecting a shape in WarpCad used to just highlight it. Now it attaches a transform gizmo, draws three dimension lines — one per axis, each with extension lines, arrowheads and a millimetre label — and fills an Inspector panel with that shape's own parameters.

The part worth writing down is where the code lives. None of the maths is in a Vue component. World-to-screen projection, which of a bounding box's four parallel edges to dimension against, and the arrowhead geometry all sit in a framework-free module unit-tested in plain Node, including a test asserting it is the exact inverse of the projection the placement ghost already used. The Inspector's fields are read from each operation's own schema in the kernel registry, so registering an eighth primitive gives it a correct panel with no component change. A Cube shows Size X/Y/Z, a Tube shows Diameter, Inner diameter and Height, from one code path.

315 end-to-end tests pass across three viewports and three browser engines. Then I drove the running app by hand on a phone-sized screen, which is where two real defects turned up: the Inspector's bottom sheet and the Library's bottom sheet were claiming the same slot and rendering through each other, and the viewport's zoom controls and scale readout were sitting behind the sheet's top edge by 25 pixels. Neither is visible to an assertion. Both are obvious in a screenshot.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #Vue #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** projection asserted to be the exact inverse of `src/render/pick.js`'s `projectToWorkingPlane` → the test "is the exact inverse of pick.js projectToWorkingPlane" in `src/render/annotate.spec.js`, passing this session; Inspector fields read from the registry's `ui.defaults` → `src/core/inspector.js` in the diff, with `src/core/inspector.spec.js` covering all 7 primitives plus a Cube/Tube contrast; 315 e2e passing across 3 viewports × 3 engines and 267 unit → `npm test`, this session; the 25px overlap and its fix → measured in the browser during the acceptance drive, 406-451px readout against a 426px sheet top before, 362-407px after, recorded in `TODO/ACCEPTANCE.md` scenario 2
**To Add:** laptop screenshot of a selected cylinder with all three dimension lines; before/after phone screenshots of the sheet overlap; repo URL once public


## [2026-09-06T13:09:00Z] — The bug that only exists because the document is append-only (TODO/ui-012)

**Post:** WarpCad's transform gizmo became draggable this week. Drag an arrow and the shape moves; the Inspector's position fields count along with your pointer instead of jumping when you let go. Type a number into those fields and the shape moves to match. Both routes go through one function, so they cannot drift apart.

The interesting part was not the drag maths. This project's document is an append-only log of operations, which is what makes a parametric history possible at all. But it means moving a shape is not an edit, it is a new record that consumes the old one and produces a new result with a new id. The obvious render loop walks the records and draws one body per id, which quietly draws the shape you moved and the shape you moved it from. One cube in, two cubes out, on the very first drag. The fix was a lineage index: the document now reports one body per logical object, with its stable identity taken from the record that created it and its geometry from the newest record in the chain. Nothing is deleted, because a future undo needs the whole chain; supersession only changes what gets drawn twice.

Worth noting what caught it. The task file predicted this failure by reading the code before any of it was written, so it never reached a screen. What the hand-driven pass added was the confirmation: turn a 40mm cube 45 degrees about Z and its bounding dimensions read 56.569mm, which is 40 times root two, and typing 0 back returns them to exactly 40.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #Vue #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** the duplication is real, not hypothetical → `src/core/document.spec.js`'s new "a transform does not add a second body" test failed with "expected [ …(2) ] to have a length of 1 but got 2" against the pre-change `bodies()`, this session; supersession deletes nothing → `document.js` retains every record in `entries`/`scene.byId`, asserted in the same spec; one shared mutation behind both triggers → `src/core/transform.js` + `src/composables/useTransformCommands.js` in the diff, with a spec asserting a drag-built and a typed-built record land the same position; 40mm cube at 45° about Z measures 56.569mm and returns to exactly 40 at 0° → hand-driven exploratory pass, this session; the problem was named in the task file before implementation → `TODO/done/ui-012-gizmo-transform-sync.md`'s "Required addition" section; 295 unit and 414 e2e tests green across 3 viewports × 3 engines → `npm test`, this session
**To Add:** screen recording of the drag with the Inspector visible; a diagram of the record lineage (create → move → turn) showing which id renders; repo URL once public

**LinkedIn article:** worth writing. "Why an append-only CAD document duplicates your shape the first time you move it" — the problem generalises to any event-sourced document with derived state, and the lineage-index fix is small enough to show in full.


## [2026-09-06T15:50:29Z] — A gizmo that sizes itself to the shape it's attached to (TODO/ui-017)

**Post:** WarpCad's transform gizmo now sizes itself to whatever it's attached to. Select a small part and the arms and rotate rings sit close in; select a large one and they stretch out to clear its silhouette instead of disappearing inside it. Zoom in or out and the same body's gizmo grows or shrinks with it, down to a floor so a tiny part never loses its handle.

The fix itself is a single pure function: take the selected body's bounding box, convert its half-diagonal to screen pixels using the viewport's own mm-per-pixel scale, and clamp between the old fixed size (kept as a floor) and a cap that stops an enormous body from running the gizmo off screen. The more interesting part was catching a side effect: an existing test grabbed the arm's rendered midpoint to simulate a stationary click, and a longer arm can legitimately put that midpoint past the body it belongs to. The fix was to grab nearer the hub instead, where the handle's own dead zone already guarantees the body is underneath.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #Vue
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** old fixed constants `GIZMO_ARM_PX = 58`/`GIZMO_RING_PX = 40` removed and replaced by a bounds-derived, floored-and-capped helper → `src/render/annotate.js` and `src/components/viewport/Viewport.vue` in this session's diff; the arm's rendered midpoint could fall outside the body once it grew, breaking a pre-existing `ui-012` spec, fixed by grabbing near the hub → this session's `npx playwright test` reproduction and fix, and the diff to `e2e/gizmo-transform.e2e.js`; app has no UI path yet to place a custom-size primitive (Library always drops registry defaults; Inspector Size fields are read-only) → `src/core/library.js` and `Inspector.vue`, read this session; full suite green (typecheck, 302 unit, 423 e2e passed / 19 skipped) → `npm run test` output, this session
**To Add:** before/after screenshot of the gizmo at default vs. zoomed-in size on the same cube; repo URL once public

## [2026-09-06T16:09:07Z] — Shift+drag and right-drag pan the viewport without touching the mode toggle

**Post:** Our browser CAD viewport shipped with orbit-by-default dragging and a Pan mode you switch into with a toolbar toggle — the right design for touch, since there's no modifier key or second mouse button on a tablet. On a mouse it meant every camera pan cost a click to the toolbar and a click back, which is real friction against how desktop 3D tools normally work.

We added the conventional desktop shortcuts on top of the existing toggle: hold Shift and drag with the left button, or just drag with the right button, and the camera pans regardless of the toggle's current setting. The interesting part was a pre-existing conflict — Shift+left-click already meant "add this object to the selection." The fix reuses the same click-vs-drag pixel-travel threshold the selection code already relied on, so a Shift+left press that never turns into a real drag still selects, and one that does still pans, with no second, competing definition of "drag" to get out of sync.

Full suite passed across all three browser engines after the change: typecheck, 302 unit tests, and 432 of 451 end-to-end checks (19 intentional skips).

**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #Vue
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** toggle-only pan and `dragMode` predating this change, plus the pre-existing Shift-click additive-select call left untouched → `src/components/viewport/Viewport.vue`, this session's diff; full suite result (typecheck clean, 302/302 unit, 432/451 e2e passed with 19 skips, all three engines) → `npm run test`/`npx playwright test` output, this session
**To Add:** short screen recording of Shift+drag panning without touching the toolbar; repo URL once public

## [2026-09-06T16:25:49Z] — Mouse pan/orbit mapping is now a saved preference (TODO/ui-019)

**Post:** WarpCad's 3D viewport shipped one specific mouse convention for pan versus orbit: hold Shift or use the right mouse button to pan, plain left-drag to orbit. That's a reasonable default, but it isn't universal — some tools people already use put pan on the primary button instead, and a hardcoded scheme fights that muscle memory no matter which one gets picked.

We turned the mapping into a stored preference instead of a fixed rule. A gear icon next to the viewport's Orbit/Pan toggle opens a short list of two presets; picking one applies to the very next drag and is saved to the browser's localStorage — the project's first use of it, so the read/write boundary (a try/catch around a blocked or private-browsing store) was built to be reused by every setting that comes after this one. A touch drag was left untouched on purpose: there's no Shift key or right mouse button on a tablet, so both presets fall back to the existing Orbit/Pan toggle there regardless of which one is selected.

Full suite passed across all three reference viewports and all three browser engines after the change: typecheck clean, 309 unit tests, 459 of 478 end-to-end checks (19 intentional skips).

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #Vue
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** `ui-018`'s original hardcoded mapping → `TODO/done/ui-018-*.md` and the pre-change `effectiveDragMode()` in `src/components/viewport/Viewport.vue`; first `localStorage` use in the project → grep across `src/` and `e2e/` before implementing, this session, plus the TODO file's own "Affected files" note; touch drags are unaffected by the preset → new `pressPointerType === 'mouse'` gate in `Viewport.vue`, confirmed both by a new e2e regression test and by hand-driving a touch orbit at the iPad viewport (WebKit) after switching presets, this session; full suite result (typecheck clean, 309/309 unit, 459/478 e2e passed with 19 skips, all three engines and viewports) → `npm run test` output, this session
**To Add:** repo URL once public

## [2026-09-06T18:24:35Z] — Killed the white-flash-on-load bug (again)

**Post:** Closed out a white-screen flash on app load in the browser CAD project: for a moment before the dark UI appeared, the page painted its browser-default white background instead.

The cause was structural, not cosmetic. The page's `<head>` had no styling of its own, and the dark background lived in a CSS file that only got pulled in as a side effect of loading the app's JavaScript — so the browser had to fetch and run JS before the correct background ever applied. On a slow connection or a cold cache, that gap is visible. This is also a repeat: both earlier attempts at this project shipped the same class of bug on Safari and iPad specifically, so it got fixed before any more UI landed on the same page shell.

The fix is a few lines of inline CSS in the page head, verified with a script that artificially delays the JavaScript and stylesheet loads and checks the background color across Chromium, Firefox, and WebKit — the browser most likely to reproduce the original bug.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #SoftwareEngineering
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** root cause (empty `<head>`, dark background arriving only via a JS-module-triggered CSS fetch) → `TODO/done/build-002-fix-load-white-flash.md`'s Problem section and the diff to `index.html`; this bug class shipped on Safari/iPad in both previous attempts → `CLAUDE.md`'s Browser Support section; verified with a 2s artificial delay on JS/CSS responses across Chromium/Firefox/WebKit, background read `#10131a` and the `color-scheme` meta was present 150ms after navigation commit → Playwright script output, this session; full suite green (typecheck clean, 313 unit tests across 19 files, 459 e2e passed with 19 skipped) → `npm run test` output, this session
**To Add:** repo URL once public

## [2026-09-06T19:02:00Z] — Measuring the part instead of its shadow (TODO/ui-023)

**Post:** WarpCad draws three dimension lines on whatever you have selected, so you can read a part's size off the screen without opening a panel. They were measured from the solid's world-axis bounding box, which is exactly right for as long as nothing is rotated.

Rotation landed earlier the same day, and it turned that measurement into misinformation. Tip a 40 mm by 50 mm cylinder over and the axis-aligned box around it is bigger on two axes than the cylinder is, and not one of its three numbers is a diameter or a length. The fix measures the solid in its own frame instead: un-turn it by the inverse of its carried rotation, measure that, then build the box's eight corners back out along the part's own axes. The fiddly part was matching the kernel's rotation convention exactly, which meant reading @jscad/modeling's Tait-Bryan matrix rather than guessing at axis order.

Two things came out of hand-driving it afterward that the test suite could not see. The dimension numbers now hold steady through a rotate-ring drag, which is a better result than the tests asked for. And driving an out-of-order rotation, turning about Y and then about X, exposed a separate pre-existing bug: the stored rotation is a running sum of deltas while the geometry is their composition, and rotations do not commute. That one is filed with its measured reproduction rather than patched over.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #Geometry #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** dimension lines exist to read size without opening a panel → `CLAUDE.md`'s Interaction Model grid/dimension rules; the world-AABB measurement and its failure on a rotated body → `TODO/done/ui-023-oriented-dimension-lines.md`'s Problem section; rotation became reachable via `ui-012` on 2026-09-06 → git log 660f042; the kernel's convention is active intrinsic Tait-Bryan in z-y-x order → `node_modules/@jscad/modeling/src/maths/mat4/fromTaitBryanRotation.js`, read this session; numbers hold through a ring drag (−34.61°, lines stayed 40/40/50) → hand-driven against the running app this session; the out-of-order defect measured at 46.82/51.05/59.42 instead of 40/40/50 for Y=45 then X=45 → controlled drive this session, recorded in `TODO/core-004-rotation-carried-as-sum-not-composition.md`; full suite green (typecheck, 327 unit, 468 e2e passed/19 skipped) → `npm run test` stages, this session
**To Add:** side-by-side screenshot of the tilted cylinder before and after; repo URL once public

## [2026-09-06T19:19:00Z] — Choosing against my own written recommendation (TODO/core-004)

**Post:** A bug worth writing up, because the fix I'd pre-committed to on paper turned out to be the wrong one.

WarpCad stored a solid's rotation as three degree numbers, and built each new value by *adding* the latest turn to the previous total. But the geometry applies each turn on top of the last — a composition. Rotations don't commute, so those two agree only for single-axis turns and for one specific mixed order. Any other order and the stored number described an orientation the part wasn't in: a ⌀40×50 cylinder turned 45° about Y then 45° about X reported its size as 46.82 / 51.05 / 59.42.

When I filed the finding I recommended carrying a quaternion instead, on the reasoning that decomposing to Euler angles is ill-conditioned near a ±90° pitch and displayed numbers can jump. Reading the actual code killed that argument: the Inspector shows three degree fields either way, so a quaternion would still be decomposed for display — jumping in exactly the same places. It would have bought a document-schema migration and a permanent second code path through the geometry math, in exchange for nothing this codebase can observe.

So it composes properly and stays three numbers. Two consumers that rebuild the rotation matrix became correct with no edit at all. Two others outside the finding's own file list turned out to carry the same defect and needed fixing — including the live drag preview.

The finding itself came out of a hand-driven acceptance pass, not the test suite. Every automated test passed both before and after it was found.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #Geometry #SoftwareEngineering
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** the sum-vs-composition analysis and the measured 46.82/51.05/59.42 row → `TODO/done/core-004-rotation-carried-as-sum-not-composition.md`; the decision to reject the quaternion and why → that file's retirement note plus `src/core/rotation.js`'s module header; `localBoundsOf` and `annotate.js` needed no edit → diff shows neither's logic changed, only `group.js`'s doc comment; the two extra consumers → diffs to `rotateToRecord` in `src/core/transform.js` and `src/composables/useSelectedBody.js`; the finding was discovered by hand-driving, not by tests → `TODO/ACCEPTANCE.md` scenario 2's 2026-09-06 18:52 entry, filed during `ui-023`; full suite green (typecheck, 346 unit across 20 files, 477 e2e passed/19 skipped) → `npm run test` stages, this session
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-07T16:18:46Z] — A small affordance fix: making a drag handle look like one (TODO/ui-022)

**Post:** Not every fix in WarpCad is geometry math. This one was about a circle not looking like a handle.

The transform gizmo on a selected part has three colored arrows for moving it and three faint rings for turning it. The arrows already had arrowheads, so it was obvious what dragging one would do. The rings were just thin circles — visually indistinguishable from a selection halo or a decorative reference line, with nothing suggesting "grab and spin."

The fix adds two small chevron markers per ring, drawn tangent to the circle so they point the direction a drag there will turn the part. The math reuses the arrowhead-drawing function already written for the dimension lines, computed straight from the ring's own screen-space geometry with no new projection step.

Small scope, real value: a control that works but doesn't look operable fails the same test as one that isn't wired up at all, just later and by a person instead of an automated check.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #UX
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** the rings carried no drag-direction cue before this change → `TODO/done/ui-022-rotate-ring-direction-arrows.md`'s Problem section; the arrowhead maths reuses the existing dimension-line convention → diff to `src/render/annotate.js`, `writeArrowhead()` is unchanged and now called from the new `ringArrowheads()`; full suite green (typecheck, 349 unit tests across 20 files, 480 e2e passed/25 skipped across 3 browser engines × 3 viewports) → `npm run test` stages, this session; the markers render without blocking the ring's own drag → hand-driven against the running app this session, live Position/Rotation field tracking observed with the markers present
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-07T17:10:41Z] — The transform gizmo gets a shaded, 3D look (TODO/ui-021)

**Post:** WarpCad's transform gizmo — the move arrows and rotate rings that appear on a selected part — worked correctly but looked wrong: uniform-width lines and flat triangles, a 2D diagram sitting on top of a 3D scene.

The fix stays entirely inside the existing SVG overlay: per-axis gradient fills that shade each arm and arrowhead like a lit rod or cone, a double-stroke band on each rotate ring to suggest a tube rather than a wire, and a shared drop-shadow filter that lifts the handles off the scene. No new geometry, no new rendering technology, just paint.

One new wrinkle: the lighter gradient stop uses CSS color-mix(), the first use of that function anywhere in this codebase. Verified it resolves correctly, rather than silently falling back to black, across Chromium, Firefox, and WebKit before shipping.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #UX
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** the handles were a uniform-width `<line>`/flat `<polygon>` with no shading before this change → `TODO/done/ui-021-gizmo-3d-appearance.md`'s Problem section; the fix is per-axis SVG `<linearGradient>`s (objectBoundingBox, no per-frame geometry) plus a double-stroke ring band/core and a shared `drop-shadow` filter → diff to `src/components/viewport/Gizmo.vue`; `color-mix()` is new to this repo (no prior use anywhere) and was verified to resolve correctly, not fall back to black, in Chromium, Firefox and WebKit → this session's manual cross-engine check; full suite green (typecheck, 349 unit tests across 20 files, 483 e2e passed/31 skipped across 3 engines × 3 viewports) → `npm run test` stages, this session
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-07T18:05:52Z] — Drag-box (marquee) multi-select (TODO/ui-024)

**Post:** WarpCad's viewport already let you Shift-click to build a multi-selection. It didn't have the gesture every 3D and 2D tool trains you to reach for first: drag a box, grab everything inside it.

The interesting part wasn't the geometry — project each body's bounding box to screen space, test overlap against the dragged rectangle — it was the gesture itself. The original spec's own suggestion, a plain left-drag from empty space, would have quietly broken the existing plain-drag-orbits-the-camera default the whole navigation test suite depends on. Landed on Ctrl/Cmd+drag for desktop instead, plus a third "Select" mode on the existing Orbit/Pan toggle for touch, where there's no modifier key to hold at all.

Partial overlap counts as enclosed, matching the convention most CAD and DCC tools use for rubber-band selection.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #UX
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** multi-select previously required Shift-clicking each body individually → `src/stores/selection.js`'s pre-existing `toggle()` and `TODO/done/ui-024-drag-box-multi-select.md`'s own Goal section; the drag-box gesture projects each body's world-axis bounding box to screen space and tests overlap with the dragged rectangle, partial overlap counts as enclosed → diff to `src/render/annotate.js` (`updateBoxScreenBounds`, `marqueeIntersectsBox`); the trigger is Ctrl/Cmd+drag on desktop and a new "Select" chrome toggle on touch, not the TODO's own literal "plain left-drag" suggestion, because that would have broken the existing plain-drag-orbits default → `docs/decisions/interaction-model-qa.md`'s new addendum, and `e2e/viewport-scaffold.e2e.js`'s pre-existing orbit-drag regression test which was re-run and still passes; typecheck and 356 unit tests across 21 files passed, and every e2e spec touching this change (marquee's own two new tests, the pan-gesture regressions, and the click-select regressions) passed across all 3 engines × 3 viewports when run in isolation → this session's `npm run typecheck`/`test:unit`/`playwright test` runs
**To Add:** screenshot of the marquee rectangle mid-drag; repo URL once public

## [2026-09-07T18:56:08Z] — Orientation gizmo legibility fix (TODO/ui-025)

**Post:** WarpCad's orientation gizmo — the small dial that shows which way the camera is pointing — had a legibility problem: six identical circular axis buttons, each 32px, sitting on a 116px dial. They nearly tiled the whole control, leaving only a sliver of the colored spoke triad visible near the center. The one element that actually changes shape as you orbit the camera was the one thing you couldn't see.

The fix stayed inside the existing SVG overlay, no new geometry. The buttons keep their existing size and position (shrinking them further, or spreading them out, risked breaking the touch-target sizing already tuned for phone width). Instead: the spokes are drawn past the edge of their own buttons so a colored tail pokes out, the buttons themselves went translucent so the spoke shows through, and the caps for axes facing away from the camera fade further into the background.

Verified by hand at iPad and phone viewports, in both light and dark themes, with a real touch tap on the buttons whose styling changed the most.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #UX
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** the six 32px caps nearly tiled the 116px dial, leaving only a sliver of the triad visible before this change → this session's before-screenshot of the shipped component plus `TODO/ui-025-orientation-gizmo-label-legibility.md`'s own Problem section; the caps kept their existing size/position because growing the anchor radius would overflow the mobile 96px dial (already zero margin at 33 + 15 cap-radius = 48 = 96/2) → arithmetic on `OrientationGizmo.vue`'s own constants in the diff; the fix is a separate, larger spoke-only radius, translucent `color-mix()` cap backgrounds, and a further-receded negative-cap style → diff to `src/components/viewport/OrientationGizmo.vue`; hand-driven at the iPad viewport (820×1180) in WebKit, dark and light themes, with a real touch `tap()` on the `−Y`/front cap (a negative-axis cap) confirming it stayed tappable → this session's hand-drive, recorded in `TODO/ACCEPTANCE.md`'s scenario 7 re-check entry; full suite green (typecheck, 356 unit tests/21 files, 504 e2e passed/37 skipped across 3 engines × 3 viewports) → this session's `npm run typecheck`/`test:unit`/`test:e2e:headless` runs
**To Add:** before/after screenshot of the dial; repo URL once public

## [2026-09-09T13:08:36Z] — Snap guides for drag placement (TODO/ui-013)

**Post:** WarpCad can now help you line parts up while you drag them. Bring a new solid near one that's already on the grid and dashed guides appear on that solid — its centre line, or one of its faces — and the preview snaps onto them. Let go and the snapped position is what gets committed, not wherever the pointer happened to be.

The interesting part was what testing missed. The Playwright suite checked that the guides existed, had finite endpoints and landed on the canvas, and it passed. Then I drove the app by hand and found two things it couldn't see: when the preview snapped centred on a solid, the guide spanned only the two coincident boxes, making it a dashed stub exactly as long as the solid it was drawn on top of, and the guides were painted in the same blue as the transform gizmo they get drawn over, so they read as part of the gizmo rather than as a placement cue. Both are now fixed and both have tests, but neither test would have been written without driving it.

A third finding changed the design rather than the styling: without a proximity gate, two solids at opposite corners of the grid still shared an axis closely enough to snap, so a drop at the far edge got silently pulled into line with something 400 mm away. An axis now only snaps when the preview is genuinely near the other part on the other axis too. Full suite: typecheck, 380 unit tests, 571 end-to-end tests across three engines and three viewports.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #UX
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** the e2e spec asserted finite, on-canvas guide endpoints and passed while the centred guide was still an invisible stub → `e2e/snap-placement.e2e.js`'s "the guide lines are drawn on the canvas, not off it" test in the diff, and the fix's own new unit test "extends a centred guide past the solids" in `src/core/library.spec.js`; the guides shared `--accent` with the gizmo's rings and the Z dimension line → pre-change `SnapGuides.vue` stroke plus `DimensionLines.vue`'s existing `Z: 'var(--accent)'`, resolved by the new `--snap-guide` token in `src/styles/tokens.css`; without the proximity gate a far-corner drag snapped → this session's first hand-drive run, which logged `far corner: snapped=true` before the gate was added; full suite green (typecheck, 380 unit tests across 21 files, 571 e2e passed / 42 skipped across 3 engines × 3 viewports) → this session's `npm test` run
**To Add:** before/after screenshot showing the stub guide vs the overhanging one; repo URL once public

## [2026-09-09T13:23:11Z] — hardware.nut composite recipe (TODO/core-010)

**Post:** WarpCad's geometry kernel now knows how to build a hex nut, ported from jscad-hardware's V1 `Hardware.Nut()` factory as a single hexagonal-prism recipe — the same composite-recipe pattern the bolt recipe proved earlier in this project.

One detail worth calling out: V1's `Nut()` has no default fit class, unlike its `Bolt()` sibling, which defaults to `loose`. The new recipe matches that exactly rather than smoothing it over — an omitted fit throws the same error an unknown one does. The V1-vs-V3 dimensional diff also had to change shape: V1 builds the nut sitting on the grid at Z=0, V3 centers it like every other primitive a user can place, so the fixture compares size and volume rather than raw position, with the difference documented directly in the recipe's own comments.

Also confirmed directly rather than assumed: the Library panel that lets users drag parts into the viewport only reads `primitive.*` registry entries right now, so this recipe — like the bolt before it — stays kernel-only until a dedicated Hardware section gets built. Full suite: typecheck, 395 unit tests, 571 end-to-end tests, all green.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** same composite-recipe pattern the bolt recipe used → `f9bbfa4` (`TODO/core-001`, 2026-09-05) and this diff's `src/core/kernel/recipes/hardware.nut.js`; V1's `Nut()` has no default fit unlike `Bolt()`'s `fit = fit || 'loose'` → `node_modules/jscad-hardware/jscad-hardware.jscad` lines 20-21 and 81-82, read directly this session; V1 builds the nut base-at-z=0, V3 centers it → generated `hardware.nut.v1-reference.json` fixture (`bounds[0][2] = 0`) vs. `primitive.hexagon`'s `center` default in `src/core/kernel/registry.js`; Library panel reads only `primitive.*` registry rows → `src/core/library.js`'s `buildRows`, read this session; full suite green (typecheck, 395 unit tests, 571 e2e passed/42 skipped) → this session's `npm run typecheck`/`test:unit`/`test:e2e:headless` runs
**To Add:** repo URL once public

## [2026-09-09T13:33:39Z] — hardware.washer composite recipe (TODO/core-011)

**Post:** WarpCad's geometry kernel picked up a third jscad-hardware port this week: washers, following the same composite-recipe pattern the bolt and nut recipes already proved. V1's Hardware.Washer() returns a two-part group — a tube for the washer body, and an optional clearance cylinder when a fit class (tap, close, or loose) is supplied. That conditional is the one real branch in an otherwise straightforward port, and both branches are diffed against real V1 output rather than assumed.

The more interesting problem was the metric size table. jscad-hardware never shipped a MetricWashers table at any version — not the vendored 1.1.0, not the author's own current 5.0.0 source tree, not the older jscad-hardware2 codebase. Rather than block on a missing dependency, the metric sizes (M3 through M12) are ported directly from the published ISO 7089 standard, cross-checked against two independent sources after an initial search result turned out to be bleeding in numbers from a different washer standard entirely. Since there's no V1 function to call for these, the test suite checks them a different way: a table-conformance assertion against the published values, plus a shape-parity check proving the recipe treats a metric spec exactly like an imperial one.

One more divergence, carried over deliberately from the bolt recipe: V1 renders its clearance cylinder as a normal visible part. This port marks it hidden instead, because a later boolean-subtract operation needs the fastener's real hole size, not its rendered metal — the same reasoning the bolt recipe's tap-clearance geometry already established.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** two-part V1 group (washer always, clearance only `if (fit)`) → `node_modules/jscad-hardware/jscad-hardware.jscad` lines 56-79, read directly this session, and this diff's `src/core/kernel/recipes/hardware.washer.js`; both branches diffed against real V1 output → `hardware.washer.spec.js`'s "dimensional diff" describe block and the generated `hardware.washer.v1-reference.json` fixture; no `MetricWashers` table in `jscad-hardware` at any version → `TODO/core-011-hardware-washer-recipe.md`'s Goal section, citing the vendored 1.1.0, the author's current 5.0.0 tree, and the `jscad-hardware2` v1 tree; ISO 7089 cross-checked against two independent sources after an initial mismatch → same Goal section; metric entries checked by table-conformance, not a V1 diff → `hardware.washer.spec.js`'s "washer spec table" describe block; clearance marked `hidden: true`, mirroring the bolt recipe's `tap-*` parts → `src/core/kernel/recipes/hardware.bolt.js`'s `prismRecords` calls with `hidden: true`, read this session, and this diff's `hardware.washer.js`
**To Add:** repo URL once public
