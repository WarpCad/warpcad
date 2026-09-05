# Next Try — Retrospective on the CAD Attempt

Status: this project is being shelved. This doc captures what happened, why, and what to
change in the prompt/process before starting over. Written 2026-08-30, after 38 commits
and 33 of 44 roadmap tasks landed.

## The original prompt

```
I want a browser based CAD, that uses a CRDT to hold the cad info.  It should use
JavaScript with JSDOC types, VueJS as the UI framework and work as a PWA.  It needs to
have a 2D to 3D drawing capability.  It should allow parametric 3D objects and normal CSG
operations like union, subtraction, and intersection. Include basic geometries, and
operations like rotation and scaling.  Be prepared to add new features like adding
fillets, and chamfers.  Write a step by step list of TODOs that I can run as a prompt to
add each feature.

Ask a lot of questions about features and capabilities.  I'd like to host the PWA with a
free service like github or gitlab pages.  Storage of a project should be considered, and
as well as local storage, using something like github gists would be nice too.

The cad should also expect to have an AI partner when creating things, so storage should
include prompts and instructions in addition to geometries and meshes.

When selecting libraries, make sure there are several options, and get the activity,
stars, number of issues and update history to help select them (in addition to features
and size).
```

**Verdict: not enough for something this complex.** It specifies stack, storage, and a
feature list, but says nothing about how a human actually operates the tool — no
interaction model, no description of what a session at the keyboard looks like. Claude
filled that gap by inventing a UI, and the gap is exactly where it went wrong.

## What worked

- Test harness came together early and stayed real: unit (Vitest, Node), browser mode,
  Storybook, and Playwright e2e were all wired in `build-002` and used consistently after.
- A 3D viewport rendered, with camera navigation, from early in the build.
- Library selection pulled in real options with genuine tradeoffs recorded in
  `docs/decisions/libraries.md` — manifold-3d, yjs, three.js all still look like the
  right calls in isolation.
- The CRDT/timeline/kernel architecture in `CLAUDE.md` is sound on paper: linear feature
  timeline → deferred CSG tree → worker evaluation → mesh bridge is a legitimate design
  and most of it is unit-tested and works *as components*.

## What didn't work

### 1. Library selection was shallow despite the explicit ask

The prompt asked for stars/issues/activity/update-history comparisons across several
options per library. What landed in `docs/decisions/libraries.md` covered features and
size well but the "several options with real health metrics" comparison wasn't rigorous
enough to catch problems before they were load-bearing (see `sketch-006`'s note about the
constraint-solver library being a 98-star single-maintainer LGPL project — that
discovery happened when the roadmap reached it, not during initial selection).

### 2. Components ≠ application — the core failure

Tasks 5-24 (M1 and M2) each built and unit-tested one component or module in isolation —
timeline panel, inspector, sketch tools, boolean features — and every one of them passed
its own tests. **Nothing owned assembling them into the running app.** `EditorView.vue`
sat at its `ui-001` scaffold state — literal `"coming in ui-002"` placeholder text —
through 24 subsequent "done" tasks, including the entire 2D-to-3D sketch pipeline. The
project's own retrospective on this (`TODO/done/ui-004-assemble-the-editor.md`) says it
plainly:

> Make the application actually be the thing the last 24 tasks built... Every one of
> those capabilities already exists, is unit-tested, and is unreachable from the running
> app.

This is the mechanical reason your top complaint is true: **the sketch features are not
imaginary** — `sketch-001` through `sketch-005` are real, tested, and in `TODO/done/`.
They are simply not wired into any screen a user can reach. `ui-004`'s own scope notes
say sketch-mode mounting was *trimmed* with an explicit escape hatch — "if this is more
than small, split it into `ui-005`" — and no `ui-005` was ever written. The gap was
noticed and then re-deferred, silently, past the point anyone was tracking it.

The project also caught its own testing blind spot for this
(`TODO/done/testing-001-e2e-suite-only-tests-storybook.md`): nearly every e2e spec drove
a Storybook story instead of the real app at `/`, so "e2e passed" never meant "reachable
by a user." That fix landed, but only after 25 tasks had shipped on the false signal.

### 3. "Union" as a dropdown item is a direct consequence of #2

`ui-004`'s `AddFeatureMenu` was built generically off `FeatureRegistry.types()` — every
registered feature type in one flat list, with no distinction between *creating geometry*
(box, sphere, sketch) and *operating on existing geometry* (union, subtract, extrude,
pattern). That's a reasonable-sounding implementation shortcut in isolation ("don't
hardcode a list, read the registry") that produces exactly the nonsensical UI you
flagged: a boolean operation has no meaning without two operands already selected, and a
flat alphabetical-ish dropdown can't express that. This needed an actual interaction
design — how do you select the two solids being unioned, what does "the current
result" mean, what happens when there's only one body — and nothing in the prompt or the
roadmap ever specified one. The code did the literal thing that was asked for the wrong
reason: it registered features and listed them.

### 4. The gap-detection pattern repeated instead of being systemic

`ui-004` and `testing-001` are good work — they're honest retrospectives that found real
problems. But they were each treated as a single one-off task that "jumped the queue"
after 24-25 tasks had already shipped past the problem, rather than a standing
per-task acceptance gate. Nothing in the roadmap or `/fix-todo` requires "reachable and
operable from the running app, exercised by a real e2e flow" as a condition of a UI task
being done — it's a component-level unit/story test by default, and the assembly is
implicitly someone else's job later.

### 5. Scheduling the TODO queue was tuned to the wrong resource

The queue was run on a fixed wall-clock loop (every 2 hours) sized for the 5-hour Claude
Code session window. Over two days that consumed roughly half a week's worth of tokens,
because the loop had no concept of the *weekly* budget or of context/token cost per task
— it just kept firing on schedule regardless of how expensive recent runs had been.
`TODO/ROADMAP.md`'s Completion Log shows real variance worth accounting for (`ai-002` at
263k tokens vs. `io-004` at ~5m/unlogged tokens) — a fixed-interval loop can't see that
variance coming.

## Recommendations for the next prompt

**Specify the interaction model, not just the feature list.** For each major capability
(add a primitive, apply a boolean, enter a sketch, add a dimension, apply a fillet),
describe the *user flow*: what's selected before the action is available, what UI element
triggers it, what feedback confirms it happened. This is the single highest-leverage
addition — it would have prevented the AddFeatureMenu-as-flat-registry-dump outcome
directly, because "union needs two selected solid operands, offered as a toolbar button
that's disabled until two bodies are selected" cannot be satisfied by dumping a type name
in a dropdown.

**Make "wire it into the running app" a per-task gate, not a milestone-end cleanup task.**
Every UI-touching TODO should require its own real-app e2e assertion (drives `/`, not a
Storybook story) as part of that task's own Testing section — not deferred to a later
`ui-00N: assemble everything` task. `testing-001`'s naming convention
(`*.e2e.js` vs `*.story.e2e.js`) is a good mechanism; the problem was that it arrived
after the fact instead of being enforced from `ui-001` onward.

**Require a standing "is it actually reachable" self-check.** Something like
`.claude/prompts/project-audit.md` (already present in this repo) run on a cadence, not
just as a manually-invoked prompt — specifically checking that every feature file's
capability is mounted somewhere in the component tree that `EditorView.vue` renders.

**Tighten the library comparison step.** Keep the ask (stars/issues/activity/history) but
make it produce an explicit rejection table with the runner-up options and *why not*, not
just the winner's rationale — and re-run the health check when a deferred library
(anything explicitly pushed to a later milestone, like the constraint solver) is finally
about to be pulled in, since months pass between selection and use.

**Budget the automated TODO runner by tokens, not by time.** Replace the fixed-interval
loop with one that:
- tracks cumulative token spend against a weekly budget the user sets up front,
- stops (or drops to a lower cadence) once a threshold fraction of the weekly budget is
  spent, rather than continuing to fire every N hours regardless,
- clears/compacts context between TODO runs rather than accumulating it — the current
  loop kept context around across invocations, which both costs tokens and drifts from
  `/fix-todo`'s own "treat every invocation as starting cold" instruction,
- uses the per-task token figures already being logged in `TODO/ROADMAP.md`'s Completion
  Log to estimate remaining runway and warn before it's exhausted, instead of discovering
  the overrun after the fact.

**Ask fewer, sharper clarifying questions up front, aimed at the interaction model.**
The original prompt asked Claude to "ask a lot of questions" but didn't get UI/UX
questions back — mostly stack and storage questions, which is where the prompt already
gave clear direction. The next attempt should specifically prompt for a walkthrough-style
Q&A: "describe what happens on screen when a user does X" for each core capability,
before any code is scaffolded.
