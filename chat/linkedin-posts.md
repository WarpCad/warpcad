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
