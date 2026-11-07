# WarpCad — Project Instructions

A browser-based parametric CAD application. 2D sketching to 3D solids, CSG modeling,
installable as a PWA, designed to be driven by an AI partner as well as by hand.

> **Status:** shipping. Release history is in `CHANGELOG.md`; open work is in
> `TODO/ROADMAP.md`, finished work in `TODO/ROADMAP-DONE.md`. The `.claude/commands/*`
> workflows read this file as the source of truth, so correct it when reality diverges.

The Interaction Model and Verification sections exist because two earlier attempts were
shelved: the first never assembled its parts into an app a user could reach, and the second
proved its code worked against its own scripted tests without ever checking a human could
operate it. `PREVIOUS-ATTEMPT.md` and `SECOND-ATTEMPT.md` hold the full retrospectives. Read
them when a case isn't covered by a rule's wording.

## Interaction Model

Rules for any user-visible work:

- **Every UI feature's spec states its precondition** (what must already be selected or
  true), its **trigger** (the specific control, menu item, shortcut or gesture, and where it
  lives), and its **feedback** (what confirms it happened on screen).
- **Creation and operation are never the same list.** Actions that create geometry (box,
  sphere, sketch) and actions that operate on existing geometry (union, subtract, extrude,
  fillet, pattern) are never one dropdown built by iterating a feature registry. An operation
  control is disabled or hidden until its operands are selected. If the registry is used at
  all, it must encode operand requirements the UI can act on.
- **A control is not done until it is reachable.** It must be mounted where the app's root
  view renders and exercised by a `*.e2e.js` spec that navigates to `/`. Component-level
  `.spec.js` and `*.story.e2e.js` Storybook-only specs don't count. Reachable-and-tested is
  the floor, not the finish line; see Verification.
- **Reachability is audited on a standing cadence**, not only when someone asks:
  `.claude/prompts/project-audit.md` section 4.
- **A user-visible control is not done until it has end-user documentation** in `docs/`,
  with a concrete step-by-step example rather than a restatement of the trigger. Audited by
  the same prompt, section 7.

How this app's operations work. Every feature spec must be consistent with these:

- **Geometry is placed in the 3D view, not spawned at a fixed transform.** "Add cube" arms
  a placement mode, a preview follows the pointer (mouse or touch drag), and the object
  commits on release. A control that inserts geometry at the origin and leaves the user to
  move it fails this rule.
- **Selection drives the inspector.** Selecting an object in the viewport shows its controls
  and dimensions in the inspector, not just a highlight outline.
- **Selected objects move and rotate from the viewport** through a transform gizmo. Gizmo
  drags and numeric-field edits drive the same underlying transform and stay in sync.
- **Tool enablement is gated on selection count.** A single-object tool stays disabled
  unless exactly one applicable object is selected. A multi-object tool (boolean, pattern,
  align) stays disabled until the operands it needs (two, or two or more) are selected. This
  applies to non-boolean tools too.
- **The viewport has its own navigation chrome**: pan, zoom and orbit reachable without a
  keyboard, and an orientation gizmo (view cube or axis triad) that shows the current camera
  orientation and snaps to a standard view when clicked or tapped. Keyboard and mouse alone
  fail this rule, because touch devices have no keyboard.
- **The grid shows major and minor lines and its dimensions**: minor lines at the base
  spacing, major lines at a multiple of it, plus labeling (ruler, scale readout or on-hover
  dimension) so a user can read real size off the grid.

## Verification

- **`TODO/ACCEPTANCE.md` holds a small, fixed set of named end-to-end use cases** (5–10),
  written before feature work and driven by the AI, not scripted. Examples of the shape:
  "place a box and a sphere, confirm both remain visible"; "union two solids and confirm the
  result"; "navigate the viewport using touch-only input."
- **Driven means launching the app and interacting with it like an exploring human**, using
  the `run` skill. A pre-written Playwright click sequence only proves its author's sequence
  still works. It won't catch a control whose enabled state depends on a selection the
  author didn't anticipate, or a drag at a different angle, or a tap before an async step
  settles.
- **Every `/fix-todo` run re-drives the acceptance scenarios that touch the subsystem it
  changed** and reports PASS/FAIL per `.claude/commands/fix-todo.md`. A regression there
  outranks that task's own green tests.
- **A closed finding's subsystem stays a regression surface.** When a new task extends a
  subsystem a past finding was filed against, that task's Testing section re-runs the
  finding's original reproduction steps against the new code, not just its own new spec.
- **A human drives the running app for five free-form minutes at the end of every
  milestone**, at the reference phone, tablet and laptop viewports, with no script.
  `/run-todos` pauses to ask for this when a milestone's last task completes; see
  `.claude/commands/run-todos.md`.
- **`TODO/VERIFY.md` stays short.** It logs only one-off judgment calls and device quirks
  that no acceptance scenario covers. Anything that duplicates a standing ACCEPTANCE check
  belongs there instead.

## Responsive Layout

Three target form factors, all real from the start. Phone is designed first, not shrunk down
from desktop.

| Class | Reference viewport | Notes |
|---|---|---|
| Phone | 390×844 (iPhone) | Narrowest target. Panels and toolbars collapse or reflow. Never horizontal scrolling of primary UI. |
| Tablet | 820×1180 (iPad) | Room for a persistent side panel; still touch-primary. |
| Laptop/desktop | 1440×900+ | Persistent panels; mouse and keyboard primary. |

- **Tap targets stay at tap size.** A toolbar that fits only by shrinking icons, or a panel
  that works only on hover, fails the rule.
- **The AI chat panel overlays the viewport at phone and tablet widths** (translucent,
  collapsible, or a dismissible bottom sheet), so the 3D or 2D view stays visible. A
  side-by-side split is fine at laptop width only.
- **Layout, panel and overlay E2E specs run at all three viewport projects** with a snapshot
  at each. See `.claude/commands/test.md`.
- **Real phone and tablet hardware gets hand-tested while the app is being built**, not only
  at milestone boundaries. A device-only failure is a live signal, not background noise.

## Browser Support

Three target rendering engines. WebGL diverges across engines more than DOM or CSS does, so
"it works in Chrome" is not evidence it works everywhere.

| Engine | Playwright project | Stands in for |
|---|---|---|
| Chromium | `chromium` | Chrome, Edge, other Chromium browsers |
| Firefox | `firefox` | Firefox |
| WebKit | `webkit` | Safari, desktop and iOS |

- **Engine is a second axis, orthogonal to viewport.** All-Chromium coverage across the three
  viewports does not mean "verified on every supported browser."
- **Cross-engine coverage lands in the milestone that introduces the risk.** Any milestone
  touching WebGL, canvas, touch input or persistence states in its Testing section which
  engines matter and schedules that coverage inside the milestone. It is not deferred to a
  later catch-all. Both earlier attempts shipped Safari- and iPad-only bugs that were found by
  hand after the fact.
- **Not every spec needs the full 3×3 matrix.** A spec with no WebGL, WASM, canvas, touch or
  persistence involvement (plain form validation, say) can stay Chromium-only across
  viewports. Anything touching the viewport, kernel or persistence defaults to all three
  engines, and its Testing section says so.
- **Graduate hand-verified items into real specs.** A `TODO/VERIFY.md` entry that has been
  hand-checked more than once, or that exercises a WebGL, WASM, canvas or IndexedDB path,
  becomes a `*.e2e.js` spec across all three engines.

## Stack

The Stack table is the decision summary. Version pins live in `package.json`, and the
reasoning lives in the linked `docs/decisions/` record. Don't copy versions into this file.

| Concern | Choice | Record |
|---|---|---|
| UI framework | Vue 3 + Vite | Committed |
| UI-only state | Pinia | In use |
| Unit tests | Vitest | Committed |
| E2E tests | Playwright | In use |
| Component workshop | Storybook | In use |
| Rendering | three.js | `docs/decisions/rendering.md` |
| Geometry kernel | `@jscad/modeling` (JSCAD V3) | `docs/decisions/geometry-kernel.md` |
| Document model and sync | NDJSON project file with a hand-rolled, state-based merge. **No CRDT library.** | `docs/decisions/document-sync.md` |
| LLM client | Raw `fetch` to the Messages API behind a provider interface. No SDK. | `docs/decisions/ai-partner.md` |
| MCP SDK | `@modelcontextprotocol/server`, in its own `mcp/package.json` | `docs/decisions/ai-partner.md` |
| Error reporting | `@sentry/vue`, inert without `VITE_SENTRY_DSN` | `docs/decisions/error-reporting.md` |
| PWA | vite-plugin-pwa | `docs/decisions/hosting.md` |
| Hosting | GitHub Pages, static, served path from `BASE_PATH` | `docs/decisions/hosting.md` |
| Home page (`warpcad.com`) | VitePress 1.6.x, in `~/src/@WarpCad/warpcad.github.io` | `docs/decisions/home-page.md` |
| Native shell | Tauri 2, in the sibling repo `~/src/@WarpCad/warpcad-native`. Native TODOs live there once scaffolded. | `docs/decisions/native-mobile-shell.md`, milestone M19 |

## Architecture

Settled structure, not a kickoff question:

- **A linear feature timeline.** An ordered history where each feature consumes the previous
  result, Fusion or SolidWorks style. Geometry is always derived from the timeline and always
  disposable. Never persist a mesh as document state.
- **Kernel work runs off the main thread**, in a Web Worker. The main thread never blocks on
  geometry evaluation.
- **No client-side router and no history-API routes.** The app is one screen. Shareable
  references (a gist ID, a project reference) go in the URL hash (`#/gist/<id>`). GitHub Pages
  has no rewrite rule, so a path-based deep link would 404 on refresh.
- **Undo and redo are scoped by transaction origin.** Remote and programmatic edits never
  enter the local user's undo stack.

## Project Structure

- `src/core/` — document model, feature timeline, evaluation engine, kernel adapter.
  **Framework-free**: no Vue, no DOM, no three.js imports. Testable in plain Node.
- `src/core/kernel/` — the geometry kernel adapter and its worker RPC. Everything else in
  `core/` talks to the kernel only through this interface.
- `src/sketch/` — 2D sketch model, snapping, dimensions, profile detection.
- `src/render/` — 3D scene, camera, picking, gizmos, the mesh bridge.
- `src/storage/` — persistence and sync backends (IndexedDB, File System Access, and the
  hosted git-based backend once built).
- `src/native/` — what the app knows about the native shell it runs in (`isNativeShell`,
  `invoke` over the Tauri bridge). Framework-free. The shell itself is the sibling repository
  `warpcad-native` (`docs/decisions/native-mobile-shell.md`).
- `src/ai/` — design-intent capture, the tool registry (`src/ai/tools/`), and the BYOK chat
  client.
- `src/components/<category>/` — Vue components, by category (see Component Categories).
- `src/views/` — top-level screens. Thin composition only.
- `src/composables/` — reusable stateful logic.
- `src/stores/` — UI state only: selection, active tool, panel layout. Document state never
  mirrors into a store.
- `e2e/` — Playwright specs. `*.e2e.js` drives the real app at `/`. `*.story.e2e.js` drives a
  Storybook iframe to prove a component in isolation, and does not count as a user-facing
  capability. `e2e/naming.spec.js` guards the distinction.
- `mcp/` — the MCP server (Node, runs outside the browser).
- `docs/` — end-user documentation. Rendered into the in-app Help by `scripts/help-build.mjs`
  and published at `app.warpcad.com/help/`. `docs/help-slugs.json` keeps retired slugs
  working. See `docs/decisions/documentation.md`.

## Component Categories

All under `src/components/`:

`viewport/` — drawing surface, camera/navigation controls, orientation gizmo,
transform (move/rotate) gizmos, grid (major/minor lines + dimensions), axes, on-canvas
overlays
`timeline/` — the feature history list, rollback, suppress, reorder
`features/` — per-feature-type parameter editors
`sketch/` — 2D sketch tools, dimensions, constraint UI
`inspector/` — property panels, unit-aware numeric entry
`storage/` — project browser, save/open, remote-backend connection UI
`ai/` — chat panel, intent capture, agent activity
`layout/` — wrappers, panels, splitters, toolbars
`controls/` — generic reusable inputs
`display/` — read-only badges, counters, status indicators

## Conventions

- **Tests**: `.spec.js` next to source (unit). `.e2e.js` and `.story.e2e.js` in `e2e/` (E2E).
- **Test runs load the progress reporters** (`scripts/test-progress/`). Never pass a bare
  `--reporter=…` to `vitest` or `playwright test`, since it replaces the configured list.
  Exact spellings are in `.claude/commands/test.md`.
- **Pushing is gated locally.** `.githooks/pre-push` (installed by `npm install`) refuses a
  push to `main` unless a full unit run and a full E2E run were stored for that commit. Failing
  tests don't block a push, but each must be named in a `Known-failures:` trailer
  (`node scripts/todo-progress.mjs stamp attest` prints them). See `CONTRIBUTING.md`, "Pushing".
- **Types**: every exported function has a JSDoc signature. `npm run typecheck` is a CI gate.
- **Mock at the boundary**: the kernel worker, WebGL contexts, the File System Access API,
  `fetch` to any hosted backend, `requestAnimationFrame`. A unit test never needs a real GPU or
  network.
- **Geometry logic lives in `src/core/`**, not in components. A component doing coordinate
  math beyond laying out its own pixels is a bug.
- **Numerical code gets numerical tests**: explicit tolerances (`toBeCloseTo`), and degenerate
  cases covered (zero-length segments, coincident points, parallel directions, empty profiles,
  self-intersection, non-manifold results).
- **Units and spaces are explicit.** Documents are millimetres, doubles, Z-up. Name every
  conversion at its boundary (`worldToScreen`, `mmToPx`). A raw number never crosses a module
  edge without its space obvious from the name.
- **Every document mutation goes through the command layer**, inside a transaction with an
  origin. A component never mutates document state directly, because that breaks undo.
- **Views stay thin.** Extract any panel over about 30 template lines into
  `src/components/<category>/`.
- **UI is dark-first**, light via `prefers-color-scheme`. Colors are CSS custom properties,
  never hardcoded.
- **Interactive elements carry `data-testid`.**
- **A UI-touching task's spec** names its E2E spec (app-level `*.e2e.js`), its Responsive and
  Browser Support coverage, its `docs/` page and `e2e/docs/` media, and the `TODO/ACCEPTANCE.md`
  scenarios it re-drives, plus any closed finding it re-runs. See `TODO/README.md`.
- **Pictures in `docs/` are generated, never captured by hand.** `npm run docs:media` produces
  them. `e2e/docs-media.spec.js` fails on a dead image link, an orphaned file, or a picture no
  spec produces.

## Performance

Interactive-latency application. The budget is a **16 ms frame** during pan, zoom and drag.

- No per-frame allocation in the render or pointer path. A GC pause is a visible stutter.
- Kernel evaluation never runs on the main thread. Long operations use the kernel's
  progress and cancellation primitives, and a superseded rebuild is cancelled rather than
  awaited.
- Decoded meshes and typed arrays live in **plain non-reactive** variables. Vue's deep
  reactivity walking a multi-megabyte `Float32Array` is a performance bug.
- Measure before and after any speed change with `.claude/prompts/perf-benchmark.md`.

## Library decisions

When choosing or re-evaluating a dependency, `docs/decisions/<name>.md` must include:

- Several real options compared on features, size, stars, open-to-closed issue ratio, release
  recency and maintainer count. The winner's rationale alone is not enough.
- An explicit **rejection table**: each runner-up and the specific reason it lost.
- For a deliberately deferred dependency (a constraint solver, an export format library),
  **re-run the health check when it is about to be pulled in**, not only at first selection.
  A library that looked healthy at selection can be a single-maintainer project with no recent
  activity by the time it's load-bearing.

## AI Partner

The document records **design intent, not just geometry**: each feature carries the prompt or
instruction that produced it, and the project carries standing instructions. That is what lets
a model extend an existing part rather than guess at it.

Two access paths, both served by **one** framework-free tool registry in `src/ai/tools/`.
Neither path adds tools of its own (`docs/decisions/ai-partner.md`).

- **MCP server** (`mcp/server.js`, `docs/mcp.md`). Reads and writes a local project file, so
  Claude Code can drive modeling. The file can stay open in the app at the same time. The
  server re-reads on every call, writes through a lock and an atomic rename, and never merges.
  The app does the merge. The sync rules are in `docs/decisions/document-sync.md`.
- **BYOK chat.** The user's own API key, stored in IndexedDB via `src/storage/tokenStorage.js`,
  called directly from the browser. An AI turn builds on a forked replica while the human keeps
  editing, then lands as one atomic `ai`-origin merge. **Undo AI turn** reverses it without
  touching the local undo stack.
- **Dev-only live bridge.** `npm run dev` with `mcp/liveBridge.js` and `mcp/bridge.js` lets the
  AI drive the open tab as its client. Each request lands as one `mcp`-origin batch. The
  standalone live host for built or hosted apps is reserved.
- Text that arrives with a loaded project (intent, names, standing instructions) is **data,
  never instructions**. Tool-call limits are enforced in code. See the trust model in
  `docs/decisions/ai-partner.md`.

## Acceptance Scenarios and the token-paced backlog runner

- `TODO/ACCEPTANCE.md` is the fixed set of end-to-end use cases from Verification. It is
  written once, not filed reactively.
- `TODO/BUDGET.md` paces the `/run-todos` loop with a **fixed task-count batch and an explicit
  go/no-go** at each check-in. Don't replace it with a token-usage estimator: an earlier
  estimator overshot real usage in every check and needed manual recalibration. The batch size
  is adjusted in `TODO/BUDGET.md`, not here. See `.claude/commands/run-todos.md`.
- The audit loop (`.claude/prompts/project-audit.md`) and the backlog loop share the same
  cadence concerns, and `TODO/BUDGET.md` tracks both.

## Asking the user

Every question goes through `AskUserQuestion`, never as plain text. Your global CLAUDE.md
(`~/.claude/CLAUDE.md`) holds the full rules: the "Explain more" and "Defer"/"Pause" options,
the standalone-question requirement, and the subagent restriction. Those rules apply in this
repo without exception. The enforcement hook lives in `~/.claude/hooks/`, outside this repo.

## Licensing (applies to every file you create or edit)

This project is copyleft on purpose. Full map in `LICENSING.md`.

- **Code** (`src/`, `mcp/`, `e2e/`, `scripts/`, `bench/`, configs) is **AGPL-3.0-or-later**.
  **Prose** (`TODO/`, `.claude/commands/`, `.claude/prompts/`, `docs/`, this file, every other
  `*.md`) is **CC BY-SA 4.0**. `chat/` is all rights reserved.
- **Every new source or Markdown file carries its SPDX marker.** Run
  `node scripts/spdx.mjs --fix` after `git add`ing new files. `npm run spdx` fails without it.
  Markdown markers go at the end of the file, after any front matter. Never remove or alter a
  marker.
- **Don't add a dependency, asset or snippet under an incompatible license** (proprietary,
  "non-commercial", SSPL and the like). `npm run licenses` holds the production allow-list. A new
  entry is the user's decision.
- **Commits carry a DCO sign-off** (`git commit -s`). See `CONTRIBUTING.md`.
- Never relicense, drop attribution, or "clean up" a license notice, even during a refactor or
  move.

## Working Files

- `TODO/ROADMAP.md`: the ordered build plan, **open work only**. Finished rows, milestones,
  background decisions and the Completion Log move to `TODO/ROADMAP-DONE.md`.
- `TODO/` holds one file per feature or finding while open, named with its milestone prefix.
  Closed items move to `TODO/done/`. Naming and status rules are in `TODO/README.md`. Run one
  with `/fix-todo <id>`, or run the backlog with `/loop /run-todos`.
- `TODO/ACCEPTANCE.md`: the named end-to-end use cases the AI drives and reports PASS/FAIL on.
- `TODO/BUDGET.md`: the `/run-todos` batch size, check-in cadence and append-only Runner Log.
- `TODO/VERIFY.md`: a short manual-verification queue. Appended by `/fix-todo` only for one-off
  items not covered by ACCEPTANCE.
- `TROUBLESHOOTING.md`: non-obvious root causes. Read before debugging, and append via
  `/troubleshoot`.
- `docs/decisions/`: library and architecture decisions, with the data behind them.
- `chat/`: drafted social posts, appended by `/commit`.
- `CHANGELOG.md`: release history.
- `PREVIOUS-ATTEMPT.md` and `SECOND-ATTEMPT.md`: the two shelved-attempt retrospectives. See
  the note at the top of this file.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
