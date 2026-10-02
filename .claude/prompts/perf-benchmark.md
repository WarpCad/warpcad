# CAD — Interactive Performance Benchmark Prompt

Unlike `project-audit.md`, this is not read-only: it runs the app, drives it, and
writes new benchmark files under `bench/`. It must not touch any source file outside
`bench/`, must not `git commit`, and must not "fix" anything it finds — findings go to
`TODO/` as `perf-*` files.

---

## Prompt

You are measuring the interactive performance of this browser-based CAD application
against the frame budget in `CLAUDE.md`: **16ms per frame** during pan, zoom, and drag.

Read `README.md` and `CLAUDE.md` first. If a `bench/` directory already exists, read
what's there and extend it rather than starting over.

### Hard rules

1. **Measure before you conclude.** Every claim in the report cites a run you actually
   performed, with the machine, browser, build mode, and document size recorded. No
   estimated numbers, no numbers carried from a previous session.
2. **Benchmark the production build** (`npm run build && npm run preview`), not the dev
   server. Dev-mode module graphs and HMR overhead make dev numbers meaningless for
   render performance.
3. **Report the distribution, not the mean.** For frame timing, the number that matters
   is the tail: report p50, p95, p99, and the worst frame. A 60fps average with a 120ms
   hitch is a bad experience that a mean hides completely.
4. **Fix nothing.** This pass produces measurements and `TODO/perf-*` findings.
5. Note that a headless/software-rasterizer run does not predict GPU behavior. Say
   which you used; if headless, say so explicitly in every conclusion it supports.

### What to measure

Build fixture documents at several scales — small, medium, and one deliberately larger
than anything expected in real use — and record the exact generation parameters in
`bench/` so the fixtures are reproducible.

**Interaction latency** (the primary metric):
- Frame time during continuous pan, zoom, and entity drag, at each document scale.
- Input-to-paint latency: pointer event timestamp → the frame that reflects it.
- Time to first interactive frame after opening each fixture document.

**Operation cost** (the things that can blow the budget):
- Tessellation / re-tessellation after a parameter change.
- Boolean and other kernel operations, per operand complexity (whichever geometry
  library `CLAUDE.md`'s Library-decisions process lands on).
- Hit-testing/picking, especially as element count grows — this is where a missing
  spatial index shows up as a superlinear curve.
- Undo and redo of a large operation.
- File import and export, per file size.

**Memory:**
- Heap after opening each fixture, and after 100 undo/redo cycles. A number that keeps
  climbing across identical cycles is a leak, and worth its own finding.
- GC pause frequency during sustained interaction — allocation in the frame path shows
  up here before it shows up anywhere else.

### Method

Use Playwright (or whichever E2E tool `CLAUDE.md`'s Stack table settles on) to drive
the built app, and the browser's own instrumentation for the numbers:
`performance.measure`, `requestAnimationFrame` deltas for frame timing,
`performance.memory` or CDP `Runtime.getHeapUsage` for heap, and the CDP tracing/profile
APIs where a flame graph would identify the hot function.

Warm up before recording (discard the first ~30 frames of any interaction), run each
measurement at least 5 times, and report the spread. A single run is an anecdote.

Where a measurement exceeds the budget, capture a CPU profile of that specific
interaction and name the top self-time function — a finding that says *which function*
is far more useful later than one that says *which interaction was slow*.

### Output

1. `bench/` — the benchmark scripts and fixture generators, runnable again later with
   one documented command. This is the durable half of the work; a number nobody can
   reproduce is worth very little in six months.
2. `bench/results/<ISO-date>.md` — the measurements, with the machine, browser version,
   build, and fixture parameters recorded at the top.
3. One `TODO/perf-<NNN>-*.md` file per finding that exceeds the budget, following
   `TODO/README.md`. Each names the specific function or module and the measured cost,
   and states what would confirm the fix worked (the same benchmark, same fixture, a
   target number).

Reply with a short summary: which interactions are inside budget, which are not, the
worst offender, and the single measurement you'd re-run first after any fix.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
