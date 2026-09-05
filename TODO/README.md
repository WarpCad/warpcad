# TODO — Roadmap Items and Audit Findings

This directory holds one file per unit of planned work or audit finding. Each file is
self-contained enough to be picked up and implemented independently, later, without
re-reading the whole roadmap or audit.

Implement one with `/fix-todo <id>`.

## Naming convention

```
TODO/<category>-<NNN>-<kebab-title>.md
```

- `category` — one of `build`, `core`, `data`, `render`, `sketch`, `ui`, `io`, `ai`,
  `perf`, `testing`, `docs`
- `NNN` — zero-padded sequence number, unique within the category (`001`, `002`, ...)
- `kebab-title` — short slug of the title

Example: `TODO/core-003-boolean-features.md`

### Categories

| category | covers |
|---|---|
| `build` | scaffold, tooling, typecheck, CI, PWA shell, deployment |
| `core` | document model, feature timeline, evaluation engine, kernel adapter |
| `data` | document schema, persistence, undo/redo, merge and sync semantics — deliberately not named `crdt`, since whether this attempt uses one at all is an open kickoff decision (see `CLAUDE.md`'s Stack table) |
| `render` | 3D viewport, mesh bridge, picking, gizmos, the frame loop |
| `sketch` | 2D sketch model, drawing tools, snapping, dimensions, constraints |
| `ui` | Vue components, views, composables, UI-only stores |
| `io` | import/export formats and storage backends |
| `ai` | design-intent capture, MCP tool surface, BYOK chat |
| `perf` | anything measured against the frame budget (see `.claude/prompts/perf-benchmark.md`) |
| `testing` | coverage gaps, flaky or environment-dependent tests |
| `docs` | README, `docs/`, `CLAUDE.md` |

## Two kinds of file

`kind: feature` — planned work from `TODO/ROADMAP.md`. Written up front, in dependency
order, each one self-contained enough to hand straight to `/fix-todo`. Uses a **Goal**
section instead of **Problem**.

`kind: finding` — something an audit found wrong with code that already exists (see
`.claude/prompts/project-audit.md`). Uses **Problem**.

Both use the same frontmatter and the same remaining sections.

## File template

```markdown
---
title: <Short imperative title, e.g. "Add revolve as a timeline feature">
category: build | core | data | render | sketch | ui | io | ai | perf | testing | docs
kind: feature | finding
priority: high | medium | low
model: sonnet | opus
milestone: M0 | M1 | ... (feature files only)
depends: [core-002, data-001]   # ids that must land first; [] if none
status: open
---

## Goal        <!-- kind: feature -->

What this adds, in user terms first and mechanism second. State what "done" looks
like concretely enough that someone can tell whether they finished.

## Interaction model   <!-- kind: feature, only when this adds/changes a user-visible surface -->

Required whenever the feature adds a tool, control, menu item, panel, or gesture — not
optional, and not satisfied by "register it as a type and let a generic list render
it" (see `CLAUDE.md`'s Interaction Model section for why). State:

- **Precondition** — what must already be true or selected before this is available
  (e.g. "exactly two solids selected" for a boolean; "nothing" for adding a primitive).
- **Trigger** — the specific control: which toolbar button, menu item, keyboard
  shortcut, or gesture invokes it, and where it lives.
- **Feedback** — what changes on screen to confirm it happened.
- **Placement** — for geometry-creation features: placed by dragging into the 3D view
  (preview follows the pointer, commits on release), or does it appear at a fixed
  transform? If fixed, say why (see `CLAUDE.md`'s Interaction Model).
- **Selection response** — for features triggered by selecting an object: what the
  inspector shows (which controls, which dimensions), and whether a transform gizmo
  (move/rotate) attaches to it in the viewport.
- **Selection count** — for multi-operand operations: the exact count required (e.g.
  "exactly 2", "2 or more") and how the control's enabled/disabled state reflects it.
- **Small-screen behavior** — where this control lives, or moves to, at phone width
  (~390px). "Same as desktop" is a valid answer if genuinely true.

If this doesn't apply (a pure `core`/`data`/`io` change with no UI surface), state that
explicitly rather than omitting the section silently. Not every bullet applies to every
feature — a primitive-creation feature has no "Selection count", a pure-selection
feature has no "Placement" — but say "n/a" explicitly rather than dropping the bullet.

## Documentation   <!-- required whenever this file has an Interaction model section -->

Required under the exact same condition as Interaction model above: this task adds,
changes, or fixes a user-visible control. A control that's reachable and tested but
undocumented still fails the user — "I see things appearing, but I don't know what
they do" is a real, reported failure mode from the second attempt's own docs backfill,
not a hypothetical. State:

- **Page** — the `docs/<page>.md` file this task creates or updates. A new page also
  needs a sidebar entry (`.claude/commands/docs.md` Step 4).
- **Example** — at least one concrete, step-by-step usage example a user could follow
  verbatim (e.g. "click the box icon, drag into the viewport, release to place it") —
  not a restatement of the Interaction model's trigger/feedback bullets in different
  words. Name the units/coordinate conventions if the example involves typing a number.
  Screenshots come from Playwright E2E snapshots (`.claude/commands/docs.md` Step 3).

If this doesn't apply (a pure `core`/`data`/`io` change with no UI surface), state that
explicitly rather than omitting the section silently — same rule as Interaction model.

## Problem     <!-- kind: finding -->

What's wrong today. Be concrete: name the file(s), function(s), or pattern.
Explain *why* it's a problem (hard to test, duplicated in N places, breaks at
document scale X, drops a field on round-trip, misses the frame budget) — not
just that it looks messy.

## Affected files

- `path/to/file.js:120-160`      (finding: where the problem lives)
- `path/to/new/module.js`        (feature: files expected to be created)

## Proposed fix

The concrete change to make. Enough detail that someone (or Claude) can
implement it later without re-deriving the reasoning, but do not implement it
here — this is a plan, not a patch.

## Effort

S (< 1hr) | M (a few hours) | L (multi-session / needs design discussion)

## Testing

What test(s) need to be added or updated to cover this change, per the
project's test conventions (Vitest unit next to source, E2E specs in `e2e/`). For
numeric changes, name the tolerance and the degenerate cases the test must cover. For
`perf` findings, name the benchmark and the target number.

**If this task has an Interaction model section above, this section must name a real
`*.e2e.js` spec that navigates to `/` (the running app) and exercises that flow** — not
only a `.spec.js` (component-level) or `.story.e2e.js` (component-workshop-only) test.
This is a per-task gate, not something a later "assemble the app" task inherits by
default. If wiring the capability into a view is genuinely too large to fit in this
task's own Effort estimate, say so explicitly here and name the task that will own it —
don't let it go unstated (that silent gap is exactly what `PREVIOUS-ATTEMPT.md`
documents going wrong for 24 tasks in a row before anyone noticed).

**This section must also name which `TODO/ACCEPTANCE.md` scenarios, if any, this task's
change could plausibly break**, per `CLAUDE.md`'s Verification section — a passing new
spec is not the same claim as "the fixed set of end-to-end use cases still all pass,"
and the second attempt's core failure was trusting the former as if it implied the
latter. Say "none" explicitly if this genuinely doesn't touch any acceptance-scenario
surface (e.g. a docs-only change), rather than omitting the bullet.

**If this task extends a subsystem a previously closed finding was filed against**
(e.g. a new feature kind added to the same evaluation pipeline a past bug was fixed in),
this section must also say which closed finding's original reproduction steps get
re-run against the new code — see `CLAUDE.md`'s Verification section on why a closed
finding is a standing regression surface, not a one-time close.

**If the Interaction model's "Small-screen behavior" bullet isn't "same as desktop",**
this section must also say the e2e spec runs at all three reference viewports
(phone/tablet/laptop — `CLAUDE.md`'s Responsive Layout) with a snapshot at each, not
only the default desktop project.

**If this task's spec touches a WebGL/WASM/canvas/persistence-sensitive path**
(kernel worker results, gizmo drag math, rendered snapshots, IndexedDB) — per
`CLAUDE.md`'s Browser Support section — this section must also say the spec runs
against all three supported browser engines (Chromium/Firefox/WebKit), not Chromium
alone. Say "Chromium only" explicitly when none of that applies, rather than omitting
the point.
```

## Model field

`model` records which model tier `/fix-todo` should use to implement Step 4
(the actual fix). Default to `sonnet`. Mark `opus` when the finding involves:

- **Geometry and numerics** — coordinate transforms, intersection and constraint
  solving, tessellation, tolerance and robustness work. Subtle errors here are easy
  to write and hard to see.
- **Rendering algorithms** — spatial indexing, incremental redraw, anything where the
  correctness argument is about what *doesn't* get redrawn.
- Large multi-module orchestration (`Effort: L`, a piece that integrates several other
  new modules and owns lifecycle/state).
- Real architectural ambiguity — more than one reasonable design, or a cross-layer
  contract with no existing pattern to mirror closely.

Straightforward wiring, rendering glue, or anything closely mirroring an existing,
well-established pattern in the codebase stays `sonnet` even at `Effort: M`.

**This field is one of two now-separate axes.** It only picks *model tier*
(sonnet vs. opus). Whether the task also runs in an *isolated context* is a
different, unconditional choice: every `/run-todos` tick runs its chosen id
inside a fresh isolated `Agent` call regardless of what this field says
(`.claude/commands/run-todos.md` Step 5) — this field only decides which model
that isolated run uses. A user invoking `/fix-todo <id>` directly (not via
`/run-todos`) still uses this field for its older, narrower purpose too:
whether `/fix-todo`'s own Step 4 delegates its RED/GREEN sub-steps to a
same-conversation opus agent (see that step's note on why it skips this when
already running inside a `/run-todos`-spawned agent).

## Rules for files in this directory

- One suggestion per file. Don't bundle unrelated changes.
- A file is a plan, never a patch — no code changes accompany it.
- **`depends` is load-bearing.** `/fix-todo` should refuse to start a feature whose
  dependencies are still `status: open`, or say plainly that it's building on
  something that doesn't exist yet. Order is in `TODO/ROADMAP.md`.
- **A `ui`-touching feature file is not complete on paper unless its Interaction
  model, Documentation, and Testing sections are all filled in** (or explicitly say
  the section doesn't apply / is deferred to a named task). Writing the roadmap up
  front is where this is cheapest to catch — catching it during `/fix-todo` Step 2 is
  the fallback, not the plan.
- If a finding overlaps with an existing project skill (e.g. `/refactor-ui`
  already handles Vue view decomposition), say so in **Proposed fix** instead
  of re-describing the mechanics.
- `status: open` until someone implements it, then flip to `done` and `git mv` the
  file into `TODO/done/` in the commit that resolves it.

## `TODO/ROADMAP.md`

Doesn't exist yet in this project — it's created during kickoff, after the
interaction-model walkthrough described in `CLAUDE.md`, not generated up front from
the feature list alone. See `CLAUDE.md`'s Working Files section. The remaining
**Open** row in `CLAUDE.md`'s Stack table (document/sync model — geometry kernel is
now committed, see `docs/decisions/geometry-kernel.md`) needs its own Library-decisions
pass before the roadmap can state real dependencies for it.

## `TODO/ACCEPTANCE.md` and `TODO/BUDGET.md`

Also created at kickoff, alongside the roadmap — see `CLAUDE.md`'s Verification
section and "Acceptance Scenarios and the token-paced backlog runner" section for what
goes in each. Neither exists yet either.
