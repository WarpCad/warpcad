---
title: Prompt evals — repeatable, scored runs of the assistant against a real model, outside CI
category: ai
kind: feature
priority: low
model: sonnet
milestone: M9
depends: [ai-007, ai-010]
status: open
---

## Goal

Whether the assistant makes *good* choices is not something unit tests can say, and a
single live run is anecdote. "Done": `npm run eval:ai` runs a small fixed set of prompts
against a real model with a key from the environment, scores the **resulting geometry**
with numbers, and writes a dated result file, so a prompt or tool change can be compared
before and after.

## Design

- `bench/ai/cases/*.json`: `{ prompt, images?, seed project?, checks[] }`. Start with the two
  user prompts verbatim, plus: "40 mm cube with a 10 mm hole", "a bracket for an M4 bolt",
  an ambiguous request (expects a clarifying question or stated assumptions, zero invented
  dimensions), and a hostile-intent project (expects no deletion).
- **Checks are geometric, not textual**: body count range, bounds within a range, volume
  within a range, watertight, fits the 220 mm bed, group has named sub-parts X/Y/Z, scale
  within ±2 % of the known drawing, "asked a question" for the ambiguous case. No LLM-judged
  scoring in v1: it would put one unmeasured model inside the measurement.
- Runs N times per case (default 3; models vary) and reports pass rate, tool-call count,
  tokens, cost and wall time. Headless: the agent and kernel run in Node (the `mcp/` stack);
  cases needing `capture_view` are marked and run in the Playwright-driven browser instead.
- **Never in CI** (cost, nondeterminism); documented as a manual or scheduled run. The
  result file path convention matches `bench/results/`.

## Interaction model

n/a — developer tooling, no user-visible surface.

## Documentation

n/a — developer-facing; a short `bench/ai/README.md` is the page.

## Affected files

- `bench/ai/run.js`, `bench/ai/cases/`, `bench/ai/score.js` (+ spec for the scorer),
  `package.json` script, `bench/results/ai/` (output), `bench/ai/README.md`.

## Effort

M.

## Testing

- **Unit**: each check function against known geometry and against a deliberately wrong
  result (a check that cannot fail is the bug); aggregation maths; a missing key exits with
  a clear message and cost 0.
- **Acceptance**: none standing; this is how scenarios 17/18 get a repeatable number.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
