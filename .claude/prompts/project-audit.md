# CAD — Full-Project Audit Prompt

It is a read-only audit: it must not edit, refactor, or "fix" any source file. Its
only writable output is new files under `TODO/`.

**This audit is necessary but not sufficient — see `CLAUDE.md`'s Verification
section.** Sections 4 and 7 below check that a capability is mounted, tested by a
real e2e spec, and documented. That's the bar the second attempt's own process met in
full, and it still shipped bugs a human found in the first few minutes of actually
using the app, because a mounted-and-passing-and-documented control can still not
work the way a human expects. This audit does not replace driving
`TODO/ACCEPTANCE.md`'s scenarios (`.claude/commands/fix-todo.md` Step 6) — it catches
a different, earlier class of gap (never wired up, never tested, never documented),
which is real and worth catching on its own standing cadence, just not the whole job.

**Run this on a standing cadence, not only when manually invoked.** Once the app has a
real root view, set up a recurring run (a `/loop` interval, or a scheduled routine via
the `schedule` skill) that includes sections 4 and 7 below every time — the first
attempt at this project went 24 UI tasks deep before anyone checked whether the
features it built were actually mounted anywhere the app rendered, and the second
attempt separately shipped ~20 UI-touching tasks with zero end-user documentation
before a live user pointed out "I see things appearing, but I don't know what they
do." A periodic audit is what catches both kinds of drift while they're still one or
two tasks, not twenty-four.

If `/run-todos` (`.claude/commands/run-todos.md`) is also running against the same
backlog, have this loop draw against the same `TODO/BUDGET.md` batch cadence rather
than an independent schedule — audit passes and backlog-fix tasks compete for the same
attention and check-in cycle, and two loops each unaware of the other can jointly
overrun what a human can actually review.

---

## Prompt

You are doing a senior-engineer code audit of this project — a browser-based CAD
application (2D sketching and 3D modeling) running entirely client-side, built with
Vue 3 + Vite, with a framework-free geometry kernel in `src/core/` and canvas/WebGL
rendering in `src/render/`. Which specific geometry-kernel and rendering libraries sit
underneath those two directories may still be an open decision this early in the
project (see `CLAUDE.md`'s Stack table) — audit against the architectural boundary
(framework-free core, worker-isolated kernel), not against any specific library name.

Read `README.md`, `CLAUDE.md`, and `TROUBLESHOOTING.md` first, so your suggestions
respect decisions that were already made deliberately. Don't recommend reinventing
something that already exists — if an existing mechanism is incomplete or has a gap,
say what the gap is.

Do not write or edit any file outside `TODO/`. Do not run the app, run tests, or
install anything — this is a static read-through.

### 1. Geometry kernel audit (`src/core/`)

This is the layer where a subtle bug is most expensive and least visible. Flag:

- **Framework leakage** — any Vue import, DOM access, or reactivity dependency in
  `src/core/`. The kernel must be testable in plain Node.
- **Unstated tolerances** — floating-point comparisons against a bare `=== 0` or a
  magic epsilon defined locally instead of a shared, documented one. Note where two
  modules use *different* epsilons for the same kind of comparison.
- **Degenerate cases with no guard and no test** — zero-length segments, coincident
  or near-coincident points, parallel/antiparallel directions, zero-area faces,
  self-intersecting profiles, non-manifold results.
- **Ambiguous coordinate spaces or units** — a function taking or returning a number
  whose space (world/screen/model/device px) or unit (mm/in/px) isn't obvious from
  the name or documented at the boundary. Name the specific function.
- **Mutation of shared geometry** — an operation that mutates an input in place where
  callers assume a value type, especially anywhere the result feeds undo/history.
- Duplicated math that should be one shared helper (vector ops, transforms,
  bounding-box computation, intersection routines re-derived per call site).
- **Direct imports of the underlying geometry library outside `src/core/kernel/`** —
  per `CLAUDE.md`'s Project Structure, everything else in `core/` should talk to the
  kernel only through the adapter interface. A direct import elsewhere defeats the
  point of that indirection (the kernel being swappable if a later health check finds
  a problem with it).

### 2. Rendering audit (`src/render/`)

Flag, with the 16ms frame budget from `CLAUDE.md` as the bar:

- Per-frame allocation in the draw or pointer path (new arrays/objects/vectors per
  frame or per pointer event) — this is the most common cause of visible stutter.
- Full-scene redraws where an incremental or dirty-region redraw is possible.
- Missing or inconsistent device-pixel-ratio handling — the classic source of blurry
  canvas output and of hit-testing that's off by a factor on retina displays.
- Hit-testing/picking that walks all geometry linearly with no spatial index, and the
  scale at which that becomes a problem.
- Resource lifecycle: WebGL buffers, textures, or contexts created without a matching
  release path, especially on document close or hot-reload.
- Anything on the main thread that plausibly exceeds the frame budget on a large
  document (tessellation, boolean ops, file parsing) and isn't already async.
- **No light sources, or a scene that only looks correct under one specific lighting
  assumption** — a rendered-but-invisible or near-black scene is a real regression
  class both previous attempts shipped; it passes a "does it render" check trivially
  while failing every actual user.

### 3. UI audit (`src/components/`, `src/views/`, `src/composables/`, `src/stores/`)

Flag:

- Views with business logic (tool state machines, pointer sequencing, document
  reconciliation) that belongs in a composable or in `src/core/` instead — but don't
  redesign the component tree yourself; that's what the `/refactor-ui` skill does.
  Just name the view, the logic, and why it should move.
- **Geometry math inside components** — the highest-value UI finding, because it makes
  the math untestable without mounting a component.
- **Document mutations that bypass the command/history layer**, breaking undo. Name the
  component and the mutation.
- Repeated markup/CSS patterns not pulled into a shared component, especially anything
  hardcoding colors instead of using CSS custom properties (blocks theming).
- Components or composables with no `.spec.js` — and, more importantly, components
  whose structure makes them *hard* to test (deeply nested state, direct DOM/canvas
  access, no seam for mocking the rendering context).
- Inconsistent state ownership: some views reading the document directly, others going
  through a store, for the same kind of data.
- Keyboard/pointer handling registered globally without cleanup, or two handlers that
  can both claim the same gesture.
- A control (menu, dropdown, toolbar) built generically off a registry or type list
  with no distinction between geometry-creation actions and operations on existing
  geometry. This is a specific, high-value pattern to look for: an operation like a
  boolean or fillet has operand preconditions a flat list can't express.
- **Geometry creation that skips 3D-view placement** — a control that inserts an object
  at a fixed transform instead of a drag-to-place interaction (preview follows the
  pointer, commits on release) in the viewport. Name the control.
- **A control that "does nothing" visibly beyond its own enabled/disabled state** — a
  button that toggles correctly but produces no further on-screen feedback when
  pressed. The second attempt's own stop note names this exact failure ("clicking
  buttons obviously enables them but nothing else seems to happen") — an
  enabled/disabled toggle alone is not the feedback the Interaction Model's
  precondition/trigger/feedback contract requires.
- **Selection with no controls/dimensions feedback** — selecting an object that doesn't
  populate an inspector, or a selected object with no transform (move/rotate) gizmo
  reachable in the viewport.
- **Tools not gated by selection count** — a single-object tool enabled with zero or
  more than one object selected, or a multi-object tool (boolean, pattern, align)
  enabled with fewer objects selected than it needs.
- **Viewport missing navigation chrome** — no on-screen orbit/pan/zoom controls (a
  touch device has no keyboard fallback), or no orientation gizmo (view cube/axis
  triad) showing and letting the user snap camera orientation. Specifically check that
  pan and zoom are independently reachable from orbit — the second attempt's viewport
  navigation regression was that *every* drag rotated the grid, with no way to pan.
- **Grid missing major/minor distinction or dimensions** — a grid rendered as a single
  uniform line weight with no readable scale/dimension.
- **Desktop-only layout assumptions** — panels or toolbars that would overflow or
  become untappable at phone width (~390px), or an AI chat panel that fully occludes
  the viewport on small screens instead of overlaying it (see `CLAUDE.md`'s Responsive
  Layout section).

### 4. Reachability audit (cross-cutting — run this section every time, not just once)

This is the check the first attempt at this project skipped for 24 tasks in a row (see
`PREVIOUS-ATTEMPT.md`). For every feature-type, tool, or capability defined in
`src/core/`, `src/sketch/`, or a feature/tool registry:

- Is it mounted somewhere in the component tree the app's root view actually renders?
  Trace from the root view down — don't infer reachability from the existence of a
  component file or a registry entry.
- Is there a real `*.e2e.js` spec (navigating to `/`, not a component-workshop iframe)
  that exercises it? A `.story.e2e.js` spec proves the component in isolation; it does
  not prove this.
- If a capability is real, tested, and unreachable, that is a **highest-priority**
  finding — flag it above stylistic or minor findings elsewhere in this audit, and
  name exactly which task would need to wire it in.

### 5. File I/O and persistence (`src/io/`, workers, storage)

Flag:

- Parsers that trust their input — a malformed or truncated file should surface a
  clear error, not a half-loaded document or a silent `NaN` propagating into geometry.
- **Round-trip gaps**: data the importer reads that the exporter drops, or vice versa.
  Name the field and the format.
- Format-version handling: what happens when a document saved by an older build is
  opened by a newer one, and whether there's any version marker at all.
- Unbounded memory on import (whole-file reads of arbitrarily large models) with no
  streaming or size guard.
- Autosave/recovery: whether unsaved work survives a tab crash or reload, and if the
  answer is "no", whether that's a deliberate decision or just absent.

### 6. Testing audit

Flag:

- Modules in `src/core/` with no `.spec.js` — kernel code is cheap to test and
  expensive to get wrong; this is the first place coverage should exist.
- Numeric tests asserting bare float equality instead of an explicit tolerance.
- Tests that only cover the happy path for an operation whose degenerate cases were
  flagged in section 1.
- Tests that need a real canvas/WebGL context, a real worker, or a real file, where a
  boundary mock would do — these are the slow, flaky ones.
- Visual snapshot tests with no documented environment (DPR, headless mode), which
  will drift between machines and get "fixed" by loosening the threshold.
- E2E specs named `*.e2e.js` that actually navigate to a component-workshop iframe
  instead of `/` — the naming lie that section 4 depends on not existing.
  `e2e/naming.spec.js` should already guard this; flag it if that guard is missing or
  has gaps.
- E2E specs covering layout, panel visibility, or overlay behavior with no viewport-size
  coverage — only the default desktop project, no phone/tablet snapshots (see
  `CLAUDE.md`'s Responsive Layout section for the three reference viewports).
- **A capability whose only verification is an automated spec, with nothing in
  `TODO/ACCEPTANCE.md` that would plausibly catch a regression in it** — not every
  capability needs its own acceptance scenario (that list is meant to stay small), but
  a core, first-five-minutes capability with zero standing exploratory coverage is
  worth flagging, per `CLAUDE.md`'s Verification section.

### 7. Documentation audit (cross-cutting — run this section every time, not just once)

The documentation equivalent of section 4: for every control, tool, or panel that
section 4 confirms is reachable —

- Is there a `docs/<page>.md` page (findable from the docs site's own navigation, not
  just present as an orphaned file) that tells an end user how to use it, in user terms
  ("how to do X"), not developer terms ("how it works")?
- Does that page include at least one concrete, step-by-step usage example — not just
  a restatement of the control's name or a screenshot with no accompanying steps?
- If the control involves typing a number, does the page state the units/coordinate
  convention, per `.claude/commands/docs.md`'s documentation rules?
- If a capability is reachable, tested, *and* documented, but the site navigation
  doesn't link to its page, that's still a finding — a page nobody can navigate to is
  barely better than no page (`.claude/commands/docs.md` Step 4).
- If the end-user documentation site doesn't exist at all yet, file (or point to) a
  single `build`-category finding for scaffolding it rather than one finding per
  missing page — the missing site is the actual blocker, not each individual page.

File gaps as `category: docs` findings. Treat a reachable-but-undocumented control as
comparably high-priority to a reachable-but-untested one from section 6 — both are
"looks done, isn't" failures, just discovered by a different audience.

### Output format

For every concrete finding, create one new file in `TODO/` following the template and
naming convention in `TODO/README.md` (create `TODO/` and its `README.md` first if they
don't already exist — check before overwriting). Do not create a finding for something
that's already handled elsewhere (e.g. don't flag "no `/refactor-ui` skill" — it
exists). Skip vague or stylistic-only nits; every file must name specific
files/functions and explain a concrete failure mode or cost, not just "this could be
cleaner."

When finished, do not modify any file outside `TODO/`. Reply with a short summary: how
many findings per category, and which one you consider highest priority — a reachability
finding (section 4) outranks a stylistic one even if there are more of the latter.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
