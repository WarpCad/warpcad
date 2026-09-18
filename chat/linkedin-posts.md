# LinkedIn Posts

## [2026-09-17T13:56:00Z] — The test that disagreed with my code, and was right

**Post:** Shipped angled bisect in WarpCad — cutting a solid along a plane that's tilted away from perpendicular, rather than square to an axis. The roadmap had flagged it as the risky one: "needs a rotated cut-plane construction the geometry kernel has no direct primitive for."

It needed no such thing. For any rigid motion T, cutting a solid with a tilted plane is the same as rotating the solid the other way, cutting it with the *untilted* plane you already have, and rotating both halves back. The tilted cut is the straight cut in a different coordinate frame. That turned a feature I'd scoped as new geometry into two rotations wrapped around code that already existed and was already tested.

The part worth writing down is what happened next. This project checks its geometry ports by running the original 2015-era library under Node and recording what it actually produces, then diffing against it — measured output, not a reading of the source. Ten new cases went in. Three failed, all of them cuts on the Y axis, all off by an entire half.

My first instinct was that my new fixtures were wrong. They weren't. The original library builds its cut plane from a pair of basis vectors — right-handed for X and Z, but left-handed for Y. So on that one axis it keeps the opposite piece, and the two halves come back under swapped names. My port had assumed all three axes behaved alike, and the previous task's fixtures happened to cover only X and Z. The bug had been sitting there, with a passing test asserting the wrong number.

Two things I'd have got wrong by reasoning instead of measuring: that, and the tolerance. I'd written into the spec that two extra rotations would cost precision and the comparison would need loosening. Measured, the worst error was 4.5e-10 mm — below the resolution of my own fixture file. I deleted the caveat and wrote the number.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #ComputationalGeometry #SoftwareEngineering
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Transform composition → `bisect` in `src/core/kernel/group.js` (turn by −angle, existing `cutHalfSpaces`, turn back); Y-axis defect → V1's `util.normalVector` basis pairs `['Y','Z']`/`['X','Y']` vs `['X','Z']`, now `NEGATIVE_IS_MAX_SIDE`, pinned by two new straight-y cases in `scripts/generate-v1-modify-fixture.cjs`; tolerance → worst bounds residual 4.5e-10 mm across all 10 angled fixture cases, measured this session; suite green → 848 unit tests (+22), `e2e/resize-bisect-operation.e2e.js` green on chromium-laptop
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-11T20:02:00Z] — Clicking into a group: the feature that turned out to live in the render path

**Post:** Shipped pick depth in WarpCad: once a group is selected, clicking again on one of its members narrows the selection to just that part, with a breadcrumb — "Group 1 ▸ Cube 1" — so the change in depth is visible rather than a silent field swap.

I had this filed as a click-handler task. It wasn't. Every consumer flattened a group before it reached a mesh, and that flattening runs a CSG union — after which no polygon remembers which part it came from. There was no data for a click handler to resolve, at any level of cleverness. The fix was one mesh per named part instead of one mesh per body, and a recursive raycast.

Two details I'd have got wrong by guessing. A part that was moved *before* being grouped has a translate record as its most recent state, so recovering "this is a 40 mm cube" means walking back to the creation record, not reading the id you were handed. And the gizmo has to be genuinely absent while you're looking inside a group, not just inert — there is no record a transform could target that means "only this part", so a draggable gizmo would quietly move the whole assembly while the panel named one piece of it.

The bug worth reporting: 45 end-to-end cases passed while the gizmo visibly stayed on screen. Drilling in changes no body id, so nothing invalidated the render, and the stale overlay only cleared on the next camera move — later than any assertion looked. Found by driving the app, which is the entire reason that step exists.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #SoftwareEngineering
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Flattening a group runs a CSG union that loses per-part identity → `src/core/kernel/group.js` `toGeom3`/`combine` (existing code), replaced at the mesh-building call site by `createBodyObject` in `src/render/mesh.js` (diff), pinned by `mesh.spec.js` (per-part buffers match `geom3ToBufferGeometry(parts[name])` exactly, and together span `boundsOf(group)`); moved-before-grouped part recovers its creation record → `creationRecordOf` in `src/core/inspector.js` (diff), pinned by `inspector.spec.js` "still recovers the creation record after the part was moved before grouping"; gizmo absent while drilled in → `syncAnnotations` in `src/components/viewport/Viewport.vue` (diff) + `e2e/group-subpart-selection.e2e.js` asserting `transform-gizmo` count 0; the stale-gizmo defect → this session's RED run (`toHaveCount(0)` resolved to 1 element for 14 polls before the `selection.subPart` watcher was added); suite green → this session's `npm run test` (521 unit, 653 e2e, 122 skipped, 0 failures), new spec 45/45 across 3 viewports x 3 engines
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-11T14:33:33Z] — Group.assemble: the toolbar's fourth button, and the Firefox bug it exposed

**Post:** Shipped the fourth button on WarpCad's Operations toolbar: Group. Where Union, Subtract and Intersect compute a new volume and discard what went into it, Group keeps every selected solid's own geometry fully intact — addressable by name — while making the whole collection behave as one selectable, movable body.

The interesting part wasn't the feature itself; it was what the project's own end-to-end suite caught after adding it. A wider toolbar row started overlapping the orientation gizmo's corner, but only on a narrow viewport pane and only in Firefox, where slightly wider button labels pushed the collision from cosmetic to an actual dropped click. Root-caused with direct bounding-box measurement across engines, fixed with a container-relative CSS constraint instead of a page-width guess.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #SoftwareEngineering
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Group keeps every solid's own geometry intact, addressable by name → `src/core/kernel/registry.js` `group.assemble` entry (diff), pinned by `registry.spec.js`; toolbar/gizmo overlap at tablet width → this-session bounding-box probe (`.viewport` pane measured 390px wide against an 820px page, ops toolbar right edge 548px vs. gizmo left edge 458px); Firefox rendering the row ~15px wider → this-session probe (308.0px Firefox vs. 293.2px Chromium at phone width); fix verified with the full suite green (502 unit tests, 608 e2e tests, 122 skipped, 0 failures) → this session's `npm run test:unit`/`npm run test:e2e:headless` output
**To Add:** repo URL once public, docs site URL once it exists

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

## [2026-09-09T14:26:00Z] — Kit-part composite recipes: Board, BoardFrame, Anchor (TODO/core-012)

**Post:** WarpCad's geometry kernel has two kinds of operation: native ops that build geometry directly, and composite recipes that expand into other ops and build nothing themselves. Library items are meant to be composite, so their definitions stay plain JSON a human or an AI can read and diff. Adding jscad-utils' three kit parts (a rounded PCB slab, a hollow frame, and a snap-fit anchor) ran straight into the limit of that rule: a composite can only expand into ops that already exist, and the kernel had no way to name a 2D profile or an extrusion as a record.

The interesting case was BoardFrame. V1's source carries a comment explaining that it subtracts its two rounded rectangles while they are still flat, before extruding, to avoid the non-manifold artifacts you get subtracting two same-height solids. That is a "do it this way for a reason" signal, and preserving it means the subtract has to sit between the profile and the extrude as its own record — which one all-in-one native op cannot express. So the port added a small 2D layer instead: profile.roundedRectangle and profile.extrudeLinear, with the existing subtract op sitting between them unchanged, since it already dispatches on its arguments' own geometry type. The record ordering is pinned by a test, so a later refactor cannot quietly invert it.

The Anchor needed the opposite kind of care. Its post is aligned and snapped against its hole, and those operations are defined over bounding boxes — and a tessellated cylinder's bounding box depends on its segment count, so there is no offset to work out on paper the way a bolt's spec table allows. That recipe builds both cylinders as throwaway probe geometry, measures the offsets with the group helpers, discards the probes, and bakes a single translate into the expansion. The flagged worry about the rotation's sign convention turned out to be moot, which measurement showed and assumption would not have: the post is symmetric about its own axis, so plus and minus ninety degrees give bit-identical bounding boxes, and the snap fixes the position regardless.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** composite recipes expand into other ops and build nothing → `src/core/kernel/registry.js`'s own module doc and `composite()` helper, plus `src/core/kernel/index.js`'s fold, in this diff and read this session; V1's BoardFrame subtracts in 2D to avoid non-manifold artifacts from same-height solids → `parts.js`'s doc comment on `BoardFrame` in `/Users/johncole/src/jscad/jscad-utils` (6.0.0), read directly this session; `BoardFrame`/`Anchor` exist only in 6.0.0, not the vendored 3.2.0 → `TODO/done/core-012-kit-part-recipes.md`'s source note plus that file read at lines 398-472; `booleans.subtract` dispatches on its arguments' geometry type and returns a geom2 for two geom2 inputs → `node_modules/@jscad/modeling/src/operations/booleans/subtract.js` and a Node probe run this session (`subtract type geom2? true`); record ordering pinned → `kit.boardFrame.spec.js`'s "subtracts before it extrudes" test in this diff; a tessellated cylinder's bounding box depends on segment count, so the snap offset is measured not derived → `src/core/kernel/recipes/kit.anchor.js`'s module doc and its `calcCenterWith`/`calcSnap` calls in this diff, with `kit.anchor.spec.js` re-deriving the baked vector from real bounding boxes; ±90° about X give identical bounding boxes for the post → Node probe this session (`rot+90 bbox` and `rot-90 bbox` both `[[-2.5,-3.3,-2.5],[2.5,3.3,2.5]]`) and the spec's own sign-immateriality test; full suite green (typecheck, 457 unit tests across 26 files, 571 e2e passed/42 skipped) → this session's `npm run typecheck`/`test:unit`/`test:e2e:headless` runs
**To Add:** repo URL once public; a render of the Anchor showing the post snapped into the hole would carry this one

## [2026-09-10T15:47:00Z] — group.snap/group.align wired to the op registry (TODO/core-013)

**Post:** The geometry helpers behind this one have been ported and unit-tested in WarpCad since 2026-09-05. Nothing in a document could actually call them. The kernel's evaluate() resolves each operand id and immediately flattens it to a single solid, which is correct for a boolean or a transform and fatal for snap: snapping a bolt by its head needs the head, and the answer has to keep the thread and the tap so the next operation can still name them. The part breakdown was sitting in the fold's own id map the whole time, routed nowhere.

Rather than guess at the shape a document record should take, I counted. Across my own JSCAD projects there are 2,147 .snap and .align calls in 123 files, and 719 of them reach into another item's .parts to name the thing being measured against. That is a third of all real usage, which settles the question of whether sub-part addressing is an exotic case to defer. So an operand is now either a bare id, exactly as before, or { id, pieces } naming a subset of that record's parts, and the same spelling works on both the moving side and the reference side. Two registry entries opt into receiving their operands un-combined; every other op is untouched and still gets a solid.

The part I did not expect to spend time on was the survey itself. A naive grep of the same corpus returns 10,470 hits instead of 1,361, because most of those projects ship a bundled single-file build that inlines the jscad-utils library source, so every bundle re-counts the library's own internal calls. The method that gives the real number is written down in the new fixture file next to the test cases, along with the file and line of every call site each test reproduces, so the next person to touch this does not rediscover it.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** `snap`/`align` ported and tested in `core-001`, which landed 2026-09-05 → `git log -1 --format=%ad --grep='TODO/core-001'` this session, plus `src/core/kernel/group.js:494-525` (pre-existing, unchanged by this diff) and `group.spec.js`; the fold flattened every operand before any op saw it → `src/core/kernel/index.js`'s pre-diff `return toGeom3(resolved)`; the breakdown was already in `byId` → same file, `byId.set(record.id, value)` runs before any consumer's `toGeom3`; 2,147 calls (1,361 `.snap(` + 786 `.align(`) across 123 files, 719 naming `.parts.` on the reference side → grep over `~/src/jscad/` this session with `--include='*.jscad' --exclude-dir=node_modules --exclude-dir=dist`; naive count 10,470 with bundled `dist/` included → same grep without that exclusion, this session; every test case cites a real call site → `registry.spec.js` in this diff and the cited lines read directly this session (`laptop-stand.jscad:52-53`, `PiPiece.jscad:263`, `pvc-joints2.jscad:302-303`, `leafblower.jscad:114`, `solar-panel-bracket.jscad:110,113`); method and citations recorded → new `src/core/kernel/recipes/__fixtures__/group-snap-align.real-usage.md`; two entries opt in, every other op unchanged → `rawOperands` on `RegistryEntry` and `index.spec.js`'s "still flattens every other op's operands, unchanged" test; full suite green (typecheck, 477 unit tests across 26 files, 571 e2e passed/42 skipped) → this session's runs
**To Add:** repo URL once public; a render of a bolt snapped head-flush into a case would carry this one

## [2026-09-10T17:20:00Z] — Boolean operations toolbar with selection-count gating (TODO/ui-014)

**Post:** Booleans landed in WarpCad this week: Union, Subtract, Intersect, in their own toolbar over the 3D view. The interesting part was not the geometry. The kernel has had union and subtract since 2026-09-05 and intersect was a one-line registry entry. The interesting part was what a two-in, one-out operation does to the document.

WarpCad's document is an append-only log, so editing a body means appending a record that consumes the old one. Moving a cube already worked that way, through a field called supersedes: the new record continues the old body's identity, which is why a moved cube still reports itself as a 40 mm cube in the inspector rather than as a translation. A Subtract result continues neither operand's identity. It is a new thing built from two others, and asking whose parameters it inherits has no honest answer. So it got its own field, consumes, holding a list rather than a single id, validated through the same helper so the two can never drift apart. Union and Subtract are the first users; combining several parts into a group is the same shape and should need no further change to that layer.

One detail worth stating because it is the kind of thing that ships broken. The toolbar names its operands by asking the document what currently represents each selected body, not by passing the selection straight through. A selection holds a body's stable identity, and that identity still points at the geometry the body had when it was first placed. Subtract the wrong one and you cut a hole where the object used to be, which looks fine in a screenshot of a scene where nothing has been moved yet. I hit exactly that case by hand, by dragging an operand before combining it.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** `boolean.union`/`boolean.subtract` present since 2026-09-05 → `git log --diff-filter=A --format=%ad -- src/core/kernel/registry.js` gives f9bbfa4 2026-09-05, and both entries are pre-diff in that file; `boolean.intersect` a one-line addition → this diff, `registry.js`; append-only log with `supersedes` continuing one identity, and `Body.op`/`params`/`name` read from the lineage root → `src/core/document.js`'s pre-existing supersession note and `bodies()`, unchanged by this diff; `consumes` as a separate list-valued field sharing one validation helper → `resolveLiveRoot` in `src/core/document.js`, this diff, with `document.spec.js`'s mutual-exclusion and duplicate-lineage tests; group-combine is the same shape → `TODO/ROADMAP.md`'s `ui-015` reserved row and `TODO/done/ui-014-boolean-operations.md`'s own "why build this generically now" section; operands resolved via `currentIdOf` → `OperationsToolbar.vue` in this diff, plus `document.spec.js`'s "consumes a moved body by its current id" test; hit by hand by moving an operand first → `TODO/ACCEPTANCE.md` scenario 4 drive this session; full suite green (typecheck, 490 unit tests across 26 files, 598 e2e passed/96 skipped) → this session's `npm test` run
**To Add:** repo URL once public; a short screen capture of the amber/teal selection then a Subtract would carry this one

## [2026-09-10T22:25:00Z] — Composite absorbed every earlier body into its own group (TODO/core-020)

**Post:** A bug worth writing down, because the diff that caused it does not read as wrong. In WarpCad, placing a plate and then placing a bolt produced a bolt that had swallowed the plate. It reported the plate as one of its own parts and its bounding box grew to span the whole thing. Subtracting that bolt from the plate then returned an empty solid, so the model just disappeared.

The cause was a spread operator. WarpCad evaluates a document by folding op records into geometry, and a composite item like a bolt is not special cased: its recipe expands into ordinary records and replays through the same fold, called recursively. The recursive call passed the caller's options straight through, and those options carry the accumulated scene so the app can evaluate one new record against everything already placed. The fold seeds its group from exactly that field. So the recipe assembled itself into the live scene group rather than a fresh one, and inherited every name the document had accumulated. The fix passes the registry and the size tables explicitly and never the scene, because a recipe is a closed definition that should only ever address its own ids.

Two things about how it stayed hidden since 2026-09-05. It only appeared on the incremental path the running app uses, never in a batch evaluate where no caller passes a prior scene, and every composite test went through the batch path. And the one test that came closest asserted that the result's bounding box was defined, which an empty solid satisfies. That assertion now checks bounds and volume against the arithmetic. The finding came out of driving the app by hand rather than out of the suite, which is the second time this month that has been where the real bug was.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #Geometry #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** composite recipes replay through the same fold, called recursively → `src/core/kernel/index.js`'s composite branch and its module docstring, pre-diff; `initial` carries the accumulated scene and the fold seeds `group` from it → same file, `evaluate`'s `let group = options.initial?.group ?? createGroup(...)`, pre-diff; fix passes `registry`/`tables`/`name` only → this diff; wrong incrementally, correct in batch → `TODO/core-020` file's measured table plus a browser drive against the real modules this session (incremental now `["head","thread","tap"]` at `-9.25,-8.01,0 .. 9.25,8.01,27`, byte-identical to the batch path); latent since 2026-09-05 → `hardware.bolt` added in f9bbfa4 and the incremental `applyAction` path in 1dbde95, both 2026-09-05 per `git log --diff-filter=A`; every composite test went through the batch path, and the closest one asserted only `toBeDefined()` → `TODO/core-020`'s "Why nothing has caught it", and the pre-diff `index.spec.js` assertion this diff replaces with bounds and volume; found by hand-driving, second time this month → `TODO/ACCEPTANCE.md` scenario 5 note dated 2026-09-10 17:52 filing this finding, and scenario 4's 2026-09-10 sliver finding; full suite green (typecheck, 495 unit tests across 26 files, 598 e2e passed / 96 skipped) → this session's runs
**To Add:** repo URL once public; a before/after render of the plate-and-bolt case would carry this one

## [2026-09-11T20:23:14Z] — Snap and Align: two buttons that move a shape without consuming it (TODO/ui-026)

**Post:** WarpCad's Operations toolbar has two new buttons: Snap and Align. Select two solids and one moves to a precise position against the other, flush on a side or centered, with an optional millimetre offset. Every other button on that toolbar (Union, Subtract, Intersect, Group) retires its operands into one new body. Snap and Align do the opposite: they move one solid and leave both independently selectable afterward, the first operation on this toolbar to make that claim.

The document's append-only log already had a field built for exactly this, supersedes, used by a gizmo drag continuing one body's identity across a move. Using the other field, consumes, here instead would have looked fine until someone checked the body count: the untouched reference solid would have silently disappeared from the scene.

The real find came from driving the app by hand rather than from the automated suite. The popover's first design, anchored below the button row, collided with the on-screen navigation controls once the Inspector auto-opened at phone width, and separately a CSS property on an ancestor element quietly broke how the browser positions a fixed overlay. Neither showed up in a passing assertion.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** exactly-2 gating, distinct from the other four buttons' "2+" → `src/components/viewport/OperationsToolbar.vue` in this diff, `EXACT_OPERANDS`/`snapAlignDisabled`; Union/Subtract/Intersect/Group retire operands via `consumes` → same file's pre-existing `run()`, unchanged by this diff; Snap/Align append a `supersedes` record instead, both solids stay independently selectable afterward → this diff, `commitSnapAlign()`, confirmed by `e2e/snap-align-operation.e2e.js`'s body-count and click-through assertions this session, and by a hand-drive re-running `TODO/ACCEPTANCE.md` scenarios 1 and 3 this session; `supersedes` precedent from a gizmo drag → `src/core/transform.js`'s `translateRecord`/`rotateRecord`, pre-existing; `Body.name`/`op`/`params` read from a lineage's root record, never a superseding one → `src/core/document.js`'s own module doc, pre-existing; kernel side (`group.snap`/`group.align` registered) landed 2026-09-10 → `git log` commit 39fc42f; popover collided with `NavigationChrome` at phone width when row-anchored, and `.ops`'s `backdrop-filter` broke `position: fixed` centring → this session's own on-page bounding-box measurements (an `axis-z` checkbox and `nav-step-right` at nearly identical coordinates; the popover centred at `x: -31` against `.ops`'s own ~182px box instead of the 390px viewport), both fixed by `<Teleport to="body">` in this diff; full suite green (typecheck, 521 unit tests across 27 files, 671 e2e passed / 158 skipped) → this session's `npm run test` output
**To Add:** repo URL once public; a screenshot of the Snap/Align popover, and a before/after render of an aligned pair, would carry this one

## [2026-09-11T20:41:00Z] — Three more ops, ported rather than written fresh: Enlarge, Fit, Bisect (TODO/core-019)

**Post:** WarpCad's geometry kernel picked up three more operations this week, ported from an older JSCAD utility library rather than written from scratch: Enlarge grows a solid by an absolute delta per axis, Fit scales it to a target size, and Bisect cuts one solid into two named halves along a plane.

Bisect turned out to be the interesting one. The old library never documents which half it calls positive and which it calls negative, and reading its source actually points the wrong way. The real answer only came from running the original code and measuring what it produced. The same was true of its offset convention — a negative offset measures from the opposite face than you'd guess, and a signed negative zero is a real, distinct value real call sites depend on. A small script now runs the original library under Node and records its output, and the new port is checked against that measured data rather than a re-derivation from reading the source.

The cut itself needed a different technique, too: the current geometry kernel has no infinite cut-plane primitive the old one had, so a bisect is now built from one oversized box and two boolean operations instead of a plane cut. Straight cuts only for now — a survey of real usage found the angled form in a real but small minority of call sites, and it needs its own rotated cut-plane construction with no equivalent in the current kernel, so it's filed as its own follow-up rather than built on spec.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #Geometry
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** no prior port of these three existed, unlike Snap/Align (`core-013`) → `TODO/done/core-019-enlarge-fit-bisect.md`'s own Goal section, this diff; `bisect`'s `negative`/`positive` naming and offset-sign convention read backwards from V1's source, resolved only by running it → `src/core/kernel/group.js`'s `bisect` doc comment, this diff; measured against real `jscad-utils@3.2.0` output via a generator script → `scripts/generate-v1-modify-fixture.cjs`, this diff, mirroring `core-010`/`core-011`'s same-shaped fixture scripts; half-space-box `intersect`/`subtract` substitutes for V1's `OrthoNormalBasis` cutplane, since `@jscad/modeling` has no infinite-plane primitive → same doc comment; straight cuts only, ~15% of ~55 surveyed real `.bisect(` call sites use the deferred angled form, filed as `TODO/core-021` (reserved) → `TODO/done/core-019-enlarge-fit-bisect.md`'s survey section and `TODO/ROADMAP.md`'s M4+ table; `enlarge` throws by axis name on a delta that would collapse/invert an axis, where V1 silently mirrored → `group.js`'s `enlarge`, this diff; registry entries are `operandCount: 1` with no `ui` metadata, no UI task claims them yet (filed as `TODO/ui-028`, reserved) → `src/core/kernel/registry.js`, this diff, and `TODO/ROADMAP.md`'s M4+ table; `ui-010`'s Library-panel repro re-run and PASS against the new registry entries → `TODO/ACCEPTANCE.md` re-check dated 2026-09-11 20:41; full suite green (typecheck, 559 unit tests across 27 files, 671 e2e passed / 158 skipped) → this session's `npm run typecheck`/`test:unit` runs plus this task's own independently re-verified e2e figures
**To Add:** repo URL once public; a render of a bisected part (two named halves, pulled apart) would carry this one

## [2026-09-12T16:52:00Z] — A survey that reached the right answer for the wrong reason (TODO/core-014a)

**Post:** WarpCad's Raspberry Pi accessory catalog was blocked on one architectural question: how does a parametric recipe measure geometry it didn't create? A recipe emits operation records before any geometry exists, so it cannot reach for a part sitting elsewhere in the scene and measure against it.

The task was scoped as a quick write-up, because its own investigation had already surveyed the library being ported from and concluded the problem doesn't actually occur: every cross-part measurement it found was a recipe measuring parts it had just built itself. Re-reading the real source took about four minutes and found the opposite. Eight accessory recipes take an externally-built board as a parameter and measure against it, and two of them require it rather than treating it as optional. The project's own earlier survey already had the number sitting in a fixture file: 719 of 2,147 real call sites, about a third, reach into another object's named parts.

The decision survived the correction. The reasoning did not. Those eight recipes use the external board for exactly one thing, positioning the finished accessory relative to it, and that is precisely the top-level snap/align operation that shipped two days ago. Splitting an accessory into internal offsets plus external placement is exact rather than approximate, because the underlying measurement functions return a difference of bounding-box coordinates and so are translation-equivariant. The nicest piece of evidence was one the first pass walked straight past: when handed no board, the old Spacer recipe builds a throwaway board and measures against that, which is the same probe pattern this project adopted independently months later. No two-phase expansion, no new engineering, and three downstream tasks now carry a concrete requirement instead of inheriting a problem described as nonexistent.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #Geometry #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** a recipe emits records before any geometry exists and expands against an empty fold → `core-001`'s retirement note and `src/core/kernel/index.js:47` (`core-020`); the scoping pass concluded the problem doesn't occur in real recipes → `TODO/done/core-014a-recipe-geometry-measurement-decision.md`'s own investigation section; eight recipes take an externally-built board parameter, two requiring it → `~/src/jscad/jscad-raspberrypi/src/` at `62a8e3b`, re-surveyed this session (`hat.js:24`, `hyper-pixel-4-rectangular.js:17`, `touch-display-7inch.js:16`, `touch-screen2.js:16`, `miniPiTFT.js:81`, `pi-tft22.js:28`, `pi-tft24.js:48`, `spacer.js:51`; the two unguarded ones used at `touch-screen2.js:179-181` and `touch-display-7inch.js:153-154`); 719 of 2,147 real call sites (~33%) name `.parts.` on the reference side → `src/core/kernel/recipes/__fixtures__/group-snap-align.real-usage.md`, written by `core-013`; top-level snap/align shipped two days ago → `TODO/ROADMAP.md`'s Completion Log, `core-013` at 2026-09-10 15:45 and `ui-026` at 2026-09-11 20:20; `calcSnap`/`calcCenterWith` are translation-equivariant, making the origin-probe split exact → `src/core/kernel/recipes/kit.anchor.js:142-145` and `kit.anchor.spec.js:74-75`; V1's Spacer builds its own throwaway board when handed none → `spacer.js:52` (`mb = mb || BPlus().parts.mb`); three downstream rows now carry the drop-the-parameter requirement → `TODO/ROADMAP.md`'s `core-016`/`core-017`/`core-018` rows, this diff; full suite green before and after (typecheck, 559 unit tests across 27 files, 671 e2e passed / 158 skipped) → this session's two `npm test` runs
**To Add:** repo URL once public; nothing visual — this commit is a decision doc. The Spacer self-probe detail could carry a short code snippet if this ever becomes an article

## [2026-09-12T17:35:00Z] — Three bugs the test suite could not see (TODO/ui-020)

**Post:** WarpCad now has sketch mode: click Sketch, the camera locks flat to the working plane, drag once, and a 2D line commits where you dragged. Click it and its start, end and length appear in the inspector with draggable endpoint handles instead of the usual 3D move gizmo.

The interesting part is what happened after the tests went green. Typecheck clean, 584 unit tests passing, 90 new end-to-end assertions passing across Chromium, Firefox and WebKit at phone, tablet and laptop sizes. I then drove the running app by hand, and found three defects a user would hit in their first minute. Each drawn line carried an invisible 18px-wide hit target stacked over the canvas, so pressing on a line neither drew nor orbited. The sketch toolbar collided with the orientation gizmo at both the tablet and phone sizes, because the viewport element happens to be 390px wide either way. And auto-selecting a freshly drawn line popped open the phone inspector sheet directly over the line you had just drawn, cutting reachable canvas from 69 percent of the view to 29.

The first one is the one worth remembering. Every spec in that file dispatches synthetic pointer events straight at the canvas element, which skips the browser hit-testing that was the entire failure mechanism. A passing test proved the handler worked. It could not prove a finger reached it. The regression case now uses a real mouse and asks the page what is actually on top before it presses.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #Vue #Testing
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** typecheck clean, 584 unit tests across 28 files, 761 e2e passed / 158 skipped → this session's `npm run typecheck`, `npm run test:unit -- --run`, `npm run test:e2e:headless`; 90 new e2e assertions = 10 tests x 9 projects → `npx playwright test e2e/sketch-line-entity.e2e.js` this session, `playwright.config.js`; transparent 18px `pointer-events: stroke` hit target swallowed `pointerdown` on every drawn line → the removed markup in this diff, `SketchStrokes.vue`'s header note; toolbar collided with the orientation gizmo at tablet and phone, viewport element 390px wide at both → this session's bounding-box measurement (tablet: toolbar x 304-507 vs gizmo x 458-588; phone: toolbar x 99-292 vs gizmo x 276-382); reachable canvas 69% -> 29% -> 69% → this session's 10x10 `elementFromPoint` grid probe at 390x844 in WebKit, before and after dropping auto-selection; specs dispatch synthetic `PointerEvent`s at the canvas and bypass hit-testing → `e2e/sketch-line-entity.e2e.js`'s helpers, this diff; camera locks via the existing `camera.snapTo('top')` and `pick.js`'s Z=0 projection, no new view preset → `src/components/viewport/Viewport.vue`'s `setSketchMode`, this diff
**To Add:** repo URL once public; a short screen recording (enter sketch mode, draw, select, drag an endpoint, exit) is the media this one needs

## [2026-09-12T21:03:00Z] — A test the retired spec asked for that the kernel can't pass (TODO/ui-027)

**Post:** WarpCad's Operations toolbar now has Fillet and Chamfer. Select one shape, pick a face -- top, bottom, front, back, left, right -- set a radius, and the whole rim of that face rounds off or bevels. The kernel side (`modify.filletRim`/`chamferRim`) already existed and was already tested; this task was the control, its popover, and its documentation.

One design choice is worth explaining. The retired spec for this task asked the end-to-end test to check that the shape's bounding box shrank after a fillet. It can't, by design: the kernel deliberately leaves a rim-filleted shape's bounding box exactly where it was, since only the corner material is removed. The kernel's own unit tests already have a case named for this. The test instead checks volume, which does drop, and which is the same signal the kernel's own correctness tests already rely on.

The other finding came from actually running the app rather than trusting the suite. Adding two buttons pushed the toolbar's phone-width layout from three wrapped rows to four, which was just enough to reach into the navigation chrome once the inspector sheet raised it on selection. This is the third time this exact toolbar has hit a phone-width collision as buttons were added to it. The fix this time hides each button's text label below 640px width, leaving icon and tooltip only -- the same pattern the navigation chrome already uses at its own narrow breakpoint.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #Vue
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** `modify.filletRim`/`chamferRim` and their registry entries already existed and were already tested → `src/core/kernel/registry.js:715-733`, `src/core/kernel/fillet.spec.js` (pre-existing, not part of this diff); the kernel deliberately leaves a rim-filleted shape's bounding box unchanged, with a unit test named for exactly this → `src/core/kernel/fillet.js`'s own module doc, `fillet.spec.js`'s "leaves the bounding box alone — it removes rim material, it does not shrink the solid" test (pre-existing); e2e spec checks volume instead → `src/core/kernel/group.js`'s new `volumeOf`, `e2e/fillet-chamfer-operation.e2e.js`, this diff; adding two buttons pushed the phone-width toolbar from 3 wrapped rows to 4, reaching into `NavigationChrome` (measured `y≈207` vs. the new row's `y≈242` with a body selected) → this session's own bounding-box measurement against the running dev server; this is the third time this same toolbar hit a phone-width collision as buttons were added → `TODO/ROADMAP.md`'s own `ui-015` and `ui-026` completion-log rows; fix hides button text labels below 640px, matching an existing pattern rather than a new one → this diff's `OperationsToolbar.vue` CSS, `NavigationChrome.vue`'s pre-existing `--tap-compact` icon-only buttons; full suite green (typecheck clean, 588 unit tests across 29 files, 797 e2e passed / 158 skipped) → this session's `npm run typecheck`, `npm run test:unit -- --run`, `npm run test:e2e:headless`; new spec passed 36/36 (4 tests × the 9-project viewport/engine matrix) → `npx playwright test e2e/fillet-chamfer-operation.e2e.js`, this session; `ui-026`'s own e2e spec re-run unchanged as a regression baseline, 18/18 passed → `npx playwright test e2e/snap-align-operation.e2e.js`, this session; `ui-026` shipped 2026-09-11 → `git log 7f1a2f8`
**To Add:** repo URL once public; a Front-view screenshot of a filleted cube (box below, rounded dome above) makes the "whole rim of one face" claim visible in a way the prose alone doesn't

## [2026-09-12T22:10:00Z] — Editable parameters, and the edit the app refuses to make (TODO/ui-029)

**Post:** WarpCad's Inspector has shown a shape's own parameters since the panel existed, but the boxes were read-only. Changing a cylinder's diameter is not the same kind of edit as moving it: moving appends a transform on top of what is there, while resizing means rebuilding the shape from its numbers. Those numbers are all a creation record has, so the rebuild quietly discards everything the shape's history did to it since.

That is manageable for a move or a rotation, because the app can measure the pose beforehand and re-apply it afterwards. Rotate first, then translate, because turning a body about its own bounding-box centre moves that centre for anything not symmetric about it. It is not manageable for a fillet. There is no honest way to put a rounded rim back on a shape that has just been rebuilt at a different size, so a body carrying one has its parameter boxes frozen, with a note naming the operation in the way.

The defect worth recording was not the guard. It was that the panel read a body's parameters from the first record in its history rather than the newest one, so a resized shape rendered correctly while displaying its old numbers, and the next edit started from those stale numbers and undid the previous one. The automated suite was green when that shipped into the working tree; the end-to-end run against the real app caught it on the first assertion.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #Geometry #Vue
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** the Parameters fields were read-only by deliberate deferral → `src/components/inspector/Inspector.vue`'s pre-existing doc comment, `TODO/ui-029`'s Goal section; pose is re-applied via existing builders, rotate-then-move → this diff's `src/composables/useParamCommands.js` and its module doc; a fillet cannot be re-applied so the lineage is frozen → this diff's `src/core/paramEdit.js`, and the hand-drive's `data-blocked-by="modify.filletRim"` reading with volume unchanged at 13094.015 after forcing a value into the frozen field; the stale-params defect was caught by the e2e run, not the unit suite → this session: `src/core/paramEdit.spec.js` and the full unit suite were green while `e2e/inspector-param-edit.e2e.js` failed on `inspector-param-diameter` still reading 40 after an edit to 10; full suite green afterwards (typecheck clean, 613 unit, 842 e2e passed / 158 skipped, baseline 797) → this session's three test-stage runs
**To Add:** repo URL once public; a screenshot pair — an editable Parameters section beside a frozen one showing the fillet note — would carry the "what it refuses" half of this post

## 2026-09-13T18:44:00Z — Raspberry Pi board recipe, diffed against the real V1 library

**Post:** WarpCad now has a Raspberry Pi in its parts catalogue. One recipe, four board revisions behind a single `model` parameter, about fifty connectors and mounting holes placed by the same snap and align arithmetic the original jscad library used. It is a port of jscad-raspberrypi's BPlus(), and it was mostly mechanical work.

The interesting part was the verification. I wrote 36 assertions from reading the original source, and every one of them passed on the first run. That is exactly the situation where a test suite proves the least: it confirms the code matches my reading of the source, not that it matches the source. So I ran the real V1 library in a checkout of its own repo, dumped the bounding box of every part on every model, and committed those numbers as a fixture the spec now diffs against.

115 parts across four board revisions, matching to 1.4e-14 millimetres. Then I mutated one connector's position by half a millimetre to confirm the fixture actually bites, and it failed three cases. Four more recipes build on this one, so that fixture stays as a regression surface rather than a one-time check.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #RaspberryPi #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** one recipe, four model branches from one `model` param → `src/core/kernel/recipes/raspberrypi.bplus.js`; 23/25/33/38 parts for models 2/3/4/5 → this session's browser evaluation through the real fold; 36 assertions passing on the first run before the fixture existed → this session's vitest output; 115 parts matched with 0 mismatches, worst delta 1.4210854715202004e-14 mm → the V1-vs-V3 diff run this session against a checkout of `jscad-raspberrypi` at commit 62a8e3b ("Release 5.0.0"); a 0.5 mm mutation in one connector's datum fails 3 spec cases → mutation run this session; four recipes build on this one (`core-015` through `core-018`) → `TODO/ROADMAP.md`'s M4 table, which lists all four as depending on `core-014`
**To Add:** repo URL once public; the rendered Pi 4 screenshot from this task's Step 6 drive

## 2026-09-13T19:15:00Z — When the spec is wrong and only the external fixture knows

**Post:** Ported the five Raspberry Pi camera modules into WarpCad's geometry kernel today: v1, v2, v3, the official HQ camera, and Arducam's clone of it, all behind one recipe with a model parameter.

The task spec I was working from was wrong in three separate places, and that turned out to be the useful part. It listed three mechanisms the port would need; there were four, because one variant ends its placement chain with a stretch call the inventory missed. It also instructed that the HQ camera's four mounting holes be built by rotating one hole about its own centre. The original library rotates about the world origin, which is what walks the hole around to the other three corners. Follow the instruction literally and all four holes stack up in the same corner.

Neither mistake would have been caught by the tests I wrote, because I wrote them from the same reading of the source that produced the mistakes. What caught them was running the original JSCAD library once and committing every part's bounding box as a fixture. All 67 tests passed on the first run, which is exactly when a self-written suite proves least, so I deliberately broke the implementation both ways to confirm the fixture actually bites. It does.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #Geometry #RaspberryPi #OpenSource
**Evidence:** five variants behind one `model` param → `src/core/kernel/recipes/raspberrypi.cameraModule.js`; the spec's three-mechanism inventory and its "each rotate about the part's own centre" instruction → `TODO/done/core-015-camera-module-recipes.md` Proposed fix; the missed fourth mechanism → `camera-module-v2.js:84`'s `.stretch('x', 4)` in `jscad-raspberrypi@62a8e3b`; V1 rotating about the world origin → `hq_camera-module.js:57-59` plus `registry.js`'s `transform.rotate` defaulting `center` to `[0,0,0]`; 67 tests passing on the first run → this session's vitest output; both mutations failing the fixture diff → mutation run this session (holes-about-own-centre fails 6 cases, stretch-folded-in-up-front fails 2)
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; side-by-side render of the v3 and HQ cameras

**LinkedIn article:** not warranted for this commit on its own — it is a port following the pattern `core-014` established a day earlier (commit 47e2857), so the architecture story belongs to that one. There is a cumulative theme worth an article once one more of these lands: across `core-014` and `core-015`, the hand-written assertions passed first try both times and the externally generated fixture is what found the real errors. That is a concrete argument about where test value actually comes from, and it needs a third data point before it is more than an anecdote.

## 2026-09-13T19:50:00Z — Dropping a required parameter, and what a real execution fixture keeps catching

**Post:** Two more Raspberry Pi accessories are in WarpCad's geometry kernel: the official 7-inch touch display and the HyperPixel 4. Both were interesting for a reason that had nothing to do with geometry.

In the original jscad library, each of these factories takes the Pi board itself as a required argument, because the last thing it does is align the screen's mounting pads to the board's holes. That is not geometry, though. It is an assembly step between two finished bodies, and WarpCad already shipped that step as a user-facing Snap/Align control back on 2026-09-12. So the board parameter was dropped and each screen now expands standalone in its own frame.

The part worth writing down is what the port's own written spec got wrong. It said one of the four mounting pads gets rotated 90 degrees. The underlying library method mutates the group in place, and the source rotates before it clones, so all four end up turned. It also suggested confirming the rotation by measuring the hole's bounding box, which cannot work: the hole is the pivot, and a 32-segment cylinder turned 90 degrees maps exactly onto itself. Both mistakes were caught by diffing against real output from the original library rather than against a reading of its source. That is the third task in a row where that fixture found something a hand-written assertion would have restated instead of checked.

Driven end to end in the running app afterward, the assembled screen and board match the original to within 1.4e-14 mm.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #RaspberryPi #OpenSource
**Evidence:** "each factory takes the board as a required argument" → `touch-display-7inch.js:16`, `touch-screen2.js:16`; "the last thing it does is align the mounting pads to the board's holes" → `touch-display-7inch.js:152-154`, `touch-screen2.js:179-181`; "WarpCad already shipped that step as Snap/Align on 2026-09-12" → git log f4cad79 (TODO/ui-026); "the spec said one of four pads gets rotated" and "confirm by measuring the hole's own bounding box" → `TODO/done/core-016-touch-display-recipes.md` Proposed fix and Testing sections; "the method mutates in place" → `jscad-utils/src/group.js:246-272`; "all four end up turned" → V1 execution fixture, all four pads 12x8; "a 32-segment cylinder turned 90 degrees maps onto itself" → fixture records every hole at an unchanged 3x3 bounding box; "third task in a row" → `TODO/done/core-014-raspberrypi-bplus.md` and `core-015-camera-module-recipes.md` retirement notes, both recording fixture-caught spec errors; "1.4e-14 mm" → app drive this session, 29 TouchScreen2 parts compared live against the fixture after the sub-part-addressed attachment
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; screenshot of the 7-inch display with the B+ seated on it

---

## 2026-09-14T19:34Z · core-017 — four small-display recipes, and a twisted loft

Four more Raspberry Pi add-on boards went into WarpCad's geometry kernel today: Adafruit's Mini PiTFT, the PiTFT 2.2 and 2.4, and Pimoroni's HyperPixel 4. The port is mechanical in principle. Every part of all four now matches the original jscad-raspberrypi output to nine decimal places, checked against bounding boxes dumped from a real run of that library rather than against assertions I wrote myself.

The task file told me to expect one hard question, about whether a recipe can address a sibling record's sub-part. It could not, but not for the reason anyone expected: the restriction turned out to belong to the operation, not to the nesting, so no amount of changing the evaluator would have lifted it. The genuinely expensive discovery was somewhere else entirely. One line of the original builds a clearance volume with a negative chamfer radius, which flares a face outward instead of bevelling it inward. My port rejected negative radii outright, and the task spec had read that line as a simple stretch. Following the spec would have shipped a clearance volume ten millimetres too small in both horizontal directions, in the one part whose entire job is clearance.

Supporting the flare surfaced a real bug that had been sitting in the rim code since it was written. An outward offset returns its outline with the vertex ring rotated one place, and the lofting call pairs slices by index, so every wall quad joined a corner to its neighbour. A 3mm flare on a 20mm cube came out at 556 cubic millimetres against a correct 1596, and crept toward the right answer as I added slices instead of being wrong by a constant. That converging-from-below signature is what a twist looks like, and it is what told me the problem was correspondence rather than arithmetic. Nobody had hit it before because every previous caller offset inward, where the vertex order happens to be preserved.

Built with Claude Code, reviewed by me.

**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #ComputationalGeometry #RaspberryPi #OpenSource
**Evidence:** "four ... Mini PiTFT, PiTFT 2.2 and 2.4, HyperPixel 4" → the four `composite(0, ...)` entries added to `src/core/kernel/registry.js` in this commit; "matches ... to nine decimal places" → `toBeCloseTo(..., 9)` against `__fixtures__/raspberrypi.smallDisplays.v1-reference.json` in all four new `.spec.js` files, 792 unit tests green this session (751 before); "dumped from a real run of that library" → generated from a checkout of `jscad-raspberrypi@62a8e3b`, per `core-014`'s procedure, recorded in the fixture's own `$comment`; "the restriction belongs to the operation, not the nesting" → `src/core/kernel/index.js:147-159` rejects a `pieces` operand on any entry that is not `rawOperands`, probed directly this session; "the task spec had read that line as a simple stretch" → `TODO/core-017-small-display-recipes.md` Proposed fix step 4, which names only `.stretch('z', 5)` at `miniPiTFT.js:125`; "negative chamfer flares outward" → `jscad-utils/src/util.js:1608-1624`, whose slicer is `enlarge(slice, [-radius * 2, -radius * 2])`, and `util.enlarge` adds an absolute delta per dimension; "ten millimetres too small in both horizontal directions" → V1's `display-clearance` measures 34.892 x 24.732 against the display's 24.892 x 14.732, from the fixture; "556 against a correct 1596" and "556 → 1136 → 1381 at 2/3/5 slices" → measured this session; "every previous caller offset inward" → every `profile` callback in `src/core/kernel/fillet.js` before this commit returned a non-negative inset, and every existing `fillet.spec.js` analytic-volume test still passes unchanged at its original tolerance
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; a rendered comparison of the flared clearance volume against a plain stretched box would make the ten-millimetre point land visually

---

## 2026-09-16T23:28Z · core-018 — four accessory recipes, and a clamp that only a fixture finds

**Post:**
Four more Raspberry Pi parts are in WarpCad's geometry kernel: the active cooling fan, a blank HAT, a HAT standoff, and the printable spacer that holds one off the other. The spacer was the interesting one. Its diagonal cross-brace is real closed-form trigonometry, solved between two mounting-pad centroids, and that part ported exactly on the first attempt.

What did not port was a single number. The source asks for a 3.1mm corner radius on a brace 6.2mm wide, which is exactly half its width. The old CSG library does not reject that. It quietly shrinks the radius to 3.0 and carries on. Modern jscad refuses the same call outright, so a literal port throws rather than shipping a subtly wrong shape. Reproducing the clamp deliberately is what makes the brace match the original to twelve significant figures.

This is the fifth recipe task in a row where the written spec was wrong about a geometric detail and a fixture generated from actually running the old library is what caught it. The specs are careful and written from the real source. Reading code is still not the same as running it.

Built with Claude Code, reviewed by me.

**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #Geometry #RaspberryPi #OpenSource
**Evidence:** "four more Raspberry Pi parts" → `raspberrypi.activeCoolingFan`, `hat`, `hatStandoff`, `spacer` registered in `src/core/kernel/registry.js` in this commit; "closed-form trigonometry solved between two mounting-pad centroids" → `spacer.js:77-81` and the port's `solveDiagonal`, asserted in `raspberrypi.spacer.spec.js` against `Math.atan2` and Pythagoras directly rather than against V1 output; "ported exactly on the first attempt" → both brace bars and their union measured 0.000000 mm³ difference from the V1 fixture on the first run this session; "asks for a 3.1mm corner radius on a brace 6.2mm wide" → `spacer.js:82`; "quietly shrinks the radius to 3.0" → `@jscad/csg/src/api/primitives2d.js` `roundedRectangle`'s `maxroundradius -= 0.1`; "modern jscad refuses the same call outright" → `@jscad/modeling` 2.13.0 and this repo's `assertCornerRadiusFits`; "twelve significant figures" → 496.94410833398206 vs 496.94410833398257 mm³, measured this session; "fifth recipe task in a row" → `TODO/ROADMAP.md` Completion Log, whose `core-015` row reads "wrong in three specific ways", `core-016` "third task running", `core-017` "the fourth consecutive task to build" a fixture, plus `core-014`'s row recording the fixture as scoped out and built anyway
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; a side-by-side of the brace rounded at 3.0 against the 3.1 the source asks for would make the clamp concrete

---

## 2026-09-17T13:33Z · ui-028 — Enlarge, Fit, Bisect, and the first solid that becomes a group mid-lineage

**Post:**
Three more controls landed on WarpCad's Operations toolbar: Enlarge, Fit and Bisect. Enlarge grows or shrinks a selected solid by a millimetre delta on each axis. Fit resizes it to an absolute target, where leaving a field at the shape's own current size (rather than zero) means "leave this axis alone" -- the kernel's own sentinel, given a UI affordance rather than a value a first-time user could easily misread as "shrink to nothing". Bisect cuts one solid into two independently selectable parts along an axis.

The interesting design question was Bisect's own result. Every other control that supersedes a body's geometry in place -- move, rotate, fillet -- replaces a solid with another solid. Bisect replaces a solid with a two-part group, which is a different kind of geometry on the other side of the same lineage. Nothing in this codebase's render or selection path had ever proven that specific combination end to end before this task, so it was verified by hand rather than assumed from the two separate precedents (a group produced by a boolean, and a solid replaced by a transform) each separately holding.

Verification leaned on driving the real app: place a cube, bisect it, click once to select the whole two-part result, click again to drill into one half, confirm the gizmo detaches and the dimension lines read that half's own size, then step back out through the breadcrumb and confirm everything reattaches. Full browser and viewport matrix came back green apart from one sandbox-only Firefox launch failure, confirmed unrelated to this change by reproducing the identical failure against an already-shipped, unrelated spec first.

Built with Claude Code, reviewed by me.

**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #Geometry #SoftwareEngineering
**Evidence:** Three new controls reusing `ui-027`'s exactly-1 gate and popover mechanism → `src/components/viewport/OperationsToolbar.vue`'s `exactOneDisabled`/`isExactOneOp` generalisation (this commit); Fit defaults each field to the body's own current size rather than zero → `toggleResizePopover`'s `fitSizeMm`/`fitOpenedSizeMm` handling (this commit), documented in `docs/resize-bisect.md`; Bisect is the first `supersedes` record in this codebase to change `KernelGeometry` kind from solid to `Group` → `TODO/done/ui-028-resize-bisect-controls.md`'s own Proposed fix text, which names this as a previously unexercised integration risk; full matrix 8 of 9 viewport x engine cells green (`chromium`/`webkit` across phone/tablet/laptop, 36/36 tests), Firefox failing at browser launch and confirmed pre-existing against `e2e/fillet-chamfer-operation.e2e.js` → this session's `npx playwright test` output, logged in `TROUBLESHOOTING.md`'s 2026-09-17 entry; hand-driven `TODO/ACCEPTANCE.md` scenario 1 and `ui-016`'s grouped-body pick-depth repro against Bisect's own group output, both PASS → this session's Playwright-driven Node script output and `TODO/ACCEPTANCE.md`'s 2026-09-17 13:26 re-check entry
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public, docs site URL once it exists; a before/after screenshot of a bisected cylinder with one half drilled into would make the group-selection contract concrete

## 2026-09-17T14:32Z · core-022 — A deliberate divergence from a faithfully-reproduced quirk

**Post:** WarpCad's Bisect operation cuts a solid into two halves, named negative and positive. A recent task measured a real quirk in the 2015-era library this project ports from: on the Y axis, negative and positive come out swapped compared to X and Z, because that library builds its cutting plane from a basis pair that happens to be left-handed only on that one axis. The port reproduced it faithfully, matching the original exactly, and logged the open question rather than deciding it alone: does a per-axis exception like this belong in a tool a person operates by hand?

The answer came back explicit rather than assumed. Faithfulness to a twenty-year-old library is not the goal here; a consistent tool that doesn't surprise the person using it is. Negative now always means the minimum side of a cut and positive the maximum side, on every axis, with no exception left to remember.

The part worth writing down is what stayed in place. The recorded measurements of the original library's real output did not change, because they describe historical fact about what that library does, not a statement of what this port should do. What changed is which of those recorded halves this port's own negative and positive are checked against, for the one axis where the two disagree. Same evidence, reinterpreted under a naming rule this project chose for itself.

Built with Claude Code, reviewed by me.

**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #Geometry #SoftwareEngineering
**Evidence:** Y-axis bisect names its halves opposite to X/Z because V1's cut-plane basis is left-handed only on Y → `TODO/done/core-021-angled-bisect.md`, the prior `group.js` doc comment; the open question was logged rather than decided unilaterally → `TODO/VERIFY.md`'s `core-021` entry, row 1; decided explicitly by the user (2026-09-17) to diverge from V1 for least-surprise → `TODO/done/core-022-bisect-negative-always-min-side.md`'s Goal section; `NEGATIVE_IS_MAX_SIDE` and its consulting branch deleted, `negative` unconditionally the min-side half → `src/core/kernel/group.js`, this commit; the fixture data (real, measured V1 output) is untouched; a new `expectedPartsFor(axis, fixtureParts)` helper changes which recorded half is compared against for Y → `src/core/kernel/group.spec.js`, this commit; 848 unit tests + typecheck green, `e2e/resize-bisect-operation.e2e.js` green on chromium-laptop, confirmed genuinely name-agnostic by reading it → this session's test runs
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public, docs site URL once it exists; a render of a cube bisected on Y with both halves labelled would make the naming fix concrete

## 2026-09-17T15:45Z · core-023 — The recipe with nothing to diff it against

**Post:** WarpCad's kernel just registered hardware.bearing, joining bolt, nut and washer as a catalogue part. It's the odd one out: the 2015-era CAD library this project ports from has no Bearing factory at all -- a case-insensitive search across the whole package for "bearing" turns up nothing but a documentation false positive. Bolt, nut and washer each had real output to diff a port against. Bearing had none.

The geometry itself was never the hard part -- a bearing is an ordinary tube, subtract an inner cylinder from an outer one. The blocker was verification: with no reference output, what would a passing test even mean? The answer taken here was the same one already used for a metric washer table with the same problem -- transcribe a published engineering standard (DIN 625 / ISO 15) and cross-check it against two independently sourced catalogs before trusting a single number in it.

That still leaves the geometry itself unverified against anything real, so the recipe's own test rebuilds a known size -- bore 8mm, OD 22mm, width 7mm -- through the actual evaluation pipeline and measures its volume: 2305.363 cubic millimetres. That number isn't new. It's the exact figure an earlier investigation into whether this part was even feasible had already recorded by hand. Two independent measurements, months apart, landing on the same figure is a better proof this recipe is correct than any fixture diff would have been.

Built with Claude Code, reviewed by me.

**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #Geometry #OpenSource
**Evidence:** "no Bearing factory at all... documentation false positive" → `docs/decisions/geometry-kernel.md` Finding 2, confirmed against vendored `jscad-hardware@1.1.0` source directly; "bolt, nut and washer each had real output to diff a port against" → `hardware.bolt.spec.js`/`hardware.nut.spec.js`/`hardware.washer.spec.js`'s own V1-reference fixture diffs; "transcribe a published standard... same problem as a metric washer table" → `src/core/kernel/tables/washer-specs.js`'s own module doc for `MetricWashers`, and this task's `bearing-specs.js` following the identical discipline, both citing DIN/ISO standards cross-checked against two independent published tables; "bore 8mm, OD 22mm, width 7mm... 2305.363 cubic millimetres" → `src/core/kernel/recipes/hardware.bearing.spec.js`'s geometric sanity check, built through the real fold at the same 64-segment tessellation `docs/decisions/geometry-kernel.md` Finding 2's own spike used; "the exact figure an earlier investigation had already recorded by hand" → Finding 2's own recorded 2305.363mm³ figure, against an ideal 2309.071mm³ (735π), matched to three decimal places this session
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; a render of a 608 bearing mated to a matching shaft (already verified bounding-box-only in the earlier spike) would make the composite-not-native conclusion concrete

## 2026-09-17T19:35Z — ui-030: shipping a feature that was already built

**Post:** Every fastener recipe in my browser CAD app has been complete, dimensionally verified against the JavaScript library I'm porting from, and registered in the kernel for days. The bolt landed on 2026-09-05. None of them could be placed by a user, because the Library panel built its rows by filtering the registry to primitive.* and no fastener matched. Three separate tasks flagged that gap in their own retirement notes rather than quietly leaving it.

The panel wiring took a few minutes. The real work was placement. A primitive carries its position in its own center parameter, so dropping one is a single record. A composite recipe has no position parameter at all -- it places its own parts at fixed offsets, which is what makes a recipe a reviewable definition instead of a function with a pose. Hand it a center and nothing errors; the key just rides along unread and the part builds at the origin however far you dragged. So a composite drop now commits two records: the recipe's own, plus a translate that supersedes it.

Driving the result by hand found something no test did. That trailing translate flattens the composite's group, because the kernel hands every native operation a single solid on purpose. A placed bolt reports its three named parts before the move and none after. That is pre-existing behaviour rather than a regression -- the move gizmo already does it to anything you drag -- but it means a placed fastener has no sub-parts to address, which is a third blocker for the acceptance scenario that wants to subtract a bolt's hidden clearance from a case wall. Measured, pinned by a test that says so out loud, and written onto the task that has to decide it.

Built with Claude Code, reviewed by me.

**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Evidence:** "bolt landed 2026-09-05" → `git log -1 -- src/core/kernel/recipes/hardware.bolt.js` = f9bbfa4; "three separate tasks flagged the gap in their retirement notes" → `TODO/ui-030-hardware-library-panel.md`'s Goal cites core-010's note re-confirmed through core-018, and `TODO/done/core-023`'s own row; "filtered the registry to primitive.*" → `src/core/library.js` before this commit; "a composite drop now commits two records" → `recordsForDrop`, this commit; "placed bolt reports three named parts before the move and none after" → measured in the browser during this session's Step 6 drive (`names: ["head","thread","tap"]` → `names: undefined`), and pinned by `library.spec.js`'s "flattens the placed composite into one solid" case, this commit; "the kernel hands every native operation a single solid on purpose" → `src/core/kernel/index.js`'s existing operand-resolution comment, unchanged by this commit; "third blocker for the acceptance scenario" → `TODO/ACCEPTANCE.md` scenario 5's entry and `TODO/core-024`'s appended note, both this commit
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; a screenshot of the Hardware section beside a placed bolt would anchor the first paragraph

## 2026-09-18T00:05Z — ui-031: the rest of the catalogue, and what a variant does to a cache key

**Post:** My browser CAD app had a Raspberry Pi board, five camera variants, six screens and a set of kit parts sitting in the kernel, dimensionally verified against the JavaScript library I am porting from, and none of them could be put on screen. The board landed on 2026-09-13. The previous task built the mechanism that lets a recipe earn a Library row and deliberately applied it to four fasteners only. This applied it to the other fifteen. The panel went from 11 rows to 26.

Thirteen of those fifteen were metadata and nothing else, which was the point of the previous task's design: the panel and the catalogue module gained no recipe name. The other two are the interesting ones. A Raspberry Pi board and a camera module are each one factory with a model parameter rather than one entry per revision, so their rows carry an inline dropdown and the chosen variant travels with the drag. The alternative, a row per revision, would have made a 33-row panel in which nine rows are the same two parts.

That variant is also where the real bug would have been. The viewport caches built preview geometry per operation, because measuring a solid is far too expensive to do on every pointer move. One operation is now five different solids. Without a cache key that includes the variant, the second model you dragged would have previewed the first one's mesh while committing the correct board -- a preview quietly lying about what you are about to place. Two acceptance scenarios that had been standing in with primitives since early September were then driven with the real parts they name, which is how I know the guides, the snap and the sub-part breadcrumb all behave on a fifteen-part board rather than on a cube.

Built with Claude Code, reviewed by me.

**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Evidence:** "board landed on 2026-09-13" → `git log -1 -- src/core/kernel/recipes/raspberrypi.bplus.js` = 47e2857, 2026-09-13; "previous task applied it to four fasteners only" → `TODO/done/ui-030-hardware-library-panel.md`'s Goal and its explicit out-of-scope list, commit a3a590f 2026-09-17; "the other fifteen" → 3 `kit.*` + 12 `raspberrypi.*` entries gaining `ui` metadata in `src/core/kernel/registry.js`, this commit; "11 rows to 26" → `LIBRARY_SECTIONS` totals measured this session (7+4+3+12); "panel and catalogue module gained no recipe name" → `src/core/library.js` and `src/components/layout/LibraryPanel.vue` diffs, this commit — sections come from `SECTION_DEFINITIONS` and rows from registry `ui` metadata; "one factory with a model parameter rather than one entry per revision" → `core-014a`'s decision as quoted in `TODO/ui-031`'s Goal, and `BPLUS_MODELS`/`CAMERA_MODULE_MODELS` in the recipes; "a 33-row panel in which nine rows are the same two parts" → arithmetic on the same counts: 26 rows, less the two single variant rows, plus 4 Pi revisions and 5 camera variants = 33, of which those 9 are the same two parts; "viewport caches preview geometry per operation" → `ghostGeometry`/`ghostBoxes`/`ghostOffsets` in `src/components/viewport/Viewport.vue` before this commit; "scenarios standing in with primitives since early September" → `TODO/ACCEPTANCE.md` scenario 3's 2026-09-09 entry (`ui-013`, named stand-in) and scenario 6's 2026-09-11 entry (`ui-016`, two cubes); "driven with the real parts" → this session's Step 6 drive, logged in `TODO/ACCEPTANCE.md`
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; the drive screenshot showing both Model dropdowns in the Library beside a placed Pi 5 and camera, with the breadcrumb reading "Group 1 > Camera Module 1"

## 2026-09-18T00:52:00Z — Lifting the guard would have done nothing on its own

**Post:** WarpCad's geometry kernel could already position a part by one of its named pieces: snap a bolt by its head, and the thread and clearance travel with it. The three boolean operations refused the same address outright, with an error saying so. The obvious fix was to lift that refusal.

The obvious fix would have accomplished nothing. A library part placed by drag and drop commits its recipe plus a translate to put it where you dropped it, and that translate flattened the group into one solid. The clearance body you wanted to subtract no longer existed on the thing you had just placed. So both halves shipped together: booleans resolve a named subset of parts, and transforms now map over a group's parts instead of collapsing them. That is what the original JSCAD library did, which is why subtracting `bolt.combine('tap')` works after a snap throughout my own .jscad corpus.

I also rejected the narrower option on the facts rather than on taste. A purpose-built "subtract a hidden part" operation would have been keyed on hiddenness, and the part this whole feature exists for is not hidden. Driving the finished app turned up something no test covered: grouping two shapes and then moving the group with the gizmo destroyed the grouping, so clicking into a member silently stopped working. Fixed in the same change, and the render was confirmed unchanged by screenshotting before and after and diffing them pixel by pixel.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #Geometry #OpenSource
**Evidence:** "kernel could already position a part by a named piece" → `core-013`, commit dated 2026-09-10 per `git log --grep='TODO/core-013'`; "booleans refused it with an error saying so" → the guard's own text, quoted verbatim in `TODO/core-024` and reproduced this session; "the translate flattened the group" → `ui-030`'s measurement (commit a3a590f, 2026-09-17) and reconfirmed by A/B this session (`names` null before, populated after); "that is what the original JSCAD library did" → `JsCadUtilsGroup.prototype.map` assigning `self.parts[key] = cb(self.parts[key], key)` in the bundled jscad-utils source in `~/src/jscad`, and `src/core/kernel/group.js`'s `translate`/`snap` docs naming themselves V3 ports of it; "subtracting bolt.combine('tap') ... throughout my own corpus" → grep across 923 source .jscad files: `.subtract([bolt.combine('tap')])` in solar-panel-bracket and light-clamp, `combine('tap')` 9 occurrences, `combine('head,thread')` 16, 82 `combine()` calls naming a comma list; "the part this feature exists for is not hidden" → `hardware.bolt`'s recipe adds `tap` with no `hidden` flag, and its module doc states V1 added it with `hidden = false`; "moving a group destroyed the grouping" → stashed A/B this session; "render confirmed unchanged by pixel diff" → `hardware.bolt` byte-identical both ways, `kit.anchor` 52 differing pixels of 1,296,000, this session
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; a before/after of the group-move bug (drill into a group, move it, try again) would make the third paragraph concrete

## 2026-09-18T01:55:00Z — Snap/Align can finally address one named part of a composite

**Post:** For a week, WarpCad's Snap/Align popover carried a line of text admitting its own limitation: "Whole-object snap/align only — sub-part addressing isn't available yet." The geometry kernel had accepted a sub-part operand since September 10. The UI simply never built one, so the precise attachment the Raspberry Pi recipes were designed around was reachable through the command layer and not by hand.

That gap is closed. Drill into a Pi 5's Ethernet jack, shift-click a second shape, and the popover states what it is about to do — "Aligning Raspberry Pi 1 › ethernet to Cube 1" — before you commit. It has to say so, because a sub-part move and a whole-object move look identical once they have happened. Either side can be the addressed one, which turned out not to be a preference: the selection store holds a single pick depth, so two drilled-in operands are not representable at all.

Driving it by hand found what the test suite could not. The board's mounting holes still cannot be clicked, because they pass through the PCB and the raycast stops at the board in front of them. A 289-point sweep over a real Pi 5 reached four named parts out of thirty-odd. So the documentation now walks through the Ethernet jack rather than a mounting hole, and the picking limitation is filed for the task that owns it instead of being papered over.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Evidence:** "for a week" → `ui-026` shipped the disclaimer 2026-09-11 (git log 3f5c87b), removed today 2026-09-18; "kernel accepted a sub-part operand since September 10" → `core-013` (git log 39fc42f, 2026-09-10); "reachable through the command layer and not by hand" → `TODO/done/core-016-touch-display-recipes.md`'s own retirement note and its `TODO/VERIFY.md` row; "popover states Aligning Raspberry Pi 1 › ethernet to Cube 1" → live drive this session, laptop and phone; "two drilled-in operands are not representable" → `src/stores/selection.js`, a single `subPart` ref plus `drillInto`'s no-op unless exactly one body is selected; "289-point sweep reached four named parts" → 17x17 pointer sweep this session over a real Pi 5, reaching only `mb`, `ethernet`, `usb1`, `usb2`
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; a short screen recording of the drill-in plus the popover line would carry this better than a still
