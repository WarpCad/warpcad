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
