# BlueSky Posts

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
**Evidence:** V1 subtracts the two rounded rectangles in 2D specifically to avoid "BSP non-manifold artifacts that occur when subtracting two same-height `Board` solids" → `parts.js`'s own doc comment on `BoardFrame` in `/Users/johncole/src/jscad/jscad-utils` (6.0.0), read directly this session; the port preserves that ordering as records → `src/core/kernel/recipes/kit.boardFrame.js` in the diff, with `kit.boardFrame.spec.js` asserting the extrude's `target` is the subtract's `id`; the 2D layer is new (`profile.roundedRectangle`, `profile.extrudeLinear`) → this diff's `src/core/kernel/registry.js`; full suite green (typecheck, 457 unit tests across 26 files, 571 e2e passed/42 skipped) → this session's `npm run typecheck`/`test:unit`/`test:e2e:headless` runs
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
