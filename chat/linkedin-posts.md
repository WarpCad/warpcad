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
