# `bench/` — reproducible performance measurements

Written for `TODO/perf-001` and meant to be re-run, not read once. Everything here
follows `.claude/prompts/perf-benchmark.md`: fixtures are generated from parameters
recorded in code (there are no binary fixture files to go stale), every run reports a
distribution rather than a mean, and results live in `bench/results/<ISO-date>-<id>.md`
with the machine, engine and build mode at the top.

## What is here

| file | what it measures | how to run |
|---|---|---|
| `fixtures/export-scenes.js` | the scenes themselves, built through the real `evaluate()` | imported by the others |
| `export-benchmark.mjs` | the **work**: repair, STL/OBJ/glTF serialization, and the structured-clone cost of a worker boundary, in Node | `node bench/export-benchmark.mjs` |
| `export-mainthread.mjs` | the **freeze**: the worst animation-frame gap during a real export, driven through the real UI in Chromium, with CPU throttling | `node bench/export-mainthread.mjs` (needs a server — see below) |
| `fold-benchmark.mjs` | where the main thread's **kernel** time goes per mutation (drag-place, boolean, move, Undo, row edit): the fold, the store's per-body summary, what the evaluation worker takes over, and transport — plus each op's cost alone (`TODO/core-029`), and how a root edit and a cold Open scale with one lineage's length (`TODO/core-032`) | `node bench/fold-benchmark.mjs --runs 11` |
| `evaluation-mainthread.mjs` | the **freeze** per mutation: worst animation-frame gap for a real drag-place, Undo, Union and Inspector edit, History row select/action (`TODO/core-031`), and **Open itself** with its trigger→first-feedback time (`TODO/core-032`; `--only open` for Open alone, on `chain-40` too), **production build**, scenes loaded through File ▾ → Open…, CPU throttled 1/4/6× (`TODO/core-029`) | `node bench/evaluation-mainthread.mjs --url http://localhost:4173` (needs `vite preview`) |
| `hover-sweep.mjs` | the Inspector object list's **hover highlight**: animation-frame deltas while a real mouse sweeps down and up a fully expanded Pi's 23 part rows, against a control sweep over the Library column; hover changes per sweep, change-to-frame latency, heap across repeated sweeps. **Production build**, CPU throttled 1/4/6× (`TODO/ui-049`) | `node bench/hover-sweep.mjs --url http://localhost:4173 --runs 5` (needs `vite preview`) |
| `resolution-benchmark.mjs` | the **design / export resolution** (`TODO/core-035`): a design-resolution STL export, the Normal and Print overrides (the worker's fold + repair + serialize), the main-thread `setResolution` re-fold, and a cached row re-fold, on the 24-body scene and a Ø100 sphere. Runs unchanged against an extracted older `src/` for a before/after | `node bench/resolution-benchmark.mjs --runs 10` |
| `watertight-equivalence.mjs` | not a benchmark: proves an optimised repair produces **identical output**, vertex for vertex and byte for byte | `node bench/watertight-equivalence.mjs --out after.json --compare before.json` |

## Running them

```sh
# The work, all four scenes, 20 runs each (the huge scene takes a few minutes to build)
node bench/export-benchmark.mjs --runs 20

# One scene, with a JSON record to diff against later
node bench/export-benchmark.mjs --scene large-solid --runs 20 --json /tmp/after.json --label after

# The freeze. Start a server first, then point the script at it.
npm run dev                       # or: npm run build && npm run preview
node bench/export-mainthread.mjs --runs 5 --scene 24-bodies --rates 1,4,6 --formats stl,obj,glb
node bench/export-mainthread.mjs --url http://localhost:4173     # against the production build

# Output equivalence, the check that stops a faster repair from being a worse one
node bench/watertight-equivalence.mjs --out /tmp/before.json     # BEFORE changing anything
# …make the change…
node bench/watertight-equivalence.mjs --out /tmp/after.json --compare /tmp/before.json
```

## Two numbers, on purpose

`export-benchmark.mjs` measures in Node and `export-mainthread.mjs` in a browser, and
they answer different questions. The first is comparable with the "before `io-004`" and
"before `io-005`" columns recorded in `TODO/perf-001`, which were taken the same way, and
it can break a cost into its parts. The second is the only one that says what a *user*
experiences, because it measures the gap between animation frames — the thing
`CLAUDE.md`'s 16 ms frame budget is written against — while driving the real controls.

CPU throttling (CDP `Emulation.setCPUThrottlingRate`) stands in for a phone. It is
Chromium-only; whether a feature *works* on the other engines is the e2e matrix's job,
which is a different question from how fast it is.

## Caveats worth repeating

- **Headless, software-rasterised Chromium.** Every number here is CPU-bound
  serialization with no GPU work, which is why that is acceptable for *this* benchmark;
  it would not be for anything that measures rendering.
- **A throttling multiplier is not a phone.** 4× and 6× bracket the range a modern
  phone sits in relative to this laptop; they are not a measurement of any real device.
  `TODO/VERIFY.md` carries the real-hardware check.
- **Build mode is recorded per run, and the browser timings are dev-server timings.**
  `perf-benchmark.md` requires the production build for anything render-related. These
  measurements are not render measurements — they are CPU-bound serialization, most of
  it inside `@jscad/modeling` and the serializers, which dev and production share — and
  the browser benchmark has to use the dev server because it seeds documents through
  `/src/stores/…`, which the built bundle does not expose. What *was* checked against
  the production build, in both Chromium and WebKit, is that the export worker chunk is
  emitted, loads, answers, and downloads a real file with no console errors; the Node
  benchmark corroborates the magnitudes independently. A production *timing* run on a
  seeded multi-body scene is not claimed and would need a seam the bundle does not have.
