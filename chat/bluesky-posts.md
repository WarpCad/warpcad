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
