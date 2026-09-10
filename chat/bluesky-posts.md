# BlueSky Posts

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
