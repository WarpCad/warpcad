# BlueSky Posts

## [2026-10-15T09:10:00Z] — Three ways to place a shape became one

**Post:** WarpCad had three ways to put a shape exactly where you mean: Snap, Align, and an Align-to-origin row buried in the Inspector. Two UIs, and I kept reaching for the worse one. They are now one Align button with a Target (the other shape, or the origin), per-axis taps that commit on the spot, and a Snap row. #CAD

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #UX #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** old project files replay to the same bounds → `src/core/snapAlignReplay.spec.js`; Pi onto the origin by X ctr, Y ctr, Z min, then Undo x3 → driven at 1440 and 390 px Chromium this session
**To Add:** repo URL once public, docs site URL once it exists

## [2026-10-11T15:09:00Z] — Undo that knows what the assistant took out

**Post:** WarpCad's AI can now set a project variable: "make this for a Pi 5" is one call, not a hunt for the Pi. The catch: variable edits revise and delete rows, and Undo AI turn only knew how to remove new ones. A turn now lands and undoes as a diff. #CAD

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #AI #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Undo AI turn restores a deleted user-made variable with its origin → `src/ai/agent.spec.js` (delete_variable keepValues case); the user's own Undo untouched → header title read "Undo: Set wall to 25 mm" before, during and after, in a scripted run
**To Add:** repo URL once public, docs site URL once it exists

## [2026-10-11T04:29:00Z] — The batch that wasn't one step

**Post:** Found while shipping variables in WarpCad: wrap "define a variable" and "bind a field to it" in one batch and Undo took two presses. The batch only knew how to merge appended records. A revision of an existing row was left as its own step.

Fixed properly instead of papered over: a batch can now hold both, as one step that undoes newest-first, redoes oldest-first, and puts everything back if either half is refused.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #UndoRedo #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** two Undo steps → the pinned test in `src/core/variables.spec.js` as `ui-059` wrote it, now asserting one; 13 new batch specs fail on the previous `document.js`
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-21T15:55:00Z] — The export format I'd argued didn't need fixing

**Post:** Shipped: WarpCad's .glb exports are watertight now. This was the format I'd argued didn't need to be — a viewer draws triangles, it never asks whether they share edges.

Measured before deciding: 271 of 920 open edges on a Raspberry Pi board. Now 0.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** "a viewer or a game engine, which does not need [a watertight solid]" → `src/render/export.js` module header as written by `io-003`; 271 of 920 → re-measured this session off `geom3ToBufferGeometry`'s position attribute, strict criterion (`uses === 2 && net === 0`); 0 after → same criterion on the `.glb`'s POSITION accessor, in `src/render/export.spec.js` and in a real downloaded file from `npm run dev`; the catch → 101 of 672 zero-area triangles measured on a repaired `raspberrypi.bplus` before the triangulation changed
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-17T13:56:00Z] — The test that disagreed with my code, and was right

**Post:** Shipped angled bisect in WarpCad — cutting a solid on a tilted plane. Roadmap called it the risky one: "needs a rotated cut-plane construction the kernel has no primitive for."

It didn't. Cutting with a tilted plane = rotate the solid the other way, cut with the flat plane you already have, rotate both halves back. New feature, no new geometry.

Then the fixtures — real output from the 2015 library, recorded and diffed — failed three cases, all on Y, all off by a whole half. I assumed my new fixtures were wrong. They weren't: the old library builds that one axis's cut plane from a left-handed basis pair, so it keeps the opposite piece. My port had assumed all three axes matched, and the previous task's fixtures only covered X and Z. A passing test had been asserting the wrong number the whole time.

Also wrong: my own note predicting the extra rotations would cost precision. Worst error, measured, was 4.5e-10 mm.

Built with Claude Code, reviewed by me.

#CAD #ComputationalGeometry #OpenSource
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #ComputationalGeometry #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** `cut(S, T·P) = T(cut(T⁻¹S, P))` → `bisect` in `src/core/kernel/group.js`; Y defect → `NEGATIVE_IS_MAX_SIDE`, two new straight-y fixture cases; 4.5e-10 mm → worst residual across 10 angled cases; 848 unit tests green (+22), bisect e2e green on chromium-laptop
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-11T20:02:00Z] — Clicking into a group: the feature that turned out to live in the render path

**Post:** WarpCad can now click *into* a group: select it once, click a member again, and the selection narrows to that part — breadcrumb, its own dimensions, its own params.

Filed as a click-handler task. Wasn't one. Groups were flattened via a CSG union before ever reaching a mesh, and after a union no polygon knows which part it came from — there was nothing for a handler to resolve. Real fix: one mesh per part.

Best bug of the day: 45 e2e cases passed while the gizmo visibly sat on screen. Drilling in changes no body id, so nothing invalidated the render. Only the app itself showed it.

Built with Claude Code, reviewed by me.

#CAD #WebGL #OpenSource
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Union loses per-part identity → `src/core/kernel/group.js` `toGeom3`/`combine`, replaced at the mesh call site by `createBodyObject` in `src/render/mesh.js` (diff), pinned by `mesh.spec.js`; stale gizmo → this session's RED run (`toHaveCount(0)` saw 1 element across 14 polls until the `selection.subPart` watcher landed); suite green → this session's `npm run test` (521 unit, 653 e2e, 0 failures)
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-11T14:33:33Z] — Group.assemble: the toolbar's fourth button, and the Firefox bug it exposed

**Post:** WarpCad's Operations toolbar just got a 4th button: Group. Unlike Union/Subtract/Intersect, nothing is merged or cut away — every solid keeps its own geometry, addressable by name, while acting as one selectable/movable body.

Found and fixed a real Firefox-only layout bug along the way: the wider toolbar started overlapping the orientation gizmo on narrow panes. Built with Claude Code, reviewed by me.

#CAD #WebGL #OpenSource
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Group keeps every solid's own geometry intact → `src/core/kernel/registry.js` `group.assemble` entry (diff), pinned by `registry.spec.js`; Firefox-only overlap bug → this-session bounding-box probe (ops toolbar 548px right edge vs. gizmo 458px left edge at tablet width; Firefox button row measured 308.0px wide vs. Chromium's 293.2px at phone width)
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-05T16:20:34Z] — Kickoff commit: third CAD attempt + geometry kernel decision

**Post:** Kicking off a third build of a browser CAD app — this time the first commit leads with two retrospectives instead of a feature list. Baking in what broke the last two attempts (untested-until-assembled UI, tests that pass while the app doesn't) plus JSCAD V3 as the geometry kernel. #CAD #WebGL #OpenSource

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** This is the repo's first commit → `git log` this session ("does not have any commits yet"); JSCAD V3 chosen as kernel → diff (`docs/decisions/geometry-kernel.md`, `CLAUDE.md` Stack table)
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-05T16:27:47Z] — Recorded the no-CRDT-for-v1 document-sync deferral

**Post:** Documented a deliberate non-decision for WarpCad: no CRDT for v1's document sync. Single-writer action log doesn't need merge semantics yet — named the one condition that would change that (concurrent AI + human editing) instead of leaving it a silent gap. #CAD #OpenSource

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Document model/sync row stays Open, not resolved → `TODO/docs-002-document-sync-decision.md` Goal section; revival trigger is concurrent MCP+human editing → `Initial design.md` §1 and `CLAUDE.md` AI Partner section
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-05T17:05:00Z] — Interaction-model Q&A for the six core controls (TODO/ui-001)

**Post:** Wrote up the interaction-model Q&A for WarpCad's six core UI controls before any of them hit the roadmap — exact selection counts, phone-width behavior, and a couple of gaps the mockups left implicit (like how Subtract shows you which solid is the base). Boring but load-bearing. #CAD #WebGL

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Must exist before ROADMAP.md names tasks → `CLAUDE.md` Working Files section; resolves gaps in §7's mockups (Transform section, phone auto-open, Subtract indicator) → diff (`docs/decisions/interaction-model-qa.md`) vs. `Initial design.md` §7
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-05T18:10:00Z] — Project scaffold: Vite + Vue 3 + Vitest (TODO/build-001)

**Post:** WarpCad finally has a package.json. Vite + Vue 3 + Pinia, Vitest, Playwright across Chromium/Firefox/WebKit, Storybook, PWA plugin — and a guard test that fails the build if an e2e spec accidentally points at Storybook instead of the real app. #CAD #Vue #WebGL

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #Vue #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Repo had no package.json before this commit → `git status`/diff this session; all three engines pass on the e2e-naming guard → Playwright run this session (3 passed); typecheck/unit/e2e chain runs clean → `npm test` output this session
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-05T19:40:00Z] — Kernel-adapter spike: JSCAD V1→V3 proven on a real bolt (TODO/core-001)

**Post:** Ported jscad-utils' Group (snap/align/combine/pick) to JSCAD V3 as pure functions, then dimensionally diffed a composite hardware.bolt recipe against the real 2022-vintage V1 library's output. Matches to better than 1e-6mm — and required patching two actual bugs in jscad-utils along the way. #CAD #JSCAD #WebGL

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #JSCAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Dimensional diff tolerance and pass → `hardware.bolt.spec.js` + this session's independent test run; jscad-utils bugs found → `scripts/generate-v1-bolt-fixture.cjs` header (diff)
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-05T20:15:00Z] — Resilient document replay + a bug found in yesterday's own code (TODO/core-002)

**Post:** Built WarpCad's NDJSON action-log replay engine — the fold that turns a document into geometry. Wiring it up surfaced a real bug in code from a few hours earlier: an operand-count check was silently ignoring any registry but the real one. Fixed, regression-tested, zero shortcuts. #CAD #WebGL

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Bug and fix → `registry.js`/`index.js` diff, this session; mutation check confirming the fix matters → this session (disabled try/catch, 7 tests failed; restored, 106 passed)
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-05T20:20:00Z] — WarpCad's build roadmap, written from real spike results (TODO/docs-003)

**Post:** Wrote WarpCad's milestone roadmap today — but from actual kernel-spike and interaction-model results, not from the original design doc's plan. One real limitation found while building the kernel (a recipe can't measure geometry it didn't create) now blocks its own named spike in M4 instead of getting silently rediscovered later. #CAD #SoftwareEngineering

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #SoftwareEngineering
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Roadmap built from real core-001/core-002/ui-001 results, not the design doc alone → `TODO/ROADMAP.md` diff, this session; snap-before-measurement limitation carried forward as its own blocking task → `TODO/done/core-001-kernel-adapter-spike.md` retirement note
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-05T19:35:00Z] — 8 acceptance scenarios written before any UI exists (TODO/docs-004)

**Post:** Wrote the 8 fixed acceptance scenarios for WarpCad before a single UI control exists — on purpose, per the project's own rule that these get written up front, not filed reactively. Each one now names real controls (an Operations toolbar, an Inspector Transform section) instead of provisional design-doc language, thanks to the Q&A pass that ran first. #CAD #WebGL

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 8 scenarios transcribed → `TODO/ACCEPTANCE.md` diff, this session; control names sourced from a prior Q&A pass → `docs/decisions/interaction-model-qa.md`; one scenario already passing via an existing test → `src/core/replay.spec.js` line 233
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-05T19:58:00Z] — Fillet spike: the rim ports, the edge doesn't (TODO/core-003)

**Post:** Spiked fillet on JSCAD V3. V1 never had an edge fillet either: both were one rim loft over a single cross-section, which ports exactly. Arbitrary-edge fillet doesn't. Boolean results leave 42% of edges unmatched, so there's nothing to select. #CAD #Geometry

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #Geometry
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** V1 fillet/chamfer are both `util.reShape`, a rim loft over one cross-section → `node_modules/jscad-utils/src/util.js:1023-1068`, read this session; 112 of 264 undirected edges unmatched (42%) after subtracting a cylinder from a cube → edge-adjacency measurement, this session, pinned in `src/core/kernel/fillet.spec.js`; rim ops match analytic volumes to 2e-7 → `npm test`, this session
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-05T21:10:00Z] — WarpCad's viewport is on screen, and the acceptance drive earned its keep (TODO/render-001)

**Post:** WarpCad has a viewport: grid, orientation triad, on-screen orbit/pan/zoom. three.js confirmed over Babylon.js and PlayCanvas first, since it was still only a "default to reconsider". Then the hand-driven touch pass caught what 131 passing e2e tests couldn't — light chrome around a hardcoded dark scene. #CAD #WebGL #ThreeJS

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #ThreeJS
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** three.js compared against Babylon.js and PlayCanvas on GitHub/npm health metrics → `docs/decisions/rendering.md`, figures queried from the GitHub and npm APIs this session; 131 e2e tests passed across 3 viewports × 3 engines → `npm run test:e2e:headless`, this session; light-mode scene defect found by the hand-driven scenario-7 pass, not by any test → `TODO/ACCEPTANCE.md` scenario 7 Last-run note, this session
**To Add:** screenshot of the viewport at iPad width in both colour schemes; repo URL once public


## [2026-09-06T00:58:00Z] — Drag-place lands, and with it the command layer (TODO/ui-010)

**Post:** WarpCad can make things now: drag any of 7 primitives out of the Library panel into the 3D view. One mechanism driven off the kernel registry, not 7 copies.

Turns out @jscad/modeling's triangle primitive is 2D. A solid one needs extruding. #CAD #WebGL

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** `@jscad/modeling`'s `triangle` returns a geom2 (`Object.keys` gives `sides`, `transforms`), not a geom3 → node inspection of `node_modules/@jscad/modeling@2.13.0`, this session; the Library's 7 rows are derived from the registry's own `ui` metadata, not a hand-written list → `src/core/library.js` and `src/core/library.spec.js` in the diff; 223 unit + 225 e2e tests green → `npm run test:unit`/`npm run test:e2e:headless`, this session
**To Add:** short screen recording of a cube and a sphere being dragged in; repo URL once public


## [2026-09-06T01:22:00Z] — Click a shape, see what it is (TODO/ui-011)

**Post:** Clicking a solid in WarpCad now does something: a gizmo, three dimension lines in millimetres, and an Inspector reading that shape's params straight off the kernel registry — so an 8th primitive gets a correct panel with no component change.

Hand-driving it on a phone found two layout bugs 315 green e2e tests couldn't. #CAD #WebGL #Vue

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #Vue
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Inspector fields derived from each op's own `ui.defaults` in the kernel registry rather than a per-primitive form → `src/core/inspector.js` + `src/core/inspector.spec.js` in the diff, including a test asserting all 7 primitives get a non-empty field list; 315 e2e tests passing across 3 viewports × 3 engines → `npm test`, this session; two phone-width defects (the Inspector and Library bottom sheets stacking illegibly; the nav chrome and scale readout sitting behind the sheet's top edge) found only by hand-driving the running app → `TODO/ACCEPTANCE.md` scenario 2 Last-run note, this session, with the overlap measured at 406-451px against a sheet top of 426px before the fix and 362-407px after
**To Add:** screenshot of a selected cylinder with its three dimension lines at laptop width; phone screenshot showing the sheet and the cleared nav chrome; repo URL once public


## [2026-09-06T13:09:00Z] — Moving a shape must not clone it (TODO/ui-012)

**Post:** WarpCad's gizmo handles are draggable now, and the Inspector's numbers count along with the drag rather than jumping at release.

The hard part wasn't the drag. In an append-only document a move is a *new* record with its own id, so the obvious render loop draws the moved body and the one it moved from. One shape, two on screen, first try. Fixed with a lineage index that reports one body per logical object while keeping every intermediate record for undo. #CAD #WebGL

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** a transform record gets its own id and its own `scene.byId` entry, so a records-based `bodies()` returns 2 for one moved body → `src/core/document.spec.js`'s "a transform does not add a second body" failed with "expected length 1 but got 2" before the fix, this session; nothing is deleted by supersession → `src/core/document.js` keeps every record in `entries` and `scene.byId`, asserted in that same spec; fields update mid-drag rather than at release → Inspector Position X sampled at six points during a hand-driven drag (-42.40 → -17.69, settling -16.09), `TODO/ACCEPTANCE.md` scenario 2 Last-run note, this session
**To Add:** short screen recording of a cube being dragged by its X arrow with the Inspector visible; repo URL once public


## [2026-09-06T15:50:29Z] — The gizmo now sizes itself to the shape (TODO/ui-017)

**Post:** Fixed WarpCad's gizmo handles: they were drawn at a fixed 58px, so on anything bigger than a small default cube the rotate rings sat inside the shape's own silhouette. Now they size off the body's real on-screen bounds and scale with zoom, floored so a tiny part still gets a grabbable handle. #CAD #WebGL #OpenSource

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** old fixed constants were `GIZMO_ARM_PX = 58`/`GIZMO_RING_PX = 40` → removed in this session's diff to `Viewport.vue`; new sizing floors at those same values and caps growth → `gizmoSizeForBounds` in `src/render/annotate.js`, this session's diff; 302 unit and 423 e2e tests passing (19 legitimate skips) → `npm run test` output, this session
**To Add:** before/after screenshot of the gizmo on a selected cube at default vs. zoomed-in size; repo URL once public

## [2026-09-06T15:50:29Z] — Gizmo scaling regression caught by re-running the full suite (TODO/ui-017)

**Post:** Small lesson from today's fix: making WarpCad's gizmo bigger broke an existing test that grabbed the arm's rendered midpoint to simulate a stationary click — a longer arm can now legitimately extend past the shape it's on. Fixed by grabbing near the hub instead, where the design already guarantees the body is underneath. #WebGL #TestingInProduction

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #WebGL #TestingInProduction
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** the pre-existing e2e spec and its fix → this session's diff to `e2e/gizmo-transform.e2e.js` (`dragHandle`'s new `grabFraction` option) plus the `npx playwright test` runs this session that reproduced and then resolved the failure
**To Add:** repo URL once public

## [2026-09-06T16:09:07Z] — Shift+drag and right-drag pan the viewport without touching the mode toggle

**Post:** Desktop 3D apps let you pan with Shift+drag or a right-drag, no mode switch needed. WarpCad's viewport only had a click-to-toggle Orbit/Pan button until now — fine for touch, friction on a mouse. Added both shortcuts on top of the toggle, reusing the same click-vs-drag threshold that already gates Shift-click multi-select so the two don't collide. #WebGL #CAD

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #WebGL #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** the toggle-only pan and its `dragMode` ref predating this change → `src/components/viewport/Viewport.vue` before this session's diff; Shift-click already meaning additive multi-select → same file, pre-existing `pickAt` call this session's diff leaves untouched; full suite green (typecheck, 302 unit, 432 e2e passed / 19 skipped, all three engines) → `npm run test`/`npx playwright test` output, this session
**To Add:** repo URL once public

## [2026-09-06T16:25:49Z] — Mouse pan/orbit mapping is now a saved preference (TODO/ui-019)

**Post:** WarpCad's viewport pan/orbit was one fixed mouse mapping. Now it's a preference: a gear icon in the nav chrome opens two presets (default, or left-drag pans/right-drag orbits), saved to localStorage and live on your next drag. #WebGL #CAD

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #WebGL #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** `ui-018`'s original hardcoded mapping (Shift+Left or Right-drag pans) → `TODO/done/ui-018-*.md` and this session's diff to `src/components/viewport/Viewport.vue`; this is the project's first `localStorage` use → grep of `src/` and `e2e/` found no prior reference, confirmed this session before implementing; a blocked/throwing store falls back to the default rather than crashing → `src/stores/settings.js`'s try/catch, exercised by 7 passing unit tests in `settings.spec.js`, this session; the preset applies without a reload and survives a real one → hand-driven at the iPad viewport (WebKit, touch) and a desktop Chromium context this session, plus new e2e coverage in `e2e/viewport-scaffold.e2e.js`; full suite green (typecheck, 309 unit, 459/478 e2e passed with 19 skips, all three engines and viewports) → `npm run test` output, this session
**To Add:** screenshot of the open preset popover next to the nav chrome; repo URL once public

## [2026-09-06T18:24:35Z] — Killed the white-flash-on-load bug (again)

**Post:** Fixed a white-screen flash on app load — the dark UI now paints on the very first frame instead of after the JS module graph fetches the stylesheet that sets it. Verified the race is actually closed with a throttled-load check across Chromium, Firefox, and WebKit, not just eyeballing a fast local reload. #WebGL #CAD

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #WebGL #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** the flash's root cause (empty `<head>`, dark background only arriving via a JS-module-triggered CSS fetch) → `TODO/done/build-002-fix-load-white-flash.md`'s Problem section and the diff to `index.html`; this exact bug class shipped on Safari/iPad in both previous attempts → `CLAUDE.md`'s Browser Support section; verified with a 2s artificial JS/CSS delay across Chromium/Firefox/WebKit, background read `#10131a` and the `color-scheme` meta was present 150ms after navigation commit → Playwright script output, this session; full suite green (typecheck, 313 unit tests across 19 files, 459 e2e passed/19 skipped) → `npm run test` output, this session
**To Add:** repo URL once public

## [2026-09-06T19:02:00Z] — Dimension lines now measure the part, not its shadow (TODO/ui-023)

**Post:** WarpCad measured a selected solid with its world-axis bounding box. Fine until you rotate something: a tipped cylinder stopped showing its diameter and length and started showing the crate it fits inside. Now the lines follow the part's own axes. Tilt it 62°, still reads 40/40/50. #CAD #WebGL #Geometry

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #Geometry
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** the world-AABB measurement and its effect on a rotated body → `TODO/done/ui-023-oriented-dimension-lines.md`'s Problem section, plus the pre-change e2e assertion `toBeCloseTo(40 * Math.SQRT2, 0)` at `e2e/gizmo-transform.e2e.js:410` in commit 0fa21e6; rotation has only been reachable since `ui-012` landed the same day → git log 660f042, dated 2026-09-06; a ⌀40×50 cylinder tilted 62° reports 40/40/50 → hand-driven against the running app this session, screenshot captured; a real X rotate-ring drag turned it to −34.61° with the lines unchanged → same drive; full suite green (typecheck, 327 unit, 468 e2e passed/19 skipped across 3 engines × 3 viewports) → `npm run test` stages, this session
**To Add:** the screenshot of the tilted cylinder with its 50 mm line running down its own axis; repo URL once public

## [2026-09-06T19:19:00Z] — A body's rotation was a running total, not its actual orientation (TODO/core-004)

**Post:** Rotations don't commute, so adding up rotation deltas isn't the same as composing them. WarpCad had been adding. Turn a ⌀40×50 cylinder 45° about Y then 45° about X and it reported its size as 46.82/51.05/59.42 — three numbers, not one of them a dimension of the part. Now composed properly: 40/40/50. #CAD #Geometry #WebGL

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #Geometry #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** the carried sum vs. composed geometry, and the measured 46.82/51.05/59.42 and 50/40/40 rows → `TODO/done/core-004-rotation-carried-as-sum-not-composition.md`'s Problem and Measured-reproduction sections; the old `rotation: [current[0] + angles[0], …]` → diff to `src/core/transform.js`; both rows now read 40/40/50 → hand-driven against the running app this session at laptop/Chromium and phone/WebKit, screenshots captured; a Z-ring then X-ring drag leaves a Y term the drags never touched (`20.92 / −8.54 / 21.23`), which a sum cannot produce → same drive; full suite green (typecheck, 346 unit, 477 e2e passed/19 skipped) → `npm run test` stages, this session
**To Add:** the screenshot of the 45°/45° cylinder reading 40/40/50; repo URL once public

## [2026-09-07T16:18:46Z] — Rotate rings now show which way they spin (TODO/ui-022)

**Post:** WarpCad's rotate-ring handles were just thin circles — nothing told you they were drag targets rather than decoration or a selection halo. Added small arrow markers along each ring pointing the drag direction, the same cue the move arrows already carry. #CAD #WebGL #Geometry

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #Geometry
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** the rings carried no visual cue distinguishing "drag handle" from decoration → `TODO/done/ui-022-rotate-ring-direction-arrows.md`'s Problem section; the fix draws two chevrons per ring tangent to the circle, reusing the existing `writeArrowhead()` convention → diff to `src/render/annotate.js` (`ringArrowheads`) and `src/components/viewport/Gizmo.vue`; full suite green (typecheck, 349 unit tests across 20 files, 480 e2e passed/25 skipped across 3 engines × 3 viewports) → `npm run test` stages, this session; the markers render and the ring's drag still works with them present, both translate and rotate → hand-driven against the running app this session, screenshots captured
**To Add:** screenshot of the arrow markers on a selected cylinder's gizmo; repo URL once public

## [2026-09-07T17:10:41Z] — The transform gizmo gets a shaded, 3D look (TODO/ui-021)

**Post:** WarpCad's gizmo arrows and rotate rings read as flat 2D lines over a 3D scene. Gave them gradient shading, a double-stroke ring band, and a soft drop shadow — same SVG overlay, zero new geometry. #CAD #WebGL #Geometry

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #Geometry
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** the handles were a uniform-width `<line>`/flat `<polygon>` with no shading before this change → `TODO/done/ui-021-gizmo-3d-appearance.md`'s Problem section; the fix is per-axis SVG `<linearGradient>`s plus a double-stroke ring band and a shared `drop-shadow` filter, no changes to `src/render/annotate.js` → diff to `src/components/viewport/Gizmo.vue`; `color-mix()` (new to this repo) resolves correctly rather than falling back to black in Chromium, Firefox and WebKit → this session's manual cross-engine check; full suite green (typecheck, 349 unit tests across 20 files, 483 e2e passed/31 skipped across 3 engines × 3 viewports) → `npm run test` stages, this session; `ui-022`'s rotate-ring arrow markers still render (2 per visible ring) after the restyle → this session's hand-drive of the running app
**To Add:** before/after screenshot of a selected cube's gizmo; repo URL once public

## [2026-09-07T18:05:52Z] — Drag-box (marquee) multi-select (TODO/ui-024)

**Post:** WarpCad's viewport now supports drag-box (marquee) multi-select — grab several parts at once by dragging a box, the standard CAD/DCC gesture and the only way to multi-select on touch. Ctrl/Cmd+drag on desktop, a new Select toggle for touch.

Built with Claude Code, reviewed by me. #CAD #WebGL #UX
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #UX
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** multi-select previously required Shift-clicking each body individually → `src/stores/selection.js`'s pre-existing `toggle()` and `TODO/done/ui-024-drag-box-multi-select.md`'s own Goal section; the drag-box gesture projects each body's world-axis bounding box to screen space and tests overlap with the dragged rectangle, partial overlap counts as enclosed → diff to `src/render/annotate.js` (`updateBoxScreenBounds`, `marqueeIntersectsBox`); the trigger is Ctrl/Cmd+drag on desktop and a new "Select" chrome toggle on touch, not the TODO's own literal "plain left-drag" suggestion, because that would have broken the existing plain-drag-orbits default → `docs/decisions/interaction-model-qa.md`'s new addendum, and `e2e/viewport-scaffold.e2e.js`'s pre-existing orbit-drag regression test which was re-run and still passes; typecheck and 356 unit tests across 21 files passed, and every e2e spec touching this change (marquee's own two new tests, the pan-gesture regressions, and the click-select regressions) passed across all 3 engines × 3 viewports when run in isolation → this session's `npm run typecheck`/`test:unit`/`playwright test` runs
**To Add:** screenshot of the marquee rectangle mid-drag; repo URL once public

## [2026-09-07T18:56:08Z] — Orientation gizmo legibility fix (TODO/ui-025)

**Post:** WarpCad's orientation gizmo had six identical caps burying the colored spoke triad that's supposed to show your camera angle. Made caps translucent, gave each spoke a visible tail past its button, and faded the back-facing axes.

Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** the six 32px caps nearly tiled the 116px dial, leaving only a sliver of the triad visible before this change → this session's before-screenshot of the shipped component plus `TODO/ui-025-orientation-gizmo-label-legibility.md`'s own Problem section; `RADIUS` (cap anchor) was left unchanged because growing it would overflow the mobile 96px dial, which sits at zero margin already (33 + 15 cap-radius = 48 = 96/2) → arithmetic on `OrientationGizmo.vue`'s own constants in the diff; the fix is a separate, larger spoke-only radius (`SPOKE_SCALE`), translucent `color-mix()` cap backgrounds, and a further-receded `.gizmo__cap--negative` → diff to `src/components/viewport/OrientationGizmo.vue`; `color-mix()` resolves identically (not falling back) in Chromium, Firefox and WebKit → this session's manual cross-engine `getComputedStyle` check; full suite green (typecheck, 356 unit tests/21 files, 504 e2e passed/37 skipped across 3 engines × 3 viewports) → this session's `npm run typecheck`/`test:unit`/`test:e2e:headless` runs; this was the last open row in `TODO/ROADMAP.md`'s M1.5 table, now fully ✅ → diff to `TODO/ROADMAP.md`
**To Add:** before/after screenshot of the dial; repo URL once public

## [2026-09-09T13:08:36Z] — Snap guides for drag placement (TODO/ui-013)

**Post:** Dropping a second part in WarpCad now grows dashed guides on the nearest one, and the ghost snaps to them before you let go. Five alignments per axis — centre line, flush face, touching face — nearest wins inside a screen-pixel radius, so it reads the same at any zoom.

Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** five candidate alignments per working-plane axis, nearest within tolerance wins → `SNAP_ALIGNMENTS`/`updateSnap` in the diff to `src/core/library.js`; the tolerance is a screen-pixel constant converted through `mmPerPixel` → `SNAP_TOLERANCE_PX`/`snapToleranceMm` in the same diff, plus `src/core/library.spec.js`'s conversion tests passing this session; the ghost snaps before release and the snapped position is what commits → this session's hand-drive, where the identical screen gesture landed at `-110.70,70.22` with a reference present and `-97.21,70.61` on an empty page (laptop/Chromium)
**To Add:** short screen capture of a ghost snapping onto a placed cube; repo URL once public

## [2026-09-09T13:23:11Z] — hardware.nut composite recipe (TODO/core-010)

**Post:** Added hardware.nut to WarpCad's geometry kernel: one hex-prism recipe, dimensionally diffed against real jscad-hardware V1 output across loose, tap and close fits. Still no Library-panel row for it yet.

Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** one hexagonal-prism op record, no group/translate → `src/core/kernel/recipes/hardware.nut.js` in the diff; diffed against real V1 `Hardware.Nut()` output for `m4`/loose, `m4`/tap and `1/4 hex`/close → `hardware.nut.spec.js`'s "dimensional diff" describe block and the generated `hardware.nut.v1-reference.json` fixture; Library panel still only reads `primitive.*` registry rows → `src/core/library.js`'s `buildRows` filter, read this session; full suite green (typecheck, 395 unit tests, 571 e2e passed/42 skipped) → this session's `npm run typecheck`/`test:unit`/`test:e2e:headless` runs
**To Add:** repo URL once public

## [2026-09-09T13:33:39Z] — hardware.washer composite recipe (TODO/core-011)

**Post:** WarpCad's kernel now builds washers too — one tube for the body, an optional hidden clearance cylinder when a fit class is given. The metric sizes have no source in jscad-hardware at any version, so they're ported from ISO 7089 instead and checked against the spec, not a V1 diff.

Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** one `primitive.tube` record always, one hidden `primitive.cylinder` only when `fit` is given → `src/core/kernel/recipes/hardware.washer.js` in the diff; diffed against real V1 `Hardware.Washer()` output for `ImperialWashers['1/4']` with `fit: 'loose'` and with `fit` omitted → `hardware.washer.spec.js`'s "dimensional diff" describe block and the generated `hardware.washer.v1-reference.json` fixture; no `MetricWashers` table exists in `jscad-hardware` at any version this project has access to → `TODO/core-011-hardware-washer-recipe.md`'s Goal section, citing the vendored 1.1.0, the author's own current 5.0.0 tree, and the `jscad-hardware2` v1 tree; metric sizes checked against ISO 7089 by table-conformance test, not a V1 diff → `hardware.washer.spec.js`'s "washer spec table" describe block; full suite green (typecheck, 413 unit tests across 23 files, 571 e2e passed/42 skipped) → this session's `npm run typecheck`/`test:unit`/`test:e2e:headless` runs
**To Add:** repo URL once public

## [2026-09-09T14:26:00Z] — Kit-part composite recipes: Board, BoardFrame, Anchor (TODO/core-012)

**Post:** WarpCad's kernel grew a 2D layer. Porting jscad-utils' BoardFrame meant keeping V1's ordering: subtract the two rounded rectangles while flat, then extrude. Doing that to same-height solids is the non-manifold trap V1's own comment warns about.

Built with Claude Code, reviewed by me. #CAD
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** V1 subtracts the two rounded rectangles in 2D specifically to avoid "BSP non-manifold artifacts that occur when subtracting two same-height `Board` solids" → `parts.js`'s own doc comment on `BoardFrame` in `~/src/jscad/jscad-utils` (6.0.0), read directly this session; the port preserves that ordering as records → `src/core/kernel/recipes/kit.boardFrame.js` in the diff, with `kit.boardFrame.spec.js` asserting the extrude's `target` is the subtract's `id`; the 2D layer is new (`profile.roundedRectangle`, `profile.extrudeLinear`) → this diff's `src/core/kernel/registry.js`; full suite green (typecheck, 457 unit tests across 26 files, 571 e2e passed/42 skipped) → this session's `npm run typecheck`/`test:unit`/`test:e2e:headless` runs
**To Add:** repo URL once public

## [2026-09-10T15:47:00Z] — group.snap/group.align wired to the op registry (TODO/core-013)

**Post:** WarpCad can now place one part against another by name: this bolt's head, flush with that hinge's body. Sub-part addressing on both sides.

I surveyed 2,147 real .snap/.align calls in my JSCAD projects first. A third reach into another item's .parts.

Built with Claude Code, reviewed by me. #CAD
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 1,361 `.snap(` + 786 `.align(` = 2,147 calls across 123 `*.jscad` files in `~/src/jscad/`, of which 719 (~33%) name `.parts.` on the reference side → grep run this session with `--include='*.jscad' --exclude-dir=node_modules --exclude-dir=dist`; sub-part addressing on both `target` and `operands` → `src/core/kernel/index.js`'s `normalizeRef` and the two `rawNative` entries in `registry.js`, this diff, with `registry.spec.js`'s "reaches a named piece of a *different* placed item as the reference" test; full suite green (typecheck, 477 unit tests across 26 files, 571 e2e passed/42 skipped) → this session's `npm run typecheck`/`test:unit`/`test:e2e:headless` runs
**To Add:** repo URL once public

## [2026-09-10T17:20:00Z] — Boolean operations toolbar with selection-count gating (TODO/ui-014)

**Post:** WarpCad can cut one solid out of another now. Union, Subtract, Intersect.

The buttons stay dimmed until two solids are selected, and the first one you pick turns amber while the rest turn teal, so you can see which one Subtract is about to cut before you press anything.

Built with Claude Code, reviewed by me. #CAD
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** three operations, count-gated at 2+ → `src/components/viewport/OperationsToolbar.vue` in this diff, `disabled = selection.count < 2`; amber base / teal subtrahend → `BODY_COLORS.*.secondary` in `src/render/mesh.js` and `selectionRole()` in `Viewport.vue`, this diff, with `mesh.spec.js` asserting body/selected/secondary are three distinct colours in both schemes; visible before the button is pressed → `TODO/ACCEPTANCE.md` scenario 4 hand-drive this session, screenshotted at laptop/Chromium and phone/tablet WebKit; full suite green (typecheck, 490 unit tests across 26 files, 598 e2e passed/96 skipped) → this session's `npm test` run
**To Add:** repo URL once public; a screenshot of the amber/teal pair mid-selection would carry this one

## [2026-09-10T22:25:00Z] — Composite absorbed every earlier body into its own group (TODO/core-020)

**Post:** Found a good one in WarpCad. Place a plate, then place a bolt, and the bolt quietly swallowed the plate — it listed the plate as one of its own parts and grew to span it. Subtract that "bolt" and the whole plate vanished.

Cause: a spread operator. The recipe expansion inherited the caller's scene as its starting group.

Built with Claude Code, reviewed by me. #CAD
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** bolt stored as `["Shell 1","head","thread","tap"]` spanning `-20,-20,0 .. 20,20,27` before the fix, `["head","thread","tap"]` at `-9.25,-8.01,0 .. 9.25,8.01,27` after → RED test run and browser drive against the real modules, this session; subtract returned an empty solid (`0,0,0 .. 0,0,0`) before and a real hole after (bounds `-20,-20,0 .. 20,20,6`, volume 8 266.2 mm³ of a 9 600 mm³ plate) → same drive; cause is `{ ...options }` carrying `initial` into the recipe's nested `evaluate` → this diff, `src/core/kernel/index.js`
**To Add:** repo URL once public; a before/after render of the plate would carry this one

## [2026-09-11T20:23:14Z] — Snap and Align: two buttons that move a shape without consuming it (TODO/ui-026)

**Post:** Two new buttons landed on WarpCad's Operations toolbar: Snap and Align. Select two solids, move one flush against the other or centered on it. Unlike Union/Subtract/Group, neither solid gets consumed here, both stay selectable.

Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** exactly-2 gating, distinct from the other four buttons' "2+" → `src/components/viewport/OperationsToolbar.vue` in this diff, `EXACT_OPERANDS`/`snapAlignDisabled`; Union/Subtract/Intersect/Group retire operands via `consumes` → same file's pre-existing `run()`, unchanged by this diff; Snap/Align append a `supersedes` record instead, so both solids stay independently selectable → this diff, `commitSnapAlign()`, confirmed by `e2e/snap-align-operation.e2e.js`'s body-count and click-through assertions this session; `Body.name`/`op`/`params` read from a lineage's root record, never a superseding one → `src/core/document.js`'s own module doc, pre-existing; kernel side (`group.snap`/`group.align` registered) landed 2026-09-10 → `git log` commit 39fc42f; full suite green (typecheck, 521 unit tests across 27 files, 671 e2e passed / 158 skipped) → this session's `npm run test` output
**To Add:** repo URL once public; a screenshot of the Snap/Align popover mid-selection would carry this one

## [2026-09-11T20:41:00Z] — Three more ops: Enlarge, Fit, Bisect (TODO/core-019)

**Post:** WarpCad's kernel picked up three more ops ported from an older JSCAD library: Enlarge (grow by a delta), Fit (scale to a target size), Bisect (cut a solid into two named halves).

Bisect's own positive/negative naming reads backwards in the old library's source — only running the real thing and measuring the output showed which half is which.

Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** no prior port of these three existed, unlike Snap/Align → `TODO/done/core-019-enlarge-fit-bisect.md`'s own Goal section, this diff; `bisect`'s `negative`/`positive` naming and offset-sign convention read backwards from V1's source, resolved only by running it → `src/core/kernel/group.js`'s `bisect` doc comment, this diff; measured against real `jscad-utils@3.2.0` output via a generator script, not a source-reading guess → `scripts/generate-v1-modify-fixture.cjs`, this diff, mirroring `core-010`/`core-011`'s same-shaped fixture scripts; half-space-box `intersect`/`subtract` substitutes for V1's `OrthoNormalBasis` cutplane, since `@jscad/modeling` has no infinite-plane primitive → same doc comment; straight cuts only, ~15% of ~55 surveyed real `.bisect(` call sites use the deferred angled form → `TODO/done/core-019-enlarge-fit-bisect.md`'s survey section; `enlarge` throws by axis name on a delta that would collapse/invert an axis, where V1 silently mirrored → `group.js`'s `enlarge`, this diff; registry entries are `operandCount: 1` with no `ui` metadata, so they can't leak into the Library panel → `src/core/kernel/registry.js`, this diff, `registry.spec.js`'s gating test; `ui-010`'s Library-panel repro re-run and PASS against the new registry entries → `TODO/ACCEPTANCE.md` re-check dated 2026-09-11 20:41; full suite green (typecheck, 559 unit tests across 27 files, 671 e2e passed / 158 skipped) → this session's `npm run typecheck`/`test:unit` runs plus the e2e figures from this task's own independent re-verification
**To Add:** repo URL once public; a render of a bisected part (two named halves, pulled apart) would carry this one

## [2026-09-12T16:52:00Z] — The survey was wrong, the decision was right (TODO/core-014a)

**Post:** A decision doc I wrote to confirm a survey ended up overturning it. The survey said no real recipe measures geometry it didn't build. Eight do, and two of them require it. The decision still held, but on completely different reasoning.

Built with Claude Code, reviewed by me. #CAD #OpenSource
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** the scoping pass claimed no real recipe attaches a separately-built accessory to a separately-built board → `TODO/done/core-014a-recipe-geometry-measurement-decision.md`'s own investigation section; eight recipes take an externally-built board group as a parameter → `~/src/jscad/jscad-raspberrypi/src/` at `62a8e3b`, re-surveyed this session: `hat.js:24`, `hyper-pixel-4-rectangular.js:17`, `touch-display-7inch.js:16`, `touch-screen2.js:16`, `miniPiTFT.js:81`, `pi-tft22.js:28`, `pi-tft24.js:48`, `spacer.js:51`; two require it (no guard, unconditional use) → `touch-screen2.js:16` used at `:179-181`, `touch-display-7inch.js:16` used at `:153-154`; the decision (no two-phase expansion) unchanged → `docs/decisions/composite-recipe-geometry.md`, this diff
**To Add:** repo URL once public; nothing visual — this commit is a decision doc

## [2026-09-12T17:35:00Z] — Sketch mode: the bug only a hand-drive could see (TODO/ui-020)

**Post:** Shipped 2D sketch mode. Typecheck green, 584 unit tests green, 90 new e2e assertions green across 3 browsers x 3 viewports.

Then I drove it by hand and found every drawn line was an invisible dead strip that swallowed clicks. The specs fired pointer events straight at the canvas, so they skipped the browser hit-testing that was the whole bug.

Built with Claude Code, reviewed by me. #CAD #WebGL #Testing
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #Testing
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** typecheck clean, 584 unit tests across 28 files, 761 e2e passed / 158 skipped → this session's `npm run typecheck`, `npm run test:unit -- --run` and `npm run test:e2e:headless` runs; 90 new e2e assertions = 10 tests x 9 projects → `npx playwright test e2e/sketch-line-entity.e2e.js` this session, `playwright.config.js`'s 3-engine x 3-viewport matrix; each stroke carried a transparent 18px `pointer-events: stroke` hit target that swallowed `pointerdown` → the removed markup in this diff, `SketchStrokes.vue`'s header note; every spec in this file dispatches synthetic `PointerEvent`s at the canvas element and bypasses hit-testing → `e2e/sketch-line-entity.e2e.js`'s own helpers, this diff
**To Add:** repo URL once public; a screen recording of drawing a line and dragging an endpoint would carry this one

## [2026-09-12T21:03:00Z] — Fillet/Chamfer, and a toolbar that keeps running out of room (TODO/ui-027)

**Post:** WarpCad's toolbar now has Fillet and Chamfer: select one shape, pick a face, round or bevel its rim. Adding two buttons broke the phone-width layout the same way twice before -- fixed a third time with icon-only buttons below 640px.

Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** `modify.filletRim`/`chamferRim` and their registry entries already existed and were already tested → `src/core/kernel/registry.js:715-733`, `src/core/kernel/fillet.spec.js` (pre-existing, not part of this diff); the kernel deliberately leaves a rim-filleted shape's bounding box unchanged → `src/core/kernel/fillet.js`'s own module doc and `fillet.spec.js`'s "leaves the bounding box alone" test (pre-existing); e2e spec checks volume instead, added `volumeOf` → `src/core/kernel/group.js`, `e2e/fillet-chamfer-operation.e2e.js`, this diff; adding two buttons pushed the phone-width toolbar from 3 wrapped rows to 4, reaching into `NavigationChrome` (measured `y≈207` vs. the new row's `y≈242`) → this session's own bounding-box measurement against the running dev server; this is the third time this same toolbar hit a phone-width collision as buttons were added → `TODO/ROADMAP.md`'s own `ui-015` and `ui-026` completion-log rows; fix hides button text labels below 640px, matching an existing pattern → this diff's `OperationsToolbar.vue` CSS, `NavigationChrome.vue`'s pre-existing `--tap-compact` icon buttons; full suite green (typecheck clean, 588 unit tests / 29 files, 797 e2e passed / 158 skipped) → this session's `npm run typecheck`/`test:unit -- --run`/`test:e2e:headless` runs; new spec 36/36 passed (4 tests × 9 projects) → `npx playwright test e2e/fillet-chamfer-operation.e2e.js`, this session; `ui-026`'s own e2e spec re-run unchanged, 18/18 passed → `npx playwright test e2e/snap-align-operation.e2e.js`, this session; `ui-026` shipped 2026-09-11 → `git log 7f1a2f8`
**To Add:** repo URL once public; a before/after screenshot of a filleted cube (a Front-view render shows the rounded-dome-on-a-box shape most clearly) would carry this one

## [2026-09-12T22:10:00Z] — Editable parameters, and the edit the app refuses to make (TODO/ui-029)

**Post:** WarpCad: type a new diameter in the Inspector and the cylinder narrows, staying where you put it.

The interesting part is what it refuses. A shape with a fillet keeps its parameters frozen -- rebuilding from numbers would silently eat the rim.

#CAD #WebGL

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** typing a diameter narrows the solid and leaves its centre byte-identical (`-60.51,36.03,25.00` before and after, size `[40,40,50]` -> `[10,10,50]`) → this session's hand-drive against the dev server at laptop/Chromium, laptop/Firefox and phone/WebKit; a filleted body's Parameters section reports `data-editable="false"`, every field is `readonly`, and forcing a value into it changes the solid's volume by nothing (13094.015 both times) → same drive; the fields were read-only by deliberate deferral, not oversight → `src/components/inspector/Inspector.vue`'s pre-existing doc comment and `TODO/ui-029`'s own Goal section; full suite green (typecheck clean, 613 unit tests / 30 files, 842 e2e passed / 158 skipped, against a 797-passed baseline before this task) → this session's `npm run typecheck` / `test:unit -- --run` / `test:e2e:headless` runs
**To Add:** repo URL once public; a short screen recording of the diameter edit (the shape narrowing in place, dimension lines resizing with it) would carry this one better than a still

## 2026-09-13T18:44:00Z — Raspberry Pi board recipe, diffed against the real V1 library

**Post:** Ported jscad-raspberrypi's BPlus() into WarpCad's kernel: a Pi board, 4 variants, ~50 parts, one param.

Then I ran the real V1 library and diffed every part: 115 boxes, matching to 1.4e-14 mm.

My tests passed first try. That's when I trust them least.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #RaspberryPi #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 294 characters including the disclosure line → counted this session; one recipe covering models 2/3/4/5 from one `model` param, 23/25/33/38 emitted parts per model → `src/core/kernel/recipes/raspberrypi.bplus.js` and this session's browser drive; 115 parts diffed against the real `jscad-raspberrypi@62a8e3b` library with 0 mismatches and a worst delta of 1.4210854715202004e-14 mm → the V1-vs-V3 comparison run this session, now committed as `recipes/__fixtures__/raspberrypi.bplus.v1-reference.json` and asserted in `raspberrypi.bplus.spec.js`; the 36 hand-written assertions all passed on their first run, before the V1 fixture existed → this session's vitest output
**To Add:** repo URL once public; the viewport screenshot of the rendered Pi 4 board (ethernet/USB stack, connector row, GPIO strip) carries this one better than text

## 2026-09-13T19:15:00Z — Five Pi camera modules, and a spec that was wrong three ways

**Post:** Five Raspberry Pi camera modules, one kernel recipe, a model param.

The spec said rotate the HQ mounting holes about each part's own centre. V1 turns them about the world origin. Follow the spec and all four stack in one corner.

The fixture caught it.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #RaspberryPi #OpenSource
**Evidence:** 294 characters including the disclosure line → counted this session; five variants (v1/v2/v3/hq/arducam-hq) behind one `model` param → `src/core/kernel/recipes/raspberrypi.cameraModule.js`; the spec's instruction "each rotate about the part's own centre, per `ui-012`'s convention" → `TODO/done/core-015-camera-module-recipes.md` Proposed fix; V1 rotating about the world origin → `hq_camera-module.js:57-59`'s `hole.rotateZ(90)` plus the fixture's own hole bounds, and `registry.js`'s `transform.rotate` defaulting `center` to `[0,0,0]`; "all four stack in one corner" → mutation test run this session, which reported the hole2→hole1 angle step as 0° instead of 90° when `center` was set to the part's own centre
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; a viewport screenshot of the rendered HQ camera (38 mm board, lens-mount ring with a real bore, tripod block) would carry this better than text

## 2026-09-13T19:50:00Z — Two touch displays, and a library method that mutates

**Post:** Ported two Raspberry Pi touch displays into WarpCad's kernel.

The spec said one mounting pad gets rotated. The jscad-utils `rotate` mutates the group in place, and the source rotates before it clones, so all four inherit the turn. Its sibling recipe clones first and only turns two.

Same method, opposite result, one `clone()` apart.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #RaspberryPi #OpenSource
**Evidence:** 297 characters including the disclosure line → counted this session; "rotate mutates the group in place" → `jscad-utils/src/group.js:246-272`, whose own docstring reads "This mutates the group"; "rotates before it clones, so all four inherit the turn" → `touch-display-7inch.js:69` vs `:75,81,87`, confirmed by the V1 execution fixture recording all four pads at 12x8 rather than the built 8x12; "its sibling clones first and only turns two" → `touch-screen2.js:97,103` call `clone()` before `rotate()`, fixture shows pads 1/2 at 5.6x12 and pads 3/4 at 12x5.6; "the spec said one mounting pad" → `TODO/done/core-016-touch-display-recipes.md` Proposed fix
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; the viewport screenshot of the 7-inch display with a B+ board seated on it (captured this session) is the strongest visual here

---

## 2026-09-14T19:34Z · core-017 — four small-display recipes, and a twisted loft

Ported four Raspberry Pi display boards into WarpCad's kernel. Best bug: an outward chamfer lofted 556mm3 where 1596 was right. jscad's offset hands back the outline rotated one vertex, extrudeFromSlices walls by index, so every side came out twisted.

Built with Claude Code, reviewed by me.

**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** none — the post is already at 292 characters including the disclosure, and none of #CAD/#RaspberryPi would fit without cutting the actual finding
**Evidence:** 292 characters including the disclosure line → counted this session; "four Raspberry Pi display boards" → `raspberrypi.miniPiTFT`, `piTFT22`, `piTFT24`, `hyperPixel4Rectangular`, all four registered in `src/core/kernel/registry.js` in this commit; "556mm3 where 1596 was right" → measured this session against `@jscad/modeling` 2.13.0, a 3mm outward flare on a 20mm cube (analytic frustum volume (5/6)(400 + 4·529 + 676) = 1596mm3); "offset hands back the outline rotated one vertex" → `expansions.offset({delta: 3, corners: 'edge'})` on a 20mm square returns `[[13,-13],[13,13],[-13,13],[-13,-13]]` against a base of `[[-10,-10],[10,-10],[10,10],[-10,10]]`, printed this session; "extrudeFromSlices walls by index" → the convergence signature (556 → 1136 → 1381mm3 at 2/3/5 slices) measured this session, which is a twist rather than a fixed error
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public

---

## 2026-09-16T23:28Z · core-018 — four accessory recipes, and a silent clamp

Ported four Raspberry Pi accessories into WarpCad's kernel. Best find: the spacer asks jscad for a 3.1mm corner radius on a 6.2mm brace. Old CSG silently clamps that to 3.0. Modern jscad throws. Reproduce the clamp and the volume matches V1 to 12 digits.

Built with Claude Code, reviewed by me.

**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** none — the post is at 295 characters including the disclosure, and no tag fits without cutting the finding itself
**Evidence:** 295 characters including the disclosure line → counted this session; "four Raspberry Pi accessories" → `raspberrypi.activeCoolingFan`, `hat`, `hatStandoff`, `spacer`, all four registered in `src/core/kernel/registry.js` in this commit; "asks jscad for a 3.1mm corner radius on a 6.2mm brace" → `jscad-raspberrypi@62a8e3b` `src/spacer.js:82`, `Parts.Board(tri.C + 5.5, 6.2, 3.1, options.thickness)`; "old CSG silently clamps that to 3.0" → `@jscad/csg/src/api/primitives2d.js` `roundedRectangle`, `maxroundradius = Math.min(radius.x, radius.y); maxroundradius -= 0.1`, read this session; "modern jscad throws" → `@jscad/modeling` 2.13.0 rejects a roundRadius not strictly under half the shortest side, as does this repo's own `assertCornerRadiusFits` in `src/core/kernel/registry.js`; "matches V1 to 12 digits" → V1 execution fixture 496.94410833398206 mm³ against this port's 496.94410833398257 mm³, both measured this session
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; a render of the spacer's diagonal cross-brace would carry this one visually

## 2026-09-17T13:33Z · ui-028 — Enlarge, Fit, Bisect: a solid becomes a group mid-lineage

**Post:** WarpCad's Operations toolbar just got Enlarge, Fit and Bisect: grow/shrink a solid, resize to an exact target, or cut it into two selectable parts along an axis.

Bisect turns a solid into a group mid-lineage, proven end to end for the first time.

#CAD #WebGL
Built with Claude Code, reviewed by me.

**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Evidence:** Three new controls, `supersedes`-based unnamed records → `src/components/viewport/OperationsToolbar.vue` `commitResize` (this commit), pinned by `e2e/resize-bisect-operation.e2e.js` (6/6 on chromium-laptop, this session); Bisect is the first `supersedes` record to change `KernelGeometry` kind from solid to `Group` → `TODO/done/ui-028-resize-bisect-controls.md`'s own Proposed fix text, flagging it as previously unexercised; full matrix 8/9 cells green (`chromium`/`webkit` x phone/tablet/laptop, 36/36 tests), Firefox blocked at browser launch and confirmed pre-existing by reproducing against the already-shipped `e2e/fillet-chamfer-operation.e2e.js` → this session's `npx playwright test` output, logged in `TROUBLESHOOTING.md`'s 2026-09-17 entry; hand-driven `TODO/ACCEPTANCE.md` scenario 1 and `ui-016`'s grouped-body repro against Bisect's own output, both PASS → this session's Playwright-driven Node script output and `TODO/ACCEPTANCE.md`'s 2026-09-17 13:26 re-check entry
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public, docs site URL once it exists

## 2026-09-17T14:32Z · core-022 — Bisect's negative half stops changing meaning on one axis

**Post:** WarpCad's Bisect names two halves negative/positive. The 2015-era library it ports gets Y backwards from X/Z, a left-handed basis, faithfully reproduced at first. Stopped carrying that forward: negative is always the min-side half now, every axis.

#CAD #WebGL
Built with Claude Code, reviewed by me.

**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Evidence:** Y-axis bisect swapped negative/positive vs. X/Z because V1's cut-plane basis is left-handed only on Y → `TODO/done/core-021-angled-bisect.md`, prior `group.js` doc comment; user decided explicitly (2026-09-17) to diverge from V1 rather than keep the per-axis exception → `TODO/done/core-022-bisect-negative-always-min-side.md`'s Goal section; `NEGATIVE_IS_MAX_SIDE` table and its branch deleted, `negative` always the min-side half now → `src/core/kernel/group.js`, this commit; the real V1 fixture measurements are untouched, only which recorded half this port's own names are checked against changed for Y → `src/core/kernel/group.spec.js`'s new `expectedPartsFor` helper, this commit; 848 unit tests + typecheck green, `e2e/resize-bisect-operation.e2e.js` green on chromium-laptop → this session's test runs
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; a render of a cube bisected on Y showing which half is which would make the naming fix concrete

## 2026-09-17T15:45Z · core-023 — hardware.bearing, the one recipe with no source to port

**Post:** WarpCad's kernel now registers hardware.bearing. Its source library has no Bearing factory -- nothing to diff against. Table from DIN 625, cross-checked against two catalogs. Built a 608 through the fold: 2305.363mm3, matching an earlier spike exactly.

Built with Claude Code, reviewed by me.

**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** none — the post is at 293 characters including the disclosure, and no tag fits without cutting the finding itself
**Evidence:** 293 characters including the disclosure line → counted this session; "no Bearing factory" → `docs/decisions/geometry-kernel.md` Finding 2, confirmed directly against vendored `jscad-hardware@1.1.0`, whose only factories are `Bolt`/`Washer`/`Nut`; "table from DIN 625, cross-checked against two catalogs" → `src/core/kernel/tables/bearing-specs.js`'s own module doc, cites igus's DIN 625 table and ISK's/Be-cu's 6200/6300-series charts; "608 through the fold" → `src/core/kernel/recipes/hardware.bearing.spec.js`'s geometric sanity check, built via `evaluateOp('hardware.bearing', { spec: '608', segments: 64 })`; "2305.363mm3, matching an earlier spike exactly" → `docs/decisions/geometry-kernel.md` Finding 2's own recorded measurement at 64 segments, reproduced to three decimal places this session against an ideal 2309.071mm³ (735π)
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; a render of a 608 bearing mated to its shaft (already verified in Finding 2's own spike) would make the "no source, verify differently" story concrete

## 2026-09-17T19:35Z · ui-030 — the fastener recipes finally have a Library row

**Post:** WarpCad's bolt recipe has existed since 2026-09-05 and you couldn't put one on screen: the Library panel filtered its rows to primitive.*. Now there's a Hardware section. The catch was placement -- no recipe takes a position param, so a drop commits the recipe plus a translate that supersedes it.

Built with Claude Code, reviewed by me.

**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** none — the post is at 297 characters including the disclosure, and a tag would cost the mechanism sentence
**Evidence:** "bolt recipe has existed since 2026-09-05" → `git log -1 -- src/core/kernel/recipes/hardware.bolt.js` = f9bbfa4, 2026-09-05; "the Library panel filtered its rows to primitive.*" → `src/core/library.js`'s `buildRows` before this commit, `op.startsWith('primitive.')`; "no recipe takes a position param" → true of `hardware.bolt` only in the strict sense — nut/washer/bearing do accept a `center` and pass it to their own primitive, corrected in the retired TODO's note; the *mechanism* claim (drop commits recipe + superseding translate) → `recordsForDrop` in `src/core/library.js`, this commit; 297 characters including the disclosure → counted this session
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; the drive screenshot (a bolt, nut, washer and bearing on the grid beside a cube and a sphere) would carry this post

## 2026-09-18T00:05Z · ui-031 — the rest of the catalogue, and a row that asks which model

**Post:** WarpCad's Library went from 11 rows to 26: every kit part and the whole Raspberry Pi catalogue, built for days and only now draggable. The Pi and camera rows carry a model dropdown -- one factory, not one row per revision. #CAD #WebGL

Built with Claude Code, reviewed by me.

**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL — 275 characters including the disclosure, counted this session
**Evidence:** "11 rows to 26" → `LIBRARY_SECTIONS` totals measured this session (primitive 7 + hardware 4 + kit 3 + raspberrypi 12); ui-030's own eleven-row figure → `TODO/ACCEPTANCE.md` scenario 1's 2026-09-17 entry; "built for days" → `git log -1` per recipe: `kit.board` 2026-09-09 (70da2a4), `raspberrypi.bplus` 2026-09-13 (47e2857), `raspberrypi.spacer` 2026-09-16 (3fc97b5); "one factory, not one row per revision" → `core-014a`'s decision as quoted in `TODO/ui-031`'s own Goal
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; the laptop drive screenshot (Kit Parts + Raspberry Pi sections with both Model dropdowns visible, a Pi 5 and a camera on the grid) carries this one

## 2026-09-18T00:52:00Z — A boolean can name a composite's sub-part, and a moved part keeps its parts

**Post:** A bolt you moved is still a bolt. WarpCad's transforms flattened composites into one solid, so a placed fastener had no head or thread left to name. Booleans can now cut with one named piece. Driving it found a silent bug: moving a group destroyed it.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Evidence:** "transforms used to flatten a composite" → measured this session in the running browser, A/B with the change stashed: `names` null before, `["head","thread","tap"]` after; "booleans can now cut with a named piece" → this commit's `subPartOperands` flag plus measured cuts (whole bolt 60352.953 mm³ remaining vs `head,thread` 61071.390); "moving a group destroyed the group" → stashed A/B this session, `group.assemble` then a gizmo-style `transform.translate`: `isGroup:false, names:null` before, `["Cube 1","Cube 2"]` after
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; a screen recording of drilling into a placed Bolt (breadcrumb reads "Bolt 1 > tap") would carry this one

## 2026-09-18T01:55:00Z — Snap/Align can finally address one named part of a composite

**Post:** WarpCad's Snap/Align popover used to print "sub-part addressing isn't available yet". It doesn't anymore. Drill into a Raspberry Pi's Ethernet jack, snap a part flush to that instead of the whole board. Checked to a hundredth of a mm against the kernel.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Evidence:** "the popover printed that line" → the exact string removed in this diff, shipped by `ui-026` (git log 3f5c87b, 2026-09-11); "drill into a Pi's Ethernet jack and snap to it" → driven live this session against a real `raspberrypi.bplus` model 5 at laptop 1440x900 and phone 390x844, popover read "Aligning Raspberry Pi 1 › ethernet to Cube 1"; "checked to a hundredth of a mm" → independent kernel probe this session puts the `ethernet` part at (+34.50, -17.30) mm from the board's bbox centre, and `cube - board_after` in the running app came out (34.50, -17.30) at both viewports
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; the phone-width screenshot of the popover reading "Aligning Raspberry Pi 1 › ethernet to Cube 1" carries this one

## 2026-09-18T19:14:00Z — Angled Bisect finally has controls, and one popover had to move

**Post:** WarpCad's Bisect can cut along a tilted plane now. The kernel supported it since yesterday with no way to reach it. A 30 degree tilt on a 40 mm cube gives halves 31.5 mm tall, not 20. A phone-width check caught the bigger popover hiding under a sheet.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Evidence:** "kernel supported it since yesterday with no way to reach it" → `core-021`'s Completion Log row (2026-09-17 13:56) and its own retirement note (angled form, "no control anywhere that can reach it"); "31.5 mm tall, not 20" → measured live this session (drilled halves 31.547 and 41.547 mm on a 50 mm cylinder, Z extent of a 40 mm cube half in the e2e), equal to 20 + 20*tan(30 deg) and to a direct kernel `bisect()` call; "hiding under a sheet" → the phone e2e projects timing out with "`p.inspector__op` intercepts pointer events" on the Commit button before the z-index change
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; a short clip of the tilted halves being drilled into at phone width

## 2026-09-18T19:27:00Z — Four copies of the same 200 lines, now one

**Post:** WarpCad's Raspberry Pi recipes each carried a private copy of the same place-and-measure helpers. Four files, one module now, 1,047 fewer lines. No behaviour change, and I checked that the dumb way: 34 recipe outputs serialised before and after, compared byte for byte. Identical.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Evidence:** "four files each carried a private copy" → the four `function makePart`/`chain`/`addVectors` definitions removed in this diff, in `raspberrypi.bplus.js`, `cameraModule.js`, `touchDisplay7inch.js`, `touchScreen2.js`; "1,047 fewer lines" → `wc -l` on `src/core/kernel/recipes/*.js` this session, 10,865 before and 9,818 after; "34 recipe outputs ... byte for byte, identical" → `cmp` on JSON dumps of 34 recipe/param variants this session, 180,793 bytes both times
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public

## 2026-09-18T20:19:00Z — Measuring an export path instead of arguing about it

**Post:** Picked WarpCad's STL export path by measuring, not arguing. three.js's exporter, fed by my own mesh bridge, emits a non-watertight solid: 100 of 362 edges lack a second face. JSCAD's serializer repairs them first. Slicers care.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Evidence:** "100 of 362 edges lack a second face" → edge audit this session, feeding `src/render/mesh.js`'s `geom3ToBufferGeometry` output through three.js `STLExporter` on a 10mm cube minus a Ø6mm cylinder; "JSCAD's serializer repairs them first" → `@jscad/stl-serializer@2.1.23/index.js:63` calls `modifiers.generalize({snap:true, triangulate:true})`, read from source this session, and the same audit returns 292 triangles / 0 unmatched edges
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; a diagram of a T-junction edge for the non-watertight case

## 2026-09-19T03:12:00Z — Rollback where later steps point at earlier records

**Post:** Designing WarpCad's timeline rollback: insert a step at the marker and later steps replay after it. Catch: history is an append-only log where records point at earlier records by id. Move a body while rolled back and a later step that builds on it is now broken. Flag it, never guess.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Evidence:** "append-only log where records point at earlier records by id" → `src/core/document.js` module doc (immutable entries, `supersedes` lineage), read this session; "a later step that builds on it is now broken" → `docs/decisions/interaction-model-qa.md` section 18 (design, not yet built or reproduced); "Flag it, never guess" → the same section's shadow-check and atomic roll-forward contract
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; a diagram of a log with a rollback marker and a flagged tail row

## 2026-09-19T03:58:00Z — Undo in an append-only log: remove the step, don't invent its opposite

**Post:** WarpCad's document is an append-only log, so undo looked like "append the inverse". Except a boolean's record retires its two operands into itself, and no record you can append un-retires them. So undo splices the step out and re-folds through the same code an append uses. Redo is then insert-at-index.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Evidence:** "retires its two operands into itself" → `src/core/document.js`'s `consumes`/`mergedInto` mechanism, which `bodies()` reads to stop reporting an absorbed lineage; "no record you can append un-retires them" → `mergedInto` is set by the consuming record's existence, so the inverse would need a new anti-record concept — reasoning recorded in the retirement note of `TODO/done/data-003-undo-redo-transaction-origin.md`; "re-folds through the same code an append uses" → `rebuildFrom` calls `ingest`, the function `append` calls, this diff; "Redo is then insert-at-index" → `document.redo()` splices the step back at its original index, this diff, and `docs/decisions/interaction-model-qa.md` section 18 names insert-at-index as a fixed requirement on `data-004`
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; a short clip of undoing a subtract and both operands coming back selected

## 2026-09-19T04:59:00Z — One re-fold, four timeline features

**Post:** Timeline editing in WarpCad: edit a past step, suppress one, reorder, roll back and insert at the marker. Four features, one primitive — splice the log, re-fold it through the same function an append uses. Editing the first of 200 fillet-heavy records costs 67ms. Slow enough to notice, not slow enough to optimise yet.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Evidence:** "four features, one primitive" → this diff: `replaceRecord`/`setSuppressed`/`moveStep`/`rollBackTo`+`insertAt` all call `rebuildFrom(nextEntries, nextRollbackAt)`; "the same function an append uses" → `rebuildFrom` calls `ingest`, which `appendAll` calls, this diff; "67ms editing the first of 200 records" → benchmark run this session on this Mac, 50 bodies each cuboid+move+filletRim+move, median of 5 (17ms at 40 records, 34ms at 100, 67ms at 200); "not slow enough to optimise yet" → CLAUDE.md Performance's measure-before-optimising rule, and the 16ms budget is pan/zoom/drag, not a row action
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; a clip of a chamfer radius edited mid-history with a later body sitting still

## 2026-09-19T04:59:30Z — The guard I went to relax and didn't

**Post:** A fillet in a body's history freezes its size fields in WarpCad — rebuilding the creation record would silently drop the rounded rim. The timeline task was meant to relax that. It shouldn't: an *append* discards the fillet, a mid-history *replace* leaves it in place to replay. Same-looking rule, different question. Writing the difference down found a gap neither test had.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Evidence:** "freezes its size fields" → `paramEditability` in `src/core/paramEdit.js`, built by `TODO/done/ui-029-editable-primitive-parameters.md`; "the timeline task was meant to relax that" → `TODO/done/data-004-timeline-entry-edit-replay.md`'s Affected files: the guard "needs revisiting … since replaying past such an op is exactly this task's whole point"; "an append discards the fillet, a replace leaves it in place" → `paramEdit.js` module doc, this diff; "found a gap neither test had" → `stepParamEditability` shows a `transform.rotate` row has only the absolute `rotation` param `core-004` carries forward, so it is not editable at all — stated in this diff, in the retirement note and in `TODO/VERIFY.md` row 2
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public

## 2026-09-19T13:31:00Z — Saving on pagehide does not survive a reload

**Post:** WarpCad autosaves to IndexedDB and flushes on pagehide, per spec. I placed a solid and reloaded inside half a second: gone. The put was issued but never committed before the page died. Fix: a synchronous localStorage copy, cleared once IndexedDB has it.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebDev
**Evidence:** "autosaves to IndexedDB and flushes on pagehide, as specced" → `docs/decisions/interaction-model-qa.md` section 8 and `src/storage/autosave.js`, this diff; "placed a solid, reloaded within half a second, it was gone" → a hand-driven Playwright run in real Chromium this session, and `e2e/local-persistence.e2e.js`'s "reloading immediately after an edit" test, which failed before `localMirror.js` existed and passes in chromium and webkit after; "the put was issued but never committed" → the same session's debug run: a patched `IDBObjectStore.put` logged the call and neither `complete` nor `abort` ever fired before the reload; "synchronous localStorage copy, cleared once IndexedDB has it" → `src/storage/localMirror.js` and `createAutosaver`'s `flushSync`, this diff
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; the failing-then-passing test output side by side

## 2026-09-19T14:09:00Z — The blob sha is the conflict check

**Post:** Hosted saves in WarpCad: the GitHub Contents API blob sha IS the conflict check. Stale sha, 409, so the app asks (overwrite / load / cancel) instead of merging. Trap: never echo the server error text, a 401 body can quote the token it just rejected.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebDev
**Evidence:** "the blob sha is the conflict check, stale sha returns 409" → `docs/decisions/persistence-export.md` sub-decision 3 (commit 86ff04b), implemented in `src/storage/hostedBackend.js` and exercised by `hostedBackend.spec.js`'s 409/422 case, this diff; "asks overwrite / load / cancel instead of merging" → `docs/decisions/interaction-model-qa.md` §11 and `resolveConflict` in `src/stores/hosted.js`, this diff; "never echo the server error text, a 401 body can quote the token" → `failureOf` in `hostedBackend.js` reads the body for classification only and every message is this module's own wording; asserted by `hostedBackend.spec.js`'s "never puts the token in a message, a URL, or a serialised error", which feeds GitHub a 401 body containing the sentinel token
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public

## 2026-09-19T15:25:00Z — STL from the kernel, not the render mesh

**Post:** WarpCad export, serialization half: STL and OBJ come from the CAD kernel, not the render mesh. three.js's STLExporter on a cube-minus-bore left 100 of 362 edges open. The kernel path: 0 of 438. glTF gets a root node for mm/Z-up to m/Y-up. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #3DPrinting #WebGL
**Evidence:** "100 of 362 edges open on three.js's STLExporter" → `docs/decisions/persistence-export.md` sub-decision 4 (commit 86ff04b); "kernel path 0 of 438" → numpy edge count on the STL this session, and `src/core/export.spec.js`; "glTF root node mm/Z-up to m/Y-up" → `src/render/export.js`, this diff
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; a slicer screenshot of the exported part once the Export dialog (ui-034) exists

## 2026-09-20T22:05:00Z — Timeline (History) panel: edit a past step, everything after it replays

**Post:** WarpCad has a History panel now. Chamfered an edge 5mm, placed more parts, want it at 3mm? Edit that step; everything after it replays. Suppress, reorder and Fusion-style rollback too. Driving it by hand at 390px found two overlap bugs the green suite could not see. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #Vue
**Evidence:** "edit a step, everything after replays" → `ACCEPTANCE.md` scenario 12 steps 6-7 driven this session (cube volume 62166.718 → 63316.033, sphere byte-identical); "two overlap bugs at 390px" → measured this session, Inspector tab over the sheet's last rows and nav chrome 44px into the Operations toolbar at 46vh; "green suite could not see them" → the 862-test e2e matrix passed before and after both fixes
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; a short screen recording of the 5mm → 3mm edit rebuilding downstream


## 2026-09-20T23:59:00Z — Cut a case with one port, not the whole board

**Post:** WarpCad booleans can now cut with ONE named part of a multi-part model. Click a Raspberry Pi, click its Ethernet jack, Subtract: 1207.743mm³ removed. Subtract the whole board instead and it's 5661.317mm³ — a missing wall, not a port. The selection store needed no change; a shipped idiom already held the state.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #Vue
**Evidence:** "1207.743 vs 5661.317 mm³ out of a 40mm cube" → both measured from `data-body-volume` in the running app this session (64000 → 62792.257 with `ethernet`, → 58338.683 whole); "the selection store needed no change" → `src/stores/selection.js` is absent from this diff, because `toggle` deliberately does not prune a pick depth (its own doc comment, shipped in `ui-035`)
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; a render of the cut port opening

## 2026-09-21T13:46:00Z — A File menu that won't call a download "Save"

**Post:** WarpCad has a File menu now. On browsers that can't write a file in place, the item says "Download copy", never "Save". A hosted repo that changed under you gets a three-button dialog instead of a merge, held back until your drag ends. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #Vue
**Evidence:** "Download copy, never Save" → `src/components/storage/FileMenu.vue` labels from `persistence.fileCapabilities`, and `e2e/save-load-ui.e2e.js` asserts it on chromium and webkit; "three-button dialog instead of a merge" → `src/components/storage/ConflictDialog.vue` (Overwrite remote / Load remote / Cancel); "held back until your drag ends" → driven this session: a conflict came due at 30s while a Library drag was held to 40s, the dialog did not appear until the release (webkit/laptop, webkit/phone, chromium/laptop, chromium/phone, against a mocked `api.github.com`)
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; a screen recording of the conflict dialog appearing after a drag ends

## 2026-09-21T14:50:00Z — Export says which file you'll get before you press it

**Post:** WarpCad exports STL, OBJ and glTF now. The panel names the exact file before you press. Undo with it open and the line changes; "just this body" never quietly widens to the whole scene. Reading the bytes back found T-junctions I'd assumed weren't there. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #Vue
**Evidence:** "STL, OBJ and glTF" → `e2e/export-ui.e2e.js` downloads and parses all three on chromium and webkit at three viewports; "says which file you'll get" → `export-summary` (`Exports Union 1 as union-1.stl`), asserted there; "Undo with it open and the line changes" → the e2e presses Ctrl+Z with the popover open and asserts the line goes from `Union 1` to `2 bodies together as warpcad-scene.stl`; "never widens" → the explicit-Selection-vanishes e2e and unit case; "found T-junctions" → cylinder-plus-cube union read back this session: 9 of 300 edges unmatched, volume 88074.774 vs the kernel's 88074.793, filed as `TODO/io-004`
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; a short recording of Ctrl+Z changing the popover's line

## 2026-09-21T16:10:00Z — The mesh repair that ran, and repaired nothing

**Post:** My STL exporter called a T-junction repair pass. It ran every time and fixed nothing on half my shapes. It snaps vertices to a grid sized from the bounding box, then asks whether a vertex is on an edge using a fixed 1e-5mm — after moving it up to 4.2e-4mm. Move the same solid to the origin and the bug vanishes. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #3DPrinting #OpenSource
**Evidence:** "snaps to a grid sized from the bounding box" → `@jscad/modeling` `measurements/calculateEpsilonFromBounds.js` (`EPS * total / dimensions`), measured at 4.799e-4 mm for the union under test this session; "fixed 1e-5mm" → `operations/modifiers/insertTjunctions.js` compares against `constants.EPS`, which `maths/constants.js` defines as 1e-5; "up to 4.2e-4mm" → √3/2 × 4.799e-4, the worst-case displacement of `vec3.snap` on that grid; "move it to the origin and the bug vanishes" → measured both ways this session: the same cylinder ∪ cube read 6 of 303 edges open at centre (-100.89, 66.93, 25) and 0 of 429 at the origin, and io-003's origin-centred union developed 34 open edges once translated and rotated
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; a diagram of the snap-then-test ordering


## 2026-09-21T19:33:00Z — I made the slow part 5.6x faster and the freeze didn't move

**Post:** Export froze my CAD app for a third of a second. The obvious culprit was a mesh-repair pass I'd added last week, so I optimised it — 5.6x faster. The freeze went from 224ms to 233ms. Then I measured the phases properly: the repair was 28ms of 80. Combining composite bodies was 43. I'd optimised the wrong thing first, and only the measurement said so. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebDev #Performance
**Evidence:** "a third of a second" → worst animation-frame gap 346.1 ms at 6x CPU throttling on a 24-body export, Chromium, measured this session via `bench/export-mainthread.mjs`; "5.6x faster" → `makeWatertight` on that scene, 27.01 → 4.82 ms median of 20 runs, Apple M4 Pro / Node 24, `bench/export-benchmark.mjs`; "224ms to 233ms" → same scene, worst frame gap at 4x CPU throttling before and after the repair optimisation, both measured this session; "28ms of 80" / "43" → phase breakdown of the same 24-body export: `toGeom3` 43.4 ms, `makeWatertight` 28.0 ms, serialize 8.7 ms
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; the phase-breakdown table as an image


## 2026-09-21T20:40:00Z — Selecting a body you can't see

**Post:** A bolt sat fully inside a 40mm cube in my CAD app. My new list selected it fine: Inspector, gizmo, all there. The canvas changed zero pixels; the cube wins the depth test everywhere. Fix: redraw the hidden part with the depth test flipped. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #ThreeJS
**Evidence:** "bolt sat fully inside a 40mm cube" → fixture in `e2e/objects-panel.e2e.js` (cube -20,-20,0..20,20,40; bolt -9.50,-8.23,8.00..9.50,8.23,27.50), read off `data-body-bounds` this session; "Inspector, gizmo, all there" → the same e2e asserts `inspector` contains the bolt's name and `transform-gizmo` is visible after the row is tapped; "zero pixels" → WebGL canvas alone with every overlay hidden, before/after selecting the bolt from the list, before the fix: 0 changed pixels (Chromium, 1440x900, this session); "redraw the hidden part with the depth test flipped" → `createXrayMaterial` in `src/render/mesh.js` (`depthFunc: GreaterDepth`), after: 1185 changed pixels in Chromium and 1186 in WebKit
**Disclosure:** Built with Claude Code, reviewed by me.
**To Add:** repo URL once public; a before/after pair of the cube with the bolt's tint showing through

## [2026-09-22T13:41:00Z] — The worked example in the task file was backwards

**Post:** Shipped: WarpCad's Objects list can now expand a composite (a Raspberry Pi, a bolt) and address one of its pieces directly — even when it's sealed inside another shape and no click can reach it.

The task file's own suggested flow was: tap the part, then add the enclosing shape. I drove it before building anything else. It's backwards — Subtract cuts from whatever you select *first*, so that order makes the tiny part the base and the case the thing removed from it.

Fixed by making the list's "add" gesture always append at the end of the selection, depth and all. Case first, then the part's check, reaches the right order — and the toolbar names it before you commit, so you never have to guess.

Measured: an enclosed Pi's ethernet jack cuts 4,545 mm³ out of a case. The whole board would have cut 23,168.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** "backwards" order → driven by hand against the running app, confirmed by the Operations toolbar's own operand-line text reading "Raspberry Pi B+ › ethernet then Shell 1"; "append at the end" → `selection.selectPart`'s additive branch in `src/stores/selection.js`; "4,545 / 23,168" → `shell.volumeMm3 - result.volumeMm3` and `shell.volumeMm3 - wholeBoardResult.volumeMm3` computed directly against `@jscad/modeling`'s own `booleans.subtract`, independent of the app, in `e2e/objects-panel.e2e.js`
**To Add:** repo URL once public, docs site URL once it exists

## 2026-09-22T14:32:57Z — Fixed a phone-width layout overlap in WarpCad's toolbar/nav-chrome

**Post:** Fixed a phone-width bug in WarpCad (browser CAD app): the on-screen nav chrome was overlapping the Operations toolbar at 390px. The known overlap was 21px — measuring further turned up a second, unrecorded 6px overlap in a different selection state, same root cause. One CSS fix, one new standing test. #WebGL #CAD #OpenSource

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #WebGL #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** "21px overlap reproduced exactly" → this session's Playwright measurement against `npm run dev`, matching `TODO/ui-043`'s own recorded numbers (toolbar bottom 228, chrome top 207); "a second, unrecorded 6px overlap" → this session's own measurement at two-selected + Inspector-sheet-open, a combination `TODO/ui-043`'s own Problem section says was never measured; "one new standing test" → `e2e/phone-toolbar-chrome-fit.e2e.js`, 2 cases, 12/12 passing across chromium/webkit × phone/tablet/laptop, this session
**To Add:** repo URL once public, docs site URL once it exists

## [2026-09-24T02:55:00Z] — The worker I was asked to build, and the cost it was really for

**Post:** WarpCad was freezing 440 ms on a phone-speed CPU when you dropped a cube next to 24 parts. I assumed the slow part was building geometry. It was the readout: every drop re-unioned every part to measure it.

Moved that to a Web Worker. Same drop: 78 ms.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebWorkers #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 440 → 78 ms → `bench/evaluation-mainthread.mjs`, 24-bodies drag-place, 4× CPU throttling, production build, headless Chromium, M4 Pro, n=5 medians, this session; "every drop re-unioned every part" → `bench/fold-benchmark.mjs`, store summary 97-144 ms per mutation vs fold 0.0-4.2 ms, this session; "assumed the slow part was building geometry" → `TODO/core-029`'s own Problem section framed it as evaluate()/the fold
**To Add:** repo URL once public, docs site URL once it exists; a before/after frame-gap chart from `bench/results/2026-09-24-core-029.md`

## [2026-09-24T16:00:35Z] — Undo that puts things back instead of rebuilding them

**Post:** Undo in WarpCad used to re-run the whole model history: 474 ms of frozen screen per press on a 24-part scene at phone-class CPU speed. Now it puts back the state saved with that step. Same press: 18.5 ms.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 474 → 18.5 ms → `bench/evaluation-mainthread.mjs`, 24-bodies Undo worst frame gap, 4× CPU throttling (the bench's phone stand-in), production build, headless Chromium, M4 Pro, n=5 medians, before build 335d361 vs this tree, this session; 296 → 22.0 ms → same run, fillet-50 (200 records); "re-run the whole model history" → `src/core/document.js` undo() at 335d361 calls rebuildFrom (full re-fold), TODO/core-030 Problem; "every Undo in a single-user session is a restore" → `bench/fold-benchmark.mjs` coverage section, this session (3/3, 20/20; 3/4 with an MCP write between); "no caller changed" → the diff (only src/core/document.js in src/ changes); "timeline edits and Open still re-run" → fold-benchmark after-run (edit first row 74.0 / 157.2 ms) and TODO/core-031
**To Add:** repo URL once public, docs site URL once it exists; the before/after Undo frame-gap table from `bench/results/2026-09-24-core-030.md` as a chart

## 2026-09-24T16:36:18Z — One Undo takes back a whole Inspector param edit (TODO/ui-044)

**Post:** Resizing a moved part in WarpCad took two Undo presses, and the first one left it thin but back at its drop spot, a state you never made. Now the edit plus the moves that keep it in place are one step, and a rejected value changes nothing. #CAD

Built with Claude Code, reviewed by me.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** two presses / drop-spot state → TODO/ui-044 Problem, reproduced this session by the new e2e case against the old composable ("Undo: Move Cylinder 1"); one step + atomic refusal → src/core/documentBatch.spec.js and useParamCommands.spec.js, 1552/1552 this session
**To Add:** a before/after GIF of the Undo press

## 2026-09-24T17:57:55Z — History row actions reuse unchanged builds instead of re-folding the whole log (TODO/core-031)

**Post:** Editing a step in WarpCad's History used to rebuild every body in the part. Now each step's build is cached against its exact inputs, so only what changed rebuilds. At 4x CPU throttling, a row action's worst frame gap went 458 ms → 20 ms on a 24-body scene. Built with Claude Code, reviewed by me.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebDev #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 458 → 20 ms (24-bodies, row action = Suppress, 4x CPU, Chromium headless, production build, M4 Pro) → bench/evaluation-mainthread.mjs run this session, recorded in bench/results/2026-09-24-core-031.md; "only what changed rebuilds" → src/core/foldReuse.spec.js build counts
**To Add:** a before/after frame-gap chart from bench/results/2026-09-24-core-031.md

## [2026-09-24T20:43:07Z] — A "WebKit touch bug" that turned out not to be one (TODO/ui-045)

**Post:** A filed bug said trusted touch taps stopped selecting bodies in WarpCad after a tap on empty space, WebKit only. I could not reproduce it as a real bug — every failure traced back to the tap landing on nav chrome or a sheet instead of the canvas, invisible to every existing test because they all dispatch synthetic events straight at the canvas. Shipped a real fix for the one thing I could confirm, plus new trusted-touch e2e coverage, and filed the actual chrome-overlap hazard separately.

Built with Claude Code, reviewed by me.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebDev #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** no raycast discrepancy found → this session's instrumented onPointerUp/pickAt runs, webkit-phone and chromium-phone, `git stash` A/B of the code change; stray-tap-hits-chrome mechanism → capture-phase event.target log showing `target=nav-step-right` for a tap aimed at a body; full non-Firefox matrix 1237 passed / 198 skipped / 0 failed both before and after this commit; new coverage → e2e/selection-inspector.e2e.js's page.touchscreen.tap test
**To Add:** repo URL once public; a short GIF of the trusted-touch test passing at phone width

## 2026-09-24T21:16:41Z — Phone nav controls fold away while a panel is open (TODO/ui-046)

**Post:** On a phone, WarpCad's navigation pad used to rise above an open panel and cover ~194×200px of the 3D view. A tap on a cube under it hit "orbit right" instead. Now the pad folds to one 48px ✥ button while a panel is open. Tap it to expand. Built with Claude Code, reviewed by me.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebDev
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 194×200 raised footprint, tap landing on nav-step-right → TODO/ui-046 Problem + this session's throwaway repro (chrome box 8,207 194×200; tap left Cylinder selected) in WebKit and Chromium at 390×844; 48×48 collapsed → this session's drive (x 8-56, y 359-407) and the new e2e size assertion
**To Add:** before/after phone screenshots (shots/webkit-phone-1 and -3 from this session's drive)

## 2026-09-25T01:36:34Z — Composite parts keep their V1 colours (TODO/core-026)

**Post:** WarpCad's ports of the V1 JSCAD hardware parts kept every dimension and dropped every colour. V1 drew a washer gray with a red clearance; the port drew neither. Recipe records now carry V1's .color() as 0xRRGGBB plus alpha, diffed against V1's own output. Built with Claude Code, reviewed by me.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** washer gray/red in V1 → jscad-hardware.jscad:57-76 and the regenerated hardware.washer.v1-reference.json (V1's real .color() loaded, this session); ports dropped it → TODO/core-026 Problem; 0xRRGGBB + alpha → src/core/kernel/colors.js in the diff; diffed against V1 output → hardware.washer/bolt specs, 84 files / 1647 unit tests passing this session
**To Add:** a V1 render of the gray washer / red clearance beside WarpCad's once data-005/ui-037 draw the colour

## [2026-09-25T13:59:15Z] — A colour override that shows up in the timeline (TODO/data-005)

**Post:** WarpCad bodies can now carry a colour override, per body or per named sub-part — recolour a Pi board's USB-C port without touching the rest. It's a history-visible edit record, not a silent overwrite. Built with Claude Code, reviewed by me. #CAD #WebGL #OpenSource
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** per-body/per-part override, history-visible via a new supersedes record → src/core/document.js/kernel/registry.js diff, this session; sub-part example (Pi board USB-C) → TODO/data-005-per-body-color-override.md's own Goal wording (a Pi board's `usbc` part)
**To Add:** a screenshot once `ui-037` gives this a control to drive from — none exists yet.

## [2026-09-25T21:17:28Z] — Recolour a body from the Inspector, live, one Undo step per pick (TODO/ui-037)

**Post:** WarpCad has a colour picker. Select a body, tap the swatch, and the mesh changes live as you move around the picker. Settling on a colour is one Undo step, not one per mouse move. Colour one part of a group and it keeps that colour when you recolour the rest. Built with Claude Code, reviewed by me.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** live preview with no history write, one record per pick → useColorCommands.spec.js ("previewing … writes nothing", "a second edit … supersedes the first") and e2e/inspector-color-control.e2e.js "the picker previews live …", 24/24 this session; part keeps its colour when the whole group is recoloured → src/core/colorOverride.js precedence + this session's group drive (Cube 1 182/4/4 red, Cube 2 5/5/171 blue, laptop Chromium and phone WebKit)
**To Add:** screenshot pair from this session's drive: shots/grp-chromium-1440-1-whole-red-partB-blue.png and shots/s13-webkit-390-4-picked-selected.png

## [2026-09-26T11:41:55Z] — Ready-made parts finally look like themselves (TODO/render-003)

**Post:** WarpCad's bolts, washers and Raspberry Pi boards have carried their own colours in the document model for a while — nothing drew them. A dropped Washer rendered the app's default blue, not V1's gray. Now it does: Washer is gray, a Pi board's PCB is translucent green, and a user's own colour pick still wins over both. Built with Claude Code, reviewed by me.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #ThreeJS
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** washer gray, not theme blue → e2e/hardware-library-placement.e2e.js's new pixel-sample test (all 3 viewports × chromium/webkit), proven to bite via a `git stash` A/B of the `Viewport.vue` wiring (blue-biased sample r:80 g:105 b:139 without it); Reset returns to the recipe colour, not the app default → this session's laptop Chromium + phone WebKit drive (Inspector readout `#808080` → pick → Reset → `#808080` again); translucent Pi board reads cleanly, no z-fight → this session's screenshot, inspected by eye; one real finding surfaced and filed, not patched inline → TODO/render-004 (hardware.bolt's opaque V1-faithful `tap` now visibly encloses its own head/thread)
**To Add:** a before/after screenshot of a dropped Washer (theme blue vs. its own gray)

## [2026-09-26T12:33:56Z] — A bolt finally looks like a bolt (TODO/render-004)

**Post:** WarpCad's bolts render as themselves now: gray head, silver thread. The red clearance envelope that used to enclose both — V1-faithful, but not a great first look — is a hidden part instead, same as a washer's clearance already was. Still there, still addressable for a proper clearance-fit hole; just not drawn by default. Built with Claude Code, reviewed by me.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** freshly-dropped bolt reads gray/silver, not red → this session's screenshots at laptop Chromium + phone WebKit; `tap` hidden, same divergence as washer's `clearance` → `hardware.bolt.js`/`hardware.washer.js` diff, this session; whole-bolt subtract now differs from `tap` subtract for the first time → `ui-041`'s enclosed-bolt fixture re-driven live, 61 695.679 mm³ (metal) vs 61 108.343 mm³ (clearance); full regression check → 1717 unit tests (was 1715), typecheck clean, full non-Firefox Playwright matrix all green
**To Add:** the before/after freshbolt screenshot pair from this session (render004-chromium-laptop-freshbolt.png vs render-003's red-cylinder shot)

## [2026-09-26T13:19:52Z] — Hiding a bolt's clearance also hid it from the user (TODO/ui-047)

**Post:** Last task hid a bolt's clearance envelope by default so a fresh drop reads as an actual bolt, not a red cylinder. Side effect: nothing on screen said the clearance still existed. WarpCad's Inspector now has a Hidden parts list — tap `tap`, see it as a translucent overlay, select just that piece for the correctly-sized cut. Built with Claude Code, reviewed by me.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** discoverability gap after `tap` was hidden → `TODO/done/render-004-bolt-tap-clearance-visibility.md`'s own retirement note, and the user's own request quoted in this task's file ("the 'hidden' parts should have an option to show them"); Hidden parts list + translucent toggle (fixed 0.35 alpha, `depthWrite:false`), no document record or Undo step → `src/components/inspector/Inspector.vue`/`src/stores/hiddenPartVisibility.js`/`src/render/mesh.js` diff, this session; tap-to-drill route → `e2e/inspector-hidden-parts.e2e.js`'s breadcrumb assertion, 24/24 across 6 non-Firefox projects; correct clearance-sized cut via the new route → live drive this session, 61 108.343 mm³ against the whole-bolt route's 61 695.679 mm³ on the identical `ui-041` fixture; full regression check → 1734 unit tests (was 1717), typecheck clean, full non-Firefox Playwright matrix 1299 passed / 280 skipped / 0 failed, Firefox environment-blocked as every task since `ui-028`
**To Add:** a screenshot of the translucent red clearance overlay around a bolt, toggle on vs off

## [2026-09-26T16:55:32Z] — 150 Raspberry Pi part colours that had never once rendered (TODO/core-033)

**Post:** WarpCad's Raspberry Pi boards only ever painted the PCB itself — every jack, header, camera lens and clearance was colourless, dropped on the way over from the original library. Ported the rest by hand, part by part: lightgray USB jacks, an orange ethernet jack, a gold camera ribbon, gray GPIO headers, across all twelve board/screen recipes. Where two differently-coloured pieces get fused into one part, it stays uncoloured on purpose rather than guessing. Built with Claude Code, reviewed by me.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #RaspberryPi
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 113 colour call sites ported across 12 recipe files → `src/core/kernel/recipes/raspberrypi.*.js` diff, this session; 237 records gained/changed a colour field with zero non-colour differences → a 22-variant expansion sweep, before/after, this session; a Pi sub-part recolours and Resets to its own recipe colour → this session's live drive at laptop Chromium + phone WebKit (`#ffa500` → pick blue → Reset → `#ffa500`); full regression check → 1832 unit tests (was 1734), typecheck clean, full non-Firefox Playwright matrix 1299 passed / 280 skipped / 0 failed; one real finding surfaced and filed, not patched inline → TODO/render-005 (`touchDisplay7inch`'s `noGoPower` keep-out is V1-faithful opaque red and visible by default)
**To Add:** a screenshot of a Pi 5 + Camera Module V3 showing the newly-coloured parts through the translucent board

## [2026-09-27T17:17:47Z] — The gizmo's move arrows were signposts, not handles (TODO/ui-048)

**Post:** Select a Raspberry Pi in WarpCad and the move arrowheads used to grow to ~57px, big enough to hide the board. Now they're 13-16px cones that end just past their rings. Also found the old shading drew nothing at all on a perfectly vertical shaft. Built with Claude Code, reviewed by me.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #SVG #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** old head ~57px at the 220px arm cap → TODO/ui-048's own Problem section (0.26 × 220) and the removed `armPx * 0.26` line in the diff; 13-16px heads → `gizmoHeadPx` clamp in the diff, and 13.5 px (floor) / 16.5 px (cap) measured in this session's live drive; tips end 18px past their ring → `ringPx + 18` in the diff, and arm − ring = 18 px measured in the drive; vertical shaft drew nothing → this session's pixel probe scored 5 (background) against the pre-change code in Chromium and WebKit, versus > 30 after
**To Add:** before/after screenshot of a selected Pi at laptop width

## [2026-09-27T20:20:13Z] — Aligning a shape to the grid without doing the math by hand (TODO/ui-050)

**Post:** WarpCad's Inspector just got an Align to origin row: pick a reference part, tap min/center/max per axis, or one shortcut to centre-and-drop on the grid. Built because a Pi's micro-SD card hangs 1.5mm below the board, so "flush" has to measure the board alone. Built with Claude Code, reviewed by me.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #Vue
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** typed Position only ever set the bounding-box centre, and Snap/Align needs exactly two bodies with neither being the origin → `src/core/transform.js`/`docs/snap-align.md`, existing code; user request 2026-09-27, worked example is the Pi/micro-SD case → `TODO/done/ui-050-align-to-origin.md`'s own Goal section, quoted; micro-SD hangs 1.5mm below the board (`mb` min Z 0, whole body min Z -1.5) → measured this session via `boundsOf()` on a real `raspberrypi.bplus` body, and pinned by a new `transform.spec.js` test; one tap commits one record, reusing the existing `transform.translate` shape (gizmo/field sync, Undo, replay all unchanged) → diff, this session; full regression check → 1864 unit tests (was 1840, +24), typecheck clean, 0 Chromium failures across the full 27-file/3-viewport e2e matrix, Firefox environment-blocked as every task since `ui-028`
**To Add:** a screenshot of the Align to origin row with a Raspberry Pi selected and Reference set to `mb`

## [2026-09-27T22:36:43Z] — The Inspector lists the scene, and a tap that pretended to be a mouse

**Post:** WarpCad's Inspector now lists the whole scene. Point at a row and that body, or one part of it, lights up in the 3D view, even inside a case.

Driving it at phone size, taps lit rows up too: after a tap the browser keeps a phantom mouse. Fixed.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** one list, pointing lights body or part → diff (`ObjectList.vue`, `stores/hoverHighlight.js`, `Viewport.vue`) and `e2e/inspector-object-list.e2e.js`; two panels answering one question → `TODO/done/ui-049` Goal; phantom mouse after a tap → pointer-event logs captured this session at 390x844 in Playwright WebKit and Chromium (mouse-typed pointerover/pointerenter, and a WebKit pointermove, at the tap point after the reflow); name squeezed to nothing → drive screenshot this session plus the new e2e failing at all three widths on the old CSS; ~90 ms on enter/leave of the Pi's translucent board → `bench/hover-sweep.mjs` 1× run this session (p99 90.0, worst 105.7 ms) and a frame/hover log; recompile is inferred, not CPU-profiled; p99 19.6 vs 18.5 ms → `bench/results/2026-09-27-ui-049.md` (Apple M4 Pro, headless Chromium, production build, 5 runs)
**To Add:** a short clip of pointing down a Raspberry Pi's part list with each part lighting up; repo/docs URLs once public

## [2026-09-28T03:14:49Z] — Deleting a shape, as one more step in the history (TODO/ui-051)

**Post:** WarpCad can delete things now. Select a shape and press Delete, or tap the red button pinned to the bottom of the Inspector on a phone. Undo puts it back exactly where it was. A delete is one more step added to the history, never an erased one. Built with Claude Code, reviewed by me.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** no way to delete a placed object before this → the user's own request quoted in `TODO/done/ui-051`'s Goal (2026-09-27); Delete key and a pinned Inspector button → diff (`useDeleteShortcut.js`, `DeleteButton.vue`) and `e2e/delete-body.e2e.js`; Undo restores it exactly where it was → this session's drives (byte-identical bounds before/after, laptop Chromium and phone WebKit) and `document.spec.js`'s undo cases; appended, never erased → the `body.delete` tombstone in `src/core/document.js`'s diff
**To Add:** a short phone clip: tap a cube, tap Delete, tap Undo

## [2026-09-28T06:07:01Z] — Curve resolution: why printed holes come out small (TODO/core-035)

**Post:** WarpCad has a Resolution setting now. Faceted holes print small, and at a fixed 32 sides a Ø50 bore is 0.24 mm under across the flats. Draft/Normal/Fine/Print cap that error in mm, and Export can go finer for one file. Old projects keep their exact shape. Built with Claude Code, reviewed by me.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #3DPrinting #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Ø50 at 32 sides 0.24 mm under, Ø3 fine → TODO/done/core-035 Goal table, recomputed this session (0.241 / 0.014); old projects fold byte-identically → golden digests captured from `git archive HEAD` (2233c53), 41 cases in `resolution.spec.js`, and 61 108.343 mm³ reproduced in the real app from a legacy file this session (laptop Chromium, phone WebKit); 24-body Print export ~172 ms in the worker → `bench/resolution-benchmark.mjs`, 171.9 ms median, Apple M4 Pro, Node v24.14.1 (`bench/results/2026-09-28-core-035.md`); no frame over 17 ms during it → drive this session, worst rAF gap 16.7 ms Chromium / 17.0 ms WebKit; export finer for one file, design unchanged → diff (`exportJob.js` refold) and `e2e/resolution.e2e.js` + scenario 11 drive
**To Add:** a side-by-side screenshot of one cylinder at Draft and at Print (File ▾ → Resolution…)

## [2026-09-28T19:07:18Z] — Escape wasn't actually closing the Operations popovers (TODO/ui-053)

**Post:** Fixed a WarpCad bug: Escape on the Fillet/Chamfer popover looked like it closed, but its backdrop stayed and ate the next click. A Library drag right after silently failed; a second try worked. Root-caused with a live repro, fixed at one shared spot. Built with Claude Code, reviewed by me. #CAD
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** no Escape handler existed for any of the three Operations popovers before this fix → diff (`OperationsToolbar.vue`) and a `grep -rn "'Escape'" src/` sweep this session finding no match there; the backdrop absorbed the next pointerdown → this session's live Playwright repro (`document.elementFromPoint` at the Library row returned the backdrop div, not the row); first drag failed, second worked → RED confirmed this session by `git stash`-ing the fix and re-running the repro (`data-body-count` stuck at 1), GREEN confirmed after restoring it (reached 2 on the first drag); filed by `core-035`'s scenario 12 re-drive, pre-existing on HEAD `2233c53` → `TODO/done/ui-053-first-library-drag-after-escape-ignored.md`'s own Problem section
**To Add:** none

## [2026-09-29T21:26:01Z] — Change a placed part's model, and repair what the change breaks (TODO/ui-052)

**Post:** WarpCad: a placed Raspberry Pi's Model is now a dropdown. Swap a Pi 4 for a Pi 5 with something snapped to its AV jack and a dialog asks first: remap it, detach it, leave it flagged, or keep it "only when Pi 4", so one design can hold both boards. Built with Claude Code, reviewed by me. #CAD
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Model was read-only before → `TODO/done/ui-052` Goal ("Today every composite recipe's Parameters section is read-only"), and the two e2e assertions this commit changes (`kit-rpi-library-placement`, `hardware-library-placement`); the Pi 5 has no AV jack and the dialog appears before anything commits → `e2e/composite-param-edit.e2e.js` (60/60 on Chromium+WebKit, this session) and scenario 15 hand-driven this session at laptop Chromium and phone WebKit; the four fixes and "only when Pi 4" → diff (`DependentRepairDialog.vue`, `repair.js`, `condition.js`); one design holding both boards → the same drive: back on a Pi 4 the cube returned to exactly -76.10, -16.36, -17.38, its snapped position
**To Add:** a short phone clip: Model → Pi 5, the dialog, "Only when", then back to Pi 4

## [2026-09-30T14:40:00Z] — hardware.screw recipe, checked against real V1 output (TODO/core-027)

**Post:** WarpCad's kernel now has a screw recipe (pan head and flat head) that I diffed against the real JSCAD V1 library's output. Reading the V1 source said "countersink cut". Running it said it's just a cone-shaped head. Built with Claude Code, reviewed by me. #CAD
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** FlatHead is a cone, no countersink cut → `node_modules/jscad-hardware/jscad-hardware.jscad` `FlatHeadScrew` (`Parts.Cone(...)`, `countersink` never read) and the diff (`hardware.screw.js`); diffed against V1 output → `hardware.screw.v1-reference.json` generated this session, `hardware.screw.spec.js` 23 passing
**To Add:** none

## [2026-09-30T15:30:00Z] — transform.mirror: a mirror makes a second body (TODO/core-028)

**Post:** WarpCad's kernel can now mirror a body across an axis plane. The geometry was one library call. The real question was the document: a mirror keeps the original and adds a copy, like V1's cableTie2 = cableTie.mirrorY(). Needed no new registry flag. Built with Claude Code, reviewed by me. #CAD #JSCAD
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #JSCAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** two bodies afterward, no registry flag → document.spec.js mirror tests, this session (2330 unit tests passing); cableTie2 example → TODO/core-028 file text
**To Add:** none

## [2026-09-30T15:55:00Z] — Open says "Opening…" before it blocks (TODO/core-032)

**Post:** Opening a big file in WarpCad still freezes the page for a bit, because the fold runs on the main thread. I measured a worker fold first and passed on it: it would still cost ~80-150 ms at 4x throttle and slow small files down. So the freeze stays, but a frame with "Opening…" paints first. Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** worker fold would leave ~80-150 ms at 4x and slow small docs → the subagent's estimate, recorded in docs/decisions/kernel-evaluation-worker.md slice 4 (an estimate, not a measured worker fold); frame gap unchanged → bench/results/2026-09-30-core-032.md
**To Add:** none

## [2026-09-30T18:05:00Z] — Raspberry Pi boards now have their mounting holes drilled (TODO/core-034)

**Post:** Drag a Raspberry Pi into WarpCad and the board now has its mounting holes. Before, they existed only as hidden parts, so it rendered as a solid slab. Pi 5 gets the two fan holes too. Only the board is cut, and the holes stay snappable. Built with Claude Code, reviewed by me. #CAD #JSCAD
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #JSCAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** holes were hidden parts only → TODO/core-034 file text; fan holes drilled → V1 bplus.js:761-788 read this session; board-only cut and still snappable → diff + e2e/unit runs this session (2390 unit tests passing)
**To Add:** close-up screenshot of the drilled Pi 5 from above

## [2026-09-30T20:55:00Z] — A boolean's History row now names both operands (TODO/core-036)

**Post:** WarpCad's History row for a Union read "Union Cylinder 1". The base body was missing, and on Subtract that reads like the cylinder is the thing being cut. Rows now read "Union Cylinder 1 + Cube 1", base first. Built with Claude Code, reviewed by me. #CAD #OpenSource
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** old row "Union Cylinder 1" and new row "Union Cylinder 1 + Cube 1" → hand drive this session at laptop Chromium and phone WebKit; base missing because the toolbar writes it as target → TODO/core-036 file text and diff
**To Add:** screenshot of the History panel

## [2026-10-01T15:10:00Z] — Resizing a shape now moves what's snapped to it (TODO/data-007)

**Post:** In WarpCad you could snap a small cube onto the top of a 40 mm cube, grow the big one to 60, and watch the small one stay floating inside it. Resizes now re-run the whole history, so snapped parts follow, fillets re-apply, and one Undo takes it all back. Built with Claude Code, reviewed by me. #CAD #OpenSource
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** old behaviour (snapped cube stays at the old height) → TODO/data-007 Problem text; follows after resize, one Undo restores → unit tests and e2e run this session, hand drive at laptop Chromium (cube moved -55..-15 after cylinder height 80)
**To Add:** short screen recording of the resize

## [2026-10-01T17:55:00Z] — A Text row in the Library: drag a label in, retype it in the Inspector (TODO/render-002)

**Post:** WarpCad's Library has a Text row now. Drag it in, type your own wording in the Inspector, and it rebuilds as a thin raised label. The JSCAD text function returns open strokes rather than shapes, so each stroke gets thickened and unioned. Built with Claude Code, reviewed by me. #CAD #OpenSource
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** vector_text returns open polylines, not geom2 → TODO/render-002 shipped note and src/core/kernel/text.js; retype rebuilds wider → e2e/text-label-placement.e2e.js run this session and hand drive at laptop Chromium ("Hi there" measured 59.67 mm wide)
**To Add:** screenshot of a placed label with the Inspector open

## [2026-10-01T20:50:00Z] — Bill of materials in the Inspector (TODO/ui-038)

**Post:** WarpCad now keeps a running bill of materials. Place three M4 bolts and a washer and the Inspector lists "Bolt M4 × 12 mm × 3" and "Washer M6 × 1", updating as you add or delete. Bolt fit is ignored on purpose: loose and tight are the same part you'd buy. Built with Claude Code, reviewed by me. #CAD #OpenSource
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** tally keys on spec and length, fit ignored → src/core/bom.js and src/core/bom.spec.js; updates live on add/delete → e2e/bill-of-materials.e2e.js run this session (9 passed at three viewports, Chromium)
**To Add:** screenshot of the Inspector with a BOM section

## [2026-10-01T21:15:00Z] — Mirror, a reflected copy across an axis plane (TODO/ui-039)

**Post:** WarpCad has a Mirror button. Select one shape, pick X, Y or Z and a plane position, and a reflected copy appears on the far side while the original stays put and the copy becomes the selection. Plane defaults to the world origin, since mirroring a cube about its own centre just lands it on itself. Built with Claude Code, reviewed by me.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** copy added, original untouched, copy selected → e2e/mirror-operation.e2e.js (9 passed at laptop, tablet, phone) and hand drive at laptop Chromium (sphere centre 35.99,81.26 → 35.99,-81.26); symmetric body lands on itself → TODO/done/core-028 shipped note
**To Add:** screenshot of the popover with a copy placed


## [2026-10-01T22:58:00Z] — File ▸ New starts an empty project (TODO/ui-054)

**Post:** WarpCad's File menu has a New item. It asks before throwing work away, empties the scene and history, and makes the next Save ask where to save instead of overwriting the old file. Connected to a GitHub repo, it pauses auto-push so the empty project can't clobber yours. Ctrl/Cmd+Alt+N too. Built with Claude Code, reviewed by me.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** next Save asks for a file → e2e/save-load-ui.e2e.js (fake native picker, pickerCalls 1 → 2), run this session; auto-push pauses and nothing is pushed → same spec, mocked host; shortcut → same spec laptop project
**To Add:** screenshot of the New confirm dialog

## [2026-10-02T19:10:00Z] — A sketch is now a primitive that always becomes a solid (TODO/sketch-001)

**Post:** WarpCad's Sketch is now a Library shape: drag it in, draw circles, rectangles, polygons or a line outline, mark the inner one Hole, pick Linear/Revolve/Helical/Outline/Loft, tap Done. Out comes a solid you can subtract or export. Built with Claude Code, reviewed by me.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** five methods → registry.spec.js + exportJob.spec.js (0 open edges each), run this session; tube subtracted from a cube → hand drive phone Chromium touch-only, 47 527.035 mm³ = 64 000 − 16 472.965; export → loft STL 0 open edges, hand drive laptop Chromium
**To Add:** screenshot of the tube preview in the editor (test-results/sketch-snapshots/chromium-laptop-editor.png)

## [2026-10-02T19:49:00Z] — WarpCad is licensed: AGPL-3.0 code, CC BY-SA 4.0 prompts and specs

**Post:** WarpCad now has a license: AGPL-3.0 for the code, CC BY-SA 4.0 for the TODO specs, prompts and slash commands that built it. Fork either and share your changes under the same terms. CI fails on a missing license marker or an off-list dependency. Built with Claude Code, reviewed by me. #OpenSource
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** AGPL code / CC BY-SA prose split → LICENSING.md in the diff; CI fails on a missing marker or off-list dependency → .github/workflows/ci.yml, scripts/spdx.mjs and the package.json licenses script in the diff
**To Add:** none

## [2026-10-02T21:00:00Z] — Two Firefox-only e2e failures were the tests, not the app

**Post:** Two e2e specs failed on Firefox only. One grabbed a rotate ring at its bounding-box centre, which is the gizmo's pivot, so the drag direction was sub-pixel noise. Chromium got lucky. The other waited a fixed two frames for a canvas to revert. Now it grabs a real ring vertex and polls. Built with Claude Code, reviewed by me. #CAD
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** both ring starts at (174.89, 324.675) on Firefox, 2.26° turn → debug log of the drag plan this session; hidden-parts passed 4/4 alone, 119 changed pixels in the full run → test output pasted by the user and repeat run this session; full suite clean after the fix → user's report this session
**To Add:** none

## [2026-10-02T22:00:00Z] — Scope docs media: Playwright screenshots and GIFs for every documented feature

**Post:** WarpCad's docs have no pictures. I scoped 16 todos to add them: Playwright specs write screenshots straight into docs/screenshots, so updating a test baseline updates the docs. Drags and booleans get recorded, then converted to GIFs. Built with Claude Code, reviewed by me. #CAD
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 16 todos → 16 TODO/docs-005..020 files plus ROADMAP.md in the diff; no pictures today → docs/screenshots and docs/media do not exist and docs/ has no image links, checked this session; baseline folder is docs/screenshots → docs-005 text (planned, not built); GIF conversion → docs-006 text (planned), ffmpeg found at /opt/homebrew/bin/ffmpeg this session
**To Add:** none until the first pilot GIF exists

## 2026-10-02T21:05:00Z — Docs screenshot harness: Playwright baselines are the documentation images

**Post:** WarpCad's doc screenshots are now a side effect of a test. Playwright baselines live in docs/screenshots, so a UI change fails the check and --update-snapshots rewrites the image the docs link to. Two pilot stills so far. Built with Claude Code, reviewed by me. #CAD #OpenSource
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** baselines in docs/screenshots → snapshotPathTemplate in playwright.config.js diff; two stills → empty-scene.png and cube-selected.png in the diff; drift fails and update rewrites → this session's runs (changed --surface-1 failed both shots, :update changed the empty-scene md5)
**To Add:** the cube-selected still

## 2026-10-02T21:10:00Z — Docs movie pipeline: Playwright records, ffmpeg makes the GIF

**Post:** WarpCad docs can now show motion. A Playwright spec drags a cube out of the Library, records the run, and ffmpeg turns it into a looping GIF. The cursor is drawn in by hand since headless video has none. First GIF: 4.6 s, 0.8 MB. Built with Claude Code, reviewed by me. #CAD #Playwright
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #Playwright
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** spec records and ffmpeg converts → scripts/docs-gifs.mjs and e2e/docs/primitive-drag-cube.docs.js in diff; cursor drawn in → installCursor in e2e/docs/support.js; 4.6 s, 0.8 MB → ffprobe output and ls this session (duration 4.6, 812182 bytes)
**To Add:** the GIF itself (docs/media/primitive-drag-cube.gif)

## 2026-10-02T21:50:00Z — Viewport navigation docs: orbit, pan, zoom and view snaps as GIFs

**Post:** WarpCad's navigation page now shows orbit, pan, zoom, the on-screen pad and the view-cube snaps as GIFs. Each recording ends by asserting the camera actually moved, so a drag that does nothing fails instead of shipping a GIF of a still scene. Built with Claude Code, reviewed by me. #CAD #Playwright
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #Playwright
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** five movies (orbit, pan, zoom, pad buttons, view snaps) → e2e/docs/viewport-navigation.docs.js in diff; each asserts a camera attribute changed → same file; GIFs under the 1.5 MB budget → ls this session (largest nav-pan 1.34 MB)
**To Add:** the nav-orbit GIF

## 2026-10-02T21:30:00Z — Where WarpCad came from: a montage of JSCAD v1 work and the script that rebuilds it

**Post:** WarpCad's README now has a montage of 12 things I've modeled in JSCAD v1: Pi cases, gears, hardware, a Bahtinov mask. Same code-render-tweak loop, now in the browser. One JSON file lists the images and a small ffmpeg script rebuilds it. Built with Claude Code, reviewed by me. #CAD #OpenSource
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 12 images and subjects → docs/montage/jscad1.json in diff; JSON plus ffmpeg script rebuilds it → docs/montage/jscad1.json and scripts/docs-montage.mjs in diff; same loop → user's own description this session
**To Add:** the montage image (docs/images/jscad1-montage.jpg)

## 2026-10-02T21:45:00Z — Placement docs: drag-to-place movies, every primitive, snap guides

**Post:** WarpCad's "Placing a shape" page now shows the drag instead of describing it: a cube then a cylinder dropped in (both stay), the ghost preview mid-drag, and the dashed snap guides lighting up as a part nears another. Built with Claude Code, reviewed by me.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #Playwright
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** two movies and six stills → e2e/docs/primitive-placement.docs.js in diff; each movie asserts data-body-count after release → same file; ghost frame taken with the button held → heldShot in same file
**To Add:** primitive-drag-two.gif, placement-snap-guides.gif

## 2026-10-02T22:30:00Z — README rewrite: what WarpCad is, why, and how it got here

**Post:** WarpCad's README now says what it is and why: a browser CAD that came out of years of JSCAD v1 scripts and out of my PiPiece project, a test of building a whole app with Claude on the Pro plan. Two earlier attempts were shelved, and the README says why. Built with Claude Code, reviewed by me. #CAD #OpenSource
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** README covers purpose, JSCAD v1 roots, PiPiece, two shelved attempts → README.md in diff; Pro plan and PiPiece as a second purpose → user's own words this session
**To Add:** the cube-selected screenshot

## 2026-10-03T01:40:00Z — Sketch editor: a Select tool, and a Delete that deletes the outline

**Post:** Hand-testing WarpCad's sketch editor, I couldn't pick a drawn outline and delete it. With a draw tool armed, pressing on a circle's edge and moving a few pixels drew a stray new circle. Now there's an arrow Select tool, a trash button, and a line naming what's picked. Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** couldn't select and delete an outline → TODO/done/sketch-005 Problem text (user's hand-use finding); 8 px press drew a stray third circle → hand repro this session, count 2 to 3; Select tool, trash button, status line → diff (SketchToolbar.vue, sketchEditor.js)
**To Add:** docs/screenshots/sketch-select-outline.png


## 2026-10-03T02:34:00Z — Sketch editor: drag, add and delete an outline's points

**Post:** WarpCad's sketch editor now edits an outline's points: drag a dot to move one, drag the hollow mid-edge dot to add one, tap one and Delete. Circles and rectangles convert to outlines. Dots show only under Select; in testing they swallowed a drawing drag. Built with Claude Code, reviewed by me. #CAD
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** move/add/delete, Convert to outline, Select-only dots → diff (profile.js, VertexHandles.vue, Viewport.vue, SketchProfileFields.vue); dots swallowed a drawing drag → first acceptance drive this session (Rectangle drag from a converted circle's stroke left paths at 2, expected 3)
**To Add:** docs/media/sketch-vertex-edit.gif


## 2026-10-03T13:23:00Z — Docs: select, move, edit and delete, with pictures

**Post:** WarpCad's docs now show selecting and editing as short animations. Drag a gizmo arrow and the Inspector's X field changes as you drag; type 25 into it and the cube jumps there. Nine animations, five stills, each recorded by a test that fails if the drag did nothing. Built with Claude Code, reviewed by me. #CAD
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 9 GIFs, 5 stills, end-state assertions → diff (e2e/docs/selection-inspector.docs.js, docs/media/manifest.json); live field during drag → hand drive this session (X read 29.8, 39.6, 49.3, 59.1 mid-drag)
**To Add:** docs/media/gizmo-translate.gif


## 2026-10-03T14:12:00Z — Docs: Union, Subtract and Intersect, with pictures

**Post:** WarpCad's boolean docs now show each operation as it happens. Click a cube, Shift-click a cylinder, press Subtract and a round hole appears. Picking them in the other order gives a different shape, and there's a clip of that too. Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 6 GIFs, 4 stills, end-state and volume assertions → diff (e2e/docs/booleans.docs.js, docs/media/manifest.json); order movie compares the two results' bounds and volumes → e2e/docs/booleans.docs.js; scenario 4 subtract left 48 006 of 64 000 mm³ → hand drive this session
**To Add:** docs/media/boolean-subtract.gif


## 2026-10-03T14:55:00Z — Docs: Group, Snap, Align and Mirror, with pictures

**Post:** WarpCad's docs now show Group, Snap, Align and Mirror working. Snap slides a lug flush against a plate without merging them, Align centres it, and Mirror drops a reflected copy on the far side. Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 6 GIFs, 4 stills, end-state assertions → diff (e2e/docs/groups.docs.js, snap-align.docs.js, mirror.docs.js, docs/media/manifest.json); snap face plane within 0.01 mm, mirror copy at the negated X → assertions in those specs; full run 2560 e2e passed → test output this session
**To Add:** docs/media/snap-operation.gif

## 2026-10-03T15:25:00Z — Docs: Fillet, Chamfer, Enlarge, Fit and Bisect, with pictures

**Post:** The WarpCad docs now show Fillet, Chamfer, Enlarge, Fit and Bisect working. Pick a face, type a radius, and the rim rounds or bevels; Bisect cuts a cube at an offset, or tilts the cut 30 degrees. Recording them found that a part snapped to a plate stays put when you Enlarge the plate. Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 7 GIFs, 4 stills, end-state assertions → diff (e2e/docs/fillet-chamfer.docs.js, resize-bisect.docs.js, docs/media/manifest.json); Enlarge left the snapped lug at Z 8 while the plate's top moved to 16 → measured in the snapped-dependents spec run; full run 2571 e2e passed → test output this session
**To Add:** docs/media/fillet-operation.gif

## 2026-10-03T15:55:00Z — Docs: the parts catalogue, BOM and resolution, with pictures

**Post:** The WarpCad docs now cover the real-parts Library: drag a Bolt in, set it to M12 and 30 mm, and the bill of materials lists it. Another clip drills a Raspberry Pi's mounting hole into a plate with Subtract. Writing it showed the Library has no Screw row yet. Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 3 GIFs, 10 stills, new page docs/hardware-library.md → diff; plate volume and outline asserted → e2e/docs/hardware-library.docs.js; no Screw row → registry.js (no ui block)
**To Add:** docs/media/rpi-mounting-holes.gif

## 2026-10-03T16:37:00Z — Docs: History, step editing, undo and redo, with pictures

**Post:** The WarpCad docs now show History working. Click the Cube row to rewind to just the cube, change its size to 30 mm, and the cylinder and Subtract replay on the new size. Another clip shows undo and redo, and that one param edit is one Undo. Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 4 GIFs, 5 stills, row-count and body-count assertions at each beat → diff (e2e/docs/timeline.docs.js, undo-redo.docs.js, docs/media/manifest.json); edit to 30 mm replays the Subtract (volume 27000 minus the cylinder's share) → assertion in the timeline-edit-step movie; scenario 12 hand drive → TODO/ACCEPTANCE.md
**To Add:** docs/media/timeline-edit-step.gif

## 2026-10-03T17:50:00Z — Docs: saving, opening, exporting and the GitHub connection, with pictures

**Post:** WarpCad's save, open and export docs now have pictures: the File menu, the Saving / Saved / Not saved light, both confirm dialogs and the GitHub connect and conflict prompts. Two clips show a reload bringing your model back and an STL export. Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 3 GIFs, 8 stills -> diff (docs/media/, docs/screenshots/); body count after reload and a real .stl download -> e2e/docs/save-load.docs.js and export.docs.js; scenarios 1, 8, 10, 11, 14 -> hand drive this session, TODO/ACCEPTANCE.md
**To Add:** docs/media/save-reload-roundtrip.gif

## 2026-10-03T18:40:00Z — Docs: sketching a part, with pictures

**Post:** WarpCad's sketch page now shows the whole flow: drag Sketch in, draw a closed outline, mark an inner circle as a hole, type 10 mm and get a solid. Four short clips, five stills. Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 4 GIFs, 5 stills -> diff (docs/media/, docs/screenshots/); solid 10 mm tall and a bore by measured volume -> e2e/docs/sketch-mode.docs.js; scenario 9 and 1 hand drive -> TODO/ACCEPTANCE.md
**To Add:** docs/media/sketch-extrude.gif

## 2026-10-03T19:08:00Z — Docs: using WarpCad on a phone or tablet

**Post:** WarpCad has a phone and tablet page now: where the Library and Inspector sheets live, why the nav pad folds to one button, and three short clips of real touch input: drag a cube in, two-finger pan and pinch, select two and Subtract. Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 12 stills, 3 GIFs -> diff (docs/media/, docs/screenshots/); camera target and distance changed, Subtract 2 to 1 bodies -> e2e/docs/mobile.docs.js assertions; scenario 7 and 1 hand drive -> TODO/ACCEPTANCE.md
**To Add:** docs/media/mobile-pinch-pan.gif


## 2026-10-03T20:22:00Z — Docs: getting started in five minutes, and a README tour

**Post:** WarpCad now has a five-minute getting-started page: drag in a cube and a cylinder, Subtract, nudge the result with the gizmo, export an STL. The README opens with a 17 s clip of the whole run, a one-off exception to the 12 s GIF limit. Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** five steps (place Cube and Cylinder, select, Subtract, nudge with the gizmo, export STL) -> docs/getting-started.md; tour is 17 s and 1,309,436 bytes (1.25 MiB) -> docs/media/manifest.json; default 12 s limit, 20 s ceiling for a movie that asks, size limit unchanged -> scripts/docs-gifs.mjs diff
**To Add:** docs/media/tour.gif

## 2026-10-03T20:55:00Z — Sketch Line tool is now continuous

**Post:** WarpCad's Line tool now keeps going: click a point and the next segment is already running from it to your pointer, with its length in mm. Click the first point to close, or Esc / Finish to leave it open. Finish and Undo point are 44 px buttons, so a phone can do it all. Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** continuous chain, live length, close on first point, Esc/Finish/Undo point -> diff (src/stores/sketchEditor.js, Viewport.vue, SketchToolbar.vue); 44 px buttons -> e2e/sketch-primitive.e2e.js touch spec and this session's phone drive (45x44 and 69x44 px)
**To Add:** docs/media/sketch-draw-line.gif

## 2026-10-03T21:58:00Z — Sketch snapping: new points land on existing corners, centres and edges

**Post:** WarpCad's sketch tools now snap. Press near a rectangle's corner with Circle and the centre lands exactly on it, with a small marker saying Corner. Centre, Midpoint and On edge too. Hold Shift, or tap Snap off on a phone, to place freely. Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** snap tiers, labels and markers -> src/sketch/snap.js, SketchStrokes.vue diff; circle centre exactly on the corner -> e2e "pressed 6 px from a rectangle corner" reads Centre X/Y "20"/"10" on 9 projects, and this session's drive read 40, 25; Shift and the Snap toggle -> same e2e spec and the touch spec on chromium-phone
**To Add:** docs/media/sketch-snap.gif, docs/screenshots/sketch-snap-corner.png

## 2026-10-04T16:54:00Z — Chamfer on a shape with a hole is wrong (found, written up)

**Post:** A 2 mm chamfer on a plate with a hole made WarpCad's solid bigger: 687 mm³ added where about 2,100 should come off. The rim sweep pairs corners by index, and the kernel interleaves outer and hole outlines. Plain plates are fine. Not fixed yet. Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 687 mm³ added by a 2 mm chamfer, about 2,100 expected (r²/2 x perimeter) -> Node run this session on the user's saved project plate (examples/chamfer error.ndjson), recorded in TODO/core-051; index-paired loft and interleaved contours -> src/core/kernel/fillet.js alignVertices/sweepRim and the contour dump from the same run; "not fixed yet" -> TODO/core-051 status: open
**To Add:** a before/after render of the chamfered plate once core-051 lands

## 2026-10-04T20:45:00Z — Sketch reference photo: load it, set its scale from a ruler, trace at real size

**Post:** WarpCad sketches can now hold a photo. Load a picture of a broken part beside a ruler, drag along the ruler, type 10 cm, then trace it at real size. The photo is redrawn from its pixels on the way in, so its GPS tag stays out of the project. Built with Claude Code, reviewed by me. #CAD
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** load / Set scale / units -> diff (ReferenceImagePanel.vue, ScaleTool.vue, calibration.js); traced at real size -> this session's hand drive (fixture L-bracket traced to 120.00 x 100.00 mm Chromium, 120.67 x 100.13 mm WebKit/Firefox against 120 x 100); redrawn from pixels, metadata incl. GPS dropped -> src/sketch/imageJob.js importImage (decode, draw to canvas, re-encode JPEG/PNG)
**To Add:** docs/media/sketch-trace-scale.gif, docs/screenshots/sketch-trace-scaled.png

## 2026-10-06T01:58:00Z — Sketch Auto-trace: tap inside a photographed part to get its outline and holes to scale

**Post:** WarpCad sketches can now auto-trace a photo: tap inside the part and its outline, holes included, lands at the photo's real scale. A test bracket came out 120.11 x 100.19 mm against a true 120 x 100. Hand-written tracer, no new dependency. Built with Claude Code, reviewed by me. #CAD
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** tap inside, outline + holes, at the photo's scale -> src/sketch/trace.js, src/sketch/referenceImage.js tracedProfiles, TODO/done/sketch-004; 120.11 x 100.19 mm vs 120 x 100 -> this session's hand drive, laptop Chromium, on e2e/fixtures/trace-bracket.jpg (true size stated in e2e/sketch-auto-trace.e2e.js's header); no new dependency -> package.json not in the diff
**To Add:** docs/media/sketch-trace-auto.gif

## 2026-10-06T02:53:00Z — Fillet and chamfer on hexagon and cylinder rims now export closed STL/OBJ/glTF

**Post:** A 2 mm fillet on a hexagon exported an STL with 12 open edges: the section the rim sweep lofts from came back ~0.0001 mm off the solid's corners. Snapped back, it's 0, and a filleted cylinder at Print resolution went from 119 open edges to 0. Built with Claude Code, reviewed by me. #CAD
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 12 open edges on a hexagon + 2 mm fillet -> TODO/done/io-006 Problem table, reproduced this session (Node, runExportJob, Normal: 88 triangles, 12 open); section ~1e-4 mm off the solid's corners -> this session's coordinate dump ((12.5, 21.650635) solid vs (12.500032, 21.650543) projected); sliver holes not T-junctions -> unmatched-edge dump this session (three edges per corner, two corners ~1e-4 mm apart); 0 after -> src/core/exportJob.spec.js new cases (11 passing) and the hand drive on Chromium/WebKit/Firefox (STL 60 / OBJ 60 / GLB 56 triangles, 0 open); filleted cylinder 119 -> 0 at Print (32 -> 0 at Normal) -> before/after Node run this session (git stash of fillet.js); fillet kept ~0.013 mm3 too much on a 20 mm cube -> fillet.spec convergence run this session (old converged 7855.854, exact 7855.841); holes still open -> TODO/core-051 status open, 160 -> 118 measured this session
**To Add:** a slicer screenshot of the filleted hexagon STL (nobody has opened one in a real slicer yet)

## 2026-10-06T15:05:00Z — Bolt Spec list goes from 3 sizes to 45, m2 and m2.5 included

**Post:** The Bolt's Spec list had three entries: m10 hex, m12 hex, 1/4 socket. My own Pi projects live on m2 and m2.5. The port had copied an old jscad-hardware release instead of the one I actually used. Now there are 45 sizes, generated from its source, plus matching nuts. Built with Claude Code, reviewed by me. #CAD
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 3 entries before -> diff of bolt-specs.js; 45 sizes -> generator output "bolts: 45" this session; m2/m2.5 are the author's usual sizes -> TODO/done/core-052 Problem (user report); wrong version ported -> TODO/done/core-052 Problem (package.json pinned 1.1.0)
**To Add:** screenshot of the open Spec dropdown


## 2026-10-06T15:44:00Z — AI partner architecture decided: raw fetch, MCP SDK v2, a branch per AI turn, no CRDT

**Post:** Before WarpCad gets an AI assistant, I wrote down how it should work. One surprise: the official Anthropic SDK fails my own licence check, via an Unlicense dependency in webhook code a browser never runs. So the client is plain fetch. Built with Claude Code, reviewed by me. #CAD
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** SDK fails the licence check via Unlicense -> license-checker@25.0.1 --production over a scratch install of @anthropic-ai/sdk@0.131.0 this session (fast-sha256@1.3.0 Unlicense, via standardwebhooks), against the allow-list in package.json's "licenses" script; plain fetch -> docs/decisions/ai-partner.md decision 2
**To Add:** —

## 2026-10-06T16:16:00Z — AI tool registry: the AI writes the same records a person does

**Post:** WarpCad's AI assistant has its tools now: read the scene, place a part, run an operation. Each writes the same record a human's drag or toolbar click would. A test builds cube, sphere, subtract in plain Node and checks the log matches the human one. Built with Claude Code, reviewed by me. #CAD
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** same record as a drag -> create.spec.js "matches recordsForDrop for every Library row" (passed this session); same record as a toolbar click -> operate.spec.js record-shape tests (passed); cube/sphere/subtract in plain Node, log equals the human one -> index.spec.js session test, expect(document.records).toEqual(human.records), both origins (passed, unit run 2949/2949 this session)
**To Add:** —

## 2026-10-06T21:35:00Z — Design intent: every AI-made step keeps why it exists

**Post:** Each step an AI adds to a WarpCad project now keeps why it exists: what you asked for, plus a one-line reason, readable in History. Projects carry standing rules too (bed size, min wall). Text from a file shows as plain text, never markup. Built with Claude Code, reviewed by me. #CAD
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** steps keep request + one-line reason -> src/ai/tools/batch.js composeIntent(ctx.request, rationale), src/ai/tools/intent.spec.js (passed this session); readable in History -> TimelineRow.vue note-icon expand, e2e/design-intent.e2e.js (36/36 then full matrix 2674 passed this session); standing rules -> ProjectSettingsDialog.vue + project.js standingInstructions; plain text never markup -> no v-html, hostile fixture drive this session (no <img> created, window.__pwned undefined)
**To Add:** docs/screenshots/history-intent.png

## 2026-10-09T16:40:00Z — Assistant chat: a sheet on phones, a column on laptops, Undo AI turn

**Post:** WarpCad's assistant has a chat now. On a phone it's a bottom sheet with three heights; on a laptop, a column. Each tool call is a row you can tap to select what it made. Undo AI turn takes a whole turn back. Built with Claude Code, reviewed by me. #CAD
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** chat is a sheet below 1100px with three heights, a column above -> ChatPanel.vue + AppView.vue styles; nav chrome inset above the sheet -> e2e/ai-chat.e2e.js layout test, 24/24 chromium laptop/phone/tablet this session; row labels and tap to select -> transcript.spec.js, ai-chat.e2e.js; Stop keeps nothing -> useAgent.spec.js + ai-chat.e2e.js; Undo AI turn off after a user edit -> useAgent.spec.js; tokens only, no price -> TokenReadout.vue, transcript.js formatUsage; Library then Inspector sheet showing through at phone width -> hand-drive screenshots this session, fixed in AppView.vue (visibility rule); full suite green -> typecheck clean, 3198 unit, 3034 e2e passed / 0 failed, this session
**To Add:** docs/screenshots of the chat sheet at phone and laptop width (not yet generated)

## 2026-10-09T19:45:00Z — The assistant can look at its own work and measure it

**Post:** WarpCad's assistant can now render the scene from a named view and read numbers back: volume, bounds, thinnest wall, gap between two parts. Thin-wall sampling on a 100-slice wing went from 219 ms to 13 ms with a BVH. A 0.3 mm fin gets flagged. Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** four tools (capture_view, measure, check_printability, check_clearance) -> src/ai/tools/index.js; 218.6 ms to 12.8 ms on a 100-slice wing -> bench/results/2026-10-09-ai-007.md, Apple M4 Pro, Node 24, median of 9 (agent-run, this session); 0.3 mm fin flagged -> printability.spec.js and e2e/ai-capture.e2e.js, e2e matrix 3052 passed / 0 failed this session
**To Add:** a capture thumbnail screenshot in the activity row

## 2026-10-09T20:30:00Z — Cheaper TODO runner: Haiku runs the tests, Opus only writes code

**Post:** Reworked how my TODO runner spends tokens. Haiku now runs the test suites and hands back a short report. Opus tasks are split so Opus only writes the failing test and the fix, and Sonnet does the rest. A green stamp skips re-running an unchanged tree. Built with Claude Code, reviewed by me. #OpenSource
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** diff only (no cost numbers claimed; none measured this session)
**To Add:** real token-cost comparison once a few batches have run under the new scheme

## 2026-10-09T21:15:00Z — Curve tool: a NACA airfoil and a tapered, twisted wing from the sketch editor

**Post:** WarpCad's sketch editor has a Curve tool now. Type NACA 2412 and a 120 mm chord, drag the airfoil into place, add a second slice with a 70 mm chord, 30 mm sweep and 2 degrees of washout, Loft. You get a 200 mm wing panel that exports as STL. Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Curve tool, Offset and Twist fields, 2412/120 recipe -> docs/sketch-mode.md and e2e/sketch-airfoil.e2e.js (loft volume within 2% of the frustum estimate, STL non-empty), e2e matrix 3083 passed / 0 failed this session; 200 mm span, 120 mm chord by finger at 390 px -> hand drive this session (bounds 0..200 in Z)
**To Add:** the airfoil-placed and Slices-card screenshots from docs/screenshots

## [2026-10-10T03:16:00Z] — A touch drag that passed every test and failed on a finger

**Post:** WarpCad now splits a 300 mm part into pieces that fit a 220 mm bed and exports each as a flat STL in a zip.

The drag handle passed its spec and failed under a real finger: a sheet covered it, and a cancelled touch reports (0, 0).

Built with Claude Code, reviewed by me.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #3DPrinting
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** split, joint, zip of flat STLs, handle -> docs/print-prep.md, src/core/kernel/split.js, src/core/printPrep.js; 300 mm vs 220 mm default bed -> docs/print-prep.md and src/core/buildVolume.js default; sheet on top of the handle and cancel at (0, 0) -> TROUBLESHOOTING.md 2026-10-10 entry and the retirement note in TODO/done/io-007-print-prep-split-and-multi-part-export.md; found by hand -> CDP touch drive this session (offset jumped 157 to 0.5 at move 7)
**To Add:** the split-sheet screenshot from docs/screenshots

## [2026-10-10T04:20:00Z] — Library parts as data: a group captured as op records, carried by the project file

**Post:** Under the hood, WarpCad can now capture a group as a library part that is data, not code: op records plus parameters. The project file carries the parts it uses. A bad part loads as a broken row with a warning, not a refused file. Built with Claude Code, reviewed by me. #CAD
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** capture, op records plus parameters, state-line parts -> docs/decisions/user-library.md and src/core/userPart.js; broken row with a warning on a missing, disallowed-op, self-containing or oversize part -> hand drive this session (Chromium and WebKit, chip text named the part and the reason); core only, no UI yet -> TODO/done/core-037 retirement note
**To Add:** a screenshot of the History rows with the broken badge once ui-055 gives the part a visible control

## [2026-10-10T07:40:00Z] — Save a group as a part, and the three bugs only a hand found

**Post:** Shipped: select a group in WarpCad, name it, and it becomes a My parts row you drag into any project, sub-part names intact. Driving it on a phone caught what specs missed: an off-screen menu, a tab over the last row, a page-shifting hidden input.

Built with Claude Code, reviewed by me. #CAD
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** group saved and dropped complete with `Cube 1`/`Cylinder 1` intact → `e2e/user-library.e2e.js` (12 tests per engine, chromium/webkit/firefox, three viewports, all passed) and a hand drive; off-screen menu → a bottom-row My parts ⋯ popover measured at y=997 in a 900 px window, fixed by clamping to the window; tab over the last row → at 390 px the Inspector's collapsed tab sat over the open Library sheet's last row (`elementFromPoint` returned the tab), fixed with bottom padding; hidden input → a visually hidden file input in the sheet grew the page in WebKit/Firefox and moved other specs' click points (`e2e/align-to-origin.e2e.js` red in WebKit/Firefox until fixed); 293 characters → measured with `node`
**To Add:** repo URL once public, docs site URL once it exists

## [2026-10-10T19:15:00Z] — A saved part now keeps the colour you gave it

**Post:** Fixed in WarpCad: colour a group by hand, save it to the library, and the copy you drag in later keeps that colour. Before, the part saved fine and came back in default colours, because the colour lived beside the build steps instead of in them.

Built with Claude Code, reviewed by me. #CAD
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** copy came back in default colours before -> TODO/done/core-054 problem text and the failing unit tests (3 red before the fix, this session); colour lived beside the lineage -> document.js `colorOverridesOf` reads `style.recolor` off the lineage, kernel fold ignores it (registry.js comment); copy keeps `#cc3322` after File > New and after a reload -> hand drive this session, Chromium and WebKit
**To Add:** before/after screenshot of the Standoff in red once a docs shot exists

## [2026-10-11T00:15:00Z] — Export at another resolution keeps a row you left broken

**Post:** Fixed in WarpCad: a project with a row you chose to leave broken now exports at Draft, Fine or Print. The export worker re-folded the log without that flag and failed on a design the app showed without complaint. One line. Built with Claude Code, reviewed by me. #CAD
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** export failed with `evaluation-failed` on a left-broken row -> TODO/done/core-053 problem text and the two unit specs that went red before the fix (this session); one line -> diff to src/core/exportJob.js
**To Add:** repo URL once public

## [2026-10-11T00:42:00Z] — Saving a placed part again no longer gets refused

**Post:** Fixed in WarpCad: drag a saved part in, select the copy, Save to library again, and it used to refuse on an exact-geometry check. The cause was last-bit float noise (about 2e-15 mm) between a baked translate and a composed one. Capture now allows 1e-9 mm; structure stays exact. Built with Claude Code, reviewed by me. #CAD
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** refused on the exact-geometry check -> TODO/done/core-055 problem text and the unit test that failed before the fix (this session); differed by ~2e-15 mm -> last-digit diff printed from the debug run this session (15.851949702904731 vs ...733); 1e-9 mm -> CAPTURE_TOLERANCE_MM in the diff
**To Add:** repo URL once public

## [2026-10-11T02:06:00Z] — Project variables in the document model

**Post:** Core of project variables landed in WarpCad: define a named value, bind any part's parameter to it with {"$var": name}, and one change rebuilds every bound part in one undo step. No UI yet. Built with Claude Code, reviewed by me. #CAD
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** one value drives three params in one undo step -> in-app probe this session (volumes 4000/6000/2000 -> 6000/9000/3000 -> back on one Undo); no UI yet -> TODO/ui-059 is still open
**To Add:** repo URL once public

## [2026-10-11T03:11:00Z] — One number, bound to many fields

**Post:** Shipped in WarpCad: name a value once, bind any Inspector field to it, change it in one place. Flip a Pi from 4 to 5 and the board swaps, the case cut-out goes, and one Undo puts it all back. The batch helper I was told to use turned out to be two Undo steps.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Pi 4 to 5 with a variable-bound Model, cube conditioned on it, one Undo restoring both → `e2e/variables.e2e.js` first test (chromium and webkit, three viewports) and the scenario 21 / 15 hand-drives in `TODO/ACCEPTANCE.md`; batch gives two Undo steps → `src/core/variables.spec.js` "document.batch(define; bind) is two Undo steps" and `TODO/core-056-*.md`
**To Add:** repo URL once public, docs site URL once it exists

## [2026-10-11T18:40:00Z] — A subscription isn't an API key, and the app now says so

**Post:** WarpCad's AI chat needs an API key, and a Claude Pro/Max subscription isn't one. The no-key screen now says that and gives you the Claude Code + MCP command that does run on your subscription. Chat turns also show an estimated cost. Built with Claude Code, reviewed by me. #CAD
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** chat needs an API key, subscription route is Claude Code + MCP -> `docs/decisions/ai-partner.md` decision 10 and `docs/mcp.md` in the diff; third parties may not route through Pro/Max credentials -> Claude Code legal-and-compliance page read this session (search result, wording summarised in decision 10); estimated cost shown -> `e2e/ai-subscription-route.e2e.js` second test (1,200 in / 340 out on Opus 5.5 reads "≈ $0.01 · session $0.01", then "$0.02" after a second turn)
**To Add:** screenshot `docs/screenshots/assistant-subscription-route.png`, repo URL once public

## [2026-10-12T14:40:00Z] — The subscription command printed paths that don't exist

**Post:** WarpCad's "use my Claude subscription" screen showed a command with placeholder paths. Pasted as written, Claude Code reported CONNECTION_CLOSED. It's now `npm run mcp:add -- my-part.ndjson`: the script works out the paths, replaces old entries, and a spec connects a real MCP client to what it registered. Built with Claude Code, reviewed by me. #CAD
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** the pasted command's placeholder paths made Claude Code report `CONNECTION_CLOSED` -> `TODO/done/ai-016-*.md` Problem section; script resolves paths, replaces old entries -> `scripts/mcp-add.mjs` in the diff; a real MCP client connects to the produced argv -> `mcp/mcp-add.spec.js` last test, passing in this session's unit run (3885 passed, 187 files)
**To Add:** screenshot `docs/screenshots/assistant-subscription-route.png`, repo URL once public

## [2026-10-12T15:50:00Z] — Decided: a hand-rolled state-based merge, no CRDT library

**Post:** WarpCad's project file now has a decided merge design: hand-rolled, state-based, no CRDT library. Replica ids, Lamport stamps, tombstones; record lines stay byte-identical. Yjs, Automerge and Loro were re-checked and passed over. Built with Claude Code, reviewed by me. #CAD
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** merge shape, mechanism, version rule -> `docs/decisions/document-sync.md` in the diff; Yjs/Automerge/Loro re-checked and rejected -> same file's options and rejection tables (figures from `npm view`/`gh api` run this session, 2026-10-12)
**To Add:** repo URL once public

## [2026-10-12T17:20:00Z] — Record ids are replica-scoped: two writers can no longer mint the same id

**Post:** WarpCad record ids now read prefix-replica-counter, like cuboid-khovb4-1. Each document gets a random replica id and a Lamport clock, so a browser tab and an AI fork can't both hand out cuboid-1. Old files load untouched. #CAD #OpenSource Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** ids read `prefix-replica-counter`, six-character replica id, Lamport clock -> `src/core/replica.js`, `src/core/document.js` in the diff; `cuboid-khovb4-1` is what the running app minted -> the hand drive of scenarios 10 and 14, this session; a tab and an AI fork would both mint the next id -> `TODO/done/data-008-*.md` Goal section; old files load untouched, legacy ids read as zero -> `counterOfId` and its spec in the diff
**To Add:** repo URL once public

## [2026-10-12T18:25:00Z] — The merge core: one pure function that joins two project states

**Post:** WarpCad's merge is now one pure function over two project states. Last-writer-wins per field, tombstones for deletes, fractional position keys so two writers' runs of inserts don't interleave. Seeded fuzz over three replicas checks commutative, associative, idempotent. #CAD #OpenSource Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** last-writer-wins, tombstones, position keys, no interleaving -> `src/core/merge/merge.js`, `positionKey.js` in the diff; fuzz over three replicas checking the three laws -> `src/core/merge/fuzz.spec.js` in the diff, 40/40 targeted specs passing this session
**To Add:** repo URL once public

## [2026-10-12T19:10:00Z] — The document carries merge state and can mergeFrom another replica

**Post:** WarpCad's document now keeps merge metadata per record: every edit gets a stamp, deletes leave a tombstone, and mergeFrom() folds another copy in. A row that can't build is flagged, not dropped. Nothing in the UI calls it yet. #CAD #OpenSource Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** stamps, tombstones, mergeFrom, flagged rows -> src/core/document.js in the diff; nothing calls it -> TODO/data-010 (Interaction model: does not apply)
**To Add:** repo URL once public

## [2026-10-12T23:10:00Z] — File ▾ → Merge file…, the merge strip, conflict chips and Undo merge

**Post:** WarpCad can now merge a copy of your project: File ▾ → Merge file…, pick the other device's save, and both sets of changes land. A step that can't survive gets a red chip saying why. Undo merge takes it back. Known gap: two unrelated projects still merge. #CAD Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Merge file…, strip, red chip with reason, Undo merge -> diff (`src/stores/merge.js`, `FileMenu.vue`, `MergeToast.vue`, `MergeBanner.vue`); unrelated projects still merge -> hand drive this session, filed as `TODO/data-013`
**To Add:** `docs/screenshots/merging-toast.png`, `merging-conflict.png`; repo URL once public

## [2026-10-13T22:40:00Z] — Snap and Align can name a part on both sides

**Post:** Mounting a Raspberry Pi on a screen in WarpCad used to measure the whole board, SD card and all, because picking the screen's post silently dropped the Pi's hole. Each selected body now keeps its own picked part, so hole1 goes on the post and mb rests on its top. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** second pick overwrote the first (one slot) -> TODO/ui-063 Problem and `src/stores/selection.js` diff; hole1 and post coincide in x/y, mb bottom 15.2 = post top 15.2 -> hand drive this session; microsd reaches below mb -> hand-back report from the implementing agent, asserted in `src/core/snap-align-both-subparts.spec.js`
**To Add:** `docs/media/snap-subpart-both-sides.gif`; repo URL once public

## [2026-10-14T14:50:00Z] — You can keep editing while the Assistant works

**Post:** In WarpCad the Assistant used to lock the viewport until its turn finished. Now it works on its own copy and lands by merge: I dropped a sphere in mid-turn and it sat next to the Assistant's parts, and Undo AI turn took out only theirs. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** lock replaced by merge landing -> diff (`src/ai/agent.js`, decision 5 amendment); sphere placed mid-turn, count 3 then 5, Undo AI turn left 3 -> hand drive this session, scripted transcript (laptop and phone Chromium)
**To Add:** `docs/screenshots/ai-working-chip.png`, `ai-watch.png`; repo URL once public

## [2026-10-14T17:50:00Z] — Claude Code edits the project you have open

**Post:** WarpCad now lets Claude Code edit the project open in your browser tab, on your own plan, no API key. Each request lands as one step; Undo AI turn takes the whole group back and leaves your own edits alone. Dev host only for now. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Claude Code edits the open tab under `npm run dev` -> diff (`mcp/liveBridge.js`, `src/ai/bridge/tabEndpoint.js`); cube and sphere landed, Undo AI turn took the group back, held-drag call refused and drop kept -> hand drive this session (MCP client stand-in, not a real Claude Code); wrong pairing code refused, phone control disabled with its reason -> same drive; Safari/real Claude Code not driven -> TODO/ACCEPTANCE.md scenario 25 Last run
**To Add:** `docs/screenshots/ai-live-bridge.png` (already generated); repo URL once public

## 2026-10-14T23:40:00Z — A browser agent can drive the open WarpCad tab

**Post:** WarpCad now registers its tools on WebMCP, so an agent living in your browser can drive the open tab with no API key and no helper process. Chrome only, behind a flag for now. Its changes land as one group that Undo AI turn removes, your own edits untouched. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** tools register on document.modelContext, abort-signal unregister, JSON results -> diff (`src/ai/webmcp/register.js`) and `docs/decisions/ai-partner.md` Decision 13; Chrome 146+ and `#enable-webmcp-testing` -> Decision 13 facts table (Chrome guide, fetched this session); 19 tools registered, capture_view absent, Undo AI turn removed only the agent's group -> hand drive this session against a fake `document.modelContext`; real Chrome not driven -> TODO/VERIFY.md rows 1-3
**To Add:** `docs/screenshots/webmcp-chip.png` (already generated); repo URL once public

## 2026-10-15T01:10:00Z — Rotate rings get a watchface dial, Shift 5° steps and speed-sensitive touch

**Post:** Dragging a rotate ring in WarpCad now draws a watchface in the ring's own plane: ticks, a start hand, a live hand, a shaded sweep and a readout like +37.5°. Shift snaps to 5° steps. On touch, drag speed picks the step, from 15° down to 0.1°. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** dial, Shift 5° steps, speed bands 0.1/1/5/15° -> diff (`src/render/rotateSnap.js`, `src/components/viewport/RotateDial.vue`); readout moved in 5° steps with Shift in a real-mouse drive this session; touch band thresholds untuned on a real device -> `TODO/VERIFY.md`
**To Add:** `docs/screenshots/gizmo-rotate-dial.png` and `docs/media/gizmo-rotate-dial.gif` (already generated); repo URL once public

## 2026-10-15T01:55:00Z — Translate arrows get a ruler, Shift 1 mm steps and speed-sensitive steps

**Post:** Dragging a translate arrow in WarpCad now draws a ruler along the arm from where you pressed, with a live marker, a shaded span and a readout like +12.5 mm. Shift snaps to 1 mm. Without Shift, drag speed picks the step, 10 mm down to 0.1 mm, on mouse and touch alike. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** ruler, Shift 1 mm, speed bands 0.1/1/5/10 mm on every pointer type -> diff (`src/render/translateSnap.js`, `src/components/viewport/TranslateRuler.vue`); readout moved in whole mm with Shift and Position X moved by exactly the final +50.0 mm in a real-mouse drive this session; speed bands untuned on a real device -> `TODO/VERIFY.md`
**To Add:** `docs/screenshots/gizmo-translate-ruler.png` and `docs/media/gizmo-translate-ruler.gif` (already generated); repo URL once public

## 2026-10-15T02:45:00Z — Fillet and chamfer now get the rim of a hole right

**Post:** A WarpCad chamfer on a plate with a hole was adding material instead of removing it: the loft walled the outer rim to the wrong neighbours. Each contour of a face now pairs with its own inset and the pairing is checked, not assumed. A hole's rim bevels too, and a radius too big for the wall between holes is refused in plain words. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** per-contour correspondence with a mitre check -> diff (`src/core/kernel/fillet.js`); the reported plate now loses the expected rim volume in a real-app Open on Chromium, Firefox and WebKit (`e2e/chamfer-with-hole.e2e.js`); a holed sketch chamfered by hand removed 522-534 mm3 against 528 expected
**To Add:** `docs/screenshots/chamfer-with-hole.png` (already generated); repo URL once public

## 2026-10-15T03:20:00Z — A body or group can be renamed, as one undoable record

**Post:** WarpCad can now rename a body in the document: one undoable record overrides the name wherever it shows, from History rows to refusal messages. Blank puts the generated name back, and the next drop keeps its own count. The Inspector field is next. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** `style.rename` record, newest wins, blank clears, `nextName` unchanged -> diff (`src/core/document.js`, `src/core/naming.js`); name survived a size edit, a move, a union plus undo and a reload in a real-mouse drive this session; full suite 4502 unit and 3545 e2e passed; no Inspector control yet (`ui-056`)
**To Add:** nothing yet, the Inspector field and its screenshot land with `ui-056`; repo URL once public

## 2026-10-15T04:00:00Z — Name a part in the Inspector: pencil, F2, Enter

**Post:** WarpCad's Inspector now lets you name a part or group in place. Tap the name or its pencil (or F2), type, Enter. Escape puts the old name back, blank restores the generated one, and a name another part already has shows a hint but still goes through. The new name shows in the Inspector, the object list and the phone tab at once, and Undo takes it back. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** `NameField.vue` over `documentStore.renameBody` -> diff (`src/components/inspector/NameField.vue`, `src/stores/document.js`); `e2e/rename-part.e2e.js` passes on Chromium, Firefox and WebKit at phone, tablet and laptop widths (full run 3596 passed, 0 failed, this session); 4519 unit tests passed; a real-mouse drive on Chromium kept the selection through a rename and a following size edit
**To Add:** `docs/media/inspector-rename.gif` (generated); repo URL once public

## 2026-10-15T05:30:00Z — Save no longer dead-ends when the browser refuses the write

**Post:** Some browsers offer the file picker and then refuse the write. WarpCad's Save used to stop at an error there. Now the same click downloads a copy, the menu switches to Download copy, and the notice names the file it downloaded and the empty one the picker may have left behind. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** refusal (`NotAllowedError`/`SecurityError`) -> download in the same call, handle dropped, `capabilities` getter flips -> diff (`src/storage/fileSystem.js`, `src/stores/persistence.js`); `e2e/save-load-ui.e2e.js` against a refusing picker passes on Chromium, Firefox and WebKit at three widths; full e2e matrix 4516 passed, 0 failed this session; a real-mouse drive on Chromium downloaded, reloaded and re-opened the copy
**To Add:** `docs/screenshots/save-refused-notice.png`; repo URL once public

## 2026-10-15T06:55:00Z — The docs now ship inside the app

**Post:** WarpCad's documentation is in the app now. Every tool pop-up has a ? in its header that opens the docs at that tool's section, over the pop-up, without losing your selection. It works offline. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** `scripts/help-build.mjs` renders `docs/*.md` at build time -> `help/<page>.html`, precached by the service worker (`vite.config.js`); `e2e/help.e2e.js` passes on Chromium, Firefox and WebKit at three widths, offline under `E2E_PREVIEW=1`; 4580 unit tests passed
**To Add:** `docs/screenshots/help-from-popup.png`, `docs/media/help-open-close.gif` (generated); repo URL once public


## 2026-10-15T07:05:00Z — A mouse drags a rotate ring the way a finger does

**Post:** Rotating a part with a mouse in WarpCad used to be continuous while a finger got speed-picked steps. Now both do: drag fast and the ring moves in big steps, slow right down and it falls to 0.1 degrees, and Shift still snaps to 5. Same rule as the move arrows. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** `rotateStepDeg` no longer takes a pointer type (`src/render/rotateSnap.js`), unit tests pin mouse/touch/pen to the same bands; `e2e/rotate-dial.e2e.js` and `e2e/gizmo-transform.e2e.js` pass on Chromium, Firefox and WebKit at three widths; a real-mouse drive reloaded `-45.0°` and `-87.3°` exactly
**To Add:** `docs/media/gizmo-rotate-dial.gif` (generated); repo URL once public


## 2026-10-15T10:10:00Z — Claude Code and the app edit one file

**Post:** Claude Code and WarpCad can now edit the same project file without anyone losing work. Move a part in the app, ask Claude Code for a sphere, switch back: the sphere merges in, your move stays, one note says what came in, and Undo merge takes it back. A dialog only shows up if the file is a different project. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** `mcp/server.spec.js` and `src/stores/diskChange.spec.js` pin one replica id per server process, a bounded re-read when the file changes mid-call, and merge-before-save; `e2e/mcp-merge.e2e.js` drives the real `mcp/server.js` against a real file (handle path Chromium only, Merge file… route on Chromium, Firefox and WebKit at three widths); 4618 unit tests passed
**To Add:** `docs/screenshots/mcp-merged.png` (generated); repo URL once public


## 2026-10-15T13:42:00Z — A merge now refuses a project that isn't a copy

**Post:** WarpCad's Merge file… used to fold in any project you handed it, including a completely different one. Each project now gets an id on its first change, saved with the file, so unrelated projects get refused and real copies still merge. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** two projects each started from New were merged silently -> `TODO/done/ui-062` retirement note in `TODO/ROADMAP.md` and the old caveat removed from `docs/merging.md` in this diff; refusal and copy-merge driven by hand this session (scenarios 10 and 22, `TODO/ACCEPTANCE.md`); typecheck clean, unit 4650 passed, full e2e 3739 passed / 909 skipped / exit 0, run this session
**To Add:** repo URL once public


## 2026-10-15T14:55:00Z — The Phone part picks its handset and case, and the plateau is its own part

**Post:** WarpCad's Phone stand-in is no longer one hard-coded slab. Pick a handset (ten iPhones, three Android phones) and a case beside the Library row, drag it in, and the camera plateau is its own selectable part, so Subtract cuts only the camera pocket. Handset sizes are marked verified or estimate. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 13 handset rows and 6 case presets, each with source, date and status -> `src/core/kernel/recipes/phoneModels.js` and its spec; plate minus `{ id, pieces: 'plateau' }` removes the plateau's volume only -> `kit.phone.spec.js` and `e2e/phone-library.e2e.js`; typecheck clean, unit 4730 passed, full e2e 3776 passed / 915 skipped / 2 docs stills regenerated, run this session
**To Add:** `docs/screenshots/phone-plateau-pocket.png` (generated); repo URL once public


## 2026-10-15T18:34:00Z — Import an STL into My parts

**Post:** WarpCad can now take an STL you already have. Import model file... in My parts reads it off the main thread, shows its size in mm with a Units control (STL has none), and the row drags into the view like any part. You can move it, subtract a cube from it, and export it closed. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** a 100,352-triangle import held the longest frame gap to 17 ms, against 133 ms with the parse on the main thread -> measured in a browser, table in `docs/decisions/mesh-import.md`; a hand-made L-bracket with a T-junction exported with 0 open edges after a Subtract -> driven by hand this session (scenario 26); typecheck clean, unit 4825 passed, `e2e/import-model.e2e.js` 27 of 27 across three engines and three widths, run this session
**To Add:** `docs/screenshots/import-model-row.png`, `docs/media/import-model-place.gif` (generated); repo URL once public


## 2026-10-15T19:50:00Z — A stale hosted save merges

**Post:** Saving a WarpCad project to a git repository from two devices used to end in a three-button dialog where every answer threw something away. Now the second save fetches the repository's copy, merges it in, pushes the result and tells you what came in. The dialog is left for the one case that deserves it: the file in the repository is a different project. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource #git
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** laptop and phone both edit and save, the second save lands both changes and one push -> `e2e/hosted-persistence.e2e.js` and `e2e/save-load-ui.e2e.js` (226 passed on Chromium and WebKit, mocked host), driven by hand against the mock this session; a different project still opens the dialog and Cancel leaves the dot at `!` -> same specs; typecheck clean, unit 4833 passed
**To Add:** `docs/screenshots/hosted-merged.png` (generated); repo URL once public


## 2026-10-15T20:26:27Z — WarpCad gets an icon

**Post:** WarpCad has an icon: a cube in a warp flash, picked from 20 concepts. Ten start from the app (a Pi B+, a bolt, a bearing, cube minus sphere), ten add Warp. One SVG feeds the favicon, home-screen icons and manifest. Built with Claude Code, reviewed by me. #CAD #PWA
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #PWA
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 20 concepts → 20 SVGs in `design/logo-concepts/` (commit 1fdb565); ten "cad" and ten "warp" → `set` field in `design/logo-concepts/index.json`; Pi B+, bolt, bearing, cube−sphere → kinds `raspberrypi.bplus`, `hardware.bolt`, `hardware.bearing`, "Cube − sphere scenario" in `index.json`; the pick is concept 16, the warp flash → `scripts/app-icons.mjs` header and `TODO/done/build-006` retirement note; one SVG feeds every icon → `scripts/app-icons.mjs` renders the PNGs and the .ico from `public/favicon.svg` and supplies the manifest list to `vite.config.js` (commit 1fdb565)
**To Add:** `public/pwa-512x512.png` as the image; repo URL once public


## 2026-10-15T21:30:00Z — Choose where a split joint goes

**Post:** WarpCad's split tool can now take connectors you place by hand: pins, tongues, wedge keys or screw bosses, at exact coordinates on the cut face. A connector that would break through a wall or overlap another is refused, with its name and position. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** pins, tongue, wedge and screw-boss kinds accepted with `placements` → commit `c2b1e25` diff (`split.js`, `joint.wedge.js`, `joint.screwBoss.js`); refusal of walls breaking out and overlaps by name and position → `split.spec.js`, `joint.placements.spec.js` in the same commit, passing in the independent run at HEAD `c2b1e25` (unit 4885/4885); screw bosses are not in the post's claims beyond the kind name
**To Add:** none yet; the drag-to-place UI is `ui-067`, not built


## 2026-10-15T23:50:00Z — Place split connectors by hand, on the cut face

**Post:** WarpCad's Split sheet now has Place connectors: tick it, and the cut face shows what the search found as markers over a red map of where nothing fits. Tap to drop a post, wedge or screw boss, drag to move it. A bad spot snaps back with the reason. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** toggle, kind picker, draggable markers, red clearance map, snap-back with reason -> `e2e/print-prep.e2e.js` "Place connectors" specs, 3884 passed / 0 failed in the full run at this commit; reasons are `core-059`'s refusals (`joint.placements.js`); the red map is `previewSplitFace` in `split.js` (`splitFace.spec.js`)
**To Add:** `docs/screenshots/split-sheet-manual-joints.png` or `docs/media/print-prep-manual-joint.gif`; repo URL once public


## 2026-10-16T02:22:00Z — The AI assistant's snap description

**Post:** WarpCad's AI assistant was told the wrong side for one snap option. outside+ puts the first body on the second's − side, but the tool's own description said +. Fixed, with a test that measures the kernel against the words. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** description said + side → `operate.js` diff; outside+ is the − side → `SNAP_SIDES` in `group.js` and the measured test in `operate.spec.js`; unit 4918 passed and snap-align e2e 90/90 this session
**To Add:** none; a live Assistant check is logged in `TODO/VERIFY.md`

## 2026-10-16T03:55:00Z — Six Raspberry Pi screens, one Library row

**Post:** WarpCad's Library had six separate rows for Raspberry Pi screens. Now it's one: Raspberry Pi Screen, with a Screen model dropdown you can change again in the Inspector after placing. Projects that used the old rows still open unchanged. #CAD #RaspberryPi #OpenSource

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #RaspberryPi #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** six rows → one → `library.spec.js` row list (7 rows), `ROW_ORDER` diff; Inspector change rebuilds in place → `e2e/raspberrypi-screen-library.e2e.js`, acceptance 15 drive 2026-10-16; old projects open → `raspberrypi.screen.spec.js` replay tests + tessellation goldens carried over
**To Add:** `docs/screenshots/library-rpi-screen-models.png`

## 2026-10-16T04:21:47Z — Planned: Repeat a placement on every mounting hole

**Post:** Next up for WarpCad (planned, not built yet): Repeat. Place one M2.5 screw on a Raspberry Pi's first hole, press Apply, and the other three holes get one too. The repeats stay linked: change the first screw's length and all four follow. #CAD #RaspberryPi #OpenSource

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #RaspberryPi #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** planned, not built → TODO/core-061 and TODO/ui-069 are status: open; one screw then Apply for the other three → ui-069 Goal and Interaction model; linked, length change follows → ui-069 Decisions 1 and core-061 decisions 3–4, chosen by the user 2026-10-15
**To Add:** none until it ships; then `repeat-placement.gif` from ui-069's Media

## 2026-10-16T04:20:00Z — A phone-layout overlap, filed

**Post:** Found by hand on a phone, not by a test: in WarpCad, select a part while the Library sheet is open and the Inspector's tab gets drawn over the Library's rows. Filed as ui-070, and the fix stacks the tab below the sheet. #CAD #OpenSource

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** found by hand on a phone → user's screenshot and report, this session; tab over rows → `Inspector.vue` phone `bottom`/`z-index` vs `LibraryPanel.vue` phone sheet; fix proposed, not built → `TODO/ui-070`
**To Add:** the user's phone screenshot, if they want it public

## 2026-10-16T04:24:22Z — Overnight runner config: M16 then gears, one flaky test parked

**Post:** Planning the overnight run for WarpCAD: finish the last two M16 rows, then start the gears milestone, no stops. A known flaky unit test (lens volume, times out under full-suite load) is parked behind the gears, with a written rule for how the runner treats it. Built with Claude Code, reviewed by me. #CAD #OpenSource
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** testing-004 moved out of M16 → diff of TODO/ROADMAP.md; runner rule → diff of TODO/BUDGET.md; gears are M11 and run after M16 → ROADMAP.md milestone table in the diff
**To Add:** nothing

## 2026-10-16T04:32:08Z — Overnight runner: no batch stops, resume after the usage window

**Post:** Tonight's WarpCAD backlog run has no batch limit and no milestone stops: M16, the gears, then a new M17 (Repeat across matching parts plus a phone layout fix). If the usage window runs out mid-task, an hourly cron restarts the run and resumes the half-done task. Built with Claude Code, reviewed by me. #CAD #OpenSource
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** batch and milestone stops waived → TODO/BUDGET.md diff; M17 rows ui-070, core-061, ui-069 → TODO/ROADMAP.md diff; cron restart and resume rules → TODO/BUDGET.md diff
**To Add:** nothing

## [2026-10-16T06:20:00Z] — A gear is now a registry entry, not a library row yet

**Post:** WarpCad can now fold a spur gear from one document line: teeth, module, pressure angle, thickness, bore. The bore is cut in 2D before a single extrude, so the solid stays watertight. It has no Library row yet, on purpose: the panel comes next. Built with Claude Code, reviewed by me. #CAD #OpenSource
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** `gear.spur` composite with parts gear, bore, pitch → `src/core/kernel/recipes/gear.spur.spec.js`; bore cut in 2D by `profile.circle` before the extrude → `src/core/kernel/recipes/gear.spur.js`; no Library row → `src/core/library.spec.js`; full suite 5115 unit and 3909 e2e passing → test run this session
**To Add:** nothing

## [2026-10-16T07:10:00Z] — A helical gear is a spur gear's outline with a twist

**Post:** WarpCad's spur gear now takes a helix angle, a hand and a herringbone flag. There is no helical-gear op: the recipe computes the twist from the angle and hands it to the same extrude. Module and pressure angle stay the normal values, as on a store-bought gear, and the outline is the true transverse section. Built with Claude Code, reviewed by me. #CAD #OpenSource

**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** twist = t·tan(β)/r, transverse module mₙ/cos β → `src/core/gear/helix.spec.js`; herringbone as one chevron extrude, β = 0 still valid → `src/core/kernel/recipes/gear.spur.helical.spec.js`; step count and vertex budget → `src/core/kernel/tessellation.spec.js`; full run 5194 unit, 3908 e2e passing → test run this session
**To Add:** nothing

## [2026-10-16T09:35:00Z] — A ring gear without the pinion it meshes with

**Post:** WarpCad now builds an internal (ring) gear and a rack from their own parameters. The old V1 library cut a ring by sweeping the pinion it meshed with. Here the tooth shape comes straight from the involute, and a test checks a 64-tooth ring against a 14-tooth pinion for zero overlap at 12 angles. Built with Claude Code, reviewed by me. #CAD #OpenSource

**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** ring defined by own params, `connectedGear` refused by name → `src/core/kernel/recipes/gear.ring.spec.js`; zero overlap at 12 angles, 64T/14T and 96T/14T → same file, "meshing proof" block; V1 swept the pinion → `TODO/done/core-043-internal-ring-gear-and-rack.md` Goal; no Library row → same spec, "no ui yet"
**To Add:** nothing

## [2026-10-16T10:14:00Z] — Two gears that mesh, by arithmetic

**Post:** WarpCad can now place two gears so their teeth interleave: centre distance, phase and a signed ratio. Boolean-intersecting the built bodies gives 0 mm³ overlap on 36T/12T, 30T/8T and a helical pair; wrong phase gives 14 to 48. Built with Claude Code, reviewed by me. #CAD #OpenSource

**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** centre distance, phase, signed ratio from params → `src/core/gear/mesh.spec.js`; 0 mm³ overlap on 36T/12T, 30T/8T at 14.5° and helical 20T/12T, wrong-phase controls 13.9, 47.6 and 17.4 mm³ → `src/core/kernel/recipes/gear.pair.spec.js` and `docs/decisions/gears.md` core-044 addendum
**To Add:** nothing

## [2026-10-16T12:05:00Z] — A bevel gear whose cone is computed, not eyeballed

**Post:** WarpCad can now build a straight bevel gear from tooth counts and shaft angle. The cone angle is computed: a 32T/32T pair at 90 degrees is exactly 45, a 1:2 pair 26.565. The V1 bevel tapered about 43. Built with Claude Code, reviewed by me. #CAD #OpenSource

**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** cone angle from tooth counts and shaft angle, miter 45°, 1:2 at 26.565° → `src/core/gear/bevel.spec.js`; V1 tapered about 43° → `TODO/done/core-045-straight-bevel-gear.md` Goal; full run 5546 unit, 3909 e2e passing → test run this session
**To Add:** nothing

## [2026-10-16T19:40:00Z] — Live MCP access with a timer instead of a pairing code

**Post:** WarpCad's live MCP link no longer uses a pairing code. You switch access on in the app for 15 minutes, an hour, this tab, or until you turn it off, and any MCP agent on your machine can edit the open project. Finishing it turned up a bug: a client that crashed stayed counted and blocked every later call. #CAD #OpenSource Built with Claude Code, reviewed by me.

**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** lease options and no code → `TODO/done/ai-023-pairing-code-works-for-any-mcp-agent.md`; crashed client stayed counted, fixed by a five-minute idle sweep → `mcp/liveHttp.js`, `mcp/liveHttp.spec.js`
**To Add:** screenshot of the Live MCP access sheet

## [2026-10-16T22:40:00Z] — Worm gears, built without a boolean

**Post:** WarpCad now builds worms and worm wheels: 1 to 4 starts, a wheel cut at the worm's lead angle, and a pair placed at the right centre distance and phase. I planned to sweep a thread and union it onto a core, but that union left open edges every time. So the worm is its cross-section twisted once per lead, one pass, no boolean. A 200 mm worm comes out watertight at about 200k vertices.

**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** union left 10/49/6/30 open edges, twisted section watertight, 198,612 vertices at 200 mm → `docs/decisions/gears.md` core-047 addendum; interference 0 mm^3 across 12 positions → `src/core/kernel/recipes/gear.wormPair.spec.js`
**To Add:** screenshot of a 2-start worm meshed with its wheel

## [2026-10-16T23:40:00Z] — The backlog runner prints its plan first, and gears move to the end

**Post:** My task runner for WarpCad now prints the order it will work in before it starts, and doesn't stop to ask. I read the list, interrupt if something looks wrong. The gear tasks moved to the very end of the queue so the rest of the backlog clears first.

**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #OpenSource #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** diff only
**To Add:** none

## [2026-10-17T00:09:20Z] — WARPCAD_LIVE_BRIDGE=0 turns off the dev live MCP bridge

**Post:** WarpCad's dev server now has a switch for its live MCP endpoint: WARPCAD_LIVE_BRIDGE=0 npm run dev leaves /mcp out entirely. I wanted to test Chrome's WebMCP tools with nothing else listening. On by default.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #OpenSource #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** off for 0/false/off/no → `mcp/liveBridge.spec.js`; bridge landed 2026-10-15 → git log (ai-012)
**To Add:** none

## [2026-10-17T00:09:20Z] — A fast test mode: Chrome desktop and Safari on iPad only

**Post:** Added a fast mode to WarpCad's tests: touch .test-fast and Playwright runs everything on just Chrome desktop and Safari on iPad instead of all nine engine/viewport combos. The file is gitignored.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #OpenSource #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** config resolves to guards + chromium-laptop + webkit-tablet with the marker → node check this session; 3x3 matrix → `playwright.config.js`
**To Add:** none

## [2026-10-17T00:18:33Z] — Test runs now say when the code already passed

**Post:** WarpCad's test runner now fingerprints the whole working tree with a sha256 when a full run goes green. Ask for another run on identical code and it shows the hash, then asks, or waits 60 seconds with no terminal, before re-running. #OpenSource Built with Claude Code, reviewed by me.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** gate exits 1 on stale, waits then exits 1 with no TTY, stamp check unchanged → run by hand this session; sha256 → `scripts/todo-progress.mjs`
**To Add:** none

## [2026-10-17T01:40:00Z] — One Bolt / screw part with a Type dropdown

**Post:** WarpCad's bolts and screws are now one Library part. Pick a Type (socket cap, hex, pan, flat head, or a wood screw) and a Size list that only offers sizes that exist for it, then drag it in. Files saved with the old bolts open and build exactly as before.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #OpenSource #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** six types and their size lists → `src/core/kernel/tables/fastener-specs.js`; legacy bolts replay identically → `src/core/kernel/recipes/fasteners.legacy-oracle.json` oracle test
**To Add:** none

## [2026-10-17T02:30:00Z] — The Library remembers your last part

**Post:** WarpCad's Library now remembers what you last picked for each part. Drag a screw in, make it an M2.5 socket cap, 8 mm long, and the next screw you drag in is already that one. A small button on the row puts it back to the default.
**Links:** [jwc.dev](https://jwc.dev)
**Hashtags:** #OpenSource #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** the merge and validation rules → `src/core/libraryDefaults.js`; real-mouse drag, reload and Reset checks → `e2e/library-remember-params.e2e.js`
**To Add:** none

## [2026-10-17T02:36:00Z] — The tab that sat on top of the list

**Post:** On a phone, WarpCad's Library is a bottom sheet. Drop a part and the Inspector's little tab, named after what you just placed, appeared right across the sheet's rows, covering Active Cooling Fan and half of Raspberry Pi Screen. Both panels anchored to the bottom edge and only one knew the other might be open. The tab now docks on the bottom edge and the Library lifts above it. Built with Claude Code, reviewed by me.

**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #UX #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** tab overlapped the sheet by 44 px before, 0 after, every row's centre hit-tested → `e2e/phone-sheet-stacking.e2e.js` (failed on chromium-phone before the change); drawn from the user's own phone report 2026-10-16 → `TODO/done/ui-070-phone-inspector-tab-covers-open-library-sheet.md`
**To Add:** the new `mobile-library-with-selection.png` screenshot, repo URL once public, docs site URL once it exists

## [2026-10-17T06:00:00Z] — One bolt, three more, still linked

**Post:** In WarpCad you can now finish one screw on a Raspberry Pi's first mounting hole, then repeat it on the other three as one History row, "Bolt 1 ×3". It is linked, not copied: change the first bolt's length and all three resize, change its Align and all three move. A later move of the first bolt moves only that bolt, because a row only sees what came before it. The Bill of Materials counts four. Built with Claude Code, reviewed by me.

**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Length 10 to 14 mm took the repeat from 274.506 to 333.033 mm³, exactly three times one bolt (111.011), driven by hand in the app; the record, its refusals and the repair rows → `src/core/repeat.js`, `src/core/repeat.fold.spec.js`; the `repeat` tool against the real MCP server → `mcp/server.spec.js`
**To Add:** none (no UI yet, that is the next task)

## [2026-10-17T07:55:00Z] — Press Repeat, make one screw, get four

**Post:** WarpCad has a Repeat button now. Pick a Raspberry Pi's first mounting hole, press it, make one M2.5 screw the normal way (drag it in, turn it, align it, sink it 5 mm), and Apply puts the same screw on the other three holes. One Undo step, one History row, and it stays linked: lengthen the first screw and all four grow. Built with Claude Code, reviewed by me.

**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** real-pointer flow on Chromium, Firefox and WebKit at phone, tablet and laptop size → `e2e/repeat-placement.e2e.js`; the record → `src/core/repeat.js`; the walkthrough and a recorded run → `docs/snap-align.md`
**To Add:** `docs/media/repeat-placement.gif` (the whole flow), repo URL once public, docs site URL once it exists

## [2026-10-17T10:35:00Z] — The Assistant folds up when an agent is driving

**Post:** When an MCP agent is connected to WarpCad, the Assistant panel used to keep a whole empty chat on screen. Now it folds to its header: the "MCP agent · connected" chip and Undo AI turn. On a phone that is 159 px instead of about 300, and the nav chrome drops down with it. Turn live access off and the chat is back. Built with Claude Code, reviewed by me. #CAD #OpenSource

**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** panel 159 px on a 390x844 phone, 111 px at 820 wide, scale readout within 40 px of the sheet → `e2e/mcp-connected-assistant.e2e.js` (9 engine-viewport projects); the hidden chat keeps its state → `src/components/ai/ChatPanel.spec.js`
**To Add:** `docs/screenshots/mcp-connected.png`, repo URL once public, docs site URL once it exists

## [2026-10-17T11:20:00Z] — A reload should show the new version

**Post:** WarpCad is a PWA that caches its whole shell so Help works offline. The catch: after a deploy, a reload kept serving the old build until the new service worker had taken over, and an open tab was never told. Now a reload or two picks up the new version, a tab left open checks every 30 minutes, and a bottom banner says "A new version is available" with Reload, which asks first if you are mid-drag. Built with Claude Code, reviewed by me. #CAD #OpenSource

**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** two simulated deploys, banner, Reload, project intact, on Chromium, Firefox and WebKit at three sizes (36 of 36 passed) → `e2e/pwa-update.e2e.js`; generated worker has skipWaiting, clientsClaim, cleanupOutdatedCaches → `dist/sw.js` after `npm run build`
**To Add:** `docs/screenshots/pwa-update-toast.png`, real Pages delay once measured, repo URL once public, docs site URL once it exists


## [2026-10-17T11:50:00Z] — Docs pictures for the Assistant, and none of them used a real model

**Post:** Swept WarpCad's docs for gaps in pictures. Most were already filled by the tasks that built each feature. Added movies for the Assistant building a model wing, the Assistant turning a drawing into a library part, select-and-delete in sketch mode, and re-linking a broken history step. The AI ones replay a recorded turn: no model, no key, no network, and the panel says Scripted.

**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** every picture comes from a Playwright spec and the media guard checks links and orphans → `e2e/docs/ai-chat.docs.js`, `e2e/docs-media.spec.js`; any call to the Anthropic API fails the spec → `e2e/docs/ai-chat.docs.js`
**To Add:** `docs/media/ai-wing-airfoil.gif`, repo URL once public, docs site URL once it exists


## [2026-10-17T12:10:00Z] — Flaky unit timeouts were seventeen slow specs, not one

**Post:** A unit test kept timing out in the full run and passing alone. I assumed one slow test; it was seventeen kernel and library specs whose slowest test takes 1-4 s on a quiet machine. The 5 s default has no headroom once the CPU is shared. Two full runs at once: 2-4 timeouts every time (6 of 6). After giving those specs a 30 s budget: 0 of 6.

**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #Testing #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** per-run timeout counts and per-spec timings → `TODO/done/testing-004-measure-spec-lens-volume-times-out-under-full-suite-load.md`; guard → `scripts/heavySpecTimeouts.spec.js`
**To Add:** none


## [2026-10-17T12:17:00Z] — Error reporting that is off until you give it a key

Hooked up Sentry to the browser build, with the rule that a build with no DSN sends nothing and allows nothing. Two surprises: Sentry 11 dropped `sendDefaultPii` for `dataCollection`, whose defaults are all on, so the old privacy flag would have been a silent no-op. And the CSP names the ingest host straight from the DSN at build time, one exact host, never `https:`.

**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #Sentry #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** one tested scrubber and the init options → `src/core/errorReporting.spec.js`; build and CSP host logic → `scripts/sentry-build.spec.js`, `e2e/csp.e2e.js`; decision and bundle cost → `docs/decisions/error-reporting.md`
**To Add:** none (not yet run against a real Sentry project)


## [2026-10-17T12:35:00Z] — Page views, and a list of what it will not send

**Post:** Added Google Analytics to WarpCad's hosted build, with the rules written first: a build with no Measurement ID has no script and allows no Google host, the URL hash never leaves the browser, and localhost, previews and test runs report nothing. It sends one page view with just the origin and path. I could not check any of it against a real property, so that part is on the owner's list.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #WebDev #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** loader and gates → `src/analytics/analytics.spec.js`; CSP additions → `scripts/analytics-build.spec.js`, `e2e/csp.e2e.js`; decision → `docs/decisions/analytics.md`
**To Add:** none (not yet run against a real GA property)


## [2026-10-17T15:55:00Z] — The 500 kB warning did not cost load time; unused boot code did

**Post:** Vite warned my entry chunk is 1.8 MB. I measured before splitting: 3 engines, cold vs repeat, throttled link. Vendor chunks changed nothing in Chromium/WebKit. Deferring 4 modules unused at boot saved ~330 ms (9%) cold. No real phone or HTTP/2 yet. #WebPerf Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #WebPerf #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** method, tables and the not-measured list → `bench/results/2026-10-17-perf-002.md`; bench → `bench/bundle-load.mjs`; follow-up → `TODO/perf-003-defer-code-unused-at-boot.md`
**To Add:** none (headless engines on one laptop; no real device or HTTP/2 yet)


## [2026-10-17T19:31:00Z] — The build now ships its own licence notices

**Post:** WarpCad's build now carries a THIRD-PARTY-NOTICES.txt: every production dependency with its version, licence and full text, generated from the lock file. A unit spec fails if one is missing. Linked from Help's footer. #OpenSource #WebDev Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #OpenSource #WebDev
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** generator, sorted output and per-package guard → `scripts/third-party-notices.spec.js` (8 tests, passing this session); file size and Help link → `dist/THIRD-PARTY-NOTICES.txt` 80,890 B and `e2e/help.e2e.js`, commit 5546188
**To Add:** none


## [2026-10-17T19:55:00Z] — A trademark notice that a test keeps honest

**Post:** WarpCad names real parts (Raspberry Pi, Adafruit, Pimoroni) and phones (iPhone, Pixel, Galaxy). LICENSING.md now says who owns each name and that nothing implies an endorsement. A unit spec fails if a brand name appears in src/ without being listed there. #OpenSource Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** guard and name list → `scripts/trademarkNotice.spec.js`; section → `LICENSING.md` "Trademarks and names", commit 1e94338
**To Add:** none


## [2026-10-17T20:10:00Z] — Where the ported code came from, in writing

**Post:** Some of WarpCad's fastener and Raspberry Pi tables started life in my own JSCAD v1 libraries. LICENSING.md now lists each ported file, the library it came from, and says I relicense it as AGPL-3.0-or-later. A unit spec fails if a file says "ported from jscad-" and isn't listed. #OpenSource Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** guard and file list → `scripts/portedCodeProvenance.spec.js` (15 tests, passing this session); section → `LICENSING.md` "Ported code and data", commit b54ee71
**To Add:** none


## [2026-10-17T20:12:00Z] — Stop CI from spending the LFS quota

**Post:** WarpCad's 74 docs GIFs (73 MB) live in Git LFS, and four CI jobs downloaded them on every push. Now only the Pages build gets them, from a cache. The test jobs run on pointer files, which I checked by running the suite on a pointer-only checkout. #OpenSource #GitHubActions Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #OpenSource #GitHubActions
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** guard → `scripts/workflowLfs.spec.js` (6 tests, passing this session); pointer-only run → 6142 unit tests and the guards project, see `TODO/done/build-012-cut-lfs-bandwidth-in-ci-and-pages.md`; cache action → `.github/actions/lfs-media/action.yml`
**To Add:** the byte counts from the first two runs on GitHub (cache miss, then hit); not measurable before the push


## [2026-10-17T20:22:00Z] — A CNAME file and a guard for app.warpcad.com

**Post:** WarpCad's repo now carries the CNAME file for app.warpcad.com, so every GitHub Pages deploy keeps the custom domain. A unit spec fails if the file goes missing or the built dist/ lacks it. The DNS record and Pages settings are still my job, so it is not live yet. #OpenSource Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** guard → `scripts/cname.spec.js` (3 tests, failing before the file, passing after); built `dist/CNAME` from a real `npm run build`; section → `docs/decisions/hosting.md` "Custom domain"
**To Add:** a screenshot of the live site once the DNS record and certificate are in place


## [2026-10-17T21:00:00Z] — Dropping a build plugin over its licence

**Post:** WarpCad's Sentry source-map upload used a build plugin that pulls in a package under the Functional Source License, which is source-available, not open source. For an AGPL project that did not fit, so the plugin is gone and the Pages workflow uploads maps with curl instead. I could not test the upload against a real Sentry project yet. #OpenSource Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** guards -> `scripts/sentry-upload.spec.js` (7 tests, failing before, passing after); lockfile -> 495 lines removed, none added; decision note -> `docs/decisions/error-reporting.md`
**To Add:** the log line from the first real upload run


## [2026-10-17T21:30:00Z] — The phone bug that was my test's aim

**Post:** A WarpCad test failed on every phone browser: the second Library drag placed nothing. It looked like a touch bug. It was the test. An earlier fix lifted the open Library sheet 44 px above the Inspector's tab, and the test still released the drag at a point that is now under the sheet. The app was right to ignore it. The helper now says what covers the drop point instead of just failing a body count.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #Testing #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** `e2e/save-load-ui.e2e.js` green on chromium, webkit and firefox phone projects (it failed on all three before); drop point y=369 against a sheet top of y=366 -> probed with `elementFromPoint`; driven by hand with real touch events at 390x844
**To Add:** none


## [2026-10-17T23:30:00Z] — One Raspberry Pi, four holes

**Post:** In WarpCad, drilling a plate with a Raspberry Pi's mounting hole used the Pi up, so four holes meant four Pis. Now the Pi stays after the Subtract and one board drills all four. Only the Pi's own hole parts do that: the Ethernet jack, a keep-out or a bolt's clearance still get used up. I also made Repeat refuse a cut plate, since it would copy the whole plate per hole.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #RaspberryPi
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** `e2e/pi-hole-subtract.e2e.js` drills hole1-hole3 with one Pi on nine projects; it failed on the old code with body-count 1; the docs movie `rpi-mounting-holes.gif` regenerated to show a second hole
**To Add:** none


## [2026-10-17T23:59:00Z] — Repeat no longer stops at a step you didn't make

**Post:** In WarpCad, Repeat used to grey out Apply if the Assistant had touched the part you were copying. Now Apply stays on: the step is listed as not part of the repeat, with who made it, and the copies are built from your steps alone. The first part keeps the Assistant's change.

Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #RaspberryPi
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** `e2e/repeat-placement.e2e.js` new case on nine projects (scripted Assistant lifts the bolt 3 mm; copies sit 3 mm below it); it failed on the old sheet at the reason line; hand-driven at 1440x900 and 390x844
**To Add:** none

## [2026-10-17T23:59:30Z] — Save to library refuses a repeat

**Post:** In WarpCad, a repeat like "Bolt 1 ×3" can no longer be saved to your parts library. The button greys out and says why: a repeat is a live link to its source, so save the source instead. Saving stays a one-shot final step. Built with Claude Code, reviewed by me. #CAD #OpenSource
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** new unit specs failed before the fix; `e2e/user-library.e2e.js` new case 9/9 projects, session run; unit 6197 passed, session run
**To Add:** none

## [2026-10-18T00:30:00Z] — Filed a TODO after a browser agent failed to drive WarpCad

**Post:** A browser agent tried to add ten cubes to WarpCad and added none. It probed navigator.modelContext; WarpCad registers on document.modelContext, and only while the tab is visible. Filed the finding. The WebMCP specs only ever used a fake. Built with Claude Code, reviewed by me. #CAD #WebMCP
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebMCP
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** registers on document.modelContext, navigator fallback → src/ai/webmcp/toolShape.js:108-115; visibility gate → src/composables/useWebMcp.js:49; fake-only specs → TODO/ROADMAP.md ai-021 Runner Log; the agent's probe and the failed task → the report pasted this session
**To Add:** none

## [2026-10-18T03:00:00Z] — WebMCP: WarpCad's side checked on real Chrome, chip now says why

**Post:** Checked WarpCad's WebMCP on real Chrome: getTools() lists all 20 tools. Claude in Chrome never found them because it only probes navigator.modelContext; with that aliased it added ten cubes and one undo removed them. The app now sets the alias. The chip shows a tool count or why there are none. Built with Claude Code, reviewed by me. #CAD #WebMCP
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebMCP
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** alias made the agent succeed, undo removed ten cubes → screenshots pasted this session; 20 tools via getTools() → console screenshot pasted this session; agent probed navigator only → its reply pasted this session; chip label → src/ai/webmcp/status.js
**To Add:** chip screenshot (docs/screenshots/webmcp-chip.png)

## 2026-10-18 — Live MCP access button in the phone header

**Post:** On a phone, WarpCad's Live MCP access switch was only reachable from a panel that doesn't fit at 390 px. It now has its own button in the header. Fitting it meant Firefox's scrollWidth, which counts padding the others ignore. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebMCP
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Firefox overflow 397 vs 390 → e2e/ai-key.e2e.js run this session; panel row laptop-only → src/components/ai/ConnectButton.vue
**To Add:** docs/screenshots/file-menu-phone.png

## 2026-10-18 — A red e2e run traced to drop points, not the app

**Post:** 29 e2e failures after a full run. 21 were one cause: on a phone, once a body exists the Library sheet sits higher, and the specs dropped the second part right onto its handle. Moved the drops up, regenerated four stale Firefox/WebKit baselines. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #Playwright
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 29 failed, 21 phone second-body → playwright report this session; sheet handle y≈367, drop y≈369 → debug spec output this session; four baselines regenerated → git diff
**To Add:** none

## 2026-10-19 — Docs for the phone header's Live MCP button

**Post:** The phone header has a ⇄ button that opens the live MCP access sheet, but no doc said so. The docs now give the phone route (tap ⇄, pick a lease, enable) and say it's absent on a hosted copy. The header still is generated by a Playwright spec, not captured by hand. Built with Claude Code, reviewed by me.
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #Playwright
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** button added in ui-075 → git log 511cf15; still generated by spec → e2e/docs/ai-live-mcp-header.docs.js in diff; guards 4/4 passed → test run this session
**To Add:** the generated still, docs/screenshots/ai-live-mcp-header.png

## 2026-10-19 — Closing the phone Live MCP button after a hand-drive

**Post:** Closed out the phone header's Live MCP button today. Full suite green on Chromium, Firefox and WebKit, then I drove it by hand at 390 and 1440 px with a real mouse and an MCP client stand-in: off refuses writes, on lets an agent add a cube and sphere, the header dot changes state. Not yet tried on a real iPhone. Built with Claude Code, reviewed by me. #CAD #OpenSource
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** full e2e 4152 passed / 0 failed / 1136 skipped, 6262 unit → test runs this session; hand-drive results → drive script output this session; iPhone untested → TODO/VERIFY.md row
**To Add:** none

## 2026-10-20 — Merge ties now go to the person's step

**Post:** When a person's move and an AI fillet land on the same clock tick, which one got flagged as the conflict used to depend on random replica ids. Now the step a person made wins the tie; the rest still fall back to replica order. The rank lives in the position key, so every copy agrees. Built with Claude Code, reviewed by me. #CAD #OpenSource
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** replica ids decided ties → agent probe, reported this session, and TODO/data-014 Problem; rank in the key → positionKey.js `insertTag` in diff
**To Add:** none

## 2026-10-20 — CI off for push; a pre-push hook checks the tests ran

**Post:** Pushing to main no longer starts a GitHub Actions run, because hosted minutes cost money. A pre-push hook now refuses the push unless the unit suite and the full e2e matrix were recorded against the exact commit going out. Failures don't block it, but each has to be named in a commit trailer. Built with Claude Code, reviewed by me. #OpenSource #DevTools
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #OpenSource #DevTools
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** hook, trailer rule, ci.yml triggers → diff; 6312 unit passed, typecheck and guards clean → test runs this session
**To Add:** none

## 2026-10-21 — e2e now runs against the production build

**Post:** WarpCad's browser tests now run against the built app, not the dev server. Doing that surfaced 20 specs importing source files by URL, 12 helpers the production CSP blocks, and a service-worker banner that resized canvases mid-snapshot. 57-spec subset: 23.9s to 9.6s. Built with Claude Code, reviewed by me. #CAD #WebGL
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 20 specs / 12 helpers → diff (grep counts this session); banner resized canvas (53 px height difference) → debug output this session; 23.9s → 9.6s on 57 tests, chromium-laptop → two timed runs this session
**To Add:** none

## 2026-10-20T21:59:09-0500 — fingerprint covers src/ only

**Post:** Our pre-push gate decides whether tests "already passed" by hashing the code. That hash covered lockfiles and specs, so touching a doc made green results look stale. It now hashes src/ only. Built with Claude Code, reviewed by me. #OpenSource #CAD
**Links:** [Repo](https://github.com/WarpCad/warpcad) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #OpenSource #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** hash scope before/after, spec assertions → diff; typecheck and 6314 unit tests green, stamp match 24af4d68… for src/ → test runs and stamp gate this session; pre-push gate exists → git log 54aa578
**To Add:** none

## 2026-10-21T08:24:54-0500 — native mobile shell research, and the App Store licence gap

**Post:** Wrote up how WarpCad could ship as an iOS/Android app. Capacitor 8 wins; the tool surface stays in the page. The finding I didn't expect: AGPL plus DCO sign-offs isn't enough for the App Store, since I can only relicense code I own. So a CLA task is filed before any outside PR lands. Built with Claude Code, reviewed by me.
**Links:** [Repo](https://github.com/WarpCad/warpcad) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #OpenSource #AGPL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** Capacitor 8 recommended, status proposed → docs/decisions/native-mobile-shell.md; DCO grants no relicensing right, one author in git history → TODO/build-016 text and git shortlog (466 commits, John Cole), 2026-10-21
**To Add:** none

## 2026-10-21T09:20:44-0500 — Capacitor vs Tauri 2 for the iOS app

**Post:** Reopened the mobile-shell decision with only two contenders: Capacitor and Tauri 2. Tauri has the better security story (two published audits, default-deny capabilities). Capacitor still wins for iOS: ~1 MB native vs 4.5-7.8 MB, official share plugin, fewer open iOS bugs. Built with Claude Code, reviewed by me. #OpenSource #CAD
**Links:** [Repo](https://github.com/WarpCad/warpcad) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #OpenSource #CAD
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** two audits, default-deny capabilities, ~1 MB vs 4.5-7.8 MB, share plugin, 10 vs 46 open iOS issues → docs/decisions/native-mobile-shell.md Question 7 (figures measured/fetched 2026-10-21 per the record, not re-run at commit time)
**To Add:** none

## 2026-10-21T19:30:00-0500 — Library icon rail and compact viewport chrome (ui-084)

**Post:** At tablet width, WarpCad's Library was still a 200 px column of labelled rows while the toolbar beside it had gone to icons. Now it's a 72 px icon rail: drag to place, tap for sizes. The nav pad and triad shrink too. #CAD #WebGL Built with Claude Code, reviewed by me.
**Links:** [Repo](https://github.com/WarpCad/warpcad) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #WebGL
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 200 px labelled column at tablet before, 72 px rail after → TODO/done/ui-084 text and src/views/AppView.vue diff; toolbar had gone to icons → commit fe01ae5 (ui-079 stages 1-3)
**To Add:** docs/screenshots/library-icon-rail.png, viewport-chrome-compact.png

## 2026-10-21T20:00:00-0500 — Release CI no longer runs Playwright guards

**Post:** Release workflow kept dying on an "e2e" step that CI never needed. It was the Playwright guards project, reading LFS pointer files instead of GIFs. Removed it; the guards stay in the local pre-push hook. Built with Claude Code, reviewed by me. #OpenSource
**Links:** [Repo](https://github.com/WarpCad/warpcad) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** release calls ci.yml → release.yml; lfs: false, pointer files → ci.yml comment; four stale-movie errors → pasted CI log; diff only otherwise
**To Add:** none

## 2026-10-23T17:55:00-0500 — Operations toolbar folds into group launchers at ~720 px

**Post:** At about 720 px wide the Operations toolbar had no room for a button per operation. It now folds into Combine, Arrange and Shape launchers with a count badge on each, and the badge tells you how many of its operations can run before you open it. Built with Claude Code, reviewed by me. #CAD #OpenSource
**Links:** [Repo](https://github.com/WarpCad/warpcad) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** launchers, badge and groups → diff (src/core/operationGroups.js, OperationsToolbar.vue); 720 px → TODO/done/ui-082 text; badge 4 with two bodies selected → hand-driven run this session, WebKit and Chromium
**To Add:** docs/screenshots/operations-groups.png

## 2026-10-25T15:26:34-05:00 — Roadmap split into open and done; iOS app and home page planned

**Post:** WarpCad's roadmap file had grown to 1,477 lines, most of it finished work. It now holds open work only (411 lines); the done milestones moved to their own file. Also planned: the iOS app on Tauri 2 (10 tasks) and a warpcad.com home page. Built with Claude Code, reviewed by me. #OpenSource
**Links:** [Repo](https://github.com/WarpCad/warpcad) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** 1,477 → 411 lines → `git show HEAD:TODO/ROADMAP.md | wc -l` and `wc -l TODO/ROADMAP.md` this session; Tauri 2 → docs/decisions/native-mobile-shell.md owner decision 2026-10-24; 10 M19 tasks, 5 M20 → `grep milestone:` over TODO/ this session
**To Add:** none

## 2026-10-26T02:17:08-05:00 — Align popover: seven positions per axis

**Post:** WarpCad's Align popover made you pick a mode from a dropdown, then decode a button. Now each axis has one row of seven icon buttons, outside − to outside +, with the words in a shared header. Tap one and the body lands there. #CAD #OpenSource Built with Claude Code, reviewed by me.
**Links:** [Repo](https://github.com/WarpCad/warpcad) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** one row of seven icon buttons per axis, shared header → diff (AlignPopover.vue, AlignGrid.vue, AlignPositionIcon.vue); previous dropdown plus two grids → git show 39a5a2d (ui-060, 2026-10-15) and the removed code in this diff
**To Add:** docs/screenshots/align-positions.png

## 2026-10-26T22:00:00-05:00 — Align icons: in vs half now readable

**Post:** The Align popover's "in" and "half" icons were about a pixel apart, so you had to hover to tell them apart. The block is now a quarter of the target's width and a dashed line marks the target's centre. Same button size. #CAD #OpenSource Built with Claude Code, reviewed by me.
**Links:** [Repo](https://github.com/WarpCad/warpcad) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** #CAD #OpenSource
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** block 6 to 4 wide of a 16-wide target, dashed centre line at x=12 → diff (AlignPositionIcon.vue); "a pixel apart" → TODO/ui-088 Problem text; same button size → diff touches no sizing
**To Add:** docs/screenshots/align-positions.png
