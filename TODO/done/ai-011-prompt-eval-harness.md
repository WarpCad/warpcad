---
title: Prompt evals — repeatable, scored runs of the assistant against a real model, outside CI
category: ai
kind: feature
priority: low
model: sonnet
milestone: M9
depends: [ai-007, ai-010]
status: done
---

> **Retired 2026-10-10 (`/fix-todo ai-011`).** The harness shipped; **it has never been run against a real model**, and no baseline result file exists, because that needs the user's key (an agent must not enter one). Differences from the file: (1) The runner is **headless only**. A case marked `"needs": ["browser"]` (scenario 18: an attached image goes through the sketch sanitiser, which needs a canvas; `capture_view` needs a GPU) is **listed and skipped**, never faked. The Playwright-driven browser runner the file mentions is **not built**, so scenario 18 has no repeatable number yet. (2) Beyond the file: `--max-cost` (default $5) stops starting runs once the estimate passes it (exit 3), `--list` needs no key, results go to `bench/results/ai/<date>-<model>.{md,json}`, and the key is redacted from every output line and file. (3) Two checks the file did not list: `fillBelow` (a bracket must not be a plain block) and `preserved` (seed bodies still there and unchanged). (4) `fitsBed` uses the app's own `fitVerdict` (`src/core/buildVolume.js`), so "fits" means what the Fit badge and `check_printability` mean; my first version compared sorted edges and disagreed with the app. (5) The harness itself is proved end to end with `src/ai/providers/scripted.js` (a transcript that does the job scores PASS; one that builds a part too big for the bed scores FAIL on `fitsBed`), at no cost. (6) Running the real tools under the scripted provider found the scripted airfoil transcript making a **second false claim**: its 260 mm fuselage is "too large by 10 mm" on a 220 x 220 x 250 mm bed while its reply said everything fit. The fuselage is now 200 mm and the reply's claims match the tool's full result. (7) The numeric thresholds in the cases (hole volume 60500-63800, bracket fill at most 0.85, wing 100-1500 mm) are first guesses from the geometry, not calibrated against a model; the first live run should adjust them. The price table in `score.js` is dated 2026-09-25 (decision 9) and an id without a price costs `null`, never a guess.

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
